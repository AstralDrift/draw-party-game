# Local TV Bro device harness

Opt-in screencap of Draw Party inside **real TV Bro** on an Android TV emulator.

CI already gates a WebView-shaped Chromium pixel preview (`npm run e2e:tvbro`). Use this when shipping lobby/display CSS and you want APK truth.

## Setup

1. Install Android command-line tools; put `adb`, `emulator`, `sdkmanager`, `avdmanager` on `PATH`.
2. Install an Android TV image and create AVD `DrawPartyTvBro` (override with `TVBRO_AVD_NAME`):

```bash
sdkmanager "system-images;android-34;android-tv;x86_64" "platforms;android-34" "emulator"
avdmanager create avd -n DrawPartyTvBro \
  -k "system-images;android-34;android-tv;x86_64" \
  -d "television_1080p"
```

3. Start Draw Party on the host (the harness does **not** build/start the server):

```bash
npm run build && DRAW_PARTY_BIND=127.0.0.1:3100 DRAW_PARTY_STATIC_DIR=client/dist \
  cargo run --manifest-path server/Cargo.toml
```

## Run

```bash
npm run review:tvbro:device
# or: E2E_BASE_URL=http://10.0.2.2:3100 npm run review:tvbro:device
```

Artifacts: `client/artifacts/tvbro-device/` (gitignored).

## Notes

- Not wired to pre-commit, pre-push, or CI.
- Headless emulator by default (`TVBRO_NO_WINDOW=0` for a window).
- From the emulator, host `127.0.0.1` is `10.0.2.2`.
- APK pinned via `TVBRO_APK_URL` in [`run.sh`](run.sh) (WebView / geckoExcluded build).
