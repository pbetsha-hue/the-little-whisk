#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo "Node.js is not installed. Get the LTS version from https://nodejs.org and run this again."
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
[ -f data/little-whisk.db ] || node --disable-warning=ExperimentalWarning src/seed.js
(sleep 2 && (open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null)) &
echo "  Shop:  http://localhost:3000"
echo "  Admin: http://localhost:3000/admin"
node --disable-warning=ExperimentalWarning src/server.js
