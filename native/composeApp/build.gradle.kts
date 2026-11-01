import java.util.Properties
import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlinSerialization)
}

/* the version lives in src/commonMain/kotlin/com/virulenter/Version.kt, so the
   app can show it and the packages carry it, from one line */
val versionSource = file("src/commonMain/kotlin/com/virulenter/Version.kt").readText()
val appVersion = Regex("APP_VERSION = \"([^\"]+)\"").find(versionSource)!!.groupValues[1]
val appVersionCode = Regex("APP_VERSION_CODE = (\\d+)").find(versionSource)!!.groupValues[1].toInt()

kotlin {
    androidTarget {
        compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
    }
    jvm("desktop") {
        compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
    }

    sourceSets {
        val desktopMain by getting

        commonMain.dependencies {
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.ui)
            implementation(compose.components.resources)
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.datetime)
            implementation(libs.haze)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
        }
        androidMain.dependencies {
            implementation(libs.androidx.activity.compose)
            implementation(libs.kotlinx.coroutines.android)
        }
        desktopMain.dependencies {
            implementation(compose.desktop.currentOs)
            implementation(libs.kotlinx.coroutines.swing)
        }
    }
}

compose.resources {
    packageOfResClass = "com.virulenter.resources"
    generateResClass = always
}

/* Release signing reuses the WebView app's project keystore (see
   apk/keystore.properties: a public, sideload-only key). */
val keystoreProps = rootProject.file("../apk/keystore.properties").takeIf { it.exists() }?.let { f ->
    Properties().apply { f.inputStream().use { load(it) } }
}

android {
    namespace = "com.virulenter"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.virulenter.kmp"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = appVersionCode
        versionName = appVersion
    }

    signingConfigs {
        if (keystoreProps != null) {
            create("release") {
                storeFile = rootProject.file("../apk/" + keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        getByName("release") {
            /* R8 drops what the app never calls in Compose, Material, the
               coroutines and the Kotlin runtime, then the resources nothing
               refers to: most of an unshrunk Compose APK's weight */
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint { abortOnError = false }
}

compose.desktop {
    application {
        mainClass = "com.virulenter.MainKt"

        nativeDistributions {
            targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "Virulenter"
            packageVersion = appVersion
            description = "Count anything with a tap"
            vendor = "Virulenter"
            copyright = "© Virulenter"
            /* the runtime jpackage bundles; jdk.unsupported for libraries that use Unsafe.
               `./gradlew :composeApp:suggestRuntimeModules` lists what the code needs */
            modules("java.desktop", "java.logging", "jdk.unsupported")

            macOS {
                bundleID = "com.virulenter.desktop"
                dockName = "Virulenter"
                iconFile.set(project.file("icons/app.icns"))
            }
            windows {
                iconFile.set(project.file("icons/app.ico"))
                menuGroup = "Virulenter"
                perUserInstall = true
                shortcut = true
                dirChooser = true
                /* fixed, so a newer installer upgrades an older one in place */
                upgradeUuid = "6F1F4E8A-2C5B-4E37-9C1D-8A7B5E2D3F10"
            }
            linux {
                iconFile.set(project.file("icons/app.png"))
                packageName = "virulenter"
                appCategory = "Utility"
                menuGroup = "Utility"
                shortcut = true
            }
        }

        buildTypes.release.proguard {
            isEnabled.set(false)
        }
    }
}
