// ============================================================================
// GENERATOR
// ============================================================================

// Seeded random number generator (Mulberry32)
// Enables reproducible randomization when starting a session
let currentSeed = 0;
let seededRandom = Math.random;

function initializeSeededRandom(seed) {
  currentSeed = seed >>> 0; // Ensure unsigned 32-bit integer
  
  seededRandom = function() {
    currentSeed = (currentSeed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(currentSeed ^ (currentSeed >>> 15), 1 | currentSeed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resetRandomGenerator() {
  seededRandom = Math.random;
}

// Wrapper functions that use seededRandom
function randInt(min, max) { 
  return Math.floor(seededRandom() * (max - min + 1)) + min; 
}

function pick(arr) { 
  return arr[Math.floor(seededRandom() * arr.length)]; 
}

function shuffle(arr) { 
  for(let i = arr.length - 1; i > 0; i--) { 
    const j = Math.floor(seededRandom() * (i + 1)); 
    [arr[i], arr[j]] = [arr[j], arr[i]]; 
  } 
  return arr; 
}

const CLASS_LOW=['+','-'], CLASS_HIGH=['*','/','%'];

// pointsPerItem (§14E, per-profile scoring): the raw point budget a single
// item from THIS profile is worth. Deliberately kept small and TIERED
// (1 / 2 / 3), not scaled up with operatorCount/itemCount — with itemCount
// fixed at 5 per profile and ~17 profiles, even modest per-item numbers
// compound fast across a whole session (e.g. 12 pts/item was already
// 900+ points activity-wide), which drowns out any meaningful signal in
// the final score. So instead:
//   1 = shortest/simplest expressions (2–3 operators, no parens/unary,
//       no mixed operand kinds) — direct-ltr, mult-precedence,
//       same-precedence-assoc, variables-arithmetic, relational-simple
//   2 = moderate length/complexity (usually 3–4 operators, OR a single
//       extra wrinkle — one paren group, one unary wrap, one mixed operand
//       kind, one relational+variable substitution)
//   3 = the longest/most demanding expressions (4 operators AND a genuine
//       compounding difficulty — nested/dual parens, heavy unary mixing,
//       or the full arithmetic+variable+constant+parens mastery profile)
// This replaces the old single global SCORING_CONFIG.pointsPerItem — see
// state.js's scoreItem()/handleCheck(), which now look up the ACTIVE
// item's own profile to find this value rather than using one flat number
// for every profile. SCORING_CONFIG still owns the *model* (which formula)
// and its weights; only the raw point budget moved here, since "how much
// is this item worth" is a per-profile authoring decision, not a global
// constant.
const PROFILES = [
  {id:'direct-ltr', name:'Direct Left-to-Right', description:'Establishes basic sequential evaluation. No precedence reasoning required.',
   operatorCount:3, allowedOperators:['+','-'], operandSources:{literal:4,variable:0,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'LEFT_TO_RIGHT', itemCount:5, pointsPerItem:1},
  {id:'mult-precedence', name:'Multiplication Precedence', description:'A higher-precedence operator must be evaluated before a lower one, regardless of position.',
   operatorCount:2, allowedOperators:['+','-','*'], operandSources:{literal:3,variable:0,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED', itemCount:5, pointsPerItem:1},
  {id:'same-precedence-assoc', name:'Same-Precedence Associativity', description:'Equal-precedence operators resolve strictly left to right.',
   operatorCount:3, allowedOperators:['*','/'], operandSources:{literal:4,variable:0,constant:0},
   operandRange:{min:2,max:12}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'LEFT_TO_RIGHT', itemCount:5, pointsPerItem:1},
  {id:'full-basic-precedence', name:'Full Basic Precedence', description:'Combines +, -, *, / with genuine precedence and associativity requirements.',
   operatorCount:4, allowedOperators:['+','-','*','/'], operandSources:{literal:5,variable:0,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED', itemCount:5, pointsPerItem:2},
  {id:'modulus', name:'Modulus', description:'Introduces % and its precedence relationship with the other operators.',
   operatorCount:3, allowedOperators:['+','*','%'], operandSources:{literal:4,variable:0,constant:0},
   operandRange:{min:2,max:12}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED', itemCount:5, pointsPerItem:2},
  {id:'parens-override', name:'Parentheses Override', description:'Shows how explicit grouping overrides the normal precedence order — requires choosing to resolve the group first rather than being the only option available.',
   operatorCount:3, allowedOperators:['+','-','*','/'], operandSources:{literal:4,variable:0,constant:0},
   operandRange:{min:1,max:15}, allowNegativeOperands:false, parentheses:true, evaluationPattern:'PARENTHESES_REQUIRED', itemCount:5, pointsPerItem:2},
  {id:'parens-override-multi', name:'Parentheses Override (Multi-Operator)', description:'The parenthesized region itself contains two operators from different precedence tiers — the override forces that whole nested piece to resolve first as a unit, not just a single pair.',
   operatorCount:4, allowedOperators:['+','-','*','/'], operandSources:{literal:5,variable:0,constant:0},
   operandRange:{min:1,max:15}, allowNegativeOperands:false, parentheses:true, evaluationPattern:'PARENTHESES_REQUIRED_MULTI', itemCount:5, pointsPerItem:3},
  {id:'parens-override-dual', name:'Parentheses Override (Two Separate Groups)', description:'Two independent parenthesized groups appear side by side in the same expression — not nested inside each other — and each group overrides a different precedence tier.',
   operatorCount:4, allowedOperators:['+','-','*'], operandSources:{literal:5,variable:0,constant:0},
   operandRange:{min:1,max:15}, allowNegativeOperands:false, parentheses:true, evaluationPattern:'PARENTHESES_REQUIRED_DUAL', itemCount:5, pointsPerItem:3},
  {id:'variables-arithmetic', name:'Variables + Arithmetic', description:'Introduces variable substitution before evaluation order becomes relevant.',
   operatorCount:2, allowedOperators:['+','-','*'], operandSources:{literal:0,variable:3,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED', itemCount:5, pointsPerItem:1},
  {id:'mixed-variables-literals', name:'Mixed Variables + Literals', description:'Combines variable substitution with a mix of literal operands.',
   operatorCount:3, allowedOperators:['+','-','*'], operandSources:{literal:2,variable:2,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED', itemCount:5, pointsPerItem:2},
  {id:'variables-constants', name:'Variables + Constants', description:'Minimal exposure to declared constants alongside variables.',
   operatorCount:3, allowedOperators:['+','-','*'], operandSources:{literal:0,variable:2,constant:2},
   operandRange:{min:1,max:15}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED', itemCount:5, pointsPerItem:2},
  {id:'literals-variables-constants', name:'Literals + Variables + Constants', description:'Minimal exposure to literals with declared constants alongside variables.',
   operatorCount:4, allowedOperators:['+','-','*'], operandSources:{literal:2,variable:2,constant:2},
   operandRange:{min:1,max:15}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED', itemCount:5, pointsPerItem:2},
  {id:'mixed-mastery', name:'Mixed Mastery', description:'Controlled mixture of variables, literals, constants, multiple precedence levels, and parentheses.',
   operatorCount:4, allowedOperators:['+','-','*','/','%'], operandSources:{literal:1,variable:3,constant:2},
   operandRange:{min:1,max:20}, allowNegativeOperands:true, parentheses:true, evaluationPattern:'MIXED', itemCount:5, pointsPerItem:3},
  {id:'unary-only', name:'Unary ++ / -- Only', description:'Every operand is a variable carrying a prefix or postfix ++/-- that must be resolved before the remaining + / - operators run.',
   operatorCount:2, allowedOperators:['+','-'], operandSources:{literal:0,variable:3,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'LEFT_TO_RIGHT', itemCount:5, pointsPerItem:2,
   unaryWrap:{enabled:true, operators:['++','--'], forms:['prefix','postfix'], fraction:1.0}},
  {id:'unary-mix', name:'Unary Mixed with Literals, Variables & Constants', description:'++/-- appear only on some of the variable operands — literals and constants never carry a unary operator.',
   operatorCount:4, allowedOperators:['+','-','*'], operandSources:{literal:2,variable:2,constant:1},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED', itemCount:5, pointsPerItem:3,
   unaryWrap:{enabled:true, operators:['++','--'], forms:['prefix','postfix'], fraction:0.6}},
  {id:'relational-simple', name:'Relational Operators (Simple)', description:'A comparison (<, >, <=, >=, ==, !=) produces a boolean result — the arithmetic on either side still resolves first.',
   operatorCount:2, allowedOperators:['+','-','<','>','<=','>=','==','!='], operandSources:{literal:3,variable:0,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED', itemCount:5, pointsPerItem:1},
  {id:'relational-variables', name:'Relational Operators with Variables', description:'A comparison\u2019s operands include variables and constants, not just literals — they must be substituted before the comparison (and any arithmetic feeding it) can resolve.',
   operatorCount:2, allowedOperators:['+','-','<','>','<=','>=','==','!='], operandSources:{literal:1,variable:1,constant:1},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED', itemCount:5, pointsPerItem:2},
  {id:'relational-boolean-mix', name:'Relational + Boolean Mix (with !)', description:'A relational comparison is combined with boolean variables using && / ||, including one negated with a leading !.',
   operatorCount:3, allowedOperators:['<','>','<=','>=','==','!=','&&','||'], operandSources:{literal:2,variable:2,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'RELATIONAL_BOOLEAN_MIX', itemCount:5, pointsPerItem:3,
   booleanVariables:true, unaryWrap:{enabled:true, operators:['!'], forms:['prefix'], fraction:0.5}}
];

const VAR_NAMES=['x','y','z','a','b','c','m','n'];
const CONST_NAMES=['RATE','LIMIT','FACTOR','BASE','STEP','SCALE'];
// Candidate names for the statement's own assignment target (the "int
// ___ = ..." LHS). Previously this was a hardcoded literal "result" for
// every single generated item; now each item gets a randomly (seeded)
// chosen name from this pool instead, so students see the assignment
// target vary across items/profiles the same way declared variable names
// already do — rather than every one of them reading "int result = ...;".
const RESULT_NAMES = ['result','value','output','total','answer', 'tally','outcome'];

// Picks a name for the assignment target, excluding any name already used
// by this instance's own declared variables/constants — so the target
// never collides with (shadows or duplicates) a name already declared in
// the same source block, e.g. never landing on "int total = ...;" when a
// variable named `total` was also generated for this item. Falls back to
// the full pool if every candidate happens to already be in use (can't
// happen today given the two name pools never overlap, but keeps this
// safe against future pool changes). Uses the seeded pick() like every
// other randomized choice in this file, so results stay reproducible
// under a given sessionSeed.
function pickResultName(usedNames){
  const avail = RESULT_NAMES.filter(n => !usedNames.includes(n));
  return pick(avail.length ? avail : RESULT_NAMES);
}

function makeOperands(profile){
  const total = profile.operatorCount+1;
  const src = profile.operandSources;
  const pool=[];
  for(let i=0;i<(src.literal||0);i++) pool.push('literal');
  for(let i=0;i<(src.variable||0);i++) pool.push('variable');
  for(let i=0;i<(src.constant||0);i++) pool.push('constant');
  while(pool.length<total) pool.push('literal');
  shuffle(pool);
  let vi=0, ci=0;
  // Per-instance shuffled copy of CONST_NAMES (seeded, via the same
  // shuffle() used for `pool` above) — previously constants were always
  // assigned in fixed pool order (CONST_NAMES[ci++ % length]), so an item
  // with 2 constants always surfaced "RATE, LIMIT" in that exact order,
  // never e.g. "SCALE, BASE". Shuffling a fresh copy here, once per
  // instance, and indexing into THAT the same way, randomizes both which
  // names appear and what order they appear in, while staying fully
  // reproducible under the active sessionSeed (shuffle() draws from the
  // same seededRandom() every other choice in this file uses). Slicing
  // first so the shared CONST_NAMES array itself is never mutated.
  const shuffledConstNames = shuffle(CONST_NAMES.slice());
  const decls=[];
  const operands = pool.slice(0,total).map(kind=>{
    if(kind==='literal'){
      let v = randInt(profile.operandRange.min, profile.operandRange.max);
      if(profile.allowNegativeOperands && Math.random()<0.3) v=-v;
      return makeLiteral(v);
    } else if(kind==='variable'){
      const name = VAR_NAMES[vi++ % VAR_NAMES.length];
      const v = profile.booleanVariables ? (Math.random()<0.5) : randInt(profile.operandRange.min, profile.operandRange.max);
      decls.push({kind:'variable', name, value:v, isBoolean: !!profile.booleanVariables});
      let node = makeNamed('variable', name, v);
      // Unary wrapping (++, --, !) is applied only here, to a `variable`
      // node — literal and constant operands (the branches above/below) are
      // never wrapped, per this activity's rule that unary operators only
      // ever act on variables.
      if(profile.unaryWrap && profile.unaryWrap.enabled && Math.random() < profile.unaryWrap.fraction){
        const op = pick(profile.unaryWrap.operators);
        const form = op==='!' ? 'prefix' : pick(profile.unaryWrap.forms);
        node = makeUnary(op, form, node);
      }
      return node;
    } else {
      const name = shuffledConstNames[ci++ % shuffledConstNames.length];
      const v = randInt(profile.operandRange.min, profile.operandRange.max);
      decls.push({kind:'constant', name, value:v});
      return makeNamed('constant', name, v);
    }
  });
  return {operands, decls};
}

// Groups an operator list by precedence tier (see prec()). Generalizes what
// used to be a hardcoded arithmetic-only CLASS_LOW/CLASS_HIGH split, so the
// same LEFT_TO_RIGHT / PRECEDENCE_REQUIRED logic below works unchanged for
// relational/logical operator sets too.
function groupByPrec(ops){
  const g = new Map();
  for(const o of ops){ const p=prec(o); if(!g.has(p)) g.set(p,[]); g.get(p).push(o); }
  return g;
}
// A relational/equality operator (<, >, <=, >=, ==, !=) PRODUCES a boolean,
// so a second one can never legally consume that boolean as an operand —
// `(8 < 19) != 5` is a type error in Java (boolean != int doesn't compile),
// and even in C it only "works" by exploiting the fact that C has no real
// boolean type, which is not a legitimate precedence lesson. So across every
// profile that mixes comparisons with arithmetic (anything using the generic
// PRECEDENCE_REQUIRED path below — RELATIONAL_BOOLEAN_MIX has its own
// dedicated, type-aware builder and never goes through here), at most ONE
// comparison operator may appear in a single generated expression.
const COMPARISON_OPS = new Set(['<','>','<=','>=','==','!=']);
function countComparisons(ops){ return ops.filter(o=>COMPARISON_OPS.has(o)).length; }
function pickOperators(profile){
  if(profile.evaluationPattern==='LEFT_TO_RIGHT'){
    const groups = groupByPrec(profile.allowedOperators);
    const cls = pick(Array.from(groups.values()));
    const ops=[];
    for(let i=0;i<profile.operatorCount;i++) ops.push(pick(cls));
    return ops;
  }
  const groups = groupByPrec(profile.allowedOperators);
  if(groups.size>=2){
    for(let attempt=0; attempt<50; attempt++){
      const ops=[];
      for(let i=0;i<profile.operatorCount;i++) ops.push(pick(profile.allowedOperators));
      const distinctPrecs = new Set(ops.map(prec));
      if(distinctPrecs.size>=2 && countComparisons(ops)<=1) return ops;
    }
    // Deterministic fallback if random sampling didn't land on a valid
    // combination within the attempt budget: force exactly one comparison
    // operator (if the profile allows any) and fill every other slot from
    // the non-comparison operators, which guarantees both the "at least two
    // precedence classes" and "at most one comparison" invariants together.
    const nonComparison = profile.allowedOperators.filter(o=>!COMPARISON_OPS.has(o));
    const comparisonOps = profile.allowedOperators.filter(o=>COMPARISON_OPS.has(o));
    const ops=[];
    for(let i=0;i<profile.operatorCount;i++) ops.push(pick(nonComparison.length?nonComparison:profile.allowedOperators));
    if(comparisonOps.length && profile.operatorCount>0){
      ops[randInt(0, profile.operatorCount-1)] = pick(comparisonOps);
    }
    return ops;
  }
  const ops=[];
  for(let i=0;i<profile.operatorCount;i++) ops.push(pick(profile.allowedOperators));
  return ops;
}
// Dedicated builder for the relational+boolean-mix profile. The fully
// generic precedence parser (precedenceParse) can't be trusted here because
// it's blind to operand TYPES — it would happily build `x < y < z` (a
// boolean compared with '<' again) or `flag + 3`, neither of which is valid
// Java/C. Instead this always shapes the tree as:
//     (numericLeaf REL numericLeaf) LOGIC otherLeaf [LOGIC otherLeaf ...]
// so relational operators only ever see the two plain numeric leaves, and
// logical operators only ever combine booleans (the comparison's result, a
// boolean variable, or that variable already wrapped in a leading `!`).
function buildRelationalBooleanMix(operands, profile){
  const relOps=['<','>','<=','>=','==','!='];
  const logicOps=['&&','||'];
  const numericLeaves = operands.filter(o=>o.kind==='literal');
  const otherLeaves = operands.filter(o=>o.kind!=='literal');
  let tree;
  if(numericLeaves.length>=2){
    tree = makeBinOp(pick(relOps), numericLeaves[0], numericLeaves[1]);
  } else {
    tree = otherLeaves.shift();
  }
  const rest = numericLeaves.slice(2).concat(otherLeaves);
  for(const leaf of rest){
    tree = makeBinOp(pick(logicOps), tree, leaf);
  }
  return tree;
}
function foldLeft(operands,ops){
  let tree = operands[0];
  for(let i=0;i<ops.length;i++) tree = makeBinOp(ops[i], tree, operands[i+1]);
  return tree;
}
function precedenceParse(operands,ops){
  let oi=0, pi=0;
  function parse(minPrec){
    let left = operands[oi++];
    while(pi<ops.length && prec(ops[pi])>=minPrec){
      const op = ops[pi++];
      const right = parse(prec(op)+1);
      left = makeBinOp(op,left,right);
    }
    return left;
  }
  return parse(0);
}
function buildParenOverride(operands,profile){
  const lowOps = profile.allowedOperators.filter(o=>CLASS_LOW.includes(o));
  const highOps = profile.allowedOperators.filter(o=>CLASS_HIGH.includes(o));
  const lowOp = pick(lowOps.length?lowOps:['+']);
  const highOp = pick(highOps.length?highOps:['*']);
  let tree = makeBinOp(lowOp, operands[0], operands[1]);
  for(let i=2;i<operands.length;i++) tree = makeBinOp(highOp, tree, operands[i]);
  return tree;
}
// Like buildParenOverride, but the forced-parens region itself contains TWO
// operators from different precedence tiers, not just one pair. Built
// directly in precedence-correct shape — o0 lowOp (o1 highOp o2) — so on
// its own (with nothing wrapping it) this inner piece would already print
// unparenthesized, exactly like ordinary source: "o0 + o1 * o2" needs no
// grouping by itself, since normal precedence already resolves it
// unambiguously. What forces the parens is wrapping that whole inner piece
// with a THIRD operator whose precedence is higher than the inner region's
// own top-level operator (lowOp) — at that point tagParenGroups sees the
// inner root's precedence fall below the surrounding context and marks the
// entire inner region (both of its operators, all three of its leaves) as
// one shared required-parens group. This needs at least one operand beyond
// the inner three to wrap with, so profiles using this pattern must supply
// operatorCount >= 3 (i.e. operands.length >= 4) — enforced via the
// profile's own operatorCount, same as buildParenOverride's implicit
// assumption.
function buildParenOverrideMulti(operands,profile){
  const lowOps = profile.allowedOperators.filter(o=>CLASS_LOW.includes(o));
  const highOps = profile.allowedOperators.filter(o=>CLASS_HIGH.includes(o));
  const lowOp = pick(lowOps.length?lowOps:['+']);
  const highOp = pick(highOps.length?highOps:['*']);
  const innerHighNode = makeBinOp(highOp, operands[1], operands[2]);
  let tree = makeBinOp(lowOp, operands[0], innerHighNode);
  for(let i=3;i<operands.length;i++) tree = makeBinOp(highOp, tree, operands[i]);
  return tree;
}
// TWO SEPARATE (non-nested) required-parens groups in the same expression —
// e.g. "(o0 + o1) * (o2 - o3)". A single connector operator ties both groups
// together and is what forces BOTH into parens. For a group's parentheses to
// be a genuine PRECEDENCE override (rather than merely an associativity/
// grouping requirement), that group's own operator must have STRICTLY LOWER
// precedence than the connector — so both Group A and Group B are drawn from
// the low tier (+/-) and the connector is always drawn from the high tier
// (*, /, %): low(5) < high(6) on both sides. tagParenGroups (flat-model.js)
// then forces each into its own required-parens group via the same rule in
// both cases — the connector's own tier exceeding the group's tier — with no
// reliance on the separate (and weaker) right-child associativity-bump rule
// that a same-tier group would otherwise need.
// Any operands beyond the first four are folded onto the outside using the
// same connector, which never disturbs either group: each recursive
// tagParenGroups call only ever looks at its own immediate local context,
// so wrapping further out doesn't change what Group A/B saw. Needs
// operands.length >= 4 (operatorCount >= 3) for both groups to exist.
function buildParenOverrideDual(operands,profile){
  const lowOps = profile.allowedOperators.filter(o=>CLASS_LOW.includes(o));
  const highOps = profile.allowedOperators.filter(o=>CLASS_HIGH.includes(o));
  // Both groups must contain an operator with STRICTLY LOWER precedence than
  // the connector tying them together, or the parentheses around that group
  // aren't a genuine precedence override -- they'd just be enforcing
  // associativity/grouping, a different (and, for this profile, mislabeled)
  // lesson. So both groups are drawn from the low tier (+/-), and only the
  // connector is drawn from the high tier (*, /, %); that guarantees
  // lowTier(5) < highTier(6) on both sides, independent of which specific
  // operator gets picked for A vs B.
  const lowOpA = pick(lowOps.length?lowOps:['+']);
  const lowOpB = pick(lowOps.length?lowOps:['+']);
  const connector = pick(highOps.length?highOps:['*']);
  const groupA = makeBinOp(lowOpA, operands[0], operands[1]);
  const groupB = makeBinOp(lowOpB, operands[2], operands[3]);
  let tree = makeBinOp(connector, groupA, groupB);
  for(let i=4;i<operands.length;i++) tree = makeBinOp(connector, tree, operands[i]);
  return tree;
}
function buildTree(profile,operands){
  if(profile.evaluationPattern==='PARENTHESES_REQUIRED') return buildParenOverride(operands,profile);
  if(profile.evaluationPattern==='PARENTHESES_REQUIRED_MULTI') return buildParenOverrideMulti(operands,profile);
  if(profile.evaluationPattern==='PARENTHESES_REQUIRED_DUAL') return buildParenOverrideDual(operands,profile);
  if(profile.evaluationPattern==='RELATIONAL_BOOLEAN_MIX') return buildRelationalBooleanMix(operands,profile);
  const ops = pickOperators(profile);
  if(profile.evaluationPattern==='LEFT_TO_RIGHT') return foldLeft(operands,ops);
  return precedenceParse(operands,ops);
}
function treeUsesTwoClasses(node,seen){
  seen = seen || new Set();
  if(node.kind==='binop'){ seen.add(prec(node.op)); treeUsesTwoClasses(node.left,seen); treeUsesTwoClasses(node.right,seen); }
  return seen.size>=2;
}
const MAX_ABS_VALUE = 100000;
function generateInstance(profile){
  for(let attempt=0; attempt<300; attempt++){
    const {operands, decls} = makeOperands(profile);
    let tree;
    try{ tree = buildTree(profile,operands); } catch(e){ continue; }
    let finalValue;
    try{ finalValue = evalTree(tree); } catch(e){ continue; }
    if(Math.abs(finalValue) > MAX_ABS_VALUE) continue;
    let canonical;
    try{ canonical = buildCanonicalTrace(tree); } catch(e){ continue; }
    if(canonical.finalValue !== finalValue) continue;
    if(profile.evaluationPattern==='PRECEDENCE_REQUIRED'){
      if(!treeUsesTwoClasses(tree)) continue;
    }
    // Randomly (seeded) chosen name for this item's own assignment target —
    // see RESULT_NAMES/pickResultName above — excluding whatever names this
    // instance's own decls used, so it can never collide with a declared
    // variable/constant.
    const resultName = pickResultName(decls.map(d=>d.name));
    return {tree, decls, correctFinalValue:finalValue, canonicalTrace:canonical, profile, resultName};
  }
  throw new EngineError('GENERATION_FAILED');
}