package com.cardscanner.mvp.domain

data class CropBounds(
    val left: Double,
    val top: Double,
    val right: Double,
    val bottom: Double,
)

data class DetectedCardCrop(
    val cropId: String,
    val imageUri: String,
    val bounds: CropBounds,
    val detectionConfidence: Double,
)

data class OcrResult(
    val rawText: String,
    val confidence: Double?,
)

data class MatchCandidate(
    val catalogCardId: String?,
    val displayLabel: String,
    val confidenceScore: Double,
    val playerScore: Double? = null,
    val setScore: Double? = null,
    val cardNumberScore: Double? = null,
)

data class PriceEstimate(
    val sourceName: String,
    val sourceQuery: String,
    val amountUsd: Double,
    val observedAt: String,
)

interface CardDetectionEngine {
    suspend fun detect(sourceUri: String): List<DetectedCardCrop>
}

interface OcrEngine {
    suspend fun recognizeFrontText(imageUri: String): OcrResult
}

interface CardMatcher {
    suspend fun findCandidates(ocrText: String, limit: Int = 5): List<MatchCandidate>
}

interface PricingAdapter {
    suspend fun fetchConfirmedValue(searchQuery: String): PriceEstimate?
}

