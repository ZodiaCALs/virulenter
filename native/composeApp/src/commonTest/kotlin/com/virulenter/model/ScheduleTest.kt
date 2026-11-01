package com.virulenter.model

import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ScheduleTest {
    @BeforeTest
    fun zone() {
        Dates.zone = TimeZone.UTC
    }

    private fun t(d: Int, h: Int, m: Int) = LocalDateTime(2026, 10, d, h, m).toInstant(TimeZone.UTC).toEpochMilliseconds()

    @Test
    fun nextIsLaterTodayOrOnTheNextAllowedDay() {
        val daily = Reminder(20, 0)
        assertEquals(t(31, 20, 0), Schedule.next(daily, t(31, 12, 0)))
        assertEquals(Dates.at(LocalDate(2026, 11, 1), 20, 0), Schedule.next(daily, t(31, 20, 0)))

        /* Saturday 31 Oct, weekdays only: Monday 2 Nov */
        val weekdays = Reminder(7, 30, Reminder.WEEKDAYS)
        assertEquals(Dates.at(LocalDate(2026, 11, 2), 7, 30), Schedule.next(weekdays, t(31, 6, 0)))
    }

    @Test
    fun offOrEmptyRemindersNeverFire() {
        assertNull(Schedule.next(Reminder(enabled = false), t(31, 0, 0)))
        assertNull(Schedule.next(Reminder(days = 0), t(31, 0, 0)))
    }

    @Test
    fun aSchedulerThatSleptFiresWhatCameDue() {
        val a = Event("a", "A", start = "2026-10-01", reminder = Reminder(9, 0))
        val b = Event("b", "B", start = "2026-10-01", reminder = Reminder(18, 0))
        val c = Event("c", "C", start = "2026-10-01")
        assertEquals(listOf("a"), Schedule.dueBetween(listOf(a, b, c), t(31, 8, 59), t(31, 9, 0)).map { it.id })
        assertEquals(emptyList(), Schedule.dueBetween(listOf(a, b, c), t(31, 9, 0), t(31, 9, 1)).map { it.id })
    }

    @Test
    fun daysRead() {
        assertEquals("Every day", Schedule.daysLabel(Reminder.ALL_DAYS))
        assertEquals("Weekdays", Schedule.daysLabel(Reminder.WEEKDAYS))
        assertEquals("Weekends", Schedule.daysLabel(0b1100000))
        assertEquals("Mon, Wed, Fri", Schedule.daysLabel(0b0010101))
    }
}
