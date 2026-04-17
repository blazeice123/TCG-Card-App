package com.cardscanner.mvp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = FieldGreen,
    onPrimary = Color.White,
    secondary = DugoutClay,
    onSecondary = Color.White,
    tertiary = ScoreboardGold,
    background = CardCream,
    onBackground = DeepSlate,
    surface = ChalkWhite,
    onSurface = DeepSlate,
)

@Composable
fun CardScannerTheme(
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = Typography(),
        content = content,
    )
}

