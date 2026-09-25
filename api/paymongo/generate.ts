// PayMongo v1/qrph/generate API Serverless Function for Vercel

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

    const { amount, expiry_seconds, mobile_number, notes } = body || {};

    const parsedAmount = Number(amount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Please specify a valid payment amount in PHP (greater than 0)." });
    }

    // PayMongo amounts are represented in centavos (e.g., 1000 PHP = 100000 centavos)
    const transactionAmount = Math.round(parsedAmount * 100);
    const expirySeconds = Number(expiry_seconds) || 1800; // default 30 minutes
    const customerMobile = mobile_number || "+639122367040";
    const paymentNotes = notes || `HOTFAST Payment PHP ${parsedAmount}`;

    const payload = {
      data: {
        attributes: {
          kind: "instore",
          mobile_number: customerMobile,
          amount: transactionAmount,
          notes: paymentNotes,
        },
      },
    };

    const authHeader = getPayMongoAuthHeader();
    if (!authHeader) {
      return res.status(500).json({
        error: "PAYMONGO_SECRET_KEY is not configured in environment variables.",
      });
    }

    const response = await fetch("https://api.paymongo.com/v1/qrph/generate", {
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

    const attributes = responseData.data.attributes || {};

    // Normalize into unified PayMongo QR response expected by the client
    const normalizedData = {
      id: responseData.data.id || attributes.reference_id || `qr_${Date.now()}`,
      nation: "ph",
      type: responseData.data.type || "code",
      mode: attributes.kind || "instore",
      status: attributes.status || "active",
      transaction_currency: "PHP",
      transaction_amount: transactionAmount,
      merchant_name: attributes.name || "Hotfast Ph",
      merchant_mobile_number: attributes.mobile_number || customerMobile,
      notes: attributes.notes || paymentNotes,
      created_at: attributes.created_at || new Date().toISOString(),
      expires_at: new Date(Date.now() + expirySeconds * 1000).toISOString(),
      qr_string: attributes.reference_id || responseData.data.id,
      qr_image: attributes.qr_image || "",
    };

    return res.status(200).json({
      success: true,
      data: normalizedData,
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
