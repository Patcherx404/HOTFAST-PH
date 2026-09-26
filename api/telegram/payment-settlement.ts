// Telegram Settlement Proof Notification Serverless Function for Vercel (/api/telegram/payment-settlement)

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

    const {
      customerName,
      accountNumber,
      clientId,
      amount,
      method,
      referenceNumber,
      planName,
      screenshotUrl,
      submittedAt,
      paymentId,
    } = body || {};

    const token = (process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN).trim();
    const chat = (process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID).trim();

    if (!token) {
      return res.status(500).json({
        success: false,
        error: "TELEGRAM_BOT_TOKEN is not configured.",
      });
    }

    const cleanName = typeof customerName === "string" && customerName.trim() ? customerName.trim() : "Subscriber";
    const cleanAccount = typeof accountNumber === "string" && accountNumber.trim() ? accountNumber.trim() : "N/A";
    const cleanClientId = typeof clientId === "string" && clientId.trim() ? clientId.trim() : "";
    const parsedAmount = Number(amount) || 0;
    const cleanMethod = typeof method === "string" && method.trim() ? method.trim() : "QR Ph";
    const cleanRef = typeof referenceNumber === "string" && referenceNumber.trim() ? referenceNumber.trim() : "N/A";
    const cleanPlan = typeof planName === "string" && planName.trim() ? planName.trim() : "Fiber Internet Plan";

    const phtTimestamp = submittedAt
      ? new Date(submittedAt).toLocaleString("en-PH", {
          timeZone: "Asia/Manila",
          dateStyle: "medium",
          timeStyle: "short",
        })
      : new Date().toLocaleString("en-PH", {
          timeZone: "Asia/Manila",
          dateStyle: "medium",
          timeStyle: "short",
        });

    const formattedAmount = `₱${parsedAmount.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

    const telegramText = `⚡️ [HOTFAST PH] PENDING SETTLEMENT SUBMITTED ⚡️

👤 Customer: ${cleanName}
🆔 Account No: #${cleanAccount}${cleanClientId ? `\n🏷 Client ID: ${cleanClientId}` : ""}
📦 Plan: ${cleanPlan}
💰 Amount: ${formattedAmount}
💳 Method: ${cleanMethod}
🔖 Reference ID: ${cleanRef}
${paymentId ? `🗂 Payment ID: ${paymentId}\n` : ""}🕐 Submitted (PHT): ${phtTimestamp}
⏳ Status: Waiting for Admin Confirmation

⚠️ ACTION REQUIRED:
• Customer has submitted payment proof screenshot.
• Review proof in Hotfast Admin Console -> Pending Settlement.
• Click [Confirm Settlement] to finalize payment or [Reject Payment].

🌐 Hotfast.online Core Billing`;

    let telegramSent = false;
    let errorDetail = "";

    // 1. If screenshot proof is provided, try sending via sendPhoto
    if (screenshotUrl && typeof screenshotUrl === "string" && screenshotUrl.trim() !== "") {
      const rawPhoto = screenshotUrl.trim();

      if (rawPhoto.startsWith("data:image/")) {
        try {
          const commaIdx = rawPhoto.indexOf(",");
          if (commaIdx !== -1) {
            const headerPart = rawPhoto.substring(0, commaIdx);
            const mimeMatch = headerPart.match(/^data:([^;]+);base64/);
            const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
            const base64Data = rawPhoto.substring(commaIdx + 1).replace(/\s+/g, "");
            const buffer = Buffer.from(base64Data, "base64");
            const extension = mimeType.split("/")[1]?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
            const blob = new Blob([buffer], { type: mimeType });

            const formData = new FormData();
            formData.append("chat_id", chat);
            formData.append("photo", blob, `payment_proof_${Date.now()}.${extension}`);
            const caption = telegramText.length > 1020 ? telegramText.slice(0, 1016) + "..." : telegramText;
            formData.append("caption", caption);

            const photoResp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
              method: "POST",
              body: formData,
            });
            const photoData: any = await photoResp.json().catch(() => ({}));
            if (photoResp.ok && photoData?.ok) {
              telegramSent = true;
            } else {
              errorDetail = photoData?.description || photoResp.statusText;
            }
          }
        } catch (photoErr: any) {
          errorDetail = photoErr?.message || String(photoErr);
        }
      } else if (rawPhoto.startsWith("http://") || rawPhoto.startsWith("https://")) {
        try {
          const caption = telegramText.length > 1020 ? telegramText.slice(0, 1016) + "..." : telegramText;
          const photoResp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chat,
              photo: rawPhoto,
              caption,
            }),
          });
          const photoData: any = await photoResp.json().catch(() => ({}));
          if (photoResp.ok && photoData?.ok) {
            telegramSent = true;
          } else {
            errorDetail = photoData?.description || photoResp.statusText;
          }
        } catch (photoErr: any) {
          errorDetail = photoErr?.message || String(photoErr);
        }
      }
    }

    // 2. If photo was not sent (or failed), fallback to sendMessage text
    if (!telegramSent) {
      try {
        const textResp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chat,
            text: telegramText,
          }),
        });
        const textData: any = await textResp.json().catch(() => ({}));
        if (textResp.ok && textData?.ok) {
          telegramSent = true;
        } else {
          errorDetail = textData?.description || textResp.statusText;
        }
      } catch (textErr: any) {
        errorDetail = textErr?.message || String(textErr);
      }
    }

    return res.status(200).json({
      success: true,
      telegramNotified: telegramSent,
      error: errorDetail || undefined,
      message: telegramSent
        ? "Telegram bot notified successfully of settlement submission."
        : "Settlement recorded, but Telegram bot could not be reached: " + errorDetail,
    });
  } catch (err: any) {
    console.error("Vercel Telegram settlement error:", err);
    return res.status(500).json({
      error: "Internal server error while dispatching Telegram notification.",
      message: err?.message || String(err),
    });
  }
}
