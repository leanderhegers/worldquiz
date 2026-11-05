// ── MULTIPLAYER-DUELLE (Flaggen-Quiz, 1 gegen 1 in Echtzeit) ──
// Ein Duell ist eine normale Challenge (_challenge, game.challengeMode) mit fester Fragenliste,
// die über ein Firestore-Dokument duels/{id} geteilt wird. Beide Spieler bekommen dieselben 10
// Flaggen und sehen live den Fortschritt des anderen; Punkte wie in der Challenge
// (_challengeScore: 100 je Treffer im ersten Versuch minus 1 je Sekunde).
//
// Dokument: {players:[a,b], from, fromName, to, toName, mode:'flag', q:[countryIds], ts,
//            status:'invited'|'active'|'declined'|'cancelled'|'finished',
//            p:{[uid]:{pos,ft,done,left,score,ms}}}
// Wichtig: Dokumente lösen NIE von selbst ein Spiel aus. Gestartet wird nur, wenn dieser Spieler
// gerade selbst auf eine Antwort wartet (Herausforderer) oder gerade selbst angenommen hat — sonst
// würde beim Login ein altes "active"-Dokument ein Spiel starten.
const DUEL_ROUNDS=10;
const DUEL_INVITE_TTL=5*60*1000;      // Einladung verfällt nach 5 min
const DUEL_DOC_MAX_AGE=24*3600*1000;  // eigene alte Duelle werden beim Login aufgeräumt
let _duelUnsub=null,_duelDocs={},_duelWaitingId=null,_duelCur=null,_duelBannerId=null,_duelWaitTimer=null,_duelBannerTimer=null;

function _duelDE(){return typeof lang==='undefined'||lang!=='en';}
function _duelMe(){return window._authUser?window._authUser.uid:null;}
function _duelEl(id){return document.getElementById(id);}
function _duelRef(id){return _db.collection('duels').doc(id);}
function _duelEsc(s){return typeof escapeHtml==='function'?escapeHtml(String(s)):String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// ── Live-Abfrage ──
function duelListen(){
  duelStop();
  if(!_db||!_duelMe())return;
  try{
    _duelUnsub=_db.collection('duels').where('players','array-contains',_duelMe()).onSnapshot(snap=>{
      snap.docChanges().forEach(ch=>{
        if(ch.type==='removed'){delete _duelDocs[ch.doc.id];return;}
        const d=ch.doc.data();d.id=ch.doc.id;_duelDocs[d.id]=d;
        _duelHandle(d);
      });
    },err=>console.warn('Duel listener',err));
  }catch(e){console.warn('Duel listen failed',e);}
  setTimeout(_duelCleanup,6000);
}
function duelStop(){
  if(_duelUnsub){try{_duelUnsub();}catch(e){}_duelUnsub=null;}
  _duelDocs={};_duelWaitingId=null;_duelCur=null;
  _duelHideBanner();_duelChip(null);
}
function _duelCleanup(){
  const me=_duelMe();if(!me||!_db)return;
  Object.values(_duelDocs).forEach(d=>{
    if(d.from===me&&Date.now()-(d.ts||0)>DUEL_DOC_MAX_AGE)_duelRef(d.id).delete().catch(()=>{});
  });
}

function _duelHandle(d){
  const me=_duelMe();
  if(d.to===me){
    if(d.status==='invited'){
      if(Date.now()-(d.ts||0)<DUEL_INVITE_TTL&&!_duelCur)_duelShowBanner(d);
    }else if(_duelBannerId===d.id)_duelHideBanner();
  }
  if(d.from===me&&d.id===_duelWaitingId){
    if(d.status==='active'){_duelWaitingId=null;clearTimeout(_duelWaitTimer);_duelBegin(d);}
    else if(d.status==='declined'){_duelWaitingId=null;clearTimeout(_duelWaitTimer);_duelMessage('⚔️',_duelDE()?`${d.toName} hat abgelehnt.`:`${d.toName} declined.`);}
    else if(d.status==='cancelled'){_duelWaitingId=null;clearTimeout(_duelWaitTimer);_duelClose();}
  }
  if(_duelCur&&_duelCur.id===d.id)_duelOnUpdate(d);
}

// ── Einladung senden (Herausforderer) ──
function duelOpenPicker(){
  const fp=window._fpCur;
  if(!fp||!window._authUser)return;
  if(_duelCur||_duelWaitingId){_duelMessage('⚔️',_duelDE()?'Du bist schon in einem Duell.':'You are already in a duel.');return;}
  const de=_duelDE();
  _duelModal(`<h2 class="pf-title" style="padding:0;">⚔️ ${de?'Herausfordern':'Challenge'}</h2>
    <div class="duel-sub">${_duelEsc(fp.name)}</div>
    <div class="duel-mode selected"><span class="duel-mode-ico">🏳️</span>
      <div><div class="duel-mode-name">${de?'Flaggen-Quiz':'Flag quiz'}</div>
      <div class="duel-mode-desc">${de?'10 Flaggen, gleiche Fragen für beide, live gegeneinander':'10 flags, same questions for both, head to head in real time'}</div></div></div>
    <button class="duel-btn primary" onclick="duelSendInvite()">${de?'Einladung senden':'Send invitation'}</button>
    <button class="duel-btn" onclick="_duelClose()">${de?'Abbrechen':'Cancel'}</button>`);
}
async function duelSendInvite(){
  const fp=window._fpCur,me=_duelMe();
  if(!fp||!me||!_db)return;
  const de=_duelDE();
  const pool=Object.keys(C).map(Number).filter(id=>ISO2[id]);
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const q=pool.slice(0,DUEL_ROUNDS);
  _duelModal(`<div class="duel-sub">${de?'Sende Einladung…':'Sending invitation…'}</div>`);
  try{
    const ref=await _db.collection('duels').add({
      players:[me,fp.uid],from:me,fromName:(typeof _myName==='function'?_myName(window._authUser):(window._authUser.displayName||'?')),
      to:fp.uid,toName:fp.name,mode:'flag',q,status:'invited',ts:Date.now(),p:{}
    });
    _duelWaitingId=ref.id;
    _duelModal(`<h2 class="pf-title" style="padding:0;">⚔️ ${de?'Warte auf Antwort':'Waiting for reply'}</h2>
      <div class="duel-sub">${de?`${_duelEsc(fp.name)} muss die Einladung annehmen (die App muss bei ${_duelEsc(fp.name)} geöffnet sein).`:`${_duelEsc(fp.name)} has to accept (the app must be open for them).`}</div>
      <div class="duel-spin"></div>
      <button class="duel-btn" onclick="duelCancelInvite()">${de?'Abbrechen':'Cancel'}</button>`);
    clearTimeout(_duelWaitTimer);
    _duelWaitTimer=setTimeout(()=>{if(_duelWaitingId===ref.id){duelCancelInvite();_duelMessage('⚔️',de?'Keine Antwort — Einladung zurückgezogen.':'No reply — invitation withdrawn.');}},DUEL_INVITE_TTL);
  }catch(e){
    console.warn('Duel invite failed',e);
    _duelMessage('⚠️',de?'Einladung konnte nicht gesendet werden.':'Could not send the invitation.');
  }
}
function duelCancelInvite(){
  const id=_duelWaitingId;_duelWaitingId=null;clearTimeout(_duelWaitTimer);
  if(id&&_db)_duelRef(id).update({status:'cancelled'}).catch(()=>{});
  _duelClose();
}

// ── Einladung erhalten (Banner) ──
function _duelShowBanner(d){
  const de=_duelDE();
  let b=_duelEl('duel-banner');
  if(!b){b=document.createElement('div');b.id='duel-banner';document.body.appendChild(b);}
  _duelBannerId=d.id;
  b.innerHTML=`<div class="duel-banner-text">⚔️ <b>${_duelEsc(d.fromName)}</b> ${de?'fordert dich zum Flaggen-Duell heraus!':'challenges you to a flag duel!'}</div>
    <div class="duel-banner-btns"><button class="duel-btn primary" onclick="duelAccept('${d.id}')">${de?'Annehmen':'Accept'}</button>
    <button class="duel-btn" onclick="duelDecline('${d.id}')">${de?'Ablehnen':'Decline'}</button></div>`;
  b.style.display='flex';
  clearTimeout(_duelBannerTimer);
  _duelBannerTimer=setTimeout(()=>{if(_duelBannerId===d.id)_duelHideBanner();},Math.max(1000,DUEL_INVITE_TTL-(Date.now()-(d.ts||0))));
}
function _duelHideBanner(){
  _duelBannerId=null;clearTimeout(_duelBannerTimer);
  const b=_duelEl('duel-banner');if(b)b.style.display='none';
}
async function duelAccept(id){
  const d=_duelDocs[id];if(!d||!_db)return;
  _duelHideBanner();
  try{
    await _duelRef(id).update({status:'active'});
    d.status='active';
    _duelBegin(d);
  }catch(e){
    console.warn('Duel accept failed',e);
    _duelMessage('⚠️',_duelDE()?'Annehmen hat nicht geklappt — vielleicht wurde die Einladung zurückgezogen.':'Could not accept — the invitation may have been withdrawn.');
  }
}
function duelDecline(id){
  _duelHideBanner();
  if(_db)_duelRef(id).update({status:'declined'}).catch(()=>{});
}

// ── Spielstart ──
async function _duelBegin(d){
  if(_duelCur&&_duelCur.id===d.id)return;
  const me=_duelMe();
  _duelCur={id:d.id,oppUid:d.players.find(x=>x!==me),oppName:d.from===me?d.toName:d.fromName,finished:false};
  _duelHideBanner();
  ['closeFriends','closeFriendProfile','closeProfile'].forEach(f=>{try{if(typeof window[f]==='function')window[f]();}catch(e){}});
  const de=_duelDE(),queue=d.q.map(id=>({type:'flag',id}));
  const cd=(n)=>_duelModal(`<h2 class="pf-title" style="padding:0;">⚔️ ${de?'Duell gegen':'Duel vs.'} ${_duelEsc(_duelCur.oppName)}</h2>
    <div class="duel-count">${n}</div><div class="duel-sub">${de?'Mach dich bereit…':'Get ready…'}</div>`);
  const pre=(typeof _preloadChallengeImages==='function')?_preloadChallengeImages(queue):Promise.resolve();
  for(let n=3;n>=1;n--){cd(n);await new Promise(r=>setTimeout(r,900));}
  await pre;
  if(!_duelCur||_duelCur.id!==d.id)return; // währenddessen abgebrochen
  _duelClose();
  _challenge={queue,pos:0,firstTry:0,total:queue.length,duel:{id:d.id},startTs:Date.now()};
  _startDailyTimer();
  _duelChip(d);
  nextChallengeQuestion();
}

// ── Fortschritt / Ende (werden von app.js aufgerufen) ──
function duelProgress(){
  const me=_duelMe();
  if(!_duelCur||!_challenge||!_challenge.duel||!me||!_db)return;
  _duelRef(_duelCur.id).update({['p.'+me]:{pos:_challenge.pos,ft:_challenge.firstTry,done:false}}).catch(()=>{});
}
function duelShowResult(g){
  const me=_duelMe();
  if(!_duelCur||!me||!_db)return;
  _duelCur.finished=true;_duelCur.score=g.score;_duelCur.ft=g.firstTry;_duelCur.total=g.total;
  _stopDailyTimer();
  _duelChip(null);
  const b=_duelEl('btn-again');if(b)b.style.display='none';
  const s=_duelEl('btn-share');if(s)s.style.display='none';
  const dw=_duelEl('daily-leaderboard-wrap');if(dw)dw.style.display='none';
  _duelRef(_duelCur.id).update({['p.'+me]:{pos:g.total,ft:g.firstTry,done:true,score:g.score,ms:Date.now()-g.startTs}}).catch(()=>{});
  _duelRenderResult(_duelDocs[_duelCur.id]);
}
function duelLeave(){
  const me=_duelMe();
  if(_duelCur&&!_duelCur.finished&&me&&_db){
    _duelRef(_duelCur.id).update({['p.'+me]:{pos:(_challenge&&_challenge.pos)||0,ft:(_challenge&&_challenge.firstTry)||0,done:true,left:true,score:0}}).catch(()=>{});
  }
  _duelCur=null;_duelChip(null);
}

function _duelOnUpdate(d){
  if(!_duelCur)return;
  if(_duelCur.finished){
    _duelRenderResult(d);
    const me=_duelMe(),p=d.p||{};
    if(p[me]&&p[me].done&&p[_duelCur.oppUid]&&p[_duelCur.oppUid].done&&d.status!=='finished')_duelRef(d.id).update({status:'finished'}).catch(()=>{});
  }else _duelChip(d);
}
function _duelRenderResult(d){
  if(!_duelCur||!_duelCur.finished)return;
  const de=_duelDE(),me=_duelMe();
  const op=((d&&d.p)||{})[_duelCur.oppUid]||{};
  const mine=_duelCur.score||0,name=_duelCur.oppName;
  const t=_duelEl('res-title'),e=_duelEl('res-emoji'),l1=_duelEl('res-l1'),l2=_duelEl('res-l2');
  if(!t||!l2)return;
  l1.textContent=`${de?'Du':'You'}: ${_duelCur.ft}/${_duelCur.total} · ${mine} ${de?'Punkte':'points'}`;
  if(op.left){
    e.textContent='🏆';t.textContent=de?'Gewonnen!':'You win!';
    l2.textContent=de?`${name} hat das Duell verlassen.`:`${name} left the duel.`;
  }else if(!op.done){
    e.textContent='⏳';t.textContent=de?`Warte auf ${name}…`:`Waiting for ${name}…`;
    l2.textContent=`${name}: ${op.pos||0}/${_duelCur.total}`;
  }else{
    const os=op.score||0;
    e.textContent=mine>os?'🏆':mine<os?'😬':'🤝';
    t.textContent=mine>os?(de?'Gewonnen!':'You win!'):mine<os?(de?'Verloren':'You lose'):(de?'Unentschieden':'Draw');
    l2.textContent=`${name}: ${op.ft||0}/${_duelCur.total} · ${os} ${de?'Punkte':'points'}`;
  }
}

// ── Gegner-Anzeige im Spiel ──
function _duelChip(d){
  let c=_duelEl('duel-chip');
  if(!d||!_duelCur||_duelCur.finished){if(c)c.style.display='none';return;}
  if(!c){c=document.createElement('div');c.id='duel-chip';document.body.appendChild(c);}
  const de=_duelDE(),op=((d.p||{})[_duelCur.oppUid])||{};
  let txt;
  if(op.left)txt=de?'hat aufgegeben':'gave up';
  else if(op.done)txt=de?`fertig · ${op.score||0} P.`:`done · ${op.score||0} pts`;
  else txt=`${op.pos||0}/${DUEL_ROUNDS} · ${op.ft||0} ✓`;
  c.textContent=`⚔️ ${_duelCur.oppName}: ${txt}`;
  c.style.display='block';
}

// ── kleines Modal (nutzt das Stylesheet der Auth-Dialoge) ──
function _duelModal(html){
  let m=_duelEl('duel-modal');
  if(!m){
    m=document.createElement('div');m.id='duel-modal';m.className='auth-modal';m.style.display='none';
    m.innerHTML='<div class="auth-box duel-box"><div id="duel-modal-content"></div></div>';
    document.body.appendChild(m);
  }
  _duelEl('duel-modal-content').innerHTML=html;
  m.style.display='flex';
}
function _duelClose(){const m=_duelEl('duel-modal');if(m)m.style.display='none';}
function _duelMessage(icon,text){
  _duelModal(`<div class="duel-count" style="font-size:40px">${icon}</div><div class="duel-sub">${_duelEsc(text)}</div>
    <button class="duel-btn primary" onclick="_duelClose()">OK</button>`);
}
