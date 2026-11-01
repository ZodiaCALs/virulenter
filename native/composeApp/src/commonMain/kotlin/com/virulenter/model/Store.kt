package com.virulenter.model

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Instant

/** Where the state is kept between runs: a file on each platform. */
interface Storage {
    fun read(): String?
    fun write(text: String)
}

enum class ImportMode { Merge, Replace }

data class ImportResult(val ok: Boolean, val events: Int, val message: String)

/*
 * The single source of truth. Every change goes through commit(): the new
 * state is published (the UI recomposes from the flow), written to storage,
 * and handed to the platform observers that keep notifications, the Quick
 * Settings tile, widgets, shortcuts and the tray in step.
 */
class Store(private val storage: Storage) {
    private val _state = MutableStateFlow(AppState())
    val state: StateFlow<AppState> = _state.asStateFlow()
    val current: AppState get() = _state.value

    private val observers = mutableListOf<(AppState) -> Unit>()

    /** Set when stored data could not be read; the file is left untouched until the next change. */
    var loadError: String? = null
        private set

    fun observe(observer: (AppState) -> Unit) {
        observers += observer
    }

    fun load() {
        val text = runCatching { storage.read() }.getOrNull()
        if (text.isNullOrBlank()) return
        val decoded = Codec.decodeJson(text)
        if (decoded == null) {
            loadError = "The saved data could not be read."
            return
        }
        _state.value = decoded.state
    }

    private fun commit(next: AppState) {
        _state.value = next
        runCatching { storage.write(Codec.toJson(next, nowIso())) }
        for (o in observers.toList()) runCatching { o(next) }
    }

    private fun editEvent(id: String, change: (Event) -> Event): Event? {
        val s = current
        val i = s.events.indexOfFirst { it.id == id }
        if (i < 0) return null
        val next = change(s.events[i])
        commit(s.copy(events = s.events.toMutableList().also { it[i] = next }))
        return next
    }

    /* ── events ─────────────────────────────────────────── */
    fun create(name: String, color: String, start: String? = null, goal: Int? = null, reminder: Reminder? = null): Event {
        val e = Event(
            id = Codec.uid(),
            name = name.trim().take(48).ifEmpty { "Untitled" },
            color = if (Palette.isHex(color)) color.lowercase() else Palette.COLORS[0],
            start = Dates.clampStart(start),
            goal = goal?.takeIf { it > 0 },
            reminder = reminder,
        )
        val s = current
        commit(s.copy(events = s.events + e, tracker = s.tracker ?: e.id))
        return e
    }

    fun update(id: String, change: (Event) -> Event): Event? = editEvent(id) { old ->
        val e = change(old)
        e.copy(
            id = old.id,
            name = e.name.trim().take(48).ifEmpty { old.name },
            color = if (Palette.isHex(e.color)) e.color.lowercase() else old.color,
            start = Dates.clampStart(e.start),
            goal = e.goal?.takeIf { it > 0 },
        )
    }

    /** Removes an event; returns it and its position, for undo. */
    fun remove(id: String): Pair<Event, Int>? {
        val s = current
        val i = s.events.indexOfFirst { it.id == id }
        if (i < 0) return null
        val e = s.events[i]
        commit(s.copy(events = s.events.filterNot { it.id == id }, tracker = s.tracker.takeIf { it != id }))
        return e to i
    }

    fun restore(event: Event, index: Int) {
        val s = current
        if (s.events.any { it.id == event.id }) return
        val list = s.events.toMutableList()
        list.add(index.coerceIn(0, list.size), event)
        commit(s.copy(events = list))
    }

    fun move(id: String, delta: Int) {
        val s = current
        val i = s.events.indexOfFirst { it.id == id }
        val j = i + delta
        if (i < 0 || j !in s.events.indices) return
        val list = s.events.toMutableList()
        list.add(j, list.removeAt(i))
        commit(s.copy(events = list))
    }

    /* ── taps ───────────────────────────────────────────── */
    /** The core action: +1, with its time. */
    fun tap(id: String, ts: Long = Dates.now()): Long? =
        editEvent(id) { it.copy(log = insertSorted(it.log, ts)) }?.let { ts }

    fun removeTap(id: String, ts: Long): Boolean {
        var removed = false
        editEvent(id) { e ->
            val i = e.log.indexOf(ts)
            if (i < 0) e else {
                removed = true
                e.copy(log = e.log.toMutableList().also { it.removeAt(i) })
            }
        }
        return removed
    }

    fun clearLog(id: String): List<Long>? {
        val before = current.event(id)?.log ?: return null
        editEvent(id) { it.copy(log = emptyList()) }
        return before
    }

    fun restoreLog(id: String, log: List<Long>) {
        editEvent(id) { it.copy(log = (it.log + log).distinct().sorted()) }
    }

    /* ── appearance and settings ────────────────────────── */
    fun setLook(look: Look) = commit(current.copy(look = look))
    fun setTracker(id: String?) = commit(current.copy(tracker = id))
    fun setSettings(change: (Settings) -> Settings) = commit(current.copy(settings = change(current.settings)))

    /* ── data ───────────────────────────────────────────── */
    fun exportJson(): String = Codec.toJson(current, nowIso())

    /** The web app's link payload: paste it into the web app's Load box, or after #d= in its address. */
    fun dataCode(): String = Codec.encode(current.events, current.look)

    fun import(text: String, mode: ImportMode): ImportResult {
        val decoded = Codec.decode(text)
            ?: return ImportResult(false, 0, "Nothing to import: paste a Virulenter link, data code or JSON backup.")
        val incoming = decoded.state
        val s = current
        val next = when (mode) {
            ImportMode.Replace -> s.copy(
                events = incoming.events,
                look = if (decoded.hasLook) incoming.look else s.look,
                tracker = incoming.tracker,
            )
            ImportMode.Merge -> merge(s, incoming)
        }
        commit(next)
        val n = incoming.events.size
        return ImportResult(true, n, if (n == 1) "Imported 1 event." else "Imported $n events.")
    }

    fun eraseAll() = commit(current.copy(events = emptyList(), tracker = null))

    companion object {
        fun nowIso(): String = Instant.fromEpochMilliseconds(Dates.now()).toString()

        fun insertSorted(log: List<Long>, ts: Long): List<Long> {
            val out = ArrayList<Long>(log.size + 1)
            var placed = false
            for (t in log) {
                if (!placed && ts < t) { out.add(ts); placed = true }
                out.add(t)
            }
            if (!placed) out.add(ts)
            return out
        }

        /* Merge by event id. Taps are compared to the minute (the precision a
           link keeps) and as a multiset: two real taps in one minute survive,
           while a tap seen on both sides is kept once. The current look wins;
           the incoming one only fills settings left at their defaults. */
        fun merge(target: AppState, incoming: AppState): AppState {
            val events = target.events.toMutableList()
            for (inc in incoming.events) {
                val i = events.indexOfFirst { it.id == inc.id }
                if (i < 0) { events += inc; continue }
                val cur = events[i]
                val have = cur.log.groupingBy { it / 60_000 }.eachCount()
                val seen = HashMap<Long, Int>()
                val added = inc.log.filter { t ->
                    val k = t / 60_000
                    val n = (seen[k] ?: 0) + 1
                    seen[k] = n
                    n > (have[k] ?: 0)
                }
                events[i] = cur.copy(
                    log = (cur.log + added).sorted(),
                    goal = cur.goal ?: inc.goal,
                    reminder = cur.reminder ?: inc.reminder,
                )
            }
            val t = target.look
            val o = incoming.look
            val look = Look(
                accent = if (t.custom == null && t.accent == "blue") o.accent else t.accent,
                custom = t.custom ?: if (t.accent == "blue") o.custom else null,
                font = if (t.font == "system") o.font else t.font,
                theme = if (t.theme == "system") o.theme else t.theme,
                bg = if (t.bg == "none") o.bg else t.bg,
            )
            return target.copy(events = events, look = look)
        }
    }
}
