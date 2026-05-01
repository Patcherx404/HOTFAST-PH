/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Wifi,
  Zap,
  ShieldCheck,
  ArrowRight,
  CreditCard,
  Smartphone,
  HelpCircle,
  MapPin,
  Menu,
  X,
  Activity,
  History,
  LogIn,
  LogOut,
  User as UserIcon,
  Download,
  CheckCircle2,
  Loader2,
  Facebook,
  QrCode,
  Upload,
  Image as ImageIcon,
  ExternalLink,
  Receipt,
  Lock,
  Bell,
  AlertTriangle,
  Edit3,
  Trash2,
  Filter,
  Calendar,
  Clock,
  RefreshCw,
  UserMinus,
  Eye,
  Copy,
  MessageSquare,
  Send,
} from "lucide-react";
import { INTERNET_PLANS } from "./constants";
import { useAuth } from "./components/FirebaseProvider";
import { ChatWidget } from "./components/ChatWidget";
import {
  loginWithGoogle,
  logout,
  db,
  handleFirestoreError,
  OperationType,
} from "./lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  collectionGroup,
  updateDoc,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  increment,
} from "firebase/firestore";
import {
  InternetPlan,
  PaymentRecord,
  SystemNotification,
  UserProfile,
  BillingCycle,
  ChatSession,
  ChatMessage,
} from "./types";

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
  const [showNotifications, setShowNotifications] = useState(false);
  const [hasPendingPayment, setHasPendingPayment] = useState(false);

  // Logic to hide plans and payment if user already has an active, paid plan and it's not due soon
  const shouldHideBillingTabs = (() => {
    // If pending payment, hide it (previous user request)
    if (hasPendingPayment) return true;

    if (profile?.currentPlanId && profile?.dueDate && profile?.billStatus === "paid") {
      try {
        const dueDate = profile.dueDate.toDate ? profile.dueDate.toDate() : new Date(profile.dueDate);
        const now = new Date();
        const diffTime = dueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // If more than 3 days until due date, hide the tabs
        if (diffDays > 3) {
          return true;
        }
      } catch (e) {
        console.error("Error calculating due date visibility:", e);
      }
    }
    return false;
  })();

  // Sync plans with Firestore
  useEffect(() => {
    const q = query(collection(db, "plans"), orderBy("price", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        // Initialize plans if collection is empty
        INTERNET_PLANS.forEach(async (plan) => {
          await setDoc(doc(db, "plans", plan.id), {
            ...plan,
            updatedAt: serverTimestamp(),
          });
        });
      } else {
        const p = snapshot.docs.map(
          (doc) => ({ ...doc.data() }) as InternetPlan,
        );
        setPlans(p);
      }
    });

    return unsubscribe;
  }, []);

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
        (doc) => ({ id: doc.id, ...doc.data() }) as SystemNotification,
      );
      setNotifications(n);
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

  const [selectedPlan, setSelectedPlan] = useState<InternetPlan | null>(null);

  const handleSelectPlan = (plan: InternetPlan) => {
    if (!user) {
      localStorage.setItem("pendingPlanId", plan.id);
      loginWithGoogle();
      return;
    }
    setSelectedPlan(plan);
    setActiveTab("payment");
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
    if (adminUsername === "patcherx" && adminPassword === "Patcherx500") {
      setAdminAuth(true);
      setShowAdminLogin(false);
      setActiveTab("admin");
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
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-bg-base/90 backdrop-blur-md border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div
            className="flex items-center gap-2 md:gap-3 cursor-pointer group"
            onClick={() => setActiveTab("home")}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 overflow-hidden transform group-hover:rotate-12 transition-transform duration-500">
              <img
                src="/hoticon.png"
                alt="HOTFAST Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-xl md:text-2xl font-black tracking-tighter uppercase">
              HOTFAST<span className="text-primary italic">PH</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-10 text-[11px] font-bold uppercase tracking-[0.3em] text-text-dim">
            {(["home", "plans", "payment", "portal", "admin"] as const)
              .filter((t) => {
                if (!user && (t === "payment" || t === "portal" || t === "admin")) return false;
                if (t === "admin" && !adminAuth) return false;
                if (shouldHideBillingTabs && (t === "plans" || t === "payment")) return false;
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

          <div className="hidden md:flex items-center gap-6">
            {user ? (
              <div className="flex items-center gap-6">
                <div className="relative">
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="p-2 text-text-muted hover:text-primary transition-all relative"
                  >
                    <Bell size={20} />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-white text-[8px] font-black flex items-center justify-center rounded-full border-2 border-bg-base">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  <AnimatePresence>
                    {showNotifications && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-4 w-80 bg-bg-surface border border-border-subtle shadow-2xl z-[100] max-h-[400px] overflow-y-auto"
                      >
                        <div className="p-4 border-b border-border-subtle flex justify-between items-center bg-bg-base/50">
                          <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">
                            Alert Registry
                          </span>
                          {notifications.length > 0 && (
                            <span className="text-[9px] font-bold text-primary italic lowercase">
                              Real-time Feed
                            </span>
                          )}
                        </div>
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center text-[10px] font-bold uppercase tracking-widest text-text-muted italic">
                            No active alerts detected
                          </div>
                        ) : (
                          <div className="divide-y divide-border-subtle">
                            {notifications.map((n) => (
                              <div
                                key={n.id}
                                className={`p-4 hover:bg-white/5 transition-colors cursor-pointer ${!n.read ? "bg-primary/5" : ""}`}
                                onClick={() =>
                                  handleMarkNotificationAsRead(n.id)
                                }
                              >
                                <div className="flex gap-3">
                                  <div
                                    className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${n.type === "alert" ? "bg-red-500" : n.type === "warning" ? "bg-yellow-500" : "bg-primary"}`}
                                  />
                                  <div>
                                    <div className="text-[11px] font-black uppercase tracking-tight">
                                      {n.title}
                                    </div>
                                    <div className="text-[10px] text-text-muted leading-relaxed mt-1">
                                      {n.message}
                                    </div>
                                    <div className="text-[8px] font-mono mt-2 text-text-dim/50 italic">
                                      {n.createdAt?.toDate
                                        ? n.createdAt.toDate().toLocaleString()
                                        : "Just now"}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

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
                className="px-8 py-2.5 bg-primary hover:bg-primary-dark transition-all font-black uppercase tracking-widest text-[11px] flex items-center gap-2 italic"
              >
                <LogIn size={14} /> Account Access
              </button>
            )}
          </div>

          <button
            className="md:hidden p-2"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[100] bg-hot-black p-6 md:hidden flex flex-col"
          >
            <div className="flex justify-between items-center mb-16">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8">
                  <img src="/hoticon.png" alt="Logo" className="w-full h-full" />
                </div>
                <span className="text-xl font-black uppercase tracking-tighter">
                  HOTFAST<span className="text-primary italic">PH</span>
                </span>
              </div>
              <button 
                onClick={() => setIsMenuOpen(false)}
                className="p-2 text-text-muted hover:text-white"
              >
                <X size={32} />
              </button>
            </div>

            <div className="flex flex-col gap-8">
              {(["home", "plans", "payment", "portal", "admin"] as const)
                .filter((t) => {
                  if (!user && (t === "payment" || t === "portal" || t === "admin")) return false;
                  if (t === "admin" && !adminAuth) return false;
                  if (shouldHideBillingTabs && (t === "plans" || t === "payment")) return false;
                  return true;
                })
                .map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab);
                      setIsMenuOpen(false);
                    }}
                    className={`text-4xl font-black uppercase text-left tracking-tighter italic ${
                      activeTab === tab ? "text-primary" : "text-white"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              
              <div className="mt-8 pt-8 border-t border-border-subtle flex flex-col gap-6">
                {user ? (
                  <>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 border border-border-subtle rounded-full overflow-hidden">
                        <img src={user.photoURL || ""} className="w-full h-full object-cover" alt="Avatar" />
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase text-text-muted tracking-widest">Subscriber</div>
                        <div className="text-sm font-bold uppercase">{profile?.displayName}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        logout();
                        setIsMenuOpen(false);
                      }}
                      className="flex items-center gap-3 text-primary font-black uppercase text-xs tracking-[0.3em] italic"
                    >
                      <LogOut size={16} /> Disconnect Session
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      loginWithGoogle();
                      setIsMenuOpen(false);
                    }}
                    className="w-full py-5 bg-primary text-white font-black uppercase tracking-[0.3em] italic flex items-center justify-center gap-2"
                  >
                    <LogIn size={18} /> Account Access
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="pt-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === "home" && (
              <HeroSection 
                onExplore={() => setActiveTab("plans")} 
                onGoToPortal={() => setActiveTab("portal")}
                currentPlanName={currentPlan?.name} 
                hasPendingPayment={hasPendingPayment}
                shouldHideBilling={shouldHideBillingTabs}
              />
            )}
            {activeTab === "plans" && (
              <PlansSection plans={plans} onSelectPlan={handleSelectPlan} />
            )}
            {activeTab === "payment" && (
              <PaymentSection 
                plans={plans} 
                selectedPlan={selectedPlan} 
                onSuccess={() => setActiveTab("portal")}
              />
            )}
            {activeTab === "portal" && <CustomerPortal plans={plans} />}
            {activeTab === "admin" && adminAuth && (
              <AdminPanel
                plans={plans}
                onLogout={() => {
                  setAdminAuth(false);
                  setActiveTab("home");
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <ChatWidget />

      <Footer setShowAdminLogin={setShowAdminLogin} />

      <AnimatePresence>
        {showAdminLogin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-hot-black/95 flex items-center justify-center p-6 backdrop-blur-xl"
            onKeyDown={(e) => e.key === "Escape" && setShowAdminLogin(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="sharp-card p-10 md:p-12 max-w-sm w-full border-t-8 border-primary relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowAdminLogin(false)}
                className="absolute top-4 right-4 text-text-muted hover:text-white transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>

              <div className="text-center mb-10 text-white">
                <div className="w-16 h-16 mx-auto mb-6 opacity-80">
                  <img
                    src="/hoticon.png"
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

              <form onSubmit={handleAdminLogin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                    Username
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-sm font-mono text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                    Security Key
                  </label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-sm font-mono text-white"
                  />
                </div>

                {adminError && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-[9px] font-black uppercase tracking-widest text-center italic"
                  >
                    {adminError}
                  </motion.div>
                )}

                <button
                  type="submit"
                  className="w-full py-5 bg-primary text-white font-black uppercase text-[11px] tracking-widest italic hover:bg-primary-dark transition-all shadow-2xl shadow-primary/20"
                >
                  Authenticate
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HeroSection({ onExplore, onGoToPortal, currentPlanName, hasPendingPayment, shouldHideBilling }: { onExplore: () => void, onGoToPortal: () => void, currentPlanName?: string | null, hasPendingPayment: boolean, shouldHideBilling: boolean }) {
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

    const latencyInterval = setInterval(checkLatency, 3000);
    const metricsInterval = setInterval(updateMetrics, 2000);
    
    checkLatency();
    updateMetrics();

    return () => {
      clearInterval(latencyInterval);
      clearInterval(metricsInterval);
    };
  }, []);

  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] -z-10" />

      <div className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
        <div className="md:col-span-12 lg:col-span-7">
          <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-primary/10 border-l-2 border-primary text-primary text-[10px] font-black uppercase tracking-[0.3em] mb-10">
            {currentPlanName ? `INFRASTRUCTURE NODE: ${currentPlanName}` : "PH Edge Network Active"}
          </div>

          <h1 className="text-3xl sm:text-6xl md:text-9xl font-black leading-[0.85] tracking-tighter mb-10 uppercase italic">
            FIBER <span className="text-primary not-italic">EDGE</span>
            <br />
            RE<span className="text-primary">DEFINED</span>.
          </h1>

          <p className="text-lg text-text-dim max-w-lg mb-12 leading-relaxed font-medium">
            Aggressive fiber performance for the next-gen digital
            infrastructure. Minimal latency. Maximum throughput.
          </p>

          <div className="flex flex-wrap gap-4">
            {hasPendingPayment ? (
              <div className="px-10 py-5 bg-yellow-500/10 border border-yellow-500/50 text-yellow-500 font-black uppercase tracking-widest text-[10px] flex items-center gap-3 italic animate-pulse">
                <Clock size={18} /> SETTLEMENT VERIFICATION IN PROGRESS
              </div>
            ) : shouldHideBilling ? (
              <div className="px-10 py-5 bg-green-500/10 border border-green-500/50 text-green-400 font-black uppercase tracking-widest text-[10px] flex items-center gap-3 italic">
                <ShieldCheck size={18} /> INFRASTRUCTURE ACTIVE & SECURE
              </div>
            ) : (
              <button
                onClick={onExplore}
                className="px-10 py-5 bg-primary hover:bg-primary-dark text-white font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-primary/20 flex items-center gap-3 italic"
              >
                UPGRADE NOW <ArrowRight size={18} />
              </button>
            )}
            
            {shouldHideBilling && !hasPendingPayment && (
              <button
                onClick={onGoToPortal}
                className="px-10 py-5 bg-bg-surface border border-border-subtle hover:border-primary-dark transition-all text-white font-black uppercase tracking-widest text-xs flex items-center gap-3 italic"
              >
                OPEN PORTAL <ExternalLink size={16} />
              </button>
            )}
          </div>

          <div className="mt-16 grid grid-cols-3 gap-12 pt-10 border-t border-border-subtle">
            <div>
              <div className="text-3xl font-light text-white">
                {traffic.toFixed(1)}<span className="font-bold text-primary text-xl ml-1">TBPS</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold mt-1">
                Incoming Traffic
              </div>
            </div>
            <div>
              <div className="text-3xl font-light text-white">
                {latency || "--"}<span className="font-bold text-primary text-xl ml-1">ms</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-black mt-1">
                Latency (8.8.8.8)
              </div>
            </div>
            <div>
              <div className="text-3xl font-light text-white">12.0<span className="font-bold text-primary text-xl ml-1">TBPS</span></div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold mt-1">
                Max Capacity
              </div>
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

              <div className="bg-bg-base/80 p-6 border border-border-subtle relative overflow-hidden group">
                <div className="absolute inset-0 bg-primary/5 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <div className="text-3xl font-mono font-bold text-primary tabular-nums tracking-tighter italic uppercase">
                  {latency < 50 ? "ULTRA-LOW PING" : "OPTIMIZED"}
                </div>
                <div className="text-[10px] text-text-muted uppercase font-black tracking-[0.2em] mt-2">
                   SERVER SENSOR [8.8.8.8]: {latency} MS
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

function PlansSection({
  plans,
  onSelectPlan,
}: {
  plans: InternetPlan[];
  onSelectPlan: (plan: InternetPlan) => void;
}) {
  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <div className="text-center mb-20">
        <h2 className="text-5xl md:text-7xl font-black tracking-tighter mb-4 uppercase italic">
          INFRASTRUCTURE{" "}
          <span className="text-primary not-italic tracking-widest">TIERS</span>
        </h2>
        <p className="text-text-dim max-w-xl mx-auto text-sm uppercase tracking-widest font-bold">
          Pick your speed. Scaled for performance.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border border-border-subtle">
        {plans.map((plan, i) => (
          <div
            key={plan.id}
            className={`relative group p-6 md:p-10 transition-all border-b md:border-b-0 md:border-r border-border-subtle last:border-b-0 lg:last:border-r-0 hover:bg-primary/5 ${plan.isPopular ? "bg-slate-900/40" : ""}`}
          >
            {plan.isPopular && (
              <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
            )}

            <div className="mb-10">
              <div className="text-text-muted uppercase text-[10px] font-black tracking-[0.3em] mb-2">
                {plan.name}
              </div>
              <div className="text-5xl font-black italic tracking-tighter uppercase mb-2">
                {plan.speed}{" "}
                <span className="text-lg text-text-muted not-italic">Mbps</span>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-primary italic">
                {" "}
                {plan.bandwidth} DATA CAP{" "}
              </div>
            </div>

            <div className="mb-12 space-y-5">
              {plan.features.map((feature, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 text-xs font-bold uppercase tracking-tight text-white/80"
                >
                  <div className="w-1 h-1 bg-primary rotate-45 shrink-0" />
                  {feature}
                </div>
              ))}
            </div>

            <div className="mt-auto">
              <div className="text-2xl font-mono font-bold mb-8">
                ₱ {plan.price.toLocaleString()}{" "}
                <span className="text-xs text-text-muted font-sans uppercase tracking-widest font-black">
                  / mo
                </span>
              </div>
              <button
                onClick={() => onSelectPlan(plan)}
                className={`w-full py-5 font-black uppercase tracking-[0.2em] text-[10px] transition-all italic ${plan.isPopular ? "bg-primary hover:bg-primary-dark text-white" : "border border-border-subtle hover:border-primary/50 text-white"}`}
              >
                Select Tier
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PaymentSection({
  plans,
  selectedPlan,
  onSuccess,
}: {
  plans: InternetPlan[];
  selectedPlan: InternetPlan | null;
  onSuccess?: () => void;
}) {
  const { user, profile } = useAuth();
  const [accountNumber, setAccountNumber] = useState(
    profile?.accountNumber || "",
  );
  const [amount, setAmount] = useState(
    selectedPlan ? selectedPlan.price.toString() : "",
  );
  const [method, setMethod] = useState<"GCash" | "Maya" | "Card">("GCash");
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  
  // Selected receipt for admin panel view
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(
    null,
  );

  useEffect(() => {
    if (selectedPlan) setAmount(selectedPlan.price.toString());
  }, [selectedPlan]);

  useEffect(() => {
    if (profile?.accountNumber) setAccountNumber(profile.accountNumber);
  }, [profile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(selected);
    }
  };

  const handlePayment = async () => {
    if (!user) {
      alert("Please login first.");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) return;
    if (!file) {
      alert("Please upload your payment screenshot for verification.");
      return;
    }

    setProcessing(true);
    const path = `users/${user.uid}/payments`;
    try {
      // Mock screenshot URL using base64 for demo purposes
      const screenshotUrl = preview || "";

      await addDoc(collection(db, path), {
        userId: user.uid,
        accountNumber,
        amount: parseFloat(amount),
        method,
        status: "pending", // Manual verification needed
        createdAt: serverTimestamp(),
        referenceNumber: `PH-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        screenshotUrl,
      });

      setTimeout(() => {
        setProcessing(false);
        setSuccess(true);
        setFile(null);
        setPreview(null);
        
        // Auto-redirect back to portal after 3 seconds
        setTimeout(() => {
          setSuccess(false);
          if (onSuccess) onSuccess();
        }, 3000);
      }, 1500);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, path);
      setProcessing(false);
    }
  };

  if (success) {
    return (
      <section className="py-24 px-6 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="sharp-card p-12 text-center max-w-md w-full border-t-4 border-t-primary"
        >
          <div className="w-16 h-16 bg-primary/10 flex items-center justify-center mx-auto mb-8 transform rotate-45 border border-primary/30">
            <CheckCircle2
              className="text-primary transform -rotate-45"
              size={32}
            />
          </div>
          <h2 className="text-4xl font-black mb-4 uppercase italic tracking-tighter">
            SUBMITTED
          </h2>
          <p className="text-text-muted mb-6 text-[11px] uppercase tracking-[0.2em] font-bold">
            Screenshot received. Please wait for manual verification by our
            team.
          </p>

          <a
            href="#" // Replace with real FB page link
            className="flex items-center justify-center gap-2 text-primary font-black uppercase text-[10px] tracking-widest mb-10 hover:underline"
          >
            <Facebook size={14} /> Message us on FB for faster verification
          </a>

          <button
            onClick={() => setSuccess(false)}
            className="w-full py-5 bg-slate-900 border border-border-subtle hover:border-primary/50 text-[10px] font-black uppercase tracking-widest transition-all italic"
          >
            Back to Payments
          </button>
        </motion.div>
      </section>
    );
  }

  return (
    <section className="py-12 md:py-24 px-6 max-w-6xl mx-auto">
      <div className="sharp-card grid grid-cols-1 md:grid-cols-12 gap-0 overflow-hidden">
        {/* Left: QR & Details */}
        <div className="md:col-span-5 p-6 md:p-10 border-b md:border-b-0 md:border-r border-border-subtle bg-slate-900/20">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary mb-6">
            Settlement Channel
          </h3>

          <div className="mb-10 text-center">
            <div className="aspect-square bg-white p-4 inline-block transform rotate-2 shadow-2xl mb-4 group relative">
              <div className="w-48 h-48 sm:w-56 sm:h-56 bg-slate-100 flex items-center justify-center relative overflow-hidden">
                <img
                  src="/your-image.png"
                  alt="GCash QR"
                  className="w-full h-full object-contain"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-black text-primary uppercase">
                    Scan to Pay
                  </span>
                </div>
              </div>
            </div>
            
            <div className="mt-4 space-y-6">
              <div>
                <div className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] mb-1">
                  Primary Routing Terminal
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText("09122367040");
                    alert("Routing Number Copied: 09122367040");
                  }}
                  className="group relative inline-block"
                  title="Click to copy number"
                >
                  <div className="text-3xl font-mono font-bold text-primary tracking-tighter mt-1 italic group-hover:scale-105 transition-transform">
                    0912 236 7040
                  </div>
                  <div className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Copy size={14} className="text-primary" />
                  </div>
                </button>
                <div className="mt-2 flex items-center justify-center gap-2 text-[9px] font-bold text-primary/60 uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Automatic Settlement Active
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText("09122367040");
                    alert("Account Number 09122367040 Copied! You can now paste it in your GCash app.");
                  }}
                  className="inline-flex items-center gap-3 px-8 py-4 bg-primary text-white text-[11px] font-black uppercase tracking-[0.2em] italic hover:bg-hot-black border border-primary transition-all shadow-[0_10px_20px_rgba(220,38,38,0.3)] group cursor-pointer"
                >
                  <Copy size={14} className="group-hover:scale-110 transition-transform" />
                  Copy GCash Number
                </button>
                <p className="mt-4 text-[8px] text-text-muted font-bold uppercase tracking-widest leading-relaxed max-w-[200px] mx-auto">
                  Terminal number is copied to clipboard automatically. Dispatch to verified merchant upon verification.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <a
              href="#" // Replace with real FB page link
              className="w-full p-4 flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-lg shadow-blue-600/20"
            >
              <Facebook size={18} />
              <span className="font-black uppercase text-[10px] tracking-widest italic">
                SEND PROOF ON FB
              </span>
            </a>

            <div className="p-4 bg-bg-base border border-border-subtle">
              <p className="text-[10px] text-text-muted leading-relaxed font-bold uppercase tracking-tight">
                Send payment to the number above, then upload your receipt on
                the right to verify your transaction in our ledger.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Form & Upload */}
        <div className="md:col-span-7 p-6 md:p-12 bg-slate-900/30">
          <div className="space-y-8">
            {!selectedPlan && (
              <div className="bg-red-500/10 border border-red-500/50 p-6 mb-8 flex items-center gap-4 group">
                <div className="w-12 h-12 bg-red-500 flex items-center justify-center shrink-0">
                  <AlertTriangle className="text-white" size={24} />
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-1">Infrastructure Required</h4>
                  <p className="text-[9px] text-text-muted font-bold uppercase tracking-tight">
                    No active node selected. You must select an Infrastructure Tier to initialize settlement.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.3em] font-black text-text-muted">
                  Customer Identifier
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="HF-000000"
                  className="w-full bg-bg-base border border-border-subtle p-4 md:p-5 focus:outline-none focus:border-primary transition-colors text-lg md:text-xl font-mono uppercase tracking-widest placeholder:text-slate-800"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.3em] font-black text-text-muted">
                  Settlement Amount
                </label>
                <div className="w-full bg-slate-900 border border-primary/30 p-4 md:p-5 text-xl md:text-2xl font-mono text-primary font-bold italic flex items-center justify-between">
                  <span>₱ {selectedPlan ? selectedPlan.price.toLocaleString() : "0.00"}</span>
                  <span className="text-[8px] bg-primary/20 px-2 py-1 rounded uppercase tracking-[0.2em] font-black not-italic border border-primary/20">Fixed Rate</span>
                </div>
                {selectedPlan && (
                  <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest mt-2 italic px-1">
                    System locked: Integrated with {selectedPlan.name} tier
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] uppercase tracking-[0.3em] font-black text-text-muted">
                Screenshot Upload (Proof)
              </label>
              
              <div
                className={`relative border-2 border-dashed transition-all p-8 text-center flex flex-col items-center justify-center cursor-pointer ${preview ? "border-primary bg-primary/5" : "border-border-subtle hover:border-text-muted bg-bg-base"}`}
                onClick={() => document.getElementById("file-upload")?.click()}
              >
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {preview ? (
                  <div className="relative group">
                    <img
                      src={preview}
                      alt="Receipt preview"
                      className="max-h-48 rounded mb-4"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] font-black uppercase text-white">
                        Replace File
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="text-text-muted mb-4" size={32} />
                    <div className="text-[11px] font-black uppercase tracking-widest text-text-dim">
                      Drag Screenshot Here
                    </div>
                    <div className="text-[9px] text-text-muted uppercase mt-2">
                      JPG, PNG allowed (Max 5MB)
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              disabled={processing || !user || !amount || !file}
              onClick={handlePayment}
              className="w-full py-6 bg-primary hover:bg-primary-dark disabled:opacity-30 text-white font-black uppercase tracking-[0.3em] transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-4 italic active:scale-[0.98]"
            >
              {processing ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                <>
                  PROCESS SETTLEMENT <ArrowRight size={20} />
                </>
              )}
            </button>
            {!user && (
              <p className="text-[10px] text-center text-primary font-black uppercase tracking-widest italic leading-tight">
                Authentication required for storage tracking
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function CustomerPortal({ plans }: { plans: InternetPlan[] }) {
  const { user, profile } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(
    null,
  );

  const currentPlan = plans.find((p) => p.id === profile?.currentPlanId);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, `users/${user.uid}/payments`),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setPayments(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentRecord),
        );
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.LIST,
          `users/${user.uid}/payments`,
        );
      },
    );

    return unsubscribe;
  }, [user]);

  if (!user) return null;

  const totalPending = payments
    .filter((p) => p.status === "pending")
    .reduce((acc, p) => acc + p.amount, 0);

  return (
    <div className="py-12 px-6 max-w-7xl mx-auto space-y-px bg-border-subtle border border-border-subtle">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-px">
        <div className="md:col-span-8 bg-bg-base p-6 md:p-12 flex flex-col md:flex-row items-center justify-between text-center md:text-left gap-8">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-24 h-24 p-1 border border-border-subtle rounded-full overflow-hidden group">
              <img
                src={user.photoURL || ""}
                alt="avatar"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase text-text-muted tracking-[0.4em] mb-3">
                Network Profile
              </div>
              <div className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter">
                {profile?.displayName}
              </div>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-6 md:mt-4">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase text-text-muted tracking-widest mb-1.5 underline decoration-primary/30">Network Node</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-primary font-bold">
                      #{profile?.accountNumber}
                    </span>
                  </div>
                </div>

                <div className="w-px h-8 bg-border-subtle hidden sm:block mx-1" />

                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase text-text-muted tracking-widest mb-1.5 underline decoration-primary/30">Subscribed Tier</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-text-dim tracking-widest flex items-center gap-2">
                      <Activity size={10} className="text-primary" /> {currentPlan?.name || "Standard Account"}
                    </span>
                  </div>
                </div>

                <div className="w-px h-8 bg-border-subtle hidden sm:block mx-1" />

                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase text-text-muted tracking-widest mb-1.5 underline decoration-primary/30">Billing State</span>
                  <div className="flex items-center gap-2">
                    {profile?.billStatus === 'overdue' ? (
                      <>
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                        <span className="text-[10px] font-black uppercase text-red-500 tracking-widest italic flex items-center gap-1">
                          <AlertTriangle size={10} /> SERVICE SUSPENDED
                        </span>
                      </>
                    ) : profile?.billStatus === 'due' ? (
                      <>
                        <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-yellow-500 tracking-widest italic">
                          SETTLEMENT DUE
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-[10px] font-black uppercase text-green-500 tracking-widest italic tracking-wider">
                          SUBSCRIBER ACTIVE
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-4 bg-primary p-8 md:p-12 text-white flex flex-col justify-between">
          <div>
            <div className="text-[10px] font-black uppercase text-white/60 tracking-[0.4em] mb-4">
              Total Outstanding
            </div>
            <div className="text-5xl md:text-6xl font-mono font-bold italic tracking-tighter">
              ₱ {(profile?.balance ?? 0).toLocaleString()}
            </div>
            {totalPending > 0 && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/20 text-[9px] font-black uppercase tracking-widest italic">
                <Loader2 size={12} className="animate-spin" /> ₱{" "}
                {totalPending.toLocaleString()} Pending Verification
              </div>
            )}
          </div>
          <div className="mt-8 flex justify-between items-center border-t border-white/20 pt-6">
            <div className="text-[10px] font-black uppercase tracking-widest italic">
              {profile?.billStatus === 'overdue' 
                ? 'Action Required: Restricted Access' 
                : profile?.billStatus === 'due' 
                  ? 'Invoice Pending Settlement' 
                  : 'Billing Cycle Synchronized'}
            </div>
            <ArrowRight size={16} />
          </div>
        </div>
      </div>

      <div className="bg-bg-base p-0 relative">
        <div className="px-6 md:px-10 py-6 md:py-8 border-b border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-4">
          <h3 className="text-[10px] md:text-sm font-black uppercase tracking-[0.4em] flex items-center gap-3 italic text-primary">
            <History size={18} className="not-italic" /> Settlement Ledger
          </h3>
          <div className="flex gap-4">
            <button className="text-[10px] font-black uppercase text-text-muted tracking-widest hover:text-white transition-colors">
              Export CSV
            </button>
            <button className="text-[10px] font-black uppercase text-text-muted tracking-widest hover:text-white transition-colors">
              PDF Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="px-6 md:px-10 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle">
                  Timestamp
                </th>
                <th className="px-6 md:px-10 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle">
                  Reference ID
                </th>
                <th className="px-6 md:px-10 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle">
                  Channel
                </th>
                <th className="px-6 md:px-10 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle text-right">
                  Amount
                </th>
                <th className="px-6 md:px-10 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle text-right">
                  Receipt
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 md:px-10 py-20 text-center text-text-muted italic font-medium uppercase tracking-[0.2em] text-xs"
                  >
                    No transaction history detected
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border-subtle hover:bg-slate-900/30 transition-colors group"
                  >
                    <td className="px-6 md:px-10 py-6 md:py-8 text-[10px] md:text-xs font-bold uppercase tracking-tight text-text-dim whitespace-nowrap">
                      {p.createdAt?.toDate
                        ? p.createdAt
                            .toDate()
                            .toLocaleDateString("en-PH", {
                              month: "short",
                              day: "2-digit",
                              year: "numeric",
                            })
                        : "Processing"}
                    </td>
                    <td className="px-6 md:px-10 py-6 md:py-8 text-xs font-mono text-primary group-hover:text-white transition-colors whitespace-nowrap">
                      {p.referenceNumber}
                    </td>
                    <td className="px-6 md:px-10 py-6 md:py-8">
                      <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-slate-900 border border-border-subtle">
                        {p.method}
                      </span>
                    </td>
                    <td className="px-6 md:px-10 py-6 md:py-8 text-right font-mono font-bold text-lg md:text-xl italic tabular-nums whitespace-nowrap">
                      ₱ {p.amount.toLocaleString()}
                    </td>
                    <td className="px-6 md:px-10 py-6 md:py-8 text-right">
                      <button
                        onClick={() => setSelectedReceipt(p)}
                        className="p-2 border border-border-subtle hover:border-primary text-text-muted hover:text-primary transition-all"
                        title="View Receipt"
                      >
                        <Receipt size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Receipt Modal */}
        <AnimatePresence>
          {selectedReceipt && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-bg-base/90 backdrop-blur-md flex items-center justify-center p-6"
              onClick={() => setSelectedReceipt(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="sharp-card bg-bg-base max-w-lg w-full overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-primary p-6 text-white flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Receipt size={20} />
                    <span className="font-black uppercase tracking-widest italic">
                      Digital Receipt
                    </span>
                  </div>
                  <button onClick={() => setSelectedReceipt(null)}>
                    <X size={20} />
                  </button>
                </div>

                <div className="p-8 space-y-6">
                  <div className="flex justify-between border-b border-border-subtle pb-4">
                    <span className="text-[10px] font-black uppercase text-text-muted">
                      REFERENCE
                    </span>
                    <span className="font-mono text-xs font-bold text-primary">
                      {selectedReceipt.referenceNumber}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border-subtle pb-4">
                    <span className="text-[10px] font-black uppercase text-text-muted">
                      DATE
                    </span>
                    <span className="text-xs font-bold uppercase">
                      {selectedReceipt.createdAt?.toDate
                        ? selectedReceipt.createdAt.toDate().toLocaleString()
                        : "Processing"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border-subtle pb-4">
                    <span className="text-[10px] font-black uppercase text-text-muted">
                      AMOUNT PAID
                    </span>
                    <span className="text-2xl font-mono font-bold italic text-primary">
                      ₱ {selectedReceipt.amount.toLocaleString()}
                    </span>
                  </div>

                  {selectedReceipt.screenshotUrl && (
                    <div className="space-y-3">
                      <span className="text-[10px] font-black uppercase text-text-muted flex items-center gap-2">
                        <ImageIcon size={12} /> Verification Snapshot
                      </span>
                      <div className="aspect-video bg-slate-900 border border-border-subtle overflow-hidden relative group">
                        <img
                          src={selectedReceipt.screenshotUrl}
                          alt="Receipt proof"
                          className="w-full h-full object-contain"
                        />
                        <a
                          href={selectedReceipt.screenshotUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-[10px] font-black uppercase tracking-widest"
                        >
                          <ExternalLink size={14} /> View Large Image
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 text-center">
                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest italic leading-tight">
                      Electronically recorded ledger item • Verification pending
                      manual review
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Footer({
  setShowAdminLogin,
}: {
  setShowAdminLogin: (show: boolean) => void;
}) {
  const { user, isAdmin } = useAuth();
  return (
    <footer className="py-24 px-6 border-t border-border-subtle bg-bg-surface/30">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 transform rotate-12 flex items-center justify-center overflow-hidden">
            <img
              src="/hoticon.png"
              alt="HOTFAST Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="text-xl font-black uppercase italic tracking-tighter">
            HOTFAST<span className="text-primary not-italic">PH</span>
          </span>
        </div>

        <div className="flex flex-wrap justify-center gap-10 text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">
          <span className="hover:text-primary cursor-pointer transition-colors">
            Infrastructure
          </span>
          <span className="hover:text-primary cursor-pointer transition-colors">
            Latency Map
          </span>
          <span className="hover:text-primary cursor-pointer transition-colors">
            Support
          </span>
          <span className="hover:text-primary cursor-pointer transition-colors">
            Compliance
          </span>
        </div>

        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-6">
          <button
            onClick={() => setShowAdminLogin(true)}
            className="text-text-dim hover:text-primary transition-colors flex items-center gap-1 group"
          >
            <Lock size={10} className="group-hover:animate-pulse" /> System
            Access
          </button>
          <span>© 2026 HF NETWORK CORP • BUILD 8.4.2 STABLE</span>
        </div>
      </div>
    </footer>
  );
}

function AdminPanel({
  plans,
  onLogout,
}: {
  plans: InternetPlan[];
  onLogout: () => void;
}) {
  const { user, isAdmin: firebaseIsAdmin } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(
    null,
  );
  const [adminTab, setAdminTab] = useState<"payments" | "plans" | "clients" | "cycles" | "chats">(
    "payments",
  );
  const [billingCycles, setBillingCycles] = useState<BillingCycle[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatSession | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const [editingCycle, setEditingCycle] = useState<BillingCycle | null>(null);
  const [processingCycle, setProcessingCycle] = useState<string | null>(null);
  const [cycleToDelete, setCycleToDelete] = useState<BillingCycle | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "pending" | "failed">("all");
  const [editingPlan, setEditingPlan] = useState<InternetPlan | null>(null);
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentRecord | null>(null);
  const [viewingScreenshot, setViewingScreenshot] = useState<string | null>(null);
  const [clientToDelete, setClientToDelete] = useState<UserProfile | null>(null);
  const [notifyingUser, setNotifyingUser] = useState<UserProfile | null>(null);
  const [notifForm, setNotifForm] = useState({
    title: "",
    message: "",
    type: "info" as any,
  });

  useEffect(() => {
    // We only fetch if the user is authenticated in Firebase AND belongs to admin collection
    if (!user || !firebaseIsAdmin) {
      setLoading(false);
      return;
    }

    // Fetch ALL payments using collection group
    const q = query(
      collectionGroup(db, "payments"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const p = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as PaymentRecord,
        );
        setPayments(p);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "all-payments");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [user, firebaseIsAdmin]);

  useEffect(() => {
    if (!user || !firebaseIsAdmin) return;

    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const c = snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }) as UserProfile);
      setClients(c);
    });

    return unsubscribe;
  }, [user, firebaseIsAdmin]);

  useEffect(() => {
    if (!user || !firebaseIsAdmin) return;

    const q = query(
      collection(db, "billing_cycles"),
      orderBy("startDate", "desc"),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cy = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as BillingCycle,
      );
      setBillingCycles(cy);
    });

    return unsubscribe;
  }, [user, firebaseIsAdmin]);

  useEffect(() => {
    if (!user || !firebaseIsAdmin) return;

    const q = query(
      collection(db, "chats"),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSession));
      setChatSessions(chats);
    });

    return unsubscribe;
  }, [user, firebaseIsAdmin]);

  useEffect(() => {
    if (!user || !firebaseIsAdmin || !selectedChat) {
      setChatMessages([]);
      return;
    }

    const q = query(
      collection(db, `chats/${selectedChat.userId}/messages`),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setChatMessages(msgs);
    });

    return unsubscribe;
  }, [user, firebaseIsAdmin, selectedChat]);

  const handleSaveCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCycle) return;
    try {
      const cycleRef = editingCycle.id
        ? doc(db, "billing_cycles", editingCycle.id)
        : doc(collection(db, "billing_cycles"));

      const cycleData = {
        ...editingCycle,
        id: cycleRef.id,
        createdAt: editingCycle.createdAt || serverTimestamp(),
      };

      await setDoc(cycleRef, cycleData);
      setEditingCycle(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, "billing_cycles");
    }
  };

  const confirmCycleDeletion = async () => {
    if (!cycleToDelete) return;
    try {
      await deleteDoc(doc(db, "billing_cycles", cycleToDelete.id));
      setCycleToDelete(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `billing_cycles/${cycleToDelete.id}`);
    }
  };

  const triggerBillingRoutine = async (cycle: BillingCycle) => {
    setProcessingCycle(cycle.id);
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const today = new Date();
      const cycleDueDate = cycle.dueDate?.toDate
        ? cycle.dueDate.toDate()
        : new Date(cycle.dueDate);

      const promises = usersSnap.docs.map(async (userDoc) => {
        const userData = userDoc.data() as UserProfile;
        let newStatus = userData.billStatus;

        const gracePeriodDate = new Date(cycleDueDate);
        gracePeriodDate.setDate(gracePeriodDate.getDate() + 2);

        if (userData.balance > 0) {
          if (today > gracePeriodDate) {
            newStatus = "overdue";
          } else if (today > cycleDueDate) {
            newStatus = "due";
          } else {
            newStatus = "due"; // Still due if balance > 0
          }
        } else {
          newStatus = "paid";
        }

        if (newStatus !== userData.billStatus) {
          await updateDoc(userDoc.ref, {
            billStatus: newStatus,
            dueDate: cycle.dueDate,
          });
        }
      });

      await Promise.all(promises);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "users-billing-sync");
    } finally {
      setProcessingCycle(null);
    }
  };

  const filteredPayments = payments.filter((p) => {
    if (statusFilter === "all") return true;
    return p.status === statusFilter;
  });

  const updateStatus = async (
    payment: PaymentRecord,
    status: "completed" | "failed",
  ) => {
    if (!payment.id) return;
    const oldStatus = payment.status;
    try {
      const paymentRef = doc(
        db,
        `users/${payment.userId}/payments/${payment.id}`,
      );
      await updateDoc(paymentRef, { status, updatedAt: serverTimestamp() });

      const userRef = doc(db, "users", payment.userId);
      
      // If marked as completed and it wasn't completed before, subtract from user balance
      if (status === "completed" && oldStatus !== "completed") {
        await updateDoc(userRef, {
          balance: increment(-payment.amount),
          billStatus: "paid",
        });
      } 
      // If was completed and now changed to failed/pending, add back to user balance
      else if (status !== "completed" && oldStatus === "completed") {
        await updateDoc(userRef, {
          balance: increment(payment.amount),
          billStatus: "due",
        });
      }
    } catch (e) {
      handleFirestoreError(
        e,
        OperationType.UPDATE,
        `users/${payment.userId}/payments/${payment.id}`,
      );
    }
  };

  const deletePayment = (payment: PaymentRecord) => {
    setPaymentToDelete(payment);
  };

  const confirmPaymentDeletion = async () => {
    if (!paymentToDelete || !paymentToDelete.id) return;
    try {
      const paymentPath = `users/${paymentToDelete.userId}/payments/${paymentToDelete.id}`;
      const paymentRef = doc(db, paymentPath);
      await deleteDoc(paymentRef);
      setPaymentToDelete(null);
    } catch (e) {
      console.error("Delete failure:", e);
      handleFirestoreError(
        e,
        OperationType.DELETE,
        `users/${paymentToDelete.userId}/payments/${paymentToDelete.id}`,
      );
    }
  };

  const updateClientBalance = async (userId: string, newBalance: number) => {
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { balance: newBalance });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const deleteSubscriber = (client: UserProfile) => {
    setClientToDelete(client);
  };

  const confirmSubscriberDeletion = async () => {
    if (!clientToDelete || !clientToDelete.uid) return;
    try {
      await deleteDoc(doc(db, "users", clientToDelete.uid));
      setClientToDelete(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${clientToDelete.uid}`);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !reply.trim()) return;

    const text = reply.trim();
    setReply("");

    try {
      await addDoc(collection(db, `chats/${selectedChat.userId}/messages`), {
        text,
        senderId: user?.uid,
        senderRole: "admin",
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "chats", selectedChat.userId), {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${selectedChat.userId}/messages`);
    }
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    try {
      const planRef = doc(db, "plans", editingPlan.id);
      await setDoc(planRef, { ...editingPlan, updatedAt: serverTimestamp() });
      setEditingPlan(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `plans/${editingPlan.id}`);
    }
  };

  const handleDeletePlan = (id: string) => {
    setPlanToDelete(id);
  };

  const confirmDeletion = async () => {
    if (!planToDelete) return;
    try {
      const planRef = doc(db, "plans", planToDelete);
      await deleteDoc(planRef);
      setPlanToDelete(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `plans/${planToDelete}`);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyingUser) return;
    try {
      const notifRef = collection(
        db,
        `users/${notifyingUser.uid}/notifications`,
      );
      await addDoc(notifRef, {
        ...notifForm,
        read: false,
        createdAt: serverTimestamp(),
      });
      setNotifyingUser(null);
      setNotifForm({ title: "", message: "", type: "info" });
    } catch (e) {
      handleFirestoreError(
        e,
        OperationType.CREATE,
        `users/${notifyingUser.uid}/notifications`,
      );
    }
  };

  const updateClientStatus = async (
    userId: string,
    cycleStatus: "paid" | "due" | "overdue",
  ) => {
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { billStatus: cycleStatus });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <div className="mb-12 space-y-12">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-8">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary mb-4">
              Command Center
            </h3>
            <h2 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter leading-tight">
              MANAGEMENT
              <br />
              <span className="text-primary not-italic">OVERRIDE</span>
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full xl:w-auto bg-bg-surface p-2 border border-border-subtle">
            <div className="flex overflow-x-auto gap-1 no-scrollbar scroll-smooth">
              <button
                onClick={() => setAdminTab("payments")}
                className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === "payments" ? "bg-primary text-white italic" : "text-text-muted hover:text-white"}`}
              >
                Settlements
              </button>
              <button
                  onClick={() => setAdminTab('plans')}
                  className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === 'plans' ? 'bg-primary text-white italic' : 'text-text-muted hover:text-white'}`}
                >
                  Infrastructure
                </button>
              <button
                onClick={() => setAdminTab("clients")}
                className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === "clients" ? "bg-primary text-white italic" : "text-text-muted hover:text-white"}`}
              >
                Subscribers
              </button>
              <button
                onClick={() => setAdminTab("cycles")}
                className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === "cycles" ? "bg-primary text-white italic" : "text-text-muted hover:text-white"}`}
              >
                Cycles
              </button>
              <button
                onClick={() => setAdminTab("chats")}
                className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${adminTab === "chats" ? "bg-primary text-white italic" : "text-text-muted hover:text-white"}`}
              >
                Support
              </button>
            </div>
            
            <div className="h-10 w-px bg-border-subtle hidden sm:block mx-2" />
            
            <button
              onClick={onLogout}
              className="px-6 py-3 bg-red-600/10 border border-red-600/20 text-red-600 hover:bg-red-600 hover:text-white flex items-center justify-center gap-2 transition-all uppercase text-[10px] font-black italic shadow-lg shadow-red-600/5 group"
            >
              <LogOut size={14} className="group-hover:translate-x-1 transition-transform" />
              Terminate Session
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-bg-surface p-6 border border-border-subtle hover:border-primary/30 transition-colors group">
            <div className="flex justify-between items-start mb-4">
              <div className="text-[10px] font-black uppercase text-text-muted tracking-widest">
                Ledger entries
              </div>
              <div className="p-2 bg-primary/10 text-primary">
                <Receipt size={16} />
              </div>
            </div>
            <div className="text-4xl font-mono font-bold italic tracking-tighter group-hover:scale-105 transition-transform origin-left">
              {payments.length}
            </div>
            <div className="mt-4 text-[9px] text-text-dim uppercase font-bold tracking-tight">Active transaction logs</div>
          </div>

          <div className="bg-bg-surface p-6 border border-border-subtle hover:border-yellow-500/30 transition-colors group">
            <div className="flex justify-between items-start mb-4">
              <div className="text-[10px] font-black uppercase text-text-muted tracking-widest">
                Pending Verification
              </div>
              <div className="p-2 bg-yellow-500/10 text-yellow-500">
                <Clock size={16} />
              </div>
            </div>
            <div className="text-4xl font-mono font-bold italic tracking-tighter text-yellow-500 group-hover:scale-105 transition-transform origin-left">
              {payments.filter((p) => p.status === "pending").length}
            </div>
            <div className="mt-4 text-[9px] text-text-dim uppercase font-bold tracking-tight">Awaiting manual override</div>
          </div>

          <div className="bg-bg-surface p-6 border border-border-subtle hover:border-primary/30 transition-colors group">
            <div className="flex justify-between items-start mb-4">
              <div className="text-[10px] font-black uppercase text-text-muted tracking-widest">
                Total Outstanding
              </div>
              <div className="p-2 bg-primary/10 text-primary">
                <span className="text-xs font-bold font-mono">₱</span>
              </div>
            </div>
            <div className="text-4xl font-mono font-bold italic tracking-tighter text-primary group-hover:scale-105 transition-transform origin-left">
              ₱ {clients.reduce((acc, c) => acc + (c.balance ?? 0), 0).toLocaleString()}
            </div>
            <div className="mt-4 text-[9px] text-text-dim uppercase font-bold tracking-tight">Projected settlement volume</div>
          </div>
        </div>

        <div className="flex justify-end">
          {adminTab === "plans" && (
            <button
              onClick={() =>
                setEditingPlan({
                  id: `node-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
                  name: "NEW INFRASTRUCTURE NODE",
                  speed: 100,
                  bandwidth: "UNLIMITED",
                  price: 1500,
                  features: ["ULTRA-LOW LATENCY", "FIBER OPTIC BASE"],
                  isPopular: false,
                })
              }
              className="px-8 py-4 bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] italic hover:bg-hot-black border border-primary transition-all shadow-[0_10px_30px_rgba(220,38,38,0.3)] animate-pulse"
            >
              + DEPLOY NEW NODE
            </button>
          )}
          {adminTab === "cycles" && (
            <button
              onClick={() =>
                setEditingCycle({
                  id: "",
                  name: `CYCLE ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase()}`,
                  startDate: "",
                  endDate: "",
                  dueDate: "",
                  status: "active",
                  createdAt: serverTimestamp(),
                })
              }
              className="px-8 py-4 bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] italic hover:bg-hot-black border border-primary transition-all shadow-[0_10px_30px_rgba(220,38,38,0.3)] animate-pulse"
            >
              + NEW BILLING CYCLE
            </button>
          )}
        </div>
      </div>
      <AnimatePresence>
        <NotificationModal
          notifyingUser={notifyingUser}
          setNotifyingUser={setNotifyingUser}
          notifForm={notifForm}
          setNotifForm={setNotifForm}
          handleSendNotification={handleSendNotification}
        />
        <BillingCycleModal
          editingCycle={editingCycle}
          setEditingCycle={setEditingCycle}
          handleSaveCycle={handleSaveCycle}
        />
        {planToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10001] bg-hot-black/95 flex items-center justify-center p-6 backdrop-blur-lg"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="sharp-card p-10 max-w-md w-full border-t-8 border-red-600 bg-bg-base shadow-2xl"
            >
              <div className="flex items-center gap-4 text-red-600 mb-6 font-black uppercase italic tracking-tighter">
                <AlertTriangle size={32} />
                <h3 className="text-2xl">
                  CRITICAL <span className="text-white not-italic">ACTION</span>
                </h3>
              </div>
              
              <p className="text-sm font-medium text-text-muted leading-relaxed mb-8">
                Are you sure you want to delete this plan? This action cannot be undone. All associated node configurations for this tier will be scrubbed from the registry.
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={confirmDeletion}
                  className="w-full py-5 bg-red-600 text-white font-black uppercase text-[12px] tracking-[0.3em] italic hover:bg-red-700 transition-all shadow-xl shadow-red-600/20"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setPlanToDelete(null)}
                  className="w-full py-3 text-[10px] font-black uppercase text-text-muted hover:text-white tracking-[0.4em] transition-all italic underline"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {(!user || !firebaseIsAdmin) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 p-8 border-2 border-dashed border-primary/30 bg-primary/5 text-center space-y-4"
        >
          <div className="flex justify-center">
            <Lock className="text-primary" size={32} />
          </div>
          <h3 className="text-lg font-black uppercase italic tracking-tight">
            Database Access Restricted
          </h3>
          <p className="max-w-md mx-auto text-[11px] text-text-muted font-bold uppercase tracking-widest leading-relaxed">
            You have authenticated with the system key, but your current Google
            identity is not recognized as a Database Admin. Please sign in with
            Google using an authorized account to access private records.
          </p>
          {!user && (
            <button
              onClick={loginWithGoogle}
              className="px-8 py-3 bg-primary text-white font-black uppercase text-[10px] tracking-[0.2em] italic hover:bg-primary-dark transition-all"
            >
              Sign in with Google
            </button>
          )}
        </motion.div>
      )}

      {adminTab === "payments" ? (
        <div className="space-y-4">
          <div className="flex justify-start px-8 py-4 bg-bg-surface border border-border-subtle mb-4">
            <div className="flex items-center gap-3">
              <Filter size={14} className="text-text-muted" />
              <div className="flex gap-4">
                {(["all", "pending", "completed", "failed"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`text-[10px] font-black uppercase tracking-widest transition-all ${
                      statusFilter === status
                        ? "text-primary underline underline-offset-8 decoration-2"
                        : "text-text-muted hover:text-white"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="sharp-card bg-bg-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg-surface/50">
                    <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle text-center">
                      User
                    </th>
                    <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle">
                      Date
                    </th>
                    <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle">
                      Reference
                    </th>
                    <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle">
                      Amount
                    </th>
                    <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle">
                      Status
                    </th>
                    <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-20 text-center">
                        <Loader2
                          className="animate-spin mx-auto text-primary"
                          size={32}
                        />
                      </td>
                    </tr>
                  ) : filteredPayments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-8 py-20 text-center text-text-muted uppercase text-[10px] font-black tracking-widest italic"
                      >
                        {payments.length === 0 ? "Infrastructure records empty" : `No ${statusFilter} records found`}
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((p) => (
                      <tr
                      key={p.id}
                      className="group hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="px-8 py-6 border-b border-border-subtle text-center">
                        <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center mx-auto text-[10px] font-bold">
                          {p.userId?.substring(0, 2).toUpperCase() || "??"}
                        </div>
                      </td>
                      <td className="px-8 py-6 border-b border-border-subtle">
                        <div className="text-[11px] font-bold uppercase">
                          {p.createdAt?.toDate
                            ? p.createdAt.toDate().toLocaleDateString()
                            : "..."}
                        </div>
                        <div className="text-[9px] text-text-muted font-mono">
                          {p.createdAt?.toDate
                            ? p.createdAt.toDate().toLocaleTimeString()
                            : ""}
                        </div>
                      </td>
                      <td className="px-8 py-6 border-b border-border-subtle font-mono text-xs text-primary">
                        {p.referenceNumber}
                      </td>
                      <td className="px-8 py-6 border-b border-border-subtle font-mono font-bold text-sm italic">
                        ₱ {p.amount.toLocaleString()}
                      </td>
                      <td className="px-8 py-6 border-b border-border-subtle">
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 border ${p.status === "completed" ? "text-green-500 border-green-500/20 bg-green-500/5" : p.status === "failed" ? "text-red-500 border-red-500/20 bg-red-500/5" : "text-yellow-500 border-yellow-500/20 bg-yellow-500/5"}`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-8 py-6 border-b border-border-subtle text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedReceipt(p)}
                            className="p-2 border border-border-subtle hover:border-primary text-text-muted hover:text-primary transition-all"
                            title="View Receipt"
                          >
                            <Receipt size={16} />
                          </button>
                          {p.status === "pending" && p.screenshotUrl && (
                            <button
                              onClick={() => setViewingScreenshot(p.screenshotUrl)}
                              className="p-2 border border-primary/30 text-primary hover:bg-primary hover:text-white transition-all flex items-center gap-1"
                              title="View Screenshot"
                            >
                              <Eye size={16} />
                              <span className="text-[8px] font-black uppercase">View Screenshot</span>
                            </button>
                          )}
                          {p.status === "pending" && (
                            <>
                              <button
                                onClick={() => updateStatus(p, "completed")}
                                className="p-2 border border-green-500/30 text-green-500 hover:bg-green-500 hover:text-white transition-all"
                                title="Approve"
                              >
                                <CheckCircle2 size={16} />
                              </button>
                              <button
                                onClick={() => updateStatus(p, "failed")}
                                className="p-2 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                                title="Reject"
                              >
                                <X size={16} />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => deletePayment(p)}
                            className="p-2 border border-red-500/10 text-text-muted hover:border-red-500 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                            title="Delete Record"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ) : adminTab === "plans" ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="sharp-card bg-bg-surface p-8 relative overflow-hidden group"
            >
              {plan.isPopular && (
                <div className="absolute top-0 right-0 p-2 bg-primary text-white text-[8px] font-black uppercase tracking-widest italic transform rotate-12 translate-x-2 -translate-y-1 shadow-lg">
                  Popular
                </div>
              )}
              <div className="text-[10px] font-black uppercase text-text-muted tracking-widest mb-2">
                {plan.id}
              </div>
              <h4 className="text-xl font-black uppercase italic tracking-tighter mb-4">
                {plan.name}
              </h4>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-end border-b border-border-subtle pb-2">
                  <span className="text-[9px] font-bold text-text-dim uppercase tracking-widest">
                    Speed
                  </span>
                  <span className="text-xl font-mono font-bold text-primary">
                    {plan.speed}{" "}
                    <span className="text-[10px] font-sans uppercase not-italic text-text-muted">
                      Mbps
                    </span>
                  </span>
                </div>
                <div className="flex justify-between items-end border-b border-border-subtle pb-2">
                  <span className="text-[9px] font-bold text-text-dim uppercase tracking-widest">
                    Bandwidth
                  </span>
                  <span className="text-sm font-bold text-white uppercase italic">
                    {plan.bandwidth}
                  </span>
                </div>
                <div className="flex justify-between items-end border-b border-border-subtle pb-2">
                  <span className="text-[9px] font-bold text-text-dim uppercase tracking-widest">
                    Price
                  </span>
                  <span className="text-xl font-mono font-bold italic">
                    ₱ {plan.price.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setEditingPlan(plan)}
                  className="flex-1 py-3 border border-primary/30 text-primary hover:bg-primary hover:text-white text-[10px] font-black uppercase tracking-widest italic transition-all"
                >
                  Modify
                </button>
                <button
                  onClick={() => handleDeletePlan(plan.id)}
                  className="p-3 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                  title="Delete Plan"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : adminTab === "cycles" ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {billingCycles.map((cycle) => (
            <div
              key={cycle.id}
              className={`sharp-card p-8 bg-bg-surface border-l-8 ${cycle.status === "active" ? "border-primary" : "border-text-muted"}`}
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h4 className="text-xl font-black uppercase italic tracking-tighter">
                    {cycle.name}
                  </h4>
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border ${cycle.status === "active" ? "text-primary border-primary/20" : "text-text-muted border-border-subtle"}`}
                  >
                    {cycle.status}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingCycle(cycle)}
                    className="p-2 text-text-muted hover:text-white"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    onClick={() => setCycleToDelete(cycle)}
                    className="p-2 text-text-muted hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between text-[10px] uppercase font-black tracking-widest text-text-muted border-b border-border-subtle pb-2">
                  <span>Start</span>
                  <span className="text-white">
                    {cycle.startDate?.toDate
                      ? cycle.startDate.toDate().toLocaleDateString()
                      : cycle.startDate}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] uppercase font-black tracking-widest text-text-muted border-b border-border-subtle pb-2">
                  <span>End</span>
                  <span className="text-white">
                    {cycle.endDate?.toDate
                      ? cycle.endDate.toDate().toLocaleDateString()
                      : cycle.endDate}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] uppercase font-black tracking-widest text-primary border-b border-primary/20 pb-2 italic">
                  <span>Payment Deadline</span>
                  <span className="font-bold">
                    {cycle.dueDate?.toDate
                      ? cycle.dueDate.toDate().toLocaleDateString()
                      : cycle.dueDate}
                  </span>
                </div>
              </div>

              <button
                disabled={processingCycle === cycle.id || cycle.status !== "active"}
                onClick={() => triggerBillingRoutine(cycle)}
                className="w-full py-4 bg-bg-base border border-border-subtle hover:border-primary text-primary hover:text-white text-[10px] font-black uppercase tracking-widest italic transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {processingCycle === cycle.id ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <RefreshCw
                    size={14}
                    className="group-hover:rotate-180 transition-transform duration-700"
                  />
                )}
                Run Billing Sync
              </button>
            </div>
          ))}
        </div>
      ) : adminTab === "chats" ? (
        <div className="flex flex-col lg:flex-row gap-6 h-[600px]">
          {/* Chat List */}
          <div className="w-full lg:w-80 bg-bg-surface border border-border-subtle flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border-subtle bg-bg-surface">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted">Active Conversations</h4>
            </div>
            <div className="flex-1 overflow-y-auto">
              {chatSessions.length === 0 ? (
                <div className="p-8 text-center text-[10px] font-bold text-text-muted uppercase">No active chats</div>
              ) : (
                chatSessions.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => setSelectedChat(chat)}
                    className={`w-full p-4 border-b border-border-subtle text-left transition-all hover:bg-bg-base/50 ${selectedChat?.id === chat.id ? "bg-bg-base border-r-4 border-r-primary" : ""}`}
                  >
                    <div className="font-black uppercase italic text-xs mb-1">{chat.userName}</div>
                    <div className="text-[10px] text-text-muted truncate">{chat.lastMessage || "No messages yet"}</div>
                    <div className="text-[8px] text-primary mt-2 font-bold uppercase">
                      {chat.updatedAt?.toDate ? chat.updatedAt.toDate().toLocaleString() : "..."}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat Window */}
          <div className="flex-1 bg-bg-surface border border-border-subtle flex flex-col overflow-hidden relative">
            {selectedChat ? (
              <>
                <div className="p-4 bg-bg-surface border-b border-border-subtle flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      <UserIcon size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase italic tracking-widest">{selectedChat.userName}</h3>
                      <p className="text-[9px] text-text-muted font-bold">UID: {selectedChat.userId}</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-bg-base/30">
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.senderRole === "admin" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] p-4 text-xs ${msg.senderRole === "admin" ? "bg-primary text-white italic rounded-l-xl rounded-tr-xl shadow-lg shadow-primary/10" : "bg-bg-surface border border-border-subtle text-white rounded-r-xl rounded-tl-xl"}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSendReply} className="p-4 bg-bg-surface border-t border-border-subtle flex gap-4">
                  <input
                    type="text"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Type your response..."
                    className="flex-1 bg-bg-base border border-border-subtle p-4 text-xs text-white focus:outline-none focus:border-primary transition-all placeholder:text-text-muted italic"
                  />
                  <button
                    type="submit"
                    disabled={!reply.trim()}
                    className="px-8 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-black uppercase text-[10px] tracking-widest italic transition-all flex items-center gap-2"
                  >
                    <Send size={14} /> Send Reply
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-30">
                <MessageSquare size={64} className="mb-4" />
                <p className="text-sm font-black uppercase tracking-[0.2em]">Select a conversation to begin</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="sharp-card bg-bg-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-bg-surface/50">
                  <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle">
                    Subscriber
                  </th>
                  <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle">
                    Account ID
                  </th>
                  <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle">
                    Current Balance
                  </th>
                  <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle text-center">
                    Billing State
                  </th>
                  <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle text-right">
                    Operations
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.uid}
                    className="border-b border-border-subtle/50 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-8 py-6">
                      <div className="font-bold text-white uppercase text-xs tracking-tight">
                        {client.displayName}
                      </div>
                      <div className="text-[9px] text-text-muted font-mono">
                        {client.email}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-[10px] font-black text-primary tracking-widest uppercase mb-1">
                        #{client.accountNumber}
                      </div>
                      <div className="text-[8px] text-text-dim/50 font-mono italic">
                        UID: {client.uid.substring(0, 16)}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-sm font-mono font-bold italic text-white flex items-center gap-2">
                        ₱ {(client.balance ?? 0).toLocaleString()}
                        <button
                          onClick={() => {
                            const newBalance = prompt(
                              `Adjust balance for ${client.displayName}:`,
                              client.balance.toString(),
                            );
                            if (newBalance !== null) {
                              updateClientBalance(
                                client.uid,
                                parseFloat(newBalance),
                              );
                            }
                          }}
                          className="p-1 hover:text-primary transition-colors"
                        >
                          <Edit3 size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex gap-2">
                          {(["paid", "due", "overdue"] as const).map((status) => (
                            <button
                              key={status}
                              onClick={() =>
                                updateClientStatus(client.uid, status)
                              }
                              className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest border transition-all ${client.billStatus === status ? (status === "overdue" ? "bg-red-500 border-red-500 text-white" : status === "due" ? "bg-yellow-500 border-yellow-500 text-black" : "bg-green-500 border-green-500 text-white") : "border-border-subtle text-text-muted hover:border-white/30"}`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                        {client.dueDate && (
                          <div className="text-[9px] font-bold uppercase tracking-tighter text-text-muted">
                            {client.billStatus === "paid" ? "Next Due: " : "Deadline: "}
                            <span className="text-primary italic">
                              {client.dueDate?.toDate
                                ? client.dueDate.toDate().toLocaleDateString()
                                : typeof client.dueDate === "string"
                                  ? new Date(client.dueDate).toLocaleDateString()
                                  : "N/A"}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setNotifyingUser(client)}
                          className="px-4 py-2 border border-primary/30 text-primary hover:bg-primary hover:text-white text-[9px] font-black uppercase tracking-widest italic transition-all flex items-center gap-2"
                        >
                          <Bell size={10} /> Dispatch Alert
                        </button>
                        <button
                          onClick={() => deleteSubscriber(client)}
                          className="p-2 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                          title="Delete Subscriber"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedReceipt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-bg-base/90 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setSelectedReceipt(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="sharp-card bg-bg-base max-w-lg w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-primary p-6 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Receipt size={20} />
                  <span className="font-black uppercase tracking-widest italic">
                    Verification View
                  </span>
                </div>
                <button onClick={() => setSelectedReceipt(null)}>
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="flex justify-between border-b border-border-subtle pb-4">
                  <span className="text-[10px] font-black uppercase text-text-muted">
                    REFERENCE
                  </span>
                  <span className="font-mono text-xs font-bold text-primary">
                    {selectedReceipt.referenceNumber}
                  </span>
                </div>

                {selectedReceipt.screenshotUrl ? (
                  <div className="space-y-3">
                    <span className="text-[10px] font-black uppercase text-text-muted flex items-center gap-2">
                      <ImageIcon size={12} /> Reported Screenshot
                    </span>
                    <div className="aspect-[3/4] bg-slate-900 border border-border-subtle overflow-hidden relative group">
                      <img
                        src={selectedReceipt.screenshotUrl}
                        alt="Receipt proof"
                        className="w-full h-full object-contain"
                      />
                      <a
                        href={selectedReceipt.screenshotUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-[10px] font-black uppercase tracking-widest"
                      >
                        <ExternalLink size={14} /> Open Full Resolution
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center border-2 border-dashed border-border-subtle text-text-dim uppercase text-[10px] font-black tracking-widest italic">
                    No Screenshot Uploaded
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      updateStatus(selectedReceipt, "completed");
                      setSelectedReceipt(null);
                    }}
                    className="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white font-black uppercase text-[11px] tracking-widest italic transition-all"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      updateStatus(selectedReceipt, "failed");
                      setSelectedReceipt(null);
                    }}
                    className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-[11px] tracking-widest italic transition-all"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {editingPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-hot-black/95 flex items-center justify-center p-6 backdrop-blur-xl"
            onClick={() => setEditingPlan(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="sharp-card p-10 max-w-md w-full border-t-8 border-primary bg-bg-base shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-10">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black uppercase italic tracking-tighter">
                    NODE <span className="text-primary not-italic">CONFIGURATION</span>
                  </h3>
                  <div className="text-[9px] font-black uppercase tracking-widest text-text-muted">
                    ID: {editingPlan.id}
                  </div>
                </div>
                <button
                  onClick={() => setEditingPlan(null)}
                  className="w-10 h-10 border border-border-subtle flex items-center justify-center text-text-muted hover:text-white hover:border-white transition-all shadow-xl"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleUpdatePlan} className="space-y-8">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                    Infrastructure Signature (Name)
                  </label>
                  <input
                    type="text"
                    required
                    value={editingPlan.name}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, name: e.target.value })
                    }
                    className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-sm font-bold uppercase text-white tracking-tight"
                    placeholder="e.g. TITAN v2"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                    Peripheral Features (Comma Separated)
                  </label>
                  <textarea
                    rows={3}
                    value={editingPlan.features.join(", ")}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        features: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter((s) => s !== ""),
                      })
                    }
                    className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-xs font-medium text-white italic"
                    placeholder="Unlimited Data, 24/7 Priority Support, Free Static IP"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                      Throughput (Mbps)
                    </label>
                    <input
                      type="text"
                      required
                      value={editingPlan.speed || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, "");
                        setEditingPlan({
                          ...editingPlan,
                          speed: val === "" ? 0 : Number(val),
                        });
                      }}
                      className="w-full bg-slate-900 border border-border-subtle p-5 focus:outline-none focus:border-primary text-3xl font-mono font-bold text-primary tabular-nums"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                      Cap Protocol
                    </label>
                    <input
                      type="text"
                      required
                      value={editingPlan.bandwidth}
                      onChange={(e) =>
                        setEditingPlan({
                          ...editingPlan,
                          bandwidth: e.target.value,
                        })
                      }
                      placeholder="UNLIMITED"
                      className="w-full bg-slate-900 border border-border-subtle p-5 focus:outline-none focus:border-primary text-xl font-mono font-bold text-white uppercase italic"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                    Settlement Rate (PHP/mo)
                  </label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-mono font-black italic">₱</div>
                    <input
                      type="text"
                      required
                      value={editingPlan.price || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, "");
                        setEditingPlan({
                          ...editingPlan,
                          price: val === "" ? 0 : Number(val),
                        });
                      }}
                      className="w-full bg-slate-900 border border-border-subtle p-6 pl-10 focus:outline-none focus:border-primary text-4xl font-mono font-bold text-white tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 p-5 bg-hot-black border border-border-subtle group hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setEditingPlan({ ...editingPlan, isPopular: !editingPlan.isPopular })}>
                  <div className={`w-6 h-6 border flex items-center justify-center transition-all ${editingPlan.isPopular ? 'bg-primary border-primary shadow-[0_0_10px_rgba(220,38,38,0.4)]' : 'border-border-subtle'}`}>
                    {editingPlan.isPopular && <CheckCircle2 size={14} className="text-white" />}
                  </div>
                  <label
                    className="text-[10px] uppercase tracking-[0.2em] font-black text-text-muted cursor-pointer group-hover:text-white transition-colors"
                  >
                    MARKET FOCUS (PROMOTE AS POPULAR)
                  </label>
                </div>

                <div className="pt-4 flex flex-col gap-3">
                  <button
                    type="submit"
                    className="w-full py-6 bg-primary text-white font-black uppercase text-[12px] tracking-[0.3em] italic hover:bg-primary-dark transition-all shadow-2xl shadow-primary/20"
                  >
                    COMMIT TO INFRASTRUCTURE
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingPlan(null)}
                    className="w-full py-3 text-[10px] font-black uppercase text-text-muted hover:text-white tracking-[0.4em] transition-all italic underline"
                  >
                    DISCARD CHANGES
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {paymentToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-hot-black/95 flex items-center justify-center p-6 backdrop-blur-xl"
            onClick={() => setPaymentToDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="sharp-card p-10 max-w-sm w-full border-t-8 border-primary bg-bg-base text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="mx-auto text-primary mb-6 animate-bounce" size={48} />
              <h3 className="text-xl font-black uppercase italic tracking-tighter mb-4">
                PURGE <span className="text-primary not-italic">RECORD</span>?
              </h3>
              <p className="text-xs text-text-muted font-bold uppercase tracking-widest leading-relaxed mb-10">
                You are about to permanently delete the payment record for{" "}
                <span className="text-white">#{paymentToDelete.referenceNumber}</span>.
                This action is irreversible.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={confirmPaymentDeletion}
                  className="w-full py-5 bg-primary text-white font-black uppercase text-[12px] tracking-[0.3em] italic hover:bg-primary-dark transition-all"
                >
                  CONFIRM PURGE
                </button>
                <button
                  onClick={() => setPaymentToDelete(null)}
                  className="w-full py-3 text-[10px] font-black uppercase text-text-muted hover:text-white tracking-[0.4em] transition-all"
                >
                  ABORT OPERATION
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {clientToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-hot-black/95 flex items-center justify-center p-6 backdrop-blur-xl"
            onClick={() => setClientToDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="sharp-card p-10 max-w-sm w-full border-t-8 border-primary bg-bg-base text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <UserMinus className="mx-auto text-primary mb-6 animate-pulse" size={48} />
              <h3 className="text-xl font-black uppercase italic tracking-tighter mb-4">
                TERMINATE <span className="text-primary not-italic">SUBSCRIBER</span>?
              </h3>
              <p className="text-xs text-text-muted font-bold uppercase tracking-widest leading-relaxed mb-10">
                Are you sure you want to delete <span className="text-white">{clientToDelete.displayName}</span>?
                All profile data and historical records will be permanently purged.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={confirmSubscriberDeletion}
                  className="w-full py-5 bg-primary text-white font-black uppercase text-[12px] tracking-[0.3em] italic hover:bg-primary-dark transition-all"
                >
                  CONFIRM TERMINATION
                </button>
                <button
                  onClick={() => setClientToDelete(null)}
                  className="w-full py-3 text-[10px] font-black uppercase text-text-muted hover:text-white tracking-[0.4em] transition-all"
                >
                  KEEP SUBSCRIBER
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {cycleToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-hot-black/95 flex items-center justify-center p-6 backdrop-blur-xl"
            onClick={() => setCycleToDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="sharp-card p-10 max-w-sm w-full border-t-8 border-primary bg-bg-base text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <Calendar className="mx-auto text-primary mb-6 animate-pulse" size={48} />
              <h3 className="text-xl font-black uppercase italic tracking-tighter mb-4">
                DELETE <span className="text-primary not-italic">CYCLE</span>?
              </h3>
              <p className="text-xs text-text-muted font-bold uppercase tracking-widest leading-relaxed mb-10">
                Are you sure you want to delete <span className="text-white">{cycleToDelete.name}</span>?
                This will remove the billing period definition.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={confirmCycleDeletion}
                  className="w-full py-5 bg-primary text-white font-black uppercase text-[12px] tracking-[0.3em] italic hover:bg-primary-dark transition-all"
                >
                  CONFIRM DELETION
                </button>
                <button
                  onClick={() => setCycleToDelete(null)}
                  className="w-full py-3 text-[10px] font-black uppercase text-text-muted hover:text-white tracking-[0.4em] transition-all"
                >
                  ABORT
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {viewingScreenshot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10002] bg-hot-black/98 flex items-center justify-center p-4 backdrop-blur-2xl"
            onClick={() => setViewingScreenshot(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-5xl w-full h-full flex flex-col items-center justify-center gap-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 right-0 p-4">
                <button
                  onClick={() => setViewingScreenshot(null)}
                  className="w-12 h-12 bg-white/10 hover:bg-primary text-white flex items-center justify-center transition-all group"
                >
                  <X size={24} className="group-hover:rotate-90 transition-transform" />
                </button>
              </div>
              
              <div className="w-full h-full p-8 flex items-center justify-center">
                <img
                  src={viewingScreenshot}
                  alt="Proof of Payment"
                  className="max-w-full max-h-full object-contain shadow-2xl border-4 border-white/5"
                />
              </div>

              <div className="flex gap-4">
                <a
                  href={viewingScreenshot}
                  target="_blank"
                  rel="noreferrer"
                  className="px-8 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-widest italic hover:bg-primary-dark transition-all flex items-center gap-2"
                >
                  <ExternalLink size={14} /> Open Original
                </a>
                <button
                  onClick={() => setViewingScreenshot(null)}
                  className="px-8 py-3 border border-white/20 text-white text-[10px] font-black uppercase tracking-widest hover:border-white transition-all"
                >
                  Close Viewer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function BillingCycleModal({
  editingCycle,
  setEditingCycle,
  handleSaveCycle,
}: {
  editingCycle: BillingCycle | null;
  setEditingCycle: (c: BillingCycle | null) => void;
  handleSaveCycle: (e: React.FormEvent) => void;
}) {
  if (!editingCycle) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] bg-hot-black/90 flex items-center justify-center p-6 backdrop-blur-md"
        onClick={() => setEditingCycle(null)}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="sharp-card p-10 max-w-md w-full border-t-8 border-primary bg-bg-base shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-2xl font-black uppercase italic tracking-tighter">
              CYCLE <span className="text-primary not-italic">PERIOD</span>
            </h3>
            <button
              onClick={() => setEditingCycle(null)}
              className="w-10 h-10 border border-border-subtle flex items-center justify-center text-text-muted hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSaveCycle} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-black text-text-muted tracking-widest">
                Cycle Identifier
              </label>
              <input
                type="text"
                required
                value={editingCycle.name}
                onChange={(e) =>
                  setEditingCycle({ ...editingCycle, name: e.target.value })
                }
                className="w-full bg-slate-900 border border-border-subtle p-4 focus:border-primary text-sm font-bold uppercase text-white"
                placeholder="JANUARY 2026"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-text-muted tracking-widest">
                  Start Date
                </label>
                <input
                  type="date"
                  required
                  value={
                    editingCycle.startDate instanceof Date
                      ? editingCycle.startDate.toISOString().split("T")[0]
                      : typeof editingCycle.startDate === "string"
                        ? editingCycle.startDate
                        : editingCycle.startDate?.toDate
                          ? editingCycle.startDate.toDate().toISOString().split("T")[0]
                          : ""
                  }
                  onChange={(e) =>
                    setEditingCycle({
                      ...editingCycle,
                      startDate: e.target.value,
                    })
                  }
                  className="w-full bg-slate-900 border border-border-subtle p-4 focus:border-primary text-xs font-bold text-white uppercase"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-text-muted tracking-widest">
                  End Date
                </label>
                <input
                  type="date"
                  required
                  value={
                    editingCycle.endDate instanceof Date
                      ? editingCycle.endDate.toISOString().split("T")[0]
                      : typeof editingCycle.endDate === "string"
                        ? editingCycle.endDate
                        : editingCycle.endDate?.toDate
                          ? editingCycle.endDate.toDate().toISOString().split("T")[0]
                          : ""
                  }
                  onChange={(e) =>
                    setEditingCycle({ ...editingCycle, endDate: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-border-subtle p-4 focus:border-primary text-xs font-bold text-white uppercase"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-black text-text-muted tracking-widest">
                Payment Deadline
              </label>
              <input
                type="date"
                required
                value={
                  editingCycle.dueDate instanceof Date
                    ? editingCycle.dueDate.toISOString().split("T")[0]
                    : typeof editingCycle.dueDate === "string"
                      ? editingCycle.dueDate
                      : editingCycle.dueDate?.toDate
                        ? editingCycle.dueDate.toDate().toISOString().split("T")[0]
                        : ""
                }
                onChange={(e) =>
                  setEditingCycle({ ...editingCycle, dueDate: e.target.value })
                }
                className="w-full bg-slate-900 border border-border-subtle p-4 focus:border-primary text-xs font-bold text-white uppercase"
              />
            </div>

            <button
              type="submit"
              className="w-full py-5 bg-primary text-white font-black uppercase text-[12px] tracking-[0.3em] italic hover:bg-primary-dark transition-all"
            >
              Commit Cycle Parameters
            </button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function NotificationModal({
  notifyingUser,
  setNotifyingUser,
  notifForm,
  setNotifForm,
  handleSendNotification,
}: {
  notifyingUser: UserProfile | null;
  setNotifyingUser: (u: UserProfile | null) => void;
  notifForm: any;
  setNotifForm: (f: any) => void;
  handleSendNotification: (e: React.FormEvent) => void;
}) {
  return (
    <AnimatePresence>
      {notifyingUser && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] bg-hot-black/90 flex items-center justify-center p-6 backdrop-blur-md"
        >
          <motion.form
            onSubmit={handleSendNotification}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="sharp-card p-10 max-w-lg w-full border-t-8 border-primary space-y-8 bg-bg-base"
          >
            <div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter">
                DISPATCH <span className="text-primary not-italic">ALERT</span>
              </h3>
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-2">
                Target Subscriber: {notifyingUser.displayName} (
                {notifyingUser.accountNumber})
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                  Classification
                </label>
                <div className="flex gap-2">
                  {(["info", "warning", "alert"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNotifForm({ ...notifForm, type })}
                      className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest border transition-all ${
                        notifForm.type === type
                          ? "bg-primary border-primary text-white"
                          : "border-border-subtle text-text-muted"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                  Subject Line
                </label>
                <input
                  type="text"
                  required
                  value={notifForm.title}
                  onChange={(e) =>
                    setNotifForm({ ...notifForm, title: e.target.value })
                  }
                  placeholder="e.g. PAYMENT DUE ALERT"
                  className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-xs font-bold uppercase text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                  Transmission Content
                </label>
                <textarea
                  required
                  value={notifForm.message}
                  onChange={(e) =>
                    setNotifForm({ ...notifForm, message: e.target.value })
                  }
                  rows={4}
                  placeholder="Provide details regarding account status or payment requirements..."
                  className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-xs font-medium text-white"
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                className="flex-1 py-4 bg-primary hover:bg-primary-dark text-white font-black uppercase tracking-[0.2em] italic text-[11px] transition-all"
              >
                Confirm Transmission
              </button>
              <button
                type="button"
                onClick={() => setNotifyingUser(null)}
                className="px-6 border border-border-subtle text-text-muted hover:text-white font-black uppercase tracking-widest text-[9px] transition-all"
              >
                Abort
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
