export const EXPECTED_HEADER = [
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
];

const ALLOWED_SPORTS = new Set(["baseball", "football", "basketball"]);

export function parseCatalogCsv(csvText) {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines.length || !lines[0].trim()) {
    throw new Error("That CSV is empty.");
  }

  const header = parseCsvLine(lines[0]);
  if (header.join(",") !== EXPECTED_HEADER.join(",")) {
    throw new Error("That file does not match the starter template.");
  }

  const cards = [];
  const errors = [];

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      continue;
    }

    try {
      const values = parseCsvLine(line);
      if (values.length !== EXPECTED_HEADER.length) {
        throw new Error("This row has the wrong number of columns.");
      }

      const row = Object.fromEntries(EXPECTED_HEADER.map((key, valueIndex) => [key, values[valueIndex]?.trim() || ""]));
      cards.push(normalizeCatalogRow(row));
    } catch (error) {
      errors.push(`Row ${index + 1}: ${error.message}`);
    }
  }

  return {
    cards,
    errors,
  };
}

export function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

export function normalizeCatalogRow(row) {
  const sport = row.sport.toLowerCase();
  if (!ALLOWED_SPORTS.has(sport)) {
    throw new Error("Only baseball, football, and basketball work right now.");
  }

  if (!row.catalog_card_id || !row.player_name || !row.set_name || !row.card_number || !row.brand || !row.year) {
    throw new Error("A required field is blank.");
  }

  return {
    catalogCardId: row.catalog_card_id,
    sport,
    year: Number.parseInt(row.year, 10),
    brand: row.brand,
    setName: row.set_name,
    subsetName: row.subset_name || "",
    cardNumber: row.card_number,
    playerName: row.player_name,
    teamName: row.team_name || "",
    rookieFlag: parseBoolean(row.rookie_flag),
    parallel: row.parallel || "",
    variation: row.variation || "",
    searchQueryOverride: row.search_query_override || "",
    notes: row.notes || "",
  };
}

function parseBoolean(value) {
  return ["1", "true", "yes", "y"].includes(String(value || "").trim().toLowerCase());
}

export function summarizeCatalog(cards, errors) {
  if (!cards.length) {
    return errors.length
      ? `We could not use any cards from that file yet. ${errors.length} row${errors.length === 1 ? "" : "s"} still need fixing.`
      : "Your card list is empty.";
  }

  const sports = new Set(cards.map((card) => card.sport));
  const latestYear = Math.max(...cards.map((card) => card.year));
  return `You have ${cards.length} cards in your list across ${sports.size} sport${sports.size === 1 ? "" : "s"}. Newest year: ${latestYear}.`;
}

export function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean);
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9#\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractCardNumbers(value) {
  const matches = normalizeText(value).match(/#?\b[a-z]{0,2}\d{1,4}[a-z]{0,2}\b/g) || [];
  return [...new Set(matches.map((match) => match.replace(/^#/, "")))];
}

export function buildSearchQuery(card) {
  if (!card) {
    return "";
  }

  if (card.searchQueryOverride) {
    return card.searchQueryOverride;
  }

  return [card.year, card.brand, card.setName, card.cardNumber, card.playerName]
    .filter(Boolean)
    .join(" ");
}

export function matchCatalogCards(cards, ocrText, limit = 5) {
  const normalizedText = normalizeText(ocrText);
  if (!normalizedText) {
    return [];
  }

  const ocrTokens = new Set(tokenize(normalizedText));
  const detectedNumbers = extractCardNumbers(ocrText);

  const scored = cards
    .map((card) => {
      const playerTokens = tokenize(card.playerName);
      const setTokens = tokenize([card.year, card.brand, card.setName, card.subsetName].filter(Boolean).join(" "));
      const numberTokens = tokenize(card.cardNumber);

      const playerScore = overlapScore(playerTokens, ocrTokens, normalizedText);
      const setScore = overlapScore(setTokens, ocrTokens, normalizedText);
      const numberScore = cardNumberScore(card.cardNumber, numberTokens, detectedNumbers, normalizedText);
      const rookieBonus = card.rookieFlag && normalizedText.includes("rookie") ? 0.04 : 0;

      const confidenceScore = clamp(
        playerScore * 0.54 + setScore * 0.29 + numberScore * 0.17 + rookieBonus,
        0,
        0.999,
      );

      return {
        ...card,
        confidenceScore,
        playerScore,
        setScore,
        cardNumberScore: numberScore,
        displayLabel: `${card.playerName} - ${card.year} ${card.brand} ${card.setName} #${card.cardNumber}`,
      };
    })
    .filter((candidate) => candidate.confidenceScore > 0.08)
    .sort((left, right) => right.confidenceScore - left.confidenceScore)
    .slice(0, limit);

  return scored.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    uncertainty:
      candidate.confidenceScore < 0.72 ||
      (scored[index + 1] && candidate.confidenceScore - scored[index + 1].confidenceScore < 0.1),
  }));
}

export function searchCatalog(cards, query, limit = 12) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return cards.slice(0, limit);
  }

  const queryTokens = tokenize(normalizedQuery);

  return cards
    .map((card) => {
      const haystack = normalizeText(
        [card.playerName, card.year, card.brand, card.setName, card.subsetName, card.cardNumber, card.teamName]
          .filter(Boolean)
          .join(" "),
      );

      const tokenHits = queryTokens.filter((token) => haystack.includes(token)).length;
      const exactHit = haystack.includes(normalizedQuery) ? 0.4 : 0;
      const score = tokenHits / Math.max(queryTokens.length, 1) + exactHit;
      return {
        ...card,
        manualScore: score,
      };
    })
    .filter((card) => card.manualScore > 0)
    .sort((left, right) => right.manualScore - left.manualScore)
    .slice(0, limit);
}

function overlapScore(referenceTokens, ocrTokenSet, normalizedText) {
  if (!referenceTokens.length) {
    return 0;
  }

  let matches = 0;

  for (const token of referenceTokens) {
    if (ocrTokenSet.has(token) || normalizedText.includes(token)) {
      matches += 1;
    }
  }

  return matches / referenceTokens.length;
}

function cardNumberScore(cardNumber, numberTokens, detectedNumbers, normalizedText) {
  const cleanCardNumber = String(cardNumber || "").toLowerCase().replace(/^#/, "");
  if (!cleanCardNumber) {
    return 0;
  }

  if (detectedNumbers.includes(cleanCardNumber)) {
    return 1;
  }

  if (numberTokens.some((token) => normalizedText.includes(token))) {
    return 0.7;
  }

  if (normalizedText.includes(cleanCardNumber.replace(/[a-z]/g, ""))) {
    return 0.35;
  }

  return 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
