// Bumped on every pushed change so the live site's build can be visually compared
// against what was just deployed (shown in the home screen footer).
const BUILD_ID='2026-11-13 H';
// iOS WebKit (Safari, and every other iOS browser — Apple requires them all to use
// WebKit) fires its own proprietary gesturestart/gesturechange/gestureend events on
// two-finger touches, independent of touch/pointer events and independent of the
// touch-action CSS property. Left unprevented, a pinch on the map can trigger the
// OS's own page-zoom gesture fighting with d3-zoom's pinch handling — matching the
// "pinch does nothing for ~3s then jumps, next pan is unresponsive" reports, which
// persisted through several fixes aimed at our own zoom event handling because the
// actual conflict was happening a layer above any of that code.
['gesturestart','gesturechange','gestureend'].forEach(evt=>{
  document.addEventListener(evt,e=>e.preventDefault(),{passive:false});
});
const REDIRECTS=new Map();
function norm(s){return s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[łŁ]/g,'l').replace(/[đĐ]/g,'d').replace(/[øØ]/g,'o').replace(/[æÆ]/g,'ae').toLowerCase();}

// Zoom presets per continent [x, y, scale] — pixel coords tuned in the Natural-Earth projection
const ZOOMS={world:[480,250,1],EU:[520,160,3.5],AF:[510,280,2.2],AS:[680,200,2],NA:[220,190,2.2],SA:[310,350,2.2],OC:[810,370,2.8]};
// Same 6 continent presets, but as [lon, lat, scale] tuned directly under Mercator instead of
// being converted from the Natural-Earth pixel presets above. That conversion (see zoomForMode)
// round-trips through a point's *geographic* coordinates, which is correct in principle, but
// Mercator and Natural-Earth stretch latitude by very different amounts — a pixel anchor picked
// by eye in Natural-Earth space lands at the "wrong" visual spot once re-projected into Mercator
// (worst case: an anchor near the equator in NE space, where NE's own curvature happens to be
// showing higher latitudes, converts to a genuinely low latitude that's nowhere near the intended
// region — e.g. the EU preset landed in the Aegean/Egypt instead of Europe). Hand-verified in the
// live app (screenshot each continent under Mercator, iterate lon/lat/k until it's fully framed).
const ZOOMS_MERCATOR={EU:[12,48,2.05],AF:[18,6,1.7],AS:[85,26,1.15],NA:[-85,32,1.45],SA:[-58,-15,1.55],OC:[168,-20,1.15]};
const MAP_W=960,MAP_H=500;
let globeRot=[-12,-35]; // Drehung des Globus (d3.rotate: Mitte = [-lon,-lat]), siehe globe.js
// Central projection builder — switches between Natural Earth and Mercator, same interface for everything
function buildProjection(){
  if(projection==='mercator'){
    // No rotate() here: the infinite wrap tiling below assumes the map edges line up
    // exactly with lon ±180, which a rotation offset would break.
    // translateY is chosen (not just MAP_H/2) so that 75°N lands exactly on y=0 — the canvas's
    // own top edge — rather than clipping at some arbitrary lat-derived Y that doesn't line up
    // with the fixed 0..MAP_H viewBox. At this scale that puts -58°S almost exactly on y=MAP_H
    // too (off by under a pixel), so clipping to the viewBox's own bounds below cuts Antarctica
    // and the High Arctic — neither has any quiz target — with no gap between the last real
    // geometry and the canvas edge. A gap there would matter now that preserveAspectRatio is
    // "slice": it stretches the *viewBox*, not the geometry, to cover the container, so any
    // mismatch between the two used to show up as a flat, content-less band past the real edge.
    const scale=152.8;
    const proj=d3.geoMercator().scale(scale).translate([MAP_W/2,0]);
    proj.translate([MAP_W/2,-proj([0,75])[1]]);
    // No rotate() here: the infinite wrap tiling below assumes the map edges line up
    // exactly with lon ±180, which a rotation offset would break.
    return proj.clipExtent([[-80,0],[MAP_W+80,MAP_H]]);
  }
  // Globus: Orthografische Projektion, Kugel passt mit 235 Radius in die 500 hohe Fläche (globe.js dreht sie)
  if(projection==='globe')return d3.geoOrthographic().scale(235).translate([MAP_W/2,MAP_H/2]).rotate(globeRot).clipAngle(90).precision(window.Globe?window.Globe.precision():0.8);
  // Equal Earth (Šavrič/Patterson/Jenny 2018): flächentreu, sieht Natural Earth ähnlich. Scale 163 füllt die
  // 960x500-Fläche etwa so wie Natural Earth bei 153 (Equal Earth ist bei gleichem Scale etwas flacher).
  if(projection==='equal')return d3.geoEqualEarth().scale(163).translate([MAP_W/2,MAP_H/2]).rotate([-8,0]);
  return d3.geoNaturalEarth1().scale(153).translate([MAP_W/2,MAP_H/2]).rotate([-8,0]);
}
// Convert a pixel preset (tuned in Natural Earth) to lon/lat so it works in any projection
function zoomForMode(mode){
  // Continent presets have their own Mercator-tuned lon/lat/k (see ZOOMS_MERCATOR) — skip the
  // Natural-Earth pixel conversion below entirely rather than feed it through a reprojection that
  // puts the anchor in the wrong place (see comment on ZOOMS_MERCATOR).
  if(projection==='mercator'&&ZOOMS_MERCATOR[mode]){
    const zm=ZOOMS_MERCATOR[mode];
    return{lon:zm[0],lat:zm[1],k:zm[2]};
  }
  const z=ZOOMS[mode]||ZOOMS.world;
  const ne=d3.geoNaturalEarth1().scale(153).translate([MAP_W/2,MAP_H/2]).rotate([-8,0]);
  const ll=ne.invert([z[0],z[1]]);
  let lat=ll[1];
  // The 'world' preset centers on the equator, which made sense for the old unclipped Mercator
  // (translateY=MAP_H/2 put the equator exactly at the canvas's own vertical middle). Now that
  // buildProjection() shifts translateY so the clip range lands exactly on [0,MAP_H] — asymmetric
  // in latitude, since Mercator stretches high latitudes more than low ones — the equator is no
  // longer that range's midpoint, so centering on it at k=1 leaves a gap at one edge (there's less
  // clipped content on one side of the equator than the viewport's own half-height). Re-derive the
  // latitude that actually IS the clip range's vertical midpoint instead of hardcoding one, so this
  // keeps working if the clip bounds in buildProjection() are ever retuned.
  // Difficulty tiers (see DIFFICULTY_TIERS) scatter countries across the whole globe just like
  // 'world' does — same "world" ZOOMS fallback above, so they need the same re-centering fix.
  const isWorldFramed=mode==='world'||(typeof mode==='string'&&mode.startsWith('diff'));
  if(isWorldFramed&&projection==='mercator'&&currentProj&&currentProj.invert)lat=currentProj.invert([MAP_W/2,MAP_H/2])[1];
  return {lon:ll[0],lat,k:z[2]};
}
let _zoomHint=null; // Globus: Zielort (lon,lat), wenn nur Bildschirmkoordinaten übergeben werden
function zoomToGeo(lon,lat,k){if(projection==='globe'&&window.Globe){window.Globe.flyTo(lon,lat,k);return;}if(!currentProj)return;const p=currentProj([lon,lat]);if(p)zoomTo(p[0],p[1],k);}

// mtn: mountain-range fill — deliberately not sph (that's water) or avail (that's plain land).
// Brown reads as "elevation" the same way it does on real hypsometric-tinted maps, and stays
// unambiguous against every theme's own water/land/found colors.
// border: chosen per-theme after live A/B testing across every quiz (see git history) — atlas
// and terrain both moved off their original hue (a lighter blue, and a dark green too close to
// terrain's own land fill), while neon's magenta border already fit that theme's glow aesthetic
// and stayed.
const THEMES={atlas:{bg:'#3a80b8',sph:'#4a90cc',grd:'#2a70a8',avail:'#e0d4b4',found:'#4a8a30',dim:'#a8c4d8',hov:'#ccc0a0',wrong:'#c03820',skipped:'#d97c1a',bar:'#4a8a30',dot:'rgba(0,0,0,0.85)',border:'#0a2a52',mtn:'#8c6239'},neon:{bg:'#0a0420',sph:'#0e0838',grd:'#2a1550',avail:'#4a2a6a',found:'#05d9e8',dim:'#1a0e30',hov:'#a66bff',wrong:'#ff1f4f',skipped:'#ff8a00',bar:'#05d9e8',dot:'rgba(5,217,232,0.9)',border:'#c030e0',mtn:'#e8b923'},terrain:{bg:'#2878a8',sph:'#3088b8',grd:'#1e6898',avail:'#6a9a58',found:'#2e7d20',dim:'#8ab0c8',hov:'#e8dca0',wrong:'#c03820',skipped:'#d97c1a',bar:'#2e7d20',dot:'rgba(0,0,0,0.85)',border:'#000',mtn:'#7a5230'},cartoon:{bg:'#37b6ff',sph:'#5fc8ff',grd:'#2fa0e8',avail:'#ffd23f',found:'#2ee66b',dim:'#ffeaa6',hov:'#ff8fd0',wrong:'#ff3d3d',skipped:'#ff9f1c',bar:'#2ee66b',dot:'#1a1a2e',border:'#1a1a2e',mtn:'#b86b2b',bw:3.2}};
const CONT_KEYS=['EU','AF','AS','NA','SA','OC'];
const THEME_DOT={atlas:'#b0a080',neon:'#ff2a6d',terrain:'#6a9a58',cartoon:'#ffd23f'};
// Colorblind Mode is a toggle in the global options (home screen), not a 4th Design — it's
// orthogonal to which Design is picked, not a competing aesthetic. Applied as an override on
// top of whichever theme is active (Okabe-Ito palette: designed to stay pairwise distinguishable
// under protanopia/deuteranopia/tritanopia, unlike every theme's own found/wrong pair, which
// relies on a red-vs-green distinction those conditions make hard to tell apart). Remembers each
// theme's real values in THEME_ORIGINALS so turning the toggle back off restores them exactly.
const COLORBLIND_OVERRIDE={found:'#009e73',wrong:'#d55e00',skipped:'#cc79a7',hov:'#e69f00',bar:'#009e73'};
const THEME_ORIGINALS={};
for(const k of Object.keys(THEMES))THEME_ORIGINALS[k]={found:THEMES[k].found,wrong:THEMES[k].wrong,skipped:THEMES[k].skipped,hov:THEMES[k].hov,bar:THEMES[k].bar};
let colorblindMode=false;
function _applyColorblindOverride(){
  for(const k of Object.keys(THEMES))Object.assign(THEMES[k],colorblindMode?COLORBLIND_OVERRIDE:THEME_ORIGINALS[k]);
}
function setColorblindMode(v){
  colorblindMode=v;
  _applyColorblindOverride();
  applyTheme();
  if(worldData&&$('game-screen')&&$('game-screen').style.display!=='none'&&game&&Object.keys(game).length)renderMap(worldData);
  if(_regGame&&$('region-screen')&&$('region-screen').style.display!=='none')_renderRegionMap(_regGame.cfg,_regGame.features);
  renderOptions();
  persistSettings();
}
const TERRAIN_BIOME=(()=>{const m=new Map();
  const set=(ids,c)=>ids.forEach(id=>m.set(id,c));
  const desert='#d4b87a',tropForest='#2a7a38',savanna='#9aaa48',temperate='#5a9a50',
        boreal='#6a9068',steppe='#b0a860',medit='#8ab050',highland='#8a8a72',arid='#c8b470',tundra='#a0b0a0';
  // Sahara + North Africa
  set([12,434,788,818,504,478,729,148,562,466],desert);
  // Middle East + Central Asia deserts
  set([682,784,414,634,512,887,400,760,364,368,795,860],desert);
  // Arabian fringe / semi-arid
  set([48,422],arid);
  // Tropical Africa
  set([120,178,180,226,266,24,108,646,800,834,288,694,430,324,624,270,384,768,204,854],tropForest);
  // East Africa savanna
  set([404,706,728,231,262,232,716,508,454,516,72,748,426],savanna);
  // Southern Africa
  set([710],savanna);
  // Madagascar
  set([450],tropForest);
  // West Africa coast
  set([566,686],savanna);
  // North Africa (Egypt, Sudan)
  set([818,729],desert);
  // Europe temperate
  set([276,250,56,528,442,826,372,208,616,203,703,348,642,112,804,498,40,756,380,705,191,70,688,807,499,100,233,428,440],temperate);
  // Mediterranean Europe
  set([724,620,300,792,196],medit);
  // Nordic / boreal
  set([578,752,246,352],boreal);
  // Microstates Europe
  set([492,336,674,20,438,470],medit);
  // Russia
  set([643],boreal);
  // South Asia
  set([356,586,50,144],tropForest);
  // Himalayan
  set([524,64],highland);
  // Central Asia steppe
  set([398,417,762],steppe);
  // Southeast Asia tropical
  set([764,704,116,418,104,458,360,608,626,702,96],tropForest);
  // East Asia
  set([156,410,408,392],temperate);
  set([496],steppe);
  // Caucasus
  set([268,51,31],temperate);
  // South America tropical
  set([76,170,218,862,328,740,68],tropForest);
  // South America south
  set([32,858,152,600],temperate);
  // Central America + Caribbean
  set([484,320,340,222,188,591,84,192,332,214,44,388,780,52,308,662,659,670,28,212],tropForest);
  // North America
  set([840],temperate);set([124],boreal);
  // Oceania
  set([36],arid);set([554],temperate);set([598],tropForest);
  // Pacific islands
  set([242,90,548,583,584,585,296,520,798,776,882],tropForest);
  // Indian Ocean islands
  set([462,690,480,174],tropForest);
  // Atlantic islands
  set([132,678],tropForest);
  // Greenland/Antarctica
  set([304,10],tundra);
  // Angola, Mozambique, Tanzania
  set([24,508,834],savanna);
  // Kazakhstan
  set([398],steppe);
  // Afghanistan
  set([4],arid);
  // Pakistan
  set([586],arid);
  // Mongolia
  set([496],steppe);
  // Australia
  set([36],arid);
  return m;
})();
function terrainFill(rawId){return TERRAIN_BIOME.get(eff(rawId))||THEMES.terrain.avail;}
const ISO2={4:'af',8:'al',12:'dz',20:'ad',24:'ao',28:'ag',31:'az',32:'ar',36:'au',40:'at',44:'bs',48:'bh',50:'bd',51:'am',52:'bb',56:'be',64:'bt',68:'bo',70:'ba',72:'bw',76:'br',84:'bz',90:'sb',96:'bn',100:'bg',104:'mm',108:'bi',112:'by',116:'kh',120:'cm',124:'ca',132:'cv',140:'cf',144:'lk',148:'td',152:'cl',156:'cn',158:'tw',170:'co',174:'km',178:'cg',180:'cd',188:'cr',191:'hr',192:'cu',196:'cy',203:'cz',204:'bj',208:'dk',212:'dm',214:'do',218:'ec',222:'sv',226:'gq',231:'et',232:'er',233:'ee',242:'fj',246:'fi',250:'fr',262:'dj',266:'ga',268:'ge',270:'gm',275:'ps',276:'de',288:'gh',296:'ki',300:'gr',308:'gd',320:'gt',324:'gn',328:'gy',332:'ht',336:'va',340:'hn',348:'hu',352:'is',356:'in',360:'id',364:'ir',368:'iq',372:'ie',376:'il',380:'it',383:'xk',384:'ci',388:'jm',392:'jp',398:'kz',400:'jo',404:'ke',408:'kp',410:'kr',414:'kw',417:'kg',418:'la',422:'lb',426:'ls',428:'lv',430:'lr',434:'ly',438:'li',440:'lt',442:'lu',450:'mg',454:'mw',458:'my',462:'mv',466:'ml',470:'mt',478:'mr',480:'mu',484:'mx',492:'mc',496:'mn',498:'md',499:'me',504:'ma',508:'mz',512:'om',516:'na',520:'nr',524:'np',528:'nl',548:'vu',554:'nz',558:'ni',562:'ne',566:'ng',578:'no',583:'fm',584:'mh',585:'pw',586:'pk',591:'pa',598:'pg',600:'py',604:'pe',608:'ph',616:'pl',620:'pt',624:'gw',626:'tl',634:'qa',642:'ro',643:'ru',646:'rw',659:'kn',662:'lc',670:'vc',674:'sm',678:'st',682:'sa',686:'sn',688:'rs',690:'sc',694:'sl',702:'sg',703:'sk',704:'vn',705:'si',706:'so',710:'za',716:'zw',724:'es',728:'ss',729:'sd',740:'sr',748:'sz',752:'se',756:'ch',760:'sy',762:'tj',764:'th',768:'tg',776:'to',780:'tt',784:'ae',788:'tn',792:'tr',795:'tm',798:'tv',800:'ug',804:'ua',807:'mk',818:'eg',826:'gb',834:'tz',840:'us',854:'bf',858:'uy',860:'uz',862:'ve',882:'ws',887:'ye',894:'zm'};
// Flag-quiz difficulty buckets — disjoint sets; HARD = all remaining ISO2 countries
const FLAG_BEGINNER=new Set([276,250,380,724,826,840,124,392,156,76,36,756,752,208,578,792,356,484,528,410,32,643,56,40,616,372,710,554,804,300]);
const FLAG_EASY=new Set([246,620,818,376,682,192,152,360,764,704,586,604,566,862,203,348,100,191,112,442,470,196,364,368,400,422,788,642,705,703,233,428,440,352,8,688,70,807,499,498,408,458,608,702,170,218,858]);
const FLAG_MEDIUM=new Set([760,784,414,634,398,4,50,144,524,116,104,268,496,887,512,504,12,434,231,404,834,800,288,686,24,716,516,68,600,591,188,320,388,780,384,120,180,178,706,729,148,466,562,324,430,694,854,140,48,242,882,776,52,132,480,462,690,678,174,262]);
function flagIdsForDifficulty(diff){
  const all=Object.keys(C).map(Number).filter(id=>ISO2[id]);
  if(diff==='beginner')return all.filter(id=>FLAG_BEGINNER.has(id));
  if(diff==='easy')return all.filter(id=>FLAG_EASY.has(id));
  if(diff==='medium')return all.filter(id=>FLAG_MEDIUM.has(id));
  if(diff==='hard')return all.filter(id=>!FLAG_BEGINNER.has(id)&&!FLAG_EASY.has(id)&&!FLAG_MEDIUM.has(id));
  return all;
}
const _cc=k=>Object.values(C).filter(v=>k==='world'||v.c===k).length;
const MODES={world:{de:'Alle Länder',en:'All Countries',es:'Todos los países',fr:'Tous les pays',cnt:_cc('world')},EU:{de:'Europa',en:'Europe',es:'Europa',fr:'Europe',cnt:_cc('EU')},AF:{de:'Afrika',en:'Africa',es:'África',fr:'Afrique',cnt:_cc('AF')},AS:{de:'Asien',en:'Asia',es:'Asia',fr:'Asie',cnt:_cc('AS')},NA:{de:'Nordamerika',en:'N. America',es:'Norteamérica',fr:'Amérique du Nord',cnt:_cc('NA')},SA:{de:'Südamerika',en:'S. America',es:'Sudamérica',fr:'Amérique du Sud',cnt:_cc('SA')},OC:{de:'Ozeanien',en:'Oceania',es:'Oceanía',fr:'Océanie',cnt:_cc('OC')},custom:{de:'Eigener Modus',en:'Custom Mode',es:'Modo Personalizado',fr:'Mode Personnalisé',cnt:'⚙'}};
const TX={
  de:{title:'Weltkarte Quiz',sub:'Ein Ländername erscheint — finde und klicke es auf der Karte.',find:'Finde dieses Land',findLake:'Finde diesen See',findRiver:'Finde diesen Fluss',findCity:'Finde diese Stadt',findMountain:'Finde diesen Gipfel',findRange:'Finde dieses Gebirge',cityQuiz:'Städte-Quiz',citySub:'Ein Stadtname erscheint — finde und klicke sie auf der Karte.',cities:'Städte',cityDiffs:[{key:'easy',label:'Einfach'},{key:'medium',label:'Mittel'},{key:'hard',label:'Schwer'}],cityCountries:[{key:'DE',label:'Deutschland'},{key:'US',label:'USA'},{key:'FR',label:'Frankreich'},{key:'IT',label:'Italien'},{key:'CN',label:'China'},{key:'JP',label:'Japan'},{key:'IN',label:'Indien'},{key:'BR',label:'Brasilien'},{key:'AU',label:'Australien'},{key:'MX',label:'Mexiko'}],pinQuiz:'Drop a Pin',pinSub:'Eine Stadt erscheint — setze die Stecknadel möglichst nah an ihren Standort.',findPin:'Wo liegt diese Stadt?',pinEuLabel:'Europa',pointsLbl:'Punkte',roundsLbl:'Runden',avgLbl:'Ø Distanz',pinFb:(km,pts)=>'📍 '+km+' km · +'+pts+' P',lakeQuiz:'Seen-Quiz',lakeSub:'Ein See erscheint — finde und klicke ihn auf der Karte.',lakeDiffs:[{key:'beginner',label:'Anfänger',count:13},{key:'easy',label:'Einfach',count:44},{key:'medium',label:'Mittel',count:76},{key:'hard',label:'Schwer',count:144}],lakes:'Seen',riverQuiz:'Fluss-Quiz',riverSub:'Ein Flussname erscheint — finde und klicke ihn auf der Karte.',riverDiffs:[{key:'beginner',label:'Anfänger',count:14},{key:'easy',label:'Einfach',count:41},{key:'medium',label:'Mittel',count:80},{key:'hard',label:'Schwer',count:130}],rivers:'Flüsse',mountainQuiz:'Gebirge-Quiz',mountainSub:'Ein Gebirge oder Gipfel erscheint — finde und klicke es auf der Karte.',mountainRanges:'Gebirgszüge',peaks:'Gipfel',rangeDiffs:[{key:'beginner',label:'Sehr leicht',count:10},{key:'easy',label:'Leicht',count:19},{key:'medium',label:'Mittel',count:90},{key:'hard',label:'Schwer',count:200}],mountainDiffs:[{key:'beginner',label:'Sehr leicht',count:10},{key:'easy',label:'Leicht',count:18},{key:'medium',label:'Mittel',count:100},{key:'hard',label:'Schwer',count:250}],flagQuiz:'Flaggen Quiz',flagSub:'Eine Flagge erscheint — tippe den Ländernamen ein.',flagPlaceholder:'Land eingeben …',flagWorld:'Weltweit',flagDiffs:[{key:'beginner',label:'Anfänger'},{key:'easy',label:'Einfach'},{key:'medium',label:'Mittel'},{key:'hard',label:'Schwer'}],homeTitle:'Geografie-Spiele',homeSub:'Teste dein Wissen über die Welt — Länder, Seen, Flüsse und Flaggen.',playBtn:'Spielen',optionsLbl:'Optionen',homeBtn:'← Start',scrollHint:'Scrollen für mehr',mapQuiz:'Weltkarte',load:'Karte wird geladen …',back:'← Menü',foundLbl:'gefunden',correctLbl:'richtig',wrongLbl:'falsch',remLbl:'verbleibend',resTitle:'Quiz abgeschlossen!',again:'Nochmal spielen',newgame:'Zurück zur Auswahl',shareBtn:'📤 Teilen',shareCopied:'In Zwischenablage kopiert!',shareTitle:'Weltkarte Quiz',randomChallengeBtn:'🎲 Random Challenge',dailyChallengeBtn:'📅 Tages-Challenge',dailyLoginRequired:'Anmelden, um die Tages-Challenge zu spielen',timeLbl:'Zeit',dailyDoneTitle:'Heute schon gespielt!',dailyLeaderboardTitle:'Bestenliste heute',dailyHintTitle:'Achtung, Zeit läuft!',dailyHintText:'Die Tages-Challenge läuft auf Zeit — je schneller du fertig bist, desto besser deine Platzierung in der heutigen Bestenliste.',dailyHintDontShow:'Nicht mehr anzeigen',dailyHintBtn:"Los geht's!",langLbl:'Sprache',themeLbl:'Design',colorblindLabel:'Farbenblind-Modus',colorblindTip:'Ersetzt Grün/Rot bei richtig/falsch durch besser unterscheidbare Farben, unabhängig vom gewählten Design.',colorblindOn:'An',colorblindOff:'Aus',projLbl:'Kartenansicht',projStd:'Natural Earth',projEqual:'Equal Earth',projGlobe:'Globus',projMerc:'Mercator',foundModeLabel:'Richtig geraten',keepOn:'Markiert',keepOff:'Nicht markiert',wrongHintLabel:'Hinweise bei Fehlern',wrongHintTip:'Nach einer falschen Antwort wird das richtige Ziel kurz angezeigt.',wrongHintOn:'Anzeigen',wrongHintOff:'Ausblenden',skipHintLabel:'Hinweise beim Überspringen',skipHintTip:'Zeigt nach dem Überspringen das übersprungene Ziel kurz an.',skipHintOn:'Anzeigen',skipHintOff:'Ausblenden',countries:'Länder',zoomTip:'Zoom & Pan möglich',skipLbl:'Überspringen',skippedLbl:'übersprungen',correctFb:n=>'✓ Richtig! '+n,wrongFb:n=>'✗ Das war '+n,res1:(a,b,c)=>`${a} von ${b} beim 1. Versuch (${c} %)`,res2:(a,b)=>`${a} richtig, ${b} daneben`,challengeScore:n=>'Punktzahl: '+n,themes:{atlas:'Atlas',neon:'Cyberpunk',terrain:'Terrain',cartoon:'Cartoon'},cback:'← Zurück',ctitle:'Eigener Modus',clblCont:'Kontinente',clblCount:'Anzahl Länder',clblOf:'verfügbar',clblAll:'Alle Länder',clblCountries:'Länder wählen',cbtnAll:'Alle',cbtnNone:'Keine',cbtnStart:'Starten',signIn:'Anmelden',signUp:'Registrieren',signOut:'Abmelden',loginTitle:'Anmelden',registerTitle:'Konto erstellen',authEmail:'E-Mail',authPw:'Passwort',authName:'Anzeigename (optional)',loggedIn:'Angemeldet als',toRegister:'Noch kein Konto? Registrieren',toLogin:'Bereits ein Konto? Anmelden',authFillAll:'Bitte E-Mail und Passwort eingeben.',authNotConfigured:'Firebase ist noch nicht konfiguriert.',authErrEmail:'Ungültige E-Mail-Adresse.',authErrInUse:'Diese E-Mail wird bereits verwendet.',authErrWeak:'Passwort zu schwach (min. 6 Zeichen).',authErrCred:'E-Mail oder Passwort falsch.',authErrGeneric:'Etwas ist schiefgelaufen. Bitte erneut versuchen.',authUsername:'Benutzername',showPw:'Passwort anzeigen',forgotPw:'Passwort vergessen?',resetSent:'E-Mail zum Zurücksetzen wurde gesendet.',enterEmailFirst:'Bitte zuerst deine E-Mail eingeben.',authUserRequired:'Bitte einen Benutzernamen wählen.',authUserInvalid:'3–20 Zeichen: Buchstaben, Zahlen, _',authUserTaken:'Benutzername bereits vergeben.',googleBtn:'Mit Google anmelden',orSep:'oder',newRecord:'Neuer Rekord!',bestLabel:'Bestwert',roundLimitLbl:'Anzahl Ziele',allTargetsLbl:'Alle Ziele',normalMode:'Normaler Modus',learnModeLbl:'Lernmodus',learnModeLogin:'Anmelden für Lernmodus',learnModeDesc:'Häufig falsch gemachte Fragen kommen zuerst. Themen, die du bereits 3× gemeistert hast, werden ausgeblendet.',learnModeCta:'→ Klicken zum Anmelden',inputQuiz:'Errate das Land',inputSub:'Flagge, Hauptstadt oder Umriss — tippe den richtigen Namen ein.',flagCardSub:'Welche Flagge ist das?',capitalQuiz:'Hauptstadt-Quiz',capitalCardSub:'Land ↔ Hauptstadt',outlineQuiz:'Umriss-Quiz',outlineCardSub:'Erkenne die Landesform',languageQuiz:'Sprachen-Quiz',languageCardSub:'Welche Sprache ist das?',currencyQuiz:'Währungs-Quiz',currencyCardSub:'Welche Währung ist das?',wappenQuiz:'Wappen-Quiz',wappenCardSub:'Welches Wappen ist das?',neighborQuiz:'Nachbarland-Rätsel',neighborCardSub:'Welches Land grenzt an diese?',iqAskLanguage:'Welche Sprache ist das?',iqAskCurrency:'Welche Währung ist das?',iqAskNeighbor:'Welches Land grenzt an diese Länder?',langPlaceholder:'Sprache eingeben …',curPlaceholder:'Währung eingeben …',languages:'Sprachen',currencies:'Währungen',cfgRegion:'Region',cfgDiff:'Schwierigkeit',cfgDir:'Richtung',cfgStart:'Quiz starten',dirC2Cap:'Land → Hauptstadt',dirCap2C:'Hauptstadt → Land',dirFlag2Cap:'Flagge → Hauptstadt',diffAll:'Alle',regWorld:'Welt',iqAskCapital:'Wie heißt die Hauptstadt?',iqAskCountry:'Welches Land?',capPlaceholder:'Hauptstadt eingeben …',cfgDropdownLabel:'Vorschläge',cfgDropdownOn:'Anzeigen',cfgDropdownOff:'Ausblenden',cfgSkipHintLabel:'Hinweis beim Überspringen',cfgSkipHintOn:'Anzeigen',cfgSkipHintOff:'Ausblenden',regionQuiz:'Regionen',regionSub:'Ein Regionsname erscheint — finde und klicke sie auf der Karte.',findRegion:'Finde diese Region',regions:'Regionen',popQuiz:'Bevölkerung',popSub:'Die meist- oder wenigst-bevölkerten Länder — finde und klicke sie auf der Karte.',findPop:'Welches Land?',popMostQ:'Bevölkerungsreichstes Land',popLeastQ:'Bevölkerungsärmstes Land',popMostRankQ:n=>n+'. bevölkerungsreichstes Land',popLeastRankQ:n=>n+'. bevölkerungsärmstes Land',areaQuiz:'Fläche',findArea:'Welches Land?',findTrivia:'Welches Land?',areaMostQ:'Flächengrößtes Land',areaLeastQ:'Flächenkleinstes Land',areaMostRankQ:n=>n+'. flächengrößtes Land',areaLeastRankQ:n=>n+'. flächenkleinstes Land',popMostNQ:n=>'Die '+n+' bevölkerungsreichsten',popLeastNQ:n=>'Die '+n+' bevölkerungsärmsten',areaMostNQ:n=>'Die '+n+' flächengrößten',areaLeastNQ:n=>'Die '+n+' flächenkleinsten',happyMostQ:'Glücklichstes Land',happyLeastQ:'Unglücklichstes Land',happyMostRankQ:n=>n+'. glücklichstes Land',happyLeastRankQ:n=>n+'. unglücklichstes Land',happyMostNQ:n=>'Die '+n+' glücklichsten',happyLeastNQ:n=>'Die '+n+' unglücklichsten',exportMostQ:'Höchstes Exportvolumen',exportLeastQ:'Niedrigstes Exportvolumen',exportMostRankQ:n=>n+'. höchstes Exportvolumen',exportLeastRankQ:n=>n+'. niedrigstes Exportvolumen',exportMostNQ:n=>'Die '+n+' größten Exporteure',exportLeastNQ:n=>'Die '+n+' kleinsten Exporteure',heritageMostQ:'Land mit den meisten UNESCO-Welterbestätten',heritageMostRankQ:n=>'Platz '+n+' nach Anzahl der UNESCO-Welterbestätten',heritageMostNQ:n=>'Die '+n+' Länder mit den meisten UNESCO-Welterbestätten',findTriviaN:'Welche Länder?',catHeading:'Was möchtest du spielen?',catSub:'Wähle eine Spielart aus',catClickTitle:'Auf der Karte anklicken',catClickSub:'Länder, Regionen und Trivia auf der Weltkarte finden',catPinTitle:'Drop-a-Pin',catPinSub:'Stecknadel möglichst nah an den Standort setzen',catInputTitle:'Texteingabe & Multiple Choice',catInputSub:'Flaggen, Wappen, Hauptstädte und Umrisse',catOtherTitle:'Weitere Weltkarten-Quizzes',catOtherSub:'Städte, Flüsse, Seen und Gebirge anklicken',clickRootHeading:'Auf der Karte anklicken',clickRootSub:'Länder oder Regionen?',landerTitle:'Länder',landerCardSub:'Weltkarte, Kontinente, Trivia & mehr',regionCardSub:'Bundesländer, Staaten & mehr',landerRootSub:'Wähle eine Spielart',optWorld:'Weltkarte',optWorldSub:'Alle 197 Länder',optContinents:'Kontinente',continentsSub:'Wähle einen Kontinent',optDifficulty:'Schwierigkeit',difficultySub:'Länder nach Bevölkerung sortiert',diffTierLabels:['Sehr leicht','Leicht','Mittel','Schwer','Sehr schwer'],comingSoon:'Bald verfügbar',optTrivia:'Trivia',triviaSub:'Besondere Fragen zu Ländern',optCustom:'Eigener Modus',optCustomSub:'Kontinente & Anzahl frei wählen',pinTriviaLbl:'Trivia',landmarks:'Orte',pinPeopleLbl:'Geburtsorte berühmter Personen',personsLbl:'Personen',findPinPerson:'Wo wurde diese Person geboren?',findPinTrivia:'Wo liegt das?',perQuizLbl:'pro Quiz',wrongShort:'Falsch!'},
  en:{title:'World Map Quiz',sub:'A country name appears — find and click it on the map.',find:'Find this country',findLake:'Find this lake',findRiver:'Find this river',findCity:'Find this city',findMountain:'Find this peak',findRange:'Find this mountain range',cityQuiz:'City Quiz',citySub:'A city name appears — find and click it on the map.',cities:'Cities',cityDiffs:[{key:'easy',label:'Easy'},{key:'medium',label:'Medium'},{key:'hard',label:'Hard'}],cityCountries:[{key:'DE',label:'Germany'},{key:'US',label:'USA'},{key:'FR',label:'France'},{key:'IT',label:'Italy'},{key:'CN',label:'China'},{key:'JP',label:'Japan'},{key:'IN',label:'India'},{key:'BR',label:'Brazil'},{key:'AU',label:'Australia'},{key:'MX',label:'Mexico'}],pinQuiz:'Drop a Pin',pinSub:'A city appears — drop the pin as close to its location as you can.',findPin:'Where is this city?',pinEuLabel:'Europe',pointsLbl:'Points',roundsLbl:'Rounds',avgLbl:'Avg distance',pinFb:(km,pts)=>'📍 '+km+' km · +'+pts+' P',lakeQuiz:'Lake Quiz',lakeSub:'A lake name appears — find and click it on the map.',lakeDiffs:[{key:'beginner',label:'Beginner',count:13},{key:'easy',label:'Easy',count:44},{key:'medium',label:'Medium',count:76},{key:'hard',label:'Hard',count:144}],lakes:'Lakes',riverQuiz:'River Quiz',riverSub:'A river name appears — find and click it on the map.',riverDiffs:[{key:'beginner',label:'Beginner',count:14},{key:'easy',label:'Easy',count:41},{key:'medium',label:'Medium',count:80},{key:'hard',label:'Hard',count:130}],rivers:'Rivers',mountainQuiz:'Mountain Quiz',mountainSub:'A mountain range or peak appears — find and click it on the map.',mountainRanges:'Mountain Ranges',peaks:'Peaks',rangeDiffs:[{key:'beginner',label:'Very Easy',count:10},{key:'easy',label:'Easy',count:19},{key:'medium',label:'Medium',count:90},{key:'hard',label:'Hard',count:200}],mountainDiffs:[{key:'beginner',label:'Very Easy',count:10},{key:'easy',label:'Easy',count:18},{key:'medium',label:'Medium',count:100},{key:'hard',label:'Hard',count:250}],flagQuiz:'Flag Quiz',flagSub:'A flag appears — type the country name.',flagPlaceholder:'Enter country …',flagWorld:'Worldwide',flagDiffs:[{key:'beginner',label:'Beginner'},{key:'easy',label:'Easy'},{key:'medium',label:'Medium'},{key:'hard',label:'Hard'}],homeTitle:'World Geography Games',homeSub:'Test your knowledge of the world — countries, lakes, rivers and flags.',playBtn:'Play',optionsLbl:'Options',homeBtn:'← Home',scrollHint:'Scroll for more',mapQuiz:'World Map',load:'Loading map …',back:'← Menu',foundLbl:'found',correctLbl:'correct',wrongLbl:'wrong',remLbl:'remaining',resTitle:'Quiz complete!',again:'Play again',newgame:'Back to selection',shareBtn:'📤 Share',shareCopied:'Copied to clipboard!',shareTitle:'World Map Quiz',randomChallengeBtn:'🎲 Random Challenge',dailyChallengeBtn:'📅 Daily Challenge',dailyLoginRequired:'Sign in to play the Daily Challenge',timeLbl:'Time',dailyDoneTitle:'Already played today!',dailyLeaderboardTitle:"Today's leaderboard",dailyHintTitle:"Heads up, it's timed!",dailyHintText:"The Daily Challenge is timed — the faster you finish, the better your spot on today's leaderboard.",dailyHintDontShow:"Don't show again",dailyHintBtn:"Let's go!",langLbl:'Language',themeLbl:'Theme',colorblindLabel:'Colorblind Mode',colorblindTip:'Replaces green/red for correct/wrong with more distinguishable colors, independent of the chosen theme.',colorblindOn:'On',colorblindOff:'Off',projLbl:'Map view',projStd:'Natural Earth',projEqual:'Equal Earth',projGlobe:'Globe',projMerc:'Mercator',foundModeLabel:'Correct answers',keepOn:'Marked',keepOff:'Not marked',wrongHintLabel:'Hints on errors',wrongHintTip:'After a wrong answer, the correct country is briefly revealed.',wrongHintOn:'Show',wrongHintOff:'Hide',skipHintLabel:'Skip hints',skipHintTip:'Shows the skipped target briefly after skipping.',skipHintOn:'Show',skipHintOff:'Hide',countries:'countries',zoomTip:'Zoom & pan supported',skipLbl:'Skip',skippedLbl:'skipped',correctFb:n=>'✓ Correct! '+n,wrongFb:n=>'That was '+n,res1:(a,b,c)=>`${a} of ${b} on first try (${c}%)`,res2:(a,b)=>`${a} correct, ${b} missed`,challengeScore:n=>'Score: '+n,themes:{atlas:'Atlas',neon:'Cyberpunk',terrain:'Terrain',cartoon:'Cartoon'},cback:'← Back',ctitle:'Custom Mode',clblCont:'Continents',clblCount:'Number of countries',clblOf:'available',clblAll:'All countries',clblCountries:'Select countries',cbtnAll:'All',cbtnNone:'None',cbtnStart:'Start',signIn:'Sign in',signUp:'Sign up',signOut:'Sign out',loginTitle:'Sign in',registerTitle:'Create account',authEmail:'Email',authPw:'Password',authName:'Display name (optional)',loggedIn:'Signed in as',toRegister:"No account? Sign up",toLogin:'Already have an account? Sign in',authFillAll:'Please enter email and password.',authNotConfigured:'Firebase is not configured yet.',authErrEmail:'Invalid email address.',authErrInUse:'This email is already in use.',authErrWeak:'Password too weak (min. 6 characters).',authErrCred:'Wrong email or password.',authErrGeneric:'Something went wrong. Please try again.',authUsername:'Username',showPw:'Show password',forgotPw:'Forgot password?',resetSent:'Password reset email sent.',enterEmailFirst:'Please enter your email first.',authUserRequired:'Please choose a username.',authUserInvalid:'3–20 chars: letters, numbers, _',authUserTaken:'Username already taken.',googleBtn:'Sign in with Google',orSep:'or',newRecord:'New record!',bestLabel:'Best',roundLimitLbl:'Round limit',allTargetsLbl:'All targets',normalMode:'Normal Mode',learnModeLbl:'Learn Mode',learnModeLogin:'Sign in for Learn Mode',learnModeDesc:'Frequent mistakes appear first. Topics you\'ve mastered 3× are hidden.',learnModeCta:'→ Click to sign in',inputQuiz:'Name the country',inputSub:'Flag, capital or outline — type the right name.',flagCardSub:'Which flag is this?',capitalQuiz:'Capital Quiz',capitalCardSub:'Country ↔ capital',outlineQuiz:'Outline Quiz',outlineCardSub:'Recognise the shape',languageQuiz:'Language Quiz',languageCardSub:'Which language is this?',currencyQuiz:'Currency Quiz',currencyCardSub:'Which currency is this?',wappenQuiz:'Coat of Arms Quiz',wappenCardSub:'Which coat of arms is this?',neighborQuiz:'Neighbor Puzzle',neighborCardSub:'Which country do these border?',iqAskLanguage:'Which language is this?',iqAskCurrency:'Which currency is this?',iqAskNeighbor:'Which country do these border?',langPlaceholder:'Enter language …',curPlaceholder:'Enter currency …',languages:'languages',currencies:'currencies',cfgRegion:'Region',cfgDiff:'Difficulty',cfgDir:'Direction',cfgStart:'Start quiz',dirC2Cap:'Country → capital',dirCap2C:'Capital → country',dirFlag2Cap:'Flag → capital',diffAll:'All',regWorld:'World',iqAskCapital:'What is the capital?',iqAskCountry:'Which country?',capPlaceholder:'Enter capital …',cfgDropdownLabel:'Suggestions',cfgDropdownOn:'Show',cfgDropdownOff:'Hide',cfgSkipHintLabel:'Hint on skip',cfgSkipHintOn:'Show',cfgSkipHintOff:'Hide',regionQuiz:'Regions',regionSub:'A region name appears — find and click it on the map.',findRegion:'Find this region',regions:'Regions',popQuiz:'Population',popSub:'The most or least populous countries — find and click them on the map.',findPop:'Which country?',popMostQ:'Most populous country',popLeastQ:'Least populous country',popMostRankQ:n=>'#'+n+' most populous',popLeastRankQ:n=>'#'+n+' least populous',areaQuiz:'Area',findArea:'Which country?',findTrivia:'Which country?',areaMostQ:'Largest country',areaLeastQ:'Smallest country',areaMostRankQ:n=>'#'+n+' largest',areaLeastRankQ:n=>'#'+n+' smallest',popMostNQ:n=>n+' most populous countries',popLeastNQ:n=>n+' least populous countries',areaMostNQ:n=>n+' largest countries',areaLeastNQ:n=>n+' smallest countries',happyMostQ:'Happiest country',happyLeastQ:'Unhappiest country',happyMostRankQ:n=>'#'+n+' happiest',happyLeastRankQ:n=>'#'+n+' unhappiest',happyMostNQ:n=>n+' happiest countries',happyLeastNQ:n=>n+' unhappiest countries',exportMostQ:'Highest exports',exportLeastQ:'Lowest exports',exportMostRankQ:n=>'#'+n+' highest exports',exportLeastRankQ:n=>'#'+n+' lowest exports',exportMostNQ:n=>n+' biggest exporters',exportLeastNQ:n=>n+' smallest exporters',heritageMostQ:'Country with the most UNESCO World Heritage sites',heritageMostRankQ:n=>'#'+n+' by number of UNESCO World Heritage sites',heritageMostNQ:n=>'The '+n+' countries with the most UNESCO World Heritage sites',findTriviaN:'Which countries?',catHeading:'What do you want to play?',catSub:'Choose a game type',catClickTitle:'Click on the map',catClickSub:'Find countries, regions and trivia on the world map',catPinTitle:'Drop a Pin',catPinSub:'Drop the pin as close to the location as you can',catInputTitle:'Text Input & Multiple Choice',catInputSub:'Flags, coats of arms, capitals and outlines',catOtherTitle:'More World Map Quizzes',catOtherSub:'Click cities, rivers, lakes and mountains',clickRootHeading:'Click on the map',clickRootSub:'Countries or regions?',landerTitle:'Countries',landerCardSub:'World map, continents, trivia & more',regionCardSub:'States, provinces & more',landerRootSub:'Choose a game type',optWorld:'World Map',optWorldSub:'All 197 countries',optContinents:'Continents',continentsSub:'Choose a continent',optDifficulty:'Difficulty',difficultySub:'Countries sorted by population',diffTierLabels:['Very Easy','Easy','Medium','Hard','Very Hard'],comingSoon:'Coming soon',optTrivia:'Trivia',triviaSub:'Special questions about countries',optCustom:'Custom Mode',optCustomSub:'Pick continents & country count',pinTriviaLbl:'Trivia',landmarks:'Places',pinPeopleLbl:'Birthplaces of famous people',personsLbl:'People',findPinPerson:'Where was this person born?',findPinTrivia:'Where is this?',perQuizLbl:'per quiz',wrongShort:'Wrong!'},
  es:{title:'Quiz del Mapa Mundial',sub:'Aparece el nombre de un país — encuéntralo y haz clic en el mapa.', find:'Encuentra este país',findLake:'Encuentra este lago',findRiver:'Encuentra este río',findCity:'Encuentra esta ciudad',findMountain:'Encuentra este pico',findRange:'Encuentra esta cordillera', cityQuiz:'Quiz de Ciudades',citySub:'Aparece el nombre de una ciudad — encuéntrala y haz clic en el mapa.',cities:'Ciudades', cityDiffs:[{key:'easy',label:'Fácil'},{key:'medium',label:'Medio'},{key:'hard',label:'Difícil'}], cityCountries:[{key:'DE',label:'Alemania'},{key:'US',label:'EE. UU.'},{key:'FR',label:'Francia'},{key:'IT',label:'Italia'},{key:'CN',label:'China'},{key:'JP',label:'Japón'},{key:'IN',label:'India'},{key:'BR',label:'Brasil'},{key:'AU',label:'Australia'},{key:'MX',label:'México'}], pinQuiz:'Clava el Pin',pinSub:'Aparece una ciudad — coloca el marcador lo más cerca posible de su ubicación.',findPin:'¿Dónde está esta ciudad?',pinEuLabel:'Europa',pointsLbl:'Puntos',roundsLbl:'Rondas',avgLbl:'Dist. media',pinFb:(km,pts)=>'📍 '+km+' km · +'+pts+' P', lakeQuiz:'Quiz de Lagos',lakeSub:'Aparece el nombre de un lago — encuéntralo y haz clic en el mapa.', lakeDiffs:[{key:'beginner',label:'Principiante',count:13},{key:'easy',label:'Fácil',count:44},{key:'medium',label:'Medio',count:76},{key:'hard',label:'Difícil',count:144}],lakes:'Lagos', riverQuiz:'Quiz de Ríos',riverSub:'Aparece el nombre de un río — encuéntralo y haz clic en el mapa.', riverDiffs:[{key:'beginner',label:'Principiante',count:14},{key:'easy',label:'Fácil',count:41},{key:'medium',label:'Medio',count:80},{key:'hard',label:'Difícil',count:130}],rivers:'Ríos', mountainQuiz:'Quiz de Montañas',mountainSub:'Aparece una cordillera o un pico — encuéntralo y haz clic en el mapa.',mountainRanges:'Cordilleras',peaks:'Picos', rangeDiffs:[{key:'beginner',label:'Muy fácil',count:10},{key:'easy',label:'Fácil',count:19},{key:'medium',label:'Medio',count:90},{key:'hard',label:'Difícil',count:200}], mountainDiffs:[{key:'beginner',label:'Muy fácil',count:10},{key:'easy',label:'Fácil',count:18},{key:'medium',label:'Medio',count:100},{key:'hard',label:'Difícil',count:250}], flagQuiz:'Quiz de Banderas',flagSub:'Aparece una bandera — escribe el nombre del país.',flagPlaceholder:'Escribe el país …',flagWorld:'Mundial', flagDiffs:[{key:'beginner',label:'Principiante'},{key:'easy',label:'Fácil'},{key:'medium',label:'Medio'},{key:'hard',label:'Difícil'}], homeTitle:'Juegos de Geografía',homeSub:'Pon a prueba tu conocimiento del mundo — países, lagos, ríos y banderas.', playBtn:'Jugar',optionsLbl:'Opciones',homeBtn:'← Inicio',scrollHint:'Desplázate para ver más',mapQuiz:'Mapa Mundial',load:'Cargando mapa …',back:'← Menú', foundLbl:'encontrados',correctLbl:'correctas',wrongLbl:'incorrectas',remLbl:'restantes',resTitle:'¡Quiz completado!',again:'Jugar de nuevo',newgame:'Volver a la selección', shareBtn:'📤 Compartir',shareCopied:'¡Copiado al portapapeles!',shareTitle:'Quiz del Mapa Mundial', randomChallengeBtn:'🎲 Reto Aleatorio',dailyChallengeBtn:'📅 Reto Diario',dailyLoginRequired:'Inicia sesión para jugar el Reto Diario',timeLbl:'Tiempo',dailyDoneTitle:'¡Ya jugaste hoy!',dailyLeaderboardTitle:'Clasificación de hoy',dailyHintTitle:'¡Atención, va contra el reloj!',dailyHintText:'El Reto Diario va contra el reloj — cuanto más rápido termines, mejor tu puesto en la clasificación de hoy.',dailyHintDontShow:'No volver a mostrar',dailyHintBtn:'¡Vamos!', langLbl:'Idioma',themeLbl:'Diseño',colorblindLabel:'Modo daltónico',colorblindTip:'Sustituye el verde/rojo de correcto/incorrecto por colores más distinguibles, sin importar el diseño elegido.',colorblindOn:'Activado',colorblindOff:'Desactivado', projLbl:'Vista del mapa',projStd:'Natural Earth',projEqual:'Equal Earth',projGlobe:'Globo',projMerc:'Mercator', foundModeLabel:'Respuestas correctas',keepOn:'Marcados',keepOff:'Sin marcar', wrongHintLabel:'Pistas en errores',wrongHintTip:'Tras una respuesta incorrecta, se muestra brevemente el país correcto.',wrongHintOn:'Mostrar',wrongHintOff:'Ocultar', skipHintLabel:'Pistas al saltar',skipHintTip:'Muestra brevemente el objetivo saltado después de saltarlo.',skipHintOn:'Mostrar',skipHintOff:'Ocultar', countries:'países',zoomTip:'Zoom y desplazamiento disponibles',skipLbl:'Saltar',skippedLbl:'saltadas', correctFb:n=>'✓ ¡Correcto! '+n,wrongFb:n=>'Era '+n, res1:(a,b,c)=>`${a} de ${b} al primer intento (${c} %)`,res2:(a,b)=>`${a} correctas, ${b} falladas`,challengeScore:n=>'Puntuación: '+n, themes:{atlas:'Atlas',neon:'Cyberpunk',terrain:'Terreno',cartoon:'Cartoon'}, cback:'← Volver',ctitle:'Modo Personalizado',clblCont:'Continentes',clblCount:'Número de países',clblOf:'disponibles',clblAll:'Todos los países',clblCountries:'Elegir países', cbtnAll:'Todos',cbtnNone:'Ninguno',cbtnStart:'Empezar', signIn:'Iniciar sesión',signUp:'Registrarse',signOut:'Cerrar sesión',loginTitle:'Iniciar sesión',registerTitle:'Crear cuenta', authEmail:'Correo electrónico',authPw:'Contraseña',authName:'Nombre visible (opcional)',loggedIn:'Sesión iniciada como', toRegister:'¿Sin cuenta? Regístrate',toLogin:'¿Ya tienes cuenta? Inicia sesión', authFillAll:'Introduce correo y contraseña.',authNotConfigured:'Firebase aún no está configurado.', authErrEmail:'Dirección de correo no válida.',authErrInUse:'Este correo ya está en uso.',authErrWeak:'Contraseña demasiado débil (mín. 6 caracteres).', authErrCred:'Correo o contraseña incorrectos.',authErrGeneric:'Algo salió mal. Inténtalo de nuevo.', authUsername:'Nombre de usuario',showPw:'Mostrar contraseña',forgotPw:'¿Olvidaste tu contraseña?',resetSent:'Se ha enviado un correo para restablecerla.', enterEmailFirst:'Introduce primero tu correo electrónico.',authUserRequired:'Elige un nombre de usuario.',authUserInvalid:'3–20 caracteres: letras, números, _',authUserTaken:'Nombre de usuario ya en uso.', googleBtn:'Iniciar sesión con Google',orSep:'o',newRecord:'¡Nuevo récord!',bestLabel:'Mejor marca', roundLimitLbl:'Número de objetivos',allTargetsLbl:'Todos los objetivos',normalMode:'Modo normal', learnModeLbl:'Modo aprendizaje',learnModeLogin:'Inicia sesión para el Modo aprendizaje',learnModeDesc:'Los errores frecuentes aparecen primero. Los temas que ya dominas 3 veces se ocultan.',learnModeCta:'→ Haz clic para iniciar sesión', inputQuiz:'Adivina el país',inputSub:'Bandera, capital o silueta — escribe el nombre correcto.',flagCardSub:'¿Qué bandera es esta?', capitalQuiz:'Quiz de Capitales',capitalCardSub:'País ↔ capital',outlineQuiz:'Quiz de Siluetas',outlineCardSub:'Reconoce la forma', languageQuiz:'Quiz de Idiomas',languageCardSub:'¿Qué idioma es este?',currencyQuiz:'Quiz de Monedas',currencyCardSub:'¿Qué moneda es esta?', wappenQuiz:'Quiz de Escudos',wappenCardSub:'¿Qué escudo es este?',neighborQuiz:'Rompecabezas de Vecinos',neighborCardSub:'¿Qué país limita con estos?', iqAskLanguage:'¿Qué idioma es este?',iqAskCurrency:'¿Qué moneda es esta?',iqAskNeighbor:'¿Qué país limita con estos países?', langPlaceholder:'Escribe el idioma …',curPlaceholder:'Escribe la moneda …',languages:'idiomas',currencies:'monedas', cfgRegion:'Región',cfgDiff:'Dificultad',cfgDir:'Dirección',cfgStart:'Iniciar quiz', dirC2Cap:'País → capital',dirCap2C:'Capital → país',dirFlag2Cap:'Bandera → capital',diffAll:'Todos',regWorld:'Mundo', iqAskCapital:'¿Cómo se llama la capital?',iqAskCountry:'¿Qué país?',capPlaceholder:'Escribe la capital …', cfgDropdownLabel:'Sugerencias',cfgDropdownOn:'Mostrar',cfgDropdownOff:'Ocultar', cfgSkipHintLabel:'Pista al saltar',cfgSkipHintOn:'Mostrar',cfgSkipHintOff:'Ocultar', regionQuiz:'Regiones',regionSub:'Aparece el nombre de una región — encuéntrala y haz clic en el mapa.',findRegion:'Encuentra esta región',regions:'Regiones', popQuiz:'Población',popSub:'Los países más o menos poblados — encuéntralos y haz clic en el mapa.',findPop:'¿Qué país?', popMostQ:'País más poblado',popLeastQ:'País menos poblado', popMostRankQ:n=>'N.º '+n+' más poblado',popLeastRankQ:n=>'N.º '+n+' menos poblado', areaQuiz:'Superficie',findArea:'¿Qué país?',findTrivia:'¿Qué país?',areaMostQ:'País más grande',areaLeastQ:'País más pequeño', areaMostRankQ:n=>'N.º '+n+' más grande',areaLeastRankQ:n=>'N.º '+n+' más pequeño',popMostNQ:n=>'Los '+n+' más poblados',popLeastNQ:n=>'Los '+n+' menos poblados',areaMostNQ:n=>'Los '+n+' más grandes',areaLeastNQ:n=>'Los '+n+' más pequeños',happyMostQ:'País más feliz',happyLeastQ:'País menos feliz',happyMostRankQ:n=>'N.º '+n+' más feliz',happyLeastRankQ:n=>'N.º '+n+' menos feliz',happyMostNQ:n=>'Los '+n+' más felices',happyLeastNQ:n=>'Los '+n+' menos felices',exportMostQ:'Mayores exportaciones',exportLeastQ:'Menores exportaciones',exportMostRankQ:n=>'N.º '+n+' con mayores exportaciones',exportLeastRankQ:n=>'N.º '+n+' menores exportaciones',exportMostNQ:n=>'Los '+n+' mayores exportadores',exportLeastNQ:n=>'Los '+n+' menores exportadores',heritageMostQ:'País con más sitios Patrimonio Mundial de la UNESCO',heritageMostRankQ:n=>'N.º '+n+' por número de sitios Patrimonio Mundial de la UNESCO',heritageMostNQ:n=>'Los '+n+' países con más sitios Patrimonio Mundial de la UNESCO',findTriviaN:'¿Qué países?', catHeading:'¿A qué quieres jugar?',catSub:'Elige un tipo de juego', catClickTitle:'Hacer clic en el mapa',catClickSub:'Encuentra países, regiones y curiosidades en el mapa mundial', catPinTitle:'Clava el Pin',catPinSub:'Coloca el marcador lo más cerca posible de la ubicación', catInputTitle:'Texto y opción múltiple',catInputSub:'Banderas, escudos, capitales y siluetas', catOtherTitle:'Más quizzes del mapa mundial',catOtherSub:'Haz clic en ciudades, ríos, lagos y montañas', clickRootHeading:'Hacer clic en el mapa',clickRootSub:'¿Países o regiones?', landerTitle:'Países',landerCardSub:'Mapa mundial, continentes, curiosidades y más',regionCardSub:'Estados, provincias y más',landerRootSub:'Elige un tipo de juego', optWorld:'Mapa Mundial',optWorldSub:'Los 197 países',optContinents:'Continentes',continentsSub:'Elige un continente', optDifficulty:'Dificultad',difficultySub:'Países ordenados por población',diffTierLabels:['Muy fácil','Fácil','Medio','Difícil','Muy difícil'], comingSoon:'Próximamente',optTrivia:'Curiosidades',triviaSub:'Preguntas especiales sobre países', optCustom:'Modo Personalizado',optCustomSub:'Elige continentes y número de países', pinTriviaLbl:'Curiosidades',landmarks:'Lugares',pinPeopleLbl:'Lugares de nacimiento de personas famosas',personsLbl:'Personas',findPinPerson:'¿Dónde nació esta persona?',findPinTrivia:'¿Dónde está esto?', perQuizLbl:'por quiz',wrongShort:'¡Incorrecto!'},
  fr:{title:'Quiz de la Carte du Monde',sub:'Le nom d’un pays apparaît — trouve-le et clique dessus sur la carte.', find:'Trouve ce pays',findLake:'Trouve ce lac',findRiver:'Trouve ce fleuve',findCity:'Trouve cette ville',findMountain:'Trouve ce sommet',findRange:'Trouve cette chaîne de montagnes', cityQuiz:'Quiz des Villes',citySub:'Le nom d’une ville apparaît — trouve-la et clique dessus sur la carte.',cities:'Villes', cityDiffs:[{key:'easy',label:'Facile'},{key:'medium',label:'Moyen'},{key:'hard',label:'Difficile'}], cityCountries:[{key:'DE',label:'Allemagne'},{key:'US',label:'États-Unis'},{key:'FR',label:'France'},{key:'IT',label:'Italie'},{key:'CN',label:'Chine'},{key:'JP',label:'Japon'},{key:'IN',label:'Inde'},{key:'BR',label:'Brésil'},{key:'AU',label:'Australie'},{key:'MX',label:'Mexique'}], pinQuiz:'Plante le Pin',pinSub:'Une ville apparaît — place le repère le plus près possible de son emplacement.',findPin:'Où se trouve cette ville ?',pinEuLabel:'Europe',pointsLbl:'Points',roundsLbl:'Manches',avgLbl:'Distance moy.',pinFb:(km,pts)=>'📍 '+km+' km · +'+pts+' P', lakeQuiz:'Quiz des Lacs',lakeSub:'Le nom d’un lac apparaît — trouve-le et clique dessus sur la carte.', lakeDiffs:[{key:'beginner',label:'Débutant',count:13},{key:'easy',label:'Facile',count:44},{key:'medium',label:'Moyen',count:76},{key:'hard',label:'Difficile',count:144}],lakes:'Lacs', riverQuiz:'Quiz des Fleuves',riverSub:'Le nom d’un fleuve apparaît — trouve-le et clique dessus sur la carte.', riverDiffs:[{key:'beginner',label:'Débutant',count:14},{key:'easy',label:'Facile',count:41},{key:'medium',label:'Moyen',count:80},{key:'hard',label:'Difficile',count:130}],rivers:'Fleuves', mountainQuiz:'Quiz des Montagnes',mountainSub:'Une chaîne de montagnes ou un sommet apparaît — trouve-le et clique dessus sur la carte.',mountainRanges:'Chaînes de montagnes',peaks:'Sommets', rangeDiffs:[{key:'beginner',label:'Très facile',count:10},{key:'easy',label:'Facile',count:19},{key:'medium',label:'Moyen',count:90},{key:'hard',label:'Difficile',count:200}], mountainDiffs:[{key:'beginner',label:'Très facile',count:10},{key:'easy',label:'Facile',count:18},{key:'medium',label:'Moyen',count:100},{key:'hard',label:'Difficile',count:250}], flagQuiz:'Quiz des Drapeaux',flagSub:'Un drapeau apparaît — tape le nom du pays.',flagPlaceholder:'Entrer le pays …',flagWorld:'Monde entier', flagDiffs:[{key:'beginner',label:'Débutant'},{key:'easy',label:'Facile'},{key:'medium',label:'Moyen'},{key:'hard',label:'Difficile'}], homeTitle:'Jeux de Géographie',homeSub:'Teste tes connaissances du monde — pays, lacs, fleuves et drapeaux.', playBtn:'Jouer',optionsLbl:'Options',homeBtn:'← Accueil',scrollHint:'Faire défiler pour en voir plus',mapQuiz:'Carte du Monde',load:'Chargement de la carte …',back:'← Menu', foundLbl:'trouvés',correctLbl:'corrects',wrongLbl:'faux',remLbl:'restants',resTitle:'Quiz terminé !',again:'Rejouer',newgame:'Retour à la sélection', shareBtn:'📤 Partager',shareCopied:'Copié dans le presse-papiers !',shareTitle:'Quiz de la Carte du Monde', randomChallengeBtn:'🎲 Défi Aléatoire',dailyChallengeBtn:'📅 Défi du Jour',dailyLoginRequired:'Connecte-toi pour jouer au Défi du Jour',timeLbl:'Temps',dailyDoneTitle:'Déjà joué aujourd’hui !',dailyLeaderboardTitle:'Classement du jour',dailyHintTitle:'Attention, chrono lancé !',dailyHintText:'Le Défi du jour est chronométré — plus tu termines vite, meilleur sera ton classement du jour.',dailyHintDontShow:'Ne plus afficher',dailyHintBtn:'C’est parti !', langLbl:'Langue',themeLbl:'Thème',colorblindLabel:'Mode daltonien',colorblindTip:'Remplace le vert/rouge des réponses correctes/incorrectes par des couleurs plus distinguables, quel que soit le thème choisi.',colorblindOn:'Activé',colorblindOff:'Désactivé', projLbl:'Vue de la carte',projStd:'Natural Earth',projEqual:'Equal Earth',projGlobe:'Globe',projMerc:'Mercator', foundModeLabel:'Bonnes réponses',keepOn:'Marqués',keepOff:'Non marqués', wrongHintLabel:'Indices en cas d’erreur',wrongHintTip:'Après une mauvaise réponse, le pays correct est brièvement affiché.',wrongHintOn:'Afficher',wrongHintOff:'Masquer', skipHintLabel:'Indices en cas de passage',skipHintTip:'Affiche brièvement la cible passée après l’avoir passée.',skipHintOn:'Afficher',skipHintOff:'Masquer', countries:'pays',zoomTip:'Zoom et déplacement possibles',skipLbl:'Passer',skippedLbl:'passés', correctFb:n=>'✓ Correct ! '+n,wrongFb:n=>'C’était '+n, res1:(a,b,c)=>`${a} sur ${b} du premier coup (${c} %)`,res2:(a,b)=>`${a} corrects, ${b} manqués`,challengeScore:n=>'Score : '+n, themes:{atlas:'Atlas',neon:'Cyberpunk',terrain:'Terrain',cartoon:'Cartoon'}, cback:'← Retour',ctitle:'Mode Personnalisé',clblCont:'Continents',clblCount:'Nombre de pays',clblOf:'disponibles',clblAll:'Tous les pays',clblCountries:'Choisir les pays', cbtnAll:'Tous',cbtnNone:'Aucun',cbtnStart:'Démarrer', signIn:'Connexion',signUp:'Inscription',signOut:'Déconnexion',loginTitle:'Connexion',registerTitle:'Créer un compte', authEmail:'E-mail',authPw:'Mot de passe',authName:'Nom affiché (facultatif)',loggedIn:'Connecté en tant que', toRegister:'Pas de compte ? S’inscrire',toLogin:'Déjà un compte ? Se connecter', authFillAll:'Veuillez saisir l’e-mail et le mot de passe.',authNotConfigured:'Firebase n’est pas encore configuré.', authErrEmail:'Adresse e-mail invalide.',authErrInUse:'Cet e-mail est déjà utilisé.',authErrWeak:'Mot de passe trop faible (min. 6 caractères).', authErrCred:'E-mail ou mot de passe incorrect.',authErrGeneric:'Un problème est survenu. Réessaie.', authUsername:'Nom d’utilisateur',showPw:'Afficher le mot de passe',forgotPw:'Mot de passe oublié ?',resetSent:'E-mail de réinitialisation envoyé.', enterEmailFirst:'Saisis d’abord ton e-mail.',authUserRequired:'Choisis un nom d’utilisateur.',authUserInvalid:'3–20 caractères : lettres, chiffres, _',authUserTaken:'Nom d’utilisateur déjà pris.', googleBtn:'Se connecter avec Google',orSep:'ou',newRecord:'Nouveau record !',bestLabel:'Meilleur score', roundLimitLbl:'Nombre de cibles',allTargetsLbl:'Toutes les cibles',normalMode:'Mode normal', learnModeLbl:'Mode apprentissage',learnModeLogin:'Connecte-toi pour le Mode apprentissage',learnModeDesc:'Les erreurs fréquentes apparaissent en premier. Les sujets déjà maîtrisés 3 fois sont masqués.',learnModeCta:'→ Cliquer pour se connecter', inputQuiz:'Devine le pays',inputSub:'Drapeau, capitale ou silhouette — tape le bon nom.',flagCardSub:'Quel est ce drapeau ?', capitalQuiz:'Quiz des Capitales',capitalCardSub:'Pays ↔ capitale',outlineQuiz:'Quiz des Silhouettes',outlineCardSub:'Reconnais la forme', languageQuiz:'Quiz des Langues',languageCardSub:'Quelle est cette langue ?',currencyQuiz:'Quiz des Monnaies',currencyCardSub:'Quelle est cette monnaie ?', wappenQuiz:'Quiz des Blasons',wappenCardSub:'Quel est ce blason ?',neighborQuiz:'Énigme des Voisins',neighborCardSub:'Quel pays est bordé par ceux-ci ?', iqAskLanguage:'Quelle est cette langue ?',iqAskCurrency:'Quelle est cette monnaie ?',iqAskNeighbor:'Quel pays est bordé par ces pays ?', langPlaceholder:'Entrer la langue …',curPlaceholder:'Entrer la monnaie …',languages:'langues',currencies:'monnaies', cfgRegion:'Région',cfgDiff:'Difficulté',cfgDir:'Direction',cfgStart:'Démarrer le quiz', dirC2Cap:'Pays → capitale',dirCap2C:'Capitale → pays',dirFlag2Cap:'Drapeau → capitale',diffAll:'Tous',regWorld:'Monde', iqAskCapital:'Quelle est la capitale ?',iqAskCountry:'Quel pays ?',capPlaceholder:'Entrer la capitale …', cfgDropdownLabel:'Suggestions',cfgDropdownOn:'Afficher',cfgDropdownOff:'Masquer', cfgSkipHintLabel:'Indice au passage',cfgSkipHintOn:'Afficher',cfgSkipHintOff:'Masquer', regionQuiz:'Régions',regionSub:'Le nom d’une région apparaît — trouve-la et clique dessus sur la carte.',findRegion:'Trouve cette région',regions:'Régions', popQuiz:'Population',popSub:'Les pays les plus ou les moins peuplés — trouve-les et clique dessus sur la carte.',findPop:'Quel pays ?', popMostQ:'Pays le plus peuplé',popLeastQ:'Pays le moins peuplé', popMostRankQ:n=>n+'ᵉ plus peuplé',popLeastRankQ:n=>n+'ᵉ moins peuplé', areaQuiz:'Superficie',findArea:'Quel pays ?',findTrivia:'Quel pays ?',areaMostQ:'Plus grand pays',areaLeastQ:'Plus petit pays', areaMostRankQ:n=>n+'ᵉ plus grand',areaLeastRankQ:n=>n+'ᵉ plus petit',popMostNQ:n=>'Les '+n+' plus peuplés',popLeastNQ:n=>'Les '+n+' moins peuplés',areaMostNQ:n=>'Les '+n+' plus grands',areaLeastNQ:n=>'Les '+n+' plus petits',happyMostQ:'Pays le plus heureux',happyLeastQ:'Pays le moins heureux',happyMostRankQ:n=>n+'ᵉ plus heureux',happyLeastRankQ:n=>n+'ᵉ moins heureux',happyMostNQ:n=>'Les '+n+' plus heureux',happyLeastNQ:n=>'Les '+n+' moins heureux',exportMostQ:'Plus fortes exportations',exportLeastQ:'Plus faibles exportations',exportMostRankQ:n=>n+'ᵉ plus fortes exportations',exportLeastRankQ:n=>n+'ᵉ plus faibles exportations',exportMostNQ:n=>'Les '+n+' plus gros exportateurs',exportLeastNQ:n=>'Les '+n+' plus petits exportateurs',heritageMostQ:'Pays avec le plus de sites du patrimoine mondial de l’UNESCO',heritageMostRankQ:n=>n+'ᵉ par le nombre de sites du patrimoine mondial de l’UNESCO',heritageMostNQ:n=>'Les '+n+' pays avec le plus de sites du patrimoine mondial de l’UNESCO',findTriviaN:'Quels pays ?', catHeading:'À quoi veux-tu jouer ?',catSub:'Choisis un type de jeu', catClickTitle:'Cliquer sur la carte',catClickSub:'Trouve pays, régions et curiosités sur la carte du monde', catPinTitle:'Plante le Pin',catPinSub:'Place le repère le plus près possible de l’emplacement', catInputTitle:'Texte et choix multiple',catInputSub:'Drapeaux, blasons, capitales et silhouettes', catOtherTitle:'Autres quiz de la carte du monde',catOtherSub:'Clique sur villes, fleuves, lacs et montagnes', clickRootHeading:'Cliquer sur la carte',clickRootSub:'Pays ou régions ?', landerTitle:'Pays',landerCardSub:'Carte du monde, continents, curiosités et plus',regionCardSub:'États, provinces et plus',landerRootSub:'Choisis un type de jeu', optWorld:'Carte du Monde',optWorldSub:'Les 197 pays',optContinents:'Continents',continentsSub:'Choisis un continent', optDifficulty:'Difficulté',difficultySub:'Pays triés par population',diffTierLabels:['Très facile','Facile','Moyen','Difficile','Très difficile'], comingSoon:'Bientôt disponible',optTrivia:'Curiosités',triviaSub:'Questions spéciales sur les pays', optCustom:'Mode Personnalisé',optCustomSub:'Choisis les continents et le nombre de pays', pinTriviaLbl:'Curiosités',landmarks:'Lieux',pinPeopleLbl:'Lieux de naissance de personnalités',personsLbl:'Personnes',findPinPerson:'Où est née cette personne ?',findPinTrivia:'Où se trouve ceci ?', perQuizLbl:'par quiz',wrongShort:'Faux !'}
};

let iqSize='m'; // Anzeigegröße des Ziels in den Texteingabe-Quizzen: s | m | l
let lang='de',theme='atlas',keepFound=true,showWrongHint=true,showSkipHint=true,showDropdown=true,projection='mercator',game={},quizRoundLimit=10,learnMode=false,allTargets=false,_challenge=null,dailyHintDismissed=false;
let countryPaths=null,microstateDots=null,lakePaths=null,lakeDots=null,riverPaths=null,riverHitboxes=null,cityDots=null,mountainDots=null,rangePaths=null,worldData=null,borderPath=null,admin1Path=null,zoomBehavior=null,gGroup=null,islandZoneHits=null,islandZoneVisuals=null,zoneHulls=null;
let visibleIds=new Set(),lastMode='world',canClick=true,optsOpen=false,_fbTimer=null;
// Every wrongly-picked item flashes red for its own full second, independent of any other item
// flashing at the same time — clicking a second wrong item must not cut the first one's flash
// short. wrongFlashIds is the set of currently-flashing keys; wrongFlashTimers holds each one's
// own clear timer so cancelling/restarting one never touches another's.
let wrongFlashIds=new Set(),wrongFlashTimers=new Map();
let currentProj=null,pinLayer=null;

function showFeedback(text,color){
  const el=$('feedback');
  if(!el)return;
  el.textContent=text;
  el.style.color=color||'#eee';
  el.style.opacity='1';
  if(_fbTimer)clearTimeout(_fbTimer);
  _fbTimer=setTimeout(()=>{el.style.opacity='0';},2000);
}
function clearFeedback(){const el=$('feedback');if(el){el.style.opacity='0';el.textContent='';}}
let customConts=new Set(['EU','AF','AS','NA','SA','OC']),customCountries=new Set();
const DOT_R=7; // target radius in screen pixels
const COARSE=(typeof window!=='undefined'&&window.matchMedia)?window.matchMedia('(pointer:coarse)').matches:false;
const HIT_R=COARSE?22:DOT_R+5; // invisible touch-target radius in screen px (~44px on touch devices)
const MS_HIT_OVERRIDE={438:14,442:HIT_R+8}; // per-microstate hit radius override (438 Liechtenstein: small so taps fall through to Switzerland; 442 Luxembourg: larger, easier to hit)
const msHitR=id=>MS_HIT_OVERRIDE[id]||HIT_R;

TX.de.pieQuiz='Flaggen-Kuchen';TX.de.pieCardSub='Welches Land hat diese Farben?';
TX.en.pieQuiz='Flag pie chart';TX.en.pieCardSub='Which country has these colours?';
TX.es.pieQuiz='Gráfico de banderas';TX.es.pieCardSub='¿Qué país tiene estos colores?';
TX.fr.pieQuiz='Camembert des drapeaux';TX.fr.pieCardSub='Quel pays a ces couleurs ?';
function t(k){return TX[lang][k]||TX.de[k]||k;}
function cn(id){return C[id]?(C[id][lang]||C[id].de):'?';}
function $(id){return document.getElementById(id);}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}

// First-lap ordering: the very first time a specific quiz (by key, e.g. 'map:EU') is played, its
// targets are dealt from one shuffled pass through the whole pool, continued round after round —
// so the first few rounds can't, by pure bad luck, repeat a target before every other one has
// shown up. Once that pass is exhausted, every later round goes back to a plain independent
// shuffle. Kept local-only (not synced across devices via the auth.js data layer): losing it just
// means one extra ordinarily-shuffled round on a new device, which isn't worth reusing the
// cross-device sync machinery built for actual progress data (scores/achievements).
const FIRST_LAP_KEY='geoquiz_firstlap';
function _loadFirstLap(){try{return JSON.parse(localStorage.getItem(FIRST_LAP_KEY))||{};}catch(e){return{};}}
function _saveFirstLap(fl){try{localStorage.setItem(FIRST_LAP_KEY,JSON.stringify(fl));}catch(e){}}
function firstLapOrder(key,ids){
  if(!key||!ids.length)return shuffle(ids);
  const fl=_loadFirstLap();
  let entry=fl[key];
  if(entry&&entry.done)return shuffle(ids);
  // Pool composition can drift (data updates, a changed setting) — if the saved order doesn't
  // match this pool 1:1 anymore, start the lap over rather than risk stale or missing ids.
  if(!entry||entry.order.filter(id=>ids.includes(id)).length!==ids.length)entry={order:shuffle(ids),pos:0};
  const roundSize=allTargets?ids.length:quizRoundLimit;
  const thisRound=entry.order.slice(entry.pos,entry.pos+roundSize);
  const pos=entry.pos+thisRound.length;
  fl[key]=pos>=entry.order.length?{done:true}:{order:entry.order,pos};
  _saveFirstLap(fl);
  const rest=ids.filter(id=>!thisRound.includes(id));
  return thisRound.concat(shuffle(rest));
}
function eff(id){return REDIRECTS.get(id)??id;}
function activeConts(){return game.activeContinents||null;}

const SCREENS=['home-screen','category-screen','mode-screen','game-screen','result-screen','custom-screen','flag-screen','inputcfg-screen','region-screen'];
function applyLearnClass(){document.body.classList.toggle('learn-on',!!learnMode);}
function showScreen(id){applyLearnClass();const _gs=$('game-screen');if(_gs)_gs.classList.remove('pin-people');SCREENS.forEach(s=>{const el=$(s);if(el)el.style.display=s===id?(s==='game-screen'||s==='flag-screen'||s==='home-screen'||s==='region-screen'||s==='category-screen'?'flex':'block'):'none';});}
function goHome(){showScreen('home-screen');renderHome();}

// ── CATEGORY PICKER ──
// "Spielen" lands on a 4-card picker; "pin"/"input"/"other" open the section swipe view exactly
// as before (openSections, scoped to that category's sections). "click" ("Auf der Karte
// anklicken") is a single dynamic page instead (see CLICK PAGE below) — it bundles several
// unrelated choices (countries by world/continent/trivia/custom, and separately regions), and an
// earlier version drilled through 3 separate pages for that; every one of those quizzes now
// returns to that one page directly, so no per-page back-target bookkeeping is needed for it.
const CATEGORIES=[
  {key:'click',icon:'🗺️',cardCls:'gs-map'},
  {key:'pin',icon:'📍',cardCls:'gs-pin'},
  {key:'input',icon:'✏️',cardCls:'gs-flag'},
  {key:'other',icon:'🏙️',cardCls:'gs-city'}
];
const CATEGORY_META={
  click:{head:()=>t('catClickTitle'),sub:()=>t('catClickSub')},
  pin:{head:()=>t('catPinTitle'),sub:()=>t('catPinSub')},
  input:{head:()=>t('catInputTitle'),sub:()=>t('catInputSub')},
  other:{head:()=>t('catOtherTitle'),sub:()=>t('catOtherSub')}
};
const SECTION_TO_CATEGORY={pin:'pin',flag:'input',city:'other',river:'other',lake:'other',mountain:'other'};
let _activeSections=['pin'];
let _modeScreenBackOnclick="openCategoryPicker()";

function openCategoryPicker(){
  _catRerender=openCategoryPicker; // Lernmodus-Schalter oben baut diese Seite neu auf
  if(typeof triggerStreakOnPlay==='function')triggerStreakOnPlay();
  const cards=CATEGORIES.map(c=>{const m=CATEGORY_META[c.key];return {key:c.key,icon:c.icon,cls:c.cardCls,title:m.head(),sub:m.sub(),onclick:`openCategory('${c.key}')`};});
  showScreen('category-screen');
  $('category-screen').classList.add('cat-picker');
  $('category-screen').innerHTML=`
    <div class="cat-bg"></div>
    <div class="cat-topbar cat-topbar-split"><button class="gs-home-btn" onclick="goHome()">${t('back')}</button>${learnToggleHTML()}</div>
    <div class="cat-inner">
      <h1 class="cat-heading">${t('catHeading')}</h1>
      <div class="cat-grid">${cards.map(c=>`<div class="cat-cell"><button class="cat-card ${c.cls}" onclick="${c.onclick}"><span class="cat-card-icon">${c.icon}</span><span class="cat-card-title">${c.title}</span><span class="cat-card-sub">${c.sub}</span></button><button class="cat-info" type="button" onclick="openModeInfo('${c.key}')" aria-label="Info">i</button></div>`).join('')}</div>
    </div>`;
}
function openCategory(catKey,focusSection){
  if(catKey==='click'){renderClickPage();_maybeShowModeInfo('click');return;}
  // Alle Kategorien haben dasselbe Seitenlayout wie "Auf der Karte anklicken" (siehe CATEGORY PAGES).
  if(catKey==='pin'){renderPinPage();_maybeShowModeInfo('pin');return;}
  if(catKey==='input'){renderInputPage();_maybeShowModeInfo('input');return;}
  if(catKey==='other'){renderOtherPage();_maybeShowModeInfo('other');return;}
  const sections={pin:['pin'],input:['flag'],other:['city','river','lake','mountain']}[catKey]||['pin'];
  openSections(sections,'openCategoryPicker()',focusSection);
}
// Opens the section-swipe view (mode-screen) for an explicit list of sections — still used as-is
// by pin/input/other.
function openSections(sections,backOnclick,focusKey){
  _activeSections=sections;
  _modeScreenBackOnclick=backOnclick;
  showScreen('mode-screen');
  renderModeScreen();
  const el=$('mode-screen');if(!el)return;
  const idx=focusKey?Math.max(0,sections.indexOf(focusKey)):0;
  const apply=()=>{const prev=el.style.scrollBehavior;el.style.scrollBehavior='auto';el.scrollTo(0,idx*el.clientHeight);el.style.scrollBehavior=prev;updateSectionNav();};
  requestAnimationFrame(apply);setTimeout(apply,60);
}
// Used by call sites that only know a section key (a quiz's own back button) — reopens whichever
// category that section lives in, scrolled straight to it. Only ever sees pin/flag/city/river/lake
// now; map/region/pop quizzes return via _quizBackAction (CLICK PAGE below) instead.
function goToGames(sectionKey){
  if(typeof triggerStreakOnPlay==='function')triggerStreakOnPlay();
  openCategory(SECTION_TO_CATEGORY[sectionKey]||'pin',sectionKey);
}

// ── CLICK PAGE ("Auf der Karte anklicken") ──
// One page, two areas (Länder / Regionen), each already offering real choices instead of forcing
// a tap to a separate page first. Kontinente/Trivia expand inline, accordion-style — clicking the
// row toggles a panel open right below it instead of navigating away. _clickOpenPanel remembers
// which one (if any) so it stays open across a played round: every quiz launched from this page
// (world, a continent, custom, population, and region) returns straight back to renderClickPage().
let _clickOpenPanel=null; // 'continents' | 'trivia' | null
function _quizBackAction(){renderClickPage();}
// Info-Fenster zu den vier Spielmodi (das "i" in der Ecke der Karten auf der Kategorie-Auswahl).
const MODE_INFO={
  de:{
    click:{text:'Oben erscheint ein Name. Du suchst das passende Land, die Region oder den Ort auf der Weltkarte und tippst darauf.'},
    pin:{text:'Setze die Stecknadel so nah wie möglich an den gesuchten Ort. Je kleiner die Entfernung, desto mehr Punkte; ein Treffer im richtigen Land bringt einen Bonus.'},
    input:{text:'Ein Bild oder Begriff wird gezeigt, zum Beispiel eine Flagge, ein Wappen, ein Umriss oder ein Land. Du tippst die Lösung ein oder wählst sie aus den Vorschlägen.'},
    other:{text:'Hier suchst du Städte, Flüsse, Seen oder Berge. Der Name erscheint oben, du tippst das Ziel auf der Karte an.'}},
  en:{
    click:{text:'A name appears at the top. You look for the matching country, region or place on the world map and tap it.'},
    pin:{text:'Place the pin as close as you can to the place you are asked for. The smaller the distance, the more points; hitting the right country earns a bonus.'},
    input:{text:'A picture or term is shown, for example a flag, a coat of arms, an outline or a country. You type the answer or pick it from the suggestions.'},
    other:{text:'Here you look for cities, rivers, lakes or mountains. The name appears at the top and you tap the target on the map.'}},
  es:{
    click:{text:'Arriba aparece un nombre. Buscas el país, la región o el lugar correspondiente en el mapa mundial y lo tocas.'},
    pin:{text:'Coloca la chincheta lo más cerca posible del lugar pedido. Cuanto menor la distancia, más puntos; acertar el país correcto da una bonificación.'},
    input:{text:'Se muestra una imagen o un término, por ejemplo una bandera, un escudo, un contorno o un país. Escribes la respuesta o la eliges de las sugerencias.'},
    other:{text:'Aquí buscas ciudades, ríos, lagos o montañas. El nombre aparece arriba y tocas el objetivo en el mapa.'}},
  fr:{
    click:{text:'Un nom apparaît en haut. Tu cherches le pays, la région ou le lieu correspondant sur la carte du monde et tu le touches.'},
    pin:{text:'Place l’épingle le plus près possible du lieu demandé. Plus la distance est petite, plus tu gagnes de points ; viser le bon pays donne un bonus.'},
    input:{text:'Une image ou un terme est affiché, par exemple un drapeau, des armoiries, un contour ou un pays. Tu tapes la réponse ou tu la choisis dans les suggestions.'},
    other:{text:'Ici tu cherches des villes, des fleuves, des lacs ou des montagnes. Le nom apparaît en haut et tu touches la cible sur la carte.'}}
};
// Selbstlaufende Mini-Animationen für das Info-Fenster: echte Karte (dieselben Länder-, Fluss- und Flaggendaten
// wie im Spiel), reines SVG + CSS, keine Videodatei. Das Beispiel richtet sich nach der Sprache: Deutschland,
// Vereinigtes Königreich, Spanien oder Frankreich (Land, Hauptstadt, Fluss, Flagge). Der Grundzustand jeder
// Animation ist das Ende (Treffer), die Keyframes laufen davor ab; bei "weniger Bewegung" steht nur das Ende.
const MI_EXAMPLE={
  // Je Sprache ein Heimatland mit Kartenausschnitt "view" (lon0,lat0,lon1,lat1) und je Spielart 3 Ziele, die nacheinander laufen.
  // click: Land (id) + Tippstelle; pin: Stadt mit Position und Fehlversuch; input: Länder-IDs für Flagge; other: Fluss, See, Berg.
  de:{view:[4.5,46.6,16.5,55.4],
    click:[{id:276,tap:[10.3,51.2]},{region:'DE',name:'Bayern'},{id:616,tap:[15.4,52.0]}],
    pin:[{city:'Berlin',pos:[13.405,52.52],guess:[12.2,52.0]},{city:'München',pos:[11.58,48.14],guess:[12.4,48.6]},{city:'Hamburg',pos:[9.99,53.55],guess:[10.8,53.2]}],
    input:[{id:276},{id:40,kind:'wappen'},{id:724}],
    other:[{type:'river',names:['Rhein','Rhine'],label:'Rhein',view:[3.5,46.6,12.5,53.6]},{type:'lake',lake:'Bodensee',view:[5.8,45.4,13,49.6]},{type:'peak',pos:[10.98,47.42],label:'Zugspitze',view:[7.3,45.2,14.6,49.4]}]},
  en:{view:[-9.2,49.6,3.2,59.4],
    click:[{id:826,tap:[-1.8,52.9]},{region:'US',name:'Texas',view:[-126,23,-65,50]},{id:250,tap:[1.8,50.0]}],
    pin:[{city:'London',pos:[-0.13,51.51],guess:[-0.95,51.95]},{city:'Edinburgh',pos:[-3.19,55.95],guess:[-2.5,55.6]},{city:'Manchester',pos:[-2.24,53.48],guess:[-1.6,53.2]}],
    input:[{id:826},{id:724,kind:'wappen'},{id:380}],
    other:[{type:'river',names:['Thames'],label:'Thames',view:[-5.5,50,2.5,54]},{type:'lake',lake:'Lough Neagh',view:[-10.3,51.8,-2.5,56.6]},{type:'peak',pos:[-5.0,56.8],label:'Ben Nevis',view:[-9,54.4,-1.4,58.6]}]},
  es:{view:[-10.2,35.6,4.8,44.2],
    click:[{id:724,tap:[-3.5,40.2]},{region:'ES',name:'Andalucía'},{id:250,tap:[2.4,43.4]}],
    pin:[{city:'Madrid',pos:[-3.7,40.42],guess:[-4.5,40.9]},{city:'Barcelona',pos:[2.17,41.39],guess:[1.5,41.7]},{city:'Sevilla',pos:[-5.98,37.39],guess:[-5.2,37.7]}],
    input:[{id:724},{id:620,kind:'wappen'},{id:380}],
    other:[{type:'river',names:['Tajo'],label:'Tajo',view:[-10,38,-0.5,43.4]},{type:'lake',lake:'Lago Titicaca',view:[-74,-19,-65,-13]},{type:'peak',pos:[-3.31,37.05],label:'Mulhacén',view:[-8.2,35.2,1.6,39.4]}]},
  fr:{view:[-5.6,41.0,9.9,51.6],
    click:[{id:250,tap:[2.5,46.8]},{region:'FR',name:'Bretagne'},{id:380,tap:[8.6,44.5]}],
    pin:[{city:'Paris',pos:[2.352,48.856],guess:[3.1,49.4]},{city:'Marseille',pos:[5.37,43.30],guess:[4.7,43.7]},{city:'Bordeaux',pos:[-0.58,44.84],guess:[0.1,45.2]}],
    input:[{id:250},{id:724,kind:'wappen'},{id:380}],
    other:[{type:'river',names:['Loire'],label:'Loire',view:[-3.6,44.4,6.4,49]},{type:'lake',lake:'Lake Geneva',view:[2.8,44.3,10.2,48.5]},{type:'peak',pos:[6.87,45.83],label:'Mont Blanc',view:[3.4,43.6,10.4,47.8]}]}
};
let _miWorld=null,_miCountries=null,_miRivers=null,_miLakes=null,_miRegions={},_miTok=0,_miTimer=null;
async function _miLoad(need){
  if(!_miCountries){
    _miWorld=worldData||await fetch('data/countries-50m.json').then(r=>r.json());
    _miCountries=topojson.feature(_miWorld,_miWorld.objects.countries).features;
  }
  if(need==='river'&&!_miRivers)_miRivers=await fetch('data/ne_50m_rivers_lake_centerlines.geojson').then(r=>r.json());
  if(need&&need.region&&!_miRegions[need.region]){const cfg=REGION_QUIZZES[need.region],d=await fetch(cfg.url).then(r=>r.json());_miRegions[need.region]=cfg.objectKey?topojson.feature(d,d.objects[cfg.objectKey]).features:d.features;}
  if(need==='lake'&&!_miLakes)_miLakes=await (lakesData?Promise.resolve(lakesData):fetch('data/ne_50m_lakes.geojson').then(r=>r.json()));
}
function _miPill(cx,y,txt,fs){
  const w=Math.max(64,18+txt.length*fs*.62);
  return '<g class="mi-label"><rect x="'+(cx-w/2).toFixed(1)+'" y="'+y+'" width="'+w.toFixed(1)+'" height="24" rx="12" fill="#101826" opacity=".92"/><text x="'+cx+'" y="'+(y+17)+'" text-anchor="middle" fill="#fff" font-size="'+fs+'" font-weight="600">'+escapeHtml(txt)+'</text></g>';
}
const _MI_PIN=(c)=>'<path d="M0,0 C-7,-10 -10,-16 0,-22 C10,-16 7,-10 0,0 Z" fill="'+c+'" stroke="#fff" stroke-width="1.4"/><circle cx="0" cy="-15" r="3" fill="#fff"/>';
const _MI_CURSOR='<g class="mi-cursor"><circle class="mi-ripple" r="9" fill="none" stroke="#fff" stroke-width="2"/><circle r="6" fill="#fff" opacity=".92"/></g>';
// Eine Szene (idx 0..2) der Demo einer Spielart als SVG-Text
async function modeInfoAnim(key,idx){
  idx=idx||0;
  const E=MI_EXAMPLE[lang]||MI_EXAMPLE.de,W=280,H=150,S=E[key][idx];
  if(key==='input'){
    // Texteingabe: Flagge, Name wird Buchstabe für Buchstabe getippt, dazu klappt die Vorschlagsliste auf (alphabetisch
    // benachbarte Länder, wie im Spiel), am Ende wird der richtige Eintrag gewählt und ✓ erscheint.
    const nm=C[S.id][lang]||C[S.id].de,chars=[...nm],n=chars.length;
    const base=x=>x[0].normalize('NFD')[0].toLowerCase(),first=base(nm); // Ö zählt zu O, É zu E
    const names=[...new Set(Object.values(C).map(c=>c[lang]||c.de))].filter(x=>x&&base(x)===first).sort((p,q)=>p.localeCompare(q,lang));
    let ti=names.indexOf(nm);if(ti<0){names.push(nm);ti=names.length-1;}
    let lo=Math.max(0,Math.min(ti-1,names.length-3));const rows=names.slice(lo,lo+3);const hi=rows.indexOf(nm);
    const P0=14,P1=52,step=(P1-P0)/n; // Tippen läuft von 14 % bis 52 % der Schleife
    let css='@media (prefers-reduced-motion:no-preference){';
    chars.forEach((ch,i)=>{const p=(P0+step*i).toFixed(1),q=(P0+step*i+1.4).toFixed(1);
      css+='.mc'+i+'{animation:mc'+i+' 6s infinite}@keyframes mc'+i+'{0%,'+p+'%{opacity:0}'+q+'%,100%{opacity:1}}';});
    css+='.mdd{animation:mdd 6s infinite}@keyframes mdd{0%,22%{opacity:0;transform:translateY(-4px)}28%,100%{opacity:1;transform:none}}'
      +'.msel{animation:msel 6s infinite}@keyframes msel{0%,66%{opacity:0}70%,100%{opacity:1}}'
      +'.mok{animation:mok 6s infinite}@keyframes mok{0%,74%{opacity:0}80%,100%{opacity:1}}}';
    const tsp=chars.map((ch,i)=>'<tspan class="mc'+i+'">'+escapeHtml(ch)+'</tspan>').join('');
    let dd='<g class="mdd"><rect x="50" y="92" width="180" height="54" rx="8" fill="#1a2433" stroke="#3a4a60"/>';
    rows.forEach((r,i)=>{const y=94+i*17;
      if(i===hi)dd+='<rect class="msel" x="53" y="'+y+'" width="174" height="16" rx="5" fill="#2f5d9a"/>';
      dd+='<text x="62" y="'+(y+12)+'" fill="'+(i===hi?'#fff':'#9fb2c4')+'" font-size="11.5">'+escapeHtml(r)+'</text>';});
    dd+='</g>';
    return '<svg class="mi-stage mi-input" viewBox="0 0 '+W+' '+H+'" role="img" aria-hidden="true"><style>'+css+'</style><rect width="'+W+'" height="'+H+'" fill="#0e1621"/>'
      +(S.kind==='wappen'?'<image href="data/wappen/'+S.id+'.png" x="110" y="3" width="60" height="54" preserveAspectRatio="xMidYMid meet"/>':'<image href="data/flags/w320/'+ISO2[S.id]+'.png" x="104" y="6" width="72" height="48" preserveAspectRatio="xMidYMid meet"/>')
      +'<rect x="50" y="60" width="180" height="28" rx="8" fill="#1a2433" stroke="#3a4a60"/>'
      +'<text x="62" y="79" fill="#fff" font-size="14">'+tsp+'</text>'
      +dd
      +'<text class="mok" x="208" y="79" fill="#7be0b8" font-size="16" font-weight="700">✓</text></svg>';
  }
  await _miLoad(key==='other'?S.type==='river'?'river':S.type==='lake'?'lake':'':(key==='click'&&S.region)?{region:S.region}:'');
  const [x0,y0,x1,y1v]=S.view||E.view,y1=y1v+(y1v-y0)*.2; // oben Platz für die Beschriftung
  const proj=d3.geoMercator().fitExtent([[0,0],[W,H]],{type:'Feature',geometry:{type:'Polygon',coordinates:[[[x0,y0],[x0,y1],[x1,y1],[x1,y0],[x0,y0]]]}});
  const path=d3.geoPath(proj);if(path.digits)path.digits(1);
  const inView=f=>{const b=d3.geoBounds(f);return b[1][0]>=x0-3&&b[0][0]<=x1+3&&b[1][1]>=y0-3&&b[0][1]<=y1+3;};
  const near=_miCountries.filter(inView);
  const land=near.map(f=>'<path d="'+path(f)+'"/>').join('');
  const P=ll=>proj(ll).map(v=>+v.toFixed(1));
  let inner='<rect width="'+W+'" height="'+H+'" fill="#3f86c9"/><g fill="#e0d4b4" stroke="#8a7a54" stroke-width=".7" stroke-linejoin="round">'+land+'</g>';
  let style='';
  if(key==='click'){
    if(S.region){ // Region (Bundesland, Bundesstaat, Region): alle Regionen als Fläche mit Grenzen, die gesuchte wird grün
      const cfg=REGION_QUIZZES[S.region],feats=_miRegions[S.region],tf=feats.find(f=>f.properties[cfg.nameKey]===S.name),tp=path.centroid(tf);
      inner+='<g fill="#e0d4b4" stroke="#8a7a54" stroke-width=".5" stroke-linejoin="round">'+feats.filter(f=>f!==tf).map(f=>'<path d="'+path(f)+'"/>').join('')+'</g>'
        +'<path class="mi-hit" d="'+path(tf)+'" stroke="#8a7a54" stroke-width=".5"/>'+_miPill(140,8,S.name,13)+_MI_CURSOR;
      style='--cx:'+tp[0].toFixed(1)+'px;--cy:'+tp[1].toFixed(1)+'px';
    }else{
    const tf=_miCountries.find(f=>+f.id===S.id),tp=P(S.tap);
    inner+='<path class="mi-hit" d="'+path(tf)+'" stroke="#8a7a54" stroke-width=".7"/>'+_miPill(140,8,C[S.id][lang]||C[S.id].de,13)+_MI_CURSOR;
    style='--cx:'+tp[0]+'px;--cy:'+tp[1]+'px';
    }
  }else if(key==='pin'){
    const g=P(S.guess),c=P(S.pos);
    const km=Math.round(d3.geoDistance(S.guess,S.pos)*6371/5)*5;
    inner+=_miPill(140,8,S.city+(lang==='fr'?' ?':'?'),13)
      +'<g class="mi-reveal"><line x1="'+g[0]+'" y1="'+g[1]+'" x2="'+c[0]+'" y2="'+c[1]+'" stroke="#fff" stroke-width="1.6" stroke-dasharray="4 3"/><circle cx="'+c[0]+'" cy="'+c[1]+'" r="2.2" fill="#4a8a30" stroke="#fff"/><g transform="translate('+c[0]+' '+c[1]+')">'+_MI_PIN('#4a8a30')+'</g>'
      +_miPill(Math.min(W-40,Math.max(40,(g[0]+c[0])/2+(c[0]<W/2?44:-44))),Math.min(H-30,Math.max(36,(g[1]+c[1])/2+8)),'≈ '+km+' km',11)+'</g>'
      +'<g class="mi-drop"><g transform="translate('+g[0]+' '+g[1]+')">'+_MI_PIN('#e23a2a')+'</g></g>';
  }else if(S.type==='river'){
    const rv=_miRivers.features.filter(inView);
    const isT=f=>S.names.includes(f.properties.name);
    const others=rv.filter(f=>!isT(f)).map(f=>'<path d="'+path(f)+'"/>').join('');
    const tg=rv.filter(isT);
    const pts=[];
    tg.forEach(f=>f.geometry.coordinates.forEach(l=>l.forEach(p=>{const q=proj(p);if(q[0]>14&&q[0]<W-14&&q[1]>34&&q[1]<H-12)pts.push(q);})));
    const mid=pts[Math.floor(pts.length/2)]||[W/2,H/2];
    inner+='<g fill="none" stroke="#5aa9e0" stroke-width="1" stroke-linecap="round" opacity=".9">'+others+'</g>'
      +'<path class="mi-river" d="'+tg.map(f=>path(f)).join('')+'" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'+_miPill(140,8,S.label,13)+_MI_CURSOR;
    style='--cx:'+mid[0].toFixed(1)+'px;--cy:'+mid[1].toFixed(1)+'px';
  }else if(S.type==='lake'){
    const lk=_miLakes.features.filter(inView);
    const t=lk.find(f=>f.properties.name===S.lake);
    const others=lk.filter(f=>f!==t).map(f=>'<path d="'+path(f)+'"/>').join('');
    const p=t.properties,label=p['name_'+lang]||p.name_en||p.name;
    const ct=path.centroid(t);
    inner+='<g fill="#4f94cf" stroke="#2f6aa0" stroke-width=".5">'+others+'</g>'
      +'<path class="mi-lake" d="'+path(t)+'" stroke="#2f6aa0" stroke-width=".5"/>'+_miPill(140,8,label,13)+_MI_CURSOR;
    style='--cx:'+ct[0].toFixed(1)+'px;--cy:'+ct[1].toFixed(1)+'px';
  }else{ // Berg
    const c=P(S.pos);
    inner+='<circle class="mi-peak" cx="'+c[0]+'" cy="'+c[1]+'" r="4.4" stroke="#fff" stroke-width="1.4"/>'+_miPill(140,8,S.label,13)+_MI_CURSOR;
    style='--cx:'+c[0]+'px;--cy:'+c[1]+'px';
  }
  return '<svg class="mi-stage mi-'+key+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-hidden="true" style="'+style+'">'+inner+'</svg>';
}
function openModeInfo(key){
  const L=MODE_INFO[lang]||MODE_INFO.de,m=L[key],meta=CATEGORY_META[key];
  if(!m||!meta)return;
  let box=$('mode-info-modal');
  if(!box){
    box=document.createElement('div');box.id='mode-info-modal';box.className='auth-modal';box.style.display='none';
    box.setAttribute('onclick','if(event.target===this)closeModeInfo()');
    box.innerHTML='<div class="auth-box mode-info-box"><button class="auth-close" onclick="closeModeInfo()" aria-label="close">×</button><div id="mode-info-body"></div></div>';
    document.body.appendChild(box);
  }
  $('mode-info-body').innerHTML='<h2 class="mode-info-title">'+meta.head()+'</h2><div id="mi-wrap"></div><p class="mode-info-text">'+m.text+'</p>';
  box.style.display='flex';
  _miRun(key,++_miTok);
}
// Spielt die 3 Szenen einer Spielart nacheinander (je 6 s), danach von vorn. Szene 1 erscheint sofort, die anderen werden im
// Hintergrund vorbereitet. Bei "weniger Bewegung" im System bleibt es bei der ersten Szene im Endzustand.
async function _miRun(key,tok){
  clearInterval(_miTimer);
  const n=(MI_EXAMPLE[lang]||MI_EXAMPLE.de)[key].length,svgs=[];
  try{svgs[0]=await modeInfoAnim(key,0);}catch(e){return;}
  if(tok!==_miTok||!$('mi-wrap'))return;
  $('mi-wrap').innerHTML=svgs[0];
  for(let i=1;i<n;i++)modeInfoAnim(key,i).then(s=>{svgs[i]=s;}).catch(()=>{});
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  let cur=0;
  _miTimer=setInterval(()=>{
    const box=$('mode-info-modal');
    if(tok!==_miTok||!$('mi-wrap')||!box||box.style.display==='none'){clearInterval(_miTimer);return;}
    for(let k=1;k<=n;k++){const nx=(cur+k)%n;if(svgs[nx]){cur=nx;$('mi-wrap').innerHTML=svgs[nx];return;}}
  },6000);
}
function closeModeInfo(){_miTok++;clearInterval(_miTimer);const b=$('mode-info-modal');if(b)b.style.display='none';}
// "Schon gezeigt"-Merker je Spielmodus: im lokalen Speicher (ohne Anmeldung) und, wenn angemeldet, zusätzlich
// in den Konto-Einstellungen, damit die Erklärung auf einem zweiten Gerät nicht nochmal aufgeht.
let modeInfoSeen={};
try{modeInfoSeen=JSON.parse(localStorage.getItem('geoquiz_modeinfo')||'{}')||{};}catch(e){modeInfoSeen={};}
function _maybeShowModeInfo(key){
  if(modeInfoSeen[key])return;
  modeInfoSeen[key]=1;
  try{localStorage.setItem('geoquiz_modeinfo',JSON.stringify(modeInfoSeen));}catch(e){}
  if(typeof persistSettings==='function')persistSettings();
  setTimeout(()=>openModeInfo(key),250);
}
let _catRerender=null; // zeichnet die gerade offene Kategorie-Seite neu (null = Kategorie-Auswahl)
function toggleClickPanel(key){_clickOpenPanel=_clickOpenPanel===key?null:key;(_catRerender||renderClickPage)();}

function _clickItem(it){
  if(it.disabled)return `<div class="click-item click-item-disabled"><span class="click-item-icon">${it.icon}</span><span class="click-item-text"><span class="click-item-title">${it.title}</span><span class="click-item-sub">${it.sub}</span></span></div>`;
  if(!it.panel)return `<button class="click-item" onclick="${it.onclick}"><span class="click-item-icon">${it.icon}</span><span class="click-item-text"><span class="click-item-title">${it.title}</span><span class="click-item-sub">${it.sub}</span></span></button>`;
  const isOpen=_clickOpenPanel===it.panel;
  return `<div class="click-item-wrap">
    <button class="click-item" onclick="toggleClickPanel('${it.panel}')"><span class="click-item-icon">${it.icon}</span><span class="click-item-text"><span class="click-item-title">${it.title}</span><span class="click-item-sub">${it.sub}</span></span><span class="click-item-arrow">${isOpen?'▲':'▼'}</span></button>
    ${isOpen?`<div class="click-panel">${it.renderPanel()}</div>`:''}
  </div>`;
}
function _continentsPanel(){
  const conts=['EU','AF','AS','NA','SA','OC'];
  return `<div class="gs-grid gs-grid-map">${conts.map(m=>gsCard("startGame('"+m+"')",MODES[m][lang],MODES[m].cnt+' '+t('countries'),'map:'+m)).join('')}</div>`;
}
function _difficultyPanel(){
  return `<div class="gs-grid gs-grid-map">${DIFFICULTY_TIERS.map((ids,i)=>gsCard('startDifficultyGame('+(i+1)+')',t('diffTierLabels')[i],ids.length+' '+t('countries'),'map:diff'+(i+1))).join('')}</div>`;
}
function renderClickPage(){
  showScreen('category-screen');
  _catRerender=renderClickPage;
  const landerItems=[
    {icon:'🌐',title:t('optWorld'),sub:t('optWorldSub'),onclick:"startGame('world')"},
    {icon:'🗺️',title:t('optContinents'),sub:t('continentsSub'),panel:'continents',renderPanel:_continentsPanel},
    {icon:'📊',title:t('optDifficulty'),sub:t('difficultySub'),panel:'difficulty',renderPanel:_difficultyPanel},
    {icon:'💡',title:t('optTrivia'),sub:t('triviaSub'),panel:'trivia',renderPanel:triviaMenuPanel},
    {icon:'⚙️',title:t('optCustom'),sub:t('optCustomSub'),onclick:'openCustom()'}
  ];
  const regionCards=REGION_QUIZ_LIST.map(r=>gsCard("startRegionQuiz('"+r.key+"')",r.name[lang],r.count+' '+t('regions'),'region:'+r.key)).join('');
  $('category-screen').classList.remove('cat-picker');
  $('category-screen').innerHTML=`
    <div class="cat-bg"></div>
    <div class="cat-topbar cat-topbar-split"><button class="gs-home-btn" onclick="openCategoryPicker()">${t('back')}</button>${learnToggleHTML()}</div>
    <div class="cat-inner click-inner">
      <h1 class="cat-heading">${t('catClickTitle')}</h1>
      <div class="click-group gs-map">
        <h2 class="click-group-head">${t('landerTitle')}</h2>
        ${landerItems.map(_clickItem).join('')}
      </div>
      <div class="click-group gs-region">
        <h2 class="click-group-head">${t('regionQuiz')}</h2>
        <div class="gs-grid gs-grid-region">${regionCards}</div>
      </div>
    </div>`;
}

// ── CATEGORY PAGES (Drop-a-Pin, Texteingabe & Multiple Choice, Weitere Quizzes) ──
// Dasselbe Layout wie die Klick-Seite: eine Seite, farbige Bereiche mit Überschrift, darin Zeilen
// (Symbol, Titel, Untertitel); Listen mit mehreren Karten klappen als Panel direkt darunter auf
// (_clickItem/toggleClickPanel). Oben rechts sitzt der Lernmodus-Schalter, den es nur auf diesen
// Seiten gibt (früher in der Wisch-Ansicht).
function learnToggleHTML(){
  const learnBtn=window._authUser
    ?`<button class="gs-mode-btn${learnMode?' active':''}" onclick="setLearnMode(true)">${t('learnModeLbl')}</button>`
    :`<div class="gs-mode-tooltip-wrap"><button class="gs-mode-btn gs-mode-btn-locked" onclick="toggleLearnTooltip(event)">${t('learnModeLbl')}</button><div class="gs-mode-tooltip"><strong>${t('learnModeLbl')}</strong><p>${t('learnModeDesc')}</p><span class="gs-mode-tooltip-cta" onclick="openAuth('login')">${t('learnModeCta')}</span></div></div>`;
  return `<div class="gs-mode-toggle"><button class="gs-mode-btn${!learnMode?' active':''}" onclick="setLearnMode(false)">${t('normalMode')}</button>${learnBtn}</div>`;
}
function _showCatPage(rerender,heading,groups){
  showScreen('category-screen');
  const cs=$('category-screen');cs.classList.remove('cat-picker');
  _catRerender=rerender;
  cs.innerHTML=`
    <div class="cat-bg"></div>
    <div class="cat-topbar cat-topbar-split"><button class="gs-home-btn" onclick="openCategoryPicker()">${t('back')}</button>${learnToggleHTML()}</div>
    <div class="cat-inner click-inner">
      <h1 class="cat-heading">${heading}</h1>
      ${groups.map(g=>`<div class="click-group ${g.cls}"><h2 class="click-group-head">${g.head}</h2>${(g.items||[]).map(_clickItem).join('')}${g.grid?`<div class="gs-grid ${g.gridCls||''}">${g.grid}</div>`:''}</div>`).join('')}
    </div>`;
}
function _cardsPanel(cards,gridCls){return `<div class="gs-grid ${gridCls}">${cards.join('')}</div>`;}
function renderPinPage(){
  const labels=TX[lang].cityCountries.map(d=>d.label).join(', ');
  _showCatPage(renderPinPage,t('catPinTitle'),[
    {cls:'gs-pin',head:t('pinQuiz'),items:[
      {icon:'🌐',title:t('flagWorld'),sub:getPinCities('world').length+' '+t('cities'),onclick:"startPinGame('world')"},
      {icon:'🗺️',title:t('optContinents'),sub:t('continentsSub'),panel:'pin-conts',renderPanel:()=>_cardsPanel(['EU','AF','AS','NA','SA','OC'].map(m=>gsCard("startPinGame('"+m+"')",MODES[m][lang],getPinCities(m).length+' '+t('cities'),'pin:'+m)),'gs-grid-pin')},
      {icon:'🏳️',title:t('landerTitle'),sub:labels,panel:'pin-countries',renderPanel:()=>_cardsPanel(TX[lang].cityCountries.map(d=>gsCard("startPinGame('"+d.key+"')",d.label,getPinCities(d.key).length+' '+t('cities'),'pin:'+d.key)),'gs-grid-pin')}
    ]},
    {cls:'gs-pin',head:t('optTrivia'),items:[
      {icon:'💡',title:t('pinTriviaLbl'),sub:getPinCities('trivia').length+' '+t('landmarks'),onclick:"startPinGame('trivia')"},
      {icon:'🎂',title:t('pinPeopleLbl'),sub:getPinCities('people').length+' '+t('personsLbl'),onclick:"startPinGame('people')"}
    ]}
  ]);
}
const INPUT_ICONS={flag:'🏳️',capital:'🏛️',outline:'🗾',language:'🗣️',currency:'💱',wappen:'🛡️',neighbor:'🧩',pie:'🥧'};
// Texteingabe & Multiple Choice: kein Zwischenmenü mehr. Quiz-Arten mit Kontinent-/Schwierigkeitswahl klappen
// direkt darunter auf (Karten: Weltweit, Kontinente, Schwierigkeit), die anderen starten sofort. Beim
// Hauptstadt-Quiz steht oben im Panel noch die Richtung (Land→Hauptstadt …), sie bleibt gemerkt.
let _iqDirPref='c2cap';
function setIqDirPref(v){_iqDirPref=v;renderInputPage();}
function _iqCard(type,region,diff,label){
  const cfg={type,region,diff,dir:_iqDirPref};
  const n=iqPoolIds(cfg).length;
  return gsCard("startInputQuiz({type:'"+type+"',region:'"+region+"',diff:'"+diff+"',dir:'"+_iqDirPref+"'})",label,n+' '+t('countries'),iqScoreKey(cfg));
}
function _iqPanel(type){
  const regions=['EU','AF','AS','NA','SA','OC'];
  const diffs=TX[lang].flagDiffs;
  let html='';
  if(type==='capital'){
    const chip=(v,l)=>`<button class="iq-chip${_iqDirPref===v?' on':''}" onclick="setIqDirPref('${v}')">${l}</button>`;
    html+=`<div class="click-sublabel">${t('cfgDir')}</div><div class="iq-chips click-chips">${chip('c2cap',t('dirC2Cap'))}${chip('cap2c',t('dirCap2C'))}${chip('flag2cap',t('dirFlag2Cap'))}</div>`;
  }
  html+=`<div class="click-sublabel">${t('cfgRegion')}</div><div class="gs-grid gs-grid-flag">${_iqCard(type,'world','all',t('regWorld'))}${regions.map(r=>_iqCard(type,r,'all',MODES[r][lang])).join('')}</div>`;
  html+=`<div class="click-sublabel">${t('cfgDiff')}</div><div class="gs-grid gs-grid-flag">${diffs.map(d=>_iqCard(type,'world',d.key,d.label)).join('')}</div>`;
  return html;
}
function renderInputPage(){
  if(INPUT_QUIZZES.some(q=>q.type==='outline')&&typeof iqEnsureOutlineGeo==='function'&&!outlineGeo)iqEnsureOutlineGeo().then(()=>{if(_catRerender===renderInputPage&&$('category-screen').style.display!=='none')renderInputPage();});
  const scopable=ty=>ty!=='language'&&ty!=='currency'&&ty!=='neighbor';
  _showCatPage(renderInputPage,t('catInputTitle'),[
    ...(typeof fillMenuGroup==='function'?[fillMenuGroup()]:[]),
    {cls:'gs-flag',head:t('inputQuiz'),items:INPUT_QUIZZES.map(q=>{
      const base={icon:INPUT_ICONS[q.type]||'✏️',title:t(q.titleKey),sub:t(q.subKey)};
      return scopable(q.type)
        ?{...base,panel:'iq-'+q.type,renderPanel:()=>_iqPanel(q.type)}
        :{...base,onclick:"startInputQuiz({type:'"+q.type+"',region:'world',diff:'all',dir:'c2cap'})"};
    })}
  ]);
}
const OTHER_HEADS={de:['Städte','Flüsse','Seen','Gebirge'],en:['Cities','Rivers','Lakes','Mountains'],es:['Ciudades','Ríos','Lagos','Montañas'],fr:['Villes','Fleuves','Lacs','Montagnes']};
function renderOtherPage(){
  // Städte-Quiz nur für Länder mit eigener Städteliste (CITY_COUNTRIES); die längere Länderliste gilt für Drop-a-Pin
  const cityDiffs=TX[lang].cityDiffs,cityCountries=TX[lang].cityCountries.filter(d=>CITY_COUNTRIES[d.key]),H=OTHER_HEADS[lang]||OTHER_HEADS.de;
  _showCatPage(renderOtherPage,t('catOtherTitle'),[
    {cls:'gs-city',head:H[0],items:[
      {icon:'⭐',title:t('optDifficulty'),sub:cityDiffs.map(d=>d.label).join(', '),panel:'city-diffs',renderPanel:()=>_cardsPanel(cityDiffs.map(d=>gsCard("startCityGame('"+d.key+"')",d.label,getAllCitiesByDifficulty(d.key).length+' '+t('cities'),'city:'+d.key)),'gs-grid-city')},
      {icon:'🏳️',title:t('landerTitle'),sub:cityCountries.map(d=>d.label).join(', '),panel:'city-countries',renderPanel:()=>_cardsPanel(cityCountries.map(d=>gsCard("startCityGame('"+d.key+"')",d.label,(CITY_COUNTRIES[d.key]?CITY_COUNTRIES[d.key].cities.length:0)+' '+t('cities'),'city:'+d.key)),'gs-grid-city')}
    ]},
    {cls:'gs-river',head:H[1],gridCls:'gs-grid-river',grid:TX[lang].riverDiffs.map(d=>gsCard("startRiverGame('"+d.key+"')",d.label,d.count+' '+t('rivers'),'river:'+d.key)).join('')},
    {cls:'gs-lake',head:H[2],gridCls:'gs-grid-lake',grid:TX[lang].lakeDiffs.map(d=>gsCard("startLakeGame('"+d.key+"')",d.label,d.count+' '+t('lakes'),'lake:'+d.key)).join('')},
    {cls:'gs-mountain',head:H[3],items:[
      {icon:'⛰️',title:t('peaks'),sub:TX[lang].mountainDiffs.map(d=>d.label).join(', '),panel:'mt-peaks',renderPanel:()=>_cardsPanel(TX[lang].mountainDiffs.map(d=>gsCard("startMountainGame('"+d.key+"')",d.label,d.count+' '+t('peaks'),'mountain:'+d.key)),'gs-grid-pin')},
      {icon:'🏔️',title:t('mountainRanges'),sub:TX[lang].rangeDiffs.map(d=>d.label).join(', '),panel:'mt-ranges',renderPanel:()=>_cardsPanel(TX[lang].rangeDiffs.map(d=>gsCard("startRangeGame('"+d.key+"')",d.label,d.count+' '+t('mountainRanges'),'range:'+d.key)),'gs-grid-pin')}
    ]}
  ]);
}

function og(label,inner){return `<div class="opt-group"><div class="opt-label">${label}</div><div class="opt-row">${inner}</div></div>`;}
const LANG_OPTIONS=[{code:'de',flag:'data/flags/h20/de.png',label:'Deutsch'},{code:'en',flag:'data/flags/h20/gb.png',label:'English'},{code:'es',flag:'data/flags/w320/es.png',label:'Español'},{code:'fr',flag:'data/flags/w320/fr.png',label:'Français'}];
function langGroup(){return og(t('langLbl'),
  LANG_OPTIONS.map(o=>`<button class="lb lb-flag${lang===o.code?' active':''}" onclick="setLang('${o.code}')"><img class="lbflag" src="${o.flag}" alt="">${o.label}</button>`).join(''));}
function themeGroup(){return og(t('themeLbl'),
  ['atlas','neon','terrain','cartoon'].map(k=>`<button class="tp${theme===k?' active':''}" onclick="setTheme('${k}')"><span class="dot" style="background:${THEME_DOT[k]};"></span><span>${t('themes')[k]}</span></button>`).join(''));}
const MERC_ICON=`<svg width="21" height="14" viewBox="0 0 21 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:4px;flex-shrink:0"><rect x="1" y="1" width="19" height="12" rx="0" stroke="currentColor" stroke-width="1.3"/><line x1="1" y1="4.7" x2="20" y2="4.7" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><line x1="1" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><line x1="1" y1="9.3" x2="20" y2="9.3" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><line x1="14" y1="1" x2="14" y2="13" stroke="currentColor" stroke-width="0.6" opacity="0.55"/></svg>`;
const NE_ICON=`<svg width="21" height="14" viewBox="0 0 21 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:4px;flex-shrink:0"><path d="M4.5,1.5 Q10.5,0.7 16.5,1.5 Q20,3.8 20,7 Q20,10.2 16.5,12.5 Q10.5,13.3 4.5,12.5 Q1,10.2 1,7 Q1,3.8 4.5,1.5Z" stroke="currentColor" stroke-width="1.3"/><line x1="2.2" y1="4.7" x2="18.8" y2="4.7" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><line x1="1" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><line x1="2.2" y1="9.3" x2="18.8" y2="9.3" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><path d="M7.5,1.2 Q6.2,7 7.5,12.8" stroke="currentColor" stroke-width="0.6" opacity="0.55" fill="none"/><path d="M13.5,1.2 Q14.8,7 13.5,12.8" stroke="currentColor" stroke-width="0.6" opacity="0.55" fill="none"/></svg>`;
const GLOBE_ICON=`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:4px;flex-shrink:0"><circle cx="8" cy="8" r="6.7" stroke="currentColor" stroke-width="1.3"/><ellipse cx="8" cy="8" rx="3" ry="6.7" stroke="currentColor" stroke-width="0.8" opacity="0.6"/><line x1="1.3" y1="8" x2="14.7" y2="8" stroke="currentColor" stroke-width="0.8" opacity="0.6"/></svg>`;
function projGroup(){return og(t('projLbl'),
  `<button class="lb lb-flag${projection==='mercator'?' active':''}" onclick="setProjection('mercator')">${MERC_ICON}${t('projMerc')}</button>`+
  `<button class="lb lb-flag${projection==='natural'?' active':''}" onclick="setProjection('natural')">${NE_ICON}${t('projStd')}</button>`+
  `<button class="lb lb-flag${projection==='equal'?' active':''}" onclick="setProjection('equal')">${NE_ICON}${t('projEqual')}</button>`+
  `<button class="lb lb-flag${projection==='globe'?' active':''}" onclick="setProjection('globe')">${GLOBE_ICON}${t('projGlobe')}</button>`);}
function infoIcon(tip){return `<span class="opt-info"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6" r="5.3" stroke="currentColor" stroke-width="1.1"/><text x="6" y="9.3" text-anchor="middle" fill="currentColor" font-size="7.5" font-family="sans-serif" font-weight="700" font-style="italic">i</text></svg><span class="opt-tip">${tip}</span></span>`;}
function wrongHintGroup(){return og(t('wrongHintLabel')+infoIcon(t('wrongHintTip')),
  `<button class="lb${showWrongHint?' active':''}" onclick="setWrongHint(true)">${t('wrongHintOn')}</button>`+
  `<button class="lb${!showWrongHint?' active':''}" onclick="setWrongHint(false)">${t('wrongHintOff')}</button>`);}
function keepFoundGroup(){return og(t('foundModeLabel'),
  `<button class="lb${keepFound?' active':''}" onclick="setKeepFound(true)">${t('keepOn')}</button>`+
  `<button class="lb${!keepFound?' active':''}" onclick="setKeepFound(false)">${t('keepOff')}</button>`);}
function skipHintGroup(){return og(t('skipHintLabel')+infoIcon(t('skipHintTip')),
  `<button class="lb${showSkipHint?' active':''}" onclick="setSkipHint(true)">${t('skipHintOn')}</button>`+
  `<button class="lb${!showSkipHint?' active':''}" onclick="setSkipHint(false)">${t('skipHintOff')}</button>`);}
function colorblindGroup(){return og(t('colorblindLabel')+infoIcon(t('colorblindTip')),
  `<button class="lb${colorblindMode?' active':''}" onclick="setColorblindMode(true)">${t('colorblindOn')}</button>`+
  `<button class="lb${!colorblindMode?' active':''}" onclick="setColorblindMode(false)">${t('colorblindOff')}</button>`);}
// Home-Overlay: globale Voreinstellungen · In-Game: Gameplay-Schalter
function roundLimitGroup(){
  return og(t('roundLimitLbl'),
    `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">` +
    `<input type="number" class="gs-round-input" min="1" max="9999" value="${quizRoundLimit}" ${allTargets?'disabled':''} oninput="setQuizRoundLimit(Math.max(1,+this.value)||10)" style="${allTargets?'opacity:.35;pointer-events:none':''}">` +
    `<span style="font-size:12px;opacity:.55;${allTargets?'opacity:.3':''}">${t('perQuizLbl')}</span>` +
    `<label class="all-targets-lbl"><input type="checkbox" ${allTargets?'checked':''} onchange="setAllTargets(this.checked)"> ${t('allTargetsLbl')}</label>` +
    `</div>`
  );
}
function optHomeHTML(){return langGroup()+projGroup()+colorblindGroup()+wrongHintGroup()+skipHintGroup()+roundLimitGroup();}
function optGameHTML(){return themeGroup()+keepFoundGroup();}
// Eine Optionen-Box für alles: im Hauptmenü die globalen Voreinstellungen, mitten im Spiel (Karte,
// Regionen, Flaggen/Text-Quiz) die jeweiligen Schalter — immer im selben kleinen Fenster, es klappt
// keine zusätzliche Zeile mehr oben auf. _optsCtx bestimmt, was das Fenster zeigt.
let _optsCtx='home';
function iqSizeGroup(){
  const li=Math.max(0,['de','en','es','fr'].indexOf(lang));
  const lab=['Anzeigegröße','Display size','Tamaño','Taille'][li],nm={s:['Klein','Small','Pequeño','Petit'][li],m:['Mittel','Medium','Mediano','Moyen'][li],l:['Groß','Large','Grande','Grand'][li]};
  return og(lab,['s','m','l'].map(k=>`<button class="lb${iqSize===k?' active':''}" onclick="setIqSize('${k}')">${nm[k]}</button>`).join(''));
}
function setIqSize(v){iqSize=v;applyIqSize();renderOptions();persistSettings();}
function applyIqSize(){const el=$('flag-screen');if(!el)return;el.classList.remove('iq-size-s','iq-size-m','iq-size-l');el.classList.add('iq-size-'+iqSize);}
function flagOptsHTML(){
  return iqSizeGroup()+og(t('cfgDropdownLabel'),
      `<button class="lb${showDropdown?' active':''}" onclick="setIqDropdown(true)">${t('cfgDropdownOn')}</button>`+
      `<button class="lb${!showDropdown?' active':''}" onclick="setIqDropdown(false)">${t('cfgDropdownOff')}</button>`)+
    og(t('cfgSkipHintLabel'),
      `<button class="lb${showSkipHint?' active':''}" onclick="setIqSkipHint(true)">${t('cfgSkipHintOn')}</button>`+
      `<button class="lb${!showSkipHint?' active':''}" onclick="setIqSkipHint(false)">${t('cfgSkipHintOff')}</button>`);
}
function optsModalHTML(){return _optsCtx==='game'?optGameHTML():_optsCtx==='region'?themeGroup():_optsCtx==='flag'?flagOptsHTML():optHomeHTML();}
function renderOptions(){const h=$('home-opts-content');if(h)h.innerHTML=optsModalHTML();const g=$('opts-content');if(g)g.innerHTML=optGameHTML();}
function openCtxOpts(ctx){_optsCtx=ctx;setTxt('home-opts-title',t('optionsLbl'));renderOptions();const m=$('home-opts-modal');if(m)m.style.display='flex';}
function openHomeOpts(){openCtxOpts('home');}
function closeHomeOpts(){const m=$('home-opts-modal');if(m)m.style.display='none';_optsCtx='home';}

function setLang(l){lang=l;updateAllText();renderOptions();if($('custom-screen').style.display!=='none')renderCustom();persistSettings();}
function setTheme(v){
  theme=v;applyTheme();
  renderOptions();renderRegionOpts();
  // applyTheme() only touches the main world-map DOM; the region quiz builds its own SVG fresh
  // each render and doesn't listen for theme changes, so it needs an explicit re-render here.
  if(_regGame&&$('region-screen')&&$('region-screen').style.display!=='none')_renderRegionMap(_regGame.cfg,_regGame.features);
  persistSettings();
}
function toggleRegionOpts(){openCtxOpts('region');}
function renderRegionOpts(){renderOptions();}
function setKeepFound(v){keepFound=v;updateColors();renderOptions();persistSettings();}
function setWrongHint(v){showWrongHint=v;renderOptions();persistSettings();}
function setSkipHint(v){showSkipHint=v;renderOptions();persistSettings();}
function setProjection(v){
  if(v===projection)return;
  projection=v;renderOptions();persistSettings();
  // Live umstellen, falls gerade eine Karte sichtbar ist
  if(worldData&&$('game-screen')&&$('game-screen').style.display!=='none'&&game&&Object.keys(game).length){
    renderMap(worldData);
    if(game.cityMode){const z=cityZoom(game.cityFeatures);if(z)zoomTo(z[0],z[1],z[2]);}
    else if(game.pinMode){pinZoomNow();}
    else if(game.lakeMode||game.riverMode||game.mode==='custom'){/* Weltansicht beibehalten */}
    else if(game.mode){const g=zoomForMode(game.mode);zoomToGeo(g.lon,g.lat,g.k);}
  }
}
function persistSettings(){if(typeof saveSettings==='function')saveSettings();}

// ── SETTINGS / SCORE BRIDGE (used by auth.js data layer) ──
function gatherSettings(){return {modeInfoSeen,lang,theme,colorblindMode,keepFound,showWrongHint,showSkipHint,showDropdown,projection,learnMode,allTargets,quizRoundLimit,iqSize,customConts:[...customConts],dailyHintDismissed};}
function applyRemoteSettings(s){
  if(!s)return;
  if(LANG_OPTIONS.some(o=>o.code===s.lang))lang=s.lang;
  if(s.theme&&THEMES[s.theme])theme=s.theme;
  if(typeof s.colorblindMode==='boolean'){colorblindMode=s.colorblindMode;_applyColorblindOverride();}
  if(typeof s.keepFound==='boolean')keepFound=s.keepFound;
  if(typeof s.showWrongHint==='boolean')showWrongHint=s.showWrongHint;
  if(typeof s.showSkipHint==='boolean')showSkipHint=s.showSkipHint;
  if(typeof s.showDropdown==='boolean')showDropdown=s.showDropdown;
  if(s.iqSize==='s'||s.iqSize==='m'||s.iqSize==='l'){iqSize=s.iqSize;applyIqSize();}
  if(s.projection==='mercator'||s.projection==='natural'||s.projection==='equal'||s.projection==='globe')projection=s.projection;
  if(typeof s.learnMode==='boolean')learnMode=s.learnMode;
  if(typeof s.allTargets==='boolean')allTargets=s.allTargets;
  if(typeof s.dailyHintDismissed==='boolean')dailyHintDismissed=s.dailyHintDismissed;
  if(s.modeInfoSeen&&typeof s.modeInfoSeen==='object')Object.assign(modeInfoSeen,s.modeInfoSeen);
  if(typeof s.quizRoundLimit==='number'&&s.quizRoundLimit>=1)quizRoundLimit=s.quizRoundLimit;
  if(Array.isArray(s.customConts)&&s.customConts.length>0){
    const valid=new Set(['EU','AF','AS','NA','SA','OC']);
    const filtered=s.customConts.filter(k=>valid.has(k));
    if(filtered.length>0)customConts=new Set(filtered);
  }
  updateAllText();applyTheme();renderOptions();
}
function refreshScoresUI(){if($('mode-screen')&&$('mode-screen').style.display!=='none')renderModeScreen();if(_catRerender&&$('category-screen')&&$('category-screen').style.display!=='none')_catRerender();}
function gameScoreKey(){
  // Region quizzes track best score too, but keep their own separate state (_regGame) rather
  // than the shared game object — same reasoning as elsewhere in the region-quiz code.
  if(_regGame)return 'region:'+_regGame.key;
  if(!game)return null;
  if(game.fillMode)return 'fill:'+game.fillKey;
  if(game.flagMode)return game.iqCfg?iqScoreKey(game.iqCfg):null;
  if(game.pinMode)return 'pin:'+(game.difficulty||'EU');
  if(game.cityMode)return 'city:'+game.difficulty;
  if(game.riverMode)return 'river:'+game.difficulty;
  if(game.lakeMode)return 'lake:'+game.difficulty;
  if(game.mountainMode)return 'mountain:'+game.difficulty;
  if(game.rangeMode)return 'range:'+game.difficulty;
  if(game.triviaMode)return 'trivia:'+(game.triviaCat&&game.triviaCat!=='all'?game.triviaCat:'world');
  if(game.mode&&game.mode!=='custom')return 'map:'+game.mode;
  return null;
}
function gameScoreValue(){
  if(_regGame)return {score:_regGame.firstTry||0,total:_regGame.total||0};
  if(game.fillMode)return game.fillPath?{score:game.fillPath.total,total:game.fillPath.pairs.length*100}:{score:Math.max(0,game.found.size-(game.hints||0)),total:game.total||0};
  if(game.flagMode)return {score:game.flagCorrect||0,total:game.flagTotal||0};
  if(game.pinMode){const isCont=PIN_BONUS_REGIONS.includes(game.pinRegion);return {score:game.pinScore||0,total:(game.total||0)*(isCont?1050:1000)};}
  return {score:game.firstTry||0,total:game.total||0};
}
// Verstecktes Tracking: meldet die aktuell gefragte (falsch beantwortete) Frage an die Datenschicht
function recordMissForCurrent(){
  if(typeof recordMiss!=='function'||!game)return;
  let k=null;
  if(game.flagMode&&game.flagCurrent!=null)k=IQ_PREFIX[game.inputMode||'flag']+game.flagCurrent;
  else if(game.cityMode&&game.current!=null)k='city:'+cityDisplayName(game.cityFeatures[game.current]);
  else if(game.riverMode&&game.current!=null)k='river:'+riverDisplayName(game.riverFeatures[game.current]);
  else if(game.lakeMode&&game.current!=null)k='lake:'+lakeDisplayName(game.lakeFeatures[game.current]);
  else if(game.mountainMode&&game.current!=null)k='mountain:'+mountainDisplayName(game.mountainFeatures[game.current]);
  else if(game.rangeMode&&game.current!=null)k='range:'+rangeDisplayName(game.rangeFeatures[game.current]);
  else if(game.current)k='country:'+game.current;
  if(k)recordMiss(k);
}
// Records the just-finished game's result; returns a best-note string for the result screen
function resultBestNote(){
  const key=gameScoreKey();if(!key||typeof recordScore!=='function')return '';
  const v=gameScoreValue();if(!v.total)return '';
  const isBest=recordScore(key,v.score,v.total);
  if(isBest)return ' · 🏆 '+t('newRecord');
  const b=bestScore(key);return b?' · '+t('bestLabel')+' '+b.pct+'%':'';
}
function mapBg(h){return projection==='globe'?'#000':h.bg;} // Globus: dunkler Weltraum um die Kugel
// Hintergrund der Karte: Farbe des Themes, beim Globus Sternenhimmel (sky.js); das Ozean-Rechteck ist dort durchsichtig
function setMapBg(h){const el=$('map-bg');if(!el)return;el.style.backgroundColor=mapBg(h);el.style.backgroundImage='none';if(projection==='globe'&&window.Sky)window.Sky.apply(el);else if(window.Sky)window.Sky.clear();}
function oceanFill(h){return projection==='globe'?'none':h.bg;}
function applyTheme(){const h=THEMES[theme];document.body.classList.toggle('theme-cartoon',theme==='cartoon');setMapBg(h);$('prog-bar').style.background=h.bar;d3.select('#map rect.ocean').attr('fill',oceanFill(h));d3.select('#map path.ocean-mask').attr('fill',h.bg);d3.select('#map path.sphere').attr('fill',h.sph).attr('stroke',h.grd);d3.select('#map path.grat').attr('stroke',h.grd);if(borderPath)borderPath.attr('stroke',h.border);if(projection==='globe'&&countryPaths)countryPaths.attr('stroke',h.border);if(admin1Path)admin1Path.attr('stroke',h.border);d3.select('#map path.coastline').attr('stroke',h.border);d3.select('#map g.lakes').selectAll('path').attr('fill',h.sph).attr('stroke',h.border);updateColors();}
function toggleOpts(){openCtxOpts('game');}

function setTxt(id,v){const e=$(id);if(e)e.textContent=v;}
function renderHome(){
  setTxt('home-title',t('homeTitle'));setTxt('home-sub',t('homeSub'));
  setTxt('home-play',t('playBtn'));setTxt('home-random-btn',t('randomChallengeBtn'));setTxt('home-daily-btn',t('dailyChallengeBtn'));setTxt('home-duel-btn','⚔️ '+({es:'Multijugador',fr:'Multijoueur'}[lang]||'Multiplayer'));setTxt('home-options-btn','⚙ '+t('optionsLbl'));
  const dailyBtn=$('home-daily-btn');if(dailyBtn)dailyBtn.title=window._authUser?'':t('dailyLoginRequired');
  setTxt('home-opts-title',t('optionsLbl'));
  setTxt('build-stamp','Build '+BUILD_ID);
  renderOptions();
  if(typeof renderAuthUI==='function')renderAuthUI(window._authUser||null);
  if(typeof renderAuthForm==='function'&&$('auth-modal')&&$('auth-modal').style.display!=='none')renderAuthForm();
}
function updateAllText(){
  renderHome();
  if($('mode-screen').style.display!=='none')renderModeScreen();
  if(_catRerender&&$('category-screen')&&$('category-screen').style.display!=='none')_catRerender();
  setTxt('btn-back',t('back'));setTxt('find-label',game.riverMode?t('findRiver'):game.lakeMode?t('findLake'):game.cityMode?t('findCity'):game.mountainMode?t('findMountain'):game.rangeMode?t('findRange'):game.pinMode?pinFindLabel():game.triviaMode?(game.currentGroup&&game.currentGroup.size>1?t('findTriviaN'):t('findTrivia')):t('find'));setTxt('found-label',t('foundLbl'));setTxt('lbl-c',t('correctLbl'));setTxt('lbl-w',t('wrongLbl'));setTxt('btn-skip',t('skipLbl'));setTxt('res-title',t('resTitle'));setTxt('btn-again',t('again'));setTxt('btn-new',t('newgame'));setTxt('btn-share',t('shareBtn'));setTxt('opts-title',t('optionsLbl'));setTxt('flag-btn-back',t('back'));setTxt('flag-lbl-c',t('correctLbl'));setTxt('flag-lbl-w',t('wrongLbl'));
  // Only the plain country quiz shows the target's own name — every other mode (lake/river/city/
  // pin/population) shows a question instead, which must survive a language switch untouched
  // rather than being clobbered back into a country name here.
  if(game.current&&C[game.current]&&!(game.riverMode||game.lakeMode||game.cityMode||game.mountainMode||game.rangeMode||game.pinMode||game.triviaMode))$('target-name').textContent=cn(game.current);updateStats();
  if(typeof _renderDsContent==='function'&&$('datenschutz-modal')&&$('datenschutz-modal').style.display!=='none')_renderDsContent();
  if(typeof _renderSrc==='function'&&$('sources-modal')&&$('sources-modal').style.display!=='none')_renderSrc();
}

const SECTIONS=['map','region','flag','pin','city','river','lake','mountain'];
function gsCard(onclick,title,sub,key){
  let badge='';
  if(key&&typeof bestScore==='function'){const b=bestScore(key);if(b)badge='<span class="gs-card-best">★ '+b.pct+'%</span>';}
  return `<button class="gs-card" onclick="${onclick}"><span class="gs-card-t">${title}</span><span class="gs-card-s">${sub}</span>${badge}</button>`;
}
function sectionInner(key){
  if(key==='map'){
    const ms=['world','EU','AF','AS','NA','SA','OC','custom'];
    return ms.map(m=>gsCard(m==='custom'?'openCustom()':"startGame('"+m+"')",MODES[m][lang],m==='custom'?'⚙':MODES[m].cnt+' '+t('countries'),m==='custom'?null:'map:'+m)).join('')
      +gsCard('startTriviaGame()',t('optTrivia'),'💡','trivia:world');
  }
  if(key==='region')return REGION_QUIZ_LIST.map(r=>gsCard("startRegionQuiz('"+r.key+"')",r.name[lang],r.count+' '+t('regions'),'region:'+r.key)).join('');
  if(key==='lake')return TX[lang].lakeDiffs.map(d=>gsCard("startLakeGame('"+d.key+"')",d.label,d.count+' '+t('lakes'),'lake:'+d.key)).join('');
  if(key==='river')return TX[lang].riverDiffs.map(d=>gsCard("startRiverGame('"+d.key+"')",d.label,d.count+' '+t('rivers'),'river:'+d.key)).join('');
  if(key==='city'){
    const diffs=TX[lang].cityDiffs.map(d=>gsCard("startCityGame('"+d.key+"')",d.label,getAllCitiesByDifficulty(d.key).length+' '+t('cities'),'city:'+d.key));
    const countries=TX[lang].cityCountries.map(d=>gsCard("startCityGame('"+d.key+"')",d.label,(CITY_COUNTRIES[d.key]?CITY_COUNTRIES[d.key].cities.length:0)+' '+t('cities'),'city:'+d.key));
    return diffs.join('')+'<div style="grid-column:1/-1;height:1px;background:rgba(240,176,96,.2);margin:.5rem 0;"></div>'+countries.join('');
  }
  if(key==='pin'){
    const world=gsCard("startPinGame('world')",t('flagWorld'),getPinCities('world').length+' '+t('cities'),'pin:world');
    const conts=['EU','AF','AS','NA','SA','OC'].map(m=>gsCard("startPinGame('"+m+"')",MODES[m][lang],getPinCities(m).length+' '+t('cities'),'pin:'+m));
    const countries=TX[lang].cityCountries.map(d=>gsCard("startPinGame('"+d.key+"')",d.label,getPinCities(d.key).length+' '+t('cities'),'pin:'+d.key));
    const trivia=gsCard("startPinGame('trivia')",t('pinTriviaLbl'),getPinCities('trivia').length+' '+t('landmarks'),'pin:trivia')
      +gsCard("startPinGame('people')",t('pinPeopleLbl'),getPinCities('people').length+' '+t('personsLbl'),'pin:people');
    return world+conts.join('')+'<div style="grid-column:1/-1;height:1px;background:rgba(226,90,90,.2);margin:.5rem 0;"></div>'+countries.join('')+'<div style="grid-column:1/-1;height:1px;background:rgba(226,90,90,.2);margin:.5rem 0;"></div>'+trivia;
  }
  if(key==='flag'){
    return INPUT_QUIZZES.map(q=>gsCard("openInputCfg('"+q.type+"')",t(q.titleKey),t(q.subKey),null)).join('');
  }
  if(key==='mountain'){
    const groupLabel=txt=>`<div style="grid-column:1/-1;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#888;margin:.3rem 0 -.2rem;">${txt}</div>`;
    const ranges=TX[lang].rangeDiffs.map(d=>gsCard("startRangeGame('"+d.key+"')",d.label,d.count+' '+t('mountainRanges'),'range:'+d.key)).join('');
    const peaks=TX[lang].mountainDiffs.map(d=>gsCard("startMountainGame('"+d.key+"')",d.label,d.count+' '+t('peaks'),'mountain:'+d.key)).join('');
    return groupLabel(t('mountainRanges'))+ranges
      +'<div style="grid-column:1/-1;height:1px;background:rgba(160,120,80,.2);margin:.5rem 0;"></div>'
      +groupLabel(t('peaks'))+peaks;
  }
  return '';
}
const SECTION_META={
  map:{icon:'🗺️',head:()=>t('mapQuiz'),sub:()=>t('sub')},
  region:{icon:'🏛️',head:()=>t('regionQuiz'),sub:()=>t('regionSub')},
  lake:{icon:'💧',head:()=>t('lakeQuiz'),sub:()=>t('lakeSub')},
  river:{icon:'🌊',head:()=>t('riverQuiz'),sub:()=>t('riverSub')},
  city:{icon:'🏙️',head:()=>t('cityQuiz'),sub:()=>t('citySub')},
  pin:{icon:'📍',head:()=>t('pinQuiz'),sub:()=>t('pinSub')},
  flag:{icon:'✏️',head:()=>t('inputQuiz'),sub:()=>t('inputSub')},
  mountain:{icon:'⛰️',head:()=>t('mountainQuiz'),sub:()=>t('mountainSub')}
};
const INPUT_QUIZZES=[
  {type:'flag',titleKey:'flagQuiz',subKey:'flagCardSub'},
  {type:'capital',titleKey:'capitalQuiz',subKey:'capitalCardSub'},
  {type:'outline',titleKey:'outlineQuiz',subKey:'outlineCardSub'},
  {type:'language',titleKey:'languageQuiz',subKey:'languageCardSub'},
  {type:'currency',titleKey:'currencyQuiz',subKey:'currencyCardSub'},
  {type:'wappen',titleKey:'wappenQuiz',subKey:'wappenCardSub'},
  {type:'neighbor',titleKey:'neighborQuiz',subKey:'neighborCardSub'},
  {type:'pie',titleKey:'pieQuiz',subKey:'pieCardSub'}
];
// Nachbarland-Flaggen-Rätsel: guess the country from its neighbors' flags alone (e.g. Switzerland +
// Austria -> Liechtenstein). Curated from the map's own real adjacency (topojson.neighbors() on
// countries-50m.json, computed once in a browser console and pasted in — see Entscheidungen.md),
// restricted to countries with exactly 2 or 3 land neighbors so the puzzle stays tight and roughly
// as solvable as the Liechtenstein example. Two pairs were excluded entirely because they share an
// identical neighbor-set with another country (UAE/Yemen both border only Saudi Arabia+Oman;
// Bhutan/Nepal both border only India+China) — showing that pair would have no unique answer.
// Somalia was excluded too: the 50m topology doesn't carry its short border with Djibouti, so its
// computed neighbor list (Kenya+Ethiopia only) is geographically incomplete.
const NEIGHBOR_PUZZLES=[{id:8,neighbors:[499,807,300]},
  {id:20,neighbors:[724,250]},
  {id:226,neighbors:[266,120]},
  {id:50,neighbors:[356,104]},
  {id:84,neighbors:[484,320]},
  {id:70,neighbors:[688,499,191]},
  {id:72,neighbors:[716,710,516]},
  {id:108,neighbors:[834,646,180]},
  {id:152,neighbors:[604,68,32]},
  {id:188,neighbors:[591,558]},
  {id:262,neighbors:[231,232]},
  {id:218,neighbors:[604,170]},
  {id:222,neighbors:[340,320]},
  {id:232,neighbors:[729,231,262]},
  {id:233,neighbors:[643,428]},
  {id:748,neighbors:[710,508]},
  {id:246,neighbors:[752,643,578]},
  {id:266,neighbors:[226,178,120]},
  {id:288,neighbors:[768,384,854]},
  {id:624,neighbors:[686,324]},
  {id:328,neighbors:[862,740,76]},
  {id:340,neighbors:[558,320,222]},
  {id:360,neighbors:[626,598,458]},
  {id:116,neighbors:[704,764,418]},
  {id:414,neighbors:[682,368]},
  {id:422,neighbors:[760,376]},
  {id:430,neighbors:[694,324,384]},
  {id:438,neighbors:[756,40]},
  {id:442,neighbors:[276,250,56]},
  {id:454,neighbors:[894,834,508]},
  {id:458,neighbors:[764,360,96]},
  {id:504,neighbors:[12,478]},
  {id:484,neighbors:[840,320,84]},
  {id:498,neighbors:[804,642]},
  {id:496,neighbors:[643,156]},
  {id:558,neighbors:[340,188]},
  {id:528,neighbors:[276,56]},
  {id:408,neighbors:[410,643,156]},
  {id:578,neighbors:[752,643,246]},
  {id:512,neighbors:[887,784,682]},
  {id:275,neighbors:[400,376,818]},
  {id:591,neighbors:[188,170]},
  {id:600,neighbors:[76,68,32]},
  {id:752,neighbors:[578,246]},
  {id:694,neighbors:[430,324]},
  {id:724,neighbors:[620,250,20]},
  {id:740,neighbors:[328,250,76]},
  {id:768,neighbors:[288,854,204]},
  {id:788,neighbors:[434,12]},
  {id:858,neighbors:[76,32]},
  {id:840,neighbors:[484,124]},
  {id:862,neighbors:[328,170,76]},
  {id:704,neighbors:[418,156,116]}
];
const NEIGHBOR_PUZZLE_MAP=new Map(NEIGHBOR_PUZZLES.map(p=>[p.id,p.neighbors]));
function renderModeScreen(){
  const active=_activeSections;
  const nav=active.map((k,i)=>`<button class="gs-dot" data-sec="${i}" onclick="scrollToSection(${i})" title="${SECTION_META[k].head()}"></button>`).join('');
  const sections=active.map((k,i)=>{
    const m=SECTION_META[k];
    return `<section class="game-section gs-${k}" data-idx="${i}">
      <div class="gs-bg gs-bg-${k}"></div>
      <div class="gs-content">
        <div class="gs-icon">${m.icon}</div>
        <h2 class="gs-head">${m.head()}</h2>
        <p class="gs-sub">${m.sub()}</p>
        <div class="gs-grid gs-grid-${k}">${sectionInner(k)}</div>
      </div>
      ${i<active.length-1?`<div class="gs-scroll-hint">${t('scrollHint')} ↓</div>`:''}
    </section>`;
  }).join('');
  const isLoggedIn=!!window._authUser;
  const learnBtn=isLoggedIn
    ?`<button class="gs-mode-btn${learnMode?' active':''}" onclick="setLearnMode(true)">${t('learnModeLbl')}</button>`
    :`<div class="gs-mode-tooltip-wrap"><button class="gs-mode-btn gs-mode-btn-locked" onclick="toggleLearnTooltip(event)">${t('learnModeLbl')}</button><div class="gs-mode-tooltip"><strong>${t('learnModeLbl')}</strong><p>${t('learnModeDesc')}</p><span class="gs-mode-tooltip-cta" onclick="openAuth(\'login\')">${t('learnModeCta')}</span></div></div>`;
  const modeToggle=`<div class="gs-mode-toggle"><button class="gs-mode-btn${!learnMode?' active':''}" onclick="setLearnMode(false)">${t('normalMode')}</button>${learnBtn}</div>`;
  const friendsBtn=window._authUser?`<button class="gs-home-btn gs-tb-icon fr-header-wrap" onclick="openFriends()" title="${lang==='en'?'Friends':'Freunde'}">👥<span id="fr-header-badge" class="fr-badge" style="display:none">0</span></button>`:'';
  const rightBtns=`<div class="gs-topbar-right">`+
    `<button class="gs-home-btn gs-tb-icon" onclick="openHomeOpts()" title="${t('optionsLbl')}">⚙</button>`+
    friendsBtn+
    (window._authUser?`<button class="gs-home-btn gs-tb-icon" onclick="openProfile()" title="Profil">👤</button>`:`<button class="gs-home-btn gs-tb-icon" onclick="openAuth('login')" title="${t('signIn')}">👤</button>`)+
    `</div>`;
  $('mode-screen').innerHTML=`
    <div class="gs-topbar">
      <button class="gs-home-btn" onclick="${_modeScreenBackOnclick}">${t('back')}</button>
      ${modeToggle}
      ${rightBtns}
    </div>
    <div class="gs-nav">${nav}</div>
    ${sections}`;
  const sc=$('mode-screen');
  sc.onscroll=updateSectionNav;
  updateSectionNav();
  if(typeof _updateReqBadge==='function')_updateReqBadge();
}
function updateSectionNav(){
  const sc=$('mode-screen');if(!sc)return;
  const idx=Math.round(sc.scrollTop/sc.clientHeight);
  document.querySelectorAll('.gs-dot').forEach((d,i)=>d.classList.toggle('active',i===idx));
}
function scrollToSection(i){const sc=$('mode-screen');if(sc)sc.scrollTo({top:i*sc.clientHeight,behavior:'smooth'});}
document.addEventListener('keydown',e=>{
  const sc=$('mode-screen');
  if(!sc||sc.style.display==='none')return;
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
  e.preventDefault();
  const idx=Math.round(sc.scrollTop/sc.clientHeight);
  const next=e.key==='ArrowDown'?Math.min(idx+1,_activeSections.length-1):Math.max(idx-1,0);
  scrollToSection(next);
});

// ── CUSTOM MODE ──
function openCustom(){showScreen('custom-screen');renderCustom();}
function getCustomPool(){return Object.keys(C).map(Number).filter(id=>customConts.has(C[id].c));}

function renderCustom(){
  $('cback').textContent=t('cback');$('ctitle').textContent=t('ctitle');
  $('clbl-cont').textContent=t('clblCont');$('clbl-count').textContent=t('clblCount');
  $('clbl-countries').textContent=t('clblCountries');$('cbtn-all').textContent=t('cbtnAll');
  $('cbtn-none').textContent=t('cbtnNone');$('cbtn-start').textContent=t('cbtnStart');
  $('clbl-all').textContent=t('clblAll');
  $('cont-checks').innerHTML=CONT_KEYS.map(k=>`<label class="cb"><input type="checkbox" ${customConts.has(k)?'checked':''} onchange="toggleCont('${k}',this.checked)"><span>${MODES[k][lang]}</span></label>`).join('');
  updateCustomCountries();
}

function toggleCont(k,on){
  if(on)customConts.add(k);else customConts.delete(k);
  updateCustomCountries();
}

function updateCustomCountries(){
  const pool=getCustomPool();
  customCountries=new Set(pool);
  renderCountryTags();
  updateCustomInfo();
}

function renderCountryTags(){
  const pool=getCustomPool().sort((a,b)=>cn(a).localeCompare(cn(b)));
  $('country-tags').innerHTML=pool.map(id=>`<span class="ctag ${customCountries.has(id)?'on':''}" onclick="toggleC(${id})">${cn(id)}</span>`).join('');
  updateCustomInfo();
}

function toggleC(id){
  if(customCountries.has(id))customCountries.delete(id);else customCountries.add(id);
  const el=$('country-tags').querySelector(`[onclick="toggleC(${id})"]`);
  if(el)el.className='ctag '+(customCountries.has(id)?'on':'');
  updateCustomInfo();
}

function selAllC(on){
  const pool=getCustomPool();
  customCountries=on?new Set(pool):new Set();
  renderCountryTags();
}

function toggleAllCountries(){
  const cb=$('all-countries-cb');
  if(cb.checked){$('round-size').value=customCountries.size;}
  updateCustomInfo();
}

function updateCustomInfo(){
  const n=customCountries.size;
  $('clbl-of').textContent=`/ ${n} ${t('clblOf')}`;
  const allCb=$('all-countries-cb');
  if(allCb.checked)$('round-size').value=n;
  $('cbtn-start').disabled=n===0;
}

function startCustom(){
  if(typeof markCustomPlayed==='function')markCustomPlayed();
  const allCb=$('all-countries-cb');
  let pool=[...customCountries];
  let count=allCb.checked?pool.length:Math.min(parseInt($('round-size').value)||10,pool.length);
  if(count<1||pool.length===0)return;
  const q=shuffle(pool).slice(0,count);
  game={mode:'custom',activeContinents:new Set(customConts),customIds:new Set(q),queue:q,current:null,found:new Set(),correct:0,wrong:0,firstTry:0,total:q.length,wrongOnCurrent:false};
  canClick=true;optsOpen=false;
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');
  updateAllText();
  loadMap().then(()=>{
    game.queue=game.queue.filter(id=>_onMap(id)&&C[id]);
    game.total=game.queue.length;
    if(customConts.size===1){const c=[...customConts][0];if(ZOOMS[c]){const g=zoomForMode(c);zoomToGeo(g.lon,g.lat,g.k);}}
    else if(customConts.size<6){zoomTo(480,250,1.2);}
    nextCountry();
  });
}

// ── GAME ──
async function startGame(mode){
  lastMode=mode;canClick=true;optsOpen=false;
  const ids=Object.keys(C).map(Number);
  const filtered=mode==='world'?ids:ids.filter(id=>C[id].c===mode);
  const conts=mode==='world'?null:new Set([mode]);
  game={mode,activeContinents:conts,queue:shuffle(filtered),current:null,found:new Set(),correct:0,wrong:0,firstTry:0,total:0,wrongOnCurrent:false,skipped:0};
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');$('feedback').style.color='#888';
  updateAllText();await loadMap();
  game.queue=learnSortIds(game.queue.filter(id=>_onMap(id)&&C[id]),'country:','map:'+mode).slice(0,(allTargets||learnMode)?Infinity:quizRoundLimit);
  game.total=game.queue.length;
  const g=zoomForMode(mode);
  zoomToGeo(g.lon,g.lat,g.k);
  nextCountry();
}
function restart(){if(game.fillMode)return void startFillGame(game.fillKey);if(_regGame)return void startRegionQuiz(_regGame.key);if(game.challengeMode)return void(_challenge&&_challenge.daily?openDailyChallenge():startRandomChallenge());if(game.flagMode)startInputQuiz(game.iqCfg||{type:'flag',region:'world',diff:'all',dir:'c2cap'});else if(game.riverMode)startRiverGame(game.difficulty);else if(game.lakeMode)startLakeGame(game.difficulty);else if(game.cityMode)startCityGame(game.difficulty);else if(game.mountainMode)startMountainGame(game.difficulty);else if(game.rangeMode)startRangeGame(game.difficulty);else if(game.pinMode)startPinGame(game.pinRegion||game.difficulty);else if(game.triviaMode)startTriviaGame(game.triviaCat);else if(lastMode==='custom')startCustom();else if(lastMode&&lastMode.startsWith('diff'))startDifficultyGame(+lastMode.slice(4));else startGame(lastMode);}
// flag/pin/city/river/lake reopen their own (unchanged) section via goToGames(); everything else
// reached through "click"'s drill-down (world/continent/custom/population) returns to whichever
// page launched it, tracked in _quizBackAction (see the CATEGORY PICKER block above).
function back(){if(game.fillMode){if(game.fillPath&&game.fillPath.duel&&typeof duelLeave==='function')duelLeave();if(typeof fillStop==='function')fillStop();game={};renderInputPage();return;}if(_regGame)return void regionBack();if(game.pinDuel&&typeof duelLeave==='function')duelLeave();if(game.challengeMode){if(typeof duelLeave==='function')duelLeave();_stopDailyTimer();game={};_challenge=null;goHome();return;}const key=game.flagMode?'flag':game.pinMode?'pin':game.cityMode?'city':game.riverMode?'river':game.lakeMode?'lake':(game.mountainMode||game.rangeMode)?'mountain':null;game={};if(key){goToGames(key);return;}_quizBackAction();}
function setQuizRoundLimit(v){quizRoundLimit=Math.max(1,Math.min(9999,parseInt(v)||10));document.querySelectorAll('.gs-round-input').forEach(el=>{el.value=quizRoundLimit;});persistSettings();}
function setAllTargets(v){allTargets=v;renderOptions();persistSettings();}
function setLearnMode(v){if(v&&!window._authUser)return;learnMode=v;applyLearnClass();if(_catRerender&&$('category-screen')&&$('category-screen').style.display!=='none'){_catRerender();persistSettings();return;}const sc=$('mode-screen');const st=sc?sc.scrollTop:0;renderModeScreen();if(sc)sc.scrollTop=st;persistSettings();}
function toggleLearnTooltip(e){e.stopPropagation();if(!('ontouchstart' in window))return;const wrap=e.currentTarget.closest('.gs-mode-tooltip-wrap');if(!wrap)return;wrap.classList.toggle('show');}

// Kurze Erklärung beim ersten Quiz im Lernmodus
function learnIntro(){
  if(!learnMode||document.getElementById('learn-intro'))return;
  try{if(localStorage.getItem('geoquiz_learn_intro')==='1')return;localStorage.setItem('geoquiz_learn_intro','1');}catch(e){}
  const li=Math.max(0,['de','en','es','fr'].indexOf(lang));
  const T=[
    ['Lernmodus','Learning mode','Modo aprendizaje','Mode apprentissage'],
    [['Du bekommst alle Ziele, die du noch nicht sicher kennst – nicht nur zehn.','Falsch oder übersprungen? Das Ziel kommt nach kurzer Zeit noch einmal.','Das Quiz ist erst zu Ende, wenn jedes Ziel richtig war.','Bei Texteingabe verrät 💡 oben nach und nach die ersten Buchstaben.','Im Menü ist der Hintergrund farbig, solange der Lernmodus an ist.'],
     ['You get every target you do not know well yet – not just ten.','Wrong or skipped? The target comes back after a short while.','The quiz only ends when every target was answered correctly.','In typing quizzes 💡 at the top reveals the first letters one by one.','The menu background is tinted while learning mode is on.'],
     ['Recibes todos los objetivos que aún no dominas, no solo diez.','¿Fallo u omitido? El objetivo vuelve a salir al poco tiempo.','El quiz termina solo cuando todos están bien.','En los quizzes de escribir, 💡 arriba revela las primeras letras poco a poco.','El fondo del menú cambia de color mientras el modo está activo.'],
     ['Tu reçois toutes les cibles que tu ne maîtrises pas encore, pas seulement dix.','Faux ou passé ? La cible revient au bout d’un moment.','Le quiz ne se termine que lorsque chaque cible est juste.','Pour les quiz à saisir, 💡 en haut révèle peu à peu les premières lettres.','Le fond du menu change de couleur tant que le mode est actif.']],
    ['Los geht’s','Got it','Entendido','Compris']
  ];
  const o=document.createElement('div');o.id='learn-intro';o.className='learn-intro';
  o.innerHTML='<div class="learn-intro-box"><div class="learn-intro-t">🎓 '+T[0][li]+'</div><ul>'+T[1][li].map(x=>'<li>'+x+'</li>').join('')+'</ul><button type="button" class="learn-intro-ok">'+T[2][li]+'</button></div>';
  o.querySelector('button').onclick=()=>o.remove();
  document.body.appendChild(o);
}
// Lernmodus-Sortierung: häufig falsch vorne, 1-3× richtig hinten, >3× richtig ausgeblendet.
// quizKey (optional) scopes first-lap ordering (see firstLapOrder above) to this exact quiz —
// only used when learn mode is off, since learn mode's own front/mid/end priority already solves
// a version of the same "don't feel repetitive" problem.
function learnSortIds(ids,prefix,quizKey){
  if(!learnMode||typeof getMisses!=='function')return firstLapOrder(quizKey,[...ids]);
  const misses=getMisses(),corrects=typeof getCorrects==='function'?getCorrects():{};
  const filtered=ids.filter(id=>(corrects[prefix+id]||0)<=3);
  // shuffle() first: the sort is stable, so ids with the same miss count come out in random order
  // instead of always the same one.
  const front=shuffle(filtered.filter(id=>!(corrects[prefix+id])&&misses[prefix+id]))
    .sort((a,b)=>(misses[prefix+b]||0)-(misses[prefix+a]||0));
  const mid=shuffle(filtered.filter(id=>!(corrects[prefix+id])&&!(misses[prefix+id])));
  const end=filtered.filter(id=>(corrects[prefix+id]||0)>=1);
  return[...front,...mid,...end];
}
function learnSortIdx(indices,features,displayFn,prefix,quizKey){
  if(!learnMode||typeof getMisses!=='function')return firstLapOrder(quizKey,[...indices]);
  const misses=getMisses(),corrects=typeof getCorrects==='function'?getCorrects():{};
  const getKey=idx=>prefix+displayFn(features[idx]);
  const filtered=indices.filter(idx=>(corrects[getKey(idx)]||0)<=3);
  const front=filtered.filter(idx=>!(corrects[getKey(idx)])&&misses[getKey(idx)])
    .sort((a,b)=>(misses[getKey(b)]||0)-(misses[getKey(a)]||0));
  const mid=shuffle(filtered.filter(idx=>!(corrects[getKey(idx)])&&!(misses[getKey(idx)])));
  const end=filtered.filter(idx=>(corrects[getKey(idx)]||0)>=1);
  return[...front,...mid,...end];
}
function recordCorrectForCurrent(){
  if(typeof recordCorrect!=='function'||!game)return;
  let k=null;
  if(game.flagMode&&game.flagCurrent!=null)k=IQ_PREFIX[game.inputMode||'flag']+game.flagCurrent;
  else if(game.cityMode&&game.current!=null)k='city:'+cityDisplayName(game.cityFeatures[game.current]);
  else if(game.riverMode&&game.current!=null)k='river:'+riverDisplayName(game.riverFeatures[game.current]);
  else if(game.lakeMode&&game.current!=null)k='lake:'+lakeDisplayName(game.lakeFeatures[game.current]);
  else if(game.mountainMode&&game.current!=null)k='mountain:'+mountainDisplayName(game.mountainFeatures[game.current]);
  else if(game.rangeMode&&game.current!=null)k='range:'+rangeDisplayName(game.rangeFeatures[game.current]);
  else if(game.current)k='country:'+game.current;
  if(k)recordCorrect(k);
  if(typeof checkAchievements==='function')checkAchievements();
}
function skip(){
  if(!canClick||!game||game.current===null||game.current===undefined)return;
  // Challenge mode (Random/Daily): a skip is scored exactly like a wrong answer — 0 points for
  // this question — by reusing advanceChallenge()'s existing "only count wrongOnCurrent===false as
  // a first-try hit" check, rather than adding a second, parallel scoring path.
  if(game.challengeMode){game.wrongOnCurrent=true;_challenge.skipped=(_challenge.skipped||0)+1;nextCountry();return;}
  game.skipped=(game.skipped||0)+1; // one skip, even for a multi-country question — see currentGroup below
  if(!game.skippedItems)game.skippedItems=new Set();
  if(game.triviaMode){ // Trivia: die Lösung nur kurz zeigen, dann wieder freigeben; bereits gefundene Länder bleiben dabei grün markiert
    game.skippedItems.clear();clearTimeout(game._skipT);const g=game,keep=[...game.found];g._holdFound=true;
    game._skipT=setTimeout(()=>{if(game!==g)return;g._holdFound=false;keep.forEach(i=>g.found.delete(i));if(g.skippedItems)g.skippedItems.clear();updateColors();},1800);
  }
  if(game.currentGroup){
    game.currentGroup.forEach(id=>game.skippedItems.add(id));
    game.currentGroup=null;
  }else{
    game.skippedItems.add(game.current);
  }
  if(learnMode)game.wrongOnCurrent=true; // Lernmodus: übersprungen = nicht gewusst, kommt wieder
  clearFeedback();if(showSkipHint)updateColors();updateStats();nextCountry();
}

// ── Shared answer handling ──
// Every map quiz (countries, lakes, rivers, cities) scores a click the same way; only what
// counts as "the same item", how a wrong pick is painted red, and which repaint function
// restores the colours differ. Those differences are the arguments below — the scoring,
// feedback, learn-mode bookkeeping and flash timing live here once.

// Flashes one wrongly-picked key red for a full second, independently of any other key already
// flashing — each key gets its own timer, so a second wrong click during that second never cuts
// the first one's flash short (they used to share a single id/timer, so the newer click reset the
// earlier item back to its normal colour immediately).
const WRONG_FLASH_MS=1000;
function flashWrongKey(key,paint,repaint){
  wrongFlashIds.add(key);
  if(paint)paint();
  const existing=wrongFlashTimers.get(key);
  if(existing)clearTimeout(existing);
  wrongFlashTimers.set(key,setTimeout(()=>{
    wrongFlashIds.delete(key);
    wrongFlashTimers.delete(key);
    repaint();
  },WRONG_FLASH_MS));
}

/** True if `key` is still an open target: a game is running and it is neither found nor skipped. */
function canAnswer(key){
  if(!canClick||!game||game.current===null||game.current===undefined)return false;
  if(game.skippedItems&&game.skippedItems.has(key))return false;
  if(game.found&&game.found.has(key))return false;
  return true;
}

/**
 * Applies one answer.
 *   key       what to remember as found (the lake quiz keys by representative, not by polygon)
 *   correct   whether this was the target
 *   name      display name, shown in the feedback line
 *   flashKey  key added to wrongFlashIds, so getColor() keeps the target red until its own timer
 *             ends even if the pointer moves away (this is why the flash is not a pure CSS effect)
 *   flash     paints the wrongly picked item red
 *   repaint   restores that layer's colours
 *   keepOnFound  the country quiz only remembers finds when the "stay green" option is on
 */
function resolveAnswer({key,correct,name,flashKey,flash,repaint,keepOnFound=true}){
  if(correct){
    game.correct++;
    if(keepOnFound)game.found.add(key);
    // Multi-country trivia question, and other members are still unfound: stay on this question —
    // no lock, no advance, no firstTry credit yet (that's only earned once the whole question, not
    // just one of its countries, is done). Every other mode never sets currentGroup, so this branch
    // never runs for them and behaviour is unchanged.
    if(game.currentGroup){
      game.currentGroup.delete(key);
      if(game._triviaBase){ // Zähler "(gefunden/gesamt)" in der Frage mitführen
        game._triviaQ=game._triviaBase+' ('+(game._triviaN-game.currentGroup.size)+'/'+game._triviaN+')';
        const tn=$('target-name');if(tn)tn.textContent=game._triviaQ;
      }
      if(game.currentGroup.size>0){
        if(showWrongHint)showFeedback(t('correctFb')(name),THEMES[theme].found);
        recordCorrectForCurrent();repaint();updateStats();
        return;
      }
      game.currentGroup=null;
    }
    canClick=false;
    if(!game.wrongOnCurrent)game.firstTry++;
    game.questionsCompleted=(game.questionsCompleted||0)+1;
    if(showWrongHint)showFeedback(t('correctFb')(name),THEMES[theme].found);
    recordCorrectForCurrent();repaint();updateStats();
    setTimeout(nextCountry,1100);
  }else{
    game.wrong++;recordMissForCurrent();game.wrongOnCurrent=true;
    if(showWrongHint)showFeedback(t('wrongFb')(name),THEMES[theme].wrong);
    flashWrongKey(flashKey,flash,repaint);
    updateStats();
  }
}

function lakeDisplayName(feat){const p=feat.properties;return p['name_'+lang]||p.name_en||p.name_de||p.name||'?';}
const BEGINNER_LAKES=new Set(['Lake Baikal','Lake Victoria','Lake Superior','Lake Huron','Lake Michigan','Lake Erie','Lake Ontario','Lago Titicaca','Lake Tanganyika','Dead Sea','Lake Geneva','Bodensee','Lake Balaton']);
function getLakeFeatures(diff){
  if(!lakesData)return[];
  const named=lakesData.features.filter(f=>f.properties.name);
  if(diff==='beginner')return named.filter(f=>BEGINNER_LAKES.has(f.properties.name));
  const maxZoom={easy:2,medium:3,hard:4};
  return named.filter(f=>f.properties.min_zoom<=(maxZoom[diff]??99));
}
function getLakeColor(idx){
  const th=THEMES[theme];
  if(wrongFlashIds.has(idx))return th.wrong;
  if(!game.lakeMode)return th.sph;
  if(game.found&&game.lakeRep){const rep=game.lakeRep[lakeDisplayName(game.lakeFeatures[idx])];if(game.found.has(rep))return th.found;}
  return th.sph;
}
function updateLakeColors(){
  if(!lakePaths)return;
  const th=THEMES[theme];
  lakePaths.attr('fill',d=>getLakeColor(d._i)).attr('stroke',th.border);
  if(lakeDots)lakeDots.attr('fill',d=>getLakeColor(d._i)).attr('stroke',th.border);
}

// Natural Earth's own "scalerank" is a cartographic-prominence metric (how boldly to draw a
// river on a printed map), not a fame ranking — sorted by it alone, the Rhine lands around rank
// 80, behind rivers almost nobody would recognise (Ideriyn, Peace, Za). RIVER_FAME_ORDER is a
// hand-picked "most recognisable first" priority list used for the beginner/easy tiers instead;
// medium/hard fall back to scalerank for everything not already picked, same as before.
const RIVER_FAME_ORDER=[
  'Nile','Amazon','Mississippi','Yangtze','Rhine','Danube','Volga','Ganges','Congo','Niger','Mekong','Euphrates','Tigris','Indus',
  'Missouri','Ohio','Colorado','Columbia','Rio Grande','Yukon','Zambezi','Murray','Orinoco','Elbe','Seine','Loire','Po','Thames',
  'Vistula','Oder','Don','Dnieper','Ural','Yenisey','Ob','Lena','Amur','Brahmaputra','Irrawaddy','Limpopo','Orange','Yellow River',
];
// The source data has no German field for rivers at all (unlike countries/capitals/lakes) — this
// only covers RIVER_FAME_ORDER; anything sorted in beyond it falls back to the English/local name
// for both languages, same as the un-curated behaviour this replaces.
const RIVER_NAME_DE={
  Nile:'Nil',Amazon:'Amazonas',Mississippi:'Mississippi',Yangtze:'Jangtsekiang',Rhine:'Rhein',Danube:'Donau',Volga:'Wolga',
  Ganges:'Ganges',Congo:'Kongo',Niger:'Niger',Mekong:'Mekong',Euphrates:'Euphrat',Tigris:'Tigris',Indus:'Indus',
  Missouri:'Missouri',Ohio:'Ohio',Colorado:'Colorado',Columbia:'Columbia','Rio Grande':'Rio Grande',Yukon:'Yukon',
  Zambezi:'Sambesi',Murray:'Murray',Orinoco:'Orinoco',Elbe:'Elbe',Seine:'Seine',Loire:'Loire',Po:'Po',Thames:'Themse',
  Vistula:'Weichsel',Oder:'Oder',Don:'Don',Dnieper:'Dnjepr',Ural:'Ural',Yenisey:'Jenissei',Ob:'Ob',Lena:'Lena',Amur:'Amur',
  Brahmaputra:'Brahmaputra',Irrawaddy:'Irrawaddy',Limpopo:'Limpopo',Orange:'Oranje','Yellow River':'Gelber Fluss',
};
function riverDisplayName(feat){
  const p=feat.properties;
  if(lang==='de'&&RIVER_NAME_DE[p.name])return RIVER_NAME_DE[p.name];
  return p['name_'+lang]||p.name_en||p.name_de||p.name||'?';
}
// Segment/tributary/canal names that happen to carry their own name in the source data but
// aren't a river a player could reasonably be expected to know as its own thing.
const RIVER_JUNK=/\b(Fork|Branch|Canal|Channel|Reach)\b/i;
function getRiverFeatures(diff){
  if(!riversData)return[];
  let named=riversData.features.filter(f=>f.properties.name&&f.properties.featurecla!=='Lake Centerline');
  named=named.filter(f=>!RIVER_JUNK.test(f.properties.name));
  const counts={beginner:14,easy:41,medium:80,hard:130};
  const n=counts[diff]??named.length;
  const fameIdx=name=>{const i=RIVER_FAME_ORDER.indexOf(name);return i<0?RIVER_FAME_ORDER.length:i;};
  const sorted=named.slice().sort((a,b)=>{
    const fa=fameIdx(a.properties.name),fb=fameIdx(b.properties.name);
    if(fa!==fb)return fa-fb;
    return(a.properties.scalerank||99)-(b.properties.scalerank||99);
  });
  return sorted.slice(0,n);
}
function getRiverColor(idx){const th=THEMES[theme];if(wrongFlashIds.has(idx))return th.wrong;if(game.found&&game.found.has(idx))return th.found;return th.sph;}
function updateRiverColors(){if(!riverPaths)return;riverPaths.attr('stroke',d=>getRiverColor(d._i));}

// ── CITY QUIZ ──
function cityDisplayName(c){return c['name_'+lang]||c.name_en||c.name_de||'?';}
function getCityColor(idx){const th=THEMES[theme];
  if(wrongFlashIds.has(idx))return th.wrong;
  if(game.skippedItems&&game.skippedItems.has(idx))return th.skipped;
  if(game.found&&game.found.has(idx))return th.found;
  return th.border;}
function updateCityColors(){if(!cityDots)return;const th=THEMES[theme];cityDots.attr('fill',d=>getCityColor(d._i)).attr('stroke',th.avail);}
function cityZoom(cities){
  if(!cities||!cities.length)return null;
  if(projection==='globe'){ // Schwerpunkt auf der Kugel + Blickwinkel, der alle Ziele umfasst
    let x=0,y=0,z=0;cities.forEach(c=>{const l=c.lon*Math.PI/180,p=c.lat*Math.PI/180;x+=Math.cos(p)*Math.cos(l);y+=Math.cos(p)*Math.sin(l);z+=Math.sin(p);});
    const lon=Math.atan2(y,x)*180/Math.PI,lat=Math.atan2(z,Math.hypot(x,y))*180/Math.PI;
    let sp=0.05;cities.forEach(c=>{sp=Math.max(sp,d3.geoDistance([c.lon,c.lat],[lon,lat]));});
    _zoomHint=[lon,lat];return [0,0,Math.max(1,Math.min(8,(Math.PI/2)/(sp*1.35)))];
  }
  const proj=buildProjection();
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  cities.forEach(c=>{const p=proj([c.lon,c.lat]);minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);});
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  const w=Math.max(maxX-minX,1),h=Math.max(maxY-minY,1),pad=2.2;
  let k=Math.min(960/(w*pad),500/(h*pad));
  k=Math.max(1,Math.min(20,k));
  return [cx,cy,k];
}
async function startCityGame(diffOrCountry){
  let cities;
  if(CITY_COUNTRIES[diffOrCountry])cities=CITY_COUNTRIES[diffOrCountry].cities.slice();
  else cities=getAllCitiesByDifficulty(diffOrCountry);
  const cityQueue=learnSortIdx(cities.map((_,i)=>i),cities,cityDisplayName,'city:','city:'+diffOrCountry).slice(0,(allTargets||learnMode)?Infinity:quizRoundLimit);
  game={mode:'city',cityMode:true,difficulty:diffOrCountry,
    cityFeatures:cities,
    queue:cityQueue,
    current:null,found:new Set(),correct:0,wrong:0,firstTry:0,
    total:cityQueue.length,wrongOnCurrent:false,skipped:0};
  lastMode='city';canClick=true;optsOpen=false;
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');
  updateAllText();
  if(worldData)renderMap(worldData);else await loadMap();
  const z=cityZoom(cities);if(z)zoomTo(z[0],z[1],z[2]);
  nextCountry();
}
function handleCityClick(idx){
  if(!canAnswer(idx))return;
  resolveAnswer({
    key:idx,correct:idx===game.current,flashKey:idx,
    name:cityDisplayName(game.cityFeatures[idx]),
    flash:()=>cityDots&&cityDots.filter(d=>d._i===idx).attr('fill',THEMES[theme].wrong),
    repaint:updateCityColors
  });
}

// ── MOUNTAIN QUIZ (Gipfel / Gebirgszüge) ──
// Gipfel (peaks) are point targets, same shape as the city quiz's dots — a handful of names
// coincidentally repeat (e.g. three different "Mount Olympus"), but unlike lakes/ranges these are
// genuinely different mountains, not one target split across a border, so they're never merged:
// each point is its own target keyed by array index, exactly like the city quiz.
let mountainsData=null;
async function ensureMountainsData(){
  if(mountainsData)return mountainsData;
  try{mountainsData=await fetch('data/mountains.json').then(r=>r.json());}catch(e){mountainsData=[];}
  return mountainsData;
}
function mountainDisplayName(m){return m['name_'+lang]||m.name_en||m.name_de||'?';}
// Natural Earth's elevation alone is a poor fame proxy here too — plenty of very tall but obscure
// Central Asian peaks outrank globally iconic ones like the Matterhorn or Fuji. Same fix as the
// river quiz's RIVER_FAME_ORDER: a hand-picked "most recognisable first" list for the easier
// tiers, elevation-sorted remainder for medium/hard. Deliberately excludes ambiguous shared names
// (three different real mountains are called "Mount Olympus" in this dataset) so the fame boost
// can't accidentally land on the wrong one of several same-named peaks.
const MOUNTAIN_FAME_ORDER=[
  'Mount Everest','K2','Mount Kilimanjaro','Denali','Mont Blanc','Matterhorn','Mount Elbrus','Aconcagua','Mount Fuji','Mount Kenya',
  'Mount Ararat','Mount Etna','Mount Vesuvius','Kanchenjunga','Chimborazo volcano','Pico de Orizaba','Aoraki / Mount Cook','Mount Kosciuszko',
];
function getMountainFeatures(diff){
  if(!mountainsData)return[];
  const counts={beginner:10,easy:18,medium:100,hard:250};
  const n=counts[diff]??mountainsData.length;
  const fameIdx=name=>{const i=MOUNTAIN_FAME_ORDER.indexOf(name);return i<0?MOUNTAIN_FAME_ORDER.length:i;};
  const sorted=mountainsData.slice().sort((a,b)=>{
    const fa=fameIdx(a.name_en),fb=fameIdx(b.name_en);
    if(fa!==fb)return fa-fb;
    return(b.elevation||0)-(a.elevation||0);
  });
  return sorted.slice(0,n);
}
function getMountainColor(idx){const th=THEMES[theme];if(wrongFlashIds.has('m'+idx))return th.wrong;if(game.skippedItems&&game.skippedItems.has(idx))return th.skipped;if(game.found&&game.found.has(idx))return th.found;return th.border;}
function updateMountainColors(){if(!mountainDots)return;const th=THEMES[theme];mountainDots.attr('fill',d=>getMountainColor(d._i)).attr('stroke',th.avail);}
async function startMountainGame(diff){
  await ensureMountainsData();
  const feats=getMountainFeatures(diff);
  const mountainQueue=learnSortIdx(feats.map((_,i)=>i),feats,mountainDisplayName,'mountain:','mountain:'+diff).slice(0,(allTargets||learnMode)?Infinity:quizRoundLimit);
  game={mode:'mountain',mountainMode:true,difficulty:diff,
    mountainFeatures:feats,
    queue:mountainQueue,
    current:null,found:new Set(),correct:0,wrong:0,firstTry:0,
    total:mountainQueue.length,wrongOnCurrent:false,skipped:0};
  lastMode='mountain';canClick=true;optsOpen=false;
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');
  updateAllText();
  if(worldData)renderMap(worldData);else await loadMap();
  nextCountry();
}
function handleMountainClick(idx){
  if(!canAnswer(idx))return;
  resolveAnswer({
    key:idx,correct:idx===game.current,flashKey:'m'+idx,
    name:mountainDisplayName(game.mountainFeatures[idx]),
    flash:()=>mountainDots&&mountainDots.filter(d=>d._i===idx).attr('fill',THEMES[theme].wrong),
    repaint:updateMountainColors
  });
}

// Gebirgszüge (ranges) are area targets, same shape as the lake quiz's polygons — Natural Earth
// splits several ranges that cross a border into separate polygons under the same name (e.g.
// Sierra Nevada in Spain vs. the US), so these DO need the lake quiz's name-keyed "representative"
// grouping: one range, wherever its pieces are, is one target.
let rangesData=null;
async function ensureRangesData(){
  if(rangesData)return rangesData;
  try{rangesData=await fetch('data/ne_10m_mountain_ranges.geojson').then(r=>r.json());}catch(e){rangesData={type:'FeatureCollection',features:[]};}
  return rangesData;
}
function rangeDisplayName(feat){const p=feat.properties;return p['name_'+lang]||p.name_en||p.name_de||'?';}
const RANGE_FAME_ORDER=[
  'Alps','Andes','Himalayas','Rocky Mountains','Ural Mountains','Caucasus Mountains','Appalachian Mountains','Pyrenees','Carpathian Mountains','Scandinavian Mountains',
  'Atlas Mountains','Drakensberg','Balkan Mountains','Tian Shan','Altai Mountains','Hindu Kush','Zagros Mountains','Sierra Nevada','Alaska Range',
];
function getRangeFeatures(diff){
  if(!rangesData||!rangesData.features)return[];
  const named=rangesData.features.filter(f=>f.properties.name_en);
  const counts={beginner:10,easy:19,medium:90,hard:200};
  const n=counts[diff]??named.length;
  const fameIdx=name=>{const i=RANGE_FAME_ORDER.indexOf(name);return i<0?RANGE_FAME_ORDER.length:i;};
  const sorted=named.slice().sort((a,b)=>fameIdx(a.properties.name_en)-fameIdx(b.properties.name_en));
  return sorted.slice(0,n);
}
function getRangeColor(idx){const th=THEMES[theme];if(wrongFlashIds.has('r'+idx))return th.wrong;if(game.found&&game.rangeRep){const rep=game.rangeRep[rangeDisplayName(game.rangeFeatures[idx])];if(game.found.has(rep))return th.found;}return th.mtn;}
function updateRangeColors(){if(!rangePaths)return;const th=THEMES[theme];rangePaths.attr('fill',d=>getRangeColor(d._i)).attr('stroke',th.border);}
async function startRangeGame(diff){
  await ensureRangesData();
  const feats=getRangeFeatures(diff);
  const rangeRep={};const order=[];
  feats.forEach((f,i)=>{const n=rangeDisplayName(f);if(!(n in rangeRep)){rangeRep[n]=i;order.push(i);}});
  const rangeQueue=learnSortIdx(order,feats,rangeDisplayName,'range:','range:'+diff).slice(0,(allTargets||learnMode)?Infinity:quizRoundLimit);
  game={mode:'range',rangeMode:true,difficulty:diff,
    rangeFeatures:feats,rangeRep,
    queue:rangeQueue,
    current:null,found:new Set(),correct:0,wrong:0,firstTry:0,
    total:rangeQueue.length,wrongOnCurrent:false,skipped:0};
  lastMode='range';canClick=true;optsOpen=false;
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');
  updateAllText();
  if(worldData)renderMap(worldData);else await loadMap();
  nextCountry();
}
function handleRangeClick(idx){
  if(!canClick||!game||game.current===null||game.current===undefined)return;
  const name=rangeDisplayName(game.rangeFeatures[idx]);
  const rep=game.rangeRep[name];
  if(!canAnswer(rep))return;
  resolveAnswer({
    key:rep,correct:name===rangeDisplayName(game.rangeFeatures[game.current]),flashKey:'r'+idx,name,
    flash:()=>rangePaths&&rangePaths.filter(d=>d._i===idx).attr('fill',THEMES[theme].wrong),
    repaint:updateRangeColors
  });
}

// ── DROP-A-PIN ──
function haversine(lon1,lat1,lon2,lat2){const R=6371,rad=Math.PI/180;const dLat=(lat2-lat1)*rad,dLon=(lon2-lon1)*rad;const a=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
// Screen px -> map units at the current zoom. Must use the same scale as renderMap()'s computeSc():
// Mercator's viewBox keeps its height fixed (MAP_H) and stretches its width to the container, so
// the scale is height/MAP_H — width/960 is only right at one aspect ratio and made pins, labels and
// the 20 km circle several times too big on a portrait phone.
function projPx(px){const svg=d3.select('#map').node();if(!svg)return px;const r=svg.getBoundingClientRect();const sc=(projection==='globe'?Math.min(r.width,r.height)/480:projection==='mercator'?r.height/MAP_H:Math.min(r.width/MAP_W,r.height/MAP_H))||1;const k=(d3.zoomTransform(svg).k)||1;return px/sc/k;}
function addPin(layer,pt,color,ll){
  if(ll){pt.lon=ll[0];pt.lat=ll[1];} // Ort auf der Kugel: der Globus zeichnet die Nadel damit auch beim Drehen/Zoomen live mit
  const s=projPx(1);
  // .pin-mark + datum: applyDotR() re-scales these on every zoom step, so the pin stays the same
  // size on screen (22 px tall) at any zoom level and on any device, not just at placement time.
  const grp=layer.append('g').attr('class','pin-mark').datum(pt).attr('transform','translate('+pt[0]+','+pt[1]+') scale('+s+')');
  grp.append('path').attr('d','M0,0 C-7,-10 -10,-16 0,-22 C10,-16 7,-10 0,0 Z').attr('fill',color).attr('stroke','#fff').attr('stroke-width',1.5);
  grp.append('circle').attr('cx',0).attr('cy',-15).attr('r',3).attr('fill','#fff');
}
async function startPinGame(region,fixedCities){
  region=region||'EU';
  // fixedCities: a multiplayer duel hands both players the same cities (see duel.js).
  const cities=(fixedCities&&fixedCities.length)?fixedCities:shuffle(getPinCities(region)).slice(0,Math.min(quizRoundLimit,getPinCities(region).length));
  game={mode:'pin',pinMode:true,difficulty:region,pinRegion:region,
    pinCities:cities,queue:cities.map((_,i)=>i),pinDuel:!!(fixedCities&&fixedCities.length),
    current:null,pinScore:0,pinTotalDist:0,pinRound:0,total:cities.length};
  lastMode='pin';canClick=true;optsOpen=false;
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');
  updateAllText();
  await ensureAdmin1Borders();
  if(worldData)renderMap(worldData);else await loadMap();
  pinZoomNow();
  nextPin();
}
function pinJob(c){return (c&&(c['job_'+lang]||c.job_en))||'';}
function pinFindLabel(){
  if(game.pinRegion==='trivia')return t('findPinTrivia');
  if(game.pinRegion==='people'){const c=game.pinCities&&game.current!=null?game.pinCities[game.current]:null;const j=pinJob(c);return t('findPinPerson')+(j?' ('+j+')':'');}
  return t('findPin');
}
function nextPin(){
  canClick=true;
  if(!game.queue||game.queue.length===0){showPinResult();return;}
  game.current=game.queue.shift();
  if(pinLayer)pinLayer.selectAll('*').remove();
  game._pinRes=null;
  $('target-name').textContent=cityDisplayName(game.pinCities[game.current]);
  const _gs=$('game-screen');if(_gs)_gs.classList.toggle('pin-people',game.pinRegion==='people'); // long person names may wrap
  if(game.pinRegion==='people'){const fl=$('find-label');if(fl)fl.textContent=pinFindLabel();}
  clearFeedback();updateStats();
}
// The country a city belongs to, for the +50 bonus. The map polygons are coarse, so a coastal or
// island city (Copenhagen, Lisbon, Stockholm, Venice, Split …) can sit just outside every polygon —
// then there was no target country at all and the bonus could never be earned. Fall back to the
// country that holds most of a ring of sample points around the city (15 km and 40 km out).
const _pinCountryCache=new Map(),_pinBounds=new WeakMap();
// geoContains on big polygons is slow; a cheap bounding-box test first keeps this to a few ms.
function _pinInside(f,pt){
  let b=_pinBounds.get(f);if(!b){b=d3.geoBounds(f);_pinBounds.set(f,b);}
  const x=pt[0],y=pt[1];
  if(y<b[0][1]||y>b[1][1])return false;
  const inX=b[0][0]<=b[1][0]?(x>=b[0][0]&&x<=b[1][0]):(x>=b[0][0]||x<=b[1][0]);
  return inX&&d3.geoContains(f,pt);
}
function pinTargetFeature(city,feats){
  const key=city.lon+','+city.lat;
  if(_pinCountryCache.has(key))return _pinCountryCache.get(key);
  let hit=feats.find(f=>_pinInside(f,[city.lon,city.lat]));
  if(!hit){
    // Nearest land wins: look at rings 4, 8, 15, 30, 50 km out and stop at the first ring that hits
    // any country (most hits within it decides) — a far-away bigger neighbour must not outvote the
    // sliver of coast right next to the city (Dubrovnik vs. Bosnia).
    for(const km of [4,8,15,30,50]){
      const votes=new Map();
      d3.geoCircle().center([city.lon,city.lat]).radius(km/111.32).precision(22.5)().coordinates[0].forEach(pt=>{
        const f=feats.find(x=>_pinInside(x,pt));if(f)votes.set(f,(votes.get(f)||0)+1);
      });
      if(votes.size){let best=0;votes.forEach((n,f)=>{if(n>best){best=n;hit=f;}});break;}
    }
  }
  _pinCountryCache.set(key,hit||null);
  return hit||null;
}
// Distance (km) from a lon/lat point to an area: 0 inside it, otherwise to the nearest edge (planar
// maths on a local equirectangular projection — plenty accurate at these sizes). Also returns the
// nearest edge point so the result line can end there.
function pinPolyDist(poly,g){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
    if((yi>g[1])!==(yj>g[1])&&g[0]<(xj-xi)*(g[1]-yi)/(yj-yi)+xi)inside=!inside;
  }
  if(inside)return {dist:0,near:null};
  const kx=111.32*Math.cos(g[1]*Math.PI/180),ky=110.57;
  let best=Infinity,near=null;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const ax=(poly[j][0]-g[0])*kx,ay=(poly[j][1]-g[1])*ky,bx=(poly[i][0]-g[0])*kx,by=(poly[i][1]-g[1])*ky;
    const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;
    const t=l2?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/l2)):0;
    const d=Math.hypot(ax+t*dx,ay+t*dy);
    if(d<best){best=d;near=[poly[j][0]+(poly[i][0]-poly[j][0])*t,poly[j][1]+(poly[i][1]-poly[j][1])*t];}
  }
  return {dist:best,near};
}
// d3 expects exterior rings clockwise (opposite of GeoJSON's RFC 7946) — a wrongly wound small
// polygon would be read as "the whole sphere minus this", so orient it explicitly.
function pinAreaFeature(poly){
  let a=0;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++)a+=poly[j][0]*poly[i][1]-poly[i][0]*poly[j][1];
  const ring=a>0?poly.slice().reverse():poly.slice();
  return {type:'Polygon',coordinates:[ring.concat([ring[0]])]};
}
// Regionen mit +50 Länderbonus. Trivia bewusst nicht: dort ist ein Ort gesucht (Bauwerk, Naturwunder …), das Land gäbe die Antwort halb vor.
// Ergebnis einer Runde (Nadeln, Entfernungslinie, Umkreis, grüner Länder-Schein) in die Nadel-Ebene zeichnen. Wird nach dem Klick und nach
// jedem Neuaufbau der Karte (Fenstergröße, Design, Globus nach dem Drehen/Zoomen) aufgerufen – sonst wären die Nadeln danach weg.
function drawPinResult(res){
  if(!pinLayer||!currentProj||!res)return;
  const {guess,city,glowFeat,areaNear}=res;
  const gp=currentProj([guess[0],guess[1]]),tp=currentProj([city.lon,city.lat]);
  {
      pinLayer.selectAll('*').remove();
      // Richtiges Land: leichter grüner Schein
      if(glowFeat&&currentProj){
        pinLayer.append('path').datum(glowFeat).attr('d',d3.geoPath().projection(currentProj))
          .attr('class','pin-country-glow').attr('fill','rgba(79,209,139,0.16)').attr('stroke','rgba(79,209,139,0.75)')
          .attr('stroke-width',1.6).style('vector-effect','non-scaling-stroke').style('pointer-events','none')
          .style('filter','drop-shadow(0 0 7px rgba(79,209,139,.65))');
      }
      // 20km Vollpunkt-Umkreis um den richtigen Standort — bei ausgedehnten Zielen deren Fläche
      if(currentProj){
        const circleGeoPath=d3.geoPath().projection(currentProj);
        const circleFeature=city.poly?pinAreaFeature(city.poly):d3.geoCircle().center([city.lon,city.lat]).radius(20/111.32)();
        pinLayer.append('path').datum(circleFeature).attr('d',circleGeoPath)
          .attr('fill','rgba(29,158,117,0.12)').attr('stroke',THEMES[theme].found)
          .attr('stroke-width',1.2).attr('stroke-dasharray','5,3')
          .style('vector-effect','non-scaling-stroke').style('pointer-events','none');
      }
      // Line to the target — for an area, to its nearest edge point (none if the pin is inside it)
      const lineEnd=city.poly?(areaNear?currentProj(areaNear):null):tp;
      if(lineEnd)pinLayer.append('line').attr('x1',gp[0]).attr('y1',gp[1]).attr('x2',lineEnd[0]).attr('y2',lineEnd[1])
        .attr('stroke',THEMES[theme].border).attr('stroke-width',1.2).attr('stroke-dasharray','4,3').style('vector-effect','non-scaling-stroke');
      addPin(pinLayer,gp,'#e23a2a',guess);      // Schätzung (rot)
      addPin(pinLayer,tp,THEMES[theme].found,[city.lon,city.lat]); // tatsächlich (grün)
  
  }
}
const PIN_BONUS_REGIONS=['EU','AF','AS','NA','SA','OC','world','people'];
function handlePinClick(ev){
  if(!canClick||!game||!game.pinMode||game.current===null||game.current===undefined)return;
  const p=d3.pointer(ev,gGroup.node());
  const guess=currentProj&&currentProj.invert?currentProj.invert(p):null;
  if(!guess||isNaN(guess[0])||isNaN(guess[1]))return;
  canClick=false;
  const city=game.pinCities[game.current];
  // Extended targets (a canal, a reef, a lake …) have an `poly` area: inside it counts as a direct hit.
  let dist=haversine(guess[0],guess[1],city.lon,city.lat),areaNear=null;
  if(city.poly){const r=pinPolyDist(city.poly,guess);dist=r.dist;areaNear=r.near;}
  const decay=(typeof PIN_DECAY!=='undefined'&&PIN_DECAY[game.pinRegion])||700;
  const maxDist=decay*5;
  let pts=dist>=maxDist?0:Math.round(1000*Math.exp(-Math.max(0,dist-20)/decay));
  let countryBonus=false,glowFeat=null;
  const isContinent=PIN_BONUS_REGIONS.includes(game.pinRegion);
  if(isContinent){
    // Bonus if the pin is inside the target's country — or inside the 20 km full-points circle, so a
    // coastal city isn't robbed of it when the (coarse) border polygon puts the pin in the sea.
    if(dist<=20){pts+=50;countryBonus=true;}
    else if(countryPaths){
      const feats=countryPaths.data();
      const targetFeat=pinTargetFeature(city,feats);
      if(targetFeat&&d3.geoContains(targetFeat,guess)){pts+=50;countryBonus=true;glowFeat=targetFeat;}
    }
    if(countryBonus&&!glowFeat&&countryPaths){try{glowFeat=pinTargetFeature(city,countryPaths.data());}catch(e){}}
  }
  game.pinScore=(game.pinScore||0)+pts;
  game.pinTotalDist=(game.pinTotalDist||0)+dist;
  game.pinRound=(game.pinRound||0)+1;
  game._pinRes={guess,city,glowFeat,areaNear}; // für den Neuaufbau der Karte (drawPinResult)
  drawPinResult(game._pinRes);
  showFeedback(t('pinFb')(Math.round(dist),pts)+(countryBonus?' (+50 🎯)':''),THEMES[theme].found);
  updateStats();
  if(game.pinDuel&&typeof duelPinProgress==='function')duelPinProgress();
  {const g=game;setTimeout(()=>{if(game===g)nextPin();},2300);} // nur im selben Spiel weiterschalten
}
function showPinResult(){
  if(!game.total){back();return;}
  showScreen('result-screen');
  const isCont=PIN_BONUS_REGIONS.includes(game.pinRegion);
  const max=(game.total||1)*(isCont?1050:1000),pct=Math.round((game.pinScore/max)*100);
  const avg=game.pinRound?Math.round(game.pinTotalDist/game.pinRound):0;
  $('res-emoji').textContent=pct>=80?'🏆':pct>=50?'🎯':'📍';
  $('res-title').textContent=t('resTitle');
  const note=resultBestNote();
  $('res-l1').textContent=game.pinScore+' / '+max+' '+t('pointsLbl')+' ('+pct+'%)';
  $('res-l2').textContent=t('avgLbl')+': '+avg+' km'+note;
  $('res-btn-back').textContent=t('back');$('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');$('btn-share').textContent=t('shareBtn');
  if(game.pinDuel&&typeof duelPinFinish==='function')duelPinFinish();
  if(typeof checkAchievements==='function')checkAchievements();
}

// ── TRIVIA QUIZ ──
// One quiz mixing rank-based questions across five metrics (population, area, happiness, exports,
// UNESCO heritage sites) — reuses the plain country quiz's click handler and colouring entirely
// unchanged: every target is a real country id, so isActive()/getColor() already do the right
// thing for a world-scoped round. What this mode adds: how the round queue is built (multiple
// metrics, single-country AND multi-country "top N" questions mixed together) and what question
// text is shown instead of the country's own name.
let popData=null;
async function _loadPopData(){
  if(popData)return popData;
  popData=await fetch('data/population.json').then(r=>r.json()).catch(()=>({}));
  return popData;
}
// The map's own topojson geometry already IS the area data, via d3.geoArea() (steradians,
// converted to km² by the sphere's total surface area) — no extra data/ file, no CACHE_NAME bump.
// EXCEPT: every country in MICROSTATES (countries.js) is rendered as a dot, not a real polygon
// — it has no feature in the topology at all, so the loop below silently never assigns it an
// area. That's not a rounding quirk: it's the entire bottom of the world's area ranking (Vatican
// City, Monaco, Nauru, Tuvalu, San Marino, ...), so a "5 smallest countries" trivia question was
// missing exactly the 5 real smallest countries. Real-world km² for all 36, hand-verified via web
// search (Wikipedia/World Atlas country infoboxes, land-area figures), merged in as a fallback.
const MICROSTATE_AREA_KM2={492:2.02,336:0.49,674:61.2,20:468,438:160,48:786.8,702:728,462:298,
  296:811,520:21,798:26,584:181,583:702,585:459,882:2842,776:747,690:455,480:2040,174:1861,
  678:964,132:4033,52:430,308:344,662:616,659:261,670:389,28:442,212:751,470:316,442:2586,
  780:5127,548:12189,90:28896,270:11295,388:10991,242:18274};
let areaData=null;
function _computeAreaData(){
  if(areaData)return areaData;
  if(!worldData)return null;
  const EARTH_KM2=510072000; // total surface area of a sphere with Earth's mean radius (6371 km)
  const d={};
  // A few countries (e.g. Australia, id 36) appear as more than one feature in the topology —
  // an outlying island kept as its own polygon instead of folded into the main multipolygon.
  // Sum rather than overwrite, or the last-processed sliver would replace the real area.
  topojson.feature(worldData,worldData.objects.countries).features.forEach(f=>{
    const id=+f.id;if(id<0)return;
    d[id]=(d[id]||0)+d3.geoArea(f)*EARTH_KM2/(4*Math.PI);
  });
  for(const id in MICROSTATE_AREA_KM2){if(d[id]==null)d[id]=MICROSTATE_AREA_KM2[id];}
  areaData=d;
  return d;
}
let happinessData=null;
async function _loadHappinessData(){
  if(happinessData)return happinessData;
  happinessData=await fetch('data/happiness.json').then(r=>r.json()).catch(()=>({}));
  return happinessData;
}
let exportsData=null;
async function _loadExportsData(){
  if(exportsData)return exportsData;
  exportsData=await fetch('data/exports.json').then(r=>r.json()).catch(()=>({}));
  return exportsData;
}
let heritageData=null;
async function _loadHeritageData(){
  if(heritageData)return heritageData;
  heritageData=await fetch('data/heritage.json').then(r=>r.json()).catch(()=>({}));
  return heritageData;
}
function _popQuestionText(rank,dir){return rank===1?(dir==='most'?t('popMostQ'):t('popLeastQ')):(dir==='most'?t('popMostRankQ')(rank):t('popLeastRankQ')(rank));}
function _popMultiQuestionText(n,dir){return dir==='most'?t('popMostNQ')(n):t('popLeastNQ')(n);}
function _areaQuestionText(rank,dir){return rank===1?(dir==='most'?t('areaMostQ'):t('areaLeastQ')):(dir==='most'?t('areaMostRankQ')(rank):t('areaLeastRankQ')(rank));}
function _areaMultiQuestionText(n,dir){return dir==='most'?t('areaMostNQ')(n):t('areaLeastNQ')(n);}
function _happyQuestionText(rank,dir){return rank===1?(dir==='most'?t('happyMostQ'):t('happyLeastQ')):(dir==='most'?t('happyMostRankQ')(rank):t('happyLeastRankQ')(rank));}
function _happyMultiQuestionText(n,dir){return dir==='most'?t('happyMostNQ')(n):t('happyLeastNQ')(n);}
function _exportQuestionText(rank,dir){return rank===1?(dir==='most'?t('exportMostQ'):t('exportLeastQ')):(dir==='most'?t('exportMostRankQ')(rank):t('exportLeastRankQ')(rank));}
function _exportMultiQuestionText(n,dir){return dir==='most'?t('exportMostNQ')(n):t('exportLeastNQ')(n);}
// Heritage-site counts have a long tail of ties (dozens of countries with exactly 1 site, plus
// every country not in data/heritage.json at all effectively tied at 0) — a "least" ranking there
// would mostly be arbitrary tie-breaking, not real trivia, so this metric only ever asks "most".
function _heritageQuestionText(rank){return rank===1?t('heritageMostQ'):t('heritageMostRankQ')(rank);}
function _heritageMultiQuestionText(n){return t('heritageMostNQ')(n);}
// Picks up to n single-country rank questions, then one multi-country "top groupN" question, from
// one end of a fully-sorted id list. Each metric+direction uses its own true ranking regardless of
// what any other metric picked — countries legitimately top multiple rankings at once (China is
// #1 by population AND a top exporter; that's real, not a bug), and a "5 highest export volume"
// question that quietly swapped China out for a truer-sounding-but-wrong substitute just because
// population asked about it first would be factually misleading. Reuse across questions in the
// same round is deliberately supported by the surrounding game state (game.currentGroup takes
// rendering/click priority over game.found — see getColor()/handleClick()), not prevented here.
function _triviaBuildSpecs(sorted,dir,singleQ,multiQ,singleCount,groupN,maxRank){
  const specs=[];
  // Capped at maxRank: "Platz 17 der bevölkerungsärmsten Länder" is unanswerable without
  // memorizing the full ranking, so a single-country rank question never reaches further than
  // maxRank into the list.
  for(let i=0;i<Math.min(singleCount,maxRank,sorted.length);i++){
    const id=dir==='most'?sorted[i]:sorted[sorted.length-1-i];
    specs.push({ids:[id],q:singleQ(i+1,dir)});
  }
  // The multi-target "4 most populous" style question must be the TRUE top N of the ranking — it
  // starts at rank 1, not after the single questions. (It used to start at rank singleCount+1 to
  // avoid asking about the same country twice, which made "the 4 most populous countries" quietly
  // mean ranks 3-6 and leave out China and India: factually wrong.) A country showing up in both a
  // single and a group question of the same round is fine — the game state supports that (see the
  // note above this function).
  const group=[];
  for(let i=0;i<sorted.length&&group.length<groupN;i++){
    group.push(dir==='most'?sorted[i]:sorted[sorted.length-1-i]);
  }
  if(group.length)specs.push({ids:group,q:multiQ(group.length,dir)});
  return specs;
}
const TRIVIA_GROUP_QUESTIONS=5; // so viele Ländergruppen-Fragen (EU, NATO, Gebirge …) kommen je Trivia-Runde dazu
const TRIVIA_SINGLE_PER_SIDE=2; // individual rank questions per metric+direction
const TRIVIA_SINGLE_MAX_RANK=8; // single-question ranks never go deeper than this — "Platz 17" is too obscure to guess
const TRIVIA_GROUP_MIN=3,TRIVIA_GROUP_MAX=5; // "top N" question size — matches "the 3/4/5 countries with..."
// cat: 'all' (Mischung), 'ranks' (nur Ranglisten-Fragen) oder eine Kategorie aus groups.js (history, politics, mountains, geo, special, numbers)
async function startTriviaGame(cat){
  cat=cat||'all';
  if(!worldData)await loadMap();
  const [pop,exportsD,happyD,heritageD]=await Promise.all([_loadPopData(),_loadExportsData(),_loadHappinessData(),_loadHeritageData()]);
  const area=_computeAreaData();
  const sortFor=data=>Object.keys(C).map(Number).filter(id=>data[id]!=null).sort((a,b)=>data[b]-data[a]);
  const metrics=[
    {sorted:sortFor(pop),dirs:['most','least'],singleQ:_popQuestionText,multiQ:_popMultiQuestionText},
    {sorted:sortFor(area),dirs:['most','least'],singleQ:_areaQuestionText,multiQ:_areaMultiQuestionText},
    {sorted:sortFor(happyD),dirs:['most'],singleQ:_happyQuestionText,multiQ:_happyMultiQuestionText},
    {sorted:sortFor(exportsD),dirs:['most','least'],singleQ:_exportQuestionText,multiQ:_exportMultiQuestionText},
    {sorted:sortFor(heritageD),dirs:['most'],singleQ:_heritageQuestionText,multiQ:_heritageMultiQuestionText}
  ];
  let specs=[];
  metrics.forEach(m=>m.dirs.forEach(dir=>{
    const groupN=TRIVIA_GROUP_MIN+Math.floor(Math.random()*(TRIVIA_GROUP_MAX-TRIVIA_GROUP_MIN+1));
    specs=specs.concat(_triviaBuildSpecs(m.sorted,dir,m.singleQ,m.multiQ,TRIVIA_SINGLE_PER_SIDE,groupN,TRIVIA_SINGLE_MAX_RANK));
  }));
  // Ländergruppen (groups.js) daruntermischen
  if(cat==='all')specs=specs.concat(shuffle(groupTriviaItems(pop,null)).slice(0,TRIVIA_GROUP_QUESTIONS).map(i=>({ids:i.ids.slice(),q:i.title+' (0/'+i.ids.length+')',base:i.title,n:i.ids.length})));
  if(cat!=='all'&&cat!=='ranks'){ // nur Ländergruppen dieser Kategorie
    specs=shuffle(groupTriviaItems(pop,null).filter(i=>i.cat===cat)).map(i=>({ids:i.ids.slice(),q:i.title+' (0/'+i.ids.length+')',base:i.title,n:i.ids.length}));
    if(!allTargets)specs=specs.slice(0,quizRoundLimit);
  }
  const shuffled=shuffle(specs);
  game={mode:'trivia',triviaMode:true,triviaCat:cat,
    queue:shuffled,current:null,currentGroup:null,
    found:new Set(),correct:0,wrong:0,firstTry:0,questionsCompleted:0,
    total:shuffled.length,wrongOnCurrent:false,skipped:0};
  lastMode='trivia';canClick=true;optsOpen=false;
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');
  updateAllText();
  renderMap(worldData);
  const g=zoomForMode('world');zoomToGeo(g.lon,g.lat,g.k);
  nextCountry();
}

// ── Trivia-Fragen mit festen Ländergruppen (groups.js): EU, NATO, Gebirge, Linksverkehr … ──
// Sie werden unter die Rang-Fragen des Trivia-Quiz gemischt (game.currentGroup: alle Länder der Gruppe anklicken).
let _iso2Rev=null;
// Gibt es das Land auf der Karte? visibleIds wird erst beim ersten Kartenaufbau gefüllt – bis dahin zählen alle Länder
const GROUP_MAX_SIZE=25; // größere Gruppen sind zum Anklicken zu viel: lieber in Teilgruppen aufteilen (groups.js)
const GROUP_BIG_OK=new Set(['eu']); // Ausnahme: die EU bleibt als Ganzes (27)
const _onMap=id=>!visibleIds||!visibleIds.size||visibleIds.has(id)||MS_IDS.has(id);
function _groupIds(codes){
  if(!_iso2Rev){_iso2Rev={};Object.keys(ISO2).forEach(id=>{_iso2Rev[ISO2[id]]=+id;});}
  return codes.split(' ').map(c=>_iso2Rev[c]).filter(id=>id&&C[id]&&_onMap(id));
}
function groupTriviaItems(pop,area){
  const li=Math.max(0,['de','en','es','fr'].indexOf(lang))+2,items=[];
  (window.GROUP_Q||[]).forEach(r=>{const ids=_groupIds(r[6]);if(ids.length>=2&&(ids.length<=GROUP_MAX_SIZE||GROUP_BIG_OK.has(r[0])))items.push({key:r[0],cat:r[1],ids,title:r[li]});});
  (window.GROUP_NUM||[]).forEach(r=>{
    const f=r[6],ids=Object.keys(C).map(Number).filter(id=>_onMap(id)&&pop[id]!=null&&f(pop[id],area?area[id]:null,id));
    if(ids.length>=3&&ids.length<=45)items.push({key:r[0],cat:r[1],ids,title:r[li]});
  });
  return items;
}
// Trivia-Menü: Mischung, Ranglisten und die Ländergruppen-Kategorien (groups.js)
function triviaMenuPanel(){
  const li=Math.max(0,['de','en','es','fr'].indexOf(lang));
  const card=(call,emoji,name,key)=>gsCard(call,'<span class="tm-emoji">'+emoji+'</span>'+name,'',key); // Emoji oben, darunter der Name
  return _cardsPanel([
    card('startTriviaGame()','🎲',['Alles gemischt','Everything mixed','Todo mezclado','Tout mélangé'][li],'trivia:world'),
    card("startTriviaGame('ranks')",'🏆',['Rekorde & Ranglisten','Records & rankings','Récords y clasificaciones','Records et classements'][li],'trivia:ranks')
  ].concat((window.GROUP_CATS||[]).map(c=>card("startTriviaGame('"+c.key+"')",c.icon,c.t[li],'trivia:'+c.key))),'gs-grid-pin');
}
// ── DIFFICULTY TIERS (all 197 countries, split into 5 by population) ──
// Precomputed once from data/population.json (sorted descending, cut into 5 equal-ish slices —
// 40/40/39/39/39) and hardcoded here, same as FLAG_BEGINNER/EASY/MEDIUM: it's a fixed real-world
// ranking, not something that needs recomputing at runtime, and hardcoding means the difficulty
// menu can render its country counts without an async fetch first. Population is a rough but
// workable proxy for "how likely a player is to have heard of this country" — tier 1 is every
// country from China down to Morocco, tier 5 is Djibouti down to Vatican City.
const DIFFICULTY_TIERS=[
  [156,356,840,360,586,76,566,50,643,484,392,231,608,818,704,180,792,276,364,764,250,826,380,710,834,104,404,410,170,724,32,804,800,12,729,368,4,616,124,504],
  [682,860,604,458,24,288,508,887,524,862,450,120,384,408,36,158,562,144,854,466,642,152,454,398,894,218,528,760,320,116,686,148,716,324,646,204,788,108,68,56],
  [192,332,728,214,300,203,752,620,706,400,31,784,348,340,112,762,376,40,598,756,768,694,418,600,100,688,422,434,558,417,222,232,795,208,702,246,703,178,578],
  [188,512,372,430,554,140,275,478,591,414,191,268,858,70,496,51,388,8,634,440,498,516,270,72,266,426,705,807,624,428,383,48,780,226,233,626,480,196,748],
  [262,242,174,328,64,90,499,442,740,132,462,470,96,84,44,352,548,52,678,882,662,296,583,308,670,776,690,28,20,212,584,659,492,438,674,585,520,798,336],
];
async function startDifficultyGame(tier){
  const ids=DIFFICULTY_TIERS[tier-1]||[];
  const mode='diff'+tier;
  lastMode=mode;canClick=true;optsOpen=false;
  game={mode,customIds:new Set(ids),queue:shuffle(ids),current:null,found:new Set(),correct:0,wrong:0,firstTry:0,total:0,wrongOnCurrent:false,skipped:0};
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');$('feedback').style.color='#888';
  updateAllText();await loadMap();
  game.queue=learnSortIds(game.queue.filter(id=>_onMap(id)&&C[id]),'country:','diff:'+tier).slice(0,(allTargets||learnMode)?Infinity:quizRoundLimit);
  game.total=game.queue.length;
  // Population tiers scatter countries across the whole globe rather than one region, so the
  // world framing (not a continent zoom) is the only one that makes sense here.
  const g=zoomForMode('world');
  zoomToGeo(g.lon,g.lat,g.k);
  nextCountry();
}

async function startRiverGame(diff){
  if(!riversData){showFeedback(t('load'),'#888');await loadMap();}
  const feats=getRiverFeatures(diff);
  const indexed=feats.map((f,i)=>({...f,_i:i}));
  const riverQueue=learnSortIdx(feats.map((_,i)=>i),feats,riverDisplayName,'river:','river:'+diff).slice(0,(allTargets||learnMode)?Infinity:quizRoundLimit);
  game={mode:'river',riverMode:true,difficulty:diff,
    riverFeatures:feats,
    queue:riverQueue,
    current:null,found:new Set(),correct:0,wrong:0,firstTry:0,
    total:riverQueue.length,wrongOnCurrent:false,skipped:0,_indexed:indexed};
  lastMode='river';canClick=true;optsOpen=false;
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');
  updateAllText();
  if(worldData)renderMap(worldData);else await loadMap();
  nextCountry();
}

function handleRiverClick(idx){
  if(!canAnswer(idx))return;
  resolveAnswer({
    key:idx,correct:idx===game.current,flashKey:idx,
    name:riverDisplayName(game.riverFeatures[idx]),
    // Rivers are lines, so the wrong pick is marked on the stroke rather than the fill.
    flash:()=>riverPaths&&riverPaths.filter(d=>d._i===idx).attr('stroke',THEMES[theme].wrong),
    repaint:updateRiverColors
  });
}

async function startLakeGame(diff){
  if(!lakesData){showFeedback('Seen werden geladen …','#888');await loadMap();}
  const feats=getLakeFeatures(diff);
  const indexed=feats.map((f,i)=>({...f,_i:i}));
  const lakeRep={};const order=[];
  feats.forEach((f,i)=>{const n=lakeDisplayName(f);if(!(n in lakeRep)){lakeRep[n]=i;order.push(i);}});
  const lakeQueue=learnSortIdx(order,feats,lakeDisplayName,'lake:','lake:'+diff).slice(0,(allTargets||learnMode)?Infinity:quizRoundLimit);
  game={mode:'lake',lakeMode:true,difficulty:diff,
    lakeFeatures:feats,lakeRep,
    queue:lakeQueue,
    current:null,found:new Set(),correct:0,wrong:0,firstTry:0,
    total:lakeQueue.length,wrongOnCurrent:false,skipped:0,_indexed:indexed};
  lastMode='lake';canClick=true;optsOpen=false;
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');
  updateAllText();
  if(worldData)renderMap(worldData);else await loadMap();
  nextCountry();
}

function handleLakeClick(idx){
  if(!canClick||!game||game.current===null||game.current===undefined)return;
  // One named lake can be several polygons, so progress is keyed by its representative index
  // and matching goes by name — but the red flash marks the polygon actually clicked.
  const name=lakeDisplayName(game.lakeFeatures[idx]);
  const rep=game.lakeRep[name];
  if(!canAnswer(rep))return;
  resolveAnswer({
    key:rep,correct:name===lakeDisplayName(game.lakeFeatures[game.current]),flashKey:idx,name,
    flash:()=>{
      lakePaths&&lakePaths.filter(d=>d._i===idx).attr('fill',THEMES[theme].wrong);
      lakeDots&&lakeDots.filter(d=>d._i===idx).attr('fill',THEMES[theme].wrong);
    },
    repaint:updateLakeColors
  });
}

function zoomTo(cx,cy,k){
  if(projection==='globe'&&window.Globe){let ll=_zoomHint;_zoomHint=null;if(!ll&&currentProj&&currentProj.invert){const q=currentProj.invert([cx,cy]);if(q&&isFinite(q[0])&&isFinite(q[1]))ll=q;}if(ll)window.Globe.flyTo(ll[0],ll[1],k);return;}
  if(!zoomBehavior)return;
  const svg=d3.select('#map');
  const W=960,H=500;
  const tx=W/2-cx*k,ty=H/2-cy*k;
  // Ziel in den erlaubten Bereich schieben: sonst landet die Ansicht außerhalb der Karte und das erste Ziehen springt
  let tr=d3.zoomIdentity.translate(tx,ty).scale(k);
  try{tr=zoomBehavior.constrain()(tr,zoomBehavior.extent().call(svg.node(),svg.datum()),zoomBehavior.translateExtent());}catch(e){}
  svg.transition().duration(600).call(zoomBehavior.transform,tr);
}
// Drop a Pin: Kontinent-/Welt-Runden zeigen immer den festen Spielbereich (mittig), nicht die Zufallsstädte der Runde
function pinZoomNow(){
  const r=game&&game.pinRegion;
  if(['EU','AF','AS','NA','SA','OC','world','trivia','people'].includes(r)){const g=zoomForMode(['trivia','people'].includes(r)?'world':r);zoomToGeo(g.lon,g.lat,g.k);return;}
  const z=cityZoom(game.pinCities);if(z)zoomTo(z[0],z[1],z[2]);
}

// State/province border lines for Drop-a-Pin (fades in at strong zoom, see applyDotR). Lazily
// fetched and cached in memory — it is ~0.6 MB and only pin mode needs it, so it stays out of the
// service worker's precache list and is picked up by RUNTIME_CACHEABLE on first use instead.
let admin1Lines=null;
async function ensureAdmin1Borders(){
  if(admin1Lines)return;
  try{admin1Lines=await fetch('data/admin1-lines.json').then(r=>r.json());}catch(e){}
}
let lakesData=null,riversData=null,islandZoneData=null;
// Kartendaten laden (einmal; mehrere Aufrufer teilen sich dieselbe Anfrage). Getrennt vom Aufbau, damit prewarmMap() die
// Daten schon auf der Startseite im Leerlauf holen kann.
let _worldLoading=null;
function ensureWorldData(){
  if(worldData)return Promise.resolve(true);
  return _worldLoading||(_worldLoading=_fetchWorldData().then(()=>{_worldLoading=null;return !!worldData;}));
}
async function loadMap(){
  if(!worldData)await ensureWorldData();
  if(worldData)renderMap(worldData);else showFeedback('Error','#C0432A');
}
async function _fetchWorldData(){
  if(worldData)return;
  try{
    [worldData,lakesData,riversData,islandZoneData]=await Promise.all([
      fetch('data/countries-50m.json').then(r=>r.json()),
      fetch('data/ne_50m_lakes.geojson').then(r=>r.json()).catch(()=>null),
      fetch('data/ne_50m_rivers_lake_centerlines.geojson').then(r=>r.json()).catch(()=>null),
      fetch('data/island-zones.json').then(r=>r.json()).catch(()=>null)
    ]);
    // Normalize known river sections to their common names, then merge same-named segments
    const RIVER_ALIASES={
      'Chang Jiang':'Yangtze','Jinsha':'Yangtze','Tongtian':'Yangtze','Tuotuo':'Yangtze',
      'Dihang':'Brahmaputra','Yarlung':'Brahmaputra','Maquan':'Brahmaputra',
      'Lancang':'Mekong',
      'Lualaba':'Congo',
      'Donau':'Danube','Borcea':'Danube','Bratul Chillia':'Danube','Bratul Sfintu Gheorghe':'Danube','Bratul Sulina':'Danube',
      'Bykovskaya Protoka':'Lena','Olenekskaya Protoka':'Lena',
      'Amazonas':'Amazon','Ucayali':'Amazon',
      'Ayeyarwady':'Irrawaddy','Nmai':'Irrawaddy','Irrawaddy Delta':'Irrawaddy',
      'Heilong Jiang':'Amur',"Argun'":'Amur','Hailar':'Amur',
      // Nile: the White Nile branch (El Bahr el Abyad/Bahr el Jebel + its Ugandan sections) and
      // the Blue Nile (El Bahr el Azraq) both merge in, same as the delta distributaries below —
      // a player isn't expected to know these are technically separate named reaches.
      'El Bahr el Abyad':'Nile','Bahr el Jebel':'Nile','Kagera':'Nile','Damietta Branch':'Nile','Rosetta Branch':'Nile',
      'Albert Nile':'Nile','Victoria Nile':'Nile','El Bahr el Azraq':'Nile',
      'Ertix':'Irtysh','Ertis':'Irtysh',
      'Selenge (Selenga)':'Selenga',
      'Shiquan':'Indus',
      // Rhine: Natural Earth carries the French (Rhin), German (Rhein) and three Dutch delta
      // distributary names (Waal, Nederrijn, Lek) as separate features from the plain "Rhine".
      'Rhin':'Rhine','Rhein':'Rhine','Waal':'Rhine','Nederrijn':'Rhine','Lek':'Rhine',
      // Euphrates/Tigris: Arabic and Turkish names for the same rivers, not different rivers.
      'Al Furat':'Euphrates','Firat':'Euphrates','Dicle':'Tigris',
      'Huang':'Yellow River',
      'Grande':'Rio Grande',
      'Dnepre':'Dnieper','Dnipro':'Dnieper',
      'Tisa':'Tisza',
    };
    if(riversData){
      // Lake Centerline features mark the stretch of a river that happens to flow through a lake,
      // sharing the same raw name as the river's own 'River'-tagged segments — e.g. the
      // Mississippi is one 'River' segment plus one 'Lake Centerline' segment (through Lake
      // Itasca). They still need to be merged together with the river's other segments, or the
      // rendered path has a visible gap wherever the river crosses a lake. But the merged
      // feature's *properties* must come from a 'River' segment, never a 'Lake Centerline' one:
      // downstream code filters out anything whose featurecla is still 'Lake Centerline', and the
      // Lake Centerline segment sometimes sorts first in the source data — if its properties won
      // the merge, the featurecla they carried over caused that filter to delete the *entire*
      // merged river. That silently dropped the Mississippi, Volga, Niger, Zambezi, Murray,
      // Colorado, Columbia, Rio Grande and Missouri from the quiz entirely.
      const byName={};
      riversData.features.forEach(f=>{
        const raw=f.properties.name;if(!raw)return;
        const n=RIVER_ALIASES[raw]||raw;
        (byName[n]=byName[n]||[]).push({...f,properties:{...f.properties,name:n}});
      });
      const merged=[];
      Object.entries(byName).forEach(([n,feats])=>{
        if(feats.length===1){merged.push(feats[0]);return;}
        const lines=[];
        feats.forEach(f=>{if(f.geometry.type==='LineString')lines.push(f.geometry.coordinates);else if(f.geometry.type==='MultiLineString')lines.push(...f.geometry.coordinates);});
        const minSr=Math.min(...feats.map(f=>f.properties.scalerank||99));
        // name_en explicitly set to the canonical name n, not spread from an arbitrary segment —
        // feats[0] could be any of the merged raw names (e.g. "Bahr el Jebel" for the Nile), and
        // riverDisplayName() reads name_en/name_de, not name, so leaving it unset showed whichever
        // segment happened to merge first instead of the river's real name.
        const rep=feats.find(f=>f.properties.featurecla!=='Lake Centerline')||feats[0];
        merged.push({type:'Feature',properties:{...rep.properties,scalerank:minSr,name_en:n},geometry:{type:'MultiLineString',coordinates:lines}});
      });
      riversData={...riversData,features:merged.concat(riversData.features.filter(f=>!f.properties.name))};
    }
  }catch(e){worldData=null;}
}

function isActive(id){
  if(game.lakeMode||game.riverMode||game.cityMode||game.mountainMode||game.rangeMode)return false;
  if(game.pinMode){
    const r=game.pinRegion;
    if(!r||r==='world'||r==='trivia'||r==='people')return !!C[id];
    const CONTS=new Set(['EU','AF','AS','NA','SA','OC']);
    if(CONTS.has(r))return !!(C[id]&&C[id].c===r);
    return !!(C[id]&&ISO2[id]===r.toLowerCase());
  }
  if(game.customIds){
    // The two hardest difficulty tiers (Schwer/Sehr schwer) show every country as clickable, not
    // just the tier's own ~39 — otherwise which countries are highlighted *is* the answer list,
    // letting a player find the target by elimination instead of actually recognising it. Same
    // reasoning as the flag/capital input quiz's dropdown scoping for its two hardest tiers. The
    // target pool itself (game.queue) is untouched, so only countries from tiers 4/5 are ever
    // asked about — the rest are clickable but would just register as a wrong guess.
    if(game.mode==='diff4'||game.mode==='diff5')return !!C[id];
    return game.customIds.has(id);
  }
  const ac=activeConts();
  if(!ac)return !!C[id];
  return C[id]&&ac.has(C[id].c);
}

function polyPathD(poly){
  if(!poly||poly.length<2)return'';
  return'M'+poly.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')+'Z';
}
// Zone outlines are drawn as closed Catmull-Rom splines through the ring points instead of straight
// segments, so no corner is visible at any zoom level (hit testing still uses the plain polygon).
let _zoneLine=null; // created on first use (not at load time)
function zonePathD(z){
  if(!_zoneLine)_zoneLine=d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5));
  return z.rings.map(r=>r.length>=3?_zoneLine(r):'').join('');
}
// Which island zone owns the map point (x,y)? With overlapping zones: the one whose centre is nearest.
function zoneIdAtPoint(x,y){
  let best=null,bd=Infinity;
  for(const z of(zoneHulls||[])){
    if(!z.rings.some(r=>r.length>=3&&d3.polygonContains(r,[x,y])))continue;
    const d=Math.hypot(Math.min(Math.abs(x-z.cx),Math.abs(x-z.cx+960),Math.abs(x-z.cx-960)),y-z.cy);
    if(d<bd){bd=d;best=z.id;}
  }
  return best;
}

// topojson.feature liefert bei jedem Aufruf neue Objekte: dann gingen alle Zwischenspeicher des Globus (Vereinfachung, Mittelpunkte) verloren und jeder Neuaufbau rechnete alles neu
const _geoMemo=new WeakMap();
function _memo(world,key,fn){let m=_geoMemo.get(world);if(!m){m=new Map();_geoMemo.set(world,m);}if(!m.has(key))m.set(key,fn());return m.get(key);}
function _topoCached(world,key){return _memo(world,'feat:'+key,()=>topojson.feature(world,world.objects[key]));}
// Kopie eines Features mit Laufindex (_i) – immer dasselbe Objekt für dasselbe (Feature, Index), damit Zwischenspeicher treffen
const _idxMemo=new WeakMap();
function _withIdx(f,i){let m=_idxMemo.get(f);if(!m){m=new Map();_idxMemo.set(f,m);}let o=m.get(i);if(!o){o={...f,_i:i};m.set(i,o);}return o;}
// Pfad-Zeichenketten der flachen Karten (Mercator, Natural Earth, Equal Earth): die Projektion ist dort fest, also muss jede
// Form nur EINMAL projiziert werden. Vorher wurden bei jedem Spielstart ~3 MB Pfaddaten neu berechnet (PC ~200 ms, Handy ~1 s).
// Schlüssel ist das Geometrie-Objekt (bei Features deren geometry), getrennt je Projektion.
const _pathCaches={};
function _cachedGeoPath(projName,proj){
  const raw=d3.geoPath().projection(proj);if(raw.digits)raw.digits(2); // 0,01 Karteneinheiten: auch bei 50-fachem Zoom unter einem Pixel
  const pc=_pathCaches[projName]||(_pathCaches[projName]=new WeakMap());
  const gp=function(d){
    const k=d&&typeof d==='object'?(d.type==='Feature'&&d.geometry?d.geometry:d):null;
    if(!k)return raw(d);
    let v=pc.get(k);if(v===undefined){v=raw(d);pc.set(k,v===undefined?null:v);}
    return v;
  };
  gp.centroid=raw.centroid;gp.bounds=raw.bounds;gp.area=raw.area;gp.projection=raw.projection;gp.raw=raw;
  return gp;
}
let _gratFlat=null,_gratGlobe=null;
// Mittelpunkt eines Features (für die Zuordnung Gebiet → Land): je Feature einmal, im Leerlauf vorberechenbar
const _centMemo=new WeakMap();
function _centroid(f){let c=_centMemo.get(f);if(!c){c=d3.geoCentroid(f);_centMemo.set(f,c);}return c;}
// Karte im Leerlauf vorbereiten (Startseite): Daten laden und die Pfade der aktuellen Projektion häppchenweise vorberechnen,
// damit der erste Spielstart nicht stockt. Bricht ab, sobald ein Spiel läuft (dann baut renderMap ohnehin alles).
let _prewarmStarted=false;
function prewarmMap(){
  if(_prewarmStarted)return;_prewarmStarted=true;
  const idle=window.requestIdleCallback?(fn=>requestIdleCallback(fn,{timeout:1500})):(fn=>setTimeout(()=>fn({timeRemaining:()=>8}),60));
  const go=async()=>{
    try{
      if(!worldData)await ensureWorldData();
      if(!worldData)return;
      if(projection==='globe'){ // Globus: Umrisse für die Startansicht vorab vereinfachen (sonst beim ersten Öffnen ~150 ms am Stück)
        if(!window.Globe)return;
        const gi=_topoCached(worldData,'countries').features.slice();let n=0;
        const gstep=dl=>{if(projection!=='globe')return;const t0=performance.now();
          while(n<gi.length&&(performance.now()-t0<6||(dl&&dl.timeRemaining&&dl.timeRemaining()>4))){_centroid(gi[n]);window.Globe.simplifiedTol(gi[n],0.12);window.Globe.behind(gi[n]);n++;}
          if(n<gi.length)idle(gstep);};
        idle(gstep);return;
      }
      const projName=projection,gp=_cachedGeoPath(projName,buildProjection());
      const items=_topoCached(worldData,'countries').features.slice();
      if(lakesData)items.push(...lakesData.features.filter(f=>f.properties.name&&f.properties.min_zoom<=3));
      if(riversData)items.push(...riversData.features.filter(f=>f.properties.name&&f.properties.featurecla!=='Lake Centerline'&&((f.properties.scalerank||9)<=3||f.properties.name==='Rhine')));
      items.push(_memo(worldData,'coastMesh',()=>topojson.mesh(worldData,worldData.objects.countries,(a,b)=>a===b)));
      const feats=_topoCached(worldData,'countries').features,warm=window.CanvasMap&&CanvasMap.warm;
      let i=0,ci=0;
      const step=dl=>{
        if(projection!==projName)return; // Ansicht gewechselt: nicht weiter vorbereiten
        const t0=performance.now(),more=()=>performance.now()-t0<6||(dl&&dl.timeRemaining&&dl.timeRemaining()>4);
        while(ci<feats.length&&more())_centroid(feats[ci++]);
        while(ci>=feats.length&&i<items.length&&more()){const d=gp(items[i++]);if(d&&warm)warm(d);}
        if(i<items.length)idle(step);
      };
      idle(step);
    }catch(e){}
  };
  idle(()=>{go();});
}
// Größter Zoom: bei Drop a Pin deutlich höher (Handy: genaues Setzen der Nadel braucht viel Vergrößerung)
function maxZoom(){const pin=typeof game!=='undefined'&&game&&game.pinMode;return pin?(COARSE?120:60):(COARSE?50:20);}
let _mapKind=null; // welches Spiel die aktuelle Karte aufgebaut hat: country | pin | city | river | lake | mountain | range
function renderMap(world){
  _mapKind=game&&game.pinMode?'pin':game&&game.cityMode?'city':game&&game.riverMode?'river':game&&game.lakeMode?'lake':game&&game.mountainMode?'mountain':game&&game.rangeMode?'range':'country';
  const svg=d3.select('#map');svg.selectAll('*').remove();borderPath=null;admin1Path=null;gGroup=null;
  const th=THEMES[theme],W=960,H=500;
  const proj=buildProjection();
  currentProj=proj;
  let gpath=projection==='globe'?d3.geoPath().projection(proj):_cachedGeoPath(projection,proj);
  if(projection==='globe'&&window.Globe){const raw=gpath;if(raw.digits)raw.digits(2);gpath=function(d){const s=window.Globe.pathString(d);return s===undefined?(window.Globe.behind(d)?'':raw(window.Globe.simplified(d))):s;};gpath.centroid=raw.centroid;gpath.bounds=raw.bounds;gpath.area=raw.area;gpath.projection=raw.projection;}
  svg.append('defs').html('<filter id="rv-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
  const isMerc=projection==='mercator';
  // The viewBox height always stays fixed at H (matching the Mercator clip bounds in
  // buildProjection), but for Mercator its WIDTH is recomputed to match the container's own
  // aspect ratio, centered on the same x=W/2 that zoomTo()/zoomForMode() already treat as "the"
  // horizontal centre. A static 960-wide box under preserveAspectRatio="slice" forced height to
  // overflow (and get cropped) on any window proportionally wider than the content's own ~1.92:1
  // aspect — the wider the window, the more got cut off top and bottom. Matching the box to the
  // real aspect ratio instead removes that cropping in both directions; the infinite horizontal
  // wrap (<use> clones a few lines down) already exists specifically to fill in extra width with
  // repeated world copies, so an ultrawide monitor showing more than 960 units of longitude is
  // the wrap doing exactly the job it was built for, not a new capability. Natural Earth has no
  // such wrap (there's nothing to tile with in a non-repeating projection), so it keeps the
  // original static box and "meet" — letterboxing a mismatched aspect rather than cropping it.
  function syncViewBox(){
    if(projection==='globe'){svg.attr('viewBox','240 10 480 480').attr('preserveAspectRatio','xMidYMid meet');return W;} // quadratischer Ausschnitt um die Kugel: füllt Hoch- wie Querformat
    if(!isMerc){svg.attr('viewBox',`0 0 ${W} ${H}`).attr('preserveAspectRatio','xMidYMid meet');return W;}
    const r=svg.node().getBoundingClientRect();
    const vbW=H*((r.width/r.height)||(W/H));
    svg.attr('viewBox',`${W/2-vbW/2} 0 ${vbW} ${H}`).attr('preserveAspectRatio','xMidYMid slice');
    return vbW;
  }
  syncViewBox();
  svg.append('rect').attr('class','ocean').attr('x',isMerc?-W:0).attr('width',isMerc?W*3:W).attr('height',H).attr('fill',oceanFill(th));
  const wrapG=svg.append('g');
  // Two sibling layers, deliberately separated for the infinite-wrap tiling's sake:
  //   g (#map-main) holds only content that is NEVER mutated during pan/zoom. This is the
  //     subtree the wrap <use> clones reference, and in WebKit *any* DOM mutation inside a
  //     <use> source forces a full rebuild of every shadow tree referencing it (~700 paths
  //     per clone here) — that rebuild, running per animation frame, is what froze pinch-zoom
  //     on iOS while one-finger panning (which mutates nothing) stayed smooth.
  //   dynG holds everything applyDotR() resizes on zoom: dots, hit circles, pin markers.
  //     Nothing <use>-references it, so mutating it is cheap. The wrap copies of the
  //     microstate dots are real offset circles instead of clones (see dotCopies below).
  const g=wrapG.append('g');gGroup=g;
  const dynG=wrapG.append('g').attr('class','dyn');
  g.append('path').attr('class','sphere').datum({type:'Sphere'}).attr('d',gpath).attr('fill',th.sph).attr('stroke',th.grd).attr('stroke-width',1);
  const addGrat=()=>{
    // Globus: d3.geoGraticule liefert Meridiane mit nur 3 Stützpunkten (Pol, Äquator, Pol) und verlässt sich auf die Großkreis-
    // Unterteilung von d3. Die eigene Live-Zeichnung verbindet Stützpunkte gerade, daher hier dicht abgetastet (alle 2.5°),
    // sonst springen die Linien beim Neuaufbau.
    const grat=projection==='globe'?(_gratGlobe||(_gratGlobe=(()=>{const L=[];
      for(let lon=-180;lon<=180;lon+=10){const m=lon%90===0?90:80,pts=[];for(let lat=-m;lat<=m+1e-9;lat+=2.5)pts.push([lon,Math.max(-89.999999,Math.min(89.999999,lat))]);L.push(pts);}
      for(let lat=-80;lat<=80;lat+=10){const pts=[];for(let lon=-180;lon<=180;lon+=2.5)pts.push([lon,lat]);L.push(pts);}
      return{type:'MultiLineString',coordinates:L};})())):(_gratFlat||(_gratFlat=d3.geoGraticule()()));
    grat.noSimp=true; // Breitenkreise sind in lon/lat gerade Linien: nicht vereinfachen, sonst werden sie zu Großkreisen
    g.append('path').attr('class','grat').datum(grat).attr('d',gpath).attr('fill','none').attr('stroke',th.grd).attr('stroke-width',projection==='globe'?0.6:0.3).style('vector-effect',projection==='globe'?'non-scaling-stroke':null);
  };
  addGrat();

  const countries=_topoCached(world,'countries');

  // Island zones: clickable outlines around scattered island nations. The shapes are precomputed
  // (tools/build-island-zones.js → data/island-zones.json, lon/lat rings) and only projected here.
  // Across the projection seam (Fiji, Kiribati …) points are un-wrapped around the median x so a ring
  // stays in one piece.
  const activeZones=ISLAND_ZONES.filter(z=>isActive(z.id)).map(z=>{
    const zd=islandZoneData&&islandZoneData.zones.find(q=>q.id===z.id);
    if(!zd)return null;
    // Globus: orthographic proj() spiegelt Punkte der Rückseite auf die Vorderseite. Zonen ganz auf der Rückseite entfallen,
    // einzelne Rückseitenpunkte werden radial an den Kugelrand gesetzt (Azimut bleibt erhalten), damit die Form am Horizont endet.
    let pj=p=>proj(p);
    if(projection==='globe'){
      const c0=[-globeRot[0],-globeRot[1]],cen=proj.translate(),Rg=proj.scale();
      if(zd.rings.every(r=>r.every(p=>d3.geoDistance(p,c0)>Math.PI/2)))return null;
      pj=p=>{const q=proj(p);if(!q)return null;if(d3.geoDistance(p,c0)<=Math.PI/2)return q;const dx=q[0]-cen[0],dy=q[1]-cen[1],l=Math.hypot(dx,dy)||1;return[cen[0]+dx/l*Rg,cen[1]+dy/l*Rg];};
    }
    const proj0=zd.rings.map(r=>r.map(p=>pj(p)).filter(p=>p&&isFinite(p[0])&&isFinite(p[1])));
    const xs=proj0.flat().map(p=>p[0]).sort((a,b)=>a-b);
    if(!xs.length)return null;
    const med=xs[Math.floor(xs.length/2)];
    const base=proj0.map(r=>r.map(([x,y])=>[x-med>W/2?x-W:med-x>W/2?x+W:x,y])).filter(r=>r.length>=3);
    if(!base.length)return null;
    const all=base.flat();
    // A zone crossing the map edge (Fiji, Kiribati …) must also exist one map width over, or its far
    // part is cut off at x=0 / x=W: add shifted copies of every ring that reaches into [0,W].
    const rings=[];
    base.forEach(r=>[-W,0,W].forEach(sh=>{
      let lo=Infinity,hi=-Infinity;for(const p of r){const x=p[0]+sh;if(x<lo)lo=x;if(x>hi)hi=x;}
      if(hi>=0&&lo<=W)rings.push(sh?r.map(p=>[p[0]+sh,p[1]]):r);
    }));
    // type/geometry: GeoJSON-Linien derselben Ringe, damit der Globus die Zone beim Drehen live mitzeichnen kann (canvas-map)
    return{...z,noSimp:true,type:'Feature',geometry:{type:'MultiLineString',coordinates:zd.rings.map(r=>r.concat([r[0]]))},rings,cx:all.reduce((t,p)=>t+p[0],0)/all.length,cy:all.reduce((t,p)=>t+p[1],0)/all.length};
  }).filter(Boolean);
  zoneHulls=activeZones;

  islandZoneHits=g.append('g').attr('class','iz-hits').selectAll('path').data(zoneHulls).enter().append('path')
    .attr('d',z=>zonePathD(z))
    .attr('fill','transparent').attr('stroke','none').style('cursor','pointer')
    .on('mouseover',function(ev,z){if(!(game.skippedItems&&game.skippedItems.has(z.id))&&!(game.found&&game.found.has(z.id)))islandZoneVisuals&&islandZoneVisuals.filter(v=>v.id===z.id).attr('stroke-opacity',0.9);})
    .on('mouseout',function(ev,z){islandZoneVisuals&&islandZoneVisuals.filter(v=>v.id===z.id).attr('stroke-opacity',0.55);})
    .on('click',(ev,z)=>{const[px,py]=d3.pointer(ev,gGroup.node());handleClick(zoneIdAtPoint(px,py)||z.id);});
  // Assign unique synthetic negative IDs to features whose id coerces to NaN
  // so each gets its own slot in REDIRECTS instead of all colliding at NaN
  let _sid=-1;
  countries.features.forEach(f=>{if(isNaN(+f.id))f.id=_sid--;});
  // Kosovo has no ISO numeric id in the topojson → assign it 383 so it becomes a clickable country
  countries.features.forEach(f=>{if(+f.id>=0)return;const[lon,lat]=_centroid(f);if(lon>20&&lon<21.9&&lat>42&&lat<43.3)f.id=383;});
  visibleIds=new Set(countries.features.map(f=>+f.id));
  REDIRECTS.clear();
  // 304=Greenland, 10=Antarctica — non-clickable, no redirect
  // Die Zuordnung (Gebiet → Land) hängt nur von den Weltdaten ab, nicht von der Projektion: einmal rechnen, danach nur
  // zurückkopieren (die ~400 d3.geoCentroid-Aufrufe kosteten bei jedem Neuaufbau, z. B. nach dem Drehen des Globus, ~100 ms).
  if(window._redirSnap){window._redirSnap.forEach(([k,v])=>REDIRECTS.set(k,v));}
  else{
    const NO_REDIRECT=new Set([304,10,540,630,850,660,92,663,652,534]); // 540=Neukaledonien, 630=Puerto Rico, 850=US Virgin Is., 660=Anguilla, 92=Brit. Virgin Is., 663=St.Martin, 652=St.Barthélemy, 534=Sint Maarten
    // Dynamically block territories by centroid bounds (e.g. Französisch-Guayana)
    const GEO_NO_REDIRECT=[[[-56,-50],[1,7]]]; // [lonRange, latRange]
    countries.features.forEach(f=>{const [lo,la]=_centroid(f);if(GEO_NO_REDIRECT.some(([[l0,l1],[a0,a1]])=>lo>=l0&&lo<=l1&&la>=a0&&la<=a1))NO_REDIRECT.add(+f.id);});
    const kc=countries.features.filter(f=>C[+f.id]).map(f=>({id:+f.id,ctr:_centroid(f)}));
    countries.features.forEach(u=>{const uid=+u.id;if(C[uid])return;if(NO_REDIRECT.has(uid))return;const uc=_centroid(u);let b=null,bd=Infinity;kc.forEach(({id,ctr})=>{const d=(uc[0]-ctr[0])**2+(uc[1]-ctr[1])**2;if(d<bd){bd=d;b=id;}});if(b!==null)REDIRECTS.set(uid,b);});
    REDIRECTS.set(732,504); // Westsahara → Marokko
    // Geographic overrides for specific disputed/unrecognised territories
    countries.features.forEach(f=>{const uid=+f.id;if(uid>=0)return;const [lon,lat]=_centroid(f);
      if(lon>43&&lon<50&&lat>7&&lat<13)REDIRECTS.set(uid,706); // Somaliland → Somalia
      if(lon>32&&lon<35&&lat>34&&lat<36)REDIRECTS.set(uid,196); // Nord-Zypern → Zypern
    });
  window._redirSnap=[...REDIRECTS];
  }

  // Visually merge disputed territories into their parent country (no shared border)
  const geoms=world.objects.countries.geometries;
  const mergedPairs=[];
  let renderFeatures=countries.features;

  function mergeInto(parentId){
    const parentIdx=renderFeatures.findIndex(f=>+f.id===parentId);
    const childIdx=renderFeatures.findIndex(f=>+f.id<0&&REDIRECTS.get(+f.id)===parentId);
    if(parentIdx<0||childIdx<0)return;
    const gi=geoms[countries.features.indexOf(renderFeatures[parentIdx])];
    const gj=geoms[countries.features.indexOf(renderFeatures[childIdx])];
    if(!gi||!gj)return;
    const merged=_memo(world,'merge:'+parentId,()=>topojson.merge(world,[gi,gj]));
    mergedPairs.push([gi,gj]);
    renderFeatures=renderFeatures
      .filter((_,i)=>i!==childIdx)
      .map(f=>+f.id===parentId?_memo(world,'mfeat:'+parentId,()=>({...f,geometry:merged})):f);
  }

  mergeInto(706); // Somaliland → Somalia
  mergeInto(196); // Nord-Zypern → Zypern

  // Merge Western Sahara (732) into Morocco (504) — positive-ID merge
  (function(){
    const pi=renderFeatures.findIndex(f=>+f.id===504);
    const ci=renderFeatures.findIndex(f=>+f.id===732);
    if(pi<0||ci<0)return;
    const gi=geoms[countries.features.indexOf(renderFeatures[pi])];
    const gj=geoms[countries.features.indexOf(renderFeatures[ci])];
    if(!gi||!gj)return;
    const merged=_memo(world,'merge:504+732',()=>topojson.merge(world,[gi,gj]));
    mergedPairs.push([gi,gj]);
    renderFeatures=renderFeatures.filter((_,i)=>i!==ci).map(f=>+f.id===504?_memo(world,'mfeat:504+732',()=>({...f,geometry:merged})):f);
  })();

  countryPaths=g.selectAll('.ct').data(renderFeatures).enter().append('path').attr('class','ct').attr('d',gpath).attr('stroke',projection==='globe'?th.border:'none').attr('stroke-width',0.8*(th.bw||1)).style('vector-effect','non-scaling-stroke')
    .on('mouseover',function(ev,d){if(game.fillMode)return;const id=eff(+d.id);if(wrongFlashIds.has(id))return;const neededNow=game.currentGroup&&game.currentGroup.has(id);if(!game.found||!C[id]||!isActive(id)||(!neededNow&&(game.found.has(id)||(game.skippedItems&&game.skippedItems.has(id)))))return;countryPaths.filter(f=>eff(+f.id)===id).attr('fill',THEMES[theme].hov);microstateDots&&microstateDots.filter(x=>x.id===id).attr('fill',THEMES[theme].hov);})
    .on('mouseout',function(ev,d){countryPaths.filter(f=>eff(+f.id)===eff(+d.id)).attr('fill',f=>getColor(+f.id));microstateDots&&microstateDots.filter(x=>x.id===eff(+d.id)).attr('fill',x=>getMSColor(x.id));})
    .on('click',(ev,d)=>handleClick(+d.id));

  // Overlay dim paths for overseas territories embedded in parent-country MultiPolygons
  function overlayParts(parentId,indices){
    const feat=renderFeatures.find(f=>+f.id===parentId);
    if(!feat||feat.geometry.type!=='MultiPolygon')return;
    indices.forEach(idx=>{
      const coords=feat.geometry.coordinates[idx];
      if(coords){
        const f=_memo(world,'ov:'+parentId+':'+idx,()=>({type:'Feature',geometry:{type:'Polygon',coordinates:coords}}));
        g.append('path').attr('class','fgui-overlay').datum(f).attr('d',gpath).attr('fill',th.dim).attr('stroke','none')
          .style('cursor','default').on('mouseover',()=>{}).on('click',()=>{});
      }
    });
  }
  // France: 3=Mayotte, 4=Réunion, 5=Martinique, 6/7/8=Guadeloupe, 9=Französisch-Guayana
  overlayParts(250,[3,4,5,6,7,8,9]);
  // Netherlands: 9=Curaçao, 10/11=Sint Maarten
  overlayParts(528,[9,10,11]);

  // Internal borders (country–country), hidden in lake mode
  const EMPTY_LINES={type:'MultiLineString',coordinates:[]}; // Globus: Konturen kommen vom Strich der Länderflächen, Netze werden nicht gebraucht
  const borderMesh=projection==='globe'?EMPTY_LINES:_memo(world,'borderMesh',()=>topojson.mesh(world,world.objects.countries,(a,b)=>{
    if(a===b)return false;
    for(const[g1,g2]of mergedPairs){if((a===g1&&b===g2)||(a===g2&&b===g1))return false;}
    return true;
  }));
  borderPath=g.append('path').datum(borderMesh).attr('d',gpath).attr('fill','none').attr('stroke',th.border).attr('stroke-width',0.8*(th.bw||1)).style('vector-effect','non-scaling-stroke').attr('pointer-events','none');

  // Coastlines (land–ocean boundary), always visible
  const coastMesh=projection==='globe'?EMPTY_LINES:_memo(world,'coastMesh',()=>topojson.mesh(world,world.objects.countries,(a,b)=>a===b));
  const coastEl=g.append('path').attr('class','coastline').datum(coastMesh).attr('d',gpath).attr('fill','none').attr('stroke',th.border).attr('stroke-width',0.8*(th.bw||1)*1.15).style('vector-effect','non-scaling-stroke').attr('pointer-events','none');

  if(projection==='globe'){ // Konturen kommen vom Strich der Länderflächen: getrennt vereinfachte Netze würden daneben liegen
    if(borderPath)borderPath.attr('data-away','1');
    coastEl.attr('data-away','1');
  }

  // Rivers — rendered before lakes so lakes appear on top; hidden in lake mode (they distract)
  riverPaths=null;riverHitboxes=null;
  if(riversData&&!game.lakeMode){
    const riverMode=game.riverMode||false;
    const allRivers=riversData.features.filter(f=>f.properties.name&&f.properties.featurecla!=='Lake Centerline');
    const visFeats=riverMode ? getRiverFeatures(game.difficulty) : allRivers.filter(f=>(f.properties.scalerank||9)<=3||f.properties.name==='Rhine'); // Rhine is rank 4 but wanted on the normal map
    const indexed=visFeats.map(_withIdx);
    riverPaths=g.append('g').attr('class','rivers').selectAll('path').data(indexed).enter().append('path')
      .attr('d',gpath).attr('fill','none').attr('stroke',th.sph).attr('stroke-width',riverMode?1.2:0.7)
      .style('vector-effect','non-scaling-stroke').style('pointer-events','none');
    if(riverMode){
      riverHitboxes=g.append('g').attr('class','river-hitboxes').selectAll('path').data(indexed).enter().append('path')
        .attr('d',gpath).attr('fill','none').attr('stroke','transparent').attr('stroke-width',10)
        .style('vector-effect','non-scaling-stroke').style('cursor','pointer')
        .on('mouseover',function(ev,d){
          if(game.found&&game.found.has(d._i))return;
          riverPaths.filter(r=>r._i===d._i).attr('stroke-width',2).attr('filter','url(#rv-glow)');
        })
        .on('mouseout',function(ev,d){riverPaths.filter(r=>r._i===d._i).attr('stroke-width',1.2).attr('filter',null);})
        .on('click',(ev,d)=>handleRiverClick(d._i));
    }
  }

  // Lakes — rendered after borders so fill covers borders inside lakes; stroke draws lake outline
  lakePaths=null;lakeDots=null;
  let lakeHit=null,microstateHit=null;
  if(lakesData){
    const lakeMode=game.lakeMode||false;
    const riverMode=game.riverMode||false;
    const named=lakesData.features.filter(f=>f.properties.name);
    const visFeats=lakeMode
      ? getLakeFeatures(game.difficulty)
      : riverMode
        ? getLakeFeatures('beginner')
        : named.filter(f=>f.properties.min_zoom<=3);
    const indexed=visFeats.map(_withIdx);
    lakePaths=g.append('g').attr('class','lakes').selectAll('path').data(indexed).enter().append('path')
      .attr('d',gpath).attr('fill',th.sph).attr('stroke',th.border).attr('stroke-width',0.6*(th.bw||1))
      .style('vector-effect','non-scaling-stroke');
    if(lakeMode){
      lakePaths.style('cursor','pointer')
        .on('mouseover',function(ev,d){if(wrongFlashIds.has(d._i))return;if(game.found&&game.found.has(d._i))return;d3.select(this).attr('fill',th.hov);})
        .on('mouseout',function(ev,d){d3.select(this).attr('fill',getLakeColor(d._i));})
        .on('click',(ev,d)=>handleLakeClick(d._i));
    }else{
      lakePaths.style('cursor','default').on('mouseover',()=>{}).on('click',()=>{});
    }

    // Dots for small lakes (min_zoom > 1, i.e. small at world view): visible when zoomed out, hidden once polygon is big enough
    if(lakeMode){
      const smallFeats=indexed.filter(f=>(f.properties.min_zoom||4)>1);
      if(smallFeats.length>0){
        lakeDots=dynG.append('g').attr('class','lake-dots').selectAll('circle').data(smallFeats).enter().append('circle')
          .attr('cx',d=>gpath.centroid(d)[0]).attr('cy',d=>gpath.centroid(d)[1])
          .attr('r',DOT_R).attr('fill',d=>getLakeColor(d._i)).attr('stroke',th.border).attr('stroke-width',1.5)
          .style('vector-effect','non-scaling-stroke').style('pointer-events','none');
        lakeHit=dynG.append('g').attr('class','lake-hit').selectAll('circle').data(smallFeats).enter().append('circle')
          .attr('cx',d=>gpath.centroid(d)[0]).attr('cy',d=>gpath.centroid(d)[1])
          .attr('r',HIT_R).attr('fill','transparent').style('cursor','pointer')
          .on('mouseover',function(ev,d){const t=nearestDot(ev,lakeHit)||d;if(wrongFlashIds.has(t._i))return;if(game.found&&game.found.has(t._i))return;lakeDots.filter(x=>x._i===t._i).attr('fill',th.hov);})
          .on('mouseout',function(){lakeDots.attr('fill',x=>getLakeColor(x._i));})
          .on('click',function(ev,d){const t=nearestDot(ev,lakeHit)||d;handleLakeClick(t._i);});
      }
    }
  }

  // Mountain ranges — same layering logic as lakes (static fill in g, name-keyed rep grouping
  // for pieces split across a border), only ever rendered during their own quiz mode.
  rangePaths=null;
  if(game.rangeMode&&game.rangeFeatures){
    const indexed=game.rangeFeatures.map(_withIdx);
    rangePaths=g.append('g').attr('class','ranges').selectAll('path').data(indexed).enter().append('path')
      .attr('d',gpath).attr('fill',d=>getRangeColor(d._i)).attr('stroke',th.border).attr('stroke-width',0.6)
      .style('vector-effect','non-scaling-stroke').style('cursor','pointer')
      .on('mouseover',function(ev,d){if(wrongFlashIds.has('r'+d._i))return;const rep=game.rangeRep[rangeDisplayName(d)];if(game.found.has(rep))return;d3.select(this).attr('fill',th.hov);})
      .on('mouseout',function(ev,d){d3.select(this).attr('fill',getRangeColor(d._i));})
      .on('click',(ev,d)=>handleRangeClick(d._i));
  }

  // Suppress the dot for any nation that now has a zone outline (the zone replaces the dot).
  // Länder mit Inselzone bekommen nie einen Punkt – auch nicht, wenn ihre Zone gerade nicht gezeichnet wird (Rückseite des Globus,
  // anderes Quiz): sonst erscheinen dort manchmal kleine Kreise statt der Umrandung
  const zonedIds=new Set(zoneHulls.map(z=>z.id));
  if(islandZoneData&&islandZoneData.zones)ISLAND_ZONES.forEach(z=>{if(islandZoneData.zones.some(q=>q.id===z.id))zonedIds.add(z.id);});
  const activeDots=MICROSTATES.filter(m=>isActive(m.id)&&!zonedIds.has(m.id));
  // Visual dots are drawn once per wrap tile as real circles (≈36×3 — trivially cheap) rather
  // than riding along in the <use> clones, so that resizing them on zoom never dirties the
  // clone source. cx is baked in at creation and never mutated afterwards.
  const dotCopies=isMerc?[-W,0,W]:[0];
  const msVis=activeDots.flatMap(d=>dotCopies.map(dx=>({...d,dx})));
  microstateDots=dynG.selectAll('.ms').data(msVis).enter().append('circle').attr('class','ms')
    .attr('cx',d=>proj([d.lon,d.lat])[0]+d.dx).attr('cy',d=>proj([d.lon,d.lat])[1])
    .attr('r',DOT_R).attr('stroke-width',1.5).style('vector-effect','non-scaling-stroke').style('pointer-events','none');
  // Hit circles exist only on the centre tile; taps on a wrap clone are resolved by wrapFind().
  microstateHit=dynG.append('g').attr('class','ms-hit').selectAll('circle').data(activeDots).enter().append('circle')
    .attr('cx',d=>proj([d.lon,d.lat])[0]).attr('cy',d=>proj([d.lon,d.lat])[1])
    .attr('r',d=>msHitR(d.id)).attr('fill','transparent').style('cursor','pointer')
    .on('mouseover',function(ev,d){const t=nearestDot(ev,microstateHit)||d;if(wrongFlashIds.has(t.id))return;const neededNow=game.currentGroup&&game.currentGroup.has(t.id);if(!neededNow&&((game.found&&game.found.has(t.id))||(game.skippedItems&&game.skippedItems.has(t.id))))return;microstateDots.filter(x=>x.id===t.id).attr('fill',THEMES[theme].hov);countryPaths&&countryPaths.filter(f=>eff(+f.id)===t.id).attr('fill',THEMES[theme].hov);})
    .on('mouseout',function(){microstateDots.attr('fill',x=>getMSColor(x.id));countryPaths&&countryPaths.attr('fill',f=>getColor(+f.id));})
    .on('click',function(ev,d){const t=nearestDot(ev,microstateHit)||d;handleClick(t.id);});

  // Island zone visuals — dashed hull outline above country fills, pointer-events off
  function izStroke(z){if(game.skippedItems&&game.skippedItems.has(z.id))return th.skipped;if(game.found&&game.found.has(z.id))return th.found;return'rgba(255,255,255,0.6)';}
  islandZoneVisuals=g.append('g').attr('class','iz-vis').selectAll('path').data(zoneHulls).enter().append('path')
    .attr('d',z=>isMerc?zonePathD(z):(d3.geoPath(proj)(z.geometry)||'')) // Globus/Natural Earth/Equal Earth: Linie wird am Kartenrand sauber abgeschnitten (sonst ragten Zonen über die Datumsgrenze aus der Karte heraus)
    .attr('fill','none').attr('stroke',izStroke).attr('stroke-opacity',0.55)
    .attr('stroke-dasharray','5 4').style('vector-effect','non-scaling-stroke').attr('stroke-width',1.5)
    .style('pointer-events','none');

  // City dots — rendered as points like microstates; visible at all zoom levels
  cityDots=null;let cityHit=null;
  if(game.cityMode&&game.cityFeatures){
    const cf=game.cityFeatures.map((c,i)=>({...c,_i:i}));
    cityDots=dynG.append('g').attr('class','city-dots').selectAll('circle').data(cf).enter().append('circle')
      .attr('cx',d=>proj([d.lon,d.lat])[0]).attr('cy',d=>proj([d.lon,d.lat])[1])
      .attr('r',DOT_R).attr('fill',d=>getCityColor(d._i)).attr('stroke',th.avail).attr('stroke-width',1.5)
      .style('vector-effect','non-scaling-stroke').style('pointer-events','none');
    cityHit=dynG.append('g').attr('class','city-hit').selectAll('circle').data(cf).enter().append('circle')
      .attr('cx',d=>proj([d.lon,d.lat])[0]).attr('cy',d=>proj([d.lon,d.lat])[1])
      .attr('r',HIT_R).attr('fill','transparent').style('cursor','pointer')
      .on('mouseover',function(ev,d){const t=nearestDot(ev,cityHit)||d;if(wrongFlashIds.has(t._i))return;if(game.found&&game.found.has(t._i))return;cityDots.filter(x=>x._i===t._i).attr('fill',THEMES[theme].hov);})
      .on('mouseout',function(){cityDots.attr('fill',x=>getCityColor(x._i));})
      .on('click',function(ev,d){const t=nearestDot(ev,cityHit)||d;handleCityClick(t._i);});
  }

  // Mountain peak dots — rendered as points like cities; visible at all zoom levels
  mountainDots=null;let mountainHit=null;
  if(game.mountainMode&&game.mountainFeatures){
    const mf=game.mountainFeatures.map((m,i)=>({...m,_i:i}));
    mountainDots=dynG.append('g').attr('class','mountain-dots').selectAll('circle').data(mf).enter().append('circle')
      .attr('cx',d=>proj([d.lon,d.lat])[0]).attr('cy',d=>proj([d.lon,d.lat])[1])
      .attr('r',DOT_R).attr('fill',d=>getMountainColor(d._i)).attr('stroke',th.avail).attr('stroke-width',1.5)
      .style('vector-effect','non-scaling-stroke').style('pointer-events','none');
    mountainHit=dynG.append('g').attr('class','mountain-hit').selectAll('circle').data(mf).enter().append('circle')
      .attr('cx',d=>proj([d.lon,d.lat])[0]).attr('cy',d=>proj([d.lon,d.lat])[1])
      .attr('r',HIT_R).attr('fill','transparent').style('cursor','pointer')
      .on('mouseover',function(ev,d){const t=nearestDot(ev,mountainHit)||d;if(wrongFlashIds.has('m'+t._i))return;if(game.found&&game.found.has(t._i))return;mountainDots.filter(x=>x._i===t._i).attr('fill',THEMES[theme].hov);})
      .on('mouseout',function(){mountainDots.attr('fill',x=>getMountainColor(x._i));})
      .on('click',function(ev,d){const t=nearestDot(ev,mountainHit)||d;handleMountainClick(t._i);});
  }

  // Drop-A-Pin: full-area overlay captures clicks anywhere; pinLayer holds the dropped markers
  pinLayer=null;
  let admin1Visible=false; // read by applyDotR below to avoid redundant display/opacity writes
  if(game.pinMode){
    // State/province borders — orientation help for placing a pin precisely, but only once
    // zoomed in enough that they'd actually be legible (see the fade in applyDotR below).
    // Lives in dynG, not g: its opacity is rewritten every scale-changed zoom frame, and any DOM
    // mutation inside g's <use>-cloned subtree forces a shadow-tree rebuild in WebKit (rule 3).
    if(admin1Lines){
      // Ready-made lines (data/admin1-lines.json, built by tools/build-admin1-lines.js): internal
      // borders only, already clipped to the 50m country outlines so none pokes across a country
      // border. Solid stroke, not dashed — dashing makes the renderer chop thousands of subpaths
      // into segments on every repaint. Lives in dynG, not g: its opacity is rewritten on zoom
      // frames and any DOM mutation inside g's <use>-cloned subtree forces a shadow-tree rebuild in
      // WebKit (rule 3).
      admin1Path=dynG.append('path').datum(admin1Lines).attr('d',gpath).attr('fill','none')
        .attr('stroke',th.border).attr('stroke-width',0.45)
        .style('vector-effect','non-scaling-stroke').attr('pointer-events','none')
        .style('display','none').style('opacity',0);
    }
    dynG.append('rect').attr('class','pin-overlay pin-cursor').attr('x',-5000).attr('y',-5000).attr('width',10000).attr('height',10000)
      .attr('fill','transparent').style('pointer-events','all').on('click',function(ev){handlePinClick(ev);});
    pinLayer=dynG.append('g').attr('class','pin-layer').style('pointer-events','none');
  }

  // Dot radii live in SVG units but must stay DOT_R *screen* pixels at any window size or
  // zoom, hence /_sc/zoomK. _sc is cached and only refreshed by the ResizeObserver below:
  // it used to be read via getBoundingClientRect() from inside a per-element d3 accessor,
  // forcing dozens of synchronous layouts on every animation frame of a pinch gesture.
  // preserveAspectRatio is "slice" (cover), so the SVG's own CSS box (what getBoundingClientRect
  // reports) is *not* what 960 logical units are stretched across — under slice the renderer
  // picks whichever of width/960 or height/500 is larger, cropping the other axis, so _sc has to
  // use that same larger ratio or it under-estimates the true on-screen scale (and dots/hitboxes
  // sized by dividing by it come out too big).
  // Mercator's viewBox width is kept in sync with the container's aspect ratio (syncViewBox
  // above), so r.width/vbW and r.height/MAP_H are always equal by construction — height alone is
  // the reliable reference. Natural Earth keeps the static box under "meet", which is bound by
  // whichever axis needs the *smaller* scale to fit entirely inside the container.
  function computeSc(){const r=svg.node().getBoundingClientRect();if(projection==='globe')return(Math.min(r.width,r.height)/480)||1;return(isMerc?r.height/MAP_H:Math.min(r.width/MAP_W,r.height/MAP_H))||1;}
  let _sc=computeSc();
  function dotGrow(k){return 1+0.5*Math.min(1,Math.log(Math.max(1,k))/Math.log(maxZoom()));}
  function dotR(zoomK=1){return DOT_R*dotGrow(zoomK)/_sc/zoomK;}
  function hitR(zoomK=1){return HIT_R*dotGrow(zoomK)/_sc/zoomK;}
  // Among a hit-circle selection, return the datum whose centre is nearest the pointer (nearest-wins on overlap)
  function nearestDot(ev,sel){
    const p=d3.pointer(ev,g.node());let best=null,bestD=Infinity;
    sel.each(function(d){if(this.style.display==='none')return;const dx=(+this.getAttribute('cx'))-p[0],dy=(+this.getAttribute('cy'))-p[1],dd=dx*dx+dy*dy;if(dd<bestD){bestD=dd;best=d;}});
    return best;
  }

  function applyDotR(zoomK=1){
    const pinHide=game&&game.pinMode;
    const msDisp=d=>pinHide||(d.id===442&&zoomK>=6)||(d.id===780&&zoomK>=3)||((d.id===548||d.id===90||d.id===270||d.id===388)&&zoomK>=2)?'none':'';
    const lkDisp=d=>zoomK>=(d.properties.min_zoom||4)?'none':'';
    const dr=dotR(zoomK);
    // cx/cy are set once at creation and never touched here — the old edge-clamping of cx was
    // only needed back when dots rode inside the wrap <use> clones instead of being tiled.
    if(microstateDots)microstateDots.attr('r',dr).style('display',msDisp);
    if(microstateHit)microstateHit.attr('r',d=>msHitR(d.id)/_sc/zoomK).style('display',msDisp);
    if(lakeDots)lakeDots.attr('r',dr).style('display',lkDisp);
    if(lakeHit)lakeHit.attr('r',hitR(zoomK)).style('display',lkDisp);
    if(cityDots)cityDots.attr('r',dr);
    if(cityHit)cityHit.attr('r',hitR(zoomK));
    if(mountainDots)mountainDots.attr('r',dr);
    if(mountainHit)mountainHit.attr('r',hitR(zoomK));
    if(pinLayer){const ps=1/_sc/zoomK;pinLayer.selectAll('.pin-mark').attr('transform',p=>'translate('+p[0]+','+p[1]+') scale('+ps+')');}
    if(admin1Path){
      // Fades in over a range rather than snapping on at one zoom level — a hard cutoff was
      // distracting mid-gesture. Thresholds are a fraction of the actual max zoom (not a fixed
      // k) because COARSE devices allow much deeper zoom (50 vs 20) — the lines should only
      // appear near the *top* of whatever range this device has, not at some fixed absolute k
      // that's barely zoomed in at all on touch.
      const maxK=maxZoom();
      const ADMIN1_FADE_START=maxK*0.6,ADMIN1_FADE_END=maxK*0.85;
      // display:none takes this path out of the paint pipeline entirely — below the fade
      // threshold (the vast majority of any zoom gesture) applyDotR does nothing to it at all,
      // instead of recomputing its stroke geometry on every single frame regardless of whether
      // it's even visible. admin1Visible only gets touched on the one frame it actually flips.
      if(zoomK<=ADMIN1_FADE_START){
        if(admin1Visible){admin1Path.style('display','none');admin1Visible=false;}
      }else{
        if(!admin1Visible){admin1Path.style('display','');admin1Visible=true;}
        admin1Path.style('opacity',Math.max(0,Math.min(1,(zoomK-ADMIN1_FADE_START)/(ADMIN1_FADE_END-ADMIN1_FADE_START))));
      }
    }
  }
  applyDotR();

  // Update dots on window resize (SVG scale changes) — the only place _sc is recomputed.
  const _ro=new ResizeObserver(()=>{
    syncViewBox();
    _sc=computeSc();
    applyDotR(projection==='globe'&&window.Globe?window.Globe.k:(_lastT?_lastT.k:1)); // Globus hat kein _lastT, sonst springen die Punkte nach dem Neuaufbau auf Zoom 1 zurück
  });
  _ro.observe(svg.node());

  // Mercator wrap: clone map content left and right via <use> so panning looks infinite.
  // Clicks on a clone are forwarded to the real country underneath it — but only on
  // 'click' (a single discrete event), never on 'mousemove' (that was expensive enough,
  // scanning every country on every pixel of movement, to visibly lag the whole page).
  if(isMerc){
    g.attr('id','map-main');
    function wrapFind(ev,dx){
      const[px,py]=d3.pointer(ev,g.node());
      const wx=px-dx;
      const ll=proj.invert([wx,py]);
      if(!ll||isNaN(ll[0]))return null;
      // microstateDots is tiled (one datum per wrap copy) — only test the centre tile, since
      // wx has already been un-offset back into centre-tile coordinates above.
      for(const m of(microstateDots?microstateDots.data():[])){
        if(m.dx)continue;
        const[mx,my]=proj([m.lon,m.lat]);
        const r=parseFloat(microstateDots.attr('r'))||DOT_R;
        if((wx-mx)**2+(py-my)**2<r*r*4)return m.id;
      }
      const zid=zoneIdAtPoint(wx,py);if(zid)return zid;
      const feat=renderFeatures.find(f=>d3.geoContains(f,ll));
      return feat?eff(+feat.id):null;
    }
    for(const dx of[-W,W]){
      // insert() rather than append(): the clones must sit *below* dynG in paint order, or the
      // clone at ±W would cover the dot tile drawn at that same offset.
      wrapG.insert('use',()=>dynG.node()).attr('href','#map-main').attr('x',dx).style('cursor','pointer')
        .on('click',function(ev){const id=wrapFind(ev,dx);if(id)handleClick(id);});
    }
  }

  const gNode=g.node();
  let _raf=null,_lastT=null,_wrapping=false;
  const txExt=isMerc?[[-W*2,0],[W*3,H]]:[[0,0],[W,H]];
  // Wrap-boundary re-normalization keeps _lastT.x within translateExtent so panning in one
  // direction never hits a wall. It only ever runs on a genuine 'end' event (gesture fully
  // released, never mid-gesture) and defers the reentrant zoomBehavior.transform() call to a
  // fresh task (setTimeout 0) so it never executes from inside d3-zoom's own event dispatch —
  // both are required to avoid corrupting d3-zoom's touch-gesture bookkeeping (see history:
  // this previously made the *next* pan gesture unresponsive for a few seconds on iOS).
  zoomBehavior=d3.zoom().scaleExtent([1,maxZoom()]).translateExtent(txExt)
    .clickDistance(COARSE?10:4) // ein Klick mit kleinem Zittern der Maus/des Fingers (bis 4 bzw. 10 px) zählt weiter als Klick, nicht als Verschieben
    .on('start',()=>{
      // Pointer-events is deliberately NOT touched here. 'start' fires on every mousedown,
      // before it's known whether the gesture becomes a drag or stays a plain click — disabling
      // it here left a window where the browser could compute a real click's target while
      // pointer-events was still 'none', silently swallowing the click on mouse devices (never
      // touch, since COARSE skips this branch, which is why this only ever broke on desktop
      // Chrome and never on the Surface or phone). It's disabled lazily below instead, only once
      // 'zoom' actually fires — which only happens once real movement has occurred.
    })
    .on('zoom',ev=>{
      const t=ev.transform;
      const scaleChanged=!_lastT||Math.abs(t.k-(_lastT.k||1))>0.001;
      _lastT=t;
      if(_wrapping){_wrapping=false;return;}
      // Disabling pointer-events during an actual drag avoids hover-triggered mouseover/mouseout
      // spam while dragging with a mouse. Touch has no hover state to suppress, and toggling
      // pointer-events on a group with hundreds of country/border paths forces an expensive
      // style/hit-region recalculation — skip it entirely on coarse (touch) pointers.
      if(!COARSE)gNode.style.pointerEvents='none';
      if(!_raf)_raf=requestAnimationFrame(()=>{
        wrapG.attr('transform',_lastT);
        if(scaleChanged)applyDotR(_lastT.k);
        _raf=null;
      });
    })
    .on('end',()=>{
      if(_wrapping)return;
      if(!COARSE)gNode.style.pointerEvents='';
      applyDotR(_lastT.k);
      if(isMerc){
        const period=W*_lastT.k;
        let nx=_lastT.x%period;
        if(nx>0)nx-=period;
        if(Math.abs(nx-_lastT.x)>1){
          setTimeout(()=>{
            _wrapping=true;
            svg.call(zoomBehavior.transform,d3.zoomIdentity.translate(nx,_lastT.y).scale(_lastT.k));
            _lastT=d3.zoomTransform(svg.node());
            wrapG.attr('transform',_lastT);
          },0);
        }
      }
    });
  svg.call(zoomBehavior);
  if(projection==='globe'&&window.Globe)window.Globe.install(svg,wrapG,applyDotR);
  else{svg.on('pointerdown.globe',null);svg.on('wheel.globe',null);} // Globus-Handler dürfen in den anderen Projektionen nicht weiterleben (sonst springt Mercator beim Scrollen zum Globus)
  setMapBg(th);updateColors();
  if(game&&game.pinMode&&game._pinRes&&pinLayer){drawPinResult(game._pinRes);applyDotR(d3.zoomTransform(svg.node()).k||1);} // Nadeln überleben den Neuaufbau
  // "?canvas" variant: the SVG tree above becomes an invisible scene graph drawn by canvas-map.js.
  if(window.CANVAS_MAP&&window.CanvasMap)CanvasMap.attach(svg.node());
}


function _avail(rawId){return theme==='terrain'?terrainFill(rawId):THEMES[theme].avail;}
function _availDot(id){return _avail(id);}
// Trivia: Treffer sind nur während der laufenden Frage grün (nextCountry() leert game.found), Übersprungenes leuchtet
// nur kurz orange (skip()). Es bleibt also nichts markiert, das bei einer späteren Frage etwas verraten könnte.
function getColor(rawId){if(game.fillPath)return pathColor(rawId);const id=eff(rawId),th=THEMES[theme];if(wrongFlashIds.has(id))return th.wrong;if(game.lakeMode||game.riverMode||game.cityMode||game.mountainMode||game.rangeMode)return _avail(rawId);if(game.pinMode){if(!C[id])return th.dim;if(!isActive(id))return th.dim;return _avail(rawId);}if(!C[id])return th.dim;if(game.skippedItems&&game.skippedItems.has(id))return th.skipped;if((keepFound||game.fillMode||game.challengeMode||game.triviaMode)&&game.found&&game.found.has(id))return th.found;if(!isActive(id))return th.dim;return _avail(rawId);}
function getMSColor(id){if(game.fillPath)return pathColor(id);const th=THEMES[theme];if(wrongFlashIds.has(id))return th.wrong;if(game.skippedItems&&game.skippedItems.has(id))return th.skipped;if((keepFound||game.fillMode||game.challengeMode||game.triviaMode)&&game.found&&game.found.has(id))return th.found;if(!isActive(id))return th.dim;return _availDot(id);}
function updateColors(){if(!countryPaths)return;const th=THEMES[theme];
  const neutral=game.lakeMode||game.riverMode||game.cityMode||game.mountainMode||game.rangeMode;
  if(neutral){
    // _avail() = Terrain-Theme: Farbe je Land (Biom); in den anderen Themes die Einheitsfarbe. Vorher stand hier
    // immer th.avail, die Biomfarben erschienen so erst beim Hovern.
    countryPaths.attr('fill',d=>_avail(+d.id)).attr('cursor','default');
    if(microstateDots)microstateDots.attr('fill',d=>_availDot(d.id)).attr('cursor','default');
    const hideBorders=game.lakeMode||game.riverMode;
    if(borderPath)borderPath.style('display',hideBorders?'none':'');
    d3.select('#map path.coastline').style('display',hideBorders?'none':'');
  }else if(game.pinMode||game.fillMode){
    countryPaths.attr('fill',d=>getColor(+d.id)).attr('cursor','default');
    if(microstateDots)microstateDots.attr('fill',d=>getMSColor(d.id)).attr('stroke',th.border).attr('cursor','default');
    if(borderPath)borderPath.style('display','');
    d3.select('#map path.coastline').style('display','');
  }else{
    countryPaths.attr('fill',d=>getColor(+d.id)).attr('cursor',d=>{const id=eff(+d.id);return isActive(id)?'pointer':'default';});
    if(microstateDots)microstateDots.attr('fill',d=>getMSColor(d.id)).attr('stroke',th.border).attr('cursor',d=>isActive(d.id)?'pointer':'default');
    if(borderPath)borderPath.style('display','');
    d3.select('#map path.coastline').style('display','');
  }
  if(islandZoneVisuals){
    const hideZones=neutral||game.pinMode;
    islandZoneVisuals.style('display',hideZones?'none':'')
      .attr('stroke',z=>{if(game.skippedItems&&game.skippedItems.has(z.id))return th.skipped;if((keepFound||game.fillMode||game.triviaMode)&&game.found&&game.found.has(z.id))return th.found;return'rgba(255,255,255,0.6)';});
    if(islandZoneHits)islandZoneHits.style('display',hideZones?'none':'').style('cursor',z=>isActive(z.id)?'pointer':'default');
  }
  d3.selectAll('.fgui-overlay').attr('fill',(neutral||game.pinMode)?th.avail:th.dim);
  updateLakeColors();
  updateRiverColors();
  updateCityColors();
  updateMountainColors();
  updateRangeColors();
  if(game.fillPath&&typeof pathStyle==='function')pathStyle(); // Kürzester Weg: nur Start, Ziel und gefundene Länder sichtbar
}
// ── RANDOM CHALLENGE ──
// Mixes question types from the existing map-click (country) and text-input (flag/capital/
// outline/language/currency/wappen) quizzes into one 10-question round. Deliberately does not
// touch handleClick/resolveAnswer/submitFlag at all — each question is set up as if it were an
// ordinary single-target instance of its own quiz type (reusing all their existing rendering
// and answer-checking), and the *only* hook is at the "this question is done, what's next"
// boundary each of those already has (nextCountry for map clicks, nextFlag's empty-queue check
// for text input) — redirected to advanceChallenge() instead of their normal "next same-type
// question or show final result" behaviour. A wrong answer doesn't advance, same as every other
// quiz in the app — retry until correct. Not currently included: river/lake/city/mountain/pin,
// which have their own distinct pools/mechanics and would need their own integration work.
const CHALLENGE_TYPES=['country','flag','capital','outline','language','currency','wappen'];
// flag/wappen questions each need their own per-country image, fetched lazily by nextFlag()'s
// <img src=...> otherwise — fine for the normal flag quiz (one image at a time, no round-trip
// timer running), but in a challenge that meant a visible loading flicker mid-round, and for the
// Daily Challenge specifically, silently counted that download time against the player's timed
// score. Fetching every image this round will need up front, before the timer/round starts,
// fixes both. img.onerror also resolves (not rejects) so one missing/offline image can't hang the
// whole round — nextFlag() already renders whatever the browser ends up with regardless.
function _preloadChallengeImages(queue){
  const urls=[];
  queue.forEach(q=>{
    if(q.type==='flag'||q.type==='pie')urls.push('data/flags/w320/'+ISO2[q.id]+'.png');
    else if(q.type==='wappen')urls.push('data/wappen/'+q.id+'.png');
  });
  return Promise.all(urls.map(u=>new Promise(res=>{
    const img=new Image();
    img.onload=img.onerror=res;
    img.src=u;
  })));
}
async function startRandomChallenge(){
  if(!outlineGeo)await iqEnsureOutlineGeo();
  // A country-type question needs worldData (renderMap's input) — normally loaded by loadMap()
  // the first time a map-click quiz starts, but a challenge launched straight from the home
  // screen may be the very first thing the player does this session, so it isn't loaded yet.
  if(!worldData)await loadMap();
  const countryIds=Object.keys(C).map(Number);
  const pools={
    country:countryIds,
    flag:countryIds.filter(id=>ISO2[id]),
    capital:countryIds.filter(id=>CAPITALS[id]),
    outline:countryIds.filter(id=>!OUTLINE_EXCLUDE.has(id)&&iqOutlineFeature(id)),
    language:Object.keys(LANGUAGES),
    currency:Object.keys(CURRENCIES),
    wappen:countryIds.filter(id=>!WAPPEN_EXCLUDE.has(id))
  };
  const queue=[];
  for(let i=0;i<10;i++){
    const type=CHALLENGE_TYPES[Math.floor(Math.random()*CHALLENGE_TYPES.length)];
    const pool=pools[type];
    queue.push({type,id:pool[Math.floor(Math.random()*pool.length)]});
  }
  await _preloadChallengeImages(queue);
  _challenge={queue,pos:0,firstTry:0,total:10,startTs:Date.now()};
  nextChallengeQuestion();
}
// One combined number instead of two separate stats (right answers, elapsed time) — 100 points per
// first-try-correct question, minus one point per elapsed second, floored at 0 so a slow-but-clean
// run never scores negative. A skipped question contributes nothing (see skip()/skipFlag(), which
// mark it exactly like a wrong answer so it's excluded from firstTry), matching "skipped questions
// give 0 points". Shared by Random and Daily Challenge — both set startTs at launch.
function _challengeScore(g){return Math.max(0,g.firstTry*100-Math.floor((Date.now()-g.startTs)/1000));}
function nextChallengeQuestion(){
  if(!_challenge)return;
  if(_challenge.pos>=_challenge.total){showChallengeResult();return;}
  const q=_challenge.queue[_challenge.pos];
  if(q.type==='country'){
    game={challengeMode:true,current:q.id,found:new Set(),correct:0,wrong:0,wrongOnCurrent:false};
    canClick=true;
    showScreen('game-screen');
    // Karte neu aufbauen, wenn sie noch von einem anderen Spiel stammt (Drop-a-Pin hinterlässt Klickfläche und Pfade, Städte/Berge/Flüsse
    // eigene Punkte und Treffer) – sonst wird der Klick auf ein Land verschluckt
    if(!countryPaths||_mapKind!=='country')renderMap(worldData);
    $('find-label').textContent=t('find');
    $('target-name').textContent=cn(q.id);
    clearFeedback();updateColors();updateStats();
  }else{
    game={challengeMode:true,flagMode:true,inputMode:q.type,capitalDir:'c2cap',flagQueue:[q.id],flagCorrect:0,flagWrong:0,flagFound:new Set(),wrongOnCurrent:false};
    showScreen('flag-screen');
    nextFlag();
  }
}
function advanceChallenge(){
  if(!game.wrongOnCurrent)_challenge.firstTry++;
  _challenge.pos++;
  if(_challenge.duel&&typeof duelProgress==='function')duelProgress();
  nextChallengeQuestion();
}
function showChallengeResult(){
  const g=_challenge,p=Math.round((g.firstTry/g.total)*100);
  g.score=_challengeScore(g);
  if(g.daily)_stopDailyTimer();
  showScreen('result-screen');
  $('res-emoji').textContent=p>=90?'🏆':p>=70?'🎉':p>=50?'👍':'📚';
  $('res-title').textContent=t('resTitle');
  $('res-l1').textContent=t('res1')(g.firstTry,g.total,p);
  $('res-l2').textContent=t('challengeScore')(g.score);
  $('res-btn-back').textContent=t('back');$('btn-again').style.display='';$('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');$('btn-share').textContent=t('shareBtn');
  const dw=$('daily-leaderboard-wrap');
  if(g.daily){
    g.timeMs=Date.now()-g.startTs;
    $('res-l2').textContent=t('timeLbl')+': '+_formatDailyTime(g.timeMs)+' · '+t('challengeScore')(g.score);
    $('btn-again').style.display='none'; // once-per-day: no replay
    if(dw){dw.style.display='';$('daily-leaderboard-title').textContent=t('dailyLeaderboardTitle');}
    if(typeof submitDailyChallengeScore==='function'){
      submitDailyChallengeScore(g.date,g.firstTry,g.total,g.timeMs,g.score).then(()=>renderDailyLeaderboard(g.date));
    }
  }else if(dw)dw.style.display='none';
  if(g.duel&&typeof duelShowResult==='function')duelShowResult(g);
  // game.challengeMode deliberately stays set (not reset to {}) so restart()/back() can still
  // tell this result screen belongs to a challenge — they're the ones that clear it.
  if(typeof checkAchievements==='function')checkAchievements();
}

// ── DAILY CHALLENGE ──
// Same mechanic as Random Challenge above (game.challengeMode, the shared "next question" hooks
// in nextCountry()/nextFlag()) — the only difference is the question queue is built with a PRNG
// seeded from today's date string instead of Math.random(), so every signed-in player gets the
// exact same 10 questions on the same calendar day (deterministic pool order: Object.keys(C) is
// spec-guaranteed ascending for its numeric-string keys, so it's identical across every browser).
// _challenge gains daily/date/startTs/timeMs fields that only showChallengeResult() above branches
// on — nextChallengeQuestion() itself is untouched and fully shared with Random Challenge.
const DAILY_ROUNDS=10;
function _seededRng(seedStr){
  let h=1779033703^seedStr.length;
  for(let i=0;i<seedStr.length;i++){h=Math.imul(h^seedStr.charCodeAt(i),3432918353);h=h<<13|h>>>19;}
  let seed=(h^h>>>16)>>>0;
  return function(){
    seed|=0;seed=seed+0x6D2B79F5|0;
    let r=Math.imul(seed^seed>>>15,1|seed);
    r=r+Math.imul(r^r>>>7,61|r)^r;
    return((r^r>>>14)>>>0)/4294967296;
  };
}
function _dailyToday(){return typeof _todayStr==='function'?_todayStr():new Date().toISOString().slice(0,10);}
function _formatDailyTime(ms){return(Math.max(0,ms)/1000).toFixed(1)+'s';}
let _dailyTimerHandle=null;
function _startDailyTimer(){_stopDailyTimer();_dailyTimerHandle=setInterval(()=>{if(_challenge&&(_challenge.daily||_challenge.duel)){updateStats();updateFlagStats();}},500);}
function _stopDailyTimer(){if(_dailyTimerHandle){clearInterval(_dailyTimerHandle);_dailyTimerHandle=null;}}

async function openDailyChallenge(){
  if(!window._authUser){openAuth('login');return;}
  const today=_dailyToday();
  const already=(typeof getDailyChallengeResult==='function')?await getDailyChallengeResult(today):null;
  if(already){showDailyAlreadyPlayed(already);return;}
  if(!dailyHintDismissed){_showDailyHint(today);return;}
  await startDailyChallenge(today);
}
let _dailyHintPendingDate=null;
function _showDailyHint(dateStr){
  _dailyHintPendingDate=dateStr;
  $('daily-hint-title').textContent=t('dailyHintTitle');
  $('daily-hint-text').textContent=t('dailyHintText');
  $('daily-hint-dontshow-lbl').textContent=t('dailyHintDontShow');
  $('daily-hint-dontshow').checked=false;
  $('daily-hint-btn').textContent=t('dailyHintBtn');
  $('daily-hint-modal').style.display='flex';
}
function _confirmDailyHint(){
  if($('daily-hint-dontshow').checked){dailyHintDismissed=true;persistSettings();}
  $('daily-hint-modal').style.display='none';
  const dateStr=_dailyHintPendingDate;_dailyHintPendingDate=null;
  if(dateStr)startDailyChallenge(dateStr);
}
async function startDailyChallenge(dateStr){
  if(!outlineGeo)await iqEnsureOutlineGeo();
  if(!worldData)await loadMap();
  const rng=_seededRng(dateStr);
  const countryIds=Object.keys(C).map(Number);
  const pools={
    country:countryIds,
    flag:countryIds.filter(id=>ISO2[id]),
    capital:countryIds.filter(id=>CAPITALS[id]),
    outline:countryIds.filter(id=>!OUTLINE_EXCLUDE.has(id)&&iqOutlineFeature(id)),
    language:Object.keys(LANGUAGES),
    currency:Object.keys(CURRENCIES),
    wappen:countryIds.filter(id=>!WAPPEN_EXCLUDE.has(id))
  };
  const queue=[];
  for(let i=0;i<DAILY_ROUNDS;i++){
    const type=CHALLENGE_TYPES[Math.floor(rng()*CHALLENGE_TYPES.length)];
    const pool=pools[type];
    queue.push({type,id:pool[Math.floor(rng()*pool.length)]});
  }
  // Preloaded (and startTs/the timer only starting afterwards) so a slow connection's download
  // time for flag/wappen images never counts against the player's timed score — see
  // _preloadChallengeImages()'s comment.
  await _preloadChallengeImages(queue);
  _challenge={queue,pos:0,firstTry:0,total:DAILY_ROUNDS,daily:true,date:dateStr,startTs:Date.now()};
  _startDailyTimer();
  nextChallengeQuestion();
}
function showDailyAlreadyPlayed(result){
  game={challengeMode:true};
  _challenge={daily:true,date:result.date,firstTry:result.firstTry,total:result.total,timeMs:result.timeMs};
  showScreen('result-screen');
  const p=Math.round((result.firstTry/result.total)*100);
  $('res-emoji').textContent=p>=90?'🏆':p>=70?'🎉':p>=50?'👍':'📚';
  $('res-title').textContent=t('dailyDoneTitle');
  $('res-l1').textContent=t('res1')(result.firstTry,result.total,p);
  $('res-l2').textContent=t('timeLbl')+': '+_formatDailyTime(result.timeMs);
  $('res-btn-back').textContent=t('back');$('btn-new').textContent=t('newgame');$('btn-share').textContent=t('shareBtn');
  $('btn-again').style.display='none';
  const dw=$('daily-leaderboard-wrap');
  if(dw){dw.style.display='';$('daily-leaderboard-title').textContent=t('dailyLeaderboardTitle');}
  renderDailyLeaderboard(result.date);
}
async function renderDailyLeaderboard(dateStr){
  const el=$('daily-leaderboard-list');
  if(!el)return;
  el.innerHTML='<div style="text-align:center;color:#888;padding:1rem;font-size:13px;">'+t('load')+'</div>';
  const rows=(typeof getDailyLeaderboard==='function')?await getDailyLeaderboard(dateStr,20):[];
  if(!rows.length){el.innerHTML='<div style="text-align:center;color:#888;padding:1rem;font-size:13px;">–</div>';return;}
  const myUid=window._authUser&&window._authUser.uid;
  el.innerHTML=rows.map((r,i)=>{
    const mine=r.uid===myUid;
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:6px;'+(mine?'background:rgba(29,158,117,0.15);':'')+'">'+
      '<span style="width:22px;color:#888;font-size:13px;">'+(i+1)+'</span>'+
      '<span style="flex:1;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escapeHtml(r.username||'?')+'</span>'+
      '<span style="font-size:13px;color:#aaa;">'+r.firstTry+'/'+r.total+'</span>'+
      '<span style="font-size:13px;color:#aaa;width:52px;text-align:right;">'+_formatDailyTime(r.timeMs)+'</span>'+
      '</div>';
  }).join('');
}

// A queue entry is either a bare country id (every mode except trivia's multi-country questions)
// or {ids:[...],q:'...'} (trivia mode only — see startTriviaGame()/_triviaBuildSpecs()). For a bare
// id, "resolved" means it's already in game.found, so the "skip already-answered entries" pre-check
// below can drop it before it's ever presented. Trivia entries deliberately do NOT use game.found
// for this: the same country can legitimately be part of more than one question in the same round
// (see _triviaBuildSpecs()'s comment — a country can top multiple real-world rankings at once), so
// a later question's countries being already-found from an earlier, unrelated question must not
// make nextCountry() silently skip presenting it — the player still needs credit for THIS question.
function _queueEntryResolved(entry){
  if(entry&&typeof entry==='object'&&entry.ids)return false;
  return game.found.has(entry);
}
// Lernmodus: Ziel, das falsch oder gar nicht gewusst wurde, nach ~3 weiteren Fragen noch einmal stellen. Das Quiz ist erst vorbei, wenn die Warteschlange
// leer ist, also jedes Ziel einmal ohne Fehler beantwortet wurde.
function _learnRequeue(){
  if(!learnMode||!game||game.challengeMode||game.triviaMode||game.fillMode||game.pinMode)return;
  const prev=game.current;
  if(prev==null||!game.wrongOnCurrent||!game.queue)return;
  if(game.found)game.found.delete(prev);
  if(game.skippedItems)game.skippedItems.delete(prev);
  game.queue.splice(Math.min(3,game.queue.length),0,prev);
  game.wrongOnCurrent=false;
}
function nextCountry(){
  if(game.challengeMode){advanceChallenge();return;}
  canClick=true;
  _learnRequeue();learnIntro();
  if(game.triviaMode&&game.found&&!game._holdFound)game.found.clear(); // Trivia: nichts bleibt markiert (dasselbe Land kann in mehreren Fragen vorkommen)
  if(game.queue&&game.found){while(game.queue.length&&_queueEntryResolved(game.queue[0]))game.queue.shift();}
  if(!game.queue||game.queue.length===0){showResult();return;}
  const entry=game.queue.shift();
  if(entry&&typeof entry==='object'&&entry.ids){
    game.current=entry.ids[0];
    game.currentGroup=new Set(entry.ids);
    game._triviaQ=entry.q;game._triviaBase=entry.base||null;game._triviaN=entry.n||0;
  }else{
    game.current=entry;
    game.currentGroup=null;
    game._triviaQ=null;game._triviaBase=null;
  }
  game.wrongOnCurrent=false;
  if(game.riverMode){const f=game.riverFeatures[game.current];$('target-name').textContent=f?riverDisplayName(f):'?';}
  else if(game.lakeMode){const f=game.lakeFeatures[game.current];$('target-name').textContent=f?lakeDisplayName(f):'?';}
  else if(game.cityMode){const c=game.cityFeatures[game.current];$('target-name').textContent=c?cityDisplayName(c):'?';}
  else if(game.mountainMode){const m=game.mountainFeatures[game.current];$('target-name').textContent=m?mountainDisplayName(m):'?';}
  else if(game.rangeMode){const r=game.rangeFeatures[game.current];$('target-name').textContent=r?rangeDisplayName(r):'?';}
  else if(game.triviaMode){$('target-name').textContent=game._triviaQ||'?';$('find-label').textContent=game.currentGroup&&game.currentGroup.size>1?t('findTriviaN'):t('findTrivia');}
  else{$('target-name').textContent=cn(game.current);}
  clearFeedback();updateStats();updateColors();
}
// Paints a wrongly picked country red. Adding it to wrongFlashIds and clearing it again is
// flashWrongKey()'s job (called from resolveAnswer), so this only draws.
function flashWrong(rawId){
  countryPaths&&countryPaths.filter(d=>+d.id===rawId).attr('fill',THEMES[theme].wrong);
  microstateDots&&microstateDots.filter(d=>d.id===rawId).attr('fill',THEMES[theme].wrong);
}
function handleClick(rawId){
  if(!canClick||!game||!game.current)return;
  const id=eff(rawId);
  // Guards of its own: the clicked shape must be a country that is part of this round, and with
  // "stay green" off an already-found country stays clickable.
  if(!C[id]||!isActive(id))return;
  // A country already found or skipped from an earlier, different trivia question stays clickable
  // if the ACTIVE question also needs it — see getColor()'s comment on why the same country can
  // legitimately belong to more than one question in a round. Without this, a country skipped once
  // would be permanently unclickable, soft-locking any later question that also needs it.
  const neededNow=game.currentGroup&&game.currentGroup.has(id);
  if(game.skippedItems&&game.skippedItems.has(id)&&!neededNow)return;
  if((keepFound||game.triviaMode)&&game.found.has(id)&&!neededNow)return;
  resolveAnswer({
    key:id,correct:game.currentGroup?game.currentGroup.has(id):id===game.current,name:cn(id),
    // Flash by effective id so a click on a merged territory highlights its parent country.
    flashKey:eff(rawId),
    flash:()=>flashWrong(rawId),
    repaint:updateColors,
    keepOnFound:keepFound||!!game.challengeMode||!!game.triviaMode // Challenge/Duell: Treffer immer grün zeigen, auch bei "Grün bleibt: aus"
  });
}
function updateStats(){
  if(game.fillMode){updateFillStats();return;} // Karte ausfüllen (fill.js)
  if(game.challengeMode){
    const g=_challenge;
    $('btn-skip').style.display='';
    $('score-disp').textContent=g.pos+'/'+g.total;$('found-label').textContent=t('foundLbl');
    $('stat-c').textContent=g.firstTry;$('lbl-c').textContent=t('correctLbl');
    $('stat-w').textContent=game.wrong||0;$('lbl-w').textContent=t('wrongLbl');
    if(g.daily||g.duel){$('stat-s').textContent=_formatDailyTime(Date.now()-g.startTs);$('lbl-s').textContent=t('timeLbl');}
    else{$('stat-s').textContent=g.skipped||0;$('lbl-s').textContent=t('skippedLbl');}
    $('stat-r').textContent=(g.total-g.pos)+' '+t('remLbl');
    $('prog-bar').style.width=Math.round((g.pos/g.total)*100)+'%';
    return;
  }
  $('btn-skip').style.display=game.pinMode?'none':'';
  if(game.pinMode){
    const tot=game.total||1,rounds=game.pinRound||0,avg=rounds?Math.round(game.pinTotalDist/rounds):0;
    $('score-disp').textContent=(game.pinScore||0);$('found-label').textContent=t('pointsLbl');
    $('stat-c').textContent=rounds;$('lbl-c').textContent=t('roundsLbl');
    $('stat-w').textContent=avg+' km';$('lbl-w').textContent=t('avgLbl');
    $('stat-s').textContent='';$('lbl-s').textContent='';
    $('stat-r').textContent=((game.queue?game.queue.length:0)+(game.current?1:0))+' '+t('remLbl');
    $('prog-bar').style.width=Math.round((rounds/tot)*100)+'%';
    return;
  }
  if(game.triviaMode){
    // game.found tracks individual countries, not questions — a "top 5" question alone adds 5 —
    // so the found/total ratio needs its own per-question counter instead of game.found.size,
    // or it could show more "found" than the round's own total.
    const tot=game.total||1,dn=game.questionsCompleted||0,rm=(game.queue?game.queue.length:0)+(game.current?1:0);
    $('score-disp').textContent=dn+'/'+tot;$('found-label').textContent=t('foundLbl');
    $('stat-c').textContent=game.correct||0;$('lbl-c').textContent=t('correctLbl');
    $('stat-w').textContent=game.wrong||0;$('lbl-w').textContent=t('wrongLbl');
    $('stat-s').textContent=game.skipped||0;$('lbl-s').textContent=t('skippedLbl');
    $('stat-r').textContent=rm+' '+t('remLbl');
    $('prog-bar').style.width=Math.round((dn/tot)*100)+'%';
    return;
  }
  const dn=game.found?game.found.size:0,tot=game.total||1,rm=(game.queue?game.queue.length:0)+(game.current?1:0);$('score-disp').textContent=dn+'/'+tot;$('found-label').textContent=t('foundLbl');$('stat-c').textContent=game.correct||0;$('lbl-c').textContent=t('correctLbl');$('stat-w').textContent=game.wrong||0;$('lbl-w').textContent=t('wrongLbl');$('stat-s').textContent=game.skipped||0;$('lbl-s').textContent=t('skippedLbl');$('stat-r').textContent=rm+' '+t('remLbl');$('prog-bar').style.width=Math.round((dn/tot)*100)+'%';}
function showResult(){if(!game.total){back();return;}const p=game.total>0?Math.round((game.firstTry/game.total)*100):0;const note=resultBestNote();game.current=null;showScreen('result-screen');$('res-btn-back').textContent=t('back');$('res-emoji').textContent=p>=90?'🏆':p>=70?'🎉':p>=50?'👍':'📚';$('res-title').textContent=t('resTitle');$('res-l1').textContent=t('res1')(game.firstTry,game.total,p);const sk=game.skipped||0;$('res-l2').textContent=t('res2')(game.correct,game.wrong)+(sk>0?', '+sk+' '+t('skippedLbl'):'')+note;$('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');$('btn-share').textContent=t('shareBtn');if(typeof checkAchievements==='function')checkAchievements();}

// Reads the already-rendered result-screen text rather than re-deriving it from game state,
// so this works unchanged for every mode (plain quiz, pin, region, flag/capital/outline …) —
// they all populate the same res-emoji/res-title/res-l1/res-l2 elements before this can be
// clicked. Falls back to clipboard only when the Web Share API is unavailable; if the user
// cancels a native share sheet, that's a "no", not a cue to silently copy instead.
async function shareResult(){
  const text=[$('res-emoji').textContent,$('res-title').textContent,$('res-l1').textContent,$('res-l2').textContent].filter(Boolean).join(' ');
  if(navigator.share){
    try{await navigator.share({title:t('shareTitle'),text,url:location.href});}catch(e){}
    return;
  }
  try{
    await navigator.clipboard.writeText(text+'\n'+location.href);
    const btn=$('btn-share'),old=btn.textContent;
    btn.textContent=t('shareCopied');
    setTimeout(()=>{btn.textContent=old;},2000);
  }catch(e){}
}

// ── FLAG QUIZ ──
let _fMatches=[],_fDdIdx=0;

// ── Input-Quiz: Flaggen / Hauptstädte / Umrisse (gemeinsame Eingabefeld-Mechanik) ──
let iqCfg={type:'flag',region:'world',diff:'all',dir:'c2cap'};
const IQ_PREFIX={flag:'flag:',capital:'cap:',outline:'out:',language:'lang:',currency:'cur:',wappen:'coa:',neighbor:'nbr:',pie:'pie:'};
function iqDiffPass(id,diff){
  if(diff==='all')return true;
  if(diff==='beginner')return FLAG_BEGINNER.has(id);
  if(diff==='easy')return FLAG_EASY.has(id);
  if(diff==='medium')return FLAG_MEDIUM.has(id);
  if(diff==='hard')return !FLAG_BEGINNER.has(id)&&!FLAG_EASY.has(id)&&!FLAG_MEDIUM.has(id);
  return true;
}
// Outline quiz uses the higher-resolution 10m geometry (50m is too coarse for small countries).
let outlineGeo=null,_iqOutlineCache=null;
// Microstates too coarse even at 10m → override with detailed OSM-derived boundaries (georgique/world-geojson).
const OUTLINE_SRC={336:'vatican',674:'san_marino',20:'andorra'};
let _iqOverride=null;
// OSM-derived polygons are often wound so d3-geo treats them as covering the whole sphere (area > 2π).
// Detect that with d3.geoArea and reverse the ring order to fix it.
function _rewindGeom(geom){
  const rev=poly=>poly.map(r=>r.slice().reverse());
  const bad=coords=>d3.geoArea({type:'Polygon',coordinates:coords})>2*Math.PI;
  if(geom.type==='Polygon'){if(bad(geom.coordinates))geom.coordinates=rev(geom.coordinates);}
  else if(geom.type==='MultiPolygon')geom.coordinates=geom.coordinates.map(p=>bad(p)?rev(p):p);
  return geom;
}
async function iqLoadOverrides(){
  if(_iqOverride)return;
  const acc={};
  await Promise.all(Object.entries(OUTLINE_SRC).map(async([id,nm])=>{
    try{
      const j=await fetch('data/outline/'+nm+'.json').then(r=>r.json());
      const gj=j.type==='FeatureCollection'?j.features[0]:j;const geom=gj.geometry||gj;
      if(geom&&geom.coordinates)acc[+id]={type:'Feature',id:+id,geometry:_rewindGeom(geom)};
    }catch(e){}
  }));
  _iqOverride=acc;
}
async function iqEnsureOutlineGeo(){
  if(!outlineGeo){try{outlineGeo=await fetch('data/countries-10m.json').then(r=>r.json());}catch(e){}}
  await iqLoadOverrides();
}
function iqGeomPoints(f){let n=0;const g=f.geometry;if(!g)return 0;const ps=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];ps.forEach(p=>p.forEach(r=>n+=r.length));return n;}
function iqOutlineFeature(id){
  if(_iqOverride&&_iqOverride[id])return _iqOverride[id];
  if(!outlineGeo)return null;
  if(!_iqOutlineCache){
    _iqOutlineCache={};
    // Some ids appear twice (e.g. 36 = Australia + Ashmore & Cartier Is.); keep the feature with the most detail.
    topojson.feature(outlineGeo,outlineGeo.objects.countries).features.forEach(f=>{
      let k=+f.id;
      // Kosovo has no numeric id in the 10m topology → map its named feature to 383.
      if(isNaN(k)&&f.properties&&/^kosovo$/i.test(f.properties.name||''))k=383;
      if(isNaN(k))return;
      const prev=_iqOutlineCache[k];
      if(!prev||iqGeomPoints(f)>iqGeomPoints(prev))_iqOutlineCache[k]=f;
    });
  }
  return _iqOutlineCache[id]||null;
}
// Nations with no meaningful single outline (micro city-states or scattered atolls) — excluded from the outline quiz.
const OUTLINE_EXCLUDE=new Set([492,520,585,462,296,583,584,798,690,776,702]);
// Turkey has no official heraldic coat of arms (no widely-recognised substitute either — its
// state emblem is a seal/crescent-star mark, not a coat of arms) — see data/wappen.README.md.
const WAPPEN_EXCLUDE=new Set([792]);
// Language/currency pools aren't scoped by continent or country-difficulty tier (they're not
// countries at all — a language or a currency can belong to several), so they skip the trailing
// region/diff filter entirely and just return every entry.
function iqPoolIds(cfg){
  if(cfg.type==='language')return Object.keys(LANGUAGES);
  if(cfg.type==='currency')return Object.keys(CURRENCIES);
  if(cfg.type==='neighbor')return NEIGHBOR_PUZZLES.map(p=>p.id);
  let base;
  if(cfg.type==='flag'||cfg.type==='pie')base=Object.keys(C).map(Number).filter(id=>ISO2[id]);
  else if(cfg.type==='capital')base=Object.keys(C).map(Number).filter(id=>CAPITALS[id]&&(cfg.dir!=='flag2cap'||ISO2[id]));
  else if(cfg.type==='wappen')base=Object.keys(C).map(Number).filter(id=>!WAPPEN_EXCLUDE.has(id));
  else base=Object.keys(C).map(Number).filter(id=>!OUTLINE_EXCLUDE.has(id)&&(!outlineGeo||iqOutlineFeature(id)));
  return base.filter(id=>(cfg.region==='world'||C[id].c===cfg.region)&&iqDiffPass(id,cfg.diff));
}
function iqScoreKey(cfg){return 'iq:'+cfg.type+':'+cfg.region+':'+cfg.diff+(cfg.type==='capital'?':'+cfg.dir:'');}
function iqAnswerCapital(){return game.inputMode==='capital'&&(game.capitalDir==='c2cap'||game.capitalDir==='flag2cap');}
function iqDisplayName(id){
  const mode=game.inputMode;
  if(mode==='language')return LANGUAGES[id][lang]||LANGUAGES[id].de;
  if(mode==='currency')return CURRENCIES[id][lang]||CURRENCIES[id].de;
  return iqAnswerCapital()?(CAPITALS[id][lang]||CAPITALS[id].de):(C[id][lang]||C[id].de);
}

function openInputCfg(type){iqCfg={type,region:'world',diff:'all',dir:'c2cap'};if(type==='outline')iqEnsureOutlineGeo().then(renderInputCfg);showScreen('inputcfg-screen');renderInputCfg();}
function setIqCfg(k,v){iqCfg[k]=v;if(k==='region'&&v!=='world')iqCfg.diff='all';if(k==='diff'&&v!=='all')iqCfg.region='world';renderInputCfg();}
function renderInputCfg(){
  const meta={flag:{title:t('flagQuiz'),ic:'🚩'},capital:{title:t('capitalQuiz'),ic:'🏛️'},outline:{title:t('outlineQuiz'),ic:'🗺️'},language:{title:t('languageQuiz'),ic:'🗣️'},currency:{title:t('currencyQuiz'),ic:'💱'},wappen:{title:t('wappenQuiz'),ic:'🛡️'},neighbor:{title:t('neighborQuiz'),ic:'🧩'},pie:{title:t('pieQuiz'),ic:'🥧'}}[iqCfg.type];
  $('icfg-back').textContent=t('cback');
  $('icfg-title').textContent=meta.title;
  const regions=[['world',t('regWorld')]].concat(['EU','AF','AS','NA','SA','OC'].map(m=>[m,MODES[m][lang]]));
  const diffs=[['all',t('diffAll')]].concat(TX[lang].flagDiffs.map(d=>[d.key,d.label]));
  const chip=(active,onclick,label)=>`<button class="iq-chip${active?' on':''}" onclick="${onclick}">${label}</button>`;
  let html='';
  // Language/currency/neighbor pools aren't scoped by continent or difficulty (see iqPoolIds) —
  // skip those chips entirely rather than showing controls that don't do anything.
  const scopable=iqCfg.type!=='language'&&iqCfg.type!=='currency'&&iqCfg.type!=='neighbor';
  if(iqCfg.type==='capital'){
    html+=`<div class="custom-card"><div class="custom-label">${t('cfgDir')}</div><div class="iq-chips">`+
      chip(iqCfg.dir==='c2cap',"setIqCfg('dir','c2cap')",t('dirC2Cap'))+
      chip(iqCfg.dir==='cap2c',"setIqCfg('dir','cap2c')",t('dirCap2C'))+
      chip(iqCfg.dir==='flag2cap',"setIqCfg('dir','flag2cap')",t('dirFlag2Cap'))+`</div></div>`;
  }
  if(scopable){
    html+=`<div class="custom-card"><div class="custom-label">${t('cfgRegion')}</div><div class="iq-chips">`+
      regions.map(([k,l])=>chip(iqCfg.region===k,"setIqCfg('region','"+k+"')",l)).join('')+`</div></div>`;
    html+=`<div class="custom-card"><div class="custom-label">${t('cfgDiff')}</div><div class="iq-chips">`+
      diffs.map(([k,l])=>chip(iqCfg.diff===k,"setIqCfg('diff','"+k+"')",l)).join('')+`</div></div>`;
  }
  const cnt=iqPoolIds(iqCfg).length;
  const cntLbl=t(iqCfg.type==='language'?'languages':iqCfg.type==='currency'?'currencies':'countries');
  html+=`<div style="text-align:center;"><button class="custom-start-btn" onclick="startInputQuiz(iqCfg)"${cnt?'':' disabled style="opacity:.5;"'}>${t('cfgStart')} · ${cnt} ${cntLbl}</button></div>`;
  $('icfg-body').innerHTML=html;
}
function setIqDropdown(v){showDropdown=v;renderFlagOpts();persistSettings();}
function setIqSkipHint(v){showSkipHint=v;renderFlagOpts();persistSettings();}
function toggleFlagOpts(){openCtxOpts('flag');}
function renderFlagOpts(){renderOptions();}

async function startInputQuiz(cfg){
  iqCfg={...cfg};
  if(cfg.type==='outline')await iqEnsureOutlineGeo();
  let ids=iqPoolIds(cfg);
  if(cfg.type==='pie'){ // nur Kuchen, die im Quiz eindeutig lösbar sind (Antwortmenge: die Auswahl selbst, bei Mittel/Schwer alle Länder)
    const wide=cfg.diff==='medium'||cfg.diff==='hard';
    ids=await pieFilterIds(ids,wide?iqPoolIds({...cfg,region:'world',diff:'all'}):ids);
  }
  if(!ids.length)return;
  // Normal mode: a plain fresh shuffle every round (completely random). Learn mode keeps its own
  // ordering on purpose — it brings back what the player got wrong.
  const queue=(learnMode?learnSortIds(ids,IQ_PREFIX[cfg.type],iqScoreKey(cfg)):shuffle(ids)).slice(0,(allTargets||learnMode)?Infinity:quizRoundLimit);
  // The two hardest difficulty tiers show every possible country in the dropdown, not just this
  // round's pool — a short list would let you find the answer by elimination instead of actually
  // recognising the flag/capital/outline. Easier tiers (and region-scoped rounds) keep the short,
  // relevant list. diff and region are mutually exclusive (setIqCfg resets region to 'world' when
  // a difficulty is picked), so the unfiltered pool here is always "every country of this type".
  const HARDEST_DIFFS=new Set(['medium','hard']);
  const ddPool=HARDEST_DIFFS.has(cfg.diff)?iqPoolIds({...cfg,diff:'all'}):ids;
  game={flagMode:true,inputMode:cfg.type,capitalDir:cfg.dir,iqCfg:{...cfg},
    flagQueue:queue,flagPool:new Set(ddPool),flagCorrect:0,flagWrong:0,flagSkipped:0,flagTotal:queue.length,flagFound:new Set(),
    difficulty:cfg.diff,flagArg:{...cfg},continent:cfg.region};
  showScreen('flag-screen');
  $('flag-btn-back').textContent=t('back');
  $('flag-lbl-c').textContent=t('correctLbl');
  $('flag-lbl-w').textContent=t('wrongLbl');
  $('flag-lbl-s').textContent=t('skippedLbl');
  nextFlag();
}

// Nations shown as 2-3 comparable main islands: draw all main islands and compact the gaps between them.
const OUTLINE_MULTI=new Set([28,659,678,882,174,780,554,480,670]);
function _roundD(d){
  d=d.replace(/-?\d+\.\d+/g,m=>Math.round(+m));
  // Collapse consecutive duplicate points (rounding merges dense coastlines — huge for Russia etc.).
  return d.replace(/M[^MZ]*Z/g,sub=>{
    const pts=sub.slice(1,-1).split('L');const out=[];let prev=null;
    for(const p of pts){if(p!==prev){out.push(p);prev=p;}}
    return 'M'+out.join('L')+'Z';
  });
}
// Single-landmass outline: fit to the largest polygon; draw only significant landmasses so tiny far
// islets (e.g. Norway's Jan Mayen) don't clutter the frame. Far big territories still clip out.
function outlineSinglePath(f){
  const g=f.geometry;const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
  if(!polys.length)return '';
  const info=polys.map(p=>({p,a:d3.geoArea({type:'Polygon',coordinates:p})}));
  const maxA=Math.max(...info.map(o=>o.a));
  const best=info.reduce((x,y)=>y.a>x.a?y:x).p;
  const keep=info.filter(o=>o.a>=maxA*0.03).map(o=>o.p);
  const proj=d3.geoMercator();const path=d3.geoPath(proj);
  proj.fitExtent([[16,16],[304,174]],{type:'Polygon',coordinates:best});
  return _roundD(path({type:'MultiPolygon',coordinates:keep})||'');
}
// Archipelago / antimeridian nations: center the map on the country and fit to ALL significant landmasses.
const OUTLINE_FITALL=new Set([608,392,360,90,44,132,643,242]);
function outlineFitAllPath(f){
  const g=f.geometry;const polys=g.type==='MultiPolygon'?g.coordinates:g.type==='Polygon'?[g.coordinates]:[];
  if(!polys.length)return '';
  const c=d3.geoCentroid(f);
  const p0=d3.geoMercator().rotate([-c[0],0]).fitExtent([[0,0],[1000,1000]],f);
  const info=polys.map(poly=>{const r=poly[0].map(pt=>p0(pt));let a=0;for(let i=0,n=r.length,j=n-1;i<n;j=i++){a+=r[j][0]*r[i][1]-r[i][0]*r[j][1];}return{poly,a:Math.abs(a/2)};});
  const maxA=Math.max(...info.map(o=>o.a));
  const feat={type:'MultiPolygon',coordinates:info.filter(o=>o.a>=maxA*0.03).map(o=>o.poly)};
  const proj=d3.geoMercator().rotate([-c[0],0]);const path=d3.geoPath(proj);
  proj.fitExtent([[16,16],[304,174]],feat);
  return _roundD(path(feat)||'');
}
// Shoelace area + centroid of a projected ring.
function _ringAC(r){let a=0,cx=0,cy=0;for(let i=0,n=r.length,j=n-1;i<n;j=i++){const x0=r[j][0],y0=r[j][1],x1=r[i][0],y1=r[i][1];const c=x0*y1-x1*y0;a+=c;cx+=(x0+x1)*c;cy+=(y0+y1)*c;}a*=0.5;if(Math.abs(a)<1e-9)return{area:0,cx:r[0][0],cy:r[0][1]};return{area:Math.abs(a),cx:cx/(6*a),cy:cy/(6*a)};}
// Multi-island outline: keep significant islands, pull them toward the shared centroid to shrink ocean gaps, then fit.
function outlineMultiPath(f){
  const g=f.geometry;const polys=g.type==='MultiPolygon'?g.coordinates:g.type==='Polygon'?[g.coordinates]:[];
  if(polys.length<2)return outlineSinglePath(f);
  const withGA=polys.map(p=>({p,ga:d3.geoArea({type:'Polygon',coordinates:p})}));
  const maxGA=Math.max(...withGA.map(o=>o.ga));
  const sig=withGA.filter(o=>o.ga>=maxGA*0.04).sort((a,b)=>b.ga-a.ga).slice(0,5).map(o=>o.p);
  if(sig.length<2)return outlineSinglePath(f);
  const proj=d3.geoMercator().fitExtent([[0,0],[1000,1000]],{type:'MultiPolygon',coordinates:sig});
  const islands=sig.map(poly=>{
    const rings=poly.map(r=>r.map(pt=>proj(pt)));const ac=_ringAC(rings[0]);
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;rings[0].forEach(p=>{if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];});
    return{rings,area:ac.area,cx:ac.cx,cy:ac.cy,bb:[x0,y0,x1,y1]};
  });
  const mv=(i,dx,dy)=>{i.rings=i.rings.map(r=>r.map(pt=>[pt[0]+dx,pt[1]+dy]));i.cx+=dx;i.cy+=dy;i.bb[0]+=dx;i.bb[1]+=dy;i.bb[2]+=dx;i.bb[3]+=dy;};
  const main=islands.reduce((a,b)=>b.area>a.area?b:a);
  const gap=Math.sqrt(main.area/Math.PI)*0.18;
  // Compact: pull far secondaries inward along their direction to roughly adjacent (half-diagonals touching).
  const halfDiag=i=>Math.hypot((i.bb[2]-i.bb[0])/2,(i.bb[3]-i.bb[1])/2);
  islands.forEach(i=>{if(i===main)return;let vx=i.cx-main.cx,vy=i.cy-main.cy,d=Math.hypot(vx,vy);if(d<1e-6){vx=1;vy=0;d=1;}const rd=halfDiag(main)+halfDiag(i);if(d>rd){const f2=rd/d-1;mv(i,vx*f2,vy*f2);}});
  // Separate using real bounding boxes: push overlapping pairs apart along the axis of least penetration (main fixed).
  for(let it=0;it<120;it++){let moved=false;
    for(let a=0;a<islands.length;a++)for(let b=a+1;b<islands.length;b++){
      const A=islands[a],B=islands[b];
      const ox=Math.min(A.bb[2],B.bb[2])-Math.max(A.bb[0],B.bb[0])+gap;
      const oy=Math.min(A.bb[3],B.bb[3])-Math.max(A.bb[1],B.bb[1])+gap;
      if(ox>0&&oy>0){
        if(ox<=oy){const s=A.cx<=B.cx?1:-1;if(A===main)mv(B,s*ox,0);else if(B===main)mv(A,-s*ox,0);else{mv(A,-s*ox/2,0);mv(B,s*ox/2,0);}}
        else{const s=A.cy<=B.cy?1:-1;if(A===main)mv(B,0,s*oy);else if(B===main)mv(A,0,-s*oy);else{mv(A,0,-s*oy/2);mv(B,0,s*oy/2);}}
        moved=true;
      }
    }if(!moved)break;}
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  islands.forEach(i=>i.rings.forEach(r=>r.forEach(pt=>{if(pt[0]<minx)minx=pt[0];if(pt[0]>maxx)maxx=pt[0];if(pt[1]<miny)miny=pt[1];if(pt[1]>maxy)maxy=pt[1];})));
  const tw=288,th=158,w=(maxx-minx)||1,h=(maxy-miny)||1,s=Math.min(tw/w,th/h);
  const ox=16+(tw-w*s)/2,oy=16+(th-h*s)/2;
  let d='';
  islands.forEach(i=>i.rings.forEach(r=>{d+='M'+r.map(pt=>Math.round((pt[0]-minx)*s+ox)+','+Math.round((pt[1]-miny)*s+oy)).join('L')+'Z';}));
  return d;
}
function renderOutline(id){
  const svg=$('iq-outline');const f=iqOutlineFeature(id);
  if(!f||!f.geometry)return svg.innerHTML='',false;
  const d=OUTLINE_MULTI.has(id)?outlineMultiPath(f):OUTLINE_FITALL.has(id)?outlineFitAllPath(f):outlineSinglePath(f);
  if(!d)return svg.innerHTML='',false;
  svg.innerHTML='<g class="iq-outline-g"><path d="'+d+'" fill="#6a9a58" stroke="#eaf0f8" stroke-width="1.1" stroke-linejoin="round"/></g>';
  // Each new outline reuses the same static path coordinates (baked to fit the 320x190
  // viewBox at 1x, see outlineSinglePath/outlineMultiPath/outlineFitAllPath above), so
  // a fresh zoom behavior + an explicit identity reset is needed every question — otherwise
  // the previous question's zoom/pan would carry over onto the new shape.
  const s=d3.select(svg),g=s.select('g.iq-outline-g');
  const zoom=d3.zoom().scaleExtent([1,6]).translateExtent([[0,0],[320,190]]).on('zoom',ev=>g.attr('transform',ev.transform));
  s.call(zoom).call(zoom.transform,d3.zoomIdentity);
  return true;
}

// Hinweis (nur Lernmodus): jeder Klick verrät einen Buchstaben mehr vom Anfang der Antwort. Gilt als „nicht gewusst“ – das Ziel kommt später wieder.
function flagHint(){
  if(game.flagCurrent==null||game.flagFound&&game.flagFound.has(game.flagCurrent))return;
  const ans=iqDisplayName(game.flagCurrent),ch=[...ans],letters=ch.filter(c=>c!==' ').length;
  game.flagHint=Math.min((game.flagHint||0)+1,Math.max(1,letters-1));
  game.wrongOnCurrent=true;
  let shown=0;const txt=ch.map(c=>{if(c===' ')return ' ';if(shown<game.flagHint){shown++;return c;}return '_';}).join(' ').replace(/ {3}/g,'   ');
  let hl=$('iq-hint');
  if(!hl){hl=document.createElement('div');hl.id='iq-hint';const inp=$('flag-input');inp.parentNode.insertBefore(hl,inp.nextSibling);}
  hl.textContent=txt;
  $('flag-input').focus();
}
function skipFlag(){
  if(game.flagCurrent==null)return;
  // Challenge mode (Random/Daily): see skip()'s comment — a skip must not count as a first-try hit.
  if(game.challengeMode){game.wrongOnCurrent=true;_challenge.skipped=(_challenge.skipped||0)+1;nextFlag();return;}
  game.flagSkipped=(game.flagSkipped||0)+1;
  if(learnMode)game.wrongOnCurrent=true; // Lernmodus: übersprungen = nicht gewusst
  if(showSkipHint&&game.flagCurrent!=null)showFlagFb('→ '+iqDisplayName(game.flagCurrent),'#e0952a');
  updateFlagStats();
  nextFlag();
}

// ── Flaggen-Kuchen: Farbanteile der Flagge als Kreisdiagramm, das Land ist zu erraten ──
// Die Anteile werden aus dem Flaggenbild gemessen (verkleinert, jedes Pixel der nächsten Grundfarbe zugeordnet) – keine Datendatei nötig.
const PIE_PALETTE=[['#ffffff',[255,255,255]],['#161616',[20,20,20]],['#d62828',[214,40,40]],['#0b8f3b',[11,143,59]],['#1f4fb8',[31,79,184]],['#ffd400',[255,212,0]],['#f77f00',[247,127,0]],['#7ec8f0',[126,200,240]],['#7a3b1e',[122,59,30]]];
// Grundfarbe eines Pixels über Farbton/Sättigung/Helligkeit (dunkles Marineblau der französischen Flagge gilt als Blau, nicht als Schwarz).
// Rückgabe: Index in PIE_PALETTE.
function pieClass(r,g,b){
  r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),v=mx,dl=mx-mn,sat=mx?dl/mx:0;
  if(v<0.2)return 1;                       // schwarz
  if(sat<0.2)return v>0.62?0:1;            // weiß (sonst dunkles Grau → schwarz)
  let h=0;if(dl){if(mx===r)h=((g-b)/dl)%6;else if(mx===g)h=(b-r)/dl+2;else h=(r-g)/dl+4;h*=60;if(h<0)h+=360;}
  if(h<14||h>=335)return 2;                // rot
  if(h<40)return v<0.62?8:6;               // braun / orange
  if(h<68)return 5;                        // gelb
  if(h<165)return 3;                       // grün
  if(h<205)return (sat<0.7&&v>0.7)?7:4;    // hellblau / blau
  if(h<262)return 4;                       // blau
  return 2;                                // violett/magenta → rot
}
const PIE_MIN=0.006; // ab 0,6 % Flächenanteil; darunter sind es fast nur Mischpixel an Farbkanten
const _pieCache=new Map();
const _pieSync={}; // id → Teile (sobald gemessen)
// Farbanteile einer Flagge: je Grundfarbe der Flächenanteil und der TATSÄCHLICHE Farbton (Mittel der Pixel dieser Grundfarbe) – so unterscheidet sich
// z. B. das dunkle Blau des Tschad vom helleren Blau Rumäniens auch im Kuchen. Vorberechnete Werte stehen in data/pie.json (siehe pieLoad); ohne die Datei
// wird live aus dem Flaggenbild gemessen.
// Rückgabe: [{c:'#rrggbb', f:Anteil 0..1, k:Index in PIE_PALETTE}] absteigend nach Anteil.
function flagColorShares(id){
  if(_pieCache.has(id))return _pieCache.get(id);
  const p=new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      try{
        const W=160,H=100,cv=document.createElement('canvas');cv.width=W;cv.height=H;const x=cv.getContext('2d',{willReadFrequently:true});
        x.drawImage(img,0,0,W,H);const d=x.getImageData(0,0,W,H).data,N=PIE_PALETTE.length;
        const cnt=new Array(N).fill(0),sr=new Array(N).fill(0),sg=new Array(N).fill(0),sb=new Array(N).fill(0);let n=0;
        for(let i=0;i<d.length;i+=4){if(d[i+3]<128)continue;const k=pieClass(d[i],d[i+1],d[i+2]);cnt[k]++;sr[k]+=d[i];sg[k]+=d[i+1];sb[k]+=d[i+2];n++;}
        const hex=v=>('0'+Math.round(v).toString(16)).slice(-2);
        let out=cnt.map((v,k)=>({c:v?'#'+hex(sr[k]/v)+hex(sg[k]/v)+hex(sb[k]/v):PIE_PALETTE[k][0],f:v/(n||1),k})).filter(o=>o.f>=PIE_MIN); // auch kleine Anteile (Wappen, Sterne, Embleme) bleiben im Kuchen
        out.sort((a,b)=>b.f-a.f);
        const sum=out.reduce((a,o)=>a+o.f,0)||1;out.forEach(o=>o.f/=sum);_pieSync[id]=out;res(out);
      }catch(e){res([]);}
    };
    img.onerror=()=>res([]);
    img.src='data/flags/w320/'+ISO2[id]+'.png';
  });
  _pieCache.set(id,p);return p;
}
// ── Nur eindeutig lösbare Kuchen ──
// Zwei Flaggen sind im Kuchen nicht zu unterscheiden, wenn ihre Anteile fast gleich sind (zusammen höchstens 6 Prozentpunkte Abstand) UND jede gemeinsame Grundfarbe
// (ab 8 % Anteil) im echten Farbton fast gleich ist (Farbabstand ΔE unter 13,5; Rumänien/Tschad liegen bei 14 und gelten noch als unterscheidbar).
// Beispiele, die dadurch NICHT vorkommen: Ägypten/Jemen/Irak, Malta/Monaco/Polen/Singapur, Paraguay/Russland, Kirgisistan/Vietnam, Tunesien/Türkei.
// Frankreich/Slowenien bleiben: gleiche Drittel, aber Marineblau und Rot gegen reines Blau und reines Rot (ΔE über 100).
const PIE_SHARE_MAX=6,PIE_DE_MIN=13.5,PIE_KEY='geoquiz_pie_v2';
function pieLab(hex){let r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;const f=v=>v>0.04045?Math.pow((v+0.055)/1.055,2.4):v/12.92;r=f(r);g=f(g);b=f(b);
  const X=(r*0.4124+g*0.3576+b*0.1805)/0.95047,Y=r*0.2126+g*0.7152+b*0.0722,Z=(r*0.0193+g*0.1192+b*0.9505)/1.08883,h=v=>v>0.008856?Math.cbrt(v):7.787*v+16/116;
  return[116*h(Y)-16,500*(h(X)-h(Y)),200*(h(Y)-h(Z))];}
function pieSimilar(a,b){
  const A={},B={};(a||[]).forEach(o=>A[o.k]=o);(b||[]).forEach(o=>B[o.k]=o);
  let share=0,de=0;
  for(const k of new Set([...Object.keys(A),...Object.keys(B)])){
    const x=A[k],y=B[k];share+=Math.abs((x?x.f:0)-(y?y.f:0));
    if(x&&y&&Math.min(x.f,y.f)>=0.08){const l1=pieLab(x.c),l2=pieLab(y.c);de=Math.max(de,Math.hypot(l1[0]-l2[0],l1[1]-l2[1],l1[2]-l2[2]));}
  }
  return share/2*100<=PIE_SHARE_MAX&&de<PIE_DE_MIN;
}
let _pieReady=null;
function pieEnsureAll(){
  if(_pieReady)return _pieReady;
  _pieReady=(async()=>{
    const ids=Object.keys(C).map(Number).filter(i=>ISO2[i]);
    try{const c=JSON.parse(localStorage.getItem(PIE_KEY)||'null');
      if(c&&ids.every(i=>c[i])){ids.forEach(i=>{_pieSync[i]=c[i].map(x=>({c:x[0],f:x[1]/1000,k:x[2]}));_pieCache.set(i,Promise.resolve(_pieSync[i]));});return true;}}catch(e){}
    await Promise.all(ids.map(i=>flagColorShares(i)));
    try{const o={};ids.forEach(i=>{o[i]=(_pieSync[i]||[]).map(x=>[x.c,Math.round(x.f*1000),x.k]);});localStorage.setItem(PIE_KEY,JSON.stringify(o));}catch(e){}
    return true;
  })();
  return _pieReady;
}
// ids: Ziele; scope: alle Länder, die als Antwort infrage kommen (Standard: ids selbst). Wer mit einem anderen Land der Auswahl verwechselbar ist, fliegt raus.
function pieFilterSync(ids,scope){
  const S=(scope||ids).filter(i=>_pieSync[i]),bad=new Set();
  for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++)if(pieSimilar(_pieSync[S[i]],_pieSync[S[j]])){bad.add(S[i]);bad.add(S[j]);}
  const out=ids.filter(i=>!bad.has(i));
  return out.length>=Math.min(10,ids.length)?out:ids; // zu wenig übrig: lieber alle als ein leeres Quiz
}
async function pieFilterIds(ids,scope){await pieEnsureAll();return pieFilterSync(ids,scope);}
window.pieEnsureAll=pieEnsureAll;window.pieFilterSync=pieFilterSync;
function pieSvg(parts,size){
  const r=size/2-4,cx=size/2,cy=size/2;let a0=-Math.PI/2,out='';
  if(parts.length===1)out='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+parts[0].c+'"/>';
  else parts.forEach(o=>{const a1=a0+o.f*2*Math.PI,l=o.f>0.5?1:0;
    out+='<path d="M'+cx+','+cy+' L'+(cx+r*Math.cos(a0)).toFixed(2)+','+(cy+r*Math.sin(a0)).toFixed(2)+' A'+r+','+r+' 0 '+l+' 1 '+(cx+r*Math.cos(a1)).toFixed(2)+','+(cy+r*Math.sin(a1)).toFixed(2)+' Z" fill="'+o.c+'"/>';a0=a1;});
  return '<svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'" style="max-width:70vw;filter:drop-shadow(0 4px 20px rgba(0,0,0,.5));"><g stroke="#2a2f3a" stroke-width="1.5" stroke-linejoin="round">'+out+'</g></svg>';
}
async function flagPieShow(id,wrap){
  const parts=await flagColorShares(id);
  if(!game||game.flagCurrent!==id||game.inputMode!=='pie')return; // Frage hat inzwischen gewechselt
  wrap.innerHTML=parts.length?pieSvg(parts,230):'<div class="iq-pie-load">?</div>';
}
function nextFlag(){
  applyIqSize();
  if(learnMode&&!game.challengeMode&&game.flagCurrent!=null&&game.wrongOnCurrent&&game.flagQueue){ // Lernmodus: nicht gewusst → später noch einmal
    if(game.flagFound)game.flagFound.delete(game.flagCurrent);
    game.flagQueue.splice(Math.min(3,game.flagQueue.length),0,game.flagCurrent);
  }
  learnIntro();
  if(!game.flagQueue||game.flagQueue.length===0){if(game.challengeMode){advanceChallenge();return;}showFlagResult();return;}
  game.flagCurrent=game.flagQueue.shift();game.wrongOnCurrent=false;game.flagHint=0;
  {const hb=$('flag-hint-btn');if(hb)hb.style.display=learnMode?'':'none';const hl=$('iq-hint');if(hl)hl.textContent='';}
  const id=game.flagCurrent,mode=game.inputMode||'flag';
  const img=$('flag-img'),txt=$('iq-text'),out=$('iq-outline-wrap'),nb=$('iq-neighbor-wrap');
  img.style.display='none';txt.style.display='none';out.style.display='none';nb.style.display='none';
  if(mode==='flag'||(mode==='capital'&&game.capitalDir==='flag2cap')){img.src='data/flags/w320/'+ISO2[id]+'.png';img.classList.remove('flag-img-wappen');img.style.display='';}
  else if(mode==='wappen'){img.src='data/wappen/'+id+'.png';img.classList.add('flag-img-wappen');img.style.display='';}
  else if(mode==='pie'){nb.innerHTML='<div class="iq-pie-load">…</div>';nb.style.display='flex';flagPieShow(id,nb);}
  else if(mode==='outline'){if(!renderOutline(id)){nextFlag();return;}$('iq-outline-tip').textContent=t('zoomTip');out.style.display='flex';}
  else if(mode==='language'){txt.textContent=LANGUAGES[id].ex;txt.classList.add('iq-text-sentence');txt.style.display='';}
  else if(mode==='currency'){txt.textContent=id;txt.classList.remove('iq-text-sentence');txt.style.display='';}
  else if(mode==='neighbor'){
    const ns=NEIGHBOR_PUZZLE_MAP.get(id)||[];
    nb.innerHTML=ns.map(nid=>'<img src="'+'data/flags/w320/'+ISO2[nid]+'.png" alt="" style="width:110px;border-radius:6px;box-shadow:0 4px 24px rgba(0,0,0,0.5);border:1px solid #333;">').join('');
    nb.style.display='flex';
  }
  else{txt.textContent=game.capitalDir==='c2cap'?(C[id][lang]||C[id].de):(CAPITALS[id][lang]||CAPITALS[id].de);txt.classList.remove('iq-text-sentence');txt.style.display='';}
  $('flag-quiz-lbl').textContent=mode==='language'?t('iqAskLanguage'):mode==='currency'?t('iqAskCurrency'):mode==='neighbor'?t('iqAskNeighbor'):iqAnswerCapital()?t('iqAskCapital'):t('iqAskCountry');
  const inp=$('flag-input');
  inp.value='';inp.placeholder=mode==='language'?t('langPlaceholder'):mode==='currency'?t('curPlaceholder'):iqAnswerCapital()?t('capPlaceholder'):t('flagPlaceholder');
  $('flag-dropdown').style.display='none';
  _fMatches=[];_fDdIdx=0;
  $('flag-skip-btn').textContent=t('skipLbl');
  updateFlagStats();
  inp.focus();
  setTimeout(()=>inp.focus(),50);
}

// Zusätzlich akzeptierte Schreibweisen bei Länder-Antworten (normalisiert, ohne Umlaute)
const IQ_ALT_COUNTRY={826:{de:['grossbritannien','grossbrittanien','großbritannien','großbrittanien'],en:['great britain','uk','gb'],es:['gran bretana'],fr:['grande-bretagne','grande bretagne']}};
function iqAltOk(id,v){return !!(game&&!(game.inputMode==='language'||game.inputMode==='currency'||iqAnswerCapital())&&((IQ_ALT_COUNTRY[id]||{})[lang]||[]).includes(v));}
function handleFlagInput(val){
  const v=norm(val.trim());
  if(!v||!showDropdown){$('flag-dropdown').style.display='none';_fMatches=[];if(!v)return;return;}
  const mode=game&&game.inputMode;
  let allIds;
  if(mode==='language')allIds=Object.keys(LANGUAGES);
  else if(mode==='currency')allIds=Object.keys(CURRENCIES);
  else allIds=Object.keys(C).map(Number);
  // flagPool already holds exactly the ids valid for this quiz type (see startInputQuiz), so no
  // further per-type existence check is needed here.
  const pool=(game&&game.flagPool)?(id=>game.flagPool.has(id)):(()=>true);
  const nameOf=id=>iqDisplayName(id);
  _fMatches=allIds.filter(id=>pool(id)&&norm(nameOf(id)).includes(v))
    .sort((a,b)=>{
      const na=norm(nameOf(a)),nb=norm(nameOf(b));
      return (na.startsWith(v)?0:1)-(nb.startsWith(v)?0:1)||na.localeCompare(nb);
    }).slice(0,6);
  _fDdIdx=0;
  renderFlagDropdown();
}

function renderFlagDropdown(){
  const dd=$('flag-dropdown');
  if(!_fMatches.length){dd.style.display='none';return;}
  dd.innerHTML=_fMatches.map((id,i)=>`<div onmousedown="event.preventDefault();selectFlagItem(${i})" ontouchstart="event.preventDefault();selectFlagItem(${i})" style="padding:8px 14px;cursor:pointer;font-size:14px;${i===_fDdIdx?'background:#2a2a2a;color:#eee;':'color:#ccc;'}">${iqDisplayName(id)}</div>`).join('');
  dd.style.display='block';
}

function selectFlagItem(i){
  $('flag-input').value=iqDisplayName(_fMatches[i]);
  $('flag-dropdown').style.display='none';_fMatches=[];
  submitFlag();
}

let _flagFbTimer=null;
function showFlagFb(text,color){
  const el=$('flag-fb');if(!el)return;
  el.textContent=text;el.style.color=color;el.style.opacity='1';
  if(_flagFbTimer)clearTimeout(_flagFbTimer);
  _flagFbTimer=setTimeout(()=>{el.style.opacity='0';},2000);
}

function submitFlag(){
  const val=norm($('flag-input').value.trim());
  if(!val||game.flagCurrent==null)return;
  const id=game.flagCurrent,mode=game.inputMode;
  // A correct answer schedules nextFlag() 500ms later (so the "✓" feedback is visible for a beat)
  // rather than advancing immediately — without this guard, a second submit for the same question
  // inside that window (e.g. Enter plus a dropdown click, or a fast double-Enter) would count twice
  // (game.flagCorrect++ / _challenge.firstTry++ both run again), inflating the score past the real
  // total. flagFound already tracks "this id is done" for every input mode, so reuse it as the guard.
  if(game.flagFound&&game.flagFound.has(id))return;
  const tg=mode==='language'?LANGUAGES[id]:mode==='currency'?CURRENCIES[id]:iqAnswerCapital()?CAPITALS[id]:C[id];
  if(val===norm(tg.de)||val===norm(tg.en)||iqAltOk(id,val)){
    if(!(learnMode&&game.wrongOnCurrent))game.flagCorrect++; // Lernmodus: nur Treffer ohne Fehler zählen (das Ziel kommt sonst noch einmal)
    game.flagFound.add(id);
    showFlagFb('✓ '+iqDisplayName(id),'#1D9E75');
    recordCorrectForCurrent();
    updateFlagStats();
    setTimeout(nextFlag,500);
  }else{
    game.flagWrong++;game.wrongOnCurrent=true;recordMissForCurrent();
    showFlagFb('✗ '+t('wrongShort'),'#D85A30');
    $('flag-input').value='';
    updateFlagStats();
  }
}

function updateFlagStats(){
  if(game.challengeMode){
    const g=_challenge;
    $('flag-skip-btn').style.display='';
    $('flag-score').textContent=g.pos+'/'+g.total;
    $('flag-stat-c').textContent=g.firstTry;
    $('flag-stat-w').textContent=game.flagWrong||0;
    if(g.daily||g.duel){$('flag-stat-s').textContent=_formatDailyTime(Date.now()-g.startTs);$('flag-lbl-s').textContent=t('timeLbl');}
    else{$('flag-stat-s').textContent=g.skipped||0;$('flag-lbl-s').textContent=t('skippedLbl');}
    $('flag-stat-r').textContent=(g.total-g.pos)+' '+t('remLbl');
    $('flag-prog').style.width=Math.round((g.pos/g.total)*100)+'%';
    return;
  }
  const correct=game.flagCorrect||0,skipped=game.flagSkipped||0,tot=game.flagTotal||1;
  const done=correct+skipped;
  $('flag-score').textContent=done+'/'+tot;
  $('flag-stat-c').textContent=correct;
  $('flag-stat-w').textContent=game.flagWrong||0;
  $('flag-stat-s').textContent=skipped;
  $('flag-lbl-s').textContent=t('skippedLbl');
  $('flag-stat-r').textContent=((game.flagQueue?game.flagQueue.length:0)+(game.flagCurrent!=null?1:0))+' '+t('remLbl');
  $('flag-prog').style.width=Math.round((done/tot)*100)+'%';
}

function showFlagResult(){
  if(!game.flagTotal){back();return;}
  game.flagCurrent=null;
  const p=game.flagTotal>0?Math.round((game.flagCorrect/game.flagTotal)*100):0;
  $('res-emoji').textContent=p>=90?'🏆':p>=70?'🎉':p>=50?'👍':'📚';
  $('res-title').textContent=t('resTitle');
  const note=resultBestNote();
  $('res-l1').textContent=t('res1')(game.flagCorrect,game.flagTotal,p);
  $('res-l2').textContent=t('res2')(game.flagCorrect,game.flagWrong)+note;
  $('res-btn-back').textContent=t('back');$('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');$('btn-share').textContent=t('shareBtn');
  showScreen('result-screen');
  if(typeof checkAchievements==='function')checkAchievements();
}

// Flag quiz keyboard handling
(function(){
  const inp=$('flag-input');
  if(!inp)return;
  inp.addEventListener('keydown',function(e){
    if(e.key==='Tab'){
      e.preventDefault();
      if(!inp.value.trim()){skipFlag();return;} // leeres Feld: Ziel überspringen
      if(_fMatches.length>0){
        $('flag-input').value=iqDisplayName(_fMatches[_fDdIdx]);
        $('flag-dropdown').style.display='none';_fMatches=[];
      }
    }else if(e.key==='Enter'){
      e.preventDefault();
      if(_fMatches.length>0&&$('flag-dropdown').style.display!=='none'){
        $('flag-input').value=iqDisplayName(_fMatches[_fDdIdx]);
        $('flag-dropdown').style.display='none';_fMatches=[];
      }
      submitFlag();
    }else if(e.key==='ArrowDown'){
      e.preventDefault();
      if(_fMatches.length>0){_fDdIdx=Math.min(_fDdIdx+1,_fMatches.length-1);renderFlagDropdown();}
    }else if(e.key==='ArrowUp'){
      e.preventDefault();
      if(_fMatches.length>0){_fDdIdx=Math.max(_fDdIdx-1,0);renderFlagDropdown();}
    }else if(e.key==='Escape'){
      $('flag-dropdown').style.display='none';_fMatches=[];
    }
  });
})();

// ── Region Quiz ──
const REGION_QUIZZES={
  DE:{
    name:{de:'Deutschland',en:'Germany',es:'Alemania',fr:'Allemagne'},
    sub:{de:'Bundesländer',en:'Federal States',es:'Estados federados',fr:'Länder fédéraux'},
    url:'data/regions/germany.json',
    objectKey:'states',nameKey:'name',count:16,
    proj:'fit',filter:null
  },
  US:{
    name:{de:'USA',en:'USA',es:'EE. UU.',fr:'États-Unis'},
    sub:{de:'Bundesstaaten',en:'States',es:'Estados',fr:'États'},
    url:'data/regions/us-states-10m.json',
    objectKey:'states',nameKey:'name',count:50,
    proj:'albers-usa',
    // District of Columbia is excluded too: at this scale it renders as a sliver invisible next
    // to Virginia/Maryland, so it can never actually be found on the map.
    filter:f=>!['American Samoa','Guam','Commonwealth of the Northern Mariana Islands','Puerto Rico','United States Virgin Islands','District of Columbia'].includes(f.properties.name),
    // geoAlbersUsa already positions Alaska as an inset in a sensible spot; just mark it with
    // the same dashed frame Spain's Canarias inset gets, so it's clear it isn't drawn at its
    // real location. Hawaii gets its own custom inset box below instead of geoAlbersUsa's
    // built-in spot, so its bottom edge can be lined up exactly with Alaska's.
    insetFrameNames:['Alaska'],
    // Box is narrower and further left than a straight "shift right of Alaska" placement would
    // give: at this width the frame's top-right corner would sit right under Texas's southern
    // tip (verified against Texas's actual projected coastline, not just its bounding box) — at
    // x≈360 Texas dips to y≈483, almost exactly the box's old top edge. This box keeps roughly
    // a 12px gap from Alaska's frame on the left and a 25px+ gap from Texas's tip on the right.
    insets:[{match:f=>f.properties.name==='Hawaii',box:[[264,490],[319,553]]}]
  },
  FR:{
    name:{de:'Frankreich',en:'France',es:'Francia',fr:'France'},
    sub:{de:'Regionen',en:'Regions',es:'Regiones',fr:'Régions'},
    url:'data/regions/france-regions.geojson',
    objectKey:null,nameKey:'nom',count:13,
    proj:'fit',filter:null,isGeoJSON:true
  },
  // The four below are derived from Natural Earth admin-1 (see data/regions/README.md).
  // Region names are kept in the country's own language, as with Germany and France.
  IT:{
    name:{de:'Italien',en:'Italy',es:'Italia',fr:'Italie'},
    sub:{de:'Regionen',en:'Regions',es:'Regiones',fr:'Régions'},
    url:'data/regions/italy.geojson',
    objectKey:null,nameKey:'name',count:20,
    proj:'fit',filter:null,isGeoJSON:true
  },
  ES:{
    name:{de:'Spanien',en:'Spain',es:'España',fr:'Espagne'},
    sub:{de:'Autonome Gemeinschaften',en:'Autonomous Communities',es:'Comunidades autónomas',fr:'Communautés autonomes'},
    url:'data/regions/spain.geojson',
    // The 17 autonomous communities. Ceuta and Melilla are left out: they are autonomous cities,
    // and at ~12-19 km² they disappear at this simplification and would be unhittable anyway.
    objectKey:null,nameKey:'name',count:17,
    proj:'fit',filter:null,isGeoJSON:true,
    // The Canary Islands sit far off the African coast, so including them in the fit-extent
    // bounding box shrinks mainland Spain down to a fraction of the map. Fit on the mainland
    // only; the islands are still a valid quiz target, drawn via their own inset (below).
    fitFilter:f=>f.properties.name!=='Canarias',
    // Off their real coordinates the Canaries would render far off-screen (that's the whole
    // point of fitFilter above), so they'd be a target the player could never actually click.
    // Give them their own small projection into an empty corner of the map, the same way
    // Alaska/Hawaii sit as insets next to the mainland US.
    // Mainland Spain's nearest point at this height (Cádiz/Huelva) sits at x≈222, so this still
    // leaves a wide margin after shifting right.
    insets:[{match:f=>f.properties.name==='Canarias',box:[[40,470],[155,585]]}]
  },
  AT:{
    name:{de:'Österreich',en:'Austria',es:'Austria',fr:'Autriche'},
    sub:{de:'Bundesländer',en:'Federal States',es:'Estados federados',fr:'Länder fédéraux'},
    url:'data/regions/austria.geojson',
    objectKey:null,nameKey:'name',count:9,
    proj:'fit',filter:null,isGeoJSON:true
  },
  JP:{
    name:{de:'Japan',en:'Japan',es:'Japón',fr:'Japon'},
    sub:{de:'Präfekturen',en:'Prefectures',es:'Prefecturas',fr:'Préfectures'},
    url:'data/regions/japan.geojson',
    objectKey:null,nameKey:'name',count:47,
    proj:'fit',filter:null,isGeoJSON:true,
    // Okinawa's island chain stretches far south of the main archipelago; excluding it from the
    // fit-extent box (same reasoning as Spain/Canarias above) keeps the mainland readable. Tokyo
    // needs the same treatment for a less obvious reason: the Tokyo prefecture polygon itself
    // also covers the Izu/Ogasawara islands, reaching almost as far south (~24.7°N) as Okinawa —
    // so even with Okinawa excluded, fitting on Tokyo's full extent still squeezed the mainland
    // into the top third of the map. Tokyo's mainland portion still renders in its correct spot
    // afterwards (fitFilter only affects the fit-box calculation, not what gets drawn).
    fitFilter:f=>!['Okinawa','Tokyo'].includes(f.properties.name),
    // Japan's 47 prefectures are uniformly small — unlike Germany's three city-states among
    // 13 much larger Länder, most of them fall under the tiny-region area threshold. Giving
    // nearly every prefecture an overlapping r=16 hit circle made clicks resolve to whichever
    // circle happened to be on top rather than the region actually under the cursor. Prefecture
    // borders are dense enough here that the real polygons are the more accurate hit target.
    tinyHit:false,
    // Okinawa liegt an seinen echten Koordinaten unterhalb der Kartenfläche (die Anpassung oben schließt es bewusst aus) und
    // wurde deshalb abgeschnitten. Wie die Kanaren bei Spanien bekommt es einen eigenen Einschub in der freien Ecke unten links
    // (Kyushu beginnt erst bei x≈259).
    insets:[{match:f=>f.properties.name==='Okinawa',box:[[40,485],[200,585]]}]
  }
};
const REGION_QUIZ_LIST=Object.entries(REGION_QUIZZES).map(([k,v])=>({key:k,name:v.name,count:v.count}));
let _regGame=null,_regCache={},_regPaths=null;

async function startRegionQuiz(key){
  const cfg=REGION_QUIZZES[key];
  if(!cfg)return;
  showScreen('region-screen');
  const findLbl=lang==='en'?'Find this region':'Finde diese Region';
  $('reg-find-label').textContent=findLbl;
  $('reg-target-name').textContent=lang==='en'?'Loading…':'Wird geladen …';
  $('reg-btn-skip').textContent=t('skipLbl');$('reg-btn-skip').style.display='';
  $('reg-found-label').textContent=t('foundLbl');
  $('reg-lbl-c').textContent=t('correctLbl');
  $('reg-lbl-w').textContent=t('wrongLbl');
  $('reg-lbl-s').textContent=t('skippedLbl');

  let features;
  if(_regCache[key]){
    features=_regCache[key];
  }else{
    try{
      const data=await fetch(cfg.url).then(r=>r.json());
      if(cfg.isGeoJSON){
        features=data.features;
      }else{
        features=topojson.feature(data,data.objects[cfg.objectKey]).features;
      }
      if(cfg.filter)features=features.filter(cfg.filter);
      _regCache[key]=features;
    }catch(e){
      $('reg-target-name').textContent='Error loading data';
      return;
    }
  }

  const names=features.map((f,i)=>({idx:i,name:f.properties[cfg.nameKey]}));
  const queue=[...names];
  for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]];}

  // wrongNames/wrongTimers: same reasoning as the country quiz's wrongFlashIds — a set plus a
  // per-name timer, so clicking a second wrong region during the first one's red flash doesn't
  // cut the first one short.
  _regGame={key,cfg,features,names,queue,pos:0,correct:0,wrong:0,skipped:0,firstTry:0,found:new Set(),skippedItems:new Set(),wrongOnCurrent:false,total:queue.length,busy:false,wrongNames:new Set(),wrongTimers:new Map()};
  _renderRegionMap(cfg,features);
  _nextRegion();
}

// Centroid of a closed ring of projected [x,y] points, by signed area (not a plain average —
// that would pull off-centre on a concave shape). Falls back to averaging the points for a
// degenerate (zero-area) ring.
function _ringCentroid(ring){
  let a=0,cx=0,cy=0;
  for(let i=0;i<ring.length-1;i++){
    const [x0,y0]=ring[i],[x1,y1]=ring[i+1];
    const cross=x0*y1-x1*y0;
    a+=cross;cx+=(x0+x1)*cross;cy+=(y0+y1)*cross;
  }
  a*=0.5;
  if(Math.abs(a)<1e-6){
    let sx=0,sy=0;
    for(let i=0;i<ring.length-1;i++){sx+=ring[i][0];sy+=ring[i][1];}
    return [sx/(ring.length-1),sy/(ring.length-1)];
  }
  return [cx/(6*a),cy/(6*a)];
}

// Builds an invisible, enlarged hit-target path for a tiny region by scaling its actual
// contour, not a generic circle at the bounding-box centre. A region like Bremen is two
// separate exclaves (Bremen-Stadt and Bremerhaven) with Niedersachsen in between — scaling
// around one shared centroid would drag both parts toward each other and eat into that gap.
// Scaling each polygon part around its own centroid instead grows every part in place.
function _scaledHitPath(feature,proj,factor){
  const geom=feature.geometry;
  const polys=geom.type==='Polygon'?[geom.coordinates]:geom.coordinates;
  let d='';
  for(const poly of polys){
    const projRings=poly.map(ring=>ring.map(pt=>proj(pt)));
    const [ccx,ccy]=_ringCentroid(projRings[0]);
    for(const ring of projRings){
      const scaled=ring.map(([x,y])=>[ccx+(x-ccx)*factor,ccy+(y-ccy)*factor]);
      d+='M'+scaled.map(p=>p[0].toFixed(2)+','+p[1].toFixed(2)).join('L')+'Z';
    }
  }
  return d;
}

function _renderRegionMap(cfg,features){
  const svg=d3.select('#reg-map');svg.selectAll('*').remove();
  const W=960,H=600;
  // fitFilter lets a config fit the projection to a subset of features (e.g. mainland Spain,
  // excluding the Canary Islands) while still rendering and quizzing on all of them — an
  // outlier far from the mainland would otherwise shrink it to a fraction of the map.
  const fitOn=cfg.fitFilter?features.filter(cfg.fitFilter):features;
  const fc={type:'FeatureCollection',features:fitOn};
  const proj=cfg.proj==='albers-usa'
    ? d3.geoAlbersUsa().scale(1100).translate([W/2,H/2])
    : d3.geoMercator().fitExtent([[40,40],[W-40,H-40]],fc);
  const mainPath=d3.geoPath().projection(proj);
  const th=THEMES[theme];
  svg.append('rect').attr('width',W).attr('height',H).attr('fill',th.bg);
  const g=svg.append('g');

  // An inset draws some features (e.g. the Canary Islands, or Hawaii — positioned by hand here
  // rather than relying on geoAlbersUsa's built-in spot) with their own projection fit into a
  // chosen box, the same idea as Alaska/Hawaii next to the mainland US on a printed atlas —
  // their real coordinates would otherwise place them far off-screen or somewhere inconvenient.
  const insetLayers=(cfg.insets||[]).map(ins=>{
    const insetFeatures=features.filter(ins.match);
    if(!insetFeatures.length)return null;
    const insetProj=d3.geoMercator().fitExtent(ins.box,{type:'FeatureCollection',features:insetFeatures});
    return {box:ins.box,path:d3.geoPath().projection(insetProj),set:new Set(insetFeatures)};
  }).filter(Boolean);
  const pathFor=f=>{
    for(const layer of insetLayers)if(layer.set.has(f))return layer.path;
    return mainPath;
  };

  const hoverIn=d=>{
    const nm=d.properties[cfg.nameKey];
    if(!_regGame||_regGame.wrongNames.has(nm)||_regGame.found.has(nm)||_regGame.skippedItems.has(nm))return;
    _regPaths.filter(f=>f===d).attr('fill',th.hov);
  };
  const hoverOut=()=>_updateRegionColors();
  const click=(ev,d)=>_handleRegionClick(d);

  _regPaths=g.selectAll('.rg').data(features).enter().append('path').attr('class','rg')
    .attr('d',f=>pathFor(f)(f))
    .attr('fill',th.avail)
    .attr('stroke',th.border).attr('stroke-width',1)
    .style('vector-effect','non-scaling-stroke')
    .style('cursor','pointer')
    .on('mouseover',(ev,d)=>hoverIn(d))
    .on('mouseout',hoverOut)
    .on('click',click);

  // A thin dashed frame marks an inset as a separate little map, the same way printed atlases
  // box off Alaska/Hawaii so they aren't mistaken for their real location. An inset's real
  // content is often a small archipelago with gaps of open water between islands — hovering
  // that gap inside the frame used to do nothing, even though the frame visually promises the
  // whole box belongs to one region. `hitFeature` (when there's exactly one feature in the box)
  // adds an invisible rect covering the entire frame so the whole box is hoverable/clickable,
  // not just the pixels the actual polygon happens to cover.
  const drawInsetFrame=(x0,y0,x1,y1,hitFeature)=>{
    const pad=6;
    g.append('rect').attr('class','rg-inset-frame')
      .attr('x',x0-pad).attr('y',y0-pad).attr('width',x1-x0+pad*2).attr('height',y1-y0+pad*2)
      .attr('fill','none').attr('stroke',th.border).attr('stroke-width',1).attr('stroke-dasharray','3,3')
      .style('vector-effect','non-scaling-stroke').style('pointer-events','none');
    if(hitFeature){
      g.append('rect').attr('class','rg-inset-hit')
        .attr('x',x0-pad).attr('y',y0-pad).attr('width',x1-x0+pad*2).attr('height',y1-y0+pad*2)
        .attr('fill','transparent').style('cursor','pointer')
        .on('mouseover',()=>hoverIn(hitFeature))
        .on('mouseout',hoverOut)
        .on('click',ev=>click(ev,hitFeature));
    }
  };
  for(const layer of insetLayers){
    const [[bx0,by0],[bx1,by1]]=layer.box;
    const only=layer.set.size===1?[...layer.set][0]:null;
    drawInsetFrame(bx0,by0,bx1,by1,only);
  }
  if(cfg.insetFrameNames){
    // geoAlbersUsa positions Alaska/Hawaii itself; there's no separate projection to fit a box
    // to, so just frame wherever it actually drew them.
    for(const f of features.filter(f=>cfg.insetFrameNames.includes(f.properties[cfg.nameKey]))){
      const b=mainPath.bounds(f);
      drawInsetFrame(b[0][0],b[0][1],b[1][0],b[1][1],f);
    }
  }

  // Tiny regions (Germany's city-states Berlin/Hamburg/Bremen) are easy to miss when their real
  // shape covers only a handful of pixels next to a whole country. Area rather than
  // bounding-box size is what matters here — Hamburg's box is wide but mostly empty water,
  // while its actual land area is tiny. Give any region below this pixel-area an invisible,
  // enlarged click target — its own contour scaled up 1.4x — forwarding to the same handlers
  // as the real polygon.
  const MIN_AREA=600,HIT_SCALE=1.4;
  const tiny=cfg.tinyHit===false?[]:features.filter(f=>Math.abs(pathFor(f).area(f))<MIN_AREA);
  if(tiny.length){
    g.selectAll('.rg-hit').data(tiny).enter().append('path').attr('class','rg-hit')
      .attr('d',f=>_scaledHitPath(f,pathFor(f).projection(),HIT_SCALE))
      .attr('fill','transparent')
      .style('cursor','pointer')
      .on('mouseover',(ev,d)=>hoverIn(d))
      .on('mouseout',hoverOut)
      .on('click',click);
  }

  const zoom=d3.zoom().scaleExtent([1,8]).translateExtent([[0,0],[W,H]]).clickDistance(COARSE?10:4).on('zoom',ev=>{
    g.attr('transform',ev.transform);
  });
  svg.call(zoom);
  $('reg-map-bg').style.background=th.bg;
}

function _updateRegionColors(){
  if(!_regPaths||!_regGame)return;
  const th=THEMES[theme],cfg=_regGame.cfg;
  _regPaths.attr('fill',d=>{
    const nm=d.properties[cfg.nameKey];
    if(_regGame.wrongNames.has(nm))return th.wrong;
    if(_regGame.skippedItems.has(nm))return th.skipped||'#888';
    if(_regGame.found.has(nm))return th.found;
    return th.avail;
  });
}

function _handleRegionClick(d){
  if(!_regGame||_regGame.busy||_regGame.pos>=_regGame.total)return;
  const cfg=_regGame.cfg;
  const clickedName=d.properties[cfg.nameKey];
  if(_regGame.found.has(clickedName)||_regGame.skippedItems.has(clickedName))return;
  const target=_regGame.queue[_regGame.pos];

  if(clickedName===target.name){
    _regGame.busy=true;
    _regGame.correct++;
    if(!_regGame.wrongOnCurrent)_regGame.firstTry++;
    _regGame.found.add(clickedName);
    _regFeedback('✓ '+clickedName,THEMES[theme].found);
    _updateRegionColors();
    _updateRegionStats();
    setTimeout(()=>{_regGame.busy=false;_nextRegion();},900);
  }else{
    _regGame.wrong++;
    _regGame.wrongOnCurrent=true;
    _regFeedback('✗ '+clickedName,THEMES[theme].wrong);
    // Same one-second, independent-per-item flash as the country/lake/river/city quizzes: a
    // second wrong click on a different region must not cut this one's flash short.
    const game=_regGame;
    game.wrongNames.add(clickedName);
    _regPaths.filter(f=>f.properties[cfg.nameKey]===clickedName).attr('fill',THEMES[theme].wrong);
    const existing=game.wrongTimers.get(clickedName);
    if(existing)clearTimeout(existing);
    game.wrongTimers.set(clickedName,setTimeout(()=>{
      game.wrongNames.delete(clickedName);
      game.wrongTimers.delete(clickedName);
      if(_regGame===game)_updateRegionColors();
    },WRONG_FLASH_MS));
    _updateRegionStats();
  }
}

function _nextRegion(){
  if(!_regGame)return;
  while(_regGame.pos<_regGame.total&&_regGame.found.has(_regGame.queue[_regGame.pos].name))_regGame.pos++;
  if(_regGame.pos>=_regGame.total){_showRegionResult();return;}
  const target=_regGame.queue[_regGame.pos];
  $('reg-target-name').textContent=target.name;
  _regGame.wrongOnCurrent=false;
  _updateRegionStats();
}

function regionSkip(){
  if(!_regGame||_regGame.busy||_regGame.pos>=_regGame.total)return;
  const target=_regGame.queue[_regGame.pos];
  _regGame.busy=true;
  _regGame.skipped++;
  _regGame.found.add(target.name);
  _regGame.skippedItems.add(target.name);
  _updateRegionStats();
  if(showSkipHint){
    _regPaths.filter(f=>f.properties[_regGame.cfg.nameKey]===target.name).attr('fill','#D97706');
    _regFeedback(target.name,'#D97706');
    setTimeout(()=>{_regGame.busy=false;_updateRegionColors();_nextRegion();},1200);
  }else{
    _regGame.busy=false;
    _updateRegionColors();
    _nextRegion();
  }
}

function _updateRegionStats(){
  if(!_regGame)return;
  const g=_regGame;
  $('reg-score-disp').textContent=g.found.size+'/'+g.total;
  $('reg-stat-c').textContent=g.correct;
  $('reg-stat-w').textContent=g.wrong;
  $('reg-stat-s').textContent=g.skipped;
  $('reg-stat-r').textContent=(g.total-g.found.size)+' '+t('remLbl');
  const pct=g.total?Math.round(g.found.size/g.total*100):0;
  $('reg-prog-bar').style.width=pct+'%';
  $('reg-prog-bar').style.background=THEMES[theme].bar;
}

function _regFeedback(text,color){
  const el=$('reg-feedback');if(!el)return;
  el.textContent=text;el.style.color=color;el.style.opacity='1';
  clearTimeout(el._t);el._t=setTimeout(()=>{el.style.opacity='0';},1500);
}

// Mirrors showResult() (the plain country/lake/river/city/mountain quizzes' result screen)
// instead of the old in-place header-text swap, which left the frozen map showing underneath
// with no emoji, no best-score note and no again/menu buttons — region quizzes are the only
// mode that skipped the shared result screen every other quiz gets.
function _showRegionResult(){
  if(!_regGame)return;
  const g=_regGame;
  const pct=g.total?Math.round(g.firstTry/g.total*100):0;
  const note=resultBestNote();
  showScreen('result-screen');
  $('res-btn-back').textContent=t('back');
  $('res-emoji').textContent=pct>=90?'🏆':pct>=70?'🎉':pct>=50?'👍':'📚';
  $('res-title').textContent=t('resTitle');
  $('res-l1').textContent=t('res1')(g.firstTry,g.total,pct);
  const sk=g.skipped||0;
  $('res-l2').textContent=t('res2')(g.correct,g.wrong)+(sk>0?', '+sk+' '+t('skippedLbl'):'')+note;
  $('btn-again').textContent=t('again');
  $('btn-new').textContent=t('newgame');
  $('btn-share').textContent=t('shareBtn');
  if(typeof checkAchievements==='function')checkAchievements();
}

function regionBack(){
  _regGame=null;_regPaths=null;
  d3.select('#reg-map').selectAll('*').remove();
  _quizBackAction();
}

renderHome();updateAllText();showScreen('home-screen');
setTimeout(prewarmMap,1500); // Kartendaten und Pfade im Leerlauf vorbereiten: erster Spielstart ohne Stocken
// Neue Version erkennen: Wer die Seite lange offen lässt, spielt sonst mit altem Code. Beim Zurückkehren zum Tab (und alle 30 Minuten)
// wird app.js ungepuffert geholt und die BUILD_ID verglichen; bei Abweichung erscheint ein Hinweis zum Neuladen (nie automatisch mitten im Spiel).
let _updShown=false;
async function checkForUpdate(forceId){
  if(_updShown)return;
  try{
    let remote=forceId;
    if(!remote){const r=await fetch('app.js?v='+Date.now(),{cache:'no-store'});if(!r.ok)return;const m=/const BUILD_ID='([^']+)'/.exec((await r.text()).slice(0,400));remote=m&&m[1];}
    if(!remote||remote===BUILD_ID)return;
    _updShown=true;
    const li=Math.max(0,['de','en','es','fr'].indexOf(lang));
    const b=document.createElement('div');
    b.style.cssText='position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99998;background:#1D9E75;color:#fff;padding:10px 14px;border-radius:12px;font:14px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45);display:flex;gap:12px;align-items:center;max-width:92vw';
    b.innerHTML='<span>'+['Neue Version verfügbar','New version available','Nueva versión disponible','Nouvelle version disponible'][li]+'</span><button style="padding:6px 12px;border-radius:8px;border:0;background:#fff;color:#0b5c44;font-weight:600;cursor:pointer">'+['Neu laden','Reload','Recargar','Recharger'][li]+'</button>';
    b.querySelector('button').onclick=()=>location.reload();
    document.body.appendChild(b);
  }catch(e){}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForUpdate();});
if(typeof location!=='undefined'&&/^https?:/.test(location.protocol||''))setInterval(checkForUpdate,30*60*1000); // nur im Browser (sonst hielte der Timer die Tests am Leben)
// Leistungsprüfung (perf.js) nur auf Wunsch laden: Seite mit ?perf öffnen
if(/[?&]perf(?:[&=]|$)/.test(location.search)){const _ps=document.createElement('script');_ps.src='perf.js';document.head.appendChild(_ps);}
