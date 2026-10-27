#!/bin/bash

#
# Prüfen, ob ein Argument übergeben wurde
if [ -z "$*" ]; then
  echo "Nutzung: $0 <Suchbegriff>"
  exit 1
fi

# Leerzeichen durch %20 ersetzen (URL-Encoding)
ENCODED_QUERY=$(echo "$*" | sed 's/ /%20/g')

# cURL Aufruf mit dynamischem Suchbegriff
curl -s "https://itunes.apple.com/search?term=${ENCODED_QUERY}&country=us&entity=song&limit=5" \
  | jq \
  | grep "artistName\|collectionName\|trackName" \
  | awk '/trackName/ {print $0 "\n"; next} 1'
