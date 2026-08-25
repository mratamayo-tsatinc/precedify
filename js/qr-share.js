// ============================================================================
// QR SHARE — score summary shareable-results QR code
// ----------------------------------------------------------------------------
// Mirrors the QR mechanism from the reference "Code Completion Activity" app
// (script.js there): rather than encoding a plain-text URL, a small payload
// {email, timestamp, score, maxScore} is AES-GCM encrypted with a shared
// passphrase (via Web Crypto's PBKDF2 → AES-GCM), packed into a single
// base64url token, and set as the `d` query param on a shared external
// results-viewer page. The domain this app is running on (`a`) and this
// activity's name (`n`) travel alongside as their own params so the SAME
// viewer page can decrypt+display results for any app using this same
// passphrase — this app included.
//
// IMPORTANT: QR_SHARED_PASSPHRASE/QR_SALT_STRING must exactly match what the
// results-viewer page (and any other app sharing it) uses, or the payload
// won't decrypt. This passphrase is visible to anyone reading this file —
// it is NOT a security boundary, only a way to keep the plain score/email
// out of a casual scan/URL glance.
//
// Purely additive/read-only: never mutates state, only renders into
// #scoreQrCodeBox (score-summary.js's modal) on demand.
// ============================================================================

const QR_SHARED_PASSPHRASE = 'AA-9002341ds2sd14-dsfs12sd-54231hg';
const QR_SALT_STRING = 'java-activity-qr-salt-v1';
const QR_RESULTS_VIEWER_URL = 'https://mratamayo-tsatinc.github.io/qr/it5b-w4.html';

async function deriveQrKey(){
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(QR_SHARED_PASSPHRASE), {name:'PBKDF2'}, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt: enc.encode(QR_SALT_STRING), iterations:100000, hash:'SHA-256'},
    keyMaterial, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']
  );
}

function bufferToBase64Url(buffer){
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function encryptQrPayload(dataObj){
  const key = await deriveQrKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(dataObj));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, plaintext);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bufferToBase64Url(combined);
}

function getCleanSourceUrl(){
  // Strip protocol/query/hash — see reference app's identical helper for why:
  // fewer raw characters, and avoids percent-encoding "/" and ":" in the QR data.
  return window.location.href.split(/[?#]/)[0].replace(/^https?:\/\//i, '');
}
function getActivityName(){ return document.title; }

// score/maxScore here are Precedify's grand-total points across every
// profile (see score-summary.js's computeGrandTotalScore), not a per-item
// or per-profile figure.
async function buildResultsShareUrl(score, maxScore){
  const payload = {
    e: state.userEmail,
    t: Math.floor(Date.now()/1000),
    s: score,
    m: maxScore
  };
  const token = await encryptQrPayload(payload);
  const url = new URL(QR_RESULTS_VIEWER_URL);
  url.searchParams.set('d', token);
  url.searchParams.set('a', getCleanSourceUrl());
  url.searchParams.set('n', getActivityName());
  return url.toString();
}

function renderQrInto(boxId, shareUrl, size){
  const box = document.getElementById(boxId);
  if(!box || typeof QRCode === 'undefined') return;
  box.innerHTML = '';
  new QRCode(box, {
    text: shareUrl,
    width: size,
    height: size,
    colorDark: '#1a1a1a',
    colorLight: '#ffffff',
    // L = lowest error correction — see reference app's comment: fewer
    // modules for the same short payload, each rendered bigger/more
    // scannable at a given box size.
    correctLevel: QRCode.CorrectLevel.L
  });
}

// Builds the encrypted share URL from the current grand total and renders
// it into the score summary modal's QR box. Async (encryption + QR draw),
// so callers just fire-and-forget this — the box fills in a moment after
// the modal opens.
async function renderScoreSummaryQr(){
  if(!state.userEmail) return;
  const {earned, max} = computeGrandTotalScore();
  const shareUrl = await buildResultsShareUrl(earned, max);
  renderQrInto('scoreQrCodeBox', shareUrl, 190);
}