// ============================================================================
// VARIABLE FINAL STATE — FLOATING PANEL
// ----------------------------------------------------------------------------
// Wraps var-final-state.js's existing renderVariableFinalState(item) section
// into a floating, draggable window instead of a fixed block glued to the
// bottom of the eval panel. Fully self-contained: injects its own <style>
// tag on first use rather than requiring any edit to styles.css, and keeps
// every bit of UI state (open/closed, animate-on/off, dragged position) in
// module-local variables here — none of it lives on `state` (state.js) or
// on the item, so it survives exactly like showConnectors does (a global,
// session-long UI preference), but without state.js needing to know this
// module exists.
//
// Public surface (called from render-session.js / index.html):
//   renderVariableFinalFloat(item)   — (re)builds + mounts the floating
//                                       panel for the current item. Call
//                                       this once per render, AFTER the
//                                       eval panel (and its timeline) has
//                                       already been appended into the live
//                                       document — the fly-in mode needs to
//                                       look up each value's origin token in
//                                       that live timeline, the same way
//                                       connector-lines.js locates its
//                                       srcEl/dstEl.
//   toggleVarFinalFloatVisible()     — header button: show/hide the panel.
//   toggleVarFinalFlyAnim()          — header button: fly-in vs instant.
//
// ----------------------------------------------------------------------------
// TWO INDEPENDENT TOGGLES
// ----------------------------------------------------------------------------
//   floatVisible   — whether the floating panel is shown at all. Default
//                     true (matches the old always-shown inline behavior).
//   flyAnimEnabled — whether a newly-committed binding's value travels from
//                     its origin token in the timeline to its card (true),
//                     or simply appears in place with the existing one-shot
//                     colorFlash pulse (false). Default OFF, per spec — the
//                     un-animated path is not a separate implementation,
//                     it's a direct call into the ORIGINAL, unmodified
//                     renderVariableFinalState(item) from var-final-state.js,
//                     so "no animation" really does mean "exactly the
//                     current behavior", just inside a floating shell.
//
// The animated path (buildAnimatedVarFinalSection below) necessarily
// duplicates var-final-state.js's row-building loop, because it needs to
// intercept a binding at the exact moment it becomes newly committed —
// showing its PRE-commit value on the actual card while a separate,
// transient flying token carries the new value in from its origin — rather
// than rendering the post-commit value immediately like the original does.
// Everything it depends on (ensureBindings, resolveBindingLive,
// bindingTagText, bindingTagShort, `b._flashed`) is reused as-is from
// var-final-state.js's global functions/binding objects, so both paths stay
// in lockstep: whichever one runs for a given render is the one that
// consumes (sets) `b._flashed`, so switching the toggle mid-session never
// causes a double-flash or a silently-skipped one.
// ============================================================================

let floatVisible = true;
let flyAnimEnabled = false;

// Flight duration, in ms — adjustable live via the slider rendered inside
// the panel body (see renderVarFinalSpeedSlider) whenever fly-in mode is
// on. Module-local like everything else here, so it persists across
// re-renders even though the slider's own DOM node is rebuilt each time.
let flightDurationMs = 500;

// Dragged position, in viewport px — null until the user actually drags the
// panel at least once, in which case the default CSS-anchored corner
// position (see .var-final-float below) is used instead. Persists across
// re-renders (module-local, not DOM-local) since the panel's DOM node is
// torn down and rebuilt on every render(), same as the rest of the app.
let floatPos = null;

let dragging = false;
let dragPanelEl = null;
let dragOffsetX = 0, dragOffsetY = 0;

// Whether the panel was already showing as of the LAST render — used to
// tell "just appeared" (toggled on, or first render of the session) apart
// from "still open, just being rebuilt because the student clicked an
// operator" (see renderVariableFinalFloat). Without this, the entrance
// animation would replay on every single render — the panel is torn down
// and rebuilt every time regardless of whether anything it shows actually
// changed — making the whole window look like it "snaps"/re-enters on
// every operator click even when none of its values did anything.
let floatWasMounted = false;

// ----------------------------------------------------------------------------
// Toggle buttons (wired from index.html, mirroring toggleConnectors()'s
// header-button pattern in connector-lines.js).
// ----------------------------------------------------------------------------
function toggleVarFinalFloatVisible(){
  floatVisible = !floatVisible;
  syncVarFinalFloatToggleUI();
  render();
}
function toggleVarFinalFlyAnim(){
  // Inert while the panel itself is hidden — there's nothing on screen for
  // this to affect, and the button is disabled to match (see
  // syncVarFinalFloatToggleUI), but guard here too in case it's ever
  // reachable another way (keyboard, programmatic click, etc.).
  if(!floatVisible) return;
  flyAnimEnabled = !flyAnimEnabled;
  syncVarFinalFloatToggleUI();
  // No render() needed here — this only changes how the NEXT commit is
  // shown, not anything currently on screen.
}
function syncVarFinalFloatToggleUI(){
  const vBtn = document.getElementById('varFloatToggle');
  const vText = document.getElementById('varFloatToggleText');
  if(vBtn) vBtn.classList.toggle('active', floatVisible);
  if(vText) vText.textContent = floatVisible ? 'Vars on' : 'Vars off';

  const aBtn = document.getElementById('varFlyAnimToggle');
  const aText = document.getElementById('varFlyAnimToggleText');
  if(aBtn){
    aBtn.classList.toggle('active', flyAnimEnabled);
    // Only meaningful while the panel it animates is actually visible —
    // hidden panel means there's nothing to fly values into, so the
    // control is disabled rather than left clickable-but-pointless.
    aBtn.disabled = !floatVisible;
    aBtn.title = floatVisible
      ? 'Toggle fly-in animation for variable value updates (off = instant, matching the existing pulse)'
      : 'Show the variable panel first to control its fly-in animation';
  }
  if(aText) aText.textContent = flyAnimEnabled ? 'Fly-in on' : 'Fly-in off';
}

// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------
function renderVariableFinalFloat(item){
  const stale = document.querySelector('.var-final-float');
  if(stale) stale.remove();
  if(!floatVisible || !item){
    floatWasMounted = false; // next time it opens, it should re-enter
    return;
  }

  ensureVarFinalFloatStyles();

  // True only the render where the panel transitions from not-showing to
  // showing (toggled on, or the very first render of the session) — every
  // subsequent render while it's already open rebuilds the same content in
  // place with no entrance animation, however many times that happens.
  const isAppearing = !floatWasMounted;
  floatWasMounted = true;

  if(!flyAnimEnabled){
    // "No animation" mode is not a separate code path — it's literally the
    // existing, unmodified section from var-final-state.js, just mounted
    // inside the floating shell instead of appended inline. Whatever pulse
    // behavior that function already implements (isFlash) is exactly what
    // plays here.
    const section = renderVariableFinalState(item);
    if(!section) return;
    mountVarFinalFloatPanel(section, null, isAppearing);
    return;
  }

  const built = buildAnimatedVarFinalSection(item);
  if(!built) return;
  mountVarFinalFloatPanel(built.section, built.flights, isAppearing);
}

// ----------------------------------------------------------------------------
// Animated section builder — mirrors renderVariableFinalState's row loop
// (var-final-state.js) closely enough to reuse its CSS classes verbatim,
// but shows a binding's PRE-commit value on its real card the instant it
// becomes newly committed, and queues a flight (see runVarFinalFlights)
// that carries the new value in from its origin token instead of just
// swapping it in place.
// ----------------------------------------------------------------------------
function buildAnimatedVarFinalSection(item){
  const bindings = ensureBindings(item);
  if(bindings.length===0) return null;

  const wrap = h('div',{class:'var-final-panel'});
  wrap.appendChild(h('div',{class:'var-final-title'},'Variable final state'));
  const list = h('div',{class:'var-final-list'});
  const flights = [];

  bindings.forEach(b=>{
    const live = resolveBindingLive(b, item);
    // Same one-shot criterion as var-final-state.js's own isFlash — the
    // first render where this binding is found committed. Consuming
    // `b._flashed` here means the OTHER render path (the plain
    // renderVariableFinalState call above) will correctly see this binding
    // as already-flashed if the toggle is flipped afterward, and vice
    // versa — both paths share one flag.
    const justCommitted = live.committed && !b._flashed;
    if(justCommitted) b._flashed = true;

    let hasValue, displayValue, flashColor;
    if(justCommitted){
      // Pre-commit display — mirrors resolveBindingLive's own "not yet
      // committed" branches (declared value for a variable, "—" for a
      // still-unassigned target), since the flight itself is what's
      // responsible for carrying the value in.
      if(b.kind==='target'){ hasValue = false; displayValue = null; }
      else { hasValue = true; displayValue = b.declaredValue; }
      flashColor = null;
    } else {
      hasValue = live.hasValue; displayValue = live.displayValue; flashColor = live.flashColor;
    }

    const row = h('div',{class:'var-final-row'+(b.trigger!=='static' && live.committed ? ' var-final-changed':'')});
    const card = renderValueCard({
      id: 'vff-'+b.name,
      name: b.name,
      value: hasValue ? displayValue : '—',
      kind: 'variable',
      color: flashColor,
      isFlash: false
    });
    row.appendChild(card);

    const fullTag = bindingTagText(b, live);
    row.appendChild(h('span',{class:'vf-tag'+(b.trigger==='static'?' vf-unchanged':''), tabindex:'0', title:fullTag, 'aria-label':fullTag},
      bindingTagShort(b, live),
      h('i',{class:'fa-solid fa-circle-info vf-hint-icon', 'aria-hidden':'true'})
    ));
    list.appendChild(row);

    if(justCommitted){
      // Mirrors connector-lines.js's own source-lookup concept: the token
      // that ORIGINATED this value in the timeline. For a mutated variable
      // (prefix, live the instant its step fires; postfix, only once the
      // whole statement completes) that's its unary node's id. For the
      // assignment target, the final EVALUATE step collapses the whole
      // expression into one freshly-minted literal, and that literal's
      // resultNodeId is the same id findConnectorDestEl would look up for
      // that step — see var-final-state.js's own resolveBindingLive comment
      // on why "the last step's index IS the origin" for a target.
      const originId = b.kind==='target'
        ? (item.trace.length ? item.trace[item.trace.length-1].resultNodeId : null)
        : b.unaryNodeId;
      flights.push({ originId, cardEl: card, name: b.name, value: live.displayValue, color: live.flashColor });
    }
  });

  wrap.appendChild(list);
  return {section: wrap, flights};
}

// ----------------------------------------------------------------------------
// Mounting + drag
// ----------------------------------------------------------------------------
function mountVarFinalFloatPanel(sectionEl, flights, playEntrance){
  const panel = h('div',{class:'var-final-float'+(playEntrance?' var-final-float-enter':''), style: floatPositionStyle()});

  const header = h('div',{class:'var-final-float-header', onmousedown: onVarFinalFloatDragStart},
    h('i',{class:'fa-solid fa-up-down-left-right var-final-float-drag-icon', 'aria-hidden':'true'}),
    h('span',{class:'var-final-float-title-label'}, 'Variable final state'),
    h('button',{class:'var-final-float-close', title:'Hide this panel', 'aria-label':'Hide this panel',
      onclick: (e)=>{ e.stopPropagation(); toggleVarFinalFloatVisible(); }
    }, h('i',{class:'fa-solid fa-xmark','aria-hidden':'true'}))
  );
  panel.appendChild(header);

  const body = h('div',{class:'var-final-float-body'});
  if(flyAnimEnabled) body.appendChild(renderVarFinalSpeedSlider());
  body.appendChild(sectionEl);
  panel.appendChild(body);

  document.body.appendChild(panel);
  clampVarFinalFloatPosition(panel);

  if(flights && flights.length){
    // Deferred to the next frame: this render() call may still be
    // mid-flight itself (main.js typically builds/attaches the session
    // container synchronously, then does whatever else it does after
    // render() returns). rAF guarantees the timeline this panel needs to
    // read origin positions from is fully attached to the live document by
    // the time we measure it, regardless of exactly where in that sequence
    // this function happened to run.
    requestAnimationFrame(()=>runVarFinalFlights(flights));
  }
}

function floatPositionStyle(){
  if(floatPos) return `left:${floatPos.left}px; top:${floatPos.top}px; right:auto; bottom:auto;`;
  return ''; // default anchored corner position comes from the injected CSS
}

function onVarFinalFloatDragStart(e){
  const panel = e.currentTarget.closest('.var-final-float');
  if(!panel) return;
  dragging = true;
  dragPanelEl = panel;
  const rect = panel.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
  panel.classList.add('var-final-float-dragging');
  e.preventDefault();
}
function onVarFinalFloatDragMove(e){
  if(!dragging) return;
  // The panel's DOM node is rebuilt on every render() — including the 1s
  // auto-advance tick that drives solution-playback (see main.js). If that
  // fires mid-drag, the node we grabbed at mousedown is now detached; grab
  // whichever '.var-final-float' is currently live instead of silently
  // freezing until mouseup. The offset stays valid since it's relative to
  // where the pointer sits within the panel, not tied to a specific node.
  if(!dragPanelEl || !dragPanelEl.isConnected){
    dragPanelEl = document.querySelector('.var-final-float');
    if(!dragPanelEl){ dragging = false; return; }
    dragPanelEl.classList.add('var-final-float-dragging');
  }
  floatPos = clampVarFinalFloatPoint(e.clientX - dragOffsetX, e.clientY - dragOffsetY, dragPanelEl);
  dragPanelEl.style.left = floatPos.left+'px';
  dragPanelEl.style.top = floatPos.top+'px';
  dragPanelEl.style.right = 'auto';
  dragPanelEl.style.bottom = 'auto';
}
function onVarFinalFloatDragEnd(){
  if(!dragging) return;
  dragging = false;
  if(dragPanelEl) dragPanelEl.classList.remove('var-final-float-dragging');
  dragPanelEl = null;
}
// Attached once at module load (not per-render) — dragging spans exactly
// one continuous mousedown→mouseup gesture during which no render() ever
// fires, so caching dragPanelEl for that gesture's duration is safe; the
// listener itself just needs to exist for the lifetime of the page.
document.addEventListener('mousemove', onVarFinalFloatDragMove);
document.addEventListener('mouseup', onVarFinalFloatDragEnd);

function clampVarFinalFloatPoint(left, top, panelEl){
  const w = panelEl.offsetWidth, hgt = panelEl.offsetHeight;
  const maxLeft = Math.max(8, window.innerWidth - w - 8);
  const maxTop = Math.max(8, window.innerHeight - hgt - 8);
  return { left: Math.min(Math.max(8, left), maxLeft), top: Math.min(Math.max(8, top), maxTop) };
}
function clampVarFinalFloatPosition(panel){
  if(!floatPos) return; // default corner position is within viewport by construction
  const rect = panel.getBoundingClientRect();
  const clamped = clampVarFinalFloatPoint(rect.left, rect.top, panel);
  if(clamped.left!==rect.left || clamped.top!==rect.top){
    floatPos = clamped;
    panel.style.left = clamped.left+'px';
    panel.style.top = clamped.top+'px';
  }
}

// Live speed control for the fly-in animation, shown only while fly-in
// mode is on (a duration slider means nothing when values just appear
// instantly). Purely local UI — updating flightDurationMs doesn't need a
// render(), since the very next flight (spawnVarFinalFlyingToken) just
// reads the module variable directly; only the on-screen label needs to
// stay in sync with the thumb as it moves.
function renderVarFinalSpeedSlider(){
  const label = h('span',{class:'var-final-float-speed-label'}, `Fly-in duration: ${flightDurationMs}ms`);
  const input = h('input',{
    type:'range', min:'150', max:'3000', step:'50', value:String(flightDurationMs),
    class:'var-final-float-speed-slider',
    'aria-label':'Fly-in animation duration in milliseconds',
    oninput:(e)=>{
      flightDurationMs = Number(e.target.value);
      label.textContent = `Fly-in duration: ${flightDurationMs}ms`;
    }
  });
  return h('div',{class:'var-final-float-speed-row'}, label, input);
}

// ----------------------------------------------------------------------------
// Flights — the actual "value travels from where it was produced" effect.
// ----------------------------------------------------------------------------
function runVarFinalFlights(flights){
  flights.forEach(f=>{
    const destRect = f.cardEl.getBoundingClientRect();
    const originEl = findVarFinalOriginEl(f.originId);
    if(!originEl){
      // No traceable origin (e.g. a static binding, which was always known
      // from the source rather than "produced" anywhere in the timeline) —
      // fall back to revealing the value in place with the same landing
      // pulse a completed flight ends with, rather than leaving the card
      // blank.
      settleVarFinalFlight(f, null);
      return;
    }
    spawnVarFinalFlyingToken(f, originEl.getBoundingClientRect(), destRect);
  });
}

// Same lookup concept as connector-lines.js's findConnectorDestEl: the
// live timeline stamps data-token-id on both the flat-expression renderer
// (render-flat.js) and the tree renderer, keyed by the node's resultNodeId.
// Several historical rows can share that id (a value keeps rendering in
// every later row once resolved), so the LAST match in document order is
// the current/most-recent on-screen instance of that token.
function findVarFinalOriginEl(id){
  if(id==null) return null;
  const matches = document.querySelectorAll('.eval-panel [data-token-id="'+id+'"]');
  return matches.length ? matches[matches.length-1] : null;
}

function spawnVarFinalFlyingToken(f, originRect, destRect){
  const clone = renderValueCard({id:null, name:f.name, value:f.value, kind:'variable', color:f.color, isFlash:false});
  clone.classList.add('var-final-flying');
  clone.style.position = 'fixed';
  clone.style.left = originRect.left+'px';
  clone.style.top = originRect.top+'px';
  clone.style.width = originRect.width+'px';
  clone.style.margin = '0';
  clone.style.transform = 'none';
  document.body.appendChild(clone);

  // Force a layout read before enabling the transition, so the browser
  // registers this START position as the resting state before we move it —
  // otherwise the jump to the end position would happen instantly, with no
  // visible motion (same "measure before animating" concern as
  // connector-lines.js's connector-measuring class, just the reverse: here
  // we need the FIRST frame to actually stick, not be skipped).
  void clone.getBoundingClientRect();

  const durationMs = flightDurationMs;
  const opacityDelayMs = Math.round(durationMs * 0.6);
  clone.style.transition =
    `left ${durationMs}ms cubic-bezier(.3,.7,.2,1), top ${durationMs}ms cubic-bezier(.3,.7,.2,1), `+
    `width ${durationMs}ms ease, opacity ${durationMs}ms ease ${opacityDelayMs}ms`;
  clone.style.left = destRect.left+'px';
  clone.style.top = destRect.top+'px';
  clone.style.width = destRect.width+'px';

  let done = false;
  const finish = ()=>{
    if(done) return;
    done = true;
    clone.remove();
    settleVarFinalFlight(f, f.color);
  };
  clone.addEventListener('transitionend', finish, {once:true});
  setTimeout(finish, durationMs + 150); // safety net if transitionend never fires (e.g. tab backgrounded)
}

// Reveals the real value on the actual destination card once its flight
// (or the no-origin fallback) completes, with the same one-shot pulse the
// rest of the app uses for "something just resolved" — see .tok-card-flash
// / colorFlash in styles.css.
function settleVarFinalFlight(f, color){
  const bodyEl = f.cardEl.querySelector('.tok-card-body');
  if(bodyEl) bodyEl.textContent = formatValue(f.value);
  if(color){ f.cardEl.style.borderColor = color; f.cardEl.style.color = color; }
  f.cardEl.classList.add('tok-card-flash');
}

// ----------------------------------------------------------------------------
// Injected styles — kept here rather than in styles.css so this file stays
// fully self-contained/removable. Reuses existing CSS variables (--panel,
// --line, --text, --radius, etc. from :root) and existing classes
// (.var-final-panel/.var-final-title/.var-final-list/.tok-card-flash) so
// the floating content matches the app's look with only the shell itself
// needing new rules.
// ----------------------------------------------------------------------------
function ensureVarFinalFloatStyles(){
  if(document.getElementById('var-final-float-styles')) return;
  const style = document.createElement('style');
  style.id = 'var-final-float-styles';
  style.textContent = `
.var-final-float{
  position:fixed; top:100px; right:24px; z-index:900;
  width:260px; max-width:calc(100vw - 32px);
  background:var(--panel); border:1px solid var(--line); border-radius:var(--radius);
  box-shadow:0 10px 30px rgba(0,0,0,0.45);
}
.var-final-float-enter{ animation:var-final-float-in .22s ease; }
.var-final-float-dragging{ user-select:none; }
.var-final-float-header{
  display:flex; align-items:center; gap:8px; padding:9px 10px;
  border-bottom:1px solid var(--line); cursor:grab; user-select:none;
  font-family:var(--ui); font-size:11px; text-transform:uppercase; letter-spacing:0.08em;
  color:var(--text-mute); font-weight:700;
}
.var-final-float-header:active{ cursor:grabbing; }
.var-final-float-drag-icon{ font-size:11px; opacity:0.7; }
.var-final-float-title-label{ flex:1; }
.var-final-float-close{
  background:none; border:none; color:var(--text-mute); cursor:pointer; padding:2px 5px;
  border-radius:4px; line-height:1; font-size:12px;
}
.var-final-float-close:hover{ color:var(--text); background:var(--panel-alt); }
.var-final-float-body{ padding:12px 12px 14px; max-height:60vh; overflow:auto; }
.var-final-float-speed-row{
  display:flex; flex-direction:column; gap:5px;
  margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--line-soft);
}
.var-final-float-speed-label{
  font-family:var(--ui); font-size:10.5px; color:var(--text-mute);
  text-transform:uppercase; letter-spacing:0.06em;
}
.var-final-float-speed-slider{ width:100%; accent-color:var(--op); cursor:pointer; }
/* This section's own title/margins are meant for sitting inline at the
   bottom of .eval-panel — inside the float it's redundant with the
   header's own title (above) and the spacing needs to start at the body's
   own padding instead. */
.var-final-float .var-final-panel{ margin-top:0; padding-top:0; border-top:none; }
.var-final-float .var-final-title{ display:none; }
@keyframes var-final-float-in{ from{ opacity:0; transform:translateY(-6px); } to{ opacity:1; transform:translateY(0); } }
.var-final-flying{ pointer-events:none; z-index:920; box-shadow:0 6px 18px rgba(0,0,0,0.4); }
/* .link-toggle (index.html header buttons) has no built-in disabled look —
   this only needs to cover #varFlyAnimToggle, which is inert whenever the
   panel it controls isn't visible (see syncVarFinalFloatToggleUI). */
#varFlyAnimToggle:disabled{ opacity:0.35; cursor:not-allowed; text-decoration:none; }
@media (max-width:520px){
  .var-final-float{ width:calc(100vw - 32px); }
}
`;
  document.head.appendChild(style);
}

// Set the header buttons' initial label/active state to match the defaults
// above as soon as this file loads (index.html's buttons ship with generic
// placeholder text so it isn't duplicated/hardcoded in two places).
// ensureVarFinalFloatStyles() also runs now rather than waiting for the
// first panel mount, since the disabled-button styling below needs to
// apply to the header buttons immediately (they exist in the static markup
// from page load, before any session/item render happens).
ensureVarFinalFloatStyles();
syncVarFinalFloatToggleUI();
