package com.virulenter.platform

import androidx.compose.runtime.State
import androidx.compose.runtime.staticCompositionLocalOf
import com.virulenter.model.AppState

/*
 * What the shared UI asks of the operating system. Android and desktop each
 * implement it; everything else in the app is common code.
 */
interface Platform {
    val kind: Kind
    val version: String

    fun copy(text: String)

    /** Offers a file to keep: the share sheet / save dialog. */
    fun saveFile(name: String, mime: String, text: String)

    /** Opens a file chosen by the user and hands back its text. */
    fun openFile(onText: (String) -> Unit)

    val notifications: Notifications

    enum class Kind { Android, Desktop }
}

interface Notifications {
    /** "Live notification" on Android, "Mini counter" on desktop. */
    val liveTitle: String
    val liveDetail: String

    /** Whether the app may post notifications right now; recomposes when it changes. */
    val allowed: State<Boolean>

    /** Asks the system for permission (Android 13+); no-op where none is needed. */
    fun requestPermission()

    /** Exact alarms (Android 12+): null where the idea does not apply. */
    val exactAlarms: State<Boolean>?
    fun requestExactAlarms()

    /** Posts a sample notification for the tracked event. */
    fun test(state: AppState)
}

val LocalPlatform = staticCompositionLocalOf<Platform> { error("no Platform provided") }
