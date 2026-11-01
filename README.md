<p align="center">
  <img src="app/icons/icon-512.png" width="128" height="128" alt="Virulenter">
</p>

<h1 align="center">Virulenter</h1>

<p align="center">
  <b>Tap to count. Every press is a data point.</b><br>
  An offline counter that keeps the time of every tap, so you get the total and the <i>when</i>.
</p>

<p align="center">Web · Android · Windows · macOS · Linux — no account, no server, your data stays yours</p>

---

## Get it

| | |
|---|---|
| **Android** | `virulenter-android.apk`, the native app (Android 8+), or `virulenter-web-android.apk`, the web app in a WebView (Android 7+) |
| **Windows · macOS · Linux** | `Virulenter-2.0.0.msi` · `Virulenter-2.0.0.dmg` · `virulenter_2.0.0-1_amd64.deb` |
| **Any browser** | [`dist/virulenter.html`](dist/virulenter.html): the whole app in one file, just open it |

The installers and APKs are attached to each [release](../../releases)
(*Actions › Release › Run workflow* publishes one from `RELEASE_NOTES.md`),
and every push leaves fresh builds on its [Actions](../../actions) run.

## What it does

- **One tap, one timestamp.** Each card shows the total, the last tap and the week at a glance.
- **When it happened:** a calendar heat map, the year at a glance, and a Stats tab with
  trends, weekday and hour rhythm, and streaks, all interactive.
- **Glass interface** in light and dark, any accent colour, six backgrounds or your own picture.
- **Native extras:** reminders, a live counter in the notification shade, a Quick Settings
  tile, a home-screen widget, launcher shortcuts, and a tray menu with a mini window on desktop.
- **Private by design:** the web app keeps your log in its own link (bookmark it, or open
  it on another device); the native app keeps one file on the device. Nothing is uploaded.

## Light by design

- The web app is a single 212 KB file with no dependencies, works offline, and does no work while idle.
- Glass only blurs when there is a background to blur; pages redraw only when their data changes.
- Android builds are shrunk with R8 (1.7 MB native, 0.45 MB web wrapper), and a background
  picture is kept at the size your screen shows.

## Build it

```bash
node build.mjs            # dist/virulenter.html
node tools/serve.mjs      # run the installable web app locally
node tools/verify.mjs     # browser test suite
```

```bash
cd native
./gradlew :composeApp:run                # desktop app
./gradlew :composeApp:assembleRelease    # native Android APK
```

More in [native/README.md](native/README.md), [apk/README.md](apk/README.md) and
[RELEASE_NOTES.md](RELEASE_NOTES.md).

## License

[Apache 2.0](LICENSE)
