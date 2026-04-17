package com.cardscanner.mvp.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.cardscanner.mvp.CardScannerApplication
import com.cardscanner.mvp.data.db.CollectionCardSummary
import com.cardscanner.mvp.data.importer.CatalogCsvImporter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

enum class AppTab(val label: String) {
    Home("Home"),
    Scan("Scan"),
    Review("Review"),
    Collection("Collection"),
    Settings("Settings"),
}

data class MainUiState(
    val selectedTab: AppTab = AppTab.Home,
    val catalogCount: Int = 0,
    val collectionCount: Int = 0,
    val pendingReviewCount: Int = 0,
    val collectionCards: List<CollectionCardSummary> = emptyList(),
    val importInProgress: Boolean = false,
    val lastCatalogImportAt: String? = null,
    val statusMessage: String? = null,
)

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as CardScannerApplication
    private val catalogDao = app.database.catalogCardDao()
    private val collectionDao = app.database.collectionCardDao()
    private val scanWorkflowDao = app.database.scanWorkflowDao()
    private val appSettingsDao = app.database.appSettingsDao()

    private val selectedTab = MutableStateFlow(AppTab.Home)
    private val importInProgress = MutableStateFlow(false)
    private val statusMessage = MutableStateFlow<String?>(null)

    val uiState: StateFlow<MainUiState> = combine(
        selectedTab,
        catalogDao.observeCatalogCount(),
        collectionDao.observeCollectionCount(),
        scanWorkflowDao.observePendingReviewCount(),
        collectionDao.observeCollectionSummaries(),
        importInProgress,
        appSettingsDao.observeSettingValue(CatalogCsvImporter.LAST_CATALOG_IMPORT_AT),
        statusMessage,
    ) { tab, catalogCount, collectionCount, pendingReviewCount, collectionCards, importing, lastImportAt, message ->
        MainUiState(
            selectedTab = tab,
            catalogCount = catalogCount,
            collectionCount = collectionCount,
            pendingReviewCount = pendingReviewCount,
            collectionCards = collectionCards,
            importInProgress = importing,
            lastCatalogImportAt = lastImportAt,
            statusMessage = message,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = MainUiState(),
    )

    fun selectTab(tab: AppTab) {
        selectedTab.value = tab
    }

    fun importCatalog(uri: Uri?) {
        if (uri == null) {
            return
        }

        viewModelScope.launch {
            importInProgress.value = true
            val result = runCatching {
                app.contentResolver.openInputStream(uri)?.use { stream ->
                    app.catalogCsvImporter.import(stream)
                } ?: error("Unable to open the selected CSV file.")
            }

            statusMessage.value = result.fold(
                onSuccess = { importResult ->
                    buildString {
                        append("Catalog import finished: ")
                        append(importResult.insertedCount)
                        append(" inserted")
                        if (importResult.skippedCount > 0 || importResult.errorCount > 0) {
                            append(", ")
                            append(importResult.skippedCount)
                            append(" skipped, ")
                            append(importResult.errorCount)
                            append(" invalid")
                        }
                        append(".")
                    }
                },
                onFailure = { throwable ->
                    throwable.message ?: "Catalog import failed."
                },
            )
            importInProgress.value = false
        }
    }

    fun dismissStatusMessage() {
        statusMessage.value = null
    }
}

