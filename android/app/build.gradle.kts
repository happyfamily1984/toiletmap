plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 빌드 시 -Ptoiletmap.webUrl=https://... 로 바꿀 수 있음
val webUrl: String = (findProperty("toiletmap.webUrl") as String?)
    ?.takeIf { it.isNotBlank() }
    ?: "https://toiletmap.example.com/"

android {
    namespace = "com.salddeul.toiletmap"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.salddeul.toiletmap"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "WEB_URL", "\"$webUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // 서명 설정 전에는 디버그 키로 서명 (스토어 배포 시 교체)
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
