package com.virulenter.model

import kotlinx.serialization.Serializable

/*
 * The data model. The first five fields of an event and the look are the
 * web app's own (see app/js/store.js), so a JSON backup moves between the
 * web app and this one in both directions; the native-only fields (goal,
 * reminder, tracker, settings) are ignored by the web app.
 */

@Serializable
data class Event(
    val id: String,
    val name: String,
    val color: String = Palette.COLORS[0],
    /** ISO date (yyyy-MM-dd) the event was started. */
    val start: String,
    /** Tap times, epoch milliseconds, ascending. */
    val log: List<Long> = emptyList(),
    /** A daily goal, drawn as a ring on the card; null for none. */
    val goal: Int? = null,
    /** A reminder notification; null for none. */
    val reminder: Reminder? = null,
) {
    val count: Int get() = log.size
    val last: Long? get() = log.lastOrNull()
    val first: Long? get() = log.firstOrNull()
}

@Serializable
data class Reminder(
    val hour: Int = 20,
    val minute: Int = 0,
    /** Bit 0 is Monday … bit 6 is Sunday. */
    val days: Int = ALL_DAYS,
    val enabled: Boolean = true,
) {
    /** isoDay: 1 = Monday … 7 = Sunday */
    fun onDay(isoDay: Int): Boolean = days and (1 shl (isoDay - 1)) != 0

    val label: String
        get() = "${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}"

    companion object {
        const val ALL_DAYS = 0b1111111
        const val WEEKDAYS = 0b0011111
    }
}

@Serializable
data class Look(
    val accent: String = "blue",
    val font: String = "system",
    /** A custom accent, #rrggbb; overrides [accent] when set. */
    val custom: String? = null,
    /** "system", "light" or "dark". */
    val theme: String = "system",
    /** What sits behind the glass: "none", a preset id, or "image" (one the user added). */
    val bg: String = "none",
)

@Serializable
data class Settings(
    /** Keep a live notification (Android) or a mini counter (desktop) for the tracked event. */
    val liveTracker: Boolean = false,
    /** Desktop: closing the window keeps the app in the system tray, so reminders still fire. */
    val keepInTray: Boolean = true,
)

@Serializable
data class AppState(
    val app: String = "Virulenter",
    val v: Int = 2,
    val exportedAt: String? = null,
    val look: Look = Look(),
    val events: List<Event> = emptyList(),
    /** The event the live notification, the Quick Settings tile and the widget count. */
    val tracker: String? = null,
    val settings: Settings = Settings(),
) {
    fun event(id: String?): Event? = events.firstOrNull { it.id == id }

    /** The tracked event, or the first one when none is chosen. */
    val tracked: Event? get() = event(tracker) ?: events.firstOrNull()
}
