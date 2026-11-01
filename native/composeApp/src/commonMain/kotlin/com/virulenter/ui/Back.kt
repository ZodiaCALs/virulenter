package com.virulenter.ui

import androidx.compose.runtime.Composable

/** The system back gesture (Android); desktop closes overlays with Esc instead. */
@Composable
expect fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit)
