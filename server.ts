import express from "express";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { initializeApp as initAdminApp, getApps as getAdminApps } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import {
  ASIA_TIMEZONE,
  formatPHTFriendly,
  calculateNextRenewalCycle,
  evaluateSubscriberStatus,
} from "./src/lib/billingEngine.js";
import blobHandler from "./src/server/handlers/blob.js";
import healthHandler from "./src/server/handlers/health.js";
import paymongoHandler from "./src/server/handlers/paymongo.js";
import supportHandler from "./src/server/handlers/support.js";
import telegramHandler from "./src/server/handlers/telegram.js";
import uploadHandler from "./src/server/handlers/upload.js";

// Read applet config if present
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseConfig: any = {};
try {
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }
} catch (e) {
  console.warn("Could not load firebase-applet-config.json:", e);
}

const ADMIN_EMAIL = "projectile.afk@gmail.com";

function parseFirebaseToken(token: string): { email?: string; email_verified?: boolean; uid?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
    return payload;
  } catch {
    return null;
  }
}

const activeAdminTokens = new Set<string>();

function isAuthorizedAdminRequest(req: express.Request): boolean {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (activeAdminTokens.has(token)) return true;
    const parsed = parseFirebaseToken(token);
    if (parsed?.email && parsed.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      activeAdminTokens.add(token);
      return true;
    }
  }

  const headerEmail = (req.headers["x-admin-email"] || req.headers["x-user-email"]) as string | undefined;
  if (headerEmail && headerEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return true;
  }

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k, decodeURIComponent(v.join("="))];
      })
    );
    if (cookies["hf_admin_session"] && cookies["hf_admin_session"].toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      return true;
    }
    if (cookies["admin_email"] && cookies["admin_email"].toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      return true;
    }
    if (cookies["admin_token"]) {
      const parsed = parseFirebaseToken(cookies["admin_token"]);
      if (parsed?.email && parsed.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        return true;
      }
    }
  }

  return false;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(compression());
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ limit: "25mb", extended: true }));

  // Unified shared API handlers (1:1 parity with /api/index.ts on Vercel)
  app.all("/api/health", (req, res) => healthHandler(req, res));
  app.all(["/api/paymongo/static", "/api/paymongo/qr/generate", "/api/paymongo/generate"], (req, res) =>
    paymongoHandler(req, res)
  );
  app.all("/api/support", (req, res) => supportHandler(req, res));
  app.all("/api/upload", (req, res) => uploadHandler(req, res));
  app.all("/api/blob/view", (req, res) => {
    (req.query as any).action = "view";
    return blobHandler(req, res);
  });
  app.all("/api/blob/delete", (req, res) => {
    (req.query as any).action = "delete";
    return blobHandler(req, res);
  });
  app.all("/api/blob", (req, res) => blobHandler(req, res));
  app.all("/api/telegram/:action", (req, res) => {
    (req.query as any).action = req.params.action;
    return telegramHandler(req, res);
  });
  app.all("/api/telegram", (req, res) => telegramHandler(req, res));

  // Dedicated Compliance Page route
  app.get(["/compliance", "/compliance/"], (_req, res) => {
    if (process.env.NODE_ENV !== "production") {
      res.sendFile(path.join(process.cwd(), "public", "compliance.html"));
    } else {
      res.sendFile(path.join(process.cwd(), "dist", "compliance.html"));
    }
  });

  // Admin session sync endpoint
  app.post("/api/auth/session", (req, res) => {
    const { email, token } = req.body || {};
    if (typeof email === "string" && email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      if (token && typeof token === "string") {
        activeAdminTokens.add(token);
      }
      res.setHeader("Set-Cookie", `hf_admin_session=${ADMIN_EMAIL}; Path=/; SameSite=Lax; Max-Age=86400`);
      return res.json({ ok: true, admin: true, email: ADMIN_EMAIL });
    }
    return res.status(403).json({ error: "403 Forbidden: Unauthorized account for admin session", ok: false });
  });

  app.delete("/api/auth/session", (_req, res) => {
    res.setHeader("Set-Cookie", `hf_admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    return res.json({ ok: true, loggedOut: true });
  });

  // =========================================================================
  // AUTOMATED SUBSCRIBER BILLING STATUS SYSTEM (Hotfast PH)
  // Authoritative Server Time in Philippine Standard Time (Asia/Manila)
  // =========================================================================
  let adminDb: any = null;
  try {
    const adminApp =
      getAdminApps().length > 0
        ? getAdminApps()[0]
        : initAdminApp({
            projectId: firebaseConfig.projectId,
          });
    const dbId =
      firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)"
        ? firebaseConfig.firestoreDatabaseId
        : "(default)";
    adminDb = getAdminFirestore(adminApp, dbId);
  } catch (e) {
    console.warn("Could not initialize firebase-admin Firestore:", e);
  }

  interface SubscriberBillingRecord {
    uid: string;
    clientId?: string;
    accountNumber?: string;
    displayName?: string;
    email?: string;
    balance?: number;
    dueDate?: any;
    billStatus?: "paid" | "due" | "overdue";
    status?: "active" | "suspended";
    due_date?: string;
    due_time?: string;
    payment_status?: "unpaid" | "processing" | "paid" | "rejected";
    subscription_status?: "ACTIVE" | "DUE" | "OVERDUE" | "PAID";
    lastStatusCheck?: any;
    [key: string]: any;
  }

  let lastBillingCheckTime: Date | null = null;
  let lastBillingCheckStats = {
    totalChecked: 0,
    active: 0,
    due: 0,
    overdue: 0,
    paid: 0,
    transitions: 0,
  };

  const inMemorySubscribers = new Map<string, SubscriberBillingRecord>();

  async function fetchSubscribersFromFirestore(): Promise<SubscriberBillingRecord[]> {
    const subscribers: SubscriberBillingRecord[] = [];

    if (adminDb) {
      try {
        const snap = await adminDb.collection("users").get();
        snap.forEach((d: any) => {
          const item = { uid: d.id, ...d.data() };
          subscribers.push(item);
          inMemorySubscribers.set(d.id, item);
        });
        if (subscribers.length > 0) return subscribers;
      } catch {
        adminDb = null;
      }
    }

    if (firebaseConfig.projectId && firebaseConfig.apiKey) {
      try {
        const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
        const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/users?key=${firebaseConfig.apiKey}&pageSize=300`;
        const resp = await fetch(url);
        if (resp.ok) {
          const json: any = await resp.json();
          const documents = json.documents || [];
          for (const d of documents) {
            const pathParts = d.name.split("/");
            const uid = pathParts[pathParts.length - 1];
            const fields = d.fields || {};
            const sub: SubscriberBillingRecord = {
              uid,
              accountNumber: fields.accountNumber?.stringValue || "",
              clientId: fields.clientId?.stringValue || "",
              apiKey: fields.apiKey?.stringValue || "",
              displayName: fields.displayName?.stringValue || "",
              email: fields.email?.stringValue || "",
              balance: Number(fields.balance?.integerValue || fields.balance?.doubleValue || 0),
              billStatus: fields.billStatus?.stringValue,
              status: fields.status?.stringValue,
              due_date: fields.due_date?.stringValue,
              due_time: fields.due_time?.stringValue,
              payment_status: fields.payment_status?.stringValue,
              subscription_status: fields.subscription_status?.stringValue,
              dueDate: fields.dueDate?.timestampValue || fields.dueDate?.stringValue,
            };
            subscribers.push(sub);
            inMemorySubscribers.set(uid, sub);
          }
        }
      } catch {
        // Silently fall through to in-memory store
      }
    }

    if (subscribers.length === 0 && inMemorySubscribers.size > 0) {
      return Array.from(inMemorySubscribers.values());
    }

    return subscribers;
  }

  async function updateSubscriberInFirestore(uid: string, updates: Record<string, any>): Promise<boolean> {
    if (adminDb) {
      try {
        await adminDb.collection("users").doc(uid).set(updates, { merge: true });
        return true;
      } catch {
        // Fall through to REST
      }
    }

    if (firebaseConfig.projectId && firebaseConfig.apiKey) {
      try {
        const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
        const fieldMasks = Object.keys(updates)
          .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
          .join("&");
        const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/users/${uid}?${fieldMasks}&key=${firebaseConfig.apiKey}`;

        const fields: Record<string, any> = {};
        for (const [k, v] of Object.entries(updates)) {
          if (typeof v === "string") fields[k] = { stringValue: v };
          else if (typeof v === "number") fields[k] = { doubleValue: v };
          else if (typeof v === "boolean") fields[k] = { booleanValue: v };
          else if (v instanceof Date) fields[k] = { timestampValue: v.toISOString() };
          else if (v === null) fields[k] = { nullValue: null };
        }

        const resp = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields }),
        });
        return resp.ok;
      } catch (restErr) {
        console.error("Firestore REST update error:", restErr);
      }
    }
    return false;
  }

  async function runAutomatedBillingStatusCheck() {
    const serverNow = new Date();
    const subscribers = await fetchSubscribersFromFirestore();

    let updatedCount = 0;
    const stats = {
      totalChecked: subscribers.length,
      active: 0,
      due: 0,
      overdue: 0,
      paid: 0,
      transitions: 0,
    };

    const evaluations: any[] = [];

    for (const sub of subscribers) {
      const evaluation = evaluateSubscriberStatus(sub, serverNow);
      evaluations.push({
        uid: sub.uid,
        accountNumber: sub.accountNumber,
        displayName: sub.displayName,
        ...evaluation,
      });

      if (evaluation.subscription_status === "ACTIVE") stats.active++;
      else if (evaluation.subscription_status === "DUE") stats.due++;
      else if (evaluation.subscription_status === "OVERDUE") stats.overdue++;
      else if (evaluation.subscription_status === "PAID") stats.paid++;

      const needsUpdate =
        sub.subscription_status !== evaluation.subscription_status ||
        sub.payment_status !== evaluation.payment_status ||
        !sub.due_date ||
        !sub.due_time;

      if (needsUpdate) {
        stats.transitions++;
        const legacyBillStatus =
          evaluation.subscription_status === "PAID"
            ? "paid"
            : evaluation.subscription_status === "OVERDUE"
            ? "overdue"
            : "due";

        const ok = await updateSubscriberInFirestore(sub.uid, {
          subscription_status: evaluation.subscription_status,
          payment_status: evaluation.payment_status,
          due_date: evaluation.due_date,
          due_time: evaluation.due_time,
          billStatus: legacyBillStatus,
          lastStatusCheck: serverNow.toISOString(),
        });

        if (ok) updatedCount++;
      }
    }

    lastBillingCheckTime = serverNow;
    lastBillingCheckStats = stats;

    return {
      checkedAt: serverNow.toISOString(),
      authoritativeTimePHT: formatPHTFriendly(serverNow),
      totalSubscribers: subscribers.length,
      updatedCount,
      stats,
      evaluations,
    };
  }

  setInterval(() => {
    runAutomatedBillingStatusCheck().catch((err) => {
      console.error("Automatic status checker tick error:", err);
    });
  }, 30000);

  setTimeout(() => {
    runAutomatedBillingStatusCheck().catch(console.error);
  }, 3000);

  app.get("/api/billing/subscribers/status", (_req, res) => {
    const serverNow = new Date();
    res.json({
      authoritativeServerTimeUTC: serverNow.toISOString(),
      authoritativeServerTimePHT: formatPHTFriendly(serverNow),
      timezone: ASIA_TIMEZONE,
      lastCheckTime: lastBillingCheckTime ? lastBillingCheckTime.toISOString() : null,
      stats: lastBillingCheckStats,
    });
  });

  app.post("/api/billing/subscribers/sync", (req, res) => {
    const { subscribers: clientSubscribers } = req.body || {};
    if (Array.isArray(clientSubscribers)) {
      for (const sub of clientSubscribers) {
        if (sub && sub.uid) {
          inMemorySubscribers.set(sub.uid, {
            ...inMemorySubscribers.get(sub.uid),
            ...sub,
          });
        }
      }
    }
    return res.json({ success: true, count: inMemorySubscribers.size });
  });

  app.post("/api/billing/subscribers/check", async (_req, res) => {
    try {
      const result = await runAutomatedBillingStatusCheck();
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to run billing check", message: err?.message });
    }
  });

  app.post("/api/billing/subscribers/renew", async (req, res) => {
    if (!isAuthorizedAdminRequest(req)) {
      return res.status(403).json({ error: "Unauthorized. Admin authorization required for subscription renewal." });
    }

    try {
      const { uid, new_due_date, new_due_time } = req.body || {};
      if (!uid) {
        return res.status(400).json({ error: "Subscriber UID is required." });
      }

      const subscribers = await fetchSubscribersFromFirestore();
      const target = subscribers.find((s) => s.uid === uid);
      if (!target) {
        return res.status(404).json({ error: "Subscriber not found." });
      }

      const renewal = calculateNextRenewalCycle(target.due_date, target.due_time);
      const dueDateFinal = new_due_date || renewal.due_date;
      const dueTimeFinal = new_due_time || renewal.due_time;

      const updates = {
        due_date: dueDateFinal,
        due_time: dueTimeFinal,
        dueDate: renewal.dueDateObj.toISOString(),
        payment_status: "unpaid",
        subscription_status: "ACTIVE",
        billStatus: "paid",
        balance: 0,
        lastStatusCheck: new Date().toISOString(),
      };

      const ok = await updateSubscriberInFirestore(uid, updates);
      if (!ok) {
        return res.status(500).json({ error: "Failed to write renewal to database." });
      }

      return res.json({
        success: true,
        message: `Subscription successfully renewed for ${target.displayName || uid}.`,
        renewedUntil: `${dueDateFinal} at ${dueTimeFinal} PHT`,
        updates,
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Renewal failed", message: err?.message });
    }
  });

  app.post("/api/billing/subscribers/update-schedule", async (req, res) => {
    if (!isAuthorizedAdminRequest(req)) {
      return res.status(403).json({ error: "Unauthorized: Admin authorization required." });
    }

    try {
      const { uid, due_date, due_time, payment_status, subscription_status } = req.body || {};
      if (!uid) return res.status(400).json({ error: "UID required." });

      const evaluation = evaluateSubscriberStatus(
        {
          due_date,
          due_time,
          payment_status,
        },
        new Date()
      );

      const finalStatus = subscription_status || evaluation.subscription_status;

      const updates: Record<string, any> = {
        due_date: due_date || evaluation.due_date,
        due_time: due_time || evaluation.due_time,
        payment_status: payment_status || evaluation.payment_status,
        subscription_status: finalStatus,
        lastStatusCheck: new Date().toISOString(),
      };

      const ok = await updateSubscriberInFirestore(uid, updates);
      return res.json({ success: ok, updates, evaluation });
    } catch (err: any) {
      return res.status(500).json({ error: "Update failed", message: err?.message });
    }
  });

  function formatClientApiResponse(client: any, apiKeyProvided?: string) {
    const isSuspended = client.status === "suspended";
    const isExpired =
      client.subscription_status === "EXPIRED" ||
      client.subscription_status === "OVERDUE" ||
      isSuspended;
    const isActive =
      (client.subscription_status === "ACTIVE" ||
        client.billStatus === "paid" ||
        client.status === "active") &&
      !isSuspended;
    const effectiveStatus = isActive ? "active" : "suspended";
    const expiryDate = client.due_date || "";
    const expiryTime = client.due_time || "12:00 PM";
    const expiryString = expiryDate ? `${expiryDate} ${expiryTime}` : "";

    const keyMatches =
      !client.apiKey ||
      !apiKeyProvided ||
      client.apiKey.trim() === apiKeyProvided.trim();

    return {
      success: true,
      code: 200,
      status: effectiveStatus,
      active: isActive,
      is_active: isActive,
      expired: isExpired,
      is_expired: isExpired,
      authenticated: keyMatches,
      clientId: client.clientId || client.accountNumber || "",
      client_id: client.clientId || client.accountNumber || "",
      accountNumber: client.accountNumber || "",
      account_number: client.accountNumber || "",
      displayName: client.displayName || "",
      name: client.displayName || "",
      username: client.clientId || client.accountNumber || client.email || "",
      email: client.email || "",
      due_date: expiryDate,
      due_time: expiryTime,
      dueDate: client.dueDate || "",
      expiry: expiryString,
      expiry_date: expiryDate,
      expiry_time: expiryTime,
      expiration: expiryString,
      subscription_status: client.subscription_status || (isActive ? "ACTIVE" : "DUE"),
      payment_status: client.payment_status || "unpaid",
      billStatus: client.billStatus || (isActive ? "paid" : "due"),
      balance: client.balance || 0,
      currentPlanId: client.currentPlanId || "",
      plan: client.currentPlanId || "Standard",
      client: {
        ...client,
        status: effectiveStatus,
        active: isActive,
        due_date: expiryDate,
        due_time: expiryTime,
      },
      data: {
        ...client,
        status: effectiveStatus,
        active: isActive,
        due_date: expiryDate,
        due_time: expiryTime,
      },
    };
  }

  app.get("/api/clients", async (req, res) => {
    try {
      const subscribers = await fetchSubscribersFromFirestore();
      const q = req.query as Record<string, string>;
      const apiKeyProvided =
        (req.headers["x-api-key"] as string) ||
        (req.headers["authorization"] ? (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "") : "") ||
        q.api_key ||
        q.apiKey ||
        q.token ||
        q.key;

      const singleTarget =
        q.client_id ||
        q.clientId ||
        q.accountNumber ||
        q.account_number ||
        q.identifier ||
        q.username ||
        q.user ||
        (req.headers["x-client-id"] as string);

      if (singleTarget) {
        const targetClean = singleTarget.trim().toLowerCase();
        const match = subscribers.find((s) => {
          if (!s) return false;
          return (
            s.uid?.toLowerCase() === targetClean ||
            s.accountNumber?.trim().toLowerCase() === targetClean ||
            s.clientId?.trim().toLowerCase() === targetClean ||
            s.email?.trim().toLowerCase() === targetClean
          );
        });

        if (!match) {
          return res.status(404).json({
            success: false,
            code: 404,
            status: "not_found",
            error: "Client not found",
            identifier: singleTarget,
          });
        }

        return res.json(formatClientApiResponse(match, apiKeyProvided));
      }

      const { status, search, limit } = q;
      let filtered = [...subscribers];

      if (status && typeof status === "string" && status !== "all") {
        filtered = filtered.filter(
          (s) =>
            s.status === status ||
            s.billStatus === status ||
            s.subscription_status?.toLowerCase() === status.toLowerCase()
        );
      }

      if (search && typeof search === "string") {
        const queryStr = search.toLowerCase();
        filtered = filtered.filter(
          (s) =>
            s.displayName?.toLowerCase().includes(queryStr) ||
            s.accountNumber?.toLowerCase().includes(queryStr) ||
            s.clientId?.toLowerCase().includes(queryStr) ||
            s.email?.toLowerCase().includes(queryStr) ||
            s.uid?.toLowerCase().includes(queryStr)
        );
      }

      if (limit) {
        const n = parseInt(limit as string, 10);
        if (!isNaN(n) && n > 0) {
          filtered = filtered.slice(0, n);
        }
      }

      return res.json({
        success: true,
        total: filtered.length,
        gateway: "ASIA-EAST1-PROD",
        timezone: "Asia/Manila (UTC+8)",
        timestamp: new Date().toISOString(),
        clients: filtered,
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch clients", message: err?.message });
    }
  });

  app.get("/api/clients/:identifier", async (req, res) => {
    try {
      const { identifier } = req.params;
      const apiKeyProvided =
        (req.headers["x-api-key"] as string) ||
        (req.headers["authorization"] ? (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "") : "") ||
        (req.query.api_key as string) ||
        (req.query.apiKey as string);

      const subscribers = await fetchSubscribersFromFirestore();
      const targetClean = identifier.trim().toLowerCase();
      const client = subscribers.find((s) => {
        if (!s) return false;
        return (
          s.uid?.toLowerCase() === targetClean ||
          s.accountNumber?.trim().toLowerCase() === targetClean ||
          s.clientId?.trim().toLowerCase() === targetClean ||
          s.email?.trim().toLowerCase() === targetClean
        );
      });

      if (!client) {
        return res.status(404).json({
          success: false,
          code: 404,
          status: "not_found",
          error: "Client not found",
          identifier,
        });
      }

      return res.json(formatClientApiResponse(client, apiKeyProvided));
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch client", message: err?.message });
    }
  });

  app.all(["/api/admin", "/api/admin/*", "/api/system-access", "/api/system-access/*"], (req, res) => {
    if (!isAuthorizedAdminRequest(req)) {
      return res.status(403).json({
        error: "403 Forbidden: Access Denied",
        message: "System Access is strictly restricted to the authorized administrator account (projectile.afk@gmail.com).",
        status: 403,
      });
    }
    return res.json({ status: "ok", message: "Admin authorization verified." });
  });

  const systemAccessUrls = ["/admin", "/admin/*", "/system-access", "/system-access/*"];
  app.get(systemAccessUrls, (req, res, next) => {
    if (!isAuthorizedAdminRequest(req)) {
      if (req.headers.accept && req.headers.accept.includes("application/json")) {
        return res.status(403).json({
          error: "403 Forbidden: Access Denied",
          message: "System Access is strictly restricted to the authorized administrator account (projectile.afk@gmail.com).",
          status: 403,
        });
      }

      return res.status(403).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>403 Forbidden - System Access Restricted</title>
  <style>
    body {
      background-color: #0b0f19;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      border-top: 4px solid #ef4444;
      border-radius: 12px;
      padding: 36px 32px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-block;
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 9999px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 24px;
      font-weight: 900;
      margin: 0 0 12px;
      letter-spacing: -0.025em;
    }
    p {
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.6;
      margin: 0 0 24px;
    }
    .btn {
      display: inline-block;
      background: #ef4444;
      color: #ffffff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 12px 24px;
      border-radius: 8px;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #dc2626;
    }
    .timer {
      font-size: 11px;
      color: #64748b;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">403 Forbidden / Unauthorized</div>
    <h1>System Access Restricted</h1>
    <p>
      You do not have permission to access System Access. This portal is strictly restricted to the authorized administrator account (<strong>projectile.afk@gmail.com</strong>).
    </p>
    <a href="/" class="btn">Return to Dashboard</a>
    <div class="timer">Redirecting to dashboard in 3 seconds...</div>
  </div>
  <script>
    setTimeout(function() {
      window.location.href = "/";
    }, 3000);
  </script>
</body>
</html>`);
    }

    if (process.env.NODE_ENV !== "production") {
      next();
    } else {
      const distPath = path.join(process.cwd(), "dist");
      res.sendFile(path.join(distPath, "index.html"));
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(
      express.static(distPath, {
        maxAge: "1y",
        immutable: true,
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith(".html") ||
            filePath.endsWith("sw.js") ||
            filePath.endsWith("manifest.webmanifest")
          ) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          }
        },
      })
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Database ID: ${firebaseConfig.firestoreDatabaseId}`);
    console.log(`Project ID: ${firebaseConfig.projectId}`);
  });
}

startServer().catch((err) => {
  console.error("FATAL: Failed to start server:", err);
  process.exit(1);
});
