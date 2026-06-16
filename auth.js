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
  // Phase 2: hier werden später Einstellungen & Highscores geladen
}

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
  document.getElementById('auth-name-wrap').style.display = reg ? 'block' : 'none';
  document.getElementById('auth-name').placeholder = t('authName');
  document.getElementById('auth-email').placeholder = t('authEmail');
  document.getElementById('auth-pw').placeholder = t('authPw');
  document.getElementById('auth-pw').setAttribute('autocomplete', reg ? 'new-password' : 'current-password');
  document.getElementById('auth-submit').textContent = reg ? t('signUp') : t('signIn');
  document.getElementById('auth-switch').textContent = reg ? t('toLogin') : t('toRegister');
  document.getElementById('auth-error').textContent = '';
}

async function submitAuth() {
  if (!FIREBASE_READY || !_auth) { document.getElementById('auth-error').textContent = t('authNotConfigured'); return; }
  const email = document.getElementById('auth-email').value.trim();
  const pw = document.getElementById('auth-pw').value;
  const name = document.getElementById('auth-name').value.trim();
  if (!email || !pw) { document.getElementById('auth-error').textContent = t('authFillAll'); return; }
  const btn = document.getElementById('auth-submit');
  btn.disabled = true; document.getElementById('auth-error').textContent = '';
  try {
    if (_authMode === 'register') {
      const cred = await _auth.createUserWithEmailAndPassword(email, pw);
      if (name) { await cred.user.updateProfile({ displayName: name }); window._authUser = _auth.currentUser; renderAuthUI(window._authUser); }
    } else {
      await _auth.signInWithEmailAndPassword(email, pw);
    }
    closeAuth();
  } catch (e) {
    document.getElementById('auth-error').textContent = authErrMsg(e);
  }
  btn.disabled = false;
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
