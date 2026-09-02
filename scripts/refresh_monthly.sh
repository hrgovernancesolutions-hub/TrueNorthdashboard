#!/usr/bin/env bash
# ============================================================
#  True North Dashboard - Monthly Data Refresh (Mac/Linux)
#
#  HOW TO USE:
#    1. Export the latest data from the source system.
#    2. Drop that file into the "incoming" folder next to this script.
#    3. Double-click this file (or run: ./refresh_monthly.sh)
#    4. The finished data/dashboard_data.js is revealed in Finder,
#       ready to drag into GitHub Desktop (or drop into github.com's
#       upload area) and commit/push.
#
#  ONE-TIME SETUP (optional but recommended): if you keep a local
#  clone of your GitHub repo, set GITHUB_REPO_PATH below to that
#  repo's data/dashboard_data.js path. The script will then write
#  the refreshed file directly into your repo folder too, so all
#  that's left is to commit and push in GitHub Desktop -- no manual
#  copying at all.
# ============================================================

GITHUB_REPO_PATH=""   # e.g. "/Users/you/Documents/GitHub/true-north-dashboard/data/dashboard_data.js"

cd "$(dirname "$0")"

LATEST=$(ls -t incoming/*.xlsx incoming/*.csv 2>/dev/null | head -n 1)

if [ -z "$LATEST" ]; then
    echo ""
    echo "ERROR: No .xlsx or .csv file found in the 'incoming' folder."
    echo "Drop this month's export there first, then run this script again."
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

echo ""
echo "Using latest export: $LATEST"
echo ""

OUTPUT_FILE="../data/dashboard_data.js"
python3 update_dashboard.py --input "$LATEST" --output "$OUTPUT_FILE"
STATUS=$?

if [ $STATUS -ne 0 ]; then
    echo ""
    echo "Something went wrong -- see the message above."
    echo "Common cause: the export is missing a required column."
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

FINAL_PATH="$(cd "$(dirname "$OUTPUT_FILE")" && pwd)/$(basename "$OUTPUT_FILE")"

if [ -n "$GITHUB_REPO_PATH" ]; then
    mkdir -p "$(dirname "$GITHUB_REPO_PATH")"
    cp "$FINAL_PATH" "$GITHUB_REPO_PATH"
    FINAL_PATH="$GITHUB_REPO_PATH"
    echo ""
    echo "Also copied straight into your GitHub repo folder:"
    echo "  $FINAL_PATH"
fi

echo ""
echo "============================================================"
echo " Refresh complete."
echo " File ready at:"
echo "   $FINAL_PATH"
if [ -n "$GITHUB_REPO_PATH" ]; then
    echo " Next step: open GitHub Desktop, commit, and push."
else
    echo " Next step: grab this file and replace it in your GitHub"
    echo " repo (drag into GitHub Desktop, or drop it on github.com's"
    echo " upload page), then commit and push."
    echo " Tip: set GITHUB_REPO_PATH at the top of this script to skip"
    echo " this manual copy step next time."
fi
echo "============================================================"
echo ""

# Reveal the file in Finder so it's one drag away from GitHub Desktop
if command -v open >/dev/null 2>&1; then
    open -R "$FINAL_PATH" 2>/dev/null
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$(dirname "$FINAL_PATH")" 2>/dev/null
fi

read -p "Press Enter to close..."
