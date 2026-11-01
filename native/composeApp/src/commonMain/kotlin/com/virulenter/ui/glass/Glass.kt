package com.virulenter.ui.glass

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.virulenter.ui.theme.Glass
import com.virulenter.ui.theme.LocalGlass
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import kotlin.math.max

/*
 * The material. Behind everything: the background the user chose — nothing
 * by default, a preset drawn here, or a picture they added. Over it, panes
 * of frosted glass: the layers behind blurred (Haze: RenderEffect on Android
 * 12+, Skia on desktop; a denser tint where blur is unavailable), a smooth
 * tint, and a 1px rim lit from the top left. Corners stay tight; the
 * material carries the look.
 *
 * Two layers feed the blur: the background (z 0) and the page content
 * (z 1). Panes inside the content blur only the background; the bars,
 * sheets and toasts above the content blur both, so what scrolls under
 * them is frosted too.
 */

/** The HazeState the background and the content write into; every pane reads from it. */
val LocalHaze = compositionLocalOf<HazeState?> { null }

/** Set inside the content layer: panes there blur only what lies below it. */
val LocalHazeLayer = compositionLocalOf<Float?> { null }

const val LAYER_BACKGROUND = 0f
const val LAYER_CONTENT = 1f

/** A preset background, drawn to fill the scope (also used for the picker's thumbnails). */
fun DrawScope.drawPreset(id: String, g: Glass) {
    val w = size.width
    val h = size.height
    val m = max(w, h)
    fun glow(c: Color, x: Float, y: Float, r: Float) =
        drawRect(Brush.radialGradient(listOf(c, c.copy(alpha = 0f)), center = Offset(x, y), radius = r))
    fun wash(vararg stops: Pair<Float, Color>) =
        drawRect(Brush.linearGradient(*stops, start = Offset(w * 0.35f, 0f), end = Offset(w * 0.65f, h)))
    val d = g.dark
    when (id) {
        "aurora" -> {
            drawRect(g.bg)
            glow(g.aura1, w * 0.06f, 0f, m * 0.62f)
            glow(g.aura2, w, h * 0.08f, m * 0.5f)
            glow(g.aura3, w * 0.88f, h, m * 0.6f)
            glow(g.aura2, 0f, h * 0.92f, m * 0.42f)
            glow(g.aura1.copy(alpha = g.aura1.alpha * 0.6f), w * 0.5f, h * 0.5f, m * 0.36f)
        }
        "mist" -> {
            if (d) wash(0f to Color(0xFF0C1017), 0.55f to Color(0xFF130F18), 1f to Color(0xFF0C1311))
            else wash(0f to Color(0xFFE3E8F1), 0.55f to Color(0xFFEEE7EF), 1f to Color(0xFFE4EDE9))
            glow(if (d) Color(0xFF1D2331) else Color.White, w * 0.15f, 0f, m * 0.7f)
        }
        "dusk" -> {
            if (d) wash(0f to Color(0xFF21121E), 0.5f to Color(0xFF1D1531), 1f to Color(0xFF0E1531))
            else wash(0f to Color(0xFFFDE1D1), 0.5f to Color(0xFFF2D1E5), 1f to Color(0xFFD7D2FB))
            glow(if (d) Color(0x8CA04B3C) else Color(0xE6FFBE96), w, 0f, m * 0.6f)
            glow(if (d) Color(0x8C5F3EB4) else Color(0xD9B4A5FF), 0f, h, m * 0.6f)
        }
        "ocean" -> {
            if (d) wash(0f to Color(0xFF061D26), 0.55f to Color(0xFF0A1830), 1f to Color(0xFF100E28))
            else wash(0f to Color(0xFFD2F0F7), 0.55f to Color(0xFFD0E0FA), 1f to Color(0xFFDAD4F8))
            glow(if (d) Color(0x80127D91) else Color(0xE696E8F6), 0f, 0f, m * 0.65f)
            glow(if (d) Color(0x80343EA5) else Color(0xCCA5AFFF), w, h, m * 0.6f)
        }
        "forest" -> {
            if (d) wash(0f to Color(0xFF0B2A1D), 0.55f to Color(0xFF06170F), 1f to Color(0xFF030A06))
            else wash(0f to Color(0xFFE0F3E6), 0.55f to Color(0xFFD0EADD), 1f to Color(0xFFE4EFE1))
            glow(if (d) Color(0x4D1FB86E) else Color(0x8C6ED79B), w * 0.85f, h * 0.9f, m * 0.6f)
        }
        "graphite" -> {
            if (d) wash(0f to Color(0xFF1C1F25), 0.6f to Color(0xFF121418), 1f to Color(0xFF0B0C0F))
            else wash(0f to Color(0xFFECEEF2), 0.6f to Color(0xFFDBDEE4), 1f to Color(0xFFD1D5DC))
        }
        else -> drawRect(g.bg)
    }
}

/** What sits behind the glass: the theme's plain colour, a preset, or the user's picture. */
@Composable
fun Backdrop(id: String, image: ImageBitmap?, modifier: Modifier = Modifier) {
    val g = LocalGlass.current
    Box(modifier.background(g.bg)) {
        when {
            id == "image" && image != null -> {
                Image(image, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                /* a veil in the theme's colour keeps text over a photo readable */
                Box(Modifier.fillMaxSize().background(if (g.dark) Color(0x6B06080D) else Color(0x4DF4F5F8)))
            }
            id == "none" || id == "image" -> Unit
            else -> Canvas(Modifier.fillMaxSize()) { drawPreset(id, g) }
        }
    }
}

fun rimBrush(g: Glass): Brush =
    Brush.linearGradient(
        0f to g.rim1, 0.34f to g.rim2, 0.66f to g.rim2, 1f to g.rim3,
        start = Offset.Zero, end = Offset.Infinite,
    )

/** The frost: blur of what lies behind plus a smooth tint, or a dense tint without blur.
 *  [below]: inside the content layer, blur only the layers under it. */
fun Modifier.frost(g: Glass, haze: HazeState?, strong: Boolean = false, tint: Color? = null, below: Float? = null): Modifier {
    val fill = tint ?: if (strong) g.paneStrong else g.pane
    return if (haze != null && below != null && g.plainBackdrop) {
        /* a pane in the page over a plain background: blurring the flat colour
           gives the same flat colour, so draw exactly what Haze would (its
           backdrop colour, then the tint) and spare a blur layer per pane */
        background(g.bg).background(fill)
    } else if (haze != null) {
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
        ) {
            if (below != null) canDrawArea = { area -> area.zIndex < below }
        }
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
    below: Float? = null,
): Modifier = this
    .clip(shape)
    .frost(g, haze, strong, below = below)
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
    Box(modifier.glass(g, LocalHaze.current, shape, strong, wash, below = LocalHazeLayer.current), content = content)
}
