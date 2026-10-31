package com.virulenter.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virulenter.model.AppState
import com.virulenter.model.Dates
import com.virulenter.model.Event
import com.virulenter.model.Schedule
import com.virulenter.model.Stats
import com.virulenter.ui.AppController
import com.virulenter.ui.Insets
import com.virulenter.ui.Sort
import com.virulenter.ui.charts.GoalRing
import com.virulenter.ui.charts.Sparkline
import com.virulenter.ui.components.ButtonKind
import com.virulenter.ui.components.GlassField
import com.virulenter.ui.components.Hairline
import com.virulenter.ui.components.IconAction
import com.virulenter.ui.components.Monogram
import com.virulenter.ui.components.RollingNumber
import com.virulenter.ui.components.VButton
import com.virulenter.ui.components.VIcon
import com.virulenter.ui.components.VIcons
import com.virulenter.ui.components.rememberNow
import com.virulenter.ui.content
import com.virulenter.ui.glass.GlassPanel
import com.virulenter.ui.theme.LocalGlass
import com.virulenter.ui.theme.hexColor
import kotlin.math.max

@Composable
fun EventsScreen(c: AppController, state: AppState, insets: Insets, grid: LazyGridState) {
    val now by rememberNow(15_000)
    val today = Dates.dayOf(now)
    val summary = remember(state.events, today) { Stats.summary(state.events, today) }
    val query = c.search.trim()
    val shown = remember(state.events, query, c.sort) {
        val list = if (query.isEmpty()) state.events else state.events.filter { it.name.contains(query, ignoreCase = true) }
        when (c.sort) {
            Sort.Recent -> list.sortedByDescending { it.last ?: 0L }
            Sort.Count -> list.sortedByDescending { it.count }
            Sort.Name -> list.sortedBy { it.name.lowercase() }
            Sort.Custom -> list
        }
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(340.dp),
            state = grid,
            modifier = Modifier.widthIn(max = 1180.dp).fillMaxSize(),
            contentPadding = insets.content(),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "summary") { SummaryStrip(summary) }
            if (state.events.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }, key = "empty") { EmptyEvents(c) }
            } else {
                item(span = { GridItemSpan(maxLineSpan) }, key = "toolbar") { Toolbar(c) }
                if (shown.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }, key = "none") {
                    Text("No event matches “$query”.", Modifier.fillMaxWidth().padding(24.dp), color = LocalGlass.current.text3, textAlign = TextAlign.Center)
                }
                items(shown, key = { it.id }) { e ->
                    EventCard(
                        e, c,
                        tracked = state.tracked?.id == e.id,
                        live = state.settings.liveTracker,
                        today = today, now = now,
                        modifier = Modifier.animateItem(),
                    )
                }
            }
        }
    }
}

@Composable
private fun SummaryStrip(s: Stats.Summary) {
    val g = LocalGlass.current
    GlassPanel(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(vertical = 14.dp)) {
            listOf(Triple(s.today, "today", true), Triple(s.week, "last 7 days", false), Triple(s.total, "all time", false))
                .forEachIndexed { i, (n, label, hi) ->
                    if (i > 0) Box(Modifier.width(1.dp).height(44.dp).align(Alignment.CenterVertically).background(g.line))
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        RollingNumber(n, TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.8).sp), if (hi) g.accentText else g.text)
                        Text(label, color = g.text3, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                    }
                }
        }
    }
}

@Composable
private fun Toolbar(c: AppController) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        GlassField(c.search, { c.search = it }, "Search events", Modifier.weight(1f), leading = VIcons.Search)
        VButton(c.sort.label, { c.sort = Sort.entries[(c.sort.ordinal + 1) % Sort.entries.size] }, icon = VIcons.Sort, height = 46.dp)
    }
}

@Composable
private fun EmptyEvents(c: AppController) {
    val g = LocalGlass.current
    GlassPanel(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 34.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(68.dp).clip(RoundedCornerShape(12.dp)).background(Brush.linearGradient(listOf(g.accent2, g.accent))),
                contentAlignment = Alignment.Center,
            ) { VIcon(VIcons.Plus, g.accentInk, 32.dp) }
            Spacer(Modifier.height(16.dp))
            Text("Count anything with a tap", style = MaterialTheme.typography.titleLarge, color = g.text, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            Text(
                "Coffees, cigarettes, glasses of water, workouts. Make an event, tap it each time — the calendar and statistics fill themselves.",
                color = g.text2, fontSize = 14.5.sp, textAlign = TextAlign.Center, lineHeight = 21.sp, modifier = Modifier.widthIn(max = 420.dp),
            )
            Spacer(Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                VButton("New event", c::newEvent, icon = VIcons.Plus, kind = ButtonKind.Primary)
                VButton("Import", { c.openImport() }, icon = VIcons.Download)
            }
        }
    }
}

@Composable
private fun EventCard(e: Event, c: AppController, tracked: Boolean, live: Boolean, today: kotlinx.datetime.LocalDate, now: Long, modifier: Modifier) {
    val g = LocalGlass.current
    val color = hexColor(e.color)
    val totals = remember(e.log) { Stats.dayTotalsFor(e) }
    val todayCount = totals[today] ?: 0
    val recent = remember(totals, today) { Stats.recent(totals, 7, today) }
    GlassPanel(modifier.fillMaxWidth(), wash = g.soft(color, if (g.dark) 0.16f else 0.12f)) {
        Column(Modifier.padding(start = 16.dp, end = 10.dp, top = 14.dp, bottom = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Monogram(e.name, color)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(e.name, style = MaterialTheme.typography.titleMedium, color = g.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val r = e.reminder
                    if (r != null && r.enabled) Row(verticalAlignment = Alignment.CenterVertically) {
                        VIcon(VIcons.Bell, g.text3, 13.dp)
                        Spacer(Modifier.width(4.dp))
                        Text("${r.label} · ${Schedule.daysLabel(r.days)}", color = g.text3, fontSize = 12.sp, maxLines = 1)
                    }
                }
                if (tracked && live) LivePill(color)
                EventMenu(e, c, tracked, live)
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.padding(end = 6.dp), verticalAlignment = Alignment.Bottom) {
                RollingNumber(e.count, TextStyle(fontSize = 46.sp, fontWeight = FontWeight.Bold, letterSpacing = (-2).sp, lineHeight = 48.sp), g.text)
                Text("taps", Modifier.padding(start = 6.dp, bottom = 8.dp), color = g.text3, fontSize = 14.sp)
                Spacer(Modifier.weight(1f))
                val goal = e.goal
                if (goal != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(horizontalAlignment = Alignment.End) {
                            Text("$todayCount / $goal", color = g.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Text(if (todayCount >= goal) "goal met" else "today", color = if (todayCount >= goal) g.ink(color) else g.text3, fontSize = 11.5.sp)
                        }
                        Spacer(Modifier.width(10.dp))
                        GoalRing(todayCount, goal, color)
                    }
                } else Sparkline(recent, color)
            }
            Spacer(Modifier.height(12.dp))
            Hairline(Modifier.padding(end = 6.dp))
            Spacer(Modifier.height(10.dp))
            Row(Modifier.padding(end = 6.dp)) {
                Fact("Today", todayCount.toString(), Modifier.weight(1f))
                Fact("Average", "${Stats.fmtRate(Stats.perDay(e, today))}/day", Modifier.weight(1f))
                Fact("Tracking", "${Stats.trackingDays(e, today)} days", Modifier.weight(1f))
            }
            Spacer(Modifier.height(12.dp))
            TapButton(color, Modifier.padding(end = 6.dp)) { c.tap(e) }
            Spacer(Modifier.height(9.dp))
            val last = e.last
            Text(
                if (last == null) "No taps yet" else "Last: ${Dates.fmtRelative(last, now)} · ${Dates.fmtDay(Dates.dayOf(last))} at ${Dates.fmtTime(last)}",
                Modifier.fillMaxWidth().padding(end = 6.dp),
                color = g.text3, fontSize = 12.5.sp, textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun Fact(label: String, value: String, modifier: Modifier) {
    val g = LocalGlass.current
    Column(modifier) {
        Text(label.uppercase(), color = g.text3, fontSize = 10.5.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp, maxLines = 1)
        Spacer(Modifier.height(2.dp))
        Text(value, color = g.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun LivePill(color: Color) {
    val g = LocalGlass.current
    val pulse = rememberInfiniteTransition(label = "live")
    val a by pulse.animateFloat(0.35f, 1f, infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Reverse), label = "pulse")
    Row(
        Modifier.padding(end = 4.dp).clip(RoundedCornerShape(6.dp)).background(g.soft(color)).padding(horizontal = 7.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).alpha(a).clip(CircleShape).background(color))
        Spacer(Modifier.width(5.dp))
        Text("LIVE", color = g.ink(color), fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp)
    }
}

@Composable
private fun EventMenu(e: Event, c: AppController, tracked: Boolean, live: Boolean) {
    val g = LocalGlass.current
    var open by remember { mutableStateOf(false) }
    Box {
        IconAction(VIcons.More, "More for ${e.name}", { open = true }, size = 36.dp, filled = false)
        DropdownMenu(open, { open = false }, containerColor = g.solid, shape = RoundedCornerShape(10.dp)) {
            @Composable
            fun item(text: String, icon: ImageVector, danger: Boolean = false, action: () -> Unit) = DropdownMenuItem(
                text = { Text(text, color = if (danger) g.danger else g.text, fontSize = 14.5.sp) },
                leadingIcon = { VIcon(icon, if (danger) g.danger else g.text2, 18.dp) },
                onClick = { open = false; action() },
            )
            item("Edit", VIcons.Pencil) { c.edit(e.id) }
            if (tracked && live) item("Stop live counter", VIcons.Stopwatch) { c.store.setSettings { it.copy(liveTracker = false) } }
            else item("Live counter", VIcons.Stopwatch) {
                c.store.setTracker(e.id)
                c.store.setSettings { it.copy(liveTracker = true) }
                c.say("Live counter: ${e.name}")
            }
            item("Show in calendar", VIcons.Calendar) { c.showDay(e.last?.let { Dates.dayOf(it) } ?: Dates.today()) }
            if (c.sort == Sort.Custom) {
                item("Move up", VIcons.Up) { c.store.move(e.id, -1) }
                item("Move down", VIcons.Down) { c.store.move(e.id, 1) }
            }
            if (e.count > 0) item("Clear taps", VIcons.Undo, danger = true) { c.clear(e) }
            item("Delete", VIcons.Trash, danger = true) { c.delete(e) }
        }
    }
}

/** The big button: a tinted glass slab that sinks when pressed and throws a "+1". */
@Composable
private fun TapButton(color: Color, modifier: Modifier = Modifier, onTap: () -> Unit) {
    val g = LocalGlass.current
    val haptic = LocalHapticFeedback.current
    val press = remember { MutableInteractionSource() }
    val pressed by press.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, spring(stiffness = 900f), label = "tap")
    val bursts = remember { mutableStateListOf<Long>() }
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier
            .fillMaxWidth()
            .height(56.dp)
            .scale(scale)
            .clip(shape)
            .background(Brush.verticalGradient(listOf(color.copy(alpha = if (g.dark) 0.34f else 0.24f), color.copy(alpha = if (g.dark) 0.2f else 0.14f))))
            .border(1.dp, Brush.verticalGradient(listOf(color.copy(alpha = 0.7f), color.copy(alpha = 0.25f))), shape)
            .clickable(press, ripple(color = color), role = Role.Button, onClickLabel = "Count one") {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                bursts += Dates.now()
                onTap()
            },
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            VIcon(VIcons.Plus, g.ink(color), 20.dp)
            Spacer(Modifier.width(8.dp))
            Text("Tap to count", color = g.ink(color), fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
        for (id in bursts.toList()) key(id) { PlusOne(color) { bursts.remove(id) } }
    }
}

@Composable
private fun PlusOne(color: Color, onDone: () -> Unit) {
    val g = LocalGlass.current
    val t = remember { Animatable(0f) }
    LaunchedEffect(Unit) { t.animateTo(1f, tween(700)); onDone() }
    Text(
        "+1",
        Modifier.offset(x = 92.dp, y = (-26 * t.value).dp).alpha(max(0f, 1f - t.value)),
        color = g.ink(color), fontSize = 18.sp, fontWeight = FontWeight.Black,
    )
}
