import {
  STATUS_CONFIG,
  formatDate,
  formatDateTime,
  formatStatusLabel,
  getItemMeta,
  getStatusCounts,
  matchesFilter,
  sortItemsByUrgency,
} from "./utils.js";
import { buildItemPayload, loadItems, saveItems } from "./storage.js";

const state = {
  items: loadItems(),
  filter: "all",
  countryFilter: "all",
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
  filterButtons: [...document.querySelectorAll("[data-filter]")],
  countryFilterRow: document.getElementById("country-filter-row"),
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
  return [...new Set(
    items
      .map((item) => item.country)
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function matchesCountryFilter(item) {
  if (state.countryFilter === "all") {
    return true;
  }

  return item.country === state.countryFilter;
}

function renderStatusAccent(meta) {
  if (!meta.config) {
    return '<span class="status-note">Date required</span>';
  }

  return `<span class="status-badge status-badge--${meta.config.tone}">${escapeHtml(formatStatusLabel(meta.status))}</span>`;
}

function syncExpiryDateRequirement() {
  const isInactive = elements.inactiveInput.checked;
  elements.expiryDateInput.required = !isInactive;
  elements.expiryDateInput.setCustomValidity("");
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

  if (state.countryFilter !== "all" && !countries.includes(state.countryFilter)) {
    state.countryFilter = "all";
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
}

function getFilteredItems() {
  return sortItemsByUrgency(state.items).filter((item) =>
    matchesFilter(item, state.filter) && matchesCountryFilter(item),
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

  elements.formKicker.textContent = item ? "Edit item" : "Add item";
  elements.formTitle.textContent = item ? "Update item" : "New item";
  elements.titleInput.value = item?.title || "";
  elements.countryInput.value = item?.country || "";
  elements.categoryInput.value = item?.category || "";
  elements.expiryDateInput.value = item?.expiryDate || "";
  elements.inactiveInput.checked = Boolean(item?.isInactive);
  elements.noteInput.value = item?.note || "";
  syncExpiryDateRequirement();
  renderFormStatusPreview();

  hideSheet(elements.detailsSheet);
  hideSheet(elements.confirmSheet);
  showSheet(elements.formSheet);
  requestAnimationFrame(() => elements.titleInput.focus());
}

function closeForm(options = {}) {
  const restoreDetails = options.restoreDetails ?? state.returnToDetailsOnFormClose;
  const selectedItem = restoreDetails ? getItemById(state.selectedItemId) : null;

  state.editingItemId = null;
  state.returnToDetailsOnFormClose = false;
  elements.form.reset();
  syncExpiryDateRequirement();
  renderFormStatusPreview();
  hideSheet(elements.formSheet);

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
    elements.titleInput.setCustomValidity("Title is required.");
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
    elements.expiryDateInput.addEventListener(eventName, renderFormStatusPreview);
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
