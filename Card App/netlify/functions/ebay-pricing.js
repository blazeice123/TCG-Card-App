const EBAY_BASE_URL = "https://www.ebay.com/sch/i.html";

exports.handler = async function handler(event) {
  const query = event.queryStringParameters?.query?.trim();
  if (!query) {
    return jsonResponse(400, {
      error: "Missing price search text.",
    });
  }

  const soldSearchUrl = buildSoldSearchUrl(query);

  try {
    const response = await fetch(soldSearchUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const html = await response.text();
    const challengeTriggered = /Pardon Our Interruption|Checking your browser before you access eBay/i.test(html);

    if (!response.ok || challengeTriggered) {
      return jsonResponse(200, {
        ok: true,
        mode: "manual",
        estimate: null,
        sampleSize: 0,
        query,
        soldSearchUrl,
        note: challengeTriggered
          ? "eBay blocked the automatic check. Open sold listings and type in a price by hand."
          : `eBay returned ${response.status}. Open sold listings and type in a price by hand.`,
      });
    }

    const comparableListings = parseComparableListings(html, query).slice(0, 8);
    if (!comparableListings.length) {
      return jsonResponse(200, {
        ok: true,
        mode: "manual",
        estimate: null,
        sampleSize: 0,
        query,
        soldSearchUrl,
        note: "We could not find a clean automatic price. Open sold listings and add one by hand.",
      });
    }

    return jsonResponse(200, {
      ok: true,
      mode: "automatic",
      estimate: computeMedian(comparableListings.map((listing) => listing.priceValue)),
      currency: comparableListings[0].currency || "USD",
      sampleSize: comparableListings.length,
      query,
      soldSearchUrl,
      note: "Quick estimate from recent eBay sold listings.",
      comparableListings,
    });
  } catch (error) {
    return jsonResponse(200, {
      ok: true,
      mode: "manual",
      estimate: null,
      sampleSize: 0,
      query,
      soldSearchUrl,
      note: `We could not check eBay automatically. ${error.message}`,
    });
  }
};

function buildSoldSearchUrl(query) {
  const params = new URLSearchParams({
    _nkw: query,
    LH_Sold: "1",
    LH_Complete: "1",
    rt: "nc",
  });

  return `${EBAY_BASE_URL}?${params.toString()}`;
}

function parseComparableListings(html, query) {
  const blocks = html.match(/<li[^>]*class="[^"]*s-item[^"]*"[\s\S]*?<\/li>/gi) || [];
  const queryTokens = normalize(query).split(" ").filter(Boolean);

  return blocks
    .map((block) => {
      const title = decodeHtml(matchFirst(block, /s-item__title[^>]*>([\s\S]*?)<\/[^>]+>/i));
      const href = decodeHtml(matchFirst(block, /<a[^>]*class="[^"]*s-item__link[^"]*"[^>]*href="([^"]+)"/i));
      const priceText = decodeHtml(matchFirst(block, /s-item__price[^>]*>([\s\S]*?)<\/span>/i));
      const price = parsePrice(priceText);

      if (!title || !href || !price) {
        return null;
      }

      const titleScore = similarityScore(queryTokens, normalize(title).split(" "));
      if (titleScore < 0.32) {
        return null;
      }

      return {
        title,
        url: href,
        priceText,
        priceValue: price.value,
        currency: price.currency,
        similarity: titleScore,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.similarity - left.similarity);
}

function parsePrice(priceText) {
  if (!priceText) {
    return null;
  }

  const priceExpression = new RegExp(String.raw`([\$\u00A3\u20AC])\s*([\d,.]+)(?:\s+to\s+[\$\u00A3\u20AC]?([\d,.]+))?`, "i");
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

function computeMedian(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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
