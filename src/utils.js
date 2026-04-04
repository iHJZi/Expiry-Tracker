export const STATUS_CONFIG = {
  expired: { label: "Expired", icon: "⛔", tone: "expired" },
  soon: { label: "Expiring soon", icon: "⚠", tone: "soon" },
  valid: { label: "Valid", icon: "✓", tone: "valid" },
  inactive: { label: "Inactive", icon: "⏸", tone: "inactive" },
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function getTodayAtMidnight() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function parseDate(dateString) {
  if (!dateString) {
    return null;
  }

  const parsed = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

  return Math.round((parsed.getTime() - getTodayAtMidnight().getTime()) / DAY_MS);
}

export function getStatus(item) {
  if (!item.isActive || !item.expiryDate) {
    return "inactive";
  }

  const daysLeft = getDaysLeft(item.expiryDate);

  if (daysLeft === null) {
    return "inactive";
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
    return "Not active";
  }

  if (status === "expired") {
    return `Expired ${Math.abs(daysLeft)}d ago`;
  }

  if (status === "soon") {
    return daysLeft === 0 ? "Expires today" : `Expires in ${daysLeft}d`;
  }

  return "Valid for long period";
}

export function getItemMeta(item) {
  const status = getStatus(item);
  const daysLeft = getDaysLeft(item.expiryDate);
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
    };

    const groupDiff = groupOrder[leftMeta.status] - groupOrder[rightMeta.status];

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
      counts[getStatus(item)] += 1;
      return counts;
    },
    { expired: 0, soon: 0, valid: 0, inactive: 0 },
  );
}

export function matchesFilter(item, filter) {
  return filter === "all" ? true : getStatus(item) === filter;
}

export function getSecondaryText(item) {
  return [item.country, item.category].filter(Boolean).join(" • ") || "No country or category";
}

export function formatStatusWithIcon(status) {
  const config = STATUS_CONFIG[status];
  return `${config.icon} ${config.label}`;
}

export function getRelativeDateString(offsetDays) {
  const date = getTodayAtMidnight();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
