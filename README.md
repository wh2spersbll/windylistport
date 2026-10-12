# Windy List apps

Native shells around the live Windy List site (https://windylist.pl).
The PHP + MySQL backend stays on your web host; these apps are clients.
To change the address, edit `SITE_URL` in `desktop/main.js` and `server.url` in `capacitor.config.json`.

## Build everything (recommended)
1. Push this folder to a GitHub repo.
2. Actions tab -> "Build apps" -> Run workflow.
3. Download artifacts:
   - `desktop-ubuntu-latest`: `.AppImage`, `.pacman`, `.tar.gz` (Arch: `sudo pacman -U "Windy List-*.pacman"`, or `chmod +x *.AppImage && ./*.AppImage`)
   - `desktop-windows-latest`: NSIS installer `.exe` and portable `.exe`
   - `WindyList-apk`: `app-debug.apk` (enable "install unknown apps")
   - `WindyList-ipa`: `WindyList-unsigned.ipa`

## iOS notes
The IPA is unsigned. Install it by signing with your Apple ID via Sideloadly or AltStore (7-day certs on a free account),
or sign it with a paid Apple Developer account for TestFlight/App Store. Apple often rejects pure website wrappers
(guideline 4.2), so expect to add native features before an App Store submission.

## Local builds
- Desktop: `npm install && npm start` (run), `npm run dist:linux` / `dist:win` (Windows installers are best built on Windows).
- Android: `npm install && npx cap add android && npx cap sync android`, then build in Android Studio.
- iOS: needs macOS + Xcode: `npx cap add ios && npx cap open ios`.
