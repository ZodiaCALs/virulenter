package com.virulenter.model

import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/* Golden vectors come from the web app's own codec (app/js/codec.js), run
   in Node — the payload is the same in every time zone, because taps are
   stored as local wall-clock times. */
class CodecTest {
    private fun ms(y: Int, m: Int, d: Int, hh: Int, mm: Int, ss: Int = 0) =
        LocalDateTime(y, m, d, hh, mm, ss).toInstant(Dates.zone).toEpochMilliseconds()

    @BeforeTest
    fun fixClock() {
        Dates.zone = TimeZone.UTC
        Dates.clock = { LocalDateTime(2026, 10, 31, 12, 0).toInstant(TimeZone.UTC).toEpochMilliseconds() }
    }

    private val WEB_PAYLOAD =
        "AgMGQ29mZmVlAqETBKQDr-oB5QOw6gHlA7DqAZ8LsuoBEVdhc3NlciDwn5KnIGNhZsOpAAACALDqAfIF7_0BCFVudGl0bGVkBb8TAAckq83vAg"

    private fun webState() = listOf(
        Event("a", "Coffee", "#f0872b", "2026-10-01",
            listOf(ms(2026, 10, 1, 8, 5, 30), ms(2026, 10, 1, 8, 5, 50), ms(2026, 10, 3, 23, 59), ms(2026, 9, 30, 7, 0))),
        Event("b", "Wasser 💧 café", "#123456", "2019-06-01", listOf(ms(2020, 1, 1, 0, 0), ms(2026, 10, 31, 12, 34))),
        Event("c", "", "#0f9d58", "2026-02-30", emptyList()),
    ) to Look(accent = "violet", font = "mono", custom = "#ABCDEF", theme = "dark")

    @Test
    fun encodesExactlyAsTheWebAppDoes() {
        val (events, look) = webState()
        assertEquals(WEB_PAYLOAD, Codec.encode(events, look))
    }

    @Test
    fun aDefaultLookCostsOneByte() {
        assertEquals("AgAA", Codec.encode(emptyList(), Look()))
    }

    @Test
    fun decodesTheWebPayload() {
        var n = 0
        val d = assertNotNull(Codec.decode(WEB_PAYLOAD) { "id${n++}" })
        val e = d.state.events
        assertEquals(listOf("Coffee", "Wasser 💧 café", "Untitled"), e.map { it.name })
        assertEquals(listOf("#f0872b", "#2f6bff", "#0f9d58"), e.map { it.color })
        assertEquals(listOf("2026-10-01", "2020-01-01", "2026-10-31"), e.map { it.start })
        /* to the minute, sorted, the tap before the start day kept */
        assertEquals(listOf(1790751600000, 1790841900000, 1790841900000, 1791071940000), e[0].log)
        assertEquals(listOf(1577836800000, 1793450040000), e[1].log)
        assertEquals(Look(accent = "violet", font = "mono", custom = "#abcdef", theme = "dark"), d.state.look)
        assertEquals(listOf("id0", "id1", "id2"), e.map { it.id })
    }

    @Test
    fun base64RoundTripsEveryLength() {
        for (len in 0..12) {
            val bytes = ByteArray(len) { (it * 37 + 11).toByte() }
            val text = Codec.b64(bytes)
            assertTrue(text.none { it == '+' || it == '/' || it == '=' }, text)
            assertContentEquals(bytes, Codec.unb64(text))
        }
        /* the standard alphabet and padding are read too */
        assertContentEquals(byteArrayOf(-5, -1), Codec.unb64("+/8="))
    }

    @Test
    fun findsEveryPayloadInALink() {
        assertEquals(listOf("AAAA", "BBBB", "CCCC"), Codec.payloadsIn("https://x.app/v/?d=AAAA&d=BBBB#d=CCCC"))
        assertEquals(listOf("AgAA"), Codec.payloadsIn("  AgAA "))
        assertEquals(emptyList(), Codec.payloadsIn("hello world"))
    }

    @Test
    fun aLinkWithSeveralPayloadsDecodesToAllTheirEvents() {
        val one = Codec.encode(listOf(Event("x", "One", start = "2026-10-01")), Look())
        val two = Codec.encode(listOf(Event("y", "Two", start = "2026-10-02")), Look(theme = "light"))
        val d = assertNotNull(Codec.decode("https://v.app/?d=$one#d=$two"))
        assertEquals(listOf("One", "Two"), d.state.events.map { it.name })
        assertEquals("system", d.state.look.theme)   // the first payload's look wins
    }

    @Test
    fun readsTheWebAppsJsonBackup() {
        val web = """
            { "app": "Virulenter", "v": 2, "exportedAt": "2026-10-31T10:00:00.000Z",
              "look": { "accent": "teal", "font": "serif", "custom": null, "theme": "light" },
              "events": [
                { "id": "e1", "name": "  Water  ", "color": "#0ea5a0", "start": "2026-10-20", "log": [1791000000000, 1790000000000] },
                { "id": "e2", "name": "Bad", "color": "red", "start": "1999-01-01", "log": ["x", -5, 1791100000000.0] }
              ] }
        """.trimIndent()
        val d = assertNotNull(Codec.decode(web))
        assertTrue(d.hasLook)
        assertEquals(Look(accent = "teal", font = "serif", custom = null, theme = "light"), d.state.look)
        val (a, b) = d.state.events
        assertEquals("e1" to "Water", a.id to a.name)
        assertEquals(listOf(1790000000000, 1791000000000), a.log)
        assertEquals("#2f6bff", b.color)
        assertEquals("2020-01-01", b.start)
        assertEquals(listOf(1791100000000), b.log)
    }

    @Test
    fun ourBackupKeepsTheNativeFields() {
        val state = AppState(
            events = listOf(Event("e1", "Run", "#0f9d58", "2026-10-01", listOf(1791000000000), goal = 3, reminder = Reminder(7, 30, Reminder.WEEKDAYS))),
            tracker = "e1",
            settings = Settings(liveTracker = true, keepInTray = false),
        )
        val text = Codec.toJson(state, "2026-10-31T12:00:00Z")
        val back = assertNotNull(Codec.decodeJson(text)).state
        assertEquals(state.events, back.events)
        assertEquals("e1", back.tracker)
        assertEquals(state.settings, back.settings)
        assertTrue(text.contains("\"exportedAt\": \"2026-10-31T12:00:00Z\""))
    }

    @Test
    fun rejectsWhatIsNotVirulenterData() {
        assertNull(Codec.decode(""))
        assertNull(Codec.decode("hello world"))
        assertNull(Codec.decode("{}"))
        assertNull(Codec.decode("abcd"))
        assertNull(Codec.decode("[1, 2, 3]"))
    }
}
