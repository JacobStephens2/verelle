package app.verelle

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.Instant
import java.util.concurrent.TimeUnit

class VerelleSyncWorker(
    applicationContext: Context,
    parameters: WorkerParameters,
) : CoroutineWorker(applicationContext, parameters) {
    override suspend fun doWork(): Result {
        val enrollment = runCatching { SyncEnrollmentStore(applicationContext).load() }
            .getOrElse { return Result.failure() }
            ?: return Result.success()
        if (enrollment.expiresAtUnixSeconds <= Instant.now().epochSecond) {
            return Result.failure()
        }

        val repository = runCatching { LocalRepositoryProvider(applicationContext).open() }
            .getOrElse { return Result.failure() }
        return try {
            SyncHttpClient().sync(repository, enrollment)
            Result.success()
        } catch (error: SyncHttpException) {
            if (error.retryable) Result.retry() else Result.failure()
        } catch (_: Exception) {
            Result.failure()
        } finally {
            repository.close()
        }
    }

    companion object {
        private const val UNIQUE_WORK_NAME = "verelle-foreground-sync"

        fun enqueue(context: Context) {
            val enrollment = runCatching { SyncEnrollmentStore(context).load() }.getOrNull()
                ?: return
            if (enrollment.expiresAtUnixSeconds <= Instant.now().epochSecond) return
            val request = OneTimeWorkRequestBuilder<VerelleSyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                UNIQUE_WORK_NAME,
                ExistingWorkPolicy.KEEP,
                request,
            )
        }
    }
}
