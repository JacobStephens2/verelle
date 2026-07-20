package app.verelle

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal val VerelleInk = Color(0xFF183137)
// Slightly darker than the web token so 12–14sp native copy remains above 4.5:1.
internal val VerelleMuted = Color(0xFF5B7074)
internal val VerelleTeal = Color(0xFF1D6069)
internal val VerelleTealDeep = Color(0xFF153F48)
internal val VerelleSea = Color(0xFFDCEEED)
internal val VerelleMist = Color(0xFFEEF5F3)
internal val VerellePaper = Color(0xFFFFFDF8)
internal val VerelleCream = Color(0xFFF6F2E8)
internal val VerelleCoral = Color(0xFFC96F5A)
internal val VerelleDanger = Color(0xFF9B4E43)

private val VerelleColors = lightColorScheme(
    primary = VerelleTealDeep,
    onPrimary = Color.White,
    primaryContainer = VerelleSea,
    onPrimaryContainer = VerelleTealDeep,
    secondary = VerelleTeal,
    onSecondary = Color.White,
    secondaryContainer = VerelleMist,
    onSecondaryContainer = VerelleInk,
    background = VerelleCream,
    onBackground = VerelleInk,
    surface = VerellePaper,
    onSurface = VerelleInk,
    surfaceVariant = VerelleMist,
    onSurfaceVariant = VerelleMuted,
    outline = Color(0xFFB8C6C5),
    error = VerelleDanger,
    onError = Color.White,
    errorContainer = Color(0xFFFFF1E9),
    onErrorContainer = Color(0xFF79493E),
)

private val VerelleTypography = Typography(
    headlineLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Medium,
        fontSize = 38.sp,
        lineHeight = 40.sp,
        letterSpacing = (-1).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 30.sp,
        lineHeight = 34.sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 29.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 21.sp,
        lineHeight = 26.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 16.sp,
        lineHeight = 25.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 14.sp,
        lineHeight = 22.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 12.sp,
        lineHeight = 18.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 14.sp,
        lineHeight = 18.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 11.sp,
        lineHeight = 15.sp,
        letterSpacing = 1.4.sp,
    ),
)

private val VerelleShapes = Shapes(
    extraSmall = RoundedCornerShape(9.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(30.dp),
)

@Composable
internal fun VerelleTheme(content: @Composable () -> Unit) {
    // Verelle's public visual system is intentionally light. Keep the native
    // app consistent while real-data accessibility contrast is being audited.
    MaterialTheme(
        colorScheme = VerelleColors,
        typography = VerelleTypography,
        shapes = VerelleShapes,
        content = content,
    )
}
