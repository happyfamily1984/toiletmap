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

// 플레이스토어 업로드용 서명 키 (CI 의 GitHub Secrets 에서 환경변수로 받음). 없으면 디버그 키로 서명
val uploadKeystore: String? = System.getenv("ANDROID_KEYSTORE_FILE")?.takeIf { file(it).exists() }

android {
    namespace = "com.salddeul.toiletmap"
    compileSdk = 36

    defaultConfig {
        // 플레이콘솔에 등록한 패키지 이름 (한 번 출시하면 바꿀 수 없음)
        applicationId = "com.anyang_toilet.myapp"
        minSdk = 26
        targetSdk = 36
        versionCode = appVersionCode
        versionName = "1.0.$appVersionCode"
        buildConfigField("String", "WEB_URL", "\"$webUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (uploadKeystore != null) {
            create("upload") {
                storeFile = file(uploadKeystore)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (uploadKeystore != null) {
                signingConfigs.getByName("upload")
            } else {
                signingConfigs.getByName("debug")
            }
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
