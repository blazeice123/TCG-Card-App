package com.cardscanner.mvp.data.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.time.Instant

@Entity(
    tableName = "catalog_cards",
    indices = [
        Index(value = ["sport", "player_name", "set_name", "card_number"]),
    ],
)
data class CatalogCardEntity(
    @PrimaryKey
    @ColumnInfo(name = "catalog_card_id")
    val catalogCardId: String,
    val sport: String,
    val year: Int,
    val brand: String,
    @ColumnInfo(name = "set_name")
    val setName: String,
    @ColumnInfo(name = "subset_name")
    val subsetName: String? = null,
    @ColumnInfo(name = "card_number")
    val cardNumber: String,
    @ColumnInfo(name = "player_name")
    val playerName: String,
    @ColumnInfo(name = "team_name")
    val teamName: String? = null,
    @ColumnInfo(name = "rookie_flag")
    val rookieFlag: Boolean = false,
    val parallel: String? = null,
    val variation: String? = null,
    @ColumnInfo(name = "search_query_override")
    val searchQueryOverride: String? = null,
    val notes: String? = null,
    @ColumnInfo(name = "created_at")
    val createdAt: String = Instant.now().toString(),
    @ColumnInfo(name = "updated_at")
    val updatedAt: String = Instant.now().toString(),
)

@Entity(tableName = "scan_sessions")
data class ScanSessionEntity(
    @PrimaryKey
    @ColumnInfo(name = "session_id")
    val sessionId: String,
    @ColumnInfo(name = "source_type")
    val sourceType: String,
    @ColumnInfo(name = "source_uri")
    val sourceUri: String? = null,
    @ColumnInfo(name = "started_at")
    val startedAt: String = Instant.now().toString(),
    @ColumnInfo(name = "completed_at")
    val completedAt: String? = null,
    val status: String = "draft",
    val notes: String? = null,
)

@Entity(
    tableName = "scan_crops",
    foreignKeys = [
        ForeignKey(
            entity = ScanSessionEntity::class,
            parentColumns = ["session_id"],
            childColumns = ["session_id"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = CatalogCardEntity::class,
            parentColumns = ["catalog_card_id"],
            childColumns = ["selected_match_catalog_card_id"],
            onDelete = ForeignKey.SET_NULL,
        ),
    ],
    indices = [
        Index(value = ["session_id", "crop_index"]),
        Index(value = ["review_status"]),
        Index(value = ["selected_match_catalog_card_id"]),
    ],
)
data class ScanCropEntity(
    @PrimaryKey
    @ColumnInfo(name = "crop_id")
    val cropId: String,
    @ColumnInfo(name = "session_id")
    val sessionId: String,
    @ColumnInfo(name = "crop_index")
    val cropIndex: Int,
    @ColumnInfo(name = "image_uri")
    val imageUri: String? = null,
    @ColumnInfo(name = "preview_path")
    val previewPath: String? = null,
    @ColumnInfo(name = "bounds_left")
    val boundsLeft: Double? = null,
    @ColumnInfo(name = "bounds_top")
    val boundsTop: Double? = null,
    @ColumnInfo(name = "bounds_right")
    val boundsRight: Double? = null,
    @ColumnInfo(name = "bounds_bottom")
    val boundsBottom: Double? = null,
    @ColumnInfo(name = "perspective_correction_applied")
    val perspectiveCorrectionApplied: Boolean = false,
    @ColumnInfo(name = "ocr_text")
    val ocrText: String? = null,
    @ColumnInfo(name = "ocr_confidence")
    val ocrConfidence: Double? = null,
    @ColumnInfo(name = "selected_match_catalog_card_id")
    val selectedMatchCatalogCardId: String? = null,
    @ColumnInfo(name = "review_status")
    val reviewStatus: String = "pending",
    @ColumnInfo(name = "unknown_flag")
    val unknownFlag: Boolean = false,
    @ColumnInfo(name = "created_at")
    val createdAt: String = Instant.now().toString(),
)

@Entity(
    tableName = "crop_match_candidates",
    foreignKeys = [
        ForeignKey(
            entity = ScanCropEntity::class,
            parentColumns = ["crop_id"],
            childColumns = ["crop_id"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = CatalogCardEntity::class,
            parentColumns = ["catalog_card_id"],
            childColumns = ["catalog_card_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index(value = ["crop_id", "catalog_card_id"], unique = true),
        Index(value = ["crop_id", "rank"]),
    ],
)
data class CropMatchCandidateEntity(
    @PrimaryKey
    @ColumnInfo(name = "candidate_id")
    val candidateId: String,
    @ColumnInfo(name = "crop_id")
    val cropId: String,
    @ColumnInfo(name = "catalog_card_id")
    val catalogCardId: String,
    val rank: Int,
    @ColumnInfo(name = "confidence_score")
    val confidenceScore: Double,
    @ColumnInfo(name = "match_basis")
    val matchBasis: String,
    @ColumnInfo(name = "player_score")
    val playerScore: Double? = null,
    @ColumnInfo(name = "set_score")
    val setScore: Double? = null,
    @ColumnInfo(name = "card_number_score")
    val cardNumberScore: Double? = null,
    @ColumnInfo(name = "review_outcome")
    val reviewOutcome: String = "pending",
    @ColumnInfo(name = "created_at")
    val createdAt: String = Instant.now().toString(),
)

@Entity(
    tableName = "collection_cards",
    foreignKeys = [
        ForeignKey(
            entity = ScanCropEntity::class,
            parentColumns = ["crop_id"],
            childColumns = ["crop_id"],
            onDelete = ForeignKey.SET_NULL,
        ),
        ForeignKey(
            entity = CatalogCardEntity::class,
            parentColumns = ["catalog_card_id"],
            childColumns = ["catalog_card_id"],
            onDelete = ForeignKey.SET_NULL,
        ),
    ],
    indices = [
        Index(value = ["catalog_card_id"]),
        Index(value = ["crop_id"]),
    ],
)
data class CollectionCardEntity(
    @PrimaryKey
    @ColumnInfo(name = "collection_card_id")
    val collectionCardId: String,
    @ColumnInfo(name = "crop_id")
    val cropId: String? = null,
    @ColumnInfo(name = "catalog_card_id")
    val catalogCardId: String? = null,
    @ColumnInfo(name = "player_name_snapshot")
    val playerNameSnapshot: String,
    @ColumnInfo(name = "set_name_snapshot")
    val setNameSnapshot: String? = null,
    @ColumnInfo(name = "card_number_snapshot")
    val cardNumberSnapshot: String? = null,
    @ColumnInfo(name = "sport_snapshot")
    val sportSnapshot: String? = null,
    @ColumnInfo(name = "team_name_snapshot")
    val teamNameSnapshot: String? = null,
    @ColumnInfo(name = "year_snapshot")
    val yearSnapshot: Int? = null,
    @ColumnInfo(name = "image_uri")
    val imageUri: String? = null,
    @ColumnInfo(name = "condition_note")
    val conditionNote: String? = null,
    @ColumnInfo(name = "acquired_at")
    val acquiredAt: String? = null,
    @ColumnInfo(name = "added_at")
    val addedAt: String = Instant.now().toString(),
    @ColumnInfo(name = "last_price_snapshot_id")
    val lastPriceSnapshotId: String? = null,
    val notes: String? = null,
)

@Entity(
    tableName = "price_snapshots",
    foreignKeys = [
        ForeignKey(
            entity = CollectionCardEntity::class,
            parentColumns = ["collection_card_id"],
            childColumns = ["collection_card_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index(value = ["collection_card_id", "observed_at"]),
    ],
)
data class PriceSnapshotEntity(
    @PrimaryKey
    @ColumnInfo(name = "price_snapshot_id")
    val priceSnapshotId: String,
    @ColumnInfo(name = "collection_card_id")
    val collectionCardId: String,
    @ColumnInfo(name = "source_name")
    val sourceName: String,
    @ColumnInfo(name = "source_listing_url")
    val sourceListingUrl: String? = null,
    @ColumnInfo(name = "source_query")
    val sourceQuery: String? = null,
    @ColumnInfo(name = "price_currency")
    val priceCurrency: String = "USD",
    @ColumnInfo(name = "price_value")
    val priceValue: Double,
    @ColumnInfo(name = "confidence_label")
    val confidenceLabel: String = "estimate",
    @ColumnInfo(name = "observed_at")
    val observedAt: String = Instant.now().toString(),
    @ColumnInfo(name = "created_at")
    val createdAt: String = Instant.now().toString(),
)

@Entity(
    tableName = "correction_events",
    foreignKeys = [
        ForeignKey(
            entity = ScanCropEntity::class,
            parentColumns = ["crop_id"],
            childColumns = ["crop_id"],
            onDelete = ForeignKey.SET_NULL,
        ),
        ForeignKey(
            entity = CollectionCardEntity::class,
            parentColumns = ["collection_card_id"],
            childColumns = ["collection_card_id"],
            onDelete = ForeignKey.SET_NULL,
        ),
    ],
    indices = [
        Index(value = ["created_at"]),
        Index(value = ["crop_id"]),
        Index(value = ["collection_card_id"]),
    ],
)
data class CorrectionEventEntity(
    @PrimaryKey
    @ColumnInfo(name = "correction_event_id")
    val correctionEventId: String,
    @ColumnInfo(name = "crop_id")
    val cropId: String? = null,
    @ColumnInfo(name = "collection_card_id")
    val collectionCardId: String? = null,
    @ColumnInfo(name = "event_type")
    val eventType: String,
    @ColumnInfo(name = "previous_value")
    val previousValue: String? = null,
    @ColumnInfo(name = "corrected_value")
    val correctedValue: String? = null,
    val reason: String? = null,
    @ColumnInfo(name = "created_at")
    val createdAt: String = Instant.now().toString(),
)

@Entity(tableName = "app_settings")
data class AppSettingEntity(
    @PrimaryKey
    @ColumnInfo(name = "setting_key")
    val settingKey: String,
    @ColumnInfo(name = "setting_value")
    val settingValue: String? = null,
    @ColumnInfo(name = "updated_at")
    val updatedAt: String = Instant.now().toString(),
)

data class CollectionCardSummary(
    @ColumnInfo(name = "collection_card_id")
    val collectionCardId: String,
    @ColumnInfo(name = "player_name_snapshot")
    val playerNameSnapshot: String,
    @ColumnInfo(name = "set_name_snapshot")
    val setNameSnapshot: String?,
    @ColumnInfo(name = "card_number_snapshot")
    val cardNumberSnapshot: String?,
    @ColumnInfo(name = "sport_snapshot")
    val sportSnapshot: String?,
    @ColumnInfo(name = "added_at")
    val addedAt: String,
    @ColumnInfo(name = "latest_price_value")
    val latestPriceValue: Double?,
    @ColumnInfo(name = "latest_price_observed_at")
    val latestPriceObservedAt: String?,
)

