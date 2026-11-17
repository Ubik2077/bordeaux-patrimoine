#!/bin/sh
# Regénère les affiches PDF avec Chrome ou Brave sans fenêtre :
#   affiche-port-de-la-lune.pdf     (A5, affiche.html)
#   affiche-port-de-la-lune-a3.pdf  (A3, affiche-a3.html : la ville entière et le résumé des 22 monuments)
#   affiche-port-de-la-lune-a2.pdf  (A2 murale, affiche-a3.html?a2 : la même, agrandie)
# Le site doit tourner en local : python3 -m http.server 8643 --bind 127.0.0.1
#
# Les images des cartes sont des captures de la carte 3D faites dans un navigateur :
# - A5 (img/affiche/carte.jpg) : ouvrir http://127.0.0.1:8643/?capture&vue=-0.5703,44.8382,15.3,-24,56  (fenêtre 1600 × 780)
#   (vue = longitude, latitude, zoom, orientation, inclinaison), puis enregistrer l'image de la carte.
# - A3 (img/affiche/carte-a3.jpg et carte-a3.json) : voir scripts/capture-a3.js.
set -e
cd "$(dirname "$0")/.."
for b in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
         "$(command -v chromium || true)" "$(command -v google-chrome || true)"; do
  [ -x "$b" ] && NAV="$b" && break
done
[ -n "$NAV" ] || { echo "Chrome ou Brave introuvable"; exit 1; }
TEMP_PROFIL="$(mktemp -d)"
PROFIL="${PROFIL:-$TEMP_PROFIL}"  # profil de navigateur jetable
for paire in "affiche.html affiche-port-de-la-lune.pdf" "affiche-a3.html affiche-port-de-la-lune-a3.pdf" "affiche-a3.html?a2 affiche-port-de-la-lune-a2.pdf"; do
  set -- $paire
  "$NAV" --headless --no-first-run --disable-extensions --use-mock-keychain --password-store=basic --user-data-dir="$PROFIL" --no-pdf-header-footer \
    --virtual-time-budget=8000 --print-to-pdf="$PWD/$2" "http://127.0.0.1:8643/$1" 2>/dev/null
  echo "✓ $2"
done
rm -rf "$TEMP_PROFIL"
