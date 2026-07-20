package app.verelle

import android.content.Context
import app.verelle.ffi.LocalRepository
import java.io.File

class LocalRepositoryProvider(private val context: Context) {
    fun open(): LocalRepository {
        val keyManager = LocalDataKeyManager(context)
        val dataKey = keyManager.getOrCreateDataKey()
        return try {
            openWithKey(dataKey)
        } catch (original: Exception) {
            // A process may die after SQLite adopts a recovered key but before
            // the active Keystore-wrapped key is promoted. The independently
            // encrypted recovery journal repairs exactly that window.
            val pending = runCatching { PendingAccountRecoveryStore(context).load() }.getOrNull()
                ?: throw original
            try {
                val recovered = runCatching { openWithKey(pending.recoveredDatasetKey) }
                    .getOrElse { throw original }
                try {
                    keyManager.replaceDataKey(pending.recoveredDatasetKey)
                    recovered
                } catch (error: Exception) {
                    recovered.close()
                    throw error
                }
            } finally {
                pending.recoveredDatasetKey.fill(0)
            }
        } finally {
            dataKey.fill(0)
        }
    }

    private fun openWithKey(dataKey: ByteArray): LocalRepository =
        LocalRepository.open(
            databasePath = File(context.noBackupFilesDir, "verelle.sqlite").absolutePath,
            keyMaterial = dataKey,
            deviceId = LocalDeviceIdentity(context).getOrCreate(),
        )
}
