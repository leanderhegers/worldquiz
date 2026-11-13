// ── MULTIPLAYER-DUELLE (2–4 Spieler in Echtzeit: Flaggen-Quiz, Drop-a-Pin Europa) ──
// Ablauf: Einladender wählt Modus + 1–3 Freunde → Lobby (Dokument duels/{id}, status 'lobby') →
// Eingeladene sehen live ein Banner und nehmen an/lehnen ab → Einladender startet → alle bekommen
// dieselben 10 Fragen und sehen live den Fortschritt der anderen → Rangliste am Ende.
//
// Flaggen läuft als normale Challenge (_challenge.duel, gleiche Punkte wie Random/Daily Challenge),
// Pin als normales Drop-a-Pin (game.pinDuel, Punkte wie im Einzelspiel).
//
// Dokument: {players:[uid…≤4], host, names:{uid:name}, mode:'flag'|'pin', q:[…], ts,
//            status:'lobby'|'active'|'finished'|'cancelled', r:{uid:'yes'|'no'}, joined:[uid…],
//            p:{uid:{pos,ft,sc,done,left,score,ms}}}
// Wichtig: Dokumente lösen NIE von selbst ein Spiel aus. Gestartet wird nur, wenn dieser Spieler
// gerade selbst in der Lobby sitzt (als Einladender oder nach Annehmen) — sonst würde beim Login
// ein altes "active"-Dokument ein Spiel starten. Alte 1:1-Dokumente (ohne `host`) werden ignoriert.
const DUEL_ROUNDS=10;
const DUEL_MAX_PLAYERS=4;
const DUEL_INVITE_TTL=5*60*1000;      // Lobby/Einladung verfällt nach 5 min
const DUEL_DOC_MAX_AGE=24*3600*1000;  // eigene alte Duelle werden beim Login aufgeräumt
let _duelUnsub=null,_duelDocs={},_duelLobbyId=null,_duelCur=null,_duelBannerId=null,_duelWaitTimer=null,_duelBannerTimer=null;
let _duelSelMode='flag',_duelSel=new Set(),_duelFriendList=[];

function _duelDE(){return typeof lang==='undefined'||lang!=='en';}
function _duelMe(){return window._authUser?window._authUser.uid:null;}
function _duelEl(id){return document.getElementById(id);}
function _duelRef(id){return _db.collection('duels').doc(id);}
function _duelEsc(s){return typeof escapeHtml==='function'?escapeHtml(String(s)):String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
// Alle Spielarten des Multiplayers. diff: Schwierigkeitsstufen wählbar. Ein neuer Modus braucht hier einen Eintrag, einen Pool (_duelPool)
// und – wenn er die Frage-Maschine der Challenges nutzt (Typen country, flag, capital, wappen, language, currency, neighbor) – sonst nichts.
const DUEL_MODES=[
  {k:'flag',ico:'🏳️',de:'Flaggen',en:'Flags',diff:true},
  {k:'map',ico:'🗺️',de:'Länder anklicken',en:'Click countries',diff:true},
  {k:'pin',ico:'📍',de:'Drop a Pin Europa',en:'Drop a Pin Europe'},
  {k:'capital',ico:'🏛️',de:'Hauptstädte',en:'Capitals',diff:true},
  {k:'wappen',ico:'🛡️',de:'Wappen',en:'Coats of arms'},
  {k:'language',ico:'🗣️',de:'Sprachen',en:'Languages'},
  {k:'currency',ico:'💱',de:'Währungen',en:'Currencies'},
  {k:'neighbor',ico:'🧩',de:'Nachbar-Rätsel',en:'Neighbour puzzles'},
  {k:'pie',ico:'🥧',de:'Flaggen-Kuchen',en:'Flag pie',diff:true},
  {k:'path',ico:'🛤️',de:'Kürzester Weg',en:'Shortest path'}
];
const _duelPts=m=>m==='pin'||m==='path'; // Punkte-Modi (statt "x von 10 richtig")
function _duelMode(m){return DUEL_MODES.find(x=>x.k===m)||DUEL_MODES[0];}
function _duelModeName(m,de){const x=_duelMode(m);return de?x.de:x.en;}
// Schwierigkeit (nur Flaggen und Karte): all | easy | medium | hard.
// Flaggen: Leicht = Anfaenger+Einfach, Mittel = Mittel, Schwer = Rest (Stufen aus flagIdsForDifficulty).
// Karte: nach Bevoelkerung in 5 Stufen (DIFFICULTY_TIERS): Leicht = 1+2, Mittel = 3+4, Schwer = 5.
let _duelSelDiff='all';
function _duelDiffName(df,de){return df==='easy'?(de?'Leicht':'Easy'):df==='medium'?(de?'Mittel':'Medium'):df==='hard'?(de?'Schwer':'Hard'):(de?'Alle':'All');}
function _duelTitle(d,de){const m=_duelModeName(d.mode,de);return(d.diff&&d.diff!=='all'&&_duelMode(d.mode).diff)?m+' · '+_duelDiffName(d.diff,de):m;}
function _duelKey(mode,diff){return mode+((diff&&diff!=='all'&&_duelMode(mode).diff)?'_'+diff:'');}
function _duelPool(mode,diff){
  if(mode==='pin')return getPinCities('EU').map(c=>c.name_en);
  if(mode==='map'){
    const T=DIFFICULTY_TIERS;
    const ids=diff==='easy'?T[0].concat(T[1]):diff==='medium'?T[2].concat(T[3]):diff==='hard'?T[4]:Object.keys(C).map(Number);
    return ids.filter(id=>C[id]);
  }
  if(mode==='language')return Object.keys(LANGUAGES);
  if(mode==='currency')return Object.keys(CURRENCIES);
  if(mode==='neighbor')return NEIGHBOR_PUZZLES.map(p=>p.id);
  if(mode==='wappen')return Object.keys(C).map(Number).filter(id=>!WAPPEN_EXCLUDE.has(id));
  if(mode==='capital'){
    const ids=diff==='easy'?flagIdsForDifficulty('beginner').concat(flagIdsForDifficulty('easy')):(diff==='medium'||diff==='hard')?flagIdsForDifficulty(diff):flagIdsForDifficulty('all');
    return ids.filter(id=>CAPITALS[id]);
  }
  if(diff==='easy')return flagIdsForDifficulty('beginner').concat(flagIdsForDifficulty('easy'));
  if(diff==='medium'||diff==='hard')return flagIdsForDifficulty(diff);
  return flagIdsForDifficulty('all');
}
const DUEL_ONLINE_MS=100*1000; // so jung muss lastSeen sein, damit ein Freund als online gilt
function _duelOnline(f){return Date.now()-(f.lastSeen||0)<DUEL_ONLINE_MS;}

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
  _duelDocs={};_duelLobbyId=null;_duelCur=null;
  _duelHideBanner();_duelChip(null);
}
function _duelCleanup(){
  const me=_duelMe();if(!me||!_db)return;
  Object.values(_duelDocs).forEach(d=>{
    if((d.host===me||d.from===me)&&Date.now()-(d.ts||0)>DUEL_DOC_MAX_AGE)_duelRef(d.id).delete().catch(()=>{});
  });
}

function _duelHandle(d){
  if(!d.host)return; // altes 1:1-Format
  const me=_duelMe();
  const answered=!!(d.r&&d.r[me]);
  if(d.host!==me&&d.status==='lobby'&&!answered&&Date.now()-(d.ts||0)<DUEL_INVITE_TTL&&!_duelCur&&!_duelLobbyId)_duelShowBanner(d);
  if(_duelBannerId===d.id&&(d.status!=='lobby'||answered))_duelHideBanner();
  if(_duelLobbyId===d.id){
    if(d.status==='cancelled'){
      _duelLobbyId=null;clearTimeout(_duelWaitTimer);
      if(d.host===me)_duelClose();else _duelMessage('⚔️',_duelDE()?`${(d.names||{})[d.host]||'?'} hat das Duell abgebrochen.`:`${(d.names||{})[d.host]||'?'} cancelled the duel.`);
    }else if(d.status==='active'){
      clearTimeout(_duelWaitTimer);
      if((d.joined||[]).includes(me)){_duelLobbyId=null;_duelBegin(d);}
      else{_duelLobbyId=null;_duelClose();}
    }else if(d.status==='lobby')_duelRenderLobby(d);
  }
  if(_duelCur&&_duelCur.id===d.id)_duelOnUpdate(d);
}

// ── Ziele ziehen, ohne dass sich Ziele schnell wiederholen ──
// Reines Zufallsziehen aus einem kleinen Topf (Pin Europa: 85 Städte) wiederholt sich zwangsläufig
// oft. Darum merkt sich jedes Gerät pro Modus die zuletzt gespielten Ziele (auch aus Duellen, die
// jemand anderes gestartet hat) und zieht erst wieder daraus, wenn der Rest des Topfs nicht mehr
// für ein Duell reicht. Nur lokal gespeichert — geht der Verlauf verloren, ist die Ziehung eben
// wieder rein zufällig.
function _duelRecentGet(mode){try{return JSON.parse(localStorage.getItem('geoquiz_duel_recent_'+mode))||[];}catch(e){return[];}}
function _duelRecentAdd(mode,ids,poolSize){
  try{
    const keep=Math.max(0,poolSize-DUEL_ROUNDS);
    const list=_duelRecentGet(mode).filter(x=>!ids.includes(x)).concat(ids).slice(-keep);
    localStorage.setItem('geoquiz_duel_recent_'+mode,JSON.stringify(list));
  }catch(e){}
}
function _duelDraw(mode,pool){
  const recent=new Set(_duelRecentGet(mode));
  let fresh=pool.filter(x=>!recent.has(x));
  if(fresh.length<DUEL_ROUNDS)fresh=pool.slice(); // Topf (fast) durch: wieder aus allem ziehen
  for(let i=fresh.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[fresh[i],fresh[j]]=[fresh[j],fresh[i]];}
  const pick=fresh.slice(0,DUEL_ROUNDS);
  _duelRecentAdd(mode,pick,pool.length);
  return pick;
}

// ── Einladung zusammenstellen (Hauptmenü oder Freundesprofil) ──
async function duelOpenPicker(preUid){
  if(!window._authUser){if(typeof openAuth==='function')openAuth('login');return;}
  if(_duelCur||_duelLobbyId){_duelMessage('⚔️',_duelDE()?'Du bist schon in einem Duell.':'You are already in a duel.');return;}
  const last=_duelLastGet();
  _duelSel=new Set(preUid?[preUid]:[]);
  if(last.mode&&DUEL_MODES.some(x=>x.k===last.mode))_duelSelMode=last.mode;
  if(last.diff)_duelSelDiff=last.diff;
  const de=_duelDE();
  _duelModal(`<div class="duel-sub">${de?'Lade Freunde…':'Loading friends…'}</div>`);
  try{_duelFriendList=(typeof _loadFriends==='function')?await _loadFriends():[];}catch(e){_duelFriendList=[];}
  // Online zuerst (dann alphabetisch)
  _duelFriendList.sort((x,y)=>(_duelOnline(y)-_duelOnline(x))||String(x.username).localeCompare(String(y.username)));
  if(!preUid&&last.friends)last.friends.filter(u=>_duelFriendList.some(f=>f.uid===u)).slice(0,DUEL_MAX_PLAYERS-1).forEach(u=>_duelSel.add(u)); // wie beim letzten Mal
  if(preUid&&!_duelFriendList.some(f=>f.uid===preUid))_duelSel.delete(preUid);
  _duelRenderPicker();
}
function duelPickMode(m){_duelSelMode=m;_duelRenderPicker();}
function duelPickDiff(df){_duelSelDiff=df;_duelRenderPicker();}
function duelToggleFriend(uid){
  if(_duelSel.has(uid))_duelSel.delete(uid);
  else if(_duelSel.size<DUEL_MAX_PLAYERS-1)_duelSel.add(uid);
  _duelRenderPicker();
}
const DUEL_LAST_KEY='geoquiz_duel_last';
function _duelLastGet(){try{return JSON.parse(localStorage.getItem(DUEL_LAST_KEY))||{};}catch(e){return{};}}
function _duelLastSet(){try{localStorage.setItem(DUEL_LAST_KEY,JSON.stringify({mode:_duelSelMode,diff:_duelSelDiff,friends:[..._duelSel]}));}catch(e){}}
function _duelRenderPicker(){
  const de=_duelDE();
  const tile=x=>`<div class="duel-tile${_duelSelMode===x.k?' selected':''}" onclick="duelPickMode('${x.k}')"><span class="duel-tile-ico">${x.ico}</span><span class="duel-tile-name">${de?x.de:x.en}</span></div>`;
  const full=_duelSel.size>=DUEL_MAX_PLAYERS-1;
  const friends=_duelFriendList.length?_duelFriendList.map(f=>{
    const on=_duelSel.has(f.uid),online=_duelOnline(f);
    return `<div class="duel-friend${on?' selected':''}${(!on&&full)?' disabled':''}${online?'':' offline'}" onclick="duelToggleFriend('${_duelEsc(f.uid)}')">
      <span class="duel-check">${on?'✓':''}</span><span class="duel-av">${_duelEsc((f.username||'?').slice(0,1).toUpperCase())}</span><span style="flex:1;">${_duelEsc(f.username||'?')}</span><span class="duel-dot ${online?'on':'off'}" title="${online?'online':'offline'}"></span></div>`;
  }).join(''):`<div class="duel-sub">${de?'Du hast noch keine Freunde. Füge zuerst Freunde hinzu (👥).':'You have no friends yet. Add some first (👥).'}</div>`;
  const m=_duelMode(_duelSelMode);
  _duelModal(`<div class="duel-head"><h2 class="pf-title" style="padding:0;margin:0;">⚔️ Multiplayer</h2><button class="duel-x" onclick="_duelClose()" aria-label="${de?'Schließen':'Close'}">✕</button></div>
    <div class="duel-cols">
      <div class="duel-col">
        <div class="duel-sec">${de?'Spiel':'Game'}</div>
        <div class="duel-tiles">${DUEL_MODES.map(tile).join('')}</div>
        ${m.diff?`<div class="duel-chips">${['all','easy','medium','hard'].map(df=>`<button class="duel-chip${_duelSelDiff===df?' on':''}" onclick="duelPickDiff('${df}')">${_duelDiffName(df,de)}</button>`).join('')}</div>`:''}
      </div>
      <div class="duel-col">
        <div class="duel-sec">${de?'Mitspieler':'Players'} <span class="duel-sub">${_duelSel.size}/${DUEL_MAX_PLAYERS-1}</span></div>
        <div class="duel-friends tall">${friends}</div>
      </div>
    </div>
    <div class="duel-foot"><button class="duel-btn primary" ${_duelSel.size?'':'disabled'} onclick="duelSendInvite()">${de?'Einladen':'Invite'} · ${_duelModeName(_duelSelMode,de)}</button></div>`,true);
}
async function duelSendInvite(){
  const me=_duelMe();
  if(!me||!_db||!_duelSel.size)return;
  const de=_duelDE(),mode=_duelSelMode||'flag';
  const uids=[..._duelSel].slice(0,DUEL_MAX_PLAYERS-1);
  const names={[me]:(typeof _myName==='function'?_myName(window._authUser):(window._authUser.displayName||'?'))};
  uids.forEach(u=>{const f=_duelFriendList.find(x=>x.uid===u);names[u]=(f&&f.username)||'?';});
  // Flaggen: Länder-IDs. Pin: Stadtnamen (name_en) aus dem europäischen Pool — alle lösen sie über
  // getPinCities('EU') wieder in dieselben Städte auf.
  const diff=_duelMode(mode).diff?(_duelSelDiff||'all'):'all';
  _duelLastSet();
  let picked;
  if(mode==='path'){try{picked=await pathMakePairs(5);}catch(e){picked=[];}if(!picked.length){_duelMessage('⚠️',de?'Die Karte konnte nicht geladen werden.':'Could not load the map.');return;}}
  else picked=_duelDraw(_duelKey(mode,diff),_duelPool(mode,diff));
  _duelModal(`<div class="duel-sub">${de?'Sende Einladung…':'Sending invitation…'}</div>`);
  try{
    const ref=await _db.collection('duels').add({
      players:[me,...uids],host:me,names,mode,diff,q:picked,status:'lobby',ts:Date.now(),r:{[me]:'yes'},p:{},chat:[]
    });
    _duelLobbyId=ref.id;
    clearTimeout(_duelWaitTimer);
    _duelWaitTimer=setTimeout(()=>{if(_duelLobbyId===ref.id){duelCancelLobby();_duelMessage('⚔️',de?'Zeit abgelaufen — Duell abgebrochen.':'Time ran out — duel cancelled.');}},DUEL_INVITE_TTL);
    _duelRenderLobby(_duelDocs[ref.id]||{id:ref.id,host:me,players:[me,...uids],names,mode,r:{[me]:'yes'},status:'lobby'});
  }catch(e){
    console.warn('Duel invite failed',e);
    _duelMessage('⚠️',de?'Einladung konnte nicht gesendet werden.':'Could not send the invitation.');
  }
}

// ── Lobby (Einladender sieht Antworten, Eingeladene warten auf den Start) ──
// Karte bzw. Flaggenbilder schon in der Lobby laden: Auf einem langsamen Gerät/Netz dauerte sonst der
// Countdown + Download erst nach dem Start (beim Einladenden ist beides meist schon im Cache).
let _duelPrefetched=null;
function _duelPrefetch(d){
  if(!d||_duelPrefetched===d.id)return;
  _duelPrefetched=d.id;
  try{
    if(d.mode==='map'){if(!worldData)loadMap().catch(()=>{});}
    else if((d.mode==='flag'||d.mode==='wappen'||d.mode==='pie')&&typeof _preloadChallengeImages==='function')_preloadChallengeImages((d.q||[]).map(id=>({type:d.mode,id})));
  }catch(e){}
}
function _duelChatHtml(d,me){
  const list=(d.chat||[]).slice(-60);
  return list.length?list.map(c=>`<div class="duel-msg${c.u===me?' mine':''}"><span class="duel-msg-n">${_duelEsc(c.n||'?')}</span>${_duelEsc(c.t)}</div>`).join(''):`<div class="duel-sub" style="text-align:center;margin:auto;">${_duelDE()?'Noch keine Nachrichten':'No messages yet'}</div>`;
}
function _duelRenderLobby(d){
  if(!d)return;
  _duelPrefetch(d);
  const me=_duelMe(),de=_duelDE(),isHost=d.host===me;
  const rows=(d.players||[]).map(u=>{
    const st=(d.r||{})[u];
    const lbl=st==='yes'?(de?'dabei':'in'):st==='no'?(de?'abgelehnt':'declined'):(de?'wartet…':'waiting…');
    return `<div class="duel-friend ${st==='yes'?'in':st==='no'?'out':''}"><span class="duel-av">${_duelEsc(((d.names||{})[u]||'?').slice(0,1).toUpperCase())}</span><span style="flex:1;text-align:left;">${_duelEsc((d.names||{})[u]||'?')}${u===d.host?' 👑':''}</span><span class="duel-state ${st||''}">${st==='yes'?'✓ ':st==='no'?'✕ ':'… '}${lbl}</span></div>`;
  }).join('');
  const joined=(d.players||[]).filter(u=>(d.r||{})[u]==='yes').length;
  const foot=isHost
    ?`<button class="duel-btn primary" ${joined>=2?'':'disabled'} onclick="duelStart()">${de?`Starten (${joined} Spieler)`:`Start (${joined} players)`}</button><button class="duel-btn" onclick="duelCancelLobby()">${de?'Abbrechen':'Cancel'}</button>`
    :`<div class="duel-sub" style="flex:1;align-self:center;">${de?`Warte auf ${_duelEsc((d.names||{})[d.host]||'?')} …`:`Waiting for ${_duelEsc((d.names||{})[d.host]||'?')} …`}</div><button class="duel-btn" onclick="duelLeaveLobby()">${de?'Verlassen':'Leave'}</button>`;
  const wrap=_duelEl('duel-lobby');
  if(wrap&&wrap.dataset.id===d.id){ // nur Teile aktualisieren, damit das Chat-Eingabefeld nicht den Fokus verliert
    _duelEl('dl-players').innerHTML=rows;_duelEl('dl-foot').innerHTML=foot;
    const cl=_duelEl('dl-chat'),atEnd=cl.scrollHeight-cl.scrollTop-cl.clientHeight<40;
    cl.innerHTML=_duelChatHtml(d,me);if(atEnd)cl.scrollTop=cl.scrollHeight;
    return;
  }
  _duelModal(`<div class="duel-head"><h2 class="pf-title" style="padding:0;margin:0;">⚔️ ${_duelTitle(d,de)}</h2></div>
    <div id="duel-lobby" data-id="${d.id}" class="duel-cols">
      <div class="duel-col"><div class="duel-sec">${de?'Spieler':'Players'}</div><div class="duel-friends tall" id="dl-players">${rows}</div></div>
      <div class="duel-col"><div class="duel-sec">Chat</div>
        <div class="duel-chat" id="dl-chat">${_duelChatHtml(d,me)}</div>
        <div class="duel-chat-in"><input id="dl-in" maxlength="140" autocomplete="off" placeholder="${de?'Nachricht …':'Message …'}" onkeydown="if(event.key==='Enter')duelChatSend()"><button class="duel-btn primary" onclick="duelChatSend()">➤</button></div>
      </div>
    </div>
    <div class="duel-foot" id="dl-foot">${foot}</div>`,true);
  const cl=_duelEl('dl-chat');if(cl)cl.scrollTop=cl.scrollHeight;
}
function duelChatSend(){
  const inp=_duelEl('dl-in'),id=_duelLobbyId,me=_duelMe();
  if(!inp||!id||!me||!_db)return;
  const t=inp.value.trim().slice(0,140);if(!t)return;
  const d=_duelDocs[id]||{};
  inp.value='';
  _duelRef(id).update({chat:firebase.firestore.FieldValue.arrayUnion({u:me,n:(d.names||{})[me]||'?',t,ts:Date.now()})}).catch(()=>{});
  inp.focus();
}
async function duelStart(){
  const d=_duelDocs[_duelLobbyId];
  if(!d||d.host!==_duelMe()||!_db)return;
  const joined=(d.players||[]).filter(u=>(d.r||{})[u]==='yes');
  if(joined.length<2)return;
  const id=_duelLobbyId;
  try{
    await _duelRef(id).update({status:'active',joined,startedAt:Date.now()});
    _duelLobbyId=null;clearTimeout(_duelWaitTimer);
    _duelBegin({...d,status:'active',joined});
  }catch(e){console.warn('Duel start failed',e);_duelMessage('⚠️',_duelDE()?'Start hat nicht geklappt.':'Could not start.');}
}
function duelCancelLobby(){
  const id=_duelLobbyId;_duelLobbyId=null;clearTimeout(_duelWaitTimer);
  if(id&&_db)_duelRef(id).update({status:'cancelled'}).catch(()=>{});
  _duelClose();
}
function duelLeaveLobby(){
  const id=_duelLobbyId,me=_duelMe();_duelLobbyId=null;clearTimeout(_duelWaitTimer);
  if(id&&_db&&me)_duelRef(id).update({['r.'+me]:'no'}).catch(()=>{});
  _duelClose();
}

// ── Einladung erhalten (Banner) ──
function _duelShowBanner(d){
  const de=_duelDE();
  let b=_duelEl('duel-banner');
  if(!b){b=document.createElement('div');b.id='duel-banner';document.body.appendChild(b);}
  _duelBannerId=d.id;
  const host=_duelEsc((d.names||{})[d.host]||'?');
  const others=(d.players||[]).length-2;
  b.innerHTML=`<div class="duel-banner-text">⚔️ <b>${host}</b> ${de?'fordert dich heraus:':'challenges you:'} ${_duelTitle(d,de)}${others>0?(de?` (+${others} weitere)`:` (+${others} more)`):''}</div>
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
  const d=_duelDocs[id],me=_duelMe();if(!d||!_db||!me)return;
  _duelHideBanner();
  try{
    await _duelRef(id).update({['r.'+me]:'yes'});
    _duelLobbyId=id;
    clearTimeout(_duelWaitTimer);
    _duelWaitTimer=setTimeout(()=>{if(_duelLobbyId===id)duelLeaveLobby();},DUEL_INVITE_TTL);
    const cur=_duelDocs[id]||d;
    cur.r=Object.assign({},cur.r,{[me]:'yes'});
    if(cur.status==='active'&&(cur.joined||[]).includes(me)){_duelLobbyId=null;_duelBegin(cur);}
    else _duelRenderLobby(cur);
  }catch(e){
    console.warn('Duel accept failed',e);
    _duelMessage('⚠️',_duelDE()?'Annehmen hat nicht geklappt — vielleicht wurde die Einladung zurückgezogen.':'Could not accept — the invitation may have been withdrawn.');
  }
}
function duelDecline(id){
  const me=_duelMe();
  _duelHideBanner();
  if(_db&&me)_duelRef(id).update({['r.'+me]:'no'}).catch(()=>{});
}

// ── Spielstart ──
async function _duelBegin(d){
  if(_duelCur&&_duelCur.id===d.id)return;
  const me=_duelMe();
  const mode=DUEL_MODES.some(x=>x.k===d.mode)?d.mode:'flag';
  _duelCur={id:d.id,mode,joined:(d.joined||[]).slice(),names:d.names||{},finished:false};
  if(d.host!==me&&mode!=='path')_duelRecentAdd(_duelKey(mode,d.diff),d.q||[],_duelPool(mode,d.diff).length);
  _duelHideBanner();
  ['closeFriends','closeFriendProfile','closeProfile'].forEach(f=>{try{if(typeof window[f]==='function')window[f]();}catch(e){}});
  const de=_duelDE(),isPin=mode==='pin',isPath=mode==='path';
  const queue=(isPin||isPath)?[]:d.q.map(id=>({type:mode==='map'?'country':mode,id}));
  const cities=isPin?d.q.map(n=>getPinCities('EU').find(c=>c.name_en===n)).filter(Boolean):[];
  const others=_duelCur.joined.filter(u=>u!==me).map(u=>_duelEsc(_duelCur.names[u]||'?')).join(', ');
  const cd=(n)=>_duelModal(`<h2 class="pf-title" style="padding:0;">⚔️ ${_duelTitle({mode,diff:d.diff},de)}</h2>
    <div class="duel-sub">${de?'Gegen':'Against'} ${others}</div>
    <div class="duel-count">${n}</div><div class="duel-sub">${de?'Mach dich bereit…':'Get ready…'}</div>`);
  // Karten-Modus braucht die geladene Weltkarte, Flaggen ihre Bilder — beides läuft während des Countdowns.
  const pre=isPin?Promise.resolve():(mode==='map'||isPath)?(worldData?Promise.resolve():loadMap()):(typeof _preloadChallengeImages==='function'?_preloadChallengeImages(queue):Promise.resolve());
  for(let n=3;n>=1;n--){cd(n);await new Promise(r=>setTimeout(r,900));}
  await pre;
  if(!_duelCur||_duelCur.id!==d.id)return; // währenddessen abgebrochen
  _duelClose();
  if(isPath){
    if(!(d.q||[]).length){_duelCur=null;_duelMessage('⚠️',de?'Die Aufgaben des Duells konnten nicht geladen werden.':'Could not load the duel tasks.');return;}
    _duelCur.rounds=d.q.length;_duelChip(d);
    await startPathGame({pairs:d.q,duel:true});
    return;
  }
  if(isPin){
    if(!cities.length){_duelCur=null;_duelMessage('⚠️',de?'Die Städte des Duells konnten nicht geladen werden.':'Could not load the duel cities.');return;}
    _duelChip(d);
    await startPinGame('EU',cities);
    return;
  }
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
function duelPinProgress(){
  const me=_duelMe();
  if(!_duelCur||_duelCur.mode!=='pin'||!game||!game.pinDuel||!me||!_db)return;
  _duelRef(_duelCur.id).update({['p.'+me]:{pos:game.pinRound||0,sc:game.pinScore||0,done:false}}).catch(()=>{});
}
function duelPathProgress(p){
  const me=_duelMe();
  if(!_duelCur||_duelCur.mode!=='path'||!me||!_db)return;
  _duelRef(_duelCur.id).update({['p.'+me]:{pos:p.round+(p.roundDone?1:0),sc:p.total,done:false}}).catch(()=>{});
}
function duelPathFinish(p){
  const me=_duelMe();
  if(!_duelCur||_duelCur.mode!=='path'||!me||!_db)return;
  showScreen('result-screen');
  const set=(id,txt)=>{const e=_duelEl(id);if(e)e.textContent=txt;};
  set('res-btn-back',t('back'));set('btn-new',t('newgame'));
  _duelCur.finished=true;_duelCur.score=p.total;_duelCur.total=p.pairs.length;_duelCur.rounds=p.pairs.length;
  _duelChip(null);_duelHideResultExtras();
  _duelRef(_duelCur.id).update({['p.'+me]:{pos:p.pairs.length,sc:p.total,done:true,score:p.total}}).catch(()=>{});
  _duelRenderResult(_duelDocs[_duelCur.id]);
}
function _duelHideResultExtras(){
  const b=_duelEl('btn-again');if(b)b.style.display='none';
  const s=_duelEl('btn-share');if(s)s.style.display='none';
  const dw=_duelEl('daily-leaderboard-wrap');if(dw)dw.style.display='none';
}
function duelPinFinish(){
  const me=_duelMe();
  if(!_duelCur||_duelCur.mode!=='pin'||!me||!_db)return;
  _duelCur.finished=true;_duelCur.score=game.pinScore||0;_duelCur.total=game.total||DUEL_ROUNDS;
  _duelCur.avg=game.pinRound?Math.round(game.pinTotalDist/game.pinRound):0;
  _duelChip(null);_duelHideResultExtras();
  _duelRef(_duelCur.id).update({['p.'+me]:{pos:_duelCur.total,sc:_duelCur.score,done:true,score:_duelCur.score}}).catch(()=>{});
  _duelRenderResult(_duelDocs[_duelCur.id]);
}
function duelShowResult(g){
  const me=_duelMe();
  if(!_duelCur||!me||!_db)return;
  _duelCur.finished=true;_duelCur.score=g.score;_duelCur.ft=g.firstTry;_duelCur.total=g.total;
  _stopDailyTimer();
  _duelChip(null);_duelHideResultExtras();
  _duelRef(_duelCur.id).update({['p.'+me]:{pos:g.total,ft:g.firstTry,done:true,score:g.score,ms:Date.now()-g.startTs}}).catch(()=>{});
  _duelRenderResult(_duelDocs[_duelCur.id]);
}
function duelLeave(){
  const me=_duelMe();
  if(_duelCur&&!_duelCur.finished&&me&&_db){
    _duelRef(_duelCur.id).update({['p.'+me]:{pos:(_duelCur.mode==='pin'?(game&&game.pinRound):_duelCur.mode==='path'?(game&&game.fillPath&&game.fillPath.round):(_challenge&&_challenge.pos))||0,done:true,left:true,score:0}}).catch(()=>{});
  }
  _duelCur=null;_duelChip(null);
}

function _duelOnUpdate(d){
  if(!_duelCur)return;
  if(_duelCur.finished){
    _duelRenderResult(d);
    const p=d.p||{};
    if(d.status!=='finished'&&_duelCur.joined.every(u=>p[u]&&p[u].done))_duelRef(d.id).update({status:'finished'}).catch(()=>{});
  }else _duelChip(d);
}
function _duelRenderResult(d){
  if(!_duelCur||!_duelCur.finished)return;
  const de=_duelDE(),me=_duelMe(),p=(d&&d.p)||{};
  const t=_duelEl('res-title'),e=_duelEl('res-emoji'),l1=_duelEl('res-l1'),l2=_duelEl('res-l2');
  if(!t||!l2)return;
  const mine=_duelCur.score||0,isPin=_duelCur.mode==='pin',isPts=_duelPts(_duelCur.mode);
  l1.textContent=isPin?`${de?'Du':'You'}: ${mine} ${de?'Punkte':'points'} · Ø ${_duelCur.avg||0} km`:isPts?`${de?'Du':'You'}: ${mine} ${de?'Punkte':'points'}`:`${de?'Du':'You'}: ${_duelCur.ft}/${_duelCur.total} · ${mine} ${de?'Punkte':'points'}`;
  const others=_duelCur.joined.filter(u=>u!==me).map(u=>({name:_duelCur.names[u]||'?',st:p[u]||{}}));
  const pending=others.filter(o=>!o.st.done);
  l2.innerHTML=others.map(o=>{
    const s=o.st;
    const txt=s.left?(de?'hat aufgegeben':'gave up'):s.done?`${s.score||0} ${de?'Punkte':'points'}`:`${de?'spielt noch':'still playing'} (${s.pos||0}/${_duelCur.total})`;
    return `${_duelEsc(o.name)}: ${txt}`;
  }).join('<br>');
  if(pending.length){e.textContent='⏳';t.textContent=de?'Warte auf die anderen…':'Waiting for the others…';return;}
  const rivals=others.filter(o=>!o.st.left);
  if(!rivals.length){e.textContent='🏆';t.textContent=de?'Gewonnen!':'You win!';return;}
  const better=rivals.filter(o=>(o.st.score||0)>mine).length;
  const tied=rivals.filter(o=>(o.st.score||0)===mine).length;
  const total=others.length+1;
  if(better===0){
    if(tied===0){e.textContent='🏆';t.textContent=de?'Gewonnen!':'You win!';}
    else{e.textContent='🤝';t.textContent=de?'Unentschieden':'Draw';}
  }else{
    const place=better+1;
    e.textContent=place===total?'😬':'🥈';
    t.textContent=total===2?(de?'Verloren':'You lose'):(de?`Platz ${place} von ${total}`:`Place ${place} of ${total}`);
  }
}

// ── Gegner-Anzeige im Spiel ──
function _duelChip(d){
  let c=_duelEl('duel-chip');
  if(!d||!_duelCur||_duelCur.finished){if(c)c.style.display='none';return;}
  if(!c){c=document.createElement('div');c.id='duel-chip';document.body.appendChild(c);}
  const de=_duelDE(),me=_duelMe(),p=d.p||{};
  c.innerHTML=_duelCur.joined.filter(u=>u!==me).map(u=>{
    const op=p[u]||{};
    let txt;
    if(op.left)txt=de?'hat aufgegeben':'gave up';
    else if(op.done)txt=de?`fertig · ${op.score||0} P.`:`done · ${op.score||0} pts`;
    else txt=_duelPts(_duelCur.mode)?`${op.pos||0}/${_duelCur.rounds||DUEL_ROUNDS} · ${op.sc||0} ${de?'P.':'pts'}`:`${op.pos||0}/${DUEL_ROUNDS} · ${op.ft||0} ✓`;
    return `<div>⚔️ ${_duelEsc(_duelCur.names[u]||'?')}: ${txt}</div>`;
  }).join('');
  c.style.display='block';
}

// ── kleines Modal (nutzt das Stylesheet der Auth-Dialoge) ──
function _duelModal(html,wide){
  let m=_duelEl('duel-modal');
  if(!m){
    m=document.createElement('div');m.id='duel-modal';m.className='auth-modal';m.style.display='none';
    m.innerHTML='<div class="auth-box duel-box"><div id="duel-modal-content"></div></div>';
    document.body.appendChild(m);
  }
  m.querySelector('.duel-box').classList.toggle('wide',!!wide);
  _duelEl('duel-modal-content').innerHTML=html;
  m.style.display='flex';
}
function _duelClose(){const m=_duelEl('duel-modal');if(m)m.style.display='none';}
function _duelMessage(icon,text){
  _duelModal(`<div class="duel-count" style="font-size:40px">${icon}</div><div class="duel-sub">${_duelEsc(text)}</div>
    <button class="duel-btn primary" onclick="_duelClose()">OK</button>`);
}
