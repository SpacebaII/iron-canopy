#!/bin/sh
# Fetch the OpenStreetMap extracts the importer reads (brief 39): everything mapped round each airport, with a margin
# for its access roads (Peña Boulevard to the E-470 and I-70 at Denver; Century Boulevard to the I-405, the rental-car
# centre and the Metro station at Los Angeles). Tries overpass-api.de, then its mirrors.
#   sh tools/airports/fetch.sh [kden|klax]
cd "$(dirname "$0")"
q() {  # $1 bbox south,west,north,east
cat <<Q
[out:json][timeout:300][maxsize:200000000];
(
  nwr["aeroway"]($1);
  nwr["building"]($1);
  nwr["building:part"]($1);
  nwr["highway"]($1);
  nwr["amenity"~"parking|fire_station"]($1);
  nwr["railway"]($1);
  nwr["public_transport"]($1);
  nwr["man_made"~"storage_tank|tower|bridge"]($1);
);
(._; >;);
out body qt;
Q
}
get() {  # $1 key, $2 bbox
  for u in https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter https://maps.mail.ru/osm/tools/overpass/api/interpreter https://overpass.private.coffee/api/interpreter; do
    echo "$1: $u"
    if curl -sS -m 400 --data-urlencode "data=$(q "$2")" "$u" -o "$1.osm.json.part" && head -c 200 "$1.osm.json.part" | grep -q '"elements"'; then
      mv "$1.osm.json.part" "$1.osm.json"; ls -l "$1.osm.json"; return 0
    fi
  done
  rm -f "$1.osm.json.part"; echo "$1: every Overpass server failed"; return 1
}
[ -z "$1" -o "$1" = kden ] && get kden 39.770,-104.800,39.930,-104.580
[ -z "$1" -o "$1" = klax ] && get klax 33.915,-118.440,33.962,-118.365
