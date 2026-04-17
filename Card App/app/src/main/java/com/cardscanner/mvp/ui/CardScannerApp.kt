package com.cardscanner.mvp.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CollectionsBookmark
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.cardscanner.mvp.ui.screens.CollectionScreen
import com.cardscanner.mvp.ui.screens.HomeScreen
import com.cardscanner.mvp.ui.screens.ReviewScreen
import com.cardscanner.mvp.ui.screens.ScanScreen
import com.cardscanner.mvp.ui.screens.SettingsScreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardScannerApp(viewModel: MainViewModel) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val importLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        viewModel.importCatalog(uri)
    }

    LaunchedEffect(uiState.statusMessage) {
        uiState.statusMessage?.let { message ->
            snackbarHostState.showSnackbar(message)
            viewModel.dismissStatusMessage()
        }
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Text(
                        text = "Card Scanner MVP",
                        style = MaterialTheme.typography.titleLarge,
                    )
                },
            )
        },
        bottomBar = {
            NavigationBar {
                AppTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = uiState.selectedTab == tab,
                        onClick = { viewModel.selectTab(tab) },
                        icon = {
                            Icon(
                                imageVector = tabIcon(tab),
                                contentDescription = tab.label,
                            )
                        },
                        label = {
                            Text(text = tab.label)
                        },
                    )
                }
            }
        },
        snackbarHost = {
            SnackbarHost(hostState = snackbarHostState)
        },
    ) { innerPadding ->
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when (uiState.selectedTab) {
                AppTab.Home -> HomeScreen(
                    uiState = uiState,
                    onImportCatalog = {
                        importLauncher.launch(
                            arrayOf(
                                "text/csv",
                                "text/comma-separated-values",
                                "application/vnd.ms-excel",
                                "text/*",
                            ),
                        )
                    },
                    onOpenScan = { viewModel.selectTab(AppTab.Scan) },
                    onOpenReview = { viewModel.selectTab(AppTab.Review) },
                    onOpenCollection = { viewModel.selectTab(AppTab.Collection) },
                )
                AppTab.Scan -> ScanScreen(
                    onOpenReview = { viewModel.selectTab(AppTab.Review) },
                )
                AppTab.Review -> ReviewScreen(
                    pendingReviewCount = uiState.pendingReviewCount,
                )
                AppTab.Collection -> CollectionScreen(
                    cards = uiState.collectionCards,
                )
                AppTab.Settings -> SettingsScreen(
                    lastCatalogImportAt = uiState.lastCatalogImportAt,
                )
            }
        }
    }
}

private fun tabIcon(tab: AppTab) = when (tab) {
    AppTab.Home -> Icons.Outlined.Home
    AppTab.Scan -> Icons.Outlined.PhotoCamera
    AppTab.Review -> Icons.Outlined.FactCheck
    AppTab.Collection -> Icons.Outlined.CollectionsBookmark
    AppTab.Settings -> Icons.Outlined.Tune
}

