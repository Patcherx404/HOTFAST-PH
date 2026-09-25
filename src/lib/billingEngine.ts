/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserProfile } from "../types";

export const ASIA_TIMEZONE = "Asia/Manila";
export const GRACE_PERIOD_HOURS = 72; // 3 x 24 hours
export const GRACE_PERIOD_MS = GRACE_PERIOD_HOURS * 60 * 60 * 1000;

/**
 * Formats a given date to Philippine Time (Asia/Manila)
 */
export function formatToPHTDate(date: Date | string | number | null | undefined): string {
  if (!date) return "";
  const d = date instanceof Date ? date : (date as any)?.toDate ? (date as any).toDate() : new Date(date);
  if (isNaN(d.getTime())) return "";

  // Format as YYYY-MM-DD in Asia/Manila
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ASIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

/**
 * Formats a given date to Philippine Time (12-hour format, e.g. "12:00 PM")
 */
export function formatToPHTTime(date: Date | string | number | null | undefined): string {
  if (!date) return "12:00 PM";
  const d = date instanceof Date ? date : (date as any)?.toDate ? (date as any).toDate() : new Date(date);
  if (isNaN(d.getTime())) return "12:00 PM";

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ASIA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return formatter.format(d);
}

/**
 * Formats a given date to a friendly full string in Philippine Time (e.g. "September 23, 2026, 12:00 PM PHT")
 */
export function formatPHTFriendly(date: Date | string | number | null | undefined): string {
  if (!date) return "N/A";
  const d = date instanceof Date ? date : (date as any)?.toDate ? (date as any).toDate() : new Date(date);
  if (isNaN(d.getTime())) return "N/A";

  return `${d.toLocaleString("en-US", {
    timeZone: ASIA_TIMEZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })} PHT`;
}

/**
 * Normalizes time string (e.g. "12:00 PM", "12:00", "09:30 am", "14:30") to { hour: number, minute: number }
 */
export function parseTimeString(timeStr?: string): { hour: number; minute: number } {
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

/**
 * Combines due_date ("YYYY-MM-DD" or similar) and due_time ("12:00 PM" or "12:00")
 * into an exact authoritative Date object anchored to Asia/Manila (UTC+8).
 */
export function parseSubscriberDueInstant(
  dueDateStr?: string,
  dueTimeStr?: string,
  fallbackDueDate?: any
): Date {
  // If no due_date given, try fallback from legacy dueDate
  let targetDateStr = dueDateStr?.trim();
  if (!targetDateStr && fallbackDueDate) {
    targetDateStr = formatToPHTDate(fallbackDueDate);
  }

  // Default to today in Asia/Manila if still missing
  if (!targetDateStr) {
    targetDateStr = formatToPHTDate(new Date());
  }

  // Parse YYYY-MM-DD
  const dateMatch = targetDateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let year: number;
  let month: number;
  let day: number;

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
        year = new Date().getFullYear();
        month = new Date().getMonth() + 1;
        day = new Date().getDate();
      }
    } else {
      year = new Date().getFullYear();
      month = new Date().getMonth() + 1;
      day = new Date().getDate();
    }
  }

  const { hour, minute } = parseTimeString(dueTimeStr);

  const pad = (n: number) => String(n).padStart(2, "0");
  // Philippine Standard Time is strictly UTC+8:00 (no DST)
  const isoString = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+08:00`;
  const dateObj = new Date(isoString);

  if (isNaN(dateObj.getTime())) {
    // Fallback if parsing fails
    const fallback = new Date();
    fallback.setHours(12, 0, 0, 0);
    return fallback;
  }

  return dateObj;
}

export interface SubscriberStatusEvaluation {
  subscription_status: "ACTIVE" | "DUE" | "OVERDUE" | "PAID";
  payment_status: "unpaid" | "processing" | "paid" | "rejected";
  due_date: string;
  due_time: string;
  dueInstant: Date;
  gracePeriodEnd: Date;
  isDueReached: boolean;
  isInGracePeriod: boolean;
  isOverdue: boolean;
  hasConfirmedPayment: boolean;
  remainingGraceHours: number;
  remainingGraceMinutes: number;
  statusExplanation: string;
}

/**
 * Authoritative billing status evaluator matching Hotfast PH specifications:
 *
 * 1. Before Due Date & Time:
 *    Current date/time is before due_date + due_time -> ACTIVE
 *
 * 2. When Due Date & Time is Reached:
 *    Exact due date and time is reached and no confirmed payment -> DUE
 *
 * 3. 3-Day Grace Period (72 hours):
 *    During 72 hours after due instant -> DUE
 *
 * 4. After 3 Days Without Confirmed Payment:
 *    >= 72 hours passed since exact due date/time and no confirmed payment -> OVERDUE
 *
 * 5. Confirmed Payment:
 *    Admin confirmed settlement -> PAID (payment_status: 'paid')
 *    Screenshot upload alone only sets payment_status: 'processing'
 *
 * 6. Subscription Renewal:
 *    Admin triggers renewal -> ACTIVE, new due_date/due_time, payment_status: 'unpaid'
 */
export function evaluateSubscriberStatus(
  subscriber: Partial<UserProfile>,
  referenceTime: Date = new Date()
): SubscriberStatusEvaluation {
  const paymentStatus: "unpaid" | "processing" | "paid" | "rejected" =
    subscriber.payment_status ||
    (subscriber.billStatus === "paid" && (subscriber.balance || 0) <= 0 ? "paid" : "unpaid");

  // Format canonical due_date and due_time
  const canonicalDueDate =
    subscriber.due_date ||
    (subscriber.dueDate ? formatToPHTDate(subscriber.dueDate) : formatToPHTDate(new Date()));

  const canonicalDueTime = subscriber.due_time || "12:00 PM";

  const dueInstant = parseSubscriberDueInstant(
    canonicalDueDate,
    canonicalDueTime,
    subscriber.dueDate
  );

  const gracePeriodEnd = new Date(dueInstant.getTime() + GRACE_PERIOD_MS);
  const nowMs = referenceTime.getTime();
  const dueMs = dueInstant.getTime();
  const graceEndMs = gracePeriodEnd.getTime();

  const hasConfirmedPayment = paymentStatus === "paid";
  const isDueReached = nowMs >= dueMs;
  const isInGracePeriod = isDueReached && nowMs < graceEndMs;
  const isOverdue = isDueReached && nowMs >= graceEndMs && !hasConfirmedPayment;

  let subscription_status: "ACTIVE" | "DUE" | "OVERDUE" | "PAID";
  let statusExplanation = "";

  if (hasConfirmedPayment) {
    subscription_status = "PAID";
    statusExplanation = "Payment confirmed by administrator. Awaiting subscription renewal.";
  } else if (!isDueReached) {
    subscription_status = "ACTIVE";
    statusExplanation = `Account is active. Due on ${formatPHTFriendly(dueInstant)}.`;
  } else if (isInGracePeriod) {
    subscription_status = "DUE";
    const hoursLeft = Math.max(0, Math.ceil((graceEndMs - nowMs) / (1000 * 60 * 60)));
    statusExplanation = `Due date reached. 72-hour grace period active (~${hoursLeft}h remaining until OVERDUE).`;
  } else {
    subscription_status = "OVERDUE";
    const hoursOver = Math.floor((nowMs - graceEndMs) / (1000 * 60 * 60));
    statusExplanation = `Payment overdue by ~${hoursOver}h past the 72-hour grace period.`;
  }

  const remainingGraceMs = Math.max(0, graceEndMs - nowMs);
  const remainingGraceHours = Math.floor(remainingGraceMs / (1000 * 60 * 60));
  const remainingGraceMinutes = Math.floor((remainingGraceMs % (1000 * 60 * 60)) / (1000 * 60));

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
    statusExplanation,
  };
}

/**
 * Calculates next cycle due date (+30 days or +1 month) for subscription renewal
 */
export function calculateNextRenewalCycle(currentDueDate?: string, currentDueTime?: string): {
  due_date: string;
  due_time: string;
  dueDateObj: Date;
} {
  const currentInstant = parseSubscriberDueInstant(currentDueDate, currentDueTime);
  const nextInstant = new Date(currentInstant.getTime());
  nextInstant.setDate(nextInstant.getDate() + 30);

  return {
    due_date: formatToPHTDate(nextInstant),
    due_time: currentDueTime || "12:00 PM",
    dueDateObj: nextInstant,
  };
}
