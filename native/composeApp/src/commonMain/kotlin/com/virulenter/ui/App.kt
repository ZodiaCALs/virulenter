package com.virulenter.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.virulenter.platform.LocalPlatform
import com.virulenter.platform.Platform
import com.virulenter.resources.Res
import com.virulenter.resources.app_icon
import com.virulenter.ui.components.ButtonKind
import com.virulenter.ui.components.IconAction
import com.virulenter.ui.components.VButton
import com.virulenter.ui.components.VIcon
import com.virulenter.ui.components.VIcons
import com.virulenter.ui.glass.Backdrop
import com.virulenter.ui.glass.LocalHaze
import com.virulenter.ui.glass.frost
import com.virulenter.ui.glass.glass
import com.virulenter.ui.screens.CalendarScreen
import com.virulenter.ui.screens.EditorSheet
import com.virulenter.ui.screens.EventsScreen
import com.virulenter.ui.screens.ImportSheet
import com.virulenter.ui.screens.SettingsScreen
import com.virulenter.ui.screens.StatsScreen
import com.virulenter.ui.theme.LocalGlass
import com.virulenter.ui.theme.VirulenterTheme
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import kotlinx.coroutines.delay
import org.jetbrains.compose.resources.painterResource

/** Space the screens leave for the bars that float over them. */
data class Insets(val top: Dp, val bottom: Dp)

@Composable
fun App(controller: AppController, platform: Platform, onDark: (Boolean) -> Unit = {}) {
    val state by controller.store.state.collectAsState()
    VirulenterTheme(state.look, isSystemInDarkTheme()) {
        val g = LocalGlass.current
        LaunchedEffect(g.dark) { onDark(g.dark) }
        val haze = rememberHazeState()
        CompositionLocalProvider(LocalPlatform provides platform, LocalHaze provides haze) {
            BoxWithConstraints(Modifier.fillMaxSize().background(g.bg)) {
                val wide = maxWidth >= 860.dp
                Backdrop(Modifier.fillMaxSize().hazeSource(haze))

                val safe = WindowInsets.safeDrawing.asPaddingValues()
                val topBar = 64.dp
                val navBar = if (wide) 0.dp else 68.dp
                val insets = Insets(top = safe.calculateTopPadding() + topBar + 10.dp, bottom = safe.calculateBottomPadding() + navBar + 28.dp)
                val rail = if (wide) 96.dp else 0.dp

                val grid = rememberLazyGridState()
                val calendar = rememberLazyListState()
                val stats = rememberLazyListState()
                val settings = rememberLazyListState()

                Box(Modifier.fillMaxSize().padding(start = rail)) {
                    AnimatedContent(
                        targetState = controller.tab,
                        transitionSpec = { fadeIn(tween(220, delayMillis = 60)) togetherWith fadeOut(tween(110)) },
                        label = "tab",
                    ) { tab ->
                        when (tab) {
                            Tab.Events -> EventsScreen(controller, state, insets, grid)
                            Tab.Calendar -> CalendarScreen(controller, state, insets, calendar)
                            Tab.Stats -> StatsScreen(controller, state, insets, stats)
                            Tab.Settings -> SettingsScreen(controller, state, insets, settings)
                        }
                    }
                }

                TopBar(controller, state.events.sumOf { it.count }, state.events.size, safe.calculateTopPadding(), topBar, rail, wide)
                if (wide) NavRail(controller, Modifier.fillMaxHeight().width(rail).padding(top = safe.calculateTopPadding()))
                else BottomNav(controller, safe.calculateBottomPadding(), navBar, Modifier.align(Alignment.BottomCenter))

                EditorSheet(controller, state, wide)
                ImportSheet(controller, wide)
                ConfirmDialog(controller)
                ToastHost(controller, Modifier.align(Alignment.BottomCenter).padding(bottom = safe.calculateBottomPadding() + navBar + 14.dp))
            }
        }
    }
}

@Composable
private fun TopBar(c: AppController, taps: Int, events: Int, statusBar: Dp, height: Dp, rail: Dp, wide: Boolean) {
    val g = LocalGlass.current
    Column(
        Modifier
            .fillMaxWidth()
            .frost(g, LocalHaze.current, strong = true)
            .padding(top = statusBar),
    ) {
        Row(
            Modifier.fillMaxWidth().height(height).padding(start = 16.dp + rail, end = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (!wide) {
                Image(painterResource(Res.drawable.app_icon), null, Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)))
                Spacer(Modifier.width(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(if (wide) c.tab.label else "Virulenter", style = MaterialTheme.typography.titleLarge, color = g.text, maxLines = 1)
                Text(
                    "$taps ${if (taps == 1) "tap" else "taps"} · $events ${if (events == 1) "event" else "events"}",
                    color = g.text3, fontSize = 13.sp, maxLines = 1,
                )
            }
            if (c.tab == Tab.Events || c.tab == Tab.Calendar) {
                if (wide) VButton("New event", c::newEvent, icon = VIcons.Plus, kind = ButtonKind.Primary)
                else IconAction(VIcons.Plus, "New event", c::newEvent, size = 44.dp, tint = g.accentInk, filled = false, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(g.accent))
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(g.line))
    }
}

private val tabIcons: Map<Tab, ImageVector> get() = mapOf(
    Tab.Events to VIcons.Home, Tab.Calendar to VIcons.Calendar, Tab.Stats to VIcons.Chart, Tab.Settings to VIcons.Sliders,
)

@Composable
private fun TabButton(tab: Tab, on: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val g = LocalGlass.current
    Column(
        modifier.clickable(MutableInteractionSource(), null, role = Role.Tab, onClick = onClick).padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(58.dp, 30.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(if (on) g.accentSoft else Color.Transparent),
            contentAlignment = Alignment.Center,
        ) { VIcon(tabIcons.getValue(tab), if (on) g.accentText else g.text3, 21.dp) }
        Spacer(Modifier.height(3.dp))
        Text(tab.label, color = if (on) g.accentText else g.text3, fontSize = 11.5.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Medium)
    }
}

@Composable
private fun BottomNav(c: AppController, navInset: Dp, height: Dp, modifier: Modifier) {
    val g = LocalGlass.current
    Column(modifier.fillMaxWidth().frost(g, LocalHaze.current, strong = true)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(g.line))
        Row(Modifier.fillMaxWidth().height(height).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Tab.entries.forEach { t -> TabButton(t, c.tab == t, { c.tab = t }, Modifier.weight(1f)) }
        }
        Spacer(Modifier.height(navInset))
    }
}

@Composable
private fun NavRail(c: AppController, modifier: Modifier) {
    val g = LocalGlass.current
    Column(
        modifier.glass(g, LocalHaze.current, RectangleShape, strong = true, rim = 0.dp).padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Image(painterResource(Res.drawable.app_icon), "Virulenter", Modifier.size(44.dp).clip(RoundedCornerShape(11.dp)))
        Spacer(Modifier.height(14.dp))
        Tab.entries.forEach { t -> TabButton(t, c.tab == t, { c.tab = t }) }
    }
}

/* ── overlays ─────────────────────────────────────────────── */

/** A sheet: from the bottom on phones, centred on wide screens. Glass, with an iOS-style header. */
@Composable
fun Sheet(
    visible: Boolean,
    title: String,
    wide: Boolean,
    onDismiss: () -> Unit,
    confirm: String? = null,
    confirmEnabled: Boolean = true,
    onConfirm: () -> Unit = {},
    content: @Composable () -> Unit,
) {
    val g = LocalGlass.current
    PlatformBackHandler(visible, onDismiss)
    Box(Modifier.fillMaxSize(), contentAlignment = if (wide) Alignment.Center else Alignment.BottomCenter) {
        AnimatedVisibility(visible, enter = fadeIn(tween(200)), exit = fadeOut(tween(180))) {
            Box(Modifier.fillMaxSize().background(g.scrim).clickable(MutableInteractionSource(), null, onClick = onDismiss))
        }
        AnimatedVisibility(
            visible,
            enter = if (wide) fadeIn(tween(200)) + scaleIn(tween(260), initialScale = 0.96f) else slideInVertically(tween(320)) { it },
            exit = if (wide) fadeOut(tween(150)) + scaleOut(tween(150), targetScale = 0.98f) else slideOutVertically(tween(220)) { it },
        ) {
            val shape = if (wide) RoundedCornerShape(16.dp) else RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
            Column(
                Modifier
                    .then(if (wide) Modifier.widthIn(max = 560.dp).padding(24.dp) else Modifier.fillMaxWidth())
                    .heightIn(max = if (wide) 760.dp else 820.dp)
                    .glass(g, LocalHaze.current, shape, strong = true)
                    .clickable(MutableInteractionSource(), null) {},
            ) {
                if (!wide) Box(Modifier.fillMaxWidth().padding(top = 8.dp), contentAlignment = Alignment.Center) {
                    Box(Modifier.size(38.dp, 4.dp).clip(RoundedCornerShape(2.dp)).background(g.text3.copy(alpha = 0.4f)))
                }
                Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) { VButton("Cancel", onDismiss, kind = ButtonKind.Ghost) }
                    Text(title, style = MaterialTheme.typography.titleMedium, color = g.text, textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                        if (confirm != null) VButton(confirm, onConfirm, kind = ButtonKind.Primary, enabled = confirmEnabled, height = 38.dp)
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(g.line))
                Column(
                    Modifier
                        .verticalScroll(rememberScrollState())
                        .padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 18.dp + WindowInsets.safeDrawing.asPaddingValues().calculateBottomPadding()),
                ) { content() }
            }
        }
    }
}

@Composable
private fun ConfirmDialog(c: AppController) {
    val g = LocalGlass.current
    var last by remember { mutableStateOf(c.confirm) }
    if (c.confirm != null) last = c.confirm
    val visible = c.confirm != null
    PlatformBackHandler(visible) { c.confirm = null }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        AnimatedVisibility(visible, enter = fadeIn(tween(160)), exit = fadeOut(tween(160))) {
            Box(Modifier.fillMaxSize().background(g.scrim).clickable(MutableInteractionSource(), null) { c.confirm = null })
        }
        AnimatedVisibility(visible, enter = fadeIn(tween(160)) + scaleIn(tween(260), 0.92f), exit = fadeOut(tween(140)) + scaleOut(tween(140), targetScale = 0.97f)) {
            val d = last ?: return@AnimatedVisibility
            Column(
                Modifier
                    .padding(24.dp)
                    .widthIn(max = 380.dp)
                    .glass(g, LocalHaze.current, RoundedCornerShape(14.dp), strong = true)
                    .padding(22.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)).background(if (d.danger) g.dangerSoft else g.accentSoft),
                    contentAlignment = Alignment.Center,
                ) { VIcon(if (d.danger) VIcons.Trash else VIcons.Alert, if (d.danger) g.danger else g.accentText, 26.dp) }
                Spacer(Modifier.height(14.dp))
                Text(d.title, style = MaterialTheme.typography.titleMedium, color = g.text, textAlign = TextAlign.Center)
                Spacer(Modifier.height(8.dp))
                Text(d.message, color = g.text2, fontSize = 14.sp, textAlign = TextAlign.Center, lineHeight = 21.sp)
                Spacer(Modifier.height(20.dp))
                VButton(d.confirm, { c.confirm = null; d.onConfirm() }, Modifier.fillMaxWidth(), kind = if (d.danger) ButtonKind.Danger else ButtonKind.Primary)
                Spacer(Modifier.height(8.dp))
                VButton("Cancel", { c.confirm = null }, Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun ToastHost(c: AppController, modifier: Modifier) {
    val g = LocalGlass.current
    val t = c.toast
    LaunchedEffect(t?.id) {
        if (t != null) { delay(if (t.action != null) 5_000 else 3_000); if (c.toast?.id == t.id) c.toast = null }
    }
    var shown by remember { mutableStateOf(t) }
    if (t != null) shown = t
    AnimatedVisibility(t != null, modifier, enter = fadeIn() + slideInVertically { it / 2 }, exit = fadeOut() + slideOutVertically { it / 2 }) {
        val s = shown ?: return@AnimatedVisibility
        Row(
            Modifier
                .padding(horizontal = 16.dp)
                .widthIn(max = 520.dp)
                .glass(g, LocalHaze.current, RoundedCornerShape(10.dp), strong = true)
                .padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(s.message, Modifier.weight(1f, fill = false).padding(vertical = 8.dp), color = g.text, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (s.action != null) {
                Spacer(Modifier.width(10.dp))
                VButton(s.action, { c.toast = null; s.onAction?.invoke() }, kind = ButtonKind.Glass, height = 36.dp)
            } else Spacer(Modifier.width(10.dp))
        }
    }
}

/** Shared padding for a screen's scrolling content. */
fun Insets.content(extraTop: Dp = 0.dp) = PaddingValues(start = 16.dp, end = 16.dp, top = top + extraTop, bottom = bottom)
