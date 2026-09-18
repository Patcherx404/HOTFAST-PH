import type { VercelRequest, VercelResponse } from "../support";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const defaultAuth = "Basic c2tfbGl2ZV9EVU41YlczcGFSdzU0VWpoWGZDSGRkVGs6cGtfbGl2ZV9QdHoxZGsySDJVSlFNSjN6TVFEdjF3N1U=";
    const envKey = process.env.PAYMONGO_SECRET_KEY;
    const authHeader = envKey && envKey.trim() !== ""
      ? (envKey.startsWith("Basic ") ? envKey : `Basic ${Buffer.from(envKey.trim().endsWith(":") ? envKey.trim() : envKey.trim() + ":").toString("base64")}`)
      : defaultAuth;

    const { mobile_number, notes } = req.body || {};

    const attributes: Record<string, any> = {
      kind: "instore",
      mobile_number: typeof mobile_number === "string" && mobile_number.trim() !== "" ? mobile_number.trim() : "+639122367040",
      notes: typeof notes === "string" && notes.trim() !== "" ? notes.trim() : "HOTFAST PH Subscription Payment",
    };

    const options = {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: authHeader,
      },
      body: JSON.stringify({
        data: {
          attributes,
        },
      }),
    };

    const pmRes = await fetch("https://api.paymongo.com/v1/qrph/generate", options);
    const data: any = await pmRes.json().catch(() => ({}));

    if (!pmRes.ok) {
      console.error("PayMongo QRPh Error (Serverless):", data);
      const detailMsg = data?.errors?.[0]?.detail || data?.errors?.[0]?.code || "PayMongo code generation failed";
      return res.status(pmRes.status).json({
        error: detailMsg,
        details: data,
      });
    }

    if (data?.data?.attributes) {
      const qr = data.data.attributes.qr_image || data.data.attributes.qr_code;
      if (qr) {
        data.data.attributes.qr_image = qr;
        data.data.attributes.qr_code = qr;
      }
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error("PayMongo QRPh Serverless Error:", error);
    return res.status(500).json({ error: error?.message || "Internal server error generating QRPh code" });
  }
}
