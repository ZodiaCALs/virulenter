package com.virulenter.ui.charts

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virulenter.ui.glass.frost
import com.virulenter.ui.glass.LocalHaze
import com.virulenter.ui.glass.rimBrush
import com.virulenter.ui.theme.LocalGlass
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/** Round axis steps: 1, 2 or 5 × 10ⁿ, integers only. */
fun niceTicks(maxValue: Int, target: Int = 4): List<Int> {
    if (maxValue <= 0) return listOf(0, 1)
    val raw = maxValue.toDouble() / target
    val mag = 10.0.pow(floor(log10(raw)))
    val step = listOf(1.0, 2.0, 5.0, 10.0).map { it * mag }.first { it >= raw }.let { max(1, ceil(it).toInt()) }
    val top = ceil(maxValue.toDouble() / step).toInt() * step
    return (0..top step step).toList()
}

enum class Emphasis { None, Peak }

/**
 * A column chart: hairline grid on round ticks, 4dp data ends, an optional
 * dashed mean and a labelled peak. Hover (mouse) or touch selects a column
 * and shows [tooltip] over it; a click, or a second tap, calls [onOpen].
 */
@Composable
fun ColumnChart(
    values: List<Int>,
    ticks: List<String>,
    color: Color,
    selected: Int?,
    onSelect: (Int?) -> Unit,
    modifier: Modifier = Modifier,
    height: Dp = 180.dp,
    emphasis: Emphasis = Emphasis.None,
    average: Boolean = true,
    current: Int? = null,
    onOpen: ((Int) -> Unit)? = null,
    tooltip: @Composable (Int) -> Unit = {},
) {
    val g = LocalGlass.current
    val measurer = rememberTextMeasurer()
    val labelStyle = TextStyle(color = g.text3, fontSize = 11.sp)
    val strongStyle = TextStyle(color = g.text2, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    val maxV = values.maxOrNull() ?: 0
    val axis = remember(maxV) { niceTicks(maxV) }
    val top = axis.last().coerceAtLeast(1)
    val peak = if (maxV > 0) values.indexOf(maxV) else -1
    val mean = if (values.isNotEmpty()) values.sum().toFloat() / values.size else 0f

    val sel by rememberUpdatedState(selected)
    val select by rememberUpdatedState(onSelect)
    val open by rememberUpdatedState(onOpen)
    val grow = remember { Animatable(0f) }
    LaunchedEffect(values) { grow.snapTo(0f); grow.animateTo(1f, tween(520)) }

    BoxWithConstraints(modifier.fillMaxWidth()) {
        val density = LocalDensity.current
        val widthPx = constraints.maxWidth.toFloat()
        val heightPx = with(density) { height.toPx() }
        val leftPx = with(density) { 30.dp.toPx() }
        val bottomPx = with(density) { 22.dp.toPx() }
        val topPadPx = with(density) { 18.dp.toPx() }
        val plotW = (widthPx - leftPx).coerceAtLeast(1f)
        val plotH = (heightPx - bottomPx - topPadPx).coerceAtLeast(1f)
        val slot = plotW / max(1, values.size)
        val barW = min(slot * 0.62f, with(density) { 28.dp.toPx() })
        fun barX(i: Int) = leftPx + slot * i + (slot - barW) / 2
        fun barTop(i: Int) = topPadPx + plotH - plotH * values[i] / top

        Canvas(
            Modifier
                .fillMaxWidth()
                .height(height)
                .pointerInput(values.size, widthPx) {
                    awaitPointerEventScope {
                        var last: Int? = null
                        while (true) {
                            val e = awaitPointerEvent()
                            val c = e.changes.firstOrNull() ?: continue
                            val i = ((c.position.x - leftPx) / slot).toInt()
                            val inside = c.position.x >= leftPx && i in values.indices
                            val mouse = c.type == PointerType.Mouse
                            when (e.type) {
                                PointerEventType.Move, PointerEventType.Enter ->
                                    if (mouse || c.pressed) { select(if (inside) i else null); last = if (inside) i else null }
                                PointerEventType.Press -> {
                                    if (!inside) { select(null); last = null; continue }
                                    /* touch: the first tap shows the column, a second opens it */
                                    if (!mouse && sel == i && last == i) open?.invoke(i)
                                    select(i); last = i
                                }
                                PointerEventType.Release -> if (mouse && inside) open?.invoke(i)
                                PointerEventType.Exit -> if (mouse) { select(null); last = null }
                            }
                        }
                    }
                },
        ) {
            /* grid and axis labels */
            for (t in axis) {
                val y = topPadPx + plotH - plotH * t / top
                drawLine(if (t == 0) g.text3.copy(alpha = 0.5f) else g.line, Offset(leftPx, y), Offset(size.width, y), 1f)
                val m = measurer.measure(t.toString(), labelStyle)
                drawText(m, topLeft = Offset(leftPx - m.size.width - 8f, y - m.size.height / 2f))
            }

            /* columns, rounded at the data end only */
            val r = 4.dp.toPx()
            for (i in values.indices) {
                val v = values[i]
                if (v <= 0) continue
                val h = plotH * v / top * grow.value
                val x = barX(i)
                val y = topPadPx + plotH - h
                val base = when {
                    emphasis == Emphasis.Peak && v != maxV -> g.deemph
                    else -> color
                }
                val dim = selected != null && selected != i
                val c = if (dim) base.copy(alpha = base.alpha * 0.45f) else base
                val path = Path().apply {
                    addRoundRect(RoundRect(Rect(x, y, x + barW, topPadPx + plotH), topLeft = CornerRadius(min(r, h)), topRight = CornerRadius(min(r, h))))
                }
                drawPath(path, c)
                if (current == i) drawLine(g.text.copy(alpha = 0.6f), Offset(x, topPadPx + plotH + 3f), Offset(x + barW, topPadPx + plotH + 3f), 2.dp.toPx(), StrokeCap.Round)
            }

            /* the mean, dashed, labelled at the right */
            if (average && mean > 0) {
                val y = topPadPx + plotH - plotH * mean / top
                drawLine(g.text2.copy(alpha = 0.7f), Offset(leftPx, y), Offset(size.width, y), 1.2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx())))
                val label = measurer.measure("avg ${fmtShort(mean)}", strongStyle)
                val lx = leftPx + 4.dp.toPx()
                drawRect(g.solid.copy(alpha = 0.7f), Offset(lx - 3f, y - label.size.height - 3f), Size(label.size.width + 6f, label.size.height.toFloat()))
                drawText(label, topLeft = Offset(lx, y - label.size.height - 3f))
            }

            /* the peak's value over its column */
            if (peak >= 0 && selected == null) {
                val m = measurer.measure(values[peak].toString(), strongStyle)
                val x = (barX(peak) + barW / 2 - m.size.width / 2f).coerceIn(leftPx, size.width - m.size.width)
                drawText(m, topLeft = Offset(x, barTop(peak) - m.size.height - 2.dp.toPx()))
            }

            /* x labels, right to left, skipping any that would collide */
            var nextLeft = Float.MAX_VALUE
            for (i in ticks.indices.reversed()) {
                val t = ticks[i]
                if (t.isEmpty()) continue
                val m = measurer.measure(t, if (i == current) strongStyle else labelStyle)
                val x = (barX(i) + barW / 2 - m.size.width / 2f).coerceIn(leftPx, size.width - m.size.width)
                if (x + m.size.width + 12.dp.toPx() > nextLeft) continue
                drawText(m, topLeft = Offset(x, topPadPx + plotH + 6.dp.toPx()))
                nextLeft = x
            }
        }

        /* the tooltip, over the selected column, kept inside the chart */
        if (selected != null && selected in values.indices) {
            val anchorX = barX(selected) + barW / 2
            val anchorY = min(barTop(selected), topPadPx + plotH - 2f)
            Layout(content = { ChartTip { tooltip(selected) } }) { measurables, cons ->
                val p = measurables.first().measure(Constraints(maxWidth = cons.maxWidth))
                layout(cons.maxWidth, heightPx.roundToInt()) {
                    val x = (anchorX - p.width / 2).roundToInt().coerceIn(0, max(0, cons.maxWidth - p.width))
                    val y = (anchorY - p.height - 10).roundToInt().coerceAtLeast(0)
                    p.place(x, y)
                }
            }
        }
    }
}

private fun fmtShort(v: Float): String = if (v >= 10) v.roundToInt().toString() else ((v * 10).roundToInt() / 10f).let {
    if (it == it.toInt().toFloat()) it.toInt().toString() else it.toString()
}

@Composable
fun ChartTip(content: @Composable () -> Unit) {
    val g = LocalGlass.current
    val shape = RoundedCornerShape(8.dp)
    Box(
        Modifier
            .widthIn(min = 120.dp, max = 240.dp)
            .clip(shape)
            .frost(g, LocalHaze.current, strong = true)
            .border(1.dp, rimBrush(g), shape)
            .padding(horizontal = 12.dp, vertical = 9.dp),
    ) { Column { content() } }
}

/** Seven tiny columns: the last week at a glance. */
@Composable
fun Sparkline(values: List<Int>, color: Color, modifier: Modifier = Modifier) {
    val g = LocalGlass.current
    val maxV = max(1, values.maxOrNull() ?: 0)
    Canvas(modifier.size(84.dp, 40.dp)) {
        val n = values.size
        val gap = 3.dp.toPx()
        val w = (size.width - gap * (n - 1)) / n
        val r = CornerRadius(2.dp.toPx())
        values.forEachIndexed { i, v ->
            val h = if (v == 0) 3.dp.toPx() else max(5.dp.toPx(), size.height * v / maxV)
            val x = i * (w + gap)
            val c = when {
                v == 0 -> g.line
                i == n - 1 -> color
                else -> color.copy(alpha = 0.55f)
            }
            drawRoundRect(c, Offset(x, size.height - h), Size(w, h), r)
        }
    }
}

/** Today's progress toward a daily goal. */
@Composable
fun GoalRing(value: Int, goal: Int, color: Color, modifier: Modifier = Modifier, size: Dp = 52.dp) {
    val g = LocalGlass.current
    val target = if (goal <= 0) 0f else min(1f, value.toFloat() / goal)
    val p by animateFloatAsState(target, tween(600), label = "goal")
    Canvas(modifier.size(size)) {
        val stroke = 6.dp.toPx()
        val inset = stroke / 2
        val arcSize = Size(this.size.width - stroke, this.size.height - stroke)
        drawArc(g.line, 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
        if (p > 0f) drawArc(color, -90f, 360f * p, false, Offset(inset, inset), arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
    }
}

/** Weeks as columns, Monday at the top; [level] gives each day's heat 0…4. */
@Composable
fun HeatGrid(
    weeks: List<List<kotlinx.datetime.LocalDate?>>,
    level: (kotlinx.datetime.LocalDate) -> Int,
    selected: kotlinx.datetime.LocalDate?,
    onSelect: (kotlinx.datetime.LocalDate?) -> Unit,
    modifier: Modifier = Modifier,
    cell: Dp = 12.dp,
    gap: Dp = 3.dp,
    palette: List<Color>? = null,
) {
    val g = LocalGlass.current
    val cols = weeks.size
    val pick by rememberUpdatedState(onSelect)
    Canvas(
        modifier
            .size(cell * cols + gap * (cols - 1), cell * 7 + gap * 6)
            .pointerInput(weeks) {
                awaitPointerEventScope {
                    while (true) {
                        val e = awaitPointerEvent()
                        val c = e.changes.firstOrNull() ?: continue
                        val step = (cell + gap).toPx()
                        val w = (c.position.x / step).toInt()
                        val d = (c.position.y / step).toInt()
                        val day = weeks.getOrNull(w)?.getOrNull(d)
                        when (e.type) {
                            PointerEventType.Move, PointerEventType.Enter, PointerEventType.Press -> pick(day)
                            PointerEventType.Exit -> if (c.type == PointerType.Mouse) pick(null)
                        }
                    }
                }
            },
    ) {
        val s = cell.toPx()
        val step = (cell + gap).toPx()
        val r = CornerRadius(2.5.dp.toPx())
        weeks.forEachIndexed { w, days ->
            days.forEachIndexed { d, day ->
                if (day == null) return@forEachIndexed
                val o = Offset(w * step, d * step)
                drawRoundRect((palette ?: g.heat)[level(day).coerceIn(0, 4)], o, Size(s, s), r)
                if (day == selected) drawRoundRect(g.text, o, Size(s, s), r, style = Stroke(1.5.dp.toPx()))
            }
        }
    }
}

@Composable
fun LegendSwatches(modifier: Modifier = Modifier, palette: List<Color>? = null) {
    val g = LocalGlass.current
    androidx.compose.foundation.layout.Row(modifier, horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(3.dp)) {
        (palette ?: g.heat).forEach { c -> Box(Modifier.size(10.dp).clip(RoundedCornerShape(2.dp)).background(c)) }
    }
}
