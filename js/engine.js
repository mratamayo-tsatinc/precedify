// ============================================================================
// ENGINE (language-independent core — no UI logic here)
// ============================================================================
let __idCounter = 1;
function nextId(){ return __idCounter++; }
// Precedence table, highest number binds tightest. Comparisons throughout the
// engine only ever check relative ordering, never the literal numbers, so
// adding new tiers here is safe. Ordering (high to low): multiplicative,
// additive, relational (<,>,<=,>=), equality (==,!=), logical AND, logical OR
// — the same ordering Java/C use, which is what lets a mixed relational/
// boolean expression resolve arithmetic and comparisons before combining them.
function prec(op){
  switch(op){
    case '*': case '/': case '%': return 6;
    case '+': case '-': return 5;
    case '<': case '>': case '<=': case '>=': return 4;
    case '==': case '!=': return 3;
    case '&&': return 2;
    case '||': return 1;
    default: return 5;
  }
}
function evalOp(op,a,b){
  switch(op){
    case '+': return a+b;
    case '-': return a-b;
    case '*': return a*b;
    case '/': if(b===0) throw new EngineError('DIV_BY_ZERO'); return Math.trunc(a/b);
    case '%': if(b===0) throw new EngineError('DIV_BY_ZERO'); return a % b;
    case '<': return a<b;
    case '>': return a>b;
    case '<=': return a<=b;
    case '>=': return a>=b;
    case '==': return a===b;
    case '!=': return a!==b;
    case '&&': return Boolean(a) && Boolean(b);
    case '||': return Boolean(a) || Boolean(b);
    default: throw new EngineError('UNKNOWN_OP:'+op);
  }
}
class EngineError extends Error{ constructor(code){ super(code); this.code=code; } }

// Renders any engine value (number OR boolean) the way it should read as
// source/output text. Centralized so every render path (tree-based,
// flat-based, live-interactive, historical, canonical playback) shows
// booleans as `true`/`false` and negative numbers parenthesized, consistently.
function formatValue(v){
  if(typeof v === 'boolean') return v ? 'true' : 'false';
  return v<0 ? '('+v+')' : String(v);
}

function makeLiteral(value){ return {id:nextId(), kind:'literal', value}; }
function makeNamed(kind,name,declaredValue){ return {id:nextId(), kind, name, declaredValue, resolved:false}; }
function makeBinOp(op,left,right){ return {id:nextId(), kind:'binop', op, left, right}; }
// A unary node (`++x`, `x--`, `!flag`) wraps exactly one leaf — per this
// project's scope, always a `variable` leaf: increment/decrement and logical
// NOT are never generated on a literal or a constant. Unresolved, it renders
// as its source text (e.g. "++x"); tapping it resolves it to a plain value
// (resultValue), exactly like resolving a variable/constant, so from every
// other part of the engine (flattening, paren-tagging, readiness checks) a
// unary node behaves like any other non-binop leaf.
function makeUnary(op, form, inner){ return {id:nextId(), kind:'unary', op, form, inner, substituted:false, resolved:false}; }
function unaryBaseValue(node){ return node.inner.kind==='literal' ? node.inner.value : node.inner.declaredValue; }
function unaryComputedValue(node){
  const base = unaryBaseValue(node);
  if(node.op==='!') return !base;
  const delta = node.op==='++' ? 1 : -1;
  // Prefix: the expression sees the already-incremented value. Postfix: the
  // expression sees the ORIGINAL value (the increment is a side effect that
  // only matters for later reuse of the same variable, out of this app's scope).
  return node.form==='prefix' ? base+delta : base;
}
function isNumeric(node){
  return node.kind==='literal'
    || ((node.kind==='variable'||node.kind==='constant') && node.resolved)
    || (node.kind==='unary' && node.resolved);
}
function numericValue(node){
  if(node.kind==='literal') return node.value;
  if(node.kind==='unary') return node.resultValue;
  return node.declaredValue;
}
function deepClone(node){
  if(node.kind==='binop') return {id:node.id, kind:'binop', op:node.op, left:deepClone(node.left), right:deepClone(node.right)};
  if(node.kind==='unary') return Object.assign({}, node, {inner:Object.assign({}, node.inner)});
  return Object.assign({}, node);
}
function replaceNode(node,targetId,replacement){
  if(node.id===targetId) return replacement;
  if(node.kind==='binop') return {id:node.id, kind:'binop', op:node.op, left:replaceNode(node.left,targetId,replacement), right:replaceNode(node.right,targetId,replacement)};
  return node;
}
function resolveNode(node,targetId){
  if(node.id===targetId){
    if(node.kind==='unary') return Object.assign({}, node, {resolved:true, resultValue: unaryComputedValue(node)});
    return Object.assign({}, node, {resolved:true});
  }
  if(node.kind==='binop') return {id:node.id, kind:'binop', op:node.op, left:resolveNode(node.left,targetId), right:resolveNode(node.right,targetId)};
  return node;
}
// Marks a unary node's underlying variable value as revealed (e.g. "++x" ->
// "++7") WITHOUT applying the operator yet — the required first half of a
// two-step unary resolution. The operator itself is applied by a later,
// separate resolveNode call on the same id (see buildCanonicalTrace), which
// is why this only ever sets `substituted`, never `resolved`.
function substituteNode(node,targetId){
  if(node.id===targetId){
    if(node.kind==='unary') return Object.assign({}, node, {substituted:true});
    return node;
  }
  if(node.kind==='binop') return {id:node.id, kind:'binop', op:node.op, left:substituteNode(node.left,targetId), right:substituteNode(node.right,targetId)};
  return node;
}
function collectUnresolved(node,out){
  out = out || [];
  if(node.kind==='variable'||node.kind==='constant'||node.kind==='unary'){ if(!node.resolved) out.push(node); }
  else if(node.kind==='binop'){ collectUnresolved(node.left,out); collectUnresolved(node.right,out); }
  return out;
}
function collectReducible(node,out){
  out = out || [];
  if(node.kind!=='binop') return out;
  if(node.left.kind==='binop') collectReducible(node.left,out);
  if(node.right.kind==='binop') collectReducible(node.right,out);
  if(isNumeric(node.left) && isNumeric(node.right)) out.push(node);
  return out;
}
function getMaxPrecCandidates(tree){
  const reducible = collectReducible(tree,[]);
  if(reducible.length===0) return [];
  const maxP = Math.max.apply(null, reducible.map(n=>prec(n.op)));
  return reducible.filter(n=>prec(n.op)===maxP);
}
function evalTree(node){
  if(node.kind==='literal') return node.value;
  if(node.kind==='variable'||node.kind==='constant') return node.declaredValue;
  if(node.kind==='unary') return unaryComputedValue(node);
  return evalOp(node.op, evalTree(node.left), evalTree(node.right));
}
function buildCanonicalTrace(originalTree){
  let working = deepClone(originalTree);
  const steps = [];
  const treeStates = [deepClone(working)];
  const unresolved = collectUnresolved(working,[]);
  for(const n of unresolved){
    // resolveNode/substituteNode preserve the node's id, so the substituted/
    // resolved node IS the result node — this id is what the renderer
    // highlights to show "this value came from here".
    if(n.kind==='unary'){
      // Step A: reveal the variable's value (e.g. "++x" -> "++7") without
      // applying the operator yet — a genuine SUBSTITUTE step, since a
      // unary operator always wraps a variable, never a literal/constant.
      const before1 = renderString(working);
      working = substituteNode(working, n.id);
      const after1 = renderString(working);
      steps.push({action:'SUBSTITUTE', target:(n.inner.kind==='literal'?String(n.inner.value):n.inner.name), targetKind:n.inner.kind, sourceValue:unaryBaseValue(n), expressionBefore:before1, expressionAfter:after1, resultNodeId:n.id});
      treeStates.push(deepClone(working));
      // Step B: apply the unary operator to the now-revealed value (e.g.
      // "++7" -> "8").
      const before2 = renderString(working);
      working = resolveNode(working, n.id);
      const after2 = renderString(working);
      steps.push({action:'UNARY', op:n.op, form:n.form, target:(n.inner.kind==='literal'?String(n.inner.value):n.inner.name), sourceValue:unaryBaseValue(n), result:unaryComputedValue(n), expressionBefore:before2, expressionAfter:after2, resultNodeId:n.id});
      treeStates.push(deepClone(working));
    } else {
      const before = renderString(working);
      working = resolveNode(working, n.id);
      const after = renderString(working);
      steps.push({action:'SUBSTITUTE', target:n.name, targetKind:n.kind, sourceValue:n.declaredValue, expressionBefore:before, expressionAfter:after, resultNodeId:n.id});
      treeStates.push(deepClone(working));
    }
  }
  while(working.kind==='binop'){
    const cands = getMaxPrecCandidates(working);
    if(cands.length===0) throw new EngineError('STUCK');
    const node = cands[0];
    const a = numericValue(node.left), b = numericValue(node.right);
    const result = evalOp(node.op,a,b);
    const before = renderString(working);
    const newLiteral = makeLiteral(result);
    working = replaceNode(working, node.id, newLiteral);
    const after = renderString(working);
    steps.push({action:'EVALUATE', target:{operator:node.op, operands:[a,b]}, result, expressionBefore:before, expressionAfter:after, resultNodeId:newLiteral.id, leftId:node.left.id, rightId:node.right.id});
    treeStates.push(deepClone(working));
  }
  return {steps, finalValue:working.value, treeStates};
}
function renderString(node,minPrec){
  minPrec = minPrec || 0;
  if(node.kind==='literal') return formatValue(node.value);
  if(node.kind==='variable'||node.kind==='constant') return node.resolved ? formatValue(node.declaredValue) : node.name;
  if(node.kind==='unary'){
    if(node.resolved) return formatValue(node.resultValue);
    const nm = node.substituted ? String(unaryBaseValue(node)) : (node.inner.kind==='literal' ? String(node.inner.value) : node.inner.name);
    if(node.op==='!') return '!'+nm;
    return node.form==='prefix' ? node.op+nm : nm+node.op;
  }
  const p = prec(node.op);
  const left = renderString(node.left,p);
  const right = renderString(node.right,p+1);
  const s = left+' '+node.op+' '+right;
  return p<minPrec ? '('+s+')' : s;
}

