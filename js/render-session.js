// ---------------------------------------------------------------------------
// "On-paper" assignment-line layout.
// ----------------------------------------------------------------------------
// A student working an expression out by hand writes the "TYPE varname ="
// left-hand side once, then just "= ..." underneath for every subsequent
// transformation, reading straight down the "=" column rather than
// re-parsing "int result" on every line. We mimic that here: the LHS label
// is shown only on the very first evaluation-panel row (the untouched
// expression) and the very last (the fully-derived final value) — see
// callers below — with every row in between rendering a blank space of the
// exact same width instead.
//
// The LHS text is now PER-ITEM, not a fixed constant: each generated item
// carries its own randomly (seeded) chosen assignment-target name (see
// generator.js's RESULT_NAMES/pickResultName, threaded onto item.resultName
// in state.js), so one item might read "int total = ..." while another
// reads "int outcome = ...". assignLineString() (language.js) mirrors this
// same name for the source panel's own assignment line.
//
// Because the label text now varies in length per item, its reserved width
// (in `ch` units) can no longer be a single module-level constant — it's
// computed once per render, from that item's own resultName, and passed
// into every renderAssignLabel() call for that item so every row (and the
// canonical-playback panel, which renders the very same item) reserves the
// identical width. That's still the important invariant: within one item's
// own rows, the width must never vary, or the "=" column drifts.
//
// Two things must stay a constant width on every row for the "=" to
// actually land in the same pixel column: this label, and the correctness
// badge (which only appears on some EVALUATE rows, after Check). Both are
// wrapped in fixed-width slots so their presence/absence never shifts
// anything to their right. This depends on .code-out having a single,
// non-varying font-size across done/current rows (see the CSS) — `ch` units
// are font-size-relative, so a size difference between rows would silently
// reintroduce misalignment even with these slots in place.
// ---------------------------------------------------------------------------
// labelText/labelCh are computed per-item by the caller (see renderSession
// and renderCanonicalPlayback below) from item.resultName, since the LHS
// text is no longer a fixed constant. Falls back to a bare space-reserving
// width of 0 if somehow not supplied, rather than throwing.
function renderAssignLabel(show, labelText, labelCh){
  const text = labelText || '';
  const ch = labelCh || 0;
  return h('span',{class:'assign-label', style:`display:inline-block;width:${ch}ch;`}, show ? text+' ' : '');
}
// 22px = .step-badge's own 15px width + 7px margin-right, so the slot holds
// the badge with no extra shift when one is present, and no gap collapse
// when one isn't.
function renderBadgeSlot(badge){
  return h('span',{class:'badge-slot', style:'display:inline-block;width:22px;'}, badge);
}

// Full step detail as plain text only — used for a hover title / aria-label,
// never rendered as a visible line. The visible surface is just the badge
// (see .step-badge) plus the expression's own token colors.
function stepTooltip(t, revealCorrectness){
  if(t.action==='SUBSTITUTE') return `substitute ${t.target} → ${formatValue(t.sourceValue)}`;
  if(t.action==='UNARY') return `apply ${t.op} to ${t.target} → ${formatValue(t.result)}`;
  const order = (!revealCorrectness || t.wasCorrect==null) ? '' : (t.wasCorrect ? ' (correct order)' : ' (out of order)');
  return `evaluate ${formatValue(t.target.operands[0])} ${t.target.operator} ${formatValue(t.target.operands[1])} → ${formatValue(t.result)}${order}`;
}

// ---------------------------------------------------------------------------
// Answer-key playback controls (per item: {index, playing})
// ---------------------------------------------------------------------------
let activePlaybackTimer = null;
function playbackTogglePlay(){
  const item = currentItem();
  if(!item || !item.playback) return;
  const total = item.canonicalTrace.steps.length;
  if(item.playback.index >= total) item.playback.index = 0;
  item.playback.playing = !item.playback.playing;
  render();
}
function playbackStep(delta){
  const item = currentItem();
  if(!item || !item.playback) return;
  const total = item.canonicalTrace.steps.length;
  item.playback.playing = false;
  item.playback.index = Math.max(0, Math.min(total, item.playback.index+delta));
  render();
}
function playbackRestart(){
  const item = currentItem();
  if(!item || !item.playback) return;
  item.playback.index = 0;
  item.playback.playing = false;
  render();
}

function renderSession(container){
  const item = currentItem();
  const profile = currentProfile();

  // This item's own assignment-target label text/width — see the header
  // comment above. Computed once per render and threaded through every
  // renderAssignLabel() call below (and into renderCanonicalPlayback, which
  // renders this same item's derivation) so the "=" column lines up
  // consistently across every row for THIS item.
  const assignLabelText = 'int ' + (item.resultName || 'result');
  const assignLabelCh = assignLabelText.length + 1; // +1 for the space before '='

  // Mode tag, links toggle, and exam timer are global app settings, not
  // per-profile — they now live in the static app header (index.html) and
  // are kept in sync by main.js's syncGlobalHeaderUI(), not rebuilt here.
  container.appendChild(h('div',{class:'session-bar'},
    h('div',{class:'session-meta'}, h('b',{}, `Item ${state.itemIndex+1}`), ` / ${state.items.length}  ·  ${profile.name}`)
  ));

  // SOURCE panel
  const srcPanel = h('div',{class:'source-panel'});
  srcPanel.appendChild(h('div',{class:'panel-title'},'Original source'));
  for(const decl of item.decls){
    srcPanel.appendChild(h('div',{class:'code-line decl-line'}, declLine(decl, state.language)));
  }
  const originalExprStr = renderString(item.originalTree);
  srcPanel.appendChild(h('div',{class:'code-line active-line'}, assignLineString(originalExprStr, item.resultName)));
  container.appendChild(srcPanel);

  // EVALUATION panel
  const evalPanel = h('div',{class:'eval-panel'});
  evalPanel.appendChild(h('div',{class:'panel-title'},'Evaluation'));
  const timeline = h('div',{class:'timeline'});

  // initial state row
  const initRow = h('div',{class:'tl-row'+(item.trace.length>0?' done':' current')});
  initRow.appendChild(h('div',{class:'tl-dot', style:'background:#4b5364;'}));
  if(item.trace.length===0){
    // Nothing has been produced yet, so the color map is empty; every
    // currently-ready operator/token previews stepColor(0), since the
    // student may pick ANY of them (no forced "correct next" gating).
    const unresolvedAny0 = collectUnresolvedFlat(item.workingFlat,[]).length>0;
    initRow.appendChild(h('div',{class:'code-out'}, renderBadgeSlot(null), renderAssignLabel(true, assignLabelText, assignLabelCh), '= ',
      renderInteractiveFlatExpr(item.workingFlat, new Map(), stepColor(0), null, unresolvedAny0), ';'));
  } else {
    // Superseded by later rows below; only its own pending operator/token
    // (the one recorded as firing at step 0) previews step 0's color.
    const pend0 = pendingFlatWithColor(item.trace[0], stepColor(0));
    initRow.appendChild(h('div',{class:'code-out'}, renderBadgeSlot(null), renderAssignLabel(true, assignLabelText, assignLabelCh), '= ',
      renderStaticFlatExpr(item.originalFlat, new Map(), null, pend0), ';'));
  }
  timeline.appendChild(initRow);

  // history rows (each trace step) — every row is rendered from its own real
  // flat-expression snapshot. colorMap accumulates one color per step so far
  // (stepColor(i) for step i), and that mapping is permanent: once a value is
  // tagged with the color of the step that made it, it keeps that color in
  // every later row, even after it's consumed as an operand by a subsequent
  // operator. Full step detail ("evaluate 6 + 18 -> 24") is data-only,
  // exposed via title/aria-label rather than printed as its own line — only
  // a compact correct/incorrect badge is shown inline with the expression.
  // Per the brief (§12): the student must never be told during construction
  // that a selection was right or wrong — that would defeat the reasoning
  // activity. This applies identically in Practice and Exam; step
  // correctness is only ever revealed once the item has been checked. The
  // ONLY behavioral differences between the two modes are (a) whether the
  // item can be reset/retried, and (b) whether the correct-solution
  // playback is offered — both handled elsewhere, not here.
  const revealCorrectness = item.checked;
  item.trace.forEach((t, i)=>{
    const isLast = i === item.trace.length-1;
    const row = h('div',{class:'tl-row'+(isLast?' current':' done')});
    const color = stepColor(i);
    const tip = stepTooltip(t, revealCorrectness);
    row.appendChild(h('div',{class:'tl-dot', style:`background:${color};`+(isLast?`box-shadow:0 0 0 4px ${hexToRgba(color,0.25)};`:''), title:tip}));
    const badge = (t.action==='EVALUATE' && revealCorrectness)
      ? h('span',{class:'step-badge '+(t.wasCorrect?'ok':'warn'), title:tip, 'aria-label':tip, role:'img'}, h('i',{class:'fa-solid '+(t.wasCorrect?'fa-check':'fa-exclamation')}))
      : null;
    const colorMap = buildColorMap(item.trace, i+1);
    // t (this step) is a stable object living in item.trace, not something
    // recreated on every render — so a flag written onto it here survives
    // across the many full re-renders that happen for reasons unrelated to
    // this row (e.g. once per second while the separate answer-key playback
    // below is auto-advancing, or a click on any other row/control).
    // Without this, EVERY row — not just the current one — would replay its
    // value-flash on every one of those unrelated re-renders, since flashId
    // was previously being passed unconditionally regardless of whether this
    // exact step had already been shown before.
    const flashId = t._flashed ? null : t.resultNodeId;
    t._flashed = true;
    // The label ('int <resultName>') is shown only on the row that holds
    // the truly final, fully-derived value — not merely the "current" row,
    // which may still be mid-sequence (more operators left to pick).
    const isFinalRow = isLast && itemFullyResolved(item);
    if(isLast){
      const activeColor = stepColor(item.trace.length); // color for whatever the student clicks next
      const unresolvedAny = collectUnresolvedFlat(item.workingFlat,[]).length>0;
      const enterCls = t._entered ? '' : ' row-enter';
      t._entered = true;
      row.appendChild(h('div',{class:'code-out'+enterCls}, renderBadgeSlot(badge), renderAssignLabel(isFinalRow, assignLabelText, assignLabelCh), '= ',
        renderInteractiveFlatExpr(item.workingFlat, colorMap, activeColor, flashId, unresolvedAny), ';'));
    } else {
      const nextStep = item.trace[i+1];
      const pend = pendingFlatWithColor(nextStep, stepColor(i+1));
      row.appendChild(h('div',{class:'code-out'}, renderBadgeSlot(badge), renderAssignLabel(false, assignLabelText, assignLabelCh), '= ',
        renderStaticFlatExpr(item.history[i+1], colorMap, flashId, pend), ';'));
    }
    timeline.appendChild(row);
  });

  evalPanel.appendChild(timeline);
  container.appendChild(evalPanel);
  // Variable final state now renders as a floating, draggable panel
  // (var-final-float.js) instead of living inline at the bottom of the eval
  // panel — see that file for the visibility/fly-in toggles. Must run AFTER
  // evalPanel is attached above: its optional fly-in mode looks up each
  // value's origin token in the now-live timeline, the same way
  // connector-lines.js locates its srcEl/dstEl. Guarded like the other
  // optional-module hooks in this file (renderMomentFeedbackBlock,
  // setFeedbackDrawerContent, etc.) so a missing/broken module here can
  // never break the rest of the session view.
  if(typeof renderVariableFinalFloat === 'function') renderVariableFinalFloat(item);

  // action bar
  const canUndo = !item.checked && item.history.length>1;
  const canCheck = !item.checked && itemFullyResolved(item);
  const canReset = state.mode==='practice' && !item.checked && item.trace.length>0;

  const actionBar = h('div',{class:'action-bar'},
    h('div',{class:'btn-group'},
      h('button',{class:'btn', disabled: !canUndo, onclick:handleUndo}, h('i',{class:'fa-solid fa-rotate-left'}), ' Undo'),
      canReset ? h('button',{class:'btn btn-ghost', onclick:handleReset}, 'Reset item') : null
    ),
    h('button',{class:'btn btn-primary', disabled: !canCheck, onclick:handleCheck}, 'Check answer')
  );
  container.appendChild(actionBar);

  if(!itemFullyResolved(item) && !item.checked){
    const unresolvedCount = collectUnresolvedFlat(item.workingFlat,[]).length;
    if(unresolvedCount>0){
      container.appendChild(h('p',{class:'helper-text'}, `Resolve ${unresolvedCount} more highlighted token${unresolvedCount>1?'s':''} (variable, constant, or unary) before operators become active.`));
    } else {
      container.appendChild(h('p',{class:'helper-text'}, 'Tap any highlighted operator to evaluate it — you choose the order. Wrong order is allowed; you\'ll see how it plays out.'));
    }
  }

  // feedback
  if(item.checked){
    const correct = item.wasCorrectFinal;
    // The whole session view is torn down and rebuilt on every render() call
    // (including once per second while answer-key playback is auto-advancing),
    // so a brand-new .feedback DOM node is created every single tick even
    // though the box itself never actually re-appears. An unconditional
    // "pop in" animation class would therefore replay on every tick, making
    // the whole box look like it's blinking. `_feedbackAnimated` is a plain
    // flag on the persistent item object (not the DOM), so it survives
    // across rebuilds and the entrance animation fires exactly once, right
    // when Check is first pressed.
    // Also doubles as the "should the feedback drawer auto-open?" signal
    // below — both questions are really the same one ("has feedback for
    // THIS check already been shown to the student"), so they share the
    // one flag rather than tracking it twice.
    const isFirstFeedbackShow = !item._feedbackAnimated;
    const fbEnterCls = item._feedbackAnimated ? '' : ' feedback-enter';
    item._feedbackAnimated = true;
    const fb = h('div',{class:'feedback '+(correct?'correct':'incorrect')+fbEnterCls});
    fb.appendChild(h('div',{class:'feedback-head'}, h('i',{class:'fa-solid '+(correct?'fa-circle-check':'fa-circle-xmark')}), correct ? ' Correct' : ' Incorrect'));
    fb.appendChild(h('div',{class:'feedback-body'},
      correct
        ? h('span',{}, 'Your derived result matches the independently calculated answer: ', h('span',{class:'num'}, String(item.correctFinalValue)), '.')
        : h('span',{}, 'Your derived result was ', h('span',{class:'num'}, String(item.studentFinal)), '. The correct result is ', h('span',{class:'num'}, String(item.correctFinalValue)), '.')
    ));
    fb.appendChild(h('div',{class:'feedback-stats'},
      h('div',{class:'stat'}, h('div',{class:'sv'}, `${item.correctSteps}/${item.totalOpSteps}`), h('div',{class:'sl'},'steps in correct order')),
      h('div',{class:'stat'}, h('div',{class:'sv'}, `${Math.round(item.itemScore*100)}%`), h('div',{class:'sl'},'item score'))
    ));
    // Additive hook for the moment-to-moment feedback module
    // (js/moment-feedback.js) — entirely optional. If that script isn't
    // loaded, or it fails for any reason, this is a silent no-op and the
    // feedback card renders exactly as it did before that module existed.
    if(typeof renderMomentFeedbackBlock === 'function'){
      let mfBlock = null;
      try{ mfBlock = renderMomentFeedbackBlock(item); }catch(e){ mfBlock = null; }
      if(mfBlock) fb.appendChild(mfBlock);
    }
    if(state.mode==='practice'){
      fb.appendChild(h('button',{class:'solution-toggle', onclick:toggleSolution}, item.showSolution ? 'Hide correct solution' : 'Show correct solution'));
      if(item.showSolution){
        fb.appendChild(renderCanonicalPlayback(item, assignLabelText, assignLabelCh));
      }
    }
    // Feedback now lives in the toggleable feedback drawer (feedback-drawer.js)
    // instead of inline below the action bar — same content/behavior as
    // before, just relocated to cut down on page scrolling. Fully guarded:
    // if feedback-drawer.js isn't loaded (or setFeedbackDrawerContent
    // throws for any reason), fall straight back to the original inline
    // placement so a missing/broken drawer module can never hide the
    // student's result.
    let placedInDrawer = false;
    if(typeof setFeedbackDrawerContent === 'function'){
      try{
        setFeedbackDrawerContent(fb);
        placedInDrawer = true;
      }catch(e){ placedInDrawer = false; }
    }
    if(!placedInDrawer) container.appendChild(fb);

    // Additive hook for the juice/feel module (js/juice.js) — entirely
    // optional. fb must already be attached to the live DOM (true either
    // way above — the drawer's content div is part of the live document
    // once setFeedbackDrawerContent has run) for spawnConfetti's
    // positioning to be accurate. If the script isn't loaded, or it fails
    // for any reason, this is a silent no-op.
    if(typeof renderItemCelebration === 'function'){
      try{
        const celebration = renderItemCelebration(item, fb);
        if(celebration) fb.appendChild(celebration);
      }catch(e){ /* silent no-op */ }
    }

    if(placedInDrawer){
      // Keep the tab visible and its correct/incorrect dot in sync, and
      // auto-open the drawer the FIRST time this item's feedback is shown
      // (mirroring the one-shot behavior isFirstFeedbackShow/
      // _feedbackAnimated already governs for the entrance animation).
      // Later re-renders of the SAME check — e.g. the once-a-second
      // re-renders that happen while the answer-key playback below is
      // auto-advancing — never force it back open if the student closed
      // it; a fresh item (item.checked false again) resets the flag via
      // the branch below, so the NEXT check still auto-opens.
      if(typeof showFeedbackDrawerTab === 'function') showFeedbackDrawerTab();
      if(typeof setFeedbackDrawerStatus === 'function') setFeedbackDrawerStatus(correct);
      if(isFirstFeedbackShow && typeof openFeedbackDrawer === 'function') openFeedbackDrawer();
    }

    if(state.mode==='practice'){
      const bottomBar = h('div',{class:'action-bar'},
        h('div',{class:'btn-group'},
          h('button',{class:'btn', onclick:handleRetrySameItem}, h('i',{class:'fa-solid fa-rotate-right'}), ' Try again')
        )
      );
      container.appendChild(bottomBar);
    }
  } else if(typeof clearFeedbackDrawerContent === 'function'){
    // This item hasn't been checked yet — make sure feedback left over
    // from a PREVIOUS item (or a previous attempt at this one, after
    // Reset/Try again) doesn't linger visible in the drawer. Guarded like
    // every other call into feedback-drawer.js: a missing/broken module
    // here is a silent no-op, never a thrown error.
    try{
      clearFeedbackDrawerContent();
      if(typeof setFeedbackDrawerStatus === 'function') setFeedbackDrawerStatus(null);
      if(typeof hideFeedbackDrawerTab === 'function') hideFeedbackDrawerTab();
      if(typeof isFeedbackDrawerOpen === 'function' && isFeedbackDrawerOpen()
         && typeof closeFeedbackDrawer === 'function') closeFeedbackDrawer();
    }catch(e){ /* no-op */ }
  }
}

// assignLabelText/assignLabelCh are passed in from renderSession (computed
// from this same item's item.resultName) rather than recomputed here, so
// the canonical-playback panel's "=" column lines up with exactly the same
// reserved width the live session panel above it used for this item.
function renderCanonicalPlayback(item, assignLabelText, assignLabelCh){
  const pb = item.playback;
  const total = item.canonicalTrace.steps.length;

  const wrap = h('div',{class:'solution-playback'});
  wrap.appendChild(h('div',{class:'playback-controls'},
    h('button',{class:'btn playback-btn', disabled: pb.index<=0, onclick:()=>playbackStep(-1)}, h('i',{class:'fa-solid fa-backward-step'}), ' Prev'),
    h('button',{class:'btn btn-primary playback-btn', onclick:playbackTogglePlay},
      pb.playing ? h('span',{}, h('i',{class:'fa-solid fa-pause'}), ' Pause') : (pb.index>=total ? h('span',{}, h('i',{class:'fa-solid fa-rotate-right'}), ' Replay') : h('span',{}, h('i',{class:'fa-solid fa-play'}), ' Play'))),
    h('button',{class:'btn playback-btn', disabled: pb.index>=total, onclick:()=>playbackStep(1)}, 'Next ', h('i',{class:'fa-solid fa-forward-step'})),
    h('span',{class:'playback-progress'}, `${pb.index} / ${total} steps`)
  ));

  const timeline = h('div',{class:'timeline solution-timeline'});

  const state0Row = h('div',{class:'tl-row'+(pb.index===0?' current':' done')});
  state0Row.appendChild(h('div',{class:'tl-dot', style:'background:#4b5364;'}));
  const pend0 = pendingNodeId(item.canonicalTrace.steps[0], item.canonicalTrace.treeStates[0]);
  state0Row.appendChild(h('div',{class:'code-out'+(pb.index===0?' row-enter':'')}, renderAssignLabel(true, assignLabelText, assignLabelCh), '= ',
    renderStaticExpr(item.canonicalTrace.treeStates[0], 0, new Map(), null, pend0, stepColor(0)), ';'));
  timeline.appendChild(state0Row);

  // Loop over EVERY step (0..total-1), not just the ones revealed so far.
  // A row for a not-yet-reached step is still built — same markup, same
  // font-size, same height — so the timeline's total height is fixed at its
  // maximum on the very first render of this panel. Only its visibility
  // (via the .tl-future class) changes as pb.index advances; nothing is
  // ever appended afterward, so nothing below this panel has to shift.
  for(let i=0; i<total; i++){
    const revealed = i < pb.index;
    const t = item.canonicalTrace.steps[i];
    const isLast = i === pb.index-1;
    const isFinalStep = i === total-1; // the step that resolves to the single derived value
    const color = stepColor(i);
    const row = h('div',{class:'tl-row'+(isLast?' current':' done')+(revealed?'':' tl-future')});
    row.appendChild(h('div',{class:'tl-dot', style:`background:${color};`+(isLast&&revealed?`box-shadow:0 0 0 4px ${hexToRgba(color,0.25)};`:''), title: revealed ? stepTooltip(t) : null}));
    // Unrevealed rows get no color map / pending preview / flash — they're
    // laid out (for height) but must not visually leak the upcoming value.
    const colorMap = revealed ? buildColorMap(item.canonicalTrace.steps, i+1) : new Map();
    const nextStep = item.canonicalTrace.steps[i+1];
    const pendId = revealed && nextStep ? pendingNodeId(nextStep, item.canonicalTrace.treeStates[i+1]) : null;
    row.appendChild(h('div',{class:'code-out'+(isLast&&revealed?' row-enter':'')}, renderAssignLabel(isFinalStep, assignLabelText, assignLabelCh), '= ',
      renderStaticExpr(item.canonicalTrace.treeStates[i+1], 0, colorMap, isLast&&revealed ? t.resultNodeId : null, pendId, revealed&&nextStep ? stepColor(i+1) : null), ';'));
    timeline.appendChild(row);
  }

  wrap.appendChild(timeline);
  return wrap;
}