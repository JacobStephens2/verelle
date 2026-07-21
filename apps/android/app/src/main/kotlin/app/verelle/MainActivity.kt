package app.verelle

import android.content.Intent
import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts

class MainActivity : ComponentActivity() {
    private var repository: LocalChartRepository? = null
    private lateinit var reminderScheduler: ReminderScheduler
    private var permissionResult: ((Boolean) -> Unit)? = null
    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        permissionResult?.invoke(granted)
        permissionResult = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val localRepository = LocalChartRepository(applicationContext)
        repository = localRepository
        reminderScheduler = ReminderScheduler(applicationContext)
        setContent {
            VerelleTheme {
                VerelleApp(
                    repository = localRepository,
                    reminderScheduler = reminderScheduler,
                    requestNotificationPermission = ::requestNotificationPermission,
                    shareExport = ::shareExport,
                )
            }
        }
    }

    override fun onDestroy() {
        repository?.close()
        repository = null
        super.onDestroy()
    }

    private fun shareExport(title: String, contents: String, mimeType: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_TEXT, contents)
        }
        startActivity(Intent.createChooser(intent, title))
    }

    private fun requestNotificationPermission(onResult: (Boolean) -> Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissionResult = onResult
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            onResult(true)
        }
    }
}
