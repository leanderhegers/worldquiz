// Spielmodus "Karte ausfüllen": Die Karte ist sichtbar, in einem kleinen schwebenden Textfeld tippt man Länder ein; richtige Länder
// werden grün. Ziel: alle Länder (Welt oder Kontinent) finden. Läuft auf dem normalen Kartenbildschirm (game-screen), nutzt dessen
// Karte, Färbung (game.found → grün), Mikrostaaten-Punkte und Projektionen (auch Globus) und hängt sich nur über game.fillMode ein.
// Hooks in app.js: updateStats, getColor/getMSColor/updateColors, Hover, back/restart, gameScoreKey/-Value, renderInputPage.
//
// Namensprüfung: Namen in allen 4 Sprachen + kleine Alias-Tabelle, ohne Groß-/Kleinschreibung und Akzente (norm()), danach
// Tippfehler-Toleranz (1 Fehler ab 5 Buchstaben, 2 ab 9; nur wenn eindeutig). Sofort-Annahme beim Tippen, solange der Text kein
// Anfang eines längeren, noch offenen Namens ist (Niger/Nigeria).
(function(){
'use strict';
const FT={
  de:{head:'Karte ausfüllen',world:'Welt',worldSub:'Alle Länder eintippen',conts:'Kontinente',contsSub:'Ein Kontinent nach dem anderen',ph:'Land eingeben …',hint:'Hinweis',giveup:'Aufgeben',time:'Zeit',found:'gefunden',hints:'Hinweise',misses:'Fehlversuche',rem:'verbleibend',
    again:'Schon gefunden',unknown:'Kein Land gefunden',notHere:'Nicht auf dieser Karte',hintMsg:(l,n)=>'💡 Ein Land mit '+l+' … ('+n+' Buchstaben)',doneTitle:'Karte ausgefüllt!',giveTitle:'Aufgegeben',sum:(f,t,p)=>f+' von '+t+' Ländern ('+p+' %)',sum2:(tm,h,m)=>'Zeit '+tm+' · '+(h===1?'1 Hinweis':h+' Hinweise')+' · '+m+' fehlen',show:'Ergebnis',lbl:'Karte ausfüllen'},
  en:{head:'Fill the map',world:'World',worldSub:'Type in every country',conts:'Continents',contsSub:'One continent at a time',ph:'Type a country …',hint:'Hint',giveup:'Give up',time:'Time',found:'found',hints:'Hints',misses:'Misses',rem:'remaining',
    again:'Already found',unknown:'No country found',notHere:'Not on this map',hintMsg:(l,n)=>'💡 A country starting with '+l+' … ('+n+' letters)',doneTitle:'Map completed!',giveTitle:'Gave up',sum:(f,t,p)=>f+' of '+t+' countries ('+p+'%)',sum2:(tm,h,m)=>'Time '+tm+' · '+h+(h===1?' hint':' hints')+' · '+m+' missing',show:'Result',lbl:'Fill the map'},
  es:{head:'Rellenar el mapa',world:'Mundo',worldSub:'Escribe todos los países',conts:'Continentes',contsSub:'Un continente tras otro',ph:'Escribe un país …',hint:'Pista',giveup:'Rendirse',time:'Tiempo',found:'encontrados',hints:'Pistas',misses:'Fallos',rem:'restantes',
    again:'Ya encontrado',unknown:'País no encontrado',notHere:'No está en este mapa',hintMsg:(l,n)=>'💡 Un país que empieza por '+l+' … ('+n+' letras)',doneTitle:'¡Mapa completado!',giveTitle:'Te has rendido',sum:(f,t,p)=>f+' de '+t+' países ('+p+' %)',sum2:(tm,h,m)=>'Tiempo '+tm+' · '+h+(h===1?' pista':' pistas')+' · faltan '+m,show:'Resultado',lbl:'Rellenar el mapa'},
  fr:{head:'Remplir la carte',world:'Monde',worldSub:'Tape tous les pays',conts:'Continents',contsSub:'Un continent après l’autre',ph:'Tape un pays …',hint:'Indice',giveup:'Abandonner',time:'Temps',found:'trouvés',hints:'Indices',misses:'Erreurs',rem:'restants',
    again:'Déjà trouvé',unknown:'Aucun pays trouvé',notHere:'Pas sur cette carte',hintMsg:(l,n)=>'💡 Un pays qui commence par '+l+' … ('+n+' lettres)',doneTitle:'Carte complétée !',giveTitle:'Abandon',sum:(f,t,p)=>f+' sur '+t+' pays ('+p+' %)',sum2:(tm,h,m)=>'Temps '+tm+' · '+h+(h===1?' indice':' indices')+' · '+m+' manquants',show:'Résultat',lbl:'Remplir la carte'}
};
const FX=()=>FT[typeof lang!=='undefined'&&FT[lang]?lang:'de'];
// Häufige Varianten (nach norm()): Zahl = Länder-ID wie in countries.js
const ALIAS={
  840:['usa','us','amerika','vereinigte staaten','vereinigte staaten von amerika','united states of america','etats unis','estados unidos'],
  826:['uk','gb','grossbritannien','großbritannien','england','vereinigtes konigreich','great britain','reino unido','royaume uni'],
  203:['tschechei','czechia','czech republic','republica checa','tchequie'],
  104:['burma'],528:['holland'],384:['cote divoire','ivory coast','elfenbeinkuste','costa de marfil'],
  792:['turkiye'],643:['russia','rusia','russie'],807:['mazedonien'],
  276:['bundesrepublik deutschland'],756:['schweiz','switzerland','suiza','suisse'],
  410:['sudkorea','south korea','corea del sur','coree du sud'],408:['nordkorea','north korea','corea del norte','coree du nord'],
  158:['taiwan'],804:['ukraine']
};
let nameMap=null; // norm(name) → [ids]
function buildNames(){
  nameMap=new Map();
  const add=(n,id)=>{if(!n)return;const k=norm(String(n).trim());if(!k)return;const a=nameMap.get(k);if(a){if(!a.includes(id))a.push(id);}else nameMap.set(k,[id]);};
  for(const id of Object.keys(C).map(Number)){const c=C[id];['de','en','es','fr'].forEach(l=>add(c[l],id));}
  for(const [id,list] of Object.entries(ALIAS)){if(C[+id])list.forEach(n=>add(n,+id));}
}
function dist(a,b,max){ // Editierabstand mit Abbruch
  if(Math.abs(a.length-b.length)>max)return max+1;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];let best=cur[0];
    for(let j=1;j<=b.length;j++){const v=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));cur[j]=v;if(v<best)best=v;}
    if(best>max)return max+1;prev=cur;
  }
  return prev[b.length];
}
// → {id} (gefunden), {again:id} (schon gefunden), {off:true} (nicht auf dieser Karte) oder null
function lookup(text,fuzzy){
  const s=norm(text.trim());if(!s)return null;
  const targets=new Set(game.ids);
  const exact=nameMap.get(s);
  if(exact){
    const open=exact.find(id=>targets.has(id)&&!game.found.has(id));
    if(open!=null)return{id:open};
    const done=exact.find(id=>game.found.has(id));if(done!=null)return{again:done};
    return{off:true};
  }
  if(!fuzzy||s.length<5)return null;
  const tol=s.length>=9?2:1;let best=null,bd=tol+1,tie=false;
  for(const [k,ids] of nameMap){
    if(k.length<5)continue;const d=dist(s,k,tol);if(d>tol)continue;
    const cand=ids.find(id=>targets.has(id));if(cand==null)continue;
    if(d<bd){bd=d;best=cand;tie=false;}else if(d===bd&&cand!==best)tie=true;
  }
  if(best==null||tie)return null;
  return game.found.has(best)?{again:best}:{id:best};
}
// Gibt es einen noch offenen, längeren Namen, der mit dem Text beginnt (Niger → Nigeria)?
function hasLongerOpen(s){
  for(const [k,ids] of nameMap){if(k.length>s.length&&k.startsWith(s)&&ids.some(id=>game.ids.includes(id)&&!game.found.has(id)))return true;}
  return false;
}
const fmt=ms=>{const s=Math.floor(ms/1000),m=Math.floor(s/60);return m+':'+String(s%60).padStart(2,'0');};
let timer=null,msgT=0,pendingT=0;
function msg(text,col){
  const el=document.getElementById('fill-msg');if(!el)return;
  el.textContent=text;el.style.color=col||'#cfd8e3';el.style.opacity=text?1:0;
  clearTimeout(msgT);if(text)msgT=setTimeout(()=>{el.style.opacity=0;},2200);
}
function shake(){const b=document.getElementById('fill-box');if(!b)return;b.classList.remove('fill-shake');void b.offsetWidth;b.classList.add('fill-shake');}
function flash(id){ // kurzes Aufleuchten, danach wieder die normale Färbung (grün)
  const th=THEMES[theme];
  countryPaths&&countryPaths.filter(d=>eff(+d.id)===id).attr('fill','#ffffff');
  microstateDots&&microstateDots.filter(d=>d.id===id).attr('fill','#ffffff');
  setTimeout(()=>{if(game&&game.fillMode)updateColors();},230);
}
function revealOnGlobe(id){ // am Globus zum gefundenen Land drehen, falls es auf der Rückseite liegt
  if(projection!=='globe'||!window.Globe||!countryPaths)return;
  const f=countryPaths.data().find(d=>eff(+d.id)===id);if(!f)return;
  const c=d3.geoCentroid(f);if(!c||!isFinite(c[0]))return;
  if(d3.geoDistance(c,[-globeRot[0],-globeRot[1]])>1.2)window.Globe.flyTo(c[0],c[1],window.Globe.k,500);
}
function accept(id){
  game.found.add(id);game.correct++;
  flash(id);revealOnGlobe(id);
  msg('✓ '+cn(id),'#4fd18b');
  const inp=document.getElementById('fill-input');if(inp)inp.value='';
  updateStats();
  if(game.found.size>=game.total)finish(true);
}
function submit(fuzzy){
  if(!game||!game.fillMode||game.fillDone)return;
  const inp=document.getElementById('fill-input');if(!inp)return;
  const v=inp.value;if(!v.trim())return;
  const r=lookup(v,fuzzy);
  if(r&&r.id!=null)return void accept(r.id);
  if(!fuzzy)return; // beim Tippen nur sichere Treffer; Meldungen erst bei Enter
  if(r&&r.again!=null){msg(FX().again+': '+cn(r.again),'#e0b84a');inp.select();shake();return;}
  if(r&&r.off){msg(FX().notHere,'#e0b84a');inp.select();shake();return;}
  game.fillWrong=(game.fillWrong||0)+1;msg(FX().unknown,'#ff7a6a');inp.select();shake();updateStats();
}
function onInput(){
  clearTimeout(pendingT);
  const inp=document.getElementById('fill-input');if(!inp||!game||!game.fillMode||game.fillDone)return;
  const s=norm(inp.value.trim());if(s.length<3)return;
  const r=lookup(inp.value,false);
  if(!(r&&r.id!=null))return;
  if(hasLongerOpen(s)){pendingT=setTimeout(()=>submit(false),750);return;} // Niger/Nigeria: kurz warten, ob noch weitergetippt wird
  submit(false);
}
function hint(){
  if(!game||!game.fillMode||game.fillDone)return;
  const open=game.ids.filter(id=>!game.found.has(id));if(!open.length)return;
  const id=open[Math.floor(Math.random()*open.length)],n=cn(id);
  game.hints=(game.hints||0)+1;
  msg(FX().hintMsg(n[0].toUpperCase(),[...n].length),'#ffd166');updateStats();
  const inp=document.getElementById('fill-input');if(inp)inp.focus();
}
function updateFillStats(){
  const X=FX(),found=game.found.size,tot=game.total||1;
  $('find-label').textContent=X.lbl+' · '+(game.fillKey==='world'?X.world:((MODES&&MODES[game.fillKey]&&MODES[game.fillKey][lang])||game.fillKey));
  $('target-name').textContent=found+' / '+tot;
  $('btn-skip').style.display=game.fillDone?'none':'';$('btn-skip').textContent=X.giveup;
  $('score-disp').textContent=fmt((game.fillEnd||Date.now())-game.fillStart);$('found-label').textContent=X.time;
  $('stat-c').textContent=found;$('lbl-c').textContent=X.found;
  $('stat-w').textContent=game.hints||0;$('lbl-w').textContent=X.hints;
  $('stat-s').textContent=game.fillWrong||0;$('lbl-s').textContent=X.misses;
  $('stat-r').textContent=(tot-found)+' '+X.rem;
  $('prog-bar').style.width=Math.round(found/tot*100)+'%';
}
function stopTimer(){clearInterval(timer);timer=null;clearTimeout(pendingT);}
function ensureBox(){
  const bg=document.getElementById('map-bg');if(!bg)return;
  let b=document.getElementById('fill-box');
  if(!b){
    b=document.createElement('div');b.id='fill-box';
    b.innerHTML='<div class="fill-row"><input id="fill-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"><button id="fill-hint" type="button"></button></div><div id="fill-msg"></div>';
    bg.appendChild(b);
    const inp=b.querySelector('#fill-input');
    inp.addEventListener('input',onInput);
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(pendingT);submit(true);}});
    b.querySelector('#fill-hint').addEventListener('click',hint);
    b.addEventListener('pointerdown',e=>e.stopPropagation()); // Eingabe nicht als Kartengeste werten
  }
  b.style.display='';
  b.querySelector('.fill-row').style.display=''; // nach "Aufgeben" war die Eingabezeile ausgeblendet
  const m=b.querySelector('#fill-msg');m.textContent='';m.style.opacity=0;
  b.querySelector('#fill-input').placeholder=FX().ph;
  const hb=b.querySelector('#fill-hint');hb.textContent='💡';hb.title=FX().hint;
}
function finish(complete){
  if(game.fillDone)return;
  game.fillDone=true;game.fillEnd=Date.now();stopTimer();
  if(!complete){ // fehlende Länder orange
    game.skippedItems=new Set(game.ids.filter(id=>!game.found.has(id)));game.skipped=game.skippedItems.size;
  }
  updateColors();updateStats();
  const X=FX(),b=document.getElementById('fill-box');
  if(b){
    b.querySelector('.fill-row').style.display='none';
    const m=b.querySelector('#fill-msg');m.style.opacity=1;m.style.color='#fff';
    m.innerHTML='<div class="fill-done">'+(complete?'🏆 '+X.doneTitle:'🏳️ '+X.giveTitle)+'</div><button type="button" id="fill-res">'+X.show+'</button>';
    m.querySelector('#fill-res').addEventListener('click',showResult);
  }
  if(complete)setTimeout(()=>{if(game&&game.fillMode&&game.fillDone)showResult();},1400);
}
function showResult(){
  if(!game||!game.fillMode)return;
  const X=FX(),found=game.found.size,tot=game.total,miss=tot-found;
  const score=Math.max(0,found-(game.hints||0));
  let note='';
  if(typeof recordScore==='function'){const key='fill:'+game.fillKey;const isBest=recordScore(key,score,tot);if(isBest)note=' · 🏆 '+t('newRecord');else{const b=typeof bestScore==='function'?bestScore(key):null;if(b)note=' · '+t('bestLabel')+' '+b.pct+'%';}}
  stopTimer();
  const p=Math.round(found/tot*100);
  showScreen('result-screen');
  $('res-btn-back').textContent=t('back');
  $('res-emoji').textContent=miss===0?'🏆':p>=80?'🎉':p>=50?'👍':'📚';
  $('res-title').textContent=miss===0?X.doneTitle:X.giveTitle;
  $('res-l1').textContent=X.sum(found,tot,p);
  $('res-l2').textContent=X.sum2(fmt((game.fillEnd||Date.now())-game.fillStart),game.hints||0,miss)+note;
  $('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');$('btn-share').textContent=t('shareBtn');
  if(typeof checkAchievements==='function')checkAchievements();
}
async function startFillGame(key){
  if(!nameMap)buildNames();
  stopTimer();
  lastMode='fill';canClick=false;optsOpen=false;
  const all=Object.keys(C).map(Number).filter(id=>key==='world'||C[id].c===key);
  game={mode:'fill:'+key,fillMode:true,fillKey:key,activeContinents:key==='world'?null:new Set([key]),found:new Set(),correct:0,wrong:0,firstTry:0,total:0,skipped:0,hints:0,fillWrong:0,fillStart:Date.now(),fillDone:false,ids:[],queue:[]};
  showScreen('game-screen');$('opts-panel').style.display='none';
  updateAllText();await loadMap();
  game.ids=all.filter(id=>(visibleIds.has(id)||MS_IDS.has(id))&&C[id]);game.total=game.ids.length;
  const g=zoomForMode(key==='world'?'world':key);zoomToGeo(g.lon,g.lat,g.k);
  $('btn-skip').setAttribute('onclick','fillGiveUp()');
  ensureBox();game.fillStart=Date.now();
  clearFeedback&&clearFeedback();updateColors();updateStats();msg('');
  timer=setInterval(()=>{if(game&&game.fillMode&&!game.fillDone)updateFillStats();},500);
  const inp=document.getElementById('fill-input');if(inp){inp.value='';if(!COARSE)setTimeout(()=>inp.focus(),50);}
}
function fillGiveUp(){if(game&&game.fillMode&&!game.fillDone)finish(false);}
function fillStop(){ // beim Verlassen: Timer aus, Feld weg, "Aufgeben" wieder zu "Überspringen"
  stopTimer();
  const b=document.getElementById('fill-box');if(b)b.style.display='none';
  const sk=document.getElementById('btn-skip');if(sk)sk.setAttribute('onclick','skip()');
}
// Menügruppe für die Seite "Texteingabe & Multiple Choice"
function fillMenuGroup(){
  const X=FX(),n=k=>Object.keys(C).filter(id=>k==='world'||C[+id].c===k).length;
  const conts=['EU','AS','AF','NA','SA','OC'];
  return {cls:'gs-flag',head:X.head,items:[
    {icon:'🌐',title:X.world,sub:X.worldSub+' · '+n('world'),onclick:"startFillGame('world')"},
    {icon:'🗺️',title:X.conts,sub:conts.map(k=>(MODES[k]&&MODES[k][lang])||k).join(', '),panel:'fill-conts',
      renderPanel:()=>_cardsPanel(conts.map(k=>gsCard("startFillGame('"+k+"')",(MODES[k]&&MODES[k][lang])||k,n(k)+' '+(lang==='de'?'Länder':lang==='es'?'países':lang==='fr'?'pays':'countries'),'fill:'+k)),'gs-grid-pin')}
  ]};
}
window.startFillGame=startFillGame;window.fillGiveUp=fillGiveUp;window.fillStop=fillStop;window.fillMenuGroup=fillMenuGroup;window.updateFillStats=updateFillStats;
})();
