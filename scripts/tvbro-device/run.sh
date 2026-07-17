#!/usr/bin/env bash
# Local-only: screencap Draw Party in real TV Bro on an Android TV emulator.
# Not CI / not a git hook. Prefer an already-running server (E2E_BASE_URL or :3100).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARTIFACT_DIR="${TVBRO_ARTIFACT_DIR:-$ROOT/client/artifacts/tvbro-device}"
AVD_NAME="${TVBRO_AVD_NAME:-DrawPartyTvBro}"
TV_BRO_PACKAGE="${TVBRO_PACKAGE:-com.phlox.tvwebbrowser}"
TV_BRO_APK_URL="${TVBRO_APK_URL:-https://github.com/truefedex/tv-bro/releases/download/v2.1.6/tvbro-2.1.6-generic-geckoExcluded.apk}"
TV_BRO_APK_PATH="${TVBRO_APK_PATH:-$ROOT/scripts/tvbro-device/.cache/tvbro-2.1.6-generic-geckoExcluded.apk}"

print_setup_help() {
  cat >&2 <<'EOF'

Need Android SDK (adb, emulator) and AVD DrawPartyTvBro (or TVBRO_AVD_NAME).
See scripts/tvbro-device/README.md for sdkmanager / avdmanager commands.

Also start Draw Party first, then either:
  E2E_BASE_URL=http://10.0.2.2:3100 npm run review:tvbro:device
or leave a server healthy on 127.0.0.1:3100.

EOF
}

die() {
  echo "error: $*" >&2
  print_setup_help
  exit 1
}

command -v adb >/dev/null 2>&1 || die "missing adb"
command -v emulator >/dev/null 2>&1 || die "missing emulator"
emulator -list-avds 2>/dev/null | grep -qx "$AVD_NAME" || die "AVD '$AVD_NAME' not found"

if ! adb devices | awk 'NR>1 && $2=="device" {print $1}' | grep -q .; then
  echo "Starting emulator '$AVD_NAME'…"
  emu_args=(-avd "$AVD_NAME" -no-snapshot-save -gpu swiftshader_indirect)
  [[ "${TVBRO_NO_WINDOW:-1}" != "0" ]] && emu_args+=(-no-window -no-audio)
  emulator "${emu_args[@]}" >/tmp/draw-party-tvbro-emulator.log 2>&1 &
  adb wait-for-device
  for _ in $(seq 1 90); do
    adb shell getprop sys.boot_completed 2>/dev/null | grep -q 1 && break
    sleep 2
  done
  adb shell getprop sys.boot_completed 2>/dev/null | grep -q 1 || die "emulator did not boot"
fi

mkdir -p "$(dirname "$TV_BRO_APK_PATH")"
if [[ ! -f "$TV_BRO_APK_PATH" ]]; then
  echo "Downloading TV Bro APK…"
  command -v curl >/dev/null 2>&1 || die "need curl to download TV Bro APK"
  curl -fL --retry 3 -o "$TV_BRO_APK_PATH" "$TV_BRO_APK_URL"
fi
adb shell pm path "$TV_BRO_PACKAGE" >/dev/null 2>&1 || adb install -r "$TV_BRO_APK_PATH"

if [[ -n "${E2E_BASE_URL:-${DRAW_PARTY_URL:-}}" ]]; then
  BASE_URL="${E2E_BASE_URL:-$DRAW_PARTY_URL}"
elif curl -fsS "http://127.0.0.1:3100/api/health" >/dev/null 2>&1; then
  BASE_URL="http://10.0.2.2:3100"
else
  die "no server at E2E_BASE_URL / DRAW_PARTY_URL / 127.0.0.1:3100"
fi

echo "Opening TV Bro at $BASE_URL/"
adb shell am force-stop "$TV_BRO_PACKAGE" >/dev/null 2>&1 || true
adb shell am start -a android.intent.action.VIEW -d "$BASE_URL/" "$TV_BRO_PACKAGE" >/dev/null
sleep "${TVBRO_SETTLE_SECONDS:-8}"

mkdir -p "$ARTIFACT_DIR"
SHOT="$ARTIFACT_DIR/tvbro-device-lobby.png"
adb exec-out screencap -p >"$SHOT"
echo "Wrote $SHOT"

# Minimal gallery — avoid duplicating client/e2e TV review HTML.
{
  echo '<!doctype html><meta charset="utf-8"><title>TV Bro device review</title>'
  echo '<body style="margin:0;background:#05060a;color:#f5f5f7;font-family:system-ui;padding:24px">'
  echo '<h1>TV Bro device review</h1><p>Real APK capture. CI pixels remain WebView-shaped Chromium.</p>'
  echo "<figure><figcaption>tvbro-device-lobby.png</figcaption><img src=\"./tvbro-device-lobby.png\" style=\"max-width:100%\"></figure>"
  echo '</body>'
} >"$ARTIFACT_DIR/index.html"
echo "Gallery: $ARTIFACT_DIR/index.html"
