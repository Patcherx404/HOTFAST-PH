import type { VercelRequest, VercelResponse } from "../support";

const PAYMONGO_AUTH =
  process.env.PAYMONGO_AUTH_HEADER ||
  (process.env.PAYMONGO_SECRET_KEY
    ? `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY + ":").toString("base64")}`
    : "Basic c2tfbGl2ZV9EVU41YlczcGFSdzU0VWpoWGZDSGRkVGs6cGtfbGl2ZV9QdHoxZGsySDJVSlFNSjN6TVFEdjF3N1U=");

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
    const { amount, expiry_seconds, qr_image = true } = req.body || {};

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

    const response = await fetch("https://api.paymongo.com/v3/qr/mpm/generate", {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: PAYMONGO_AUTH,
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
      console.error("PayMongo API error:", responseData);
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
    console.error("PayMongo QR server error:", err);
    return res.status(500).json({
      error: "Internal server error while generating PayMongo QR Ph code.",
      message: err?.message || String(err),
    });
  }
}
