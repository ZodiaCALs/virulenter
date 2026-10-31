package com.virulenter.model

import kotlinx.datetime.isoDayNumber

/* When reminders fire. Shared by Android's AlarmManager scheduling and the
   desktop app's in-process scheduler, so both agree to the minute. */
object Schedule {
    /** The first time strictly after [after] that [r] is due; null if it never is. */
    fun next(r: Reminder, after: Long): Long? {
        if (!r.enabled || r.days and Reminder.ALL_DAYS == 0) return null
        val start = Dates.dayOf(after)
        for (i in 0..7) {
            val day = Dates.addDays(start, i)
            if (!r.onDay(day.dayOfWeek.isoDayNumber)) continue
            val at = Dates.at(day, r.hour.coerceIn(0, 23), r.minute.coerceIn(0, 59))
            if (at > after) return at
        }
        return null
    }

    /** Reminders that came due in (from, to] — what a scheduler that slept should fire now. */
    fun dueBetween(events: List<Event>, from: Long, to: Long): List<Event> =
        events.filter { e -> e.reminder?.let { r -> next(r, from)?.let { it <= to } } == true }

    /** "Every day", "Weekdays", "Weekends", or "Mon, Wed, Fri". */
    fun daysLabel(days: Int): String = when (days and Reminder.ALL_DAYS) {
        Reminder.ALL_DAYS -> "Every day"
        Reminder.WEEKDAYS -> "Weekdays"
        0b1100000 -> "Weekends"
        0 -> "Never"
        else -> (1..7).filter { days and (1 shl (it - 1)) != 0 }.joinToString(", ") { Dates.WEEKDAYS[it - 1] }
    }
}
