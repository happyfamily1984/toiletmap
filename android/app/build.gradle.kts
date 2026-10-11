plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 빌드 시 -Ptoiletmap.webUrl=https://... 로 바꿀 수 있음
val webUrl: String = (findProperty("toiletmap.webUrl") as String?)
    ?.takeIf { it.isNotBlank() }
    ?: "https://toiletmap.example.com/"

// CI 에서 -Ptoiletmap.versionCode=<빌드번호> 로 올려서 새 APK 가 업데이트로 인식되게 함
val appVersionCode: Int = (findProperty("toiletmap.versionCode") as String?)?.toIntOrNull() ?: 1

android {
    namespace = "com.salddeul.toiletmap"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.salddeul.toiletmap"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = "1.0.$appVersionCode"
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
