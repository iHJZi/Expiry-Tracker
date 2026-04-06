import { normalizeDateInput } from "./utils.js";

const STORAGE_KEY = "expiry-tracker-items-v1";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInactiveFlag(raw) {
  if (typeof raw?.isInactive === "boolean") {
    return raw.isInactive;
  }

  if (raw?.isActive === false) {
    return true;
  }

  return false;
}

function normalizeItem(raw) {
  const now = new Date().toISOString();

  return {
    id: normalizeString(raw?.id) || crypto.randomUUID(),
    title: normalizeString(raw?.title),
    country: normalizeString(raw?.country),
    category: normalizeString(raw?.category),
    expiryDate: normalizeDateInput(normalizeString(raw?.expiryDate)),
    isInactive: normalizeInactiveFlag(raw),
    note: normalizeString(raw?.note),
    createdAt: normalizeString(raw?.createdAt) || now,
    updatedAt: normalizeString(raw?.updatedAt) || now,
  };
}

export function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeItem).filter((item) => item.title);
  } catch (error) {
    console.error("Failed to load items", error);
    return [];
  }
}

export function saveItems(items) {
  const normalizedItems = Array.isArray(items)
    ? items.map(normalizeItem).filter((item) => item.title)
    : [];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedItems));
}

export function buildItemPayload(formValues, existingItem) {
  const timestamp = new Date().toISOString();

  return {
    id: existingItem?.id || crypto.randomUUID(),
    title: normalizeString(formValues.title),
    country: normalizeString(formValues.country),
    category: normalizeString(formValues.category),
    expiryDate: normalizeDateInput(normalizeString(formValues.expiryDate)),
    isInactive: Boolean(formValues.isInactive),
    note: normalizeString(formValues.note),
    createdAt: existingItem?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}
