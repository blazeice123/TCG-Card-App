package com.cardscanner.mvp.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        CatalogCardEntity::class,
        ScanSessionEntity::class,
        ScanCropEntity::class,
        CropMatchCandidateEntity::class,
        CollectionCardEntity::class,
        PriceSnapshotEntity::class,
        CorrectionEventEntity::class,
        AppSettingEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun catalogCardDao(): CatalogCardDao
    abstract fun scanWorkflowDao(): ScanWorkflowDao
    abstract fun collectionCardDao(): CollectionCardDao
    abstract fun appSettingsDao(): AppSettingsDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        fun build(context: Context): AppDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "card-scanner.db",
                ).build().also { database ->
                    instance = database
                }
            }
        }
    }
}

