package app.verelle

import android.content.Context
import app.verelle.ffi.LocalRepository
import java.io.File

class LocalRepositoryProvider(private val context: Context) {
    fun open(): LocalRepository {
        val dataKey = LocalDataKeyManager(context).getOrCreateDataKey()
        return try {
            LocalRepository.open(
                databasePath = File(context.noBackupFilesDir, "verelle.sqlite").absolutePath,
                keyMaterial = dataKey,
                deviceId = LocalDeviceIdentity(context).getOrCreate(),
            )
        } finally {
            dataKey.fill(0)
        }
    }
}
