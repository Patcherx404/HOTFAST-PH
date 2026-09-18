import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import QRCode from "qrcode";

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

  // PayMongo QRPh Preflight and Generation Endpoints
  const paymongoCors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Accept,X-Requested-With");
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }
    next();
  };

  app.options(["/api/paymongo/generate-qr", "/api/paymongo-qr"], paymongoCors);

  app.all(["/api/paymongo/generate-qr", "/api/paymongo-qr"], paymongoCors, async (req, res) => {
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed. Only POST is supported." });
    }

    try {
      const defaultAuth = "Basic c2tfbGl2ZV9EVU41YlczcGFSdzU0VWpoWGZDSGRkVGs6cGtfbGl2ZV9QdHoxZGsySDJVSlFNSjN6TVFEdjF3N1U=";
      const envKey = process.env.PAYMONGO_SECRET_KEY;
      const authHeader = envKey && envKey.trim() !== ""
        ? (envKey.startsWith("Basic ") ? envKey : `Basic ${Buffer.from(envKey.trim().endsWith(":") ? envKey.trim() : envKey.trim() + ":").toString("base64")}`)
        : defaultAuth;

      const { amount, transaction_amount, speed, mobile_number, notes } = req.body || {};

      // Determine transaction amount in centavos.
      // For 50Mbps tier, user specifically set: transaction_amount: 100000 (1k PHP).
      let cents = 100000;
      if (typeof transaction_amount === "number" && transaction_amount > 0) {
        cents = Math.round(transaction_amount);
      } else if (typeof amount === "number" && amount > 0) {
        cents = Math.round(amount * 100);
      } else if (typeof amount === "string" && !isNaN(Number(amount)) && Number(amount) > 0) {
        cents = Math.round(Number(amount) * 100);
      } else if (speed === 50) {
        cents = 100000;
      }

      // 1. Primary Method (First Payment Method): PayMongo v3 MPM Dynamic QR API (embeds exact transaction_amount for auto-amount in e-wallets)
      let v3Json: any = null;
      try {
        const v3Payload = {
          nation: "ph",
          mode: "p2p",
          type: "dynamic",
          transaction_currency: "PHP",
          expiry_seconds: 1800,
          qr_image: true,
          transaction_amount: cents,
        };

        const pmRes = await fetch("https://api.paymongo.com/v3/qr/mpm/generate", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            authorization: authHeader,
          },
          body: JSON.stringify(v3Payload),
        });

        v3Json = await pmRes.json().catch(() => ({}));

        if (pmRes.ok && v3Json?.data) {
          const d = v3Json.data;
          let qrImg = d.qr_image || null;

          // If qr_image was false or not returned, generate image from qr_string using qrcode
          if (!qrImg && typeof d.qr_string === "string" && d.qr_string.trim().length > 5) {
            try {
              qrImg = await QRCode.toDataURL(d.qr_string.trim(), { width: 512, margin: 2 });
            } catch (e) {
              console.warn("Failed to generate QR image locally from qr_string:", e);
            }
          }
          if (!qrImg) {
            qrImg = "/hotfast-qrph.png";
          }

          const qrId = d.id || `QR_${Date.now().toString(36)}`;
          paymentSessions.set(qrId, {
            qrId,
            status: "processing",
            amount: cents / 100,
          });

          const normalizedResponse = {
            data: {
              ...d,
              id: qrId,
              qr_image: qrImg,
              qr_string: d.qr_string,
              attributes: {
                id: qrId,
                reference_id: qrId,
                qr_image: qrImg,
                qr_code: qrImg,
                qr_string: d.qr_string,
                amount: cents / 100,
                transaction_amount: cents,
                merchant_name: d.merchant_name || "Hotfast Ph",
                mobile_number: d.merchant_mobile_number || "+639122367040",
                credit_account_number: d.credit_account_number || "172825468953",
                notes: notes || "HOTFAST PH Subscription Payment",
                created_at: d.created_at || Math.floor(Date.now() / 1000),
                expires_at: d.expires_at || new Date(Date.now() + 1800000).toISOString(),
              },
            },
          };

          console.log(`[PayMongo MPM QRPh] Generated dynamic QR ${qrId} with auto-amount ₱${cents / 100} (${cents} cents)`);
          return res.status(200).json(normalizedResponse);
        } else {
          console.warn("PayMongo v3 MPM API response not ok, trying secondary methods:", v3Json);
        }
      } catch (mpmErr) {
        console.warn("PayMongo v3 MPM API call failed:", mpmErr);
      }

      // 2. Secondary Method: PayMongo Payment Methods + Payment Intent Flow
      try {
        const pmRes = await fetch("https://api.paymongo.com/v1/payment_methods", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            authorization: authHeader,
          },
          body: JSON.stringify({
            data: {
              attributes: {
                type: "qrph",
                expiry_seconds: 900,
              },
            },
          }),
        });

        const pmJson: any = await pmRes.json().catch(() => ({}));

        if (pmRes.ok && pmJson?.data?.id) {
          const pmId = pmJson.data.id;

          const piRes = await fetch("https://api.paymongo.com/v1/payment_intents", {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              authorization: authHeader,
            },
            body: JSON.stringify({
              data: {
                attributes: {
                  amount: cents,
                  currency: "PHP",
                  payment_method_allowed: ["qrph"],
                  description: `HOTFAST PH Subscription - ${speed ? `${speed} Mbps Tier` : "Broadband Plan"} (₱${(cents / 100).toLocaleString()})`,
                  statement_descriptor: "Hotfast Ph",
                },
              },
            }),
          });

          const piJson: any = await piRes.json().catch(() => ({}));

          if (piRes.ok && piJson?.data?.id) {
            const piId = piJson.data.id;

            const attachRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${piId}/attach`, {
              method: "POST",
              headers: {
                accept: "application/json",
                "content-type": "application/json",
                authorization: authHeader,
              },
              body: JSON.stringify({
                data: {
                  attributes: {
                    payment_method: pmId,
                    return_url: "https://localhost:3000",
                  },
                },
              }),
            });

            const attachJson: any = await attachRes.json().catch(() => ({}));

            if (attachRes.ok && attachJson?.data) {
              const nextAction = attachJson.data.attributes?.next_action;
              const consumeQr = nextAction?.consume_qr || {};
              let qrImg = consumeQr.image_url || nextAction?.image_url || null;
              const qrString = consumeQr.code || nextAction?.code || null;

              if (!qrImg && typeof qrString === "string" && qrString.trim().length > 5) {
                try {
                  qrImg = await QRCode.toDataURL(qrString.trim(), { width: 512, margin: 2 });
                } catch (e) {
                  console.warn("Could not generate QR image locally from qr_string:", e);
                }
              }
              if (!qrImg) {
                qrImg = "/hotfast-qrph.png";
              }

              // Register initial session state
              paymentSessions.set(piId, {
                qrId: piId,
                status: "processing",
                amount: cents / 100,
              });

              const normalizedResponse = {
                data: {
                  id: piId,
                  payment_intent_id: piId,
                  payment_method_id: pmId,
                  type: "payment_intent",
                  qr_image: qrImg,
                  qr_string: qrString,
                  attributes: {
                    id: piId,
                    reference_id: piId,
                    payment_method_id: pmId,
                    payment_intent_id: piId,
                    qr_image: qrImg,
                    qr_code: qrImg,
                    qr_string: qrString,
                    amount: cents / 100,
                    transaction_amount: cents,
                    merchant_name: "Hotfast Ph",
                    mobile_number: typeof mobile_number === "string" && mobile_number.trim() !== "" ? mobile_number.trim() : "+639122367040",
                    credit_account_number: "172825468953",
                    notes: notes || "HOTFAST PH Subscription Payment",
                    created_at: Math.floor(Date.now() / 1000),
                    expires_at: consumeQr.expires_at || new Date(Date.now() + 900000).toISOString(),
                  },
                },
              };

              return res.status(200).json(normalizedResponse);
            }
          }
        }
      } catch (pmErr) {
        console.warn("PayMongo payment_methods flow failed:", pmErr);
      }

      // Fallback to v1 if v3 returned error
      console.warn("PayMongo v3 MPM API error, falling back to v1:", v3Json);
      const v1Options = {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: authHeader,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              kind: "instore",
              mobile_number: typeof mobile_number === "string" && mobile_number.trim() !== "" ? mobile_number.trim() : "+639122367040",
              notes: typeof notes === "string" && notes.trim() !== "" ? notes.trim() : "HOTFAST PH Subscription Payment",
            },
          },
        }),
      };

      const fallbackRes = await fetch("https://api.paymongo.com/v1/qrph/generate", v1Options);
      const fallbackData: any = await fallbackRes.json().catch(() => ({}));

      if (!fallbackRes.ok) {
        const detailMsg = v3Json?.errors?.[0]?.detail || fallbackData?.errors?.[0]?.detail || "PayMongo code generation failed";
        return res.status(fallbackRes.status || 500).json({
          error: detailMsg,
          details: { v3: v3Json, v1: fallbackData },
        });
      }

      if (fallbackData?.data?.attributes) {
        const qr = fallbackData.data.attributes.qr_image || fallbackData.data.attributes.qr_code;
        if (qr) {
          fallbackData.data.attributes.qr_image = qr;
          fallbackData.data.attributes.qr_code = qr;
        }
      }

      return res.status(200).json(fallbackData);
    } catch (error: any) {
      console.error("PayMongo QRPh Server Error:", error);
      return res.status(500).json({ error: error?.message || "Internal server error generating QRPh code" });
    }
  });

  // Active payment state sessions registry for backend validation
  interface PaymentSessionData {
    qrId: string;
    status: "processing" | "succeeded" | "failed" | "cancelled";
    amount: number;
    paymentId?: string;
    paidAt?: string;
    planName?: string;
    errorReason?: string;
    settled?: boolean;
    settledAt?: string;
  }
  const paymentSessions = new Map<string, PaymentSessionData>();

  // Check real-time payment status from PayMongo
  app.options(["/api/paymongo/check-payment", "/api/paymongo/simulate-scan", "/api/paymongo/set-payment-status", "/api/paymongo/verify-settlement"], paymongoCors);

  // Set explicit status for testing/simulation
  app.post(["/api/paymongo/set-payment-status"], paymongoCors, async (req, res) => {
    try {
      const { qrId, status, amount, planName, errorReason } = req.body || {};
      const validStatuses = ["processing", "succeeded", "failed", "cancelled"];
      const targetStatus = validStatuses.includes(status) ? status : "processing";
      const key = (qrId || "default").toString().trim();
      
      const session: PaymentSessionData = paymentSessions.get(key) || {
        qrId: key,
        status: targetStatus,
        amount: Number(amount) || 1000,
      };

      session.status = targetStatus;
      if (amount) session.amount = Number(amount);
      if (planName) session.planName = planName;
      if (targetStatus === "succeeded") {
        session.paymentId = session.paymentId || `pay_pm_${Date.now().toString(36).toUpperCase()}`;
        session.paidAt = new Date().toISOString();
        session.errorReason = undefined;
      } else if (targetStatus === "failed") {
        session.errorReason = errorReason || "Transaction declined by issuing bank or network timeout.";
      } else if (targetStatus === "cancelled") {
        session.errorReason = errorReason || "Payment session was cancelled by user.";
      }

      paymentSessions.set(key, session);

      return res.status(200).json({
        success: true,
        session,
        status: session.status,
        canSettle: session.status === "succeeded" && !session.settled,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to set status" });
    }
  });

  // Check real-time payment status
  app.all(["/api/paymongo/check-payment"], paymongoCors, async (req, res) => {
    try {
      const defaultAuth = "Basic c2tfbGl2ZV9EVU41YlczcGFSdzU0VWpoWGZDSGRkVGs6cGtfbGl2ZV9QdHoxZGsySDJVSlFNSjN6TVFEdjF3N1U=";
      const envKey = process.env.PAYMONGO_SECRET_KEY;
      const authHeader = envKey && envKey.trim() !== ""
        ? (envKey.startsWith("Basic ") ? envKey : `Basic ${Buffer.from(envKey.trim().endsWith(":") ? envKey.trim() : envKey.trim() + ":").toString("base64")}`)
        : defaultAuth;

      const qrId = (req.query.qrId || req.body?.qrId || "").toString().trim();
      const amountVal = Number(req.query.amount || req.body?.amount || 0);
      const targetCents = amountVal > 0 ? (amountVal > 5000 ? amountVal : Math.round(amountVal * 100)) : 100000;

      // 1. Check if an active session state exists in memory (e.g. simulated or previously registered)
      const existingSession = qrId ? paymentSessions.get(qrId) : null;
      if (existingSession && existingSession.status !== "processing") {
        return res.status(200).json({
          status: existingSession.status,
          paid: existingSession.status === "succeeded",
          paymentId: existingSession.paymentId,
          amount: existingSession.amount,
          paidAt: existingSession.paidAt,
          canSettle: existingSession.status === "succeeded" && !existingSession.settled,
          settled: !!existingSession.settled,
          errorReason: existingSession.errorReason,
          message: existingSession.status === "succeeded"
            ? "Payment Successful"
            : existingSession.status === "failed"
            ? "Payment Failed"
            : existingSession.status === "cancelled"
            ? "Payment Cancelled"
            : "Processing Payment...",
        });
      }

      // 2. Direct check for PayMongo Payment Intent ID (starts with "pi_")
      if (qrId && qrId.startsWith("pi_")) {
        try {
          const piRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${encodeURIComponent(qrId)}`, {
            method: "GET",
            headers: {
              accept: "application/json",
              authorization: authHeader,
            },
          });
          if (piRes.ok) {
            const piJson: any = await piRes.json().catch(() => ({}));
            const piAttrs = piJson?.data?.attributes || {};
            const piStatus = piAttrs.status;

            if (piStatus === "succeeded") {
              const paymentObj = piAttrs.payments?.[0];
              const paymentId = paymentObj?.id || `pay_${qrId.slice(3)}`;
              const finalAmt = (piAttrs.amount || targetCents) / 100;
              const paidAt = paymentObj?.attributes?.paid_at
                ? new Date(paymentObj.attributes.paid_at * 1000).toISOString()
                : new Date().toISOString();

              const session: PaymentSessionData = {
                qrId,
                status: "succeeded",
                amount: finalAmt,
                paymentId,
                paidAt,
              };
              paymentSessions.set(qrId, session);
              paymentSessions.set(paymentId, session);

              return res.status(200).json({
                status: "succeeded",
                paid: true,
                canSettle: true,
                settled: false,
                paymentId,
                amount: finalAmt,
                paidAt,
                payment: paymentObj,
                message: "Payment Successful",
              });
            } else if (piStatus === "cancelled") {
              return res.status(200).json({
                status: "cancelled",
                paid: false,
                canSettle: false,
                message: "Payment Cancelled",
              });
            } else {
              // Status is "awaiting_next_action" or "processing" - user hasn't completed scan/payment yet
              return res.status(200).json({
                status: "processing",
                paid: false,
                canSettle: false,
                settled: false,
                message: "Processing Payment...",
                checkedQrId: qrId,
              });
            }
          }
        } catch (piErr) {
          console.warn("Payment intent direct status check notice:", piErr);
        }
      }

      // 3. Query PayMongo payments list for real gateway transaction
      const pmRes = await fetch("https://api.paymongo.com/v1/payments?limit=25", {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: authHeader,
        },
      });

      if (pmRes.ok) {
        const json: any = await pmRes.json().catch(() => ({}));
        const payments: any[] = json.data || [];

        // Search for a matching paid payment:
        // 1. Exact or substring match on qrId
        let match = payments.find((p) => {
          const attrs = p?.attributes || {};
          const codeId = attrs.source?.provider?.code_id;
          const providerId = attrs.source?.provider?.id || attrs.source?.provider_id;
          const refNum = attrs.external_reference_number;
          const pid = p.id;
          if (qrId) {
            if (pid === qrId || (codeId && (codeId === qrId || codeId.includes(qrId) || qrId.includes(codeId)))) return true;
            if (providerId && (providerId === qrId || providerId.includes(qrId) || qrId.includes(providerId))) return true;
            if (refNum && (refNum === qrId || refNum.includes(qrId))) return true;
            if (typeof attrs.description === "string" && attrs.description.includes(qrId)) return true;
          }
          return false;
        });

        // 2. Match by explicit reference or paymentId query param IF explicitly supplied
        const queryRef = (req.query.ref || req.query.paymentId || req.body?.ref || req.body?.paymentId || "").toString().trim();
        if (!match && queryRef) {
          match = payments.find((p) => {
            const attrs = p?.attributes || {};
            const codeId = attrs.source?.provider?.code_id;
            const providerId = attrs.source?.provider?.id || attrs.source?.provider_id;
            const refNum = attrs.external_reference_number;
            return p.id === queryRef || codeId === queryRef || providerId === queryRef || refNum === queryRef || (attrs.description && attrs.description.includes(queryRef));
          });
        }

        if (match) {
          const rawStatus = match.attributes?.status;
          let calculatedStatus: "succeeded" | "failed" | "cancelled" | "processing" = "processing";
          if (rawStatus === "paid") calculatedStatus = "succeeded";
          else if (rawStatus === "failed") calculatedStatus = "failed";
          else if (rawStatus === "cancelled" || rawStatus === "expired") calculatedStatus = "cancelled";

          const finalAmt = amountVal > 0 
            ? amountVal 
            : (match.attributes.amount && match.attributes.amount >= 10000 ? match.attributes.amount / 100 : 1000);

          const session: PaymentSessionData = {
            qrId: qrId || match.attributes?.source?.provider?.code_id || match.id,
            status: calculatedStatus,
            amount: finalAmt,
            paymentId: match.id,
            paidAt: match.attributes.paid_at ? new Date(match.attributes.paid_at * 1000).toISOString() : new Date().toISOString(),
          };

          // Register under active qrId and paymentId to ensure seamless frontend and settlement validation
          if (qrId) paymentSessions.set(qrId, session);
          if (match.id) paymentSessions.set(match.id, session);
          if (match.attributes?.source?.provider?.code_id) {
            paymentSessions.set(match.attributes.source.provider.code_id, session);
          }

          return res.status(200).json({
            status: calculatedStatus,
            paid: calculatedStatus === "succeeded",
            canSettle: calculatedStatus === "succeeded" && !session.settled,
            settled: !!session.settled,
            paymentId: session.paymentId,
            amount: session.amount,
            paidAt: session.paidAt,
            payment: match,
            message: calculatedStatus === "succeeded" ? "Payment Successful" : "Processing Payment...",
          });
        }
      }

      // Default: currently processing / awaiting scan
      const currentSession: PaymentSessionData = existingSession || {
        qrId,
        status: "processing",
        amount: amountVal || 1000,
      };
      if (qrId) paymentSessions.set(qrId, currentSession);

      return res.status(200).json({
        status: "processing",
        paid: false,
        canSettle: false,
        settled: false,
        message: "Processing Payment...",
        checkedQrId: qrId,
      });
    } catch (err: any) {
      console.error("Check payment error:", err);
      return res.status(500).json({ status: "processing", paid: false, error: err.message, canSettle: false });
    }
  });

  // Verify settlement gate (MUST be verified before settlement executes)
  app.post(["/api/paymongo/verify-settlement"], paymongoCors, async (req, res) => {
    try {
      const { qrId, paymentId, amount, userId } = req.body || {};
      const key = (qrId || "").toString().trim();
      const session = key ? paymentSessions.get(key) : null;

      // Check if session has already been settled
      if (session && session.settled) {
        return res.status(409).json({
          allowed: false,
          error: "Duplicate settlement blocked. Settlement has already been processed for this payment.",
          alreadySettled: true,
          settledAt: session.settledAt,
        });
      }

      // Check if status is verified succeeded
      let isSucceeded = session?.status === "succeeded";
      if (!isSucceeded && paymentId && paymentId.startsWith("pay_")) {
        try {
          const defaultAuth = "Basic c2tfbGl2ZV9EVU41YlczcGFSdzU0VWpoWGZDSGRkVGs6cGtfbGl2ZV9QdHoxZGsySDJVSlFNSjN6TVFEdjF3N1U=";
          const envKey = process.env.PAYMONGO_SECRET_KEY;
          const authHeader = envKey && envKey.trim() !== ""
            ? (envKey.startsWith("Basic ") ? envKey : `Basic ${Buffer.from(envKey.trim().endsWith(":") ? envKey.trim() : envKey.trim() + ":").toString("base64")}`)
            : defaultAuth;

          const pmCheck = await fetch(`https://api.paymongo.com/v1/payments/${encodeURIComponent(paymentId)}`, {
            headers: { accept: "application/json", authorization: authHeader },
          });
          if (pmCheck.ok) {
            const checkData: any = await pmCheck.json();
            if (checkData?.data?.attributes?.status === "paid") {
              isSucceeded = true;
            }
          }
        } catch (e) {
          console.warn("Direct PayMongo check error:", e);
        }
      }

      if (!isSucceeded) {
        return res.status(400).json({
          allowed: false,
          status: session?.status || "processing",
          error: "Payment status is not confirmed as 'Payment Successful'. Settlement is prohibited.",
        });
      }

      // Mark session as settled to prevent duplicates
      if (session) {
        session.settled = true;
        session.settledAt = new Date().toISOString();
        paymentSessions.set(key, session);
      }

      return res.status(200).json({
        allowed: true,
        status: "succeeded",
        paymentId: session?.paymentId || paymentId || `pay_pm_${Date.now().toString(36).toUpperCase()}`,
        amount: session?.amount || Number(amount) || 1000,
        paidAt: session?.paidAt || new Date().toISOString(),
        message: "Settlement authorized and locked.",
      });
    } catch (err: any) {
      return res.status(500).json({ allowed: false, error: err.message });
    }
  });

  app.post(["/api/paymongo/simulate-scan"], paymongoCors, async (req, res) => {
    const { qrId, amount, planName } = req.body || {};
    const key = (qrId || "default").toString().trim();
    const ref = `pay_pm_${Date.now().toString(36).toUpperCase()}`;
    const session: PaymentSessionData = {
      qrId: key,
      status: "succeeded",
      amount: Number(amount) || 1000,
      planName: planName || "Lite Fiber 50 Mbps",
      paymentId: ref,
      paidAt: new Date().toISOString(),
      settled: false,
    };
    paymentSessions.set(key, session);

    return res.status(200).json({
      status: "succeeded",
      paid: true,
      canSettle: true,
      settled: false,
      simulated: true,
      paymentId: ref,
      amount: session.amount,
      planName: session.planName,
      paidAt: session.paidAt,
      message: "Payment Successful",
    });
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
