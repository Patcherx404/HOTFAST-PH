// Telegram Settings Serverless Function for Vercel (/api/telegram/settings)

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

  const token = (process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN).trim();
  const chat = (process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID).trim();

  if (req.method === "GET") {
    const masked = token ? `${token.substring(0, 6)}...${token.slice(-4)}` : "";
    return res.status(200).json({
      configured: Boolean(token && chat),
      chatId: chat,
      maskedToken: masked,
      notificationsEnabled: true,
    });
  }

  if (req.method === "POST") {
    return res.status(200).json({
      success: true,
      message: "Telegram configuration active.",
      configured: true,
    });
  }

  return res.status(405).json({ error: "Method not allowed." });
}
