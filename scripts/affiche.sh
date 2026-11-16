#!/bin/sh
# Regénère affiche-clients.pdf (A5) à partir de affiche.html, avec Chrome ou Brave sans fenêtre.
# Le site doit tourner en local : python3 -m http.server 8643 --bind 127.0.0.1
#
# L'image de la carte (img/affiche/carte.jpg) est une capture de la carte 3D faite dans un navigateur :
#   ouvrir http://127.0.0.1:8643/?capture&vue=-0.5703,44.8382,15.3,-24,56  (fenêtre 1600 × 780)
#   (vue = longitude, latitude, zoom, orientation, inclinaison), puis enregistrer l'image de la carte.
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
"$NAV" --headless --no-first-run --disable-extensions --use-mock-keychain --password-store=basic --user-data-dir="$PROFIL" --no-pdf-header-footer \
  --virtual-time-budget=8000 --print-to-pdf="$PWD/affiche-clients.pdf" "http://127.0.0.1:8643/affiche.html" 2>/dev/null
rm -rf "$TEMP_PROFIL"
echo "✓ affiche-clients.pdf"
