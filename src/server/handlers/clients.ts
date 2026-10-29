/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Serverless request and response types compatible with Vercel and Node.js
export interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body: any;
  socket?: {
    remoteAddress?: string;
  };
}

export interface VercelResponse {
  setHeader(name: string, value: string): VercelResponse;
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
  end(): VercelResponse;
}

export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-admin-key"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // Read Firestore config
    let firebaseConfig: any = {};
    try {
      const fs = await import("fs");
      const path = await import("path");
      const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      }
    } catch {
      // fallback
    }

    const projectId = firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID;
    const apiKey = firebaseConfig.apiKey || process.env.FIREBASE_API_KEY;
    const dbId = firebaseConfig.firestoreDatabaseId || "(default)";

    let subscribers: any[] = [];

    if (projectId && apiKey) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/users?key=${apiKey}&pageSize=300`;
        const resp = await fetch(url);
        if (resp.ok) {
          const json: any = await resp.json();
          const documents = json.documents || [];
          for (const d of documents) {
            const pathParts = d.name.split("/");
            const uid = pathParts[pathParts.length - 1];
            const fields = d.fields || {};
            subscribers.push({
              uid,
              accountNumber: fields.accountNumber?.stringValue || "",
              clientId: fields.clientId?.stringValue || "",
              apiKey: fields.apiKey?.stringValue || "",
              displayName: fields.displayName?.stringValue || "",
              email: fields.email?.stringValue || "",
              phone: fields.phone?.stringValue || "",
              address: fields.address?.stringValue || "",
              balance: Number(fields.balance?.integerValue || fields.balance?.doubleValue || 0),
              billStatus: fields.billStatus?.stringValue || "active",
              status: fields.status?.stringValue || "active",
              due_date: fields.due_date?.stringValue || "",
              due_time: fields.due_time?.stringValue || "12:00 PM",
              payment_status: fields.payment_status?.stringValue || "unpaid",
              subscription_status: fields.subscription_status?.stringValue || "ACTIVE",
              dueDate: fields.dueDate?.timestampValue || fields.dueDate?.stringValue,
              currentPlanId: fields.currentPlanId?.stringValue || "",
            });
          }
        }
      } catch (fetchErr) {
        console.warn("Firestore REST fetch error in api/clients:", fetchErr);
      }
    }

    const q = (req.query || {}) as Record<string, string>;
    const apiKeyProvided =
      (req.headers["x-api-key"] as string) ||
      (req.headers["authorization"] ? String(req.headers["authorization"]).replace(/^Bearer\s+/i, "") : "") ||
      q.api_key ||
      q.apiKey ||
      q.token ||
      q.key;

    const singleTarget =
      q.identifier ||
      q.client_id ||
      q.clientId ||
      q.accountNumber ||
      q.account_number ||
      q.username ||
      q.user ||
      (req.headers["x-client-id"] as string);

    const formatClientResponse = (client: any) => {
      const isSuspended = client.status === "suspended";
      const isExpired =
        client.subscription_status === "EXPIRED" ||
        client.subscription_status === "OVERDUE" ||
        isSuspended;
      const isActive =
        (client.subscription_status === "ACTIVE" ||
          client.billStatus === "paid" ||
          client.status === "active") &&
        !isSuspended;
      const effectiveStatus = isActive ? "active" : "suspended";
      const expiryDate = client.due_date || "";
      const expiryTime = client.due_time || "12:00 PM";
      const expiryString = expiryDate ? `${expiryDate} ${expiryTime}` : "";

      const keyMatches =
        !client.apiKey ||
        !apiKeyProvided ||
        client.apiKey.trim() === String(apiKeyProvided).trim();

      return {
        success: true,
        code: 200,
        status: effectiveStatus,
        active: isActive,
        is_active: isActive,
        expired: isExpired,
        is_expired: isExpired,
        authenticated: keyMatches,
        clientId: client.clientId || client.accountNumber || "",
        client_id: client.clientId || client.accountNumber || "",
        accountNumber: client.accountNumber || "",
        account_number: client.accountNumber || "",
        displayName: client.displayName || "",
        name: client.displayName || "",
        username: client.clientId || client.accountNumber || client.email || "",
        email: client.email || "",
        due_date: expiryDate,
        due_time: expiryTime,
        dueDate: client.dueDate || "",
        expiry: expiryString,
        expiry_date: expiryDate,
        expiry_time: expiryTime,
        expiration: expiryString,
        subscription_status: client.subscription_status || (isActive ? "ACTIVE" : "DUE"),
        payment_status: client.payment_status || "unpaid",
        billStatus: client.billStatus || (isActive ? "paid" : "due"),
        balance: client.balance || 0,
        currentPlanId: client.currentPlanId || "",
        plan: client.currentPlanId || "Standard",
        client: {
          ...client,
          status: effectiveStatus,
          active: isActive,
          due_date: expiryDate,
          due_time: expiryTime,
        },
        data: {
          ...client,
          status: effectiveStatus,
          active: isActive,
          due_date: expiryDate,
          due_time: expiryTime,
        },
      };
    };

    if (singleTarget) {
      const targetClean = singleTarget.trim().toLowerCase();
      const match = subscribers.find((s) => {
        if (!s) return false;
        return (
          s.uid?.toLowerCase() === targetClean ||
          s.accountNumber?.trim().toLowerCase() === targetClean ||
          s.clientId?.trim().toLowerCase() === targetClean ||
          s.email?.trim().toLowerCase() === targetClean
        );
      });

      if (!match) {
        return res.status(404).json({
          success: false,
          code: 404,
          status: "not_found",
          error: "Client not found",
          identifier: singleTarget,
        });
      }
      return res.status(200).json(formatClientResponse(match));
    }

    const { status, search, limit } = q;
    let result = [...subscribers];

    if (status && status !== "all") {
      result = result.filter(
        (s) =>
          s.status === status ||
          s.billStatus === status ||
          s.subscription_status?.toLowerCase() === status.toLowerCase()
      );
    }

    if (search) {
      const queryStr = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.displayName?.toLowerCase().includes(queryStr) ||
          s.accountNumber?.toLowerCase().includes(queryStr) ||
          s.clientId?.toLowerCase().includes(queryStr) ||
          s.email?.toLowerCase().includes(queryStr) ||
          s.uid?.toLowerCase().includes(queryStr)
      );
    }

    if (limit) {
      const n = parseInt(limit, 10);
      if (!isNaN(n) && n > 0) {
        result = result.slice(0, n);
      }
    }

    return res.status(200).json({
      success: true,
      total: result.length,
      gateway: "ASIA-EAST1-PROD",
      timezone: "Asia/Manila (UTC+8)",
      timestamp: new Date().toISOString(),
      clients: result,
    });
  } catch (error: any) {
    console.error("Error in api/clients:", error);
    return res.status(500).json({
      error: "Failed to handle client API request",
      message: error?.message || String(error),
    });
  }
}
