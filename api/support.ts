// Serverless request and response types compatible with Vercel and Node.js
export interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  socket: {
    remoteAddress?: string;
  };
}

export interface VercelResponse {
  setHeader(name: string, value: string): VercelResponse;
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
  end(): VercelResponse;
}

// In-memory rate limiting map for Vercel Serverless Function instance
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string, maxRequests = 5, windowMs = 5 * 60 * 1000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }
  if (record.count >= maxRequests) {
    return true;
  }
  record.count += 1;
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Only POST is supported." });
  }

  try {
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    // Rate limit check
    if (checkRateLimit(clientIp)) {
      return res.status(429).json({
        error: "Too many support requests from this connection. Please wait 5 minutes before submitting again.",
      });
    }

    const { name, accountNumber, contact, category, message, phone } = req.body || {};

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
    const cleanPhone =
      typeof phone === "string"
        ? phone.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 50)
        : "";

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: "Please enter your name (at least 2 characters)." });
    }
    if ((!cleanContact || cleanContact.length < 3) && (!cleanPhone || cleanPhone.length < 7)) {
      return res.status(400).json({ error: "Please provide valid contact phone number." });
    }
    if (!cleanMessage || cleanMessage.length < 5) {
      return res.status(400).json({ error: "Please enter your message (at least 5 characters)." });
    }

    // Generate Ticket ID
    const ticketId = `HF-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const timestamp = new Date().toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const displayContact = cleanPhone || cleanContact;

    const telegramText = `🔔 NEW HOTFAST SUPPORT REQUEST

👤 Client: ${cleanName}
🆔 Account: ${cleanAccount}
📞 Contact: ${displayContact}
📂 Category: ${cleanCategory}

💬 Message:
${cleanMessage}

🕐 Time:
${timestamp}

🌐 Source:
Hotfast.online (Vercel)`;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID || "8732198426";
    let telegramSent = false;

    if (!botToken || botToken.trim() === "" || botToken === "YOUR_NEW_TELEGRAM_BOT_TOKEN") {
      console.warn("TELEGRAM_BOT_TOKEN is not configured in Vercel Environment Variables. Ticket logged.");
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
        } else {
          console.error("Telegram API error:", resData?.description || response.statusText);
        }
      } catch (tgError: any) {
        console.error("Error contacting Telegram Bot API:", tgError?.message || tgError);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Your support request has been successfully submitted! Our Hotfast support administrator has been notified.",
      ticketId,
      telegramNotified: telegramSent,
    });
  } catch (err: any) {
    console.error("Support submission error:", err?.message || err);
    return res.status(500).json({
      error: "An unexpected error occurred while processing your support request. Please try again shortly.",
    });
  }
}
