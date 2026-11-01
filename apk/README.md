# Virulenter for Android

A thin, offline Android wrapper around the web app in [`../app`](../app).

The APK does not reimplement anything. It bundles the same HTML/CSS/JS the
browser serves, hands it to a WebView through `WebViewAssetLoader` on the
virtual secure origin `https://appassets.androidplatform.net/`, and adds the
few things a WebView cannot do by itself.

## Build

```bash
node ../tools/build-apk.mjs                # debug APK
node ../tools/build-apk.mjs --release      # release APK, signed
node ../tools/build-apk.mjs --provision    # only fetch the toolchain
```

Output lands in `../dist/`:

| file | size | use |
|---|---:|---|
| `virulenter-android-release.apk` | ~3.1 MB | install this |
| `virulenter-android-debug.apk` | ~3.7 MB | debugging |

The script provisions everything into `../.toolchain/` (JDK 17, Gradle 8.9,
Android SDK 35) on first run — about 700 MB, once. Nothing is installed
system-wide.

### Or build it yourself

The project is a normal Gradle project and opens in Android Studio as-is. From
the command line:

```bash
cd apk
./gradlew assembleRelease        # or assembleDebug
```

Requires **JDK 17** and an Android SDK with **platform 35** and
**build-tools 35.0.0**. Point at yours with `ANDROID_HOME` or
`apk/local.properties`:

```properties
sdk.dir=/path/to/android-sdk
```

### Toolchain matrix

These versions are pinned to each other and are known to work together:

| component | version | why this one |
|---|---|---|
| JDK | 17 | required by AGP 8.x |
| Gradle | 8.9 | minimum for AGP 8.7 |
| Android Gradle Plugin | 8.7.3 | the first 8.x line that targets compileSdk 35 / build-tools 35 |
| compileSdk / targetSdk | 35 | current Play requirement |
| minSdk | 24 | Android 7.0, ~98% of devices |
| AndroidX WebKit | 1.11.0 | provides `WebViewAssetLoader` |

AGP's default build-tools is still 34.0.0, so `buildToolsVersion '35.0.0'` is
set explicitly — otherwise Gradle tries to download 34 at build time.

## How it works

```
MainActivity
 ├─ WebViewAssetLoader      serves ../assets on https://appassets.androidplatform.net
 ├─ WebViewClient           keeps app URLs internal, sends real links to the browser
 ├─ OnBackPressedCallback   closes an open sheet before exiting
 └─ Bridge (JS interface)   writes exports to Downloads, or opens a share sheet
```

**Why the virtual https origin.** The app's entire persistence model is the URL
fragment: every tap rewrites it. A `file://` page has an opaque origin, where
`history.replaceState` throws and the log cannot be restored on relaunch.
Serving the assets from a real origin keeps that mechanism working exactly as it
does on the web. It also means no browser storage is introduced — `localStorage`
still goes unused, by design.

**Session persistence (why the log survives being backgrounded).** On Android the
app is routinely killed while backgrounded. A WebView's own
`saveState()`/`restoreState()` does **not** reliably carry the URL fragment back —
and the fragment is where this app keeps everything — so losing it looked exactly
like the data being erased.

The URL is therefore captured and replayed explicitly, in two places:

- in the activity's saved state, which covers Android recreating the activity;
- in a private file, which also covers a force-kill or a reboot, where no saved
  state is offered at all.

The subtle part is *when* to capture. The app updates its state with
`history.replaceState()`, which fires no navigation, so `onPageFinished` never
runs again after a tap — a snapshot taken there would hold the URL the page was
loaded with and silently drop everything since. So the web layer calls
`VirulenterNative.sessionChanged()` immediately after each rewrite, and the
native side writes the durable copy. `onPause` snapshots as well, belt and
braces, since it is the last reliable callback before the process can be killed.

Together: taps are durable the moment they happen, and the session is restored
in full on the next launch.

**Why no `INTERNET` permission.** The manifest requests none. The web layer is
written so it never makes a network request, and omitting the permission makes
the platform enforce that rather than trusting it. The verified consequence is
in the build output: the APK has no internet access to lose.

**Why `sw.js` is not bundled.** `tools/sync-android.mjs` drops it. The assets are
already on the device, so a service worker would only duplicate every file
inside the WebView cache. Offline behaviour comes from the APK itself.

**Exports.** The web code builds exports as `Blob` object URLs, which a WebView
has no download manager for. `app/js/core.js` detects a `VirulenterNative`
bridge **per call** (Android injects it asynchronously, so it may not exist yet
when the module evaluates) and, when present, passes the bytes across as base64.
The Java side writes them to the public Downloads folder through `MediaStore` on
Android 10+, and to external storage with the legacy API below that.

**Back button** asks the page whether a sheet is open, and closes it rather than
leaving the app.

## Install

### Easiest: scan a QR code

```bash
node ../tools/share-apk.mjs
```

Serves the APK on your local network behind a page carrying a QR code. Point the
phone camera at it, tap the link, tap **Download**, open the file, allow
installs from this source once. No cable and nothing to type.

The page also shows the raw URL, offers the web build for a computer, and says
so plainly if no QR encoder is available rather than showing a broken image.

### Other routes

| route | how |
|---|---|
| **USB / adb** | `adb install -r ../dist/virulenter-android-release.apk` |
| **Cloud drive** | upload, download on the phone, tap the file |
| **Chat / email** | send it to yourself and open it on the phone |
| **File manager** | copy over USB, open from the phone's storage |

Android warns about installing from an unknown source, because this is not
distributed through Play. That prompt is expected — allow it for the app you
just downloaded.

Release and debug builds are signed with different keys, so uninstall one
before installing the other.

Nothing about installing requires a command line **on the phone**. The commands
above run on the computer, and only to hand the file over.

## Signing

`keystore.properties` points at `virulenter-release.jks`, a keystore generated
for this project **with a public password** (`virulenter`). It exists so that
`--release` produces an installable, upgradeable APK with no setup.

That key is not secret. Before publishing anywhere, generate your own and point
`keystore.properties` at it:

```bash
keytool -genkeypair -v -keystore apk/my-release.jks -alias mykey \
        -keyalg RSA -keysize 2048 -validity 10950
```

Without a `keystore.properties` the release build still succeeds, just unsigned
— installable only after re-signing.

## Verifying a build

```bash
node ../tools/validate-apk.mjs ../dist/virulenter-android-release.apk
```

Checks the package identity, API levels, launcher entry point, absence of the
internet permission, the resource table, the signature, the bundled web assets
and that no bundled page references anything off-device.

The web layer inside the APK is the same code, so the web suite (94 checks
for the packaged assets) runs against them too:

```bash
node ../tools/verify.mjs --root="$PWD/app/src/main/assets"
```

## Inspecting it on a phone

A **debug** build switches on WebView debugging (`MainActivity` checks the
build's debuggable flag; release builds never do). Connect the phone by USB with
USB debugging enabled, open `chrome://inspect` in Chrome on the computer, and
press *inspect* under Virulenter: the full DevTools — console, elements,
network, performance — attached to the app running on the phone.

## Icon and theme resources

`tools/icon.mjs` draws every launcher asset from one drawing (the style chosen
in `tools/icon-styles.mjs`; see [the icon options](../docs/icons/index.html)):

| resource | what it is |
|---|---|
| `mipmap-*/ic_launcher*.png` | legacy bitmaps, square and round, for launchers without adaptive icons |
| `drawable-xxxhdpi/ic_launcher_background.png` | adaptive layer: the plate (432 px = 108 dp at xxxhdpi; Android scales it down per density) |
| `drawable-xxxhdpi/ic_launcher_foreground.png` | adaptive layer: the mark, inside the 66 dp safe zone |
| `drawable-xxxhdpi/ic_launcher_monochrome.png` | the silhouette Android 13+ tints for themed icons; older versions ignore it |

The layers used to sit in `drawable/` (mdpi), which made Android scale a 432 px
bitmap *up* four times on decode on a typical phone; in `drawable-xxxhdpi/`
they are only ever scaled down.

`values-night/` gives the window and system bars the dark theme's colour, so a
phone in dark mode shows no light bars around the dark app.

## What is not here

- **No notifications, widget or Quick Settings tile here.** The native app
  ([`native/`](../native/README.md)) has all three, plus reminders and a live
  counter in the notification shade.
- **No Play Store upload.** That needs your own signing key and a listing.
- **Targets Android 7.0+.** Below that the AndroidX WebKit backport is
  unavailable and `WebViewAssetLoader` cannot be used.
