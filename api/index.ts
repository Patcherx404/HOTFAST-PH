/**
 * Unified Vercel Serverless Function Router (/api/index.ts)
 * Consolidates all backend API routes into a single Serverless Function (1 <= 12 Hobby Plan limit).
 */
import blobHandler from "../src/server/handlers/blob.js";
import clientsHandler from "../src/server/handlers/clients.js";
import healthHandler from "../src/server/handlers/health.js";
import paymongoHandler from "../src/server/handlers/paymongo.js";
import supportHandler from "../src/server/handlers/support.js";
import telegramHandler from "../src/server/handlers/telegram.js";
import uploadHandler from "../src/server/handlers/upload.js";

export default async function handler(req: any, res: any) {
  const rawUrl = req.url || "/";
  const parsedUrl = new URL(rawUrl, "http://localhost");
  let pathname = parsedUrl.pathname || "/";

  // Normalize query parameters from both Vercel runtime and incoming URL
  const mergedQuery: Record<string, any> = { ...(req.query || {}) };
  parsedUrl.searchParams.forEach((value, key) => {
    if (mergedQuery[key] === undefined) {
      mergedQuery[key] = value;
    }
  });

  // Resolve original API path when routed via Vercel Zero-Config rewrites (/api/index?__path=:path*)
  if (mergedQuery.__path !== undefined) {
    const rawSubPath = Array.isArray(mergedQuery.__path)
      ? mergedQuery.__path.join("/")
      : String(mergedQuery.__path);
    const cleanSubPath = rawSubPath.replace(/^\/+/, "");
    pathname = cleanSubPath ? `/api/${cleanSubPath}` : "/api";
    delete mergedQuery.__path;
    parsedUrl.searchParams.delete("__path");
    const remainingSearch = parsedUrl.searchParams.toString();
    req.url = remainingSearch ? `${pathname}?${remainingSearch}` : pathname;
  }

  req.query = mergedQuery;

  // Strip trailing slash (except root)
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  // 1. Health check
  if (pathname === "/api" || pathname === "/api/health" || pathname === "/api/index") {
    return healthHandler(req, res);
  }

  // 2. Customer support ticket submission
  if (pathname === "/api/support") {
    return supportHandler(req, res);
  }

  // 3. Vercel Blob receipt upload
  if (pathname === "/api/upload") {
    return uploadHandler(req, res);
  }

  // 4. Vercel Blob view & delete
  if (pathname === "/api/blob" || pathname.startsWith("/api/blob/")) {
    if (pathname === "/api/blob/view") {
      req.query.action = "view";
    } else if (pathname === "/api/blob/delete") {
      req.query.action = "delete";
    }
    return blobHandler(req, res);
  }

  // 5. PayMongo QR Ph endpoints (/api/paymongo/static, /api/paymongo/qr/generate, /api/paymongo/generate)
  if (pathname === "/api/paymongo" || pathname.startsWith("/api/paymongo/")) {
    return paymongoHandler(req, res);
  }

  // 6. Telegram notification & settings endpoints (/api/telegram/:action)
  if (pathname === "/api/telegram" || pathname.startsWith("/api/telegram/")) {
    if (pathname.startsWith("/api/telegram/")) {
      const subAction = pathname.slice("/api/telegram/".length).split("/")[0];
      if (subAction && !req.query.action) {
        req.query.action = decodeURIComponent(subAction);
      }
    }
    return telegramHandler(req, res);
  }

  // 7. Client / WiFi5Soft billing API (/api/clients and /api/clients/:identifier)
  if (pathname === "/api/clients" || pathname.startsWith("/api/clients/")) {
    if (pathname.startsWith("/api/clients/")) {
      const idPart = pathname.slice("/api/clients/".length);
      if (idPart && !req.query.identifier) {
        req.query.identifier = decodeURIComponent(idPart);
      }
    }
    return clientsHandler(req, res);
  }

  // 8. Auth session & subscriber sync compatibility endpoints
  if (pathname === "/api/auth/session" || pathname.startsWith("/api/billing/subscribers/")) {
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
    return res.status(200).json({ success: true, status: "ok" });
  }

  return res.status(404).json({
    error: "API endpoint not found",
    path: pathname,
  });
}
