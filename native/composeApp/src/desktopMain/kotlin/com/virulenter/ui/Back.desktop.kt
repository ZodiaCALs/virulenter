package com.virulenter.ui

import androidx.compose.runtime.Composable

@Composable
actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) {
    /* desktop: Esc is handled at the window (see main.kt) */
}
