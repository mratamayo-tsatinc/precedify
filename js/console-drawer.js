// ============================================================================
// CONSOLE DRAWER — fully additive, content-agnostic module
// ----------------------------------------------------------------------------
// Ported from the Code Completion Activity app's sample-output panel. Same
// contract as moment-feedback.js / juice.js: this file never edits engine.js
// / state.js / main.js / render-*.js. It is entirely self-contained — its
// own markup (added to index.html), its own stylesheet (console-drawer.css),
// its own state.
//
// THIS IS SHELL ONLY. It owns the open/close/toggle mechanism, the tab's
// visibility, and rendering whatever content it's given — it has NO opinion
// about what that content is. Wiring it up to show something (e.g. a live
// evaluation trace, item.decls, canonicalTrace playback) is a separate,
// later step: call setConsoleDrawerContent(...) from wherever that data is
// available (e.g. inside render() in main.js, or a state.js action), and
// call showConsoleDrawerTab()/hideConsoleDrawerTab() to control when the
// tab itself is reachable.
//
// PUBLIC API (all attached to window, matching this app's existing global
// function style — openSettingsModal, toggleSidebar, etc.):
//
//   openConsoleDrawer()
//     Opens the panel (and its backdrop) with a slide-in transition.
//
//   closeConsoleDrawer()
//     Closes the panel. Waits for the slide-out transition before hiding
//     the backdrop, so it never disappears mid-animation.
//
//   toggleConsoleDrawer()
//     Opens if closed, closes if open. Bind this to the tab's onclick (and
//     to any other trigger you add later).
//
//   isConsoleDrawerOpen() -> boolean
//
//   setConsoleDrawerTitle(text)
//     Sets the titlebar text (defaults to "Console").
//
//   setConsoleDrawerContent(contentOrNode, opts)
//     contentOrNode: a string (rendered as plain text — NOT interpreted as
//       HTML, so untrusted/dynamic content can never inject markup — see
//       renderPlainText below) OR a real DOM Node (e.g. built with h() from
//       dom-helpers.js), which is appended as-is for full control.
//     opts: { cursor: boolean } — whether to show the blinking terminal
//       cursor after the content (default false; only meaningful for
//       string content, since a DOM node may contain arbitrary structure).
//
//   clearConsoleDrawerContent()
//     Restores the empty-state placeholder.
//
//   showConsoleDrawerTab() / hideConsoleDrawerTab()
//     Controls whether the docked tab is visible at all. Nothing shows it
//     automatically — the old app's per-exercise "has sample output" check
//     doesn't exist here yet, so callers decide when the tab is relevant.
//
// Every function is defensive (matches moment-feedback.js/juice.js's
// try/catch convention): a missing DOM node or bad argument degrades to a
// silent no-op rather than throwing back into the rest of the app.
// ============================================================================
(function(){
  const root = (typeof globalThis !== 'undefined') ? globalThis : window;

  const IDS = {
    tab: 'consoleDrawerTab',
    panel: 'consoleDrawerPanel',
    overlay: 'consoleDrawerOverlay',
    title: 'consoleDrawerTitle',
    content: 'consoleDrawerContent'
  };

  function el(id){ return document.getElementById(id); }

  // Renders a plain string as safe text content, preserving line breaks
  // (matching the ported app's <pre>-based rendering) without ever
  // interpreting the string as HTML. Any future content-wiring code that
  // wants styled spans (e.g. distinguishing input from output, the way
  // .console-drawer-input-value is reserved for) should build a real DOM
  // node with h() and pass that instead of a string.
  function renderPlainText(container, text){
    container.textContent = String(text == null ? '' : text);
  }

  function openConsoleDrawer(){
    try{
      const panel = el(IDS.panel);
      const overlay = el(IDS.overlay);
      if(!panel) return;

      if(overlay){
        overlay.style.display = 'block';
        overlay.setAttribute('aria-hidden', 'false');
      }
      panel.setAttribute('aria-hidden', 'false');
      updateConsoleDrawerTabState(true);

      // Force the transform to its initial (closed) state before adding
      // .open, so the slide-in transition actually plays even if the panel
      // was just re-opened right after being closed.
      requestAnimationFrame(() => {
        try{ panel.classList.add('open'); }catch(e){ /* no-op */ }
      });
    }catch(e){ /* never let a UI glitch here surface as an app error */ }
  }

  function closeConsoleDrawer(){
    try{
      const panel = el(IDS.panel);
      const overlay = el(IDS.overlay);
      if(!panel) return;

      const wasOpen = panel.classList.contains('open');
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      updateConsoleDrawerTabState(false);

      if(overlay){
        overlay.setAttribute('aria-hidden', 'true');
        if(wasOpen){
          const onEnd = () => {
            try{ overlay.style.display = 'none'; }catch(e){ /* no-op */ }
            panel.removeEventListener('transitionend', onEnd);
          };
          panel.addEventListener('transitionend', onEnd);
        } else {
          // Nothing was actually open — no transition will fire, so hide
          // immediately rather than leaving a dangling listener.
          overlay.style.display = 'none';
        }
      }
    }catch(e){ /* purely UI bookkeeping */ }
  }

  function toggleConsoleDrawer(){
    try{
      const panel = el(IDS.panel);
      if(!panel) return;
      if(panel.classList.contains('open')) closeConsoleDrawer();
      else openConsoleDrawer();
    }catch(e){ /* no-op */ }
  }

  function isConsoleDrawerOpen(){
    try{
      const panel = el(IDS.panel);
      return !!(panel && panel.classList.contains('open'));
    }catch(e){ return false; }
  }

  function setConsoleDrawerTitle(text){
    try{
      const titleEl = el(IDS.title);
      if(titleEl) titleEl.textContent = (text == null ? 'Console' : String(text));
    }catch(e){ /* no-op */ }
  }

  function setConsoleDrawerContent(contentOrNode, opts){
    try{
      const container = el(IDS.content);
      if(!container) return;
      const showCursor = !!(opts && opts.cursor);

      container.innerHTML = '';
      container.classList.toggle('console-drawer-content--cursor', showCursor);

      if(contentOrNode instanceof Node){
        container.appendChild(contentOrNode);
      } else {
        renderPlainText(container, contentOrNode);
      }
    }catch(e){ /* no-op — a bad content payload should never break the app */ }
  }

  function clearConsoleDrawerContent(){
    try{
      const container = el(IDS.content);
      if(!container) return;
      container.classList.remove('console-drawer-content--cursor');
      container.innerHTML = '';
      const placeholder = document.createElement('span');
      placeholder.className = 'console-drawer-empty';
      placeholder.textContent = 'Nothing to show yet.';
      container.appendChild(placeholder);
    }catch(e){ /* no-op */ }
  }

  function updateConsoleDrawerTabState(forceOpen){
    try{
      const tab = el(IDS.tab);
      const panel = el(IDS.panel);
      if(!tab || !panel) return;
      const isOpen = forceOpen !== undefined ? forceOpen : panel.classList.contains('open');
      tab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      // Visibility (display) of the tab itself is independent of open/closed
      // state — see showConsoleDrawerTab/hideConsoleDrawerTab — this only
      // syncs the aria-expanded bookkeeping.
    }catch(e){ /* no-op */ }
  }

  function showConsoleDrawerTab(){
    try{
      const tab = el(IDS.tab);
      if(tab) tab.style.display = 'flex';
    }catch(e){ /* no-op */ }
  }

  function hideConsoleDrawerTab(){
    try{
      const tab = el(IDS.tab);
      if(tab) tab.style.display = 'none';
    }catch(e){ /* no-op */ }
  }

  // Escape closes the drawer, mirroring the ported app's original behavior.
  // Self-contained listener — doesn't assume or touch any Escape handling
  // that may already exist elsewhere in this app (e.g. for the sidebar).
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && isConsoleDrawerOpen()) closeConsoleDrawer();
  });

  root.openConsoleDrawer = openConsoleDrawer;
  root.closeConsoleDrawer = closeConsoleDrawer;
  root.toggleConsoleDrawer = toggleConsoleDrawer;
  root.isConsoleDrawerOpen = isConsoleDrawerOpen;
  root.setConsoleDrawerTitle = setConsoleDrawerTitle;
  root.setConsoleDrawerContent = setConsoleDrawerContent;
  root.clearConsoleDrawerContent = clearConsoleDrawerContent;
  root.showConsoleDrawerTab = showConsoleDrawerTab;
  root.hideConsoleDrawerTab = hideConsoleDrawerTab;
})();
