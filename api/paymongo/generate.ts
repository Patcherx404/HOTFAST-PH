import type { VercelRequest, VercelResponse } from "../support";

function getPayMongoAuthHeader(): string {
  let raw = (process.env.PAYMONGO_AUTH_HEADER || process.env.PAYMONGO_SECRET_KEY || "").trim();

  // Strip wrapping double or single quotes if added in Vercel environment configuration
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }

  // Default fallback using live credentials provided for HOTFAST PH
  if (!raw) {
    return "Basic c2tfbGl2ZV9EVU41YlczcGFSdzU0VWpoWGZDSGRkVGs6cGtfbGl2ZV9QdHoxZGsySDJVSlFNSjN6TVFEdjF3N1U=";
  }

  // If already prefixed with Basic, extract and ensure valid base64
  if (raw.toLowerCase().startsWith("basic ")) {
    const token = raw.slice(6).trim();
    if (token.startsWith("sk_") || token.includes(":")) {
      const colonStr = token.includes(":") ? token : `${token}:`;
      return `Basic ${Buffer.from(colonStr).toString("base64")}`;
    }
    return `Basic ${token}`;
  }

  // If raw key starts with sk_ or contains a colon
  if (raw.startsWith("sk_") || raw.includes(":")) {
    const colonStr = raw.includes(":") ? raw : `${raw}:`;
    return `Basic ${Buffer.from(colonStr).toString("base64")}`;
  }

  // Check if raw is already a valid base64 encoded string
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    if (decoded.startsWith("sk_") || decoded.includes(":")) {
      return `Basic ${raw}`;
    }
  } catch {
    // Proceed to fallback encoding below
  }

  // Default: treat as secret key and base64-encode with trailing colon
  return `Basic ${Buffer.from(raw + ":").toString("base64")}`;
}

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

    const { amount, expiry_seconds, qr_image = true } = body || {};

    const parsedAmount = Number(amount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Please specify a valid payment amount in PHP (greater than 0)." });
    }

    // PayMongo amounts are represented in centavos (e.g., 1000 PHP = 100000 centavos)
    const transactionAmount = Math.round(parsedAmount * 100);
    const expirySeconds = Number(expiry_seconds) || 1800; // default 30 minutes

    const payload = {
      nation: "ph",
      mode: "p2p",
      type: "dynamic",
      transaction_currency: "PHP",
      expiry_seconds: expirySeconds,
      qr_image: Boolean(qr_image),
      transaction_amount: transactionAmount,
    };

    const authHeader = getPayMongoAuthHeader();

    const response = await fetch("https://api.paymongo.com/v3/qr/mpm/generate", {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: authHeader,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData: any = await response.json().catch(() => null);

    if (!response.ok || !responseData || !responseData.data) {
      const errorMsg =
        responseData?.errors?.[0]?.detail ||
        responseData?.errors?.[0]?.code ||
        `PayMongo QR Generation failed (${response.status} ${response.statusText})`;
      console.error("PayMongo API error in Vercel function:", responseData);
      return res.status(response.status || 502).json({
        error: errorMsg,
        details: responseData?.errors,
      });
    }

    return res.status(200).json({
      success: true,
      data: responseData.data,
    });
  } catch (err: any) {
    console.error("PayMongo QR server error in Vercel function:", err);
    return res.status(500).json({
      error: "Internal server error while generating PayMongo QR Ph code.",
      message: err?.message || String(err),
    });
  }
}

export { handler, getPayMongoAuthHeader };
