/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { get } from "@vercel/blob";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const rawUrl =
      (req.query && req.query.url) ||
      (req.url && new URL(req.url, "http://localhost").searchParams.get("url"));

    if (!rawUrl || typeof rawUrl !== "string") {
      return res.status(400).json({ error: "Missing 'url' query parameter." });
    }

    const token = (
      process.env.BLOB_READ_WRITE_TOKEN ||
      "vercel_blob_rw_zLsXpy9pmBX1qix3_BWNUP61s6imOk4f0yJ3esW8KOUKgfX"
    ).trim();

    const isPrivate = rawUrl.includes("private.blob.vercel-storage.com");
    const result = await get(rawUrl, {
      access: isPrivate ? "private" : "public",
      token,
    });

    const contentType = result.blob?.contentType || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

    const arrayBuf = await new Response(result.stream).arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    return res.status(200).send(buffer);
  } catch (error: any) {
    console.error("Error viewing blob image:", error);
    return res.status(404).json({ error: "Image not found or could not be loaded." });
  }
}
