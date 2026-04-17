package com.cardscanner.mvp.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface CatalogCardDao {
    @Upsert
    suspend fun upsertAll(cards: List<CatalogCardEntity>)

    @Query("SELECT COUNT(*) FROM catalog_cards")
    fun observeCatalogCount(): Flow<Int>
}

@Dao
interface ScanWorkflowDao {
    @Upsert
    suspend fun upsertSession(session: ScanSessionEntity)

    @Upsert
    suspend fun upsertCrop(crop: ScanCropEntity)

    @Upsert
    suspend fun upsertCandidates(candidates: List<CropMatchCandidateEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCorrection(event: CorrectionEventEntity)

    @Query("SELECT COUNT(*) FROM scan_crops WHERE review_status = 'pending'")
    fun observePendingReviewCount(): Flow<Int>
}

@Dao
interface CollectionCardDao {
    @Upsert
    suspend fun upsertCollectionCard(card: CollectionCardEntity)

    @Upsert
    suspend fun upsertPriceSnapshot(snapshot: PriceSnapshotEntity)

    @Query("SELECT COUNT(*) FROM collection_cards")
    fun observeCollectionCount(): Flow<Int>

    @Query(
        """
        SELECT
            c.collection_card_id,
            c.player_name_snapshot,
            c.set_name_snapshot,
            c.card_number_snapshot,
            c.sport_snapshot,
            c.added_at,
            p.price_value AS latest_price_value,
            p.observed_at AS latest_price_observed_at
        FROM collection_cards c
        LEFT JOIN price_snapshots p
            ON p.price_snapshot_id = c.last_price_snapshot_id
        ORDER BY c.added_at DESC
        """,
    )
    fun observeCollectionSummaries(): Flow<List<CollectionCardSummary>>
}

@Dao
interface AppSettingsDao {
    @Upsert
    suspend fun upsert(setting: AppSettingEntity)

    @Query("SELECT setting_value FROM app_settings WHERE setting_key = :settingKey LIMIT 1")
    fun observeSettingValue(settingKey: String): Flow<String?>
}

