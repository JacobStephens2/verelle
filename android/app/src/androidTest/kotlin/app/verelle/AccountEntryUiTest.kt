package app.verelle

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test

class AccountEntryUiTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun compactAccountTabsShowEveryChoiceWithoutHorizontalScrolling() {
        compose.setContent {
            MaterialTheme {
                AccountEntryTabs(
                    selected = AccountEntryMode.CREATE,
                    onSelected = {},
                    modifier = Modifier.width(294.dp),
                )
            }
        }

        compose.onNodeWithTag("account-create-tab").assertIsDisplayed()
        compose.onNodeWithTag("account-sign-in-tab").assertIsDisplayed()
        compose.onNodeWithTag("account-recover-tab").assertIsDisplayed()
        compose.onNodeWithTag("account-create-tab").assertIsSelected()
    }

    @Test
    fun freshInstallTabsClickThroughToSignInGuidanceAndRealRecoveryForm() {
        var mode by mutableStateOf(AccountEntryMode.CREATE)
        compose.setContent {
            MaterialTheme {
                Column(modifier = Modifier.width(294.dp)) {
                    AccountEntryTabs(
                        selected = mode,
                        onSelected = { mode = it },
                    )
                    if (mode == AccountEntryMode.RECOVER) {
                        RecoveryAccountPanel(
                            email = "",
                            onEmailChanged = {},
                            recoveryCode = "",
                            onRecoveryCodeChanged = {},
                            password = "",
                            onPasswordChanged = {},
                            passwordConfirmation = "",
                            onPasswordConfirmationChanged = {},
                            requestInFlight = false,
                            onRecover = {},
                            onCreateAccount = { mode = AccountEntryMode.CREATE },
                        )
                    } else {
                        FreshInstallAccountGuidance(
                            mode = mode,
                            onModeSelected = { mode = it },
                        )
                    }
                }
            }
        }

        compose.onNodeWithTag("account-sign-in-tab").performClick()
        compose.onNodeWithTag("fresh-install-not-enrolled").assertIsDisplayed()
        compose.onNodeWithTag("show-recovery-options").performClick()
        compose.onNodeWithTag("fresh-install-recovery-panel").assertIsDisplayed()
        compose.onNodeWithTag("recovery-code-input").assertIsDisplayed()
        compose.onNodeWithTag("recover-account").assertIsDisplayed()
    }
}
