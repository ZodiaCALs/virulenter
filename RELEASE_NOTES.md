# Virulenter 2.0.0

**Native on Android, Windows, macOS and Linux — and a new glass interface everywhere.**

## Downloads

| File | What it is |
|---|---|
| `virulenter-android.apk` | **New:** the native Android app — notifications, reminders, Quick Settings tile, widget |
| `Virulenter-2.0.0.msi` | **New:** Windows installer |
| `Virulenter-2.0.0.dmg` | **New:** macOS disk image |
| `virulenter_2.0.0-1_amd64.deb` | **New:** Linux package (Debian, Ubuntu and derivatives) |
| `virulenter.html` | the web app as one file — open it in any browser, nothing to install |
| `virulenter-web-android.apk` | the web app wrapped for Android (no permissions at all) |

The APKs are signed with the project's public sideloading key: allow installs
from your browser or file manager once. The desktop installers are not
code-signed yet: on macOS right-click the app and choose *Open* the first time;
on Windows choose *More info › Run anyway*.

## New: the native app

One Kotlin Multiplatform codebase (Compose Multiplatform), native on each
platform:

- **Live counter.** On Android, an ongoing notification for the event you
  track, with a clock that runs from your last tap (a system chronometer, so it
  ticks with the app closed), **+1** and **Undo** buttons, and goal progress.
  On desktop, an always-on-top mini counter window with the same clock.
- **Reminders.** Daily, per event, on the weekdays you choose. On Android
  they come through `AlarmManager` — exact to the minute once you allow alarms
  — survive reboots and time-zone changes, and carry a **+1** button that counts
  without opening the app. On desktop they arrive as system notifications
  while Virulenter runs in the tray.
- **Count without opening the app:** a Quick Settings tile, a home-screen widget
  (today's count, a live clock, +1) and launcher shortcuts on Android; a tray
  menu with +1 for every event and Ctrl/⌘ 1–9 shortcuts on desktop.
- **Daily goals:** a ring on each card, progress in the notification, and a
  notification on the tap that reaches the goal.
- **Everything the web app does:** events, the tap log, the calendar heat grid,
  the statistics dashboard with interactive charts, appearance (accent, custom
  colour, typeface, light/dark/system), import with merge or replace, undo.
- **Your data moves freely.** Import a web link, a data code or a JSON backup;
  copy a data code back into the web app. The link format is a byte-exact port
  of the web app's, tested against payloads the web app itself produced.
- **Glass material:** real backdrop blur, a fine grain and lit rims over an
  aurora and a light grid; tight corners; rolling numbers and a tap button that
  throws a "+1".

## The web app

- **Higher-end glass, fewer curves.** Every corner steps down a notch (cards
  12 px, sheets 16 px, buttons 8 px). Panes are now true frosted glass — a
  lighter tint, backdrop blur, an acrylic grain and a 1 px rim lit from the top
  left — over a backdrop with a fine grid and a defined orb, so the frost reads.
  *Reduce transparency* still turns everything solid.
- **Interactive dashboard.** A filter row (7D / 30D / 90D / 1Y, and one event)
  scopes stat tiles with period-over-period change, the trend, weekday and hour
  charts, the per-event table, streaks and a 53-week heatmap. Charts have
  value-first tooltips split by event, hover, touch scrubbing, full keyboard
  control, drill-down into the calendar, and a table view.
- **Reliability fixes.** Taps after roughly the 280th were lost on reload;
  starts before 2020 shifted every tap; Delete, Erase and Load did nothing
  inside the Android wrapper; merging a backup into itself duplicated taps;
  plus layout fixes — nothing widens the page on a phone, nothing is clipped,
  sheets stack in the order they open. Every fix has a regression check.

## New icon: Glass Heat

The calendar's heat grid as thin panes of glass on a deep green field: flat
sheets with hairline edges and a fine satin grain, the coolest nearly clear,
the hottest holding mint light that glows onto the field; the plus on a disc of
deep green glass inside a fine HUD ring, with slim viewfinder brackets framing
the grid. It is **Material Heat**
(after Google's Material 3), picked from five new directions and rebuilt in
glass. The notification icon, launcher shortcut and widget follow it, and
Android 13+ themed icons keep the heat steps.

The other directions — Chrono Neon, Liquid Ring (after Apple's Liquid Glass),
Fluent Tally (after Microsoft's Fluent 2), Material Heat and Abacus Mono — are
in `docs/icons/index.html`; `node tools/icon.mjs --style=<name>` redraws every
asset on every platform: web, iOS touch icon, Android adaptive and themed
layers, `.ico`, `.icns` and `.png`.

## Under the hood

- Builds and releases run on GitHub Actions (`.github/workflows/release.yml`):
  pushing a `v*` tag builds every file above, runs the web suite and the native
  tests, and publishes this release.
- Web: 89 checks over HTTP, 87 on the single file, 88 on the packaged Android
  assets. Native: 31 tests on the shared code (codec, store, statistics,
  reminder schedule).
