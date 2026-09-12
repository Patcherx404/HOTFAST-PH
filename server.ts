import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Sliding window rate limiter for support requests (5 per 5 minutes per IP) to prevent Telegram spam
  const supportRateLimitMap = new Map<string, { count: number; resetTime: number }>();
  function checkSupportRateLimit(ip: string, maxRequests = 5, windowMs = 5 * 60 * 1000): boolean {
    const now = Date.now();
    const record = supportRateLimitMap.get(ip);
    if (!record || now > record.resetTime) {
      supportRateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      return false;
    }
    if (record.count >= maxRequests) {
      return true;
    }
    record.count += 1;
    return false;
  }

  const ADMIN_EMAIL = "projectile.afk@gmail.com";

  function parseCookies(cookieHeader?: string): Record<string, string> {
    const list: Record<string, string> = {};
    if (!cookieHeader) return list;
    cookieHeader.split(";").forEach((cookie) => {
      const parts = cookie.split("=");
      if (parts.length >= 2) {
        list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join("=").trim());
      }
    });
    return list;
  }

  function verifyAdminRequest(req: express.Request): boolean {
    // 1. Check custom header
    const headerEmail = (req.headers["x-admin-email"] as string)?.trim().toLowerCase();
    if (headerEmail === ADMIN_EMAIL.toLowerCase()) {
      return true;
    }

    // 2. Check cookies
    const cookies = parseCookies(req.headers.cookie);
    const sessionUser = cookies["hf_admin_session"]?.trim().toLowerCase();
    if (sessionUser === ADMIN_EMAIL.toLowerCase()) {
      return true;
    }

    // 3. Check Authorization Bearer JWT
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
          if (payload.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            return true;
          }
        }
      } catch {
        // ignore parse error
      }
    }

    return false;
  }

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Admin session sync endpoint
  app.post("/api/admin/session", (req, res) => {
    const { email, token } = req.body || {};
    let isAuthorized = false;

    if (typeof email === "string" && email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      isAuthorized = true;
    }

    if (token && typeof token === "string") {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
          if (payload.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            isAuthorized = true;
          }
        }
      } catch {
        // ignore
      }
    }

    if (!isAuthorized) {
      res.setHeader("Set-Cookie", "hf_admin_session=; Path=/; Max-Age=0; SameSite=Lax");
      return res.status(403).json({
        error: "403 Forbidden: Administrative access restricted to projectile.afk@gmail.com",
        code: "FORBIDDEN",
      });
    }

    res.setHeader(
      "Set-Cookie",
      `hf_admin_session=${encodeURIComponent(ADMIN_EMAIL)}; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly`
    );
    return res.status(200).json({ success: true, admin: true, email: ADMIN_EMAIL });
  });

  app.delete("/api/admin/session", (req, res) => {
    res.setHeader("Set-Cookie", "hf_admin_session=; Path=/; Max-Age=0; SameSite=Lax");
    return res.status(200).json({ success: true });
  });

  // Verify admin status endpoint
  app.get("/api/admin/verify", (req, res) => {
    if (verifyAdminRequest(req)) {
      return res.status(200).json({ authorized: true, email: ADMIN_EMAIL });
    }
    return res.status(403).json({
      error: "403 Forbidden: Access Restricted to Administrator (projectile.afk@gmail.com)",
      code: "FORBIDDEN",
      authorized: false,
    });
  });

  // Dedicated middleware for any /api/admin/* endpoints
  app.use("/api/admin", (req, res, next) => {
    if (!verifyAdminRequest(req)) {
      return res.status(403).json({
        error: "403 Forbidden: Administrative access restricted to projectile.afk@gmail.com",
        code: "FORBIDDEN",
      });
    }
    next();
  });

  // Customer Support Form submission with Telegram Notification
  app.post("/api/support", async (req, res) => {
    try {
      const clientIp =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "unknown";

      // Rate limit check
      if (checkSupportRateLimit(clientIp)) {
        return res.status(429).json({
          error: "Too many support requests from this connection. Please wait 5 minutes before submitting again.",
        });
      }

      const { name, accountNumber, contact, category, message } = req.body || {};

      // Validate and sanitize inputs
      const cleanName =
        typeof name === "string"
          ? name.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 100)
          : "";
      const cleanAccount =
        typeof accountNumber === "string" && accountNumber.trim() !== ""
          ? accountNumber.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 50)
          : "N/A";
      const cleanContact =
        typeof contact === "string"
          ? contact.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 100)
          : "";
      const cleanCategory =
        typeof category === "string" && category.trim() !== ""
          ? category.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 100)
          : "General Inquiry";
      const cleanMessage =
        typeof message === "string"
          ? message.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 3000)
          : "";

      if (!cleanName || cleanName.length < 2) {
        return res.status(400).json({ error: "Please enter your name (at least 2 characters)." });
      }
      if (!cleanContact || cleanContact.length < 3) {
        return res.status(400).json({ error: "Please provide valid contact information (mobile number or email)." });
      }
      if (!cleanMessage || cleanMessage.length < 5) {
        return res.status(400).json({ error: "Please enter your message (at least 5 characters)." });
      }

      // Generate Ticket Reference Number
      const ticketId = `HF-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Format timestamp in Philippine Time (PHT - Asia/Manila)
      const timestamp = new Date().toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "medium",
        timeStyle: "short",
      });

      // Format Telegram message strictly as requested
      const telegramText = `🔔 NEW HOTFAST SUPPORT REQUEST

👤 Client: ${cleanName}
🆔 Account: ${cleanAccount}
📞 Contact: ${cleanContact}
📂 Category: ${cleanCategory}

💬 Message:
${cleanMessage}

🕐 Time:
${timestamp}

🌐 Source:
Hotfast.online`;

      // Server-side Telegram Bot API notification
      // Note: TELEGRAM_BOT_TOKEN is strictly private and never leaked in client response
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID || "8732198426";
      let telegramSent = false;

      if (!botToken || botToken.trim() === "" || botToken === "YOUR_NEW_TELEGRAM_BOT_TOKEN") {
        console.warn(
          "⚠️ [Telegram Support] TELEGRAM_BOT_TOKEN is not configured in environment variables. Telegram notification was skipped. Ticket logged."
        );
      } else {
        try {
          const tgUrl = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;
          const response = await fetch(tgUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: telegramText,
            }),
          });

          const resData: any = await response.json().catch(() => ({}));
          if (response.ok && resData?.ok) {
            telegramSent = true;
            console.log(`✅ [Telegram Support] Support ticket forwarded to Telegram Admin Chat ${chatId}`);
          } else {
            console.error("❌ [Telegram Support] Telegram API response error:", resData?.description || response.statusText);
          }
        } catch (tgError: any) {
          // Graceful handling of Telegram network or API errors without crashing or exposing token
          console.error("❌ [Telegram Support] Error contacting Telegram Bot API:", tgError?.message || tgError);
        }
      }

      return res.status(200).json({
        success: true,
        message: "Your support request has been successfully submitted! Our Hotfast support administrator has been notified.",
        ticketId,
        telegramNotified: telegramSent,
      });
    } catch (err: any) {
      console.error("Support submission server error:", err?.message || err);
      return res.status(500).json({
        error: "An unexpected error occurred while processing your support request. Please try again shortly.",
      });
    }
  });

  // Dedicated Compliance Page route
  app.get(["/compliance", "/compliance/"], (req, res) => {
    if (process.env.NODE_ENV !== "production") {
      res.sendFile(path.join(process.cwd(), "public", "compliance.html"));
    } else {
      res.sendFile(path.join(process.cwd(), "dist", "compliance.html"));
    }
  });

  // Enforce System Access route authentication for direct manual URL entry
  app.get(["/admin", "/admin/*", "/system-access", "/system-access/*"], (req, res, next) => {
    const isAuthorized = verifyAdminRequest(req);

    if (isAuthorized) {
      // Authorized administrator (projectile.afk@gmail.com) -> proceed to SPA
      return next();
    }

    // Return 403 for API/JSON requests
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.status(403).json({
        error: "403 Forbidden: System Access is restricted to projectile.afk@gmail.com",
        code: "FORBIDDEN",
        status: 403,
      });
    }

    // Direct browser URL entry by unauthorized user -> return 403 Forbidden and redirect to dashboard
    return res.status(403).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="3;url=/?error=forbidden_admin_access">
  <title>403 Forbidden | Hotfast Network</title>
  <style>
    body {
      background-color: #07090e;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 1.5rem;
    }
    .card {
      background-color: #0f172a;
      border: 1px solid rgba(239, 68, 68, 0.4);
      border-radius: 1rem;
      padding: 2.5rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .badge {
      display: inline-block;
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 1.25rem;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 900;
      letter-spacing: -0.025em;
      margin: 0 0 0.75rem;
      color: #ffffff;
    }
    p {
      font-size: 0.875rem;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 1.75rem;
    }
    .btn {
      display: inline-block;
      background-color: #0284c7;
      color: #ffffff;
      text-decoration: none;
      font-size: 0.8125rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.875rem 1.75rem;
      border-radius: 0.625rem;
      transition: background-color 0.2s;
    }
    .btn:hover {
      background-color: #0369a1;
    }
    .timer {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 1.25rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">403 Forbidden • Access Denied</div>
    <h1>System Access Restricted</h1>
    <p>Administrative access is strictly restricted to the authorized administrator (<strong>projectile.afk@gmail.com</strong>). Unauthorized direct navigation attempt blocked.</p>
    <a href="/?error=forbidden_admin_access" class="btn">Return to Subscriber Dashboard</a>
    <div class="timer">Redirecting automatically to dashboard in 3 seconds...</div>
  </div>
</body>
</html>`);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // Cache hashed assets aggressively for faster repeat page loads
    app.use(
      "/assets",
      express.static(path.join(distPath, "assets"), {
        maxAge: "1y",
        immutable: true,
      })
    );
    app.use(
      express.static(distPath, {
        maxAge: "1h",
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache, must-revalidate");
          }
        },
      })
    );
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Database ID: ${firebaseConfig.firestoreDatabaseId}`);
    console.log(`Project ID: ${firebaseConfig.projectId}`);
  });
}

startServer().catch(err => {
  console.error("FATAL: Failed to start server:", err);
  process.exit(1);
});
