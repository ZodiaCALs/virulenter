package com.virulenter.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virulenter.model.Dates
import com.virulenter.ui.glass.LocalHaze
import com.virulenter.ui.glass.frost
import com.virulenter.ui.glass.rimBrush
import com.virulenter.ui.theme.LocalGlass
import com.virulenter.ui.theme.onColor
import com.virulenter.ui.theme.spin
import kotlinx.coroutines.delay

/** The current time, ticking every [periodMs] on the period boundary. */
@Composable
fun rememberNow(periodMs: Long = 1_000): State<Long> = produceState(Dates.now(), periodMs) {
    while (true) {
        val now = Dates.now()
        delay(periodMs - now % periodMs + 5)
        value = Dates.now()
    }
}

@Composable
fun VIcon(icon: ImageVector, tint: Color, size: Dp = 20.dp, modifier: Modifier = Modifier, description: String? = null) {
    Icon(icon, description, modifier.size(size), tint = tint)
}

enum class ButtonKind { Primary, Glass, Danger, Ghost }

@Composable
fun VButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    kind: ButtonKind = ButtonKind.Glass,
    color: Color? = null,
    enabled: Boolean = true,
    height: Dp = 44.dp,
) {
    val g = LocalGlass.current
    val press = remember { MutableInteractionSource() }
    val pressed by press.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, spring(stiffness = 900f), label = "press")
    val shape = RoundedCornerShape(8.dp)
    val base = color ?: g.accent
    val (fill, ink) = when (kind) {
        ButtonKind.Primary -> Brush.linearGradient(listOf(base.spin(-8f, null), base, base.spin(18f))) to onColor(base)
        ButtonKind.Danger -> SolidColor(g.danger) to Color.White
        ButtonKind.Glass -> SolidColor(g.raised) to (color?.let { g.ink(it) } ?: g.text)
        ButtonKind.Ghost -> SolidColor(Color.Transparent) to (color?.let { g.ink(it) } ?: g.text2)
    }
    Row(
        modifier
            .scale(scale)
            .defaultMinSize(minHeight = height)
            .clip(shape)
            .background(fill)
            .then(if (kind == ButtonKind.Glass) Modifier.border(1.dp, rimBrush(g), shape) else Modifier)
            .then(
                if (kind == ButtonKind.Primary || kind == ButtonKind.Danger)
                    Modifier.border(1.dp, Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.38f), Color.Transparent)), shape)
                else Modifier,
            )
            .clickable(press, null, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val alpha = if (enabled) 1f else 0.45f
        if (icon != null) {
            VIcon(icon, ink.copy(alpha = alpha), 18.dp)
            Spacer(Modifier.width(8.dp))
        }
        Text(text, color = ink.copy(alpha = alpha), style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** A square glass button holding one icon. */
@Composable
fun IconAction(icon: ImageVector, description: String, onClick: () -> Unit, modifier: Modifier = Modifier, size: Dp = 40.dp, tint: Color? = null, filled: Boolean = true) {
    val g = LocalGlass.current
    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier
            .size(size)
            .clip(shape)
            .then(if (filled) Modifier.background(g.raised).border(1.dp, rimBrush(g), shape) else Modifier)
            .clickable(role = Role.Button, onClickLabel = description, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { VIcon(icon, tint ?: g.text2, 20.dp, description = description) }
}

@Composable
fun <T> Segmented(options: List<T>, selected: T, label: (T) -> String, onSelect: (T) -> Unit, modifier: Modifier = Modifier, icon: ((T) -> ImageVector?)? = null) {
    val g = LocalGlass.current
    Row(
        modifier.clip(RoundedCornerShape(8.dp)).background(if (g.dark) Color.White.copy(alpha = 0.05f) else Color(0xFF0F172A).copy(alpha = 0.05f)).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        for (o in options) {
            val on = o == selected
            val bg by animateColorAsState(if (on) (if (g.dark) Color.White.copy(alpha = 0.12f) else Color.White) else Color.Transparent, tween(180), label = "seg")
            Row(
                Modifier
                    .weight(1f, fill = true)
                    .clip(RoundedCornerShape(6.dp))
                    .background(bg)
                    .then(if (on) Modifier.border(1.dp, rimBrush(g), RoundedCornerShape(6.dp)) else Modifier)
                    .clickable(role = Role.Tab) { onSelect(o) }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                icon?.invoke(o)?.let { VIcon(it, if (on) g.text else g.text3, 16.dp); Spacer(Modifier.width(6.dp)) }
                Text(label(o), color = if (on) g.text else g.text2, fontSize = 13.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium, maxLines = 1)
            }
        }
    }
}

@Composable
fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit, dot: Color? = null) {
    val g = LocalGlass.current
    val shape = RoundedCornerShape(6.dp)
    Row(
        Modifier
            .clip(shape)
            .background(if (selected) g.accentSoft else g.raised)
            .border(1.dp, if (selected) SolidColor(g.accent.copy(alpha = 0.55f)) else rimBrush(g), shape)
            .clickable(role = Role.Checkbox, onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (dot != null) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(dot))
            Spacer(Modifier.width(7.dp))
        }
        Text(label, color = if (selected) g.accentText else g.text2, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        modifier.padding(start = 2.dp, bottom = 8.dp, top = 6.dp),
        color = LocalGlass.current.text3,
        fontSize = 11.5.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.9.sp,
    )
}

/** A colour choice: a rounded square with a check when chosen. */
@Composable
fun Swatch(color: Color, selected: Boolean, onClick: () -> Unit, size: Dp = 34.dp, label: String? = null) {
    val ring by animateDpAsState(if (selected) 2.dp else 0.dp, label = "ring")
    val g = LocalGlass.current
    Box(
        Modifier
            .size(size)
            .clip(RoundedCornerShape(8.dp))
            .border(ring, g.text, RoundedCornerShape(8.dp))
            .padding(if (selected) 3.dp else 0.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(color)
            .clickable(role = Role.RadioButton, onClickLabel = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { if (selected) VIcon(VIcons.Check, onColor(color), 18.dp) }
}

@Composable
fun GlassField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    leading: ImageVector? = null,
    singleLine: Boolean = true,
    mono: Boolean = false,
    keyboard: KeyboardOptions = KeyboardOptions.Default,
    actions: KeyboardActions = KeyboardActions.Default,
    minLines: Int = 1,
) {
    val g = LocalGlass.current
    val shape = RoundedCornerShape(8.dp)
    val style = TextStyle(
        color = g.text,
        fontSize = if (mono) 13.sp else 15.sp,
        fontFamily = if (mono) androidx.compose.ui.text.font.FontFamily.Monospace else MaterialTheme.typography.bodyLarge.fontFamily,
    )
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        singleLine = singleLine,
        minLines = minLines,
        textStyle = style,
        cursorBrush = SolidColor(g.accent),
        keyboardOptions = keyboard,
        keyboardActions = actions,
        decorationBox = { inner ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 46.dp)
                    .clip(shape)
                    .frost(g, LocalHaze.current, tint = g.raised)
                    .border(1.dp, rimBrush(g), shape)
                    .padding(horizontal = 13.dp, vertical = 11.dp),
                verticalAlignment = if (singleLine) Alignment.CenterVertically else Alignment.Top,
            ) {
                if (leading != null) {
                    VIcon(leading, g.text3, 18.dp)
                    Spacer(Modifier.width(9.dp))
                }
                Box(Modifier.weight(1f)) {
                    if (value.isEmpty()) Text(placeholder, style = style.copy(color = g.text3), maxLines = if (singleLine) 1 else 3)
                    inner()
                }
            }
        },
    )
}

/** A switch drawn in the glass language. */
@Composable
fun Toggle(checked: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val g = LocalGlass.current
    val track by animateColorAsState(if (checked) g.accent else (if (g.dark) Color.White.copy(alpha = 0.12f) else Color(0xFF0F172A).copy(alpha = 0.12f)), label = "track")
    val x by animateDpAsState(if (checked) 20.dp else 0.dp, spring(dampingRatio = 0.7f, stiffness = 700f), label = "knob")
    Box(
        modifier
            .size(48.dp, 28.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(track.copy(alpha = if (enabled) track.alpha else track.alpha * 0.5f))
            .clickable(enabled = enabled, role = Role.Switch) { onChange(!checked) }
            .padding(3.dp),
    ) {
        Box(
            Modifier
                .offset(x = x)
                .size(22.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(Color.White)
                .border(1.dp, Color.Black.copy(alpha = 0.06f), RoundedCornerShape(6.dp)),
        )
    }
}

/** A number that rolls up (or down) when it changes. */
@Composable
fun RollingNumber(value: Int, style: TextStyle, color: Color, modifier: Modifier = Modifier) {
    AnimatedContent(
        targetState = value,
        modifier = modifier,
        transitionSpec = {
            val up = targetState > initialState
            (slideInVertically(spring(dampingRatio = 0.75f, stiffness = 500f)) { h -> if (up) h / 2 else -h / 2 } + fadeIn(tween(160)))
                .togetherWith(slideOutVertically(tween(160)) { h -> if (up) -h / 2 else h / 2 } + fadeOut(tween(120)))
        },
        label = "count",
    ) { v -> Text(v.toString(), style = style, color = color, maxLines = 1) }
}

/** The event's initial on a tinted square. */
@Composable
fun Monogram(name: String, color: Color, size: Dp = 36.dp) {
    val g = LocalGlass.current
    Box(
        Modifier.size(size).clip(RoundedCornerShape(8.dp)).background(g.soft(color)).border(1.dp, color.copy(alpha = 0.35f), RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Text(name.trim().take(1).uppercase().ifEmpty { "•" }, color = g.ink(color), fontWeight = FontWeight.Bold, fontSize = (size.value * 0.44f).sp)
    }
}

@Composable
fun Hairline(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(LocalGlass.current.line))
}

val ScreenPadding = PaddingValues(horizontal = 16.dp)
