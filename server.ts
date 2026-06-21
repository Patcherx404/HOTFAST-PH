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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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
