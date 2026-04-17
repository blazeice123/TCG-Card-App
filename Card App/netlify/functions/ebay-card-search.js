const EBAY_SEARCH_URL = "https://www.ebay.com/sch/i.html";
const EBAY_BROWSE_BASE_URL = "https://api.ebay.com/buy/browse/v1/item_summary";
const EBAY_OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";
const MARKETPLACE_ID = "EBAY_US";

exports.handler = async function handler(event) {
  const input = parseInput(event);
  const query = String(input.query || "").trim();
  const imageBase64 = extractBase64Image(input.imageDataUrl || input.image || "");
  const limit = clampLimit(input.limit);

  if (!query && !imageBase64) {
    return jsonResponse(400, {
      error: "Missing card photo or search words.",
    });
  }

  try {
    const apiResults = await searchWithBrowseApi({
      query,
      imageBase64,
      limit,
    });
    if (apiResults.candidates.length) {
      return jsonResponse(200, {
        ok: true,
        query,
        source: apiResults.source,
        note: apiResults.note,
        candidates: apiResults.candidates,
      });
    }

    if (query) {
      const scraped = await scrapeSearchResults(query, limit);
      return jsonResponse(200, {
        ok: true,
        query,
        source: "ebay_search_page",
        note: scraped.length
          ? "Showing close eBay cards from the main search page."
          : "Nothing close showed up from eBay yet.",
        candidates: scraped,
      });
    }

    return jsonResponse(200, {
      ok: true,
      query,
      source: "no_match",
      note: "We could not find a close card from this photo yet. Try adding player, year, set, or card number.",
      candidates: [],
    });
  } catch (error) {
    if (!query) {
      return jsonResponse(200, {
        ok: true,
        query,
        source: "error",
        note: `We hit a snag on eBay. ${error.message}`,
        candidates: [],
      });
    }

    try {
      const scraped = await scrapeSearchResults(query, limit);
      return jsonResponse(200, {
        ok: true,
        query,
        source: "ebay_search_page",
        note: scraped.length
          ? "Showing close eBay cards from the main search page."
          : `We hit a snag on eBay. ${error.message}`,
        candidates: scraped,
      });
    } catch (fallbackError) {
      return jsonResponse(200, {
        ok: true,
        query,
        source: "error",
        note: `We could not reach eBay right now. ${fallbackError.message}`,
        candidates: [],
      });
    }
  }
};

function parseInput(event) {
  if (event.httpMethod === "GET") {
    return event.queryStringParameters || {};
  }

  try {
    return JSON.parse(event.body || "{}");
  } catch (error) {
    return {};
  }
}

async function searchWithBrowseApi({ query, imageBase64, limit }) {
  const token = await getApplicationToken();
  if (!token) {
    return {
      source: "browse_unavailable",
      note: "eBay image matching is not set up yet on this site, so we are falling back to regular search.",
      candidates: [],
    };
  }

  const merged = new Map();
  const queryTokens = normalize(query).split(" ").filter(Boolean);
  let usedImageSearch = false;
  let imageSearchWorked = false;

  if (imageBase64) {
    try {
      const imageItems = await callBrowseImageSearch(token, imageBase64, limit);
      imageItems.forEach((item, index) => {
        const normalized = normalizeBrowseItem(item, queryTokens, {
          imageBoost: 0.28,
          rankBoost: Math.max(0, 0.18 - index * 0.02),
        });
        merged.set(normalized.itemWebUrl || normalized.itemId || `image_${index}`, normalized);
      });
      usedImageSearch = imageItems.length > 0;
      imageSearchWorked = true;
    } catch (error) {
      imageSearchWorked = false;
    }
  }

  if (query) {
    const queryItems = await callBrowseKeywordSearch(token, query, limit);
    queryItems.forEach((item, index) => {
      const normalized = normalizeBrowseItem(item, queryTokens, {
        rankBoost: Math.max(0, 0.14 - index * 0.015),
      });
      const key = normalized.itemWebUrl || normalized.itemId || `query_${index}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, normalized);
        return;
      }

      merged.set(key, {
        ...existing,
        confidenceScore: clamp(Math.max(existing.confidenceScore, normalized.confidenceScore) + 0.08, 0.25, 0.99),
      });
    });
  }

  const candidates = [...merged.values()]
    .sort((left, right) => {
      const scoreDiff = right.confidenceScore - left.confidenceScore;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return (right.priceValue || 0) - (left.priceValue || 0);
    })
    .slice(0, limit);

  return {
    source: usedImageSearch ? "ebay_browse_image" : "ebay_browse_search",
    note: usedImageSearch
      ? "Showing close cards from eBay photo matching and title matching."
      : imageBase64 && !imageSearchWorked
        ? "Photo matching hit a snag, so these cards are from eBay title matching instead."
        : "Showing close cards from eBay title matching.",
    candidates,
  };
}

async function getApplicationToken() {
  const clientId = process.env.EBAY_CLIENT_ID || "";
  const clientSecret = process.env.EBAY_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    return "";
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(EBAY_OAUTH_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: EBAY_SCOPE,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || "eBay sign-in failed.");
  }

  return payload.access_token;
}

async function callBrowseImageSearch(token, imageBase64, limit) {
  const response = await fetch(`${EBAY_BROWSE_BASE_URL}/search_by_image?limit=${limit}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-ebay-c-marketplace-id": MARKETPLACE_ID,
    },
    body: JSON.stringify({
      image: imageBase64,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message || "eBay image matching failed.");
  }

  return payload?.itemSummaries || [];
}

async function callBrowseKeywordSearch(token, query, limit) {
  const url = new URL(`${EBAY_BROWSE_BASE_URL}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      "x-ebay-c-marketplace-id": MARKETPLACE_ID,
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message || "eBay text search failed.");
  }

  return payload?.itemSummaries || [];
}

function normalizeBrowseItem(item, queryTokens, boosts = {}) {
  const title = String(item?.title || "").trim();
  const normalizedTitle = normalize(title);
  const titleTokens = normalizedTitle.split(" ").filter(Boolean);
  const titleScore = similarityScore(queryTokens, titleTokens);
  const confidenceScore = clamp(0.44 + titleScore * 0.42 + (boosts.imageBoost || 0) + (boosts.rankBoost || 0), 0.22, 0.99);

  return {
    itemId: String(item?.itemId || ""),
    title,
    subtitle: String(item?.condition || "").trim(),
    condition: String(item?.condition || "").trim(),
    imageUrl: item?.image?.imageUrl || item?.thumbnailImages?.[0]?.imageUrl || "",
    itemWebUrl: item?.itemWebUrl || item?.itemAffiliateWebUrl || item?.itemHref || "",
    priceText: formatPriceText(item?.price),
    priceValue: parseNumeric(item?.price?.value),
    pricingQuery: title,
    sourceLabel: boosts.imageBoost ? "eBay Photo Match" : "eBay Search",
    confidenceScore,
  };
}

async function scrapeSearchResults(query, limit) {
  const url = new URL(EBAY_SEARCH_URL);
  url.searchParams.set("_nkw", query);
  url.searchParams.set("rt", "nc");

  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  const html = await response.text();
  const challengeTriggered = /Pardon Our Interruption|Checking your browser before you access eBay/i.test(html);
  if (!response.ok || challengeTriggered) {
    throw new Error("eBay blocked the automatic card search.");
  }

  const queryTokens = normalize(query).split(" ").filter(Boolean);
  const blocks = html.match(/<li[^>]*class="[^"]*s-item[^"]*"[\s\S]*?<\/li>/gi) || [];

  return blocks
    .map((block, index) => {
      const title = decodeHtml(matchFirst(block, /s-item__title[^>]*>([\s\S]*?)<\/[^>]+>/i));
      const itemWebUrl = decodeHtml(matchFirst(block, /<a[^>]*class="[^"]*s-item__link[^"]*"[^>]*href="([^"]+)"/i));
      const priceText = decodeHtml(matchFirst(block, /s-item__price[^>]*>([\s\S]*?)<\/span>/i));
      const imageUrl = decodeHtml(
        matchFirst(block, /<img[^>]+(?:data-src|src)="([^"]+)"[^>]*class="[^"]*s-item__image-img[^"]*"/i) ||
          matchFirst(block, /<img[^>]+class="[^"]*s-item__image-img[^"]*"[^>]+(?:data-src|src)="([^"]+)"/i),
      );
      const condition = decodeHtml(matchFirst(block, /s-item__subtitle[^>]*>([\s\S]*?)<\/div>/i));
      const price = parsePrice(priceText);

      if (!title || !itemWebUrl || !price) {
        return null;
      }

      const similarity = similarityScore(queryTokens, normalize(title).split(" "));
      if (similarity < 0.24) {
        return null;
      }

      return {
        itemId: `scrape_${Date.now()}_${index}`,
        title,
        subtitle: condition,
        condition,
        imageUrl,
        itemWebUrl,
        priceText,
        priceValue: price.value,
        pricingQuery: title,
        sourceLabel: "eBay Search",
        confidenceScore: clamp(0.42 + similarity * 0.42, 0.2, 0.9),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.confidenceScore - left.confidenceScore)
    .slice(0, limit);
}

function extractBase64Image(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  return match ? match[1] : "";
}

function clampLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 6;
  }

  return Math.min(10, Math.max(3, parsed));
}

function parsePrice(priceText) {
  if (!priceText) {
    return null;
  }

  const priceExpression = /([\$\u00A3\u20AC])\s*([\d,.]+)(?:\s+to\s+[\$\u00A3\u20AC]?([\d,.]+))?/i;
  const match = priceText.match(priceExpression);
  if (!match) {
    return null;
  }

  const firstValue = Number.parseFloat(match[2].replace(/,/g, ""));
  const secondValue = match[3] ? Number.parseFloat(match[3].replace(/,/g, "")) : null;
  const priceValue = Number.isFinite(secondValue) ? (firstValue + secondValue) / 2 : firstValue;

  return {
    value: priceValue,
    currency: currencyCode(match[1]),
  };
}

function parseNumeric(value) {
  const parsed = Number.parseFloat(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPriceText(price) {
  if (!price?.value) {
    return "";
  }

  const symbol = price.currency === "GBP" ? "\u00A3" : price.currency === "EUR" ? "\u20AC" : "$";
  return `${symbol}${Number(price.value).toFixed(2)}`;
}

function similarityScore(referenceTokens, candidateTokens) {
  if (!referenceTokens.length || !candidateTokens.length) {
    return 0;
  }

  const candidateSet = new Set(candidateTokens.filter(Boolean));
  const hits = referenceTokens.filter((token) => candidateSet.has(token)).length;
  return hits / referenceTokens.length;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9\s#/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchFirst(value, expression) {
  const match = value.match(expression);
  return match ? match[1] : "";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function currencyCode(symbol) {
  switch (symbol) {
    case "\u00A3":
      return "GBP";
    case "\u20AC":
      return "EUR";
    default:
      return "USD";
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}
