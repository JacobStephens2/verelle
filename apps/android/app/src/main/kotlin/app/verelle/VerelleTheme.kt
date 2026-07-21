package app.verelle

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFF315D8C),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD9E8F7),
    onPrimaryContainer = Color(0xFF163652),
    secondary = Color(0xFF76586F),
    secondaryContainer = Color(0xFFF2DDEC),
    background = Color(0xFFF7F9FC),
    surface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFFE8EEF4),
    onSurface = Color(0xFF1A1C1E),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFA9C9EA),
    primaryContainer = Color(0xFF294F76),
    secondary = Color(0xFFD8BFD1),
    background = Color(0xFF111417),
    surface = Color(0xFF191C20),
    surfaceVariant = Color(0xFF30363D),
)

@Composable
fun VerelleTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
