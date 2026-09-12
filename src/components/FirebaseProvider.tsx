/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot, updateDoc } from 'firebase/firestore';
import { UserProfile, InternetPlan } from '../types';
import { ASIA_TIMEZONE } from '../lib/dateUtils';
import { INTERNET_PLANS, isAuthorizedAdminEmail } from '../constants';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  isOnline: boolean;
  isOffline: boolean;
  isCachedData: boolean;
  hasPendingWrites: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
  refreshProfile: async () => {},
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  isCachedData: false,
  hasPendingWrites: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isCachedData, setIsCachedData] = useState<boolean>(false);
  const [hasPendingWrites, setHasPendingWrites] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncAdminSession = async (userObj: User | null) => {
    try {
      if (userObj && isAuthorizedAdminEmail(userObj.email)) {
        // Set client-accessible cookie for fast route checks
        document.cookie = `hf_admin_session=${encodeURIComponent(userObj.email!)}; path=/; max-age=86400; SameSite=Lax`;
        const token = await userObj.getIdToken().catch(() => "");
        fetch("/api/admin/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userObj.email, token }),
        }).catch(() => {});
      } else {
        document.cookie = "hf_admin_session=; path=/; max-age=0; SameSite=Lax";
        fetch("/api/admin/session", { method: "DELETE" }).catch(() => {});
      }
    } catch {
      // safe fallback
    }
  };

  const checkAdmin = async (currentUser: User) => {
    try {
      const isAllowedAdmin = isAuthorizedAdminEmail(currentUser.email);
      setIsAdmin(isAllowedAdmin);

      if (isAllowedAdmin) {
        syncAdminSession(currentUser);
        const adminDoc = await getDoc(doc(db, `admins/${currentUser.uid}`));
        if (!adminDoc.exists()) {
          await setDoc(doc(db, `admins/${currentUser.uid}`), {
            email: currentUser.email,
            role: 'super_admin',
            createdAt: serverTimestamp()
          });
        }
      } else {
        syncAdminSession(null);
      }
    } catch (e) {
      console.warn("Admin check notice:", e);
      const isAllowedAdmin = isAuthorizedAdminEmail(currentUser.email);
      setIsAdmin(isAllowedAdmin);
      if (isAllowedAdmin) {
        syncAdminSession(currentUser);
      } else {
        syncAdminSession(null);
      }
    }
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let isMounted = true;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (!isMounted) return;
        setUser(currentUser);

        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }

        if (currentUser) {
          const isAllowedAdmin = isAuthorizedAdminEmail(currentUser.email);
          setIsAdmin(isAllowedAdmin);
          syncAdminSession(isAllowedAdmin ? currentUser : null);
          checkAdmin(currentUser);

          const path = `users/${currentUser.uid}`;
          const docRef = doc(db, path);

          try {
            unsubscribeProfile = onSnapshot(
              docRef,
              { includeMetadataChanges: true },
              (snapshot) => {
                if (!isMounted) return;
                const fromCache = snapshot.metadata.fromCache;
                const pendingWrites = snapshot.metadata.hasPendingWrites;
                setIsCachedData(fromCache);
                setHasPendingWrites(pendingWrites);

                if (snapshot.exists()) {
                  const data = snapshot.data() as UserProfile;

                  // Only execute auto-suspension background mutations when online to avoid accumulating offline mutation queues
                  if (typeof navigator === 'undefined' || navigator.onLine) {
                    const now = new Date();
                    const dueDate = data.dueDate?.toDate
                      ? data.dueDate.toDate()
                      : (data.dueDate ? new Date(data.dueDate) : null);

                    if (dueDate) {
                      const updates: any = {};

                      // Exact deadline check
                      if (now >= dueDate) {
                        if (data.balance && data.balance > 0) {
                          if (data.billStatus !== 'overdue') {
                            updates.billStatus = 'overdue';
                          }
                          const suspendThreshold = new Date(dueDate.getTime() + (2 * 24 * 60 * 60 * 1000));
                          if (now > suspendThreshold && data.status !== 'suspended') {
                            updates.status = 'suspended';
                          }
                        } else if (data.billStatus === 'paid') {
                          const plan = INTERNET_PLANS.find(p => p.id === data.currentPlanId) || INTERNET_PLANS[0];
                          const nextMonth = new Date(dueDate);
                          nextMonth.setMonth(nextMonth.getMonth() + 1);

                          updates.dueDate = nextMonth;
                          updates.balance = (data.balance || 0) + plan.price;
                          updates.billStatus = 'due';
                        }
                      }

                      if (data.status === 'suspended' && data.billStatus === 'paid' && (!data.balance || data.balance <= 0)) {
                        updates.status = 'active';
                      }

                      if (now < dueDate && (data.balance && data.balance > 0) && data.billStatus === 'paid') {
                        updates.billStatus = 'due';
                      }

                      if (Object.keys(updates).length > 0) {
                        updateDoc(docRef, updates).catch(e => console.warn("Auto-billing background update notice:", e));
                      }
                    }
                  }

                  setProfile(data);
                } else {
                  // Only initialize new user profile if online and not reading from an un-cached offline state
                  if (!fromCache && (typeof navigator === 'undefined' || navigator.onLine)) {
                    const nextMonth = new Date();
                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                    const newProfile: UserProfile = {
                      uid: currentUser.uid,
                      accountNumber: `HF-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Math.floor(Math.random() * 10000)}`,
                      displayName: currentUser.displayName || 'New Customer',
                      email: currentUser.email || '',
                      phone: '',
                      address: '',
                      currentPlanId: 'starter',
                      balance: 999,
                      billStatus: 'due',
                      status: 'suspended',
                      dueDate: nextMonth,
                    };
                    setDoc(docRef, {
                      ...newProfile,
                      createdAt: serverTimestamp(),
                    }).catch(e => console.warn("New user profile creation notice:", e));
                    setProfile(newProfile);
                  }
                }
                setLoading(false);
              },
              (error) => {
                console.warn("Profile listener notice (offline persistence fallback):", error?.message || error);
                if (isMounted) {
                  setLoading(false);
                }
              }
            );
          } catch (listenerError) {
            console.warn("Error setting up profile snapshot listener:", listenerError);
            if (isMounted) {
              setLoading(false);
            }
          }
        } else {
          setProfile(null);
          setIsAdmin(false);
          syncAdminSession(null);
          setLoading(false);
        }
      },
      (authError) => {
        console.warn("Auth state change error:", authError?.message || authError);
        if (isMounted) {
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await checkAdmin(user);
      try {
        const snap = await getDoc(doc(db, `users/${user.uid}`));
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
          setIsCachedData(snap.metadata.fromCache);
        }
      } catch (e) {
        console.warn("Profile refresh notice:", e);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        loading,
        refreshProfile,
        isOnline,
        isOffline: !isOnline,
        isCachedData,
        hasPendingWrites,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
