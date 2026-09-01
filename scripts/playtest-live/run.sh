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
echo "Next: open ${url}/ on the TV and run a loud-room round with real phones."
