package com.virulenter.ui.glass

import kotlin.test.Test
import kotlin.test.assertEquals

/* The same cases the web app's suite checks for its uploads (tools/verify.mjs). */
class FitTest {
    @Test
    fun aPhotoIsKeptAtTheSizeTheScreenShows() {
        /* 430 × 900 at 2×: the 2400 px cap is what binds */
        assertEquals(0.4f, fitScale(6000, 4000, 1800, 860), 1e-6f)
        /* a 1280 × 800 laptop: covering the screen turned needs only 32 % */
        assertEquals(0.32f, fitScale(6000, 4000, 1280, 800), 1e-6f)
        /* a 1080 × 2400 phone and a 12-megapixel photo: 2400 × 1800 */
        assertEquals(0.6f, fitScale(4000, 3000, 2400, 1080), 1e-6f)
    }

    @Test
    fun aSmallPictureIsNeverEnlarged() {
        assertEquals(1f, fitScale(800, 600, 1800, 860))
        assertEquals(1f, fitScale(0, 0, 1800, 860))
    }
}
