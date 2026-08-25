// ============================================================================
// GLOBAL APP SETTINGS PERSISTENCE (localStorage, NOT per-user)
// ----------------------------------------------------------------------------
// appSettings.mode / appSettings.timerMinutes are deliberately persisted
// globally under ONE shared key, not keyed per student — this models a
// device/browser-level "what mode is this station in" setting, the same
// way a physical exam-mode switch would work. It is the SINGLE SOURCE OF
// TRUTH for whether the app should treat itself as mid-exam: both a page
// refresh (main.js) and a logout->login (login.js) resume exam progress
// if and only if this persisted mode is currently 'exam' — no other
// signal (in-memory appSettings state, whatever a settings dialog happened
// to show mid-session, etc.) factors into that decision. That makes resume
// fully intentional and reproducible from disk, not an assumption derived
// from whatever state happened to survive in memory.
// ============================================================================

const APP_SETTINGS_KEY = 'precedifyAppSettings';

function loadPersistedAppSettings(){
  try{
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if(!raw) return;
    const saved = JSON.parse(raw);
    if(saved && (saved.mode==='practice' || saved.mode==='exam')) appSettings.mode = saved.mode;
    if(saved && typeof saved.timerMinutes==='number' && saved.timerMinutes>=1 && saved.timerMinutes<=999){
      appSettings.timerMinutes = saved.timerMinutes;
    }
  }catch(e){ /* ignore malformed/unavailable storage — keep in-code defaults */ }
}

function savePersistedAppSettings(){
  try{
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify({mode: appSettings.mode, timerMinutes: appSettings.timerMinutes}));
  }catch(e){ /* storage full/unavailable — silently skip */ }
}

// Manual, explicit "wipe every student's exam progress" action. This is the
// ONLY sanctioned way saved exam progress disappears outside of a timer
// actually expiring — switching Settings to Practice, logging out, etc.
// must never implicitly trigger it. Iterates every localStorage key rather
// than targeting the currently logged-in email, since the entire point is
// clearing OTHER students' leftover records too (shared/lab machine use).
function clearAllExamProgressEverywhere(){
  try{
    const toRemove = [];
    for(let i=0;i<localStorage.length;i++){
      const key = localStorage.key(i);
      if(key && key.indexOf('precedifyExamProgress:')===0) toRemove.push(key);
    }
    toRemove.forEach(k=>localStorage.removeItem(k));
    return toRemove.length;
  }catch(e){ return 0; }
}