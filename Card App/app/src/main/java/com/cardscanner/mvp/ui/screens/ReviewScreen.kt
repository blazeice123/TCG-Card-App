package com.cardscanner.mvp.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun ReviewScreen(
    pendingReviewCount: Int,
) {
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
                        text = "Review queue",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Pending crops: $pendingReviewCount",
                        style = MaterialTheme.typography.headlineSmall,
                    )
                    Text(
                        text = "v1 prioritizes trustworthy matches over full automation. Unknown is always an acceptable outcome.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }

        item {
            RuleCard(
                title = "Matching focus",
                lines = listOf(
                    "Player name, set name, and card number are the primary anchors.",
                    "Parallels, autos, relics, and uncommon variants are manual or deferred.",
                    "Pricing should never influence which card gets selected.",
                ),
            )
        }

        item {
            RuleCard(
                title = "Human confirmation rules",
                lines = listOf(
                    "Do not force low-confidence matches just to keep the pipeline moving.",
                    "Let users confirm the best candidate, choose another candidate, or mark the crop unknown.",
                    "Capture correction events so later matching rules can improve using real mistakes.",
                ),
            )
        }
    }
}

@Composable
private fun RuleCard(
    title: String,
    lines: List<String>,
) {
    ElevatedCard {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            lines.forEach { line ->
                Text(
                    text = "* $line",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

