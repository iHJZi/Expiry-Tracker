export const STATUS_CONFIG = {
  expired: { label: "Expired", tone: "expired" },
  soon: { label: "Expiring soon", tone: "soon" },
  valid: { label: "Valid", tone: "valid" },
  inactive: { label: "Inactive", tone: "inactive" },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function getLocalDateParts(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function parseDateParts(dateString) {
  if (typeof dateString !== "string") {
    return null;
  }

  const normalizedValue = dateString.trim();
  const match = DATE_INPUT_PATTERN.exec(normalizedValue);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);

  const parsedParts = getLocalDateParts(parsed);

  if (
    parsedParts.year !== year
    || parsedParts.month !== month
    || parsedParts.day !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function formatLocalDateInput(date) {
  const { year, month, day } = getLocalDateParts(date);
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

export function normalizeDateInput(dateString) {
  const parts = parseDateParts(dateString);

  if (!parts) {
    return "";
  }

  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}`;
}

export function getTodayAtMidnight() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function parseDate(dateString) {
  const normalizedDate = normalizeDateInput(dateString);

  if (!normalizedDate) {
    return null;
  }

  const [year, month, day] = normalizedDate.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export function formatDate(dateString) {
  const parsed = parseDate(dateString);

  if (!parsed) {
    return "No date";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function formatDateTime(value) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function getDaysLeft(expiryDate) {
  const parsed = parseDate(expiryDate);

  if (!parsed) {
    return null;
  }

  const today = getTodayAtMidnight();

  return Math.round(
    (
      Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
      - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    ) / DAY_MS,
  );
}

export function getStatus(item) {
  if (item?.isInactive) {
    return "inactive";
  }

  const daysLeft = getDaysLeft(item.expiryDate);

  if (daysLeft === null) {
    return null;
  }

  if (daysLeft < 0) {
    return "expired";
  }

  if (daysLeft <= 90) {
    return "soon";
  }

  return "valid";
}

export function getHelperText(status, daysLeft) {
  if (status === "inactive") {
    return "Marked as inactive";
  }

  if (!status) {
    return "Add an expiry date to calculate status.";
  }

  if (status === "expired") {
    return `Expired ${Math.abs(daysLeft)}d ago`;
  }

  if (status === "soon") {
    return daysLeft === 0 ? "Expires today" : `Expires in ${daysLeft}d`;
  }

  return "Valid for more than 90d";
}

export function getItemMeta(item) {
  const status = getStatus(item);
  const daysLeft = status === "inactive" ? null : getDaysLeft(item.expiryDate);
  const helperText = getHelperText(status, daysLeft);

  return {
    status,
    daysLeft,
    helperText,
    config: STATUS_CONFIG[status],
  };
}

function compareNullableDatesAsc(left, right) {
  const leftDate = parseDate(left);
  const rightDate = parseDate(right);

  if (!leftDate && !rightDate) {
    return 0;
  }

  if (!leftDate) {
    return 1;
  }

  if (!rightDate) {
    return -1;
  }

  return leftDate.getTime() - rightDate.getTime();
}

function compareNullableDatesDesc(left, right) {
  return compareNullableDatesAsc(right, left);
}

export function sortItemsByUrgency(items) {
  return [...items].sort((left, right) => {
    const leftMeta = getItemMeta(left);
    const rightMeta = getItemMeta(right);

    const groupOrder = {
      expired: 0,
      soon: 1,
      valid: 2,
      inactive: 3,
      none: 4,
    };

    const groupDiff = groupOrder[leftMeta.status || "none"] - groupOrder[rightMeta.status || "none"];

    if (groupDiff !== 0) {
      return groupDiff;
    }

    if (leftMeta.status === "expired") {
      const expiredDiff = compareNullableDatesDesc(left.expiryDate, right.expiryDate);

      if (expiredDiff !== 0) {
        return expiredDiff;
      }
    }

    if (leftMeta.status === "soon" || leftMeta.status === "valid") {
      const activeDiff = compareNullableDatesAsc(left.expiryDate, right.expiryDate);

      if (activeDiff !== 0) {
        return activeDiff;
      }
    }

    return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  });
}

export function getStatusCounts(items) {
  return items.reduce(
    (counts, item) => {
      const status = getStatus(item);

      if (status) {
        counts[status] += 1;
      }

      return counts;
    },
    { expired: 0, soon: 0, valid: 0, inactive: 0 },
  );
}

export function matchesFilter(item, filter) {
  if (filter === "all") {
    return true;
  }

  return getStatus(item) === filter;
}

export function getSecondaryText(item) {
  return [item.country, item.category].filter(Boolean).join(" • ") || "No country or category";
}

export function formatStatusLabel(status) {
  const config = STATUS_CONFIG[status];

  if (!config) {
    return "";
  }

  return config.label;
}
