package com.virulenter.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virulenter.model.Look
import com.virulenter.model.Palette
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/* ── colour maths, the same rules the web app uses (app/js/core.js) ── */
fun hexColor(hex: String): Color = Color(Palette.argb(hex).toInt())

fun contrast(a: Color, b: Color): Float {
    val la = a.luminance() + 0.05f
    val lb = b.luminance() + 0.05f
    return max(la, lb) / min(la, lb)
}

/** [fg], moved toward white or black until it reaches [minRatio] against [bg]. */
fun readable(fg: Color, bg: Color, minRatio: Float): Color {
    val toward = if (bg.luminance() < 0.5f) Color.White else Color.Black
    var c = fg
    var i = 0
    while (contrast(c, bg) < minRatio && i < 20) { c = lerp(c, toward, 0.08f); i++ }
    return c
}

val Ink = Color(0xFF0E1525)

/** Text that sits on a filled [bg]. */
fun onColor(bg: Color): Color = if (contrast(Color.White, bg) >= 3f || contrast(Color.White, bg) >= contrast(Ink, bg)) Color.White else Ink

/** Rotates a colour's hue by [deg], keeping saturation; optionally sets lightness. */
fun Color.spin(deg: Float, lightness: Float? = null): Color {
    val r = red; val g = green; val b = blue
    val mx = max(r, max(g, b)); val mn = min(r, min(g, b))
    val l = (mx + mn) / 2f
    val d = mx - mn
    var h = 0f
    val s = if (d == 0f) 0f else d / (1f - abs(2f * l - 1f))
    if (d != 0f) {
        h = when (mx) {
            r -> ((g - b) / d).mod(6f)
            g -> (b - r) / d + 2f
            else -> (r - g) / d + 4f
        } * 60f
    }
    return Color.hsl(((h + deg) % 360f + 360f) % 360f, s.coerceIn(0f, 1f), (lightness ?: l).coerceIn(0f, 1f), alpha)
}

/* ── the glass tokens ────────────────────────────────────────── */
@Immutable
data class Glass(
    val dark: Boolean,
    val accent: Color,
    val accentInk: Color,
    val accentText: Color,
    val accentSoft: Color,
    val accent2: Color,
    val bg: Color,
    val solid: Color,
    val pane: Color,
    val paneStrong: Color,
    val raised: Color,
    val rim1: Color,
    val rim2: Color,
    val rim3: Color,
    val line: Color,
    val grid: Color,
    val text: Color,
    val text2: Color,
    val text3: Color,
    val danger: Color,
    val dangerSoft: Color,
    val scrim: Color,
    val aura1: Color,
    val aura2: Color,
    val aura3: Color,
    val deemph: Color,
    val heat: List<Color>,
    /** Nothing but the theme's colour behind the glass (Background: None). */
    val plainBackdrop: Boolean = false,
) {
    /** An event colour made readable as text on this theme's panes. */
    fun ink(c: Color): Color = readable(c, if (dark) Color(0xFF151A24) else Color(0xFFF6F7FA), 4.5f)
    fun soft(c: Color, a: Float = if (dark) 0.2f else 0.14f): Color = c.copy(alpha = a)
}

val LocalGlass = staticCompositionLocalOf { glassFor(Look(), dark = true) }

fun glassFor(look: Look, dark: Boolean): Glass {
    val raw = hexColor(Palette.accentValue(look))
    val solid = if (dark) Color(0xFF12151D) else Color(0xFFFFFFFF)
    val accent = if (dark) readable(raw, solid, 3f) else raw
    val bg = if (dark) Color(0xFF06080D) else Color(0xFFEDF0F6)
    val heatBase = if (dark) Color(0xFF151A24) else Color(0xFFFFFFFF)
    return Glass(
        dark = dark,
        accent = accent,
        accentInk = onColor(accent),
        accentText = readable(accent, solid, 4.5f),
        accentSoft = accent.copy(alpha = if (dark) 0.2f else 0.13f),
        accent2 = accent.spin(40f),
        bg = bg,
        solid = solid,
        pane = if (dark) Color(0xFF161C2A).copy(alpha = 0.42f) else Color.White.copy(alpha = 0.48f),
        paneStrong = if (dark) Color(0xFF0B0E16).copy(alpha = 0.78f) else Color(0xFFF7F8FB).copy(alpha = 0.82f),
        raised = if (dark) Color.White.copy(alpha = 0.07f) else Color.White.copy(alpha = 0.72f),
        rim1 = if (dark) Color.White.copy(alpha = 0.34f) else Color.White.copy(alpha = 0.98f),
        rim2 = if (dark) Color.White.copy(alpha = 0.04f) else Color.White.copy(alpha = 0.22f),
        rim3 = if (dark) Color.White.copy(alpha = 0.14f) else Color(0xFF0F172A).copy(alpha = 0.10f),
        line = if (dark) Color.White.copy(alpha = 0.08f) else Color(0xFF0F172A).copy(alpha = 0.08f),
        grid = if (dark) Color.White.copy(alpha = 0.045f) else Color(0xFF1E2950).copy(alpha = 0.06f),
        text = if (dark) Color(0xFFEDF0F5) else Color(0xFF0E1525),
        text2 = if (dark) Color(0xFFA9B1BF) else Color(0xFF4A5468),
        text3 = if (dark) Color(0xFF6F7889) else Color(0xFF858EA0),
        danger = if (dark) Color(0xFFFF5C77) else Color(0xFFD92D4B),
        dangerSoft = if (dark) Color(0xFFFF5C77).copy(alpha = 0.14f) else Color(0xFFD92D4B).copy(alpha = 0.1f),
        scrim = if (dark) Color.Black.copy(alpha = 0.5f) else Color(0xFF0A0E18).copy(alpha = 0.28f),
        aura1 = accent.copy(alpha = if (dark) 0.34f else 0.3f),
        aura2 = accent.spin(40f).copy(alpha = if (dark) 0.28f else 0.24f),
        aura3 = accent.spin(-60f).copy(alpha = if (dark) 0.22f else 0.2f),
        deemph = if (dark) Color(0xFF3A404C) else Color(0xFFC8CEDA),
        heat = listOf(
            if (dark) Color.White.copy(alpha = 0.06f) else Color(0xFF0F172A).copy(alpha = 0.06f),
            lerp(heatBase, accent, 0.25f),
            lerp(heatBase, accent, 0.5f),
            lerp(heatBase, accent, 0.75f),
            accent,
        ),
    )
}

fun fontFamily(id: String): FontFamily = when (id) {
    "serif" -> FontFamily.Serif
    "mono" -> FontFamily.Monospace
    "humanist" -> FontFamily.SansSerif
    else -> FontFamily.Default
}

private fun typography(family: FontFamily): Typography {
    val base = Typography()
    fun TextStyle.f() = copy(fontFamily = family)
    return Typography(
        displayLarge = base.displayLarge.f(), displayMedium = base.displayMedium.f(), displaySmall = base.displaySmall.f(),
        headlineLarge = base.headlineLarge.f(), headlineMedium = base.headlineMedium.f(),
        headlineSmall = base.headlineSmall.f().copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
        titleLarge = base.titleLarge.f().copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
        titleMedium = base.titleMedium.f().copy(fontWeight = FontWeight.SemiBold),
        titleSmall = base.titleSmall.f().copy(fontWeight = FontWeight.SemiBold),
        bodyLarge = base.bodyLarge.f(), bodyMedium = base.bodyMedium.f(), bodySmall = base.bodySmall.f(),
        labelLarge = base.labelLarge.f().copy(fontWeight = FontWeight.SemiBold),
        labelMedium = base.labelMedium.f(), labelSmall = base.labelSmall.f(),
    )
}

/** Corners are kept tight: the material, not the rounding, carries the look. */
val VShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(6.dp),
    medium = RoundedCornerShape(8.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(16.dp),
)

@Composable
fun VirulenterTheme(look: Look, systemDark: Boolean, content: @Composable () -> Unit) {
    val dark = when (look.theme) { "dark" -> true; "light" -> false; else -> systemDark }
    val glass = remember(look, dark) { glassFor(look, dark) }
    val scheme = if (dark) {
        darkColorScheme(
            primary = glass.accent, onPrimary = glass.accentInk, secondary = glass.accent2,
            background = glass.bg, onBackground = glass.text, surface = glass.solid, onSurface = glass.text,
            surfaceVariant = Color(0xFF1A1F2B), onSurfaceVariant = glass.text2, outline = glass.line,
            error = glass.danger,
        )
    } else {
        lightColorScheme(
            primary = glass.accent, onPrimary = glass.accentInk, secondary = glass.accent2,
            background = glass.bg, onBackground = glass.text, surface = glass.solid, onSurface = glass.text,
            surfaceVariant = Color(0xFFEFF2F7), onSurfaceVariant = glass.text2, outline = glass.line,
            error = glass.danger,
        )
    }
    MaterialTheme(colorScheme = scheme, typography = typography(fontFamily(look.font)), shapes = VShapes) {
        CompositionLocalProvider(LocalGlass provides glass, content = content)
    }
}
