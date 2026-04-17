import { EXPECTED_HEADER } from "./catalog.js";

export const DEMO_CATALOG_ROWS = [
  {
    catalog_card_id: "demo_bkb_1989_jordan",
    sport: "basketball",
    year: "1989",
    brand: "Hoops",
    set_name: "Base",
    subset_name: "",
    card_number: "200",
    player_name: "Michael Jordan",
    team_name: "Chicago Bulls",
    rookie_flag: "false",
    parallel: "",
    variation: "",
    search_query_override: "",
    notes: "Demo basketball card for end-to-end testing.",
  },
  {
    catalog_card_id: "demo_bkb_1996_kobe",
    sport: "basketball",
    year: "1996",
    brand: "Topps",
    set_name: "Base",
    subset_name: "",
    card_number: "138",
    player_name: "Kobe Bryant",
    team_name: "Los Angeles Lakers",
    rookie_flag: "true",
    parallel: "",
    variation: "",
    search_query_override: "",
    notes: "Demo rookie card for OCR and review testing.",
  },
  {
    catalog_card_id: "demo_bkb_2003_lebron",
    sport: "basketball",
    year: "2003",
    brand: "Topps",
    set_name: "Base",
    subset_name: "",
    card_number: "221",
    player_name: "LeBron James",
    team_name: "Cleveland Cavaliers",
    rookie_flag: "true",
    parallel: "",
    variation: "",
    search_query_override: "",
    notes: "Demo basketball rookie card.",
  },
  {
    catalog_card_id: "demo_bsb_2001_pujols",
    sport: "baseball",
    year: "2001",
    brand: "Bowman Chrome",
    set_name: "Base",
    subset_name: "",
    card_number: "340",
    player_name: "Albert Pujols",
    team_name: "St. Louis Cardinals",
    rookie_flag: "true",
    parallel: "",
    variation: "",
    search_query_override: "",
    notes: "Demo baseball rookie card.",
  },
  {
    catalog_card_id: "demo_bsb_2018_ohtani",
    sport: "baseball",
    year: "2018",
    brand: "Topps Update",
    set_name: "Base",
    subset_name: "",
    card_number: "US1",
    player_name: "Shohei Ohtani",
    team_name: "Los Angeles Angels",
    rookie_flag: "true",
    parallel: "",
    variation: "",
    search_query_override: "",
    notes: "Demo baseball card for mixed alphanumeric numbers.",
  },
  {
    catalog_card_id: "demo_ftb_2000_brady",
    sport: "football",
    year: "2000",
    brand: "Bowman",
    set_name: "Base",
    subset_name: "",
    card_number: "236",
    player_name: "Tom Brady",
    team_name: "New England Patriots",
    rookie_flag: "true",
    parallel: "",
    variation: "",
    search_query_override: "",
    notes: "Demo football rookie card.",
  },
];

export const DEMO_PRICE_ESTIMATES = {
  demo_bkb_1989_jordan: 750,
  demo_bkb_1996_kobe: 320,
  demo_bkb_2003_lebron: 480,
  demo_bsb_2001_pujols: 145,
  demo_bsb_2018_ohtani: 110,
  demo_ftb_2000_brady: 260,
};

const DEMO_PAGE_WIDTH = 1320;
const DEMO_PAGE_HEIGHT = 1360;
const DEMO_PAGE_CARD_WIDTH = 340;
const DEMO_PAGE_CARD_HEIGHT = 476;
const DEMO_CARD_WIDTH = 460;
const DEMO_CARD_HEIGHT = 644;

export function buildDemoCatalogCsv() {
  const rows = [EXPECTED_HEADER.join(",")];

  DEMO_CATALOG_ROWS.forEach((row) => {
    const values = EXPECTED_HEADER.map((key) => csvEscape(row[key] ?? ""));
    rows.push(values.join(","));
  });

  return rows.join("\n");
}

export function generateDemoImage(mode = "page") {
  if (mode === "single") {
    return generateDemoCardAsset(DEMO_CATALOG_ROWS[0].catalog_card_id);
  }

  const cards = DEMO_CATALOG_ROWS.slice(0, 6);
  const svg = buildDemoSheetSvg(cards);

  return {
    name: "demo-scan-sheet.svg",
    dataUrl: svgToDataUrl(svg),
  };
}

export function generateDemoCardAsset(catalogCardId) {
  const card = DEMO_CATALOG_ROWS.find((entry) => entry.catalog_card_id === catalogCardId) || DEMO_CATALOG_ROWS[0];
  const svg = buildSingleCardSvg(card);

  return {
    name: `${card.player_name.toLowerCase().replace(/\s+/g, "-")}-demo-card.svg`,
    dataUrl: svgToDataUrl(svg),
  };
}

function buildDemoSheetSvg(cards) {
  const columns = 3;
  const gapX = 28;
  const gapY = 30;
  const startX = 88;
  const startY = 205;

  const cardsMarkup = cards
    .map((card, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + column * (DEMO_PAGE_CARD_WIDTH + gapX);
      const y = startY + row * (DEMO_PAGE_CARD_HEIGHT + gapY);
      return buildCardSvgMarkup(card, {
        x,
        y,
        width: DEMO_PAGE_CARD_WIDTH,
        height: DEMO_PAGE_CARD_HEIGHT,
        withShadow: true,
      });
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${DEMO_PAGE_WIDTH}" height="${DEMO_PAGE_HEIGHT}" viewBox="0 0 ${DEMO_PAGE_WIDTH} ${DEMO_PAGE_HEIGHT}">
      <defs>
        <linearGradient id="pageGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#15254b" />
          <stop offset="100%" stop-color="#091126" />
        </linearGradient>
      </defs>
      <rect width="${DEMO_PAGE_WIDTH}" height="${DEMO_PAGE_HEIGHT}" fill="url(#pageGradient)" />
      ${Array.from({ length: Math.ceil(DEMO_PAGE_HEIGHT / 120) }, (_, index) => {
        const y = index * 120;
        return `<line x1="0" x2="${DEMO_PAGE_WIDTH}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="2" />`;
      }).join("")}
      <text x="90" y="110" fill="#f7f9ff" font-family="Arial Black, Arial, sans-serif" font-size="52" font-weight="700">Sports Card Scanner Demo Sheet</text>
      <text x="90" y="150" fill="rgba(247,249,255,0.72)" font-family="Arial, sans-serif" font-size="24">Use this generated sheet to test crop detection, OCR, matching, review, and pricing.</text>
      ${cardsMarkup}
    </svg>
  `;
}

function buildSingleCardSvg(card) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${DEMO_CARD_WIDTH}" height="${DEMO_CARD_HEIGHT}" viewBox="0 0 ${DEMO_CARD_WIDTH} ${DEMO_CARD_HEIGHT}">
      <defs>
        <linearGradient id="singleGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#15254b" />
          <stop offset="100%" stop-color="#091126" />
        </linearGradient>
      </defs>
      <rect width="${DEMO_CARD_WIDTH}" height="${DEMO_CARD_HEIGHT}" fill="url(#singleGradient)" />
      ${buildCardSvgMarkup(card, { x: 34, y: 34, width: DEMO_CARD_WIDTH - 68, height: DEMO_CARD_HEIGHT - 68, withShadow: false })}
    </svg>
  `;
}

function buildCardSvgMarkup(card, { x, y, width, height, withShadow }) {
  const palette = paletteForSport(card.sport);
  const scale = width / 596;
  const playerLines = wrapSvgLines(card.player_name, width < 400 ? 14 : 16, 3);
  const playerLineHeight = Math.round(52 * scale);
  const playerTextY = Math.round(210 * scale);
  const rookieFlag = String(card.rookie_flag).toLowerCase() === "true";
  const fontFamily = "Arial, sans-serif";
  const boldFontFamily = "Arial Black, Arial, sans-serif";

  return `
    <g transform="translate(${x} ${y})">
      ${
        withShadow
          ? `<rect x="14" y="16" width="${width}" height="${height}" rx="${Math.round(28 * scale)}" fill="rgba(0,0,0,0.26)" />`
          : ""
      }
      <rect x="0" y="0" width="${width}" height="${height}" rx="${Math.round(28 * scale)}" fill="#f8fbff" />
      <rect x="${Math.round(6 * scale)}" y="${Math.round(6 * scale)}" width="${Math.round(width - 12 * scale)}" height="${Math.round(height - 12 * scale)}" rx="${Math.round(24 * scale)}" fill="none" stroke="${palette.border}" stroke-width="${Math.max(8, Math.round(12 * scale))}" />
      <rect x="${Math.round(18 * scale)}" y="${Math.round(18 * scale)}" width="${Math.round(width - 36 * scale)}" height="${Math.round(80 * scale)}" rx="${Math.round(20 * scale)}" fill="${palette.header}" />
      <text x="${Math.round(38 * scale)}" y="${Math.round(68 * scale)}" fill="#ffffff" font-family="${fontFamily}" font-size="${Math.round(26 * scale)}" font-weight="700">${xmlEscape(card.sport.toUpperCase())}</text>
      <text x="${Math.round(width - 40 * scale)}" y="${Math.round(68 * scale)}" fill="#ffffff" text-anchor="end" font-family="${fontFamily}" font-size="${Math.round(26 * scale)}" font-weight="700">#${xmlEscape(card.card_number)}</text>
      <text x="${Math.round(32 * scale)}" y="${Math.round(142 * scale)}" fill="#0e1936" font-family="${fontFamily}" font-size="${Math.round(30 * scale)}" font-weight="700">${xmlEscape(`${card.year} ${card.brand}`)}</text>
      <text x="${Math.round(32 * scale)}" y="${playerTextY}" fill="#0e1936" font-family="${boldFontFamily}" font-size="${Math.round(46 * scale)}" font-weight="700">
        ${playerLines
          .map(
            (line, index) =>
              `<tspan x="${Math.round(32 * scale)}" dy="${index === 0 ? 0 : playerLineHeight}">${xmlEscape(line)}</tspan>`,
          )
          .join("")}
      </text>
      <text x="${Math.round(32 * scale)}" y="${Math.round(386 * scale)}" fill="${palette.accent}" font-family="${fontFamily}" font-size="${Math.round(26 * scale)}" font-weight="700">${xmlEscape(card.team_name)}</text>
      <rect x="${Math.round(32 * scale)}" y="${Math.round(416 * scale)}" width="${Math.round(width - 64 * scale)}" height="${Math.round(132 * scale)}" rx="${Math.round(22 * scale)}" fill="${palette.panel}" />
      <text x="${Math.round(56 * scale)}" y="${Math.round(470 * scale)}" fill="#13203d" font-family="${fontFamily}" font-size="${Math.round(28 * scale)}" font-weight="700">${xmlEscape(card.set_name)}</text>
      <text x="${Math.round(56 * scale)}" y="${Math.round(512 * scale)}" fill="#13203d" font-family="${fontFamily}" font-size="${Math.round(24 * scale)}" font-weight="600">Card Number ${xmlEscape(card.card_number)}</text>
      ${
        rookieFlag
          ? `
            <rect x="${Math.round(32 * scale)}" y="${Math.round((height - 112 * scale))}" width="${Math.round(136 * scale)}" height="${Math.round(48 * scale)}" rx="${Math.round(16 * scale)}" fill="#f7a63f" />
            <text x="${Math.round(54 * scale)}" y="${Math.round((height - 80 * scale))}" fill="#14213d" font-family="${fontFamily}" font-size="${Math.round(24 * scale)}" font-weight="700">ROOKIE</text>
          `
          : ""
      }
      <text x="${Math.round(32 * scale)}" y="${Math.round(height - 30 * scale)}" fill="rgba(20,33,61,0.7)" font-family="${fontFamily}" font-size="${Math.round(22 * scale)}" font-weight="600">Demo card front for OCR testing</text>
    </g>
  `;
}

function wrapSvgLines(text, maxCharsPerLine, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, maxLines);
}

function svgToDataUrl(svgMarkup) {
  const compactSvg = svgMarkup.replace(/\s{2,}/g, " ").trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(compactSvg)}`;
}

function xmlEscape(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function drawPageBackground(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#15254b");
  gradient.addColorStop(1, "#091126");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(255, 255, 255, 0.05)";
  context.lineWidth = 2;
  for (let y = 0; y < height; y += 120) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawDemoCard(context, card, x, y, width, height, withShadow) {
  const palette = paletteForSport(card.sport);

  if (withShadow) {
    context.save();
    context.fillStyle = "rgba(0, 0, 0, 0.26)";
    drawRoundedRect(context, x + 14, y + 16, width, height, 28);
    context.fill();
    context.restore();
  }

  context.save();
  context.fillStyle = "#f8fbff";
  drawRoundedRect(context, x, y, width, height, 28);
  context.fill();

  context.lineWidth = 12;
  context.strokeStyle = palette.border;
  drawRoundedRect(context, x + 6, y + 6, width - 12, height - 12, 24);
  context.stroke();

  context.fillStyle = palette.header;
  drawRoundedRect(context, x + 18, y + 18, width - 36, 80, 20);
  context.fill();

  context.fillStyle = "#ffffff";
  context.font = '700 26px Arial, sans-serif';
  context.fillText(card.sport.toUpperCase(), x + 38, y + 68);
  context.textAlign = "right";
  context.fillText(`#${card.card_number}`, x + width - 40, y + 68);
  context.textAlign = "left";

  context.fillStyle = "#0e1936";
  context.font = '700 30px Arial, sans-serif';
  context.fillText(`${card.year} ${card.brand}`, x + 32, y + 142);

  context.font = '700 46px "Arial Black", Arial, sans-serif';
  drawWrappedText(context, card.player_name, x + 32, y + 210, width - 64, 52, 3);

  context.fillStyle = palette.accent;
  context.font = '700 26px Arial, sans-serif';
  context.fillText(card.team_name, x + 32, y + 386);

  context.fillStyle = palette.panel;
  drawRoundedRect(context, x + 32, y + 416, width - 64, 132, 22);
  context.fill();

  context.fillStyle = "#13203d";
  context.font = '700 28px Arial, sans-serif';
  context.fillText(card.set_name, x + 56, y + 470);
  context.font = '600 24px Arial, sans-serif';
  context.fillText(`Card Number ${card.card_number}`, x + 56, y + 512);

  if (String(card.rookie_flag).toLowerCase() === "true") {
    context.fillStyle = "#f7a63f";
    drawRoundedRect(context, x + 32, y + height - 112, 136, 48, 16);
    context.fill();
    context.fillStyle = "#14213d";
    context.font = '700 24px Arial, sans-serif';
    context.fillText("ROOKIE", x + 54, y + height - 80);
  }

  context.fillStyle = "rgba(20, 33, 61, 0.7)";
  context.font = '600 22px Arial, sans-serif';
  context.fillText("Demo card front for OCR testing", x + 32, y + height - 30);

  context.restore();
}

function paletteForSport(sport) {
  switch (sport) {
    case "baseball":
      return {
        border: "#45bb7a",
        header: "#2f9b64",
        accent: "#267d51",
        panel: "#dff5e8",
      };
    case "football":
      return {
        border: "#f59d47",
        header: "#cf7f33",
        accent: "#9b5b1f",
        panel: "#faead9",
      };
    default:
      return {
        border: "#f05a5a",
        header: "#d63f4e",
        accent: "#a72939",
        panel: "#fde5e8",
      };
  }
}

function drawWrappedText(context, text, x, startY, maxWidth, lineHeight, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  lines.slice(0, maxLines).forEach((line, index) => {
    context.fillText(line, x, startY + index * lineHeight);
  });
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}
