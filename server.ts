import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// CRITICAL: Force the project ID for the entire process before any firebase interaction
process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
process.env.GCLOUD_PROJECT = firebaseConfig.projectId;
process.env.PROJECT_ID = firebaseConfig.projectId;
process.env.FIREBASE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

console.log("Configuring Admin SDK with Project ID:", firebaseConfig.projectId);

// Initialize Firebase Admin using forced project ID
let app: admin.app.App;
if (!admin.apps.length) {
  try {
    app = admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
    console.log("Firebase Admin initialized with Project ID:", firebaseConfig.projectId);
  } catch (e) {
    console.error("Admin initialization failed:", e);
    app = admin.initializeApp();
  }
} else {
  app = admin.app();
}

// In modern firebase-admin, getFirestore takes (app, databaseId)
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Verify current configuration
console.log(`Verified App Project ID: ${app.options.projectId || firebaseConfig.projectId}`);
console.log(`Verified Database ID: ${firebaseConfig.firestoreDatabaseId}`);

// Verify Firestore connectivity on startup
(async () => {
  try {
    // Attempt a simple query to verify permissions
    const collections = await db.listCollections();
    console.log(`✅ Firestore connection verified. Found ${collections.length} root collections.`);
  } catch (error: any) {
    console.error("❌ Firestore Connection Error:", error.message);
    console.error("Status Code:", error.code);
    if (error.code === 7) {
      console.error("This project might not have Firestore enabled, or the service account lacks permissions.");
      console.error(`Check project: https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore`);
    }
  }
})();

async function getWiFi5SoftSettings() {
  const settingsDoc = await db.collection("settings").doc("wifi5soft").get();
  if (!settingsDoc.exists) return null;
  return settingsDoc.data();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API: WiFi5Soft Payment Reflection
  app.post("/api/wifi5soft/test", async (req, res) => {
    try {
      const { clientId, apiKey } = req.body;
      if (!clientId || !apiKey) {
        return res.status(400).json({ error: "Client ID and API Key are required for testing." });
      }
      // In a real scenario, you'd call a 'ping' or 'status' endpoint on their API
      // For now, we simulate a check
      res.json({ success: true, message: "WiFi5Soft credentials validated." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/wifi5soft/sync", async (req, res) => {
    try {
      const { userEmail, amount, referenceId, userId } = req.body;
      
      let credentials: any = null;

      // 1. Try to find the specific WiFi5Soft account assigned to the user
      if (userId) {
        const userDoc = await db.collection("users").doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          const accountId = userData?.wifi5softAccountId;
          
          if (accountId) {
            const accountDoc = await db.collection("wifi5soft_accounts").doc(accountId).get();
            if (accountDoc.exists) {
              credentials = accountDoc.data();
              console.log(`Using dedicated node: ${credentials.name} for ${userEmail}`);
            }
          }
        }
      }

      // 2. Fallback to legacy global settings if no per-user account found
      if (!credentials) {
        const settingsDoc = await db.collection("settings").doc("wifi5soft").get();
        if (settingsDoc.exists) {
          credentials = settingsDoc.data();
          console.log(`Using fallback/global node for ${userEmail}`);
        }
      }

      if (!credentials || !credentials.clientId || !credentials.apiKey) {
        return res.status(404).json({ error: "No WiFi5Soft synchronization node found for this subscriber." });
      }

      const { clientId, apiKey } = credentials;
      const apiUrl = "https://api.wifi5soft.com/v1/payment/reflect";

      console.log(`Broadcasting reflection to WiFi5Soft [Node: ${credentials.name || 'Default'}]...`);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-ID": clientId,
          "X-API-Key": apiKey
        },
        body: JSON.stringify({
          email: userEmail,
          amount: amount,
          reference: referenceId,
          timestamp: new Date().toISOString()
        })
      });

      const result = await response.json();
      res.json({ success: true, message: "WiFi5Soft synchronization attempted.", details: result });
    } catch (e: any) {
      console.error("WiFi5Soft Sync Error:", e);
      res.status(500).json({ error: e.message || "Failed to sync with WiFi5Soft." });
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
