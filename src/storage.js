const STORAGE_KEY = "expiry-tracker-items-v1";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeItem(raw) {
  const now = new Date().toISOString();

  return {
    id: normalizeString(raw?.id) || crypto.randomUUID(),
    title: normalizeString(raw?.title),
    country: normalizeString(raw?.country),
    category: normalizeString(raw?.category),
    expiryDate: normalizeString(raw?.expiryDate),
    note: normalizeString(raw?.note),
    isActive: raw?.isActive !== false,
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function buildItemPayload(formValues, existingItem) {
  const timestamp = new Date().toISOString();

  return {
    id: existingItem?.id || crypto.randomUUID(),
    title: normalizeString(formValues.title),
    country: normalizeString(formValues.country),
    category: normalizeString(formValues.category),
    expiryDate: normalizeString(formValues.expiryDate),
    note: normalizeString(formValues.note),
    isActive: Boolean(formValues.isActive),
    createdAt: existingItem?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}
