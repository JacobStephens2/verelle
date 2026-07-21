package app.verelle

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.Role
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private var localRepository: LocalRepository? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            var repository by remember { mutableStateOf<Result<LocalRepository>?>(null) }
            LaunchedEffect(Unit) {
                val opened = withContext(Dispatchers.IO) {
                    runCatching { LocalRepositoryProvider(this@MainActivity).open() }
                }
                localRepository = opened.getOrNull()
                repository = opened
            }
            VerelleTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val current = repository
                    if (current == null) {
                        RepositoryLoading()
                    } else {
                        current.fold(
                            onSuccess = { RecordAndChartScreen(it) },
                            onFailure = {
                                RepositoryFailure(it.message ?: "Local storage could not be opened")
                            },
                        )
                    }
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
    val localDataKeyManager = remember { LocalDataKeyManager(context) }
    val pendingRecoveryStore = remember { PendingAccountRecoveryStore(context) }
    val pendingCoupleStore = remember { PendingCoupleAcceptanceStore(context) }
    val pendingRedactionStore = remember { PendingRedactionStore(context) }
    val pendingRecoveryCodeStore = remember { PendingRecoveryCodeStore(context) }
    val syncFreshnessStore = remember { SyncFreshnessStore(context) }
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
    var accountPasswordConfirmation by remember { mutableStateOf("") }
    var enteredRecoveryCode by remember { mutableStateOf("") }
    var healthDataConsent by remember { mutableStateOf(false) }
    var accountRequestInFlight by remember { mutableStateOf(false) }
    var recoveryCode by remember { mutableStateOf<String?>(null) }
    var coupleInviteCode by remember { mutableStateOf<String?>(null) }
    var enteredCoupleInviteCode by remember { mutableStateOf("") }
    var accountEntryMode by remember { mutableStateOf(AccountEntryMode.CREATE) }
    var charts by remember(repository) { mutableStateOf(emptyList<FfiChart>()) }
    var pendingCount by remember(repository) { mutableStateOf(0uL) }
    var lastSyncedAt by remember { mutableStateOf(syncFreshnessStore.lastSuccessUnixMillis()) }
    var foregroundSyncInFlight by remember { mutableStateOf(false) }
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

    suspend fun reload(enqueueSync: Boolean = true) {
        val snapshot = withContext(Dispatchers.IO) {
            repository.charts() to repository.pendingOutboxCount()
        }
        charts = snapshot.first
        pendingCount = snapshot.second
        if (enqueueSync) VerelleSyncWorker.enqueue(context)
        lastSyncedAt = syncFreshnessStore.lastSuccessUnixMillis()
    }

    suspend fun foregroundSync(showResult: Boolean) {
        if (foregroundSyncInFlight) return
        val saved = withContext(Dispatchers.IO) { enrollmentStore.load() } ?: return
        if (saved.expiresAtUnixSeconds <= Instant.now().epochSecond) return
        foregroundSyncInFlight = true
        try {
            val result = withContext(Dispatchers.IO) {
                SyncHttpClient().sync(repository, saved)
            }
            syncFreshnessStore.recordSuccess()
            reload(enqueueSync = false)
            if (showResult) {
                message = "Encrypted sync complete · ${result.pushed} sent · ${result.pulled} received"
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if (showResult) message = error.message ?: "Encrypted sync failed"
        } finally {
            foregroundSyncInFlight = false
        }
    }

    LaunchedEffect(repository) {
        runCatching { reload() }.onFailure { error ->
            message = error.message ?: "The local chart could not be loaded"
        }
        val hasPendingRecovery = runCatching {
            withContext(Dispatchers.IO) { pendingRecoveryStore.hasPending() }
        }.getOrElse { error ->
            message = error.message ?: "The pending recovery journal could not be opened"
            false
        }
        if (hasPendingRecovery) {
            accountRequestInFlight = true
            try {
                val resumed = withContext(Dispatchers.IO) {
                    AccountEnrollmentClient(
                        LocalDeviceIdentity(context).getOrCreate(),
                    ).resumePendingRecovery(
                        repository = repository,
                        localDataKeyManager = localDataKeyManager,
                        enrollmentStore = enrollmentStore,
                        pendingRecoveryStore = pendingRecoveryStore,
                    )
                }
                if (resumed != null) {
                    enrollment = EnrollmentSummary.from(resumed.enrollment)
                    enrollmentUnreadable = false
                    accountEmail = resumed.enrollment.email
                    recoveryCode = resumed.recoveryCode
                    message = "Account recovery resumed. Store the replacement recovery code, then sign in with the new password."
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                message = error.message ?: "Account recovery could not be resumed"
            } finally {
                accountRequestInFlight = false
            }
        } else {
            runCatching {
                withContext(Dispatchers.IO) { pendingRecoveryCodeStore.load() }
            }.fold(
                onSuccess = { pendingCode ->
                    if (pendingCode != null) recoveryCode = pendingCode
                },
                onFailure = { error ->
                    message = error.message ?: "The pending recovery code could not be opened"
                },
            )
        }
        runCatching {
            withContext(Dispatchers.IO) {
                CoupleEnrollmentClient().resume(
                    repository,
                    localDataKeyManager,
                    enrollmentStore,
                    pendingCoupleStore,
                )
            }
        }.fold(
            onSuccess = { resumed ->
                if (resumed != null) {
                    enrollment = EnrollmentSummary.from(resumed)
                    message = "Couple invite acceptance resumed; the shared encrypted chart is ready"
                    reload()
                }
            },
            onFailure = { error ->
                message = error.message ?: "Couple invite acceptance could not be resumed"
            },
        )
        runCatching {
            withContext(Dispatchers.IO) {
                enrollmentStore.load()?.let { saved ->
                    RedactionClient().resume(repository, saved, pendingRedactionStore)
                } ?: false
            }
        }.fold(
            onSuccess = { finished ->
                if (finished) {
                    message = "Pending server ciphertext deletion completed"
                    reload()
                }
            },
            onFailure = { error ->
                message = error.message ?: "Pending server deletion could not be completed"
            },
        )
    }

    LaunchedEffect(enrollment?.expiresAtUnixSeconds) {
        while (true) {
            delay(5_000)
            foregroundSync(showResult = false)
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFFF9F6EE), Color(0xFFF3F6F2), Color(0xFFEDF3F1)),
                ),
            )
            .testTag("verelle-home"),
        contentPadding = WindowInsets.safeDrawing.asPaddingValues(),
    ) {
        item {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 13.dp, vertical = 12.dp)
                    .testTag("account-and-record-card"),
                shape = MaterialTheme.shapes.large,
                colors = CardDefaults.cardColors(containerColor = VerellePaper.copy(alpha = 0.96f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 5.dp),
            ) {
            Column(modifier = Modifier.padding(22.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .size(42.dp)
                            .clip(MaterialTheme.shapes.extraLarge)
                            .background(VerelleTeal)
                            .clearAndSetSemantics {},
                    ) {
                        Text("V", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    Column {
                        Text(
                            "Verelle",
                            style = MaterialTheme.typography.headlineMedium,
                            color = VerelleTealDeep,
                            modifier = Modifier.semantics { heading() },
                        )
                        Text(
                            "ACCOUNT & ENCRYPTED SYNC",
                            style = MaterialTheme.typography.labelSmall,
                            color = VerelleTeal,
                        )
                    }
                }
                if (enrollment == null && !enrollmentUnreadable) {
                    Spacer(modifier = Modifier.height(12.dp))
                    AccountEntryTabs(
                        selected = accountEntryMode,
                        enabled = !accountRequestInFlight,
                        onSelected = {
                            accountEntryMode = it
                            accountPassword = ""
                            accountPasswordConfirmation = ""
                            enteredRecoveryCode = ""
                            message = null
                        },
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    if (accountEntryMode == AccountEntryMode.CREATE) {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.testTag("create-account-panel"),
                        ) {
                            Text(
                                "Create your encrypted account",
                                style = MaterialTheme.typography.headlineSmall,
                                modifier = Modifier.semantics { heading() },
                            )
                            Text(
                                "This installation will create and keep the private device key needed for future sign-ins.",
                            )
                            OutlinedTextField(
                                value = accountEmail,
                                onValueChange = { accountEmail = it },
                                label = { Text("Email") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                                enabled = !accountRequestInFlight,
                                modifier = Modifier.fillMaxWidth().testTag("account-email"),
                            )
                            OutlinedTextField(
                                value = accountPassword,
                                onValueChange = { accountPassword = it },
                                label = { Text("Password (12+ characters)") },
                                singleLine = true,
                                visualTransformation = PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                                enabled = !accountRequestInFlight,
                                modifier = Modifier.fillMaxWidth().testTag("account-password"),
                            )
                            Row(
                                verticalAlignment = Alignment.Top,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .toggleable(
                                        value = healthDataConsent,
                                        enabled = !accountRequestInFlight,
                                        role = Role.Checkbox,
                                        onValueChange = { healthDataConsent = it },
                                    )
                                    .semantics(mergeDescendants = true) {},
                            ) {
                                Checkbox(
                                    checked = healthDataConsent,
                                    onCheckedChange = null,
                                    enabled = !accountRequestInFlight,
                                    modifier = Modifier.testTag("health-data-consent"),
                                )
                                Text(
                                    "I consent to Verelle processing my encrypted health data under policy 2026-07-19.",
                                    modifier = Modifier.padding(top = 12.dp),
                                )
                            }
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
                                            val recoveryCodePersistenceError = runCatching {
                                                withContext(Dispatchers.IO) {
                                                    pendingRecoveryCodeStore.save(result.recoveryCode)
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
                                                recoveryCodePersistenceError != null ->
                                                    "Account created, but this device could not protect the recovery code. Record it now without leaving this screen."
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
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 52.dp)
                                    .testTag("register-account"),
                            ) {
                                Text(if (accountRequestInFlight) "Creating account…" else "Create account")
                            }
                        }
                    } else if (accountEntryMode == AccountEntryMode.SIGN_IN) {
                        FreshInstallAccountGuidance(
                            mode = accountEntryMode,
                            onModeSelected = { accountEntryMode = it },
                        )
                    } else {
                        RecoveryAccountPanel(
                            email = accountEmail,
                            onEmailChanged = { accountEmail = it },
                            recoveryCode = enteredRecoveryCode,
                            onRecoveryCodeChanged = { enteredRecoveryCode = it },
                            password = accountPassword,
                            onPasswordChanged = { accountPassword = it },
                            passwordConfirmation = accountPasswordConfirmation,
                            onPasswordConfirmationChanged = { accountPasswordConfirmation = it },
                            requestInFlight = accountRequestInFlight,
                            onRecover = {
                                val submittedEmail = accountEmail
                                val submittedRecoveryCode = enteredRecoveryCode
                                val submittedPassword = accountPassword
                                val submittedConfirmation = accountPasswordConfirmation
                                enteredRecoveryCode = ""
                                accountPassword = ""
                                accountPasswordConfirmation = ""
                                recoveryCode = null
                                message = null
                                accountRequestInFlight = true
                                coroutineScope.launch {
                                    try {
                                        require(submittedPassword == submittedConfirmation) {
                                            "The new passwords do not match"
                                        }
                                        val result = withContext(Dispatchers.IO) {
                                            AccountEnrollmentClient(
                                                LocalDeviceIdentity(context).getOrCreate(),
                                            ).recover(
                                                repository = repository,
                                                localDataKeyManager = localDataKeyManager,
                                                enrollmentStore = enrollmentStore,
                                                pendingRecoveryStore = pendingRecoveryStore,
                                                email = submittedEmail,
                                                recoveryCode = submittedRecoveryCode,
                                                newPassword = submittedPassword,
                                            )
                                        }
                                        enrollment = EnrollmentSummary.from(result.enrollment)
                                        enrollmentUnreadable = false
                                        accountEmail = result.enrollment.email
                                        recoveryCode = result.recoveryCode
                                        VerelleSyncWorker.enqueue(context)
                                        message = if (result.loginError == null) {
                                            "Account recovered and this Android device is enrolled. Store the replacement recovery code."
                                        } else {
                                            "Account recovered and this Android device is enrolled. Store the replacement recovery code, then sign in."
                                        }
                                    } catch (error: CancellationException) {
                                        throw error
                                    } catch (error: Exception) {
                                        message = error.message ?: "Account recovery failed"
                                    } finally {
                                        accountRequestInFlight = false
                                    }
                                }
                            },
                            onCreateAccount = { accountEntryMode = AccountEntryMode.CREATE },
                        )
                    }
                } else if (enrollment != null) {
                    val enrolled = checkNotNull(enrollment)
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
                    Text(
                        lastSyncedAt?.let { "Last synced ${Instant.ofEpochMilli(it)}" }
                            ?: "Not yet synced on this installation",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.testTag("sync-freshness"),
                    )
                    OutlinedButton(
                        onClick = { coroutineScope.launch { foregroundSync(showResult = true) } },
                        enabled = !foregroundSyncInFlight &&
                            enrolled.expiresAtUnixSeconds > Instant.now().epochSecond,
                        modifier = Modifier.fillMaxWidth().testTag("sync-now"),
                    ) {
                        Text(if (foregroundSyncInFlight) "Syncing…" else "Sync now")
                    }
                    if (enrolled.email.isNotBlank()) {
                        Text(
                            "Sign in on this enrolled Android device",
                            style = MaterialTheme.typography.headlineSmall,
                            modifier = Modifier.testTag("enrolled-sign-in-heading"),
                        )
                        Text(
                            if (enrolled.expiresAtUnixSeconds > Instant.now().epochSecond) {
                                "Session active until ${enrolled.expiresAtUnixSeconds}"
                            } else {
                                "Your password and this installation's private key are both required."
                            },
                            style = MaterialTheme.typography.bodySmall,
                        )
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
                        Button(
                            onClick = {
                                val submittedPassword = accountPassword
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
                                            RedactionClient().resume(
                                                repository,
                                                loggedIn,
                                                pendingRedactionStore,
                                            )
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
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 52.dp)
                                .testTag("login-account"),
                        ) {
                            Text(if (accountRequestInFlight) "Signing in…" else "Sign in")
                        }
                        if (enrolled.expiresAtUnixSeconds > Instant.now().epochSecond) {
                            Text(
                                "Share with one partner",
                                style = MaterialTheme.typography.headlineSmall,
                                modifier = Modifier.semantics { heading() },
                            )
                            Text(
                                "The invite contains the encrypted chart key. Send it privately; it expires in 15 minutes and can be used once.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                            Button(
                                onClick = {
                                    message = null
                                    accountRequestInFlight = true
                                    coroutineScope.launch {
                                        try {
                                            val result = withContext(Dispatchers.IO) {
                                                val saved = checkNotNull(enrollmentStore.load())
                                                CoupleEnrollmentClient().create(repository, saved)
                                            }
                                            coupleInviteCode = result.inviteCode
                                            message = "Invite created; it expires at ${result.expiresAtUnixSeconds}"
                                        } catch (error: CancellationException) {
                                            throw error
                                        } catch (error: Exception) {
                                            message = error.message ?: "The invite could not be created"
                                        } finally {
                                            accountRequestInFlight = false
                                        }
                                    }
                                },
                                enabled = !accountRequestInFlight,
                                modifier = Modifier.fillMaxWidth().testTag("create-couple-invite"),
                            ) {
                                Text("Create private invite")
                            }
                            coupleInviteCode?.let { code ->
                                SelectionContainer {
                                    Text(code, modifier = Modifier.testTag("couple-invite-code"))
                                }
                                Text(
                                    "Creating another invite revokes this one.",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                            OutlinedTextField(
                                value = enteredCoupleInviteCode,
                                onValueChange = { enteredCoupleInviteCode = it.trim() },
                                label = { Text("Private invite code") },
                                enabled = !accountRequestInFlight,
                                modifier = Modifier.fillMaxWidth().testTag("accept-couple-invite-code"),
                            )
                            OutlinedButton(
                                onClick = {
                                    val submittedCode = enteredCoupleInviteCode
                                    message = null
                                    accountRequestInFlight = true
                                    coroutineScope.launch {
                                        try {
                                            val updated = withContext(Dispatchers.IO) {
                                                val saved = checkNotNull(enrollmentStore.load())
                                                CoupleEnrollmentClient().accept(
                                                    repository,
                                                    localDataKeyManager,
                                                    enrollmentStore,
                                                    pendingCoupleStore,
                                                    saved,
                                                    submittedCode,
                                                )
                                            }
                                            enrollment = EnrollmentSummary.from(updated)
                                            enteredCoupleInviteCode = ""
                                            reload()
                                            message = "Joined the shared encrypted chart"
                                        } catch (error: CancellationException) {
                                            throw error
                                        } catch (error: Exception) {
                                            message = error.message ?: "The invite could not be accepted"
                                        } finally {
                                            accountRequestInFlight = false
                                        }
                                    }
                                },
                                enabled = !accountRequestInFlight && enteredCoupleInviteCode.isNotBlank(),
                                modifier = Modifier.fillMaxWidth().testTag("accept-couple-invite"),
                            ) {
                                Text("Accept invite on this empty chart")
                            }
                        }
                    }
                }
                recoveryCode?.let { code ->
                    Text(
                        "Recovery code — shown once. Store it offline before leaving this screen.",
                        color = MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.SemiBold,
                    )
                    SelectionContainer {
                        Text(
                            code,
                            modifier = Modifier
                                .semantics { liveRegion = LiveRegionMode.Assertive }
                                .testTag("recovery-code"),
                        )
                    }
                    Button(
                        onClick = {
                            message = runCatching {
                                if (pendingRecoveryStore.hasPending()) {
                                    pendingRecoveryStore.clearAfterAcknowledgement()
                                }
                                pendingRecoveryCodeStore.load()?.let {
                                    pendingRecoveryCodeStore.clearAfterAcknowledgement()
                                }
                                recoveryCode = null
                                "Recovery code acknowledgement saved"
                            }.getOrElse { error ->
                                error.message ?: "The recovery code acknowledgement could not be saved"
                            }
                        },
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
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    shape = MaterialTheme.shapes.medium,
                    border = BorderStroke(1.dp, VerelleCoral.copy(alpha = 0.34f)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 18.dp)
                        .testTag("safety-notice"),
                ) {
                    Text(
                        "Founder testing only — store the recovery code offline before recording health data",
                        fontWeight = FontWeight.SemiBold,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 13.dp),
                    )
                }
                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    "RECORD AN OBSERVATION",
                    style = MaterialTheme.typography.labelSmall,
                    color = VerelleTeal,
                )
                Text(
                    "Today's chart",
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.semantics { heading() },
                )
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
                        message = null
                        coroutineScope.launch {
                            message = try {
                            val cycleNumber = methodCycleNumber.toUIntOrNull()
                                ?: error("Enter a method cycle number")
                            withContext(Dispatchers.IO) {
                                repository.recordCycleStart(date, cycleNumber)
                            }
                            reload()
                            "Cycle start saved"
                            } catch (error: CancellationException) {
                                throw error
                            } catch (error: Exception) {
                                error.message ?: "Cycle start could not be saved"
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 50.dp)
                        .testTag("save-cycle-start"),
                ) {
                    Text("Start cycle")
                }
                Text("Monitor reading", style = MaterialTheme.typography.titleMedium)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    FfiMonitorReading.entries.chunked(2).forEach { rowOptions ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            rowOptions.forEach { option ->
                                FilterChip(
                                    selected = reading == option,
                                    onClick = { reading = option },
                                    label = { Text(option.displayName()) },
                                    colors = accountEntryChipColors(),
                                    modifier = Modifier
                                        .weight(1f)
                                        .heightIn(min = 44.dp)
                                        .testTag("reading-${option.name.lowercase()}"),
                                )
                            }
                            if (rowOptions.size == 1) {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
                Button(
                    onClick = {
                        message = null
                        coroutineScope.launch {
                            message = try {
                            withContext(Dispatchers.IO) {
                                repository.recordMonitorReading(date, reading)
                            }
                            reload()
                            "Monitor reading saved"
                            } catch (error: CancellationException) {
                                throw error
                            } catch (error: Exception) {
                                error.message ?: "Monitor reading could not be saved"
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 52.dp)
                        .testTag("save-monitor-reading"),
                ) {
                    Text("Save reading")
                }
                SupplementalObservationForms(
                    repository = repository,
                    date = date,
                    onSaved = { success ->
                        reload()
                        message = success
                    },
                    onError = { error -> message = error },
                )
                LocalDataTools(
                    repository = repository,
                    date = date,
                    enrolledForSync = enrollment != null,
                    onChanged = { success ->
                        reload()
                        message = success
                    },
                    onError = { status -> message = status },
                )
                message?.let {
                    Text(
                        it,
                        color = VerelleTeal,
                        modifier = Modifier
                            .semantics { liveRegion = LiveRegionMode.Assertive }
                            .testTag("account-status"),
                    )
                }
                Text(
                    "$pendingCount encrypted local operations waiting for future sync",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.testTag("pending-operations"),
                )
            }
            }
        }

        val chart = charts.lastOrNull()
        if (chart == null) {
            item {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 13.dp, vertical = 8.dp)
                        .testTag("empty-chart"),
                    colors = CardDefaults.cardColors(containerColor = VerellePaper.copy(alpha = 0.9f)),
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth().padding(32.dp),
                    ) {
                        Text("Your chart starts here", style = MaterialTheme.typography.titleLarge)
                        Text(
                            "Create or sign in to an account, store the recovery code, then record a cycle start and daily observations.",
                            color = VerelleMuted,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        } else {
            item { ChartHeader(chart) }
            items(chart.days, key = { it.date }) { day ->
                ChartDay(day)
            }
        }
    }
}

internal enum class AccountEntryMode {
    CREATE,
    SIGN_IN,
    RECOVER,
}

@Composable
internal fun AccountEntryTabs(
    selected: AccountEntryMode,
    onSelected: (AccountEntryMode) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .background(VerelleMist)
            .padding(6.dp)
            .selectableGroup()
            .semantics { contentDescription = "Account access" }
            .testTag("account-entry-tabs"),
    ) {
        FilterChip(
            selected = selected == AccountEntryMode.CREATE,
            onClick = { onSelected(AccountEntryMode.CREATE) },
            label = { Text("Create", maxLines = 1) },
            enabled = enabled,
            shape = MaterialTheme.shapes.small,
            colors = accountEntryChipColors(),
            modifier = Modifier.weight(1f).heightIn(min = 44.dp).testTag("account-create-tab"),
        )
        FilterChip(
            selected = selected == AccountEntryMode.SIGN_IN,
            onClick = { onSelected(AccountEntryMode.SIGN_IN) },
            label = { Text("Sign in") },
            enabled = enabled,
            shape = MaterialTheme.shapes.small,
            colors = accountEntryChipColors(),
            modifier = Modifier.weight(1f).heightIn(min = 44.dp).testTag("account-sign-in-tab"),
        )
        FilterChip(
            selected = selected == AccountEntryMode.RECOVER,
            onClick = { onSelected(AccountEntryMode.RECOVER) },
            label = { Text("Recover") },
            enabled = enabled,
            shape = MaterialTheme.shapes.small,
            colors = accountEntryChipColors(),
            modifier = Modifier.weight(1f).heightIn(min = 44.dp).testTag("account-recover-tab"),
        )
    }
}

@Composable
private fun accountEntryChipColors() = FilterChipDefaults.filterChipColors(
    containerColor = Color.Transparent,
    labelColor = VerelleMuted,
    selectedContainerColor = VerellePaper,
    selectedLabelColor = VerelleTealDeep,
)

@Composable
internal fun FreshInstallAccountGuidance(
    mode: AccountEntryMode,
    onModeSelected: (AccountEntryMode) -> Unit,
) {
    when (mode) {
        AccountEntryMode.CREATE -> Unit
        AccountEntryMode.SIGN_IN -> {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier
                    .clip(MaterialTheme.shapes.medium)
                    .background(VerelleMist)
                    .padding(20.dp)
                    .testTag("fresh-install-sign-in-panel"),
            ) {
                Text(
                    "Sign in to Verelle",
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    "No enrolled device credential was found on this installation.",
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.testTag("fresh-install-not-enrolled"),
                )
                Text(
                    "Verelle sign-in requires both your password and this installation's private device key. A password alone cannot enroll a fresh or reinstalled Android app.",
                )
                Button(
                    onClick = { onModeSelected(AccountEntryMode.RECOVER) },
                    modifier = Modifier.fillMaxWidth().testTag("show-recovery-options"),
                ) {
                    Text("Recovery options")
                }
                OutlinedButton(
                    onClick = { onModeSelected(AccountEntryMode.CREATE) },
                    modifier = Modifier.fillMaxWidth().testTag("show-create-account"),
                ) {
                    Text("Create a new account")
                }
            }
        }
        AccountEntryMode.RECOVER -> Unit
    }
}

@Composable
internal fun RecoveryAccountPanel(
    email: String,
    onEmailChanged: (String) -> Unit,
    recoveryCode: String,
    onRecoveryCodeChanged: (String) -> Unit,
    password: String,
    onPasswordChanged: (String) -> Unit,
    passwordConfirmation: String,
    onPasswordConfirmationChanged: (String) -> Unit,
    requestInFlight: Boolean,
    onRecover: () -> Unit,
    onCreateAccount: () -> Unit,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.testTag("fresh-install-recovery-panel"),
    ) {
        Text(
            "Recover and enroll this phone",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            "Use the code you stored offline. Recovery replaces your password, revokes every old session and device, and issues a new one-time recovery code.",
            color = VerelleMuted,
        )
        Surface(
            color = VerelleMist,
            shape = MaterialTheme.shapes.medium,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.55f)),
        ) {
            Text(
                "Recovery is available only before this installation records local chart entries.",
                style = MaterialTheme.typography.bodySmall,
                color = VerelleMuted,
                modifier = Modifier.padding(14.dp).testTag("recovery-pristine-notice"),
            )
        }
        OutlinedTextField(
            value = email,
            onValueChange = onEmailChanged,
            label = { Text("Account email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            enabled = !requestInFlight,
            modifier = Modifier.fillMaxWidth().testTag("recovery-email"),
        )
        OutlinedTextField(
            value = recoveryCode,
            onValueChange = onRecoveryCodeChanged,
            label = { Text("Offline recovery code") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            enabled = !requestInFlight,
            modifier = Modifier.fillMaxWidth().testTag("recovery-code-input"),
        )
        OutlinedTextField(
            value = password,
            onValueChange = onPasswordChanged,
            label = { Text("New password (12+ characters)") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            enabled = !requestInFlight,
            modifier = Modifier.fillMaxWidth().testTag("recovery-new-password"),
        )
        OutlinedTextField(
            value = passwordConfirmation,
            onValueChange = onPasswordConfirmationChanged,
            label = { Text("Confirm new password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            enabled = !requestInFlight,
            modifier = Modifier.fillMaxWidth().testTag("recovery-confirm-password"),
        )
        Button(
            onClick = onRecover,
            enabled = !requestInFlight,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .testTag("recover-account"),
        ) {
            Text(if (requestInFlight) "Recovering account…" else "Recover and enroll phone")
        }
        Text(
            "Keep the replacement recovery code offline after recovery completes.",
            style = MaterialTheme.typography.bodySmall,
            color = VerelleMuted,
        )
        OutlinedButton(
            onClick = onCreateAccount,
            enabled = !requestInFlight,
            modifier = Modifier.fillMaxWidth().testTag("show-create-account"),
        ) {
            Text("Create a new account")
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
    Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 18.dp)) {
        Text("YOUR CHART", style = MaterialTheme.typography.labelSmall, color = VerelleTeal)
        Text(
            "Cycle ${chart.methodCycleNumber} · ${chart.startDate}",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.semantics { heading() }.testTag("chart-header"),
        )
        Text(
            "Recorded observations and mechanical annotations only",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun ChartDay(day: FfiChartDay) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 13.dp, vertical = 4.dp),
        color = VerellePaper.copy(alpha = 0.92f),
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.38f)),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp)
                .testTag("chart-day-${day.date}"),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("CD ${day.cycleDay}", style = MaterialTheme.typography.titleLarge)
                Text(day.date, style = MaterialTheme.typography.bodySmall, color = VerelleMuted)
            }
            Column(modifier = Modifier.weight(2f)) {
                Text(day.entries.map { it.label }.ifEmpty { listOf("No entry") }.joinToString(" · "))
                if (day.annotations.isNotEmpty()) {
                    Text(
                        day.annotations.joinToString(" · "),
                        color = VerelleDanger,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
private fun RepositoryLoading() {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.fillMaxSize().testTag("repository-loading"),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            CircularProgressIndicator(color = VerelleTeal)
            Text("Opening your encrypted chart", color = VerelleMuted)
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
