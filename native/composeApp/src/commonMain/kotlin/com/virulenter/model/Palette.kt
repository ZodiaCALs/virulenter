package com.virulenter.model

/* The web app's tables, in the same order: the wire format stores indexes
   into them (see app/js/core.js and app/js/codec.js). */
object Palette {
    /** Event colours. */
    val COLORS = listOf(
        "#2f6bff", "#0ea5a0", "#f0872b", "#d92d4b",
        "#7c4dff", "#0f9d58", "#c2185b", "#5b6472",
    )

    data class Accent(val id: String, val label: String, val value: String)

    val ACCENTS = listOf(
        Accent("blue", "Blue", "#2f6bff"),
        Accent("indigo", "Indigo", "#4f46e5"),
        Accent("violet", "Violet", "#7c3aed"),
        Accent("magenta", "Magenta", "#c026d3"),
        Accent("rose", "Rose", "#e11d48"),
        Accent("orange", "Orange", "#ea580c"),
        Accent("green", "Green", "#0f9d58"),
        Accent("teal", "Teal", "#0d9488"),
        Accent("slate", "Slate", "#475569"),
        Accent("ink", "Ink", "#111827"),
    )

    data class Font(val id: String, val label: String)

    val FONTS = listOf(
        Font("system", "System"),
        Font("humanist", "Humanist"),
        Font("serif", "Serif"),
        Font("rounded", "Rounded"),
        Font("mono", "Mono"),
    )

    val THEMES = listOf("system", "light", "dark")

    fun accentValue(look: Look): String =
        look.custom?.takeIf { isHex(it) }
            ?: ACCENTS.firstOrNull { it.id == look.accent }?.value
            ?: ACCENTS[0].value

    fun isHex(s: String?): Boolean = s != null && Regex("^#[0-9a-fA-F]{6}$").matches(s)

    /** "#rrggbb" → 0xFFRRGGBB */
    fun argb(hex: String): Long {
        val clean = hex.removePrefix("#")
        val rgb = clean.toLongOrNull(16) ?: 0x2f6bffL
        return 0xFF000000L or rgb
    }
}
