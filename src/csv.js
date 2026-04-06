import { buildImportedItemPayload } from "./storage.js";
import { normalizeDateInput } from "./utils.js";

export const CSV_COLUMNS = [
  "id",
  "name",
  "country",
  "category",
  "expiryDate",
  "note",
  "isInactive",
  "createdAt",
  "updatedAt",
];

const TRUE_VALUES = new Set(["true", "1", "yes", "y"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", ""]);

function normalizeHeaderCell(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim();
}

function escapeCsvCell(value) {
  const stringValue = value == null ? "" : String(value);
  const needsQuotes = /[",\r\n]/.test(stringValue) || /^\s|\s$/.test(stringValue);

  if (!needsQuotes) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function parseCsvText(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (insideQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          currentValue += '"';
          index += 1;
        } else {
          insideQuotes = false;
        }
      } else {
        currentValue += character;
      }

      continue;
    }

    if (character === '"') {
      insideQuotes = true;
      continue;
    }

    if (character === ",") {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if (character === "\n") {
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    if (character === "\r") {
      if (text[index + 1] === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (insideQuotes) {
    throw new Error("CSV contains an unterminated quoted value.");
  }

  if (currentValue || currentRow.length) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function isBlankRow(row) {
  return row.every((value) => String(value || "").trim() === "");
}

function validateHeaderRow(headerRow) {
  const normalizedHeaders = headerRow.map(normalizeHeaderCell);
  const duplicates = normalizedHeaders.filter((header, index) =>
    header && normalizedHeaders.indexOf(header) !== index,
  );
  const missing = CSV_COLUMNS.filter((header) => !normalizedHeaders.includes(header));
  const extras = normalizedHeaders.filter((header) => header && !CSV_COLUMNS.includes(header));

  if (!normalizedHeaders.length || duplicates.length || missing.length || extras.length) {
    return {
      ok: false,
      message: `Invalid CSV header. Expected columns: ${CSV_COLUMNS.join(", ")}`,
    };
  }

  return {
    ok: true,
    headerMap: Object.fromEntries(normalizedHeaders.map((header, index) => [header, index])),
  };
}

function parseInactiveCell(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();

  if (TRUE_VALUES.has(normalizedValue)) {
    return { ok: true, value: true };
  }

  if (FALSE_VALUES.has(normalizedValue)) {
    return { ok: true, value: false };
  }

  return { ok: false, value: false };
}

function getRowValue(row, headerMap, columnName) {
  return row[headerMap[columnName]] ?? "";
}

export function serializeItemsToCsv(items) {
  const rows = [
    CSV_COLUMNS,
    ...items.map((item) => [
      item.id,
      item.title,
      item.country,
      item.category,
      item.expiryDate,
      item.note,
      item.isInactive ? "true" : "false",
      item.createdAt,
      item.updatedAt,
    ]),
  ];

  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
}

export function importItemsFromCsv(text, existingItems = []) {
  let parsedRows;

  try {
    parsedRows = parseCsvText(text);
  } catch (error) {
    return {
      items: [],
      importedCount: 0,
      skippedCount: 0,
      issues: [error.message],
      error: error.message,
    };
  }

  const rows = parsedRows.filter((row, index) => index === 0 || !isBlankRow(row));

  if (!rows.length) {
    return {
      items: [],
      importedCount: 0,
      skippedCount: 0,
      issues: ["CSV file is empty."],
      error: "CSV file is empty.",
    };
  }

  const headerValidation = validateHeaderRow(rows[0]);

  if (!headerValidation.ok) {
    return {
      items: [],
      importedCount: 0,
      skippedCount: 0,
      issues: [headerValidation.message],
      error: headerValidation.message,
    };
  }

  const headerCount = rows[0].length;
  const usedIds = new Set(existingItems.map((item) => item.id));
  const importedItems = [];
  const issues = [];

  for (let index = 1; index < rows.length; index += 1) {
    const rowNumber = index + 1;
    const row = rows[index];

    if (row.length > headerCount) {
      issues.push(`Row ${rowNumber}: too many columns.`);
      continue;
    }

    const paddedRow = row.length < headerCount
      ? [...row, ...Array.from({ length: headerCount - row.length }, () => "")]
      : row;

    const name = String(getRowValue(paddedRow, headerValidation.headerMap, "name") || "").trim();

    if (!name) {
      issues.push(`Row ${rowNumber}: name is required.`);
      continue;
    }

    const inactiveValue = parseInactiveCell(getRowValue(paddedRow, headerValidation.headerMap, "isInactive"));

    if (!inactiveValue.ok) {
      issues.push(`Row ${rowNumber}: isInactive must be true or false.`);
      continue;
    }

    const expiryDateInput = String(getRowValue(paddedRow, headerValidation.headerMap, "expiryDate") || "").trim();
    const normalizedExpiryDate = normalizeDateInput(expiryDateInput);

    if (!inactiveValue.value && !normalizedExpiryDate) {
      issues.push(`Row ${rowNumber}: active items need a valid expiryDate in YYYY-MM-DD format.`);
      continue;
    }

    importedItems.push(buildImportedItemPayload({
      id: getRowValue(paddedRow, headerValidation.headerMap, "id"),
      name,
      country: getRowValue(paddedRow, headerValidation.headerMap, "country"),
      category: getRowValue(paddedRow, headerValidation.headerMap, "category"),
      expiryDate: normalizedExpiryDate,
      note: getRowValue(paddedRow, headerValidation.headerMap, "note"),
      isInactive: inactiveValue.value,
      createdAt: getRowValue(paddedRow, headerValidation.headerMap, "createdAt"),
      updatedAt: getRowValue(paddedRow, headerValidation.headerMap, "updatedAt"),
    }, usedIds));
  }

  return {
    items: importedItems,
    importedCount: importedItems.length,
    skippedCount: issues.length,
    issues,
    error: "",
  };
}
