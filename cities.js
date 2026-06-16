// Städte-Daten: {name_de, name_en, lon, lat, country}
const CITIES = {
  // Deutschland
  DE_BERLIN: {name_de:'Berlin', name_en:'Berlin', lon:13.405, lat:52.52, country:'DE', difficulty:'easy'},
  DE_MUNICH: {name_de:'München', name_en:'Munich', lon:11.582, lat:48.137, country:'DE', difficulty:'easy'},
  DE_HAMBURG: {name_de:'Hamburg', name_en:'Hamburg', lon:10.0, lat:53.55, country:'DE', difficulty:'easy'},
  DE_COLOGNE: {name_de:'Köln', name_en:'Cologne', lon:6.961, lat:50.938, country:'DE', difficulty:'medium'},
  DE_FRANKFURT: {name_de:'Frankfurt', name_en:'Frankfurt', lon:8.68, lat:50.11, country:'DE', difficulty:'medium'},
  DE_STUTTGART: {name_de:'Stuttgart', name_en:'Stuttgart', lon:9.11, lat:48.77, country:'DE', difficulty:'medium'},
  DE_DUSSELDORF: {name_de:'Düsseldorf', name_en:'Düsseldorf', lon:6.778, lat:51.227, country:'DE', difficulty:'hard'},
  DE_DRESDEN: {name_de:'Dresden', name_en:'Dresden', lon:13.733, lat:51.05, country:'DE', difficulty:'hard'},

  // USA
  US_NYC: {name_de:'New York', name_en:'New York', lon:-74.006, lat:40.713, country:'US', difficulty:'easy'},
  US_LA: {name_de:'Los Angeles', name_en:'Los Angeles', lon:-118.243, lat:34.052, country:'US', difficulty:'easy'},
  US_CHICAGO: {name_de:'Chicago', name_en:'Chicago', lon:-87.629, lat:41.878, country:'US', difficulty:'easy'},
  US_HOUSTON: {name_de:'Houston', name_en:'Houston', lon:-95.369, lat:29.760, country:'US', difficulty:'medium'},
  US_PHOENIX: {name_de:'Phoenix', name_en:'Phoenix', lon:-112.074, lat:33.448, country:'US', difficulty:'medium'},
  US_MIAMI: {name_de:'Miami', name_en:'Miami', lon:-80.194, lat:25.761, country:'US', difficulty:'medium'},
  US_DENVER: {name_de:'Denver', name_en:'Denver', lon:-104.990, lat:39.739, country:'US', difficulty:'hard'},
  US_SEATTLE: {name_de:'Seattle', name_en:'Seattle', lon:-122.332, lat:47.606, country:'US', difficulty:'hard'},

  // Frankreich
  FR_PARIS: {name_de:'Paris', name_en:'Paris', lon:2.352, lat:48.856, country:'FR', difficulty:'easy'},
  FR_MARSEILLE: {name_de:'Marseille', name_en:'Marseille', lon:5.397, lat:43.296, country:'FR', difficulty:'easy'},
  FR_LYON: {name_de:'Lyon', name_en:'Lyon', lon:4.836, lat:45.764, country:'FR', difficulty:'easy'},
  FR_TOULOUSE: {name_de:'Toulouse', name_en:'Toulouse', lon:1.443, lat:43.604, country:'FR', difficulty:'medium'},
  FR_NICE: {name_de:'Nizza', name_en:'Nice', lon:7.262, lat:43.710, country:'FR', difficulty:'medium'},
  FR_NANTES: {name_de:'Nantes', name_en:'Nantes', lon:-1.552, lat:47.218, country:'FR', difficulty:'medium'},
  FR_STRASBOURG: {name_de:'Straßburg', name_en:'Strasbourg', lon:7.753, lat:48.573, country:'FR', difficulty:'hard'},
  FR_BORDEAUX: {name_de:'Bordeaux', name_en:'Bordeaux', lon:-0.576, lat:44.841, country:'FR', difficulty:'hard'}
};

// Länder-Gruppen für Quiz-Modi
const CITY_COUNTRIES = {
  DE: {label_de:'Deutschland', label_en:'Germany', cities:Object.entries(CITIES).filter(([k,v])=>v.country==='DE').map(([k,v])=>v)},
  US: {label_de:'USA', label_en:'USA', cities:Object.entries(CITIES).filter(([k,v])=>v.country==='US').map(([k,v])=>v)},
  FR: {label_de:'Frankreich', label_en:'France', cities:Object.entries(CITIES).filter(([k,v])=>v.country==='FR').map(([k,v])=>v)}
};

function getCitiesByDifficulty(country, difficulty) {
  if(!CITY_COUNTRIES[country]) return [];
  return CITY_COUNTRIES[country].cities.filter(c=>c.difficulty===difficulty);
}

function getAllCitiesByDifficulty(difficulty) {
  return Object.values(CITIES).filter(c=>c.difficulty===difficulty);
}

// Drop-A-Pin: 20 europäische Städte (Hauptstädte/Großstädte, gut verteilt)
const PIN_CITIES_EU = [
  {name_de:'London', name_en:'London', lon:-0.1276, lat:51.5072},
  {name_de:'Paris', name_en:'Paris', lon:2.3522, lat:48.8566},
  {name_de:'Berlin', name_en:'Berlin', lon:13.405, lat:52.52},
  {name_de:'Madrid', name_en:'Madrid', lon:-3.7038, lat:40.4168},
  {name_de:'Rom', name_en:'Rome', lon:12.4964, lat:41.9028},
  {name_de:'Wien', name_en:'Vienna', lon:16.3738, lat:48.2082},
  {name_de:'Amsterdam', name_en:'Amsterdam', lon:4.9041, lat:52.3676},
  {name_de:'Brüssel', name_en:'Brussels', lon:4.3517, lat:50.8503},
  {name_de:'Lissabon', name_en:'Lisbon', lon:-9.1393, lat:38.7223},
  {name_de:'Warschau', name_en:'Warsaw', lon:21.0122, lat:52.2297},
  {name_de:'Prag', name_en:'Prague', lon:14.4378, lat:50.0755},
  {name_de:'Budapest', name_en:'Budapest', lon:19.0402, lat:47.4979},
  {name_de:'Stockholm', name_en:'Stockholm', lon:18.0686, lat:59.3293},
  {name_de:'Oslo', name_en:'Oslo', lon:10.7522, lat:59.9139},
  {name_de:'Kopenhagen', name_en:'Copenhagen', lon:12.5683, lat:55.6761},
  {name_de:'Helsinki', name_en:'Helsinki', lon:24.9384, lat:60.1699},
  {name_de:'Athen', name_en:'Athens', lon:23.7275, lat:37.9838},
  {name_de:'Dublin', name_en:'Dublin', lon:-6.2603, lat:53.3498},
  {name_de:'Bukarest', name_en:'Bucharest', lon:26.1025, lat:44.4268},
  {name_de:'Kiew', name_en:'Kyiv', lon:30.5234, lat:50.4501}
];
