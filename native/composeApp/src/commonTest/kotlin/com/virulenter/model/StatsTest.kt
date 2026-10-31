package com.virulenter.model

import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class StatsTest {
    private val today = LocalDate(2026, 10, 31)   // a Saturday

    @BeforeTest
    fun zone() {
        Dates.zone = TimeZone.UTC
        Dates.clock = { LocalDateTime(2026, 10, 31, 12, 0).toInstant(TimeZone.UTC).toEpochMilliseconds() }
    }

    private fun at(d: LocalDate, h: Int = 9) = Dates.at(d, h, 0)
    private fun ago(n: Int, h: Int = 9) = at(Dates.addDays(today, -n), h)

    @Test
    fun streaksCountConsecutiveDaysAndStayAliveUntilTomorrow() {
        val totals = mapOf(
            Dates.addDays(today, -1) to 2, Dates.addDays(today, -2) to 1, Dates.addDays(today, -3) to 4,
            Dates.addDays(today, -10) to 1, Dates.addDays(today, -11) to 1, Dates.addDays(today, -12) to 1,
            Dates.addDays(today, -13) to 1,
        )
        val s = Stats.streaks(totals, today)
        assertEquals(4, s.longest)
        assertEquals(Dates.addDays(today, -10), s.longestEnd)
        assertEquals(3, s.current)          // yesterday still counts
        assertEquals(7, s.activeDays)
        assertEquals(0, Stats.streaks(mapOf(Dates.addDays(today, -2) to 1), today).current)
    }

    @Test
    fun perDayRunsFromTheEarlierOfStartAndFirstTap() {
        val e = Event("a", "A", start = "2026-10-29", log = listOf(ago(9), ago(0)))
        assertEquals(2.0 / 10, Stats.perDay(e, today))
        assertEquals(10, Stats.trackingDays(e, today))
    }

    @Test
    fun summaryCountsTodayAndTheLastSevenDays() {
        val e = Event("a", "A", start = "2026-10-01", log = listOf(ago(0), ago(0, 10), ago(6), ago(7)))
        assertEquals(Stats.Summary(today = 2, week = 3, total = 4, events = 1), Stats.summary(listOf(e), today))
    }

    @Test
    fun eachRangeHasItsBuckets() {
        val e = Event("a", "A", start = "2026-01-01", log = listOf(ago(0), ago(1), ago(40), ago(200)))
        val week = Stats.buckets(listOf(e), Stats.Range.Week, today)
        assertEquals(7, week.size)
        assertEquals("Today", week.last().tick)
        assertTrue(week.last().current)
        assertEquals(listOf(0, 0, 0, 0, 0, 1, 1), week.map { it.total })

        assertEquals(30, Stats.buckets(listOf(e), Stats.Range.Month, today).size)

        val quarter = Stats.buckets(listOf(e), Stats.Range.Quarter, today)
        assertEquals(13, quarter.size)
        assertEquals(LocalDate(2026, 10, 26), quarter.last().from)   // this week's Monday
        assertEquals(today, quarter.last().to)
        assertEquals(3, quarter.sumOf { it.total })                  // the 200-days-ago tap is out of range

        val year = Stats.buckets(listOf(e), Stats.Range.Year, today)
        assertEquals(12, year.size)
        assertEquals("November 2025", year.first().label)
        assertEquals(4, year.sumOf { it.total })
    }

    @Test
    fun bucketsSplitByEventLargestFirst() {
        val a = Event("a", "A", start = "2026-10-01", log = listOf(ago(0)))
        val b = Event("b", "B", start = "2026-10-01", log = listOf(ago(0), ago(0, 11)))
        val split = Stats.buckets(listOf(a, b), Stats.Range.Week, today).last().split
        assertEquals(listOf("B" to 2, "A" to 1), split.map { it.first.name to it.second })
    }

    @Test
    fun weekdayAndHourStayInsideTheRange() {
        val e = Event("a", "A", start = "2026-01-01", log = listOf(ago(0, 8), ago(1, 8), ago(1, 21), ago(100, 8)))
        val (from, to) = Stats.bounds(Stats.Range.Month, today)
        val days = Stats.byWeekday(listOf(e), from, to)
        assertEquals(1, days[5])   // Saturday
        assertEquals(2, days[4])   // Friday
        val hours = Stats.byHour(listOf(e), from, to)
        assertEquals(2, hours[8])
        assertEquals(1, hours[21])
    }

    @Test
    fun theHeatGridEndsThisWeekWithFutureDaysEmpty() {
        val weeks = Stats.heatWeeks(today)
        assertEquals(53, weeks.size)
        assertEquals(LocalDate(2026, 10, 26), weeks.last().first())
        assertEquals(today, weeks.last()[5])
        assertEquals(null, weeks.last()[6])
    }

    @Test
    fun levelsAndFormats() {
        assertEquals(listOf(0, 1, 2, 3, 4), listOf(0, 2, 4, 6, 8).map { Stats.level(it, 8) })
        assertEquals("1.5", Stats.fmtRate(1.5))
        assertEquals("0.44", Stats.fmtRate(0.4444))
        assertEquals("12", Stats.fmtRate(12.4))
        assertEquals("3", Stats.fmtRate(3.04))
        assertEquals("+50%", Stats.delta(3, 2))
        assertEquals("−50%", Stats.delta(1, 2))
        assertEquals(null, Stats.delta(1, 0))
    }

    @Test
    fun relativeTimes() {
        val now = Dates.now()
        assertEquals("just now", Dates.fmtRelative(now - 20_000, now))
        assertEquals("5 min ago", Dates.fmtRelative(now - 5 * 60_000, now))
        assertEquals("3 h ago", Dates.fmtRelative(now - 3 * 3_600_000, now))
        assertEquals("yesterday 09:00", Dates.fmtRelative(ago(1), now))
        assertEquals("Mon 26 Oct", Dates.fmtRelative(ago(5), now))
        assertEquals("1:01:05", Dates.fmtElapsed(3_665_000))
        assertEquals("4:09", Dates.fmtElapsed(249_000))
    }
}
