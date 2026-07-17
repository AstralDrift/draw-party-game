# Local TV Bro device harness

Opt-in screenshots of Draw Party inside **real TV Bro** on an Android TV emulator.

CI already gates a WebView-shaped Chromium pixel preview (`npm run e2e:tvbro`). Use this harness when shipping lobby/display CSS and you want APK truth before merge.

## Requirements

- Android SDK (`adb`, `emulator`, `sdkmanager`, `avdmanager` on `PATH`)
- Android TV AVD named `DrawPartyTvBro` (or set `TVBRO_AVD_NAME`)
- Network access to download a pinned TV Bro APK on first run

See `print_setup_help` in [`lib.sh`](lib.sh) for exact `sdkmanager` / `avdmanager` commands.

## Run

From the repo root (with or without a server already running):

```bash
npm run review:tvbro:device
```

Artifacts land in `client/artifacts/tvbro-device/` (gitignored) with an `index.html` gallery.

## Notes

- Not wired to pre-commit, pre-push, or CI — emulator setup is too heavy for every change.
- Emulator default is headless (`TVBRO_NO_WINDOW=1`). Set `TVBRO_NO_WINDOW=0` for a visible window.
- Host server is reached from the emulator as `http://10.0.2.2:3100` unless `E2E_BASE_URL` / `DRAW_PARTY_URL` is set.
- TV Bro APK URL is pinned via `TVBRO_APK_URL` in [`run.sh`](run.sh); bump intentionally.
