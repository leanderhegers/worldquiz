const REDIRECTS=new Map();
function norm(s){return s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[łŁ]/g,'l').replace(/[đĐ]/g,'d').replace(/[øØ]/g,'o').replace(/[æÆ]/g,'ae').toLowerCase();}

// Zoom presets per continent [x, y, scale] — pixel coords tuned in the Natural-Earth projection
const ZOOMS={world:[480,250,1],EU:[520,160,3.5],AF:[510,280,2.2],AS:[680,200,2],NA:[220,190,2.2],SA:[310,350,2.2],OC:[810,370,2.8]};
const MAP_W=960,MAP_H=500;
// Central projection builder — switches between Natural Earth and Mercator, same interface for everything
function buildProjection(){
  if(projection==='mercator'){
    const proj=d3.geoMercator().scale(152.8).translate([MAP_W/2,MAP_H/2]).rotate([-8,0]);
    const topY=proj([0,83.5])[1]; // Oberkante ~Nordspitze Grönland
    return proj.clipExtent([[-80,topY],[MAP_W+80,MAP_H+260]]);
  }
  return d3.geoNaturalEarth1().scale(153).translate([MAP_W/2,MAP_H/2]).rotate([-8,0]);
}
// Convert a pixel preset (tuned in Natural Earth) to lon/lat so it works in any projection
function zoomForMode(mode){
  const z=ZOOMS[mode]||ZOOMS.world;
  const ne=d3.geoNaturalEarth1().scale(153).translate([MAP_W/2,MAP_H/2]).rotate([-8,0]);
  const ll=ne.invert([z[0],z[1]]);
  return {lon:ll[0],lat:ll[1],k:z[2]};
}
function zoomToGeo(lon,lat,k){if(!currentProj)return;const p=currentProj([lon,lat]);if(p)zoomTo(p[0],p[1],k);}

const THEMES={atlas:{bg:'#3a80b8',sph:'#4a90cc',grd:'#2a70a8',avail:'#e0d4b4',found:'#4a8a30',dim:'#a8c4d8',hov:'#ccc0a0',wrong:'#c03820',skipped:'#d97c1a',bar:'#4a8a30',dot:'rgba(0,0,0,0.85)',border:'#205090'},neon:{bg:'#0a0420',sph:'#0e0838',grd:'#2a1550',avail:'#4a2a6a',found:'#05d9e8',dim:'#1a0e30',hov:'#ff2a6d',wrong:'#ff1f4f',skipped:'#ff8a00',bar:'#05d9e8',dot:'rgba(5,217,232,0.9)',border:'#c030e0'},terrain:{bg:'#2878a8',sph:'#3088b8',grd:'#1e6898',avail:'#6a9a58',found:'#2e7d20',dim:'#8ab0c8',hov:'#e8dca0',wrong:'#c03820',skipped:'#d97c1a',bar:'#2e7d20',dot:'rgba(0,0,0,0.85)',border:'#1a5a30'}};
const CONT_KEYS=['EU','AF','AS','NA','SA','OC'];
const THEME_DOT={atlas:'#b0a080',neon:'#ff2a6d',terrain:'#6a9a58'};
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
const MODES={world:{de:'Alle Länder',en:'All Countries',cnt:_cc('world')},EU:{de:'Europa',en:'Europe',cnt:_cc('EU')},AF:{de:'Afrika',en:'Africa',cnt:_cc('AF')},AS:{de:'Asien',en:'Asia',cnt:_cc('AS')},NA:{de:'Nordamerika',en:'N. America',cnt:_cc('NA')},SA:{de:'Südamerika',en:'S. America',cnt:_cc('SA')},OC:{de:'Ozeanien',en:'Oceania',cnt:_cc('OC')},custom:{de:'Eigener Modus',en:'Custom Mode',cnt:'⚙'}};
const TX={
  de:{title:'Weltkarte Quiz',sub:'Ein Ländername erscheint — finde und klicke es auf der Karte.',find:'Finde dieses Land',findLake:'Finde diesen See',findRiver:'Finde diesen Fluss',findCity:'Finde diese Stadt',cityQuiz:'Städte-Quiz',citySub:'Ein Stadtname erscheint — finde und klicke sie auf der Karte.',cities:'Städte',cityDiffs:[{key:'easy',label:'Einfach'},{key:'medium',label:'Mittel'},{key:'hard',label:'Schwer'}],cityCountries:[{key:'DE',label:'Deutschland'},{key:'US',label:'USA'},{key:'FR',label:'Frankreich'},{key:'CN',label:'China'},{key:'JP',label:'Japan'},{key:'IN',label:'Indien'},{key:'BR',label:'Brasilien'},{key:'AU',label:'Australien'},{key:'MX',label:'Mexiko'}],pinQuiz:'Drop a Pin',pinSub:'Eine Stadt erscheint — setze die Stecknadel möglichst nah an ihren Standort.',findPin:'Wo liegt diese Stadt?',pinEuLabel:'Europa',pointsLbl:'Punkte',roundsLbl:'Runden',avgLbl:'Ø Distanz',pinFb:(km,pts)=>'📍 '+km+' km · +'+pts+' P',lakeQuiz:'Seen-Quiz',lakeSub:'Ein See erscheint — finde und klicke ihn auf der Karte.',lakeDiffs:[{key:'beginner',label:'Anfänger',count:13},{key:'easy',label:'Einfach',count:44},{key:'medium',label:'Mittel',count:76},{key:'hard',label:'Schwer',count:144},{key:'extreme',label:'Extrem',count:321}],lakes:'Seen',riverQuiz:'Fluss-Quiz',riverSub:'Ein Flussname erscheint — finde und klicke ihn auf der Karte.',riverDiffs:[{key:'beginner',label:'Anfänger',count:13},{key:'easy',label:'Einfach',count:44},{key:'medium',label:'Mittel',count:76},{key:'hard',label:'Schwer',count:144},{key:'extreme',label:'Extrem',count:214}],rivers:'Flüsse',flagQuiz:'Flaggen Quiz',flagSub:'Eine Flagge erscheint — tippe den Ländernamen ein.',flagPlaceholder:'Land eingeben …',flagWorld:'Weltweit',flagDiffs:[{key:'beginner',label:'Anfänger'},{key:'easy',label:'Einfach'},{key:'medium',label:'Mittel'},{key:'hard',label:'Schwer'}],homeTitle:'Geografie-Spiele',homeSub:'Teste dein Wissen über die Welt — Länder, Seen, Flüsse und Flaggen.',playBtn:'Spielen',optionsLbl:'Optionen',homeBtn:'← Start',scrollHint:'Scrollen für mehr',mapQuiz:'Weltkarte',load:'Karte wird geladen …',back:'← Menü',foundLbl:'gefunden',correctLbl:'richtig',wrongLbl:'falsch',remLbl:'verbleibend',resTitle:'Quiz abgeschlossen!',again:'Nochmal spielen',newgame:'Zurück zur Auswahl',langLbl:'Sprache',themeLbl:'Design',projLbl:'Kartenansicht',projStd:'Natural Earth',projMerc:'Mercator',foundModeLabel:'Richtig geraten',keepOn:'Grün markiert',keepOff:'Ausgeblendet',wrongHintLabel:'Hinweise bei Fehlern',wrongHintTip:'Nach einer falschen Antwort wird das richtige Ziel kurz angezeigt.',wrongHintOn:'Anzeigen',wrongHintOff:'Ausblenden',skipHintLabel:'Hinweise beim Überspringen',skipHintTip:'Zeigt nach dem Überspringen das übersprungene Ziel kurz an.',skipHintOn:'Anzeigen',skipHintOff:'Ausblenden',countries:'Länder',zoomTip:'Zoom & Pan möglich',skipLbl:'Überspringen',skippedLbl:'übersprungen',correctFb:n=>'✓ Richtig! '+n,wrongFb:n=>'✗ Das war '+n,res1:(a,b,c)=>`${a} von ${b} beim 1. Versuch (${c} %)`,res2:(a,b)=>`${a} richtig, ${b} daneben`,themes:{atlas:'Atlas',neon:'Cyberpunk',terrain:'Terrain'},cback:'← Zurück',ctitle:'Eigener Modus',clblCont:'Kontinente',clblCount:'Anzahl Länder',clblOf:'verfügbar',clblAll:'Alle Länder',clblCountries:'Länder wählen',cbtnAll:'Alle',cbtnNone:'Keine',cbtnStart:'Starten',signIn:'Anmelden',signUp:'Registrieren',signOut:'Abmelden',loginTitle:'Anmelden',registerTitle:'Konto erstellen',authEmail:'E-Mail',authPw:'Passwort',authName:'Anzeigename (optional)',loggedIn:'Angemeldet als',toRegister:'Noch kein Konto? Registrieren',toLogin:'Bereits ein Konto? Anmelden',authFillAll:'Bitte E-Mail und Passwort eingeben.',authNotConfigured:'Firebase ist noch nicht konfiguriert.',authErrEmail:'Ungültige E-Mail-Adresse.',authErrInUse:'Diese E-Mail wird bereits verwendet.',authErrWeak:'Passwort zu schwach (min. 6 Zeichen).',authErrCred:'E-Mail oder Passwort falsch.',authErrGeneric:'Etwas ist schiefgelaufen. Bitte erneut versuchen.',authUsername:'Benutzername',showPw:'Passwort anzeigen',forgotPw:'Passwort vergessen?',resetSent:'E-Mail zum Zurücksetzen wurde gesendet.',enterEmailFirst:'Bitte zuerst deine E-Mail eingeben.',authUserRequired:'Bitte einen Benutzernamen wählen.',authUserInvalid:'3–20 Zeichen: Buchstaben, Zahlen, _',authUserTaken:'Benutzername bereits vergeben.',googleBtn:'Mit Google anmelden',orSep:'oder',newRecord:'Neuer Rekord!',bestLabel:'Bestwert',roundLimitLbl:'Anzahl Ziele',allTargetsLbl:'Alle Ziele',normalMode:'Normaler Modus',learnModeLbl:'Lernmodus',learnModeLogin:'Anmelden für Lernmodus',learnModeDesc:'Häufig falsch gemachte Fragen kommen zuerst. Themen, die du bereits 3× gemeistert hast, werden ausgeblendet.',learnModeCta:'→ Klicken zum Anmelden',inputQuiz:'Errate das Land',inputSub:'Flagge, Hauptstadt oder Umriss — tippe den richtigen Namen ein.',flagCardSub:'Welche Flagge ist das?',capitalQuiz:'Hauptstadt-Quiz',capitalCardSub:'Land ↔ Hauptstadt',outlineQuiz:'Umriss-Quiz',outlineCardSub:'Erkenne die Landesform',cfgRegion:'Region',cfgDiff:'Schwierigkeit',cfgDir:'Richtung',cfgStart:'Quiz starten',dirC2Cap:'Land → Hauptstadt',dirCap2C:'Hauptstadt → Land',diffAll:'Alle',regWorld:'Welt',iqAskCapital:'Wie heißt die Hauptstadt?',iqAskCountry:'Welches Land?',capPlaceholder:'Hauptstadt eingeben …',cfgDropdownLabel:'Vorschläge',cfgDropdownOn:'Anzeigen',cfgDropdownOff:'Ausblenden',cfgSkipHintLabel:'Hinweis beim Überspringen',cfgSkipHintOn:'Anzeigen',cfgSkipHintOff:'Ausblenden',regionQuiz:'Regionen',regionSub:'Ein Regionsname erscheint — finde und klicke sie auf der Karte.',findRegion:'Finde diese Region',regions:'Regionen'},
  en:{title:'World Map Quiz',sub:'A country name appears — find and click it on the map.',find:'Find this country',findLake:'Find this lake',findRiver:'Find this river',findCity:'Find this city',cityQuiz:'City Quiz',citySub:'A city name appears — find and click it on the map.',cities:'Cities',cityDiffs:[{key:'easy',label:'Easy'},{key:'medium',label:'Medium'},{key:'hard',label:'Hard'}],cityCountries:[{key:'DE',label:'Germany'},{key:'US',label:'USA'},{key:'FR',label:'France'},{key:'CN',label:'China'},{key:'JP',label:'Japan'},{key:'IN',label:'India'},{key:'BR',label:'Brazil'},{key:'AU',label:'Australia'},{key:'MX',label:'Mexico'}],pinQuiz:'Drop a Pin',pinSub:'A city appears — drop the pin as close to its location as you can.',findPin:'Where is this city?',pinEuLabel:'Europe',pointsLbl:'Points',roundsLbl:'Rounds',avgLbl:'Avg distance',pinFb:(km,pts)=>'📍 '+km+' km · +'+pts+' P',lakeQuiz:'Lake Quiz',lakeSub:'A lake name appears — find and click it on the map.',lakeDiffs:[{key:'beginner',label:'Beginner',count:13},{key:'easy',label:'Easy',count:44},{key:'medium',label:'Medium',count:76},{key:'hard',label:'Hard',count:144},{key:'extreme',label:'Extreme',count:321}],lakes:'Lakes',riverQuiz:'River Quiz',riverSub:'A river name appears — find and click it on the map.',riverDiffs:[{key:'beginner',label:'Beginner',count:13},{key:'easy',label:'Easy',count:44},{key:'medium',label:'Medium',count:76},{key:'hard',label:'Hard',count:144},{key:'extreme',label:'Extreme',count:214}],rivers:'Rivers',flagQuiz:'Flag Quiz',flagSub:'A flag appears — type the country name.',flagPlaceholder:'Enter country …',flagWorld:'Worldwide',flagDiffs:[{key:'beginner',label:'Beginner'},{key:'easy',label:'Easy'},{key:'medium',label:'Medium'},{key:'hard',label:'Hard'}],homeTitle:'World Geography Games',homeSub:'Test your knowledge of the world — countries, lakes, rivers and flags.',playBtn:'Play',optionsLbl:'Options',homeBtn:'← Home',scrollHint:'Scroll for more',mapQuiz:'World Map',load:'Loading map …',back:'← Menu',foundLbl:'found',correctLbl:'correct',wrongLbl:'wrong',remLbl:'remaining',resTitle:'Quiz complete!',again:'Play again',newgame:'Back to selection',langLbl:'Language',themeLbl:'Theme',projLbl:'Map view',projStd:'Natural Earth',projMerc:'Mercator',foundModeLabel:'Correct answers',keepOn:'Stay green',keepOff:'Fade out',wrongHintLabel:'Hints on errors',wrongHintTip:'After a wrong answer, the correct country is briefly revealed.',wrongHintOn:'Show',wrongHintOff:'Hide',skipHintLabel:'Skip hints',skipHintTip:'Shows the skipped target briefly after skipping.',skipHintOn:'Show',skipHintOff:'Hide',countries:'countries',zoomTip:'Zoom & pan supported',skipLbl:'Skip',skippedLbl:'skipped',correctFb:n=>'✓ Correct! '+n,wrongFb:n=>'That was '+n,res1:(a,b,c)=>`${a} of ${b} on first try (${c}%)`,res2:(a,b)=>`${a} correct, ${b} missed`,themes:{atlas:'Atlas',neon:'Cyberpunk',terrain:'Terrain'},cback:'← Back',ctitle:'Custom Mode',clblCont:'Continents',clblCount:'Number of countries',clblOf:'available',clblAll:'All countries',clblCountries:'Select countries',cbtnAll:'All',cbtnNone:'None',cbtnStart:'Start',signIn:'Sign in',signUp:'Sign up',signOut:'Sign out',loginTitle:'Sign in',registerTitle:'Create account',authEmail:'Email',authPw:'Password',authName:'Display name (optional)',loggedIn:'Signed in as',toRegister:"No account? Sign up",toLogin:'Already have an account? Sign in',authFillAll:'Please enter email and password.',authNotConfigured:'Firebase is not configured yet.',authErrEmail:'Invalid email address.',authErrInUse:'This email is already in use.',authErrWeak:'Password too weak (min. 6 characters).',authErrCred:'Wrong email or password.',authErrGeneric:'Something went wrong. Please try again.',authUsername:'Username',showPw:'Show password',forgotPw:'Forgot password?',resetSent:'Password reset email sent.',enterEmailFirst:'Please enter your email first.',authUserRequired:'Please choose a username.',authUserInvalid:'3–20 chars: letters, numbers, _',authUserTaken:'Username already taken.',googleBtn:'Sign in with Google',orSep:'or',newRecord:'New record!',bestLabel:'Best',roundLimitLbl:'Round limit',allTargetsLbl:'All targets',normalMode:'Normal Mode',learnModeLbl:'Learn Mode',learnModeLogin:'Sign in for Learn Mode',learnModeDesc:'Frequent mistakes appear first. Topics you\'ve mastered 3× are hidden.',learnModeCta:'→ Click to sign in',inputQuiz:'Name the country',inputSub:'Flag, capital or outline — type the right name.',flagCardSub:'Which flag is this?',capitalQuiz:'Capital Quiz',capitalCardSub:'Country ↔ capital',outlineQuiz:'Outline Quiz',outlineCardSub:'Recognise the shape',cfgRegion:'Region',cfgDiff:'Difficulty',cfgDir:'Direction',cfgStart:'Start quiz',dirC2Cap:'Country → capital',dirCap2C:'Capital → country',diffAll:'All',regWorld:'World',iqAskCapital:'What is the capital?',iqAskCountry:'Which country?',capPlaceholder:'Enter capital …',cfgDropdownLabel:'Suggestions',cfgDropdownOn:'Show',cfgDropdownOff:'Hide',cfgSkipHintLabel:'Hint on skip',cfgSkipHintOn:'Show',cfgSkipHintOff:'Hide',regionQuiz:'Regions',regionSub:'A region name appears — find and click it on the map.',findRegion:'Find this region',regions:'Regions'}
};

let lang='de',theme='atlas',keepFound=true,showWrongHint=true,showSkipHint=true,showDropdown=true,projection='mercator',game={},quizRoundLimit=10,learnMode=false,allTargets=false;
let countryPaths=null,microstateDots=null,lakePaths=null,lakeDots=null,riverPaths=null,riverHitboxes=null,cityDots=null,worldData=null,borderPath=null,zoomBehavior=null,gGroup=null,islandZoneHits=null,islandZoneVisuals=null,zoneHulls=null;
let visibleIds=new Set(),lastMode='world',canClick=true,optsOpen=false,wrongFlash=null,_fbTimer=null;
let currentProj=null,pinLayer=null;
let currentLOD='50m',_lodLoading=false,_lodWorldData10m=null;

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

function t(k){return TX[lang][k]||TX.de[k]||k;}
function cn(id){return C[id]?(C[id][lang]||C[id].de):'?';}
function $(id){return document.getElementById(id);}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function eff(id){return REDIRECTS.get(id)??id;}
function activeConts(){return game.activeContinents||null;}

const SCREENS=['home-screen','mode-screen','game-screen','result-screen','custom-screen','flag-screen','inputcfg-screen','region-screen'];
function showScreen(id){SCREENS.forEach(s=>{const el=$(s);if(el)el.style.display=s===id?(s==='game-screen'||s==='flag-screen'||s==='home-screen'||s==='region-screen'?'flex':'block'):'none';});}
function goHome(){showScreen('home-screen');renderHome();}
function goToGames(section){if(typeof triggerStreakOnPlay==='function')triggerStreakOnPlay();showScreen('mode-screen');renderModeScreen();const el=$('mode-screen');if(!el)return;const sec=section||0;const apply=()=>{const prev=el.style.scrollBehavior;el.style.scrollBehavior='auto';el.scrollTo(0,sec*el.clientHeight);el.style.scrollBehavior=prev;updateSectionNav();};requestAnimationFrame(apply);setTimeout(apply,60);}

function og(label,inner){return `<div class="opt-group"><div class="opt-label">${label}</div><div class="opt-row">${inner}</div></div>`;}
function langGroup(){return og(t('langLbl'),
  `<button class="lb lb-flag${lang==='de'?' active':''}" onclick="setLang('de')"><img class="lbflag" src="https://flagcdn.com/h20/de.png" alt="">Deutsch</button>`+
  `<button class="lb lb-flag${lang==='en'?' active':''}" onclick="setLang('en')"><img class="lbflag" src="https://flagcdn.com/h20/gb.png" alt="">English</button>`);}
function themeGroup(){return og(t('themeLbl'),
  ['atlas','neon','terrain'].map(k=>`<button class="tp${theme===k?' active':''}" onclick="setTheme('${k}')"><span class="dot" style="background:${THEME_DOT[k]};"></span><span>${t('themes')[k]}</span></button>`).join(''));}
const MERC_ICON=`<svg width="21" height="14" viewBox="0 0 21 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:4px;flex-shrink:0"><rect x="1" y="1" width="19" height="12" rx="0" stroke="currentColor" stroke-width="1.3"/><line x1="1" y1="4.7" x2="20" y2="4.7" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><line x1="1" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><line x1="1" y1="9.3" x2="20" y2="9.3" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><line x1="14" y1="1" x2="14" y2="13" stroke="currentColor" stroke-width="0.6" opacity="0.55"/></svg>`;
const NE_ICON=`<svg width="21" height="14" viewBox="0 0 21 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:4px;flex-shrink:0"><path d="M4.5,1.5 Q10.5,0.7 16.5,1.5 Q20,3.8 20,7 Q20,10.2 16.5,12.5 Q10.5,13.3 4.5,12.5 Q1,10.2 1,7 Q1,3.8 4.5,1.5Z" stroke="currentColor" stroke-width="1.3"/><line x1="2.2" y1="4.7" x2="18.8" y2="4.7" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><line x1="1" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><line x1="2.2" y1="9.3" x2="18.8" y2="9.3" stroke="currentColor" stroke-width="0.6" opacity="0.55"/><path d="M7.5,1.2 Q6.2,7 7.5,12.8" stroke="currentColor" stroke-width="0.6" opacity="0.55" fill="none"/><path d="M13.5,1.2 Q14.8,7 13.5,12.8" stroke="currentColor" stroke-width="0.6" opacity="0.55" fill="none"/></svg>`;
function projGroup(){return og(t('projLbl'),
  `<button class="lb lb-flag${projection==='mercator'?' active':''}" onclick="setProjection('mercator')">${MERC_ICON}${t('projMerc')}</button>`+
  `<button class="lb lb-flag${projection==='natural'?' active':''}" onclick="setProjection('natural')">${NE_ICON}${t('projStd')}</button>`);}
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
// Home-Overlay: globale Voreinstellungen · In-Game: Gameplay-Schalter
function roundLimitGroup(){
  return og(t('roundLimitLbl'),
    `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">` +
    `<input type="number" class="gs-round-input" min="1" max="9999" value="${quizRoundLimit}" ${allTargets?'disabled':''} oninput="setQuizRoundLimit(Math.max(1,+this.value)||10)" style="${allTargets?'opacity:.35;pointer-events:none':''}">` +
    `<span style="font-size:12px;opacity:.55;${allTargets?'opacity:.3':''}">${lang==='de'?'pro Quiz':'per quiz'}</span>` +
    `<label class="all-targets-lbl"><input type="checkbox" ${allTargets?'checked':''} onchange="setAllTargets(this.checked)"> ${t('allTargetsLbl')}</label>` +
    `</div>`
  );
}
function optHomeHTML(){return langGroup()+projGroup()+wrongHintGroup()+skipHintGroup()+roundLimitGroup();}
function optGameHTML(){return themeGroup()+keepFoundGroup();}
function renderOptions(){const h=$('home-opts-content');if(h)h.innerHTML=optHomeHTML();const g=$('opts-content');if(g)g.innerHTML=optGameHTML();}
function openHomeOpts(){setTxt('home-opts-title',t('optionsLbl'));renderOptions();const m=$('home-opts-modal');if(m)m.style.display='flex';}
function closeHomeOpts(){const m=$('home-opts-modal');if(m)m.style.display='none';}

function setLang(l){lang=l;updateAllText();renderOptions();if($('custom-screen').style.display!=='none')renderCustom();persistSettings();}
function setTheme(v){theme=v;applyTheme();renderOptions();persistSettings();}
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
    else if(game.pinMode){const z=cityZoom(game.pinCities);if(z)zoomTo(z[0],z[1],z[2]);}
    else if(game.lakeMode||game.riverMode||game.mode==='custom'){/* Weltansicht beibehalten */}
    else if(game.mode){const g=zoomForMode(game.mode);zoomToGeo(g.lon,g.lat,g.k);}
  }
}
function persistSettings(){if(typeof saveSettings==='function')saveSettings();}

// ── SETTINGS / SCORE BRIDGE (used by auth.js data layer) ──
function gatherSettings(){return {lang,theme,keepFound,showWrongHint,showSkipHint,showDropdown,projection,learnMode,allTargets,quizRoundLimit,customConts:[...customConts]};}
function applyRemoteSettings(s){
  if(!s)return;
  if(s.lang==='de'||s.lang==='en')lang=s.lang;
  if(s.theme&&THEMES[s.theme])theme=s.theme;
  if(typeof s.keepFound==='boolean')keepFound=s.keepFound;
  if(typeof s.showWrongHint==='boolean')showWrongHint=s.showWrongHint;
  if(typeof s.showSkipHint==='boolean')showSkipHint=s.showSkipHint;
  if(typeof s.showDropdown==='boolean')showDropdown=s.showDropdown;
  if(s.projection==='mercator'||s.projection==='natural')projection=s.projection;
  if(typeof s.learnMode==='boolean')learnMode=s.learnMode;
  if(typeof s.allTargets==='boolean')allTargets=s.allTargets;
  if(typeof s.quizRoundLimit==='number'&&s.quizRoundLimit>=1)quizRoundLimit=s.quizRoundLimit;
  if(Array.isArray(s.customConts)&&s.customConts.length>0){
    const valid=new Set(['EU','AF','AS','NA','SA','OC']);
    const filtered=s.customConts.filter(k=>valid.has(k));
    if(filtered.length>0)customConts=new Set(filtered);
  }
  updateAllText();applyTheme();renderOptions();
}
function refreshScoresUI(){if($('mode-screen')&&$('mode-screen').style.display!=='none')renderModeScreen();}
function gameScoreKey(){
  if(!game)return null;
  if(game.flagMode)return game.iqCfg?iqScoreKey(game.iqCfg):null;
  if(game.pinMode)return 'pin:'+(game.difficulty||'EU');
  if(game.cityMode)return 'city:'+game.difficulty;
  if(game.riverMode)return 'river:'+game.difficulty;
  if(game.lakeMode)return 'lake:'+game.difficulty;
  if(game.mode&&game.mode!=='custom')return 'map:'+game.mode;
  return null;
}
function gameScoreValue(){
  if(game.flagMode)return {score:game.flagCorrect||0,total:game.flagTotal||0};
  if(game.pinMode){const isCont=['EU','AF','AS','NA','SA','OC','world'].includes(game.pinRegion);return {score:game.pinScore||0,total:(game.total||0)*(isCont?1050:1000)};}
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
function applyTheme(){const h=THEMES[theme];$('map-bg').style.background=h.bg;$('prog-bar').style.background=h.bar;d3.select('#map rect.ocean').attr('fill',h.bg);d3.select('#map path.sphere').attr('fill',h.sph).attr('stroke',h.grd);d3.select('#map path.grat').attr('stroke',h.grd);if(borderPath)borderPath.attr('stroke',h.border);d3.select('#map path.coastline').attr('stroke',h.border);d3.select('#map g.lakes').selectAll('path').attr('fill',h.sph).attr('stroke',h.border);updateColors();}
function toggleOpts(){optsOpen=!optsOpen;$('opts-panel').style.display=optsOpen?'block':'none';}

function setTxt(id,v){const e=$(id);if(e)e.textContent=v;}
function renderHome(){
  setTxt('home-title',t('homeTitle'));setTxt('home-sub',t('homeSub'));
  setTxt('home-play',t('playBtn'));setTxt('home-options-btn','⚙ '+t('optionsLbl'));
  setTxt('home-opts-title',t('optionsLbl'));
  renderOptions();
  if(typeof renderAuthUI==='function')renderAuthUI(window._authUser||null);
  if(typeof renderAuthForm==='function'&&$('auth-modal')&&$('auth-modal').style.display!=='none')renderAuthForm();
}
function updateAllText(){
  renderHome();
  if($('mode-screen').style.display!=='none')renderModeScreen();
  setTxt('btn-back',t('back'));setTxt('find-label',game.riverMode?t('findRiver'):game.lakeMode?t('findLake'):game.cityMode?t('findCity'):game.pinMode?t('findPin'):t('find'));setTxt('found-label',t('foundLbl'));setTxt('lbl-c',t('correctLbl'));setTxt('lbl-w',t('wrongLbl'));setTxt('btn-skip',t('skipLbl'));setTxt('res-title',t('resTitle'));setTxt('btn-again',t('again'));setTxt('btn-new',t('newgame'));setTxt('opts-title',t('optionsLbl'));setTxt('flag-btn-back',t('back'));setTxt('flag-lbl-c',t('correctLbl'));setTxt('flag-lbl-w',t('wrongLbl'));
  if(game.current&&C[game.current])$('target-name').textContent=cn(game.current);updateStats();
  if(typeof _renderDsContent==='function'&&$('datenschutz-modal')&&$('datenschutz-modal').style.display!=='none')_renderDsContent();
}

const SECTIONS=['map','region','flag','pin','city','river','lake'];
function gsCard(onclick,title,sub,key){
  let badge='';
  if(key&&typeof bestScore==='function'){const b=bestScore(key);if(b)badge='<span class="gs-card-best">★ '+b.pct+'%</span>';}
  return `<button class="gs-card" onclick="${onclick}"><span class="gs-card-t">${title}</span><span class="gs-card-s">${sub}</span>${badge}</button>`;
}
function sectionInner(key){
  if(key==='map'){
    const ms=['world','EU','AF','AS','NA','SA','OC','custom'];
    return ms.map(m=>gsCard(m==='custom'?'openCustom()':"startGame('"+m+"')",MODES[m][lang],m==='custom'?'⚙':MODES[m].cnt+' '+t('countries'),m==='custom'?null:'map:'+m)).join('');
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
    return world+conts.join('')+'<div style="grid-column:1/-1;height:1px;background:rgba(226,90,90,.2);margin:.5rem 0;"></div>'+countries.join('');
  }
  if(key==='flag'){
    return INPUT_QUIZZES.map(q=>gsCard("openInputCfg('"+q.type+"')",t(q.titleKey),t(q.subKey),null)).join('');
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
  flag:{icon:'✏️',head:()=>t('inputQuiz'),sub:()=>t('inputSub')}
};
const INPUT_QUIZZES=[
  {type:'flag',titleKey:'flagQuiz',subKey:'flagCardSub'},
  {type:'capital',titleKey:'capitalQuiz',subKey:'capitalCardSub'},
  {type:'outline',titleKey:'outlineQuiz',subKey:'outlineCardSub'}
];
function renderModeScreen(){
  const nav=SECTIONS.map((k,i)=>`<button class="gs-dot" data-sec="${i}" onclick="scrollToSection(${i})" title="${SECTION_META[k].head()}"></button>`).join('');
  const sections=SECTIONS.map((k,i)=>{
    const m=SECTION_META[k];
    return `<section class="game-section gs-${k}" data-idx="${i}">
      <div class="gs-bg gs-bg-${k}"></div>
      <div class="gs-content">
        <div class="gs-icon">${m.icon}</div>
        <h2 class="gs-head">${m.head()}</h2>
        <p class="gs-sub">${m.sub()}</p>
        <div class="gs-grid gs-grid-${k}">${sectionInner(k)}</div>
      </div>
      ${i<SECTIONS.length-1?`<div class="gs-scroll-hint">${t('scrollHint')} ↓</div>`:''}
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
      <button class="gs-home-btn" onclick="goHome()">${t('homeBtn')}</button>
      ${modeToggle}
      ${rightBtns}
    </div>
    <div class="gs-nav">${nav}</div>
    ${sections}`;
  const sc=$('mode-screen');
  sc.onscroll=updateSectionNav;
  updateSectionNav();
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
  const next=e.key==='ArrowDown'?Math.min(idx+1,SECTIONS.length-1):Math.max(idx-1,0);
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
    game.queue=game.queue.filter(id=>(visibleIds.has(id)||MS_IDS.has(id))&&C[id]);
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
  game.queue=learnSortIds(game.queue.filter(id=>(visibleIds.has(id)||MS_IDS.has(id))&&C[id]),'country:').slice(0,allTargets?Infinity:quizRoundLimit);
  game.total=game.queue.length;
  const g=zoomForMode(mode);
  zoomToGeo(g.lon,g.lat,g.k);
  nextCountry();
}
function restart(){if(game.flagMode)startInputQuiz(game.iqCfg||{type:'flag',region:'world',diff:'all',dir:'c2cap'});else if(game.riverMode)startRiverGame(game.difficulty);else if(game.lakeMode)startLakeGame(game.difficulty);else if(game.cityMode)startCityGame(game.difficulty);else if(game.pinMode)startPinGame(game.pinRegion||game.difficulty);else if(lastMode==='custom')startCustom();else startGame(lastMode);}
function back(){const key=game.flagMode?'flag':game.pinMode?'pin':game.cityMode?'city':game.riverMode?'river':game.lakeMode?'lake':'map';const sec=Math.max(0,SECTIONS.indexOf(key));game={};goToGames(sec);}
function setQuizRoundLimit(v){quizRoundLimit=Math.max(1,Math.min(9999,parseInt(v)||10));document.querySelectorAll('.gs-round-input').forEach(el=>{el.value=quizRoundLimit;});persistSettings();}
function setAllTargets(v){allTargets=v;renderOptions();persistSettings();}
function setLearnMode(v){if(v&&!window._authUser)return;learnMode=v;const sc=$('mode-screen');const st=sc?sc.scrollTop:0;renderModeScreen();if(sc)sc.scrollTop=st;persistSettings();}
function toggleLearnTooltip(e){e.stopPropagation();if(!('ontouchstart' in window))return;const wrap=e.currentTarget.closest('.gs-mode-tooltip-wrap');if(!wrap)return;wrap.classList.toggle('show');}

// Lernmodus-Sortierung: häufig falsch vorne, 1-3× richtig hinten, >3× richtig ausgeblendet
function learnSortIds(ids,prefix){
  if(!learnMode||typeof getMisses!=='function')return shuffle([...ids]);
  const misses=getMisses(),corrects=typeof getCorrects==='function'?getCorrects():{};
  const filtered=ids.filter(id=>(corrects[prefix+id]||0)<=3);
  const front=filtered.filter(id=>!(corrects[prefix+id])&&misses[prefix+id])
    .sort((a,b)=>(misses[prefix+b]||0)-(misses[prefix+a]||0));
  const mid=shuffle(filtered.filter(id=>!(corrects[prefix+id])&&!(misses[prefix+id])));
  const end=filtered.filter(id=>(corrects[prefix+id]||0)>=1);
  return[...front,...mid,...end];
}
function learnSortIdx(indices,features,displayFn,prefix){
  if(!learnMode||typeof getMisses!=='function')return shuffle([...indices]);
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
  else if(game.current)k='country:'+game.current;
  if(k)recordCorrect(k);
  if(typeof checkAchievements==='function')checkAchievements();
}
function skip(){if(!canClick||!game||game.current===null||game.current===undefined)return;game.skipped=(game.skipped||0)+1;if(!game.skippedItems)game.skippedItems=new Set();game.skippedItems.add(game.current);clearFeedback();if(showSkipHint)updateColors();updateStats();nextCountry();}

function lakeDisplayName(feat){const p=feat.properties;return(lang==='de'?p.name_de:p.name_en)||p.name||'?';}
const BEGINNER_LAKES=new Set(['Lake Baikal','Lake Victoria','Lake Superior','Lake Huron','Lake Michigan','Lake Erie','Lake Ontario','Lago Titicaca','Lake Tanganyika','Dead Sea','Lake Geneva','Bodensee','Lake Balaton']);
function getLakeFeatures(diff){
  if(!lakesData)return[];
  const named=lakesData.features.filter(f=>f.properties.name);
  if(diff==='beginner')return named.filter(f=>BEGINNER_LAKES.has(f.properties.name));
  const maxZoom={easy:2,medium:3,hard:4,extreme:99};
  return named.filter(f=>f.properties.min_zoom<=(maxZoom[diff]??99));
}
function getLakeColor(idx){
  const th=THEMES[theme];
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

function riverDisplayName(feat){const p=feat.properties;return(lang==='de'?p.name_de:p.name_en)||p.name||'?';}
function getRiverFeatures(diff){
  if(!riversData)return[];
  const named=riversData.features.filter(f=>f.properties.name&&f.properties.featurecla!=='Lake Centerline');
  const counts={beginner:13,easy:44,medium:76,hard:144,extreme:214};
  const n=counts[diff]??named.length;
  const sorted=named.slice().sort((a,b)=>(a.properties.scalerank||99)-(b.properties.scalerank||99));
  return sorted.slice(0,n);
}
function getRiverColor(idx){const th=THEMES[theme];if(game.found&&game.found.has(idx))return th.found;return th.sph;}
function updateRiverColors(){if(!riverPaths)return;riverPaths.attr('stroke',d=>getRiverColor(d._i));}

// ── CITY QUIZ ──
function cityDisplayName(c){return(lang==='de'?c.name_de:c.name_en)||c.name_de||'?';}
function getCityColor(idx){const th=THEMES[theme];
  if(game.skippedItems&&game.skippedItems.has(idx))return th.skipped;
  if(game.found&&game.found.has(idx))return th.found;
  return th.border;}
function updateCityColors(){if(!cityDots)return;const th=THEMES[theme];cityDots.attr('fill',d=>getCityColor(d._i)).attr('stroke',th.avail);}
function cityZoom(cities){
  if(!cities||!cities.length)return null;
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
  const cityQueue=learnSortIdx(cities.map((_,i)=>i),cities,cityDisplayName,'city:').slice(0,allTargets?Infinity:quizRoundLimit);
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
  if(!canClick||!game||game.current===null||game.current===undefined)return;
  if(game.skippedItems&&game.skippedItems.has(idx))return;
  if(game.found.has(idx))return;
  const name=cityDisplayName(game.cityFeatures[idx]);
  if(idx===game.current){
    canClick=false;game.correct++;
    if(!game.wrongOnCurrent)game.firstTry++;
    game.found.add(idx);
    if(showWrongHint)showFeedback(t('correctFb')(name),THEMES[theme].found);
    recordCorrectForCurrent();updateCityColors();updateStats();
    setTimeout(nextCountry,1100);
  }else{
    game.wrong++;recordMissForCurrent();game.wrongOnCurrent=true;
    if(showWrongHint)showFeedback(t('wrongFb')(name),THEMES[theme].wrong);
    cityDots&&cityDots.filter(d=>d._i===idx).attr('fill',THEMES[theme].wrong);
    if(wrongFlash)clearTimeout(wrongFlash);
    wrongFlash=setTimeout(updateCityColors,700);
    updateStats();
  }
}

// ── DROP-A-PIN ──
function haversine(lon1,lat1,lon2,lat2){const R=6371,rad=Math.PI/180;const dLat=(lat2-lat1)*rad,dLon=(lon2-lon1)*rad;const a=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
function projPx(px){const svg=d3.select('#map').node();if(!svg)return px;const sc=svg.getBoundingClientRect().width/960;const k=(d3.zoomTransform(svg).k)||1;return px/sc/k;}
function addPin(layer,pt,color){
  const s=projPx(1);
  const grp=layer.append('g').attr('transform','translate('+pt[0]+','+pt[1]+') scale('+s+')');
  grp.append('path').attr('d','M0,0 C-7,-10 -10,-16 0,-22 C10,-16 7,-10 0,0 Z').attr('fill',color).attr('stroke','#fff').attr('stroke-width',1.5);
  grp.append('circle').attr('cx',0).attr('cy',-15).attr('r',3).attr('fill','#fff');
}
async function startPinGame(region){
  region=region||'EU';
  const pool=getPinCities(region);
  const n=Math.min(quizRoundLimit,pool.length);
  const cities=shuffle(pool).slice(0,n);
  game={mode:'pin',pinMode:true,difficulty:region,pinRegion:region,
    pinCities:cities,queue:cities.map((_,i)=>i),
    current:null,pinScore:0,pinTotalDist:0,pinRound:0,total:cities.length};
  lastMode='pin';canClick=true;optsOpen=false;
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');
  updateAllText();
  if(worldData)renderMap(worldData);else await loadMap();
  const z=cityZoom(cities);if(z)zoomTo(z[0],z[1],z[2]);
  nextPin();
}
function nextPin(){
  canClick=true;
  if(!game.queue||game.queue.length===0){showPinResult();return;}
  game.current=game.queue.shift();
  if(pinLayer)pinLayer.selectAll('*').remove();
  $('target-name').textContent=cityDisplayName(game.pinCities[game.current]);
  clearFeedback();updateStats();
}
function handlePinClick(ev){
  if(!canClick||!game||!game.pinMode||game.current===null||game.current===undefined)return;
  const p=d3.pointer(ev,gGroup.node());
  const guess=currentProj&&currentProj.invert?currentProj.invert(p):null;
  if(!guess||isNaN(guess[0])||isNaN(guess[1]))return;
  canClick=false;
  const city=game.pinCities[game.current];
  const dist=haversine(guess[0],guess[1],city.lon,city.lat);
  const decay=(typeof PIN_DECAY!=='undefined'&&PIN_DECAY[game.pinRegion])||700;
  const maxDist=decay*5;
  let pts=dist>=maxDist?0:Math.round(1000*Math.exp(-Math.max(0,dist-20)/decay));
  let countryBonus=false;
  const isContinent=['EU','AF','AS','NA','SA','OC','world'].includes(game.pinRegion);
  if(isContinent&&countryPaths){
    const feats=countryPaths.data();
    const targetFeat=feats.find(f=>d3.geoContains(f,[city.lon,city.lat]));
    if(targetFeat&&d3.geoContains(targetFeat,guess)){pts+=50;countryBonus=true;}
  }
  game.pinScore=(game.pinScore||0)+pts;
  game.pinTotalDist=(game.pinTotalDist||0)+dist;
  game.pinRound=(game.pinRound||0)+1;
  const gp=currentProj([guess[0],guess[1]]),tp=currentProj([city.lon,city.lat]);
  if(pinLayer){
    pinLayer.selectAll('*').remove();
    // 20km Vollpunkt-Umkreis um den richtigen Standort
    if(currentProj){
      const circleGeoPath=d3.geoPath().projection(currentProj);
      const circleFeature=d3.geoCircle().center([city.lon,city.lat]).radius(20/111.32)();
      pinLayer.append('path').datum(circleFeature).attr('d',circleGeoPath)
        .attr('fill','rgba(29,158,117,0.12)').attr('stroke',THEMES[theme].found)
        .attr('stroke-width',1.2).attr('stroke-dasharray','5,3')
        .style('vector-effect','non-scaling-stroke').style('pointer-events','none');
    }
    pinLayer.append('line').attr('x1',gp[0]).attr('y1',gp[1]).attr('x2',tp[0]).attr('y2',tp[1])
      .attr('stroke',THEMES[theme].border).attr('stroke-width',1.2).attr('stroke-dasharray','4,3').style('vector-effect','non-scaling-stroke');
    pinLayer.append('text').attr('x',tp[0]).attr('y',tp[1]+projPx(-26)).attr('text-anchor','middle')
      .attr('fill',THEMES[theme].found).attr('font-size',projPx(13)).attr('font-weight','600')
      .style('paint-order','stroke').style('stroke',THEMES[theme].bg).style('stroke-width',projPx(3)).text(cityDisplayName(city));
    addPin(pinLayer,gp,'#e23a2a');      // Schätzung (rot)
    addPin(pinLayer,tp,THEMES[theme].found); // tatsächlich (grün)
  }
  showFeedback(t('pinFb')(Math.round(dist),pts)+(countryBonus?' (+50 🎯)':''),THEMES[theme].found);
  updateStats();
  setTimeout(nextPin,2300);
}
function showPinResult(){
  if(!game.total){back();return;}
  showScreen('result-screen');
  const isCont=['EU','AF','AS','NA','SA','OC','world'].includes(game.pinRegion);
  const max=(game.total||1)*(isCont?1050:1000),pct=Math.round((game.pinScore/max)*100);
  const avg=game.pinRound?Math.round(game.pinTotalDist/game.pinRound):0;
  $('res-emoji').textContent=pct>=80?'🏆':pct>=50?'🎯':'📍';
  $('res-title').textContent=t('resTitle');
  const note=resultBestNote();
  $('res-l1').textContent=game.pinScore+' / '+max+' '+t('pointsLbl')+' ('+pct+'%)';
  $('res-l2').textContent=t('avgLbl')+': '+avg+' km'+note;
  $('res-btn-back').textContent=t('back');$('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');
  if(typeof checkAchievements==='function')checkAchievements();
}

async function startRiverGame(diff){
  if(!riversData){showFeedback(t('load'),'#888');await loadMap();}
  const feats=getRiverFeatures(diff);
  const indexed=feats.map((f,i)=>({...f,_i:i}));
  const riverQueue=learnSortIdx(feats.map((_,i)=>i),feats,riverDisplayName,'river:').slice(0,allTargets?Infinity:quizRoundLimit);
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
  if(!canClick||!game||game.current===null||game.current===undefined)return;
  if(game.skippedItems&&game.skippedItems.has(idx))return;
  if(game.found.has(idx))return;
  const feat=game.riverFeatures[idx];
  const name=riverDisplayName(feat);
  if(idx===game.current){
    canClick=false;game.correct++;
    if(!game.wrongOnCurrent)game.firstTry++;
    game.found.add(idx);
    if(showWrongHint)showFeedback(t('correctFb')(name),THEMES[theme].found);
    recordCorrectForCurrent();updateRiverColors();updateStats();
    setTimeout(nextCountry,1100);
  }else{
    game.wrong++;recordMissForCurrent();game.wrongOnCurrent=true;
    if(showWrongHint)showFeedback(t('wrongFb')(name),THEMES[theme].wrong);
    riverPaths&&riverPaths.filter(d=>d._i===idx).attr('stroke',THEMES[theme].wrong);
    if(wrongFlash)clearTimeout(wrongFlash);
    wrongFlash=setTimeout(updateRiverColors,700);
    updateStats();
  }
}

async function startLakeGame(diff){
  if(!lakesData){showFeedback('Seen werden geladen …','#888');await loadMap();}
  const feats=getLakeFeatures(diff);
  const indexed=feats.map((f,i)=>({...f,_i:i}));
  const lakeRep={};const order=[];
  feats.forEach((f,i)=>{const n=lakeDisplayName(f);if(!(n in lakeRep)){lakeRep[n]=i;order.push(i);}});
  const lakeQueue=learnSortIdx(order,feats,lakeDisplayName,'lake:').slice(0,allTargets?Infinity:quizRoundLimit);
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
  const feat=game.lakeFeatures[idx];
  const name=lakeDisplayName(feat);
  const rep=game.lakeRep[name];
  if(game.skippedItems&&game.skippedItems.has(rep))return;
  if(game.found.has(rep))return;
  if(name===lakeDisplayName(game.lakeFeatures[game.current])){
    canClick=false;game.correct++;
    if(!game.wrongOnCurrent)game.firstTry++;
    game.found.add(rep);
    if(showWrongHint)showFeedback(t('correctFb')(name),THEMES[theme].found);
    recordCorrectForCurrent();updateLakeColors();updateStats();
    setTimeout(nextCountry,1100);
  }else{
    game.wrong++;recordMissForCurrent();game.wrongOnCurrent=true;
    if(showWrongHint)showFeedback(t('wrongFb')(name),THEMES[theme].wrong);
    lakePaths&&lakePaths.filter(d=>d._i===idx).attr('fill',THEMES[theme].wrong);
    lakeDots&&lakeDots.filter(d=>d._i===idx).attr('fill',THEMES[theme].wrong);
    if(wrongFlash)clearTimeout(wrongFlash);
    wrongFlash=setTimeout(updateLakeColors,700);
    updateStats();
  }
}

function zoomTo(cx,cy,k){
  if(!zoomBehavior)return;
  const svg=d3.select('#map');
  const W=960,H=500;
  const tx=W/2-cx*k,ty=H/2-cy*k;
  svg.transition().duration(600).call(zoomBehavior.transform,d3.zoomIdentity.translate(tx,ty).scale(k));
}

let lakesData=null,riversData=null;
async function loadMap(){
  if(worldData){renderMap(worldData);return;}
  try{
    [worldData,lakesData,riversData]=await Promise.all([
      fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r=>r.json()),
      fetch('https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_lakes.geojson').then(r=>r.json()).catch(()=>null),
      fetch('https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_rivers_lake_centerlines.geojson').then(r=>r.json()).catch(()=>null)
    ]);
    // Normalize known river sections to their common names, then merge same-named segments
    const RIVER_ALIASES={
      'Chang Jiang':'Yangtze','Jinsha':'Yangtze','Tongtian':'Yangtze','Tuotuo':'Yangtze',
      'Dihang':'Brahmaputra','Yarlung':'Brahmaputra','Maquan':'Brahmaputra',
      'Lancang':'Mekong',
      'Lualaba':'Congo',
      'Donau':'Danube','Borcea':'Danube','Bratul Chillia':'Danube','Bratul Sfintu Gheorghe':'Danube','Bratul Sulina':'Danube',
      'Bykovskaya Protoka':'Lena','Olenekskaya Protoka':'Lena',
      'Amazonas':'Amazon',
      'Ayeyarwady':'Irrawaddy','Nmai':'Irrawaddy','Irrawaddy Delta':'Irrawaddy',
      'Heilong Jiang':'Amur',"Argun'":'Amur','Hailar':'Amur',
      'El Bahr el Abyad':'Nile','Bahr el Jebel':'Nile','Kagera':'Nile','Damietta Branch':'Nile','Rosetta Branch':'Nile',
      'Ertix':'Irtysh',
      'Selenge (Selenga)':'Selenga',
      'Shiquan':'Indus',
      'Ucayali':'Amazon',
    };
    if(riversData){
      const byName={};
      riversData.features.forEach(f=>{
        const raw=f.properties.name;if(!raw)return;
        const n=RIVER_ALIASES[raw]||raw;
        (byName[n]=byName[n]||[]).push({...f,properties:{...f.properties,name:n}});
      });
      const merged=[];
      Object.values(byName).forEach(feats=>{
        if(feats.length===1){merged.push(feats[0]);return;}
        const lines=[];
        feats.forEach(f=>{if(f.geometry.type==='LineString')lines.push(f.geometry.coordinates);else if(f.geometry.type==='MultiLineString')lines.push(...f.geometry.coordinates);});
        const minSr=Math.min(...feats.map(f=>f.properties.scalerank||99));
        merged.push({type:'Feature',properties:{...feats[0].properties,scalerank:minSr},geometry:{type:'MultiLineString',coordinates:lines}});
      });
      riversData={...riversData,features:merged.concat(riversData.features.filter(f=>!f.properties.name))};
    }
    renderMap(worldData);
  }catch(e){showFeedback('Error','#C0432A');}
}

function isActive(id){
  if(game.lakeMode||game.riverMode||game.cityMode)return false;
  if(game.pinMode){
    const r=game.pinRegion;
    if(!r||r==='world')return !!C[id];
    const CONTS=new Set(['EU','AF','AS','NA','SA','OC']);
    if(CONTS.has(r))return !!(C[id]&&C[id].c===r);
    return !!(C[id]&&ISO2[id]===r.toLowerCase());
  }
  if(game.mode==='custom')return game.customIds&&game.customIds.has(id);
  const ac=activeConts();
  if(!ac)return !!C[id];
  return C[id]&&ac.has(C[id].c);
}

// Convex Hull (Andrew's monotone chain) for island zone outlines
function convexHull(points){
  if(points.length<3)return points;
  const sorted=[...points].sort((a,b)=>a[0]!==b[0]?a[0]-b[0]:a[1]-b[1]);
  const ccw=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])>0;
  let lower=[],upper=[];
  for(let p of sorted){while(lower.length>=2&&!ccw(lower[lower.length-2],lower[lower.length-1],p))lower.pop();lower.push(p);}
  for(let p of[...sorted].reverse()){while(upper.length>=2&&!ccw(upper[upper.length-2],upper[upper.length-1],p))upper.pop();upper.push(p);}
  return lower.concat(upper.slice(1,-1));
}
// Collect all [lon,lat] vertices from a GeoJSON Polygon/MultiPolygon geometry.
function geomPoints(geom){
  const out=[];
  (function walk(c){if(typeof c[0]==='number'){out.push([c[0],c[1]]);return;}c.forEach(walk);})(geom.coordinates);
  return out;
}
// Build the padded, projected convex-hull outline (array of screen points) for one island zone.
// `features` is the full country feature list; the zone's own id plus any `extraIds` contribute points.
function buildZoneHull(zone,features,proj){
  let raw=[];
  for(const id of [zone.id,...(zone.extraIds||[])]){
    const f=features.find(ff=>+ff.id===id);
    if(f&&f.geometry)raw.push(...geomPoints(f.geometry));
  }
  if(!raw.length){
    if(zone.fallbackLon==null)return[];
    // No geometry (e.g. Tuvalu): synthesize a small ring of points around the fallback center.
    const r=zone.fallbackR||2;
    for(let a=0;a<360;a+=45)raw.push([zone.fallbackLon+r*Math.cos(a*Math.PI/180),zone.fallbackLat+r*Math.sin(a*Math.PI/180)]);
  }
  let pts=raw.map(p=>proj(p)).filter(p=>p&&isFinite(p[0])&&isFinite(p[1]));
  if(pts.length<3)return pts;
  // Unwrap across the projection seam: nations near lon ±180 project to BOTH map edges.
  // Shift outliers by ±W so the dominant cluster stays contiguous (median x = reference).
  const W=960;
  const medX=[...pts.map(p=>p[0])].sort((a,b)=>a-b)[Math.floor(pts.length/2)];
  pts=pts.map(([x,y])=>{let nx=x;if(x-medX>W/2)nx=x-W;else if(medX-x>W/2)nx=x+W;return[nx,y];});
  return convexHull(pts);
}
// Rounded buffer around the hull (Minkowski sum with a disk of radius r), returned as a POLYGON of
// points (arcs flattened to short segments). Thin chains → capsules, tiny nations → circles.
function bufferHullPolygon(hull,r){
  if(!hull||!hull.length)return[];
  const circle=([x,y])=>{const o=[];for(let a=0;a<360;a+=20)o.push([x+r*Math.cos(a*Math.PI/180),y+r*Math.sin(a*Math.PI/180)]);return o;};
  if(hull.length===1)return circle(hull[0]);
  const n=hull.length;
  const cx=hull.reduce((s,p)=>s+p[0],0)/n,cy=hull.reduce((s,p)=>s+p[1],0)/n;
  const edges=[];
  for(let i=0;i<n;i++){
    const a=hull[i],b=hull[(i+1)%n];
    const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
    if(len<1e-6)continue;
    let nx=dy/len,ny=-dx/len;
    const mx=(a[0]+b[0])/2-cx,my=(a[1]+b[1])/2-cy;
    if(nx*mx+ny*my<0){nx=-nx;ny=-ny;}
    edges.push({v:b,a:[a[0]+nx*r,a[1]+ny*r],b:[b[0]+nx*r,b[1]+ny*r]});
  }
  if(!edges.length)return circle(hull[0]);
  const out=[];
  for(let i=0;i<edges.length;i++){
    const e=edges[i],next=edges[(i+1)%edges.length];
    out.push(e.a,e.b);
    // Arc around the shared vertex e.v from e.b to next.a (short way, outward)
    const v=e.v;
    let a0=Math.atan2(e.b[1]-v[1],e.b[0]-v[0]),a1=Math.atan2(next.a[1]-v[1],next.a[0]-v[0]);
    let da=a1-a0;while(da<=-Math.PI)da+=2*Math.PI;while(da>Math.PI)da-=2*Math.PI;
    const steps=Math.max(1,Math.round(Math.abs(da)/(Math.PI/8)));
    for(let s=1;s<steps;s++){const a=a0+da*s/steps;out.push([v[0]+r*Math.cos(a),v[1]+r*Math.sin(a)]);}
  }
  return out;
}
// Smooth ellipse (PCA-oriented) enclosing all points, plus margin `pad`. Always round, no corners.
function enclosingEllipse(pts,pad){
  const n=pts.length;if(n<2)return[];
  const mx=pts.reduce((s,p)=>s+p[0],0)/n,my=pts.reduce((s,p)=>s+p[1],0)/n;
  let sxx=0,sxy=0,syy=0;
  for(const p of pts){const dx=p[0]-mx,dy=p[1]-my;sxx+=dx*dx;sxy+=dx*dy;syy+=dy*dy;}
  sxx/=n;sxy/=n;syy/=n;
  // Eigen-decomposition of the 2×2 covariance → principal axis angle
  const theta=0.5*Math.atan2(2*sxy,sxx-syy);
  const ct=Math.cos(theta),st=Math.sin(theta);
  // Max extent of the points along each principal axis
  let ea=0,eb=0;
  for(const p of pts){const dx=p[0]-mx,dy=p[1]-my;ea=Math.max(ea,Math.abs(dx*ct+dy*st));eb=Math.max(eb,Math.abs(-dx*st+dy*ct));}
  ea+=pad;eb+=pad;
  const out=[];
  for(let a=0;a<360;a+=5){const r=a*Math.PI/180,ex=ea*Math.cos(r),ey=eb*Math.sin(r);out.push([mx+ex*ct-ey*st,my+ex*st+ey*ct]);}
  return out;
}
// Chaikin corner-cutting: rounds a closed polygon into a smooth blob (softens long straight edges).
function chaikin(poly,iters){
  let p=poly;
  for(let it=0;it<iters;it++){
    const q=[];
    for(let i=0;i<p.length;i++){
      const a=p[i],b=p[(i+1)%p.length];
      q.push([a[0]*0.75+b[0]*0.25,a[1]*0.75+b[1]*0.25]);
      q.push([a[0]*0.25+b[0]*0.75,a[1]*0.25+b[1]*0.75]);
    }
    p=q;
  }
  return p;
}
// Sutherland-Hodgman clip of a polygon to a half-plane: keep points where (p-mid)·nrm >= 0.
function clipPolyHalfPlane(poly,mid,nrm){
  if(!poly.length)return poly;
  const side=p=>(p[0]-mid[0])*nrm[0]+(p[1]-mid[1])*nrm[1];
  const isect=(a,b,sa,sb)=>{const t=sa/(sa-sb);return[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];};
  const out=[];
  for(let i=0;i<poly.length;i++){
    const cur=poly[i],prev=poly[(i-1+poly.length)%poly.length];
    const sc=side(cur),sp=side(prev);
    if(sc>=0){if(sp<0)out.push(isect(prev,cur,sp,sc));out.push(cur);}
    else if(sp>=0)out.push(isect(prev,cur,sp,sc));
  }
  return out;
}
// Split every overlapping pair of zones with a straight border (perpendicular bisector of their
// centroids), so neighbouring zones abut along a clean straight line instead of overlapping curves.
function separateZones(zones){
  const cen=z=>{const h=z.hull;return[h.reduce((s,p)=>s+p[0],0)/h.length,h.reduce((s,p)=>s+p[1],0)/h.length];};
  const cents=zones.map(cen);
  for(let i=0;i<zones.length;i++)for(let j=i+1;j<zones.length;j++){
    const ca=cents[i],cb=cents[j];
    const dx=cb[0]-ca[0],dy=cb[1]-ca[1],d=Math.hypot(dx,dy);
    if(d<1e-6)continue;
    const mid=[(ca[0]+cb[0])/2,(ca[1]+cb[1])/2];
    // Clip zone i to its own side (normal points from mid toward ca); zone j to the opposite side.
    zones[i].poly=clipPolyHalfPlane(zones[i].poly,mid,[ca[0]-cb[0],ca[1]-cb[1]]);
    zones[j].poly=clipPolyHalfPlane(zones[j].poly,mid,[cb[0]-ca[0],cb[1]-ca[1]]);
  }
}
function polyPathD(poly){
  if(!poly||poly.length<2)return'';
  return'M'+poly.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')+'Z';
}
function zonePathD(z){return polyPathD(z.poly);}

function renderMap(world){
  const svg=d3.select('#map');svg.selectAll('*').remove();borderPath=null;gGroup=null;currentLOD='50m';
  const th=THEMES[theme],W=960,H=500;
  const proj=buildProjection();
  currentProj=proj;
  const gpath=d3.geoPath().projection(proj);
  svg.append('defs').html('<filter id="rv-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
  svg.append('rect').attr('class','ocean').attr('width',W).attr('height',H).attr('fill',th.bg);
  const g=svg.append('g');gGroup=g;
  g.append('path').attr('class','sphere').datum({type:'Sphere'}).attr('d',gpath).attr('fill',th.sph).attr('stroke',th.grd).attr('stroke-width',1);
  g.append('path').attr('class','grat').datum(d3.geoGraticule()()).attr('d',gpath).attr('fill','none').attr('stroke',th.grd).attr('stroke-width',0.3);

  const countries=topojson.feature(world,world.objects.countries);

  // Island zone outlines — convex hull of each nation's islands.
  // Hit areas rendered BELOW country paths so clicks on real land take priority.
  const activeZones=ISLAND_ZONES.filter(z=>isActive(z.id)).map(z=>{
    const hull=buildZoneHull(z,countries.features,proj);
    const poly=z.shape==='ellipse'
      ? enclosingEllipse(hull,z.r||8)
      : chaikin(bufferHullPolygon(hull,z.r||8),2);
    return{...z,hull,poly};
  }).filter(z=>z.hull&&z.hull.length>=3&&z.poly.length>=3);
  separateZones(activeZones); // split overlapping zones with straight shared borders
  zoneHulls=activeZones;

  islandZoneHits=g.append('g').attr('class','iz-hits').selectAll('path').data(zoneHulls).enter().append('path')
    .attr('d',z=>zonePathD(z))
    .attr('fill','transparent').attr('stroke','none').style('cursor','pointer')
    .on('mouseover',function(ev,z){if(!(game.skippedItems&&game.skippedItems.has(z.id))&&!(game.found&&game.found.has(z.id)))islandZoneVisuals&&islandZoneVisuals.filter(v=>v.id===z.id).attr('stroke-opacity',0.9);})
    .on('mouseout',function(ev,z){islandZoneVisuals&&islandZoneVisuals.filter(v=>v.id===z.id).attr('stroke-opacity',0.55);})
    .on('click',(ev,z)=>handleClick(z.id));
  // Assign unique synthetic negative IDs to features whose id coerces to NaN
  // so each gets its own slot in REDIRECTS instead of all colliding at NaN
  let _sid=-1;
  countries.features.forEach(f=>{if(isNaN(+f.id))f.id=_sid--;});
  // Kosovo has no ISO numeric id in the topojson → assign it 383 so it becomes a clickable country
  countries.features.forEach(f=>{if(+f.id>=0)return;const[lon,lat]=d3.geoCentroid(f);if(lon>20&&lon<21.9&&lat>42&&lat<43.3)f.id=383;});
  visibleIds=new Set(countries.features.map(f=>+f.id));
  REDIRECTS.clear();
  // 304=Greenland, 10=Antarctica — non-clickable, no redirect
  const NO_REDIRECT=new Set([304,10,540,630,850,660,92,663,652,534]); // 540=Neukaledonien, 630=Puerto Rico, 850=US Virgin Is., 660=Anguilla, 92=Brit. Virgin Is., 663=St.Martin, 652=St.Barthélemy, 534=Sint Maarten
  // Dynamically block territories by centroid bounds (e.g. Französisch-Guayana)
  const GEO_NO_REDIRECT=[[[-56,-50],[1,7]]]; // [lonRange, latRange]
  countries.features.forEach(f=>{const [lo,la]=d3.geoCentroid(f);if(GEO_NO_REDIRECT.some(([[l0,l1],[a0,a1]])=>lo>=l0&&lo<=l1&&la>=a0&&la<=a1))NO_REDIRECT.add(+f.id);});
  const kc=countries.features.filter(f=>C[+f.id]).map(f=>({id:+f.id,ctr:d3.geoCentroid(f)}));
  countries.features.forEach(u=>{const uid=+u.id;if(C[uid])return;if(NO_REDIRECT.has(uid))return;const uc=d3.geoCentroid(u);let b=null,bd=Infinity;kc.forEach(({id,ctr})=>{const d=(uc[0]-ctr[0])**2+(uc[1]-ctr[1])**2;if(d<bd){bd=d;b=id;}});if(b!==null)REDIRECTS.set(uid,b);});
  REDIRECTS.set(732,504); // Westsahara → Marokko
  // Geographic overrides for specific disputed/unrecognised territories
  countries.features.forEach(f=>{const uid=+f.id;if(uid>=0)return;const [lon,lat]=d3.geoCentroid(f);
    if(lon>43&&lon<50&&lat>7&&lat<13)REDIRECTS.set(uid,706); // Somaliland → Somalia
    if(lon>32&&lon<35&&lat>34&&lat<36)REDIRECTS.set(uid,196); // Nord-Zypern → Zypern
  });

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
    const merged=topojson.merge(world,[gi,gj]);
    mergedPairs.push([gi,gj]);
    renderFeatures=renderFeatures
      .filter((_,i)=>i!==childIdx)
      .map(f=>+f.id===parentId?{...f,geometry:merged}:f);
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
    const merged=topojson.merge(world,[gi,gj]);
    mergedPairs.push([gi,gj]);
    renderFeatures=renderFeatures.filter((_,i)=>i!==ci).map(f=>+f.id===504?{...f,geometry:merged}:f);
  })();

  countryPaths=g.selectAll('.ct').data(renderFeatures).enter().append('path').attr('class','ct').attr('d',gpath).attr('stroke','none')
    .on('mouseover',function(ev,d){const id=eff(+d.id);if(!game.found||game.found.has(id)||!C[id]||!isActive(id)||(game.skippedItems&&game.skippedItems.has(id)))return;countryPaths.filter(f=>eff(+f.id)===id).attr('fill',THEMES[theme].hov);microstateDots&&microstateDots.filter(x=>x.id===id).attr('fill',THEMES[theme].hov);})
    .on('mouseout',function(ev,d){countryPaths.filter(f=>eff(+f.id)===eff(+d.id)).attr('fill',f=>getColor(+f.id));microstateDots&&microstateDots.filter(x=>x.id===eff(+d.id)).attr('fill',x=>getMSColor(x.id));})
    .on('click',(ev,d)=>handleClick(+d.id));

  // Overlay dim paths for overseas territories embedded in parent-country MultiPolygons
  function overlayParts(parentId,indices){
    const feat=renderFeatures.find(f=>+f.id===parentId);
    if(!feat||feat.geometry.type!=='MultiPolygon')return;
    indices.forEach(idx=>{
      const coords=feat.geometry.coordinates[idx];
      if(coords){
        const f={type:'Feature',geometry:{type:'Polygon',coordinates:coords}};
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
  const borderMesh=topojson.mesh(world,world.objects.countries,(a,b)=>{
    if(a===b)return false;
    for(const[g1,g2]of mergedPairs){if((a===g1&&b===g2)||(a===g2&&b===g1))return false;}
    return true;
  });
  borderPath=g.append('path').datum(borderMesh).attr('d',gpath).attr('fill','none').attr('stroke',th.border).attr('stroke-width',0.8).style('vector-effect','non-scaling-stroke').attr('pointer-events','none');

  // Coastlines (land–ocean boundary), always visible
  const coastMesh=topojson.mesh(world,world.objects.countries,(a,b)=>a===b);
  g.append('path').attr('class','coastline').datum(coastMesh).attr('d',gpath).attr('fill','none').attr('stroke',th.border).attr('stroke-width',0.8).style('vector-effect','non-scaling-stroke').attr('pointer-events','none');

  // Rivers — rendered before lakes so lakes appear on top; hidden in lake mode (they distract)
  riverPaths=null;riverHitboxes=null;
  if(riversData&&!game.lakeMode){
    const riverMode=game.riverMode||false;
    const allRivers=riversData.features.filter(f=>f.properties.name&&f.properties.featurecla!=='Lake Centerline');
    const visFeats=riverMode ? getRiverFeatures(game.difficulty) : allRivers.filter(f=>(f.properties.scalerank||9)<=3);
    const indexed=visFeats.map((f,i)=>({...f,_i:i}));
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
    const indexed=visFeats.map((f,i)=>({...f,_i:i}));
    lakePaths=g.append('g').attr('class','lakes').selectAll('path').data(indexed).enter().append('path')
      .attr('d',gpath).attr('fill',th.sph).attr('stroke',th.border).attr('stroke-width',0.6)
      .style('vector-effect','non-scaling-stroke');
    if(lakeMode){
      lakePaths.style('cursor','pointer')
        .on('mouseover',function(ev,d){if(game.found&&game.found.has(d._i))return;d3.select(this).attr('fill',th.hov);})
        .on('mouseout',function(ev,d){d3.select(this).attr('fill',getLakeColor(d._i));})
        .on('click',(ev,d)=>handleLakeClick(d._i));
    }else{
      lakePaths.style('cursor','default').on('mouseover',()=>{}).on('click',()=>{});
    }

    // Dots for small lakes (min_zoom > 1, i.e. small at world view): visible when zoomed out, hidden once polygon is big enough
    if(lakeMode){
      const smallFeats=indexed.filter(f=>(f.properties.min_zoom||4)>1);
      if(smallFeats.length>0){
        lakeDots=g.append('g').attr('class','lake-dots').selectAll('circle').data(smallFeats).enter().append('circle')
          .attr('cx',d=>gpath.centroid(d)[0]).attr('cy',d=>gpath.centroid(d)[1])
          .attr('r',DOT_R).attr('fill',d=>getLakeColor(d._i)).attr('stroke',th.border).attr('stroke-width',1.5)
          .style('vector-effect','non-scaling-stroke').style('pointer-events','none');
        lakeHit=g.append('g').attr('class','lake-hit').selectAll('circle').data(smallFeats).enter().append('circle')
          .attr('cx',d=>gpath.centroid(d)[0]).attr('cy',d=>gpath.centroid(d)[1])
          .attr('r',HIT_R).attr('fill','transparent').style('cursor','pointer')
          .on('mouseover',function(ev,d){const t=nearestDot(ev,lakeHit)||d;if(game.found&&game.found.has(t._i))return;lakeDots.filter(x=>x._i===t._i).attr('fill',th.hov);})
          .on('mouseout',function(){lakeDots.attr('fill',x=>getLakeColor(x._i));})
          .on('click',function(ev,d){const t=nearestDot(ev,lakeHit)||d;handleLakeClick(t._i);});
      }
    }
  }

  // Suppress the dot for any nation that now has a zone outline (the zone replaces the dot).
  const zonedIds=new Set(zoneHulls.map(z=>z.id));
  const activeDots=MICROSTATES.filter(m=>isActive(m.id)&&!zonedIds.has(m.id));
  microstateDots=g.selectAll('.ms').data(activeDots).enter().append('circle').attr('class','ms')
    .attr('cx',d=>proj([d.lon,d.lat])[0]).attr('cy',d=>proj([d.lon,d.lat])[1])
    .attr('r',DOT_R).attr('stroke-width',1.5).style('vector-effect','non-scaling-stroke').style('pointer-events','none');
  microstateHit=g.append('g').attr('class','ms-hit').selectAll('circle').data(activeDots).enter().append('circle')
    .attr('cx',d=>proj([d.lon,d.lat])[0]).attr('cy',d=>proj([d.lon,d.lat])[1])
    .attr('r',d=>msHitR(d.id)).attr('fill','transparent').style('cursor','pointer')
    .on('mouseover',function(ev,d){const t=nearestDot(ev,microstateHit)||d;if((game.found&&game.found.has(t.id))||(game.skippedItems&&game.skippedItems.has(t.id)))return;microstateDots.filter(x=>x.id===t.id).attr('fill',THEMES[theme].hov);countryPaths&&countryPaths.filter(f=>eff(+f.id)===t.id).attr('fill',THEMES[theme].hov);})
    .on('mouseout',function(){microstateDots.attr('fill',x=>getMSColor(x.id));countryPaths&&countryPaths.attr('fill',f=>getColor(+f.id));})
    .on('click',function(ev,d){const t=nearestDot(ev,microstateHit)||d;handleClick(t.id);});

  // Island zone visuals — dashed hull outline above country fills, pointer-events off
  function izStroke(z){if(game.skippedItems&&game.skippedItems.has(z.id))return th.skipped;if(game.found&&game.found.has(z.id))return th.found;return'rgba(255,255,255,0.6)';}
  islandZoneVisuals=g.append('g').attr('class','iz-vis').selectAll('path').data(zoneHulls).enter().append('path')
    .attr('d',z=>zonePathD(z))
    .attr('fill','none').attr('stroke',izStroke).attr('stroke-opacity',0.55)
    .attr('stroke-dasharray','5 4').style('vector-effect','non-scaling-stroke').attr('stroke-width',1.5)
    .style('pointer-events','none');

  // City dots — rendered as points like microstates; visible at all zoom levels
  cityDots=null;let cityHit=null;
  if(game.cityMode&&game.cityFeatures){
    const cf=game.cityFeatures.map((c,i)=>({...c,_i:i}));
    cityDots=g.append('g').attr('class','city-dots').selectAll('circle').data(cf).enter().append('circle')
      .attr('cx',d=>proj([d.lon,d.lat])[0]).attr('cy',d=>proj([d.lon,d.lat])[1])
      .attr('r',DOT_R).attr('fill',d=>getCityColor(d._i)).attr('stroke',th.avail).attr('stroke-width',1.5)
      .style('vector-effect','non-scaling-stroke').style('pointer-events','none');
    cityHit=g.append('g').attr('class','city-hit').selectAll('circle').data(cf).enter().append('circle')
      .attr('cx',d=>proj([d.lon,d.lat])[0]).attr('cy',d=>proj([d.lon,d.lat])[1])
      .attr('r',HIT_R).attr('fill','transparent').style('cursor','pointer')
      .on('mouseover',function(ev,d){const t=nearestDot(ev,cityHit)||d;if(game.found&&game.found.has(t._i))return;cityDots.filter(x=>x._i===t._i).attr('fill',THEMES[theme].hov);})
      .on('mouseout',function(){cityDots.attr('fill',x=>getCityColor(x._i));})
      .on('click',function(ev,d){const t=nearestDot(ev,cityHit)||d;handleCityClick(t._i);});
  }

  // Drop-A-Pin: full-area overlay captures clicks anywhere; pinLayer holds the dropped markers
  pinLayer=null;
  if(game.pinMode){
    g.append('rect').attr('class','pin-overlay pin-cursor').attr('x',-5000).attr('y',-5000).attr('width',10000).attr('height',10000)
      .attr('fill','transparent').style('pointer-events','all').on('click',function(ev){handlePinClick(ev);});
    pinLayer=g.append('g').attr('class','pin-layer').style('pointer-events','none');
  }

  // Returns dot radius in SVG units so it stays DOT_R screen-pixels regardless of window size or zoom
  function svgScale(){const r=svg.node().getBoundingClientRect();return r.width/960;}
  function dotGrow(k){return 1+0.5*Math.min(1,Math.log(Math.max(1,k))/Math.log(COARSE?50:20));}
  function dotR(zoomK=1){return DOT_R*dotGrow(zoomK)/svgScale()/zoomK;}
  function hitR(zoomK=1){return HIT_R*dotGrow(zoomK)/svgScale()/zoomK;}
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
    if(microstateDots)microstateDots.attr('r',dotR(zoomK)).style('display',msDisp);
    if(microstateHit)microstateHit.attr('r',d=>msHitR(d.id)/svgScale()/zoomK).style('display',msDisp);
    if(lakeDots)lakeDots.attr('r',dotR(zoomK)).style('display',lkDisp);
    if(lakeHit)lakeHit.attr('r',hitR(zoomK)).style('display',lkDisp);
    if(cityDots)cityDots.attr('r',dotR(zoomK));
    if(cityHit)cityHit.attr('r',hitR(zoomK));
  }
  applyDotR();

  // Update dots on window resize (SVG scale changes)
  const _ro=new ResizeObserver(()=>applyDotR(_lastT?_lastT.k:1));
  _ro.observe(svg.node());

  const gNode=g.node();
  let _raf=null,_lastT=null,_pTimer=null;
  zoomBehavior=d3.zoom().scaleExtent([1,COARSE?50:20]).translateExtent([[0,0],[MAP_W,MAP_H]]).on('zoom',ev=>{
    const t=ev.transform;
    const scaleChanged=!_lastT||Math.abs(t.k-(_lastT.k||1))>0.001;
    _lastT=t;
    if(!_pTimer)gNode.style.pointerEvents='none';
    clearTimeout(_pTimer);
    _pTimer=setTimeout(()=>{gNode.style.pointerEvents='';_pTimer=null;applyDotR(_lastT.k);if(_lastT.k>4&&currentLOD==='50m')_swapLOD('10m');else if(_lastT.k<3.5&&currentLOD==='10m')_swapLOD('50m');},150);
    if(!_raf)_raf=requestAnimationFrame(()=>{
      g.attr('transform',_lastT);
      if(scaleChanged)applyDotR(_lastT.k);
      _raf=null;
    });
  });
  svg.call(zoomBehavior);
  $('map-bg').style.background=th.bg;updateColors();
}

async function _swapLOD(target){
  if(target===currentLOD||_lodLoading)return;
  if(target==='10m'){
    _lodLoading=true;
    if(!_lodWorldData10m){
      try{_lodWorldData10m=await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json').then(r=>r.json());}
      catch(e){_lodLoading=false;return;}
    }
    _applyLODData(_lodWorldData10m);
    currentLOD='10m';
    _lodLoading=false;
  }else{
    if(!worldData)return;
    _applyLODData(worldData);
    currentLOD='50m';
  }
}
function _applyLODData(world){
  if(!countryPaths||!gGroup||!currentProj)return;
  const gpath=d3.geoPath().projection(currentProj);
  const countries=topojson.feature(world,world.objects.countries);
  const geoms=world.objects.countries.geometries;
  let _sid=-1;
  countries.features.forEach(f=>{if(isNaN(+f.id))f.id=_sid--;});
  countries.features.forEach(f=>{if(+f.id>=0)return;const[lon,lat]=d3.geoCentroid(f);if(lon>20&&lon<21.9&&lat>42&&lat<43.3)f.id=383;});
  let rf=countries.features;
  const mp=[];
  function mi(pid){
    const pi=rf.findIndex(f=>+f.id===pid);
    const ci=rf.findIndex(f=>+f.id<0&&REDIRECTS.get(+f.id)===pid);
    if(pi<0||ci<0)return;
    const gi=geoms[countries.features.indexOf(rf[pi])];
    const gj=geoms[countries.features.indexOf(rf[ci])];
    if(!gi||!gj)return;
    const m=topojson.merge(world,[gi,gj]);mp.push([gi,gj]);
    rf=rf.filter((_,i)=>i!==ci).map(f=>+f.id===pid?{...f,geometry:m}:f);
  }
  mi(706);mi(196);
  (function(){
    const pi=rf.findIndex(f=>+f.id===504);
    const ci=rf.findIndex(f=>+f.id===732);
    if(pi<0||ci<0)return;
    const gi=geoms[countries.features.indexOf(rf[pi])];
    const gj=geoms[countries.features.indexOf(rf[ci])];
    if(!gi||!gj)return;
    const m=topojson.merge(world,[gi,gj]);mp.push([gi,gj]);
    rf=rf.filter((_,i)=>i!==ci).map(f=>+f.id===504?{...f,geometry:m}:f);
  })();
  const fmap=new Map();
  rf.forEach(f=>fmap.set(+f.id,f));
  countryPaths.attr('d',function(d){const f=fmap.get(+d.id);return f?gpath(f):gpath(d);});
  const borderMesh=topojson.mesh(world,world.objects.countries,(a,b)=>{
    if(a===b)return false;
    for(const[g1,g2]of mp){if((a===g1&&b===g2)||(a===g2&&b===g1))return false;}
    return true;
  });
  if(borderPath)borderPath.datum(borderMesh).attr('d',gpath);
  const coastMesh=topojson.mesh(world,world.objects.countries,(a,b)=>a===b);
  const coastPath=d3.select('#map path.coastline');
  if(!coastPath.empty())coastPath.datum(coastMesh).attr('d',gpath);
}

function _avail(rawId){return theme==='terrain'?terrainFill(rawId):THEMES[theme].avail;}
function getColor(rawId){const id=eff(rawId),th=THEMES[theme];if(game.lakeMode||game.riverMode||game.cityMode)return _avail(rawId);if(game.pinMode){if(!C[id])return th.dim;if(!isActive(id))return th.dim;return _avail(rawId);}if(!C[id])return th.dim;if(game.skippedItems&&game.skippedItems.has(id))return th.skipped;if(keepFound&&game.found&&game.found.has(id))return th.found;if(!isActive(id))return th.dim;return _avail(rawId);}
function getMSColor(id){const th=THEMES[theme];if(game.skippedItems&&game.skippedItems.has(id))return th.skipped;if(keepFound&&game.found&&game.found.has(id))return th.found;if(!isActive(id))return th.dim;return _avail(id);}
function updateColors(){if(!countryPaths)return;const th=THEMES[theme];
  const neutral=game.lakeMode||game.riverMode||game.cityMode;
  if(neutral){
    countryPaths.attr('fill',th.avail).attr('cursor','default');
    if(microstateDots)microstateDots.attr('fill',th.avail).attr('cursor','default');
    const hideBorders=game.lakeMode||game.riverMode;
    if(borderPath)borderPath.style('display',hideBorders?'none':'');
    d3.select('#map path.coastline').style('display',hideBorders?'none':'');
  }else if(game.pinMode){
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
      .attr('stroke',z=>{if(game.skippedItems&&game.skippedItems.has(z.id))return th.skipped;if(keepFound&&game.found&&game.found.has(z.id))return th.found;return'rgba(255,255,255,0.6)';});
    if(islandZoneHits)islandZoneHits.style('display',hideZones?'none':'').style('cursor',z=>isActive(z.id)?'pointer':'default');
  }
  d3.selectAll('.fgui-overlay').attr('fill',(neutral||game.pinMode)?th.avail:th.dim);
  updateLakeColors();
  updateRiverColors();
  updateCityColors();
}
function nextCountry(){canClick=true;if(game.queue&&game.found){while(game.queue.length&&game.found.has(game.queue[0]))game.queue.shift();}if(!game.queue||game.queue.length===0){showResult();return;}game.current=game.queue.shift();game.wrongOnCurrent=false;if(game.riverMode){const f=game.riverFeatures[game.current];$('target-name').textContent=f?riverDisplayName(f):'?';}else if(game.lakeMode){const f=game.lakeFeatures[game.current];$('target-name').textContent=f?lakeDisplayName(f):'?';}else if(game.cityMode){const c=game.cityFeatures[game.current];$('target-name').textContent=c?cityDisplayName(c):'?';}else{$('target-name').textContent=cn(game.current);}clearFeedback();updateStats();updateColors();}
function flashWrong(rawId){countryPaths&&countryPaths.filter(d=>+d.id===rawId).attr('fill',THEMES[theme].wrong);microstateDots&&microstateDots.filter(d=>d.id===rawId).attr('fill',THEMES[theme].wrong);if(wrongFlash)clearTimeout(wrongFlash);wrongFlash=setTimeout(updateColors,700);}
function handleClick(rawId){if(!canClick||!game||!game.current)return;const id=eff(rawId);const info=C[id];if(!info||!isActive(id)||(game.skippedItems&&game.skippedItems.has(id))||(keepFound&&game.found.has(id)))return;if(id===game.current){canClick=false;game.correct++;if(!game.wrongOnCurrent)game.firstTry++;if(keepFound)game.found.add(id);if(showWrongHint)showFeedback(t('correctFb')(cn(id)),THEMES[theme].found);recordCorrectForCurrent();updateColors();updateStats();setTimeout(nextCountry,1100);}else{game.wrong++;recordMissForCurrent();game.wrongOnCurrent=true;if(showWrongHint)showFeedback(t('wrongFb')(cn(id)),THEMES[theme].wrong);flashWrong(rawId);updateStats();}}
function updateStats(){
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
  const dn=game.found?game.found.size:0,tot=game.total||1,rm=(game.queue?game.queue.length:0)+(game.current?1:0);$('score-disp').textContent=dn+'/'+tot;$('found-label').textContent=t('foundLbl');$('stat-c').textContent=game.correct||0;$('lbl-c').textContent=t('correctLbl');$('stat-w').textContent=game.wrong||0;$('lbl-w').textContent=t('wrongLbl');$('stat-s').textContent=game.skipped||0;$('lbl-s').textContent=t('skippedLbl');$('stat-r').textContent=rm+' '+t('remLbl');$('prog-bar').style.width=Math.round((dn/tot)*100)+'%';}
function showResult(){if(!game.total){back();return;}const p=game.total>0?Math.round((game.firstTry/game.total)*100):0;const note=resultBestNote();game.current=null;showScreen('result-screen');$('res-btn-back').textContent=t('back');$('res-emoji').textContent=p>=90?'🏆':p>=70?'🎉':p>=50?'👍':'📚';$('res-title').textContent=t('resTitle');$('res-l1').textContent=t('res1')(game.firstTry,game.total,p);const sk=game.skipped||0;$('res-l2').textContent=t('res2')(game.correct,game.wrong)+(sk>0?', '+sk+' '+t('skippedLbl'):'')+note;$('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');if(typeof checkAchievements==='function')checkAchievements();}

// ── FLAG QUIZ ──
let _fMatches=[],_fDdIdx=0;

// ── Input-Quiz: Flaggen / Hauptstädte / Umrisse (gemeinsame Eingabefeld-Mechanik) ──
let iqCfg={type:'flag',region:'world',diff:'all',dir:'c2cap'};
const IQ_PREFIX={flag:'flag:',capital:'cap:',outline:'out:'};
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
      const j=await fetch('https://cdn.jsdelivr.net/gh/georgique/world-geojson@main/countries/'+nm+'.json').then(r=>r.json());
      const gj=j.type==='FeatureCollection'?j.features[0]:j;const geom=gj.geometry||gj;
      if(geom&&geom.coordinates)acc[+id]={type:'Feature',id:+id,geometry:_rewindGeom(geom)};
    }catch(e){}
  }));
  _iqOverride=acc;
}
async function iqEnsureOutlineGeo(){
  if(!outlineGeo){try{outlineGeo=_lodWorldData10m||await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json').then(r=>r.json());if(!_lodWorldData10m)_lodWorldData10m=outlineGeo;}catch(e){}}
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
function iqPoolIds(cfg){
  let base;
  if(cfg.type==='flag')base=Object.keys(C).map(Number).filter(id=>ISO2[id]);
  else if(cfg.type==='capital')base=Object.keys(C).map(Number).filter(id=>CAPITALS[id]);
  else base=Object.keys(C).map(Number).filter(id=>!OUTLINE_EXCLUDE.has(id)&&(!outlineGeo||iqOutlineFeature(id)));
  return base.filter(id=>(cfg.region==='world'||C[id].c===cfg.region)&&iqDiffPass(id,cfg.diff));
}
function iqScoreKey(cfg){return 'iq:'+cfg.type+':'+cfg.region+':'+cfg.diff+(cfg.type==='capital'?':'+cfg.dir:'');}
function iqAnswerCapital(){return game.inputMode==='capital'&&game.capitalDir==='c2cap';}
function iqDisplayName(id){return iqAnswerCapital()?(lang==='de'?CAPITALS[id].de:CAPITALS[id].en):(lang==='de'?C[id].de:C[id].en);}

function openInputCfg(type){iqCfg={type,region:'world',diff:'all',dir:'c2cap'};if(type==='outline')iqEnsureOutlineGeo().then(renderInputCfg);showScreen('inputcfg-screen');renderInputCfg();}
function setIqCfg(k,v){iqCfg[k]=v;if(k==='region'&&v!=='world')iqCfg.diff='all';if(k==='diff'&&v!=='all')iqCfg.region='world';renderInputCfg();}
function renderInputCfg(){
  const meta={flag:{title:t('flagQuiz'),ic:'🚩'},capital:{title:t('capitalQuiz'),ic:'🏛️'},outline:{title:t('outlineQuiz'),ic:'🗺️'}}[iqCfg.type];
  $('icfg-back').textContent=t('cback');
  $('icfg-title').textContent=meta.title;
  const regions=[['world',t('regWorld')]].concat(['EU','AF','AS','NA','SA','OC'].map(m=>[m,MODES[m][lang]]));
  const diffs=[['all',t('diffAll')]].concat(TX[lang].flagDiffs.map(d=>[d.key,d.label]));
  const chip=(active,onclick,label)=>`<button class="iq-chip${active?' on':''}" onclick="${onclick}">${label}</button>`;
  let html='';
  if(iqCfg.type==='capital'){
    html+=`<div class="custom-card"><div class="custom-label">${t('cfgDir')}</div><div class="iq-chips">`+
      chip(iqCfg.dir==='c2cap',"setIqCfg('dir','c2cap')",t('dirC2Cap'))+
      chip(iqCfg.dir==='cap2c',"setIqCfg('dir','cap2c')",t('dirCap2C'))+`</div></div>`;
  }
  html+=`<div class="custom-card"><div class="custom-label">${t('cfgRegion')}</div><div class="iq-chips">`+
    regions.map(([k,l])=>chip(iqCfg.region===k,"setIqCfg('region','"+k+"')",l)).join('')+`</div></div>`;
  html+=`<div class="custom-card"><div class="custom-label">${t('cfgDiff')}</div><div class="iq-chips">`+
    diffs.map(([k,l])=>chip(iqCfg.diff===k,"setIqCfg('diff','"+k+"')",l)).join('')+`</div></div>`;
  const cnt=iqPoolIds(iqCfg).length;
  html+=`<div style="text-align:center;"><button class="custom-start-btn" onclick="startInputQuiz(iqCfg)"${cnt?'':' disabled style="opacity:.5;"'}>${t('cfgStart')} · ${cnt} ${t('countries')}</button></div>`;
  $('icfg-body').innerHTML=html;
}
function setIqDropdown(v){showDropdown=v;renderFlagOpts();persistSettings();}
function setIqSkipHint(v){showSkipHint=v;renderFlagOpts();persistSettings();}
function toggleFlagOpts(){const p=$('flag-opts-panel');if(p.style.display==='none'){renderFlagOpts();p.style.display='';}else{p.style.display='none';}}
function renderFlagOpts(){const p=$('flag-opts-panel');if(!p)return;const chip=(active,onclick,label)=>`<button class="iq-chip${active?' on':''}" onclick="${onclick}" style="font-size:11px;padding:3px 10px;">${label}</button>`;p.innerHTML=`<div style="display:flex;gap:1.2rem;flex-wrap:wrap;align-items:center;"><div style="display:flex;align-items:center;gap:6px;"><span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.04em;">${t('cfgDropdownLabel')}</span>${chip(showDropdown,"setIqDropdown(true)",t('cfgDropdownOn'))}${chip(!showDropdown,"setIqDropdown(false)",t('cfgDropdownOff'))}</div><div style="display:flex;align-items:center;gap:6px;"><span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.04em;">${t('cfgSkipHintLabel')}</span>${chip(showSkipHint,"setIqSkipHint(true)",t('cfgSkipHintOn'))}${chip(!showSkipHint,"setIqSkipHint(false)",t('cfgSkipHintOff'))}</div></div>`;}

async function startInputQuiz(cfg){
  iqCfg={...cfg};
  if(cfg.type==='outline')await iqEnsureOutlineGeo();
  const ids=iqPoolIds(cfg);
  if(!ids.length)return;
  const queue=learnSortIds(ids,IQ_PREFIX[cfg.type]).slice(0,allTargets?Infinity:quizRoundLimit);
  game={flagMode:true,inputMode:cfg.type,capitalDir:cfg.dir,iqCfg:{...cfg},
    flagQueue:queue,flagPool:new Set(ids),flagCorrect:0,flagWrong:0,flagSkipped:0,flagTotal:queue.length,flagFound:new Set(),
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
  svg.innerHTML='<path d="'+d+'" fill="#6a9a58" stroke="#eaf0f8" stroke-width="1.1" stroke-linejoin="round"/>';
  return true;
}

function skipFlag(){
  if(game.flagCurrent==null)return;
  game.flagSkipped=(game.flagSkipped||0)+1;
  if(showSkipHint&&game.flagCurrent!=null)showFlagFb('→ '+iqDisplayName(game.flagCurrent),'#e0952a');
  updateFlagStats();
  nextFlag();
}

function nextFlag(){
  if(!game.flagQueue||game.flagQueue.length===0){showFlagResult();return;}
  game.flagCurrent=game.flagQueue.shift();
  const id=game.flagCurrent,mode=game.inputMode||'flag';
  const img=$('flag-img'),txt=$('iq-text'),out=$('iq-outline');
  img.style.display='none';txt.style.display='none';out.style.display='none';
  if(mode==='flag'){img.src='https://flagcdn.com/w320/'+ISO2[id]+'.png';img.style.display='';}
  else if(mode==='outline'){if(!renderOutline(id)){nextFlag();return;}out.style.display='';}
  else{txt.textContent=game.capitalDir==='c2cap'?(lang==='de'?C[id].de:C[id].en):(lang==='de'?CAPITALS[id].de:CAPITALS[id].en);txt.style.display='';}
  $('flag-quiz-lbl').textContent=iqAnswerCapital()?t('iqAskCapital'):t('iqAskCountry');
  const inp=$('flag-input');
  inp.value='';inp.placeholder=iqAnswerCapital()?t('capPlaceholder'):t('flagPlaceholder');
  $('flag-dropdown').style.display='none';
  _fMatches=[];_fDdIdx=0;
  $('flag-skip-btn').textContent=t('skipLbl');
  updateFlagStats();
  inp.focus();
  setTimeout(()=>inp.focus(),50);
}

function handleFlagInput(val){
  const v=norm(val.trim());
  if(!v||!showDropdown){$('flag-dropdown').style.display='none';_fMatches=[];if(!v)return;return;}
  const pool=(game&&game.flagPool)?(id=>game.flagPool.has(id)):(id=>!!ISO2[id]);
  const cap=iqAnswerCapital();
  const nameOf=id=>cap?(lang==='de'?CAPITALS[id].de:CAPITALS[id].en):(lang==='de'?C[id].de:C[id].en);
  _fMatches=Object.keys(C).map(Number).filter(id=>pool(id)&&(cap?CAPITALS[id]:true)&&norm(nameOf(id)).includes(v))
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
  const id=game.flagCurrent,tg=iqAnswerCapital()?CAPITALS[id]:C[id];
  if(val===norm(tg.de)||val===norm(tg.en)){
    game.flagCorrect++;game.flagFound.add(id);
    showFlagFb('✓ '+iqDisplayName(id),'#1D9E75');
    recordCorrectForCurrent();
    updateFlagStats();
    setTimeout(nextFlag,500);
  }else{
    game.flagWrong++;recordMissForCurrent();
    showFlagFb('✗ '+(lang==='de'?'Falsch!':'Wrong!'),'#D85A30');
    $('flag-input').value='';
    updateFlagStats();
  }
}

function updateFlagStats(){
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
  $('res-btn-back').textContent=t('back');$('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');
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
    name:{de:'Deutschland',en:'Germany'},
    sub:{de:'Bundesländer',en:'Federal States'},
    url:'https://cdn.jsdelivr.net/gh/AliceWi/TopoJSON-Germany@master/germany.json',
    objectKey:'states',nameKey:'name',count:16,
    proj:'fit',filter:null
  },
  US:{
    name:{de:'USA',en:'USA'},
    sub:{de:'Bundesstaaten',en:'States'},
    url:'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json',
    objectKey:'states',nameKey:'name',count:51,
    proj:'albers-usa',
    filter:f=>!['American Samoa','Guam','Commonwealth of the Northern Mariana Islands','Puerto Rico','United States Virgin Islands'].includes(f.properties.name)
  },
  FR:{
    name:{de:'Frankreich',en:'France'},
    sub:{de:'Regionen',en:'Regions'},
    url:'https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@master/regions.geojson',
    objectKey:null,nameKey:'nom',count:13,
    proj:'fit',filter:null,isGeoJSON:true
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

  _regGame={key,cfg,features,names,queue,pos:0,correct:0,wrong:0,skipped:0,firstTry:0,found:new Set(),skippedItems:new Set(),wrongOnCurrent:false,total:queue.length,busy:false};
  _renderRegionMap(cfg,features);
  _nextRegion();
}

function _renderRegionMap(cfg,features){
  const svg=d3.select('#reg-map');svg.selectAll('*').remove();
  const W=960,H=600;
  const fc={type:'FeatureCollection',features};
  const proj=cfg.proj==='albers-usa'
    ? d3.geoAlbersUsa().scale(1100).translate([W/2,H/2])
    : d3.geoMercator().fitExtent([[40,40],[W-40,H-40]],fc);
  const gpath=d3.geoPath().projection(proj);
  const th=THEMES[theme];
  svg.append('rect').attr('width',W).attr('height',H).attr('fill',th.bg);
  const g=svg.append('g');

  _regPaths=g.selectAll('.rg').data(features).enter().append('path').attr('class','rg')
    .attr('d',gpath)
    .attr('fill',th.avail)
    .attr('stroke',th.border).attr('stroke-width',1)
    .style('vector-effect','non-scaling-stroke')
    .style('cursor','pointer')
    .on('mouseover',function(ev,d){
      if(!_regGame||_regGame.found.has(d.properties[cfg.nameKey])||_regGame.skippedItems.has(d.properties[cfg.nameKey]))return;
      d3.select(this).attr('fill',th.hov);
    })
    .on('mouseout',function(ev,d){
      _updateRegionColors();
    })
    .on('click',(ev,d)=>_handleRegionClick(d));

  const zoom=d3.zoom().scaleExtent([1,8]).translateExtent([[0,0],[W,H]]).on('zoom',ev=>{
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
    _regPaths.filter(f=>f.properties[cfg.nameKey]===clickedName).attr('fill',THEMES[theme].wrong);
    setTimeout(_updateRegionColors,600);
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

function _showRegionResult(){
  if(!_regGame)return;
  const g=_regGame;
  const pct=g.total?Math.round(g.firstTry/g.total*100):0;
  $('reg-target-name').textContent=t('resTitle');
  $('reg-find-label').textContent=t('res1')(g.firstTry,g.total,pct);
  $('reg-btn-skip').style.display='none';
}

function regionBack(){
  _regGame=null;_regPaths=null;
  d3.select('#reg-map').selectAll('*').remove();
  goToGames(1);
}

renderHome();updateAllText();showScreen('home-screen');
