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
}
