/**
 * Consolidated Vercel Blob Serverless Function (/api/blob)
 * Handles both viewing (GET) and deleting (POST/DELETE) blob assets.
 */
import { get, del } from "@vercel/blob";

function normalizeBlobUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes("/api/blob")) {
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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const token = (process.env.BLOB_READ_WRITE_TOKEN || "").trim();

  // Determine whether this is a view or delete request
  const action = req.query?.action;
  const isView = action === "view" || req.method === "GET";

  if (isView) {
    try {
      const rawUrl =
        (req.query && req.query.url) ||
        (req.url && new URL(req.url, "http://localhost").searchParams.get("url"));

      if (!rawUrl || typeof rawUrl !== "string") {
        return res.status(400).json({ error: "Missing 'url' query parameter." });
      }

      const isPrivate = rawUrl.includes("private.blob.vercel-storage.com");
      const result = await get(rawUrl, {
        access: isPrivate ? "private" : "public",
        token,
      });

      if (!result || result.statusCode !== 200 || !result.stream) {
        return res.status(404).json({ error: "Image not found or could not be loaded." });
      }

      const contentType = result.blob?.contentType || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

      const arrayBuf = await new Response(result.stream).arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (typeof res.send === "function") {
        return res.status(200).send(buffer);
      }
      res.status(200);
      return res.end(buffer);
    } catch (error: any) {
      console.error("Error viewing blob image:", error);
      return res.status(404).json({ error: "Image not found or could not be loaded." });
    }
  }

  // Otherwise, handle deletion (POST or DELETE)
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
