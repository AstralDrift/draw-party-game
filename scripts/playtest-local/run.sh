#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

npm run build

if command -v lsof >/dev/null 2>&1 && lsof -i :3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 3000 is already in use. Stop the other Draw Party server first." >&2
  exit 1
fi

lan_ips=()
if command -v ipconfig >/dev/null 2>&1; then
  for iface in en0 en1 en2; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [[ -n "$ip" ]]; then
      lan_ips+=("$ip")
    fi
  done
fi

echo ""
echo "Draw Party living-room playtest"
echo "Run npm run e2e:couch-loop first if you have not already."
echo ""
if ((${#lan_ips[@]} > 0)); then
  echo "Open on the TV (LAN, not 127.0.0.1):"
  for ip in "${lan_ips[@]}"; do
    echo "  http://${ip}:3000/"
  done
else
  echo "Open on the TV using this machine's LAN IP:"
  echo "  http://<your-lan-ip>:3000/"
fi
echo "Phones scan the TV QR or type the room code at the can't-scan URL."
if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "If phones cannot connect, allow draw-party-server through macOS Firewall (System Settings → Network → Firewall)."
fi
echo ""

exec env DRAW_PARTY_BIND=0.0.0.0:3000 DRAW_PARTY_STATIC_DIR=client/dist \
  cargo run --manifest-path server/Cargo.toml
