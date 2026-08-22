// ============================================================================
// GENERATOR
// ============================================================================
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
const CLASS_LOW=['+','-'], CLASS_HIGH=['*','/','%'];

const PROFILES = [
  {id:'direct-ltr', name:'Direct Left-to-Right', description:'Establishes basic sequential evaluation. No precedence reasoning required.',
   operatorCount:3, allowedOperators:['+','-'], operandSources:{literal:4,variable:0,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'LEFT_TO_RIGHT'},
  {id:'mult-precedence', name:'Multiplication Precedence', description:'A higher-precedence operator must be evaluated before a lower one, regardless of position.',
   operatorCount:2, allowedOperators:['+','-','*'], operandSources:{literal:3,variable:0,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED'},
  {id:'same-precedence-assoc', name:'Same-Precedence Associativity', description:'Equal-precedence operators resolve strictly left to right.',
   operatorCount:3, allowedOperators:['*','/'], operandSources:{literal:4,variable:0,constant:0},
   operandRange:{min:2,max:12}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'LEFT_TO_RIGHT'},
  {id:'full-basic-precedence', name:'Full Basic Precedence', description:'Combines +, -, *, / with genuine precedence and associativity requirements.',
   operatorCount:4, allowedOperators:['+','-','*','/'], operandSources:{literal:5,variable:0,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED'},
  {id:'modulus', name:'Modulus', description:'Introduces % and its precedence relationship with the other operators.',
   operatorCount:3, allowedOperators:['+','*','%'], operandSources:{literal:4,variable:0,constant:0},
   operandRange:{min:2,max:12}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED'},
  {id:'parens-override', name:'Parentheses Override', description:'Shows how explicit grouping overrides the normal precedence order — requires choosing to resolve the group first rather than being the only option available.',
   operatorCount:3, allowedOperators:['+','-','*','/'], operandSources:{literal:4,variable:0,constant:0},
   operandRange:{min:1,max:15}, allowNegativeOperands:false, parentheses:true, evaluationPattern:'PARENTHESES_REQUIRED'},
  {id:'variables-arithmetic', name:'Variables + Arithmetic', description:'Introduces variable substitution before evaluation order becomes relevant.',
   operatorCount:2, allowedOperators:['+','-','*'], operandSources:{literal:0,variable:3,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED'},
  {id:'mixed-variables-literals', name:'Mixed Variables + Literals', description:'Combines variable substitution with a mix of literal operands.',
   operatorCount:3, allowedOperators:['+','-','*'], operandSources:{literal:2,variable:2,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED'},
  {id:'variables-constants', name:'Variables + Constants', description:'Minimal exposure to declared constants alongside variables.',
   operatorCount:3, allowedOperators:['+','-','*'], operandSources:{literal:0,variable:2,constant:2},
   operandRange:{min:1,max:15}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED'},
  {id:'mixed-mastery', name:'Mixed Mastery', description:'Controlled mixture of variables, literals, constants, multiple precedence levels, and parentheses.',
   operatorCount:4, allowedOperators:['+','-','*','/','%'], operandSources:{literal:2,variable:2,constant:1},
   operandRange:{min:1,max:20}, allowNegativeOperands:true, parentheses:true, evaluationPattern:'MIXED'},
  {id:'unary-only', name:'Unary ++ / -- Only', description:'Every operand is a variable carrying a prefix or postfix ++/-- that must be resolved before the remaining + / - operators run.',
   operatorCount:2, allowedOperators:['+','-'], operandSources:{literal:0,variable:3,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'LEFT_TO_RIGHT',
   unaryWrap:{enabled:true, operators:['++','--'], forms:['prefix','postfix'], fraction:1.0}},
  {id:'unary-mix', name:'Unary Mixed with Literals, Variables & Constants', description:'++/-- appear only on some of the variable operands — literals and constants never carry a unary operator.',
   operatorCount:4, allowedOperators:['+','-','*'], operandSources:{literal:2,variable:2,constant:1},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED',
   unaryWrap:{enabled:true, operators:['++','--'], forms:['prefix','postfix'], fraction:0.6}},
  {id:'relational-simple', name:'Relational Operators (Simple)', description:'A comparison (<, >, <=, >=, ==, !=) produces a boolean result — the arithmetic on either side still resolves first.',
   operatorCount:2, allowedOperators:['+','-','<','>','<=','>=','==','!='], operandSources:{literal:3,variable:0,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'PRECEDENCE_REQUIRED'},
  {id:'relational-boolean-mix', name:'Relational + Boolean Mix (with !)', description:'A relational comparison is combined with boolean variables using && / ||, including one negated with a leading !.',
   operatorCount:3, allowedOperators:['<','>','<=','>=','==','!=','&&','||'], operandSources:{literal:2,variable:2,constant:0},
   operandRange:{min:1,max:20}, allowNegativeOperands:false, parentheses:false, evaluationPattern:'RELATIONAL_BOOLEAN_MIX',
   booleanVariables:true, unaryWrap:{enabled:true, operators:['!'], forms:['prefix'], fraction:0.5}}
];

const VAR_NAMES=['x','y','z','a','b','c','m','n'];
const CONST_NAMES=['RATE','LIMIT','FACTOR','BASE','STEP','SCALE'];

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
      const name = CONST_NAMES[ci++ % CONST_NAMES.length];
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
function buildTree(profile,operands){
  if(profile.evaluationPattern==='PARENTHESES_REQUIRED') return buildParenOverride(operands,profile);
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
    return {tree, decls, correctFinalValue:finalValue, canonicalTrace:canonical, profile};
  }
  throw new EngineError('GENERATION_FAILED');
}

