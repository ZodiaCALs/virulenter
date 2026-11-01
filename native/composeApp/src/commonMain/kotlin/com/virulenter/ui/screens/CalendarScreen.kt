package com.virulenter.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virulenter.model.AppState
import com.virulenter.model.Dates
import com.virulenter.model.Event
import com.virulenter.model.Stats
import com.virulenter.ui.AppController
import com.virulenter.ui.Insets
import com.virulenter.ui.charts.LegendSwatches
import com.virulenter.ui.components.ButtonKind
import com.virulenter.ui.components.FilterChip
import com.virulenter.ui.components.GlassField
import com.virulenter.ui.components.IconAction
import com.virulenter.ui.components.VButton
import com.virulenter.ui.components.VIcon
import com.virulenter.ui.components.VIcons
import com.virulenter.ui.components.rememberNow
import com.virulenter.ui.content
import com.virulenter.ui.glass.GlassPanel
import com.virulenter.ui.theme.LocalGlass
import com.virulenter.ui.theme.hexColor
import com.virulenter.ui.theme.onColor
import kotlinx.datetime.LocalDate
import kotlin.math.abs

@Composable
fun CalendarScreen(c: AppController, state: AppState, insets: Insets, list: LazyListState) {
    val now by rememberNow(60_000)
    val today = Dates.dayOf(now)
    val totals = remember(state.events) { Stats.dayTotals(state.events) }
    val selected = c.selectedDay ?: today
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        LazyColumn(Modifier.widthIn(max = 760.dp).fillMaxSize(), state = list, contentPadding = insets.content(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item(key = "month") { MonthCard(c, totals, today, selected) }
            item(key = "day") { DayPanel(c, state, selected, today) }
        }
    }
}

@Composable
private fun MonthCard(c: AppController, totals: Map<LocalDate, Int>, today: LocalDate, selected: LocalDate) {
    val g = LocalGlass.current
    val month = c.calendarMonth
    var dir by remember { mutableStateOf(1) }
    fun go(n: Int) { dir = n; c.calendarMonth = Dates.addMonths(month, n) }
    GlassPanel(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconAction(VIcons.Left, "Previous month", { go(-1) }, filled = false)
                Text(Dates.fmtMonth(month), Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, color = g.text, textAlign = TextAlign.Center)
                IconAction(VIcons.Right, "Next month", { go(1) }, filled = false)
            }
            if (Dates.monthStart(today) != month || selected != today) {
                Box(Modifier.fillMaxWidth().padding(top = 4.dp), contentAlignment = Alignment.Center) {
                    VButton("Today", { dir = if (today > month) 1 else -1; c.calendarMonth = Dates.monthStart(today); c.selectedDay = today }, icon = VIcons.Today, height = 34.dp)
                }
            }
            Spacer(Modifier.height(10.dp))
            Row {
                Dates.WEEKDAYS.forEach { d ->
                    Text(d.uppercase(), Modifier.weight(1f), color = g.text3, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp, textAlign = TextAlign.Center)
                }
            }
            Spacer(Modifier.height(6.dp))
            AnimatedContent(
                targetState = month,
                transitionSpec = {
                    (slideInHorizontally(tween(260)) { w -> dir * w / 3 } + fadeIn(tween(200)))
                        .togetherWith(slideOutHorizontally(tween(200)) { w -> -dir * w / 3 } + fadeOut(tween(150)))
                },
                label = "month",
            ) { m ->
                MonthGrid(m, totals, today, selected, onPick = { c.selectedDay = it }, onSwipe = { go(it) })
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Less", color = g.text3, fontSize = 11.sp)
                Spacer(Modifier.width(6.dp))
                LegendSwatches()
                Spacer(Modifier.width(6.dp))
                Text("More", color = g.text3, fontSize = 11.sp)
                Spacer(Modifier.weight(1f))
                val inMonth = totals.entries.filter { Dates.monthStart(it.key) == month }.sumOf { it.value }
                Text("$inMonth taps this month", color = g.text3, fontSize = 11.5.sp)
            }
        }
    }
}

@Composable
private fun MonthGrid(month: LocalDate, totals: Map<LocalDate, Int>, today: LocalDate, selected: LocalDate, onPick: (LocalDate) -> Unit, onSwipe: (Int) -> Unit) {
    val g = LocalGlass.current
    val first = Dates.weekStart(month)
    val next = Dates.addMonths(month, 1)
    val weeks = (Dates.daysBetween(first, Dates.addDays(next, -1)) / 7) + 1
    val max = remember(month, totals) { (0 until weeks * 7).maxOf { totals[Dates.addDays(first, it)] ?: 0 } }
    var drag by remember { mutableStateOf(0f) }
    Column(
        Modifier.pointerInput(month) {
            detectHorizontalDragGestures(
                onDragEnd = { if (abs(drag) > 60.dp.toPx()) onSwipe(if (drag < 0) 1 else -1); drag = 0f },
                onDragCancel = { drag = 0f },
            ) { _, dx -> drag += dx }
        },
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        for (w in 0 until weeks) {
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                for (d in 0 until 7) {
                    val day = Dates.addDays(first, w * 7 + d)
                    val inMonth = day.monthNumber == month.monthNumber
                    val n = totals[day] ?: 0
                    val lv = Stats.level(n, max)
                    val bg = if (lv > 0) g.heat[lv] else Color.Transparent
                    val ink = when {
                        lv >= 3 -> onColor(g.heat[lv])
                        !inMonth -> g.text3.copy(alpha = 0.5f)
                        day > today -> g.text3
                        else -> g.text
                    }
                    val shape = RoundedCornerShape(8.dp)
                    Column(
                        Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .clip(shape)
                            .background(if (lv == 0 && inMonth && day <= today) g.heat[0] else bg)
                            .then(
                                when {
                                    day == selected -> Modifier.border(2.dp, g.text, shape)
                                    day == today -> Modifier.border(1.5.dp, g.accent, shape)
                                    else -> Modifier
                                },
                            )
                            .clickable(role = Role.Button, onClickLabel = Dates.fmtDayLong(day)) { onPick(day) },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(day.dayOfMonth.toString(), color = ink, fontSize = 15.sp, fontWeight = if (day == today) FontWeight.Black else FontWeight.SemiBold)
                        if (n > 0 && inMonth) Text(n.toString(), color = ink.copy(alpha = 0.8f), fontSize = 10.5.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
private fun DayPanel(c: AppController, state: AppState, day: LocalDate, today: LocalDate) {
    val g = LocalGlass.current
    val entries = remember(state.events, day) {
        state.events.flatMap { e -> e.log.filter { Dates.dayOf(it) == day }.map { e to it } }.sortedByDescending { it.second }
    }
    var addFor by remember(day) { mutableStateOf<String?>(null) }
    var time by remember(day) { mutableStateOf(if (day == today) Dates.fmtTime(Dates.now()) else "12:00") }
    GlassPanel(Modifier.fillMaxWidth()) {
        Column {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(Dates.fmtDayLong(day), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, color = g.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${entries.size} ${if (entries.size == 1) "tap" else "taps"}",
                    Modifier.clip(RoundedCornerShape(6.dp)).background(g.accentSoft).padding(horizontal = 10.dp, vertical = 4.dp),
                    color = g.accentText, fontSize = 12.5.sp, fontWeight = FontWeight.Bold,
                )
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(g.line))
            if (entries.isEmpty()) {
                Text(
                    if (day > today) "This day hasn’t happened yet." else "Nothing recorded on this day.",
                    Modifier.fillMaxWidth().padding(20.dp), color = g.text3, textAlign = TextAlign.Center, fontSize = 14.sp,
                )
            }
            entries.take(60).forEachIndexed { i, (e, ts) ->
                if (i > 0) Box(Modifier.fillMaxWidth().padding(start = 40.dp).height(1.dp).background(g.line))
                Row(Modifier.padding(start = 16.dp, end = 6.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(hexColor(e.color)))
                    Spacer(Modifier.width(14.dp))
                    Text(e.name, Modifier.weight(1f), color = g.text, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(Dates.fmtTime(ts), color = g.text2, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    IconAction(VIcons.Close, "Remove ${e.name} at ${Dates.fmtTime(ts)}", {
                        if (c.store.removeTap(e.id, ts)) c.say("Removed ${e.name} at ${Dates.fmtTime(ts)}", "Undo") { c.store.tap(e.id, ts) }
                    }, filled = false, size = 40.dp, tint = g.text3)
                }
            }
            if (entries.size > 60) Text("and ${entries.size - 60} more", Modifier.padding(16.dp), color = g.text3, fontSize = 13.sp)

            if (day <= today && state.events.isNotEmpty()) {
                Box(Modifier.fillMaxWidth().height(1.dp).background(g.line))
                Column(Modifier.padding(16.dp)) {
                    Text("Add a tap on this day", color = g.text2, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(10.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        state.events.forEach { e: Event ->
                            FilterChip(e.name, addFor == e.id, { addFor = if (addFor == e.id) null else e.id }, dot = hexColor(e.color))
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        GlassField(time, { time = it.filter { ch -> ch.isDigit() || ch == ':' }.take(5) }, "HH:MM", Modifier.width(110.dp),
                            leading = VIcons.Clock, keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
                        Spacer(Modifier.width(10.dp))
                        val parsed = parseTime(time)
                        val at = parsed?.let { Dates.at(day, it.first, it.second) }
                        val ok = addFor != null && at != null && at <= Dates.now()
                        VButton("Add", {
                            val id = addFor ?: return@VButton
                            val ts = at ?: return@VButton
                            c.store.tap(id, ts)
                            val name = state.event(id)?.name.orEmpty()
                            c.say("Added $name at ${Dates.fmtTime(ts)}", "Undo") { c.store.removeTap(id, ts) }
                        }, kind = ButtonKind.Primary, icon = VIcons.Plus, enabled = ok)
                    }
                    val future = parseTime(time)?.let { (h, m) -> day == today && Dates.at(day, h, m) > Dates.now() } == true
                    if (addFor != null && future) {
                        Text("That time is still to come.", Modifier.padding(top = 6.dp), color = g.text3, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

/** "8:05", "08:05", "805", "0805" → 8 to 5 */
fun parseTime(text: String): Pair<Int, Int>? {
    val t = text.trim()
    val (h, m) = when {
        ':' in t -> t.substringBefore(':') to t.substringAfter(':')
        t.length in 3..4 -> t.dropLast(2) to t.takeLast(2)
        t.length in 1..2 -> t to "0"
        else -> return null
    }
    val hh = h.toIntOrNull() ?: return null
    val mm = m.ifEmpty { "0" }.toIntOrNull() ?: return null
    return if (hh in 0..23 && mm in 0..59) hh to mm else null
}
