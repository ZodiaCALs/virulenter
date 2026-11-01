package com.virulenter.model

import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlin.math.max
import kotlin.random.Random

/** A decoded payload; [hasLook] is false when the source carried no appearance. */
data class Decoded(val state: AppState, val hasLook: Boolean)

/*
 * The web app's formats, read and written here so data moves both ways:
 *
 *  - the link payload (#d=…, base64url over a packed binary; app/js/codec.js
 *    documents the layout byte by byte), and
 *  - the JSON backup ({ app, v, exportedAt, look, events }).
 *
 * Taps in a link are kept to the minute, relative to the event's start day,
 * in local time — exactly as the web app writes them.
 */
object Codec {
    const val FORMAT = 2
    private const val DAY_BIAS = 30000
    private const val MINUTES_MAX = 1439
    private val EPOCH: Int = Dates.MIN_START.toEpochDays()

    @OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        explicitNulls = false
        encodeDefaults = true
        prettyPrint = true
        prettyPrintIndent = "  "
    }

    fun uid(): String {
        val r = Random.nextLong(36L * 36 * 36 * 36).toString(36).padStart(4, '0')
        return "e" + Dates.now().toString(36) + r
    }

    /* ── base64url ─────────────────────────────────────────── */
    private const val B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

    fun b64(bytes: ByteArray): String {
        val sb = StringBuilder((bytes.size * 4 + 2) / 3)
        var i = 0
        while (i < bytes.size) {
            val b0 = bytes[i].toInt() and 255
            val b1 = if (i + 1 < bytes.size) bytes[i + 1].toInt() and 255 else 0
            val b2 = if (i + 2 < bytes.size) bytes[i + 2].toInt() and 255 else 0
            val n = (b0 shl 16) or (b1 shl 8) or b2
            sb.append(B64[(n shr 18) and 63]).append(B64[(n shr 12) and 63])
            if (i + 1 < bytes.size) sb.append(B64[(n shr 6) and 63])
            if (i + 2 < bytes.size) sb.append(B64[n and 63])
            i += 3
        }
        return sb.toString()
    }

    /** Accepts the URL-safe and the standard alphabet, with or without padding. */
    fun unb64(text: String): ByteArray {
        val out = ArrayList<Byte>(text.length * 3 / 4)
        var buf = 0
        var bits = 0
        for (c in text) {
            if (c.isWhitespace() || c == '=') continue
            val v = when (c) {
                in 'A'..'Z' -> c - 'A'
                in 'a'..'z' -> c - 'a' + 26
                in '0'..'9' -> c - '0' + 52
                '-', '+' -> 62
                '_', '/' -> 63
                else -> throw IllegalArgumentException("not base64: '$c'")
            }
            buf = ((buf shl 6) or v) and 0xFFFFFF
            bits += 6
            if (bits >= 8) {
                bits -= 8
                out.add(((buf shr bits) and 255).toByte())
            }
        }
        return out.toByteArray()
    }

    /* ── varints ───────────────────────────────────────────── */
    private fun MutableList<Byte>.varint(value: Long) {
        var v = max(0L, value)
        while (v >= 128) {
            add(((v and 127) or 128).toByte())
            v = v shr 7
        }
        add(v.toByte())
    }

    private class Reader(val bytes: ByteArray) {
        var i = 0
        fun byte(): Int {
            if (i >= bytes.size) throw IllegalArgumentException("truncated payload")
            return bytes[i++].toInt() and 255
        }
        fun varint(): Long {
            var result = 0L
            var shift = 0
            do {
                val b = byte()
                if (shift > 56) throw IllegalArgumentException("varint too long")
                result += (b and 127).toLong() shl shift
                shift += 7
            } while (b and 128 != 0)
            return result
        }
    }

    /* ── state → bytes ─────────────────────────────────────── */
    fun pack(events: List<Event>, look: Look): ByteArray {
        val out = ArrayList<Byte>()
        out.add(FORMAT.toByte())
        out.varint(events.size.toLong())
        for (e in events) {
            val name = e.name.ifEmpty { "Untitled" }.take(48).encodeToByteArray()
            out.varint(name.size.toLong())
            name.forEach { out.add(it) }

            val ci = Palette.COLORS.indexOfFirst { it.equals(e.color, ignoreCase = true) }
            out.add((if (ci < 0) 0 else ci).toByte())

            /* clamp first, then measure taps from the day actually written */
            val startDate = Dates.parse(e.start) ?: Dates.today()
            val startDay = max(0, startDate.toEpochDays() - EPOCH)
            out.varint(startDay.toLong())

            val taps = e.log.filter { it > 0 }.sorted()
            out.varint(taps.size.toLong())
            for (ts in taps) {
                val day = Dates.dayOf(ts)
                var dayOff = day.toEpochDays() - (startDay + EPOCH)
                /* floor, never round: a tap must not decode to a later time */
                val mins = ((ts - Dates.startOfDay(day)) / 60_000).toInt().coerceIn(0, MINUTES_MAX)
                if (dayOff < -DAY_BIAS) dayOff = -DAY_BIAS
                if (dayOff > 32767) dayOff = 32767
                out.varint(mins.toLong())
                out.varint((dayOff + DAY_BIAS).toLong())
            }
        }

        val custom = look.custom?.takeIf { Palette.isHex(it) }
        val accentIdx = max(0, Palette.ACCENTS.indexOfFirst { it.id == look.accent })
        val fontIdx = max(0, Palette.FONTS.indexOfFirst { it.id == look.font })
        val themeIdx = max(0, Palette.THEMES.indexOf(look.theme))
        val bgIdx = max(0, Palette.BACKGROUNDS.indexOfFirst { it.id == look.bg })
        val nonDefault = accentIdx > 0 || fontIdx > 0
        val flags = (if (nonDefault) 1 else 0) or (if (custom != null) 2 else 0) or
            (if (themeIdx != 0) 4 else 0) or (if (bgIdx != 0) 8 else 0)
        out.add(flags.toByte())
        if (nonDefault) out.add((((accentIdx and 15) shl 4) or (fontIdx and 15)).toByte())
        if (custom != null) {
            val rgb = custom.removePrefix("#").toInt(16)
            out.add(((rgb shr 16) and 255).toByte())
            out.add(((rgb shr 8) and 255).toByte())
            out.add((rgb and 255).toByte())
        }
        if (themeIdx != 0) out.add(themeIdx.toByte())
        if (bgIdx != 0) out.add(bgIdx.toByte())
        return out.toByteArray()
    }

    /* ── bytes → state ─────────────────────────────────────── */
    fun unpack(bytes: ByteArray, newId: () -> String = ::uid): Decoded? {
        if (bytes.size < 3) return null
        val r = Reader(bytes)
        if (r.byte() != FORMAT) return null
        val count = r.varint()
        if (count > 2000) return null

        val events = ArrayList<Event>()
        for (n in 0 until count.toInt()) {
            val nameLen = r.varint().toInt()
            if (nameLen > 400 || r.i + nameLen > bytes.size) return null
            val name = bytes.decodeToString(r.i, r.i + nameLen)
            r.i += nameLen

            val colorIdx = r.byte()
            val startDay = r.varint().toInt()
            val tapCount = r.varint()
            if (tapCount > 200_000) return null

            val log = LongArray(tapCount.toInt())
            for (t in log.indices) {
                val mins = r.varint()
                val dayOff = r.varint() - DAY_BIAS
                val day = LocalDate.fromEpochDays((EPOCH + startDay + dayOff).toInt())
                log[t] = Dates.startOfDay(day) + mins * 60_000
            }
            log.sort()
            events.add(
                Event(
                    id = newId(),
                    name = name.ifEmpty { "Untitled" }.take(48),
                    color = Palette.COLORS.getOrElse(colorIdx) { Palette.COLORS[0] },
                    start = Dates.iso(LocalDate.fromEpochDays(EPOCH + startDay)),
                    log = log.toList(),
                ),
            )
        }

        /* appearance is optional: a payload that ends here still loads */
        var look = Look()
        if (r.i < bytes.size) {
            val flags = r.byte()
            if (flags and 1 != 0 && r.i < bytes.size) {
                val packed = r.byte()
                look = look.copy(
                    accent = (Palette.ACCENTS.getOrNull(packed shr 4) ?: Palette.ACCENTS[0]).id,
                    font = (Palette.FONTS.getOrNull(packed and 15) ?: Palette.FONTS[0]).id,
                )
            }
            if (flags and 2 != 0 && r.i + 3 <= bytes.size) {
                val hex = (0 until 3).joinToString("") { r.byte().toString(16).padStart(2, '0') }
                look = look.copy(custom = "#$hex")
            }
            if (flags and 4 != 0 && r.i < bytes.size) {
                look = look.copy(theme = Palette.THEMES.getOrNull(r.byte()) ?: "system")
            }
            if (flags and 8 != 0 && r.i < bytes.size) {
                look = look.copy(bg = Palette.BACKGROUNDS.getOrNull(r.byte())?.id ?: "none")
            }
        }
        return Decoded(AppState(events = events, look = look), hasLook = true)
    }

    fun encode(events: List<Event>, look: Look): String = b64(pack(events, look))

    /** Every d= payload in a pasted link — query and fragment alike — or a bare payload. */
    fun payloadsIn(text: String): List<String> {
        val s = text.trim()
        val out = LinkedHashSet<String>()
        Regex("(?:^|[?&#])d=([A-Za-z0-9_-]+)").findAll(s).forEach { out.add(it.groupValues[1]) }
        if (out.isEmpty() && Regex("^[A-Za-z0-9_-]{4,}$").matches(s)) out.add(s)
        return out.toList()
    }

    /** A web link, a bare payload or a JSON backup → state. */
    fun decode(text: String, newId: () -> String = ::uid): Decoded? {
        val t = text.trim()
        if (t.isEmpty()) return null
        /* JSON first when it looks like JSON, so an event named "?d=…"
           inside a backup is never read as a link */
        if (t.startsWith("{") || t.startsWith("[")) decodeJson(t, newId)?.let { return it }

        val parts = payloadsIn(t).mapNotNull { p -> runCatching { unpack(unb64(p), newId) }.getOrNull() }
        if (parts.isNotEmpty()) {
            val first = parts[0]
            return first.copy(state = first.state.copy(events = parts.flatMap { it.state.events }))
        }
        return decodeJson(t, newId)
    }

    /** A JSON backup (or a bare array of events) → state. Ids are kept, so
     *  re-importing a backup merges instead of duplicating. */
    fun decodeJson(text: String, newId: () -> String = ::uid): Decoded? {
        val root = runCatching { json.parseToJsonElement(text) }.getOrNull() ?: return null
        val list = when (root) {
            is JsonArray -> root
            is JsonObject -> root["events"] as? JsonArray ?: return null
            else -> return null
        }
        val obj = root as? JsonObject
        val events = list.mapNotNull { el -> (el as? JsonObject)?.let { eventFrom(it, newId) } }
        if (events.isEmpty() && list.isNotEmpty()) return null

        val lookObj = obj?.get("look") as? JsonObject
        val look = lookObj?.let { lookFrom(it) } ?: Look()
        val tracker = obj?.str("tracker")
        val settings = obj?.get("settings")?.let { el ->
            runCatching { json.decodeFromJsonElement(Settings.serializer(), el) }.getOrNull()
        } ?: Settings()
        return Decoded(
            AppState(events = events, look = look, tracker = tracker?.takeIf { id -> events.any { it.id == id } }, settings = settings),
            hasLook = lookObj != null,
        )
    }

    private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

    private fun eventFrom(o: JsonObject, newId: () -> String): Event {
        val name = o.str("name")?.trim()?.take(48)?.ifEmpty { null } ?: "Untitled"
        val color = o.str("color")?.takeIf { Palette.isHex(it) }?.lowercase() ?: Palette.COLORS[0]
        val log = (o["log"] as? JsonArray)
            ?.mapNotNull { (it as? JsonPrimitive)?.doubleOrNull?.toLong() }
            ?.filter { it > 0 }
            ?.sorted()
            .orEmpty()
        val goal = (o["goal"] as? JsonPrimitive)?.intOrNull?.takeIf { it in 1..100_000 }
        val reminder = o["reminder"]?.let { el: JsonElement ->
            runCatching { json.decodeFromJsonElement(Reminder.serializer(), el) }.getOrNull()
        }?.takeIf { it.hour in 0..23 && it.minute in 0..59 }
        return Event(
            id = o.str("id")?.takeIf { it.isNotBlank() } ?: newId(),
            name = name,
            color = color,
            start = Dates.clampStart(o.str("start")),
            log = log,
            goal = goal,
            reminder = reminder,
        )
    }

    private fun lookFrom(o: JsonObject): Look = Look(
        accent = o.str("accent")?.takeIf { id -> Palette.ACCENTS.any { it.id == id } } ?: "blue",
        font = o.str("font")?.takeIf { id -> Palette.FONTS.any { it.id == id } } ?: "system",
        custom = o.str("custom")?.takeIf { Palette.isHex(it) }?.lowercase(),
        theme = o.str("theme")?.takeIf { it in Palette.THEMES } ?: "system",
        bg = o.str("bg")?.takeIf { id -> Palette.BACKGROUNDS.any { it.id == id } } ?: "none",
    )

    /** The JSON backup: the web app's format plus the native-only fields. */
    fun toJson(state: AppState, exportedAt: String): String =
        json.encodeToString(AppState.serializer(), state.copy(exportedAt = exportedAt))
}
