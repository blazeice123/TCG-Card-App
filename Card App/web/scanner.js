const OCR_LANGUAGE = "eng";
const MAX_DIMENSION = 1600;
const TARGET_CARD_WIDTH = 500;
const TARGET_CARD_HEIGHT = 700;
const OPENCV_SCRIPT_URL = "https://docs.opencv.org/4.x/opencv.js";
const TESSERACT_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

let openCvState = {
  ready: false,
  loading: false,
  error: null,
};

let tesseractState = {
  ready: false,
  loading: false,
  error: null,
};

const scriptLoadPromises = new Map();

export async function waitForOpenCv(timeoutMs = 18000) {
  if (openCvState.ready && window.cv) {
    return window.cv;
  }

  openCvState.loading = true;
  openCvState.error = null;
  await loadScriptOnce(OPENCV_SCRIPT_URL);

  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const timer = window.setInterval(() => {
      const hasCvApi = Boolean(window.cv && window.cv.Mat && window.cv.imread && window.cv.findContours);
      if (hasCvApi) {
        openCvState = {
          ready: true,
          loading: false,
          error: null,
        };
        window.clearInterval(timer);
        resolve(window.cv);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        openCvState = {
          ready: false,
          loading: false,
          error: "We had trouble getting the photo helper ready.",
        };
        window.clearInterval(timer);
        reject(new Error(openCvState.error));
      }
    }, 250);
  });
}

export async function waitForTesseract(timeoutMs = 18000) {
  if (window.Tesseract && typeof window.Tesseract.recognize === "function") {
    tesseractState = {
      ready: true,
      loading: false,
      error: null,
    };
    return window.Tesseract;
  }

  tesseractState.loading = true;
  tesseractState.error = null;
  await loadScriptOnce(TESSERACT_SCRIPT_URL);

  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const timer = window.setInterval(() => {
      if (window.Tesseract && typeof window.Tesseract.recognize === "function") {
        tesseractState = {
          ready: true,
          loading: false,
          error: null,
        };
        window.clearInterval(timer);
        resolve(window.Tesseract);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        tesseractState = {
          ready: false,
          loading: false,
          error: "We had trouble getting the text helper ready.",
        };
        window.clearInterval(timer);
        reject(new Error(tesseractState.error));
      }
    }, 250);
  });
}

export function getEngineStatusText() {
  if (openCvState.loading || tesseractState.loading) {
    return "Getting things ready...";
  }

  if (openCvState.ready) {
    return "Ready to go. Tap Find My Cards when you are set.";
  }

  if (openCvState.error || tesseractState.error) {
    return `${openCvState.error || tesseractState.error} You can still try one card at a time.`;
  }

  return "Ready when you are.";
}

export async function loadImageFile(file) {
  const dataUrl = await fileToDataUrl(file);
  return loadImageSource(dataUrl, file.name);
}

export async function loadImageSource(dataUrl, fileName = "Selected photo") {
  const image = await loadImage(dataUrl);
  return {
    fileName,
    dataUrl,
    image,
  };
}

export async function detectCropsFromImage(dataUrl, mode) {
  if (mode === "single") {
    const image = await loadImage(dataUrl);
    return [createSingleCrop(dataUrl, image.width, image.height)];
  }

  try {
    await waitForOpenCv();
    const detected = await detectPageCards(dataUrl);
    if (detected.length) {
      return detected;
    }
  } catch (error) {
    console.warn("Page detection failed. Falling back to one crop.", error);
  }

  const image = await loadImage(dataUrl);
  return [createSingleCrop(dataUrl, image.width, image.height, "We kept the whole photo together because it was tough to split up.")];
}

export async function runOcr(dataUrl) {
  const tesseract = await waitForTesseract();
  const sourceImage = await loadImage(dataUrl).catch(() => null);
  const firstPass = await recognizeOcrCandidate(tesseract, dataUrl, 0);
  let bestCandidate = {
    ...firstPass,
    imageDataUrl: dataUrl,
  };

  const likelySideways = sourceImage ? sourceImage.width > sourceImage.height * 1.04 : false;
  const shouldTryMoreRotations = likelySideways || scoreOcrCandidate(bestCandidate) < 0.5;
  if (!shouldTryMoreRotations) {
    return bestCandidate;
  }

  const rotationPlan = likelySideways ? [90, 270, 180] : [180, 90, 270];
  for (const angle of rotationPlan) {
    const rotatedDataUrl = await rotateImageDataUrl(dataUrl, angle);
    const candidate = await recognizeOcrCandidate(tesseract, rotatedDataUrl, angle);
    const scoredCandidate = {
      ...candidate,
      imageDataUrl: rotatedDataUrl,
    };

    if (scoreOcrCandidate(scoredCandidate) > scoreOcrCandidate(bestCandidate) + 0.04) {
      bestCandidate = scoredCandidate;
    }
  }

  return bestCandidate;
}

async function detectPageCards(dataUrl) {
  const cv = window.cv;
  const image = await loadImage(dataUrl);
  const { canvas, scale } = drawScaledImage(image, MAX_DIMENSION);

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 60, 180);
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const foundRects = [];
    const minArea = canvas.width * canvas.height * 0.035;

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const area = cv.contourArea(contour);
      if (area < minArea) {
        contour.delete();
        continue;
      }

      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.035 * perimeter, true);

      if (approx.rows === 4) {
        const points = [];
        for (let pointIndex = 0; pointIndex < 4; pointIndex += 1) {
          points.push({
            x: approx.data32S[pointIndex * 2],
            y: approx.data32S[pointIndex * 2 + 1],
          });
        }

        const orderedPoints = orderPoints(points);
        const width = distanceBetween(orderedPoints[0], orderedPoints[1]);
        const height = distanceBetween(orderedPoints[0], orderedPoints[3]);
        const aspectRatio = Math.min(width, height) / Math.max(width, height);
        const boundingRect = cv.boundingRect(contour);
        const rectangularity = area / Math.max(boundingRect.width * boundingRect.height, 1);

        if (aspectRatio > 0.55 && aspectRatio < 0.8 && rectangularity > 0.72) {
          foundRects.push({
            area,
            orderedPoints,
            boundingRect,
          });
        }
      }

      approx.delete();
      contour.delete();
    }

    const filteredRects = suppressOverlaps(
      foundRects.sort((left, right) => right.area - left.area),
      0.22,
    ).slice(0, 16);

    return filteredRects.map((entry, index) => warpCrop(src, entry.orderedPoints, scale, index));
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }
}

function warpCrop(src, orderedPoints, scale, index) {
  const cv = window.cv;
  const srcTri = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    orderedPoints.flatMap((point) => [point.x, point.y]),
  );
  const dstTri = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    [0, 0, TARGET_CARD_WIDTH, 0, TARGET_CARD_WIDTH, TARGET_CARD_HEIGHT, 0, TARGET_CARD_HEIGHT],
  );
  const transform = cv.getPerspectiveTransform(srcTri, dstTri);
  const destination = new cv.Mat();

  try {
    cv.warpPerspective(
      src,
      destination,
      transform,
      new cv.Size(TARGET_CARD_WIDTH, TARGET_CARD_HEIGHT),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(),
    );

    const canvas = document.createElement("canvas");
    cv.imshow(canvas, destination);

    const scaledPoints = orderedPoints.map((point) => ({
      x: point.x / scale,
      y: point.y / scale,
    }));

    return {
      cropId: `crop_${Date.now()}_${index}`,
      imageDataUrl: canvas.toDataURL("image/jpeg", 0.92),
      bounds: {
        left: Math.min(...scaledPoints.map((point) => point.x)),
        top: Math.min(...scaledPoints.map((point) => point.y)),
        right: Math.max(...scaledPoints.map((point) => point.x)),
        bottom: Math.max(...scaledPoints.map((point) => point.y)),
      },
      note: "Pulled from the full photo.",
    };
  } finally {
    srcTri.delete();
    dstTri.delete();
    transform.delete();
    destination.delete();
  }
}

function createSingleCrop(dataUrl, width, height, note = "Used the whole photo.") {
  return {
    cropId: `crop_${Date.now()}_single`,
    imageDataUrl: dataUrl,
    bounds: {
      left: 0,
      top: 0,
      right: width,
      bottom: height,
    },
    note,
  };
}

function drawScaledImage(image, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  return {
    canvas,
    scale,
  };
}

function cleanupOcrText(text) {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function recognizeOcrCandidate(tesseract, dataUrl, rotation) {
  const result = await tesseract.recognize(dataUrl, OCR_LANGUAGE, {});
  return {
    text: cleanupOcrText(result?.data?.text || ""),
    confidence: Number.isFinite(result?.data?.confidence) ? result.data.confidence / 100 : null,
    rotation,
  };
}

function scoreOcrCandidate(candidate) {
  const cleaned = String(candidate?.text || "").trim();
  const confidence = Number.isFinite(candidate?.confidence) ? candidate.confidence : 0;
  if (!cleaned) {
    return confidence * 0.2;
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  const readableWords = words.filter((word) => /[a-z]/i.test(word) && word.length >= 3).length;
  const shortWords = words.filter((word) => word.length <= 2).length;
  const yearHits = (cleaned.match(/\b(19|20)\d{2}\b/g) || []).length;
  const cardNumberHits = (cleaned.match(/\b[a-z]{0,2}\d{1,4}[a-z]{0,2}\b/gi) || []).length;
  const weirdChars = (cleaned.match(/[^a-z0-9\s#&.,:'"()/+-]/gi) || []).length;
  const readableRatio = readableWords / Math.max(words.length, 1);
  const shortPenalty = (shortWords / Math.max(words.length, 1)) * 0.18;
  const weirdPenalty = Math.min(0.22, weirdChars / Math.max(cleaned.length, 1));

  return (
    confidence * 0.58 +
    Math.min(0.2, readableRatio * 0.28) +
    Math.min(0.1, yearHits * 0.05) +
    Math.min(0.08, cardNumberHits * 0.04) +
    Math.min(0.1, cleaned.length / 120) -
    shortPenalty -
    weirdPenalty
  );
}

async function rotateImageDataUrl(dataUrl, angle) {
  const normalizedAngle = ((angle % 360) + 360) % 360;
  if (normalizedAngle === 0) {
    return dataUrl;
  }

  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (normalizedAngle === 90 || normalizedAngle === 270) {
    canvas.width = image.height;
    canvas.height = image.width;
  } else {
    canvas.width = image.width;
    canvas.height = image.height;
  }

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((normalizedAngle * Math.PI) / 180);
  context.drawImage(image, -image.width / 2, -image.height / 2);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function orderPoints(points) {
  const sumSorted = [...points].sort((left, right) => left.x + left.y - (right.x + right.y));
  const diffSorted = [...points].sort((left, right) => left.y - left.x - (right.y - right.x));

  return [
    sumSorted[0],
    diffSorted[0],
    sumSorted[sumSorted.length - 1],
    diffSorted[diffSorted.length - 1],
  ];
}

function distanceBetween(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function suppressOverlaps(rectangles, threshold) {
  const kept = [];

  rectangles.forEach((candidate) => {
    const overlapsExisting = kept.some((saved) => intersectionOverUnion(candidate.boundingRect, saved.boundingRect) > threshold);
    if (!overlapsExisting) {
      kept.push(candidate);
    }
  });

  return kept;
}

function intersectionOverUnion(left, right) {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = left.width * left.height + right.width * right.height - intersection;

  return union > 0 ? intersection / union : 0;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read that photo."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load that photo."));
    image.src = source;
  });
}

function loadScriptOnce(sourceUrl) {
  if (scriptLoadPromises.has(sourceUrl)) {
    return scriptLoadPromises.get(sourceUrl);
  }

  const existingScript = [...document.querySelectorAll("script")].find((script) => script.src === sourceUrl);
  if (existingScript?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  const promise = new Promise((resolve, reject) => {
    const script =
      existingScript ||
      Object.assign(document.createElement("script"), {
        async: true,
        src: sourceUrl,
      });

    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };

    const handleLoad = () => {
      script.dataset.loaded = "true";
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      scriptLoadPromises.delete(sourceUrl);
      reject(new Error(`Could not load ${sourceUrl}.`));
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    if (!existingScript) {
      document.head.appendChild(script);
    }
  });

  scriptLoadPromises.set(sourceUrl, promise);
  return promise;
}
