package app.verelle

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.verelle.ffi.FfiMonitorReading
import app.verelle.ffi.LocalRepository
import java.io.File
import java.security.KeyStore
import java.util.UUID
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LocalPersistenceInstrumentedTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun rustRepositoryPersistsChartAndEncryptedOutboxAcrossReopen() {
        val database = File(context.noBackupFilesDir, "test-${UUID.randomUUID()}.sqlite")
        val key = ByteArray(32) { 17 }

        LocalRepository.open(database.absolutePath, key, "instrumented-device").use { repository ->
            repository.recordCycleStart("2026-07-01", 1u)
            repository.recordMonitorReading("2026-07-02", FfiMonitorReading.LOW)
            assertEquals(2uL, repository.pendingOutboxCount())
        }

        LocalRepository.open(database.absolutePath, key, "instrumented-device").use { repository ->
            val chart = repository.charts().single()
            assertEquals("2026-07-01", chart.startDate)
            assertEquals("Monitor: Low", chart.days[1].entries.single().label)
            assertEquals(2uL, repository.pendingOutboxCount())
        }
    }

    @Test
    fun androidKeystoreWrappedDataKeySurvivesManagerRecreation() {
        val suffix = UUID.randomUUID().toString()
        val alias = "verelle-test-$suffix"
        val preferences = "verelle-test-$suffix"

        try {
            val first = LocalDataKeyManager(context, alias, preferences).getOrCreateDataKey()
            val second = LocalDataKeyManager(context, alias, preferences).getOrCreateDataKey()

            assertEquals(32, first.size)
            assertArrayEquals(first, second)
        } finally {
            context.getSharedPreferences(preferences, Context.MODE_PRIVATE).edit().clear().commit()
            KeyStore.getInstance("AndroidKeyStore").apply {
                load(null)
                if (containsAlias(alias)) {
                    deleteEntry(alias)
                }
            }
        }
    }

    @Test
    fun recoveredDataKeyAtomicallyReplacesTheFreshInstallKey() {
        val suffix = UUID.randomUUID().toString()
        val alias = "verelle-test-$suffix"
        val preferences = "verelle-test-$suffix"
        val manager = LocalDataKeyManager(context, alias, preferences)
        val original = manager.getOrCreateDataKey()
        val recovered = ByteArray(32) { 29 }

        try {
            manager.replaceDataKey(recovered)
            assertArrayEquals(
                recovered,
                LocalDataKeyManager(context, alias, preferences).getOrCreateDataKey(),
            )
            assertThrows(IllegalArgumentException::class.java) {
                manager.replaceDataKey(ByteArray(31))
            }
            assertArrayEquals(
                recovered,
                LocalDataKeyManager(context, alias, preferences).getOrCreateDataKey(),
            )
            assertEquals(false, original.contentEquals(recovered))
        } finally {
            original.fill(0)
            recovered.fill(0)
            context.getSharedPreferences(preferences, Context.MODE_PRIVATE).edit().clear().commit()
            androidKeyStore().apply {
                if (containsAlias(alias)) {
                    deleteEntry(alias)
                }
            }
        }
    }

    @Test
    fun deviceIdentityIsStableAcrossManagerRecreation() {
        val preferences = "verelle-device-test-${UUID.randomUUID()}"
        try {
            val first = LocalDeviceIdentity(context, preferences).getOrCreate()
            val second = LocalDeviceIdentity(context, preferences).getOrCreate()

            assertEquals(first, second)
        } finally {
            context.getSharedPreferences(preferences, Context.MODE_PRIVATE).edit().clear().commit()
        }
    }

    @Test
    fun syncEnrollmentIsKeystoreProtectedAndSurvivesStoreRecreation() {
        val suffix = UUID.randomUUID().toString()
        val alias = "verelle-sync-test-$suffix"
        val preferences = "verelle-sync-test-$suffix"
        val enrollment = SyncEnrollment(
            datasetId = UUID.randomUUID().toString(),
            bearerToken = "a".repeat(43),
            expiresAtUnixSeconds = 2_000_000_000,
        )

        try {
            SyncEnrollmentStore(context, alias, preferences).save(enrollment)
            assertEquals(enrollment, SyncEnrollmentStore(context, alias, preferences).load())
            val rawPreferences = context.getSharedPreferences(preferences, Context.MODE_PRIVATE)
            assertEquals(false, rawPreferences.all.values.any { it.toString().contains(enrollment.bearerToken) })
        } finally {
            context.getSharedPreferences(preferences, Context.MODE_PRIVATE).edit().clear().commit()
            KeyStore.getInstance("AndroidKeyStore").apply {
                load(null)
                if (containsAlias(alias)) {
                    deleteEntry(alias)
                }
            }
        }
    }

    @Test
    fun syncEnrollmentRejectsInvalidValuesBeforePersistingAnything() {
        val suffix = UUID.randomUUID().toString()
        val alias = "verelle-sync-test-$suffix"
        val preferences = "verelle-sync-test-$suffix"
        val store = SyncEnrollmentStore(context, alias, preferences)

        try {
            assertThrows(IllegalArgumentException::class.java) {
                store.save(SyncEnrollment("1-1-1-1-1", "a".repeat(43), 2_000_000_000))
            }
            assertThrows(IllegalArgumentException::class.java) {
                store.save(SyncEnrollment(UUID.randomUUID().toString(), "not a bearer token", 2_000_000_000))
            }
            assertThrows(IllegalArgumentException::class.java) {
                store.save(SyncEnrollment(UUID.randomUUID().toString(), "a".repeat(43), 0))
            }

            assertTrue(context.getSharedPreferences(preferences, Context.MODE_PRIVATE).all.isEmpty())
            assertEquals(false, androidKeyStore().containsAlias(alias))
        } finally {
            clearEnrollmentTestState(alias, preferences)
        }
    }

    @Test
    fun syncEnrollmentTamperingFailsClosed() {
        val suffix = UUID.randomUUID().toString()
        val alias = "verelle-sync-test-$suffix"
        val preferences = "verelle-sync-test-$suffix"
        val store = SyncEnrollmentStore(context, alias, preferences)
        val enrollment = SyncEnrollment(
            datasetId = UUID.randomUUID().toString(),
            bearerToken = "b".repeat(43),
            expiresAtUnixSeconds = 2_000_000_000,
        )

        try {
            store.save(enrollment)
            val rawPreferences = context.getSharedPreferences(preferences, Context.MODE_PRIVATE)
            val ciphertext = android.util.Base64.decode(
                rawPreferences.getString("ciphertext", null),
                android.util.Base64.NO_WRAP,
            )
            ciphertext[0] = (ciphertext[0].toInt() xor 1).toByte()
            assertTrue(
                rawPreferences.edit().putString(
                    "ciphertext",
                    android.util.Base64.encodeToString(ciphertext, android.util.Base64.NO_WRAP),
                ).commit(),
            )

            assertThrows(Exception::class.java) { SyncEnrollmentStore(context, alias, preferences).load() }
        } finally {
            clearEnrollmentTestState(alias, preferences)
        }
    }

    @Test
    fun clearingSyncEnrollmentRemovesCiphertextAndWrappingKey() {
        val suffix = UUID.randomUUID().toString()
        val alias = "verelle-sync-test-$suffix"
        val preferences = "verelle-sync-test-$suffix"
        val store = SyncEnrollmentStore(context, alias, preferences)

        try {
            store.save(
                SyncEnrollment(
                    datasetId = UUID.randomUUID().toString(),
                    bearerToken = "c".repeat(43),
                    expiresAtUnixSeconds = 2_000_000_000,
                ),
            )
            assertTrue(androidKeyStore().containsAlias(alias))

            store.clear()

            assertEquals(null, store.load())
            assertTrue(context.getSharedPreferences(preferences, Context.MODE_PRIVATE).all.isEmpty())
            assertEquals(false, androidKeyStore().containsAlias(alias))
        } finally {
            clearEnrollmentTestState(alias, preferences)
        }
    }

    @Test
    fun pendingRecoveryCodeSurvivesRecreationUntilAcknowledgement() {
        val suffix = UUID.randomUUID().toString()
        val alias = "verelle-recovery-code-test-$suffix"
        val preferences = "verelle-recovery-code-test-$suffix"
        val code = "a".repeat(43)

        try {
            PendingRecoveryCodeStore(context, alias, preferences).save(code)
            val rawPreferences = context.getSharedPreferences(preferences, Context.MODE_PRIVATE)
            assertEquals(false, rawPreferences.all.values.any { it.toString().contains(code) })
            assertEquals(
                code,
                PendingRecoveryCodeStore(context, alias, preferences).load(),
            )

            PendingRecoveryCodeStore(context, alias, preferences).clearAfterAcknowledgement()

            assertEquals(null, PendingRecoveryCodeStore(context, alias, preferences).load())
            assertTrue(rawPreferences.all.isEmpty())
            assertEquals(false, androidKeyStore().containsAlias(alias))
        } finally {
            context.getSharedPreferences(preferences, Context.MODE_PRIVATE).edit().clear().commit()
            androidKeyStore().apply {
                if (containsAlias(alias)) deleteEntry(alias)
            }
        }
    }

    @Test
    fun pendingRecoveryJournalProtectsAndRetainsTheReplacementCodeAndKey() {
        val suffix = UUID.randomUUID().toString()
        val alias = "verelle-recovery-test-$suffix"
        val preferences = "verelle-recovery-test-$suffix"
        val datasetId = UUID.randomUUID().toString()
        val deviceId = UUID.randomUUID().toString()
        val recoveredKey = ByteArray(32) { 41 }
        val recoveryCode = "r".repeat(43)
        val finishJson = org.json.JSONObject()
            .put("dataset_id", datasetId)
            .put("device_id", deviceId)
            .put("flow_id", UUID.randomUUID().toString())
            .toString()
        val pending = PendingAccountRecovery(
            finishRequestJson = finishJson,
            enrollment = SyncEnrollment(
                datasetId = datasetId,
                bearerToken = "",
                expiresAtUnixSeconds = 0,
                email = "founder@example.com",
                deviceId = deviceId,
                serverPublicKey = "s".repeat(43),
            ),
            recoveryCode = recoveryCode,
            recoveredDatasetKey = recoveredKey,
        )

        try {
            PendingAccountRecoveryStore(context, alias, preferences).save(pending)
            val loaded = PendingAccountRecoveryStore(context, alias, preferences).load()!!
            assertEquals(pending.finishRequestJson, loaded.finishRequestJson)
            assertEquals(pending.enrollment, loaded.enrollment)
            assertEquals(recoveryCode, loaded.recoveryCode)
            assertArrayEquals(recoveredKey, loaded.recoveredDatasetKey)
            loaded.recoveredDatasetKey.fill(0)

            val raw = context.getSharedPreferences(preferences, Context.MODE_PRIVATE)
            assertEquals(false, raw.all.values.any { it.toString().contains(recoveryCode) })
            assertEquals(false, raw.all.values.any { it.toString().contains(datasetId) })

            PendingAccountRecoveryStore(context, alias, preferences).clearAfterAcknowledgement()
            assertEquals(null, PendingAccountRecoveryStore(context, alias, preferences).load())
            assertEquals(false, androidKeyStore().containsAlias(alias))
        } finally {
            recoveredKey.fill(0)
            context.getSharedPreferences(preferences, Context.MODE_PRIVATE).edit().clear().commit()
            androidKeyStore().apply {
                if (containsAlias(alias)) {
                    deleteEntry(alias)
                }
            }
        }
    }

    @Test
    fun recoveryPreflightLeavesNonPristineRepositoryAndKeyUntouched() {
        val suffix = UUID.randomUUID().toString()
        val database = File(context.noBackupFilesDir, "test-$suffix.sqlite")
        val localAlias = "verelle-local-test-$suffix"
        val localPreferences = "verelle-local-test-$suffix"
        val enrollmentAlias = "verelle-enrollment-test-$suffix"
        val enrollmentPreferences = "verelle-enrollment-test-$suffix"
        val recoveryAlias = "verelle-recovery-test-$suffix"
        val recoveryPreferences = "verelle-recovery-test-$suffix"
        val keyManager = LocalDataKeyManager(context, localAlias, localPreferences)
        val originalKey = keyManager.getOrCreateDataKey()
        val pendingStore = PendingAccountRecoveryStore(
            context,
            recoveryAlias,
            recoveryPreferences,
        )

        try {
            LocalRepository.open(
                database.absolutePath,
                originalKey,
                UUID.randomUUID().toString(),
            ).use { repository ->
                val originalDatasetId = repository.datasetId()
                repository.recordCycleStart("2026-07-20", 1u)
                assertThrows(IllegalArgumentException::class.java) {
                    AccountEnrollmentClient(UUID.randomUUID().toString()).recover(
                        repository = repository,
                        localDataKeyManager = keyManager,
                        enrollmentStore = SyncEnrollmentStore(
                            context,
                            enrollmentAlias,
                            enrollmentPreferences,
                        ),
                        pendingRecoveryStore = pendingStore,
                        email = "founder@example.com",
                        recoveryCode = "r".repeat(43),
                        newPassword = "correct horse battery staple",
                    )
                }
                assertEquals(originalDatasetId, repository.datasetId())
                assertEquals(1uL, repository.pendingOutboxCount())
            }
            assertArrayEquals(
                originalKey,
                LocalDataKeyManager(context, localAlias, localPreferences).getOrCreateDataKey(),
            )
            assertEquals(false, pendingStore.hasPending())
        } finally {
            originalKey.fill(0)
            database.delete()
            listOf(localPreferences, enrollmentPreferences, recoveryPreferences).forEach {
                context.getSharedPreferences(it, Context.MODE_PRIVATE).edit().clear().commit()
            }
            androidKeyStore().apply {
                listOf(localAlias, enrollmentAlias, recoveryAlias).forEach { alias ->
                    if (containsAlias(alias)) deleteEntry(alias)
                }
            }
        }
    }

    private fun androidKeyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply {
        load(null)
    }

    private fun clearEnrollmentTestState(alias: String, preferences: String) {
        context.getSharedPreferences(preferences, Context.MODE_PRIVATE).edit().clear().commit()
        androidKeyStore().apply {
            if (containsAlias(alias)) {
                deleteEntry(alias)
            }
        }
    }
}
