package com.virulenter.ui.glass

import androidx.compose.ui.graphics.ImageBitmap

/** Decodes a picture, scaled down so its long side is at most [maxSide]; null if unreadable. */
expect fun decodeImage(bytes: ByteArray, maxSide: Int = 2400): ImageBitmap?
