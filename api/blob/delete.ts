/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { del } from "@vercel/blob";

function normalizeBlobUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
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

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed. Use POST or DELETE." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // ignore
      }
    }

    const rawUrl = body?.url || req.query?.url;
    const rawUrls: string[] = Array.isArray(body?.urls)
      ? body.urls
      : rawUrl
      ? [rawUrl]
      : [];

    const validUrls = rawUrls
      .map((u) => normalizeBlobUrl(u))
      .filter((u): u is string => Boolean(u));

    if (validUrls.length === 0) {
      return res.status(200).json({
        success: true,
        skipped: true,
        message: "No Vercel Blob URL provided to delete.",
      });
    }

    const token = (
      process.env.BLOB_READ_WRITE_TOKEN ||
      "vercel_blob_rw_zLsXpy9pmBX1qix3_BWNUP61s6imOk4f0yJ3esW8KOUKgfX"
    ).trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "BLOB_READ_WRITE_TOKEN is not configured.",
      });
    }

    await del(validUrls, { token });

    return res.status(200).json({
      success: true,
      deleted: validUrls,
    });
  } catch (error: any) {
    console.error("Error deleting from Vercel Blob storage:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete file from Vercel Blob storage.",
      message: error?.message || String(error),
    });
  }
}
