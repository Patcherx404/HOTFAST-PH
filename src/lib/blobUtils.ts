/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function getDisplayImageUrl(url?: string | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.includes("private.blob.vercel-storage.com") && !trimmed.includes("/api/blob/view")) {
    return `/api/blob/view?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}
