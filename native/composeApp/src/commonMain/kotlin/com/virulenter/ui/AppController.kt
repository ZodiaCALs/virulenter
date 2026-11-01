package com.virulenter.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.ImageBitmap
import com.virulenter.model.Dates
import com.virulenter.model.Event
import com.virulenter.model.ImportMode
import com.virulenter.model.Store
import com.virulenter.platform.Platform
import com.virulenter.ui.glass.decodeImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.datetime.LocalDate

enum class Tab(val label: String) { Events("Events"), Calendar("Calendar"), Stats("Stats"), Settings("Settings") }

/** What the event editor is open on: a new event, or an existing one. */
data class Editing(val id: String?)

data class Toast(val message: String, val action: String? = null, val onAction: (() -> Unit)? = null, val id: Long = Dates.now())

data class Confirm(
    val title: String,
    val message: String,
    val confirm: String,
    val danger: Boolean = false,
    val onConfirm: () -> Unit,
)

enum class Sort(val label: String) { Recent("Recent"), Count("Most"), Name("A–Z"), Custom("Custom") }

/*
 * The screen state that sits above any one screen: the tab, what is open
 * over it, and the transient toast. Shared with the platform shell, so the
 * desktop menu bar and Android intents can drive the same app.
 */
class AppController(val store: Store) {
    var tab by mutableStateOf(Tab.Events)
    var editing by mutableStateOf<Editing?>(null)
    var confirm by mutableStateOf<Confirm?>(null)
    var importing by mutableStateOf(false)
    var importText by mutableStateOf("")
    var toast by mutableStateOf<Toast?>(null)
    var selectedDay by mutableStateOf<LocalDate?>(null)
    var calendarMonth by mutableStateOf(Dates.monthStart(Dates.today()))
    var search by mutableStateOf("")
    var sort by mutableStateOf(Sort.Recent)

    /** The picture behind the glass, when the user added one; kept on this device only. */
    var backgroundImage by mutableStateOf<ImageBitmap?>(null)
        private set

    suspend fun loadBackground(platform: Platform) {
        val bytes = withContext(Dispatchers.Default) { runCatching { platform.readBackground() }.getOrNull() } ?: return
        backgroundImage = withContext(Dispatchers.Default) { decodeImage(bytes) }
    }

    suspend fun useBackground(platform: Platform, bytes: ByteArray) {
        val image = withContext(Dispatchers.Default) { decodeImage(bytes) }
        if (image == null) { say("That image could not be read"); return }
        val kept = withContext(Dispatchers.Default) { runCatching { platform.writeBackground(bytes) }.isSuccess }
        backgroundImage = image
        store.setLook(store.current.look.copy(bg = "image"))
        say(if (kept) "Background set" else "Background set — it could not be saved for next time")
    }

    fun removeBackground(platform: Platform) {
        runCatching { platform.writeBackground(null) }
        backgroundImage = null
        if (store.current.look.bg == "image") store.setLook(store.current.look.copy(bg = "none"))
        say("Background image removed")
    }

    fun newEvent() { editing = Editing(null) }
    fun edit(id: String) { editing = Editing(id) }

    fun say(message: String, action: String? = null, onAction: (() -> Unit)? = null) {
        toast = Toast(message, action, onAction)
    }

    fun tap(e: Event) {
        val ts = store.tap(e.id) ?: return
        val count = store.current.event(e.id)?.count ?: 0
        say("${e.name} · $count", "Undo") { store.removeTap(e.id, ts) }
    }

    fun delete(e: Event) {
        confirm = Confirm(
            title = "Delete “${e.name}”?",
            message = if (e.count == 0) "The event will be deleted." else "The event and its ${e.count} recorded taps will be deleted.",
            confirm = "Delete event",
            danger = true,
        ) {
            val removed = store.remove(e.id) ?: return@Confirm
            if (editing?.id == e.id) editing = null
            say("Deleted “${e.name}”", "Undo") { store.restore(removed.first, removed.second) }
        }
    }

    fun clear(e: Event) {
        confirm = Confirm(
            title = "Clear “${e.name}”?",
            message = "Its ${e.count} taps will be removed; the event stays.",
            confirm = "Clear taps",
            danger = true,
        ) {
            val log = store.clearLog(e.id) ?: return@Confirm
            say("Cleared “${e.name}”", "Undo") { store.restoreLog(e.id, log) }
        }
    }

    fun openImport(prefill: String = "") {
        importText = prefill
        importing = true
    }

    fun runImport(mode: ImportMode) {
        val result = store.import(importText, mode)
        if (result.ok) { importing = false; importText = "" }
        say(result.message)
    }

    fun showDay(day: LocalDate) {
        selectedDay = day
        calendarMonth = Dates.monthStart(day)
        tab = Tab.Calendar
    }
}
