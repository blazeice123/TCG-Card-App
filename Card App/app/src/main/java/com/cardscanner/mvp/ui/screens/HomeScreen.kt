package com.cardscanner.mvp.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cardscanner.mvp.ui.MainUiState

@Composable
fun HomeScreen(
    uiState: MainUiState,
    onImportCatalog: () -> Unit,
    onOpenScan: () -> Unit,
    onOpenReview: () -> Unit,
    onOpenCollection: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ElevatedCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = "Smallest worthwhile MVP",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Import a starter catalog, scan cards, review uncertain matches, and only fetch pricing after confirmation.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    MetricBlock(
                        label = "Catalog",
                        value = uiState.catalogCount.toString(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    MetricBlock(
                        label = "Review Queue",
                        value = uiState.pendingReviewCount.toString(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    MetricBlock(
                        label = "Collection",
                        value = uiState.collectionCount.toString(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }

        item {
            ElevatedCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = "Starter catalog",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Use the exact CSV template header from the repo. Keep the starter catalog limited to cards you physically own so matching can be tuned on real examples.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Button(
                        onClick = onImportCatalog,
                        enabled = !uiState.importInProgress,
                    ) {
                        Text(
                            text = if (uiState.importInProgress) {
                                "Importing..."
                            } else {
                                "Import Catalog CSV"
                            },
                        )
                    }
                    Text(
                        text = "Template files are included in both sample-data and bundled app assets.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        item {
            ElevatedCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = "Workflow shortcuts",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    OutlinedButton(
                        onClick = onOpenScan,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(text = "Open Scan Modes")
                    }
                    OutlinedButton(
                        onClick = onOpenReview,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(text = "Open Review Queue")
                    }
                    OutlinedButton(
                        onClick = onOpenCollection,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(text = "Open Collection")
                    }
                }
            }
        }
    }
}

@Composable
private fun MetricBlock(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(modifier = modifier) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
