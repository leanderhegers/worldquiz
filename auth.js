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
let _store = { settings: {}, scores: {}, misses: {} };
let _missTimer = null;

function _loadLocal() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch (e) { return null; } }
function _saveLocal() { try { localStorage.setItem(STORE_KEY, JSON.stringify(_store)); } catch (e) {} }
function _persist() {
  if (_auth && _auth.currentUser && _db) {
    _db.collection('users').doc(_auth.currentUser.uid)
      .set({ settings: _store.settings, scores: _store.scores, misses: _store.misses }, { merge: true })
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
      _store = { settings: d.settings || {}, scores: d.scores || {}, misses: d.misses || {} };
    } catch (e) { console.warn('Firestore-Laden fehlgeschlagen', e); _store = { settings: {}, scores: {}, misses: {} }; }
  } else {
    _store = _loadLocal() || { settings: {}, scores: {}, misses: {} };
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
    el.innerHTML = '<span class="home-acct-name">' + t('loggedIn') + ' <strong>' + escapeHtml(nm) + '</strong></span>' +
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

function renderAuthForm() {
  const reg = _authMode === 'register';
  document.getElementById('auth-title').textContent = reg ? t('registerTitle') : t('loginTitle');
  document.getElementById('auth-username-wrap').style.display = reg ? 'block' : 'none';
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
    'auth/invalid-credential': t('authErrCred')
  };
  return map[c] || t('authErrGeneric');
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
