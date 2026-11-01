package com.virulenter.ui.glass

import androidx.compose.ui.graphics.ImageBitmap
import kotlin.math.max
import kotlin.math.min

/** Decodes a picture, scaled down to what this device's screen can show
 *  (see [fitScale]) and never past [maxSide]; null if unreadable. */
expect fun decodeImage(bytes: ByteArray, maxSide: Int = 2400): ImageBitmap?

/**
 * The scale that keeps a [w] × [h] picture just large enough to cover a
 * [screenLong] × [screenShort] pixel screen at full sharpness, upright or
 * turned (backgrounds are drawn cropped to fill), capped at [maxSide] and
 * never enlarged. A picture bigger than the screen only costs memory: every
 * pixel stays decoded while it is shown. The web app sizes uploads the same way.
 */
fun fitScale(w: Int, h: Int, screenLong: Int, screenShort: Int, maxSide: Int = 2400): Float {
    if (w <= 0 || h <= 0) return 1f
    val long = max(screenLong, screenShort).toFloat()
    val short = min(screenLong, screenShort).toFloat()
    val cover = max(max(long / w, short / h), max(short / w, long / h))
    return min(1f, min(cover, maxSide.toFloat() / max(w, h)))
}
