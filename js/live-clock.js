// ============================================================================
// HEADER USER STATUS + LIVE CLOCK
// ----------------------------------------------------------------------------
// Purely additive/display-only module. Populates the static header's user
// status block (index.html #userStatusName / #headerClock) with the logged-
// in user's identity and a live-ticking day/date/time-with-seconds display.
// Also drives the identical line inside the score summary modal
// (#scoreSummaryUser / #scoreSummaryClock) whenever that modal happens to be
// open, off the same interval.
//
// Runs on its own setInterval, entirely independent of render() — render()
// tears down and rebuilds #app on every call, but these elements live in
// static header/modal markup, so ticking them here (rather than inside
// render()) avoids re-running the whole app tree once a second.
// ============================================================================
let liveClockIntervalId = null;

function formatLiveTimestamp(d){
  const dayDate = d.toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'});
  const time = d.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  return `${dayDate}  ·  ${time}`;
}

function tickLiveClock(){
  const now = new Date();
  const text = formatLiveTimestamp(now);

  const nameEl = document.getElementById('userStatusName');
  if(nameEl) nameEl.textContent = state.userEmail ? `Logged in as ${state.userEmail}` : '';

  const clockEl = document.getElementById('headerClock');
  if(clockEl) clockEl.textContent = text;

  // Only present in the DOM while the score summary modal is open; a no-op
  // (getElementById returns null) the rest of the time.
  const modalClockEl = document.getElementById('scoreSummaryClock');
  if(modalClockEl) modalClockEl.textContent = text;

  const modalUserEl = document.getElementById('scoreSummaryUser');
  if(modalUserEl) modalUserEl.textContent = state.userEmail || '—';
}

function startLiveClock(){
  if(liveClockIntervalId !== null) return; // already running
  tickLiveClock();
  liveClockIntervalId = setInterval(tickLiveClock, 1000);
}
function stopLiveClock(){
  if(liveClockIntervalId !== null){
    clearInterval(liveClockIntervalId);
    liveClockIntervalId = null;
  }
}

startLiveClock();