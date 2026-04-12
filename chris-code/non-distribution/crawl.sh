#!/bin/bash

tmp_file="$(mktemp d/crawl.XXXXXX)"

echo "$1" >>/dev/stderr

if ! curl -skL --retry 3 --retry-delay 1 --retry-connrefused "$1" >"$tmp_file"; then
  rm -f "$tmp_file"
  exit 1
fi

# echo "$1" >>/dev/stderr

echo "$1" >>d/visited.txt
# normalized_url=$(echo "$1" | sed 's/[?#].*//')

# echo "$normalized_url" >>d/visited.txt
echo "[crawl] crawled $1">/dev/stderr

# echo c/getURLs.js "$1" <"$tmp_file" | grep -vxf d/visited.txt | grep "food.com/recipe" >/dev/stderr
# only add urls which match food.com/recipe to urls.txt
c/getURLs.js "$1" <"$tmp_file" | grep -vxf d/visited.txt | grep 'food.com/recipe' >>d/urls.txt
c/getText.js <"$tmp_file"

rm -f "$tmp_file"
