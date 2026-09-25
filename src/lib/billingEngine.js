/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
const ASIA_TIMEZONE = "Asia/Manila";
const GRACE_PERIOD_HOURS = 72;
const GRACE_PERIOD_MS = GRACE_PERIOD_HOURS * 60 * 60 * 1e3;
function formatToPHTDate(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : date?.toDate ? date.toDate() : new Date(date);
  if (isNaN(d.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ASIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(d);
}
function formatToPHTTime(date) {
  if (!date) return "12:00 PM";
  const d = date instanceof Date ? date : date?.toDate ? date.toDate() : new Date(date);
  if (isNaN(d.getTime())) return "12:00 PM";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ASIA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
  return formatter.format(d);
}
function formatPHTFriendly(date) {
  if (!date) return "N/A";
  const d = date instanceof Date ? date : date?.toDate ? date.toDate() : new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  return `${d.toLocaleString("en-US", {
    timeZone: ASIA_TIMEZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })} PHT`;
}
function parseTimeString(timeStr) {
  if (!timeStr || typeof timeStr !== "string") {
    return { hour: 12, minute: 0 };
  }
  const clean = timeStr.trim().toLowerCase();
  const isPM = clean.includes("pm");
  const isAM = clean.includes("am");
  const numPart = clean.replace(/[apm\s]/g, "");
  const [hStr, mStr] = numPart.split(":");
  let hour = parseInt(hStr, 10);
  let minute = mStr ? parseInt(mStr, 10) : 0;
  if (isNaN(hour)) hour = 12;
  if (isNaN(minute)) minute = 0;
  if (isPM && hour < 12) hour += 12;
  if (isAM && hour === 12) hour = 0;
  return { hour, minute };
}
function parseSubscriberDueInstant(dueDateStr, dueTimeStr, fallbackDueDate) {
  let targetDateStr = dueDateStr?.trim();
  if (!targetDateStr && fallbackDueDate) {
    targetDateStr = formatToPHTDate(fallbackDueDate);
  }
  if (!targetDateStr) {
    targetDateStr = formatToPHTDate(/* @__PURE__ */ new Date());
  }
  const dateMatch = targetDateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let year;
  let month;
  let day;
  if (dateMatch) {
    year = parseInt(dateMatch[1], 10);
    month = parseInt(dateMatch[2], 10);
    day = parseInt(dateMatch[3], 10);
  } else {
    const parsed = new Date(targetDateStr);
    if (!isNaN(parsed.getTime())) {
      const phtFormatted = formatToPHTDate(parsed);
      const m = phtFormatted.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) {
        year = parseInt(m[1], 10);
        month = parseInt(m[2], 10);
        day = parseInt(m[3], 10);
      } else {
        year = (/* @__PURE__ */ new Date()).getFullYear();
        month = (/* @__PURE__ */ new Date()).getMonth() + 1;
        day = (/* @__PURE__ */ new Date()).getDate();
      }
    } else {
      year = (/* @__PURE__ */ new Date()).getFullYear();
      month = (/* @__PURE__ */ new Date()).getMonth() + 1;
      day = (/* @__PURE__ */ new Date()).getDate();
    }
  }
  const { hour, minute } = parseTimeString(dueTimeStr);
  const pad = (n) => String(n).padStart(2, "0");
  const isoString = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+08:00`;
  const dateObj = new Date(isoString);
  if (isNaN(dateObj.getTime())) {
    const fallback = /* @__PURE__ */ new Date();
    fallback.setHours(12, 0, 0, 0);
    return fallback;
  }
  return dateObj;
}
function evaluateSubscriberStatus(subscriber, referenceTime = /* @__PURE__ */ new Date()) {
  const safeSubscriber = subscriber || {};
  const paymentStatus = safeSubscriber.payment_status || (safeSubscriber.billStatus === "paid" && (safeSubscriber.balance || 0) <= 0 ? "paid" : "unpaid");
  const canonicalDueDate = safeSubscriber.due_date || (safeSubscriber.dueDate ? formatToPHTDate(safeSubscriber.dueDate) : formatToPHTDate(/* @__PURE__ */ new Date()));
  const canonicalDueTime = safeSubscriber.due_time || "12:00 PM";
  const dueInstant = parseSubscriberDueInstant(
    canonicalDueDate,
    canonicalDueTime,
    safeSubscriber.dueDate
  );
  const gracePeriodEnd = new Date(dueInstant.getTime() + GRACE_PERIOD_MS);
  const nowMs = referenceTime.getTime();
  const dueMs = dueInstant.getTime();
  const graceEndMs = gracePeriodEnd.getTime();
  const hasConfirmedPayment = paymentStatus === "paid";
  const isDueReached = nowMs >= dueMs;
  const isInGracePeriod = isDueReached && nowMs < graceEndMs;
  const isOverdue = isDueReached && nowMs >= graceEndMs && !hasConfirmedPayment;
  let subscription_status;
  let statusExplanation = "";
  if (hasConfirmedPayment) {
    subscription_status = "PAID";
    statusExplanation = "Payment confirmed by administrator. Awaiting subscription renewal.";
  } else if (!isDueReached) {
    subscription_status = "ACTIVE";
    statusExplanation = `Account is active. Due on ${formatPHTFriendly(dueInstant)}.`;
  } else if (isInGracePeriod) {
    subscription_status = "DUE";
    const hoursLeft = Math.max(0, Math.ceil((graceEndMs - nowMs) / (1e3 * 60 * 60)));
    statusExplanation = `Due date reached. 72-hour grace period active (~${hoursLeft}h remaining until OVERDUE).`;
  } else {
    subscription_status = "OVERDUE";
    const hoursOver = Math.floor((nowMs - graceEndMs) / (1e3 * 60 * 60));
    statusExplanation = `Payment overdue by ~${hoursOver}h past the 72-hour grace period.`;
  }
  const remainingGraceMs = Math.max(0, graceEndMs - nowMs);
  const remainingGraceHours = Math.floor(remainingGraceMs / (1e3 * 60 * 60));
  const remainingGraceMinutes = Math.floor(remainingGraceMs % (1e3 * 60 * 60) / (1e3 * 60));
  return {
    subscription_status,
    payment_status: paymentStatus,
    due_date: canonicalDueDate,
    due_time: canonicalDueTime,
    dueInstant,
    gracePeriodEnd,
    isDueReached,
    isInGracePeriod,
    isOverdue,
    hasConfirmedPayment,
    remainingGraceHours,
    remainingGraceMinutes,
    statusExplanation
  };
}
function calculateNextRenewalCycle(currentDueDate, currentDueTime) {
  const currentInstant = parseSubscriberDueInstant(currentDueDate, currentDueTime);
  const nextInstant = new Date(currentInstant.getTime());
  nextInstant.setDate(nextInstant.getDate() + 30);
  return {
    due_date: formatToPHTDate(nextInstant),
    due_time: currentDueTime || "12:00 PM",
    dueDateObj: nextInstant
  };
}
export {
  ASIA_TIMEZONE,
  GRACE_PERIOD_HOURS,
  GRACE_PERIOD_MS,
  calculateNextRenewalCycle,
  evaluateSubscriberStatus,
  formatPHTFriendly,
  formatToPHTDate,
  formatToPHTTime,
  parseSubscriberDueInstant,
  parseTimeString
};
