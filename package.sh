#!/bin/bash
# Builds the KDE Store upload: build/stacklet-<version>.kwinscript (a zip of package/).
# Uses bsdtar (libarchive, in base) because zip may not be installed.
set -eu
cd "$(dirname "$0")"
node test.js >/dev/null # no release with broken layout maths
version=$(sed -n 's/.*"Version": *"\([^"]*\)".*/\1/p' package/metadata.json)
out="build/stacklet-$version.kwinscript"
mkdir -p build
rm -f "$out"
bsdtar --format zip -cf "$out" -C package .
echo "$out"
bsdtar -tf "$out"
