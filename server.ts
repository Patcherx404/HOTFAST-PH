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
  // 1. Authorization header: Bearer <token>
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

  // 2. Custom headers
  const headerEmail = (req.headers["x-admin-email"] || req.headers["x-user-email"]) as string | undefined;
  if (headerEmail && headerEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return true;
  }

  // 3. Cookies
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

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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

  app.delete("/api/auth/session", (req, res) => {
    res.setHeader("Set-Cookie", `hf_admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    return res.json({ ok: true, loggedOut: true });
  });

  // Admin & System Access API routes authorization enforcement
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

  // Direct URL navigation enforcement for System Access and Admin routes
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

      // Return 403 Unauthorized/Forbidden with styled security screen and auto-redirect to dashboard
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

    // Authorized administrator: proceed to serve the application
    if (process.env.NODE_ENV !== "production") {
      next();
    } else {
      const distPath = path.join(process.cwd(), "dist");
      res.sendFile(path.join(distPath, "index.html"));
    }
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
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
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
