/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot, updateDoc } from 'firebase/firestore';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAdmin = async (user: User) => {
    try {
      const adminDoc = await getDoc(doc(db, `admins/${user.uid}`));
      let currentlyAdmin = adminDoc.exists();
      if (!currentlyAdmin && user.email === 'projectile.afk@gmail.com') {
        await setDoc(doc(db, `admins/${user.uid}`), {
          email: user.email,
          role: 'super_admin',
          createdAt: serverTimestamp()
        });
        currentlyAdmin = true;
      }
      setIsAdmin(currentlyAdmin);
    } catch (e) {
      console.warn("Admin check failed:", e);
    }
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (user) {
        const path = `users/${user.uid}`;
        const docRef = doc(db, path);
        
        // Don't await checkAdmin here to prevent blocking profile listener/loading state
        checkAdmin(user);

        unsubscribeProfile = onSnapshot(docRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as UserProfile;
            
            // Auto-suspension logic
            const now = new Date();
            const dueDate = data.dueDate?.toDate ? data.dueDate.toDate() : (data.dueDate ? new Date(data.dueDate) : null);
            
            if (dueDate && dueDate < now && data.status !== 'suspended' && data.billStatus !== 'paid') {
              // Only auto-suspend if it's not paid and date has passed
              updateDoc(docRef, { status: 'suspended' }).catch(e => console.error("Auto-suspend failed:", e));
            }

            setProfile(data);
          } else {
            // New user initialization
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const newProfile: UserProfile = {
              uid: user.uid,
              accountNumber: `HF-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Math.floor(Math.random() * 10000)}`,
              displayName: user.displayName || 'New Customer',
              email: user.email || '',
              address: '',
              currentPlanId: 'starter',
              balance: 0,
              billStatus: 'paid',
              dueDate: nextMonth,
            };
            setDoc(docRef, {
              ...newProfile,
              createdAt: serverTimestamp(),
            }).catch(e => console.error("Error creating profile:", e));
            setProfile(newProfile);
          }
          setLoading(false);
        }, (error) => {
          console.error("Profile onSnapshot error:", error);
          setLoading(false);
          // Only show error if it's not a permission issue during initial setup
          if (!(error as any).code?.includes('permission-denied')) {
            handleFirestoreError(error, OperationType.GET, path);
          }
        });
      } else {
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, loading, refreshProfile: async () => { if (user) await checkAdmin(user); } }}>
      {children}
    </AuthContext.Provider>
  );
};
