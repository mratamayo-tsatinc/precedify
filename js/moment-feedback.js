// ============================================================================
// MOMENT-TO-MOMENT FEEDBACK — fully additive module
// ----------------------------------------------------------------------------
// This file never edits engine.js / generator.js / flat-model.js / state.js /
// render-session.js. It only:
//
//   1. WRAPS a handful of already-existing functions (handleUndo,
//      handleReset, handleRetrySameItem) purely to observe them, so it can
//      maintain one extra piece of bookkeeping: item._mfUndoCount. Every
//      wrap ALWAYS calls the original function, unconditionally, first (or
//      lets it run untouched via .apply) — this module's own logic runs
//      around that call wrapped in try/catch, so a bug here can never
//      prevent the real action from happening and can never throw back out
//      into the rest of the app. If the function being wrapped doesn't
//      exist (e.g. this file loaded out of order, or state.js changes),
//      safeWrap() just no-ops — nothing breaks, the feature quietly doesn't
//      appear.
//
//   2. DERIVES everything else — longest correct-order streak, and a
//      breakdown of WHY each wrong step was wrong — fresh, on every render,
//      purely by READING item.trace and item.history. Both already exist,
//      are already populated by the existing evaluate flow, and are never
//      mutated by this file. Nothing here is cached on the item except the
//      one undo counter above; every read is defensively try/caught and
//      degrades to "skip this stat" rather than throwing.
//
//   3. EXPOSES renderMomentFeedbackBlock(item), a single function that
//      returns a DOM node (or null). The only touch outside this file is
//      one small, guarded insertion in render-session.js that calls it and
//      appends the result into the existing feedback card — see the
//      comment at that call site.
//
// New fields this file adds (item._mfUndoCount) simply piggyback on the
// existing item object; nothing reads them except this file, so their
// presence or absence never affects scoring, trace correctness, or any
// other existing behavior.
// ============================================================================
(function(){
  const root = (typeof globalThis !== 'undefined') ? globalThis : window;

  // Wraps root[name] (if it exists and is a function) so that:
  //   - the ORIGINAL function always runs, exactly as before, via .apply
  //   - onBefore()/onAfter(ctx) are this module's own bookkeeping, each
  //     individually try/caught so neither can block the original call or
  //     escape as an uncaught error.
  // No-ops entirely if root[name] isn't a function — safe under any load
  // order or future refactor of the wrapped function's name.
  function safeWrap(name, onBefore, onAfter){
    const original = root[name];
    if(typeof original !== 'function') return;
    root[name] = function(){
      let ctx;
      try{ ctx = onBefore ? onBefore() : undefined; }catch(e){ ctx = undefined; }
      const result = original.apply(this, arguments);
      try{ if(onAfter) onAfter(ctx); }catch(e){ /* swallow: bookkeeping must never surface an error */ }
      return result;
    };
  }

  // --- undo tracking -------------------------------------------------------
  // history.length shrinks back down after an undo, so whether undo was
  // ever pressed can't be reconstructed after the fact the way streaks and
  // mistake types can — this is the one thing that genuinely needs to be
  // observed live.
  safeWrap('handleUndo',
    function before(){
      try{
        const item = (typeof currentItem === 'function') ? currentItem() : null;
        if(!item) return null;
        const willUndo = !item.checked && Array.isArray(item.history) && item.history.length > 1;
        return {item, willUndo};
      }catch(e){ return null; }
    },
    function after(ctx){
      if(ctx && ctx.willUndo && ctx.item){
        ctx.item._mfUndoCount = (ctx.item._mfUndoCount || 0) + 1;
      }
    }
  );
  function clearUndoCounter(){
    const item = (typeof currentItem === 'function') ? currentItem() : null;
    if(item) item._mfUndoCount = 0;
  }
  // Reset (Practice-only full item restart) and Try-again both reuse the
  // SAME item object rather than creating a fresh one, so without this the
  // counter would wrongly carry over from a previous attempt. New-random-
  // attempt and startSession both build a brand-new item object with no
  // _mfUndoCount property at all, which every read below already treats as
  // 0 via `||0` — no wrap needed for those.
  safeWrap('handleReset', null, clearUndoCounter);
  safeWrap('handleRetrySameItem', null, clearUndoCounter);

  // --- step-choice classification ------------------------------------------
  // Mirrors the SAME partition logic flat-model.js's getMaxPrecCandidatesFlat
  // already uses to decide wasCorrect, so this can never disagree with it —
  // but it's kept self-contained here (reading, never modifying,
  // flat-model.js's existing exported functions) rather than adding a new
  // function into that file. Degrades to null (unclassified) if the
  // expected helpers or shapes aren't there.
  function classifyChoice(flatBefore, leftId, rightId){
    try{
      if(typeof collectReadyOperatorsFlat !== 'function' || typeof getMaxPrecCandidatesFlat !== 'function') return null;
      const ready = collectReadyOperatorsFlat(flatBefore, []);
      const chosen = ready.find(r=>r.leftId===leftId && r.rightId===rightId);
      if(!chosen) return null;
      if(chosen.leftGroup !== chosen.rightGroup) return 'crossed-parens';
      const maxCands = getMaxPrecCandidatesFlat(flatBefore);
      const wasMax = maxCands.some(c=>c.leftId===leftId && c.rightId===rightId);
      return wasMax ? null : 'wrong-tier';
    }catch(e){ return null; }
  }

  // --- derive everything else, fresh, from existing data --------------------
  // Returns null (render nothing) rather than throwing if item/trace/history
  // don't look like what's expected.
  function computeMomentFeedback(item){
    try{
      if(!item || !Array.isArray(item.trace)) return null;
      let longestStreak = 0, current = 0, evalCount = 0;
      const mistakeBreakdown = {crossedParens:0, wrongTier:0, other:0};
      item.trace.forEach((t,i)=>{
        if(!t || t.action !== 'EVALUATE') return;
        evalCount++;
        if(t.wasCorrect){
          current++;
          if(current > longestStreak) longestStreak = current;
        } else {
          current = 0;
          let type = null;
          try{
            const flatBefore = item.history && item.history[i];
            if(flatBefore) type = classifyChoice(flatBefore, t.leftId, t.rightId);
          }catch(e){ /* leave as unclassified */ }
          if(type === 'crossed-parens') mistakeBreakdown.crossedParens++;
          else if(type === 'wrong-tier') mistakeBreakdown.wrongTier++;
          else mistakeBreakdown.other++;
        }
      });
      const totalMistakes = mistakeBreakdown.crossedParens + mistakeBreakdown.wrongTier + mistakeBreakdown.other;
      return {
        longestStreak,
        mistakeBreakdown,
        totalMistakes,
        totalOpSteps: evalCount,
        undoCount: item._mfUndoCount || 0
      };
    }catch(e){ return null; }
  }

  // --- render ---------------------------------------------------------------
  // Returns a DOM node to append into the feedback card, or null if there's
  // nothing worth showing (or anything at all went wrong / required globals
  // like h() aren't available yet).
  function renderMomentFeedbackBlock(item){
    try{
      if(typeof h !== 'function') return null;
      const stats = computeMomentFeedback(item);
      if(!stats) return null;

      const parts = [];

      if(stats.longestStreak >= 2){
        parts.push(h('div',{class:'feedback-stats mf-stats'},
          h('div',{class:'stat'},
            h('div',{class:'sv'}, String(stats.longestStreak), stats.longestStreak>=3 ? h('i',{class:'fa-solid fa-fire'}) : null),
            h('div',{class:'sl'}, 'best streak')
          )
        ));
      }

      if(stats.totalMistakes > 0){
        const chips = [];
        if(stats.mistakeBreakdown.crossedParens > 0) chips.push(h('span',{class:'mistake-chip mc-parens'}, stats.mistakeBreakdown.crossedParens + '\u00D7 reached across parentheses'));
        if(stats.mistakeBreakdown.wrongTier > 0) chips.push(h('span',{class:'mistake-chip mc-tier'}, stats.mistakeBreakdown.wrongTier + '\u00D7 wrong precedence tier'));
        if(stats.mistakeBreakdown.other > 0) chips.push(h('span',{class:'mistake-chip mc-other'}, stats.mistakeBreakdown.other + '\u00D7 out of order'));
        if(chips.length){
          parts.push(h('div',{class:'mistake-breakdown'}, h('span',{class:'mb-label'},'Where it went sideways: '), ...chips));
        }
      }

      if(stats.totalOpSteps > 0 && stats.undoCount === 0){
        parts.push(h('div',{class:'clean-badge'}, h('i',{class:'fa-solid fa-wand-magic-sparkles'}), ' No undos used'));
      }

      if(parts.length === 0) return null;
      return h('div',{class:'moment-feedback-block'}, ...parts);
    }catch(e){ return null; }
  }

  // Exposed globally so render-session.js's guarded call site can reach it.
  root.renderMomentFeedbackBlock = renderMomentFeedbackBlock;
})();
