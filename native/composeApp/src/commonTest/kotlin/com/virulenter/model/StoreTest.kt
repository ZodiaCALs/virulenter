package com.virulenter.model

import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MemoryStorage(var text: String? = null) : Storage {
    var writes = 0
    override fun read(): String? = text
    override fun write(text: String) { this.text = text; writes++ }
}

class StoreTest {
    private var now = 0L

    @BeforeTest
    fun fixClock() {
        Dates.zone = TimeZone.UTC
        now = LocalDateTime(2026, 10, 31, 12, 0).toInstant(TimeZone.UTC).toEpochMilliseconds()
        Dates.clock = { now }
    }

    @Test
    fun tapsAreKeptInOrderAndSaved() {
        val disk = MemoryStorage()
        val store = Store(disk)
        val e = store.create("  Coffee  ", "#F0872B", "2026-10-01")
        assertEquals("Coffee", e.name)
        assertEquals("#f0872b", e.color)
        assertEquals(e.id, store.current.tracker)   // the first event is tracked

        store.tap(e.id, now)
        store.tap(e.id, now - 60_000)
        store.tap(e.id, now + 60_000)
        assertEquals(listOf(now - 60_000, now, now + 60_000), store.current.event(e.id)!!.log)

        val reloaded = Store(MemoryStorage(disk.text)).apply { load() }
        assertEquals(store.current.events, reloaded.current.events)
        assertTrue(disk.writes >= 4)
    }

    @Test
    fun observersHearEveryChange() {
        val store = Store(MemoryStorage())
        val seen = mutableListOf<Int>()
        store.observe { seen += it.events.sumOf { e -> e.count } }
        val e = store.create("Water", "#2f6bff")
        store.tap(e.id)
        store.tap(e.id)
        assertEquals(listOf(0, 1, 2), seen)
    }

    @Test
    fun deletingCanBeUndone() {
        val store = Store(MemoryStorage())
        val a = store.create("A", "#2f6bff")
        val b = store.create("B", "#2f6bff")
        val c = store.create("C", "#2f6bff")
        val (removed, index) = assertNotNull(store.remove(b.id))
        assertEquals(listOf("A", "C"), store.current.events.map { it.name })
        store.restore(removed, index)
        assertEquals(listOf(a.id, b.id, c.id), store.current.events.map { it.id })

        store.tap(a.id)
        val log = assertNotNull(store.clearLog(a.id))
        assertEquals(0, store.current.event(a.id)!!.count)
        store.restoreLog(a.id, log)
        assertEquals(1, store.current.event(a.id)!!.count)
    }

    @Test
    fun removingTheTrackedEventClearsTheTracker() {
        val store = Store(MemoryStorage())
        val a = store.create("A", "#2f6bff")
        store.remove(a.id)
        assertNull(store.current.tracker)
    }

    @Test
    fun mergingABackupTwiceAddsNothingTheSecondTime() {
        val store = Store(MemoryStorage())
        val e = store.create("Coffee", "#f0872b", "2026-10-01")
        store.tap(e.id, now - 3_600_000)
        val backup = store.exportJson()
        store.tap(e.id, now)

        val first = store.import(backup, ImportMode.Merge)
        assertTrue(first.ok)
        assertEquals(2, store.current.event(e.id)!!.count)
        store.import(backup, ImportMode.Merge)
        assertEquals(2, store.current.event(e.id)!!.count)
    }

    @Test
    fun twoRealTapsInOneMinuteBothSurviveAMerge() {
        val a = AppState(events = listOf(Event("x", "X", start = "2026-10-01", log = listOf(now))))
        val b = AppState(events = listOf(Event("x", "X", start = "2026-10-01", log = listOf(now + 1_000, now + 2_000))))
        val merged = Store.merge(a, b)
        assertEquals(listOf(now, now + 2_000), merged.events[0].log)
    }

    @Test
    fun importingAWebLinkReplacesOrMerges() {
        val store = Store(MemoryStorage())
        store.create("Mine", "#2f6bff")
        val link = "https://example.org/virulenter/#d=" +
            Codec.encode(listOf(Event("w", "From web", start = "2026-10-30", log = listOf(now))), Look(theme = "dark"))

        assertTrue(store.import(link, ImportMode.Merge).ok)
        assertEquals(listOf("Mine", "From web"), store.current.events.map { it.name })
        assertEquals("dark", store.current.look.theme)   // filled in: ours was the default

        store.import(link, ImportMode.Replace)
        assertEquals(listOf("From web"), store.current.events.map { it.name })

        assertFalse(store.import("not data", ImportMode.Merge).ok)
    }

    @Test
    fun theDataCodeOpensInTheWebApp() {
        val store = Store(MemoryStorage())
        val e = store.create("Tea", "#0ea5a0", "2026-10-30")
        store.tap(e.id, now)
        val back = assertNotNull(Codec.decode(store.dataCode())).state.events.single()
        assertEquals("Tea" to listOf(now), back.name to back.log)
        assertEquals(LocalDate(2026, 10, 30).toString(), back.start)
    }

    @Test
    fun unreadableSavedDataIsReportedNotOverwritten() {
        val disk = MemoryStorage("{ not json")
        val store = Store(disk).apply { load() }
        assertNotNull(store.loadError)
        assertEquals("{ not json", disk.text)
        assertEquals(0, disk.writes)
    }
}
