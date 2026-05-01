/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility functions for handling Asia/Manila (GMT+8) timezones
 * to ensure billing and calendar tasks are region-accurate.
 */

export const ASIA_TIMEZONE = 'Asia/Manila';

/**
 * Formats a date to Asia/Manila string
 */
export const formatAsiaDate = (date: Date | any, options: Intl.DateTimeFormatOptions = {}) => {
  if (!date) return 'N/A';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleString('en-PH', {
    timeZone: ASIA_TIMEZONE,
    ...options
  });
};

/**
 * Gets the current date in Asia/Manila
 */
export const getAsiaNow = () => {
  // Returns a Date object that is conceptually the same point in time,
  // but we can use this to extract local components if needed.
  // JS Date objects are always UTC internally, so we use Intl for viewing/comparing local.
  return new Date();
};

/**
 * Check if a date is past due according to Asia/Manila time
 */
export const isPastDueAsia = (dueDate: Date | any, graceDays = 0) => {
  if (!dueDate) return false;
  const now = getAsiaNow();
  const due = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
  
  // Add grace period
  const threshold = new Date(due.getTime() + (graceDays * 24 * 60 * 60 * 1000));
  
  return now > threshold;
};
