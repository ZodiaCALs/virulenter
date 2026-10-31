/* Plugins are declared once here and applied in :composeApp, so they share
   one classloader (the Kotlin plugin needs to see the Android plugin). */
plugins {
    alias(libs.plugins.androidApplication) apply false
    alias(libs.plugins.composeMultiplatform) apply false
    alias(libs.plugins.composeCompiler) apply false
    alias(libs.plugins.kotlinMultiplatform) apply false
    alias(libs.plugins.kotlinSerialization) apply false
}
