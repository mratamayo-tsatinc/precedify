// ============================================================================
// CONSOLE DRAWER — CONTENT BRIDGE (placeholder / testing wiring)
// ----------------------------------------------------------------------------
// Wires the single shared console-drawer.js panel to Precedify's actual
// state (state.js) so every profile shows the SAME panel/tab but with
// content specific to whichever profile is currently active.
//
// This file intentionally does NOT edit state.js / main.js / render-*.js,
// and does NOT rely on knowing the name of whatever function handles a
// profile switch (that function lives in a file not available when this
// bridge was written). Instead it polls a cheap signature of the relevant
// state fields on a short interval and only recomputes/repushes content
// when that signature actually changes — this makes it correct regardless
// of which function mutates state.profileId/state.itemIndex, and immune to
// <script> load-order issues (unlike wrapping a function that might not
// exist yet at this file's load time).
//
// CONTENT: the drawer shows a per-profile LESSON — the rule the profile is
// testing, plus a short worked example using its own (illustrative, not
// the student's actual) numbers — so a student can read how to approach
// the activity before attempting it, rather than guessing. See the
// LESSONS map below. Only 'direct-ltr' (profile 1) has a full lesson
// written so far, per the current testing scope; every other profile
// falls back to buildFallbackLesson(), a generic view built from that
// profile's own description/allowedOperators fields.
//
// WORKED EXAMPLE RENDERING: the worked example is NOT a hand-described
// list of {before, op, after, note} strings that would have to be kept in
// sync with the engine by hand. Instead buildLessonExampleTrace() builds a
// real expression tree and runs it through the SAME buildCanonicalTrace()
// (engine.js) used everywhere else, and renderLessonExampleTimeline() then
// renders that trace with the SAME per-row building blocks
// renderCanonicalPlayback() (render-session.js) uses for the "Show correct
// solution" playback — renderStaticExpr, buildColorMap, stepColor,
// pendingNodeId, stepTooltip. The only difference is presentational: every
// row here is already "revealed" (no pb.index gating, no .tl-future rows,
// no Play/Pause controls) and nothing gets an entrance-animation class
// (row-enter / tok-card-flash / tok-colored-flash), since this is a static
// reference sitting inside a lesson, not a live/interactive playback. This
// keeps the lesson's worked example visually and data-consistent with how
// a correct derivation is shown everywhere else in the app, and means a
// future engine change (new operator, new precedence tier, etc.) can never
// make the lesson's own arithmetic silently wrong.
//
// CONNECTOR ARROWS: connector-lines.js's own drawConnectorLines()/
// drawCanonicalConnectorLines() hardcode their target panel
// (document.querySelector('.eval-panel') / '.solution-playback')), and
// neither is ever called near the console drawer anyway — this drawer's
// content is pushed entirely by this file's own poll loop, outside
// main.js's render(). So drawLessonConnectorLines() below instead calls
// straight into connector-lines.js's panel-agnostic building blocks —
// buildConnectorVisuals() and appendConnectorSvg(), neither of which is
// scoped to a specific selector — against our own lesson timeline element.
// Those functions rely on the same data-token-id / data-op-left /
// data-op-right attributes renderStaticExpr() (render-tree.js) already
// stamps onto every token it renders — the exact same call used above —
// so no changes to connector-lines.js or render-tree.js are needed. The
// drawer also mirrors the header's global "Links on/off" state
// (state.showConnectors) rather than always drawing, and computeSignature()
// includes it so toggling that control refreshes the lesson's arrows too.
//
// Safe to delete entirely at any time: doing so only stops pushing content
// into the drawer (which then just sits empty/hidden again) — it can never
// break login, scoring, persistence, or rendering, since it only ever
// READS state/currentProfile() and only ever CALLS the public
// public console-drawer.js API (setConsoleDrawerTitle, setConsoleDrawerContent,
// showConsoleDrawerTab, hideConsoleDrawerTab, closeConsoleDrawer) plus the
// existing public rendering helpers (h, renderStaticExpr, buildColorMap,
// stepColor, pendingNodeId, stepTooltip, buildCanonicalTrace).
// ============================================================================
(function(){
  const POLL_MS = 250;
  let lastSignature = null;

  // A cheap string fingerprint of everything that should trigger a content
  // refresh: screen + profile + the global connector-line toggle.
  // Deliberately excludes item index/checked state — content is per-PROFILE
  // (the lesson for that profile), not per-item, so navigating between
  // items within the same profile must never cause a re-push. showConnectors
  // IS included: it doesn't change the lesson TEXT, but it changes whether
  // drawLessonConnectorLines() should be drawing arrows on it, and nothing
  // else in this file's poll loop would otherwise notice that toggle.
  function computeSignature(){
    try{
      if(typeof state !== 'object' || !state) return null;
      return [state.screen, state.profileId, state.showConnectors].join('|');
    }catch(e){ return null; }
  }

  // --- lesson content -------------------------------------------------------
  // Keyed by PROFILES[i].id (see generator.js). Each entry is written
  // specifically to that profile's own allowedOperators/evaluationPattern —
  // NOT auto-derived from the profile object — because "what the student
  // needs to know before guessing" is a teaching decision, not something
  // safely inferable from operatorCount/operandSources alone. `rule`/`tips`
  // stay hand-authored prose. The worked example itself, however, is NOT
  // hand-authored data — see buildLessonExampleTrace() below, which builds
  // a real tree for this lesson and lets the engine derive it, exactly the
  // way a student's own item is derived.
  //
  // Only 'direct-ltr' (profile 1) is filled in for now, per the current
  // testing scope. Any other profile falls through to
  // buildFallbackLesson() below, which is intentionally generic — it reads
  // straight off the profile's own description/allowedOperators fields
  // rather than guessing at a real lesson script.
  const LESSONS = {
    'direct-ltr': {
      heading: 'Direct Left-to-Right Evaluation',
      rule: [
        '+ and - sit on the SAME precedence tier — neither one ever',
        'outranks the other. When an expression uses only + and -,',
        'there is no precedence decision to make: operators resolve',
        'strictly in the order they appear, left to right.'
      ],
      // Builds the example tree for THIS lesson: 20 - 5 + 3. Kept as a
      // function (not a fixed pre-built tree) purely so every call gets
      // fresh node ids from nextId() (engine.js) — matters if this ever
      // gets called more than once per page load.
      buildExampleTree: () => makeBinOp('+', makeBinOp('-', makeLiteral(20), makeLiteral(5)), makeLiteral(3)),
      tips: [
        "Don't jump to an operator further right just because it looks simpler.",
        'With tied precedence, the LEFTMOST ready operator is always next.'
      ]
    }
  };

  function buildFallbackLesson(profile){
    const opsList = Array.isArray(profile.allowedOperators) ? profile.allowedOperators.join('  ') : '?';
    return [
      `LESSON: ${profile.name || profile.id}`,
      '',
      (profile.description || 'No description available for this profile yet.'),
      '',
      `operators in play : ${opsList}`,
      `parentheses       : ${profile.parentheses ? 'yes' : 'no'}`,
      '',
      '(Full step-by-step lesson for this profile is coming soon —',
      " this is the generic fallback view.)"
    ].join('\n');
  }

  // Runs a lesson's own buildExampleTree() through the SAME
  // buildCanonicalTrace() (engine.js) every other derivation in this app
  // uses — live session, answer-key playback, everything. Returns
  // {steps, finalValue, treeStates}, identical in shape to
  // item.canonicalTrace.
  function buildLessonExampleTrace(lesson){
    const tree = lesson.buildExampleTree();
    return buildCanonicalTrace(tree);
  }

  // Renders a canonical trace using the SAME row-building calls
  // renderCanonicalPlayback() (render-session.js) uses for the "Show
  // correct solution" playback — renderStaticExpr, buildColorMap,
  // stepColor, pendingNodeId — so a lesson's worked example looks and
  // colors exactly like a real correct-solution derivation elsewhere in
  // the app. Differs from that function only in that every row is already
  // "revealed" (no pb.index / .tl-future gating, no Play/Pause controls)
  // and no row gets an entrance-animation class (row-enter /
  // tok-card-flash / tok-colored-flash never get added here), since this
  // is a static reference embedded in a lesson, not a live control.
  function renderLessonExampleTimeline(canonicalTrace){
    const { steps, treeStates } = canonicalTrace;
    const total = steps.length;
    const timeline = h('div',{class:'timeline console-drawer-example-timeline'});

    // Row 0: the untouched original expression — same as
    // renderCanonicalPlayback's own state0Row, minus pb.index/row-enter.
    const pend0 = pendingNodeId(steps[0], treeStates[0]);
    timeline.appendChild(h('div',{class:'tl-row done'},
      h('div',{class:'tl-dot', style:'background:#4b5364;'}),
      h('div',{class:'code-out'},
        renderStaticExpr(treeStates[0], 0, new Map(), null, pend0, stepColor(0)), ';')
    ));

    // One row per step, all fully revealed. colorMap accumulates exactly
    // the way it does in the live/playback panels (buildColorMap(steps,
    // i+1)) so a value keeps the color of whichever step originated it,
    // consistently with every other rendering of a trace in this app.
    for(let i=0; i<total; i++){
      const colorMap = buildColorMap(steps, i+1);
      const nextStep = steps[i+1];
      const pendId = nextStep ? pendingNodeId(nextStep, treeStates[i+1]) : null;
      const color = stepColor(i);
      const tip = stepTooltip(steps[i]);
      const row = h('div',{class:'tl-row done'});
      row.appendChild(h('div',{class:'tl-dot', style:`background:${color};`, title: tip}));
      row.appendChild(h('div',{class:'code-out'},
        renderStaticExpr(treeStates[i+1], 0, colorMap, null, pendId, nextStep ? stepColor(i+1) : null), ';'));
      timeline.appendChild(row);
    }

    return timeline;
  }

  // Assembles the full lesson as a real DOM node — heading, rule prose,
  // the engine-derived worked example timeline, its result, and tips.
  // Takes the already-built trace/timelineEl (rather than building them
  // itself) so the caller can hold onto that SAME timelineEl reference and
  // draw connector lines against it after it's attached to the live DOM —
  // see drawLessonConnectorLines() / syncConsoleDrawer() below. Returned
  // as a Node (not a string) so it can be passed straight to
  // setConsoleDrawerContent(), which accepts either (see console-drawer.js).
  function buildLessonNode(lesson, canonicalTrace, timelineEl){
    const wrap = h('div',{class:'console-drawer-lesson'});

    wrap.appendChild(h('div',{class:'lesson-heading'}, `LESSON: ${lesson.heading}`));

    const ruleBlock = h('div',{class:'lesson-rule'});
    lesson.rule.forEach(line => ruleBlock.appendChild(h('div',{}, line)));
    wrap.appendChild(ruleBlock);

    wrap.appendChild(h('div',{class:'lesson-example-label'}, 'Worked example (not your actual item — just the pattern):'));
    wrap.appendChild(timelineEl);
    wrap.appendChild(h('div',{class:'lesson-result'}, `Result: ${formatValue(canonicalTrace.finalValue)}`));

    const tipsBlock = h('div',{class:'lesson-tips'});
    lesson.tips.forEach(t => tipsBlock.appendChild(h('div',{}, '* ' + t)));
    wrap.appendChild(tipsBlock);

    return wrap;
  }

  // Draws the operator→result connector arrows onto an already-DOM-attached
  // lesson timeline, exactly the way connector-lines.js's own
  // drawConnectorLines()/drawCanonicalConnectorLines() do for the live
  // session / solution-playback panels — same buildConnectorVisuals() call,
  // same appendConnectorSvg() call — just against our own timelineEl
  // instead of a hardcoded '.eval-panel'/'.solution-playback' selector.
  // MUST be called only after timelineEl is actually attached to the live
  // document (i.e. after setConsoleDrawerContent has appended the node it's
  // part of) — getBoundingClientRect() on a detached node returns an
  // all-zero rect, which would silently draw zero-length/invisible lines.
  // Honors the same global state.showConnectors toggle the header's
  // "Links on/off" control drives elsewhere in the app, for consistency.
  function drawLessonConnectorLines(canonicalTrace, timelineEl){
    try{
      if(!timelineEl) return;
      const stale = timelineEl.querySelector('.connector-svg');
      if(stale) stale.remove();
      if(!state.showConnectors) return;
      if(typeof buildConnectorVisuals !== 'function' || typeof appendConnectorSvg !== 'function') return;
      const steps = canonicalTrace.steps;
      if(!steps || steps.length===0) return;

      const rows = timelineEl.querySelectorAll('.tl-row');
      const panelRect = timelineEl.getBoundingClientRect();
      const {paths, dots} = buildConnectorVisuals(panelRect, rows, steps, steps.length);
      appendConnectorSvg(timelineEl, paths, dots);
    }catch(e){ /* decorative arrows must never break the drawer */ }
  }

  function syncConsoleDrawer(){
    try{
      if(typeof state !== 'object' || !state) return;

      // No session yet (still on the login screen) — nothing meaningful to
      // show. Hide the tab and make sure the panel isn't left open behind
      // the login overlay.
      if(state.screen !== 'session'){
        if(typeof hideConsoleDrawerTab === 'function') hideConsoleDrawerTab();
        if(typeof isConsoleDrawerOpen === 'function' && isConsoleDrawerOpen()
           && typeof closeConsoleDrawer === 'function') closeConsoleDrawer();
        return;
      }

      const profile = (typeof currentProfile === 'function') ? currentProfile() : null;
      const profileLabel = profile ? (profile.name || profile.title || profile.id || 'Profile') : 'Console';
      if(typeof setConsoleDrawerTitle === 'function') setConsoleDrawerTitle(`Lesson — ${profileLabel}`);

      const lesson = profile ? LESSONS[profile.id] : null;
      if(!lesson){
        // No profile, or no authored lesson yet for this one — plain-text
        // fallback, no worked example/connector lines to draw.
        if(typeof setConsoleDrawerContent === 'function'){
          setConsoleDrawerContent(profile ? buildFallbackLesson(profile) : 'No active profile.', {cursor:false});
        }
        if(typeof showConsoleDrawerTab === 'function') showConsoleDrawerTab();
        return;
      }

      try{
        const canonicalTrace = buildLessonExampleTrace(lesson);
        const timelineEl = renderLessonExampleTimeline(canonicalTrace);
        const node = buildLessonNode(lesson, canonicalTrace, timelineEl);
        if(typeof setConsoleDrawerContent === 'function') setConsoleDrawerContent(node, {cursor:false});
        // Only now — after setConsoleDrawerContent has attached `node`
        // (and therefore timelineEl, the same object reference) to the
        // live document — can connector-line geometry be measured.
        drawLessonConnectorLines(canonicalTrace, timelineEl);
      }catch(e){
        // buildCanonicalTrace can in principle throw EngineError (e.g.
        // STUCK — see engine.js), though not for this fixed, hand-picked
        // tree. Degrade to the plain-text fallback rather than leaving the
        // drawer in a half-built state.
        if(typeof setConsoleDrawerContent === 'function') setConsoleDrawerContent(buildFallbackLesson(profile), {cursor:false});
      }

      if(typeof showConsoleDrawerTab === 'function') showConsoleDrawerTab();
    }catch(e){ /* placeholder wiring must never surface an error */ }
  }

  function tick(){
    const sig = computeSignature();
    if(sig !== lastSignature){
      lastSignature = sig;
      syncConsoleDrawer();
    }
  }

  setInterval(tick, POLL_MS);
  // Also run once immediately (rather than waiting for the first interval
  // tick) so the tab/content are correct as soon as this script executes,
  // for whichever state already exists at that point (e.g. a resumed exam
  // session set up synchronously earlier in main.js). Note this file loads
  // BEFORE render-tree.js/render-session.js/dom-helpers.js's later
  // functions run their own top-level setup, but this first call only
  // ever *references* their functions inside a try/catch (syncConsoleDrawer
  // -> buildDrawerContent -> buildLessonNode -> renderStaticExpr etc.), so
  // if any of them aren't defined yet this immediate call just no-ops
  // silently and the next 250ms tick (by which point every script on the
  // page has finished loading) succeeds normally.
  tick();
})();
