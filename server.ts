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

// Initialize Firebase Admin using default environment credentials first to leverage hosting project IAM permissions
let app: admin.app.App;
if (!admin.apps.length) {
  try {
    app = admin.initializeApp();
    console.log("Firebase Admin initialized using default hosting environment credentials.");
  } catch (e) {
    console.error("Default Admin initialization failed, falling back to config projectId:", e);
    // Fallback override only if default fails
    process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
    process.env.GCLOUD_PROJECT = firebaseConfig.projectId;
    process.env.PROJECT_ID = firebaseConfig.projectId;
    app = admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
  }
} else {
  app = admin.app();
}

// In modern firebase-admin, getFirestore takes (app, databaseId)
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Verify current configuration
console.log(`Verified App Project ID: ${app.options.projectId || "Default/Detected"}`);
console.log(`Verified Database ID: ${firebaseConfig.firestoreDatabaseId}`);

// Verify Firestore connectivity on startup
(async () => {
  try {
    // Attempt a simple query to verify permissions
    const testQuery = await db.collection("users").limit(1).get();
    console.log(`✅ Firestore connection verified. Read test query succeeded with ${testQuery.size} documents.`);
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
