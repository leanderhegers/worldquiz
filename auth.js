// ── FIREBASE ACCOUNTS (Phase 1: Auth) ──
// TODO: Ersetze die Platzhalter unten durch dein firebaseConfig aus der Firebase-Konsole
// (Projekteinstellungen → Web-App). Danach funktioniert Login/Registrierung sofort.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAi-PgkqVuAaRvbj6nyC5ypTSce6rI8ru4",
  authDomain: "geo-quiz-b59a8.firebaseapp.com",
  projectId: "geo-quiz-b59a8",
  storageBucket: "geo-quiz-b59a8.firebasestorage.app",
  messagingSenderId: "188915238122",
  appId: "1:188915238122:web:527660ff1067f23f47c393"
};

const FIREBASE_READY = FIREBASE_CONFIG.apiKey !== 'PASTE_API_KEY';
let _auth = null, _db = null, _authMode = 'login';
window._authUser = null;

if (FIREBASE_READY && typeof firebase !== 'undefined') {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    _auth = firebase.auth();
    _db = firebase.firestore();
    _auth.onAuthStateChanged(u => { window._authUser = u; onAuthChanged(u); });
  } catch (e) { console.error('Firebase init failed', e); }
}

function onAuthChanged(u) {
  renderAuthUI(u);
  loadUserData(u);
}

// ── DATENSCHICHT: Einstellungen + Highscores (Cloud wenn eingeloggt, sonst localStorage) ──
const STORE_KEY = 'geoquiz';
let _store = { settings: {}, scores: {}, misses: {}, correct: {} };
let _missTimer = null;

function _loadLocal() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch (e) { return null; } }
function _saveLocal() { try { localStorage.setItem(STORE_KEY, JSON.stringify(_store)); } catch (e) {} }
function _persist() {
  if (_auth && _auth.currentUser && _db) {
    _db.collection('users').doc(_auth.currentUser.uid)
      .set({ settings: _store.settings, scores: _store.scores, misses: _store.misses, correct: _store.correct }, { merge: true })
      .catch(e => console.warn('Firestore-Speichern fehlgeschlagen', e));
  } else {
    _saveLocal();
  }
}

async function loadUserData(u) {
  if (u && _db) {
    try {
      const snap = await _db.collection('users').doc(u.uid).get();
      const d = snap.exists ? snap.data() : {};
      _store = { settings: d.settings || {}, scores: d.scores || {}, misses: d.misses || {}, correct: d.correct || {} };
    } catch (e) { console.warn('Firestore-Laden fehlgeschlagen', e); _store = { settings: {}, scores: {}, misses: {}, correct: {} }; }
  } else {
    _store = _loadLocal() || { settings: {}, scores: {}, misses: {}, correct: {} };
  }
  window._scores = _store.scores;
  if (typeof applyRemoteSettings === 'function') applyRemoteSettings(_store.settings);
  if (typeof refreshScoresUI === 'function') refreshScoresUI();
}

function saveSettings() {
  if (typeof gatherSettings === 'function') _store.settings = gatherSettings();
  _persist();
}

function bestScore(key) { return (_store.scores && _store.scores[key]) || null; }

// Verstecktes Fehler-Tracking: zählt, wie oft eine bestimmte Frage falsch beantwortet wurde
// (für späteres gezieltes Training). Persistiert gebündelt (debounced), um Schreibzugriffe zu sparen.
function recordMiss(qkey) {
  if (!qkey) return;
  if (!_store.misses) _store.misses = {};
  _store.misses[qkey] = (_store.misses[qkey] || 0) + 1;
  clearTimeout(_missTimer);
  _missTimer = setTimeout(_persist, 2500);
}
function getMisses() { return _store.misses || {}; }
function recordCorrect(qkey) {
  if (!qkey) return;
  if (!_store.correct) _store.correct = {};
  _store.correct[qkey] = (_store.correct[qkey] || 0) + 1;
  clearTimeout(_missTimer);
  _missTimer = setTimeout(_persist, 2500);
}
function getCorrects() { return _store.correct || {}; }

// Speichert das Ergebnis, falls es ein neuer Bestwert ist. Gibt true zurück bei neuem Rekord.
function recordScore(key, score, total) {
  if (!key || !total) return false;
  const pct = Math.round((score / total) * 100);
  const prev = _store.scores[key];
  const better = !prev || pct > prev.pct || (pct === prev.pct && score > prev.score);
  if (better) { _store.scores[key] = { score, total, pct, ts: Date.now() }; _persist(); }
  return better;
}

// Beim ersten Laden (vor onAuthStateChanged) lokale Daten verfügbar machen
_store = _loadLocal() || { settings: {}, scores: {}, misses: {} };
window._scores = _store.scores;

function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function renderAuthUI(u) {
  const el = document.getElementById('home-account');
  if (!el) return;
  if (u) {
    const nm = u.displayName || u.email || '';
    el.innerHTML = '<button class="home-acct-btn" onclick="openProfile()" style="font-weight:600;">' + escapeHtml(nm) + '</button>' +
      '<button class="home-acct-btn" onclick="authLogout()">' + t('signOut') + '</button>';
  } else {
    el.innerHTML = '<button class="home-acct-btn" onclick="openAuth(\'login\')">' + t('signIn') + '</button>';
  }
}

function openAuth(mode) {
  _authMode = mode || 'login';
  renderAuthForm();
  document.getElementById('auth-modal').style.display = 'flex';
  const e = document.getElementById('auth-email'); if (e) e.focus();
}
function closeAuth() {
  document.getElementById('auth-modal').style.display = 'none';
  document.getElementById('auth-error').textContent = '';
}
function switchAuthMode() { _authMode = _authMode === 'login' ? 'register' : 'login'; renderAuthForm(); }

function openImpressum() { document.getElementById('impressum-modal').style.display = 'flex'; }
function closeImpressum() { document.getElementById('impressum-modal').style.display = 'none'; }

let _dsLang = 'de'; // kept for compat, actual lang driven by global `lang`
const DS_CONTENT = {
  de: {
    title: 'Datenschutzerklärung',
    body: `<p><strong>1. Verantwortlicher</strong><br>Leander Hegers, Fürstenallee 82, 33102 Paderborn<br>E-Mail: <a href="mailto:leanderhegers@gmx.de" class="legal-link">leanderhegers@gmx.de</a></p>
<p><strong>2. Erhobene Daten</strong><br>Bei der Registrierung erheben wir: E-Mail-Adresse, selbst gewählten Benutzernamen sowie Spielstatistiken (Punkte, Fehler). Bei Google-Anmeldung wird zusätzlich der Google-Anzeigename übermittelt.</p>
<p><strong>3. Zweck der Verarbeitung</strong><br>Die Daten werden ausschließlich zur Bereitstellung der Quiz-Funktionen, zur Speicherung deiner Spielstände und zur Kontoverwaltung verwendet.</p>
<p><strong>4. Dienstleister / Auftragsverarbeitung</strong><br>Wir nutzen <strong>Firebase</strong> (Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043, USA) für Authentifizierung und Datenbankdienste. Die Datenübertragung in die USA erfolgt auf Grundlage der EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO). Weitere Informationen: <a href="https://firebase.google.com/support/privacy" target="_blank" class="legal-link">firebase.google.com/support/privacy</a></p>
<p><strong>5. Speicherdauer</strong><br>Deine Daten werden gespeichert, solange dein Konto besteht. Du kannst dein Konto und alle gespeicherten Daten jederzeit im Profil unter „Konto löschen" entfernen.</p>
<p><strong>6. Deine Rechte</strong><br>Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung deiner Daten (Art. 15–18 DSGVO). Anfragen richtest du an: <a href="mailto:leanderhegers@gmx.de" class="legal-link">leanderhegers@gmx.de</a></p>
<p><strong>7. Cookies / Lokaler Speicher</strong><br>Die App nutzt den lokalen Speicher (localStorage) des Browsers ausschließlich zur Speicherung deiner Spieleinstellungen, ohne externe Tracking-Dienste.</p>
<p><strong>8. Beschwerderecht</strong><br>Du hast das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Zuständig ist die Landesbeauftragte für Datenschutz und Informationsfreiheit NRW.</p>`
  },
  en: {
    title: 'Privacy Policy',
    body: `<p><strong>1. Data Controller</strong><br>Leander Hegers, Fürstenallee 82, 33102 Paderborn, Germany<br>E-Mail: <a href="mailto:leanderhegers@gmx.de" class="legal-link">leanderhegers@gmx.de</a></p>
<p><strong>2. Data Collected</strong><br>Upon registration we collect: your e-mail address, a chosen username, and gameplay statistics (scores, mistakes). When using Google Sign-In, your Google display name is additionally transmitted.</p>
<p><strong>3. Purpose of Processing</strong><br>Data is used exclusively to provide the quiz features, save your game progress, and manage your account.</p>
<p><strong>4. Service Providers / Data Processing</strong><br>We use <strong>Firebase</strong> (Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043, USA) for authentication and database services. Data transfers to the USA are carried out on the basis of EU Standard Contractual Clauses (Art. 46 (2)(c) GDPR). More information: <a href="https://firebase.google.com/support/privacy" target="_blank" class="legal-link">firebase.google.com/support/privacy</a></p>
<p><strong>5. Storage Period</strong><br>Your data is stored as long as your account exists. You can delete your account and all associated data at any time via your profile under "Delete Account".</p>
<p><strong>6. Your Rights</strong><br>You have the right to access, rectify, erase, and restrict the processing of your data (Art. 15–18 GDPR). Requests can be sent to: <a href="mailto:leanderhegers@gmx.de" class="legal-link">leanderhegers@gmx.de</a></p>
<p><strong>7. Cookies / Local Storage</strong><br>The app uses your browser's local storage solely to save your game settings. No external tracking services are used.</p>
<p><strong>8. Right to Lodge a Complaint</strong><br>You have the right to lodge a complaint with a data protection supervisory authority. The competent authority for Germany (NRW) is the Landesbeauftragte für Datenschutz und Informationsfreiheit NRW.</p>`
  }
};

function openDatenschutz() {
  _renderDsContent();
  document.getElementById('datenschutz-modal').style.display = 'flex';
}
function closeDatenschutz() { document.getElementById('datenschutz-modal').style.display = 'none'; }
function _renderDsContent() {
  const l = (typeof lang !== 'undefined' && lang === 'en') ? 'en' : 'de';
  const c = DS_CONTENT[l];
  const titleEl = document.getElementById('ds-title');
  const contentEl = document.getElementById('ds-content');
  if (titleEl) titleEl.textContent = c.title;
  if (contentEl) contentEl.innerHTML = c.body;
}

function renderAuthForm() {
  const reg = _authMode === 'register';
  document.getElementById('auth-title').textContent = reg ? t('registerTitle') : t('loginTitle');
  document.getElementById('auth-username-wrap').style.display = reg ? 'block' : 'none';
  document.getElementById('auth-privacy-wrap').style.display = reg ? 'block' : 'none';
  if (reg) document.getElementById('auth-privacy-cb').checked = false;
  document.getElementById('auth-username').placeholder = t('authUsername');
  document.getElementById('auth-email').placeholder = t('authEmail');
  document.getElementById('auth-pw').placeholder = t('authPw');
  document.getElementById('auth-pw').setAttribute('autocomplete', reg ? 'new-password' : 'current-password');
  document.getElementById('auth-show-lbl').textContent = t('showPw');
  document.getElementById('auth-forgot').textContent = t('forgotPw');
  document.getElementById('auth-forgot').style.display = reg ? 'none' : 'block';
  document.getElementById('auth-submit').textContent = reg ? t('signUp') : t('signIn');
  document.getElementById('auth-switch').textContent = reg ? t('toLogin') : t('toRegister');
  document.getElementById('auth-sep-lbl').textContent = t('orSep');
  document.getElementById('auth-google-lbl').textContent = t('googleBtn');
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-info').textContent = '';
  const noteEl = document.getElementById('auth-google-note');
  if (noteEl) {
    const de = reg
      ? 'Mit der Anmeldung über Google akzeptierst du unsere <button class="legal-inline-btn" onclick="openDatenschutz()">Datenschutzerklärung</button>.'
      : 'Mit der Anmeldung bestätigst du, unsere <button class="legal-inline-btn" onclick="openDatenschutz()">Datenschutzerklärung</button> gelesen zu haben.';
    const en = reg
      ? 'By signing up with Google you accept our <button class="legal-inline-btn" onclick="openDatenschutz()">Privacy Policy</button>.'
      : 'By signing in you confirm you have read our <button class="legal-inline-btn" onclick="openDatenschutz()">Privacy Policy</button>.';
    noteEl.innerHTML = (typeof lang !== 'undefined' && lang === 'en') ? en : de;
    noteEl.style.display = 'block';
  }
}

function toggleAuthPw() {
  const el = document.getElementById('auth-pw');
  el.type = document.getElementById('auth-show-pw').checked ? 'text' : 'password';
}

function authErr(msg) { document.getElementById('auth-error').textContent = msg; document.getElementById('auth-info').textContent = ''; }
function authInfo(msg) { document.getElementById('auth-info').textContent = msg; document.getElementById('auth-error').textContent = ''; }

async function isUsernameTaken(name) {
  if (!_db) return false;
  try { const s = await _db.collection('usernames').doc(name.toLowerCase()).get(); return s.exists; }
  catch (e) { return false; }
}

async function submitAuth() {
  if (!FIREBASE_READY || !_auth) { authErr(t('authNotConfigured')); return; }
  const email = document.getElementById('auth-email').value.trim();
  const pw = document.getElementById('auth-pw').value;
  const btn = document.getElementById('auth-submit');
  if (!email || !pw) { authErr(t('authFillAll')); return; }
  btn.disabled = true; authErr('');
  try {
    if (_authMode === 'register') {
      const privacyCb = document.getElementById('auth-privacy-cb');
      if (privacyCb && !privacyCb.checked) { authErr('Bitte akzeptiere die Datenschutzerklärung.'); btn.disabled = false; return; }
      const username = document.getElementById('auth-username').value.trim();
      if (!username) { authErr(t('authUserRequired')); btn.disabled = false; return; }
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) { authErr(t('authUserInvalid')); btn.disabled = false; return; }
      if (await isUsernameTaken(username)) { authErr(t('authUserTaken')); btn.disabled = false; return; }
      const cred = await _auth.createUserWithEmailAndPassword(email, pw);
      try {
        await _db.collection('usernames').doc(username.toLowerCase()).set({ uid: cred.user.uid });
      } catch (reserveErr) {
        await cred.user.delete().catch(() => {});
        authErr(t('authUserTaken')); btn.disabled = false; return;
      }
      await cred.user.updateProfile({ displayName: username });
      await _db.collection('users').doc(cred.user.uid).set({ username }, { merge: true });
      window._authUser = _auth.currentUser; renderAuthUI(window._authUser);
    } else {
      await _auth.signInWithEmailAndPassword(email, pw);
    }
    closeAuth();
  } catch (e) {
    authErr(authErrMsg(e));
  }
  btn.disabled = false;
}

async function forgotPassword() {
  if (!FIREBASE_READY || !_auth) { authErr(t('authNotConfigured')); return; }
  const email = document.getElementById('auth-email').value.trim();
  if (!email) { authErr(t('enterEmailFirst')); return; }
  try { await _auth.sendPasswordResetEmail(email); authInfo(t('resetSent')); }
  catch (e) { authErr(authErrMsg(e)); }
}

async function signInGoogle() {
  if (!FIREBASE_READY || !_auth) { authErr(t('authNotConfigured')); return; }
  if (_authMode === 'register') {
    const cb = document.getElementById('auth-privacy-cb');
    if (cb && !cb.checked) {
      authErr(lang === 'en' ? 'Please accept the Privacy Policy first.' : 'Bitte akzeptiere zuerst die Datenschutzerklärung.');
      return;
    }
  }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const cred = await _auth.signInWithPopup(provider);
    await ensureUsername(cred.user);
    closeAuth();
  } catch (e) {
    if (e && e.code === 'auth/popup-closed-by-user') return;
    authErr(authErrMsg(e));
  }
}

// Google-Nutzer haben keinen selbstgewählten Username → automatisch einen eindeutigen erzeugen
async function ensureUsername(user) {
  if (!user || !_db) return;
  try {
    const doc = await _db.collection('users').doc(user.uid).get();
    if (doc.exists && doc.data().username) return;
    let base = (user.displayName || (user.email || 'user').split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'user';
    if (base.length < 3) base = base + 'user';
    let name = base, n = 0;
    while (await isUsernameTaken(name)) { n++; name = base + n; }
    await _db.collection('usernames').doc(name.toLowerCase()).set({ uid: user.uid }).catch(() => {});
    await user.updateProfile({ displayName: name }).catch(() => {});
    await _db.collection('users').doc(user.uid).set({ username: name }, { merge: true });
    window._authUser = _auth.currentUser; renderAuthUI(window._authUser);
  } catch (e) { console.warn('ensureUsername failed', e); }
}

function authLogout() { if (_auth) _auth.signOut(); }

function authErrMsg(e) {
  const c = (e && e.code) || '';
  const map = {
    'auth/invalid-email': t('authErrEmail'),
    'auth/email-already-in-use': t('authErrInUse'),
    'auth/weak-password': t('authErrWeak'),
    'auth/wrong-password': t('authErrCred'),
    'auth/user-not-found': t('authErrCred'),
    'auth/invalid-credential': t('authErrCred'),
    'auth/operation-not-allowed': 'Google-Anmeldung ist in Firebase nicht aktiviert.',
    'auth/unauthorized-domain': 'Diese Domain ist in Firebase nicht autorisiert.',
    'auth/popup-blocked': 'Popup wurde vom Browser blockiert. Bitte Popups erlauben.',
    'auth/cancelled-popup-request': '',
  };
  console.error('Firebase Auth Error:', c, e);
  return map[c] !== undefined ? map[c] : (t('authErrGeneric') + (c ? ' (' + c + ')' : ''));
}

// Enter-Taste im Formular = absenden
document.addEventListener('keydown', e => {
  const m = document.getElementById('auth-modal');
  if (!m || m.style.display === 'none') return;
  if (e.key === 'Enter') { e.preventDefault(); submitAuth(); }
  if (e.key === 'Escape') closeAuth();
});

// Initiale UI (zeigt "Anmelden" bis Auth-Status bekannt ist)
renderAuthUI(window._authUser);

// ── SPIELERPROFIL ──
let _pfWeakTab = 'country', _pfWeakShowAll = false;

function openProfile() {
  if (!window._authUser) { openAuth('login'); return; }
  _pfWeakTab = 'country'; _pfWeakShowAll = false;
  renderProfile();
  document.getElementById('profile-modal').style.display = 'flex';
}
function closeProfile() {
  document.getElementById('profile-modal').style.display = 'none';
}

function renderProfile() {
  const u = window._authUser;
  if (!u) return;
  const nm = u.displayName || u.email || '?';
  const initial = nm.charAt(0).toUpperCase();
  const provider = u.providerData && u.providerData[0] ? u.providerData[0].providerId : 'password';
  const providerLabel = provider === 'google.com' ? '🔑 Google-Konto' : '✉ E-Mail-Konto';
  const since = u.metadata && u.metadata.creationTime ? new Date(u.metadata.creationTime).toLocaleDateString('de-DE', {day:'2-digit',month:'long',year:'numeric'}) : '—';
  const lastPlay = _lastPlayedDate();
  const scores = _store.scores || {};
  const misses = _store.misses || {};

  // Übersicht-Zahlen
  const gameCount = Object.keys(scores).length;
  const bestPct = gameCount ? Math.max(...Object.values(scores).map(s => s.pct || 0)) : 0;
  const daysSince = u.metadata && u.metadata.creationTime ? Math.max(1, Math.round((Date.now() - new Date(u.metadata.creationTime)) / 86400000)) : 0;

  document.getElementById('profile-content').innerHTML =
    // Profil-Header
    '<div class="pf-section">' +
    '<div class="pf-user-row"><div class="pf-avatar">' + escapeHtml(initial) + '</div>' +
    '<div><div class="pf-username">' + escapeHtml(nm) + '</div>' +
    '<div class="pf-email">' + escapeHtml(u.email || '') + '</div>' +
    '<div class="pf-badge">' + providerLabel + '</div></div></div>' +
    '</div>' +

    // Übersicht
    '<div class="pf-section">' +
    '<div class="pf-label">Übersicht</div>' +
    '<div class="pf-stat-grid">' +
    '<div class="pf-stat-box"><div class="pf-stat-num">' + gameCount + '</div><div class="pf-stat-lbl">Spiele</div></div>' +
    '<div class="pf-stat-box"><div class="pf-stat-num">' + (gameCount ? bestPct + '%' : '—') + '</div><div class="pf-stat-lbl">Beste Quote</div></div>' +
    '<div class="pf-stat-box"><div class="pf-stat-num">' + daysSince + '</div><div class="pf-stat-lbl">Tage dabei</div></div>' +
    '</div></div>' +

    // Bestscores
    '<div class="pf-section">' +
    '<div class="pf-label">Bestscores</div>' +
    '<div class="pf-card">' + _renderScores(scores) + '</div></div>' +

    // Schwachstellen
    '<div class="pf-section">' +
    '<div class="pf-label">Schwachstellen</div>' +
    _renderWeakSection(misses) +
    '</div>' +

    // Konto-Details
    '<div class="pf-section">' +
    '<div class="pf-label">Konto-Details</div>' +
    '<div class="pf-card">' +
    '<div class="pf-info-row"><span class="pf-info-key">Dabei seit</span><span class="pf-info-val">' + since + '</span></div>' +
    '<div class="pf-info-row"><span class="pf-info-key">Zuletzt gespielt</span><span class="pf-info-val">' + lastPlay + '</span></div>' +
    '<div class="pf-info-row"><span class="pf-info-key">Anmeldung</span><span class="pf-info-val">' + (provider === 'google.com' ? 'Google' : 'E-Mail') + '</span></div>' +
    '</div>' +
    (provider !== 'google.com' ? '<button class="pf-action-btn" onclick="pfChangePassword()">Passwort ändern</button>' : '') +
    '<button class="pf-danger-btn" onclick="pfDeleteAccount()">Konto löschen</button>' +
    '</div>';
}

function _lastPlayedDate() {
  const scores = _store.scores || {};
  const entries = Object.values(scores).filter(s => s.ts);
  if (!entries.length) return '—';
  const ts = Math.max(...entries.map(s => s.ts));
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Heute';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Gestern';
  return d.toLocaleDateString('de-DE', {day:'2-digit', month:'long', year:'numeric'});
}

function _scoreLabel(key) {
  const icons = { map:'🌍', flag:'🚩', pin:'📍', city:'🏙', river:'🌊', lake:'🔵' };
  const names = { world:'Welt', EU:'Europa', AF:'Afrika', AS:'Asien', NA:'Nordamerika', SA:'Südamerika', OC:'Ozeanien',
    beginner:'Anfänger', easy:'Leicht', medium:'Mittel', hard:'Schwer' };
  const [type, sub] = key.split(':');
  return (icons[type] || '') + ' ' + (names[sub] || sub || '');
}

function _renderScores(scores) {
  const entries = Object.entries(scores).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
  if (!entries.length) return '<div style="font-size:12px;color:#555;text-align:center;padding:8px;">Noch keine Spiele absolviert.</div>';
  return entries.map(([key, s]) => {
    const isPts = key.startsWith('pin:');
    const val = isPts ? (s.score || 0) + ' Pkt' : (s.pct || 0) + '%';
    const barW = isPts ? Math.round(Math.min(100, (s.score || 0) / 1000 * 100)) : (s.pct || 0);
    return '<div class="pf-hs-row"><span class="pf-hs-name">' + _scoreLabel(key) + '</span>' +
      '<div class="pf-hs-right"><span class="pf-hs-pct">' + val + '</span>' +
      '<div class="pf-bar-wrap"><div class="pf-bar" style="width:' + barW + '%"></div></div></div></div>';
  }).join('');
}

function _renderWeakSection(misses) {
  const tabs = [
    {key:'country', label:'Länder'},
    {key:'flag', label:'Flaggen'},
    {key:'city', label:'Städte'},
    {key:'river', label:'Flüsse'},
    {key:'lake', label:'Seen'}
  ];
  const hasData = tabs.some(tab => Object.keys(misses).some(k => k.startsWith(tab.key + ':')));
  if (!hasData) return '<div class="pf-card" style="font-size:12px;color:#555;text-align:center;padding:8px;">Noch keine Fehler aufgezeichnet.</div>';

  const tabsHtml = '<div class="pf-tabs">' + tabs.map(tab => {
    const count = Object.keys(misses).filter(k => k.startsWith(tab.key + ':')).length;
    if (!count) return '';
    return '<button class="pf-tab' + (tab.key === _pfWeakTab ? ' active' : '') + '" onclick="pfSwitchWeakTab(\'' + tab.key + '\')">' + tab.label + '</button>';
  }).join('') + '</div>';

  return tabsHtml + '<div class="pf-card" id="pf-weak-list">' + _renderWeakList(misses) + '</div>';
}

function _renderWeakList(misses) {
  const prefix = _pfWeakTab + ':';
  const entries = Object.entries(misses)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => [k.slice(prefix.length), v])
    .sort((a, b) => b[1] - a[1]);

  if (!entries.length) return '<div style="font-size:12px;color:#555;text-align:center;padding:8px;">Keine Fehler in dieser Kategorie.</div>';

  const shown = _pfWeakShowAll ? entries : entries.slice(0, 5);
  const rows = shown.map(([rawKey, count]) => {
    let name = rawKey;
    if (_pfWeakTab === 'country' || _pfWeakTab === 'flag') {
      const id = parseInt(rawKey);
      if (typeof C !== 'undefined' && C[id]) name = lang === 'de' ? C[id].de : C[id].en;
    }
    return '<div class="pf-weak-row"><span class="pf-weak-name">' + escapeHtml(name) + '</span><span class="pf-weak-count">' + count + '× falsch</span></div>';
  }).join('');

  const showAllBtn = !_pfWeakShowAll && entries.length > 5
    ? '<button class="pf-show-all-btn" onclick="pfShowAllWeak()">Alle ' + entries.length + ' anzeigen</button>'
    : '';
  return rows + showAllBtn;
}

function pfSwitchWeakTab(tab) {
  _pfWeakTab = tab; _pfWeakShowAll = false;
  const misses = _store.misses || {};
  document.getElementById('pf-weak-list').innerHTML = _renderWeakList(misses);
  document.querySelectorAll('.pf-tab').forEach(el => el.classList.toggle('active', el.textContent === {country:'Länder',flag:'Flaggen',city:'Städte',river:'Flüsse',lake:'Seen'}[tab]));
}

function pfShowAllWeak() {
  _pfWeakShowAll = true;
  const misses = _store.misses || {};
  document.getElementById('pf-weak-list').innerHTML = _renderWeakList(misses);
}

async function pfChangePassword() {
  if (!_auth || !window._authUser) return;
  const email = window._authUser.email;
  try {
    await _auth.sendPasswordResetEmail(email);
    alert('Passwort-Reset-E-Mail wurde an ' + email + ' gesendet.');
  } catch (e) { alert('Fehler: ' + (e.message || e)); }
}

async function pfDeleteAccount() {
  if (!confirm('Konto wirklich löschen? Alle Daten gehen verloren. Diese Aktion kann nicht rückgängig gemacht werden.')) return;
  const u = window._authUser;
  if (!u) return;
  try {
    if (_db) {
      await _db.collection('users').doc(u.uid).delete().catch(() => {});
      const username = (_store && _store.settings && _store.settings.username) || u.displayName;
      if (username) await _db.collection('usernames').doc(username.toLowerCase()).delete().catch(() => {});
    }
    await u.delete();
    closeProfile();
  } catch (e) {
    if (e.code === 'auth/requires-recent-login') {
      alert('Bitte melde dich neu an und versuche es dann erneut.');
      authLogout();
    } else { alert('Fehler beim Löschen: ' + (e.message || e)); }
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('profile-modal')?.style.display !== 'none') closeProfile();
    if (document.getElementById('impressum-modal')?.style.display !== 'none') closeImpressum();
    if (document.getElementById('datenschutz-modal')?.style.display !== 'none') closeDatenschutz();
  }
});
