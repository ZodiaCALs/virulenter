package com.virulenter.ui.screens

import androidx.compose.foundation.background
import kotlinx.coroutines.launch
import com.virulenter.ui.glass.drawPreset
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.foundation.border
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virulenter.model.AppState
import com.virulenter.model.Dates
import com.virulenter.model.Palette
import com.virulenter.model.Schedule
import com.virulenter.platform.LocalPlatform
import com.virulenter.platform.Platform
import com.virulenter.ui.AppController
import com.virulenter.ui.Confirm
import com.virulenter.ui.Insets
import com.virulenter.ui.components.ButtonKind
import com.virulenter.ui.components.FilterChip
import com.virulenter.ui.components.GlassField
import com.virulenter.ui.components.SectionLabel
import com.virulenter.ui.components.Segmented
import com.virulenter.ui.components.Swatch
import com.virulenter.ui.components.Toggle
import com.virulenter.ui.components.VButton
import com.virulenter.ui.components.VIcon
import com.virulenter.ui.components.VIcons
import com.virulenter.ui.content
import com.virulenter.ui.glass.GlassPanel
import com.virulenter.ui.theme.LocalGlass
import com.virulenter.ui.theme.fontFamily
import com.virulenter.ui.theme.hexColor

@Composable
fun SettingsScreen(c: AppController, state: AppState, insets: Insets, list: LazyListState) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        LazyColumn(Modifier.widthIn(max = 760.dp).fillMaxSize(), state = list, contentPadding = insets.content(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item(key = "privacy") { Privacy(state) }
            item(key = "look") { SectionLabel("Appearance"); Appearance(c, state) }
            item(key = "notify") { SectionLabel("Notifications & reminders"); Notifying(c, state) }
            item(key = "data") { SectionLabel("Data"); DataPanel(c, state) }
            item(key = "about") { SectionLabel("About"); About() }
        }
    }
}

@Composable
private fun Group(content: @Composable ColumnScope.() -> Unit) {
    GlassPanel(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp), content = content) }
}

@Composable
private fun Privacy(state: AppState) {
    val g = LocalGlass.current
    GlassPanel(Modifier.fillMaxWidth(), wash = g.accentSoft) {
        Row(Modifier.padding(16.dp)) {
            Box(Modifier.size(46.dp).clip(RoundedCornerShape(10.dp)).background(g.accent), contentAlignment = Alignment.Center) {
                VIcon(VIcons.Shield, g.accentInk, 24.dp)
            }
            Spacer(Modifier.width(14.dp))
            Column {
                Text("Your data stays on this device", style = MaterialTheme.typography.titleMedium, color = g.text)
                Spacer(Modifier.height(4.dp))
                Text(
                    "No account and no server: events and taps are kept in one file here. Backups use the web app's format, so they open there too.",
                    color = g.text2, fontSize = 14.sp, lineHeight = 20.sp,
                )
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("${state.events.size} events")
                    Pill("${state.events.sumOf { it.count }} taps")
                }
            }
        }
    }
}

@Composable
private fun Pill(text: String) {
    val g = LocalGlass.current
    Text(text, Modifier.clip(RoundedCornerShape(6.dp)).background(g.raised).padding(horizontal = 10.dp, vertical = 5.dp), color = g.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Appearance(c: AppController, state: AppState) {
    val g = LocalGlass.current
    val look = state.look
    var hex by remember(look.custom) { mutableStateOf(look.custom ?: "") }
    Group {
        Label("Theme")
        Segmented(
            Palette.THEMES, look.theme,
            label = { when (it) { "light" -> "Light"; "dark" -> "Dark"; else -> "System" } },
            onSelect = { c.store.setLook(look.copy(theme = it)) },
            modifier = Modifier.fillMaxWidth(),
            icon = { when (it) { "light" -> VIcons.Sun; "dark" -> VIcons.Moon; else -> VIcons.Monitor } },
        )
        Label("Accent colour")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Palette.ACCENTS.forEach { a ->
                Swatch(hexColor(a.value), look.custom == null && look.accent == a.id, { c.store.setLook(look.copy(accent = a.id, custom = null)) }, label = a.label)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            GlassField(hex, { hex = it.trim().take(7) }, "#2f6bff", Modifier.weight(1f), leading = VIcons.Palette, mono = true)
            Spacer(Modifier.width(10.dp))
            val valid = Palette.isHex(hex) || Palette.isHex("#$hex")
            VButton("Apply", {
                val v = if (hex.startsWith("#")) hex else "#$hex"
                c.store.setLook(look.copy(custom = v.lowercase()))
            }, enabled = valid)
        }
        Label("Background")
        val platform = LocalPlatform.current
        val scope = rememberCoroutineScope()
        val image = c.backgroundImage
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Palette.BACKGROUNDS.forEach { b ->
                BackgroundTile(b, look.bg == b.id, image) {
                    /* your picture's tile uploads one; tapped again while in use, it replaces it */
                    if (b.id == "image" && (image == null || look.bg == "image")) {
                        platform.pickImage { bytes -> scope.launch { c.useBackground(platform, bytes) } }
                    } else {
                        c.store.setLook(look.copy(bg = b.id))
                    }
                }
            }
        }
        if (image != null) {
            VButton("Remove image", { c.removeBackground(platform) }, icon = VIcons.Trash, kind = ButtonKind.Ghost, color = g.danger, height = 36.dp)
        }
        Text(
            if (look.bg == "image" && image == null) "This background uses a picture from another device. Upload one here, or pick another."
            else "A picture you upload stays on this device; backups only record that you use one.",
            color = g.text3, fontSize = 12.5.sp, lineHeight = 17.sp,
        )
        Label("Typeface")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Palette.FONTS.forEach { f ->
                val on = look.font == f.id
                Column(
                    Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (on) g.accentSoft else g.raised)
                        .clickable { c.store.setLook(look.copy(font = f.id)) }
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                ) {
                    Text(f.label, color = if (on) g.accentText else g.text, fontFamily = fontFamily(f.id), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        if (look != com.virulenter.model.Look()) {
            VButton("Reset appearance", { c.store.setLook(com.virulenter.model.Look()) }, kind = ButtonKind.Ghost, icon = VIcons.Undo)
        }
    }
}

@Composable
private fun BackgroundTile(b: Palette.Background, selected: Boolean, image: ImageBitmap?, onClick: () -> Unit) {
    val g = LocalGlass.current
    val shape = RoundedCornerShape(8.dp)
    Column(
        Modifier.width(76.dp).clickable(role = Role.RadioButton, onClickLabel = b.label, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(76.dp, 54.dp)
                .then(if (selected) Modifier.border(2.dp, g.accent, RoundedCornerShape(10.dp)).padding(3.dp) else Modifier)
                .clip(shape)
                .border(1.dp, g.line, shape),
            contentAlignment = Alignment.Center,
        ) {
            when {
                b.id == "image" && image != null -> Image(image, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                b.id == "image" -> VIcon(VIcons.Upload, g.text3, 20.dp)
                b.id == "none" -> Box(Modifier.fillMaxSize().background(g.bg))
                else -> Canvas(Modifier.fillMaxSize()) { drawPreset(b.id, g) }
            }
        }
        Spacer(Modifier.height(5.dp))
        Text(
            if (b.id == "image" && image == null) "Upload" else b.label,
            color = if (selected) g.accentText else g.text2, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
        )
    }
}

@Composable
private fun Label(text: String) {
    Text(text, color = LocalGlass.current.text2, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Notifying(c: AppController, state: AppState) {
    val g = LocalGlass.current
    val platform = LocalPlatform.current
    val n = platform.notifications
    val allowed by n.allowed
    Group {
        if (!allowed) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(g.dangerSoft).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                VIcon(VIcons.Alert, g.danger, 20.dp)
                Spacer(Modifier.width(10.dp))
                Text("Notifications are off for Virulenter.", Modifier.weight(1f), color = g.text, fontSize = 14.sp)
                VButton("Allow", n::requestPermission, kind = ButtonKind.Primary, height = 36.dp)
            }
        }
        SettingRow(VIcons.Stopwatch, n.liveTitle, n.liveDetail) {
            Toggle(state.settings.liveTracker, { on -> c.store.setSettings { it.copy(liveTracker = on) }; if (on && !allowed) n.requestPermission() })
        }
        if (state.events.isNotEmpty()) {
            Text("Counts", color = g.text3, fontSize = 12.5.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                state.events.forEach { e ->
                    FilterChip(e.name, state.tracked?.id == e.id, { c.store.setTracker(e.id) }, dot = hexColor(e.color))
                }
            }
        }
        val reminders = state.events.filter { it.reminder?.enabled == true }
        SettingRow(VIcons.Bell, "Reminders", if (reminders.isEmpty()) "Set a daily reminder in any event's editor." else "${reminders.size} active") {}
        reminders.forEach { e ->
            val r = e.reminder!!
            Row(Modifier.fillMaxWidth().padding(start = 34.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(RoundedCornerShape(2.dp)).background(hexColor(e.color)))
                Spacer(Modifier.width(10.dp))
                Text(e.name, Modifier.weight(1f), color = g.text, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${r.label} · ${Schedule.daysLabel(r.days)}", color = g.text3, fontSize = 12.5.sp)
                Spacer(Modifier.width(6.dp))
                VButton("Edit", { c.edit(e.id) }, kind = ButtonKind.Ghost, height = 34.dp)
            }
        }
        n.exactAlarms?.let { exact ->
            val ok by exact
            if (!ok && reminders.isNotEmpty()) {
                SettingRow(VIcons.Clock, "Exact timing", "Android may deliver reminders a few minutes late until you allow alarms.") {
                    VButton("Allow", n::requestExactAlarms, height = 36.dp)
                }
            }
        }
        if (platform.kind == Platform.Kind.Desktop) {
            SettingRow(VIcons.Window, "Keep running in the tray", "Closing the window leaves Virulenter in the system tray, so reminders still arrive.") {
                Toggle(state.settings.keepInTray, { on -> c.store.setSettings { it.copy(keepInTray = on) } })
            }
        }
        VButton("Send a test notification", { n.test(state) }, icon = VIcons.Bell, enabled = allowed)
    }
}

@Composable
private fun SettingRow(icon: ImageVector, title: String, detail: String, trailing: @Composable () -> Unit) {
    val g = LocalGlass.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        VIcon(icon, g.text2, 22.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = g.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text(detail, color = g.text3, fontSize = 12.5.sp, lineHeight = 17.sp)
        }
        Spacer(Modifier.width(10.dp))
        trailing()
    }
}

@Composable
private fun DataPanel(c: AppController, state: AppState) {
    val platform = LocalPlatform.current
    Group {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            VButton("Export backup", {
                platform.saveFile("virulenter-${Dates.iso(Dates.today())}.json", "application/json", c.store.exportJson())
            }, Modifier.weight(1f), icon = VIcons.Upload, kind = ButtonKind.Primary)
            VButton("Import", { c.openImport() }, Modifier.weight(1f), icon = VIcons.Download)
        }
        VButton("Copy data code for the web app", {
            platform.copy(c.store.dataCode())
            c.say("Copied. In the web app, paste it into Settings › Load, or after #d= in its address.")
        }, Modifier.fillMaxWidth(), icon = VIcons.Copy, enabled = state.events.isNotEmpty())
        Text(
            "A backup is the web app's JSON with reminders and goals added; the web app reads it and ignores what it does not know.",
            color = LocalGlass.current.text3, fontSize = 12.5.sp, lineHeight = 17.sp,
        )
        VButton("Erase everything", {
            c.confirm = Confirm(
                title = "Erase all data?",
                message = "Every event and all ${state.events.sumOf { it.count }} taps will be removed from this device. Export a backup first if you might want them.",
                confirm = "Erase everything",
                danger = true,
            ) { c.store.eraseAll(); c.say("All data erased") }
        }, Modifier.fillMaxWidth(), icon = VIcons.Trash, kind = ButtonKind.Ghost, color = LocalGlass.current.danger, enabled = state.events.isNotEmpty())
    }
}

@Composable
private fun About() {
    val g = LocalGlass.current
    val p = LocalPlatform.current
    Group {
        Text("Virulenter ${p.version}", color = g.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "${if (p.kind == Platform.Kind.Android) "Android" else "Desktop"} · Kotlin Multiplatform and Compose. The same events, calendar and statistics as the web app, with native notifications.",
            color = g.text2, fontSize = 13.5.sp, lineHeight = 19.sp,
        )
    }
}
