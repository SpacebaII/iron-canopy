/* The real places tools/city-sample.js measures (brief 65). Each patch is a square of `km` a side round a point,
   chosen as a clean example of one kind of urban fabric; the game's block forms (buildings.js) take their street
   spacing, plot depth and floors from the patches of their kind. The transects run from a city's centre out to its
   edge in one direction and give the density gradient (how coverage and height fall off with distance).
   Coordinates are WGS84 (lat, lon). The names are the real places'; the game itself never shows them. */
module.exports = {
  forms: {
    // medieval and early modern cores: narrow winding lanes, small deep plots, 3-6 floors
    old: [
      { name: 'Paris, Le Marais', at: [48.8585, 2.3580], km: 0.6 },
      { name: 'Prague, Staré Město', at: [50.0870, 14.4200], km: 0.6 },
      { name: 'Bologna, centro storico', at: [44.4940, 11.3430], km: 0.6 },
      { name: 'Florence, centro', at: [43.7710, 11.2540], km: 0.6 }
    ],
    // nineteenth-century perimeter blocks round courtyards
    court: [
      { name: 'Barcelona, Eixample', at: [41.3920, 2.1620], km: 0.7 },
      { name: 'Berlin, Prenzlauer Berg', at: [52.5390, 13.4180], km: 0.7 },
      { name: 'Vienna, Josefstadt', at: [48.2110, 16.3480], km: 0.7 },
      { name: 'Budapest, Terézváros', at: [47.5050, 19.0620], km: 0.7 }
    ],
    // downtowns: towers on podiums
    tower: [
      { name: 'New York, Midtown', at: [40.7560, -73.9800], km: 0.7 },
      { name: 'Chicago, the Loop', at: [41.8810, -87.6300], km: 0.7 },
      { name: 'Frankfurt, Bankenviertel', at: [50.1120, 8.6720], km: 0.7 },
      { name: 'Toronto, Financial District', at: [43.6480, -79.3810], km: 0.7 }
    ],
    // terraced houses in rows
    row: [
      { name: 'London, Barnsbury', at: [51.5400, -0.1100], km: 0.7 },
      { name: 'Philadelphia, South Philadelphia', at: [39.9270, -75.1650], km: 0.7 },
      { name: 'Leeds, Harehills', at: [53.8100, -1.5150], km: 0.7 },
      { name: 'Baltimore, Charles Village', at: [39.3240, -76.6150], km: 0.7 }
    ],
    // detached houses on a street grid
    house: [
      { name: 'Los Angeles, Van Nuys', at: [34.1850, -118.4500], km: 1.0 },
      { name: 'Minneapolis, Southwest', at: [44.9100, -93.2900], km: 1.0 },
      { name: 'Munich, Trudering', at: [48.1220, 11.6650], km: 1.0 },
      { name: 'Phoenix, Arcadia', at: [33.4950, -111.9700], km: 1.0 }
    ],
    // loops and cul-de-sacs
    cul: [
      { name: 'Las Vegas, Summerlin', at: [36.1700, -115.3100], km: 1.0 },
      { name: 'Houston, Katy', at: [29.7700, -95.7400], km: 1.0 },
      { name: 'Plano, Texas', at: [33.0400, -96.7700], km: 1.0 },
      { name: 'Calgary, Panorama Hills', at: [51.1600, -114.0800], km: 1.0 }
    ],
    // post-war estates: slabs and point blocks in green space
    slab: [
      { name: 'Berlin, Marzahn', at: [52.5440, 13.5640], km: 0.9 },
      { name: 'Warsaw, Ursynów', at: [52.1500, 21.0450], km: 0.9 },
      { name: 'Moscow, Yasenevo', at: [55.6050, 37.5300], km: 0.9 },
      { name: 'Bratislava, Petržalka', at: [48.1260, 17.1100], km: 0.9 }
    ],
    // business parks: low offices on lawns and car parks
    office: [
      { name: 'Irvine, Spectrum', at: [33.6500, -117.7400], km: 1.0 },
      { name: 'Eschborn, Süd', at: [50.1340, 8.5600], km: 1.0 }
    ],
    // works and factories
    shed: [
      { name: 'Duisburg, Bruckhausen works', at: [51.4950, 6.7350], km: 1.0 },
      { name: 'Dearborn, Rouge', at: [42.3030, -83.1600], km: 1.0 },
      { name: 'Chicago, Clearing', at: [41.7850, -87.7400], km: 1.0 }
    ],
    // warehouses and logistics parks
    ware: [
      { name: 'Ontario, California', at: [34.0330, -117.5600], km: 1.2 },
      { name: 'Duisburg, logport', at: [51.3965, 6.7230], km: 1.2 },
      { name: 'Venlo, Trade Port', at: [51.4000, 6.1300], km: 1.2 }
    ]
  },
  // old towns taken whole (streets and building footprints, from the OpenStreetMap vector tiles at zoom 14): a
  // European town's old town is laid out on one of them, turned and clipped to its own size (cities.js)
  cores: [
    { key: 'bologna', name: 'Bologna, centro storico', at: [44.4938, 11.3430], r: 1.0 },
    { key: 'nuremberg', name: 'Nuremberg, Altstadt', at: [49.4539, 11.0775], r: 1.0 },
    { key: 'bruges', name: 'Bruges, binnenstad', at: [51.2089, 3.2243], r: 1.0 },
    { key: 'krakow', name: 'Kraków, Stare Miasto', at: [50.0617, 19.9373], r: 0.9 },
    { key: 'lucca', name: 'Lucca, centro storico', at: [43.8433, 10.5047], r: 0.9 }
  ],
  // from the centre outwards: km along a compass heading (degrees, 0 north, 90 east), a patch of `km` at each
  transects: [
    { name: 'Paris, eastwards from Châtelet', at: [48.8590, 2.3470], hdg: 95, steps: [0, 1.5, 3, 5, 8, 12, 17], km: 0.5 },
    { name: 'Chicago, westwards from the Loop', at: [41.8810, -87.6300], hdg: 270, steps: [0, 1.5, 3, 5, 8, 12, 17], km: 0.5 },
    { name: 'Warsaw, southwards from Centrum', at: [52.2300, 21.0110], hdg: 190, steps: [0, 1.5, 3, 5, 8, 12, 17], km: 0.5 },
    { name: 'Madrid, northwards from Sol', at: [40.4168, -3.7038], hdg: 5, steps: [0, 1.5, 3, 5, 8, 12, 17], km: 0.5 }
  ]
};
