package com.virulenter

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.window.WindowDraggableArea
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.KeyShortcut
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.ApplicationScope
import androidx.compose.ui.window.MenuBar
import androidx.compose.ui.window.Tray
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowPosition
import androidx.compose.ui.window.application
import androidx.compose.ui.window.isTraySupported
import androidx.compose.ui.window.rememberTrayState
import androidx.compose.ui.window.rememberWindowState
import com.virulenter.desktop.DesktopNotifier
import com.virulenter.desktop.DesktopPlatform
import com.virulenter.desktop.FileStorage
import com.virulenter.model.Dates
import com.virulenter.model.Schedule
import com.virulenter.model.Stats
import com.virulenter.model.Store
import com.virulenter.resources.Res
import com.virulenter.resources.app_icon
import com.virulenter.ui.App
import com.virulenter.ui.AppController
import com.virulenter.ui.Tab
import com.virulenter.ui.components.IconAction
import com.virulenter.ui.components.Monogram
import com.virulenter.ui.components.VButton
import com.virulenter.ui.components.ButtonKind
import com.virulenter.ui.components.VIcons
import com.virulenter.ui.components.rememberNow
import com.virulenter.ui.glass.rimBrush
import com.virulenter.ui.theme.LocalGlass
import com.virulenter.ui.theme.VirulenterTheme
import com.virulenter.ui.theme.hexColor
import kotlinx.coroutines.delay
import org.jetbrains.compose.resources.painterResource

fun main() {
    /* a dark title bar in dark mode on macOS */
    System.setProperty("apple.awt.application.appearance", "system")
    System.setProperty("apple.awt.application.name", "Virulenter")

    val store = Store(FileStorage(FileStorage.defaultFile())).apply { load() }
    val controller = AppController(store)

    application {
        val state by store.state.collectAsState()
        var visible by remember { mutableStateOf(true) }
        val trayOk = remember { isTraySupported }
        val tray = rememberTrayState()
        val notifier = remember { DesktopNotifier(if (trayOk) tray else null) }
        val platform = remember { DesktopPlatform(notifier) }
        val icon = painterResource(Res.drawable.app_icon)
        val mac = FileStorage.isMac
        fun shortcut(key: Key, shift: Boolean = false) = KeyShortcut(key, ctrl = !mac, meta = mac, shift = shift)

        /* reminders: checked every 15 s while the app runs (in the tray, too) */
        LaunchedEffect(Unit) {
            var last = Dates.now()
            while (true) {
                delay(15_000)
                val now = Dates.now()
                for (e in Schedule.dueBetween(store.current.events, last, now)) {
                    val today = Stats.countOn(e, Dates.today())
                    notifier.send("Time for ${e.name}", if (today == 0) "Nothing logged today yet." else "$today logged today so far.")
                }
                last = now
            }
        }

        if (trayOk) {
            val today = Stats.summary(state.events, Dates.today()).today
            Tray(
                icon = icon,
                state = tray,
                tooltip = "Virulenter · $today today",
                onAction = { visible = true },
                menu = {
                    Item("Open Virulenter", onClick = { visible = true })
                    Separator()
                    state.events.take(12).forEach { e ->
                        Item("+1  ${e.name}  ·  ${Stats.countOn(e, Dates.today())} today", onClick = { store.tap(e.id) })
                    }
                    if (state.events.isNotEmpty()) Separator()
                    CheckboxItem("Mini counter", checked = state.settings.liveTracker, onCheckedChange = { on -> store.setSettings { it.copy(liveTracker = on) } })
                    Separator()
                    Item("Quit Virulenter", onClick = ::exitApplication)
                },
            )
        }

        Window(
            onCloseRequest = { if (trayOk && state.settings.keepInTray) visible = false else exitApplication() },
            visible = visible,
            title = "Virulenter",
            icon = icon,
            state = rememberWindowState(size = DpSize(1180.dp, 820.dp), position = WindowPosition(Alignment.Center)),
            onPreviewKeyEvent = { e ->
                if (e.type == KeyEventType.KeyDown && e.key == Key.Escape) {
                    when {
                        controller.confirm != null -> { controller.confirm = null; true }
                        controller.editing != null -> { controller.editing = null; true }
                        controller.importing -> { controller.importing = false; true }
                        else -> false
                    }
                } else false
            },
        ) {
            LaunchedEffect(Unit) { window.minimumSize = java.awt.Dimension(380, 600) }
            MenuBar {
                Menu("File", mnemonic = 'F') {
                    Item("New event", onClick = controller::newEvent, shortcut = shortcut(Key.N))
                    Item("Import…", onClick = { controller.openImport() }, shortcut = shortcut(Key.O))
                    Item("Export backup…", onClick = {
                        platform.saveFile("virulenter-${Dates.iso(Dates.today())}.json", "application/json", store.exportJson())
                    }, shortcut = shortcut(Key.S))
                    Separator()
                    Item("Close window", onClick = { if (trayOk && state.settings.keepInTray) visible = false else exitApplication() }, shortcut = shortcut(Key.W))
                    Item("Quit", onClick = ::exitApplication, shortcut = shortcut(Key.Q))
                }
                Menu("Count", mnemonic = 'C') {
                    val digits = listOf(Key.One, Key.Two, Key.Three, Key.Four, Key.Five, Key.Six, Key.Seven, Key.Eight, Key.Nine)
                    if (state.events.isEmpty()) Item("No events yet", enabled = false, onClick = {})
                    state.events.take(9).forEachIndexed { i, e ->
                        Item("+1  ${e.name}", onClick = { controller.tap(e) }, shortcut = shortcut(digits[i]))
                    }
                }
                Menu("View", mnemonic = 'V') {
                    Tab.entries.forEachIndexed { i, t ->
                        RadioButtonItem(t.label, selected = controller.tab == t, onClick = { controller.tab = t }, shortcut = shortcut(listOf(Key.One, Key.Two, Key.Three, Key.Four)[i], shift = true))
                    }
                    Separator()
                    CheckboxItem("Mini counter", checked = state.settings.liveTracker, onCheckedChange = { on -> store.setSettings { it.copy(liveTracker = on) } })
                }
            }
            App(controller, platform)
        }

        if (state.settings.liveTracker && state.tracked != null) {
            MiniCounter(store, controller, icon) { store.setSettings { it.copy(liveTracker = false) } }
        }
    }
}

/* The desktop's live counter: a small frameless window that stays on top,
   showing the tracked event, today's count and the time since the last tap. */
@Composable
private fun ApplicationScope.MiniCounter(store: Store, controller: AppController, icon: Painter, onClose: () -> Unit) {
    val state by store.state.collectAsState()
    val e = state.tracked ?: return
    Window(
        onCloseRequest = onClose,
        state = rememberWindowState(size = DpSize(360.dp, 112.dp), position = WindowPosition(Alignment.BottomEnd)),
        title = "Virulenter · ${e.name}",
        icon = icon,
        undecorated = true,
        transparent = true,
        alwaysOnTop = true,
        resizable = false,
    ) {
        VirulenterTheme(state.look, isSystemInDarkTheme()) {
            val g = LocalGlass.current
            val now by rememberNow(1_000)
            val color = hexColor(e.color)
            val shape = RoundedCornerShape(14.dp)
            WindowDraggableArea(Modifier.fillMaxSize().padding(8.dp)) {
                Row(
                    Modifier
                        .fillMaxSize()
                        .clip(shape)
                        .background(Brush.linearGradient(listOf(g.solid.copy(alpha = 0.94f), g.solid.copy(alpha = 0.86f))))
                        .background(Brush.verticalGradient(listOf(g.soft(color, 0.22f), g.soft(color, 0f))))
                        .border(1.dp, rimBrush(g), shape)
                        .padding(start = 14.dp, end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Monogram(e.name, color, 38.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(e.name, color = g.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text("${Stats.countOn(e, Dates.dayOf(now))}", color = g.text, fontSize = 26.sp, fontWeight = FontWeight.Black)
                            Text(" today", Modifier.padding(bottom = 4.dp), color = g.text3, fontSize = 12.sp)
                        }
                        val last = e.last
                        Text(
                            if (last == null) "no taps yet" else "${Dates.fmtElapsed(now - last)} since the last",
                            color = g.text2, fontSize = 12.sp, maxLines = 1,
                        )
                    }
                    VButton("+1", { controller.tap(e) }, kind = ButtonKind.Primary, color = color, height = 44.dp)
                    IconAction(VIcons.Close, "Close the mini counter", onClose, filled = false, size = 32.dp)
                }
            }
        }
    }
}
