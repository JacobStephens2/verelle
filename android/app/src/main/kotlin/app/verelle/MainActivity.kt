package app.verelle

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.verelle.ffi.FfiChart
import app.verelle.ffi.FfiChartDay
import app.verelle.ffi.FfiMonitorReading
import app.verelle.ffi.LocalRepository
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private var localRepository: LocalRepository? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val repository = runCatching { LocalRepositoryProvider(this).open() }
        localRepository = repository.getOrNull()
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    repository.fold(
                        onSuccess = { RecordAndChartScreen(it) },
                        onFailure = {
                            RepositoryFailure(it.message ?: "Local storage could not be opened")
                        },
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        localRepository?.close()
        localRepository = null
        super.onDestroy()
    }

    override fun onStart() {
        super.onStart()
        VerelleSyncWorker.enqueue(this)
    }
}

@Composable
private fun RecordAndChartScreen(repository: LocalRepository) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val enrollmentStore = remember { SyncEnrollmentStore(context) }
    val initialEnrollment = remember {
        runCatching { enrollmentStore.load()?.let(EnrollmentSummary::from) }
    }
    var enrollment by remember {
        mutableStateOf(initialEnrollment.getOrNull())
    }
    var enrollmentUnreadable by remember {
        mutableStateOf(initialEnrollment.isFailure)
    }
    var accountEmail by remember { mutableStateOf(enrollment?.email ?: "") }
    var accountPassword by remember { mutableStateOf("") }
    var healthDataConsent by remember { mutableStateOf(false) }
    var accountRequestInFlight by remember { mutableStateOf(false) }
    var recoveryCode by remember { mutableStateOf<String?>(null) }
    var charts by remember(repository) {
        mutableStateOf(repository.charts())
    }
    var pendingCount by remember(repository) {
        mutableStateOf(repository.pendingOutboxCount())
    }
    var date by remember { mutableStateOf(LocalDate.now().toString()) }
    var methodCycleNumber by remember { mutableStateOf("1") }
    var reading by remember { mutableStateOf(FfiMonitorReading.LOW) }
    var message by remember {
        mutableStateOf(
            initialEnrollment.exceptionOrNull()?.let {
                "Stored enrollment could not be opened; remove it before enrolling again"
            },
        )
    }

    fun reload() {
        charts = repository.charts()
        pendingCount = repository.pendingOutboxCount()
        VerelleSyncWorker.enqueue(context)
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
            Column(modifier = Modifier.padding(20.dp)) {
                Text("Verelle", style = MaterialTheme.typography.headlineMedium)
                Text("Account and encrypted sync", style = MaterialTheme.typography.titleMedium)
                if (enrollment == null && !enrollmentUnreadable) {
                    OutlinedTextField(
                        value = accountEmail,
                        onValueChange = { accountEmail = it },
                        label = { Text("Email") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        enabled = !accountRequestInFlight,
                        modifier = Modifier.fillMaxWidth().testTag("account-email"),
                    )
                    Row {
                        Checkbox(
                            checked = healthDataConsent,
                            onCheckedChange = { healthDataConsent = it },
                            enabled = !accountRequestInFlight,
                            modifier = Modifier.testTag("health-data-consent"),
                        )
                        Text(
                            "I consent to Verelle processing my encrypted health data under policy 2026-07-19.",
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                } else {
                    val enrolled = enrollment!!
                    Text(
                        if (enrolled.email.isBlank()) {
                            "This installation has a provisioned sync credential."
                        } else {
                            "Enrolled as ${enrolled.email}"
                        },
                        modifier = Modifier.testTag("enrollment-status"),
                    )
                    Text(
                        "Encrypted dataset ${enrolled.datasetId}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    if (enrolled.email.isNotBlank()) {
                        Text(
                            if (enrolled.expiresAtUnixSeconds > Instant.now().epochSecond) {
                                "Session active until ${enrolled.expiresAtUnixSeconds}"
                            } else {
                                "Sign in to start or renew encrypted sync"
                            },
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
                if ((enrollment == null && !enrollmentUnreadable) || enrollment?.email?.isNotBlank() == true) {
                    OutlinedTextField(
                        value = accountPassword,
                        onValueChange = { accountPassword = it },
                        label = { Text("Password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        enabled = !accountRequestInFlight,
                        modifier = Modifier.fillMaxWidth().testTag("account-password"),
                    )
                }
                if (enrollment == null && !enrollmentUnreadable) {
                    Button(
                        onClick = {
                            val submittedEmail = accountEmail
                            val submittedPassword = accountPassword
                            accountPassword = ""
                            recoveryCode = null
                            message = null
                            accountRequestInFlight = true
                            coroutineScope.launch {
                                try {
                                    require(healthDataConsent) {
                                        "Confirm health-data processing consent before creating an account"
                                    }
                                    val result = withContext(Dispatchers.IO) {
                                        AccountEnrollmentClient(
                                            LocalDeviceIdentity(context).getOrCreate(),
                                        ).register(repository, submittedEmail, submittedPassword)
                                    }
                                    val persistenceError = runCatching {
                                        withContext(Dispatchers.IO) {
                                            enrollmentStore.save(result.enrollment)
                                        }
                                    }.exceptionOrNull()
                                    // Do not display the only recovery secret until the
                                    // enrollment metadata has either been durably stored or
                                    // explicitly failed. This keeps acknowledgement behind
                                    // the persistence attempt.
                                    recoveryCode = result.recoveryCode
                                    if (persistenceError == null) {
                                        enrollment = EnrollmentSummary.from(result.enrollment)
                                        enrollmentUnreadable = false
                                        accountEmail = result.enrollment.email
                                        healthDataConsent = false
                                        VerelleSyncWorker.enqueue(context)
                                    }
                                    message = when {
                                        persistenceError != null ->
                                            "Account created, but this device could not save its enrollment. Record the recovery code now."
                                        result.loginError != null ->
                                            "Account created and recovery enrollment saved. Sign in to start sync."
                                        else -> "Account created and encrypted sync enrolled"
                                    }
                                } catch (error: CancellationException) {
                                    throw error
                                } catch (error: Exception) {
                                    message = error.message ?: "Account could not be created"
                                } finally {
                                    accountRequestInFlight = false
                                }
                            }
                        },
                        enabled = !accountRequestInFlight,
                        modifier = Modifier.testTag("register-account"),
                    ) {
                        Text(if (accountRequestInFlight) "Creating account…" else "Create account")
                    }
                } else if (enrollment?.email?.isNotBlank() == true) {
                    Button(
                        onClick = {
                            val submittedPassword = accountPassword
                            val enrolled = checkNotNull(enrollment)
                            accountPassword = ""
                            message = null
                            accountRequestInFlight = true
                            coroutineScope.launch {
                                message = try {
                                    val saved = withContext(Dispatchers.IO) {
                                        val loggedIn = AccountEnrollmentClient(
                                            LocalDeviceIdentity(context).getOrCreate(),
                                        ).login(enrolled.forLogin(), submittedPassword)
                                        enrollmentStore.save(loggedIn)
                                        loggedIn
                                    }
                                    enrollment = EnrollmentSummary.from(saved)
                                    VerelleSyncWorker.enqueue(context)
                                    "Signed in; encrypted sync is ready"
                                } catch (error: CancellationException) {
                                    throw error
                                } catch (error: Exception) {
                                    error.message ?: "Sign-in failed"
                                } finally {
                                    accountRequestInFlight = false
                                }
                            }
                        },
                        enabled = !accountRequestInFlight,
                        modifier = Modifier.testTag("login-account"),
                    ) {
                        Text(if (accountRequestInFlight) "Signing in…" else "Sign in")
                    }
                }
                recoveryCode?.let { code ->
                    Text(
                        "Recovery code — shown once. Store it offline before leaving this screen.",
                        color = MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.SemiBold,
                    )
                    SelectionContainer {
                        Text(code, modifier = Modifier.testTag("recovery-code"))
                    }
                    Button(
                        onClick = { recoveryCode = null },
                        modifier = Modifier.testTag("acknowledge-recovery-code"),
                    ) {
                        Text("I stored the recovery code")
                    }
                }
                if (enrollmentUnreadable) {
                    Button(
                        onClick = {
                            message = runCatching {
                                VerelleSyncWorker.cancel(context)
                                enrollmentStore.clear()
                                enrollmentUnreadable = false
                                "Unreadable local enrollment reset"
                            }.fold({ it }, { error -> error.message ?: "Enrollment could not be reset" })
                        },
                        modifier = Modifier.testTag("reset-enrollment"),
                    ) {
                        Text("Reset unreadable enrollment")
                    }
                }
                Text(
                    "Founder testing only — store the recovery code offline before recording health data",
                    color = MaterialTheme.colorScheme.error,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.testTag("safety-notice"),
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = date,
                    onValueChange = { date = it },
                    label = { Text("Date (YYYY-MM-DD)") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("record-date"),
                )
                OutlinedTextField(
                    value = methodCycleNumber,
                    onValueChange = { methodCycleNumber = it.filter(Char::isDigit) },
                    label = { Text("Method cycle number") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("method-cycle-number"),
                )
                Button(
                    onClick = {
                        message = runCatching {
                            val cycleNumber = methodCycleNumber.toUIntOrNull()
                                ?: error("Enter a method cycle number")
                            repository.recordCycleStart(date, cycleNumber)
                            reload()
                            "Cycle start saved"
                        }.fold(
                            onSuccess = { it },
                            onFailure = { it.message ?: "Cycle start could not be saved" },
                        )
                    },
                    modifier = Modifier.testTag("save-cycle-start"),
                ) {
                    Text("Start cycle")
                }
                Text("Monitor reading", style = MaterialTheme.typography.titleMedium)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                ) {
                    FfiMonitorReading.entries.forEach { option ->
                        FilterChip(
                            selected = reading == option,
                            onClick = { reading = option },
                            label = { Text(option.displayName()) },
                            modifier = Modifier.testTag("reading-${option.name.lowercase()}"),
                        )
                    }
                }
                Button(
                    onClick = {
                        message = runCatching {
                            repository.recordMonitorReading(date, reading)
                            reload()
                            "Monitor reading saved"
                        }.fold(
                            onSuccess = { it },
                            onFailure = { it.message ?: "Monitor reading could not be saved" },
                        )
                    },
                    modifier = Modifier.testTag("save-monitor-reading"),
                ) {
                    Text("Save reading")
                }
                message?.let {
                    Text(it, modifier = Modifier.testTag("save-message"))
                }
                Text(
                    "$pendingCount encrypted local operations waiting for future sync",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.testTag("pending-operations"),
                )
            }
            HorizontalDivider()
        }

        val chart = charts.lastOrNull()
        if (chart == null) {
            item {
                Text(
                    "Start a synthetic cycle to create the local chart.",
                    modifier = Modifier
                        .padding(20.dp)
                        .testTag("empty-chart"),
                )
            }
        } else {
            item { ChartHeader(chart) }
            items(chart.days, key = { it.date }) { day ->
                ChartDay(day)
                HorizontalDivider()
            }
        }
    }
}

private data class EnrollmentSummary(
    val datasetId: String,
    val expiresAtUnixSeconds: Long,
    val email: String,
    val deviceId: String,
    val serverPublicKey: String,
) {
    fun forLogin(): SyncEnrollment = SyncEnrollment(
        datasetId = datasetId,
        bearerToken = "",
        expiresAtUnixSeconds = 0,
        email = email,
        deviceId = deviceId,
        serverPublicKey = serverPublicKey,
    )

    companion object {
        fun from(enrollment: SyncEnrollment): EnrollmentSummary = EnrollmentSummary(
            datasetId = enrollment.datasetId,
            expiresAtUnixSeconds = enrollment.expiresAtUnixSeconds,
            email = enrollment.email,
            deviceId = enrollment.deviceId,
            serverPublicKey = enrollment.serverPublicKey,
        )
    }
}

@Composable
private fun ChartHeader(chart: FfiChart) {
    Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp)) {
        Text(
            "Cycle ${chart.methodCycleNumber} · ${chart.startDate}",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.testTag("chart-header"),
        )
        Text(
            "Recorded observations and mechanical annotations only",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun ChartDay(day: FfiChartDay) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp)
            .testTag("chart-day-${day.date}"),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("CD ${day.cycleDay}", fontWeight = FontWeight.SemiBold)
            Text(day.date, style = MaterialTheme.typography.bodySmall)
        }
        Column(modifier = Modifier.weight(2f)) {
            Text(day.entries.map { it.label }.ifEmpty { listOf("No entry") }.joinToString(" · "))
            if (day.annotations.isNotEmpty()) {
                Text(
                    day.annotations.joinToString(" · "),
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun RepositoryFailure(message: String) {
    Column(modifier = Modifier.padding(20.dp)) {
        Text("Local data unavailable", style = MaterialTheme.typography.headlineSmall)
        Text(message)
        Text("Do not record real data. Reinstall this test build to reset it.")
    }
}

private fun FfiMonitorReading.displayName(): String =
    name.lowercase().replaceFirstChar(Char::uppercase)
