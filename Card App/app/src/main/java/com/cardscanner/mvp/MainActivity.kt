package com.cardscanner.mvp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import com.cardscanner.mvp.ui.CardScannerApp
import com.cardscanner.mvp.ui.MainViewModel
import com.cardscanner.mvp.ui.theme.CardScannerTheme

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CardScannerTheme {
                CardScannerApp(viewModel = viewModel)
            }
        }
    }
}

