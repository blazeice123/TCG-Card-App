package com.cardscanner.mvp.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cardscanner.mvp.data.db.CollectionCardSummary
import java.util.Locale

@Composable
fun CollectionScreen(
    cards: List<CollectionCardSummary>,
) {
    if (cards.isEmpty()) {
        EmptyCollectionState()
        return
    }

    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(
            items = cards,
            key = { card -> card.collectionCardId },
        ) { card ->
            val cardDetails = listOfNotNull(card.setNameSnapshot, card.cardNumberSnapshot)
                .takeIf { details -> details.isNotEmpty() }
                ?.joinToString(" - ")
                ?: "Catalog snapshot pending"

            ElevatedCard {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = card.playerNameSnapshot,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = cardDetails,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Text(
                        text = card.sportSnapshot ?: "Unknown sport",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = card.latestPriceValue?.let { "$${String.format(Locale.US, "%.2f", it)} snapshot" }
                            ?: "No price snapshot yet",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyCollectionState() {
    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ElevatedCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = "Collection is empty",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Confirmed matches will land here with a local snapshot of the catalog details and any later price lookup.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}
