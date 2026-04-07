import {
  STATUS_CONFIG,
  formatDate,
  formatDateTime,
  formatLocalDateInput,
  formatStatusLabel,
  getItemMeta,
  getStatusCounts,
  matchesFilter,
  sortItemsByUrgency,
} from "./utils.js";
import {
  buildItemPayload,
  loadHiddenSuggestions,
  loadItems,
  saveHiddenSuggestions,
  saveItems,
} from "./storage.js";
import { importItemsFromCsv, serializeItemsToCsv } from "./csv.js";

const state = {
  items: loadItems(),
  filter: "all",
  countryFilter: "all",
  categoryFilter: "all",
  backupMenuOpen: false,
  activeSuggestionField: null,
  suggestionInteractionField: null,
  hiddenSuggestions: loadHiddenSuggestions(),
  selectedItemId: null,
  editingItemId: null,
  deleteTargetId: null,
  returnToDetailsOnFormClose: false,
};

const elements = {
  summaryCards: document.getElementById("summary-cards"),
  itemsSection: document.getElementById("items-section"),
  listCaption: document.getElementById("list-caption"),
  itemList: document.getElementById("item-list"),
  addButton: document.getElementById("add-button"),
  backupMenuButton: document.getElementById("backup-menu-button"),
  backupMenuPanel: document.getElementById("backup-menu-panel"),
  exportCsvButton: document.getElementById("export-csv-button"),
  importCsvButton: document.getElementById("import-csv-button"),
  importCsvInput: document.getElementById("import-csv-input"),
  backupFeedback: document.getElementById("backup-feedback"),
  filterButtons: [...document.querySelectorAll("[data-filter]")],
  countryFilterRow: document.getElementById("country-filter-row"),
  categoryFilterRow: document.getElementById("category-filter-row"),
  formSheet: document.getElementById("form-sheet"),
  detailsSheet: document.getElementById("details-sheet"),
  confirmSheet: document.getElementById("confirm-sheet"),
  form: document.getElementById("item-form"),
  formTitle: document.getElementById("form-title"),
  titleInput: document.getElementById("title-input"),
  countryInput: document.getElementById("country-input"),
  countrySuggestions: document.getElementById("country-suggestions"),
  categoryInput: document.getElementById("category-input"),
  categorySuggestions: document.getElementById("category-suggestions"),
  expiryDateField: document.getElementById("expiry-date-input").closest(".field"),
  expiryDateInput: document.getElementById("expiry-date-input"),
  expiryDateDisplay: document.getElementById("expiry-date-display"),
  inactiveInput: document.getElementById("inactive-input"),
  noteInput: document.getElementById("note-input"),
  formStatusPreview: document.getElementById("form-status-preview"),
  closeFormButton: document.getElementById("close-form-button"),
  cancelFormButton: document.getElementById("cancel-form-button"),
  detailsContent: document.getElementById("details-content"),
  closeDetailsButton: document.getElementById("close-details-button"),
  detailsEditButton: document.getElementById("details-edit-button"),
  detailsDeleteButton: document.getElementById("details-delete-button"),
  confirmMessage: document.getElementById("confirm-message"),
  cancelDeleteButton: document.getElementById("cancel-delete-button"),
  confirmDeleteButton: document.getElementById("confirm-delete-button"),
  updateToast: document.getElementById("update-toast"),
  updateReloadButton: document.getElementById("update-reload-button"),
};

let waitingServiceWorkerRegistration = null;
let isReloadingForUpdate = false;
const SUGGESTION_CLOSE_DELAY_MS = 140;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function saveAndRender() {
  saveItems(state.items);
  render();
}

function setBackupMenuOpen(isOpen) {
  state.backupMenuOpen = isOpen;
  elements.backupMenuPanel.classList.toggle("hidden", !isOpen);
  elements.backupMenuPanel.setAttribute("aria-hidden", String(!isOpen));
  elements.backupMenuButton.setAttribute("aria-expanded", String(isOpen));
}

function setBackupFeedback(message, tone = "neutral") {
  if (!message) {
    elements.backupFeedback.textContent = "";
    elements.backupFeedback.classList.add("hidden");
    elements.backupFeedback.classList.remove("backup-feedback--success", "backup-feedback--error");
    return;
  }

  setBackupMenuOpen(true);
  elements.backupFeedback.textContent = message;
  elements.backupFeedback.classList.remove("hidden", "backup-feedback--success", "backup-feedback--error");
  elements.backupFeedback.classList.toggle("backup-feedback--success", tone === "success");
  elements.backupFeedback.classList.toggle("backup-feedback--error", tone === "error");
}

function downloadTextFile(contents, filename, mimeType) {
  const file = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildImportFeedback(result) {
  const summary = [`Imported ${result.importedCount} item${result.importedCount === 1 ? "" : "s"}.`];

  if (result.skippedCount) {
    summary.push(`Skipped ${result.skippedCount} row${result.skippedCount === 1 ? "" : "s"}.`);
  }

  if (result.issues.length) {
    const visibleIssues = result.issues.slice(0, 3).join(" ");
    const remainingCount = result.issues.length - 3;
    summary.push(visibleIssues);

    if (remainingCount > 0) {
      summary.push(`${remainingCount} more issue${remainingCount === 1 ? "" : "s"} not shown.`);
    }
  }

  return summary.join(" ");
}

function handleExportCsv() {
  const filename = `documents-tracker-export-${formatLocalDateInput(new Date())}.csv`;
  downloadTextFile(serializeItemsToCsv(state.items), filename, "text/csv;charset=utf-8");
  setBackupFeedback(`Exported ${state.items.length} item${state.items.length === 1 ? "" : "s"} to ${filename}.`, "success");
}

async function handleImportCsv(event) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  try {
    const csvText = await file.text();
    const result = importItemsFromCsv(csvText, state.items);

    if (result.error) {
      setBackupFeedback(result.error, "error");
      return;
    }

    state.items = [...state.items, ...result.items];
    saveAndRender();
    setBackupFeedback(buildImportFeedback(result), result.skippedCount ? "error" : "success");
  } catch (error) {
    console.error("Failed to import CSV", error);
    setBackupFeedback("Could not read the selected CSV file.", "error");
  } finally {
    event.target.value = "";
  }
}

function setBodySheetState() {
  const anySheetOpen = !elements.formSheet.classList.contains("hidden")
    || !elements.detailsSheet.classList.contains("hidden")
    || !elements.confirmSheet.classList.contains("hidden");

  document.body.classList.toggle("body--sheet-open", anySheetOpen);
}

function showSheet(sheet) {
  setBackupMenuOpen(false);
  sheet.classList.remove("hidden");
  sheet.setAttribute("aria-hidden", "false");
  setBodySheetState();
}

function hideSheet(sheet) {
  sheet.classList.add("hidden");
  sheet.setAttribute("aria-hidden", "true");
  setBodySheetState();
}

function closeAllSheets() {
  hideSheet(elements.formSheet);
  hideSheet(elements.detailsSheet);
  hideSheet(elements.confirmSheet);
}

function showUpdatePrompt(registration) {
  if (!registration?.waiting) {
    return;
  }

  waitingServiceWorkerRegistration = registration;
  elements.updateToast.classList.remove("hidden");
}

function hideUpdatePrompt() {
  waitingServiceWorkerRegistration = null;
  elements.updateToast.classList.add("hidden");
}

function getItemById(itemId) {
  return state.items.find((item) => item.id === itemId) || null;
}

function getAvailableCountries(items) {
  return getUniqueItemValues(items, "country");
}

function getAvailableCategories(items) {
  return getUniqueItemValues(items, "category");
}

function getUniqueItemValues(items, key) {
  const valuesByKey = new Map();

  items.forEach((item) => {
    const rawValue = typeof item?.[key] === "string" ? item[key].trim() : "";

    if (!rawValue) {
      return;
    }

    const normalizedKey = rawValue.toLocaleLowerCase();

    if (!valuesByKey.has(normalizedKey)) {
      valuesByKey.set(normalizedKey, rawValue);
    }
  });

  return [...valuesByKey.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function getSuggestionValues(items, key) {
  const valuesByKey = new Map();
  const hiddenValues = new Set(state.hiddenSuggestions[key] || []);

  items.forEach((item) => {
    const rawValue = typeof item?.[key] === "string" ? item[key].trim() : "";

    if (!rawValue) {
      return;
    }

    const normalizedKey = rawValue.toLocaleLowerCase();

    if (hiddenValues.has(normalizedKey)) {
      return;
    }

    if (!valuesByKey.has(normalizedKey)) {
      valuesByKey.set(normalizedKey, rawValue);
    }
  });

  return [...valuesByKey.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function getSuggestionFieldConfig(fieldName) {
  if (fieldName === "country") {
    return {
      key: "country",
      input: elements.countryInput,
      list: elements.countrySuggestions,
    };
  }

  if (fieldName === "category") {
    return {
      key: "category",
      input: elements.categoryInput,
      list: elements.categorySuggestions,
    };
  }

  return null;
}

function normalizeSuggestionValue(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function beginSuggestionInteraction(fieldName) {
  state.suggestionInteractionField = fieldName;
}

function endSuggestionInteraction(fieldName) {
  window.setTimeout(() => {
    if (state.suggestionInteractionField === fieldName) {
      state.suggestionInteractionField = null;
    }
  }, 0);
}

function persistHiddenSuggestions() {
  saveHiddenSuggestions(state.hiddenSuggestions);
}

function hideSuggestionValue(fieldName, value) {
  const normalizedValue = normalizeSuggestionValue(value);

  if (!normalizedValue) {
    return;
  }

  const nextValues = new Set(state.hiddenSuggestions[fieldName] || []);
  nextValues.add(normalizedValue);
  state.hiddenSuggestions[fieldName] = [...nextValues];
  persistHiddenSuggestions();
}

function restoreSuggestionValue(fieldName, value) {
  const normalizedValue = normalizeSuggestionValue(value);

  if (!normalizedValue) {
    return;
  }

  const nextValues = (state.hiddenSuggestions[fieldName] || [])
    .filter((entry) => entry !== normalizedValue);

  if (nextValues.length === (state.hiddenSuggestions[fieldName] || []).length) {
    return;
  }

  state.hiddenSuggestions[fieldName] = nextValues;
  persistHiddenSuggestions();
}

function closeSuggestionList(fieldName) {
  const field = getSuggestionFieldConfig(fieldName);

  if (!field) {
    return;
  }

  field.list.innerHTML = "";
  field.list.classList.add("hidden");
  field.list.setAttribute("aria-hidden", "true");
  field.input.setAttribute("aria-expanded", "false");

  if (state.activeSuggestionField === fieldName) {
    state.activeSuggestionField = null;
  }

  if (state.suggestionInteractionField === fieldName) {
    state.suggestionInteractionField = null;
  }
}

function closeAllSuggestionLists() {
  closeSuggestionList("country");
  closeSuggestionList("category");
}

function getFilteredSuggestions(fieldName) {
  const field = getSuggestionFieldConfig(fieldName);

  if (!field) {
    return [];
  }

  const allSuggestions = getSuggestionValues(state.items, field.key);
  const query = field.input.value.trim().toLocaleLowerCase();

  if (!query) {
    return allSuggestions;
  }

  return allSuggestions.filter((value) => value.toLocaleLowerCase().includes(query));
}

function renderSuggestionList(fieldName) {
  const field = getSuggestionFieldConfig(fieldName);

  if (!field) {
    return;
  }

  const suggestions = getFilteredSuggestions(fieldName);

  if (!suggestions.length) {
    closeSuggestionList(fieldName);
    return;
  }

  ["country", "category"]
    .filter((name) => name !== fieldName)
    .forEach((name) => closeSuggestionList(name));

  field.list.innerHTML = suggestions
    .map((value) => `
      <div class="field__suggestion" role="option" tabindex="0" data-suggestion-value="${escapeHtml(value)}" aria-label="${escapeHtml(value)}">
        <span class="field__suggestion-select">${escapeHtml(value)}</span>
        <button
          class="field__suggestion-remove"
          type="button"
          data-suggestion-remove="true"
          data-suggestion-value="${escapeHtml(value)}"
          aria-label="Remove ${escapeHtml(value)} suggestion"
        >
          X
        </button>
      </div>
    `)
    .join("");
  field.list.classList.remove("hidden");
  field.list.setAttribute("aria-hidden", "false");
  field.input.setAttribute("aria-expanded", "true");
  state.activeSuggestionField = fieldName;
}

function applySuggestionValue(fieldName, value) {
  const field = getSuggestionFieldConfig(fieldName);

  if (!field) {
    return;
  }

  field.input.value = value;
  closeSuggestionList(fieldName);
  field.input.focus();
}

function matchesCountryFilter(item) {
  if (state.countryFilter === "all") {
    return true;
  }

  return item.country === state.countryFilter;
}

function matchesCategoryFilter(item) {
  if (state.categoryFilter === "all") {
    return true;
  }

  return item.category === state.categoryFilter;
}

function renderStatusAccent(meta) {
  if (!meta.config) {
    return '<span class="status-note">Date required</span>';
  }

  return `<span class="status-badge status-badge--${meta.config.tone}">${escapeHtml(formatStatusLabel(meta.status))}</span>`;
}

function syncExpiryDateDisplay() {
  const hasExpiryDate = Boolean(elements.expiryDateInput.value);
  elements.expiryDateDisplay.textContent = hasExpiryDate ? formatDate(elements.expiryDateInput.value) : "Select date";
  elements.expiryDateDisplay.classList.toggle("is-placeholder", !hasExpiryDate);
}

function syncExpiryDateRequirement() {
  const isInactive = elements.inactiveInput.checked;
  const stashedValue = elements.expiryDateInput.dataset.stashedValue || "";

  if (isInactive) {
    if (elements.expiryDateInput.value) {
      elements.expiryDateInput.dataset.stashedValue = elements.expiryDateInput.value;
    } else if (!stashedValue) {
      delete elements.expiryDateInput.dataset.stashedValue;
    }

    elements.expiryDateInput.value = "";
  } else if (!elements.expiryDateInput.value && stashedValue) {
    elements.expiryDateInput.value = stashedValue;
    delete elements.expiryDateInput.dataset.stashedValue;
  }

  elements.expiryDateInput.disabled = isInactive;
  elements.expiryDateField.classList.toggle("is-disabled", isInactive);
  elements.expiryDateInput.required = !isInactive;
  elements.expiryDateInput.setCustomValidity("");
  syncExpiryDateDisplay();
}

function renderSummary() {
  const counts = getStatusCounts(state.items);
  const summaryOrder = ["valid", "soon", "expired", "inactive"];

  elements.summaryCards.innerHTML = summaryOrder
    .map((status) => {
      const config = STATUS_CONFIG[status];

      return `
        <article class="summary-card summary-card--${config.tone}">
          <span class="summary-card__label">
            <span class="summary-card__dot" aria-hidden="true"></span>
            ${escapeHtml(config.label)}
          </span>
          <p class="summary-card__count">${counts[status]}</p>
        </article>
      `;
    })
    .join("");
}

function renderFilters() {
  elements.filterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === state.filter);
  });

  const countries = getAvailableCountries(state.items);
  const categories = getAvailableCategories(state.items);

  if (state.countryFilter !== "all" && !countries.includes(state.countryFilter)) {
    state.countryFilter = "all";
  }

  if (state.categoryFilter !== "all" && !categories.includes(state.categoryFilter)) {
    state.categoryFilter = "all";
  }

  elements.countryFilterRow.innerHTML = [
    `
      <button class="filter-pill ${state.countryFilter === "all" ? "is-active" : ""}" data-country-filter="all" type="button">
        All countries
      </button>
    `,
    ...countries.map((country) => `
      <button
        class="filter-pill ${state.countryFilter === country ? "is-active" : ""}"
        data-country-filter="${escapeHtml(country)}"
        type="button"
      >
        ${escapeHtml(country)}
      </button>
    `),
  ].join("");

  elements.categoryFilterRow.innerHTML = [
    `
      <button class="filter-pill ${state.categoryFilter === "all" ? "is-active" : ""}" data-category-filter="all" type="button">
        All categories
      </button>
    `,
    ...categories.map((category) => `
      <button
        class="filter-pill ${state.categoryFilter === category ? "is-active" : ""}"
        data-category-filter="${escapeHtml(category)}"
        type="button"
      >
        ${escapeHtml(category)}
      </button>
    `),
  ].join("");
}

function getFilteredItems() {
  return sortItemsByUrgency(state.items).filter((item) =>
    matchesFilter(item, state.filter)
    && matchesCountryFilter(item)
    && matchesCategoryFilter(item),
  );
}

function renderEmptyState() {
  const isFiltering = state.filter !== "all";

  elements.listCaption.textContent = isFiltering ? "No items in this filter" : "No items yet";
  elements.itemList.innerHTML = "";
}

function renderList() {
  const hasAnyItems = state.items.length > 0;
  elements.itemsSection.classList.toggle("hidden", !hasAnyItems);

  if (!hasAnyItems) {
    elements.listCaption.textContent = "";
    elements.itemList.innerHTML = "";
    return;
  }

  const items = getFilteredItems();

  if (!items.length) {
    renderEmptyState();
    return;
  }

  elements.listCaption.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  elements.itemList.innerHTML = items
    .map((item) => {
      const meta = getItemMeta(item);

      return `
        <button class="item-card" type="button" data-item-id="${item.id}">
          <div class="item-card__body">
            <div class="item-card__content">
              <p class="item-card__title">${escapeHtml(item.title)}</p>
              <span class="item-card__helper">${escapeHtml(meta.helperText)}</span>
            </div>
            <div class="item-card__status">
              ${renderStatusAccent(meta)}
            </div>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderDetails() {
  const item = getItemById(state.selectedItemId);

  if (!item) {
    hideSheet(elements.detailsSheet);
    return;
  }

  const meta = getItemMeta(item);

  elements.detailsContent.innerHTML = `
    <div class="details-card__headline">
      ${renderStatusAccent(meta)}
      <h3>${escapeHtml(item.title)}</h3>
    </div>

    <div class="details-card__grid">
      <article class="details-card__block">
        <span class="details-card__label">Country</span>
        <p class="details-card__value">${escapeHtml(item.country || "Not set")}</p>
      </article>
      <article class="details-card__block">
        <span class="details-card__label">Category</span>
        <p class="details-card__value">${escapeHtml(item.category || "Not set")}</p>
      </article>
      <article class="details-card__block">
        <span class="details-card__label">Expiry date</span>
        <p class="details-card__value">${escapeHtml(formatDate(item.expiryDate))}</p>
      </article>
      <article class="details-card__block">
        <span class="details-card__label">Status</span>
        <p class="details-card__value">${escapeHtml(meta.helperText)}</p>
      </article>
      <article class="details-card__block details-card__block--full">
        <span class="details-card__label">Note</span>
        <p class="details-card__value">${escapeHtml(item.note || "No note")}</p>
      </article>
      <article class="details-card__block">
        <span class="details-card__label">Created</span>
        <p class="details-card__value">${escapeHtml(formatDateTime(item.createdAt))}</p>
      </article>
      <article class="details-card__block">
        <span class="details-card__label">Updated</span>
        <p class="details-card__value">${escapeHtml(formatDateTime(item.updatedAt))}</p>
      </article>
    </div>
  `;
}

function renderFormStatusPreview() {
  const previewItem = {
    expiryDate: elements.expiryDateInput.value,
    isInactive: elements.inactiveInput.checked,
  };
  const meta = getItemMeta(previewItem);
  const previewLead = meta.config
    ? renderStatusAccent(meta)
    : `<span class="status-note">${escapeHtml(meta.helperText)}</span>`;
  const previewText = meta.config ? `<span>${escapeHtml(meta.helperText)}</span>` : "";

  elements.formStatusPreview.innerHTML = `
    <span class="status-preview__title">Status preview</span>
    <div class="status-preview__content">
      ${previewLead}
      ${previewText}
    </div>
  `;
}

function render() {
  renderSummary();
  renderFilters();
  renderList();
  renderDetails();
  renderFormStatusPreview();
}

function openForm(itemId = null, options = {}) {
  state.editingItemId = itemId;
  state.returnToDetailsOnFormClose = Boolean(options.returnToDetails && itemId);
  const item = getItemById(itemId);

  elements.formTitle.textContent = item ? "Update item" : "New item";
  elements.titleInput.value = item?.title || "";
  elements.countryInput.value = item?.country || "";
  elements.categoryInput.value = item?.category || "";
  elements.expiryDateInput.value = item?.expiryDate || "";
  elements.inactiveInput.checked = Boolean(item?.isInactive);
  elements.expiryDateInput.dataset.stashedValue = item?.expiryDate || "";
  elements.noteInput.value = item?.note || "";
  closeAllSuggestionLists();
  syncExpiryDateRequirement();
  renderFormStatusPreview();

  hideSheet(elements.detailsSheet);
  hideSheet(elements.confirmSheet);
  showSheet(elements.formSheet);
  elements.formSheet.scrollTop = 0;
  requestAnimationFrame(() => elements.titleInput.focus());
}

function closeForm(options = {}) {
  const restoreDetails = options.restoreDetails ?? state.returnToDetailsOnFormClose;
  const selectedItem = restoreDetails ? getItemById(state.selectedItemId) : null;

  state.editingItemId = null;
  state.returnToDetailsOnFormClose = false;
  elements.form.reset();
  closeAllSuggestionLists();
  delete elements.expiryDateInput.dataset.stashedValue;
  syncExpiryDateRequirement();
  renderFormStatusPreview();
  hideSheet(elements.formSheet);
  elements.formSheet.scrollTop = 0;

  if (selectedItem) {
    renderDetails();
    showSheet(elements.detailsSheet);
  }
}

function openDetails(itemId) {
  state.selectedItemId = itemId;
  renderDetails();
  hideSheet(elements.formSheet);
  showSheet(elements.detailsSheet);
}

function closeDetails() {
  state.selectedItemId = null;
  hideSheet(elements.detailsSheet);
}

function openDeleteConfirmation(itemId) {
  const item = getItemById(itemId);

  if (!item) {
    return;
  }

  state.deleteTargetId = itemId;
  elements.confirmMessage.textContent = `Delete "${item.title}" permanently? This cannot be undone.`;
  showSheet(elements.confirmSheet);
}

function closeDeleteConfirmation() {
  state.deleteTargetId = null;
  hideSheet(elements.confirmSheet);
}

function handleFormSubmit(event) {
  event.preventDefault();

  const title = elements.titleInput.value.trim();

  if (!title) {
    elements.titleInput.setCustomValidity("Name is required.");
    elements.titleInput.reportValidity();
    return;
  }

  elements.titleInput.setCustomValidity("");

  if (!elements.inactiveInput.checked && !elements.expiryDateInput.value) {
    elements.expiryDateInput.setCustomValidity("Expiry date is required.");
    elements.expiryDateInput.reportValidity();
    return;
  }

  elements.expiryDateInput.setCustomValidity("");

  const existingItem = getItemById(state.editingItemId);
  const nextItem = buildItemPayload(
    {
      title,
      country: elements.countryInput.value,
      category: elements.categoryInput.value,
      expiryDate: elements.expiryDateInput.value,
      isInactive: elements.inactiveInput.checked,
      note: elements.noteInput.value,
    },
    existingItem,
  );

  if (existingItem) {
    state.items = state.items.map((item) => (item.id === existingItem.id ? nextItem : item));
  } else {
    state.items = [...state.items, nextItem];
  }

  restoreSuggestionValue("country", nextItem.country);
  restoreSuggestionValue("category", nextItem.category);

  const restoreDetails = state.returnToDetailsOnFormClose;
  saveAndRender();
  closeForm({ restoreDetails });
}

function handleDelete() {
  if (!state.deleteTargetId) {
    return;
  }

  state.items = state.items.filter((item) => item.id !== state.deleteTargetId);
  state.deleteTargetId = null;
  state.selectedItemId = null;
  saveAndRender();
  closeAllSheets();
}

function registerEvents() {
  elements.addButton.addEventListener("click", () => openForm());
  elements.backupMenuButton.addEventListener("click", () => {
    setBackupMenuOpen(!state.backupMenuOpen);
  });
  elements.exportCsvButton.addEventListener("click", handleExportCsv);
  elements.importCsvButton.addEventListener("click", () => {
    elements.importCsvInput.value = "";
    elements.importCsvInput.click();
  });
  elements.importCsvInput.addEventListener("change", handleImportCsv);
  elements.closeFormButton.addEventListener("click", closeForm);
  elements.cancelFormButton.addEventListener("click", closeForm);
  elements.closeDetailsButton.addEventListener("click", closeDetails);
  elements.detailsEditButton.addEventListener("click", () =>
    openForm(state.selectedItemId, { returnToDetails: true }),
  );
  elements.detailsDeleteButton.addEventListener("click", () => openDeleteConfirmation(state.selectedItemId));
  elements.cancelDeleteButton.addEventListener("click", closeDeleteConfirmation);
  elements.confirmDeleteButton.addEventListener("click", handleDelete);
  elements.updateReloadButton.addEventListener("click", () => {
    const waitingWorker = waitingServiceWorkerRegistration?.waiting;

    if (!waitingWorker) {
      hideUpdatePrompt();
      return;
    }

    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  });
  elements.form.addEventListener("submit", handleFormSubmit);

  ["input", "change"].forEach((eventName) => {
    elements.expiryDateInput.addEventListener(eventName, () => {
      syncExpiryDateDisplay();
      renderFormStatusPreview();
    });
  });

  ["country", "category"].forEach((fieldName) => {
    const field = getSuggestionFieldConfig(fieldName);

    field.input.addEventListener("focus", () => {
      renderSuggestionList(fieldName);
    });

    field.input.addEventListener("input", () => {
      renderSuggestionList(fieldName);
    });

    field.input.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (state.suggestionInteractionField === fieldName) {
          return;
        }

        closeSuggestionList(fieldName);
      }, SUGGESTION_CLOSE_DELAY_MS);
    });

    field.input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeSuggestionList(fieldName);
      }
    });

    field.list.addEventListener("pointerdown", (event) => {
      if (!event.target.closest("[data-suggestion-value]")) {
        return;
      }

      beginSuggestionInteraction(fieldName);
    });

    ["pointerup", "pointercancel"].forEach((eventName) => {
      field.list.addEventListener(eventName, () => {
        endSuggestionInteraction(fieldName);
      });
    });

    field.list.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-suggestion-remove]");

      if (removeButton) {
        event.preventDefault();
        hideSuggestionValue(fieldName, removeButton.dataset.suggestionValue);
        renderSuggestionList(fieldName);
        field.input.focus();
        return;
      }

      const suggestionRow = event.target.closest("[data-suggestion-value]");

      if (!suggestionRow) {
        return;
      }

      applySuggestionValue(fieldName, suggestionRow.dataset.suggestionValue);
    });

    field.list.addEventListener("keydown", (event) => {
      if (event.target.closest("[data-suggestion-remove]")) {
        return;
      }

      const suggestionRow = event.target.closest("[data-suggestion-value]");

      if (!suggestionRow) {
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        applySuggestionValue(fieldName, suggestionRow.dataset.suggestionValue);
      }
    });
  });

  elements.inactiveInput.addEventListener("change", () => {
    syncExpiryDateRequirement();
    renderFormStatusPreview();
  });
  elements.titleInput.addEventListener("input", () => elements.titleInput.setCustomValidity(""));
  elements.expiryDateInput.addEventListener("input", () => elements.expiryDateInput.setCustomValidity(""));

  elements.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      render();
    });
  });

  elements.countryFilterRow.addEventListener("click", (event) => {
    const countryButton = event.target.closest("[data-country-filter]");

    if (!countryButton) {
      return;
    }

    state.countryFilter = countryButton.dataset.countryFilter;
    render();
  });

  elements.categoryFilterRow.addEventListener("click", (event) => {
    const categoryButton = event.target.closest("[data-category-filter]");

    if (!categoryButton) {
      return;
    }

    state.categoryFilter = categoryButton.dataset.categoryFilter;
    render();
  });

  elements.itemList.addEventListener("click", (event) => {
    const itemButton = event.target.closest("[data-item-id]");
    const emptyAction = event.target.closest("[data-empty-action]");

    if (itemButton) {
      openDetails(itemButton.dataset.itemId);
      return;
    }

    if (emptyAction?.dataset.emptyAction === "add") {
      openForm();
    }
  });

  document.querySelectorAll("[data-close-sheet]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-close-sheet");

      if (target === "details-sheet") {
        closeDetails();
      }

      if (target === "confirm-sheet") {
        closeDeleteConfirmation();
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (state.activeSuggestionField && !event.target.closest(".field--suggested")) {
      closeAllSuggestionLists();
    }

    if (state.backupMenuOpen && !event.target.closest("[data-backup-menu]")) {
      setBackupMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (state.activeSuggestionField) {
      closeSuggestionList(state.activeSuggestionField);
      return;
    }

    if (state.backupMenuOpen) {
      setBackupMenuOpen(false);
      return;
    }

    if (!elements.confirmSheet.classList.contains("hidden")) {
      closeDeleteConfirmation();
      return;
    }

    if (!elements.formSheet.classList.contains("hidden")) {
      closeForm();
      return;
    }

    if (!elements.detailsSheet.classList.contains("hidden")) {
      closeDetails();
    }
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (isReloadingForUpdate) {
        return;
      }

      isReloadingForUpdate = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("./sw.js")
      .then((registration) => {
        const monitorForUpdate = (targetRegistration) => {
          if (targetRegistration.waiting && navigator.serviceWorker.controller) {
            showUpdatePrompt(targetRegistration);
          }
        };

        monitorForUpdate(registration);

        registration.addEventListener("updatefound", () => {
          const nextWorker = registration.installing;

          if (!nextWorker) {
            return;
          }

          nextWorker.addEventListener("statechange", () => {
            if (nextWorker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdatePrompt(registration);
            }
          });
        });

        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible") {
            return;
          }

          registration.update()
            .then(() => monitorForUpdate(registration))
            .catch((error) => {
              console.error("Service worker update check failed", error);
            });
        });
      })
      .catch((error) => {
        console.error("Service worker registration failed", error);
      });
  });
}

registerEvents();
registerServiceWorker();
render();
