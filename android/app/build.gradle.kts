import org.gradle.api.tasks.Exec
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val generatedUniFfi = layout.buildDirectory.dir("generated/source/uniffi")
val generatedJniLibs = layout.buildDirectory.dir("generated/jniLibs")

android {
    namespace = "app.verelle"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.verelle"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0-spike"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets {
        named("main") {
            java.srcDir(generatedUniFfi)
            jniLibs.srcDir(generatedJniLibs)
            assets.srcDir(rootProject.file("../fixtures"))
        }
    }

    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_17
    }
}

val buildAndroidFfi by tasks.registering(Exec::class) {
    group = "build"
    description = "Builds Android Rust libraries and generates Kotlin UniFFI bindings."

    inputs.files(
        rootProject.file("../Cargo.toml"),
        rootProject.file("../Cargo.lock"),
        rootProject.file("../scripts/build-android-ffi.sh"),
        rootProject.file("../crates/verelle-core/Cargo.toml"),
        rootProject.file("../crates/verelle-ffi/Cargo.toml"),
        rootProject.file("../crates/verelle-ffi/uniffi.toml"),
        rootProject.fileTree("../crates/verelle-core/src"),
        rootProject.fileTree("../crates/verelle-ffi/src"),
    )
    outputs.dirs(generatedUniFfi, generatedJniLibs)

    commandLine(
        rootProject.file("../scripts/build-android-ffi.sh"),
        generatedUniFfi.get().asFile,
        generatedJniLibs.get().asFile,
    )
}

tasks.named("preBuild").configure {
    dependsOn(buildAndroidFfi)
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.06.00")

    implementation(composeBom)
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("net.java.dev.jna:jna:5.19.1@aar")

    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
}
