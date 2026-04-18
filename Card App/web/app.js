import {
  buildSearchQuery,
  extractCardNumbers,
  normalizeText,
  parseCatalogCsv,
  summarizeCatalog,
} from "./catalog.js";
import {
  buildDemoCatalogCsv,
  DEMO_PRICE_ESTIMATES,
  generateDemoCardAsset,
  generateDemoImage,
} from "./demo-data.js";
import {
  buildEbaySearchText,
  buildEbayLiveSearchUrl,
  fetchEbayMatches,
  buildSoldSearchUrl,
  fetchPriceEstimate,
} from "./pricing.js";
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

const APP_VERSION = "v0.3.8";
const AUTO_LOOKUP_QUERY_LIMIT = 2;
const DEBUG_HISTORY_KEY = "sports-card-scanner-mvp-web/debug-history/v1";
const DEBUG_HISTORY_LIMIT = 80;

let backgroundCropQueue = Promise.resolve();
let appDebugHistory = loadAppDebugHistory();

const LIKELY_SET_TERMS = new Set([
  "topps",
  "traded",
  "update",
  "donruss",
  "fleer",
  "bowman",
  "score",
  "leaf",
  "upper",
  "deck",
  "club",
  "stadium",
  "chrome",
  "heritage",
  "finest",
  "hoops",
  "panini",
  "prizm",
  "select",
  "optic",
  "mosaic",
  "contenders",
  "pinnacle",
  "base",
  "rookie",
  "rc",
]);

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
  appVersion: document.querySelector("#appVersion"),
  navButtons: [...document.querySelectorAll(".bottom-nav__item")],
  screenJumpButtons: [...document.querySelectorAll("[data-screen-jump]")],
  screens: [...document.querySelectorAll(".screen")],
};

function initializeAppDebugging() {
  const lastEntry = appDebugHistory[appDebugHistory.length - 1] || null;
  const previousEndedCleanly = lastEntry?.step === "page_hidden" || lastEntry?.step === "page_unloaded";

  if (lastEntry && !previousEndedCleanly) {
    recordAppDebugEvent("recovered_after_stop", "The app reopened after an abrupt stop or freeze.", {
      afterStep: lastEntry.step,
      afterMessage: lastEntry.message,
    });
  }

  recordAppDebugEvent("app_opened", "App opened.", {
    screen: ui.activeScreen,
    build: APP_VERSION,
  });

  window.addEventListener("error", (event) => {
    recordAppDebugEvent("window_error", event.message || "Browser error", {
      source: event.filename || "",
      line: event.lineno || "",
      column: event.colno || "",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reasonText =
      event.reason instanceof Error
        ? `${event.reason.name}: ${event.reason.message}`
        : String(event.reason || "Unknown promise rejection");
    recordAppDebugEvent("promise_error", reasonText);
  });

  window.addEventListener("pagehide", () => {
    recordAppDebugEvent("page_hidden", "Page is being hidden or closed.", {
      screen: ui.activeScreen,
    });
  });

  window.addEventListener("beforeunload", () => {
    recordAppDebugEvent("page_unloaded", "Page is unloading.", {
      screen: ui.activeScreen,
    });
  });

  if ("PerformanceObserver" in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration < 700) {
            return;
          }

          recordAppDebugEvent("long_task", `Main thread was blocked for ${Math.round(entry.duration)}ms.`, {
            durationMs: Math.round(entry.duration),
            name: entry.name || "",
          });
        });
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch (error) {
      console.warn("Long-task observer was not available.", error);
    }
  }
}

bindEvents();
initializeAppDebugging();
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
    setStatus("Your personal sheet is cleared.");
    render();
  });

  refs.pickImageButton.addEventListener("click", triggerImagePicker);
  refs.demoScanButton.addEventListener("click", handleGenerateDemoImage);
  refs.scanButton.addEventListener("click", handleScan);
  refs.clearSessionButton.addEventListener("click", () => {
    resetSessions(state);
    ui.selectedCropId = null;
    clearPendingSourcePreview();
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
        : `Added ${parsed.cards.length} cards to your personal sheet.`,
    );
    showScreen("catalog");
    render();
  } catch (error) {
    setStatus(`That sheet would not open. ${error.message}`);
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

  setPendingSourcePreview({
    name: file.name,
    previewUrl: URL.createObjectURL(file),
    usesObjectUrl: true,
  });
  recordAppDebugEvent("photo_picked", "Picked a photo from the device.", {
    fileName: file.name,
    sizeKb: Math.round((file.size || 0) / 1024),
    type: file.type || "",
  });

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
  setPendingSourcePreview({
    name: demoImage.name,
    dataUrl: demoImage.dataUrl,
  });
  recordAppDebugEvent("demo_photo_ready", "Loaded a sample photo.", {
    mode,
    sourceName: demoImage.name,
  });

  showScreen("scan");
  setStatus(
    mode === "single"
      ? "Sample card is ready. Tap Find My Cards to give it a spin."
      : "Sample photo is ready. Tap Find My Cards and we will split it up for you.",
  );
  render();
}

function setPendingSourcePreview(preview) {
  clearPendingSourcePreview();
  ui.pendingSourcePreview = preview || null;
}

function clearPendingSourcePreview() {
  const previewUrl = ui.pendingSourcePreview?.previewUrl;
  if (previewUrl && ui.pendingSourcePreview?.usesObjectUrl) {
    URL.revokeObjectURL(previewUrl);
  }

  ui.pendingSourcePreview = null;
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
          title: `${card.playerName} - ${card.year} ${card.brand} ${card.setName} #${card.cardNumber}`,
          priceText: estimate ? formatCurrency(estimate) : "",
          priceValue: estimate,
          searchQuery: buildSearchQuery(card),
          lowSold: estimate ? Math.max(1, estimate * 0.78) : null,
          highSold: estimate ? estimate * 1.18 : null,
          typicalSold: estimate,
          soldSearchUrl: buildSoldSearchUrl(card),
        },
      ],
      selectedCatalogCardId: card.catalogCardId,
      manualSearch: buildSearchQuery(card),
      manualDetails: inferManualDetails(
        `${card.year} ${card.brand} ${card.setName} ${card.playerName} ${card.cardNumber}`,
        buildSearchQuery(card),
      ),
      searchQuery: buildSearchQuery(card),
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
  clearPendingSourcePreview();
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
      recordAppDebugEvent("scan_blocked", "Scan was tapped without a photo ready.");
      setStatus("Pick a photo first.");
    }
    return;
  }

  ui.scanBusy = true;
  refs.scanButton.disabled = true;
  refs.scanButton.textContent = "Working...";

  try {
    const mode = state.appSettings.lastScanMode || "page";
    recordAppDebugEvent("scan_started", "Started scanning a photo.", {
      mode,
      sourceName: file?.name || previewSource?.name || "unknown",
      sourceKind: file ? "file" : previewSource?.usesObjectUrl ? "picked_preview" : "saved_preview",
    });
    setStatus("Getting your photo ready...");
    render();
    await pauseForUi();
    const loaded = file
      ? await loadImageFile(file)
      : await loadImageSource(previewSource.dataUrl || previewSource.previewUrl, previewSource.name);
    recordAppDebugEvent("photo_loaded", "Loaded the photo into the scanner.", {
      sourceName: loaded.fileName,
      width: loaded.image?.width || "",
      height: loaded.image?.height || "",
    });
    setPendingSourcePreview({
      name: loaded.fileName,
      dataUrl: loaded.dataUrl,
    });

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
    recordAppDebugEvent("detect_started", "Started card detection.", {
      mode,
    });
    const detectedCrops = await detectCropsFromImage(loaded.dataUrl, mode);
    recordAppDebugEvent("detect_done", "Finished card detection.", {
      mode,
      cropCount: detectedCrops.length,
    });
    const scannedAtBase = Date.now();
    session.crops = detectedCrops.map((detectedCrop, index) => ({
      cropId: detectedCrop.cropId,
      scannedAt: new Date(scannedAtBase + index).toISOString(),
      imageDataUrl: detectedCrop.imageDataUrl,
      bounds: detectedCrop.bounds,
      note: detectedCrop.note || "",
      ocrText: "",
      ocrConfidence: null,
      ocrRotation: 0,
      ocrError: "",
      matchCandidates: [],
      selectedCatalogCardId: "",
      manualSearch: "",
      manualDetails: {
        player: "",
        year: "",
        brandSet: "",
        cardNumber: "",
      },
      searchQuery: "",
      debugInfo: buildLookupDebugInfo({
        searchReason: "scan",
        primaryQuery: "",
        queryVariants: [],
        queryVariantDetails: [],
        lookupResult: {
          candidates: [],
          attempts: [],
          queryQueue: [],
        },
        ocrResult: {
          text: "",
          confidence: null,
          rotation: 0,
          error: "",
        },
        manualDetails: {
          player: "",
          year: "",
          brandSet: "",
          cardNumber: "",
        },
        cropNote: detectedCrop.note || "",
        lookupState: "reading",
        lookupMessage: "We are reading this card now.",
        searchStyle: "Background prep",
      }),
      reviewStatus: "pending",
      unknownFlag: false,
      pricing: null,
      collectionCardId: "",
      lookupState: "reading",
      lookupMessage: "We are reading this card now.",
    }));

    session.status = "review";
    ui.selectedCropId = session.crops[0]?.cropId || null;
    clearPendingSourcePreview();
    ensureSelectedCrop();
    showScreen("review");
    saveState(state);
    setStatus(
      detectedCrops.length === 1
        ? "Your card is on screen. We are reading it now, then we will look for close eBay cards."
        : `Found ${detectedCrops.length} cards. You can start reviewing while we keep reading and searching in the background.`,
    );
    render();

    detectedCrops.forEach((detectedCrop, index) => {
      recordAppDebugEvent("crop_queued", "Queued a card for OCR and search.", {
        cropId: detectedCrop.cropId,
        cropIndex: index + 1,
        totalCrops: detectedCrops.length,
      });
      queueBackgroundCropAnalysis({
        cropId: detectedCrop.cropId,
        detectedCrop,
        cropIndex: index,
        totalCrops: detectedCrops.length,
      });
    });
  } catch (error) {
    recordAppDebugEvent("scan_error", error.message || "Scan failed.");
    setStatus(`That photo did not work. ${error.message}`);
  } finally {
    ui.scanBusy = false;
    refs.scanButton.disabled = false;
    refs.scanButton.textContent = "Find My Cards";
    render();
  }
}

function queueBackgroundCropAnalysis(task) {
  backgroundCropQueue = backgroundCropQueue
    .then(() => processDetectedCrop(task))
    .catch((error) => {
      console.warn("Background card work failed.", error);
    });

  return backgroundCropQueue;
}

async function processDetectedCrop({ cropId, detectedCrop, cropIndex, totalCrops }) {
  const startingEntry = findCropEntryById(cropId);
  if (!startingEntry) {
    return;
  }

  recordAppDebugEvent("ocr_started", "Started reading one card.", {
    cropId,
    cropIndex: cropIndex + 1,
    totalCrops,
  });
  const ocrResult = await runOcr(detectedCrop.imageDataUrl).catch((error) => ({
    text: "",
    confidence: null,
    error: error.message,
    imageDataUrl: detectedCrop.imageDataUrl,
    rotation: 0,
  }));
  recordAppDebugEvent("ocr_done", "Finished reading one card.", {
    cropId,
    confidence: Number.isFinite(ocrResult.confidence) ? `${Math.round(ocrResult.confidence * 100)}%` : "",
    rotation: ocrResult.rotation || 0,
    chars: (ocrResult.text || "").length,
    error: ocrResult.error || "",
  });

  const selected = findCropEntryById(cropId);
  if (!selected) {
    return;
  }

  const crop = selected.crop;
  const finalCropImageDataUrl = ocrResult.imageDataUrl || detectedCrop.imageDataUrl;
  const inferredDetails = inferManualDetails(ocrResult.text, buildEbaySearchText(ocrResult.text));
  const mergedManualDetails = mergeManualDetails(crop.manualDetails, inferredDetails);
  const cropNote = [detectedCrop.note, ocrResult.rotation ? "We straightened the card before reading it." : ""]
    .filter(Boolean)
    .join(" ");
  const defaultSearch = buildManualSearchFromDetails(mergedManualDetails) || buildEbaySearchText(ocrResult.text);

  crop.imageDataUrl = finalCropImageDataUrl;
  crop.note = cropNote;
  crop.ocrText = ocrResult.text;
  crop.ocrConfidence = ocrResult.confidence;
  crop.ocrRotation = ocrResult.rotation || 0;
  crop.ocrError = ocrResult.error || "";
  crop.manualDetails = mergedManualDetails;
  crop.searchQuery = crop.searchQuery || defaultSearch;
  crop.manualSearch = crop.manualSearch || crop.searchQuery;

  const queryVariantDetails = buildSearchQueryVariantDetails(crop);
  const automaticQueryDetails = pickAutomaticLookupQueries(crop, queryVariantDetails);
  const automaticQueries = automaticQueryDetails.map((entry) => entry.query);
  const automaticPrimaryQuery = automaticQueries[0] || "";
  const skipReason = automaticQueryDetails.length ? "" : explainAutomaticLookupSkip(crop);

  crop.searchQuery = crop.searchQuery || automaticPrimaryQuery || defaultSearch;
  crop.manualSearch = crop.manualSearch || crop.searchQuery;
  crop.lookupState = automaticPrimaryQuery ? "loading" : "idle";
  crop.lookupMessage = automaticPrimaryQuery
    ? "We are checking eBay now."
    : skipReason || "Add player, year, set, or card number, then tap Search eBay.";
  crop.debugInfo = buildLookupDebugInfo({
    searchReason: "scan",
    primaryQuery: automaticPrimaryQuery,
    queryVariants: automaticQueries,
    queryVariantDetails: automaticQueryDetails,
    lookupResult: {
      candidates: crop.matchCandidates || [],
      attempts: [],
      queryQueue: automaticQueries,
    },
    ocrResult,
    manualDetails: mergedManualDetails,
    cropNote,
    lookupState: crop.lookupState,
    lookupMessage: crop.lookupMessage,
    searchStyle: automaticPrimaryQuery ? "Fast background text search" : "Waiting for a better search hint",
  });
  saveState(state);
  render();

  if (!automaticPrimaryQuery) {
    recordAppDebugEvent("lookup_skipped", "Skipped the automatic eBay search because the read was too rough.", {
      cropId,
      reason: skipReason,
    });
    setStatus(
      totalCrops === 1
        ? "We read the card, but the search words are still too rough. Add a player, year, set, or card number and tap Search eBay."
        : `Card ${cropIndex + 1} is ready. Add a player, year, set, or card number if you want a stronger search.`,
    );
    return;
  }

  setStatus(
    totalCrops === 1
      ? "We read the card. Checking eBay now..."
      : `Card ${cropIndex + 1} of ${totalCrops} is ready. Checking eBay now...`,
  );

  await runCropLookup({
    cropId,
    searchReason: "scan",
    queryVariantDetails: automaticQueryDetails,
    imageDataUrl: "",
    searchStyle: "Fast background text search",
  });
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

  if (event.target.name === "detailPlayer" || event.target.name === "detailYear" || event.target.name === "detailSet" || event.target.name === "detailNumber") {
    const details = getManualDetails(selected.crop);
    if (event.target.name === "detailPlayer") {
      details.player = event.target.value;
    }
    if (event.target.name === "detailYear") {
      details.year = event.target.value;
    }
    if (event.target.name === "detailSet") {
      details.brandSet = event.target.value;
    }
    if (event.target.name === "detailNumber") {
      details.cardNumber = event.target.value;
    }

    selected.crop.manualDetails = details;
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

  if (action === "copy-app-debug") {
    await copyAppDebugHistory();
    return;
  }

  if (action === "share-app-debug") {
    await shareAppDebugHistory();
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

  if (action === "search-ebay") {
    await searchSelectedCropOnEbay(selected);
    return;
  }

  if (action === "open-ebay") {
    openSelectedCropOnEbay(selected);
    return;
  }

  if (action === "copy-debug") {
    await copyCropDebugInfo(selected);
    return;
  }

  if (action === "share-debug") {
    await shareCropDebugInfo(selected);
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
  const candidate = findSelectedCandidate(selected.crop);
  if (!candidate) {
    recordAppDebugEvent("confirm_blocked", "Tried to save without a picked match.", {
      cropId: selected.crop.cropId,
    });
    setStatus("Pick the right eBay card first, or search again.");
    return;
  }

  recordAppDebugEvent("confirm_started", "Saving the picked card.", {
    cropId: selected.crop.cropId,
    title: candidate.title || candidate.playerName || "",
  });

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
    note: "Pulling recent eBay sales...",
  };

  const collectionCard = upsertCollectionCard(selected.crop, candidate);
  selected.crop.collectionCardId = collectionCard.collectionCardId;
  saveState(state);
  render();

  try {
    const pricing =
      candidate.lowSold || candidate.highSold || candidate.typicalSold
        ? buildPricingFromCandidate(candidate)
        : await fetchPriceEstimate(
            candidate.pricingQuery ||
              candidate.title ||
              candidate.searchQuery ||
              selected.crop.manualSearch ||
              selected.crop.searchQuery ||
              "",
          );
    selected.crop.pricing = pricing;

    if (pricing.mode === "automatic" && Number.isFinite(pricing.estimate)) {
      const snapshot = savePriceSnapshot(collectionCard.collectionCardId, pricing.estimate, pricing);
      collectionCard.latestPriceSnapshotId = snapshot.priceSnapshotId;
      recordAppDebugEvent("confirm_saved", "Saved the card with automatic pricing.", {
        cropId: selected.crop.cropId,
        estimate: pricing.estimate,
      });
      setStatus(`Saved ${candidate.playerName || "that card"} with recent eBay sales.`);
    } else {
      recordAppDebugEvent("confirm_saved", "Saved the card without an automatic price.", {
        cropId: selected.crop.cropId,
      });
      setStatus(`Saved ${candidate.playerName || "that card"}. Add a sale price if you want one now.`);
    }
  } catch (error) {
    selected.crop.pricing = {
      status: "manual",
      note: error.message,
      soldSearchUrl: buildSoldSearchUrl(
        candidate.pricingQuery || candidate.title || candidate.searchQuery || selected.crop.manualSearch || selected.crop.searchQuery || "",
      ),
    };
    recordAppDebugEvent("pricing_error", error.message || "Automatic pricing failed.", {
      cropId: selected.crop.cropId,
    });
    setStatus(`Saved ${candidate.playerName || "that card"}. You can add a price yourself from eBay sales.`);
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

  recordAppDebugEvent("saved_for_later", "Saved a card for later without forcing a match.", {
    cropId: selected.crop.cropId,
  });
  saveState(state);
  setStatus("Saved this card for later without forcing a bad guess.");
  render();
}

function saveManualPrice(selected) {
  const input = refs.reviewPane.querySelector('[name="manualPrice"]');
  const value = Number.parseFloat(input?.value || "");
  if (!Number.isFinite(value) || value <= 0) {
    recordAppDebugEvent("manual_price_blocked", "Tried to save a manual price without a valid number.", {
      cropId: selected.crop.cropId,
    });
    setStatus("Type in a sale price first.");
    return;
  }

  const collectionCardId =
    selected.crop.collectionCardId ||
    upsertCollectionCard(selected.crop, findSelectedCandidate(selected.crop)).collectionCardId;
  const card = state.collectionCards.find((entry) => entry.collectionCardId === collectionCardId);
  const snapshot = savePriceSnapshot(collectionCardId, value, {
    mode: "manual",
    note: "Price added by you.",
    soldSearchUrl:
      selected.crop.pricing?.soldSearchUrl ||
      buildSoldSearchUrl(
        findSelectedCandidate(selected.crop)?.pricingQuery ||
          selected.crop.searchQuery ||
          selected.crop.manualSearch ||
          "",
      ),
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

  recordAppDebugEvent("manual_price_saved", "Saved a manual price.", {
    cropId: selected.crop.cropId,
    value,
  });
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
  collectionCard.playerNameSnapshot = card?.playerName || card?.title || "Unknown card";
  collectionCard.setNameSnapshot = card?.setName || card?.subtitle || card?.condition || card?.priceText || "";
  collectionCard.cardNumberSnapshot = card?.cardNumber || "";
  collectionCard.sportSnapshot = card?.sport || "";
  collectionCard.teamNameSnapshot = card?.teamName || "";
  collectionCard.yearSnapshot = card?.year || "";
  collectionCard.searchQuery = card?.pricingQuery || card?.searchQuery || crop.searchQuery || card?.title || "";
  collectionCard.note = card?.itemWebUrl || card?.title || crop.note || "";

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
  refs.appVersion.textContent = `Build ${APP_VERSION}`;

  renderPreview(latestSession);
  renderActiveScreen();
  renderFilterChips();
  renderScanModeChips();
}

function renderPreview(latestSession) {
  const previewSource =
    ui.pendingSourcePreview?.previewUrl ||
    ui.pendingSourcePreview?.dataUrl ||
    latestSession?.sourceDataUrl ||
    "";
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
  const matchedCard = findSelectedCandidate(crop) || crop.matchCandidates[0] || null;
  const collectionCard = crop.collectionCardId
    ? state.collectionCards.find((entry) => entry.collectionCardId === crop.collectionCardId)
    : null;
  const latestPrice = collectionCard ? findLatestSnapshot(collectionCard) : null;
  const placeholderTitle =
    crop.lookupState === "reading"
      ? "Reading card..."
      : crop.lookupState === "loading"
        ? "Looking on eBay..."
        : "Unknown card";

  return `
    <button type="button" class="recent-card" data-crop-id="${crop.cropId}">
      <img src="${crop.imageDataUrl}" alt="Card preview" loading="lazy" decoding="async" />
      <div class="recent-card__meta">
        <span class="recent-card__title">${escapeHtml(candidatePrimaryText(matchedCard) || placeholderTitle)}</span>
        <span class="recent-card__sub">${escapeHtml(
          matchedCard
            ? candidateDetailText(matchedCard)
            : crop.note || "Still needs a quick look",
        )}</span>
        <span class="recent-card__value">${escapeHtml(resolveCropValueText(crop, latestPrice))}</span>
        ${
          showScanInfo
            ? `<span class="micro-copy">${escapeHtml(
                session?.mode === "single" ? "Single-card view" : humanReviewStatusForCrop(crop),
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
            <span class="collection-card__title">${escapeHtml(shortenText(card.playerNameSnapshot || "Unknown card", 58))}</span>
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
    return `
      ${renderEmptyCard("Pick a card", "Tap a card from Recent or Scan to see it here.")}
      ${renderAppDebugCard()}
    `;
  }

  const currentCard = findSelectedCandidate(selected.crop);
  const manualDetails = getManualDetails(selected.crop);
  const searchPreview = getPreferredSearchText(selected.crop);

  return `
    <div class="review-label">Cards from your photo</div>
    <div class="review-queue">
      ${allCrops
        .map(
          (entry) => `
            <button type="button" class="review-crop-pill ${entry.crop.cropId === selected.crop.cropId ? "review-crop-pill--selected" : ""}" data-crop-id="${entry.crop.cropId}">
              <img src="${entry.crop.imageDataUrl}" alt="Card to review" loading="lazy" decoding="async" />
              <span class="review-crop-pill__status">${escapeHtml(humanReviewStatusForCrop(entry.crop))}</span>
            </button>
          `,
        )
        .join("")}
    </div>
      <div class="review-focus">
        <div class="badge-row">
          <span class="badge badge--${humanReviewBadgeClass(selected.crop.reviewStatus)}">${escapeHtml(humanReviewStatus(selected.crop.reviewStatus))}</span>
          ${renderLookupBadge(selected.crop)}
        </div>
      <label class="input-group">
        <span>Search eBay</span>
        <input type="search" name="manualSearch" value="${escapeAttribute(searchPreview)}" placeholder="Player, year, set, or card number" />
      </label>
      <div class="small-copy">Tip: leave this blank if you want us to lean on the card photo first.</div>
      <div class="review-note">
        <strong>Help us narrow it down</strong>
        <div class="detail-grid">
          <label class="input-group">
            <span>Player</span>
            <input type="search" name="detailPlayer" value="${escapeAttribute(manualDetails.player || "")}" placeholder="Fred McGriff" />
          </label>
          <label class="input-group">
            <span>Year</span>
            <input type="search" name="detailYear" value="${escapeAttribute(manualDetails.year || "")}" placeholder="1988" />
          </label>
          <label class="input-group detail-grid__wide">
            <span>Brand or set</span>
            <input type="search" name="detailSet" value="${escapeAttribute(manualDetails.brandSet || "")}" placeholder="Topps Traded or Donruss" />
          </label>
          <label class="input-group">
            <span>Card number</span>
            <input type="search" name="detailNumber" value="${escapeAttribute(manualDetails.cardNumber || "")}" placeholder="74T or 123" />
          </label>
        </div>
        <div class="small-copy">${
          searchPreview
            ? `We would search eBay with: ${escapeHtml(searchPreview)}`
            : "Type any two or three things you can clearly see on the card."
        }</div>
      </div>
      <div class="button-row">
        <button class="button" type="button" data-action="search-ebay">Search eBay</button>
        <button class="button button--ghost" type="button" data-action="open-ebay">Open eBay</button>
      </div>
      <div class="review-note">
        <strong>Closest eBay cards</strong>
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
                          <div class="candidate-card__row">
                            ${
                              candidate.imageUrl
                                ? `<img class="candidate-card__thumb" src="${candidate.imageUrl}" alt="eBay card" loading="lazy" decoding="async" />`
                                : ""
                            }
                            <div class="candidate-card__copy">
                              <strong>${escapeHtml(candidatePrimaryText(candidate))}</strong>
                              <span class="small-copy">${escapeHtml(candidateDetailText(candidate))}</span>
                              <span class="small-copy">${escapeHtml(candidate.priceText || "Recent eBay sale")}</span>
                              <span class="small-copy">This feels about ${Math.round(candidate.confidenceScore * 100)}% right.</span>
                            </div>
                          </div>
                        </label>
                      </div>
                    `,
                  )
                  .join("")
              : renderLookupStateCard(selected.crop)
          }
        </div>
      </div>
      <div class="review-focus__image">
        <img src="${selected.crop.imageDataUrl}" alt="Selected card" decoding="async" />
      </div>
      <div class="review-note">
        <strong>What the photo picked up</strong>
        <div class="small-copy">${escapeHtml(describeReadText(selected.crop))}</div>
      </div>
      <div class="button-row">
        <button class="button button--primary" type="button" data-action="confirm">Save This Card</button>
        <button class="button button--ghost" type="button" data-action="unknown">Save for Later</button>
      </div>
      ${renderDebugCard(selected.crop)}
      ${renderPricingBox(selected.crop, currentCard)}
    </div>
  `;
}

function renderLookupBadge(crop) {
  if (crop?.matchCandidates?.[0]) {
    return `<span class="badge badge--pending">${Math.round(crop.matchCandidates[0].confidenceScore * 100)}% sure</span>`;
  }

  switch (crop?.lookupState) {
    case "reading":
      return '<span class="badge badge--pending">Reading...</span>';
    case "loading":
      return '<span class="badge badge--pending">Searching eBay...</span>';
    case "empty":
      return '<span class="badge badge--pending">No match yet</span>';
    case "error":
      return '<span class="badge badge--pending">Search snag</span>';
    default:
      return "";
  }
}

function renderLookupStateCard(crop) {
  const lookupMessage = escapeHtml(crop?.lookupMessage || "Try the player name, year, set, or card number above.");

  switch (crop?.lookupState) {
    case "reading":
      return `
        <div class="review-note">
          <strong>Reading the card</strong>
          <div class="small-copy">${lookupMessage}</div>
        </div>
      `;
    case "loading":
      return `
        <div class="review-note">
          <strong>Looking on eBay</strong>
          <div class="small-copy">${lookupMessage}</div>
        </div>
      `;
    case "idle":
      return `
        <div class="review-note">
          <strong>Need a better hint</strong>
          <div class="small-copy">${lookupMessage}</div>
        </div>
      `;
    case "error":
      return `
        <div class="review-note review-note--warning">
          <strong>Search hit a snag</strong>
          <div class="small-copy">${lookupMessage}</div>
        </div>
      `;
    case "empty":
    default:
      return `
        <div class="review-note review-note--warning">
          <strong>No eBay card yet</strong>
          <div class="small-copy">${lookupMessage || "The little picture above is your scan, not a match. Try the player name, year, set, or card number above."}</div>
        </div>
      `;
  }
}

function renderAppDebugCard() {
  const debugText = formatAppDebugHistory();
  return `
    <details class="debug-card" open>
      <summary>App Debug History</summary>
      <pre class="debug-card__block">${escapeHtml(debugText)}</pre>
      <div class="button-row">
        <button class="button" type="button" data-action="share-app-debug">Share App History</button>
        <button class="button button--ghost" type="button" data-action="copy-app-debug">Copy App History</button>
      </div>
    </details>
  `;
}

function renderDebugCard(crop) {
  const debugText = formatDebugInfo(crop);
  return `
    <details class="debug-card" open>
      <summary>Debug Info To Copy</summary>
      <pre class="debug-card__block">${escapeHtml(debugText)}</pre>
      <div class="button-row">
        <button class="button" type="button" data-action="share-debug">Share Debug Info</button>
        <button class="button button--ghost" type="button" data-action="copy-debug">Copy Debug Info</button>
      </div>
    </details>
    ${renderAppDebugCard()}
  `;
}

function renderPricingBox(crop, currentCard) {
  if (!crop.collectionCardId && !crop.pricing) {
    return '<div class="pricing-card"><strong>Sold Range</strong><div class="small-copy">Pick the right eBay card first, then we will show the low, most common, and high sales.</div></div>';
  }

  const pricing = crop.pricing || {};
  const soldSearchUrl =
    pricing.soldSearchUrl ||
    buildSoldSearchUrl(currentCard?.pricingQuery || currentCard?.title || currentCard?.searchQuery || crop.searchQuery || "");
  const comparableMarkup = Array.isArray(pricing.comparableListings) && pricing.comparableListings.length
    ? `
        <div class="candidate-list">
          ${pricing.comparableListings
            .slice(0, 3)
            .map(
              (listing) => `
                <div class="candidate-card">
                  ${
                    listing.imageUrl
                      ? `<div class="candidate-card__row"><img class="candidate-card__thumb" src="${listing.imageUrl}" alt="eBay sale" loading="lazy" decoding="async" /><div class="candidate-card__copy">`
                      : ""
                  }
                  <strong>${escapeHtml(listing.priceText || formatCurrency(listing.priceValue || 0))}</strong>
                  <div class="small-copy">${escapeHtml(listing.title || "Recent sold listing")}</div>
                  ${listing.imageUrl ? "</div></div>" : ""}
                </div>
              `,
            )
            .join("")}
        </div>
      `
    : "";

  return `
    <div class="pricing-card">
      <strong>Sold Range</strong>
      <div class="small-copy">${escapeHtml(pricing.note || "No value saved yet.")}</div>
      ${
        Number.isFinite(pricing.lowSold) || Number.isFinite(pricing.typicalSold) || Number.isFinite(pricing.highSold)
          ? `
            <div class="pricing-stats">
              <div class="pricing-stat">
                <span>Low Sold</span>
                <strong>${formatOptionalCurrency(pricing.lowSold)}</strong>
              </div>
              <div class="pricing-stat pricing-stat--feature">
                <span>Most Common Sold</span>
                <strong>${formatOptionalCurrency(pricing.typicalSold || pricing.estimate)}</strong>
              </div>
              <div class="pricing-stat">
                <span>High Sold</span>
                <strong>${formatOptionalCurrency(pricing.highSold)}</strong>
              </div>
            </div>
          `
          : Number.isFinite(pricing.estimate)
            ? `<div class="collection-card__value">${formatCurrency(pricing.estimate)}</div>`
            : ""
      }
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
    return '<tr><td colspan="4" class="small-copy">No personal sheet loaded.</td></tr>';
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

function findCropEntryById(cropId) {
  for (const session of state.scanSessions) {
    const crop = session.crops.find((entry) => entry.cropId === cropId);
    if (crop) {
      return {
        session,
        crop,
      };
    }
  }

  return null;
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

  if (crop.lookupState === "reading") {
    return "Reading";
  }

  if (crop.lookupState === "loading") {
    return "Searching";
  }

  return "Take a look";
}

function candidatePrimaryText(candidate) {
  if (!candidate) {
    return "";
  }

  return shortenText(candidate.title || candidate.playerName || candidate.displayLabel || "eBay card", 70);
}

function candidateSecondaryText(candidate) {
  if (!candidate) {
    return "";
  }

  const detailText = [
    candidate.year,
    candidate.cardNumber ? `#${candidate.cardNumber}` : "",
    candidate.condition || candidate.subtitle || "",
  ]
    .filter(Boolean)
    .join(" • ");
  return shortenText(detailText || candidate.priceText || "eBay card", 86);
}

function candidateDetailText(candidate) {
  if (!candidate) {
    return "";
  }

  const detailText = [
    candidate.year,
    candidate.cardNumber ? `#${candidate.cardNumber}` : "",
    candidate.condition || candidate.subtitle || "",
  ]
    .filter(Boolean)
    .join(" - ");
  return shortenText(detailText || candidate.priceText || "eBay card", 86);
}

function getManualDetails(crop) {
  const inferred = inferManualDetails(crop?.ocrText || "", crop?.searchQuery || "");
  return {
    player: crop?.manualDetails?.player || inferred.player,
    year: crop?.manualDetails?.year || inferred.year,
    brandSet: crop?.manualDetails?.brandSet || inferred.brandSet,
    cardNumber: crop?.manualDetails?.cardNumber || inferred.cardNumber,
  };
}

function mergeManualDetails(currentDetails, inferredDetails) {
  return {
    player: String(currentDetails?.player || inferredDetails?.player || "").trim(),
    year: String(currentDetails?.year || inferredDetails?.year || "").trim(),
    brandSet: String(currentDetails?.brandSet || inferredDetails?.brandSet || "").trim(),
    cardNumber: String(currentDetails?.cardNumber || inferredDetails?.cardNumber || "").trim(),
  };
}

function hasManualDetails(details) {
  return Boolean(
    String(details?.player || "").trim() ||
      String(details?.year || "").trim() ||
      String(details?.brandSet || "").trim() ||
      String(details?.cardNumber || "").trim(),
  );
}

function buildManualSearchFromDetails(details) {
  return [
    String(details?.player || "").trim(),
    String(details?.year || "").trim(),
    String(details?.brandSet || "").trim(),
    String(details?.cardNumber || "").trim(),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferManualDetails(ocrText, searchQuery) {
  const normalizedSearch = normalizeText(searchQuery || ocrText);
  const yearResult = inferYearFromText(normalizedSearch);
  const cardNumberResult = pickLikelyCardNumber(ocrText || searchQuery, yearResult.value);
  const playerResult = inferPlayerName(ocrText);
  const brandSetResult = inferBrandSet(normalizedSearch, yearResult.value, cardNumberResult.value, playerResult.value);

  return {
    player: playerResult.value,
    year: yearResult.value,
    brandSet: brandSetResult.value,
    cardNumber: cardNumberResult.value,
    reasoning: {
      player: playerResult.reason,
      year: yearResult.reason,
      brandSet: brandSetResult.reason,
      cardNumber: cardNumberResult.reason,
    },
  };
}

function inferPlayerName(ocrText) {
  const cleanText = String(ocrText || "").replace(/[^\w\s'-]/g, " ");
  const lines = cleanText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const likelyLine = lines.find((line) => {
    const words = line.split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.length <= 4 && words.every((word) => /^[A-Z][a-z'-]+$/.test(word));
  });

  return {
    value: likelyLine || "",
    reason: likelyLine
      ? `Used OCR line "${likelyLine}" because it looked the most like a player name.`
      : "No strong player-name line was found in the OCR text.",
  };
}

function inferBrandSet(normalizedSearch, year, cardNumber, player) {
  const tokensToSkip = new Set(
    [year, cardNumber, ...normalizeText(player).split(" "), "card"]
      .filter(Boolean)
      .map((token) => String(token).toLowerCase()),
  );

  const keptTokens = normalizedSearch
    .split(" ")
    .filter((token) => token && !tokensToSkip.has(token) && LIKELY_SET_TERMS.has(token))
    .slice(0, 3);

  return {
    value: keptTokens.join(" ").trim(),
    reason: keptTokens.length
      ? `Kept likely set words ${keptTokens.map((token) => `"${token}"`).join(", ")} after dropping player/year/card-number words.`
      : "No strong brand/set words survived the cleanup rules.",
  };
}

function pickLikelyCardNumber(sourceText, year) {
  const matches = extractCardNumbers(sourceText).filter((token) => token && token !== year);
  const nonYearMatch = matches.find((token) => !/^(19|20)\d{2}$/.test(token));
  const chosen = nonYearMatch || matches[0] || "";

  return {
    value: chosen,
    reason: chosen
      ? `Picked "${chosen}" from the OCR number-like tokens ${matches.length ? matches.map((token) => `"${token}"`).join(", ") : "(none)"}.`
      : "No believable card-number token was found in the OCR text.",
  };
}

function inferYearFromText(normalizedSearch) {
  const year = normalizedSearch.match(/\b(19|20)\d{2}\b/)?.[0] || "";
  return {
    value: year,
    reason: year
      ? `Matched the 4-digit year "${year}" in the cleaned OCR/search text.`
      : "No 4-digit year pattern was found in the cleaned OCR/search text.",
  };
}

function buildSearchQueryVariants(crop) {
  return buildSearchQueryVariantDetails(crop).map((entry) => entry.query);
}

function buildSearchQueryVariantDetails(crop) {
  const details = getManualDetails(crop);
  const inferred = inferManualDetails(crop?.ocrText || "", crop?.searchQuery || "");
  const player = String(details.player || "").trim();
  const year = String(details.year || "").trim();
  const brandSet = String(details.brandSet || "").trim();
  const cardNumber = String(details.cardNumber || "").trim();
  const manualSearch = String(crop?.manualSearch || "").trim();
  const savedSearch = String(crop?.searchQuery || "").trim();
  const ocrQuery = buildEbaySearchText(crop?.ocrText || "");
  const customManualSearch =
    manualSearch &&
    manualSearch.toLowerCase() !== savedSearch.toLowerCase() &&
    manualSearch.toLowerCase() !== ocrQuery.toLowerCase()
      ? manualSearch
      : "";

  return uniqueQueryEntries([
    {
      query: customManualSearch,
      reason: "Used exactly what you typed into the Search eBay box because it was different from the saved OCR search.",
    },
    {
      query: buildManualSearchFromDetails(details),
      reason: `Built from the helper fields: player="${player}", year="${year}", brandSet="${brandSet}", cardNumber="${cardNumber}".`,
    },
    {
      query: savedSearch,
      reason: "Used the saved search text from the last scan pass.",
    },
    {
      query: manualSearch,
      reason: "Used the current Search eBay text box value.",
    },
    {
      query: [player, year, cardNumber].filter(Boolean).join(" "),
      reason: "Broadened to player + year + card number in case the set words were noisy.",
    },
    {
      query: [player, brandSet, cardNumber].filter(Boolean).join(" "),
      reason: "Tried player + brand/set + card number in case the year was wrong or missing.",
    },
    {
      query: [player, year, brandSet].filter(Boolean).join(" "),
      reason: "Tried player + year + brand/set in case the card number was wrong or missing.",
    },
    {
      query: [player, cardNumber].filter(Boolean).join(" "),
      reason: "Tried player + card number only as a looser fallback.",
    },
    {
      query: [player, year].filter(Boolean).join(" "),
      reason: "Tried player + year only as a broad fallback that should still find something.",
    },
    {
      query: player,
      reason: "Tried the player name by itself as the broadest useful fallback.",
    },
    {
      query: ocrQuery,
      reason: `Used the raw OCR cleanup query. Year reason: ${inferred.reasoning?.year || "-"} Brand/set reason: ${inferred.reasoning?.brandSet || "-"} Card number reason: ${inferred.reasoning?.cardNumber || "-"}`,
    },
  ]);
}

function getPreferredSearchText(crop) {
  return buildSearchQueryVariants(crop)[0] || String(crop?.manualSearch || crop?.searchQuery || "").trim();
}

function pickAutomaticLookupQueries(crop, queryVariantDetails = buildSearchQueryVariantDetails(crop)) {
  const details = getManualDetails(crop);
  const hasHelpfulDetails = hasManualDetails(details);
  const messyRead = looksLikeMessyRead(crop?.ocrText || "", crop?.ocrConfidence);
  const rawOcrQuery = buildEbaySearchText(crop?.ocrText || "").toLowerCase();

  if (messyRead && !hasHelpfulDetails) {
    return [];
  }

  return queryVariantDetails
    .filter((entry) => {
      if (!entry?.query) {
        return false;
      }

      if (!hasHelpfulDetails && messyRead && entry.query.toLowerCase() === rawOcrQuery) {
        return false;
      }

      return true;
    })
    .slice(0, AUTO_LOOKUP_QUERY_LIMIT);
}

function explainAutomaticLookupSkip(crop) {
  const details = getManualDetails(crop);
  if (!String(crop?.ocrText || "").trim()) {
    return "We could not read enough yet. Add player, year, set, or card number, then tap Search eBay.";
  }

  if (looksLikeMessyRead(crop?.ocrText || "", crop?.ocrConfidence) && !hasManualDetails(details)) {
    return "The read came through too rough for a smart auto-search. Add player, year, set, or card number, then tap Search eBay.";
  }

  return "Add player, year, set, or card number, then tap Search eBay.";
}

function uniqueQueries(queries) {
  const seen = new Set();
  return queries
    .map((query) => String(query || "").replace(/\s+/g, " ").trim())
    .filter((query) => query.length >= 3)
    .filter((query) => {
      const normalized = query.toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

function uniqueQueryEntries(entries) {
  const seen = new Set();
  return entries
    .map((entry) => ({
      query: String(entry?.query || "").replace(/\s+/g, " ").trim(),
      reason: String(entry?.reason || "").trim(),
    }))
    .filter((entry) => entry.query.length >= 3)
    .filter((entry) => {
      const normalized = entry.query.toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

function findSelectedCandidate(crop) {
  if (!crop) {
    return null;
  }

  return crop.matchCandidates.find((candidate) => candidate.catalogCardId === crop.selectedCatalogCardId) || null;
}

async function fetchCandidatesForCrop({ searchQuery, imageDataUrl, fallbackQueries = [], useImage = Boolean(imageDataUrl), maxQueries = null } = {}) {
  let queryQueue = uniqueQueries([searchQuery, ...fallbackQueries]);
  if (Number.isFinite(maxQueries) && maxQueries > 0) {
    queryQueue = queryQueue.slice(0, maxQueries);
  }

  const imageLookupDataUrl = useImage ? imageDataUrl : "";
  if (!queryQueue.length && !imageLookupDataUrl) {
    return {
      candidates: [],
      attempts: [],
      queryQueue: [],
    };
  }

  const merged = [];
  const seen = new Set();
  const attempts = [];

  if (!queryQueue.length && imageLookupDataUrl) {
    const matchData = await fetchEbayMatches({
      searchQuery: "",
      imageDataUrl: imageLookupDataUrl,
      limit: 6,
    });
    attempts.push(buildLookupAttempt("", matchData, true));
    return {
      candidates: matchData.candidates || [],
      attempts,
      queryQueue,
    };
  }

  for (let index = 0; index < queryQueue.length; index += 1) {
    const query = queryQueue[index];
    const matchData = await fetchEbayMatches({
      searchQuery: query,
      imageDataUrl: index === 0 ? imageLookupDataUrl : "",
      limit: 6,
    });
    attempts.push(buildLookupAttempt(query, matchData, index === 0 && Boolean(imageLookupDataUrl)));

    (matchData.candidates || []).forEach((candidate) => {
      const key = candidate.itemWebUrl || candidate.catalogCardId || candidate.title;
      if (!key || seen.has(key)) {
        return;
      }

      seen.add(key);
      merged.push(candidate);
    });

    if (merged.length >= 6) {
      break;
    }
  }

  return {
    candidates: merged.slice(0, 6),
    attempts,
    queryQueue,
  };
}

async function searchSelectedCropOnEbay(selected) {
  const queryVariants = buildSearchQueryVariants(selected.crop);
  const query = String(queryVariants[0] || "").trim();
  const useImageLookup = !query;
  if (!query && !selected.crop.imageDataUrl) {
    recordAppDebugEvent("lookup_blocked", "Manual eBay search was tapped without enough info.", {
      cropId: selected.crop.cropId,
    });
    setStatus("Give eBay a few words first, like player, year, set, or card number.");
    return;
  }

  selected.crop.manualSearch = query;
  selected.crop.searchQuery = query;
  selected.crop.lookupState = "loading";
  selected.crop.lookupMessage = query ? `Searching eBay for "${query}"...` : "Searching eBay from the card photo...";
  selected.crop.debugInfo = buildLookupDebugInfo({
    searchReason: "review",
    primaryQuery: query,
    queryVariants,
    queryVariantDetails: buildSearchQueryVariantDetails(selected.crop),
    lookupResult: {
      candidates: selected.crop.matchCandidates || [],
      attempts: [],
      queryQueue: queryVariants,
    },
    ocrResult: {
      text: selected.crop.ocrText || "",
      confidence: selected.crop.ocrConfidence,
      rotation: selected.crop.ocrRotation || 0,
      error: selected.crop.ocrError || "",
    },
    manualDetails: getManualDetails(selected.crop),
    cropNote: selected.crop.note || "",
    lookupState: selected.crop.lookupState,
    lookupMessage: selected.crop.lookupMessage,
    searchStyle: useImageLookup ? "Manual photo search" : "Manual text search",
  });
  saveState(state);
  setStatus(selected.crop.lookupMessage);
  render();

  await runCropLookup({
    cropId: selected.crop.cropId,
    searchReason: "review",
    queryVariantDetails: buildSearchQueryVariantDetails(selected.crop),
    imageDataUrl: useImageLookup ? selected.crop.imageDataUrl : "",
    searchStyle: useImageLookup ? "Manual photo search" : "Manual text search",
  });
}

async function runCropLookup({ cropId, searchReason, queryVariantDetails, imageDataUrl = "", searchStyle = "Text search" }) {
  const selected = findCropEntryById(cropId);
  if (!selected) {
    return;
  }

  const crop = selected.crop;
  const queryVariants = (queryVariantDetails || []).map((entry) => entry.query);
  const primaryQuery = String(queryVariants[0] || "").trim();
  const useImageLookup = Boolean(imageDataUrl) && !primaryQuery;
  recordAppDebugEvent("lookup_started", "Started looking for close eBay cards.", {
    cropId,
    searchReason,
    primaryQuery: primaryQuery || "(photo only)",
    useImage: useImageLookup ? "yes" : "no",
    queryCount: queryVariants.length,
    searchStyle,
  });

  try {
    const lookupResult = await fetchCandidatesForCrop({
      searchQuery: primaryQuery,
      imageDataUrl,
      fallbackQueries: queryVariants.slice(1),
      useImage: useImageLookup,
      maxQueries: searchReason === "scan" ? AUTO_LOOKUP_QUERY_LIMIT : null,
    });
    const refreshed = findCropEntryById(cropId);
    if (!refreshed) {
      return;
    }

    const refreshedCrop = refreshed.crop;
    const candidates = lookupResult.candidates;
    refreshedCrop.matchCandidates = candidates;
    refreshedCrop.selectedCatalogCardId = candidates[0]?.catalogCardId || "";
    refreshedCrop.lookupState = candidates.length ? "done" : "empty";
    refreshedCrop.lookupMessage = candidates.length
      ? `Found ${candidates.length} likely eBay card${candidates.length === 1 ? "" : "s"}.`
      : primaryQuery
        ? `Nothing close showed up on eBay for "${primaryQuery}" yet.`
        : "Nothing close showed up from the card photo yet.";
    refreshedCrop.debugInfo = buildLookupDebugInfo({
      searchReason,
      primaryQuery,
      queryVariants,
      queryVariantDetails,
      lookupResult,
      ocrResult: {
        text: refreshedCrop.ocrText || "",
        confidence: refreshedCrop.ocrConfidence,
        rotation: refreshedCrop.ocrRotation || 0,
        error: refreshedCrop.ocrError || "",
      },
      manualDetails: getManualDetails(refreshedCrop),
      cropNote: refreshedCrop.note || "",
      lookupState: refreshedCrop.lookupState,
      lookupMessage: refreshedCrop.lookupMessage,
      searchStyle,
    });
    recordAppDebugEvent("lookup_done", "Finished the eBay lookup.", {
      cropId,
      candidateCount: candidates.length,
      topTitle: candidates[0]?.title || candidates[0]?.playerName || "",
      primaryQuery: primaryQuery || "(photo only)",
    });
    saveState(state);
    setStatus(
      candidates.length
        ? `eBay found ${candidates.length} likely card${candidates.length === 1 ? "" : "s"}${primaryQuery ? ` for "${primaryQuery}"` : ""}.`
        : refreshedCrop.lookupMessage,
    );
    render();
  } catch (error) {
    const refreshed = findCropEntryById(cropId);
    if (!refreshed) {
      return;
    }

    refreshed.crop.lookupState = "error";
    refreshed.crop.lookupMessage = error.message;
    refreshed.crop.debugInfo = buildLookupDebugInfo({
      searchReason,
      primaryQuery,
      queryVariants,
      queryVariantDetails,
      lookupResult: {
        candidates: refreshed.crop.matchCandidates || [],
        attempts: [],
        queryQueue: queryVariants,
      },
      ocrResult: {
        text: refreshed.crop.ocrText || "",
        confidence: refreshed.crop.ocrConfidence,
        rotation: refreshed.crop.ocrRotation || 0,
        error: refreshed.crop.ocrError || "",
      },
      manualDetails: getManualDetails(refreshed.crop),
      cropNote: refreshed.crop.note || "",
      lookupState: refreshed.crop.lookupState,
      lookupMessage: refreshed.crop.lookupMessage,
      searchStyle,
    });
    recordAppDebugEvent("lookup_error", error.message || "eBay lookup failed.", {
      cropId,
      primaryQuery: primaryQuery || "(photo only)",
    });
    saveState(state);
    setStatus(`eBay search hit a snag. ${error.message}`);
    render();
  }
}

function openSelectedCropOnEbay(selected) {
  const query = buildSearchQueryVariants(selected.crop)[0] || "";
  if (!query) {
    setStatus("Add a player, year, set, or card number first, then open eBay.");
    return;
  }

  window.open(buildEbayLiveSearchUrl(query), "_blank", "noreferrer");
}

function buildPricingFromCandidate(candidate) {
  return {
    mode: "automatic",
    estimate: candidate.typicalSold,
    typicalSold: candidate.typicalSold,
    lowSold: candidate.lowSold,
    highSold: candidate.highSold,
    soldSearchUrl: candidate.soldSearchUrl || buildSoldSearchUrl(candidate.pricingQuery || candidate.title || candidate.searchQuery || ""),
    note: candidate.sampleSize
      ? `Based on ${candidate.sampleSize} recent eBay sale${candidate.sampleSize === 1 ? "" : "s"}.`
      : "Based on recent eBay sales.",
    comparableListings: candidate.comparableListings || [],
  };
}

function buildLookupAttempt(query, matchData, usedImage) {
  const candidates = matchData?.candidates || [];
  return {
    query: query || "(photo only)",
    usedImage,
    source: matchData?.source || "",
    note: matchData?.note || "",
    candidateCount: candidates.length,
    topTitles: candidates.slice(0, 3).map((candidate) => candidate.title || candidate.playerName || "").filter(Boolean),
  };
}

function loadAppDebugHistory() {
  try {
    const raw = window.localStorage.getItem(DEBUG_HISTORY_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.slice(-DEBUG_HISTORY_LIMIT) : [];
  } catch (error) {
    console.warn("Could not load app debug history.", error);
    return [];
  }
}

function persistAppDebugHistory() {
  try {
    window.localStorage.setItem(DEBUG_HISTORY_KEY, JSON.stringify(appDebugHistory.slice(-DEBUG_HISTORY_LIMIT)));
  } catch (error) {
    console.warn("Could not save app debug history.", error);
  }
}

function sanitizeDebugMeta(meta = {}) {
  return Object.fromEntries(
    Object.entries(meta)
      .map(([key, value]) => [key, value == null ? "" : String(value).trim()])
      .filter(([, value]) => value !== ""),
  );
}

function recordAppDebugEvent(step, message, meta = {}) {
  const now = Date.now();
  const previous = appDebugHistory[appDebugHistory.length - 1] || null;
  const previousAt = previous ? new Date(previous.at).getTime() : now;
  const entry = {
    at: new Date(now).toISOString(),
    step: String(step || "event"),
    message: String(message || "").trim(),
    screen: ui?.activeScreen || "",
    sinceLastMs: Math.max(0, now - previousAt),
    meta: sanitizeDebugMeta(meta),
  };

  appDebugHistory.push(entry);
  appDebugHistory = appDebugHistory.slice(-DEBUG_HISTORY_LIMIT);
  persistAppDebugHistory();
  return entry;
}

function formatAppDebugHistoryLines(limit = 18) {
  const entries = appDebugHistory.slice(-limit);
  if (!entries.length) {
    return "none";
  }

  return entries
    .map((entry, index) => {
      const metaText = Object.entries(entry.meta || {})
        .map(([key, value]) => `${key}=${value}`)
        .join(" | ");
      return `${index + 1}. ${entry.at} | ${entry.step} | ${entry.message || "-"}${entry.screen ? ` | screen=${entry.screen}` : ""}${
        entry.sinceLastMs ? ` | +${entry.sinceLastMs}ms` : ""
      }${metaText ? ` | ${metaText}` : ""}`;
    })
    .join("\n");
}

function formatAppDebugHistory() {
  return [
    `Build: ${APP_VERSION}`,
    `When copied: ${new Date().toISOString()}`,
    `Saved events: ${appDebugHistory.length}`,
    `Recent app events:\n${formatAppDebugHistoryLines()}`,
  ].join("\n");
}

function buildLookupDebugInfo({
  searchReason,
  primaryQuery,
  queryVariants,
  queryVariantDetails,
  lookupResult,
  ocrResult,
  manualDetails,
  cropNote,
  lookupState = "",
  lookupMessage = "",
  searchStyle = "",
}) {
  const inferred = inferManualDetails(ocrResult?.text || "", primaryQuery || "");

  return {
    version: APP_VERSION,
    searchedAt: new Date().toISOString(),
    searchReason,
    searchStyle,
    primaryQuery,
    queryVariants,
    queryVariantDetails: queryVariantDetails || [],
    queryQueue: lookupResult?.queryQueue || [],
    attempts: lookupResult?.attempts || [],
    ocrText: ocrResult?.text || "",
    ocrConfidence: ocrResult?.confidence,
    ocrRotation: ocrResult?.rotation || 0,
    ocrError: ocrResult?.error || "",
    manualDetails,
    detailReasoning: inferred.reasoning || {},
    cropNote: cropNote || "",
    lookupState,
    lookupMessage,
    finalCandidateCount: lookupResult?.candidates?.length || 0,
    finalCandidates: (lookupResult?.candidates || []).slice(0, 5).map((candidate) => ({
      title: candidate.title || candidate.playerName || "",
      price: candidate.priceText || "",
      confidence: candidate.confidenceScore,
    })),
  };
}

function formatDebugInfo(crop) {
  const debug = crop?.debugInfo || {};
  const selectedCandidate = findSelectedCandidate(crop);
  const preferredQuery = getPreferredSearchText(crop);
  const liveSearchUrl = preferredQuery ? buildEbayLiveSearchUrl(preferredQuery) : "";
  const detailReasoning = debug.detailReasoning || {};
  const attemptLines = (debug.attempts || []).length
    ? debug.attempts
        .map(
          (attempt, index) =>
            `${index + 1}. query="${attempt.query}" | image=${attempt.usedImage ? "yes" : "no"} | source=${attempt.source || "-"} | count=${attempt.candidateCount} | note=${attempt.note || "-"}${attempt.topTitles?.length ? ` | top=${attempt.topTitles.join(" || ")}` : ""}`,
        )
        .join("\n")
    : "none";
  const queryReasonLines = (debug.queryVariantDetails || []).length
    ? debug.queryVariantDetails
        .map((entry, index) => `${index + 1}. "${entry.query}" -> ${entry.reason}`)
        .join("\n")
    : "none";
  const finalCandidateLines = (crop?.matchCandidates || []).length
    ? crop.matchCandidates
        .slice(0, 5)
        .map(
          (candidate, index) =>
            `${index + 1}. ${candidate.title || candidate.playerName || "Unknown"} | ${candidate.priceText || "-"} | ${(candidate.confidenceScore * 100).toFixed(0)}%`,
        )
        .join("\n")
    : "none";

  return [
    `Build: ${APP_VERSION}`,
    `When copied: ${new Date().toISOString()}`,
    `Last search run: ${debug.searchedAt || "-"}`,
    `Search reason: ${debug.searchReason || "-"}`,
    `Search style: ${debug.searchStyle || "-"}`,
    `Preferred search text: ${preferredQuery || "-"}`,
    `Primary query used: ${debug.primaryQuery || "-"}`,
    `Query variants: ${(debug.queryVariants || []).join(" | ") || "-"}`,
    `Lookup state: ${crop?.lookupState || debug.lookupState || "-"}`,
    `Lookup note: ${crop?.lookupMessage || debug.lookupMessage || "-"}`,
    `Selected match: ${selectedCandidate?.title || "-"}`,
    `Candidate count: ${crop?.matchCandidates?.length || 0}`,
    `OCR confidence: ${Number.isFinite(crop?.ocrConfidence) ? `${Math.round(crop.ocrConfidence * 100)}%` : "-"}`,
    `OCR rotation used: ${debug.ocrRotation || crop?.ocrRotation || 0}`,
    `OCR error: ${crop?.ocrError || "-"}`,
    `OCR text: ${crop?.ocrText || "-"}`,
    `Crop note: ${crop?.note || debug.cropNote || "-"}`,
    `Manual details: player="${debug.manualDetails?.player || ""}" | year="${debug.manualDetails?.year || ""}" | brandSet="${debug.manualDetails?.brandSet || ""}" | cardNumber="${debug.manualDetails?.cardNumber || ""}"`,
    `Why player: ${detailReasoning.player || "-"}`,
    `Why year: ${detailReasoning.year || "-"}`,
    `Why brand/set: ${detailReasoning.brandSet || "-"}`,
    `Why card number: ${detailReasoning.cardNumber || "-"}`,
    `Open eBay URL: ${liveSearchUrl || "-"}`,
    `Why these queries:\n${queryReasonLines}`,
    `Lookup attempts:\n${attemptLines}`,
    `Final candidates:\n${finalCandidateLines}`,
    `Recent app history:\n${formatAppDebugHistoryLines(14)}`,
  ].join("\n");
}

async function copyAppDebugHistory() {
  const debugText = formatAppDebugHistory();
  try {
    await navigator.clipboard.writeText(debugText);
    setStatus("Copied the app history. Paste it here and I can see the last steps before things went sideways.");
  } catch (error) {
    setStatus("Could not copy automatically. You can still select the app history box text and paste it here.");
  }
}

async function shareAppDebugHistory() {
  const debugText = formatAppDebugHistory();
  if (!navigator.share) {
    await copyAppDebugHistory();
    return;
  }

  try {
    await navigator.share({
      title: `Card Scanner App History ${APP_VERSION}`,
      text: debugText,
    });
    setStatus("Opened the share sheet for the app history.");
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }

    await copyAppDebugHistory();
  }
}

async function copyCropDebugInfo(selected) {
  const debugText = formatDebugInfo(selected.crop);
  try {
    await navigator.clipboard.writeText(debugText);
    setStatus("Copied the debug info. Paste it here and I can dig in faster.");
  } catch (error) {
    setStatus("Could not copy automatically. You can still select the debug box text and paste it here.");
  }
}

async function shareCropDebugInfo(selected) {
  const debugText = formatDebugInfo(selected.crop);
  if (!navigator.share) {
    await copyCropDebugInfo(selected);
    return;
  }

  try {
    await navigator.share({
      title: `Card Scanner Debug ${APP_VERSION}`,
      text: debugText,
    });
    setStatus("Opened the share sheet for the debug info.");
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }

    await copyCropDebugInfo(selected);
  }
}

function setStatus(message) {
  ui.statusMessage = message;
  refs.statusBanner.textContent = ui.statusMessage;
  const lastEntry = appDebugHistory[appDebugHistory.length - 1] || null;
  if (lastEntry?.step !== "status" || lastEntry?.message !== ui.statusMessage) {
    recordAppDebugEvent("status", ui.statusMessage);
  }
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

function formatOptionalCurrency(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
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
      return "Take a look";
  }
}

function humanReviewStatusForCrop(crop) {
  if (!crop) {
    return "Take a look";
  }

  if (crop.reviewStatus === "pending") {
    if (crop.lookupState === "reading") {
      return "Reading";
    }

    if (crop.lookupState === "loading") {
      return "Searching";
    }
  }

  return humanReviewStatus(crop.reviewStatus);
}

function describeReadText(crop) {
  if (crop.lookupState === "reading") {
    return "We are still reading this card. Once that is done, we will tighten the search.";
  }

  if (crop.ocrError) {
    return "We had a hard time reading this one. That is okay. Pick the right card below.";
  }

  const cleaned = String(crop.ocrText || "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "We could not read much from this one. Use the card choices below.";
  }

  const looksMessy = looksLikeMessyRead(cleaned, crop.ocrConfidence);
  if (looksMessy) {
    return "This one came through rough. That is normal on shiny cards. Use the eBay picks below or tighten the search.";
  }

  return shortenText(cleaned, 140);
}

function looksLikeMessyRead(text, confidence) {
  if (Number.isFinite(confidence) && confidence < 0.55) {
    return true;
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return true;
  }

  const shortWordCount = words.filter((word) => word.length <= 2).length;
  const weirdCharCount = (text.match(/[^a-z0-9\s#&.,:'"()-]/gi) || []).length;
  return shortWordCount / words.length > 0.45 || weirdCharCount > Math.max(4, text.length * 0.08);
}

function shortenText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}...`;
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
