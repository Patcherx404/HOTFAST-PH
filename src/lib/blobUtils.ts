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

/**
 * Extracts the underlying Vercel Blob storage URL from either a direct blob URL,
 * a proxied `/api/blob/view?url=...` path, or a PaymentRecord-like object.
 */
export function extractBlobUrl(
  input?: string | { screenshotUrl?: string | null; blobUrl?: string | null } | null
): string | null {
  if (!input) return null;

  if (typeof input === "object") {
    const fromBlob = extractBlobUrl(input.blobUrl);
    if (fromBlob) return fromBlob;
    return extractBlobUrl(input.screenshotUrl);
  }

  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes("/api/blob/view")) {
    try {
      const parsed = new URL(trimmed, "http://localhost");
      const inner = parsed.searchParams.get("url");
      if (inner && inner.includes("blob.vercel-storage.com")) {
        return inner.trim();
      }
    } catch {
      const match = trimmed.match(/[?&]url=([^&]+)/);
      if (match && match[1]) {
        try {
          const decoded = decodeURIComponent(match[1]);
          if (decoded.includes("blob.vercel-storage.com")) {
            return decoded.trim();
          }
        } catch {
          // ignore
        }
      }
    }
  }

  if (trimmed.includes("blob.vercel-storage.com")) {
    return trimmed;
  }

  return null;
}

/**
 * Deletes a file from Vercel Blob storage via `/api/blob/delete`.
 */
export async function deleteBlobFile(
  input?: string | { screenshotUrl?: string | null; blobUrl?: string | null } | null
): Promise<boolean> {
  const blobUrl = extractBlobUrl(input);
  if (!blobUrl) return false;

  try {
    const res = await fetch("/api/blob/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: blobUrl }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return Boolean(data?.success);
  } catch (err) {
    console.warn("Failed to delete blob from Vercel storage:", err);
    return false;
  }
}
