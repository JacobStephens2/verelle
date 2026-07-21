import org.gradle.api.tasks.Exec

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.verelle.core"
    compileSdk = 36
    ndkVersion = "28.2.13676358"

    defaultConfig {
        minSdk = 26
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    sourceSets["main"].apply {
        java.srcDir(layout.buildDirectory.dir("generated/source/uniffi/kotlin"))
        jniLibs.srcDir(layout.buildDirectory.dir("rust-jniLibs"))
    }
    sourceSets["androidTest"].assets.srcDir(
        rootProject.projectDir.parentFile.parentFile.resolve("fixtures"),
    )
}

dependencies {
    implementation("androidx.annotation:annotation:1.9.1")
    implementation("net.java.dev.jna:jna:5.19.1@aar")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
}

val repoRoot = rootProject.projectDir.parentFile.parentFile
val rustJniLibsDir = layout.buildDirectory.dir("rust-jniLibs")
val uniffiKotlinOut = layout.buildDirectory.dir("generated/source/uniffi/kotlin")

val buildRustAndroid by tasks.registering(Exec::class) {
    description = "Cross-compile verelle-ffi and generate Kotlin UniFFI bindings."
    group = "rust"

    workingDir = repoRoot
    commandLine(
        repoRoot.resolve("scripts/build-android-bindings.sh").absolutePath,
        rustJniLibsDir.get().asFile.absolutePath,
        uniffiKotlinOut.get().asFile.absolutePath,
    )
    environment(
        "ANDROID_SDK_ROOT",
        System.getenv("ANDROID_SDK_ROOT")
            ?: System.getenv("ANDROID_HOME")
            ?: "${System.getProperty("user.home")}/Library/Android/sdk",
    )

    inputs.files(
        fileTree(repoRoot.resolve("crates/verelle-core/src")),
        fileTree(repoRoot.resolve("crates/verelle-ffi/src")),
        repoRoot.resolve("crates/verelle-core/Cargo.toml"),
        repoRoot.resolve("crates/verelle-ffi/Cargo.toml"),
        repoRoot.resolve("crates/verelle-ffi/uniffi.toml"),
        repoRoot.resolve("Cargo.toml"),
        repoRoot.resolve("Cargo.lock"),
        repoRoot.resolve("scripts/build-android-bindings.sh"),
    )
    outputs.dir(rustJniLibsDir)
    outputs.dir(uniffiKotlinOut)
}

tasks.named("preBuild") { dependsOn(buildRustAndroid) }
