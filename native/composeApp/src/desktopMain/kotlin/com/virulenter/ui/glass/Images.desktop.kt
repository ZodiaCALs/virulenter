package com.virulenter.ui.glass

import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import org.jetbrains.skia.Image
import org.jetbrains.skia.Rect
import org.jetbrains.skia.Surface
import java.awt.GraphicsEnvironment
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** The largest attached screen, in device pixels (HiDPI scale included). */
private fun screenPixels(): Pair<Int, Int> = runCatching {
    GraphicsEnvironment.getLocalGraphicsEnvironment().screenDevices.map { d ->
        val c = d.defaultConfiguration
        val s = c.defaultTransform.scaleX
        (c.bounds.width * s).roundToInt() to (c.bounds.height * s).roundToInt()
    }.maxBy { it.first * it.second }
}.getOrDefault(2560 to 1600)

actual fun decodeImage(bytes: ByteArray, maxSide: Int): ImageBitmap? = runCatching {
    val image = Image.makeFromEncoded(bytes)
    val (sw, sh) = screenPixels()
    val k = fitScale(image.width, image.height, max(sw, sh), min(sw, sh), maxSide)
    if (k >= 0.999f) {
        image.toComposeImageBitmap()
    } else {
        val w = (image.width * k).roundToInt().coerceAtLeast(1)
        val h = (image.height * k).roundToInt().coerceAtLeast(1)
        val surface = Surface.makeRasterN32Premul(w, h)
        surface.canvas.drawImageRect(image, Rect.makeWH(w.toFloat(), h.toFloat()))
        surface.makeImageSnapshot().toComposeImageBitmap().also { image.close() }
    }
}.getOrNull()
