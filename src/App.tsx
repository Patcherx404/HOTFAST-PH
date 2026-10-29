/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Home,
  ShieldCheck,
  ArrowRight,
  CreditCard,
  Smartphone,
  MapPin,
  Menu,
  X,
  Activity,
  LogIn,
  LogOut,
  User as UserIcon,
  Loader2,
  ExternalLink,
  Lock,
  AlertTriangle,
  Clock,
  MessageSquare,
  Server,
  Code2,
} from "lucide-react";
import { INTERNET_PLANS, isSuperAdminEmail } from "./constants";
import { useAuth } from "./components/FirebaseProvider";
import LatencyMapSection from "./components/LatencyMapSection";
import { usePWAInstall } from "./hooks/usePWAInstall";
import { FooterCreditsAndCompliance } from "./components/FooterCreditsAndCompliance";
import { toast, Toaster } from "sonner";
import {
  loginWithGoogle,
  logout,
  db,
  handleFirestoreError,
  OperationType,
} from "./lib/firebase";
import {
  collection,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import {
  InternetPlan,
  SystemNotification,
} from "./types";

// Lazy-loaded route views & interactive widgets to keep initial landing bundle minimal
const PaymentSection = React.lazy(() =>
  import("./components/PaymentSection").then((m) => ({ default: m.PaymentSection }))
);
const CustomerPortal = React.lazy(() => import("./components/CustomerPortal"));
const AdminPanel = React.lazy(() => import("./components/AdminPanel"));
const ChatWidget = React.lazy(() =>
  import("./components/ChatWidget").then((m) => ({ default: m.ChatWidget }))
);
const LatencyMapModal = React.lazy(() => import("./components/LatencyMapModal"));
const PWAInstallModal = React.lazy(() =>
  import("./components/PWAInstallPrompt").then((m) => ({ default: m.PWAInstallModal }))
);
const ComplianceModal = React.lazy(() =>
  import("./components/ComplianceModal").then((m) => ({ default: m.ComplianceModal }))
);
const SupportModal = React.lazy(() =>
  import("./components/SupportModal").then((m) => ({ default: m.SupportModal }))
);

export default function App() {
  const { user, profile, isAdmin, loading } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "home" | "plans" | "payment" | "portal" | "admin"
  >("home");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [plans, setPlans] = useState<InternetPlan[]>(INTERNET_PLANS);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [hasPendingPayment, setHasPendingPayment] = useState(false);
  const [showLatencyMap, setShowLatencyMap] = useState(false);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  // PWA Install state & trigger
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    isInAppBrowser,
    isModalOpen: showInstallModal,
    setIsModalOpen: setShowInstallModal,
    triggerInstall,
  } = usePWAInstall();

  // Logic to hide plans and payment if user already has an active, paid plan and it's not due
  const shouldHideBillingTabs = (() => {
    // If pending payment, hide it (previous user request)
    if (hasPendingPayment) return true;

    if (profile?.currentPlanId) {
      // If client is not due (their status is 'paid' or not explicitly due/overdue)
      if (profile?.billStatus === "paid" || !profile?.billStatus) {
        return true;
      }
    }
    return false;
  })();

  // Sync plans with Firestore
  useEffect(() => {
    const q = query(collection(db, "plans"), orderBy("price", "asc"));
    
    // Initial fetch and population – only works if user is admin
    const initPlans = async () => {
      if (!isAdmin) return;
      try {
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          const batchPromise = INTERNET_PLANS.map(async (plan) => {
            await setDoc(doc(db, "plans", plan.id), {
              ...plan,
              updatedAt: serverTimestamp(),
            });
          });
          await Promise.all(batchPromise);
        }
      } catch (e: any) {
        if (e?.message?.includes("Quota limit exceeded") || e?.code === "resource-exhausted") {
          console.warn("Firestore plan catalog read quota reached, using active plan catalog.");
        } else {
          console.warn("Plans Init Notice:", e?.message || e);
        }
      }
    };

    initPlans();

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const p = snapshot.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id }) as InternetPlan,
      );
      setPlans(p.length > 0 ? p : INTERNET_PLANS);
    }, (error: any) => {
      if (error?.message?.includes("Quota limit exceeded") || error?.code === "resource-exhausted") {
        console.warn("Firestore plans sync reached quota limit, relying on high-speed fallback catalog.");
      } else {
        console.warn("Plans Sync Notice:", error?.message || error);
      }
      // Fallback to constants if DB read fails (e.g. quota exceeded)
      setPlans(prev => prev.length === 0 ? INTERNET_PLANS : prev);
    });

    return unsubscribe;
  }, [isAdmin]);

  // Sync notifications
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/notifications`),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const n = snapshot.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id }) as SystemNotification,
      );
      setNotifications(n);
    }, (error) => {
      console.error("Notifications Sync Error:", error);
    });

    return unsubscribe;
  }, [user]);

  // Sync payment status to determine if we should hide plans/payment
  useEffect(() => {
    if (!user) {
      setHasPendingPayment(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/payments`),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHasPendingPayment(!snapshot.empty);
    }, (error) => {
      console.error("Payment Status Sync Error:", error);
    });

    return unsubscribe;
  }, [user]);

  // Redirect if on forbidden tabs
  useEffect(() => {
    if (shouldHideBillingTabs && (activeTab === "plans" || activeTab === "payment")) {
      setActiveTab("portal");
    }
  }, [shouldHideBillingTabs, activeTab]);

  const [hasDoneLoginRedirect, setHasDoneLoginRedirect] = useState(false);

  // Handle pending plan selection and auto-redirect to portal after login
  useEffect(() => {
    if (user) {
      const pendingPlanId = localStorage.getItem("pendingPlanId");
      if (pendingPlanId) {
        const plan = plans.find(p => p.id === pendingPlanId);
        if (plan) {
          setSelectedPlan(plan);
          setActiveTab("payment");
        }
        localStorage.removeItem("pendingPlanId");
        setHasDoneLoginRedirect(true);
      } else if (!hasDoneLoginRedirect && activeTab === "home") {
        setActiveTab("portal");
        setHasDoneLoginRedirect(true);
      }
    } else {
      setHasDoneLoginRedirect(false);
    }
  }, [user, activeTab, hasDoneLoginRedirect, plans]);

  // Detect direct URL navigation to compliance, support, or admin/system-access
  useEffect(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname.toLowerCase();
      const search = window.location.search.toLowerCase();
      if (path === "/compliance" || path === "/compliance.html" || search.includes("compliance")) {
        setShowComplianceModal(true);
      }
      if (path === "/support" || path === "/support.html" || search.includes("support")) {
        setShowSupportModal(true);
      }

      const isSystemAccessRoute =
        path === "/admin" ||
        path.startsWith("/admin/") ||
        path === "/system-access" ||
        path.startsWith("/system-access/") ||
        search.includes("tab=admin") ||
        search.includes("tab=system-access") ||
        search.includes("page=admin") ||
        search.includes("page=system-access");

      if (isSystemAccessRoute) {
        if (!loading) {
          if (user && isSuperAdminEmail(user.email)) {
            setAdminAuth(true);
            setActiveTab("admin");
          } else {
            // Unauthorized direct URL access attempt: enforce 403 and redirect to dashboard
            setActiveTab(user ? "portal" : "home");
            setAdminAuth(false);
            setShowAdminLogin(false);
            window.history.replaceState({}, "", "/");
            toast.error(
              "403 Forbidden: System Access is strictly restricted to the authorized administrator account (projectile.afk@gmail.com).",
              { duration: 5000 }
            );
          }
        }
      }
    }
  }, [loading, user]);

  // Enforce admin authorization on activeTab === "admin"
  useEffect(() => {
    if (activeTab === "admin") {
      const isSuperAdmin = user && isSuperAdminEmail(user.email);
      if (!loading && !isSuperAdmin && !adminAuth) {
        setActiveTab(user ? "portal" : "home");
        setShowAdminLogin(false);
        window.history.replaceState({}, "", "/");
        toast.error(
          "Admin Access: Please authenticate with your Google Admin account or Master Credentials.",
          { duration: 5000 }
        );
      }
    }
  }, [activeTab, user, loading, adminAuth]);

  const [selectedPlan, setSelectedPlan] = useState<InternetPlan | null>(null);

  const handleSelectPlan = (plan: InternetPlan) => {
    if (!user) {
      localStorage.setItem("pendingPlanId", plan.id);
      loginWithGoogle();
      return;
    }
    setSelectedPlan(plan);
    setActiveTab("payment");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleMarkNotificationAsRead = async (id: string) => {
    if (!user) return;
    try {
      const docRef = doc(db, `users/${user.uid}/notifications`, id);
      await updateDoc(docRef, { read: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError("");
    const isSuper = user && isSuperAdminEmail(user.email);
    if (isSuper || (adminUsername.trim() === "patcherx" && adminPassword === "Patcherx500")) {
      setAdminAuth(true);
      setShowAdminLogin(false);
      setActiveTab("admin");
      toast.success("Welcome, Administrator!");
    } else {
      setAdminError("Access Denied: Invalid Administrative Credentials");
    }
  };

  const currentPlan = plans.find((p) => p.id === profile?.currentPlanId);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <Loader2 className="text-primary animate-spin" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base text-slate-100 selection:bg-primary selection:text-white font-sans">
      {/* Suspension Banner */}
      {user && profile?.status === "suspended" && !isAdmin && (
        <div className="fixed top-0 left-0 w-full z-[100] bg-red-600 border-b border-red-500 py-2 px-4 flex items-center justify-center gap-4 animate-in fade-in slide-in-from-top duration-500">
          <div className="flex items-center gap-2 text-white">
            <AlertTriangle size={14} className="animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest italic">
              System Connectivity Suspended: Account Verification or Settlement Required
            </span>
          </div>
          <button 
            onClick={() => setActiveTab('portal')}
            className="px-4 py-1 bg-white text-red-600 text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all rounded shadow-lg"
          >
            Pay Now / Restore Access
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 bg-bg-base/90 backdrop-blur-md border-b border-border-subtle ${user && profile?.status === "suspended" && !isAdmin ? "mt-10" : ""}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div
            className="flex items-center gap-2 md:gap-3 cursor-pointer group"
            onClick={() => setActiveTab("home")}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg p-1 bg-slate-900/90 border border-primary/40 shadow-md shadow-primary/20 overflow-hidden flex items-center justify-center transform group-hover:scale-105 group-hover:border-primary transition-all duration-300 shrink-0">
              <img
                src="/hoticon2.png"
                alt="HOTFAST Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-xl md:text-2xl font-black tracking-tighter uppercase">
              HOTFAST<span className="text-primary italic">PH</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-10 text-[11px] font-bold uppercase tracking-[0.3em] text-text-dim">
            {(["home", "payment", "portal", "admin"] as const)
              .filter((t) => {
                if (!user && (t === "payment" || t === "portal" || t === "admin")) return false;
                if (t === "admin" && (!adminAuth || !isSuperAdminEmail(user?.email))) return false;
                if (shouldHideBillingTabs && t === "payment") return false;
                return true;
              })
              .map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`hover:text-white transition-colors relative ${activeTab === tab ? "text-white" : ""}`}
                >
                  {tab}
                  {activeTab === tab && (
                    <motion.div
                      layoutId="nav-line"
                      className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary"
                    />
                  )}
                </button>
              ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {!isInstalled && (
              <button
                onClick={triggerInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-600 to-primary hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-widest transition-all rounded shadow-md shadow-primary/20 border border-red-500 cursor-pointer"
                title="Install HOTFAST PH App to Home Screen"
              >
                <Smartphone size={12} />
                <span>Install App</span>
              </button>
            )}

            <button
              onClick={() => setShowLatencyMap(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[10px] font-black uppercase tracking-widest transition-all rounded hover:border-primary cursor-pointer"
              title="Open Google Map Box for Fiber Node"
            >
              <MapPin size={12} className="text-primary animate-pulse" />
              <span>Latency Map</span>
            </button>

            <button
              onClick={() => setShowSupportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-border-subtle hover:border-primary/50 text-[10px] font-black uppercase tracking-widest transition-all rounded cursor-pointer"
              title="Open Hotfast Customer Support Form"
            >
              <MessageSquare size={12} className="text-primary" />
              <span>Support</span>
            </button>

            {user ? (
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setActiveTab("portal")}
                  className="flex items-center gap-3 px-4 py-2 bg-slate-900 border border-border-subtle text-[10px] font-bold uppercase tracking-widest hover:border-primary/50 transition-colors"
                >
                  <UserIcon size={12} className="text-primary" />
                  {profile?.accountNumber}
                </button>
                <button
                  onClick={logout}
                  className="text-text-muted hover:text-primary transition-colors"
                  title="Logout"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="px-8 py-2.5 bg-primary hover:bg-primary-dark transition-all font-black uppercase tracking-widest text-[11px] flex items-center gap-2 italic cursor-pointer"
              >
                <LogIn size={14} /> Account Access
              </button>
            )}
          </div>

          {/* Mobile Right Controls */}
          <div className="flex md:hidden items-center gap-1 sm:gap-2">
            {!isInstalled && (
              <button
                onClick={triggerInstall}
                className="px-2 py-1 bg-primary/20 hover:bg-primary border border-primary/40 text-white rounded transition-colors flex items-center gap-1"
                title="Add to Home Screen / Install App"
              >
                <Smartphone size={14} className="text-primary group-hover:text-white" />
                <span className="text-[9px] font-black uppercase tracking-wider text-primary">App</span>
              </button>
            )}

            <button
              onClick={() => setShowLatencyMap(true)}
              className="p-2 text-primary hover:text-white transition-colors relative"
              title="Open Latency Map"
            >
              <MapPin size={18} className="animate-pulse" />
            </button>

            <button
              className="p-2 text-white hover:text-primary transition-colors flex items-center gap-1.5"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle Menu"
            >
              {user?.photoURL ? (
                <div className="w-7 h-7 rounded-full border border-primary/50 overflow-hidden">
                  <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                </div>
              ) : (
                isMenuOpen ? <X size={22} /> : <Menu size={22} />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[120] bg-hot-black/95 backdrop-blur-xl p-6 md:hidden flex flex-col overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg p-1 bg-slate-900/90 border border-primary/40 shadow-md shadow-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                  <img src="/hoticon2.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <span className="text-xl font-black uppercase tracking-tighter">
                  HOTFAST<span className="text-primary italic">PH</span>
                </span>
              </div>
              <button 
                onClick={() => setIsMenuOpen(false)}
                className="p-2 text-text-muted hover:text-white rounded-lg active:bg-white/10"
                aria-label="Close menu"
              >
                <X size={28} />
              </button>
            </div>

            {/* Subscriber Header inside Mobile Menu if Logged In */}
            {user && (
              <div className="mb-6 p-4 bg-slate-900/80 border border-border-subtle rounded-none flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 border border-primary/40 rounded-full overflow-hidden shrink-0">
                    <img src={user.photoURL || ""} className="w-full h-full object-cover" alt="Avatar" />
                  </div>
                  <div>
                    <div className="text-[9px] font-black uppercase text-text-muted tracking-widest">
                      {profile?.accountNumber ? `#${profile.accountNumber}` : "Subscriber"}
                    </div>
                    <div className="text-sm font-bold uppercase text-white truncate max-w-[150px]">
                      {profile?.displayName}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border ${
                    profile?.status === "suspended"
                      ? "bg-red-700/20 border-red-600 text-red-500"
                      : (profile?.billStatus === "overdue" || (profile?.balance && profile.balance > 0))
                      ? "bg-red-500/10 border-red-500/40 text-red-400" 
                      : "bg-green-500/10 border-green-500/40 text-green-400"
                  }`}>
                    {profile?.status === "suspended" ? "Suspended" : (profile?.billStatus === "overdue" || (profile?.balance && profile.balance > 0)) ? "Payment Due" : "Active"}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-5 flex-1">
              {(["home", "payment", "portal", "admin"] as const)
                .filter((t) => {
                  if (!user && (t === "payment" || t === "portal" || t === "admin")) return false;
                  if (t === "admin" && (!adminAuth || !isSuperAdminEmail(user?.email))) return false;
                  if (shouldHideBillingTabs && t === "payment") return false;
                  return true;
                })
                .map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab);
                      setIsMenuOpen(false);
                    }}
                    className={`text-2xl sm:text-3xl font-black uppercase text-left tracking-tighter italic flex items-center justify-between py-2 border-b border-border-subtle/50 transition-colors ${
                      activeTab === tab ? "text-primary pl-2 border-primary" : "text-white hover:text-primary"
                    }`}
                  >
                    <span>{tab}</span>
                    {activeTab === tab && (
                      <span className="text-[10px] uppercase font-mono tracking-widest text-primary not-italic font-bold">Active</span>
                    )}
                  </button>
                ))}

              {!isInstalled && (
                <button
                  onClick={() => {
                    triggerInstall();
                    setIsMenuOpen(false);
                  }}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-red-950/70 via-slate-900 to-slate-900 border border-primary/50 text-white text-xs font-black uppercase tracking-widest flex items-center justify-between mt-2 active:bg-primary transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Smartphone size={17} className="text-primary" /> 
                    <span>Add to Home Screen</span>
                  </span>
                  <span className="text-[9px] font-mono text-primary font-bold bg-primary/20 px-2 py-0.5 border border-primary/30">
                    INSTALL
                  </span>
                </button>
              )}

              <button
                onClick={() => {
                  setShowLatencyMap(true);
                  setIsMenuOpen(false);
                }}
                className="w-full py-4 px-4 bg-primary/10 border border-primary/30 text-primary text-xs font-black uppercase tracking-widest flex items-center justify-between mt-2 active:bg-primary active:text-white transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <MapPin size={16} /> Latency Map (Google Map Box)
                </span>
                <span className="text-[10px] font-mono text-green-400 font-bold bg-green-500/10 px-2 py-0.5 border border-green-500/20">ONLINE</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSupportModal(true);
                  setIsMenuOpen(false);
                }}
                className="w-full py-3.5 px-4 bg-primary/15 border border-primary/40 text-white text-xs font-black uppercase tracking-widest flex items-center justify-between mt-2 active:bg-primary transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-primary" /> Customer Support
                </span>
                <span className="text-[10px] font-mono text-primary font-bold bg-primary/20 px-2 py-0.5 border border-primary/30">
                  NOC 24/7
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowComplianceModal(true);
                  setIsMenuOpen(false);
                }}
                className="w-full py-3.5 px-4 bg-slate-900/80 border border-border-subtle hover:border-primary/50 text-text-muted hover:text-white text-xs font-black uppercase tracking-widest flex items-center justify-between mt-2 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-primary" /> Client Privacy &amp; Compliance
                </span>
                <span className="text-[10px] font-mono text-primary font-bold bg-primary/10 px-2 py-0.5 border border-primary/20">
                  VIEW
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setTimeout(() => {
                    document.getElementById('footer-credits-section')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                className="w-full py-3.5 px-4 bg-slate-900/80 border border-border-subtle hover:border-primary/50 text-text-muted hover:text-white text-xs font-black uppercase tracking-widest flex items-center justify-between mt-2 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Code2 size={16} className="text-primary" /> Credits &amp; Development
                </span>
                <span className="text-[10px] font-mono text-primary font-bold bg-primary/10 px-2 py-0.5 border border-primary/20">
                  TEAM
                </span>
              </button>
              
              <div className="mt-auto pt-6 border-t border-border-subtle flex flex-col gap-4">
                {user ? (
                  <button
                    onClick={() => {
                      logout();
                      setIsMenuOpen(false);
                    }}
                    className="w-full py-4 bg-slate-900 border border-border-subtle hover:border-primary/50 text-text-muted hover:text-white font-black uppercase text-xs tracking-[0.2em] italic flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <LogOut size={16} /> Disconnect Session
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      loginWithGoogle();
                      setIsMenuOpen(false);
                    }}
                    className="w-full py-4 bg-primary text-white font-black uppercase tracking-[0.2em] italic flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <LogIn size={18} /> Account Access
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="pt-16 sm:pt-20 pb-24 md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === "home" && (
              <>
                <HeroSection 
                  onExplore={() => setActiveTab("payment")} 
                  onGoToPortal={() => setActiveTab("portal")}
                  onOpenLatencyMap={() => setShowLatencyMap(true)}
                  onOpenSupport={() => setShowSupportModal(true)}
                  currentPlanName={currentPlan?.name} 
                  hasPendingPayment={hasPendingPayment}
                  shouldHideBilling={shouldHideBillingTabs}
                />
                <LatencyMapSection
                  onOpenMapModal={() => setShowLatencyMap(true)}
                />
              </>
            )}
            <Suspense
              fallback={
                <div className="min-h-[50vh] flex items-center justify-center">
                  <Loader2 size={28} className="text-primary animate-spin" />
                </div>
              }
            >
              {(activeTab === "plans" || activeTab === "payment") && (
                <PaymentSection 
                  plans={plans} 
                  selectedPlan={selectedPlan} 
                  onSuccess={() => setActiveTab("portal")}
                  onSelectPlan={handleSelectPlan}
                />
              )}
              {activeTab === "portal" && (
                <CustomerPortal
                  plans={plans}
                  onPay={() => {
                    setSelectedPlan(null);
                    setActiveTab("payment");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  onOpenLatencyMap={() => setShowLatencyMap(true)}
                  onOpenInstallModal={() => setShowInstallModal(true)}
                  isInstalled={isInstalled}
                  onOpenSupport={() => setShowSupportModal(true)}
                />
              )}
              {activeTab === "admin" && adminAuth && isSuperAdminEmail(user?.email) && (
                <AdminPanel
                  plans={plans}
                  onLogout={() => {
                    setAdminAuth(false);
                    setActiveTab("home");
                  }}
                />
              )}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Sticky Bottom Navigation Bar */}
      <nav 
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-hot-black/95 backdrop-blur-xl border-t border-border-subtle/80 px-2 py-1 flex items-center justify-around shadow-[0_-8px_25px_rgba(0,0,0,0.7)]"
      >
        <button
          onClick={() => setActiveTab("home")}
          className={`flex flex-col items-center justify-center py-1 px-2.5 min-w-[54px] min-h-[48px] rounded-lg transition-colors ${
            activeTab === "home" ? "text-primary font-black" : "text-text-muted hover:text-white"
          }`}
        >
          <Home size={18} />
          <span className="text-[9px] uppercase tracking-wider mt-1">Home</span>
          {activeTab === "home" && <span className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
        </button>

        {/* Latency Map Trigger Button */}
        <button
          onClick={() => setShowLatencyMap(true)}
          className="flex flex-col items-center justify-center py-1 px-2.5 min-w-[54px] min-h-[48px] rounded-lg text-text-muted hover:text-primary transition-colors group relative"
          title="Open Google Map Box for Fiber Node"
        >
          <div className="relative">
            <MapPin size={18} className="text-primary group-hover:scale-110 transition-transform" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          </div>
          <span className="text-[9px] uppercase tracking-wider mt-1 text-white/90">Map</span>
        </button>

        {/* 24/7 Customer Support Trigger Button (side of Map & aside of Portal) */}
        <button
          onClick={() => setShowSupportModal(true)}
          className="flex flex-col items-center justify-center py-1 px-2.5 min-w-[54px] min-h-[48px] rounded-lg text-text-muted hover:text-primary transition-colors group relative cursor-pointer"
          title="Open Hotfast Customer Support Form"
        >
          <div className="relative">
            <MessageSquare size={18} className="text-primary group-hover:scale-110 transition-transform" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
          </div>
          <span className="text-[9px] uppercase tracking-wider mt-1 text-white/90">Support</span>
        </button>

        {user && !shouldHideBillingTabs && (
          <button
            onClick={() => setActiveTab("payment")}
            className={`flex flex-col items-center justify-center py-1 px-2.5 min-w-[54px] min-h-[48px] rounded-lg transition-colors ${
              activeTab === "payment" ? "text-primary font-black" : "text-text-muted hover:text-white"
            }`}
          >
            <CreditCard size={18} />
            <span className="text-[9px] uppercase tracking-wider mt-1">Pay</span>
            {activeTab === "payment" && <span className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
          </button>
        )}

        {user ? (
          <button
            onClick={() => setActiveTab("portal")}
            className={`flex flex-col items-center justify-center py-1 px-2.5 min-w-[54px] min-h-[48px] rounded-lg transition-colors ${
              activeTab === "portal" ? "text-primary font-black" : "text-text-muted hover:text-white"
            }`}
          >
            <UserIcon size={18} />
            <span className="text-[9px] uppercase tracking-wider mt-1">Portal</span>
            {activeTab === "portal" && <span className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
          </button>
        ) : (
          <button
            onClick={loginWithGoogle}
            className="flex flex-col items-center justify-center py-1 px-2.5 min-w-[54px] min-h-[48px] rounded-lg text-text-muted hover:text-primary transition-colors cursor-pointer"
          >
            <LogIn size={18} />
            <span className="text-[9px] uppercase tracking-wider mt-1">Login</span>
          </button>
        )}
      </nav>

      <Suspense fallback={null}>
        <ChatWidget onOpenTicketForm={() => setShowSupportModal(true)} />
      </Suspense>
      <Toaster position="top-center" richColors />
      <Footer 
        setShowAdminLogin={setShowAdminLogin} 
        onOpenLatencyMap={() => setShowLatencyMap(true)} 
        onOpenInstallModal={() => setShowInstallModal(true)}
        onOpenCompliance={() => setShowComplianceModal(true)}
        onOpenSupport={() => setShowSupportModal(true)}
        activeTab={activeTab}
      />

      <Suspense fallback={null}>
        {showSupportModal && (
          <SupportModal
            isOpen={showSupportModal}
            onClose={() => setShowSupportModal(false)}
          />
        )}

        {showLatencyMap && (
          <LatencyMapModal 
            isOpen={showLatencyMap} 
            onClose={() => setShowLatencyMap(false)} 
          />
        )}

        {showComplianceModal && (
          <ComplianceModal
            isOpen={showComplianceModal}
            onClose={() => setShowComplianceModal(false)}
          />
        )}

        {showInstallModal && (
          <PWAInstallModal
            isOpen={showInstallModal}
            onClose={() => setShowInstallModal(false)}
            onInstall={triggerInstall}
            isInstallable={isInstallable}
            isIOS={isIOS}
            isAndroid={isAndroid}
            isInAppBrowser={isInAppBrowser}
          />
        )}
      </Suspense>

      <AnimatePresence>
        {showAdminLogin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-hot-black/95 flex items-center justify-center p-3 sm:p-6 backdrop-blur-xl overflow-y-auto"
            onKeyDown={(e) => e.key === "Escape" && setShowAdminLogin(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="sharp-card p-6 sm:p-10 md:p-12 max-w-sm w-full border-t-8 border-primary relative my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowAdminLogin(false)}
                className="absolute top-4 right-4 text-text-muted hover:text-white transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>

              <div className="text-center mb-8 text-white">
                <div className="w-20 h-20 mx-auto mb-6 p-2 rounded-2xl bg-slate-900/90 border-2 border-primary/50 shadow-xl shadow-primary/20 flex items-center justify-center overflow-hidden">
                  <img
                    src="/hoticon2.png"
                    alt="Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter">
                  ADMIN <span className="text-primary not-italic">CONSOLE</span>
                </h2>
                <p className="text-[10px] text-text-muted mt-2 font-bold uppercase tracking-widest leading-loose">
                  Access Restricted to Authorized Personnel Only
                </p>
              </div>

              {isSuperAdminEmail(user?.email) ? (
                <>
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center text-xs font-mono text-white mb-4">
                    <div className="text-[10px] text-emerald-400 uppercase font-black tracking-widest mb-1">
                      Verified Administrator
                    </div>
                    <span className="text-emerald-300 font-bold">{user?.email}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAdminAuth(true);
                      setShowAdminLogin(false);
                      setActiveTab("admin");
                    }}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[11px] tracking-widest italic rounded-lg transition-all shadow-lg shadow-emerald-600/20 cursor-pointer mb-4"
                  >
                    Direct System Access
                  </button>

                  <div className="flex items-center gap-3 my-4 text-[9px] text-text-muted uppercase tracking-widest">
                    <div className="flex-1 h-px bg-border-subtle" />
                    <span>Or Authenticate with Key</span>
                    <div className="flex-1 h-px bg-border-subtle" />
                  </div>
                </>
              ) : (
                <div className="mb-6 space-y-3">
                  <button
                    type="button"
                    onClick={async () => {
                      await loginWithGoogle();
                    }}
                    className="w-full py-3.5 bg-primary hover:bg-primary-dark text-white font-black uppercase text-[10px] tracking-widest italic rounded transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogIn size={14} /> Sign In with Google Admin
                  </button>
                  <p className="text-[9px] text-center text-text-muted font-mono">
                    Authorized account: <strong className="text-slate-300">projectile.afk@gmail.com</strong>
                  </p>

                  <div className="flex items-center gap-3 my-4 text-[9px] text-text-muted uppercase tracking-widest">
                    <div className="flex-1 h-px bg-border-subtle" />
                    <span>Or Master Administrative Key</span>
                    <div className="flex-1 h-px bg-border-subtle" />
                  </div>
                </div>
              )}

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] uppercase tracking-widest font-black text-text-muted block">
                    Username
                  </label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="patcherx"
                    className="w-full bg-slate-900 border border-border-subtle p-3 focus:outline-none focus:border-primary text-xs font-mono text-white rounded"
                  />
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] uppercase tracking-widest font-black text-text-muted block">
                    Security Key
                  </label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••••"
                    className="w-full bg-slate-900 border border-border-subtle p-3 focus:outline-none focus:border-primary text-xs font-mono text-white rounded"
                  />
                </div>

                {adminError && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-mono font-bold text-center uppercase tracking-wide rounded"
                  >
                    {adminError}
                  </motion.div>
                )}

                <button
                  type="submit"
                  className="w-full py-4 bg-primary text-white font-black uppercase text-[10px] tracking-widest italic hover:bg-primary-dark transition-all shadow-xl shadow-primary/20 cursor-pointer rounded"
                >
                  Authenticate Key &amp; Enter
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HeroSection({ onExplore, onGoToPortal, onOpenLatencyMap, onOpenSupport, currentPlanName, hasPendingPayment, shouldHideBilling }: { onExplore: () => void, onGoToPortal: () => void, onOpenLatencyMap?: () => void, onOpenSupport?: () => void, currentPlanName?: string | null, hasPendingPayment: boolean, shouldHideBilling: boolean }) {
  const [latency, setLatency] = useState<number>(0);
  const [traffic, setTraffic] = useState<number>(7.8);
  const [load, setLoad] = useState<number>(65);
  const [efficiency, setEfficiency] = useState<number>(99.8);
  const [uptime, setUptime] = useState<number>(99.98);

  useEffect(() => {
    const checkLatency = async () => {
      const start = Date.now();
      try {
        await fetch("https://dns.google", { 
          mode: 'no-cors', 
          cache: "no-store" 
        });
        const end = Date.now();
        setLatency(end - start);
      } catch (e) {
        setLatency(Math.floor(Math.random() * 20) + 15);
      }
    };

    // Simulate real-time fluctuation for monitor metrics
    const updateMetrics = () => {
      setTraffic(prev => {
        const delta = (Math.random() - 0.5) * 0.2;
        return Math.max(7.2, Math.min(8.5, prev + delta));
      });
      setLoad(prev => {
        const delta = Math.floor((Math.random() - 0.5) * 4);
        return Math.max(58, Math.min(82, prev + delta));
      });
      setEfficiency(prev => {
        const delta = (Math.random() - 0.5) * 0.01;
        return Math.max(99.7, Math.min(99.9, prev + delta));
      });
      setUptime(prev => {
        const delta = (Math.random() - 0.5) * 0.001;
        return Math.max(99.97, Math.min(99.99, prev + delta));
      });
    };

    const latencyInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkLatency();
      }
    }, 5000);
    
    const metricsInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        updateMetrics();
      }
    }, 4000);
    
    checkLatency();
    updateMetrics();

    return () => {
      clearInterval(latencyInterval);
      clearInterval(metricsInterval);
    };
  }, []);

  return (
    <section className="relative min-h-[85vh] md:min-h-[90vh] flex items-center overflow-hidden py-10 md:py-16">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-center">
        <div className="md:col-span-12 lg:col-span-7">
          <div className="inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 bg-primary/10 border-l-2 border-primary text-primary text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-6 sm:mb-10">
            {currentPlanName ? `INFRASTRUCTURE NODE: ${currentPlanName}` : "PH Edge Network Active"}
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-9xl font-black leading-[0.9] sm:leading-[0.85] tracking-tighter mb-6 sm:mb-10 uppercase italic">
            FIBER <span className="text-primary not-italic">EDGE</span>
            <br />
            RE<span className="text-primary">DEFINED</span>.
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-text-dim max-w-lg mb-8 sm:mb-12 leading-relaxed font-medium">
            Aggressive fiber performance for the next-gen digital
            infrastructure. Minimal latency. Maximum throughput.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
            {hasPendingPayment ? (
              <div className="w-full sm:w-auto justify-center px-6 sm:px-10 py-4 sm:py-5 bg-yellow-500/10 border border-yellow-500/50 text-yellow-500 font-black uppercase tracking-widest text-[10px] flex items-center gap-3 italic animate-pulse min-h-[48px]">
                <Clock size={18} /> SETTLEMENT VERIFICATION IN PROGRESS
              </div>
            ) : shouldHideBilling ? (
              <div className="w-full sm:w-auto justify-center px-6 sm:px-10 py-4 sm:py-5 bg-green-500/10 border border-green-500/50 text-green-400 font-black uppercase tracking-widest text-[10px] flex items-center gap-3 italic min-h-[48px]">
                <ShieldCheck size={18} /> INFRASTRUCTURE ACTIVE & SECURE
              </div>
            ) : (
              <button
                onClick={onExplore}
                className="w-full sm:w-auto justify-center px-8 sm:px-10 py-4 sm:py-5 bg-primary hover:bg-primary-dark text-white font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-primary/20 flex items-center gap-3 italic min-h-[48px] active:scale-[0.98]"
              >
                UPGRADE NOW <ArrowRight size={18} />
              </button>
            )}
            
            {shouldHideBilling && !hasPendingPayment && (
              <button
                onClick={onGoToPortal}
                className="w-full sm:w-auto justify-center px-8 sm:px-10 py-4 sm:py-5 bg-bg-surface border border-border-subtle hover:border-primary-dark transition-all text-white font-black uppercase tracking-widest text-xs flex items-center gap-3 italic min-h-[48px] active:scale-[0.98]"
              >
                OPEN PORTAL <ExternalLink size={16} />
              </button>
            )}

            {onOpenSupport && (
              <button
                onClick={onOpenSupport}
                className="w-full sm:w-auto justify-center px-6 sm:px-8 py-4 sm:py-5 bg-slate-900/80 border border-border-subtle hover:border-primary/60 text-slate-200 hover:text-white font-black uppercase tracking-widest text-xs transition-all flex items-center gap-2.5 italic min-h-[48px] cursor-pointer"
                title="Open Hotfast Customer Support Ticket Form"
              >
                <MessageSquare size={16} className="text-primary" />
                <span>24/7 SUPPORT</span>
              </button>
            )}
          </div>

          <div className="mt-10 sm:mt-16 grid grid-cols-3 gap-2 sm:gap-6 md:gap-12 pt-6 sm:pt-10 border-t border-border-subtle">
            <div>
              <div className="text-xl sm:text-2xl md:text-3xl font-light text-white">
                {traffic.toFixed(1)}<span className="font-bold text-primary text-sm sm:text-lg md:text-xl ml-0.5 sm:ml-1">TBPS</span>
              </div>
              <div className="text-[8px] sm:text-[10px] uppercase tracking-wider sm:tracking-[0.2em] text-text-muted font-bold mt-1">
                Incoming Traffic
              </div>
            </div>
            <div 
              onClick={onOpenLatencyMap}
              className="cursor-pointer group"
              title="Click to open Latency & Coverage Map Box"
            >
              <div className="text-xl sm:text-2xl md:text-3xl font-light text-white group-hover:text-primary transition-colors flex items-baseline">
                {latency || "--"}<span className="font-bold text-primary text-sm sm:text-lg md:text-xl ml-0.5 sm:ml-1">ms</span>
                <MapPin size={12} className="ml-1 text-primary opacity-70 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="text-[8px] sm:text-[10px] uppercase tracking-wider sm:tracking-[0.2em] text-text-muted group-hover:text-primary font-black mt-1 flex items-center gap-1">
                <span>Latency</span>
                <span className="text-primary underline font-normal">• Map</span>
              </div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl md:text-3xl font-light text-white">
                12.0<span className="font-bold text-primary text-sm sm:text-lg md:text-xl ml-0.5 sm:ml-1">TBPS</span>
              </div>
              <div className="text-[8px] sm:text-[10px] uppercase tracking-wider sm:tracking-[0.2em] text-text-muted font-bold mt-1">
                Max Capacity
              </div>
            </div>
          </div>

          {/* Quick Mobile Status Pill */}
          <div 
            onClick={onOpenLatencyMap}
            className="mt-6 lg:hidden p-3 bg-slate-900/60 border border-border-subtle flex items-center justify-between cursor-pointer hover:border-primary/50 transition-all group active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <div>
                <div className="text-[8px] font-black uppercase tracking-widest text-text-muted">Edge Node Status</div>
                <div className="text-[11px] font-mono font-bold text-white uppercase flex items-center gap-1.5">
                  Operational • <span className="text-primary">{latency || 14}ms Ping</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-primary border border-primary/30 px-2 py-1 group-hover:bg-primary group-hover:text-white transition-all">
              <MapPin size={10} /> Map Box
            </div>
          </div>
        </div>

        <div className="relative hidden lg:block lg:col-span-5">
          <div className="relative aspect-[4/5] w-full sharp-card bg-slate-900/40 p-10 flex flex-col justify-between overflow-hidden">
            <div className="flex justify-between items-start relative z-10">
              <Activity className="text-primary" size={32} />
              <div className="text-right">
                <div className="text-[10px] text-text-muted uppercase font-black tracking-widest mb-1">
                  Server status
                </div>
                <div className="text-sm font-mono text-green-500 font-bold tracking-tighter">
                  OPERATIONAL
                </div>
              </div>
            </div>

            <div className="relative z-10 py-10">
              <div className="flex justify-between items-end mb-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary italic">SERVER MONITOR</span>
                <span className="text-[10px] font-mono text-white/50 tracking-tighter">STATION_04</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-none overflow-hidden mb-6">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: `${load}%` }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    repeatType: "mirror",
                  }}
                  className="h-full bg-primary shadow-[0_0_15px_rgba(220,38,38,0.6)]"
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-white font-bold tracking-widest">
                <div className="flex flex-col">
                  <span className="text-[8px] text-text-muted uppercase tracking-widest font-black">Incoming Traffic</span>
                  <span>{traffic.toFixed(1)} TBPS</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-[8px] text-text-muted uppercase tracking-widest font-black">Max Capacity</span>
                  <span className="text-text-dim/50">12.0 TBPS</span>
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-4 relative z-10">
              <div className="bg-bg-base/80 p-6 border border-border-subtle relative overflow-hidden group">
                <div className="absolute inset-0 bg-primary/5 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <div className="text-2xl font-black text-white tabular-nums tracking-tighter italic uppercase">
                  {currentPlanName || "UNASSOCIATED NODE"}
                </div>
                <div className="text-[10px] text-primary uppercase font-black tracking-[0.2em] mt-2">
                  CURRENT INFRASTRUCTURE TIER
                </div>
              </div>

              <div 
                onClick={onOpenLatencyMap}
                className="bg-bg-base/80 p-6 border border-border-subtle hover:border-primary/60 relative overflow-hidden group cursor-pointer transition-all"
                title="Click to open Google Map Box"
              >
                <div className="absolute inset-0 bg-primary/5 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <div className="text-3xl font-mono font-bold text-primary tabular-nums tracking-tighter italic uppercase flex items-center justify-between">
                  <span>{latency < 50 ? "ULTRA-LOW PING" : "OPTIMIZED"}</span>
                  <span className="text-[9px] font-sans font-black tracking-widest text-white/80 bg-primary/20 px-2 py-0.5 border border-primary/40 flex items-center gap-1">
                    <MapPin size={10} className="text-primary" /> GOOGLE MAP
                  </span>
                </div>
                <div className="text-[10px] text-text-muted uppercase font-black tracking-[0.2em] mt-2 flex items-center justify-between">
                   <span>SERVER SENSOR [8.8.8.8]: {latency} MS</span>
                   <span className="text-primary underline font-bold group-hover:text-white transition-colors">OPEN MAP BOX</span>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-4 -left-4 p-4 sharp-card bg-primary text-white z-20">
              <ShieldCheck size={24} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({
  setShowAdminLogin,
  onOpenLatencyMap,
  onOpenInstallModal,
  onOpenCompliance,
  onOpenSupport,
  activeTab = "home",
}: {
  setShowAdminLogin: (show: boolean) => void;
  onOpenLatencyMap?: () => void;
  onOpenInstallModal?: () => void;
  onOpenCompliance?: () => void;
  onOpenSupport?: () => void;
  activeTab?: string;
}) {
  const { user, isAdmin } = useAuth();
  const hideComplianceAndCredits = activeTab === "admin" || activeTab === "payment" || activeTab === "portal" || activeTab === "plans";
  const isAuthorizedAdmin = Boolean(user && isSuperAdminEmail(user.email));

  return (
    <footer className="py-12 sm:py-16 md:py-20 px-4 sm:px-6 pb-24 md:pb-20 border-t border-border-subtle bg-bg-surface/30">
      <div className="max-w-7xl mx-auto">
        {/* Balanced Bottom Sections: [ Compliance ] [ Credits & Development ] */}
        {/* Hidden on admin, payment, portal, and plans tabs */}
        {!hideComplianceAndCredits && (
          <FooterCreditsAndCompliance onOpenCompliance={onOpenCompliance} />
        )}

        {/* Footer Brand & Navigation Bar */}
        <div className={`flex flex-col md:flex-row justify-between items-center gap-8 sm:gap-10 text-center md:text-left ${!hideComplianceAndCredits ? 'pt-8 border-t border-border-subtle/50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg p-1 bg-slate-900/90 border border-primary/40 shadow-md shadow-primary/20 overflow-hidden flex items-center justify-center shrink-0">
              <img
                src="/hoticon2.png"
                alt="HOTFAST Logo"
                loading="lazy"
                decoding="async"
                width={36}
                height={36}
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-xl font-black uppercase italic tracking-tighter">
              HOTFAST<span className="text-primary not-italic">PH</span>
            </span>
          </div>

          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 md:gap-8 text-[10px] font-black uppercase tracking-[0.25em] sm:tracking-[0.3em] text-text-muted">
            {onOpenInstallModal && (
              <span 
                onClick={onOpenInstallModal}
                className="hover:text-primary cursor-pointer transition-colors flex items-center gap-1 text-primary p-1"
                title="Add HOTFAST App to Home Screen"
              >
                <Smartphone size={10} /> Install App
              </span>
            )}
            <span 
              onClick={onOpenLatencyMap}
              className="hover:text-primary cursor-pointer transition-colors p-1"
            >
              Infrastructure
            </span>
            <span 
              onClick={onOpenLatencyMap}
              className="hover:text-primary cursor-pointer transition-colors flex items-center gap-1 text-white/90 p-1"
              title="Open Google Map Box"
            >
              <MapPin size={10} className="text-primary animate-pulse" /> Latency Map
            </span>
            <span 
              onClick={onOpenSupport}
              className="hover:text-primary cursor-pointer transition-colors p-1"
              title="Customer Support Form (Telegram NOC)"
            >
              Support
            </span>
            {!hideComplianceAndCredits && (
              <>
                <span
                  id="footer-compliance-link"
                  onClick={onOpenCompliance}
                  className="hover:text-primary cursor-pointer transition-colors p-1"
                  title="Client Privacy and Data Protection"
                >
                  Compliance
                </span>
                <span
                  id="footer-credits-link"
                  onClick={() => {
                    document.getElementById('footer-credits-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="hover:text-primary cursor-pointer transition-colors p-1"
                  title="Hotfast IT & Operations Team"
                >
                  Credits &amp; Dev
                </span>
              </>
            )}
          </div>

          <div className="text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] text-text-muted flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
            <button
              id="footer-system-access-btn"
              onClick={() => setShowAdminLogin(true)}
              className="text-text-dim hover:text-primary transition-colors flex items-center gap-1 group py-1 px-2 cursor-pointer"
              title="System Access"
            >
              <Lock size={10} className="group-hover:animate-pulse" /> System Access
            </button>
            <span className="text-[9px] text-text-muted/80">© 2026 HF NETWORK CORP • HF-V40</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
