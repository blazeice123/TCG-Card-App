import { buildSearchQuery, extractCardNumbers, normalizeText } from "./catalog.js";

const QUERY_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "card",
  "team",
  "league",
  "baseball",
  "basketball",
  "football",
  "front",
  "back",
  "topps",
]);

export function buildSoldSearchUrl(searchInput) {
  const query = resolveSearchQuery(searchInput);
  const params = new URLSearchParams({
    _nkw: query,
    LH_Sold: "1",
    LH_Complete: "1",
    rt: "nc",
  });

  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

export async function fetchPriceEstimate(searchInput) {
  const query = resolveSearchQuery(searchInput);
  if (!query) {
    throw new Error("Save the right card first, then check value.");
  }

  const response = await fetch(`/.netlify/functions/ebay-pricing?query=${encodeURIComponent(query)}`);
  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || "We could not grab a value right now.");
  }

  return {
    ...payload,
    soldSearchUrl: payload?.soldSearchUrl || buildSoldSearchUrl(query),
  };
}

export async function fetchEbayMatches({ searchQuery, imageDataUrl, limit = 6 } = {}) {
  const query = resolveSearchQuery(searchQuery);
  if (!query && !imageDataUrl) {
    return {
      candidates: [],
      note: "Give us a photo or a few search words first.",
      source: "empty",
    };
  }

  const response = await fetch("/.netlify/functions/ebay-card-search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query,
      imageDataUrl: imageDataUrl || "",
      limit,
    }),
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || "We could not search eBay right now.");
  }

  return {
    ...payload,
    candidates: (payload?.candidates || []).map((candidate, index) =>
      buildCandidateFromListing(candidate, query, index),
    ),
  };
}

export function buildEbaySearchText(readText) {
  const normalized = normalizeText(readText);
  if (!normalized) {
    return "";
  }

  const rawTokens = normalized.split(" ").filter(Boolean);
  const yearTokens = rawTokens.filter((token) => /^(19|20)\d{2}$/.test(token));
  const numberTokens = extractCardNumbers(readText).slice(0, 2);
  const keptTokens = [];

  yearTokens.slice(0, 1).forEach((token) => pushUnique(keptTokens, token));

  rawTokens.forEach((token) => {
    if (
      token.length < 3 ||
      QUERY_STOP_WORDS.has(token) ||
      /^(19|20)\d{2}$/.test(token) ||
      /^[a-z]*\d+[a-z]*$/.test(token)
    ) {
      return;
    }

    pushUnique(keptTokens, token);
  });

  numberTokens.forEach((token) => pushUnique(keptTokens, token));

  if (!keptTokens.includes("card")) {
    keptTokens.push("card");
  }

  return keptTokens.slice(0, 7).join(" ").trim();
}

export function buildCandidateFromListing(listing, searchQuery, index) {
  const displayTitle = String(listing.title || "").trim();
  const yearMatch = displayTitle.match(/\b(19|20)\d{2}\b/);
  const numberTokens = extractCardNumbers(displayTitle);
  return {
    catalogCardId: String(listing.itemId || listing.catalogCardId || `ebay_${Date.now()}_${index}`),
    playerName: displayTitle || "eBay card",
    setName: "",
    cardNumber: numberTokens[0] || "",
    year: yearMatch?.[0] || "",
    brand: String(listing.sourceLabel || "eBay"),
    displayLabel: displayTitle,
    title: displayTitle,
    imageUrl: listing.imageUrl || "",
    itemWebUrl: listing.itemWebUrl || listing.url || "",
    priceText: listing.priceText || "",
    priceValue: toNumber(listing.priceValue),
    condition: String(listing.condition || "").trim(),
    subtitle: String(listing.subtitle || "").trim(),
    searchQuery,
    pricingQuery: String(listing.pricingQuery || displayTitle || searchQuery || "").trim(),
    confidenceScore: clamp(Number(listing.confidenceScore ?? listing.similarity) || 0.42, 0.2, 0.98),
  };
}

function resolveSearchQuery(searchInput) {
  if (typeof searchInput === "string") {
    return searchInput.trim();
  }

  return buildSearchQuery(searchInput);
}

function pushUnique(collection, token) {
  if (!token || collection.includes(token)) {
    return;
  }

  collection.push(token);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
