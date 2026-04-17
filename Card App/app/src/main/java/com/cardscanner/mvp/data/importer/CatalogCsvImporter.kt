package com.cardscanner.mvp.data.importer

import com.cardscanner.mvp.data.db.AppSettingEntity
import com.cardscanner.mvp.data.db.AppSettingsDao
import com.cardscanner.mvp.data.db.CatalogCardDao
import com.cardscanner.mvp.data.db.CatalogCardEntity
import java.io.InputStream
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class CatalogCsvImporter(
    private val catalogCardDao: CatalogCardDao,
    private val appSettingsDao: AppSettingsDao,
) {
    suspend fun import(inputStream: InputStream): ImportResult = withContext(Dispatchers.IO) {
        val lines = inputStream.bufferedReader().use { reader ->
            reader.readLines()
        }

        require(lines.isNotEmpty()) { "The CSV file is empty." }

        val header = parseCsvLine(lines.first()).mapIndexed { index, value ->
            if (index == 0) {
                value.removePrefix("\uFEFF")
            } else {
                value
            }
        }

        require(header == EXPECTED_HEADER) {
            "CSV header mismatch. Expected: ${EXPECTED_HEADER.joinToString(",")}"
        }

        val importedAt = Instant.now().toString()
        val validCards = mutableListOf<CatalogCardEntity>()
        var skippedCount = 0
        var errorCount = 0

        lines.drop(1).forEach { line ->
            if (line.isBlank()) {
                skippedCount += 1
                return@forEach
            }

            val columns = parseCsvLine(line)
            if (columns.size != EXPECTED_HEADER.size) {
                errorCount += 1
                return@forEach
            }

            val mappedValues = EXPECTED_HEADER.zip(columns).toMap()
            runCatching {
                mappedValues.toCatalogCard(importedAt)
            }.onSuccess { card ->
                validCards += card
            }.onFailure {
                errorCount += 1
            }
        }

        if (validCards.isNotEmpty()) {
            catalogCardDao.upsertAll(validCards)
        }

        appSettingsDao.upsert(
            AppSettingEntity(
                settingKey = LAST_CATALOG_IMPORT_AT,
                settingValue = importedAt,
                updatedAt = importedAt,
            ),
        )

        ImportResult(
            insertedCount = validCards.size,
            skippedCount = skippedCount,
            errorCount = errorCount,
        )
    }

    private fun parseCsvLine(line: String): List<String> {
        val values = mutableListOf<String>()
        val current = StringBuilder()
        var inQuotes = false
        var index = 0

        while (index < line.length) {
            val character = line[index]
            when {
                character == '"' && inQuotes && index + 1 < line.length && line[index + 1] == '"' -> {
                    current.append('"')
                    index += 1
                }
                character == '"' -> inQuotes = !inQuotes
                character == ',' && !inQuotes -> {
                    values += current.toString().trim()
                    current.clear()
                }
                else -> current.append(character)
            }
            index += 1
        }

        values += current.toString().trim()
        return values
    }

    private fun Map<String, String>.toCatalogCard(importedAt: String): CatalogCardEntity {
        return CatalogCardEntity(
            catalogCardId = requireValue("catalog_card_id"),
            sport = requireSport("sport"),
            year = requireValue("year").toInt(),
            brand = requireValue("brand"),
            setName = requireValue("set_name"),
            subsetName = optionalValue("subset_name"),
            cardNumber = requireValue("card_number"),
            playerName = requireValue("player_name"),
            teamName = optionalValue("team_name"),
            rookieFlag = booleanValue("rookie_flag"),
            parallel = optionalValue("parallel"),
            variation = optionalValue("variation"),
            searchQueryOverride = optionalValue("search_query_override"),
            notes = optionalValue("notes"),
            createdAt = importedAt,
            updatedAt = importedAt,
        )
    }

    private fun Map<String, String>.requireSport(key: String): String {
        val value = requireValue(key).lowercase()
        require(value in ALLOWED_SPORTS) {
            "Unsupported sport '$value'. Allowed values: ${ALLOWED_SPORTS.joinToString()}"
        }
        return value
    }

    private fun Map<String, String>.requireValue(key: String): String {
        return getValue(key).trim().takeIf { it.isNotEmpty() }
            ?: error("Missing required value for $key.")
    }

    private fun Map<String, String>.optionalValue(key: String): String? {
        return getValue(key).trim().ifEmpty { null }
    }

    private fun Map<String, String>.booleanValue(key: String): Boolean {
        return when (getValue(key).trim().lowercase()) {
            "", "0", "false", "no", "n" -> false
            "1", "true", "yes", "y" -> true
            else -> error("Invalid boolean value for $key.")
        }
    }

    data class ImportResult(
        val insertedCount: Int,
        val skippedCount: Int,
        val errorCount: Int,
    )

    companion object {
        const val LAST_CATALOG_IMPORT_AT = "last_catalog_import_at"

        private val ALLOWED_SPORTS = setOf("baseball", "football", "basketball")

        val EXPECTED_HEADER = listOf(
            "catalog_card_id",
            "sport",
            "year",
            "brand",
            "set_name",
            "subset_name",
            "card_number",
            "player_name",
            "team_name",
            "rookie_flag",
            "parallel",
            "variation",
            "search_query_override",
            "notes",
        )
    }
}

