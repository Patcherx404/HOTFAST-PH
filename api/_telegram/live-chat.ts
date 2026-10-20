// Telegram Live Chat Notification Serverless Function for Vercel (/api/telegram/live-chat)

export interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  socket: {
    remoteAddress?: string;
  };
}

export interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: any) => VercelResponse;
  setHeader: (name: string, value: string) => VercelResponse;
  end: (data?: any) => VercelResponse;
}

const DEFAULT_BOT_TOKEN = "8993172244:AAHdLW65QI9wt7ha2-1Vc8BA9828L-GxLxo";
const DEFAULT_CHAT_ID = "8732198426";

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
        body = {};
      }
    }

    const { message, clientName, accountNumber, email, phone, userId, plan, isGuest } = body || {};

    const cleanMessage =
      typeof message === "string"
        ? message.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 3000)
        : "";

    if (!cleanMessage) {
      return res.status(400).json({ error: "Message content cannot be empty." });
    }

    const cleanName =
      typeof clientName === "string" && clientName.trim()
        ? clientName.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 100)
        : "Subscriber Client";

    const cleanAccount =
      typeof accountNumber === "string" && accountNumber.trim() && accountNumber.trim() !== "N/A"
        ? accountNumber.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 50)
        : null;

    const cleanEmail =
      typeof email === "string" && email.trim()
        ? email.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 100)
        : null;

    const cleanPhone =
      typeof phone === "string" && phone.trim()
        ? phone.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 50)
        : null;

    const cleanPlan =
      typeof plan === "string" && plan.trim()
        ? plan.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 100)
        : null;

    const cleanUserId =
      typeof userId === "string" && userId.trim()
        ? userId.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").slice(0, 128)
        : null;

    const timestamp = new Date().toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const lines: string[] = [
      "💬 [HOTFAST PH] LIVE CHAT CLIENT MESSAGE 💬",
      "────────────────────────────",
      `👤 Client: ${cleanName}${isGuest ? " (Guest / Visitor)" : ""}`,
    ];

    if (cleanAccount) {
      lines.push(`🆔 Account No: ${cleanAccount}`);
    }
    if (cleanEmail || cleanPhone) {
      const contactInfo = [cleanEmail, cleanPhone].filter(Boolean).join(" | ");
      lines.push(`📞 Contact: ${contactInfo}`);
    }
    if (cleanPlan) {
      lines.push(`📡 Plan: ${cleanPlan}`);
    }
    if (cleanUserId) {
      lines.push(`🔑 UID: ${cleanUserId}`);
    }

    lines.push("");
    lines.push("💬 Client Message:");
    lines.push(`"${cleanMessage}"`);
    lines.push("");
    lines.push(`🕐 Time: ${timestamp} (PHT)`);
    lines.push("⚡️ Prompt: Open Admin Console -> Live Chat tab to reply in real-time!");
    lines.push("🌐 Portal: https://hotfast.online");

    const telegramText = lines.join("\n");

    const token = (process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN).trim();
    const chat = (process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID).trim();

    if (!token) {
      return res.status(200).json({
        success: true,
        message: "Message processed but Telegram bot token not configured.",
        telegramNotified: false,
      });
    }

    const tgEndpoint = `https://api.telegram.org/bot${token}/sendMessage`;
    const tgRes = await fetch(tgEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: telegramText,
        disable_web_page_preview: true,
      }),
    });

    const tgData = (await tgRes.json().catch(() => ({}))) as any;

    return res.status(200).json({
      success: true,
      message: "Live chat message received and notified to Telegram.",
      telegramNotified: Boolean(tgData?.ok),
    });
  } catch (err: any) {
    console.error("Vercel Telegram Live Chat error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error while processing Telegram notification.",
    });
  }
}
