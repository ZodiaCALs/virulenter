package com.virulenter.model

import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime

/*
 * Calendar maths in the device's time zone. Like the web app, a tap belongs
 * to the local day it was made on, and moving to another zone re-reads the
 * same wall-clock times.
 */
object Dates {
    /** Swapped in tests. */
    var zone: TimeZone = TimeZone.currentSystemDefault()
    var clock: () -> Long = { Clock.System.now().toEpochMilliseconds() }

    /** The earliest start the web link format can carry. */
    val MIN_START = LocalDate(2020, 1, 1)

    fun now(): Long = clock()
    fun today(): LocalDate = dayOf(now())

    fun dayOf(ts: Long): LocalDate = Instant.fromEpochMilliseconds(ts).toLocalDateTime(zone).date
    fun timeOf(ts: Long): LocalTime = Instant.fromEpochMilliseconds(ts).toLocalDateTime(zone).time
    fun startOfDay(d: LocalDate): Long = d.atStartOfDayIn(zone).toEpochMilliseconds()
    fun at(d: LocalDate, hour: Int, minute: Int): Long =
        LocalDateTime(d, LocalTime(hour, minute)).toInstant(zone).toEpochMilliseconds()

    fun addDays(d: LocalDate, n: Int): LocalDate = d.plus(n, DateTimeUnit.DAY)
    fun addMonths(d: LocalDate, n: Int): LocalDate = d.plus(n, DateTimeUnit.MONTH)
    fun daysBetween(a: LocalDate, b: LocalDate): Int = b.toEpochDays() - a.toEpochDays()

    /** Monday of the week [d] falls in. */
    fun weekStart(d: LocalDate): LocalDate = addDays(d, -(d.dayOfWeek.isoDayNumber - 1))
    fun monthStart(d: LocalDate): LocalDate = LocalDate(d.year, d.monthNumber, 1)

    fun parse(s: String?): LocalDate? = s?.trim()?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    fun iso(d: LocalDate): String = d.toString()

    /** A start date the link format can carry. */
    fun clampStart(iso: String?): String {
        val d = parse(iso) ?: today()
        return iso(if (d < MIN_START) MIN_START else d)
    }

    val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    val MONTHS_LONG = listOf(
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    )
    /** Monday first. */
    val WEEKDAYS = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    val WEEKDAYS_LONG = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")

    fun weekday(d: LocalDate): String = WEEKDAYS[d.dayOfWeek.isoDayNumber - 1]
    fun fmtDay(d: LocalDate): String = "${weekday(d)} ${d.dayOfMonth} ${MONTHS[d.monthNumber - 1]}"
    fun fmtDayLong(d: LocalDate): String =
        "${WEEKDAYS_LONG[d.dayOfWeek.isoDayNumber - 1]}, ${d.dayOfMonth} ${MONTHS_LONG[d.monthNumber - 1]} ${d.year}"
    fun fmtShort(d: LocalDate): String = "${d.dayOfMonth} ${MONTHS[d.monthNumber - 1]}"
    fun fmtMonth(d: LocalDate): String = "${MONTHS_LONG[d.monthNumber - 1]} ${d.year}"

    fun fmtTime(ts: Long): String {
        val t = timeOf(ts)
        return "${t.hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}"
    }

    /** "just now", "5 min ago", "3 h ago", "yesterday 08:12", "Sat 31 Oct" */
    fun fmtRelative(ts: Long, now: Long = now()): String {
        val mins = ((now - ts) / 60_000).toInt()
        val days = daysBetween(dayOf(ts), dayOf(now))
        return when {
            mins < 1 -> "just now"
            mins < 60 && days == 0 -> "$mins min ago"
            days == 0 -> "${mins / 60} h ago"
            days == 1 -> "yesterday ${fmtTime(ts)}"
            else -> fmtDay(dayOf(ts))
        }
    }

    /** Elapsed time as h:mm:ss or m:ss, for live counters. */
    fun fmtElapsed(ms: Long): String {
        val total = (ms / 1000).coerceAtLeast(0)
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        val ss = s.toString().padStart(2, '0')
        return if (h > 0) "$h:${m.toString().padStart(2, '0')}:$ss" else "$m:$ss"
    }
}
