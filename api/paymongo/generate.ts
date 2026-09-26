// PayMongo v1/qrph/generate API Serverless Function for Vercel (/api/paymongo/generate)

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
  let raw = (
    process.env.PAYMONGO_SECRET_KEY ||
    process.env.PAYMONGO_AUTH_HEADER ||
    "sk_live_DUN5bW3paRw54UjhXfCHddTk"
  ).trim();

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

// Module-level in-memory cache and in-flight promise for static QR Ph
let cachedStaticQR: any = null;
let staticQRPromise: Promise<any> | null = null;

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

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const { amount, expiry_seconds, mobile_number, notes, mode, is_static, type } = body || {};

    const isStatic =
      mode === "static" ||
      is_static === true ||
      type === "static" ||
      amount === 0 ||
      amount === "static";

    // Fast-path for Static QR: return cached static QR (only 1 request to PayMongo ever made)
    if (isStatic && cachedStaticQR) {
      return res.status(200).json({
        success: true,
        data: cachedStaticQR,
        cached: true,
      });
    }

    const parsedAmount = Number(amount);
    const transactionAmount = !isStatic && parsedAmount > 0 ? Math.round(parsedAmount * 100) : 0;
    const expirySeconds = Number(expiry_seconds) || 1800;
    const customerMobile = mobile_number || "+639122367040";
    const paymentNotes = notes || (isStatic ? "HOTFAST PH Static Merchant QR" : `HOTFAST Payment PHP ${parsedAmount}`);

    const attributes: Record<string, any> = {
      kind: "instore",
      mobile_number: customerMobile,
      notes: paymentNotes,
    };

    if (!isStatic && transactionAmount > 0) {
      attributes.amount = transactionAmount;
    }

    const payload = {
      data: {
        attributes,
      },
    };

    const authHeader = getPayMongoAuthHeader();
    if (!authHeader) {
      return res.status(500).json({
        error: "PAYMONGO_SECRET_KEY is not configured.",
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

    const resAttrs = responseData.data.attributes || {};

    const normalizedData = {
      id: responseData.data.id || resAttrs.reference_id || `qr_${Date.now()}`,
      nation: "ph",
      type: isStatic ? "static" : (responseData.data.type || "code"),
      mode: isStatic ? "static" : (resAttrs.kind || "instore"),
      status: resAttrs.status || "active",
      transaction_currency: "PHP",
      transaction_amount: transactionAmount,
      merchant_name: resAttrs.name || "Hotfast Ph",
      merchant_mobile_number: resAttrs.mobile_number || customerMobile,
      notes: resAttrs.notes || paymentNotes,
      created_at: resAttrs.created_at || new Date().toISOString(),
      expires_at: isStatic ? null : new Date(Date.now() + expirySeconds * 1000).toISOString(),
      qr_string: resAttrs.reference_id || responseData.data.id,
      qr_image: resAttrs.qr_image || "",
    };

    if (isStatic) {
      cachedStaticQR = normalizedData;
    }

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
