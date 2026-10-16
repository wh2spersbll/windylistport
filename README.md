# Windy List app

A real app (not a website wrapper) for Android, iOS, Windows and Linux.
The UI lives in `www/` (plain HTML/CSS/JS, no build step) and reads data from the Windy List API
at https://windylist.pl/api. Account actions (sign in, register, submit a record) open the website.

## Required: update the API on your host (one file)
The app needs each level's list type (Classic / Platformer / Challenge) and points.
Upload `backend/api/index.php` to your host, replacing `api/index.php` (keep your `config.php` untouched).
It only adds read-only fields: `list_type`, `legacy`, `points` on levels, `top1_points` on list information,
`clan` on players, and the clan endpoints `/api/v1/clans/` and `/api/v1/clans/{id}/`.
Clans also need the Clan Profiles site update (`install-clans.php`) to have been installed; without it the Clans tab is just empty.
Without it every level shows under Classic.

## Build
Actions tab -> "Build apps" -> Run workflow. Downloads:
- Releases page: `Windy List Android (latest)` (.apk) and `Windy List iOS (latest)` (unsigned .ipa)
- Run artifacts: `desktop-ubuntu-latest` (.AppImage, .pacman, .tar.gz) and `desktop-windows-latest` (.exe)

## Local
`npm install && npm start` runs the desktop app. Change the server address in the app's Account tab.

## iOS
The IPA is unsigned: sign it with Sideloadly / AltStore / KSign, or a paid Apple Developer account.
