/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { put } from "@vercel/blob";

export interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  socket?: {
    remoteAddress?: string;
  };
}

export interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: any) => VercelResponse;
  setHeader: (name: string, value: string) => VercelResponse;
  end: (data?: any) => VercelResponse;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Only POST is supported." });
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

    const { base64Data, filename, contentType } = body || {};

    if (!base64Data || typeof base64Data !== "string") {
      return res.status(400).json({ error: "base64Data is required." });
    }

    // Check if BLOB_READ_WRITE_TOKEN is configured in Vercel or environment
    const token = (
      process.env.BLOB_READ_WRITE_TOKEN ||
      "vercel_blob_rw_zLsXpy9pmBX1qix3_BWNUP61s6imOk4f0yJ3esW8KOUKgfX"
    ).trim();

    if (!token) {
      return res.status(200).json({
        url: base64Data,
        viewUrl: base64Data,
        fallback: true,
        message: "BLOB_READ_WRITE_TOKEN not set in environment variables. Using direct payload.",
      });
    }

    // Extract mime type and binary content from data URL or raw base64
    let cleanBase64 = base64Data;
    let detectedType = contentType || "image/jpeg";

    if (base64Data.startsWith("data:")) {
      const match = base64Data.match(/^data:([^;]+);base64,/);
      if (match) {
        detectedType = match[1];
        cleanBase64 = base64Data.slice(match[0].length);
      }
    }

    const buffer = Buffer.from(cleanBase64.replace(/\s+/g, ""), "base64");
    const ext = detectedType.split("/")[1]?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const safeFilename = filename
      ? `receipts/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "")}`
      : `receipts/${Date.now()}-payment-proof.${ext}`;

    let blobResult: any = null;

    // Try public upload first, auto-fallback to private access if store is configured as private
    try {
      blobResult = await put(safeFilename, buffer, {
        access: "public",
        contentType: detectedType,
        token,
      });
    } catch (putErr: any) {
      if (putErr?.message && putErr.message.includes("private store")) {
        blobResult = await put(safeFilename, buffer, {
          access: "private",
          contentType: detectedType,
          token,
        });
      } else {
        throw putErr;
      }
    }

    const isPrivate = blobResult.url.includes("private.blob.vercel-storage.com");
    const viewUrl = isPrivate
      ? `/api/blob/view?url=${encodeURIComponent(blobResult.url)}`
      : blobResult.url;

    return res.status(200).json({
      success: true,
      url: blobResult.url,
      viewUrl,
      isPrivate,
      pathname: blobResult.pathname,
    });
  } catch (error: any) {
    console.error("Vercel Blob upload error:", error);
    // Even if an unexpected blob error occurs, return base64 so payment is never blocked
    return res.status(200).json({
      success: true,
      url: (req.body && req.body.base64Data) || "",
      viewUrl: (req.body && req.body.base64Data) || "",
      fallback: true,
      error: error?.message || String(error),
    });
  }
}
