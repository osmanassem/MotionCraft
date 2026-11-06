#!/bin/sh
# Runs the MotionCraft tests headless: effectcraft-cli must be on PATH or in $EC.
set -e
here=$(cd "$(dirname "$0")" && pwd)
EC=${EC:-effectcraft-cli}
tmp=$(mktemp -d)
{ echo "var MOTIONCRAFT_NO_UI = true;"; cat "$here/../MotionCraft.jsx"; echo; cat "$here/test.jsx"; } > "$tmp/all.jsx"
"$EC" script "$tmp/all.jsx" --empty "$@"
