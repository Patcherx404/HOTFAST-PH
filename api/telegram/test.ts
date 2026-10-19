// Telegram Test Notification Serverless Function for Vercel (/api/telegram/test)

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

    const token = (body?.botToken || process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN).trim();
    const chat = (body?.chatId || process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID).trim();

    if (!token) {
      return res.status(400).json({ error: "Bot Token is required." });
    }

    const testMessage = `🤖 [HOTFAST PH] TEST TELEGRAM NOTIFICATION\n\n✅ Your Hotfast Telegram bot is successfully connected!\n\nYou will receive instant alerts for:\n💬 Live Chat inquiries from clients\n💳 Pending customer payment settlement receipts\n\n🕐 Timestamp: ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (PHT)\n🌐 Portal: https://hotfast.online`;

    const tgEndpoint = `https://api.telegram.org/bot${token}/sendMessage`;
    const tgRes = await fetch(tgEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: testMessage,
        disable_web_page_preview: true,
      }),
    });

    const tgData = (await tgRes.json().catch(() => ({}))) as any;

    if (!tgData.ok) {
      return res.status(400).json({
        error: `Telegram API error: ${tgData.description || "Failed to deliver message."}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Test message sent successfully to your Telegram!",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to send test message." });
  }
}
