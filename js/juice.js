// ============================================================================
// JUICE / FEEL — fully additive celebratory-moment module
// ----------------------------------------------------------------------------
// Same contract as moment-feedback.js: this file never edits engine.js /
// state.js / render-session.js / render-done.js logic. It only:
//
//   1. WRAPS startSession and restart (via the same safeWrap helper pattern
//      as moment-feedback.js) purely to reset one session-scoped flag
//      (state._juiceDoneCelebrated) so the end-of-session confetti can fire
//      again on a later session. The original function always runs first/
//      unconditionally; this module's own logic is try/caught around it.
//      If either function doesn't exist, safeWrap no-ops — nothing breaks.
//
//   2. DERIVES celebration-worthiness fresh, on every render, purely by
//      reading item.wasCorrectFinal / item.itemScore / state.items — all
//      already populated by the existing scoring flow, never mutated here.
//      A one-time "already played" flag is cached directly on the item
//      (item._juiceFirstCorrectPlayed, item._juicePerfectPlayed) — the same
//      technique render-session.js already uses for _feedbackAnimated/
//      _flashed, so a celebration animation fires exactly once per item,
//      not on every one of the app's frequent re-renders.
//
//   3. EXPOSES two functions:
//        renderItemCelebration(item, feedbackEl) — call once, right after
//          the per-item feedback card is built and appended to the live
//          DOM (needs real layout to position confetti). Returns a DOM
//          node of celebration badges to append (or null).
//        renderSessionCelebration(referenceEl) — call once from the
//          session-summary screen, after it's appended to the live DOM.
//          Fires a bigger confetti burst if every item in the session was
//          correct. Returns nothing; it spawns its own overlay.
//      Both are entirely optional call sites — see the small guarded
//      insertions in render-session.js / render-done.js.
//
// Confetti itself never depends on any ancestor having position:relative
// (which would mean touching an existing selector in styles.css): each
// burst measures its reference element's live viewport rect and overlays a
// position:fixed layer sized to match, appended straight to document.body.
// ============================================================================
(function(){
  const root = (typeof globalThis !== 'undefined') ? globalThis : window;

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

  // Session-scoped: allows the perfect-session confetti to fire again on a
  // fresh session after the flag was set true by an earlier one. Item-level
  // flags (_juiceFirstCorrectPlayed / _juicePerfectPlayed) need no such
  // reset — startSession always rebuilds state.items from scratch, so those
  // flags simply don't exist yet on the new item objects.
  function resetSessionJuice(){
    if(typeof state === 'object' && state) state._juiceDoneCelebrated = false;
  }
  safeWrap('startSession', null, resetSessionJuice);
  safeWrap('restart', null, resetSessionJuice);

  // --- confetti ---------------------------------------------------------
  // Fired across the FULL viewport (not scoped to any single container),
  // so a burst is a whole-page celebratory moment regardless of where the
  // triggering element lives on the page.
  const CONFETTI_COLORS = ['#ffa35c','#6fb7ff','#c39bff','#ffd166','#5ce1c9','#ff8fc7','#9ad068','#7aa2ff'];

  function spawnConfetti(referenceEl, opts){
    try{
      if(typeof document === 'undefined') return;
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if(!vw || !vh) return;
      // Scaled up from the requested count for a denser, more energetic burst.
      const count = Math.round(((opts && opts.count) || 28) * 2.2);
      const wrap = document.createElement('div');
      wrap.className = 'juice-confetti-container';
      wrap.style.left = '0';
      wrap.style.top = '0';
      wrap.style.width = vw + 'px';
      wrap.style.height = vh + 'px';
      for(let i=0;i<count;i++){
        const piece = document.createElement('span');
        piece.className = 'juice-confetti-piece';
        const spreadX = (Math.random()*2 - 1) * 320;      // px horizontal drift
        const fallY = vh * (0.55 + Math.random()*0.75);     // px downward travel, viewport-relative
        const rot = (Math.random()*2 - 1) * 900;            // deg spin
        const delay = Math.random()*260;                     // ms
        const dur = 1500 + Math.random()*1200;                // ms
        const size = 5 + Math.random()*7;                     // px, varied piece size
        piece.style.setProperty('--jc-x', spreadX.toFixed(1)+'px');
        piece.style.setProperty('--jc-y', fallY.toFixed(1)+'px');
        piece.style.setProperty('--jc-rot', rot.toFixed(0)+'deg');
        piece.style.left = (Math.random()*100) + '%';
        piece.style.top = '-' + (Math.random()*16) + 'px';
        piece.style.width = size + 'px';
        piece.style.height = (size*1.7) + 'px';
        if(Math.random() < 0.3) piece.style.borderRadius = '50%'; // some pieces round instead of oblong
        piece.style.animationDelay = delay+'ms';
        piece.style.animationDuration = dur+'ms';
        piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        wrap.appendChild(piece);
      }
      document.body.appendChild(wrap);
      setTimeout(()=>{ try{ wrap.remove(); }catch(e){} }, 3000);
    }catch(e){ /* purely decorative — never let this surface an error */ }
  }

  // --- per-item celebration ----------------------------------------------
  // Called once, right after render-session.js appends the feedback card
  // (fbEl) to the live DOM. Returns a DOM node of badges to append into
  // that same card, or null if there's nothing new to celebrate.
  function renderItemCelebration(item, fbEl){
    try{
      if(!item || !item.checked || !fbEl || typeof h !== 'function') return null;
      const badges = [];

      // First fully-correct item of the session. Session order is strictly
      // forward (state.itemIndex only ever increments — see handleNextItem
      // in state.js), so "every earlier item wasn't correct" is a reliable
      // definition of "first" without needing any extra tracking.
      const idx = (typeof state==='object' && state && Array.isArray(state.items)) ? state.items.indexOf(item) : -1;
      const isFirstCorrectSoFar = !!item.wasCorrectFinal && idx >= 0 &&
        state.items.slice(0, idx).every(it => !it.wasCorrectFinal);
      if(isFirstCorrectSoFar && !item._juiceFirstCorrectPlayed){
        item._juiceFirstCorrectPlayed = true;
        badges.push(h('span',{}, h('i',{class:'fa-solid fa-champagne-glasses'}), ' First one down!'));
        spawnConfetti(fbEl, {count:24});
      }

      // Perfect item score (100%, from whichever ITEM_SCORE_MODELS policy
      // is configured — see state.js's SCORING_CONFIG). Reusing itemScore
      // rather than re-deriving it keeps this in lockstep with whatever
      // scoring policy is active, without this file needing to know it.
      if(item.itemScore === 1 && !item._juicePerfectPlayed){
        item._juicePerfectPlayed = true;
        badges.push(h('span',{}, h('i',{class:'fa-solid fa-star'}), ' Perfect — every step in order'));
        spawnConfetti(fbEl, {count:36});
      }

      if(badges.length === 0) return null;
      return h('div',{class:'juice-celebration'}, ...badges.map(content => h('span',{class:'juice-badge'}, content)));
    }catch(e){ return null; }
  }

  // --- session-level celebration -------------------------------------------
  // Called once from render-done.js, after the summary card is appended to
  // the live DOM. referenceEl is whichever element the confetti should
  // visually center over (the summary hero, ideally).
  function renderSessionCelebration(referenceEl){
    try{
      if(typeof state !== 'object' || !state || !Array.isArray(state.items) || state.items.length === 0) return;
      if(state._juiceDoneCelebrated) return;
      const allCorrect = state.items.every(it => it.wasCorrectFinal);
      if(!allCorrect) return;
      state._juiceDoneCelebrated = true;
      spawnConfetti(referenceEl, {count:60});
    }catch(e){ /* purely decorative */ }
  }

  root.renderItemCelebration = renderItemCelebration;
  root.renderSessionCelebration = renderSessionCelebration;
})();
