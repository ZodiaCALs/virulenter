package com.virulenter.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virulenter.model.AppState
import com.virulenter.model.Dates
import com.virulenter.model.Stats
import com.virulenter.ui.AppController
import com.virulenter.ui.Insets
import com.virulenter.ui.charts.ColumnChart
import com.virulenter.ui.charts.Emphasis
import com.virulenter.ui.charts.HeatGrid
import com.virulenter.ui.charts.LegendSwatches
import com.virulenter.ui.components.FilterChip
import com.virulenter.ui.components.IconAction
import com.virulenter.ui.components.Segmented
import com.virulenter.ui.components.VIcons
import com.virulenter.ui.components.rememberNow
import com.virulenter.ui.glass.GlassPanel
import com.virulenter.ui.glass.LocalHaze
import com.virulenter.ui.glass.glass
import com.virulenter.ui.theme.LocalGlass
import com.virulenter.ui.theme.hexColor
import com.virulenter.ui.theme.onColor
import com.virulenter.ui.theme.spin
import androidx.compose.ui.graphics.lerp
import kotlinx.datetime.LocalDate
import kotlin.math.max

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun StatsScreen(c: AppController, state: AppState, insets: Insets, list: LazyListState) {
    val g = LocalGlass.current
    val now by rememberNow(60_000)
    val today = Dates.dayOf(now)
    var range by remember { mutableStateOf(Stats.Range.Month) }
    var only by remember { mutableStateOf<String?>(null) }
    if (only != null && state.event(only) == null) only = null

    val events = remember(state.events, only) { if (only == null) state.events else state.events.filter { it.id == only } }
    val color = only?.let { id -> state.event(id)?.let { hexColor(it.color) } } ?: g.accent
    val totals = remember(events) { Stats.dayTotals(events) }
    val (from, to) = Stats.bounds(range, today)
    val (pFrom, pTo) = Stats.previous(range, today)
    val total = Stats.total(totals, from, to)
    val days = Dates.daysBetween(from, to) + 1
    val active = Stats.activeDays(totals, from, to)
    val streaks = remember(totals, today) { Stats.streaks(totals, today) }
    val buckets = remember(events, range, today) { Stats.buckets(events, range, today) }
    val weekdays = remember(events, from, to) { Stats.byWeekday(events, from, to) }
    val hours = remember(events, from, to) { Stats.byHour(events, from, to) }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        LazyColumn(
            Modifier.widthIn(max = 860.dp).fillMaxSize(),
            state = list,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, top = insets.top, bottom = insets.bottom),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (state.events.isEmpty()) {
                item {
                    GlassPanel(Modifier.fillMaxWidth()) {
                        Text("Statistics appear once you have an event and a few taps.", Modifier.padding(24.dp), color = g.text2)
                    }
                }
                return@LazyColumn
            }

            stickyHeader(key = "filters") { Filters(range, { range = it }, only, { only = it }, state) }

            item(key = "tiles") {
                Tiles(
                    total = total, prev = Stats.total(totals, pFrom, pTo), rangeTitle = range.title,
                    perDay = total.toDouble() / days, prevPerDay = Stats.total(totals, pFrom, pTo).toDouble() / days,
                    active = active, prevActive = Stats.activeDays(totals, pFrom, pTo), days = days,
                    streak = streaks.current, best = streaks.longest, color = color,
                )
            }

            item(key = "trend") {
                var sel by remember(range, only) { mutableStateOf<Int?>(null) }
                val unit = when (range) { Stats.Range.Quarter -> "week"; Stats.Range.Year -> "month"; else -> "day" }
                Panel("Taps per $unit", "$total taps · ${range.title}") {
                    ColumnChart(
                        values = buckets.map { it.total },
                        ticks = buckets.map { it.tick },
                        color = color,
                        selected = sel,
                        onSelect = { sel = it },
                        current = buckets.indexOfLast { it.current },
                        onOpen = { i -> c.showDay(minOf(buckets[i].to, today)) },
                        height = 200.dp,
                    ) { i ->
                        val b = buckets[i]
                        Text(b.label, color = g.text3, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Text("${b.total} ${if (b.total == 1) "tap" else "taps"}", color = g.text, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        b.split.take(5).forEach { (e, n) ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(8.dp).clip(RoundedCornerShape(2.dp)).background(hexColor(e.color)))
                                Spacer(Modifier.width(6.dp))
                                Text("$n", color = g.text, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.width(6.dp))
                                Text(e.name, color = g.text2, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                        if (b.split.size > 5) Text("+${b.split.size - 5} more", color = g.text3, fontSize = 11.5.sp)
                        Text(if (b.from == b.to) "Click or tap again to open the day" else "Click or tap again to open it", color = g.text3, fontSize = 11.sp)
                    }
                }
            }

            item(key = "weekday") {
                var sel by remember { mutableStateOf<Int?>(null) }
                val busiest = weekdays.indices.maxByOrNull { weekdays[it] }?.takeIf { weekdays[it] > 0 }
                Panel("By weekday", busiest?.let { "busiest: ${Dates.WEEKDAYS_LONG[it]}" } ?: "no taps in range") {
                    ColumnChart(
                        values = weekdays.toList(), ticks = Dates.WEEKDAYS, color = color, selected = sel, onSelect = { sel = it },
                        emphasis = Emphasis.Peak, average = false, height = 160.dp,
                    ) { i -> TipLine(Dates.WEEKDAYS_LONG[i], weekdays[i], total) }
                }
            }

            item(key = "hour") {
                var sel by remember { mutableStateOf<Int?>(null) }
                val busiest = hours.indices.maxByOrNull { hours[it] }?.takeIf { hours[it] > 0 }
                Panel("By hour", busiest?.let { "busiest: ${hourLabel(it)}" } ?: "no taps in range") {
                    ColumnChart(
                        values = hours.toList(), ticks = (0 until 24).map { if (it % 6 == 0) "${it.toString().padStart(2, '0')}:00" else "" },
                        color = color, selected = sel, onSelect = { sel = it }, emphasis = Emphasis.Peak, average = false, height = 160.dp,
                    ) { i -> TipLine(hourLabel(i), hours[i], total) }
                }
            }

            item(key = "events") { EventsTable(state, from, to, today) }
            item(key = "heat") { Activity(c, totals, today, color) }
        }
    }
}

private fun hourLabel(h: Int) = "${h.toString().padStart(2, '0')}:00–${((h + 1) % 24).toString().padStart(2, '0')}:00"

@Composable
private fun TipLine(label: String, n: Int, total: Int) {
    val g = LocalGlass.current
    Text(label, color = g.text3, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    Text("$n ${if (n == 1) "tap" else "taps"}", color = g.text, fontSize = 17.sp, fontWeight = FontWeight.Bold)
    if (total > 0) Text("${(n * 100 + total / 2) / total}% of the range", color = g.text2, fontSize = 12.sp)
}

@Composable
private fun Filters(range: Stats.Range, onRange: (Stats.Range) -> Unit, only: String?, onOnly: (String?) -> Unit, state: AppState) {
    val g = LocalGlass.current
    Row(
        Modifier
            .fillMaxWidth()
            .glass(g, LocalHaze.current, RoundedCornerShape(10.dp), strong = true)
            .padding(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Segmented(Stats.Range.entries, range, { it.label }, onRange, Modifier.width(232.dp))
        Spacer(Modifier.width(8.dp))
        Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip("All events", only == null, { onOnly(null) })
            state.events.forEach { e -> FilterChip(e.name, only == e.id, { onOnly(if (only == e.id) null else e.id) }, dot = hexColor(e.color)) }
        }
    }
}

@Composable
private fun Tiles(
    total: Int, prev: Int, rangeTitle: String, perDay: Double, prevPerDay: Double,
    active: Int, prevActive: Int, days: Int, streak: Int, best: Int, color: Color,
) {
    val g = LocalGlass.current
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val narrow = maxWidth < 560.dp
        val lead = @Composable { mod: Modifier ->
            val ink = onColor(color)
            Column(
                mod
                    .clip(RoundedCornerShape(12.dp))
                    .background(Brush.linearGradient(listOf(color.copy(alpha = 0.95f), color, lerpSpin(color))))
                    .padding(18.dp),
            ) {
                Text(total.toString(), color = ink, fontSize = 44.sp, fontWeight = FontWeight.Black, letterSpacing = (-1.5).sp)
                Text("taps · $rangeTitle", color = ink.copy(alpha = 0.85f), fontSize = 14.sp)
                Stats.delta(total, prev)?.let { d ->
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "$d vs the period before",
                        Modifier.clip(RoundedCornerShape(6.dp)).background(Color.White.copy(alpha = 0.18f)).padding(horizontal = 8.dp, vertical = 4.dp),
                        color = ink, fontSize = 12.5.sp, fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
        val small = @Composable { mod: Modifier, value: String, label: String, delta: String? ->
            GlassPanel(mod) {
                Column(Modifier.padding(14.dp)) {
                    Text(value, color = g.text, fontSize = 24.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.6).sp, maxLines = 1)
                    Text(label, color = g.text3, fontSize = 12.5.sp, maxLines = 2)
                    if (delta != null) Text(delta, Modifier.padding(top = 6.dp), color = g.text2, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        val perDayDelta = if (prevPerDay > 0) Stats.delta((perDay * 1000).toInt(), (prevPerDay * 1000).toInt()) else null
        if (narrow) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                lead(Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    small(Modifier.weight(1f), Stats.fmtRate(perDay), "per day", perDayDelta)
                    small(Modifier.weight(1f), "$active", "active days of $days", Stats.delta(active, prevActive))
                    small(Modifier.weight(1f), "$streak", "day streak · best $best", null)
                }
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                lead(Modifier.weight(1.4f))
                small(Modifier.weight(1f), Stats.fmtRate(perDay), "per day", perDayDelta)
                small(Modifier.weight(1f), "$active", "active days of $days", Stats.delta(active, prevActive))
                small(Modifier.weight(1f), "$streak", "day streak · best $best", null)
            }
        }
    }
}

private fun lerpSpin(c: Color): Color = c.spin(24f)

@Composable
private fun Panel(title: String, subtitle: String, action: (@Composable () -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val g = LocalGlass.current
    GlassPanel(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, color = g.text)
                    Text(subtitle, color = g.text3, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                action?.invoke()
            }
            Spacer(Modifier.height(14.dp))
            content()
        }
    }
}

@Composable
private fun EventsTable(state: AppState, from: LocalDate, to: LocalDate, today: LocalDate) {
    val g = LocalGlass.current
    val rows = remember(state.events, from, to) {
        state.events.map { e -> e to Stats.total(Stats.dayTotalsFor(e), from, to) }.sortedByDescending { it.second }
    }
    val sum = max(1, rows.sumOf { it.second })
    Panel("Events", "share of the range") {
        rows.forEachIndexed { i, (e, n) ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(g.line))
            Row(Modifier.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                val col = hexColor(e.color)
                Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(col))
                Spacer(Modifier.width(10.dp))
                Text(e.name, Modifier.weight(1f), color = g.text, fontSize = 14.5.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Box(Modifier.width(70.dp).height(6.dp).clip(RoundedCornerShape(2.dp)).background(g.heat[0])) {
                    Box(Modifier.fillMaxWidth(n.toFloat() / sum).height(6.dp).background(col))
                }
                Spacer(Modifier.width(10.dp))
                Text("$n", Modifier.width(44.dp), color = g.text, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1)
                Text("${Stats.fmtRate(Stats.perDay(e, today))}/d", Modifier.width(58.dp), color = g.text3, fontSize = 12.5.sp, maxLines = 1)
            }
        }
    }
}

@Composable
private fun Activity(c: AppController, totals: Map<LocalDate, Int>, today: LocalDate, color: Color) {
    val g = LocalGlass.current
    val weeks = remember(today) { Stats.heatWeeks(today) }
    val max = remember(totals) { totals.values.maxOrNull() ?: 0 }
    var sel by remember { mutableStateOf<LocalDate?>(null) }
    val scroll = rememberScrollState()
    LaunchedEffect(weeks, scroll.maxValue) { scroll.scrollTo(scroll.maxValue) }
    val base = if (g.dark) Color(0xFF151A24) else Color.White
    val palette = remember(color, g) { listOf(g.heat[0], lerp(base, color, 0.25f), lerp(base, color, 0.5f), lerp(base, color, 0.75f), color) }
    Panel("Activity", "the last 12 months", action = {
        IconAction(VIcons.Calendar, "Open in calendar", { c.showDay(sel ?: today) }, filled = false)
    }) {
        Box(Modifier.fillMaxWidth().horizontalScroll(scroll)) {
            HeatGrid(weeks, { d -> Stats.level(totals[d] ?: 0, max) }, sel, { sel = it }, palette = palette)
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            val s = sel
            Text(
                if (s == null) "Hover or touch a day" else "${Dates.fmtDayLong(s)} · ${totals[s] ?: 0} taps",
                Modifier.weight(1f), color = if (s == null) g.text3 else g.text, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            LegendSwatches(palette = palette)
        }
    }
}
