// Trivia-Fragen mit einer festen Gruppe von Ländern (Bündnisse, Geschichte, Gebirge, Besonderheiten, Zahlen).
// Jede Frage ist eine Zeile: [Schlüssel, Kategorie, de, en, es, fr, Länder als ISO-2-Codes (Leerzeichen getrennt)].
// Sie werden unter die Rang-Fragen des Trivia-Quiz gemischt (game.triviaMode, game.currentGroup); Treffer sind
// nur bis zur nächsten Frage grün. Zahlen-Fragen (Einwohner) werden beim Start aus den Daten berechnet (siehe app.js).
// Neue Frage = neue Zeile. Länder, die es auf der Karte nicht gibt, werden übersprungen (test/groups.test.js prüft die Codes).
(function(){
'use strict';
const CATS=[
  {key:'history',icon:'🏺',t:['Geschichte & Kultur','History & culture','Historia y cultura','Histoire et culture'],s:['Reiche, Kolonien, Sprachen','Empires, colonies, languages','Imperios, colonias, idiomas','Empires, colonies, langues']},
  {key:'politics',icon:'🏛️',t:['Politik & Bündnisse','Politics & alliances','Política y alianzas','Politique et alliances'],s:['EU, NATO, G7, OPEC …','EU, NATO, G7, OPEC …','UE, OTAN, G7, OPEP …','UE, OTAN, G7, OPEP …']},
  {key:'geo',icon:'⛰️',t:['Gebirge & Geografie','Mountains & geography','Montañas y geografía','Montagnes et géographie'],s:['Alpen, Anden, Himalaya …','Alps, Andes, Himalayas …','Alpes, Andes, Himalaya …','Alpes, Andes, Himalaya …']},
  {key:'special',icon:'🚦',t:['Besonderheiten','Special features','Particularidades','Particularités'],s:['Linksverkehr, Monarchien, Flaggen','Left-hand traffic, monarchies, flags','Conducción por la izquierda, monarquías, banderas','Conduite à gauche, monarchies, drapeaux']},
  {key:'numbers',icon:'🔢',t:['Zahlen','Numbers','Cifras','Chiffres'],s:['Länder nach Einwohnerzahl','Countries by population','Países por población','Pays par population']}
];
const Q=[
 // ── Geschichte & Kultur ──
 ['roman','history','Römisches Reich','Roman Empire','Países que pertenecieron al Imperio romano (máxima extensión)','Pays ayant appartenu à l’Empire romain (extension maximale)','it fr es pt gb be nl lu ch at de hu si hr ba rs me mk al xk bg ro gr tr cy sy lb il jo eg ly tn dz ma mt'],
 ['silk','history','Seidenstraße','Silk Road','Países de la Ruta de la Seda','Pays de la route de la soie','cn kz kg tj uz tm af ir iq sy tr pk in ge az am'],
 ['ottoman','history','Osmanisches Reich','Ottoman Empire','Países que pertenecieron al Imperio otomano','Pays ayant appartenu à l’Empire ottoman','tr gr bg rs ba me al mk xk hu ro sy lb il jo iq eg ly tn dz sa ye kw cy'],
 ['ussr','history','Sowjetunion','Former Soviet Union','Antigua Unión Soviética','Ancienne Union soviétique','ru ua by md ee lv lt ge am az kz uz tm kg tj'],
 ['yugoslavia','history','Jugoslawien','Former Yugoslavia','Antigua Yugoslavia','Ancienne Yougoslavie','si hr ba rs me mk xk'],
 ['warsaw','history','Warschauer Pakt (Gründung)','Founding states of the Warsaw Pact (1955)','Estados fundadores del Pacto de Varsovia (1955)','États fondateurs du pacte de Varsovie (1955)','al bg cz sk hu pl ro ru de'],
 ['british','history','Britische Kolonien','Former British colonies (selection)','Antiguas colonias británicas (selección)','Anciennes colonies britanniques (sélection)','us ca au nz in pk bd lk mm my sg za ng gh ke tz ug zm zw bw mw sl gm jm bs bb tt gy bz fj cy mt ie sd ss ls sz mu sc'],
 ['french','history','Französische Kolonien','Former French colonies (selection)','Antiguas colonias francesas (selección)','Anciennes colonies françaises (sélection)','dz ma tn sn ml ne td bf ci gn bj tg cm cf cg ga mg dj km mr vn la kh lb sy ht vu'],
 ['spanish','history','Amtssprache Spanisch','Countries with Spanish as an official language','Países con el español como idioma oficial','Pays dont l’espagnol est langue officielle','es mx gt hn sv ni cr pa co ve ec pe bo py uy ar cl cu do gq'],
 ['portuguese','history','Amtssprache Portugiesisch','Countries with Portuguese as an official language','Países con el portugués como idioma oficial','Pays dont le portugais est langue officielle','pt br ao mz cv gw st tl gq'],
 ['arabic','history','Amtssprache Arabisch','Countries with Arabic as an official language','Países con el árabe como idioma oficial','Pays dont l’arabe est langue officielle','sa ye om ae qa bh kw iq sy jo lb ps eg ly tn dz ma sd mr so dj km td'],
 ['french_lang','history','Amtssprache Französisch','Countries with French as an official language (selection)','Países con el francés como idioma oficial (selección)','Pays dont le français est langue officielle (sélection)','fr be lu ch mc ca ht cd cg ga cm cf td ne ml bf ci gn sn bj tg mg dj km rw bi sc vu'],
 // ── Politik & Bündnisse ──
 ['eu','politics','EU-Staaten','EU members','Todos los Estados de la UE','Tous les États membres de l’UE','at be bg hr cy cz dk ee fi fr de gr hu ie it lv lt lu mt nl pl pt ro sk si es se'],
 ['euro','politics','Euro-Länder','Countries using the euro (EU)','Países que usan el euro (UE)','Pays utilisant l’euro (UE)','at be bg hr cy ee fi fr de gr ie it lv lt lu mt nl pt sk si es'],
 ['schengen','politics','Schengen-Raum','Countries of the Schengen Area','Países del espacio Schengen','Pays de l’espace Schengen','at be bg hr cz dk ee fi fr de gr hu it lv lt lu mt nl pl pt ro sk si es se is li no ch'],
 ['nato','politics','NATO-Mitglieder','NATO members','Miembros de la OTAN','Membres de l’OTAN','al be bg ca hr cz dk ee fi fr de gr hu is it lv lt lu me nl mk no pl pt ro sk si es se tr gb us'],
 ['g7','politics','G7-Staaten','G7 countries','Países del G7','Pays du G7','ca fr de it jp gb us'],
 ['g20','politics','G20-Staaten','G20 countries (without the EU and African Union)','Países del G20 (sin la UE ni la Unión Africana)','Pays du G20 (sans l’UE ni l’Union africaine)','ar au br ca cn fr de in id it jp kr mx ru sa za tr gb us'],
 ['brics','politics','BRICS-Mitglieder','BRICS members','Miembros de los BRICS','Membres des BRICS','br ru in cn za eg et ir ae id'],
 ['opec','politics','OPEC-Mitglieder','OPEC members','Miembros de la OPEP','Membres de l’OPEP','dz cg gq ga ir iq kw ly ng sa ae ve'],
 ['unsc','politics','Ständige Mitglieder im UN-Sicherheitsrat','Permanent members of the UN Security Council','Miembros permanentes del Consejo de Seguridad de la ONU','Membres permanents du Conseil de sécurité de l’ONU','cn fr ru gb us'],
 ['asean','politics','ASEAN-Mitglieder','ASEAN members','Miembros de la ASEAN','Membres de l’ASEAN','bn kh id la my mm ph sg th vn tl'],
 ['mercosur','politics','Mercosur-Mitglieder','Full members of Mercosur','Miembros plenos del Mercosur','Membres à part entière du Mercosur','ar br py uy bo'],
 // ── Gebirge & Geografie ──
 ['alps','geo','Länder an den Alpen','Countries in the Alps','Países con parte de los Alpes','Pays avec une part des Alpes','fr it ch de at li si mc'],
 ['andes','geo','Länder an den Anden','Countries in the Andes','Países con parte de los Andes','Pays avec une part des Andes','ve co ec pe bo cl ar'],
 ['himalaya','geo','Länder am Himalaya','Countries in the Himalayas','Países con parte del Himalaya','Pays avec une part de l’Himalaya','in np bt cn pk'],
 ['pyrenees','geo','Länder an den Pyrenäen','Countries in the Pyrenees','Países con parte de los Pirineos','Pays avec une part des Pyrénées','fr es ad'],
 ['carpathians','geo','Länder an den Karpaten','Countries in the Carpathians','Países con parte de los Cárpatos','Pays avec une part des Carpates','cz sk pl ua hu ro rs'],
 ['caucasus','geo','Länder am Kaukasus','Countries in the Caucasus','Países con parte del Cáucaso','Pays avec une part du Caucase','ru ge az am'],
 ['urals','geo','Länder am Ural','Countries in the Urals','Países con parte de los Urales','Pays avec une part de l’Oural','ru kz'],
 ['atlas','geo','Länder am Atlasgebirge','Countries in the Atlas Mountains','Países con parte del Atlas','Pays avec une part de l’Atlas','ma dz tn'],
 ['rockies','geo','Länder an den Rocky Mountains','Countries in the Rocky Mountains','Países con parte de las Montañas Rocosas','Pays avec une part des Rocheuses','ca us'],
 ['dinaric','geo','Dinarisches Gebirge','Countries in the Dinaric Alps','Países con parte de los Alpes Dináricos','Pays avec une part des Alpes dinariques','si hr ba me rs al xk'],
 ['tianshan','geo','Länder am Tian Shan','Countries in the Tian Shan','Países con parte del Tian Shan','Pays avec une part des monts Tian Shan','kg kz cn uz'],
 ['pamir','geo','Länder am Pamir','Countries in the Pamir','Países con parte del Pamir','Pays avec une part du Pamir','tj af cn kg pk'],
 ['scandes','geo','Länder am Skandinavischen Gebirge','Countries in the Scandinavian Mountains','Países con parte de los Alpes Escandinavos','Pays avec une part des montagnes scandinaves','no se'],
 ['drakensberg','geo','Länder an den Drakensbergen','Countries in the Drakensberg','Países con parte de los Drakensberg','Pays avec une part du Drakensberg','za ls sz'],
 ['sahara','geo','Länder an der Sahara','Countries in the Sahara','Países con parte del Sáhara','Pays avec une part du Sahara','dz eg ly mr ml ne td sd ma tn eh'],
 // ── Besonderheiten ──
 ['left','special','Linksverkehr','Left-hand traffic','Países con circulación por la izquierda','Pays où l’on roule à gauche','gb ie mt cy in pk bd lk np bt mv th id jp my sg bn tl au nz pg fj ki ws to sb tv nr za zw zm mz bw na sz ls ke tz ug mw mu sc sr gy jm bs bb tt ag dm gd lc vc kn'],
 ['monarchy','special','Monarchien','Monarchies','Países con monarquía','Pays avec une monarchie','gb es no se dk nl be lu li mc ad jp th kh my bn bt jo sa om qa kw bh ae ma ls sz au nz ca pg sb tv jm bs bz ag gd lc vc kn to'],
 ['flag_cross','special','Kreuz in der Flagge','Countries with a cross on the flag','Países con una cruz en la bandera','Pays avec une croix sur le drapeau','gb dk no se fi is ch ge gr mt to dm'],
 ['flag_crescent','special','Halbmond in der Flagge','Countries with a crescent on the flag','Países con una media luna en la bandera','Pays avec un croissant sur le drapeau','tr tn dz pk mr ly uz tm my sg mv km az'],
 ['flag_redwhite','special','Flagge nur in Rot und Weiß','Countries whose flag is only red and white','Países con bandera solo roja y blanca','Pays dont le drapeau est uniquement rouge et blanc','pl id mc at ca jp sg ch tn pe lv ge tr dk mt bh qa'],
 ['flag_pan','special','Grün, Gelb und Rot in der Flagge','Countries with green, yellow and red on the flag','Países con verde, amarillo y rojo en la bandera','Pays avec du vert, du jaune et du rouge sur le drapeau','gh sn ml gn cm et bj bf tg gw st bo lt gy'],
 ['flag_union','special','Union Jack in der Flagge','Countries with the Union Jack on the flag','Países con la Union Jack en la bandera','Pays avec l’Union Jack sur le drapeau','gb au nz fj tv'],
 ['flag_sun','special','Sonne in der Flagge','Countries with a sun on the flag','Países con un sol en la bandera','Pays avec un soleil sur le drapeau','ar uy mk kz kg jp ph ki rw'],
 ['flag_square','special','Quadratische Flagge','Countries with a square flag','Países con bandera cuadrada','Pays avec un drapeau carré','ch va']
];
// Zahlen: werden aus den Daten berechnet. f(pop,area,id) → true gehört zur Gruppe
const NUM=[
 ['pop100','numbers','Über 100 Mio. Einwohner','Countries with more than 100 million people','Países con más de 100 millones de habitantes','Pays de plus de 100 millions d’habitants',(p)=>p>1e8],
 ['pop50','numbers','50 bis 100 Mio. Einwohner','Countries with 50 to 100 million people','Países con 50 a 100 millones de habitantes','Pays de 50 à 100 millions d’habitants',(p)=>p>5e7&&p<=1e8],
 ['pop1','numbers','Unter 1 Mio. Einwohner','Countries with fewer than 1 million people','Países con menos de 1 millón de habitantes','Pays de moins d’un million d’habitants',(p)=>p<1e6],
 ['pop100k','numbers','Unter 100.000 Einwohner','Countries with fewer than 100,000 people','Países con menos de 100.000 habitantes','Pays de moins de 100 000 habitants',(p)=>p<1e5]
];
window.GROUP_CATS=CATS;window.GROUP_Q=Q;window.GROUP_NUM=NUM;
})();
