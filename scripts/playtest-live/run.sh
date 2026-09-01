#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

url="${PLAYTEST_URL:-https://drawparty.up.railway.app}"
url="${url%/}"

echo "Draw Party live playtest"
echo "Target: ${url}"
echo ""

health="$(curl -sf "${url}/api/health")"
sha="$(python3 -c "import json,sys; print(json.load(sys.stdin).get('gitSha','unknown')[:12])" <<<"${health}")"
branch="$(python3 -c "import json,sys; print(json.load(sys.stdin).get('gitBranch','unknown'))" <<<"${health}")"
echo "Health OK · ${branch} @ ${sha}"
echo ""
echo "Running couch-loop e2e against live (creates ephemeral rooms on the server)..."
echo ""

E2E_BASE_URL="${url}" npm run e2e:couch-loop

echo ""
echo "Live couch-loop gate passed on ${url}"
echo ""
echo "Loud-room manual checklist (TV + 3+ real phones):"
echo "  Join   · TV shows QR + code first; phones join without typing the URL"
echo "  Draw   · Canvas + Submit reachable; host +30 extends the TV clock if someone stalls"
echo "  Fake   · Title field above keyboard; after submit phone says Watch the TV; host +30 adds TV time"
echo "  Vote   · Letter grid only; after pick phone clears to Look up; host +30 adds TV time"
echo "  Reveal · TV punchline readable; phones show personal score; host Continue advances"
echo "  Rematch· Host phone Play Again resets scores for round 2"
echo ""
echo "Open on the TV: ${url}/"
