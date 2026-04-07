import { normalizeDateInput } from "./utils.js";

const STORAGE_KEY = "expiry-tracker-items-v1";
const HIDDEN_SUGGESTIONS_STORAGE_KEY = "expiry-tracker-hidden-suggestions-v1";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSuggestionValue(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeHiddenSuggestionList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(
    values
      .map((value) => normalizeSuggestionValue(value))
      .filter(Boolean),
  )];
}

function normalizeTimestamp(value, fallback) {
  const normalizedValue = normalizeString(value);

  if (!normalizedValue) {
    return fallback;
  }

  const parsed = new Date(normalizedValue);

  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

function getUniqueId(rawId, usedIds = new Set()) {
  const normalizedId = normalizeString(rawId);

  if (normalizedId && !usedIds.has(normalizedId)) {
    usedIds.add(normalizedId);
    return normalizedId;
  }

  let nextId = crypto.randomUUID();

  while (usedIds.has(nextId)) {
    nextId = crypto.randomUUID();
  }

  usedIds.add(nextId);
  return nextId;
}

function normalizeInactiveFlag(raw) {
  if (typeof raw?.isInactive === "boolean") {
    return raw.isInactive;
  }

  if (typeof raw?.isInactive === "string") {
    const normalizedValue = raw.isInactive.trim().toLowerCase();

    if (["true", "1", "yes", "y"].includes(normalizedValue)) {
      return true;
    }

    if (["false", "0", "no", "n", ""].includes(normalizedValue)) {
      return false;
    }
  }

  if (raw?.isActive === false) {
    return true;
  }

  if (typeof raw?.isActive === "string") {
    const normalizedValue = raw.isActive.trim().toLowerCase();

    if (["false", "0", "no", "n"].includes(normalizedValue)) {
      return true;
    }
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

export function loadHiddenSuggestions() {
  try {
    const raw = localStorage.getItem(HIDDEN_SUGGESTIONS_STORAGE_KEY);

    if (!raw) {
      return { country: [], category: [] };
    }

    const parsed = JSON.parse(raw);

    return {
      country: normalizeHiddenSuggestionList(parsed?.country),
      category: normalizeHiddenSuggestionList(parsed?.category),
    };
  } catch (error) {
    console.error("Failed to load hidden suggestions", error);
    return { country: [], category: [] };
  }
}

export function saveHiddenSuggestions(hiddenSuggestions) {
  const normalizedPayload = {
    country: normalizeHiddenSuggestionList(hiddenSuggestions?.country),
    category: normalizeHiddenSuggestionList(hiddenSuggestions?.category),
  };

  localStorage.setItem(HIDDEN_SUGGESTIONS_STORAGE_KEY, JSON.stringify(normalizedPayload));
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

export function buildImportedItemPayload(rawItem, usedIds = new Set()) {
  const timestamp = new Date().toISOString();

  return {
    id: getUniqueId(rawItem?.id, usedIds),
    title: normalizeString(rawItem?.title ?? rawItem?.name),
    country: normalizeString(rawItem?.country),
    category: normalizeString(rawItem?.category),
    expiryDate: normalizeDateInput(normalizeString(rawItem?.expiryDate)),
    isInactive: normalizeInactiveFlag(rawItem),
    note: normalizeString(rawItem?.note),
    createdAt: normalizeTimestamp(rawItem?.createdAt, timestamp),
    updatedAt: normalizeTimestamp(rawItem?.updatedAt, timestamp),
  };
}
