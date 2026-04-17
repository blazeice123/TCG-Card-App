import {
  buildSearchQuery,
  matchCatalogCards,
  parseCatalogCsv,
  searchCatalog,
  summarizeCatalog,
} from "./catalog.js";
import {
  buildDemoCatalogCsv,
  DEMO_PRICE_ESTIMATES,
  generateDemoCardAsset,
  generateDemoImage,
} from "./demo-data.js";
import { buildSoldSearchUrl, fetchPriceEstimate } from "./pricing.js";
import {
  detectCropsFromImage,
  getEngineStatusText,
  loadImageFile,
  loadImageSource,
  runOcr,
} from "./scanner.js";
import {
  createId,
  loadState,
  resetCatalog,
  resetCollection,
  resetSessions,
  saveState,
} from "./storage.js";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const state = loadState();

const ui = {
  activeScreen: "collection",
  collectionFilter: state.appSettings.lastCollectionFilter || "all",
  scanBusy: false,
  selectedCropId: null,
  pendingSourcePreview: null,
  statusMessage:
    "Start with one full photo. If that gets messy, snap one card at a time.",
};

const refs = {
  catalogInput: document.querySelector("#catalogInput"),
  imageInput: document.querySelector("#imageInput"),
  scanActionButton: document.querySelector("#scanActionButton"),
  manualActionButton: document.querySelector("#manualActionButton"),
  queuePill: document.querySelector("#queuePill"),
  statusBanner: document.querySelector("#statusBanner"),
  totalCardsStat: document.querySelector("#totalCardsStat"),
  collectionValueStat: document.querySelector("#collectionValueStat"),
  highestCardName: document.querySelector("#highestCardName"),
  highestCardValue: document.querySelector("#highestCardValue"),
  recentSummary: document.querySelector("#recentSummary"),
  recentRail: document.querySelector("#recentRail"),
  collectionSummary: document.querySelector("#collectionSummary"),
  collectionFilters: document.querySelector("#collectionFilters"),
  collectionGrid: document.querySelector("#collectionGrid"),
  scanModeRow: document.querySelector("#scanModeRow"),
  pickImageButton: document.querySelector("#pickImageButton"),
  demoScanButton: document.querySelector("#demoScanButton"),
  scanButton: document.querySelector("#scanButton"),
  clearSessionButton: document.querySelector("#clearSessionButton"),
  sourcePreview: document.querySelector("#sourcePreview"),
  emptyPreview: document.querySelector("#emptyPreview"),
  engineStatus: document.querySelector("#engineStatus"),
  cropSummary: document.querySelector("#cropSummary"),
  cropGrid: document.querySelector("#cropGrid"),
  reviewSummary: document.querySelector("#reviewSummary"),
  reviewPane: document.querySelector("#reviewPane"),
  catalogImportButton: document.querySelector("#catalogImportButton"),
  demoCatalogButton: document.querySelector("#demoCatalogButton"),
  loadTemplateButton: document.querySelector("#loadTemplateButton"),
  resetCatalogButton: document.querySelector("#resetCatalogButton"),
  catalogSummary: document.querySelector("#catalogSummary"),
  catalogTableBody: document.querySelector("#catalogTableBody"),
  catalogCountMeta: document.querySelector("#catalogCountMeta"),
  reviewCountMeta: document.querySelector("#reviewCountMeta"),
  collectionCountMeta: document.querySelector("#collectionCountMeta"),
  demoResultsButton: document.querySelector("#demoResultsButton"),
  exportCollectionButton: document.querySelector("#exportCollectionButton"),
  resetCollectionButton: document.querySelector("#resetCollectionButton"),
  navButtons: [...document.querySelectorAll(".bottom-nav__item")],
  screenJumpButtons: [...document.querySelectorAll("[data-screen-jump]")],
  screens: [...document.querySelectorAll(".screen")],
};

bindEvents();
bootstrapEngines();
cleanupCachedShell();
render();
applyLaunchPreset();

function bindEvents() {
  refs.catalogInput.addEventListener("change", handleCatalogImport);
  refs.imageInput.addEventListener("change", handleImageSelected);

  refs.scanActionButton.addEventListener("click", () => {
    state.appSettings.lastScanMode = "page";
    saveState(state);
    showScreen("scan");
    triggerImagePicker();
  });

  refs.manualActionButton.addEventListener("click", () => {
    state.appSettings.lastScanMode = "single";
    saveState(state);
    setStatus("Single-card is on. Pick one clear front photo and we will handle the rest.");
    showScreen("scan");
    triggerImagePicker();
  });

  refs.catalogImportButton.addEventListener("click", () => {
    showScreen("catalog");
    triggerCatalogPicker();
  });

  refs.demoCatalogButton.addEventListener("click", () => {
    loadDemoCatalog();
    showScreen("catalog");
  });

  refs.loadTemplateButton.addEventListener("click", () => {
    window.open("./catalog-template.csv", "_blank", "noreferrer");
  });

  refs.resetCatalogButton.addEventListener("click", () => {
    resetCatalog(state);
    state.appSettings.lastCatalogErrors = [];
    setStatus("Your list is cleared.");
    render();
  });

  refs.pickImageButton.addEventListener("click", triggerImagePicker);
  refs.demoScanButton.addEventListener("click", handleGenerateDemoImage);
  refs.scanButton.addEventListener("click", handleScan);
  refs.clearSessionButton.addEventListener("click", () => {
    resetSessions(state);
    ui.selectedCropId = null;
    ui.pendingSourcePreview = null;
    refs.imageInput.value = "";
    setStatus("That photo is cleared.");
    render();
  });

  refs.collectionFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) {
      return;
    }

    ui.collectionFilter = button.dataset.filter;
    state.appSettings.lastCollectionFilter = ui.collectionFilter;
    saveState(state);
    render();
  });

  refs.scanModeRow.addEventListener("click", (event) => {
    const button = event.target.closest("[data-scan-mode]");
    if (!button) {
      return;
    }

    state.appSettings.lastScanMode = button.dataset.scanMode;
    saveState(state);
    render();
  });

  refs.recentRail.addEventListener("click", handleCropSelection);
  refs.cropGrid.addEventListener("click", handleCropSelection);
  refs.reviewPane.addEventListener("change", handleReviewChange);
  refs.reviewPane.addEventListener("click", handleReviewClick);

  refs.exportCollectionButton.addEventListener("click", exportCollection);
  refs.demoResultsButton.addEventListener("click", seedDemoResults);
  refs.resetCollectionButton.addEventListener("click", () => {
    resetCollection(state);
    setStatus("Your saved cards are cleared.");
    render();
  });

  refs.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showScreen(button.dataset.screen);
    });
  });

  refs.screenJumpButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showScreen(button.dataset.screenJump);
    });
  });
}

async function bootstrapEngines() {
  refs.engineStatus.textContent = getEngineStatusText();
}

function triggerImagePicker() {
  refs.imageInput.value = "";
  refs.imageInput.click();
}

function triggerCatalogPicker() {
  refs.catalogInput.value = "";
  refs.catalogInput.click();
}

async function handleCatalogImport(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = parseCatalogCsv(text);
    state.catalogCards = parsed.cards;
    state.appSettings.lastCatalogImportAt = new Date().toISOString();
    state.appSettings.lastCatalogErrors = parsed.errors;
    saveState(state);
    setStatus(
      parsed.errors.length
        ? `Added ${parsed.cards.length} cards. ${parsed.errors.length} line${parsed.errors.length === 1 ? "" : "s"} still need a quick fix.`
        : `Added ${parsed.cards.length} cards to your list.`,
    );
    showScreen("catalog");
    render();
  } catch (error) {
    setStatus(`That list would not open. ${error.message}`);
  }
}

function loadDemoCatalog() {
  try {
    const parsed = parseCatalogCsv(buildDemoCatalogCsv());
    state.catalogCards = parsed.cards;
    state.appSettings.lastCatalogImportAt = new Date().toISOString();
    state.appSettings.lastCatalogErrors = parsed.errors;
    saveState(state);
    setStatus(`Sample cards are ready with ${parsed.cards.length} cards.`);
    render();
  } catch (error) {
    setStatus(`The sample cards would not load. ${error.message}`);
  }
}

async function handleImageSelected(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const preview = await fileToDataUrl(file).catch(() => null);
  ui.pendingSourcePreview = preview
    ? {
        name: file.name,
        dataUrl: preview,
      }
    : null;

  showScreen("scan");
  setStatus(`Picked ${file.name}. Tap Find My Cards when you are ready.`);
  render();
}

async function handleGenerateDemoImage() {
  const mode = state.appSettings.lastScanMode || "page";
  if (!state.catalogCards.length) {
    loadDemoCatalog();
  }

  setStatus(mode === "single" ? "Getting a sample card ready..." : "Getting a sample photo ready...");
  render();
  await pauseForUi();
  const demoImage = generateDemoImage(mode);
  refs.imageInput.value = "";
  ui.pendingSourcePreview = {
    name: demoImage.name,
    dataUrl: demoImage.dataUrl,
  };

  showScreen("scan");
  setStatus(
    mode === "single"
      ? "Sample card is ready. Tap Find My Cards to give it a spin."
      : "Sample photo is ready. Tap Find My Cards and we will split it up for you.",
  );
  render();
}

function applyLaunchPreset() {
  const params = new URLSearchParams(window.location.search);
  const demoMode = params.get("demo");
  const seedDemo = params.get("seed") === "1";
  const requestedScreen = params.get("screen") || window.location.hash.replace(/^#/, "");
  const openRequestedScreen = () => {
    if (requestedScreen && refs.screens.some((screen) => screen.dataset.screen === requestedScreen)) {
      showScreen(requestedScreen);
    }
  };

  if (seedDemo) {
    window.setTimeout(async () => {
      await seedDemoResults();
      openRequestedScreen();
    }, 0);
    return;
  }

  if (!demoMode) {
    openRequestedScreen();
    return;
  }

  window.setTimeout(async () => {
    state.appSettings.lastScanMode = demoMode === "single" ? "single" : "page";
    saveState(state);
    loadDemoCatalog();
    await handleGenerateDemoImage();

    if (params.get("autorun") === "1") {
      window.setTimeout(() => {
        handleScan();
      }, 120);
    }

    openRequestedScreen();
  }, 0);
}

async function seedDemoResults() {
  const parsed = parseCatalogCsv(buildDemoCatalogCsv());
  const cards = parsed.cards;
  const startedAt = new Date().toISOString();
  const session = {
    sessionId: "demo_session_seeded",
    sourceName: "demo-seeded-session",
    sourceDataUrl: "",
    mode: "page",
    startedAt,
    status: "review",
    crops: [],
  };

  state.catalogCards = cards;
  state.scanSessions = [];
  state.collectionCards = [];
  state.priceSnapshots = [];
  state.correctionEvents = [];
  state.appSettings.lastCatalogImportAt = startedAt;
  state.appSettings.lastCatalogErrors = [];
  state.appSettings.lastCollectionFilter = "all";
  ui.collectionFilter = "all";
  setStatus("Loading sample cards...");
  render();

  for (let index = 0; index < cards.length; index += 1) {
    if (index > 0 && index % 2 === 0) {
      await pauseForUi();
    }

    const card = cards[index];
    const asset = generateDemoCardAsset(card.catalogCardId);
    const cropId = `demo_crop_${index + 1}`;
    const confirmed = index < 4;
    const collectionCardId = confirmed ? `demo_collection_${index + 1}` : "";
    const latestPriceSnapshotId = confirmed ? `demo_price_${index + 1}` : "";
    const estimate = DEMO_PRICE_ESTIMATES[card.catalogCardId] || null;
    const confidenceScore = Math.max(0.74, 0.96 - index * 0.04);

    if (confirmed && estimate) {
      state.priceSnapshots.unshift({
        priceSnapshotId: latestPriceSnapshotId,
        collectionCardId,
        amountUsd: estimate,
        mode: "automatic",
        source: "ebay",
        observedAt: new Date(Date.now() - index * 3600000).toISOString(),
        soldSearchUrl: buildSoldSearchUrl(card),
        note: "Sample value based on recent eBay sales.",
        comparableListings: [],
      });

      state.collectionCards.unshift({
        collectionCardId,
        cropId,
        imageDataUrl: asset.dataUrl,
        addedAt: new Date(Date.now() - index * 86400000).toISOString(),
        latestPriceSnapshotId,
        catalogCardId: card.catalogCardId,
        playerNameSnapshot: card.playerName,
        setNameSnapshot: card.setName,
        cardNumberSnapshot: card.cardNumber,
        sportSnapshot: card.sport,
        teamNameSnapshot: card.teamName,
        yearSnapshot: card.year,
        searchQuery: buildSearchQuery(card),
        note: "Sample card added so you can click around.",
      });
    }

    session.crops.push({
      cropId,
      scannedAt: new Date(Date.now() - index * 120000).toISOString(),
      imageDataUrl: asset.dataUrl,
      bounds: {
        left: 0,
        top: 0,
        right: 460,
        bottom: 644,
      },
      note: confirmed ? "Sample card already saved." : "Sample card still needs your okay.",
      ocrText: `${card.year} ${card.brand} ${card.setName} ${card.playerName} ${card.cardNumber} ${card.teamName}`,
      ocrConfidence: 0.93,
      ocrError: "",
      matchCandidates: [
        {
          ...card,
          confidenceScore,
          playerScore: 1,
          setScore: 0.92,
          cardNumberScore: 1,
          displayLabel: `${card.playerName} - ${card.year} ${card.brand} ${card.setName} #${card.cardNumber}`,
          rank: 1,
          uncertainty: !confirmed,
        },
      ],
      selectedCatalogCardId: card.catalogCardId,
      manualSearch: "",
      reviewStatus: confirmed ? "confirmed" : "pending",
      unknownFlag: false,
      pricing: confirmed
        ? {
            mode: "automatic",
            estimate,
            soldSearchUrl: buildSoldSearchUrl(card),
            note: "Sample value already saved.",
            comparableListings: [],
          }
        : null,
      collectionCardId,
    });
  }

  state.scanSessions = [session];
  ui.selectedCropId = session.crops.find((crop) => crop.reviewStatus === "pending")?.cropId || session.crops[0]?.cropId || null;
  ui.pendingSourcePreview = null;
  ui.activeScreen = "collection";
  saveState(state);
  setStatus("Sample cards are loaded, so you can tap around right away.");
  render();
}

async function handleScan() {
  const file = refs.imageInput.files?.[0];
  const previewSource = ui.pendingSourcePreview;
  if ((!file && !previewSource) || ui.scanBusy) {
    if (!file && !previewSource) {
      setStatus("Pick a photo first.");
    }
    return;
  }

  ui.scanBusy = true;
  refs.scanButton.disabled = true;
  refs.scanButton.textContent = "Working...";

  try {
    const mode = state.appSettings.lastScanMode || "page";
    setStatus("Getting your photo ready...");
    render();
    await pauseForUi();
    const loaded = file
      ? await loadImageFile(file)
      : await loadImageSource(previewSource.dataUrl, previewSource.name);
    ui.pendingSourcePreview = {
      name: loaded.fileName,
      dataUrl: loaded.dataUrl,
    };

    const session = {
      sessionId: createId("session"),
      sourceName: loaded.fileName,
      sourceDataUrl: loaded.dataUrl,
      mode,
      startedAt: new Date().toISOString(),
      status: "processing",
      crops: [],
    };

    state.scanSessions.push(session);
    saveState(state);
    render();

    setStatus(mode === "page" ? "Looking for cards in your photo..." : "Using single-card view...");
    render();
    const detectedCrops = await detectCropsFromImage(loaded.dataUrl, mode);
    setStatus(`Found ${detectedCrops.length} ${detectedCrops.length === 1 ? "card" : "cards"}. Reading the details now...`);
    render();

    for (let index = 0; index < detectedCrops.length; index += 1) {
      const detectedCrop = detectedCrops[index];
      const ocrResult = await runOcr(detectedCrop.imageDataUrl).catch((error) => ({
        text: "",
        confidence: null,
        error: error.message,
      }));
      const candidates = matchCatalogCards(state.catalogCards, ocrResult.text, 5);

      session.crops.push({
        cropId: detectedCrop.cropId,
        scannedAt: new Date().toISOString(),
        imageDataUrl: detectedCrop.imageDataUrl,
        bounds: detectedCrop.bounds,
        note: detectedCrop.note,
        ocrText: ocrResult.text,
        ocrConfidence: ocrResult.confidence,
        ocrError: ocrResult.error || "",
        matchCandidates: candidates,
        selectedCatalogCardId: candidates[0]?.catalogCardId || "",
        manualSearch: "",
        reviewStatus: "pending",
        unknownFlag: false,
        pricing: null,
        collectionCardId: "",
      });

      ui.selectedCropId = detectedCrop.cropId;
      saveState(state);
      render();
      setStatus(`Checked card ${index + 1} of ${detectedCrops.length}.`);

      if (index < detectedCrops.length - 1) {
        await pauseForUi();
      }
    }

    session.status = "review";
    ui.pendingSourcePreview = null;
    ensureSelectedCrop();
    showScreen("review");
    saveState(state);
    setStatus("Your cards are ready. Save the right one before checking value.");
    render();
  } catch (error) {
    setStatus(`That photo did not work. ${error.message}`);
  } finally {
    ui.scanBusy = false;
    refs.scanButton.disabled = false;
    refs.scanButton.textContent = "Find My Cards";
    render();
  }
}

function handleCropSelection(event) {
  const button = event.target.closest("[data-crop-id]");
  if (!button) {
    return;
  }

  ui.selectedCropId = button.dataset.cropId;
  showScreen("review");
  render();
}

function handleReviewChange(event) {
  const selected = getSelectedCrop();
  if (!selected) {
    return;
  }

  if (event.target.name === "candidateChoice") {
    selected.crop.selectedCatalogCardId = event.target.value;
    saveState(state);
    render();
    return;
  }

  if (event.target.name === "manualSearch") {
    selected.crop.manualSearch = event.target.value;
    saveState(state);
    render();
    return;
  }

  if (event.target.name === "manualChoice") {
    selected.crop.selectedCatalogCardId = event.target.value;
    saveState(state);
    render();
  }
}

async function handleReviewClick(event) {
  const cropButton = event.target.closest("[data-crop-id]");
  if (cropButton) {
    ui.selectedCropId = cropButton.dataset.cropId;
    render();
    return;
  }

  const action = event.target.dataset.action;
  if (!action) {
    return;
  }

  const selected = getSelectedCrop();
  if (!selected) {
    return;
  }

  if (action === "confirm") {
    await confirmSelectedCrop(selected);
    return;
  }

  if (action === "unknown") {
    saveUnknownCrop(selected);
    return;
  }

  if (action === "manual-price") {
    saveManualPrice(selected);
  }
}

async function confirmSelectedCrop(selected) {
  const card = findCatalogCard(selected.crop.selectedCatalogCardId);
  if (!card) {
    setStatus("Pick the right card from your list, or save this one for later.");
    return;
  }

  const previousTopCandidateId = selected.crop.matchCandidates[0]?.catalogCardId || "";
  if (previousTopCandidateId && previousTopCandidateId !== selected.crop.selectedCatalogCardId) {
    state.correctionEvents.push({
      correctionEventId: createId("correction"),
      cropId: selected.crop.cropId,
      eventType: "match_override",
      previousValue: previousTopCandidateId,
      correctedValue: selected.crop.selectedCatalogCardId,
      createdAt: new Date().toISOString(),
    });
  }

  selected.crop.reviewStatus = "confirmed";
  selected.crop.unknownFlag = false;
  selected.crop.pricing = {
    status: "loading",
    note: "Checking recent eBay sales...",
  };

  const collectionCard = upsertCollectionCard(selected.crop, card);
  selected.crop.collectionCardId = collectionCard.collectionCardId;
  saveState(state);
  render();

  try {
    const pricing = await fetchPriceEstimate(card);
    selected.crop.pricing = pricing;

    if (pricing.mode === "automatic" && Number.isFinite(pricing.estimate)) {
      const snapshot = savePriceSnapshot(collectionCard.collectionCardId, pricing.estimate, pricing);
      collectionCard.latestPriceSnapshotId = snapshot.priceSnapshotId;
      setStatus(`Saved ${card.playerName} with a quick value check.`);
    } else {
      setStatus(`Saved ${card.playerName}. Add a sale price if you want one now.`);
    }
  } catch (error) {
    selected.crop.pricing = {
      status: "manual",
      note: error.message,
      soldSearchUrl: buildSoldSearchUrl(card),
    };
    setStatus(`Saved ${card.playerName}. You can add a price yourself from eBay sales.`);
  }

  saveState(state);
  render();
}

function saveUnknownCrop(selected) {
  selected.crop.reviewStatus = "unknown";
  selected.crop.unknownFlag = true;
  selected.crop.selectedCatalogCardId = "";
  selected.crop.pricing = null;

  upsertCollectionCard(selected.crop, null);
  state.correctionEvents.push({
    correctionEventId: createId("correction"),
    cropId: selected.crop.cropId,
    eventType: "manual_unknown",
    createdAt: new Date().toISOString(),
  });

  saveState(state);
  setStatus("Saved this card for later without forcing a bad guess.");
  render();
}

function saveManualPrice(selected) {
  const input = refs.reviewPane.querySelector('[name="manualPrice"]');
  const value = Number.parseFloat(input?.value || "");
  if (!Number.isFinite(value) || value <= 0) {
    setStatus("Type in a sale price first.");
    return;
  }

  const collectionCardId =
    selected.crop.collectionCardId ||
    upsertCollectionCard(selected.crop, findCatalogCard(selected.crop.selectedCatalogCardId)).collectionCardId;
  const card = state.collectionCards.find((entry) => entry.collectionCardId === collectionCardId);
  const snapshot = savePriceSnapshot(collectionCardId, value, {
    mode: "manual",
    note: "Price added by you.",
    soldSearchUrl:
      selected.crop.pricing?.soldSearchUrl || buildSoldSearchUrl(findCatalogCard(selected.crop.selectedCatalogCardId)),
  });

  if (card) {
    card.latestPriceSnapshotId = snapshot.priceSnapshotId;
  }

  if (selected.crop.pricing) {
    selected.crop.pricing.note = "Price added by you.";
  } else {
    selected.crop.pricing = {
      mode: "manual",
      estimate: value,
      soldSearchUrl: snapshot.soldSearchUrl,
      note: "Price added by you.",
    };
  }

  saveState(state);
  setStatus("Saved that price to your collection.");
  render();
}

function upsertCollectionCard(crop, card) {
  const existing = state.collectionCards.find((entry) => entry.cropId === crop.cropId);
  const collectionCard =
    existing ||
    {
      collectionCardId: createId("collection"),
      cropId: crop.cropId,
      imageDataUrl: crop.imageDataUrl,
      addedAt: new Date().toISOString(),
      latestPriceSnapshotId: "",
    };

  collectionCard.catalogCardId = card?.catalogCardId || "";
  collectionCard.playerNameSnapshot = card?.playerName || "Unknown card";
  collectionCard.setNameSnapshot = card?.setName || "";
  collectionCard.cardNumberSnapshot = card?.cardNumber || "";
  collectionCard.sportSnapshot = card?.sport || "";
  collectionCard.teamNameSnapshot = card?.teamName || "";
  collectionCard.yearSnapshot = card?.year || "";
  collectionCard.searchQuery = card ? buildSearchQuery(card) : "";
  collectionCard.note = crop.note || "";

  if (!existing) {
    state.collectionCards.unshift(collectionCard);
  }

  return collectionCard;
}

function savePriceSnapshot(collectionCardId, amount, pricing) {
  const snapshot = {
    priceSnapshotId: createId("price"),
    collectionCardId,
    amountUsd: amount,
    mode: pricing.mode || "manual",
    source: "ebay",
    observedAt: new Date().toISOString(),
    soldSearchUrl: pricing.soldSearchUrl || "",
    note: pricing.note || "",
    comparableListings: pricing.comparableListings || [],
  };

  state.priceSnapshots.unshift(snapshot);
  return snapshot;
}

function exportCollection() {
  const payload = {
    exportedAt: new Date().toISOString(),
    collectionCards: state.collectionCards,
    priceSnapshots: state.priceSnapshots,
    scanSessions: state.scanSessions,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "my-card-collection.json";
  link.click();
  URL.revokeObjectURL(url);
}

function render() {
  const allCrops = getAllCropsSorted();
  ensureSelectedCrop();

  const pendingCount = getPendingReviewCount(allCrops);
  const collectionValue = getCollectionValue();
  const highestCard = getHighestCard();
  const filteredCollection = getFilteredCollectionCards();
  const latestSession = getLatestSession();

  refs.statusBanner.textContent = ui.statusMessage;
  refs.totalCardsStat.textContent = String(state.collectionCards.length);
  refs.collectionValueStat.textContent = formatCurrency(collectionValue);
  refs.highestCardName.textContent = highestCard?.playerNameSnapshot || "No value yet";
  refs.highestCardValue.textContent = highestCard
    ? formatCurrency(findLatestSnapshot(highestCard)?.amountUsd || 0)
    : "Save a card to see your top hit";
  refs.queuePill.textContent = `${pendingCount} waiting`;

  refs.recentSummary.textContent = allCrops.length
    ? `${Math.min(allCrops.length, 6)} newest cards from your latest photo.`
    : "Your newest cards show up here.";
  refs.collectionSummary.textContent = filteredCollection.length
    ? `${filteredCollection.length} ${filteredCollection.length === 1 ? "card" : "cards"} in this view.`
    : "Cards you save show up here.";

  refs.engineStatus.textContent = getEngineStatusText();
  refs.cropSummary.textContent = latestSession
    ? `${latestSession.crops.length} ${latestSession.crops.length === 1 ? "card" : "cards"} found in your latest photo`
    : "Nothing yet";
  refs.reviewSummary.textContent = pendingCount
    ? `${pendingCount} ${pendingCount === 1 ? "card still needs" : "cards still need"} your okay.`
    : "You are all caught up.";

  refs.catalogSummary.textContent = summarizeCatalog(state.catalogCards, state.appSettings.lastCatalogErrors || []);
  refs.catalogCountMeta.textContent = String(state.catalogCards.length);
  refs.reviewCountMeta.textContent = String(pendingCount);
  refs.collectionCountMeta.textContent = String(state.collectionCards.length);

  refs.recentRail.innerHTML = renderRecentRail(allCrops.slice(0, 8));
  refs.collectionGrid.innerHTML = renderCollectionCards(filteredCollection);
  refs.cropGrid.innerHTML = renderScanCropRail(latestSession?.crops || []);
  refs.reviewPane.innerHTML = renderReviewPane(allCrops);
  refs.catalogTableBody.innerHTML = renderCatalogRows();

  renderPreview(latestSession);
  renderActiveScreen();
  renderFilterChips();
  renderScanModeChips();
}

function renderPreview(latestSession) {
  const previewSource = ui.pendingSourcePreview?.dataUrl || latestSession?.sourceDataUrl || "";
  const previewLabel = ui.pendingSourcePreview?.name || latestSession?.sourceName || "Selected scan";

  if (previewSource) {
    refs.sourcePreview.hidden = false;
    refs.sourcePreview.src = previewSource;
    refs.sourcePreview.alt = previewLabel;
    refs.emptyPreview.style.display = "none";
  } else {
    refs.sourcePreview.hidden = true;
    refs.sourcePreview.removeAttribute("src");
    refs.emptyPreview.style.display = "grid";
  }
}

function renderActiveScreen() {
  refs.screens.forEach((screen) => {
    screen.classList.toggle("screen--active", screen.dataset.screen === ui.activeScreen);
  });

  refs.navButtons.forEach((button) => {
    button.classList.toggle("bottom-nav__item--active", button.dataset.screen === ui.activeScreen);
  });
}

function renderFilterChips() {
  refs.collectionFilters.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("filter-chip--active", button.dataset.filter === ui.collectionFilter);
  });
}

function renderScanModeChips() {
  const activeMode = state.appSettings.lastScanMode || "page";
  refs.scanModeRow.querySelectorAll("[data-scan-mode]").forEach((button) => {
    button.classList.toggle("filter-chip--active", button.dataset.scanMode === activeMode);
  });
}

function renderRecentRail(crops) {
  if (!crops.length) {
    return renderGhostCards(4, "your latest cards will show up here");
  }

  return crops.map((entry) => renderCropCard(entry.crop, entry.session, true)).join("");
}

function renderScanCropRail(crops) {
  if (!crops.length) {
    return renderEmptyCard("No cards yet", "Tap Find My Cards and we will show each card here.");
  }

  return crops
    .map((crop) => renderCropCard(crop, null, false))
    .join("");
}

function renderCropCard(crop, session, showScanInfo) {
  const matchedCard = findCatalogCard(crop.selectedCatalogCardId) || crop.matchCandidates[0] || null;
  const collectionCard = crop.collectionCardId
    ? state.collectionCards.find((entry) => entry.collectionCardId === crop.collectionCardId)
    : null;
  const latestPrice = collectionCard ? findLatestSnapshot(collectionCard) : null;

  return `
    <button type="button" class="recent-card" data-crop-id="${crop.cropId}">
      <img src="${crop.imageDataUrl}" alt="Card preview" loading="lazy" decoding="async" />
      <div class="recent-card__meta">
        <span class="recent-card__title">${escapeHtml(matchedCard?.playerName || "Unknown card")}</span>
        <span class="recent-card__sub">${escapeHtml(
          matchedCard
            ? `${matchedCard.setName || matchedCard.displayLabel || ""} ${matchedCard.cardNumber ? `#${matchedCard.cardNumber}` : ""}`.trim()
            : crop.note || "Still needs a quick look",
        )}</span>
        <span class="recent-card__value">${escapeHtml(resolveCropValueText(crop, latestPrice))}</span>
        ${
          showScanInfo
            ? `<span class="micro-copy">${escapeHtml(
                session?.mode === "single" ? "Single-card view" : humanReviewStatus(crop.reviewStatus),
              )}</span>`
            : ""
        }
      </div>
    </button>
  `;
}

function renderCollectionCards(cards) {
  if (!cards.length) {
    return renderGhostCards(6, "saved cards will show up here");
  }

  return cards
    .map((card) => {
      const latestSnapshot = findLatestSnapshot(card);
      return `
        <article class="collection-card">
          <img src="${card.imageDataUrl}" alt="Saved card" loading="lazy" decoding="async" />
          <div class="collection-card__meta">
            <span class="collection-card__title">${escapeHtml(card.playerNameSnapshot || "Unknown card")}</span>
            <span class="collection-card__sub">${escapeHtml(
              [card.yearSnapshot, card.setNameSnapshot, card.cardNumberSnapshot ? `#${card.cardNumberSnapshot}` : ""]
                .filter(Boolean)
                .join(" "),
            )}</span>
            <span class="collection-card__value">${latestSnapshot ? formatCurrency(latestSnapshot.amountUsd) : "No price yet"}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderReviewPane(allCrops) {
  const selected = getSelectedCrop();
  if (!selected) {
    return renderEmptyCard("Pick a card", "Tap a card from Recent or Scan to see it here.");
  }

  const manualResults = searchCatalog(state.catalogCards, selected.crop.manualSearch || "", 8);
  const currentCard = findCatalogCard(selected.crop.selectedCatalogCardId);

  return `
    <div class="review-queue">
      ${allCrops
        .map(
          (entry) => `
            <button type="button" class="review-crop-pill ${entry.crop.cropId === selected.crop.cropId ? "review-crop-pill--selected" : ""}" data-crop-id="${entry.crop.cropId}">
              <img src="${entry.crop.imageDataUrl}" alt="Card to review" loading="lazy" decoding="async" />
              <span class="review-crop-pill__status">${escapeHtml(humanReviewStatus(entry.crop.reviewStatus))}</span>
            </button>
          `,
        )
        .join("")}
    </div>
    <div class="review-focus">
      <div class="review-focus__image">
        <img src="${selected.crop.imageDataUrl}" alt="Selected card" decoding="async" />
      </div>
      <div class="badge-row">
        <span class="badge badge--${humanReviewBadgeClass(selected.crop.reviewStatus)}">${escapeHtml(humanReviewStatus(selected.crop.reviewStatus))}</span>
        ${
          selected.crop.matchCandidates[0]
            ? `<span class="badge badge--pending">${Math.round(selected.crop.matchCandidates[0].confidenceScore * 100)}% sure</span>`
            : ""
        }
      </div>
      <div class="review-note">
        <strong>What we could read</strong>
        <div class="small-copy">${escapeHtml(selected.crop.ocrText || "We could not read much from this one yet.")}</div>
      </div>
      <div class="review-note">
        <strong>Best picks</strong>
        <div class="candidate-list">
          ${
            selected.crop.matchCandidates.length
              ? selected.crop.matchCandidates
                  .map(
                    (candidate) => `
                      <div class="candidate-card ${selected.crop.selectedCatalogCardId === candidate.catalogCardId ? "candidate-card--active" : ""}">
                        <label>
                          <input type="radio" name="candidateChoice" value="${candidate.catalogCardId}" ${
                            selected.crop.selectedCatalogCardId === candidate.catalogCardId ? "checked" : ""
                          } />
                          <strong>${escapeHtml(candidate.playerName)}</strong>
                          <span class="small-copy">${escapeHtml(`${candidate.year} ${candidate.brand} ${candidate.setName} #${candidate.cardNumber}`)}</span>
                          <span class="small-copy">This feels about ${Math.round(candidate.confidenceScore * 100)}% right.</span>
                        </label>
                      </div>
                    `,
                  )
                  .join("")
              : '<div class="small-copy">We could not make a strong guess yet. Search your list or save this card for later.</div>'
          }
        </div>
      </div>
      <label class="input-group">
        <span>Search your list</span>
        <input type="search" name="manualSearch" value="${escapeAttribute(selected.crop.manualSearch || "")}" placeholder="Player, year, set, or card number" />
      </label>
      <div class="manual-list">
        ${
          manualResults.length
            ? manualResults
                .map(
                  (card) => `
                    <div class="manual-card ${selected.crop.selectedCatalogCardId === card.catalogCardId ? "manual-card--active" : ""}">
                      <label>
                        <input type="radio" name="manualChoice" value="${card.catalogCardId}" ${
                          selected.crop.selectedCatalogCardId === card.catalogCardId ? "checked" : ""
                        } />
                        <strong>${escapeHtml(card.playerName)}</strong>
                        <span class="small-copy">${escapeHtml(`${card.year} ${card.brand} ${card.setName} #${card.cardNumber}`)}</span>
                      </label>
                    </div>
                  `,
                )
                .join("")
            : '<div class="small-copy">Nothing in your list matches that search yet.</div>'
        }
      </div>
      <div class="button-row">
        <button class="button button--primary" type="button" data-action="confirm">Yep, Save This Card</button>
        <button class="button button--ghost" type="button" data-action="unknown">Save for Later</button>
      </div>
      ${renderPricingBox(selected.crop, currentCard)}
    </div>
  `;
}

function renderPricingBox(crop, currentCard) {
  if (!crop.collectionCardId && !crop.pricing) {
    return '<div class="pricing-card"><strong>Value Check</strong><div class="small-copy">We only check value after you save the right card.</div></div>';
  }

  const pricing = crop.pricing || {};
  const soldSearchUrl = pricing.soldSearchUrl || buildSoldSearchUrl(currentCard);
  const comparableMarkup = Array.isArray(pricing.comparableListings) && pricing.comparableListings.length
    ? `
        <div class="candidate-list">
          ${pricing.comparableListings
            .slice(0, 3)
            .map(
              (listing) => `
                <div class="candidate-card">
                  <strong>${escapeHtml(listing.priceText || formatCurrency(listing.priceValue || 0))}</strong>
                  <div class="small-copy">${escapeHtml(listing.title || "Recent sold listing")}</div>
                </div>
              `,
            )
            .join("")}
        </div>
      `
    : "";

  return `
    <div class="pricing-card">
      <strong>Value Check</strong>
      <div class="small-copy">${escapeHtml(pricing.note || "No value saved yet.")}</div>
      ${Number.isFinite(pricing.estimate) ? `<div class="collection-card__value">${formatCurrency(pricing.estimate)}</div>` : ""}
      ${comparableMarkup}
      <div class="button-row">
        <a class="button button--ghost" href="${soldSearchUrl}" target="_blank" rel="noreferrer">See eBay Sales</a>
      </div>
      <label class="input-group">
        <span>Type a sale price</span>
        <input type="number" name="manualPrice" min="0" step="0.01" placeholder="12.50" />
      </label>
      <button class="button button--ghost" type="button" data-action="manual-price">Save This Price</button>
    </div>
  `;
}

function renderCatalogRows() {
  if (!state.catalogCards.length) {
    return '<tr><td colspan="4" class="small-copy">Your list is empty.</td></tr>';
  }

  return state.catalogCards
    .slice(0, 10)
    .map(
      (card) => `
        <tr>
          <td>${escapeHtml(card.playerName)}</td>
          <td>${escapeHtml(`${card.year} ${card.brand} ${card.setName}`)}</td>
          <td>${escapeHtml(card.cardNumber)}</td>
          <td>${escapeHtml(card.sport)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderEmptyCard(title, body) {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(body)}</span>
    </div>
  `;
}

function renderGhostCards(count, hint) {
  return Array.from({ length: count }, (_, index) => {
    const hintMarkup =
      index === 0 && hint
        ? `
            <div class="ghost-card__meta">
              <span class="ghost-card__title">Your cards go here</span>
              <span class="ghost-card__sub">${escapeHtml(hint)}</span>
            </div>
          `
        : `
            <div class="ghost-card__meta">
              <span class="ghost-card__title">Coming soon</span>
              <span class="ghost-card__sub">Waiting on cards</span>
            </div>
          `;

    return `
      <article class="ghost-card ${index === 0 && hint ? "ghost-card--hint" : ""}">
        <div class="ghost-card__image"></div>
        ${hintMarkup}
      </article>
    `;
  }).join("");
}

function showScreen(screen) {
  ui.activeScreen = screen;
  if (screen === "review") {
    ensureSelectedCrop();
  }
  render();
}

function ensureSelectedCrop() {
  const allCrops = getAllCropsSorted();
  if (!allCrops.length) {
    ui.selectedCropId = null;
    return;
  }

  const stillExists = allCrops.some((entry) => entry.crop.cropId === ui.selectedCropId);
  if (stillExists) {
    return;
  }

  ui.selectedCropId =
    allCrops.find((entry) => entry.crop.reviewStatus === "pending")?.crop.cropId || allCrops[0].crop.cropId;
}

function getSelectedCrop() {
  const allCrops = getAllCropsSorted();
  const found = allCrops.find((entry) => entry.crop.cropId === ui.selectedCropId);
  return found || allCrops[0] || null;
}

function getAllCropsSorted() {
  return state.scanSessions
    .flatMap((session) =>
      session.crops.map((crop, index) => ({
        session,
        crop,
        sortKey: crop.scannedAt || session.startedAt || "",
        index,
      })),
    )
    .sort((left, right) => {
      const timeDiff = new Date(right.sortKey).getTime() - new Date(left.sortKey).getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return right.index - left.index;
    });
}

function getLatestSession() {
  return state.scanSessions[state.scanSessions.length - 1] || null;
}

function getPendingReviewCount(allCrops = getAllCropsSorted()) {
  return allCrops.filter((entry) => entry.crop.reviewStatus === "pending").length;
}

function getFilteredCollectionCards() {
  const cards = [...state.collectionCards].sort(
    (left, right) => new Date(right.addedAt).getTime() - new Date(left.addedAt).getTime(),
  );

  if (ui.collectionFilter === "all") {
    return cards;
  }

  return cards.filter((card) => card.sportSnapshot === ui.collectionFilter);
}

function getCollectionValue() {
  return state.collectionCards.reduce((total, card) => total + (findLatestSnapshot(card)?.amountUsd || 0), 0);
}

function getHighestCard() {
  return state.collectionCards.reduce((currentHighest, card) => {
    const snapshot = findLatestSnapshot(card);
    if (!snapshot) {
      return currentHighest;
    }

    if (!currentHighest) {
      return card;
    }

    return snapshot.amountUsd > (findLatestSnapshot(currentHighest)?.amountUsd || 0) ? card : currentHighest;
  }, null);
}

function findLatestSnapshot(card) {
  return state.priceSnapshots.find((snapshot) => snapshot.priceSnapshotId === card.latestPriceSnapshotId) || null;
}

function resolveCropValueText(crop, latestPrice) {
  if (latestPrice) {
    return formatCurrency(latestPrice.amountUsd);
  }

  if (crop.reviewStatus === "confirmed") {
    return "Saved";
  }

  if (crop.reviewStatus === "unknown") {
    return "Save for later";
  }

  return "Needs your okay";
}

function findCatalogCard(catalogCardId) {
  return state.catalogCards.find((card) => card.catalogCardId === catalogCardId) || null;
}

function setStatus(message) {
  ui.statusMessage = message;
  refs.statusBanner.textContent = ui.statusMessage;
}

async function cleanupCachedShell() {
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => registration.active?.scriptURL.includes("service-worker"))
          .map((registration) => registration.unregister()),
      );
    } catch (error) {
      console.warn("Could not clear old service workers.", error);
    }
  }

  if (!("caches" in window)) {
    return;
  }

  try {
    const keys = await window.caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("sports-card-scanner-shell"))
        .map((key) => window.caches.delete(key)),
    );
  } catch (error) {
    console.warn("Could not clear old app caches.", error);
  }
}

function formatCurrency(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "$0";
  }

  return moneyFormatter.format(value);
}

function humanReviewStatus(status) {
  switch (status) {
    case "confirmed":
      return "Saved";
    case "unknown":
      return "Save for later";
    default:
      return "Needs your okay";
  }
}

function humanReviewBadgeClass(status) {
  switch (status) {
    case "confirmed":
      return "confirmed";
    case "unknown":
      return "unknown";
    default:
      return "pending";
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not preview that photo."));
    reader.readAsDataURL(file);
  });
}

function pauseForUi() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
