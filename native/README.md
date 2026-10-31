# Virulenter — native app

The same counter as the web app, written once in **Kotlin Multiplatform** with
**Compose Multiplatform**, and native on each platform it runs on:

| | Android | Windows · macOS · Linux |
|---|---|---|
| **Runs as** | an APK (minSdk 26, targetSdk 35) | an installer: `.msi`, `.dmg`, `.deb` |
| **Live counter** | an ongoing notification: today's count, a **clock running from the last tap** (a system chronometer, so it ticks with the app closed), **+1** and **Undo**, and a progress bar when the event has a goal | a small always-on-top **mini counter** window with the same clock and a +1 button |
| **Reminders** | daily, per event, on chosen weekdays — `AlarmManager`, exact to the minute once you allow alarms, re-armed after a reboot or a time-zone change; the notification has a **+1** button | the same schedule, checked by the app while it runs (closing the window keeps it in the tray) |
| **One-tap counting** | Quick Settings **tile**, home-screen **widget** (count, live clock, +1), long-press **launcher shortcuts** ("+1 Coffee") | **tray menu** with +1 for every event; **Ctrl/⌘ 1–9** counts the first nine events |
| **Goals** | a ring on the card, progress in the live notification, a notification when reached | the ring on the card |
| **Files** | backups through the system document picker; share a link or backup text *to* Virulenter to import it | native open / save dialogs |
| **Theme** | follows the system, or set light/dark; bars follow the app | follows the system; dark title bar on macOS |

Everything else — events, the tap log, the calendar heat grid, the statistics
dashboard with its interactive charts, appearance (accent, custom colour,
typeface, theme), merge-or-replace import, undo — is common code shared by
every platform.

## The material

Futuristic, elegant, and mostly glass:

- **Backdrop:** an aurora derived from your accent, a fine light grid that fades
  down the page, and one defined orb — structure for the frost to act on.
- **Panes:** real backdrop blur ([Haze](https://github.com/chrisbanes/haze): a
  `RenderEffect` on Android 12+, Skia on desktop), a tint, a fine grain, and a
  1 dp rim lit from the top left. On Android 11 and older, where there is no
  blur, the tint thickens instead.
- **Tight corners** (4–16 dp): the material, not the rounding, carries the look.
- **Motion:** counts roll, the tap button sinks and throws a "+1", charts grow
  in, months slide, sheets rise.

The icon is generated with the rest (`node tools/icon.mjs`): adaptive and themed
layers for Android, `.ico` for Windows, `.icns` for macOS, `.png` for Linux and
for the window and tray. Five styles are drawn; see `docs/icons/`.

## Your data

One JSON file, on the device only:

| | where |
|---|---|
| Android | the app's private storage (`files/virulenter.json`) |
| Windows | `%APPDATA%\Virulenter\virulenter.json` |
| macOS | `~/Library/Application Support/Virulenter/virulenter.json` |
| Linux | `$XDG_DATA_HOME/virulenter/virulenter.json` (`~/.local/share/…`) |

It is the web app's backup format with two native-only fields (goals and
reminders), so data moves both ways:

- **Web → native:** Settings › Import, then paste a web link (`…#d=…`), a bare
  data code, or a JSON backup — or open the backup file. *Merge* adds what is
  new (importing the same backup twice adds nothing); *Replace* swaps it all.
- **Native → web:** Settings › *Copy data code*, then paste it into the web
  app's Load box; or export a backup and load that.

The link codec is a byte-exact port of `app/js/codec.js`, checked against
payloads produced by the web app itself (see *Tests*).

## Build and run

Requirements: **JDK 17+** and the **Android SDK** (the Android target is part of
every build; Android Studio provides the SDK, or set `ANDROID_HOME`, or write
`sdk.dir=…` into `native/local.properties`).

```bash
cd native
./gradlew :composeApp:run                    # desktop app, from source
./gradlew :composeApp:desktopTest            # shared-code tests
./gradlew :composeApp:assembleDebug          # Android debug APK
./gradlew :composeApp:assembleRelease        # Android release APK, signed
./gradlew :composeApp:packageDmg             # macOS installer   (on a Mac)
./gradlew :composeApp:packageMsi             # Windows installer (on Windows)
./gradlew :composeApp:packageDeb             # Linux package     (on Linux)
./gradlew :composeApp:createDistributable    # a runnable app folder, any OS
```

- The APK lands in `composeApp/build/outputs/apk/`, installers in
  `composeApp/build/compose/binaries/main/`.
- Install the APK with `adb install -r …apk`, or copy it to the phone and open it.
- jpackage builds installers only for the OS it runs on — which is why the
  [release workflow](../.github/workflows/release.yml) builds each on its own
  runner.
- The release APK is signed with the project's public sideloading key
  (`apk/keystore.properties`), so it installs and upgrades without setup.
  Replace that key before publishing anywhere.
- The installers are not code-signed: on macOS, right-click › Open the first
  time; on Windows, *More info › Run anyway* in SmartScreen.

The version is set in one place,
`composeApp/src/commonMain/kotlin/com/virulenter/Version.kt`; the APK, the
installers and the About screen all read it.

## Layout

```
native/
├─ composeApp/
│  ├─ build.gradle.kts          targets, Android app, desktop packaging
│  ├─ icons/                    app.ico, app.icns, app.png (from tools/icon.mjs)
│  └─ src/
│     ├─ commonMain/kotlin/com/virulenter/
│     │  ├─ model/              Model, Codec (web format), Store, Stats, Schedule, Dates
│     │  ├─ platform/           what the UI asks of the OS (files, clipboard, notifications)
│     │  └─ ui/                 App shell, screens, charts, glass material, theme, icons
│     ├─ commonTest/            codec, store, statistics and schedule tests
│     ├─ androidMain/           activity, notifications, alarms, receivers, tile,
│     │                         widget, shortcuts; manifest and resources
│     └─ desktopMain/           window, menu bar, tray, mini counter, file storage
├─ gradle/libs.versions.toml    pinned versions
└─ gradlew                      Gradle wrapper (8.14.3)
```

Pinned together: Kotlin 2.1.21, Compose Multiplatform 1.8.2, AGP 8.7.3
(compileSdk 35), kotlinx-serialization 1.8.1, kotlinx-datetime 0.6.2,
coroutines 1.10.2, Haze 1.6.10.

## Tests

`./gradlew :composeApp:desktopTest` runs 31 tests on the shared code:

- **Codec** — encodes exactly the bytes the web app encodes (golden payload
  generated by running `app/js/codec.js`), decodes them back, base64url at every
  length, multi-payload links, web JSON backups with bad values, our own backup
  keeping goals, reminders and settings, and rejecting non-data.
- **Store** — ordering and persistence, observers, undo of delete and clear,
  idempotent merges, two real taps in one minute surviving a merge, importing
  web links in both modes, unreadable saved data left untouched.
- **Statistics** — streaks, rates, the 7D/30D/90D/1Y buckets, per-event splits,
  weekday and hour distributions, the heat grid, relative times.
- **Schedule** — next reminder time across days and weekday masks, and what a
  scheduler that slept should fire.

The Android framework code (notifications, alarms, receivers, tile, widget,
shortcuts) uses no AndroidX, and has been type-checked against the Android 15
API with every `R.` reference checked against the real resources.
