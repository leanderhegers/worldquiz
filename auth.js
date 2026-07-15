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
let _store = { settings: {}, scores: {}, misses: {}, correct: {}, achievements: {} };
let _missTimer = null;

function _loadLocal() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch (e) { return null; } }
function _saveLocal() { try { localStorage.setItem(STORE_KEY, JSON.stringify(_store)); } catch (e) {} }
function _persist() {
  if (_auth && _auth.currentUser && _db) {
    _db.collection('users').doc(_auth.currentUser.uid)
      .set({ settings: _store.settings, scores: _store.scores, misses: _store.misses, correct: _store.correct, achievements: _store.achievements || {}, streak: _store.streak || 0, lastPlayDay: _store.lastPlayDay || '', customPlayed: _store.customPlayed || false }, { merge: true })
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
      _store = { settings: d.settings || {}, scores: d.scores || {}, misses: d.misses || {}, correct: d.correct || {}, achievements: d.achievements || {}, streak: d.streak || 0, lastPlayDay: d.lastPlayDay || '', customPlayed: d.customPlayed || false };
    } catch (e) { console.warn('Firestore-Laden fehlgeschlagen', e); _store = { settings: {}, scores: {}, misses: {}, correct: {}, achievements: {} }; }
  } else {
    _store = _loadLocal() || { settings: {}, scores: {}, misses: {}, correct: {}, achievements: {} };
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
  if (better) {
    if (prev) _store._justImproved = true;
    _store.scores[key] = { score, total, pct, ts: Date.now() };
    _persist();
  }
  return better;
}

// Beim ersten Laden (vor onAuthStateChanged) lokale Daten verfügbar machen
_store = _loadLocal() || { settings: {}, scores: {}, misses: {}, correct: {}, achievements: {} };
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

// ── ACHIEVEMENT SYSTEM ──
const ACH_DEFS = [
  // ── Meilensteine (milestones) ──
  {id:'first_game',cat:'milestones',icon:'🎮',de:'Erstes Spiel',en:'First Game',desc_de:'Schließe dein erstes Quiz ab.',desc_en:'Complete your first quiz.',check:s=>Object.keys(s.scores).length>=1},
  {id:'games_5',cat:'milestones',icon:'⭐',de:'Stammgast',en:'Regular',desc_de:'Schließe 5 verschiedene Quizzes ab.',desc_en:'Complete 5 different quizzes.',check:s=>Object.keys(s.scores).length>=5},
  {id:'games_10',cat:'milestones',icon:'🌟',de:'Routinier',en:'Veteran',desc_de:'Schließe 10 verschiedene Quizzes ab.',desc_en:'Complete 10 different quizzes.',check:s=>Object.keys(s.scores).length>=10},
  {id:'games_25',cat:'milestones',icon:'💫',de:'Quizmaster',en:'Quizmaster',desc_de:'Schließe 25 verschiedene Quizzes ab.',desc_en:'Complete 25 different quizzes.',check:s=>Object.keys(s.scores).length>=25},
  {id:'perfect',cat:'milestones',icon:'💯',de:'Perfektionist',en:'Perfectionist',desc_de:'Erreiche 100% in einem Quiz.',desc_en:'Score 100% in any quiz.',check:s=>Object.values(s.scores).some(v=>v.pct===100)},
  {id:'pct90_5',cat:'milestones',icon:'🏅',de:'Konstant gut',en:'Consistent',desc_de:'Erreiche 90%+ in 5 verschiedenen Quizzes.',desc_en:'Score 90%+ in 5 different quizzes.',check:s=>Object.values(s.scores).filter(v=>v.pct>=90).length>=5},
  {id:'all_modes',cat:'milestones',icon:'🎯',de:'Allrounder',en:'All-rounder',desc_de:'Spiele jede Spielart mindestens einmal (Karte, Flagge, Pin, Hauptstadt).',desc_en:'Play every game mode at least once (Map, Flag, Pin, Capital).',check:s=>{const k=Object.keys(s.scores);return['map:','flag:','pin:','iq:capital:'].every(p=>k.some(x=>x.startsWith(p)||x.startsWith('iq:flag:')));}},

  // ── Regionen (regions) ──
  {id:'eu_master',cat:'regions',icon:'🇪🇺',de:'Europa-Kenner',en:'Europe Expert',desc_de:'Erreiche 90%+ im Europa-Kartenquiz (alle Länder).',desc_en:'Score 90%+ in the Europe map quiz (all countries).',check:s=>{const e=s.scores['map:EU'];return e&&e.pct>=90&&typeof C!=='undefined'&&e.total>=Object.values(C).filter(v=>v.c==='EU').length;}},
  {id:'af_master',cat:'regions',icon:'🌍',de:'Afrika-Kenner',en:'Africa Expert',desc_de:'Erreiche 90%+ im Afrika-Kartenquiz (alle Länder).',desc_en:'Score 90%+ in the Africa map quiz (all countries).',check:s=>{const e=s.scores['map:AF'];return e&&e.pct>=90&&typeof C!=='undefined'&&e.total>=Object.values(C).filter(v=>v.c==='AF').length;}},
  {id:'as_master',cat:'regions',icon:'🌏',de:'Asien-Kenner',en:'Asia Expert',desc_de:'Erreiche 90%+ im Asien-Kartenquiz (alle Länder).',desc_en:'Score 90%+ in the Asia map quiz (all countries).',check:s=>{const e=s.scores['map:AS'];return e&&e.pct>=90&&typeof C!=='undefined'&&e.total>=Object.values(C).filter(v=>v.c==='AS').length;}},
  {id:'na_master',cat:'regions',icon:'🌎',de:'Nordamerika-Kenner',en:'N. America Expert',desc_de:'Erreiche 90%+ im Nordamerika-Kartenquiz (alle Länder).',desc_en:'Score 90%+ in the N. America map quiz (all countries).',check:s=>{const e=s.scores['map:NA'];return e&&e.pct>=90&&typeof C!=='undefined'&&e.total>=Object.values(C).filter(v=>v.c==='NA').length;}},
  {id:'sa_master',cat:'regions',icon:'🌎',de:'Südamerika-Kenner',en:'S. America Expert',desc_de:'Erreiche 90%+ im Südamerika-Kartenquiz (alle Länder).',desc_en:'Score 90%+ in the S. America map quiz (all countries).',check:s=>{const e=s.scores['map:SA'];return e&&e.pct>=90&&typeof C!=='undefined'&&e.total>=Object.values(C).filter(v=>v.c==='SA').length;}},
  {id:'oc_master',cat:'regions',icon:'🌊',de:'Ozeanien-Kenner',en:'Oceania Expert',desc_de:'Erreiche 90%+ im Ozeanien-Kartenquiz (alle Länder).',desc_en:'Score 90%+ in the Oceania map quiz (all countries).',check:s=>{const e=s.scores['map:OC'];return e&&e.pct>=90&&typeof C!=='undefined'&&e.total>=Object.values(C).filter(v=>v.c==='OC').length;}},
  {id:'world_master',cat:'regions',icon:'🗺️',de:'Weltmeister',en:'World Champion',desc_de:'Erreiche 90%+ im Welt-Kartenquiz (alle Länder).',desc_en:'Score 90%+ in the World map quiz (all countries).',check:s=>{const e=s.scores['map:world'];return e&&e.pct>=90&&typeof C!=='undefined'&&e.total>=Object.keys(C).length;},rare:true},
  {id:'all_continents',cat:'regions',icon:'✨',de:'Globetrotter',en:'Globetrotter',desc_de:'Erreiche 90%+ auf allen Kontinenten (alle Länder).',desc_en:'Score 90%+ on all continents (all countries).',check:s=>{if(typeof C==='undefined')return false;return['EU','AF','AS','NA','SA','OC'].every(r=>{const e=s.scores['map:'+r];return e&&e.pct>=90&&e.total>=Object.values(C).filter(v=>v.c===r).length;});},rare:true},

  // ── Spezialisten (specialists) ──
  {id:'flag_starter',cat:'specialists',icon:'🚩',de:'Flaggen-Lehrling',en:'Flag Apprentice',desc_de:'Schließe ein Flaggenquiz ab.',desc_en:'Complete a flag quiz.',check:s=>Object.keys(s.scores).some(k=>k.startsWith('iq:flag:'))},
  {id:'flag_expert',cat:'specialists',icon:'🏴',de:'Flaggen-Experte',en:'Flag Expert',desc_de:'Erreiche 90%+ in einem Flaggenquiz.',desc_en:'Score 90%+ in a flag quiz.',check:s=>Object.entries(s.scores).some(([k,v])=>k.startsWith('iq:flag:')&&v.pct>=90)},
  {id:'cap_starter',cat:'specialists',icon:'🏛️',de:'Hauptstadt-Lehrling',en:'Capital Apprentice',desc_de:'Schließe ein Hauptstadtquiz ab.',desc_en:'Complete a capital quiz.',check:s=>Object.keys(s.scores).some(k=>k.startsWith('iq:capital:'))},
  {id:'cap_expert',cat:'specialists',icon:'👑',de:'Hauptstadt-Experte',en:'Capital Expert',desc_de:'Erreiche 90%+ in einem Hauptstadtquiz.',desc_en:'Score 90%+ in a capital quiz.',check:s=>Object.entries(s.scores).some(([k,v])=>k.startsWith('iq:capital:')&&v.pct>=90)},
  {id:'pin_starter',cat:'specialists',icon:'📍',de:'Pin-Lehrling',en:'Pin Apprentice',desc_de:'Schließe ein Lokalisierungsquiz ab.',desc_en:'Complete a pin quiz.',check:s=>Object.keys(s.scores).some(k=>k.startsWith('pin:'))},
  {id:'pin_expert',cat:'specialists',icon:'🎯',de:'Pin-Scharfschütze',en:'Pin Sharpshooter',desc_de:'Erreiche 80%+ in einem Pin-Quiz.',desc_en:'Score 80%+ in a pin quiz.',check:s=>Object.entries(s.scores).some(([k,v])=>k.startsWith('pin:')&&v.pct>=80)},
  {id:'outline_starter',cat:'specialists',icon:'🔲',de:'Umriss-Kenner',en:'Outline Learner',desc_de:'Schließe ein Umrissquiz ab.',desc_en:'Complete an outline quiz.',check:s=>Object.keys(s.scores).some(k=>k.startsWith('iq:outline:'))},
  {id:'river_starter',cat:'specialists',icon:'🌊',de:'Fluss-Entdecker',en:'River Explorer',desc_de:'Schließe ein Fluss-Quiz ab.',desc_en:'Complete a river quiz.',check:s=>Object.keys(s.scores).some(k=>k.startsWith('river:'))},
  {id:'lake_starter',cat:'specialists',icon:'💧',de:'Seen-Entdecker',en:'Lake Explorer',desc_de:'Schließe ein Seen-Quiz ab.',desc_en:'Complete a lake quiz.',check:s=>Object.keys(s.scores).some(k=>k.startsWith('lake:'))},
  {id:'city_starter',cat:'specialists',icon:'🏙️',de:'Stadt-Entdecker',en:'City Explorer',desc_de:'Schließe ein Städte-Quiz ab.',desc_en:'Complete a city quiz.',check:s=>Object.keys(s.scores).some(k=>k.startsWith('city:'))},

  // ── Herausforderungen (challenges) ──
  {id:'custom_mode',cat:'challenges',icon:'⚙️',de:'Kreativkopf',en:'Creative Mind',desc_de:'Starte ein Quiz im Eigenen Modus.',desc_en:'Start a quiz in Custom Mode.',check:s=>!!s.customPlayed},
  {id:'perfect_world',cat:'challenges',icon:'🌐',de:'Weltenkenner',en:'World Scholar',desc_de:'Erreiche 100% im Kartenquiz mit allen 197 Ländern.',desc_en:'Score 100% in the map quiz with all 197 countries.',check:s=>{const e=s.scores['map:world'];return e&&e.pct===100&&typeof C!=='undefined'&&e.total>=Object.keys(C).length;},rare:true},
  {id:'perfect_flags',cat:'challenges',icon:'🏳️‍🌈',de:'Flaggenmeister',en:'Flag Master',desc_de:'Erreiche 100% im Flaggenquiz mit allen Flaggen.',desc_en:'Score 100% in the flag quiz with all flags.',check:s=>{const e=s.scores['iq:flag:world:all'];return e&&e.pct===100&&typeof C!=='undefined'&&e.total>=Object.keys(C).filter(id=>typeof ISO2!=='undefined'&&ISO2[id]).length;},rare:true},
  {id:'streak_3',cat:'challenges',icon:'📅',de:'Dranbleiber',en:'Committed',desc_de:'Spiele an 3 Tagen in Folge.',desc_en:'Play 3 days in a row.',check:s=>(s.streak||0)>=3},
  {id:'streak_5',cat:'challenges',icon:'🔥',de:'Feuereifer',en:'On Fire',desc_de:'Spiele an 5 Tagen in Folge.',desc_en:'Play 5 days in a row.',check:s=>(s.streak||0)>=5},
  {id:'streak_10',cat:'challenges',icon:'💎',de:'Unaufhaltsam',en:'Unstoppable',desc_de:'Spiele an 10 Tagen in Folge.',desc_en:'Play 10 days in a row.',check:s=>(s.streak||0)>=10,rare:true},

  // ── Geheim (secret) ──
  {id:'night_owl',cat:'secret',icon:'🦉',de:'Nachteule',en:'Night Owl',desc_de:'Spiele zwischen 0:00 und 5:00 Uhr.',desc_en:'Play between midnight and 5 AM.',check:s=>{const h=new Date().getHours();return h>=0&&h<5&&Object.keys(s.scores).length>0;},rare:true},
  {id:'no_mistakes',cat:'secret',icon:'🧠',de:'Fehlerfrei',en:'Flawless',desc_de:'Schließe ein Quiz mit 15+ Fragen fehlerfrei ab.',desc_en:'Complete a quiz with 15+ questions and no mistakes.',check:s=>Object.values(s.scores).some(v=>v.pct===100&&v.total>=15),rare:true},
  {id:'comeback',cat:'secret',icon:'🔥',de:'Comeback',en:'Comeback',desc_de:'Verbessere einen bestehenden Score.',desc_en:'Improve an existing score.',check:s=>s._justImproved===true,rare:true},
];

const ACH_CATS = [
  {key:'milestones',de:'Meilensteine',en:'Milestones',icon:'🏆'},
  {key:'regions',de:'Regionen',en:'Regions',icon:'🗺️'},
  {key:'specialists',de:'Spezialisten',en:'Specialists',icon:'🎓'},
  {key:'challenges',de:'Herausforderungen',en:'Challenges',icon:'🏋️'},
  {key:'secret',de:'Geheim',en:'Secret',icon:'🔮'},
];

function _todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function _yesterdayStr() { const d = new Date(); d.setDate(d.getDate()-1); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }

function updateStreak() {
  const today = _todayStr();
  if (_store.lastPlayDay === today) return false;
  const prev = _store.streak || 0;
  if (_store.lastPlayDay === _yesterdayStr()) {
    _store.streak = prev + 1;
  } else {
    _store.streak = 1;
  }
  _store.lastPlayDay = today;
  _persist();
  return true;
}

function triggerStreakOnPlay() {
  const increased = updateStreak();
  if (increased && _store.streak > 0) {
    const isDE = typeof lang === 'undefined' || lang !== 'en';
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.innerHTML = '<span class="ach-toast-icon">🔥</span><div><div class="ach-toast-title">' + (isDE ? 'Tages-Streak' : 'Daily Streak') + '</div><div class="ach-toast-name">' + _store.streak + ' ' + (isDE ? (_store.streak === 1 ? 'Tag' : 'Tage') : (_store.streak === 1 ? 'day' : 'days')) + '</div></div>';
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3000);
  }
}

function markCustomPlayed() {
  if (!_store.customPlayed) { _store.customPlayed = true; _persist(); }
}

function checkAchievements() {
  if (!_store.achievements) _store.achievements = {};
  updateStreak();
  let newlyUnlocked = [];
  ACH_DEFS.forEach(a => {
    if (_store.achievements[a.id]) return;
    try {
      if (a.check(_store)) {
        _store.achievements[a.id] = Date.now();
        newlyUnlocked.push(a);
      }
    } catch(e) {}
  });
  delete _store._justImproved;
  if (newlyUnlocked.length > 0) {
    _persist();
    newlyUnlocked.forEach(a => _showAchToast(a));
  }
  return newlyUnlocked;
}

let _achToastQueue = [], _achToastActive = false;

function _showAchToast(a) {
  _achToastQueue.push(a);
  if (!_achToastActive) _processAchToastQueue();
}

function _processAchToastQueue() {
  if (!_achToastQueue.length) { _achToastActive = false; return; }
  _achToastActive = true;
  const a = _achToastQueue.shift();
  const name = (typeof lang !== 'undefined' && lang === 'en') ? a.en : a.de;
  const el = document.createElement('div');
  el.className = 'ach-toast';
  el.innerHTML = '<span class="ach-toast-icon">' + a.icon + '</span><div><div class="ach-toast-title">Achievement!</div><div class="ach-toast-name">' + escapeHtml(name) + '</div></div>';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.remove(); _processAchToastQueue(); }, 400);
  }, 3000);
}

// ── SPIELERPROFIL ──
let _pfWeakTab = 'country', _pfWeakShowAll = false, _pfTab = 'overview';

function openProfile() {
  if (!window._authUser) { openAuth('login'); return; }
  _pfWeakTab = 'country'; _pfWeakShowAll = false; _pfTab = 'overview';
  renderProfile();
  document.getElementById('profile-modal').style.display = 'flex';
}
function closeProfile() {
  document.getElementById('profile-modal').style.display = 'none';
}

function pfSwitchTab(tab) {
  _pfTab = tab;
  renderProfile();
  const box = document.querySelector('.profile-box');
  if (box) box.scrollTop = 0;
}

function renderProfile() {
  const u = window._authUser;
  if (!u) return;
  const nm = u.displayName || u.email || '?';
  const initial = nm.charAt(0).toUpperCase();
  const provider = u.providerData && u.providerData[0] ? u.providerData[0].providerId : 'password';
  const providerLabel = provider === 'google.com' ? '🔑 Google-Konto' : '✉ E-Mail-Konto';
  const isDE = typeof lang === 'undefined' || lang !== 'en';

  const tabs = [
    {key:'overview', label: isDE ? 'Übersicht' : 'Overview'},
    {key:'achievements', label: 'Achievements'},
    {key:'stats', label: isDE ? 'Statistiken' : 'Statistics'},
  ];
  const tabsHtml = '<div class="pf-main-tabs">' + tabs.map(t =>
    '<button class="pf-main-tab' + (t.key === _pfTab ? ' active' : '') + '" onclick="pfSwitchTab(\'' + t.key + '\')">' + t.label + '</button>'
  ).join('') + '</div>';

  let body = '';
  if (_pfTab === 'overview') body = _renderOverviewTab(u, nm, initial, provider, providerLabel);
  else if (_pfTab === 'achievements') body = _renderAchievementsTab();
  else if (_pfTab === 'stats') body = _renderStatsTab(u, provider);

  document.getElementById('profile-content').innerHTML =
    '<div class="pf-section">' +
    '<div class="pf-user-row"><div class="pf-avatar">' + escapeHtml(initial) + '</div>' +
    '<div><div class="pf-username">' + escapeHtml(nm) + '</div>' +
    '<div class="pf-email">' + escapeHtml(u.email || '') + '</div>' +
    '<div class="pf-badge">' + providerLabel + '</div></div></div>' +
    '</div>' + tabsHtml + body;
}

function _renderOverviewTab(u, nm, initial, provider, providerLabel) {
  const scores = _store.scores || {};
  const gameCount = Object.keys(scores).length;
  const bestPct = gameCount ? Math.max(...Object.values(scores).map(s => s.pct || 0)) : 0;
  const daysSince = u.metadata && u.metadata.creationTime ? Math.max(1, Math.round((Date.now() - new Date(u.metadata.creationTime)) / 86400000)) : 0;
  const isDE = typeof lang === 'undefined' || lang !== 'en';

  const unlocked = ACH_DEFS.filter(a => _store.achievements && _store.achievements[a.id]).length;
  const total = ACH_DEFS.length;

  return '<div class="pf-section">' +
    '<div class="pf-stat-grid">' +
    '<div class="pf-stat-box"><div class="pf-stat-num">' + gameCount + '</div><div class="pf-stat-lbl">' + (isDE?'Spiele':'Games') + '</div></div>' +
    '<div class="pf-stat-box"><div class="pf-stat-num">' + (gameCount ? bestPct + '%' : '—') + '</div><div class="pf-stat-lbl">' + (isDE?'Beste Quote':'Best Score') + '</div></div>' +
    '<div class="pf-stat-box"><div class="pf-stat-num">' + (_store.streak || 0) + ' 🔥</div><div class="pf-stat-lbl">Streak</div></div>' +
    '<div class="pf-stat-box"><div class="pf-stat-num">' + daysSince + '</div><div class="pf-stat-lbl">' + (isDE?'Tage dabei':'Days') + '</div></div>' +
    '</div></div>' +
    '<div class="pf-section">' +
    '<div class="pf-label">' + (isDE?'Achievements':'Achievements') + '</div>' +
    '<div class="pf-ach-mini">' +
    '<div class="pf-ach-mini-bar"><div class="pf-ach-mini-fill" style="width:' + (total?Math.round(unlocked/total*100):0) + '%"></div></div>' +
    '<span class="pf-ach-mini-lbl">' + unlocked + '/' + total + '</span>' +
    '</div></div>' +
    '<div class="pf-section">' +
    '<div class="pf-label">Bestscores</div>' +
    '<div class="pf-card">' + _renderScores(scores) + '</div></div>';
}

function _renderAchievementsTab() {
  const achs = _store.achievements || {};
  const unlocked = ACH_DEFS.filter(a => achs[a.id]).length;
  const total = ACH_DEFS.length;
  const isDE = typeof lang === 'undefined' || lang !== 'en';

  let html = '<div class="pf-section">' +
    '<div class="pf-ach-progress">' +
    '<div class="pf-ach-progress-text">' + unlocked + ' / ' + total + ' ' + (isDE?'freigeschaltet':'unlocked') + '</div>' +
    '<div class="pf-ach-bar"><div class="pf-ach-bar-fill" style="width:' + (total?Math.round(unlocked/total*100):0) + '%"></div></div>' +
    '</div></div>';

  ACH_CATS.forEach(cat => {
    const items = ACH_DEFS.filter(a => a.cat === cat.key);
    const catUnlocked = items.filter(a => achs[a.id]).length;
    const isOpen = _achOpenCats && _achOpenCats[cat.key];
    html += '<div class="ach-cat' + (isOpen ? ' open' : '') + '">' +
      '<button class="ach-cat-head" onclick="achToggleCat(\'' + cat.key + '\')">' +
      '<span>' + cat.icon + ' ' + (isDE ? cat.de : cat.en) + '</span>' +
      '<span class="ach-cat-count">' + catUnlocked + '/' + items.length + ' <span class="ach-cat-arrow">' + (isOpen?'▲':'▼') + '</span></span>' +
      '</button>';
    if (isOpen) {
      html += '<div class="ach-grid">';
      items.forEach(a => {
        const done = !!achs[a.id];
        const name = isDE ? a.de : a.en;
        const desc = isDE ? a.desc_de : a.desc_en;
        const date = done ? new Date(achs[a.id]).toLocaleDateString(isDE?'de-DE':'en-US',{day:'2-digit',month:'short',year:'numeric'}) : '';
        html += '<div class="ach-item' + (done ? ' unlocked' : ' locked') + (a.rare ? ' rare' : '') + '"' +
          ' data-ach-name="' + escapeHtml(name) + '"' +
          ' data-ach-desc="' + escapeHtml(desc) + '"' +
          (done ? ' data-ach-date="' + date + '"' : '') +
          ' tabindex="0">' +
          '<span class="ach-icon">' + a.icon + '</span>' +
          '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
  });

  return html;
}

let _achOpenCats = {milestones:true};

function achToggleCat(key) {
  if (!_achOpenCats) _achOpenCats = {};
  _achOpenCats[key] = !_achOpenCats[key];
  renderProfile();
}

// Floating tooltip for achievements (escapes overflow:auto clipping)
function _ensureAchTooltip() {
  let tt = document.getElementById('ach-floating-tt');
  if (!tt) {
    tt = document.createElement('div');
    tt.id = 'ach-floating-tt';
    document.body.appendChild(tt);
  }
  return tt;
}

function _showAchTT(el) {
  const tt = _ensureAchTooltip();
  const name = el.dataset.achName;
  const desc = el.dataset.achDesc;
  const date = el.dataset.achDate;
  if (!name) return;
  tt.innerHTML = '<div class="ach-tt-name">' + name + '</div>' +
    '<div class="ach-tt-desc">' + desc + '</div>' +
    (date ? '<div class="ach-tt-date">' + date + '</div>' : '');
  tt.classList.add('visible');
  const r = el.getBoundingClientRect();
  tt.style.left = '0'; tt.style.top = '0';
  const ttW = tt.offsetWidth, ttH = tt.offsetHeight;
  let left = r.left + r.width / 2 - ttW / 2;
  let top = r.bottom + 8;
  if (top + ttH > window.innerHeight) top = r.top - ttH - 8;
  if (left < 8) left = 8;
  if (left + ttW > window.innerWidth - 8) left = window.innerWidth - 8 - ttW;
  tt.style.left = left + 'px';
  tt.style.top = top + 'px';
}

function _hideAchTT() {
  const tt = document.getElementById('ach-floating-tt');
  if (tt) tt.classList.remove('visible');
}

document.addEventListener('mouseover', function(e) {
  const item = e.target.closest('.ach-item');
  if (item) _showAchTT(item); else _hideAchTT();
});
document.addEventListener('mouseout', function(e) {
  const item = e.target.closest('.ach-item');
  if (item && !item.contains(e.relatedTarget)) _hideAchTT();
});
document.addEventListener('click', function(e) {
  const item = e.target.closest('.ach-item');
  if (item) { _showAchTT(item); } else { _hideAchTT(); }
});
document.addEventListener('scroll', _hideAchTT, true);

function _renderStatsTab(u, provider) {
  const scores = _store.scores || {};
  const misses = _store.misses || {};
  const since = u.metadata && u.metadata.creationTime ? new Date(u.metadata.creationTime).toLocaleDateString('de-DE', {day:'2-digit',month:'long',year:'numeric'}) : '—';
  const lastPlay = _lastPlayedDate();
  const isDE = typeof lang === 'undefined' || lang !== 'en';

  return '<div class="pf-section">' +
    '<div class="pf-label">' + (isDE?'Schwachstellen':'Weaknesses') + '</div>' +
    _renderWeakSection(misses) +
    '</div>' +
    '<div class="pf-section">' +
    '<div class="pf-label">' + (isDE?'Konto-Details':'Account Details') + '</div>' +
    '<div class="pf-card">' +
    '<div class="pf-info-row"><span class="pf-info-key">' + (isDE?'Dabei seit':'Member since') + '</span><span class="pf-info-val">' + since + '</span></div>' +
    '<div class="pf-info-row"><span class="pf-info-key">' + (isDE?'Zuletzt gespielt':'Last played') + '</span><span class="pf-info-val">' + lastPlay + '</span></div>' +
    '<div class="pf-info-row"><span class="pf-info-key">' + (isDE?'Anmeldung':'Sign-in') + '</span><span class="pf-info-val">' + (provider === 'google.com' ? 'Google' : 'E-Mail') + '</span></div>' +
    '</div>' +
    (provider !== 'google.com' ? '<button class="pf-action-btn" onclick="pfChangePassword()">' + (isDE?'Passwort ändern':'Change password') + '</button>' : '') +
    '<button class="pf-danger-btn" onclick="pfDeleteAccount()">' + (isDE?'Konto löschen':'Delete account') + '</button>' +
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
