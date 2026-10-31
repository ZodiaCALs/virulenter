package com.virulenter.model

import kotlinx.datetime.LocalDate
import kotlinx.datetime.isoDayNumber
import kotlin.math.max

/* Everything the screens show that is derived from taps. Pure functions of
   the events and "today", so they are tested without a clock. */
object Stats {

    fun dayTotalsFor(e: Event): Map<LocalDate, Int> {
        val out = HashMap<LocalDate, Int>()
        for (ts in e.log) {
            val d = Dates.dayOf(ts)
            out[d] = (out[d] ?: 0) + 1
        }
        return out
    }

    fun dayTotals(events: List<Event>): Map<LocalDate, Int> {
        val out = HashMap<LocalDate, Int>()
        for (e in events) for ((d, n) in dayTotalsFor(e)) out[d] = (out[d] ?: 0) + n
        return out
    }

    fun countOn(e: Event, day: LocalDate): Int = e.log.count { Dates.dayOf(it) == day }

    /** Taps per day since the event began — its start, or the first tap if earlier. */
    fun perDay(e: Event, today: LocalDate): Double {
        val first = e.first ?: return 0.0
        val firstDay = Dates.dayOf(first)
        val start = Dates.parse(e.start)
        val from = if (start != null && start < firstDay) start else firstDay
        val days = max(1, Dates.daysBetween(from, today) + 1)
        return e.count.toDouble() / days
    }

    fun trackingDays(e: Event, today: LocalDate): Int {
        val start = Dates.parse(e.start) ?: today
        val first = e.first?.let { Dates.dayOf(it) }
        val from = if (first != null && first < start) first else start
        return max(1, Dates.daysBetween(from, today) + 1)
    }

    /** One event's taps on each of the last [n] days, oldest first. */
    fun recent(totals: Map<LocalDate, Int>, n: Int, today: LocalDate): List<Int> =
        (n - 1 downTo 0).map { totals[Dates.addDays(today, -it)] ?: 0 }

    data class Summary(val today: Int, val week: Int, val total: Int, val events: Int)

    fun summary(events: List<Event>, today: LocalDate): Summary {
        val weekFrom = Dates.addDays(today, -6)
        var t = 0
        var w = 0
        var all = 0
        for (e in events) {
            all += e.count
            for (ts in e.log) {
                val d = Dates.dayOf(ts)
                if (d == today) t++
                if (d in weekFrom..today) w++
            }
        }
        return Summary(today = t, week = w, total = all, events = events.size)
    }

    data class Streaks(val longest: Int, val longestEnd: LocalDate?, val current: Int, val activeDays: Int)

    /** The longest run of consecutive days with a tap, and the run still alive
     *  (one that reaches today or yesterday). */
    fun streaks(totals: Map<LocalDate, Int>, today: LocalDate): Streaks {
        val days = totals.filterValues { it > 0 }.keys.sorted()
        if (days.isEmpty()) return Streaks(0, null, 0, 0)
        var best = 1
        var bestEnd = days[0]
        var run = 1
        for (i in 1 until days.size) {
            run = if (Dates.daysBetween(days[i - 1], days[i]) == 1) run + 1 else 1
            if (run > best) { best = run; bestEnd = days[i] }
        }
        val set = days.toHashSet()
        var cursor = when {
            today in set -> today
            Dates.addDays(today, -1) in set -> Dates.addDays(today, -1)
            else -> null
        }
        var current = 0
        while (cursor != null && cursor in set) {
            current++
            cursor = Dates.addDays(cursor, -1)
        }
        return Streaks(best, bestEnd, current, days.size)
    }

    /* ── the dashboard: a range, optionally one event ───────── */
    enum class Range(val label: String, val title: String) {
        Week("7D", "last 7 days"),
        Month("30D", "last 30 days"),
        Quarter("90D", "last 90 days"),
        Year("1Y", "last 12 months"),
    }

    /** First and last day of a range ending today. */
    fun bounds(range: Range, today: LocalDate): Pair<LocalDate, LocalDate> = when (range) {
        Range.Week -> Dates.addDays(today, -6) to today
        Range.Month -> Dates.addDays(today, -29) to today
        Range.Quarter -> Dates.addDays(Dates.weekStart(today), -7 * 12) to today
        Range.Year -> Dates.addMonths(Dates.monthStart(today), -11) to today
    }

    /** The same length of time just before [bounds], for period-over-period change. */
    fun previous(range: Range, today: LocalDate): Pair<LocalDate, LocalDate> {
        val (from, to) = bounds(range, today)
        val len = Dates.daysBetween(from, to) + 1
        return Dates.addDays(from, -len) to Dates.addDays(from, -1)
    }

    fun total(totals: Map<LocalDate, Int>, from: LocalDate, to: LocalDate): Int =
        totals.entries.sumOf { (d, n) -> if (d in from..to) n else 0 }

    fun activeDays(totals: Map<LocalDate, Int>, from: LocalDate, to: LocalDate): Int =
        totals.count { (d, n) -> n > 0 && d in from..to }

    data class Bucket(
        val from: LocalDate,
        val to: LocalDate,
        /** For the tooltip: "Sat 31 Oct", "Week of 26 Oct", "October 2026". */
        val label: String,
        /** Axis label, or "" for none. */
        val tick: String,
        val total: Int,
        /** Each event's share of the total, largest first. */
        val split: List<Pair<Event, Int>>,
        val current: Boolean,
    )

    fun buckets(events: List<Event>, range: Range, today: LocalDate): List<Bucket> {
        val perEvent = events.map { it to dayTotalsFor(it) }
        fun bucket(from: LocalDate, to: LocalDate, label: String, tick: String, current: Boolean): Bucket {
            val split = perEvent.map { (e, t) -> e to total(t, from, to) }.filter { it.second > 0 }.sortedByDescending { it.second }
            return Bucket(from, to, label, tick, split.sumOf { it.second }, split, current)
        }
        return when (range) {
            Range.Week, Range.Month -> {
                val n = if (range == Range.Week) 7 else 30
                (n - 1 downTo 0).map { back ->
                    val d = Dates.addDays(today, -back)
                    val tick = when {
                        back == 0 -> "Today"
                        range == Range.Week -> Dates.weekday(d)
                        d.dayOfWeek.isoDayNumber == 1 && back >= 3 -> Dates.fmtShort(d)
                        else -> ""
                    }
                    bucket(d, d, Dates.fmtDay(d), tick, back == 0)
                }
            }
            Range.Quarter -> {
                val thisWeek = Dates.weekStart(today)
                (12 downTo 0).map { back ->
                    val from = Dates.addDays(thisWeek, -7 * back)
                    val to = if (back == 0) today else Dates.addDays(from, 6)
                    val tick = if (back % 4 == 0) Dates.fmtShort(from) else ""
                    bucket(from, to, "Week of ${Dates.fmtShort(from)}", tick, back == 0)
                }
            }
            Range.Year -> {
                val thisMonth = Dates.monthStart(today)
                (11 downTo 0).map { back ->
                    val from = Dates.addMonths(thisMonth, -back)
                    val to = if (back == 0) today else Dates.addDays(Dates.addMonths(from, 1), -1)
                    bucket(from, to, Dates.fmtMonth(from), Dates.MONTHS[from.monthNumber - 1].take(1), back == 0)
                }
            }
        }
    }

    /** Taps by weekday (Monday first) and by hour, within a range. */
    fun byWeekday(events: List<Event>, from: LocalDate, to: LocalDate): IntArray {
        val out = IntArray(7)
        for (e in events) for (ts in e.log) {
            val d = Dates.dayOf(ts)
            if (d in from..to) out[d.dayOfWeek.isoDayNumber - 1]++
        }
        return out
    }

    fun byHour(events: List<Event>, from: LocalDate, to: LocalDate): IntArray {
        val out = IntArray(24)
        for (e in events) for (ts in e.log) {
            if (Dates.dayOf(ts) in from..to) out[Dates.timeOf(ts).hour]++
        }
        return out
    }

    /** 53 weeks of days, Monday first, ending this week; future days are null. */
    fun heatWeeks(today: LocalDate, weeks: Int = 53): List<List<LocalDate?>> {
        val first = Dates.addDays(Dates.weekStart(today), -7 * (weeks - 1))
        return (0 until weeks).map { w ->
            (0 until 7).map { d ->
                val day = Dates.addDays(first, w * 7 + d)
                if (day > today) null else day
            }
        }
    }

    /** Heat level 0…4 for a count against the busiest day. */
    fun level(n: Int, max: Int): Int = when {
        n <= 0 || max <= 0 -> 0
        n * 4 <= max -> 1
        n * 2 <= max -> 2
        n * 4 <= max * 3 -> 3
        else -> 4
    }

    /** "1.5", "0.44", "12" */
    fun fmtRate(v: Double): String = when {
        v == 0.0 -> "0"
        v >= 10 -> (kotlin.math.round(v)).toLong().toString()
        v >= 1 -> fmtFixed(v, 1)
        else -> fmtFixed(v, 2)
    }

    fun fmtFixed(v: Double, digits: Int): String {
        var p = 1L
        repeat(digits) { p *= 10 }
        val n = kotlin.math.round(v * p).toLong()
        val whole = n / p
        val frac = (n % p).toString().padStart(digits, '0').trimEnd('0')
        return if (frac.isEmpty()) whole.toString() else "$whole.$frac"
    }

    /** "+12%", "−30%", or null when there is nothing to compare against. */
    fun delta(now: Int, before: Int): String? {
        if (before == 0) return null
        val pct = kotlin.math.round((now - before) * 100.0 / before).toLong()
        return when {
            pct > 0 -> "+$pct%"
            pct < 0 -> "−${-pct}%"
            else -> "±0%"
        }
    }
}
