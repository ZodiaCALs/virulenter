package com.virulenter.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virulenter.model.AppState
import com.virulenter.model.Codec
import com.virulenter.model.Dates
import com.virulenter.model.ImportMode
import com.virulenter.model.Palette
import com.virulenter.model.Reminder
import com.virulenter.model.Schedule
import com.virulenter.platform.LocalPlatform
import com.virulenter.ui.AppController
import com.virulenter.ui.Confirm
import com.virulenter.ui.Sheet
import com.virulenter.ui.components.ButtonKind
import com.virulenter.ui.components.GlassField
import com.virulenter.ui.components.IconAction
import com.virulenter.ui.components.Monogram
import com.virulenter.ui.components.Swatch
import com.virulenter.ui.components.Toggle
import com.virulenter.ui.components.VButton
import com.virulenter.ui.components.VIcons
import com.virulenter.ui.theme.LocalGlass
import com.virulenter.ui.theme.hexColor

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EditorSheet(c: AppController, state: AppState, wide: Boolean) {
    val g = LocalGlass.current
    val platform = LocalPlatform.current
    var last by remember { mutableStateOf(c.editing) }
    if (c.editing != null) last = c.editing
    val editing = last
    val existing = editing?.id?.let { state.event(it) }

    var name by remember(editing) { mutableStateOf(existing?.name ?: "") }
    var color by remember(editing) { mutableStateOf(existing?.color ?: Palette.COLORS[state.events.size % Palette.COLORS.size]) }
    var start by remember(editing) { mutableStateOf(existing?.start ?: Dates.iso(Dates.today())) }
    var goal by remember(editing) { mutableStateOf(existing?.goal?.toString() ?: "") }
    var remind by remember(editing) { mutableStateOf(existing?.reminder?.enabled == true) }
    var hour by remember(editing) { mutableStateOf(existing?.reminder?.hour ?: 20) }
    var minute by remember(editing) { mutableStateOf(existing?.reminder?.minute ?: 0) }
    var days by remember(editing) { mutableStateOf(existing?.reminder?.days ?: Reminder.ALL_DAYS) }

    val startOk = Dates.parse(start)?.let { it <= Dates.today() } == true
    val goalOk = goal.isBlank() || goal.toIntOrNull()?.let { it in 1..100_000 } == true
    val ok = name.isNotBlank() && startOk && goalOk && (!remind || days != 0)

    fun save() {
        if (!ok) return
        val reminder = if (remind) Reminder(hour, minute, days, true) else existing?.reminder?.copy(enabled = false)
        val target = goal.toIntOrNull()
        if (existing == null) {
            val e = c.store.create(name, color, start, target, reminder)
            c.say("Created “${e.name}”")
        } else {
            c.store.update(existing.id) { it.copy(name = name, color = color, start = start, goal = target, reminder = reminder) }
        }
        if (remind && !platform.notifications.allowed.value) platform.notifications.requestPermission()
        c.editing = null
    }

    Sheet(
        visible = c.editing != null,
        title = if (existing == null) "New event" else "Edit event",
        wide = wide,
        onDismiss = { c.editing = null },
        confirm = if (existing == null) "Create" else "Save",
        confirmEnabled = ok,
        onConfirm = ::save,
    ) {
        val col = hexColor(color)
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(g.soft(col)).border(1.dp, col.copy(alpha = 0.3f), RoundedCornerShape(10.dp)).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Monogram(name.ifBlank { "?" }, col, 40.dp)
            Spacer(Modifier.width(12.dp))
            Text(name.ifBlank { "Untitled" }, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, color = g.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${existing?.count ?: 0} taps", color = g.text3, fontSize = 13.sp)
        }
        Spacer(Modifier.height(18.dp))

        FieldLabel("Name")
        GlassField(name, { name = it.take(48) }, "e.g. Coffee", Modifier.fillMaxWidth(), keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
        Spacer(Modifier.height(16.dp))

        FieldLabel("Colour")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Palette.COLORS.forEach { hex -> Swatch(hexColor(hex), color.equals(hex, true), { color = hex }) }
        }
        Spacer(Modifier.height(16.dp))

        FieldLabel("Counting since")
        Row(verticalAlignment = Alignment.CenterVertically) {
            GlassField(start, { start = it.take(10) }, "YYYY-MM-DD", Modifier.weight(1f), leading = VIcons.Calendar, mono = true)
            Spacer(Modifier.width(10.dp))
            VButton("Today", { start = Dates.iso(Dates.today()) }, height = 46.dp)
        }
        if (!startOk) Hint(if (Dates.parse(start) == null) "Use the form 2026-10-31." else "The start can’t be in the future.", error = true)
        Spacer(Modifier.height(16.dp))

        FieldLabel("Daily goal")
        GlassField(goal, { goal = it.filter(Char::isDigit).take(6) }, "None", Modifier.fillMaxWidth(), leading = VIcons.Target, keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
        Hint("Shown as a ring on the card and as progress in the live notification.")
        Spacer(Modifier.height(16.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Daily reminder", color = g.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Text(if (remind) "${Reminder(hour, minute).label} · ${Schedule.daysLabel(days)}" else "A notification with a +1 button", color = g.text3, fontSize = 12.5.sp)
            }
            Toggle(remind, { remind = it })
        }
        if (remind) {
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
                Stepper(hour, { hour = (it + 24) % 24 }, 1)
                Text(":", color = g.text, fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 4.dp))
                Stepper(minute, { minute = (it + 60) % 60 }, 5)
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                listOf("M", "T", "W", "T", "F", "S", "S").forEachIndexed { i, d ->
                    val bit = 1 shl i
                    val on = days and bit != 0
                    Box(
                        Modifier
                            .weight(1f)
                            .height(38.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (on) g.accent else g.raised)
                            .clickable(role = Role.Checkbox, onClickLabel = Dates.WEEKDAYS_LONG[i]) { days = days xor bit },
                        contentAlignment = Alignment.Center,
                    ) { Text(d, color = if (on) g.accentInk else g.text2, fontWeight = FontWeight.Bold) }
                }
            }
            if (days == 0) Hint("Pick at least one day.", error = true)
        }

        if (existing != null) {
            Spacer(Modifier.height(22.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (existing.count > 0) VButton("Clear taps", { c.clear(existing) }, Modifier.weight(1f), icon = VIcons.Undo, kind = ButtonKind.Ghost, color = g.danger)
                VButton("Delete event", { c.delete(existing) }, Modifier.weight(1f), icon = VIcons.Trash, kind = ButtonKind.Ghost, color = g.danger)
            }
        }
    }
}

@Composable
private fun Stepper(value: Int, onChange: (Int) -> Unit, step: Int) {
    val g = LocalGlass.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconAction(VIcons.Left, "Less", { onChange(value - step) }, size = 40.dp)
        Text(value.toString().padStart(2, '0'), Modifier.width(56.dp), color = g.text, fontSize = 28.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        IconAction(VIcons.Right, "More", { onChange(value + step) }, size = 40.dp)
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(text, Modifier.padding(bottom = 8.dp), color = LocalGlass.current.text2, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun Hint(text: String, error: Boolean = false) {
    val g = LocalGlass.current
    Text(text, Modifier.padding(top = 6.dp), color = if (error) g.danger else g.text3, fontSize = 12.5.sp, lineHeight = 17.sp)
}

@Composable
fun ImportSheet(c: AppController, wide: Boolean) {
    val g = LocalGlass.current
    val platform = LocalPlatform.current
    val decoded = remember(c.importText) { if (c.importText.isBlank()) null else Codec.decode(c.importText) }
    Sheet(visible = c.importing, title = "Import", wide = wide, onDismiss = { c.importing = false }) {
        Text("Paste a Virulenter web link, a data code, or a JSON backup.", color = g.text2, fontSize = 14.sp, lineHeight = 20.sp)
        Spacer(Modifier.height(12.dp))
        GlassField(c.importText, { c.importText = it }, "https://…/#d=…   or   { \"events\": [ … ] }", Modifier.fillMaxWidth(), singleLine = false, minLines = 5, mono = true)
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                when {
                    c.importText.isBlank() -> "Nothing pasted yet"
                    decoded == null -> "Not recognised as Virulenter data"
                    else -> decoded.state.events.let { "Found ${it.size} ${if (it.size == 1) "event" else "events"} · ${it.sumOf { e -> e.count }} taps" }
                },
                Modifier.weight(1f),
                color = if (c.importText.isNotBlank() && decoded == null) g.danger else g.text3,
                fontSize = 13.sp,
            )
            VButton("Open file…", { platform.openFile { c.importText = it } }, icon = VIcons.Download, height = 38.dp)
        }
        Spacer(Modifier.height(18.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            VButton("Merge", { c.runImport(ImportMode.Merge) }, Modifier.weight(1f), icon = VIcons.Merge, kind = ButtonKind.Primary, enabled = decoded != null)
            VButton("Replace", {
                c.confirm = Confirm(
                    title = "Replace everything?",
                    message = "Your events and taps on this device will be replaced by the imported ones.",
                    confirm = "Replace",
                    danger = true,
                ) { c.runImport(ImportMode.Replace) }
            }, Modifier.weight(1f), icon = VIcons.Download, enabled = decoded != null)
        }
        Spacer(Modifier.height(10.dp))
        Text(
            "Merge keeps everything here and adds new events and taps — importing the same backup twice adds nothing. Replace swaps it all for the import.",
            color = g.text3, fontSize = 12.5.sp, lineHeight = 17.sp,
        )
    }
}
