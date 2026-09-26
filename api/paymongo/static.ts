// PayMongo Static QR Ph API Serverless Function for Vercel (/api/paymongo/static)
import { VercelRequest, VercelResponse, getPayMongoAuthHeader } from "./generate";

// Module-level in-memory cache and in-flight promise to guarantee ONLY 1 request to PayMongo
let vercelCachedStaticQR: any = null;
let vercelStaticQRPromise: Promise<any> | null = null;

export default async function staticQrHandler(req: VercelRequest, res: VercelResponse) {
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

  // If already fetched and cached, return immediately (0 additional PayMongo requests)
  if (vercelCachedStaticQR) {
    return res.status(200).json({
      success: true,
      data: vercelCachedStaticQR,
      cached: true,
    });
  }

  try {
    const authHeader = getPayMongoAuthHeader();
    if (!authHeader) {
      return res.status(500).json({
        error: "PAYMONGO_SECRET_KEY is not configured.",
      });
    }

    const customerMobile = "+639122367040";
    const paymentNotes = "HOTFAST PH Static Merchant QR";

    const payload = {
      data: {
        attributes: {
          kind: "instore",
          mobile_number: customerMobile,
          notes: paymentNotes,
        },
      },
    };

    // Deduplicate in-flight concurrent requests into a single network call
    if (!vercelStaticQRPromise) {
      vercelStaticQRPromise = (async () => {
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
            `PayMongo Static QR Generation failed (${response.status} ${response.statusText})`;
          throw new Error(errorMsg);
        }

        const resAttrs = responseData.data.attributes || {};

        return {
          id: responseData.data.id || resAttrs.reference_id || `qr_static_${Date.now()}`,
          nation: "ph",
          type: "static",
          mode: "static",
          status: resAttrs.status || "active",
          transaction_currency: "PHP",
          transaction_amount: 0,
          merchant_name: resAttrs.name || "Hotfast Ph",
          merchant_mobile_number: resAttrs.mobile_number || customerMobile,
          notes: resAttrs.notes || paymentNotes,
          created_at: resAttrs.created_at || new Date().toISOString(),
          expires_at: null, // Static QR Ph never expires
          qr_string: resAttrs.reference_id || responseData.data.id,
          qr_image: resAttrs.qr_image || "",
        };
      })();
    }

    const staticResult = await vercelStaticQRPromise;
    vercelStaticQRPromise = null;
    vercelCachedStaticQR = staticResult;

    return res.status(200).json({
      success: true,
      data: staticResult,
    });
  } catch (err: any) {
    vercelStaticQRPromise = null;
    console.error("PayMongo Static QR server error in Vercel function:", err);
    return res.status(500).json({
      error: "Internal server error while generating PayMongo Static QR Ph code.",
      message: err?.message || String(err),
    });
  }
}
