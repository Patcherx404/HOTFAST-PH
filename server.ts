import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { initializeApp as initAdminApp, getApps as getAdminApps } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import QRCode from "qrcode";

// Authoritative Philippine Standard Time (Asia/Manila, UTC+8) Billing Utilities
const ASIA_TIMEZONE = "Asia/Manila";
const GRACE_PERIOD_HOURS = 72;
const GRACE_PERIOD_MS = GRACE_PERIOD_HOURS * 60 * 60 * 1000;

function formatToPHTDate(date: any): string {
  if (!date) return "";
  const d = date instanceof Date ? date : (date as any)?.toDate ? (date as any).toDate() : new Date(date);
  if (isNaN(d.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ASIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

function formatToPHTTime(date: any): string {
  if (!date) return "12:00 PM";
  const d = date instanceof Date ? date : (date as any)?.toDate ? (date as any).toDate() : new Date(date);
  if (isNaN(d.getTime())) return "12:00 PM";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ASIA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return formatter.format(d);
}

function formatPHTFriendly(date: any): string {
  if (!date) return "N/A";
  const d = date instanceof Date ? date : (date as any)?.toDate ? (date as any).toDate() : new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  return `${d.toLocaleString("en-US", {
    timeZone: ASIA_TIMEZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })} PHT`;
}

function parseTimeString(timeStr?: string): { hour: number; minute: number } {
  if (!timeStr) return { hour: 12, minute: 0 };
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/);
  if (!match) return { hour: 12, minute: 0 };
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  else if (meridiem === "AM" && hour === 12) hour = 0;
  return { hour, minute };
}

function parseSubscriberDueInstant(dueDateStr?: string, dueTimeStr?: string, fallbackDate?: any): Date {
  let targetDateStr = dueDateStr;
  if (!targetDateStr && fallbackDate) {
    targetDateStr = formatToPHTDate(fallbackDate);
  }
  if (!targetDateStr) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today;
  }
  let year: number;
  let month: number;
  let day: number;
  const dateMatch = targetDateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateMatch) {
    year = parseInt(dateMatch[1], 10);
    month = parseInt(dateMatch[2], 10);
    day = parseInt(dateMatch[3], 10);
  } else {
    const parsed = new Date(targetDateStr);
    if (!isNaN(parsed.getTime())) {
      const phtFormatted = formatToPHTDate(parsed);
      const m = phtFormatted.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) {
        year = parseInt(m[1], 10);
        month = parseInt(m[2], 10);
        day = parseInt(m[3], 10);
      } else {
        year = new Date().getFullYear();
        month = new Date().getMonth() + 1;
        day = new Date().getDate();
      }
    } else {
      year = new Date().getFullYear();
      month = new Date().getMonth() + 1;
      day = new Date().getDate();
    }
  }
  const { hour, minute } = parseTimeString(dueTimeStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  const isoString = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+08:00`;
  const dateObj = new Date(isoString);
  if (isNaN(dateObj.getTime())) {
    const fallback = new Date();
    fallback.setHours(12, 0, 0, 0);
    return fallback;
  }
  return dateObj;
}

function calculateNextRenewalCycle(currentDueDate?: string, currentDueTime?: string): {
  due_date: string;
  due_time: string;
  dueDateObj: Date;
} {
  const currentInstant = parseSubscriberDueInstant(currentDueDate, currentDueTime);
  const nextInstant = new Date(currentInstant.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    due_date: formatToPHTDate(nextInstant),
    due_time: formatToPHTTime(nextInstant),
    dueDateObj: nextInstant,
  };
}

function evaluateSubscriberStatus(subscriber?: any, referenceTime: Date = new Date()): any {
  const safeSubscriber = subscriber || {};
  const paymentStatus =
    safeSubscriber.payment_status ||
    (safeSubscriber.billStatus === "paid" && (safeSubscriber.balance || 0) <= 0 ? "paid" : "unpaid");
  const canonicalDueDate =
    safeSubscriber.due_date ||
    (safeSubscriber.dueDate ? formatToPHTDate(safeSubscriber.dueDate) : formatToPHTDate(new Date()));
  const canonicalDueTime = safeSubscriber.due_time || "12:00 PM";
  const dueInstant = parseSubscriberDueInstant(canonicalDueDate, canonicalDueTime, safeSubscriber.dueDate);
  const gracePeriodEnd = new Date(dueInstant.getTime() + GRACE_PERIOD_MS);
  const nowMs = referenceTime.getTime();
  const dueMs = dueInstant.getTime();
  const graceEndMs = gracePeriodEnd.getTime();
  const hasConfirmedPayment = paymentStatus === "paid";
  const isDueReached = nowMs >= dueMs;
  const isInGracePeriod = isDueReached && nowMs < graceEndMs;
  const isOverdue = isDueReached && nowMs >= graceEndMs && !hasConfirmedPayment;
  let subscription_status: "ACTIVE" | "DUE" | "OVERDUE" | "PAID";
  let statusExplanation = "";
  if (hasConfirmedPayment) {
    subscription_status = "PAID";
    statusExplanation = "Payment confirmed by administrator. Awaiting subscription renewal.";
  } else if (!isDueReached) {
    subscription_status = "ACTIVE";
    statusExplanation = `Account is active. Due on ${formatPHTFriendly(dueInstant)}.`;
  } else if (isInGracePeriod) {
    subscription_status = "DUE";
    const hoursLeft = Math.max(0, Math.ceil((graceEndMs - nowMs) / (1000 * 60 * 60)));
    statusExplanation = `Due date reached. Account in 3-day grace period (${hoursLeft}h remaining).`;
  } else {
    subscription_status = "OVERDUE";
    statusExplanation = "Account is overdue. 3-day grace period has elapsed without confirmed payment.";
  }
  return {
    subscription_status,
    payment_status: paymentStatus,
    due_date: canonicalDueDate,
    due_time: canonicalDueTime,
    dueInstant,
    gracePeriodEnd,
    isDueReached,
    isInGracePeriod,
    isOverdue,
    hasConfirmedPayment,
    remainingGraceHours: Math.max(0, Math.floor((graceEndMs - nowMs) / (1000 * 60 * 60))),
    remainingGraceMinutes: Math.max(0, Math.floor(((graceEndMs - nowMs) % (1000 * 60 * 60)) / (1000 * 60))),
    statusExplanation,
  };
}

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

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Helper function to generate standard-compliant Philippine QR Ph (Merchant-Presented Mode)
  function generateStandardQRPhPayload(amountPhp: number, accountNum: string): string {
    const pad = (id: string, val: string) => `${id}${String(val.length).padStart(2, "0")}${val}`;
    const amountStr = amountPhp.toFixed(2);
    const ref = (accountNum || `HF${Date.now()}`).slice(0, 25);
    const merchantName = "HOTFAST PH";
    const city = "MANILA";

    let p =
      pad("00", "01") +
      pad("01", "12") +
      pad("28", pad("00", "ph.gov.bsp") + pad("01", "HOTFASTPH01") + pad("02", ref)) +
      pad("52", "4814") +
      pad("53", "608") +
      pad("54", amountStr) +
      pad("58", "PH") +
      pad("59", merchantName) +
      pad("60", city) +
      pad("62", pad("01", ref)) +
      "6304";

    let crc = 0xffff;
    for (let i = 0; i < p.length; i++) {
      crc ^= p.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    return p.slice(0, -4) + "6304" + crc.toString(16).toUpperCase().padStart(4, "0");
  }

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

  // PayMongo QR Ph (Merchant-Presented Mode) Dynamic Generation Endpoint
  function getPayMongoAuthHeader(): string {
    let raw = (process.env.PAYMONGO_SECRET_KEY || process.env.PAYMONGO_AUTH_HEADER || "").trim();

    if (!raw) {
      return "";
    }

    // Strip wrapping double or single quotes
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1).trim();
    }

    // If Base64 encoded Basic header was passed, decode to extract the secret key
    if (raw.toLowerCase().startsWith("basic ")) {
      try {
        const decoded = Buffer.from(raw.slice(6).trim(), "base64").toString("utf-8");
        raw = decoded.split(":")[0];
      } catch {
        return "";
      }
    }

    // If a composite key or colon was supplied (e.g. sk:pk), extract only the secret key portion
    if (raw.includes(":")) {
      raw = raw.split(":")[0].trim();
    }

    if (!raw) return "";

    // PayMongo requires Basic authentication with username=secret_key and empty password
    return `Basic ${Buffer.from(`${raw}:`).toString("base64")}`;
  }

  const handlePayMongoGenerate = async (req: express.Request, res: express.Response) => {
    try {
      const { amount, expiry_seconds, mobile_number, notes, accountNumber } = req.body || {};
      const parsedAmount = Number(amount) || 1000;
      const safeAmount = parsedAmount > 0 ? parsedAmount : 1000;

      // PayMongo amounts are represented in centavos (e.g., 1000 PHP = 100000 centavos)
      const transactionAmount = Math.round(safeAmount * 100);
      const expirySeconds = Number(expiry_seconds) || 1800;
      const customerMobile = mobile_number || "+639122367040";
      const cleanNotes = (notes || `HOTFAST Payment for ${accountNumber || "Account"} PHP ${safeAmount}`)
        .substring(0, 50)
        .replace(/[^a-zA-Z0-9 -]/g, "");

      const authHeader = getPayMongoAuthHeader();
      let liveQrImage = "";
      let liveQrString = "";
      let liveId = "";
      let paymentIntentId = "";
      let checkoutUrl = "";
      let expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString();

      if (authHeader) {
        // Concurrently attempt 1) Dynamic QR Ph via Payment Intent and 2) Checkout Link
        const [piResult, linkResult] = await Promise.allSettled([
          (async () => {
            // Step 1: Create Payment Intent for QR Ph
            const piResp = await fetch("https://api.paymongo.com/v1/payment_intents", {
              method: "POST",
              headers: {
                accept: "application/json",
                authorization: authHeader,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                data: {
                  attributes: {
                    amount: transactionAmount,
                    payment_method_allowed: ["qrph"],
                    currency: "PHP",
                    description: cleanNotes,
                  },
                },
              }),
            });
            const piData: any = await piResp.json().catch(() => null);
            const piId = piData?.data?.id;
            if (!piId) throw new Error("Could not create payment intent");

            // Step 2: Create Payment Method for QR Ph
            const pmResp = await fetch("https://api.paymongo.com/v1/payment_methods", {
              method: "POST",
              headers: {
                accept: "application/json",
                authorization: authHeader,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                data: {
                  attributes: {
                    type: "qrph",
                    billing: {
                      name: "Hotfast Subscriber",
                      email: "support@hotfast.ph",
                      phone: customerMobile,
                    },
                  },
                },
              }),
            });
            const pmData: any = await pmResp.json().catch(() => null);
            const pmId = pmData?.data?.id;
            if (!pmId) throw new Error("Could not create QR Ph payment method");

            // Step 3: Attach Payment Method to retrieve the dynamic QR Ph image
            const attachResp = await fetch(`https://api.paymongo.com/v1/payment_intents/${piId}/attach`, {
              method: "POST",
              headers: {
                accept: "application/json",
                authorization: authHeader,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                data: {
                  attributes: {
                    payment_method: pmId,
                    return_url: "https://hotfast.ph",
                  },
                },
              }),
            });
            const attachData: any = await attachResp.json().catch(() => null);
            let code = attachData?.data?.attributes?.next_action?.code;

            // If not immediately returned in attach, poll payment intent once
            if (!code?.image_url) {
              const checkResp = await fetch(`https://api.paymongo.com/v1/payment_intents/${piId}`, {
                headers: { accept: "application/json", authorization: authHeader },
              });
              const checkData: any = await checkResp.json().catch(() => null);
              code = checkData?.data?.attributes?.next_action?.code;
            }

            if (code?.image_url) {
              return {
                piId,
                qrImage: code.image_url,
                qrId: code.id || piId,
                expiresAt: code.expires_at || new Date(Date.now() + expirySeconds * 1000).toISOString(),
              };
            }
            throw new Error("No QR image returned in payment intent attach");
          })(),

          (async () => {
            // Create PayMongo checkout link for 1-tap mobile payment
            const linkResp = await fetch("https://api.paymongo.com/v1/links", {
              method: "POST",
              headers: {
                accept: "application/json",
                authorization: authHeader,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                data: {
                  attributes: {
                    amount: transactionAmount,
                    description: cleanNotes,
                  },
                },
              }),
            });
            const linkData: any = await linkResp.json().catch(() => null);
            return linkData?.data?.attributes?.checkout_url || "";
          })(),
        ]);

        if (linkResult.status === "fulfilled" && linkResult.value) {
          checkoutUrl = linkResult.value;
        }

        if (piResult.status === "fulfilled" && piResult.value?.qrImage) {
          liveQrImage = piResult.value.qrImage;
          liveId = piResult.value.qrId;
          paymentIntentId = piResult.value.piId;
          expiresAt = piResult.value.expiresAt;
          liveQrString = checkoutUrl || liveId;
        } else {
          // Secondary fallback to /v1/qrph/generate
          try {
            const fallbackGen = await fetch("https://api.paymongo.com/v1/qrph/generate", {
              method: "POST",
              headers: {
                accept: "application/json",
                authorization: authHeader,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                data: {
                  attributes: {
                    kind: "instore",
                    amount: transactionAmount,
                    notes: cleanNotes,
                  },
                },
              }),
            });
            const fbData: any = await fallbackGen.json().catch(() => null);
            if (fallbackGen.ok && fbData?.data?.attributes?.qr_image) {
              liveQrImage = fbData.data.attributes.qr_image;
              liveId = fbData.data.id || `qr_${Date.now()}`;
              liveQrString = checkoutUrl || liveId;
            }
          } catch (_) {}
        }
      }

      // If live PayMongo QR is unavailable, use standard compliant QR Ph generator
      if (!liveQrImage) {
        const fallbackQrPayload = generateStandardQRPhPayload(safeAmount, cleanNotes || "Account");
        liveQrString = checkoutUrl || fallbackQrPayload;
        liveQrImage = await QRCode.toDataURL(fallbackQrPayload, { width: 420, margin: 2 });
        liveId = `qr_ph_${Date.now()}`;
      }

      const normalizedData = {
        id: liveId,
        payment_intent_id: paymentIntentId,
        checkout_url: checkoutUrl,
        nation: "ph",
        type: "code",
        mode: "dynamic",
        status: "active",
        transaction_currency: "PHP",
        transaction_amount: transactionAmount,
        merchant_name: "HOTFAST PH",
        merchant_mobile_number: customerMobile,
        notes: cleanNotes,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
        qr_string: liveQrString,
        qr_image: liveQrImage,
      };

      return res.status(200).json({
        success: true,
        data: normalizedData,
      });
    } catch (err: any) {
      console.error("PayMongo QR server error:", err);
      try {
        const safeAmount = Number(req.body?.amount) || 1000;
        const fallbackQrPayload = generateStandardQRPhPayload(safeAmount, "Account");
        const fallbackQrImage = await QRCode.toDataURL(fallbackQrPayload, { width: 420, margin: 2 });
        return res.status(200).json({
          success: true,
          data: {
            id: `qr_ph_${Date.now()}`,
            nation: "ph",
            type: "code",
            mode: "dynamic",
            status: "active",
            transaction_currency: "PHP",
            transaction_amount: Math.round(safeAmount * 100),
            merchant_name: "HOTFAST PH",
            notes: "HOTFAST Payment",
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 1800 * 1000).toISOString(),
            qr_string: fallbackQrPayload,
            qr_image: fallbackQrImage,
          },
        });
      } catch (fallbackErr: any) {
        return res.status(500).json({
          error: "Internal server error while generating PayMongo QR Ph code.",
          message: err?.message || String(err),
        });
      }
    }
  };

  app.post(["/api/paymongo/qr/generate", "/api/paymongo/generate"], handlePayMongoGenerate);

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

      const tgResult = await sendTelegramNotification({ text: telegramText });

      return res.status(200).json({
        success: true,
        message: "Your support request has been successfully submitted! Our Hotfast support administrator has been notified.",
        ticketId,
        telegramNotified: tgResult.success,
      });
    } catch (err: any) {
      console.error("Support submission server error:", err?.message || err);
      return res.status(500).json({
        error: "An unexpected error occurred while processing your support request. Please try again shortly.",
      });
    }
  });

  // =========================================================================
  // TELEGRAM BOT NOTIFICATIONS ENGINE (Hotfast PH)
  // For Real-Time Payment Proof Settlement & NOC System Alerts
  // =========================================================================
  interface TelegramConfig {
    botToken: string;
    chatId: string;
    enabled: boolean;
  }

  const telegramConfigFile = path.join(process.cwd(), "telegram-config.json");

  function getTelegramConfig(): TelegramConfig {
    let token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    let chat = (process.env.TELEGRAM_CHAT_ID || "8732198426").trim();
    let enabled = true;

    try {
      if (fs.existsSync(telegramConfigFile)) {
        const parsed = JSON.parse(fs.readFileSync(telegramConfigFile, "utf-8"));
        if (parsed.botToken && typeof parsed.botToken === "string") token = parsed.botToken.trim();
        if (parsed.chatId && typeof parsed.chatId === "string") chat = parsed.chatId.trim();
        if (typeof parsed.enabled === "boolean") enabled = parsed.enabled;
      }
    } catch (e) {
      // ignore read error
    }

    return { botToken: token, chatId: chat, enabled };
  }

  function saveTelegramConfig(config: Partial<TelegramConfig>): TelegramConfig {
    const current = getTelegramConfig();
    const updated: TelegramConfig = {
      botToken: typeof config.botToken === "string" ? config.botToken.trim() : current.botToken,
      chatId: typeof config.chatId === "string" ? config.chatId.trim() : current.chatId,
      enabled: typeof config.enabled === "boolean" ? config.enabled : current.enabled,
    };
    try {
      fs.writeFileSync(telegramConfigFile, JSON.stringify(updated, null, 2), "utf-8");
    } catch (e) {
      console.warn("Could not persist telegram-config.json to disk:", e);
    }
    return updated;
  }

  async function sendTelegramNotification(options: {
    text: string;
    photoUrlOrBase64?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { botToken, chatId, enabled } = getTelegramConfig();

    if (!enabled) {
      console.log("ℹ️ [Telegram Bot] Telegram notifications are currently disabled in configuration.");
      return { success: false, error: "Telegram notifications disabled in configuration." };
    }

    if (!botToken || botToken.trim() === "" || botToken === "YOUR_NEW_TELEGRAM_BOT_TOKEN") {
      console.warn("⚠️ [Telegram Bot] TELEGRAM_BOT_TOKEN is not configured. Telegram notification was skipped.");
      return { success: false, error: "TELEGRAM_BOT_TOKEN is not configured." };
    }

    const token = botToken.trim();
    const chat = chatId || "8732198426";

    // Attempt sending image photo if a screenshot/receipt proof was provided
    if (options.photoUrlOrBase64 && options.photoUrlOrBase64.trim() !== "") {
      const rawPhoto = options.photoUrlOrBase64.trim();

      // 1. Data URI base64 image (e.g. data:image/png;base64,...)
      if (rawPhoto.startsWith("data:image/")) {
        try {
          const matches = rawPhoto.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const mimeType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, "base64");
            const extension = mimeType.split("/")[1] || "jpg";
            const blob = new Blob([buffer], { type: mimeType });

            const formData = new FormData();
            formData.append("chat_id", chat);
            formData.append("photo", blob, `payment_proof_${Date.now()}.${extension}`);
            // Telegram caption limit is 1024 characters
            const caption = options.text.length > 1020 ? options.text.slice(0, 1016) + "..." : options.text;
            formData.append("caption", caption);

            const photoResp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
              method: "POST",
              body: formData,
            });
            const photoData: any = await photoResp.json().catch(() => ({}));
            if (photoResp.ok && photoData?.ok) {
              console.log(`✅ [Telegram Bot] Settlement screenshot & caption forwarded to Telegram Chat ${chat}`);
              return { success: true };
            } else {
              console.warn("⚠️ [Telegram Bot] sendPhoto returned error, attempting text fallback:", photoData?.description || photoResp.statusText);
            }
          }
        } catch (photoErr: any) {
          console.warn("⚠️ [Telegram Bot] Error uploading photo, attempting text fallback:", photoErr?.message || photoErr);
        }
      } else if (rawPhoto.startsWith("http://") || rawPhoto.startsWith("https://")) {
        // 2. Direct public image URL
        try {
          const caption = options.text.length > 1020 ? options.text.slice(0, 1016) + "..." : options.text;
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
            console.log(`✅ [Telegram Bot] Settlement screenshot (URL) forwarded to Telegram Chat ${chat}`);
            return { success: true };
          }
        } catch (photoErr: any) {
          console.warn("⚠️ [Telegram Bot] Error sending photo URL, attempting text fallback:", photoErr?.message || photoErr);
        }
      }
    }

    // Text message sending (standard or fallback)
    try {
      const textResp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chat,
          text: options.text,
        }),
      });
      const textData: any = await textResp.json().catch(() => ({}));
      if (textResp.ok && textData?.ok) {
        console.log(`✅ [Telegram Bot] Notification text sent to Telegram Chat ${chat}`);
        return { success: true };
      } else {
        console.error("❌ [Telegram Bot] Telegram sendMessage error:", textData?.description || textResp.statusText);
        return { success: false, error: textData?.description || textResp.statusText };
      }
    } catch (err: any) {
      console.error("❌ [Telegram Bot] Failed contacting Telegram API:", err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  // Client Settlement Proof Submission Telegram Alert
  app.post("/api/telegram/payment-settlement", async (req, res) => {
    try {
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
      } = req.body || {};

      const cleanName = typeof customerName === "string" && customerName.trim() ? customerName.trim() : "Subscriber";
      const cleanAccount = typeof accountNumber === "string" && accountNumber.trim() ? accountNumber.trim() : "N/A";
      const cleanClientId = typeof clientId === "string" && clientId.trim() ? clientId.trim() : "";
      const parsedAmount = Number(amount) || 0;
      const cleanMethod = typeof method === "string" && method.trim() ? method.trim() : "QR Ph (PayMongo)";
      const cleanRef = typeof referenceNumber === "string" && referenceNumber.trim() ? referenceNumber.trim() : "N/A";
      const cleanPlan = typeof planName === "string" && planName.trim() ? planName.trim() : "Fiber Internet Plan";

      // Formatted timestamp in Philippine Standard Time
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
• Note: Subscription renewal remains a separate manual admin action.

🌐 Hotfast.online Core Billing`;

      const notifyResult = await sendTelegramNotification({
        text: telegramText,
        photoUrlOrBase64: screenshotUrl,
      });

      return res.status(200).json({
        success: true,
        telegramNotified: notifyResult.success,
        error: notifyResult.error,
        message: notifyResult.success
          ? "Telegram notification dispatched successfully to Admin Bot."
          : "Settlement logged. Note: " + (notifyResult.error || "Telegram notification pending."),
      });
    } catch (err: any) {
      console.error("Error processing settlement Telegram notification:", err?.message || err);
      return res.status(500).json({
        error: "Internal error processing Telegram settlement notification.",
        message: err?.message || String(err),
      });
    }
  });

  // Get Telegram configuration status
  app.get("/api/telegram/settings", (req, res) => {
    const config = getTelegramConfig();
    const token = config.botToken;
    const masked =
      token && token.length > 8
        ? `${token.slice(0, 4)}...${token.slice(-4)}`
        : token ? "••••••••" : "";

    return res.json({
      configured: Boolean(token && token !== "YOUR_NEW_TELEGRAM_BOT_TOKEN"),
      chatId: config.chatId,
      enabled: config.enabled,
      maskedToken: masked,
    });
  });

  // Update Telegram configuration
  app.post("/api/telegram/settings", (req, res) => {
    const { botToken, chatId, enabled } = req.body || {};
    const updated = saveTelegramConfig({ botToken, chatId, enabled });
    const masked =
      updated.botToken && updated.botToken.length > 8
        ? `${updated.botToken.slice(0, 4)}...${updated.botToken.slice(-4)}`
        : updated.botToken ? "••••••••" : "";

    return res.json({
      success: true,
      configured: Boolean(updated.botToken && updated.botToken !== "YOUR_NEW_TELEGRAM_BOT_TOKEN"),
      chatId: updated.chatId,
      enabled: updated.enabled,
      maskedToken: masked,
    });
  });

  // Send a test Telegram notification to verify bot setup
  app.post("/api/telegram/test", async (req, res) => {
    const { customToken, customChatId } = req.body || {};
    const current = getTelegramConfig();
    const token = customToken || current.botToken;
    const chat = customChatId || current.chatId || "8732198426";

    if (!token || token.trim() === "" || token === "YOUR_NEW_TELEGRAM_BOT_TOKEN") {
      return res.status(400).json({
        error: "TELEGRAM_BOT_TOKEN is not configured. Please provide a valid bot token from @BotFather.",
      });
    }

    const testTime = new Date().toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "full",
      timeStyle: "medium",
    });

    const testMessage = `🤖 [HOTFAST PH] TELEGRAM BOT TEST NOTIFICATION

✅ Connection successful!
Your Telegram bot is operational and configured to receive real-time subscriber payment settlement alerts and NOC support tickets.

🕐 Philippine Time: ${testTime}
🌐 Source: Hotfast.online Core Network`;

    try {
      const resp = await fetch(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chat,
          text: testMessage,
        }),
      });

      const data: any = await resp.json().catch(() => ({}));
      if (resp.ok && data?.ok) {
        return res.json({
          success: true,
          message: `Test notification successfully delivered to Telegram Chat ${chat}!`,
        });
      } else {
        return res.status(400).json({
          error: data?.description || `Telegram API error (${resp.statusText})`,
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        error: "Failed contacting Telegram Bot API: " + (err?.message || String(err)),
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

    // 1. Try firebase-admin SDK first
    if (adminDb) {
      try {
        const snap = await adminDb.collection("users").get();
        snap.forEach((d: any) => {
          const item = { uid: d.id, ...d.data() };
          subscribers.push(item);
          inMemorySubscribers.set(d.id, item);
        });
        if (subscribers.length > 0) return subscribers;
      } catch (adminErr: any) {
        // Disable adminDb so it doesn't retry and fail repeatedly
        adminDb = null;
      }
    }

    // 2. Failsafe fallback: Firestore REST API with applet API key
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
      } catch (_) {
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

  async function runAutomatedBillingStatusCheck(): Promise<{
    checkedAt: string;
    authoritativeTimePHT: string;
    totalSubscribers: number;
    updatedCount: number;
    stats: typeof lastBillingCheckStats;
    evaluations: any[];
  }> {
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
        console.log(
          `[Billing Engine] Transition for subscriber ${sub.accountNumber || sub.uid}: ` +
          `status: ${sub.subscription_status || "NONE"} -> ${evaluation.subscription_status}, ` +
          `payment: ${sub.payment_status || "NONE"} -> ${evaluation.payment_status} ` +
          `(Due: ${evaluation.due_date} ${evaluation.due_time} PHT)`
        );

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

  // Periodic automatic status checker (runs every 30 seconds)
  setInterval(() => {
    runAutomatedBillingStatusCheck().catch((err) => {
      console.error("Automatic status checker tick error:", err);
    });
  }, 30000);

  // Initial check on server launch (after 3 seconds)
  setTimeout(() => {
    runAutomatedBillingStatusCheck().catch(console.error);
  }, 3000);

  // API Route: Billing status status & summary
  app.get("/api/billing/subscribers/status", async (req, res) => {
    const serverNow = new Date();
    res.json({
      authoritativeServerTimeUTC: serverNow.toISOString(),
      authoritativeServerTimePHT: formatPHTFriendly(serverNow),
      timezone: ASIA_TIMEZONE,
      lastCheckTime: lastBillingCheckTime ? lastBillingCheckTime.toISOString() : null,
      stats: lastBillingCheckStats,
    });
  });

  // API Route: Sync client subscriber list to in-memory registry
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

  // API Route: Run authoritative check on-demand
  app.post("/api/billing/subscribers/check", async (req, res) => {
    try {
      const result = await runAutomatedBillingStatusCheck();
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error("Manual billing check error:", err);
      res.status(500).json({ error: "Failed to run billing check", message: err?.message });
    }
  });

  // API Route: Admin manual subscription renewal
  // "Subscription renewal or extension must remain a separate manual/admin action. Only an authorized admin confirmation can trigger the subscription renewal process."
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

      // Calculate next renewal cycle (+30 days)
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

      console.log(`[Admin Action] Subscription Renewed for subscriber ${target.accountNumber || uid} until ${dueDateFinal} ${dueTimeFinal} PHT`);

      return res.json({
        success: true,
        message: `Subscription successfully renewed for ${target.displayName || uid}.`,
        renewedUntil: `${dueDateFinal} at ${dueTimeFinal} PHT`,
        updates,
      });
    } catch (err: any) {
      console.error("Renewal endpoint error:", err);
      return res.status(500).json({ error: "Renewal failed", message: err?.message });
    }
  });

  // API Route: Admin update due date & time directly
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
