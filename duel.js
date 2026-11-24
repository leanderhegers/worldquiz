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

// Avatar eines Spielers: gewähltes Emoji auf Farbe (wie im Profil), sonst der Anfangsbuchstabe. Die Avatare aller Mitspieler stehen im Duell-Dokument (av).
function _duelAv(av,name,size){
  const f=String(name||'?').slice(0,1).toUpperCase();
  return typeof _renderAvatar==='function'?_renderAvatar(av||null,f,size||26):'<span class="duel-av">'+_duelEsc(f)+'</span>';
}
function _duelAvOf(d,u,size){return _duelAv(d&&d.av&&d.av[u],d&&d.names&&d.names[u],size);}
function _duelDE(){return typeof lang==='undefined'||lang!=='en';}
function _duelMe(){return window._authUser?window._authUser.uid:null;}
function _duelEl(id){return document.getElementById(id);}
function _duelRef(id){return _db.collection('duels').doc(id);}
function _duelEsc(s){return typeof escapeHtml==='function'?escapeHtml(String(s)):String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
// Alle Spielarten des Multiplayers. diff: Schwierigkeitsstufen wählbar. Ein neuer Modus braucht hier einen Eintrag, einen Pool (_duelPool)
// und – wenn er die Frage-Maschine der Challenges nutzt (Typen country, flag, capital, outline, wappen, language, currency, neighbor) – sonst nichts.
const DUEL_MODES=[
  {k:'flag',ico:'🏳️',de:'Flaggen',en:'Flags',sc:'rd'},
  {k:'map',ico:'🗺️',de:'Länder anklicken',en:'Click countries',sc:'rt'},
  {k:'pin',ico:'📍',de:'Drop a Pin',en:'Drop a Pin',sc:'pr'},
  {k:'capital',ico:'🏛️',de:'Hauptstädte',en:'Capitals',sc:'rd'},
  {k:'outline',ico:'🏝️',de:'Umrisse',en:'Outlines',sc:'rd'},
  {k:'wappen',ico:'🛡️',de:'Wappen',en:'Coats of arms',sc:'rd'},
  {k:'language',ico:'🗣️',de:'Sprachen',en:'Languages'},
  {k:'currency',ico:'💱',de:'Währungen',en:'Currencies'},
  {k:'neighbor',ico:'🧩',de:'Nachbar-Rätsel',en:'Neighbour puzzles'},
  {k:'pie',ico:'🥧',de:'Flaggen-Kuchen',en:'Flag pie',sc:'rd'},
  {k:'path',ico:'🛤️',de:'Kürzester Weg',en:'Shortest path',sc:'pd'},
  {k:'flagbuild',ico:'🎨',de:'Flagge malen',en:'Build a flag'},
  {k:'random',ico:'🎲',de:'Zufall',en:'Random',sc:'pd'}
];
// Zufall: 10 Fragen, jede aus einem zufällig gewählten Quiz (wie die Zufalls-Challenge der Hauptseite). Eine Frage steht als "Typ:ID" im Dokument.
const DUEL_RANDOM_TYPES=['country','flag','capital','outline','language','currency','wappen','neighbor','pie','river','lake','city','mountain','range','desert','flagbuild'];
// Eine Frage steht als Text: "Typ:ID" bzw. "Typ:Stufe:Nummer" (Karten-Typen)
async function _duelRandomQuestions(level){
  level=/^(easy|medium|hard)$/.test(level)?level:'all';
  try{await challengeEnsureMapData();}catch(e){}
  if(typeof iqEnsureOutlineGeo==='function'&&!outlineGeo){try{await iqEnsureOutlineGeo();}catch(e){}}
  try{await pieEnsureAll();}catch(e){}
  const ids=Object.keys(C).map(Number);
  // Stufe: Länder nach Einwohner-Stufen (Leicht t1–t2, Mittel t3, Schwer t4–t5), Flaggen/Hauptstädte/Umrisse/Wappen/Kuchen nach ihren Stufen; Sprachen, Währungen und Nachbarn haben keine
  const T=DIFFICULTY_TIERS,tiers=level==='easy'?[0,1]:level==='medium'?[2]:level==='hard'?[3,4]:[0,1,2,3,4];
  const pool=t=>iqPoolIds({type:t,region:'world',diff:level,dir:'c2cap'}).filter(id=>t!=='outline'||!outlineGeo||iqOutlineFeature(id));
  const pools={country:tiers.flatMap(i=>T[i]||[]).filter(id=>C[id]),flag:pool('flag'),capital:pool('capital'),outline:pool('outline'),language:Object.keys(LANGUAGES),currency:Object.keys(CURRENCIES),wappen:pool('wappen'),neighbor:NEIGHBOR_PUZZLES.map(p=>p.id)};
  try{const all=_duelPool('pie','all','world');pools.pie=pieFilterSync(pool('pie'),all);}catch(e){}
  const types=DUEL_RANDOM_TYPES.slice().sort(()=>Math.random()-.5),out=[];
  for(const type of types){
    if(out.length>=DUEL_ROUNDS)break;
    if(type==='flagbuild'){out.push('flagbuild:'+Math.floor(Math.random()*1e6));continue;}
    if(CH_MAP_TYPES.includes(type)){const p=challengeMapPick(type,level);if(p)out.push(type+':'+p.diff+':'+p.idx);}
    else if(pools[type]&&pools[type].length)out.push(type+':'+pools[type][Math.floor(Math.random()*pools[type].length)]);
  }
  return out;
}
function _duelRandomQueue(q){return (q||[]).map(s=>{const p=String(s).split(':'),type=p[0];
  if(type==='flagbuild')return {type,seed:p[1]};
  if(CH_MAP_TYPES.includes(type))return {type,diff:p[1],idx:Number(p[2])};
  return {type,id:(type==='language'||type==='currency')?p.slice(1).join(':'):Number(p[1])};});}
const _duelPts=m=>m==='pin'||m==='path'||m==='flagbuild'; // Punkte-Modi (statt "x von 10 richtig")
function _duelMode(m){return DUEL_MODES.find(x=>x.k===m)||DUEL_MODES[0];}
function _duelModeName(m,de){const x=_duelMode(m);return de?x.de:x.en;}
// Umfang wie im Singleplayer. sc: 'rd' = Region (Welt/Kontinent) ODER Stufe Anfänger–Schwer (Flaggen, Hauptstädte, Wappen, Flaggen-Kuchen), 'rt' = Region ODER eine der 5 Stufen
// nach Einwohnern (Länder anklicken), 'pd' = Leicht/Mittel/Schwer (Kürzester Weg), 'pr' = Region (Drop a Pin). diff und reg stehen im Duell-Dokument.
// Wie im Singleplayer schließen sich Region und Stufe aus: eine Region gilt mit allen Stufen, eine Stufe mit der ganzen Welt.
let _duelSelDiff='all',_duelSelReg='world',_duelSelRegPin='EU';
const _duelRegs=['EU','AF','AS','NA','SA','OC'];
function _duelL(o){return o?(o[lang]||o.de||o.en||''):'';}
function _duelHasReg(mode){const sc=_duelMode(mode).sc;return sc==='rd'||sc==='rt'||sc==='pr';}
function _duelHasDiff(mode){const sc=_duelMode(mode).sc;return sc==='rd'||sc==='rt'||sc==='pd';}
function _duelRegOf(mode,reg){return mode==='pin'?(reg||'EU'):(_duelHasReg(mode)?(reg||'world'):'world');}
function _duelRegName(r){return r==='world'?t('regWorld'):_duelL(MODES[r]);}
function _duelDiffName(df,de,mode){
  if(df==='all')return typeof t==='function'?t('diffAll'):(de?'Alle':'All');
  const sc=mode&&_duelMode(mode).sc;
  if(sc==='rt'&&/^t[1-5]$/.test(df)){const l=t('diffTierLabels');return l&&l[+df[1]-1]||df;}
  const f=TX[lang]&&TX[lang].flagDiffs&&TX[lang].flagDiffs.find(x=>x.key===df);
  if(sc!=='pd'&&f)return f.label;
  return df==='easy'?(de?'Leicht':'Easy'):df==='medium'?(de?'Mittel':'Medium'):df==='hard'?(de?'Schwer':'Hard'):df;
}
function _duelScopeName(mode,diff,reg,de){
  const parts=[];
  if(_duelHasReg(mode)&&reg&&(mode==='pin'||reg!=='world'))parts.push(_duelRegName(reg));
  if(_duelHasDiff(mode)&&diff&&diff!=='all')parts.push(_duelDiffName(diff,de,mode));
  return parts.join(' · ');
}
function _duelTitle(d,de){const m=_duelModeName(d.mode,de),sc=_duelScopeName(d.mode,d.diff,_duelRegOf(d.mode,d.reg),de),s=sc?m+' · '+sc:m;return s;}
function _duelKey(mode,diff,reg){
  const r=_duelRegOf(mode,reg);
  return mode+((_duelHasDiff(mode)&&diff&&diff!=='all')?'_'+diff:'')+(((_duelHasReg(mode))&&(mode==='pin'||r!=='world'))?'_'+r:'');
}
function _duelPool(mode,diff,reg){
  reg=_duelRegOf(mode,reg);diff=diff||'all';
  if(mode==='pin')return getPinCities(reg).map(c=>c.name_en);
  if(mode==='map'){
    const T=DIFFICULTY_TIERS,m=/^t([1-5])$/.exec(diff);
    let ids=m?T[+m[1]-1]:Object.keys(C).map(Number);
    if(reg!=='world')ids=ids.filter(id=>C[id]&&C[id].c===reg);
    return ids.filter(id=>C[id]);
  }
  if(mode==='language')return Object.keys(LANGUAGES);
  if(mode==='currency')return Object.keys(CURRENCIES);
  if(mode==='neighbor')return NEIGHBOR_PUZZLES.map(p=>p.id);
  // Flaggen, Hauptstädte, Wappen, Flaggen-Kuchen: derselbe Pool wie im Einzelspiel (Region ODER Stufe)
  return iqPoolIds({type:mode,region:reg,diff,dir:'c2cap'});
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
  // Revanche / Neues Spiel: wer noch in der Nach-Lobby des alten Duells sitzt, landet ohne Nachfrage in der neuen Lobby (dort auf "Bereit" klicken)
  if(d.host!==me&&d.status==='lobby'&&d.prev&&!answered&&Date.now()-(d.ts||0)<DUEL_INVITE_TTL&&_duelCur&&_duelCur.finished&&_duelCur.id===d.prev&&_duelPostId===d.prev&&!_duelLobbyId){_duelAutoJoin(d);return;}
  if(d.host!==me&&d.status==='lobby'&&!answered&&Date.now()-(d.ts||0)<DUEL_INVITE_TTL&&(!_duelCur||_duelCur.finished)&&!_duelLobbyId)_duelShowBanner(d);
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

function _duelAutoJoin(d){
  const me=_duelMe();if(!_db||!me)return;
  _duelHideBanner();
  _duelLobbyId=d.id;_duelPostClosed=d.prev;_duelPostId=null;
  clearTimeout(_duelWaitTimer);
  _duelWaitTimer=setTimeout(()=>{if(_duelLobbyId===d.id)duelLeaveLobby();},DUEL_INVITE_TTL);
  _duelRef(d.id).update({['r.'+me]:'yes'}).catch(()=>{});
  d.r=Object.assign({},d.r,{[me]:'yes'});
  _duelRenderLobby(d);
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
async function duelOpenPicker(preUid,force,preSel){
  if(!window._authUser){if(typeof openAuth==='function')openAuth('login');return;}
  if(!force)_duelRematchFrom=null;
  if(!force&&(_duelCur||_duelLobbyId)){_duelMessage('⚔️',_duelDE()?'Du bist schon in einem Duell.':'You are already in a duel.');return;}
  const last=_duelLastGet();
  _duelSel=new Set(preUid?[preUid]:(preSel||[]));
  if(last.mode&&DUEL_MODES.some(x=>x.k===last.mode))_duelSelMode=last.mode;
  if(last.diff)_duelSelDiff=last.diff;
  if(last.reg)_duelSelReg=last.reg;
  if(last.regPin)_duelSelRegPin=last.regPin;
  const de=_duelDE();
  _duelModal(`<div class="duel-sub">${de?'Lade Freunde…':'Loading friends…'}</div>`);
  try{_duelFriendList=(typeof _loadFriends==='function')?await _loadFriends():[];}catch(e){_duelFriendList=[];}
  // Online zuerst (dann alphabetisch)
  _duelFriendList.sort((x,y)=>(_duelOnline(y)-_duelOnline(x))||String(x.username).localeCompare(String(y.username)));
  if(!preUid&&!preSel&&last.friends)last.friends.filter(u=>_duelFriendList.some(f=>f.uid===u)).slice(0,DUEL_MAX_PLAYERS-1).forEach(u=>_duelSel.add(u)); // wie beim letzten Mal
  if(preUid&&!_duelFriendList.some(f=>f.uid===preUid))_duelSel.delete(preUid);
  _duelRenderPicker();
}
function duelPickMode(m){
  _duelSelMode=m;if(m==='random'){_duelRenderPicker();return;}const sc=_duelMode(m).sc;
  // Stufe passend zum Modus (Länder: t1–t5, Flaggen u. a.: Anfänger–Schwer, Weg: Leicht–Schwer)
  if(sc==='rt'?!/^(all|t[1-5])$/.test(_duelSelDiff):sc==='rd'?!/^(all|beginner|easy|medium|hard)$/.test(_duelSelDiff):sc==='pd'?!/^(all|easy|medium|hard)$/.test(_duelSelDiff):false)_duelSelDiff='all';
  _duelRenderPicker();
}
function duelPickDiff(df){_duelSelDiff=df;if(df!=='all')_duelSelReg='world';_duelRenderPicker();}
function duelPickReg(r){if(_duelSelMode==='pin')_duelSelRegPin=r;else{_duelSelReg=r;if(r!=='world')_duelSelDiff='all';}_duelRenderPicker();}
function duelToggleFriend(uid){
  if(_duelSel.has(uid))_duelSel.delete(uid);
  else if(_duelSel.size<DUEL_MAX_PLAYERS-1)_duelSel.add(uid);
  _duelRenderPicker();
}
const DUEL_LAST_KEY='geoquiz_duel_last';
function _duelLastGet(){try{return JSON.parse(localStorage.getItem(DUEL_LAST_KEY))||{};}catch(e){return{};}}
function _duelLastSet(){try{localStorage.setItem(DUEL_LAST_KEY,JSON.stringify({mode:_duelSelMode,diff:_duelSelDiff,reg:_duelSelReg,regPin:_duelSelRegPin,friends:[..._duelSel]}));}catch(e){}}
function _duelScopeUiPd(de){return '<div class="duel-rub"><div class="duel-sec">'+(de?'Schwierigkeit':'Difficulty')+'</div><div class="duel-chips">'+['all','easy','medium','hard'].map(df=>'<button class="duel-chip'+(_duelSelDiff===df?' on':'')+'" onclick="duelPickDiff(&quot;'+df+'&quot;)">'+_duelDiffName(df,de,'path')+'</button>').join('')+'</div></div>';}
function _duelScopeUi(mode,de){
  if(mode==='random')return '<div class="duel-sub" style="margin-bottom:8px">'+(de?'10 Fragen, jede aus einem anderen, zufällig gewählten Quiz (Länder, Flaggen, Hauptstädte, Umrisse, Flüsse, Seen, Städte, Berge, Wüsten u. a.). Die Stufe gilt für alle Quizze, die Stufen kennen.':'10 questions, each from a different, randomly chosen quiz (countries, flags, capitals, outlines, rivers, lakes, cities, mountains, deserts and more). The level applies to every quiz that has levels.')+'</div>'+_duelScopeUiPd(de);
  const sc=_duelMode(mode).sc;if(!sc)return '';
  const chip=(on,call,label)=>'<button class="duel-chip'+(on?' on':'')+'" onclick="'+call+'">'+label+'</button>';
  const row=(title,inner)=>'<div class="duel-rub"><div class="duel-sec">'+title+'</div><div class="duel-chips">'+inner+'</div></div>';
  let h='';
  if(sc==='pr'){
    const cur=_duelSelRegPin;
    return row(de?'Region':'Region',['world','EU','AF','AS','NA','SA','OC'].map(r=>chip(cur===r,"duelPickReg('"+r+"')",_duelRegName(r))).join(''));
  }
  if(sc==='rd'||sc==='rt'){
    h+=row(de?'Region':'Region',['world'].concat(_duelRegs).map(r=>chip(_duelSelReg===r,"duelPickReg('"+r+"')",_duelRegName(r))).join(''));
    const ds=sc==='rt'?['all','t1','t2','t3','t4','t5']:['all','beginner','easy','medium','hard'];
    h+=row(de?'Schwierigkeit':'Difficulty',ds.map(df=>chip(_duelSelDiff===df,"duelPickDiff('"+df+"')",_duelDiffName(df,de,mode))).join(''));
    return h;
  }
  return row(de?'Schwierigkeit':'Difficulty',['all','easy','medium','hard'].map(df=>chip(_duelSelDiff===df,"duelPickDiff('"+df+"')",_duelDiffName(df,de,mode))).join(''));
}
function _duelRenderPicker(){
  const de=_duelDE();
  const tile=x=>`<div class="duel-tile${_duelSelMode===x.k?' selected':''}" onclick="duelPickMode('${x.k}')"><span class="duel-tile-ico">${x.ico}</span><span class="duel-tile-name">${de?x.de:x.en}</span></div>`;
  const full=_duelSel.size>=DUEL_MAX_PLAYERS-1;
  const friends=_duelFriendList.length?_duelFriendList.map(f=>{
    const on=_duelSel.has(f.uid),online=_duelOnline(f);
    return `<div class="duel-friend${on?' selected':''}${(!on&&full)?' disabled':''}${online?'':' offline'}" onclick="duelToggleFriend('${_duelEsc(f.uid)}')">
      <span class="duel-check">${on?'✓':''}</span>${_duelAv(f.avatar,f.username,28)}<span style="flex:1;">${_duelEsc(f.username||'?')}</span><span class="duel-dot ${online?'on':'off'}" title="${online?'online':'offline'}"></span></div>`;
  }).join(''):`<div class="duel-sub">${de?'Du hast noch keine Freunde. Füge zuerst Freunde hinzu (👥).':'You have no friends yet. Add some first (👥).'}</div>`;
  const m=_duelMode(_duelSelMode);
  _duelModal(`<div class="duel-head"><h2 class="pf-title" style="padding:0;margin:0;">⚔️ Multiplayer</h2><button class="duel-x" onclick="_duelClose()" aria-label="${de?'Schließen':'Close'}">✕</button></div>
    <div class="duel-cols">
      <div class="duel-col">
        <div class="duel-sec">${de?'Spiel':'Game'}</div>
        <div class="duel-tiles">${DUEL_MODES.map(tile).join('')}</div>
        <div class="duel-scope">${_duelScopeUi(_duelSelMode,de)}</div>
      </div>
      <div class="duel-col">
        <div class="duel-sec">${de?'Mitspieler':'Players'} <span class="duel-sub">${_duelSel.size}/${DUEL_MAX_PLAYERS-1}</span></div>
        <div class="duel-friends tall">${friends}</div>
        <div class="duel-invite"><button class="duel-btn primary" ${_duelSel.size?'':'disabled'} onclick="duelSendInvite()">${de?'Einladen':'Invite'}</button></div>
      </div>
    </div>`,true);
}
async function duelSendInvite(){
  const me=_duelMe();
  if(!me||!_db||!_duelSel.size)return;
  const de=_duelDE(),mode=_duelSelMode||'flag';
  const uids=[..._duelSel].slice(0,DUEL_MAX_PLAYERS-1);
  const prevId=(_duelRematchFrom&&_duelRematchFrom.id)||null; // Revanche / Neues Spiel: die Spieler des alten Duells landen automatisch in der neuen Lobby
  const names={[me]:(typeof _myName==='function'?_myName(window._authUser):(window._authUser.displayName||'?'))};
  const av={[me]:(typeof _store!=='undefined'&&_store.avatar)||null}; // Avatare aller Spieler ins Dokument, damit sie überall angezeigt werden
  uids.forEach(u=>{const f=_duelFriendList.find(x=>x.uid===u),o=_duelRematchFrom;names[u]=(f&&f.username)||(o&&(o.names||{})[u])||'?';av[u]=(f&&f.avatar)||(o&&(o.av||{})[u])||null;});
  // Flaggen: Länder-IDs. Pin: Stadtnamen (name_en) aus dem europäischen Pool — alle lösen sie über
  // getPinCities('EU') wieder in dieselben Städte auf.
  const reg=_duelRegOf(mode,mode==='pin'?_duelSelRegPin:_duelSelReg);
  let diff=_duelHasDiff(mode)?(_duelSelDiff||'all'):'all';
  if(_duelMode(mode).sc==='pd'&&!/^(all|easy|medium|hard)$/.test(diff))diff='all';
  if(_duelMode(mode).sc==='rd'&&/^t[1-5]$/.test(diff))diff='all';
  if(_duelMode(mode).sc==='rt'&&/^(beginner|easy|medium|hard)$/.test(diff))diff='all';
  _duelLastSet();
  let picked;
  if(mode==='outline'&&typeof iqEnsureOutlineGeo==='function'){try{await iqEnsureOutlineGeo();}catch(e){}} // Umriss-Daten werden für die Fragenauswahl gebraucht
  if(mode==='random')picked=await _duelRandomQuestions(diff);
  else if(mode==='flagbuild')picked=Array.from({length:5},()=>String(Math.floor(Math.random()*1e6))); // Zahlen: jede wählt dieselbe Flagge aus der Liste der Zielflaggen
  else if(mode==='path'){try{picked=await pathMakePairs(5,diff);}catch(e){picked=[];}if(!picked.length){_duelMessage('⚠️',de?'Die Karte konnte nicht geladen werden.':'Could not load the map.');return;}}
  else if(mode==='pie'){ // nur Kuchen, die eindeutig lösbar sind (jeder darf jedes Land tippen: Antwortmenge = alle Flaggen)
    try{await pieEnsureAll();}catch(e){}
    const all=_duelPool('pie','all','world');
    picked=_duelDraw(_duelKey(mode,diff,reg),pieFilterSync(_duelPool(mode,diff,reg),all));
  }
  else picked=_duelDraw(_duelKey(mode,diff,reg),_duelPool(mode,diff,reg));
  if(!picked||!picked.length){_duelMessage('⚠️',de?'Für diese Auswahl gibt es keine Fragen.':'There are no questions for this selection.');return;}
  _duelModal(`<div class="duel-sub">${de?'Sende Einladung…':'Sending invitation…'}</div>`);
  try{
    const ref=await _db.collection('duels').add({
      players:[me,...uids],host:me,names,av,mode,diff,reg,q:picked,status:'lobby',ts:Date.now(),r:{[me]:'yes'},rd:{[me]:true},p:{},chat:[],...(prevId?{prev:prevId}:{})
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
    if(d.mode==='random'){challengeEnsureMapData().catch(()=>{});if(typeof iqEnsureOutlineGeo==='function')iqEnsureOutlineGeo().catch(()=>{});if(typeof _preloadChallengeImages==='function')_preloadChallengeImages(_duelRandomQueue(d.q));}
    else if(d.mode==='map'){if(!worldData)loadMap().catch(()=>{});}
    else if(d.mode==='outline'){if(typeof iqEnsureOutlineGeo==='function')iqEnsureOutlineGeo().catch(()=>{});}
    else if((d.mode==='flag'||d.mode==='wappen'||d.mode==='pie')&&typeof _preloadChallengeImages==='function')_preloadChallengeImages((d.q||[]).map(id=>({type:d.mode,id})));
  }catch(e){}
}
function _duelChatHtml(d,me){
  const list=(d.chat||[]).slice(-60);
  return list.length?list.map(c=>`<div class="duel-msg${c.u===me?' mine':''}"><span class="duel-msg-n">${_duelAvOf(d,c.u,16)}${_duelEsc(c.n||'?')}</span>${_duelEsc(c.t)}</div>`).join(''):`<div class="duel-sub" style="text-align:center;margin:auto;">${_duelDE()?'Noch keine Nachrichten':'No messages yet'}</div>`;
}
function _duelRenderLobby(d){
  if(!d)return;
  _duelPrefetch(d);
  const me=_duelMe(),de=_duelDE(),isHost=d.host===me;
  const rdy=u=>!d.prev||!!(d.rd||{})[u]; // Nach Revanche / Neuem Spiel muss jeder auf "Bereit" klicken
  const rows=(d.players||[]).map(u=>{
    const st=(d.r||{})[u];
    const ok=st==='yes'&&rdy(u);
    const lbl=st==='yes'?(d.prev?(ok?(de?'bereit':'ready'):(de?'noch nicht bereit':'not ready')):(de?'dabei':'in')):st==='no'?(de?'abgelehnt':'declined'):(de?'wartet…':'waiting…');
    return `<div class="duel-friend ${ok?'in':st==='no'?'out':''}">${_duelAvOf(d,u,28)}<span style="flex:1;text-align:left;">${_duelEsc((d.names||{})[u]||'?')}${u===d.host?' 👑':''}</span><span class="duel-state ${st||''}">${ok||(st==='yes'&&!d.prev)?'✓ ':st==='no'?'✕ ':'… '}${lbl}</span></div>`;
  }).join('');
  const yesList=(d.players||[]).filter(u=>(d.r||{})[u]==='yes'),joined=yesList.length,allReady=yesList.every(rdy);
  const foot=isHost
    ?`<button class="duel-btn primary" ${joined>=2&&allReady?'':'disabled'} onclick="duelStart()">${de?`Starten (${joined} Spieler)`:`Start (${joined} players)`}</button><button class="duel-btn" onclick="duelCancelLobby()">${de?'Abbrechen':'Cancel'}</button>`
    :`${(d.prev&&!rdy(me))?`<button class="duel-btn primary" onclick="duelReady()">${de?'Bereit':'Ready'}</button>`:''}<div class="duel-sub" style="flex:1;align-self:center;">${de?`Warte auf ${_duelEsc((d.names||{})[d.host]||'?')} …`:`Waiting for ${_duelEsc((d.names||{})[d.host]||'?')} …`}</div><button class="duel-btn" onclick="duelLeaveLobby()">${de?'Verlassen':'Leave'}</button>`;
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
function duelReady(){
  const id=_duelLobbyId,me=_duelMe();
  if(!id||!me||!_db)return;
  const d=_duelDocs[id];if(d)d.rd=Object.assign({},d.rd,{[me]:true});
  _duelRef(id).update({['rd.'+me]:true}).catch(()=>{});
  if(d)_duelRenderLobby(d);
}
function duelChatSend(){
  const inp=_duelEl('dl-in'),id=_duelLobbyId||_duelPostId,me=_duelMe();
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
  if(d.prev&&!joined.every(u=>(d.rd||{})[u]))return; // alle müssen bereit sein
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
  b.innerHTML=`<div class="duel-banner-text" style="display:flex;align-items:center;gap:8px;">${_duelAvOf(d,d.host,32)}<span>⚔️ <b>${host}</b> ${de?'fordert dich heraus:':'challenges you:'} ${_duelTitle(d,de)}${others>0?(de?` (+${others} weitere)`:` (+${others} more)`):''}</span></div>
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
  _duelCur={id:d.id,mode,joined:(d.joined||[]).slice(),names:d.names||{},av:d.av||{},finished:false};
  if(d.host!==me&&mode!=='path'&&mode!=='random'&&mode!=='flagbuild'){try{_duelRecentAdd(_duelKey(mode,d.diff,d.reg),d.q||[],_duelPool(mode,d.diff,d.reg).length);}catch(e){}}
  _duelHideBanner();
  ['closeFriends','closeFriendProfile','closeProfile'].forEach(f=>{try{if(typeof window[f]==='function')window[f]();}catch(e){}});
  const de=_duelDE(),isPin=mode==='pin',isPath=mode==='path',isFlag=mode==='flagbuild';
  const queue=(isPin||isPath||isFlag)?[]:mode==='random'?_duelRandomQueue(d.q):d.q.map(id=>({type:mode==='map'?'country':mode,id}));
  const cities=isPin?d.q.map(n=>getPinCities(d.reg||'EU').find(c=>c.name_en===n)).filter(Boolean):[];
  const others=_duelCur.joined.filter(u=>u!==me).map(u=>_duelAvOf(d,u,22)+' '+_duelEsc(_duelCur.names[u]||'?')).join(' &nbsp; ');
  const cd=(n)=>_duelModal(`<h2 class="pf-title" style="padding:0;">⚔️ ${_duelTitle({mode,diff:d.diff,reg:d.reg},de)}</h2>
    <div class="duel-sub">${de?'Gegen':'Against'} ${others}</div>
    <div class="duel-count">${n}</div><div class="duel-sub">${de?'Mach dich bereit…':'Get ready…'}</div>`);
  // Karten-Modus braucht die geladene Weltkarte, Flaggen ihre Bilder — beides läuft während des Countdowns.
  const pre=(isPin||isFlag)?Promise.resolve():mode==='random'?Promise.all([challengeEnsureMapData(),(typeof iqEnsureOutlineGeo==='function'&&!outlineGeo)?iqEnsureOutlineGeo():0,(typeof _preloadChallengeImages==='function'?_preloadChallengeImages(queue):0)]):mode==='outline'?(typeof iqEnsureOutlineGeo==='function'?iqEnsureOutlineGeo():Promise.resolve()):(mode==='map'||isPath)?(worldData?Promise.resolve():loadMap()):(typeof _preloadChallengeImages==='function'?_preloadChallengeImages(queue):Promise.resolve());
  for(let n=3;n>=1;n--){cd(n);await new Promise(r=>setTimeout(r,900));}
  await pre;
  if(!_duelCur||_duelCur.id!==d.id)return; // währenddessen abgebrochen
  _duelClose();
  if(isFlag){
    if(!(d.q||[]).length){_duelCur=null;_duelMessage('⚠️',de?'Die Flaggen des Duells konnten nicht geladen werden.':'Could not load the duel flags.');return;}
    _duelCur.rounds=d.q.length;_duelChip(d);
    openFunFrame('spass-flaggen.html?duel=1&seeds='+encodeURIComponent(d.q.join(',')));
    return;
  }
  if(isPath){
    if(!(d.q||[]).length){_duelCur=null;_duelMessage('⚠️',de?'Die Aufgaben des Duells konnten nicht geladen werden.':'Could not load the duel tasks.');return;}
    _duelCur.rounds=d.q.length;_duelChip(d);
    await startPathGame({pairs:d.q,duel:true});
    return;
  }
  if(isPin){
    if(!cities.length){_duelCur=null;_duelMessage('⚠️',de?'Die Städte des Duells konnten nicht geladen werden.':'Could not load the duel cities.');return;}
    _duelChip(d);
    await startPinGame(d.reg||'EU',cities);
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
function duelFlagProgress(n,total){
  const me=_duelMe();
  if(!_duelCur||_duelCur.mode!=='flagbuild'||!me||!_db)return;
  _duelRef(_duelCur.id).update({['p.'+me]:{pos:n,sc:Math.round(total),done:false}}).catch(()=>{});
}
function duelFlagFinish(total){
  const me=_duelMe();
  if(!_duelCur||_duelCur.mode!=='flagbuild'||!me||!_db)return;
  const fr=_duelEl('fun-frame');if(fr)fr.src='about:blank';
  showScreen('result-screen');
  const set=(id,txt)=>{const e=_duelEl(id);if(e)e.textContent=txt;};
  set('res-btn-back',t('back'));set('btn-new',t('newgame'));
  const sc=Math.round(total),rounds=_duelCur.rounds||5;
  _duelCur.finished=true;_duelCur.score=sc;_duelCur.total=rounds;_duelCur.rounds=rounds;
  _duelChip(null);_duelHideResultExtras();
  _duelRef(_duelCur.id).update({['p.'+me]:{pos:rounds,sc,done:true,score:sc}}).catch(()=>{});
  _duelRenderResult(_duelDocs[_duelCur.id]);
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
// ── Nach-Lobby: Wer fertig ist, bleibt in einer gemeinsamen Lobby (Rangliste, Chat, Revanche) und wird nicht herausgeworfen; verlassen nur selbst ──
let _duelPostId=null,_duelPostClosed=null,_duelRematchFrom=null;
function _duelRenderPost(d){
  if(!d||!_duelCur||!_duelCur.finished||_duelCur.id!==d.id||_duelPostClosed===d.id||_duelLobbyId)return;
  const de=_duelDE(),me=_duelMe(),p=d.p||{},joined=(_duelCur.joined||[]);
  _duelPostId=d.id;
  const sc=u=>u===me?(_duelCur.score||0):((p[u]||{}).score||0);
  const list=joined.slice().sort((a,b)=>{const da=u=>u===me||(p[u]&&p[u].done&&!p[u].left);return (da(b)-da(a))||(sc(b)-sc(a));});
  const rows=list.map((u,i)=>{
    const st=u===me?{done:true,score:_duelCur.score||0}:(p[u]||{});
    const txt=st.left?(de?'hat aufgegeben':'gave up'):st.done?`${st.score||0} ${de?'Punkte':'points'}`:`${de?'spielt noch':'still playing'} (${st.pos||0}/${_duelCur.total||DUEL_ROUNDS})`;
    const medal=st.done&&!st.left?['🥇','🥈','🥉'][i]||'':'';
    return `<div class="duel-friend ${st.done&&!st.left?'in':''}">${_duelAvOf(d,u,28)}<span style="flex:1;text-align:left;">${_duelEsc((d.names||{})[u]||'?')}${u===d.host?' 👑':''}${u===me?(de?' (du)':' (you)'):''}</span><span class="duel-state">${medal} ${txt}</span></div>`;
  }).join('');
  const allDone=joined.every(u=>u===me||(p[u]&&p[u].done));
  const isHost=d.host===me;
  const foot=(isHost?`<button class="duel-btn primary" ${allDone?'':'disabled'} onclick="duelRematch()">${de?'Revanche':'Rematch'}</button><button class="duel-btn" ${allDone?'':'disabled'} onclick="duelNewGame()">${de?'Neues Spiel':'New game'}</button>`:`<div class="duel-sub" style="flex:1;align-self:center;">${allDone?(de?`${_duelEsc((d.names||{})[d.host]||'?')} kann eine Revanche starten …`:`${_duelEsc((d.names||{})[d.host]||'?')} can start a rematch …`):(de?'Warte auf die anderen …':'Waiting for the others …')}</div>`)+`<button class="duel-btn" onclick="duelPostClose()">${de?'Schließen':'Close'}</button>`;
  const wrap=_duelEl('duel-post');
  if(wrap&&wrap.dataset.id===d.id){
    _duelEl('dp-players').innerHTML=rows;_duelEl('dp-foot').innerHTML=foot;
    const cl=_duelEl('dl-chat'),atEnd=cl.scrollHeight-cl.scrollTop-cl.clientHeight<40;
    cl.innerHTML=_duelChatHtml(d,me);if(atEnd)cl.scrollTop=cl.scrollHeight;
    return;
  }
  _duelModal(`<div class="duel-head"><h2 class="pf-title" style="padding:0;margin:0;">⚔️ ${_duelTitle(d,de)}</h2></div>
    <div id="duel-post" data-id="${d.id}" class="duel-cols">
      <div class="duel-col"><div class="duel-sec">${de?'Ergebnis':'Result'}</div><div class="duel-friends tall" id="dp-players">${rows}</div></div>
      <div class="duel-col"><div class="duel-sec">Chat</div>
        <div class="duel-chat" id="dl-chat">${_duelChatHtml(d,me)}</div>
        <div class="duel-chat-in"><input id="dl-in" maxlength="140" autocomplete="off" placeholder="${de?'Nachricht …':'Message …'}" onkeydown="if(event.key==='Enter')duelChatSend()"><button class="duel-btn primary" onclick="duelChatSend()">➤</button></div>
      </div>
    </div>
    <div class="duel-foot" id="dp-foot">${foot}</div>`,true);
}
// Neues Spiel: der Einladende wählt wieder ein beliebiges Spiel; die bisherigen Mitspieler sind vorgewählt
function duelNewGame(){
  const d=_duelCur&&_duelDocs[_duelCur.id],me=_duelMe();
  if(!d||d.host!==me)return;
  const p=d.p||{},pre=(_duelCur.joined||[]).filter(u=>u!==me&&!(p[u]&&p[u].left));
  _duelRematchFrom=d;_duelPostClosed=d.id;_duelPostId=null;
  duelOpenPicker(null,true,pre);
}
function duelPostClose(){_duelPostClosed=_duelPostId;_duelPostId=null;_duelClose();}
// Revanche: dieselben Spieler, dasselbe Spiel, neue Fragen (der Einladende legt ein neues Duell an, die anderen bekommen die Einladung wie gewohnt)
function duelRematch(){
  const d=_duelCur&&_duelDocs[_duelCur.id],me=_duelMe();
  if(!d||d.host!==me||!_db)return;
  const p=d.p||{};
  _duelSel=new Set((_duelCur.joined||[]).filter(u=>u!==me&&!(p[u]&&p[u].left)));
  if(!_duelSel.size){_duelMessage('⚔️',_duelDE()?'Alle anderen haben das Duell verlassen.':'Everyone else has left the duel.');return;}
  _duelSelMode=d.mode;_duelSelDiff=d.diff||'all';
  if(d.mode==='pin')_duelSelRegPin=d.reg||'EU';else _duelSelReg=d.reg||'world';
  _duelRematchFrom=d;_duelPostClosed=d.id;_duelPostId=null;
  duelSendInvite().finally(()=>{_duelRematchFrom=null;});
}
function _duelRenderResult(d){
  if(!_duelCur||!_duelCur.finished)return;
  _duelRenderPost(d);
  const de=_duelDE(),me=_duelMe(),p=(d&&d.p)||{};
  const t=_duelEl('res-title'),e=_duelEl('res-emoji'),l1=_duelEl('res-l1'),l2=_duelEl('res-l2');
  if(!t||!l2)return;
  const mine=_duelCur.score||0,isPin=_duelCur.mode==='pin',isPts=_duelPts(_duelCur.mode);
  l1.textContent=isPin?`${de?'Du':'You'}: ${mine} ${de?'Punkte':'points'} · Ø ${_duelCur.avg||0} km`:isPts?`${de?'Du':'You'}: ${mine} ${de?'Punkte':'points'}`:`${de?'Du':'You'}: ${_duelCur.ft}/${_duelCur.total} · ${mine} ${de?'Punkte':'points'}`;
  const others=_duelCur.joined.filter(u=>u!==me).map(u=>({uid:u,name:_duelCur.names[u]||'?',st:p[u]||{}}));
  const pending=others.filter(o=>!o.st.done);
  l2.innerHTML=others.map(o=>{
    const s=o.st;
    const txt=s.left?(de?'hat aufgegeben':'gave up'):s.done?`${s.score||0} ${de?'Punkte':'points'}`:`${de?'spielt noch':'still playing'} (${s.pos||0}/${_duelCur.total})`;
    return `<span class="duel-res-row">${_duelAvOf({names:_duelCur.names,av:_duelCur.av},o.uid,20)} ${_duelEsc(o.name)}: ${txt}</span>`;
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
    return `<div class="duel-chip-row">${_duelAvOf({names:_duelCur.names,av:_duelCur.av},u,18)}<span>${_duelEsc(_duelCur.names[u]||'?')}: ${txt}</span></div>`;
  }).join('');
  c.style.display='block';
}

// ── kleines Modal (nutzt das Stylesheet der Auth-Dialoge) ──
function _duelModal(html,wide,fixed){
  let m=_duelEl('duel-modal');
  if(!m){
    m=document.createElement('div');m.id='duel-modal';m.className='auth-modal';m.style.display='none';
    m.innerHTML='<div class="auth-box duel-box"><div id="duel-modal-content"></div></div>';
    document.body.appendChild(m);
  }
  const box=m.querySelector('.duel-box'),st=box.scrollTop;
  box.classList.toggle('wide',!!wide);box.classList.toggle('fixed',!!fixed); // fixed: feste Höhe, damit die Kacheln beim Umschalten nicht springen
  _duelEl('duel-modal-content').innerHTML=html;
  if(fixed)box.scrollTop=st;
  m.style.display='flex';
}
function _duelClose(){const m=_duelEl('duel-modal');if(m)m.style.display='none';}
function _duelMessage(icon,text){
  _duelModal(`<div class="duel-count" style="font-size:40px">${icon}</div><div class="duel-sub">${_duelEsc(text)}</div>
    <button class="duel-btn primary" onclick="_duelClose()">OK</button>`);
}
