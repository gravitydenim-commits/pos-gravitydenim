plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.gravity.usbtest"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.gravity.usbtest"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    jvmToolchain(17)
}

// No extra dependencies needed — only Android SDK (USB classes are in android.jar)
