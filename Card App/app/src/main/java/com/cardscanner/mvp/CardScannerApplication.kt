package com.cardscanner.mvp

import android.app.Application
import com.cardscanner.mvp.data.db.AppDatabase
import com.cardscanner.mvp.data.importer.CatalogCsvImporter

class CardScannerApplication : Application() {
    val database: AppDatabase by lazy { AppDatabase.build(this) }

    val catalogCsvImporter: CatalogCsvImporter by lazy {
        CatalogCsvImporter(
            catalogCardDao = database.catalogCardDao(),
            appSettingsDao = database.appSettingsDao(),
        )
    }
}

