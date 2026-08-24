// ============================================================================
// UI STATE + RENDERING
// ============================================================================
const state = {
  screen: 'setup', // setup | session | done
  language: 'java',
  mode: 'practice',
  profileId: PROFILES[0].id,
  itemCount: 5,
  itemIndex: 0,
  showConnectors: true, // whether the operator→result connector line (connector-lines.js) is drawn
  items: [], // {originalTree, originalFlat, decls, correctFinalValue, canonicalTrace, workingFlat, history:[], trace:[], checked, itemScore, revealSolution}
};

function currentProfile(){ return PROFILES.find(p=>p.id===state.profileId); }
function currentItem(){ return state.items[state.itemIndex]; }

function startSession(){
  const profile = currentProfile();
  state.items = [];
  for(let i=0;i<state.itemCount;i++){
    const inst = generateInstance(profile);
    const flat0 = flattenInstance(inst.tree);
    state.items.push({
      originalTree: inst.tree,
      originalFlat: flat0,
      decls: inst.decls,
      correctFinalValue: inst.correctFinalValue,
      canonicalTrace: inst.canonicalTrace,
      workingFlat: deepCloneFlat(flat0),
      history: [deepCloneFlat(flat0)],
      trace: [],
      checked: false,
      itemScore: null,
      points: null,
      maxPoints: null,
      correctSteps: 0,
      totalOpSteps: 0,
      wasCorrectFinal: null,
      showSolution: false,
      playback: null,
      _bindings: null // lazily built by var-final-state.js (ensureBindings)
    });
  }
  state.itemIndex = 0;
  state.screen = 'session';
  render();
}

function itemFullyResolved(item){
  return item.workingFlat.operands.length===1 && isFlatOperandReady(item.workingFlat.operands[0]);
}

// action is {type:'substitute', id} or {type:'evaluate', leftId, rightId}.
// Any ready operator anywhere in the expression (not just a single
// "correct next" one) can be clicked — see the FLAT model comment above.
function handleTokenClick(action){
  const item = currentItem();
  if(item.checked) return;

  if(action.type==='substitute'){
    const node = findFlatOperandById(item.workingFlat, action.id);
    if(!node) return;
    if(node.kind==='unary'){
      // First half only: reveal the wrapped variable's value. The operator
      // itself is applied by a separate 'apply-unary' click below — a
      // unary operator always acts on a variable, so its value must be
      // identified/substituted before the operator can be applied, exactly
      // like any other variable operand.
      if(node.substituted) return;
      const before = flatToString(item.workingFlat);
      item.workingFlat = substituteFlatById(item.workingFlat, action.id);
      const after = flatToString(item.workingFlat);
      item.trace.push({action:'SUBSTITUTE', target:(node.inner.kind==='literal'?String(node.inner.value):node.inner.name), targetKind:node.inner.kind, sourceValue:unaryBaseValue(node), expressionBefore:before, expressionAfter:after, resultNodeId:node.id});
      item.history.push(deepCloneFlat(item.workingFlat));
      render();
      return;
    }
    if(node.resolved) return;
    const before = flatToString(item.workingFlat);
    item.workingFlat = resolveFlatById(item.workingFlat, action.id);
    const after = flatToString(item.workingFlat);
    item.trace.push({action:'SUBSTITUTE', target:node.name, targetKind:node.kind, sourceValue:node.declaredValue, expressionBefore:before, expressionAfter:after, resultNodeId:node.id});
    item.history.push(deepCloneFlat(item.workingFlat));
    render();
    return;
  }

  if(action.type==='apply-unary'){
    // Second half of a unary token's resolution: applies the operator
    // (++/--/!) to the value revealed by the preceding 'substitute' click
    // (e.g. "++7" -> "8"). Only reachable once substituted, never resolved.
    const node = findFlatOperandById(item.workingFlat, action.id);
    if(!node || node.kind!=='unary' || !node.substituted || node.resolved) return;
    const before = flatToString(item.workingFlat);
    item.workingFlat = resolveFlatById(item.workingFlat, action.id);
    const after = flatToString(item.workingFlat);
    item.trace.push({action:'UNARY', op:node.op, form:node.form, target:(node.inner.kind==='literal'?String(node.inner.value):node.inner.name), sourceValue:unaryBaseValue(node), result:unaryComputedValue(node), expressionBefore:before, expressionAfter:after, resultNodeId:node.id});
    item.history.push(deepCloneFlat(item.workingFlat));
    render();
    return;
  }

  if(action.type==='evaluate'){
    const unresolvedAny = collectUnresolvedFlat(item.workingFlat,[]).length>0;
    if(unresolvedAny) return; // gated: all variables/constants must resolve first
    const before = flatToString(item.workingFlat);
    const maxCands = getMaxPrecCandidatesFlat(item.workingFlat);
    const wasCorrect = maxCands.some(c=>c.leftId===action.leftId && c.rightId===action.rightId);
    const evalResult = evaluateFlatAt(item.workingFlat, action.leftId, action.rightId);
    if(!evalResult.applied) return;
    item.workingFlat = evalResult.newFlat;
    const after = flatToString(item.workingFlat);
    item.trace.push({action:'EVALUATE', target:{operator:evalResult.op, operands:[evalResult.a, evalResult.b]}, result:evalResult.result, expressionBefore:before, expressionAfter:after, wasCorrect, resultNodeId:evalResult.resultId, leftId:action.leftId, rightId:action.rightId});
    item.history.push(deepCloneFlat(item.workingFlat));
    render();
  }
}

function handleUndo(){
  // Undo is unlimited in BOTH Practice and Exam mode (it's a pre-submission
  // editing action, not a graded attempt) — only blocked once checked.
  const item = currentItem();
  if(item.checked || item.history.length<=1) return;
  item.history.pop();
  item.trace.pop();
  item.workingFlat = deepCloneFlat(item.history[item.history.length-1]);
  render();
}
function handleReset(){
  // Reset (start this item completely over) is Practice-only; Exam mode
  // never allows it, even before checking — that's the only real
  // Practice/Exam difference besides the one-check-per-item rule below.
  const item = currentItem();
  if(state.mode==='exam' || item.checked) return;
  item.workingFlat = deepCloneFlat(item.originalFlat);
  item.history = [deepCloneFlat(item.originalFlat)];
  item.trace = [];
  item._bindings = null;
  render();
}
// ============================================================================
// SCORING CONFIGURATION (data-driven — Project Brief §14E)
// ----------------------------------------------------------------------------
// §14E requires the scoring formula be "configurable without rewriting the
// evaluation engine," and explicitly lists several policies (final-answer-
// only, step-based, step+final, process-focused) as things a teacher should
// be able to select between, not things baked into handleCheck as a single
// literal formula. So scoring lives here as data (SCORING_CONFIG) plus a
// small table of named model functions (ITEM_SCORE_MODELS) that data selects
// between. handleCheck itself no longer contains any formula — it just
// gathers the step/final facts and calls scoreItem(), so swapping policies,
// or adding a new one, never touches the evaluation engine or handleCheck.
//
// Every model resolves to RAW POINTS: {points, maxPoints}, both whole
// numbers scaled against cfg.pointsPerItem — not a bare 0..1 ratio — so the
// end-of-session summary can show an honest "[earned]/[possible]" score
// instead of a percentage.
// ============================================================================
const SCORING_CONFIG = {
  model: 'STEP_PLUS_FINAL',  // any key in ITEM_SCORE_MODELS below
  stepWeight: 0.5,            // used by STEP_PLUS_FINAL / PROCESS_FOCUSED only
  finalWeight: 0.5,           // used by STEP_PLUS_FINAL / PROCESS_FOCUSED only
  pointsPerItem: 10           // raw point budget each item is worth
};

const ITEM_SCORE_MODELS = {
  // "Final-answer-only" (§14E): the derived value is all that's scored.
  // A wrong path that lands on the right answer still gets full credit; a
  // right path undone by one final slip gets zero — steps are never scored.
  FINAL_ONLY: (facts, cfg) => ({
    points: facts.wasCorrectFinal ? cfg.pointsPerItem : 0,
    maxPoints: cfg.pointsPerItem
  }),
  // "Step-based" (§14E): only the proportion of correctly-ordered evaluation
  // steps counts. A correct final value reached via a correct process will
  // already show as 100% of steps correct, so this still rewards it.
  STEP_ONLY: (facts, cfg) => {
    const ratio = facts.totalOpSteps>0 ? facts.correctSteps/facts.totalOpSteps : 1;
    return {points: Math.round(ratio*cfg.pointsPerItem), maxPoints: cfg.pointsPerItem};
  },
  // "Step + final" (§14E, and this app's default): step credit and final
  // credit are both scored and blended by cfg.stepWeight/cfg.finalWeight.
  STEP_PLUS_FINAL: (facts, cfg) => {
    const stepRatio = facts.totalOpSteps>0 ? facts.correctSteps/facts.totalOpSteps : 1;
    const ratio = cfg.stepWeight*stepRatio + cfg.finalWeight*(facts.wasCorrectFinal?1:0);
    return {points: Math.round(ratio*cfg.pointsPerItem), maxPoints: cfg.pointsPerItem};
  },
  // "Process-focused" (§14E): identical shape to STEP_PLUS_FINAL — the
  // policy difference is entirely in how SCORING_CONFIG's weights are set
  // (e.g. stepWeight:0.8, finalWeight:0.2), so most of the score reflects
  // the evaluation sequence rather than only the terminal value.
  PROCESS_FOCUSED: (facts, cfg) => {
    const stepRatio = facts.totalOpSteps>0 ? facts.correctSteps/facts.totalOpSteps : 1;
    const ratio = cfg.stepWeight*stepRatio + cfg.finalWeight*(facts.wasCorrectFinal?1:0);
    return {points: Math.round(ratio*cfg.pointsPerItem), maxPoints: cfg.pointsPerItem};
  }
};
function scoreItem(facts){
  const model = ITEM_SCORE_MODELS[SCORING_CONFIG.model] || ITEM_SCORE_MODELS.STEP_PLUS_FINAL;
  return model(facts, SCORING_CONFIG);
}

function handleCheck(){
  const item = currentItem();
  if(!itemFullyResolved(item) || item.checked) return;
  const studentFinal = flatOperandValue(item.workingFlat.operands[0]);
  const evalSteps = item.trace.filter(t=>t.action==='EVALUATE');
  const correctSteps = evalSteps.filter(s=>s.wasCorrect).length;
  const totalOpSteps = evalSteps.length;
  const wasCorrectFinal = studentFinal === item.correctFinalValue;
  item.checked = true;
  item.studentFinal = studentFinal;
  item.correctSteps = correctSteps;
  item.totalOpSteps = totalOpSteps;
  item.wasCorrectFinal = wasCorrectFinal;
  const {points, maxPoints} = scoreItem({correctSteps, totalOpSteps, wasCorrectFinal});
  item.points = points;
  item.maxPoints = maxPoints;
  // Ratio form is retained only for the per-item "% item score" stat shown
  // in the mid-session feedback card; the session summary uses raw points.
  item.itemScore = maxPoints>0 ? points/maxPoints : 0;
  render();
}
function handleNextItem(){
  if(state.itemIndex < state.items.length-1){
    state.itemIndex++;
    render();
  } else {
    state.screen = 'done';
    render();
  }
}
function handleRetrySameItem(){
  // Re-attempt the SAME generated expression from scratch (multiple Verify attempts, per Practice mode rules).
  const item = currentItem();
  if(state.mode==='exam') return;
  item.workingFlat = deepCloneFlat(item.originalFlat);
  item.history = [deepCloneFlat(item.originalFlat)];
  item.trace = [];
  item.checked = false;
  item.itemScore = null;
  item.points = null; item.maxPoints = null;
  item.correctSteps = 0; item.totalOpSteps = 0; item.wasCorrectFinal = null;
  item.showSolution = false;
  item.playback = null;
  item._feedbackAnimated = false;
  item._bindings = null;
  render();
}
function handleNewRandomAttempt(){
  // Generate a fresh randomized instance of the same profile.
  const item = currentItem();
  if(state.mode==='exam') return;
  const idx = state.itemIndex;
  const profile = currentProfile();
  const inst = generateInstance(profile);
  const flat0 = flattenInstance(inst.tree);
  state.items[idx] = {
    originalTree: inst.tree, originalFlat: flat0, decls: inst.decls, correctFinalValue: inst.correctFinalValue,
    canonicalTrace: inst.canonicalTrace, workingFlat: deepCloneFlat(flat0),
    history:[deepCloneFlat(flat0)], trace:[], checked:false, itemScore:null, points:null, maxPoints:null,
    correctSteps:0, totalOpSteps:0, wasCorrectFinal:null, showSolution:false, playback:null,
    _bindings: null
  };
  render();
}
function toggleSolution(){
  const item = currentItem();
  item.showSolution = !item.showSolution;
  if(item.showSolution){
    if(!item.playback) item.playback = {index:0, playing:false};
  } else {
    item.playback = null;
  }
  render();
}
function restart(){ state.screen='setup'; render(); }