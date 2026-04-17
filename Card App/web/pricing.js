import { buildSearchQuery } from "./catalog.js";

export function buildSoldSearchUrl(card) {
  const query = buildSearchQuery(card);
  const params = new URLSearchParams({
    _nkw: query,
    LH_Sold: "1",
    LH_Complete: "1",
    rt: "nc",
  });

  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

export async function fetchPriceEstimate(card) {
  const query = buildSearchQuery(card);
  if (!query) {
    throw new Error("Cannot price a card without a confirmed catalog match.");
  }

  const response = await fetch(`/.netlify/functions/ebay-pricing?query=${encodeURIComponent(query)}`);
  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || "Pricing lookup failed.");
  }

  return {
    ...payload,
    soldSearchUrl: payload?.soldSearchUrl || buildSoldSearchUrl(card),
  };
}
