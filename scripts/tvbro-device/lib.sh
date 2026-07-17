#!/usr/bin/env bash
# Shared helpers / setup copy for the local TV Bro device harness.

print_setup_help() {
  cat >&2 <<'EOF'

Draw Party TV Bro device harness setup
======================================

This harness is local-only (not CI). It needs the Android SDK + an Android TV AVD.

1) Install Android command-line tools and accept licenses:
   https://developer.android.com/studio#command-tools

2) Put platform-tools + emulator on PATH (adb, emulator, sdkmanager, avdmanager).

3) Install an Android TV system image, e.g.:
   sdkmanager "system-images;android-34;android-tv;x86_64"
   sdkmanager "platforms;android-34" "emulator"

4) Create the AVD used by this script (default name DrawPartyTvBro):
   avdmanager create avd -n DrawPartyTvBro \
     -k "system-images;android-34;android-tv;x86_64" \
     -d "television_1080p"

   Override with TVBRO_AVD_NAME if you prefer a different AVD.

5) Optional env:
   E2E_BASE_URL / DRAW_PARTY_URL  Reachable URL from the emulator (use 10.0.2.2:PORT for host)
   TVBRO_APK_URL                 Pin a different TV Bro release APK
   TVBRO_NO_WINDOW=0             Show the emulator window locally
   TVBRO_ARTIFACT_DIR            Screenshot output dir

Then:
   npm run review:tvbro:device

EOF
}
