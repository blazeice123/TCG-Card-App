package com.cardscanner.mvp.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun ScanScreen(
    onOpenReview: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            WorkflowCard(
                title = "Single-card fallback",
                body = "Capture or import one front-side raw sports card, run OCR, and push it into the same match-review flow used for page crops.",
                chips = listOf("CameraX", "ML Kit OCR", "Fastest path to usable MVP"),
            )
        }

        item {
            WorkflowCard(
                title = "Full-page pipeline",
                body = "Detect card regions from a page scan or photo, crop and perspective-correct them, then batch them through OCR and candidate matching.",
                chips = listOf("OpenCV milestone", "Crop review UI", "Front side only"),
            )
        }

        item {
            ElevatedCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = "Current scaffold status",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "The app shell locks in the data model and review flow first. Camera capture, detection, and OCR execution are the next milestone, not hidden inside mock logic.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    OutlinedButton(
                        onClick = onOpenReview,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(text = "Jump to Review Rules")
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkflowCard(
    title: String,
    body: String,
    chips: List<String>,
) {
    ElevatedCard {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium,
            )
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                chips.forEach { chip ->
                    AssistChip(
                        onClick = { },
                        label = {
                            Text(text = chip)
                        },
                    )
                }
            }
        }
    }
}

