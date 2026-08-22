// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
function h(tag, attrs, ...children){
  const el = document.createElement(tag);
  for(const k in (attrs||{})){
    const v = attrs[k];
    if(v==null) continue; // skip null/undefined attrs (e.g. disabled conditional handlers)
    if(k==='class') el.className = v;
    else if(k.startsWith('on') && typeof v==='function') el.addEventListener(k.slice(2), v);
    else if(k==='html') el.innerHTML = v;
    else if(typeof v==='boolean'){ if(v) el.setAttribute(k,''); } // boolean attrs (disabled, etc.) must be absent when false
    else el.setAttribute(k, v);
  }
  for(const c of children.flat()){
    if(c==null) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

// Renders a resolved variable/constant as a small two-line "memory card"
// (name on top, value below) rather than collapsing it into a bare numeral.
// Used everywhere a resolved variable/constant is displayed — live
// interaction, historical timeline rows, and answer-key playback — so the
// student is reminded the value came from a named slot in memory for as
// long as it survives un-consumed. Once the value is used as an operand in
// an EVALUATE step, the result is a genuine new literal and is rendered as a
// plain numeral again (see the literal branches of the callers below).
function renderValueCard(name, value, kind, color, isFlash){
  const cls = 'tok-card '+(kind==='constant' ? 'tok-card-const' : 'tok-card-var')+(isFlash?' tok-card-flash':'');
  const attrs = {class:cls};
  if(color) attrs.style = `border-color:${color};color:${color};`;
  return h('span', attrs,
    h('span',{class:'tok-card-head'}, name),
    h('span',{class:'tok-card-body'}, formatValue(value))
  );
}

// ---------------------------------------------------------------------------
// Result-connection helpers: every evaluation/substitution step is tagged
// with a color by its POSITION in the trace (not by action type — every
// EVALUATE step used to render the same fixed orange, so once an expression
// had more than one operator there was no way to tell which specific step a
// value came from). The operator (or, for a substitution, the variable/
// constant name) that's about to fire is colored just before it fires, and
// the value it produces keeps that exact color in every later render —
// including once that value is itself consumed as an operand by a later
// step. Colors are applied to text only (no background/box), so a value's
// color is a permanent, at-a-glance record of which step created it.
// ---------------------------------------------------------------------------
const STEP_PALETTE = ['#ffa35c','#6fb7ff','#c39bff','#ffd166','#5ce1c9','#ff8fc7','#9ad068','#7aa2ff'];
function stepColor(index){ return STEP_PALETTE[((index%STEP_PALETTE.length)+STEP_PALETTE.length)%STEP_PALETTE.length]; }
function hexToRgba(hex, alpha){
  const c = hex.replace('#','');
  const r = parseInt(c.substring(0,2),16), g = parseInt(c.substring(2,4),16), b = parseInt(c.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
// Persistent id -> color map: for each of the first `count` steps in
// `steps`, the node that step PRODUCED (resultNodeId — a new literal's id
// for EVALUATE, or the same var/const id it always had for SUBSTITUTE) is
// tagged with that step's color. This mapping never changes once made, so a
// value keeps the color of the step that created it in every later render —
// even after it's consumed as an operand by a subsequent operator — instead
// of being repainted with whichever step happens to use it next.
function buildColorMap(steps, count){
  const map = new Map();
  const n = count==null ? steps.length : count;
  for(let i=0;i<n;i++){
    const id = steps[i].resultNodeId;
    // First-touch wins. A unary token is the one case where two DISTINCT
    // trace steps share the same resultNodeId: SUBSTITUTE reveals the
    // variable's value into its card, then a later UNARY step applies the
    // operator to that same node. An unconditional overwrite here would
    // repaint the value with the later step's color on every row rendered
    // after that second step fires, even though the card itself (already
    // drawn on an earlier row) keeps the first step's color — producing a
    // visible mismatch between a token's source card and its resolved
    // value. Setting only when the id is unseen preserves the color of
    // whichever step actually originated the value, matching the "a value
    // keeps the color of the step that created it" guarantee everywhere.
    if(!map.has(id)) map.set(id, stepColor(i));
  }
  return map;
}
// Locates the binop node (in a "before" tree snapshot) whose two operands
// match the leftId/rightId recorded on an EVALUATE step — i.e. the exact
// operator that step is about to fire.
function findBinopByOperandIds(node, leftId, rightId){
  if(node.kind==='binop'){
    if(node.left.id===leftId && node.right.id===rightId) return node;
    return findBinopByOperandIds(node.left,leftId,rightId) || findBinopByOperandIds(node.right,leftId,rightId);
  }
  return null;
}
// Given a step and the exact tree snapshot that immediately precedes it, find
// the id of the token that step is about to consume: the named var/const
// token for SUBSTITUTE (same id before and after resolution), or the binop
// node for EVALUATE. Used to preview a step's color on its operator/token
// *before* it fires, in already-recorded (historical or canonical) rows —
// where, unlike the live interactive row, exactly which token fires next is
// already known rather than still up to the student.
function pendingNodeId(step, treeBefore){
  if(!step) return null;
  if(step.action==='SUBSTITUTE' || step.action==='UNARY') return step.resultNodeId;
  const n = findBinopByOperandIds(treeBefore, step.leftId, step.rightId);
  return n ? n.id : null;
}

