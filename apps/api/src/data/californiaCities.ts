export type CaliforniaCity = {
  city: string;
  state: "CA";
  county: string;
  population: number;
  lat?: number;
  lng?: number;
};

export const CALIFORNIA_CITIES: CaliforniaCity[] = [
  // Major metros
  { city: "Los Angeles",    state: "CA", county: "Los Angeles",  population: 3900000, lat: 34.0522,  lng: -118.2437 },
  { city: "San Diego",      state: "CA", county: "San Diego",    population: 1430000, lat: 32.7157,  lng: -117.1611 },
  { city: "San Jose",       state: "CA", county: "Santa Clara",  population: 1013000, lat: 37.3382,  lng: -121.8863 },
  { city: "San Francisco",  state: "CA", county: "San Francisco",population: 874000,  lat: 37.7749,  lng: -122.4194 },
  { city: "Fresno",         state: "CA", county: "Fresno",       population: 545000,  lat: 36.7378,  lng: -119.7871 },
  { city: "Sacramento",     state: "CA", county: "Sacramento",   population: 524000,  lat: 38.5816,  lng: -121.4944 },
  { city: "Long Beach",     state: "CA", county: "Los Angeles",  population: 466000,  lat: 33.7701,  lng: -118.1937 },
  { city: "Oakland",        state: "CA", county: "Alameda",      population: 440000,  lat: 37.8044,  lng: -122.2712 },
  { city: "Bakersfield",    state: "CA", county: "Kern",         population: 408000,  lat: 35.3733,  lng: -119.0187 },
  { city: "Anaheim",        state: "CA", county: "Orange",       population: 350000,  lat: 33.8366,  lng: -117.9143 },
  { city: "Santa Ana",      state: "CA", county: "Orange",       population: 333000,  lat: 33.7455,  lng: -117.8677 },
  { city: "Riverside",      state: "CA", county: "Riverside",    population: 330000,  lat: 33.9806,  lng: -117.3755 },
  { city: "Stockton",       state: "CA", county: "San Joaquin",  population: 320000,  lat: 37.9577,  lng: -121.2908 },
  { city: "Irvine",         state: "CA", county: "Orange",       population: 310000,  lat: 33.6846,  lng: -117.8265 },
  { city: "Chula Vista",    state: "CA", county: "San Diego",    population: 285000,  lat: 32.6401,  lng: -117.0842 },
  { city: "Fremont",        state: "CA", county: "Alameda",      population: 233000,  lat: 37.5485,  lng: -121.9886 },
  { city: "San Bernardino", state: "CA", county: "San Bernardino",population: 230000, lat: 34.1083,  lng: -117.2898 },
  { city: "Modesto",        state: "CA", county: "Stanislaus",   population: 220000,  lat: 37.6391,  lng: -120.9969 },
  { city: "Fontana",        state: "CA", county: "San Bernardino",population: 215000, lat: 34.0922,  lng: -117.4350 },
  { city: "Moreno Valley",  state: "CA", county: "Riverside",    population: 210000,  lat: 33.9425,  lng: -117.2297 },
  { city: "Glendale",       state: "CA", county: "Los Angeles",  population: 200000,  lat: 34.1425,  lng: -118.2551 },
  { city: "Huntington Beach",state:"CA", county: "Orange",       population: 200000,  lat: 33.6595,  lng: -117.9988 },
  { city: "Santa Clarita",  state: "CA", county: "Los Angeles",  population: 193000,  lat: 34.3917,  lng: -118.5426 },
  { city: "Garden Grove",   state: "CA", county: "Orange",       population: 175000,  lat: 33.7743,  lng: -117.9378 },
  { city: "Oceanside",      state: "CA", county: "San Diego",    population: 175000,  lat: 33.1959,  lng: -117.3795 },
  { city: "Rancho Cucamonga",state:"CA", county: "San Bernardino",population: 175000, lat: 34.1064,  lng: -117.5931 },
  { city: "Santa Rosa",     state: "CA", county: "Sonoma",       population: 178000,  lat: 38.4404,  lng: -122.7141 },
  { city: "Ontario",        state: "CA", county: "San Bernardino",population: 173000, lat: 34.0633,  lng: -117.6509 },
  { city: "Elk Grove",      state: "CA", county: "Sacramento",   population: 176000,  lat: 38.4088,  lng: -121.3716 },
  { city: "Pomona",         state: "CA", county: "Los Angeles",  population: 151000,  lat: 34.0553,  lng: -117.7500 },
  { city: "Lancaster",      state: "CA", county: "Los Angeles",  population: 157000,  lat: 34.6868,  lng: -118.1542 },
  { city: "Palmdale",       state: "CA", county: "Los Angeles",  population: 153000,  lat: 34.5794,  lng: -118.1165 },
  { city: "Hayward",        state: "CA", county: "Alameda",      population: 162000,  lat: 37.6688,  lng: -122.0808 },
  { city: "Sunnyvale",      state: "CA", county: "Santa Clara",  population: 155000,  lat: 37.3688,  lng: -122.0363 },
  { city: "Salinas",        state: "CA", county: "Monterey",     population: 157000,  lat: 36.6777,  lng: -121.6555 },
  { city: "Torrance",       state: "CA", county: "Los Angeles",  population: 147000,  lat: 33.8358,  lng: -118.3406 },
  { city: "Escondido",      state: "CA", county: "San Diego",    population: 152000,  lat: 33.1192,  lng: -117.0864 },
  { city: "Pasadena",       state: "CA", county: "Los Angeles",  population: 141000,  lat: 34.1478,  lng: -118.1445 },
  { city: "Fullerton",      state: "CA", county: "Orange",       population: 140000,  lat: 33.8704,  lng: -117.9243 },
  { city: "Roseville",      state: "CA", county: "Placer",       population: 147000,  lat: 38.7521,  lng: -121.2880 },
  { city: "Visalia",        state: "CA", county: "Tulare",       population: 141000,  lat: 36.3302,  lng: -119.2921 },
  { city: "Concord",        state: "CA", county: "Contra Costa", population: 130000,  lat: 37.9780,  lng: -122.0311 },
  { city: "Victorville",    state: "CA", county: "San Bernardino",population: 128000, lat: 34.5362,  lng: -117.2928 },
  { city: "Simi Valley",    state: "CA", county: "Ventura",      population: 126000,  lat: 34.2694,  lng: -118.7815 },
  { city: "Thousand Oaks",  state: "CA", county: "Ventura",      population: 127000,  lat: 34.1706,  lng: -118.8376 },
  { city: "Berkeley",       state: "CA", county: "Alameda",      population: 124000,  lat: 37.8716,  lng: -122.2727 },
  { city: "Corona",         state: "CA", county: "Riverside",    population: 168000,  lat: 33.8753,  lng: -117.5664 },
  { city: "Murrieta",       state: "CA", county: "Riverside",    population: 116000,  lat: 33.5539,  lng: -117.2139 },
  { city: "Downey",         state: "CA", county: "Los Angeles",  population: 114000,  lat: 33.9401,  lng: -118.1332 },
  { city: "Costa Mesa",     state: "CA", county: "Orange",       population: 113000,  lat: 33.6411,  lng: -117.9187 },
  { city: "Inglewood",      state: "CA", county: "Los Angeles",  population: 109000,  lat: 33.9617,  lng: -118.3531 },
  { city: "Ventura",        state: "CA", county: "Ventura",      population: 110000,  lat: 34.2746,  lng: -119.2290 },
  { city: "West Covina",    state: "CA", county: "Los Angeles",  population: 107000,  lat: 34.0686,  lng: -117.9390 },
  { city: "Vallejo",        state: "CA", county: "Solano",       population: 121000,  lat: 38.1041,  lng: -122.2566 },
  { city: "El Monte",       state: "CA", county: "Los Angeles",  population: 115000,  lat: 34.0686,  lng: -118.0276 },
  { city: "Norwalk",        state: "CA", county: "Los Angeles",  population: 102000,  lat: 33.9022,  lng: -118.0817 },
  { city: "Burbank",        state: "CA", county: "Los Angeles",  population: 104000,  lat: 34.1808,  lng: -118.3090 },
  { city: "Antioch",        state: "CA", county: "Contra Costa", population: 115000,  lat: 37.9963,  lng: -121.8058 },
  { city: "Temecula",       state: "CA", county: "Riverside",    population: 116000,  lat: 33.4936,  lng: -117.1484 },
  { city: "Richmond",       state: "CA", county: "Contra Costa", population: 115000,  lat: 37.9358,  lng: -122.3477 },
  { city: "Daly City",      state: "CA", county: "San Mateo",    population: 104000,  lat: 37.6879,  lng: -122.4702 },
  { city: "Clovis",         state: "CA", county: "Fresno",       population: 120000,  lat: 36.8252,  lng: -119.7029 },
  // Bay Area
  { city: "San Mateo",      state: "CA", county: "San Mateo",    population: 105000,  lat: 37.5630,  lng: -122.3255 },
  { city: "Santa Clara",    state: "CA", county: "Santa Clara",  population: 128000,  lat: 37.3541,  lng: -121.9552 },
  { city: "Pleasanton",     state: "CA", county: "Alameda",      population: 84000,   lat: 37.6624,  lng: -121.8747 },
  { city: "Livermore",      state: "CA", county: "Alameda",      population: 92000,   lat: 37.6819,  lng: -121.7681 },
  { city: "San Ramon",      state: "CA", county: "Contra Costa", population: 84000,   lat: 37.7799,  lng: -121.9780 },
  { city: "Walnut Creek",   state: "CA", county: "Contra Costa", population: 71000,   lat: 37.9101,  lng: -122.0652 },
  { city: "Redwood City",   state: "CA", county: "San Mateo",    population: 86000,   lat: 37.4852,  lng: -122.2364 },
  { city: "Palo Alto",      state: "CA", county: "Santa Clara",  population: 68000,   lat: 37.4419,  lng: -122.1430 },
  { city: "Mountain View",  state: "CA", county: "Santa Clara",  population: 82000,   lat: 37.3861,  lng: -122.0839 },
  { city: "San Leandro",    state: "CA", county: "Alameda",      population: 91000,   lat: 37.7249,  lng: -122.1561 },
  { city: "Petaluma",       state: "CA", county: "Sonoma",       population: 62000,   lat: 38.2324,  lng: -122.6367 },
  { city: "Napa",           state: "CA", county: "Napa",         population: 80000,   lat: 38.2975,  lng: -122.2869 },
  // Southern California
  { city: "Oxnard",         state: "CA", county: "Ventura",      population: 203000,  lat: 34.1975,  lng: -119.1771 },
  { city: "Orange",         state: "CA", county: "Orange",       population: 140000,  lat: 33.7879,  lng: -117.8531 },
  { city: "Compton",        state: "CA", county: "Los Angeles",  population: 97000,   lat: 33.8958,  lng: -118.2201 },
  { city: "El Cajon",       state: "CA", county: "San Diego",    population: 105000,  lat: 32.7948,  lng: -116.9625 },
  { city: "Vista",          state: "CA", county: "San Diego",    population: 101000,  lat: 33.2000,  lng: -117.2425 },
  { city: "Carlsbad",       state: "CA", county: "San Diego",    population: 115000,  lat: 33.1581,  lng: -117.3506 },
  { city: "Hemet",          state: "CA", county: "Riverside",    population: 89000,   lat: 33.7475,  lng: -116.9719 },
  { city: "Covina",         state: "CA", county: "Los Angeles",  population: 48000,   lat: 34.0900,  lng: -117.8903 },
  { city: "Hawthorne",      state: "CA", county: "Los Angeles",  population: 87000,   lat: 33.9164,  lng: -118.3526 },
  { city: "Jurupa Valley",  state: "CA", county: "Riverside",    population: 107000,  lat: 33.9972,  lng: -117.4854 },
  { city: "Menifee",        state: "CA", county: "Riverside",    population: 102000,  lat: 33.6971,  lng: -117.1850 },
  // Central Valley
  { city: "Turlock",        state: "CA", county: "Stanislaus",   population: 73000,   lat: 37.4947,  lng: -120.8466 },
  { city: "Merced",         state: "CA", county: "Merced",       population: 84000,   lat: 37.3022,  lng: -120.4830 },
  { city: "Hanford",        state: "CA", county: "Kings",        population: 57000,   lat: 36.3274,  lng: -119.6457 },
  { city: "Tulare",         state: "CA", county: "Tulare",       population: 67000,   lat: 36.2077,  lng: -119.3473 },
  { city: "Madera",         state: "CA", county: "Madera",       population: 67000,   lat: 36.9613,  lng: -120.0607 },
  { city: "Manteca",        state: "CA", county: "San Joaquin",  population: 84000,   lat: 37.7977,  lng: -121.2163 },
  { city: "Tracy",          state: "CA", county: "San Joaquin",  population: 96000,   lat: 37.7397,  lng: -121.4252 },
  { city: "Lodi",           state: "CA", county: "San Joaquin",  population: 67000,   lat: 38.1302,  lng: -121.2724 },
  // Northern California
  { city: "Chico",          state: "CA", county: "Butte",        population: 103000,  lat: 39.7285,  lng: -121.8375 },
  { city: "Redding",        state: "CA", county: "Shasta",       population: 93000,   lat: 40.5865,  lng: -122.3917 },
  { city: "Yuba City",      state: "CA", county: "Sutter",       population: 69000,   lat: 39.1404,  lng: -121.6169 },
  { city: "Woodland",       state: "CA", county: "Yolo",         population: 60000,   lat: 38.6785,  lng: -121.7733 },
  { city: "Davis",          state: "CA", county: "Yolo",         population: 68000,   lat: 38.5449,  lng: -121.7405 },
  { city: "Fairfield",      state: "CA", county: "Solano",       population: 120000,  lat: 38.2494,  lng: -122.0400 },
  { city: "Vacaville",      state: "CA", county: "Solano",       population: 103000,  lat: 38.3566,  lng: -121.9877 },
];

/**
 * Look up lat/lng for a California city by name.
 * Returns null if the city is not found in the dataset.
 */
export function getCityLatLng(cityName: string): { lat: number; lng: number } | null {
  const found = CALIFORNIA_CITIES.find(
    (c) => c.city.toLowerCase() === cityName.toLowerCase()
  );
  if (found?.lat != null && found?.lng != null) {
    return { lat: found.lat, lng: found.lng };
  }
  return null;
}
