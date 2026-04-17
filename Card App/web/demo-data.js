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

  const canvas = document.createElement("canvas");
  canvas.width = 1700;
  canvas.height = 1600;

  const context = canvas.getContext("2d");
  drawPageBackground(context, canvas.width, canvas.height);

  context.fillStyle = "#f7f9ff";
  context.font = '700 52px "Arial Black", Arial, sans-serif';
  context.fillText("Sports Card Scanner Demo Sheet", 90, 110);
  context.fillStyle = "rgba(247, 249, 255, 0.72)";
  context.font = '500 24px Arial, sans-serif';
  context.fillText("Use this generated sheet to test crop detection, OCR, matching, review, and pricing.", 90, 150);

  const cards = DEMO_CATALOG_ROWS.slice(0, 6);
  const columns = 3;
  const cardWidth = 460;
  const cardHeight = 644;
  const gapX = 40;
  const gapY = 42;
  const startX = 90;
  const startY = 215;

  cards.forEach((card, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + column * (cardWidth + gapX);
    const y = startY + row * (cardHeight + gapY);
    drawDemoCard(context, card, x, y, cardWidth, cardHeight, true);
  });

  return {
    name: "demo-scan-sheet.png",
    dataUrl: canvas.toDataURL("image/png"),
  };
}

export function generateDemoCardAsset(catalogCardId) {
  const card = DEMO_CATALOG_ROWS.find((entry) => entry.catalog_card_id === catalogCardId) || DEMO_CATALOG_ROWS[0];
  const canvas = document.createElement("canvas");
  canvas.width = 700;
  canvas.height = 980;

  const context = canvas.getContext("2d");
  drawPageBackground(context, canvas.width, canvas.height);
  drawDemoCard(context, card, 52, 52, 596, 876, false);

  return {
    name: `${card.player_name.toLowerCase().replace(/\s+/g, "-")}-demo-card.png`,
    dataUrl: canvas.toDataURL("image/png"),
  };
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
