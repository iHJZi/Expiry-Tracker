import {
  STATUS_CONFIG,
  formatDate,
  formatDateTime,
  formatStatusWithIcon,
  getItemMeta,
  getRelativeDateString,
  getSecondaryText,
  getStatusCounts,
  matchesFilter,
  sortItemsByUrgency,
} from "./utils.js";
import { buildItemPayload, loadItems, saveItems } from "./storage.js";

const state = {
  items: loadItems(),
  filter: "all",
  selectedItemId: null,
  editingItemId: null,
  deleteTargetId: null,
};

const elements = {
  summaryCards: document.getElementById("summary-cards"),
  listCaption: document.getElementById("list-caption"),
  itemList: document.getElementById("item-list"),
  addButton: document.getElementById("add-button"),
  filterButtons: [...document.querySelectorAll("[data-filter]")],
  formSheet: document.getElementById("form-sheet"),
  detailsSheet: document.getElementById("details-sheet"),
  confirmSheet: document.getElementById("confirm-sheet"),
  form: document.getElementById("item-form"),
  formKicker: document.getElementById("form-kicker"),
  formTitle: document.getElementById("form-title"),
  titleInput: document.getElementById("title-input"),
  countryInput: document.getElementById("country-input"),
  categoryInput: document.getElementById("category-input"),
  expiryDateInput: document.getElementById("expiry-date-input"),
  noteInput: document.getElementById("note-input"),
  activeInput: document.getElementById("active-input"),
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
};

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

function setBodySheetState() {
  const anySheetOpen = !elements.formSheet.classList.contains("hidden")
    || !elements.detailsSheet.classList.contains("hidden")
    || !elements.confirmSheet.classList.contains("hidden");

  document.body.classList.toggle("body--sheet-open", anySheetOpen);
}

function showSheet(sheet) {
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

function getItemById(itemId) {
  return state.items.find((item) => item.id === itemId) || null;
}

function renderSummary() {
  const counts = getStatusCounts(state.items);
  const summaryOrder = ["soon", "expired", "valid", "inactive"];

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
}

function getFilteredItems() {
  return sortItemsByUrgency(state.items).filter((item) => matchesFilter(item, state.filter));
}

function renderEmptyState() {
  const isFiltering = state.filter !== "all";

  elements.listCaption.textContent = isFiltering ? "No items in this filter" : "No items yet";
  elements.itemList.innerHTML = `
    <section class="empty-state">
      <h3>${isFiltering ? "No matches here" : "Add your first item"}</h3>
      <p>
        ${isFiltering
          ? "Try another filter to review the rest of your expiry list."
          : "Keep passports, permits, insurance, and subscriptions in one calm list."}
      </p>
      <div class="empty-state__actions">
        <button class="button button--primary" type="button" data-empty-action="add">Add item</button>
        ${state.items.length === 0
          ? '<button class="button button--ghost" type="button" data-empty-action="demo">Load demo items</button>'
          : ""}
      </div>
    </section>
  `;
}

function renderList() {
  const items = getFilteredItems();

  if (!items.length) {
    renderEmptyState();
    return;
  }

  elements.listCaption.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  elements.itemList.innerHTML = items
    .map((item) => {
      const meta = getItemMeta(item);
      const statusText = formatStatusWithIcon(meta.status);

      return `
        <button class="item-card" type="button" data-item-id="${item.id}">
          <div class="item-card__top">
            <span class="status-badge status-badge--${meta.config.tone}">${escapeHtml(statusText)}</span>
            <span class="item-card__date">${escapeHtml(formatDate(item.expiryDate))}</span>
          </div>
          <p class="item-card__title">${escapeHtml(item.title)}</p>
          <p class="item-card__meta">${escapeHtml(getSecondaryText(item))}</p>
          <div class="item-card__footer">
            <span class="item-card__helper">${escapeHtml(meta.helperText)}</span>
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
      <span class="status-badge status-badge--${meta.config.tone}">${escapeHtml(formatStatusWithIcon(meta.status))}</span>
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
    isActive: elements.activeInput.checked,
    expiryDate: elements.expiryDateInput.value,
  };
  const meta = getItemMeta(previewItem);

  elements.formStatusPreview.innerHTML = `
    <span class="status-preview__title">Automatic status</span>
    <div class="status-preview__content">
      <span class="status-badge status-badge--${meta.config.tone}">${escapeHtml(formatStatusWithIcon(meta.status))}</span>
      <span>${escapeHtml(meta.helperText)}</span>
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

function openForm(itemId = null) {
  state.editingItemId = itemId;
  const item = getItemById(itemId);

  elements.formKicker.textContent = item ? "Edit item" : "Add item";
  elements.formTitle.textContent = item ? "Update item" : "New item";
  elements.titleInput.value = item?.title || "";
  elements.countryInput.value = item?.country || "";
  elements.categoryInput.value = item?.category || "";
  elements.expiryDateInput.value = item?.expiryDate || "";
  elements.noteInput.value = item?.note || "";
  elements.activeInput.checked = item?.isActive ?? true;
  renderFormStatusPreview();

  hideSheet(elements.detailsSheet);
  hideSheet(elements.confirmSheet);
  showSheet(elements.formSheet);
  requestAnimationFrame(() => elements.titleInput.focus());
}

function closeForm() {
  state.editingItemId = null;
  elements.form.reset();
  elements.activeInput.checked = true;
  renderFormStatusPreview();
  hideSheet(elements.formSheet);
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

function addDemoItems() {
  state.items = [
    {
      id: crypto.randomUUID(),
      title: "German Residence Permit",
      country: "Germany",
      category: "Residence Permit",
      expiryDate: getRelativeDateString(18),
      note: "Book renewal appointment before summer.",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      title: "Saudi Passport",
      country: "Saudi Arabia",
      category: "Passport",
      expiryDate: getRelativeDateString(-6),
      note: "",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      title: "Health Insurance Card",
      country: "Germany",
      category: "Health Insurance",
      expiryDate: getRelativeDateString(230),
      note: "",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      title: "Old SIM Contract",
      country: "",
      category: "SIM / Contract",
      expiryDate: "",
      note: "Kept for reference only.",
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  saveAndRender();
}

function handleFormSubmit(event) {
  event.preventDefault();

  const title = elements.titleInput.value.trim();

  if (!title) {
    elements.titleInput.setCustomValidity("Title is required.");
    elements.titleInput.reportValidity();
    return;
  }

  elements.titleInput.setCustomValidity("");

  const existingItem = getItemById(state.editingItemId);
  const nextItem = buildItemPayload(
    {
      title,
      country: elements.countryInput.value,
      category: elements.categoryInput.value,
      expiryDate: elements.expiryDateInput.value,
      note: elements.noteInput.value,
      isActive: elements.activeInput.checked,
    },
    existingItem,
  );

  if (existingItem) {
    state.items = state.items.map((item) => (item.id === existingItem.id ? nextItem : item));
  } else {
    state.items = [...state.items, nextItem];
  }

  saveAndRender();
  closeForm();
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
  elements.closeFormButton.addEventListener("click", closeForm);
  elements.cancelFormButton.addEventListener("click", closeForm);
  elements.closeDetailsButton.addEventListener("click", closeDetails);
  elements.detailsEditButton.addEventListener("click", () => openForm(state.selectedItemId));
  elements.detailsDeleteButton.addEventListener("click", () => openDeleteConfirmation(state.selectedItemId));
  elements.cancelDeleteButton.addEventListener("click", closeDeleteConfirmation);
  elements.confirmDeleteButton.addEventListener("click", handleDelete);
  elements.form.addEventListener("submit", handleFormSubmit);

  ["input", "change"].forEach((eventName) => {
    elements.activeInput.addEventListener(eventName, renderFormStatusPreview);
    elements.expiryDateInput.addEventListener(eventName, renderFormStatusPreview);
  });

  elements.titleInput.addEventListener("input", () => elements.titleInput.setCustomValidity(""));

  elements.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      render();
    });
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

    if (emptyAction?.dataset.emptyAction === "demo") {
      addDemoItems();
    }
  });

  document.querySelectorAll("[data-close-sheet]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-close-sheet");

      if (target === "form-sheet") {
        closeForm();
      }

      if (target === "details-sheet") {
        closeDetails();
      }

      if (target === "confirm-sheet") {
        closeDeleteConfirmation();
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
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
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}

registerEvents();
registerServiceWorker();
render();
