#!/usr/bin/env bash
# Capture living-room display shots in real TV Bro on an Android TV emulator.
# Opt-in local harness — not wired to CI, pre-commit, or pre-push.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/scripts/tvbro-device/lib.sh"

ARTIFACT_DIR="${TVBRO_ARTIFACT_DIR:-$ROOT/client/artifacts/tvbro-device}"
AVD_NAME="${TVBRO_AVD_NAME:-DrawPartyTvBro}"
TV_BRO_PACKAGE="${TVBRO_PACKAGE:-com.phlox.tvwebbrowser}"
TV_BRO_ACTIVITY="${TVBRO_ACTIVITY:-com.phlox.tvwebbrowser.activity.MainActivity}"
# Pinned release asset (WebView/Blink build — matches CI profile; update intentionally when bumping).
TV_BRO_APK_URL="${TVBRO_APK_URL:-https://github.com/truefedex/tv-bro/releases/download/v2.1.6/tvbro-2.1.6-generic-geckoExcluded.apk}"
TV_BRO_APK_PATH="${TVBRO_APK_PATH:-$ROOT/scripts/tvbro-device/.cache/tvbro-2.1.6-generic-geckoExcluded.apk}"
BASE_URL="${E2E_BASE_URL:-${DRAW_PARTY_URL:-http://10.0.2.2:3100}}"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

require_tools() {
  local missing=()
  command -v adb >/dev/null 2>&1 || missing+=("adb")
  command -v emulator >/dev/null 2>&1 || missing+=("emulator")
  if ((${#missing[@]} > 0)); then
    echo "error: missing required tools: ${missing[*]}" >&2
    print_setup_help
    exit 1
  fi
}

ensure_avd() {
  if emulator -list-avds 2>/dev/null | grep -qx "$AVD_NAME"; then
    return 0
  fi
  echo "error: Android TV AVD '$AVD_NAME' not found." >&2
  print_setup_help
  exit 1
}

wait_for_boot() {
  local tries=0
  until adb shell getprop sys.boot_completed 2>/dev/null | grep -q 1; do
    tries=$((tries + 1))
    if ((tries > 90)); then
      echo "error: emulator did not finish booting" >&2
      exit 1
    fi
    sleep 2
  done
}

ensure_emulator() {
  if adb devices | awk 'NR>1 && $2=="device" {print $1}' | grep -q .; then
    echo "Using already-connected adb device."
    return 0
  fi
  echo "Starting Android TV emulator '$AVD_NAME'…"
  # -no-window keeps CI-like headless hosts usable; local GUI hosts can unset TVBRO_NO_WINDOW=0
  local emu_args=(-avd "$AVD_NAME" -no-snapshot-save -gpu swiftshader_indirect)
  if [[ "${TVBRO_NO_WINDOW:-1}" != "0" ]]; then
    emu_args+=(-no-window -no-audio)
  fi
  emulator "${emu_args[@]}" >/tmp/draw-party-tvbro-emulator.log 2>&1 &
  adb wait-for-device
  wait_for_boot
}

ensure_apk() {
  mkdir -p "$(dirname "$TV_BRO_APK_PATH")"
  if [[ ! -f "$TV_BRO_APK_PATH" ]]; then
    echo "Downloading TV Bro APK…"
    if command -v curl >/dev/null 2>&1; then
      curl -fL --retry 3 -o "$TV_BRO_APK_PATH" "$TV_BRO_APK_URL"
    elif command -v wget >/dev/null 2>&1; then
      wget -O "$TV_BRO_APK_PATH" "$TV_BRO_APK_URL"
    else
      echo "error: need curl or wget to download TV Bro APK" >&2
      exit 1
    fi
  fi
  if ! adb shell pm path "$TV_BRO_PACKAGE" >/dev/null 2>&1; then
    echo "Installing TV Bro…"
    adb install -r "$TV_BRO_APK_PATH"
  fi
}

ensure_server() {
  if [[ -n "${E2E_BASE_URL:-}" || -n "${DRAW_PARTY_URL:-}" ]]; then
    echo "Using existing server at $BASE_URL"
    return 0
  fi
  local port=3100
  if curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
    echo "Reusing local server on :${port}"
    BASE_URL="http://10.0.2.2:${port}"
    return 0
  fi
  echo "Building client and starting Draw Party on :${port}…"
  npm --prefix "$ROOT/client" run build
  (
    cd "$ROOT"
    DRAW_PARTY_BIND="127.0.0.1:${port}" DRAW_PARTY_STATIC_DIR="$ROOT/client/dist" \
      cargo run --manifest-path "$ROOT/server/Cargo.toml"
  ) >/tmp/draw-party-tvbro-server.log 2>&1 &
  SERVER_PID=$!
  local tries=0
  until curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if ((tries > 90)); then
      echo "error: server failed to become healthy; see /tmp/draw-party-tvbro-server.log" >&2
      exit 1
    fi
    sleep 2
  done
  BASE_URL="http://10.0.2.2:${port}"
}

open_tvbro() {
  local url="$1"
  echo "Opening TV Bro at $url"
  adb shell am force-stop "$TV_BRO_PACKAGE" >/dev/null 2>&1 || true
  # Prefer VIEW intent so TV Bro loads the URL in its WebView.
  adb shell am start -a android.intent.action.VIEW -d "$url" "$TV_BRO_PACKAGE" >/dev/null 2>&1 \
    || adb shell am start -n "${TV_BRO_PACKAGE}/${TV_BRO_ACTIVITY}" --es url "$url" >/dev/null
  # Allow first paint / room create.
  sleep "${TVBRO_SETTLE_SECONDS:-8}"
}

capture_shot() {
  local name="$1"
  mkdir -p "$ARTIFACT_DIR"
  local path="$ARTIFACT_DIR/$name"
  adb exec-out screencap -p >"$path"
  echo "Wrote $path"
}

write_index() {
  local index="$ARTIFACT_DIR/index.html"
  {
    cat <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Draw Party TV Bro device review</title>
  <style>
    :root { color-scheme: dark; font-family: "DM Sans", system-ui, sans-serif; }
    body { margin: 0; padding: 24px; background: #05060a; color: #f5f5f7; }
    h1 { margin: 0 0 8px; font-size: 1.5rem; }
    p { margin: 0 0 24px; color: #a1a1a6; }
    main { display: grid; gap: 24px; }
    figure { margin: 0; border: 1px solid rgba(255,255,255,0.16); border-radius: 16px; overflow: hidden; background: #0c0e16; }
    figcaption { padding: 12px 16px; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.08); }
    img { display: block; width: 100%; height: auto; background: #000; }
  </style>
</head>
<body>
  <h1>Draw Party TV Bro device review</h1>
  <p>Real TV Bro on Android TV emulator. CI pixel baselines remain WebView-shaped Chromium.</p>
  <main>
HTML
    for shot in "$ARTIFACT_DIR"/*.png; do
      [[ -f "$shot" ]] || continue
      local base
      base="$(basename "$shot")"
      printf '    <figure>\n      <figcaption>%s</figcaption>\n      <img src="./%s" alt="%s" />\n    </figure>\n' "$base" "$base" "$base"
    done
    cat <<'HTML'
  </main>
</body>
</html>
HTML
  } >"$index"
  echo "Gallery: $index"
}

main() {
  require_tools
  ensure_avd
  ensure_emulator
  ensure_apk
  ensure_server
  open_tvbro "$BASE_URL/"
  capture_shot "tvbro-device-lobby.png"
  write_index
  echo "Done. Open $ARTIFACT_DIR/index.html"
}

main "$@"
