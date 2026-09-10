/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { toast } from 'sonner';
import firebaseConfigFile from '../../firebase-applet-config.json';

// Safely extract configuration from firebase-applet-config.json with fallback
const fileConfig: Record<string, any> =
  typeof firebaseConfigFile === 'object' && firebaseConfigFile !== null ? firebaseConfigFile : {};

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : ({} as Record<string, any>);

export const resolvedFirebaseConfig = {
  apiKey:
    env.VITE_FIREBASE_API_KEY ||
    (typeof process !== 'undefined' ? process.env?.FIREBASE_API_KEY : undefined) ||
    fileConfig.apiKey ||
    '',
  authDomain:
    env.VITE_FIREBASE_AUTH_DOMAIN ||
    (typeof process !== 'undefined' ? process.env?.FIREBASE_AUTH_DOMAIN : undefined) ||
    fileConfig.authDomain ||
    '',
  projectId:
    env.VITE_FIREBASE_PROJECT_ID ||
    (typeof process !== 'undefined' ? process.env?.FIREBASE_PROJECT_ID : undefined) ||
    fileConfig.projectId ||
    '',
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET ||
    (typeof process !== 'undefined' ? process.env?.FIREBASE_STORAGE_BUCKET : undefined) ||
    fileConfig.storageBucket ||
    '',
  messagingSenderId:
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    (typeof process !== 'undefined' ? process.env?.FIREBASE_MESSAGING_SENDER_ID : undefined) ||
    fileConfig.messagingSenderId ||
    '',
  appId:
    env.VITE_FIREBASE_APP_ID ||
    (typeof process !== 'undefined' ? process.env?.FIREBASE_APP_ID : undefined) ||
    fileConfig.appId ||
    '',
  measurementId:
    env.VITE_FIREBASE_MEASUREMENT_ID ||
    fileConfig.measurementId ||
    '',
  firestoreDatabaseId:
    env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
    env.VITE_FIREBASE_DATABASE_ID ||
    (typeof process !== 'undefined' ? (process.env?.FIREBASE_DATABASE_ID || process.env?.FIRESTORE_DATABASE_ID) : undefined) ||
    fileConfig.firestoreDatabaseId ||
    'ai-studio-1f5063d3-4d38-41ba-860c-a13f19d6de46',
};

// Log warning in development if mandatory keys are missing
if (!resolvedFirebaseConfig.apiKey || !resolvedFirebaseConfig.projectId) {
  console.warn(
    "⚠️ Firebase configuration notice: Missing apiKey or projectId in environment or firebase-applet-config.json."
  );
}

// Reuse existing Firebase App if already initialized (prevents duplicate app init errors in dev/HMR)
const app = getApps().length > 0 ? getApp() : initializeApp(resolvedFirebaseConfig);

// Initialize Firestore targeting the specific named databaseId
const firestoreDbId =
  resolvedFirebaseConfig.firestoreDatabaseId &&
  resolvedFirebaseConfig.firestoreDatabaseId !== '(default)'
    ? resolvedFirebaseConfig.firestoreDatabaseId
    : undefined;

export const db = firestoreDbId ? getFirestore(app, firestoreDbId) : getFirestore(app);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export const loginWithGoogle = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    // If the user dismissed or closed the popup window, treat it as a graceful cancel
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request'
    ) {
      return null;
    }

    if (error?.code === 'auth/popup-blocked') {
      toast.error("Sign-in popup was blocked by your browser. Please allow popups for this site and try again.");
      return null;
    }

    if (error?.code === 'auth/unauthorized-domain') {
      toast.error("This domain is not authorized in Firebase Console. Please add your domain to Authentication -> Settings -> Authorized domains.");
      return null;
    }

    if (error?.code === 'auth/network-request-failed') {
      toast.error("Network error during sign-in. Please check your internet connection.");
      return null;
    }

    console.error("Firebase Auth Error:", error);
    toast.error(error?.message ? `Login failed: ${error.message}` : "Unable to sign in with Google. Please try again.");
    return null;
  }
};

export const logout = () => signOut(auth);

// Test connection safely without throwing unhandled exceptions
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Firebase Connected Successfully');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration: client is offline.");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
