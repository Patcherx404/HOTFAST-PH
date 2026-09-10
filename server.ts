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
