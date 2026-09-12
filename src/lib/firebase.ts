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
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  CACHE_SIZE_UNLIMITED,
  doc,
  getDocFromServer,
  enableNetwork,
  disableNetwork,
  waitForPendingWrites,
} from 'firebase/firestore';
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

// Initialize Firestore targeting the specific named databaseId with offline persistence
const firestoreDbId =
  resolvedFirebaseConfig.firestoreDatabaseId &&
  resolvedFirebaseConfig.firestoreDatabaseId !== '(default)'
    ? resolvedFirebaseConfig.firestoreDatabaseId
    : undefined;

function initFirestoreWithOfflinePersistence() {
  const isBrowser = typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

  if (isBrowser) {
    try {
      // Primary: Multi-tab persistent local cache with unlimited cache size for offline dashboard access
      const settings = {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
          cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        }),
      };
      return firestoreDbId
        ? initializeFirestore(app, settings, firestoreDbId)
        : initializeFirestore(app, settings);
    } catch (multiTabErr: any) {
      console.warn(
        "Notice: Multi-tab Firestore persistence fallback to single-tab:",
        multiTabErr?.message || multiTabErr
      );
      try {
        const singleTabSettings = {
          localCache: persistentLocalCache({
            tabManager: persistentSingleTabManager({}),
          }),
        };
        return firestoreDbId
          ? initializeFirestore(app, singleTabSettings, firestoreDbId)
          : initializeFirestore(app, singleTabSettings);
      } catch (singleTabErr: any) {
        console.warn(
          "Notice: Single-tab persistence fallback to default Firestore:",
          singleTabErr?.message || singleTabErr
        );
        return firestoreDbId ? getFirestore(app, firestoreDbId) : getFirestore(app);
      }
    }
  }

  // SSR or non-browser fallback
  try {
    return firestoreDbId ? getFirestore(app, firestoreDbId) : getFirestore(app);
  } catch {
    return firestoreDbId
      ? initializeFirestore(app, {}, firestoreDbId)
      : initializeFirestore(app, {});
  }
}

export const db = initFirestoreWithOfflinePersistence();
export { enableNetwork, disableNetwork, waitForPendingWrites };
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
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('Firebase client offline: Firestore persistent cache active for dashboard queries.');
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Firebase Connected Successfully');
  } catch (error) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('failed to get document from server'))) {
      console.log("Firebase connection note: device is offline or network is unstable, persistent local cache active.");
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
