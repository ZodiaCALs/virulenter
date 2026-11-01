package com.virulenter.ui.glass

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.virulenter.ui.theme.Glass
import com.virulenter.ui.theme.LocalGlass
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import kotlin.math.max
import kotlin.math.min

/*
 * The material. Behind everything: an aurora drawn from the accent, a fine
 * light grid that fades down the page and one defined orb — structure for
 * the frost to act on. Over it, panes of frosted glass: the backdrop blurred
 * (Haze: RenderEffect on Android 12+, Skia on desktop; a denser tint where
 * blur is unavailable), a smooth tint, and a 1px rim lit from the top
 * left. Corners stay tight; the material carries the look.
 */

/** The HazeState the backdrop writes into; every pane reads from it. */
val LocalHaze = compositionLocalOf<HazeState?> { null }

@Composable
fun Backdrop(modifier: Modifier = Modifier) {
    val g = LocalGlass.current
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val m = max(w, h)
        drawRect(g.bg)
        fun glow(c: Color, x: Float, y: Float, r: Float) =
            drawRect(Brush.radialGradient(listOf(c, c.copy(alpha = 0f)), center = Offset(x, y), radius = r))
        glow(g.aura1, w * 0.06f, 0f, m * 0.62f)
        glow(g.aura2, w, h * 0.08f, m * 0.5f)
        glow(g.aura3, w * 0.88f, h, m * 0.6f)
        glow(g.aura2, 0f, h * 0.92f, m * 0.42f)
        glow(g.aura1.copy(alpha = g.aura1.alpha * 0.6f), w * 0.5f, h * 0.5f, m * 0.36f)

        /* the grid: crisp near the top, fading to a quarter by the bottom */
        val step = 28.dp.toPx()
        val stroke = 1.dp.toPx().coerceAtLeast(1f)
        var y = 0f
        while (y < h) {
            val a = 1f - 0.75f * (y / h)
            drawLine(g.grid.copy(alpha = g.grid.alpha * a), Offset(0f, y), Offset(w, y), stroke)
            y += step
        }
        var x = 0f
        while (x < w) {
            drawLine(
                Brush.verticalGradient(listOf(g.grid, g.grid.copy(alpha = g.grid.alpha * 0.25f))),
                Offset(x, 0f), Offset(x, h), stroke,
            )
            x += step
        }

        /* the orb, anchored to the content column's top right */
        val r = min(m * 0.043f, 48.dp.toPx())
        val cx = w / 2 + min(w * 0.36f, 330.dp.toPx())
        val cy = 128.dp.toPx()
        drawCircle(
            Brush.radialGradient(
                listOf(g.aura2.copy(alpha = min(1f, g.aura2.alpha * 2.2f)), g.aura2.copy(alpha = g.aura2.alpha * 1.4f)),
                center = Offset(cx - r * 0.3f, cy - r * 0.3f), radius = r * 1.4f,
            ),
            radius = r, center = Offset(cx, cy),
        )
    }
}

fun rimBrush(g: Glass): Brush =
    Brush.linearGradient(
        0f to g.rim1, 0.34f to g.rim2, 0.66f to g.rim2, 1f to g.rim3,
        start = Offset.Zero, end = Offset.Infinite,
    )

/** The frost: blur of the backdrop plus a smooth tint, or a dense tint without a backdrop. */
fun Modifier.frost(g: Glass, haze: HazeState?, strong: Boolean = false, tint: Color? = null): Modifier {
    val fill = tint ?: if (strong) g.paneStrong else g.pane
    return if (haze != null) {
        hazeEffect(
            haze,
            HazeStyle(
                backgroundColor = g.bg,
                tint = HazeTint(fill),
                blurRadius = if (strong) 30.dp else 22.dp,
                noiseFactor = 0f,   // smooth glass: no grain
                /* without blur (Android 11 and older) the tint must hide the backdrop on its own */
                fallbackTint = HazeTint(fill.copy(alpha = max(fill.alpha, if (g.dark) 0.86f else 0.9f))),
            ),
        )
    } else {
        background(fill.copy(alpha = max(fill.alpha, 0.9f)))
    }
}

/** A pane of glass: frost, an optional colour wash from the top, and the lit rim. */
fun Modifier.glass(
    g: Glass,
    haze: HazeState?,
    shape: Shape = RoundedCornerShape(12.dp),
    strong: Boolean = false,
    wash: Color? = null,
    rim: Dp = 1.dp,
): Modifier = this
    .clip(shape)
    .frost(g, haze, strong)
    .then(if (wash != null) Modifier.background(Brush.verticalGradient(listOf(wash, wash.copy(alpha = 0f)))) else Modifier)
    .border(rim, rimBrush(g), shape)

@Composable
fun GlassPanel(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(12.dp),
    strong: Boolean = false,
    wash: Color? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val g = LocalGlass.current
    Box(modifier.glass(g, LocalHaze.current, shape, strong, wash), content = content)
}
