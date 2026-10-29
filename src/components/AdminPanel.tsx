/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Zap,
  CreditCard,
  X,
  TrendingUp,
  History,
  LogIn,
  LogOut,
  User as UserIcon,
  Users as UsersIcon,
  CheckCircle2,
  Loader2,
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
  Search,
  MessageSquare,
  Send,
  Server,
  Save,
  LifeBuoy,
  Bot,
  ChevronLeft,
} from "lucide-react";
import { INTERNET_PLANS, ADMIN_EMAIL, isSuperAdminEmail } from "../constants";
import { useAuth } from "./FirebaseProvider";
import { getDisplayImageUrl, deleteBlobFile } from "../lib/blobUtils";
import { toast } from "sonner";
import {
  evaluateSubscriberStatus,
  parseSubscriberDueInstant,
  formatToPHTDate,
  formatToPHTTime,
  formatPHTFriendly,
  calculateNextRenewalCycle,
  ASIA_TIMEZONE,
  GRACE_PERIOD_HOURS,
  SubscriberStatusEvaluation,
} from "../lib/billingEngine";
import {
  loginWithGoogle,
  db,
  handleFirestoreError,
  OperationType,
} from "../lib/firebase";
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
} from "firebase/firestore";
import {
  InternetPlan,
  PaymentRecord,
  UserProfile,
  BillingCycle,
  ChatSession,
  ChatMessage,
  SupportTicket,
} from "../types";

const AdminTicketsTab = React.lazy(() =>
  import("./AdminTicketsTab").then((m) => ({ default: m.AdminTicketsTab }))
);

export default function AdminPanel({
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
  const [adminTab, setAdminTab] = useState<
    "payments" | "plans" | "clients" | "cycles" | "chats" | "tickets"
  >(
    "payments",
  );
  const [billingCycles, setBillingCycles] = useState<BillingCycle[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatSession | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const adminChatScrollRef = useRef<HTMLDivElement>(null);
  const [editingCycle, setEditingCycle] = useState<BillingCycle | null>(null);
  const [processingCycle, setProcessingCycle] = useState<string | null>(null);
  const [cycleToDelete, setCycleToDelete] = useState<BillingCycle | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "confirmed" | "rejected">("pending");
  const [confirmingSettlement, setConfirmingSettlement] = useState<PaymentRecord | null>(null);
  const [rejectingPayment, setRejectingPayment] = useState<PaymentRecord | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [isProcessingSettlement, setIsProcessingSettlement] = useState(false);
  const [editingPlan, setEditingPlan] = useState<InternetPlan | null>(null);
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentRecord | null>(null);
  const [viewingScreenshot, setViewingScreenshot] = useState<string | null>(null);
  const [viewingScreenshotPayment, setViewingScreenshotPayment] = useState<PaymentRecord | null>(null);
  const [isDeletingScreenshot, setIsDeletingScreenshot] = useState<string | null>(null);
  const [clientToDelete, setClientToDelete] = useState<UserProfile | null>(null);
  const [chatToDelete, setChatToDelete] = useState<ChatSession | null>(null);
  const [notifyingUser, setNotifyingUser] = useState<UserProfile | null>(null);
  const [editingScheduleUser, setEditingScheduleUser] = useState<UserProfile | null>(null);
  const [tempDueDate, setTempDueDate] = useState("");
  const [tempDueTime, setTempDueTime] = useState("12:00 PM");
  const [tempPaymentStatus, setTempPaymentStatus] = useState<"unpaid" | "processing" | "paid" | "rejected">("unpaid");
  const [tempSubscriptionStatus, setTempSubscriptionStatus] = useState<"ACTIVE" | "DUE" | "OVERDUE" | "PAID">("ACTIVE");
  const [isCheckingBilling, setIsCheckingBilling] = useState(false);
  const [lastCheckerSyncTime, setLastCheckerSyncTime] = useState<Date | null>(null);
  const [tempClientId, setTempClientId] = useState("");
  const [tempUid, setTempUid] = useState("");
  const [tempDisplayName, setTempDisplayName] = useState("");
  const [tempEmail, setTempEmail] = useState("");
  const [tempPhone, setTempPhone] = useState("");
  const [tempAddress, setTempAddress] = useState("");
  const [tempAccountNumber, setTempAccountNumber] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<"all" | "active" | "due" | "overdue" | "paid" | "suspended">("all");
  const [showBulkReminderModal, setShowBulkReminderModal] = useState(false);
  const [bulkNotifForm, setBulkNotifForm] = useState({
    title: "SETTLEMENT REQ: BALANCE DUE",
    message: "Network core warning: An outstanding balance has been detected on your subscriber node. Please complete your settlement immediately in the Billing Center to maintain active high-bandwidth uplink.",
    type: "alert" as "info" | "warning" | "alert",
  });

  // Telegram Bot Notifications Engine State
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [telegramConfig, setTelegramConfig] = useState<{
    configured: boolean;
    chatId: string;
    enabled: boolean;
    maskedToken: string;
  } | null>(null);
  const [telegramFormToken, setTelegramFormToken] = useState("");
  const [telegramFormChatId, setTelegramFormChatId] = useState("8732198426");
  const [telegramFormEnabled, setTelegramFormEnabled] = useState(true);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);

  const fetchTelegramConfig = async () => {
    try {
      const res = await fetch("/api/telegram/settings");
      if (res.ok) {
        const data = await res.json();
        setTelegramConfig(data);
        if (data.chatId) setTelegramFormChatId(data.chatId);
        if (typeof data.enabled === "boolean") setTelegramFormEnabled(data.enabled);
      }
    } catch (e) {
      console.warn("Could not load Telegram settings:", e);
    }
  };

  useEffect(() => {
    fetchTelegramConfig();
  }, []);

  const handleSaveTelegram = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingTelegram(true);
    try {
      const res = await fetch("/api/telegram/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: telegramFormToken.trim() || undefined,
          chatId: telegramFormChatId.trim(),
          enabled: telegramFormEnabled,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTelegramConfig(data);
        setTelegramFormToken("");
        toast.success("Telegram Bot configuration saved successfully!");
      } else {
        toast.error(data.error || "Failed to save Telegram configuration.");
      }
    } catch (err: any) {
      toast.error("Error saving Telegram configuration: " + (err?.message || err));
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    const toastId = toast.loading("Dispatching test alert to Telegram Bot...");
    try {
      const res = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customToken: telegramFormToken.trim() || undefined,
          customChatId: telegramFormChatId.trim() || undefined,
        }),
      });
      const data = await res.json();
      toast.dismiss(toastId);
      if (res.ok && data.success) {
        toast.success("Telegram test message sent successfully!", {
          description: data.message,
        });
      } else {
        toast.error(data.error || "Telegram test failed.", {
          description: "Please check your Bot Token and Chat ID.",
        });
      }
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Failed to contact Telegram API: " + (err?.message || err));
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const toISODate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const generateNextCycle = () => {
    let nextStart = new Date();
    let nextEnd = new Date();
    let nextDue = new Date();
    let cycleName = "";

    if (billingCycles.length > 0) {
      const latest = billingCycles[0];
      const latestEnd = latest.endDate?.toDate ? latest.endDate.toDate() : new Date(latest.endDate);
      
      // Start next day after latest end
      nextStart = new Date(latestEnd);
      nextStart.setDate(latestEnd.getDate() + 1);
      
      // End date 1 month later
      nextEnd = new Date(nextStart);
      nextEnd.setMonth(nextStart.getMonth() + 1);
      nextEnd.setDate(nextEnd.getDate() - 1);

      // Due date 5 days after end date by default
      nextDue = new Date(nextEnd);
      nextDue.setDate(nextDue.getDate() + 5);
      
      cycleName = `CYCLE ${nextStart.toLocaleString("en-US", { timeZone: ASIA_TIMEZONE, month: "long", year: "numeric" }).toUpperCase()}`;
    } else {
      // Defaults if no cycles exist
      nextStart.setDate(1);
      nextEnd = new Date(nextStart);
      nextEnd.setMonth(nextStart.getMonth() + 1);
      nextEnd.setDate(nextEnd.getDate() - 1);
      nextDue = new Date(nextEnd);
      nextDue.setDate(nextDue.getDate() + 5);
      cycleName = `CYCLE ${nextStart.toLocaleString("en-US", { timeZone: ASIA_TIMEZONE, month: "long", year: "numeric" }).toUpperCase()}`;
    }

    setEditingCycle({
      id: "",
      name: cycleName,
      startDate: toISODate(nextStart),
      endDate: toISODate(nextEnd),
      dueDate: toISODate(nextDue),
      status: "active",
      createdAt: serverTimestamp(),
    });
  };

  const filteredClients = useMemo(() => {
    const searchLower = (clientSearch || "").toLowerCase().trim();
    const result = clients.filter(client => {
      if (searchLower) {
        const matchesSearch = 
          (client.displayName || "").toLowerCase().includes(searchLower) || 
          (client.accountNumber || "").toLowerCase().includes(searchLower) ||
          (client.clientId || "").toLowerCase().includes(searchLower) ||
          (client.email || "").toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;
      }
      
      if (clientFilter === "all") return true;

      const evaluation = evaluateSubscriberStatus(client);
      if (clientFilter === "suspended") return client.status === "suspended";
      if (clientFilter === "active") return evaluation.subscription_status === "ACTIVE" && client.status !== "suspended";
      if (clientFilter === "due") return evaluation.subscription_status === "DUE";
      if (clientFilter === "overdue") return evaluation.subscription_status === "OVERDUE";
      if (clientFilter === "paid") return evaluation.subscription_status === "PAID";
      return true;
    });

    // Auto sort: Due and Overdue subscribers automatically go to the top
    return result.sort((a, b) => {
      const evalA = evaluateSubscriberStatus(a);
      const evalB = evaluateSubscriberStatus(b);

      const getDuePriority = (c: UserProfile, ev: any) => {
        if (ev.subscription_status === "OVERDUE" || c.billStatus === "overdue") return 0;
        if (ev.subscription_status === "DUE" || c.billStatus === "due" || ev.is_due) return 1;
        return 2;
      };

      const priorityA = getDuePriority(a, evalA);
      const priorityB = getDuePriority(b, evalB);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // If both are due or overdue, sort by earliest due date
      if (priorityA < 2) {
        const timeA = evalA.dueInstant ? evalA.dueInstant.getTime() : 0;
        const timeB = evalB.dueInstant ? evalB.dueInstant.getTime() : 0;
        if (timeA && timeB) return timeA - timeB;
      }

      const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return dateB - dateA;
    });
  }, [clients, clientSearch, clientFilter]);

  const totalRevenue = useMemo(
    () => payments.filter(p => p.status === "completed").reduce((acc, p) => acc + (p.amount || 0), 0),
    [payments]
  );
  const activeSubs = useMemo(
    () => clients.filter(c => c.status !== "suspended").length,
    [clients]
  );
  const suspendedSubs = useMemo(
    () => clients.filter(c => c.status === "suspended").length,
    [clients]
  );

  const clientsMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const c of clients) {
      map.set(c.uid, c);
    }
    return map;
  }, [clients]);
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
        const p = snapshot.docs.map((doc) => {
          const data = doc.data() as PaymentRecord;
          // Ensure userId is present from path for collectionGroup
          const userId = data.userId || doc.ref.parent.parent?.id || "unknown";
          return { ...data, id: doc.id, userId } as PaymentRecord;
        });
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
      const c = snapshot.docs.map((doc) => ({ ...doc.data(), uid: doc.id }) as UserProfile);
      setClients(c);
      // Keep server-side billing status engine updated
      try {
        fetch("/api/billing/subscribers/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscribers: c }),
        }).catch(() => {});
      } catch (_) {}
    }, (error) => {
      console.error("Clients sync error:", error);
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
        (doc) => ({ ...doc.data(), id: doc.id }) as BillingCycle,
      );
      setBillingCycles(cy);
    }, (error) => {
      console.error("Cycles sync error:", error);
    });

    return unsubscribe;
  }, [user, firebaseIsAdmin]);

  useEffect(() => {
    if (!user || !firebaseIsAdmin) return;

    const chatsCol = collection(db, "chats");

    const unsubscribe = onSnapshot(
      chatsCol,
      (snapshot) => {
        const chats = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as ChatSession)
        );
        chats.sort((a, b) => {
          const timeA = a.updatedAt?.toMillis
            ? a.updatedAt.toMillis()
            : a.lastMessageAt?.toMillis
            ? a.lastMessageAt.toMillis()
            : 0;
          const timeB = b.updatedAt?.toMillis
            ? b.updatedAt.toMillis()
            : b.lastMessageAt?.toMillis
            ? b.lastMessageAt.toMillis()
            : 0;
          return timeB - timeA;
        });
        setChatSessions(chats);
      },
      (error) => {
        console.error("Chats sync error:", error);
      }
    );

    return unsubscribe;
  }, [user, firebaseIsAdmin]);

  useEffect(() => {
    if (!user || !firebaseIsAdmin || !selectedChat) {
      setChatMessages([]);
      return;
    }

    const targetChatId = selectedChat.userId || selectedChat.id;
    const q = query(
      collection(db, `chats/${targetChatId}/messages`),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map(
          (doc) => ({ ...doc.data(), id: doc.id } as ChatMessage)
        );
        setChatMessages(msgs);
        setTimeout(() => {
          adminChatScrollRef.current?.scrollTo({
            top: adminChatScrollRef.current.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      },
      (error) => {
        console.error("Messages sync error:", error);
      }
    );

    return unsubscribe;
  }, [user, firebaseIsAdmin, selectedChat]);

  // Real-time listener for Support Tickets dispatched to Admin Console
  useEffect(() => {
    if (!user || !firebaseIsAdmin) return;

    const q = query(
      collection(db, "support_tickets"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tix = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as SupportTicket)
      );
      setSupportTickets(tix);
    }, (error) => {
      console.error("Support tickets sync error:", error);
    });

    return unsubscribe;
  }, [user, firebaseIsAdmin]);

  const handleSaveCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCycle) return;
    try {
      const cycleRef = editingCycle.id
        ? doc(db, "billing_cycles", editingCycle.id)
        : doc(collection(db, "billing_cycles"));

      // Convert input strings to Date objects for reliable Firestore storage
      const startDate = typeof editingCycle.startDate === 'string' ? new Date(editingCycle.startDate) : editingCycle.startDate;
      const endDate = typeof editingCycle.endDate === 'string' ? new Date(editingCycle.endDate) : editingCycle.endDate;
      const dueDate = typeof editingCycle.dueDate === 'string' ? new Date(editingCycle.dueDate) : editingCycle.dueDate;

      const cycleData = {
        ...editingCycle,
        id: cycleRef.id,
        startDate,
        endDate,
        dueDate,
        createdAt: editingCycle.createdAt || serverTimestamp(),
      };

      await setDoc(cycleRef, cycleData);
      setEditingCycle(null);
      toast.success("Billing cycle synchronized successfully.");
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

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "pending") return p.status === "pending";
      if (statusFilter === "confirmed") return p.status === "confirmed" || p.status === "completed";
      if (statusFilter === "rejected") return p.status === "rejected" || p.status === "failed";
      return p.status === statusFilter;
    });
  }, [payments, statusFilter]);

  // Admin Confirm Settlement: Changes status to Confirmed, adjusts user balance, NO plan renewal/extension, logs audit
  const handleConfirmSettlement = async () => {
    if (!confirmingSettlement || !confirmingSettlement.id) return;
    setIsProcessingSettlement(true);
    const paymentPath = `users/${confirmingSettlement.userId}/payments/${confirmingSettlement.id}`;

    try {
      const paymentRef = doc(db, paymentPath);
      const adminEmail = user?.email || "Admin";
      const audit = {
        actionBy: adminEmail,
        actionByUid: user?.uid || "",
        actionAt: serverTimestamp(),
        decision: "confirmed" as const,
        notes: "Settlement confirmed by administrator after proof verification.",
      };

      await updateDoc(paymentRef, {
        status: "confirmed",
        updatedAt: serverTimestamp(),
        audit,
      });

      // Finalize payment: adjust subscriber balance only (NO renewal, NO due date change!)
      const userRef = doc(db, "users", confirmingSettlement.userId);
      const userDocSnapshot = await getDoc(userRef);
      if (userDocSnapshot.exists()) {
        const userData = userDocSnapshot.data() as UserProfile;
        const currentBalance = userData.balance || 0;
        const newBalance = Math.max(0, currentBalance - confirmingSettlement.amount);
        const newBillStatus = newBalance <= 0 ? "paid" : "due";
        await updateDoc(userRef, {
          balance: newBalance,
          billStatus: newBillStatus,
          payment_status: "paid",
          subscription_status: "PAID",
          lastStatusCheck: serverTimestamp(),
        });
      }

      // Add subscriber notification
      try {
        await addDoc(collection(db, `users/${confirmingSettlement.userId}/notifications`), {
          title: "Settlement Confirmed",
          message: `Your payment of ₱${confirmingSettlement.amount.toLocaleString()} (Ref: ${confirmingSettlement.referenceNumber}) has been verified and confirmed.`,
          type: "info",
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (_) {}

      toast.success("Settlement confirmed successfully!", {
        description: `Payment status set to Confirmed. Subscriber balance updated.`,
      });
      setConfirmingSettlement(null);
    } catch (e) {
      console.error("Confirm settlement error:", e);
      handleFirestoreError(e, OperationType.UPDATE, paymentPath);
      toast.error("Failed to confirm settlement.");
    } finally {
      setIsProcessingSettlement(false);
    }
  };

  // Admin Reject Payment: Changes status to Rejected, balance & subscription untouched, logs audit
  const handleRejectPayment = async () => {
    if (!rejectingPayment || !rejectingPayment.id) return;
    setIsProcessingSettlement(true);
    const paymentPath = `users/${rejectingPayment.userId}/payments/${rejectingPayment.id}`;
    const reason = rejectionNotes.trim() || "Verification could not be confirmed by administrator.";

    try {
      const paymentRef = doc(db, paymentPath);
      const adminEmail = user?.email || "Admin";
      const audit = {
        actionBy: adminEmail,
        actionByUid: user?.uid || "",
        actionAt: serverTimestamp(),
        decision: "rejected" as const,
        notes: reason,
      };

      await updateDoc(paymentRef, {
        status: "rejected",
        rejectionReason: reason,
        updatedAt: serverTimestamp(),
        audit,
      });

      // Update subscriber payment_status to 'rejected'. Subscription status and due date remain strictly unchanged!
      try {
        const userRef = doc(db, "users", rejectingPayment.userId);
        await updateDoc(userRef, {
          payment_status: "rejected",
          lastStatusCheck: serverTimestamp(),
        });
      } catch (err) {
        console.warn("Could not update subscriber payment_status on reject:", err);
      }

      // Notify subscriber of rejection
      try {
        await addDoc(collection(db, `users/${rejectingPayment.userId}/notifications`), {
          title: "Settlement Rejected",
          message: `Your payment submission of ₱${rejectingPayment.amount.toLocaleString()} (Ref: ${rejectingPayment.referenceNumber}) was rejected: ${reason}. Please verify details and re-submit valid proof.`,
          type: "alert",
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (_) {}

      toast.info("Payment rejected", {
        description: `Payment status set to Rejected. Audit record saved.`,
      });
      setRejectingPayment(null);
      setRejectionNotes("");
    } catch (e) {
      console.error("Reject payment error:", e);
      handleFirestoreError(e, OperationType.UPDATE, paymentPath);
      toast.error("Failed to reject payment.");
    } finally {
      setIsProcessingSettlement(false);
    }
  };

  const updateStatus = async (
    payment: PaymentRecord,
    status: "completed" | "failed",
  ) => {
    if (status === "completed") {
      setConfirmingSettlement(payment);
    } else {
      setRejectingPayment(payment);
    }
  };

  const deletePayment = (payment: PaymentRecord) => {
    setPaymentToDelete(payment);
  };

  const deletePaymentScreenshot = async (payment: PaymentRecord) => {
    if (!payment || !payment.id || !payment.userId) return;
    setIsDeletingScreenshot(payment.id);
    const toastId = toast.loading("Deleting screenshot from Admin & Vercel Blob storage...");
    try {
      const blobDeleted = await deleteBlobFile(payment);

      const paymentPath = `users/${payment.userId}/payments/${payment.id}`;
      const paymentRef = doc(db, paymentPath);
      await updateDoc(paymentRef, {
        screenshotUrl: "",
        blobUrl: "",
        updatedAt: serverTimestamp(),
      });

      if (selectedReceipt?.id === payment.id) {
        setSelectedReceipt({ ...selectedReceipt, screenshotUrl: "", blobUrl: "" });
      }
      if (confirmingSettlement?.id === payment.id) {
        setConfirmingSettlement({ ...confirmingSettlement, screenshotUrl: "", blobUrl: "" });
      }
      if (viewingScreenshotPayment?.id === payment.id) {
        setViewingScreenshot(null);
        setViewingScreenshotPayment(null);
      }

      toast.dismiss(toastId);
      toast.success(
        blobDeleted
          ? "Screenshot deleted from Admin and Vercel Blob storage."
          : "Screenshot removed from payment record."
      );
    } catch (e) {
      toast.dismiss(toastId);
      console.error("Failed to delete payment screenshot:", e);
      toast.error("Failed to delete screenshot.");
      handleFirestoreError(
        e,
        OperationType.UPDATE,
        `users/${payment.userId}/payments/${payment.id}`,
      );
    } finally {
      setIsDeletingScreenshot(null);
    }
  };

  const confirmPaymentDeletion = async () => {
    if (!paymentToDelete || !paymentToDelete.id) return;
    const toastId = toast.loading("Purging payment record & Blob storage...");
    try {
      if (paymentToDelete.screenshotUrl || paymentToDelete.blobUrl) {
        await deleteBlobFile(paymentToDelete);
      }
      const paymentPath = `users/${paymentToDelete.userId}/payments/${paymentToDelete.id}`;
      const paymentRef = doc(db, paymentPath);
      await deleteDoc(paymentRef);
      if (viewingScreenshotPayment?.id === paymentToDelete.id) {
        setViewingScreenshot(null);
        setViewingScreenshotPayment(null);
      }
      if (selectedReceipt?.id === paymentToDelete.id) {
        setSelectedReceipt(null);
      }
      setPaymentToDelete(null);
      toast.dismiss(toastId);
      toast.success("Payment record and Blob screenshot deleted.");
    } catch (e) {
      toast.dismiss(toastId);
      console.error("Delete failure:", e);
      handleFirestoreError(
        e,
        OperationType.DELETE,
        `users/${paymentToDelete.userId}/payments/${paymentToDelete.id}`,
      );
    }
  };

  const deleteSubscriber = (client: UserProfile) => {
    setClientToDelete(client);
  };

  const confirmSubscriberDeletion = async () => {
    if (!clientToDelete || !clientToDelete.uid) return;
    const toastId = toast.loading("Terminating subscriber & cleaning up Blob storage...");
    try {
      const userPayments = payments.filter((p) => p.userId === clientToDelete.uid);
      for (const p of userPayments) {
        if (p.screenshotUrl || p.blobUrl) {
          await deleteBlobFile(p);
        }
        try {
          await deleteDoc(doc(db, `users/${clientToDelete.uid}/payments/${p.id}`));
        } catch {
          // ignore subdoc cleanup error
        }
      }
      await deleteDoc(doc(db, "users", clientToDelete.uid));
      setClientToDelete(null);
      toast.dismiss(toastId);
      toast.success("Subscriber and associated records deleted.");
    } catch (e) {
      toast.dismiss(toastId);
      handleFirestoreError(e, OperationType.DELETE, `users/${clientToDelete.uid}`);
    }
  };

  const deleteConversation = (chat: ChatSession) => {
    setChatToDelete(chat);
  };

  const confirmConversationDeletion = async () => {
    if (!chatToDelete || !chatToDelete.id) return;
    const targetChatId = chatToDelete.userId || chatToDelete.id;
    const progressToast = toast.loading("Purging conversation history...");
    try {
      // 1. Delete all subcollection messages
      const messagesRef = collection(db, "chats", targetChatId, "messages");
      const messagesSnap = await getDocs(messagesRef);
      for (const msgDoc of messagesSnap.docs) {
        await deleteDoc(msgDoc.ref);
      }
      
      // 2. Delete main chat doc
      await deleteDoc(doc(db, "chats", targetChatId));
      
      // Update local state if the deleted chat was selected
      if (selectedChat?.id === chatToDelete.id || selectedChat?.userId === targetChatId) {
        setSelectedChat(null);
      }
      
      setChatToDelete(null);
      toast.dismiss(progressToast);
      toast.success("Conversation history fully purged!");
    } catch (e) {
      toast.dismiss(progressToast);
      console.error("Failed to delete conversation:", e);
      handleFirestoreError(e, OperationType.DELETE, `chats/${targetChatId}`);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !reply.trim() || isSendingReply) return;

    const text = reply.trim();
    setReply("");
    setIsSendingReply(true);

    const targetChatId = selectedChat.userId || selectedChat.id;

    try {
      await addDoc(collection(db, `chats/${targetChatId}/messages`), {
        text,
        senderId: user?.uid || "admin",
        senderRole: "admin",
        createdAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "chats", targetChatId),
        {
          userId: targetChatId,
          userName: selectedChat.userName || "Subscriber",
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setTimeout(() => {
        adminChatScrollRef.current?.scrollTo({
          top: adminChatScrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);

      toast.success("Reply delivered to client");
    } catch (error) {
      console.error("Failed to send admin reply:", error);
      handleFirestoreError(error, OperationType.WRITE, `chats/${targetChatId}/messages`);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    try {
      const planRef = doc(db, "plans", editingPlan.id);
      await setDoc(planRef, { ...editingPlan, updatedAt: serverTimestamp() });
      setEditingPlan(null);
      toast.success("Infrastructure node configured successfully.");
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
      toast.success("Infrastructure node decommissioned.");
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `plans/${planToDelete}`);
    }
  };

  const handleTriggerBillingCheck = async () => {
    setIsCheckingBilling(true);
    const toastId = toast.loading("Executing authoritative billing status verification in Asia/Manila...");
    try {
      // 1. Call server-side background checker endpoint
      try {
        await fetch("/api/billing/subscribers/check", { method: "POST" });
      } catch (_) {}

      // 2. Client-side evaluation & sync to Firestore
      const now = new Date();
      let updatedCount = 0;
      for (const c of clients) {
        const evaluation = evaluateSubscriberStatus(c, now);
        if (
          evaluation.subscription_status !== c.subscription_status ||
          evaluation.payment_status !== c.payment_status ||
          !c.due_date ||
          !c.due_time
        ) {
          const legacyBillStatus =
            evaluation.subscription_status === "PAID"
              ? "paid"
              : evaluation.subscription_status === "OVERDUE"
              ? "overdue"
              : "due";

          const newConnectionStatus =
            evaluation.subscription_status === "OVERDUE" ? "suspended" : "active";

          await updateDoc(doc(db, "users", c.uid), {
            subscription_status: evaluation.subscription_status,
            payment_status: evaluation.payment_status,
            due_date: evaluation.due_date,
            due_time: evaluation.due_time,
            status: newConnectionStatus,
            billStatus: legacyBillStatus,
            lastStatusCheck: serverTimestamp(),
          });
          updatedCount++;
        }
      }

      setLastCheckerSyncTime(new Date());
      toast.dismiss(toastId);
      toast.success("Billing status verification completed!", {
        description: `Checked ${clients.length} subscribers. Evaluated authoritative Philippine Standard Time.`,
      });
    } catch (err: any) {
      toast.dismiss(toastId);
      console.error("Billing check error:", err);
      toast.error("Failed to run status check.");
    } finally {
      setIsCheckingBilling(false);
    }
  };

  const handleAdminRenewSubscription = async (client: UserProfile) => {
    const renewal = calculateNextRenewalCycle(client.due_date, client.due_time);
    const confirmRenewal = window.confirm(
      `Renew subscription for ${client.displayName || client.accountNumber}?\n\n` +
      `Current Due: ${client.due_date || "N/A"} ${client.due_time || ""}\n` +
      `New Due: ${renewal.due_date} at ${renewal.due_time} PHT\n` +
      `New Status: ACTIVE (Reactivated for Wifi5Soft / Router)\n` +
      `Payment Status: UNPAID\n\n` +
      `Proceed with subscription renewal?`
    );
    if (!confirmRenewal) return;

    try {
      const renewedRecord = {
        due_date: renewal.due_date,
        due_time: renewal.due_time,
        dueDate: renewal.dueDateObj.toISOString(),
        subscription_status: "ACTIVE" as const,
        payment_status: "unpaid" as const,
        status: "active" as const, // Reactivate client status
        billStatus: "paid" as const,
        balance: 0,
        lastStatusCheck: serverTimestamp(),
      };

      await updateDoc(doc(db, "users", client.uid), renewedRecord);

      // Keep server cache in sync immediately for Wifi5Soft API queries
      try {
        await fetch("/api/billing/subscribers/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscribers: [
              {
                ...client,
                ...renewedRecord,
                dueDate: renewal.dueDateObj.toISOString(),
              },
            ],
          }),
        });
      } catch (_) {}

      // Push webhook notification to Wifi5Soft if configured
      try {
        const storedWebhook = localStorage.getItem("hf_wifi5soft_webhook");
        if (storedWebhook && storedWebhook.trim().startsWith("http")) {
          await fetch(storedWebhook.trim(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(client.apiKey ? { "x-api-key": client.apiKey } : {}),
            },
            body: JSON.stringify({
              event: "subscription.renewed",
              clientId: client.clientId || client.accountNumber,
              client_id: client.clientId || client.accountNumber,
              accountNumber: client.accountNumber,
              status: "active",
              active: true,
              is_active: true,
              due_date: renewal.due_date,
              due_time: renewal.due_time,
              timestamp: new Date().toISOString(),
            }),
          }).catch(() => {});
        }
      } catch (_) {}

      // Dispatch notification
      try {
        await addDoc(collection(db, `users/${client.uid}/notifications`), {
          title: "Subscription Renewed",
          message: `Your internet subscription has been renewed by the administrator. Your next due date is ${renewal.due_date} at ${renewal.due_time} PHT.`,
          type: "info",
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (_) {}

      toast.success(`Subscription renewed & synced!`, {
        description: `New deadline: ${renewal.due_date} at ${renewal.due_time} PHT. Status set to ACTIVE (Synced with Wifi5Soft).`,
      });
    } catch (err) {
      console.error("Renewal error:", err);
      toast.error("Failed to renew subscription.");
    }
  };

  const updateClientProfile = async (
    userId: string,
    newUid: string,
    dueDateStr: string,
    dueTimeStr: string,
    paymentStatus: string,
    subscriptionStatus: string,
    clientId: string,
    displayName: string,
    email: string,
    phone: string,
    address: string,
    accountNumber: string
  ) => {
    try {
      const dueInstant = parseSubscriberDueInstant(dueDateStr, dueTimeStr);
      const evalResult = evaluateSubscriberStatus({
        due_date: dueDateStr,
        due_time: dueTimeStr,
        payment_status: paymentStatus as any,
        subscription_status: subscriptionStatus as any,
      });

      const finalSubscriptionStatus = subscriptionStatus || evalResult.subscription_status;
      const finalPaymentStatus = paymentStatus || evalResult.payment_status;
      const legacyBillStatus =
        finalSubscriptionStatus === "PAID"
          ? "paid"
          : finalSubscriptionStatus === "OVERDUE"
          ? "overdue"
          : "due";

      const updatedStatus = finalSubscriptionStatus === "OVERDUE" ? "active" : "active";

      if (newUid && newUid !== userId) {
        // Validate if newUid already exists
        const existsLocally = clients.some(c => c.uid === newUid);
        if (existsLocally) {
          toast.error(`A subscriber with UID/Account ID "${newUid}" already exists!`);
          return;
        }

        setIsSyncing(true);
        const progressToast = toast.loading("Migrating subscriber data and history...");

        try {
          // 1. Fetch old user document
          const oldUserRef = doc(db, "users", userId);
          const oldUserSnap = await getDoc(oldUserRef);
          if (!oldUserSnap.exists()) {
            toast.error("Original subscriber document not found.");
            toast.dismiss(progressToast);
            setIsSyncing(false);
            return;
          }

          const userData = oldUserSnap.data();

          // 2. Prepare new user document data
          const newUserRef = doc(db, "users", newUid);
          await setDoc(newUserRef, {
            ...userData,
            uid: newUid,
            displayName: displayName || userData.displayName || "",
            email: email || userData.email || "",
            phone: phone || userData.phone || "",
            address: address || userData.address || "",
            accountNumber: accountNumber || userData.accountNumber || "",
            due_date: dueDateStr,
            due_time: dueTimeStr,
            payment_status: finalPaymentStatus,
            subscription_status: finalSubscriptionStatus,
            dueDate: dueInstant,
            clientId: clientId || "",
            status: updatedStatus,
            billStatus: legacyBillStatus,
            lastStatusCheck: serverTimestamp(),
          });

          // 3. Migrate subcollection: users/{userId}/payments
          const oldPaymentsRef = collection(db, "users", userId, "payments");
          const oldPaymentsSnap = await getDocs(oldPaymentsRef);
          for (const paymentDoc of oldPaymentsSnap.docs) {
            const paymentData = paymentDoc.data();
            const newPaymentRef = doc(db, "users", newUid, "payments", paymentDoc.id);
            await setDoc(newPaymentRef, {
              ...paymentData,
              userId: newUid
            });
            // Delete old payment doc
            await deleteDoc(paymentDoc.ref);
          }

          // 4. Migrate chats/{userId} document
          const oldChatRef = doc(db, "chats", userId);
          const oldChatSnap = await getDoc(oldChatRef);
          if (oldChatSnap.exists()) {
            const chatData = oldChatSnap.data();
            const newChatRef = doc(db, "chats", newUid);
            await setDoc(newChatRef, {
              ...chatData,
              userId: newUid
            });

            // Migrate subcollection: chats/{oldUid}/messages to chats/{newUid}/messages
            const oldMessagesRef = collection(db, "chats", userId, "messages");
            const oldMessagesSnap = await getDocs(oldMessagesRef);
            for (const msgDoc of oldMessagesSnap.docs) {
              const msgData = msgDoc.data();
              const newMsgRef = doc(db, "chats", newUid, "messages", msgDoc.id);
              await setDoc(newMsgRef, msgData);
              await deleteDoc(msgDoc.ref);
            }

            // Delete old chat document
            await deleteDoc(oldChatRef);
          }

          // 5. Delete old user document
          await deleteDoc(oldUserRef);

          toast.dismiss(progressToast);
          toast.success("Subscriber Account ID (UID) and profile migrated successfully!");
        } catch (migrationErr: any) {
          console.error("Migration error:", migrationErr);
          toast.dismiss(progressToast);
          toast.error(`Migration failed: ${migrationErr.message}`);
          setIsSyncing(false);
          return;
        } finally {
          setIsSyncing(false);
        }
      } else {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, { 
          displayName: displayName || "",
          email: email || "",
          phone: phone || "",
          address: address || "",
          accountNumber: accountNumber || "",
          due_date: dueDateStr,
          due_time: dueTimeStr,
          payment_status: finalPaymentStatus,
          subscription_status: finalSubscriptionStatus,
          dueDate: dueInstant,
          clientId: clientId || "",
          status: updatedStatus,
          billStatus: legacyBillStatus,
          lastStatusCheck: serverTimestamp(),
        });
        toast.success("Subscriber profile updated.");
      }
      setEditingScheduleUser(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const triggerEditClient = (client: UserProfile) => {
    const evalResult = evaluateSubscriberStatus(client);
    setTempDueDate(client.due_date || evalResult.due_date);
    setTempDueTime(client.due_time || evalResult.due_time);
    setTempPaymentStatus(client.payment_status || evalResult.payment_status);
    setTempSubscriptionStatus(client.subscription_status || evalResult.subscription_status);
    setTempClientId(client.clientId || "");
    setTempUid(client.uid);
    setTempDisplayName(client.displayName || "");
    setTempEmail(client.email || "");
    setTempPhone(client.phone || "");
    setTempAddress(client.address || "");
    setTempAccountNumber(client.accountNumber || "");
    setEditingScheduleUser(client);
  };

  const toggleUserSuspension = async (userId: string, currentStatus: string | undefined) => {
    try {
      const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { status: newStatus });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const syncAllUsersBilling = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    let updatedCount = 0;
    try {
      const now = new Date();
      for (const client of clients) {
        if (!client.uid) continue;
        
        const dueDate = client.dueDate?.toDate ? client.dueDate.toDate() : (client.dueDate ? new Date(client.dueDate) : null);
        if (!dueDate) continue;

        const updates: any = {};

        // Replication of logic from FirebaseProvider for consistency
        if (now >= dueDate) {
          // Scenario A: Deadline reached but user hasn't paid (balance exists)
          if (client.balance && client.balance > 0) {
            if (client.billStatus !== 'overdue') {
              updates.billStatus = 'overdue';
            }
            
            // Suspension check (2-day grace period)
            const suspendThreshold = new Date(dueDate.getTime() + (2 * 24 * 60 * 60 * 1000));
            if (now > suspendThreshold && client.status !== 'suspended') {
              updates.status = 'suspended';
            }
          } 
          // Scenario B: Deadline reached and user was 'paid' (cycle rollover)
          else if (client.billStatus === 'paid') {
            const plan = INTERNET_PLANS.find(p => p.id === client.currentPlanId) || INTERNET_PLANS[0];
            const nextMonth = new Date(dueDate);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            
            updates.dueDate = nextMonth;
            updates.balance = (client.balance || 0) + plan.price;
            updates.billStatus = 'due';
          }
        }

        // Auto-resume if status is suspended but they have paid (billStatus is paid and balance is 0)
        if (client.status === 'suspended' && client.billStatus === 'paid' && (!client.balance || client.balance <= 0)) {
          updates.status = 'active';
        }

        // Mark as "due" if balance exists but marked as "paid" (and not yet past due date)
        if (now < dueDate && client.balance && client.balance > 0 && client.billStatus === 'paid') {
          updates.billStatus = 'due';
        }

        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, "users", client.uid), updates);
          updatedCount++;
        }
      }
      toast.success(`Synchronization complete! ${updatedCount} profiles were reconciled.`);
    } catch (e) {
      console.error("Sync Error:", e);
      toast.error("An error occurred during global synchronization.");
    } finally {
      setIsSyncing(false);
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

  const handleSendBulkReminders = async (e: React.FormEvent) => {
    e.preventDefault();
    const targets = clients.filter(c => c.billStatus === 'overdue' || c.billStatus === 'due');
    if (targets.length === 0) {
      toast.error("NO OUTSTANDING NODE BALANCES DETECTED. TRANSMISSION ABORTED.");
      return;
    }

    const progressToast = toast.loading(`Dispatching reminder packets to ${targets.length} subscriber nodes...`);
    try {
      let count = 0;
      for (const target of targets) {
        const notifRef = collection(db, `users/${target.uid}/notifications`);
        await addDoc(notifRef, {
          title: bulkNotifForm.title,
          message: bulkNotifForm.message,
          type: bulkNotifForm.type,
          read: false,
          createdAt: serverTimestamp(),
        });
        count++;
      }
      toast.dismiss(progressToast);
      toast.success(`Successfully dispatched ${count} settlement reminders!`);
      setShowBulkReminderModal(false);
    } catch (err) {
      toast.dismiss(progressToast);
      console.error("Bulk reminder routing failed:", err);
      toast.error("Failed to fully package and dispatch bulk alerts.");
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
    <section className={`max-w-7xl mx-auto transition-all ${adminTab === "chats" ? "py-6 sm:py-16 px-2.5 sm:px-6" : "py-14 sm:py-24 px-4 sm:px-6"}`}>
      <div className="mb-12 space-y-8">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">
                Command Center
              </h3>
              <span className="text-[8px] font-mono text-text-muted border border-border-subtle px-1.5 py-0.5 rounded bg-bg-surface">
                2026 HF NETWORK CORP • HF-V40
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter leading-tight">
              MANAGEMENT
              <br />
              <span className="text-primary not-italic">OVERRIDE</span>
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
            {/* Main Server Link Button */}
            <a
              id="admin-main-server-btn"
              href="https://piscivorous-unopportunistic-amia.ngrok-free.dev/admin?page=dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-red-700 via-primary to-primary hover:brightness-110 text-white text-[10px] font-black uppercase tracking-widest italic border border-primary shadow-lg shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap cursor-pointer group"
              title="Open Main Server Admin Dashboard"
            >
              <Server size={15} className="animate-pulse text-white" />
              <span>Main Server</span>
              <ExternalLink size={12} className="opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full xl:w-auto bg-bg-surface p-1 border border-border-subtle">
              <div className="flex overflow-x-auto gap-1 no-scrollbar scroll-smooth">
                {[
                  { id: "payments", label: "Settlements", icon: CreditCard, count: null },
                  { id: "plans", label: "Infrastructure", icon: Zap, count: null },
                  { id: "clients", label: "Subscribers", icon: UsersIcon, count: null },
                  { id: "cycles", label: "Cycles", icon: Calendar, count: null },
                  { id: "tickets", label: "Tickets", icon: LifeBuoy, count: supportTickets.filter(t => t.status === "open").length },
                  { id: "chats", label: "Live Chat", icon: MessageSquare, count: chatSessions.length > 0 ? chatSessions.length : null },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setAdminTab(tab.id as any)}
                    className={`flex items-center gap-2 px-5 py-4 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                      adminTab === tab.id 
                      ? "bg-primary text-white italic" 
                      : "text-text-muted hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <tab.icon size={14} />
                    <span>{tab.label}</span>
                    {typeof tab.count === "number" && tab.count > 0 && (
                      <span className="px-1.5 py-0.5 text-[8px] font-black bg-amber-400 text-black rounded-full leading-none">
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Aggregate Revenue", value: `₱ ${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: "text-green-500" },
            { label: "Accounts Due", value: clients.filter(c => c.billStatus === 'due' || c.billStatus === 'overdue').length, icon: Receipt, color: "text-amber-500" },
            { label: "Active Nodes", value: activeSubs, icon: Zap, color: "text-primary" },
            { label: "Suspended Nodes", value: suspendedSubs, icon: UserMinus, color: "text-red-600" },
          ].map((metric, i) => (
            <motion.div
              key={`metric-${metric.label}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-bg-surface border border-border-subtle p-6 relative group overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <metric.icon size={48} />
              </div>
              <div className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-2">{metric.label}</div>
              <div className={`text-2xl font-black italic tracking-tighter ${metric.color}`}>
                {metric.value}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-bg-surface/50 border border-border-subtle backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-widest text-green-500 italic">GATEWAY ONLINE</span>
            </div>
            <div className="text-[10px] font-black uppercase tracking-tighter text-text-dim">
              Node: <span className="text-white italic">ASIA-EAST1-PROD</span>
              <span className="mx-2 opacity-30">|</span>
              GMT+8
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <a
              id="admin-status-main-server-btn"
              href="https://piscivorous-unopportunistic-amia.ngrok-free.dev/admin?page=dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2 bg-gradient-to-r from-red-600 to-primary hover:brightness-110 text-white flex items-center gap-2 transition-all uppercase text-[9px] font-black italic border border-primary shadow-md shadow-primary/20"
            >
              <Server size={12} className="animate-pulse" />
              <span>Main Server</span>
              <ExternalLink size={11} className="opacity-80" />
            </a>
            <button
              onClick={() => setShowTelegramModal(true)}
              className="px-5 py-2 bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 hover:text-white flex items-center gap-2 transition-all uppercase text-[9px] font-black italic rounded cursor-pointer"
              title="Configure Telegram Bot for Payment Settlement Notifications"
            >
              <Bot size={13} />
              <span>Telegram Bot</span>
              {telegramConfig?.configured && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>
            <button
              onClick={syncAllUsersBilling}
              disabled={isSyncing}
              className="px-6 py-2 bg-white/5 border border-white/10 text-white hover:bg-primary hover:border-primary flex items-center gap-2 transition-all uppercase text-[9px] font-black italic"
            >
              <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? "Syncing..." : "Sync Billing"}
            </button>
            <button
              onClick={onLogout}
              className="px-6 py-2 bg-red-600/10 border border-red-600/20 text-red-600 hover:bg-red-600 hover:text-white flex items-center gap-2 transition-all uppercase text-[9px] font-black italic"
            >
              <LogOut size={12} />
              Terminate
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-4">
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
              onClick={generateNextCycle}
              className="px-8 py-4 bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] italic hover:bg-hot-black border border-primary transition-all shadow-[0_10px_30px_rgba(220,38,38,0.3)] animate-pulse"
            >
              {billingCycles.length > 0 ? "+ PROPAGATE NEXT CYCLE" : "+ NEW BILLING CYCLE"}
            </button>
          )}
        </div>
      </div>
      <AnimatePresence>
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

      {!firebaseIsAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 p-8 border-2 border-dashed border-primary/30 bg-primary/5 text-center space-y-4"
        >
          <div className="flex justify-center">
            <Lock className="text-primary" size={32} />
          </div>
          <h3 className="text-lg font-black uppercase italic tracking-tight">
            Elevated Access <span className="text-primary not-italic">Identity Required</span>
          </h3>
          <p className="max-w-md mx-auto text-[11px] text-text-muted font-bold uppercase tracking-widest leading-relaxed">
            You have authenticated with the system key, but your current Google
            identity [#{user?.email}] is not recognized as a Database Admin in our records. 
            Real-time data synchronization may be restricted until your identity is verified.
          </p>
          {!user && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={loginWithGoogle}
                className="px-8 py-3 bg-primary text-white font-black uppercase text-[10px] tracking-[0.2em] italic hover:bg-primary-dark transition-all flex items-center gap-2 cursor-pointer shadow-md"
              >
                <LogIn size={14} /> Sign in with Google
              </button>
            </div>
          )}
        </motion.div>
      )}

      {adminTab === "payments" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-bg-surface border border-border-subtle mb-4">
            <div className="flex items-center gap-3">
              <Filter size={14} className="text-text-muted" />
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {(
                  [
                    {
                      id: "pending",
                      label: "Pending Settlements",
                      badge: payments.filter((p) => p.status === "pending").length,
                    },
                    {
                      id: "confirmed",
                      label: "Confirmed",
                      badge: payments.filter(
                        (p) => p.status === "confirmed" || p.status === "completed"
                      ).length,
                    },
                    {
                      id: "rejected",
                      label: "Rejected",
                      badge: payments.filter(
                        (p) => p.status === "rejected" || p.status === "failed"
                      ).length,
                    },
                    {
                      id: "all",
                      label: "All Records",
                      badge: payments.length,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id as any)}
                    className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded transition-all flex items-center gap-2 cursor-pointer ${
                      statusFilter === tab.id
                        ? "bg-primary text-white shadow-sm"
                        : "text-text-muted hover:text-white bg-slate-900/60 border border-border-subtle"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold ${
                        statusFilter === tab.id
                          ? "bg-black/30 text-white"
                          : tab.id === "pending" && tab.badge > 0
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowTelegramModal(true)}
                className="px-3.5 py-1.5 bg-sky-500/10 border border-sky-500/30 hover:bg-sky-500/20 text-sky-400 text-[9px] font-mono font-bold uppercase rounded flex items-center gap-1.5 transition-all cursor-pointer"
                title="Configure Telegram Bot for Pending Settlement alerts"
              >
                <Bot size={12} />
                <span>Telegram Bot: {telegramConfig?.configured ? "Connected" : "Setup"}</span>
                {telegramConfig?.configured && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>

              {payments.some((p) => p.status === "pending") && (
                <div className="text-[10px] font-mono text-amber-400 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded">
                  <Clock size={12} className="animate-spin" />
                  <span>
                    <strong>{payments.filter((p) => p.status === "pending").length}</strong> settlement request(s) awaiting admin review
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="sharp-card bg-bg-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg-surface/50">
                    <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle">
                      Customer &amp; Account
                    </th>
                    <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle">
                      Payment Amount
                    </th>
                    <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle">
                      Method &amp; Ref ID
                    </th>
                    <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle">
                      Uploaded Screenshot
                    </th>
                    <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle">
                      Date &amp; Time Submitted
                    </th>
                    <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle">
                      Payment Status
                    </th>
                    <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle text-right">
                      Admin Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-8 py-20 text-center">
                        <Loader2
                          className="animate-spin mx-auto text-primary"
                          size={32}
                        />
                      </td>
                    </tr>
                  ) : filteredPayments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-8 py-20 text-center text-text-muted uppercase text-[10px] font-black tracking-widest italic"
                      >
                        {payments.length === 0 ? "No settlement records in ledger" : `No ${statusFilter} records found`}
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((p) => {
                      const clientInfo = clientsMap.get(p.userId);
                      const customerName = p.customerName || clientInfo?.displayName || "Subscriber";
                      const accountId = p.accountNumber || clientInfo?.accountNumber || "N/A";
                      const isPending = p.status === "pending";
                      const isConfirmed = p.status === "confirmed" || p.status === "completed";
                      const isRejected = p.status === "rejected" || p.status === "failed";
                      const isOwnPayment = Boolean(user && p.userId === user.uid);

                      return (
                        <tr
                          key={`admin-payment-${p.id}`}
                          className="group hover:bg-slate-900/50 transition-colors border-b border-border-subtle"
                        >
                          {/* Customer Name & Account ID */}
                          <td className="px-6 py-5">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-white uppercase tracking-tight">
                                {customerName}
                              </span>
                              <span className="text-[10px] font-mono text-primary font-bold">
                                #{accountId}
                              </span>
                              {clientInfo?.email && (
                                <span className="text-[9px] text-text-dim truncate max-w-[140px]">
                                  {clientInfo.email}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Payment Amount */}
                          <td className="px-6 py-5">
                            <span className="font-mono font-bold text-sm text-white italic">
                              ₱ {p.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                            </span>
                          </td>

                          {/* Payment Method & Transaction/Reference ID */}
                          <td className="px-6 py-5">
                            <div className="space-y-1">
                              <span className="inline-block text-[9px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 bg-slate-900 border border-border-subtle text-slate-300 rounded">
                                {p.method || "QR Ph"}
                              </span>
                              <div className="font-mono text-xs text-primary font-bold break-all max-w-[170px]">
                                {p.referenceNumber}
                              </div>
                            </div>
                          </td>

                          {/* Uploaded Screenshot Proof */}
                          <td className="px-6 py-5">
                            {p.screenshotUrl ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setViewingScreenshot(getDisplayImageUrl(p.screenshotUrl) || null);
                                    setViewingScreenshotPayment(p);
                                  }}
                                  className="group/proof flex items-center gap-2 p-1.5 rounded-lg border border-slate-800 hover:border-primary bg-slate-950/80 transition-all cursor-pointer"
                                  title="Click to inspect proof screenshot"
                                >
                                  <img
                                    src={getDisplayImageUrl(p.screenshotUrl)}
                                    alt="Proof screenshot"
                                    loading="lazy"
                                    decoding="async"
                                    className="w-10 h-10 object-cover rounded bg-black"
                                  />
                                  <div className="flex flex-col text-left">
                                    <span className="text-[9px] font-mono font-bold uppercase text-primary flex items-center gap-1 group-hover/proof:underline">
                                      <Eye size={10} /> View Proof
                                    </span>
                                    <span className="text-[8px] font-mono text-text-muted">
                                      Click to zoom
                                    </span>
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  disabled={isDeletingScreenshot === p.id}
                                  onClick={() => deletePaymentScreenshot(p)}
                                  className="p-2 rounded-lg border border-rose-500/25 hover:border-rose-500 bg-rose-950/20 text-rose-400 hover:text-white hover:bg-rose-600 transition-all cursor-pointer disabled:opacity-40"
                                  title="Delete Screenshot (also removes from Vercel Blob Storage)"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] font-mono text-text-muted italic">
                                No screenshot
                              </span>
                            )}
                          </td>

                          {/* Date & Time Submitted */}
                          <td className="px-6 py-5">
                            <div className="text-[11px] font-bold text-slate-200">
                              {p.createdAt?.toDate
                                ? p.createdAt.toDate().toLocaleDateString("en-PH", {
                                    timeZone: ASIA_TIMEZONE,
                                    month: "short",
                                    day: "2-digit",
                                    year: "numeric",
                                  })
                                : "..."}
                            </div>
                            <div className="text-[9px] text-text-muted font-mono">
                              {p.createdAt?.toDate
                                ? p.createdAt.toDate().toLocaleTimeString("en-PH", {
                                    timeZone: ASIA_TIMEZONE,
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : ""}
                            </div>
                          </td>

                          {/* Payment Status */}
                          <td className="px-6 py-5">
                            {isPending ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/40 text-amber-400 rounded-md">
                                <Clock size={11} className="animate-spin" /> Pending Confirmation
                              </span>
                            ) : isConfirmed ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 rounded-md">
                                <CheckCircle2 size={11} /> Payment Confirmed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-mono font-black uppercase tracking-wider bg-rose-500/10 border border-rose-500/40 text-rose-400 rounded-md">
                                <X size={11} /> Payment Rejected
                              </span>
                            )}
                          </td>

                          {/* Admin Actions */}
                          <td className="px-6 py-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isPending ? (
                                isOwnPayment ? (
                                  <span
                                    className="text-[9px] font-mono text-amber-400/90 italic bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20"
                                    title="Security Rule: User cannot confirm their own payment"
                                  >
                                    Cannot confirm own payment
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => setConfirmingSettlement(p)}
                                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] font-bold uppercase tracking-wider rounded flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                                      title="Confirm Settlement (Finalizes payment and updates balance)"
                                    >
                                      <CheckCircle2 size={12} /> Confirm Settlement
                                    </button>
                                    <button
                                      onClick={() => {
                                        setRejectingPayment(p);
                                        setRejectionNotes("");
                                      }}
                                      className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-mono text-[10px] font-bold uppercase tracking-wider rounded flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                                      title="Reject Payment"
                                    >
                                      <X size={12} /> Reject Payment
                                    </button>
                                  </div>
                                )
                              ) : (
                                <div className="text-right">
                                  {p.audit && (
                                    <div className="text-[9px] font-mono text-text-muted">
                                      <span className="font-bold text-slate-300 capitalize">
                                        {p.audit.decision}
                                      </span>{" "}
                                      by {p.audit.actionBy?.split("@")[0]}
                                    </div>
                                  )}
                                  {p.rejectionReason && (
                                    <div
                                      className="text-[8px] font-mono text-rose-400 truncate max-w-[120px]"
                                      title={p.rejectionReason}
                                    >
                                      {p.rejectionReason}
                                    </div>
                                  )}
                                </div>
                              )}

                              <button
                                onClick={() => setSelectedReceipt(p)}
                                className="p-1.5 border border-border-subtle hover:border-primary text-text-muted hover:text-primary transition-all rounded cursor-pointer"
                                title="View Receipt / Settlement Details"
                              >
                                <Receipt size={14} />
                              </button>

                              <button
                                onClick={() => deletePayment(p)}
                                className="p-1.5 border border-red-500/20 text-text-muted hover:border-red-500 hover:text-red-500 transition-all rounded opacity-0 group-hover:opacity-100 cursor-pointer"
                                title="Delete Record"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
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
                      ? cycle.startDate.toDate().toLocaleDateString('en-PH', { timeZone: ASIA_TIMEZONE })
                      : cycle.startDate}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] uppercase font-black tracking-widest text-text-muted border-b border-border-subtle pb-2">
                  <span>End</span>
                  <span className="text-white">
                    {cycle.endDate?.toDate
                      ? cycle.endDate.toDate().toLocaleDateString('en-PH', { timeZone: ASIA_TIMEZONE })
                      : cycle.endDate}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] uppercase font-black tracking-widest text-primary border-b border-primary/20 pb-2 italic">
                  <span>Payment Deadline</span>
                  <span className="font-bold">
                    {cycle.dueDate?.toDate
                      ? cycle.dueDate.toDate().toLocaleDateString('en-PH', { timeZone: ASIA_TIMEZONE })
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
        <div className="space-y-4">
          {!firebaseIsAdmin && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-300 font-mono">
                <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                <span>Elevated Google Admin status (projectile.afk@gmail.com) is needed for real-time Firestore database sync.</span>
              </div>
              <button
                type="button"
                onClick={() => loginWithGoogle()}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-[9px] tracking-wider rounded transition-all cursor-pointer shrink-0"
              >
                Sign In With Google
              </button>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-3 lg:gap-6 h-[calc(100dvh-200px)] min-h-[460px] max-h-[820px] lg:h-[660px]">
            {/* Chat List - Hidden on mobile when a chat is actively selected */}
            <div
              className={`w-full lg:w-80 bg-bg-surface border border-border-subtle flex-col overflow-hidden rounded-lg ${
                selectedChat ? "hidden lg:flex" : "flex flex-1 h-full"
              }`}
            >
              <div className="p-3 sm:p-3.5 border-b border-border-subtle bg-bg-surface space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                    <MessageSquare size={13} className="text-primary" />
                    <span>Active Conversations</span>
                  </h4>
                  <span className="text-[9px] font-mono font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {chatSessions.length} Active
                  </span>
                </div>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="Search client, account, or UID..."
                    className="w-full bg-bg-base border border-border-subtle pl-7 pr-2.5 py-2 text-[10px] font-mono text-white placeholder:text-text-muted focus:outline-none focus:border-primary rounded"
                  />
                </div>
              </div>

              {/* Start new chat with subscriber dropdown */}
              {clients.length > 0 && (
                <div className="p-2 sm:p-2.5 border-b border-border-subtle bg-bg-base/40">
                  <select
                    onChange={(e) => {
                      const selectedUid = e.target.value;
                      if (!selectedUid) return;
                      const client = clients.find((c) => c.uid === selectedUid);
                      const existingChat = chatSessions.find((c) => (c.userId || c.id) === selectedUid);
                      if (existingChat) {
                        setSelectedChat(existingChat);
                      } else if (client) {
                        const newSession: ChatSession = {
                          id: client.uid,
                          userId: client.uid,
                          userName: client.displayName || client.accountNumber || "Subscriber",
                          lastMessage: "",
                          updatedAt: null,
                        };
                        setSelectedChat(newSession);
                      }
                      e.target.value = "";
                    }}
                    defaultValue=""
                    className="w-full bg-slate-900 border border-border-subtle text-[9px] font-mono text-text-muted py-2 px-2.5 rounded focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="" disabled>+ Start chat with subscriber...</option>
                    {clients.map((c) => (
                      <option key={c.uid} value={c.uid}>
                        {c.displayName || c.accountNumber} ({c.accountNumber || c.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/50 overscroll-contain">
                {chatSessions.filter((c) => {
                  if (!chatSearch.trim()) return true;
                  const query = chatSearch.toLowerCase();
                  return (
                    c.userName?.toLowerCase().includes(query) ||
                    c.userId?.toLowerCase().includes(query)
                  );
                }).length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <MessageSquare size={24} className="mx-auto text-text-muted/40" />
                    <div className="text-[10px] font-bold text-text-muted uppercase">
                      {chatSearch.trim() ? "No matching conversations" : "No active chats"}
                    </div>
                    <p className="text-[8px] text-text-muted font-mono">
                      Subscriber chats from the website live chat widget appear here automatically.
                    </p>
                  </div>
                ) : (
                  chatSessions
                    .filter((c) => {
                      if (!chatSearch.trim()) return true;
                      const query = chatSearch.toLowerCase();
                      return (
                        c.userName?.toLowerCase().includes(query) ||
                        c.userId?.toLowerCase().includes(query)
                      );
                    })
                    .map((chat, idx) => {
                      const isSelected =
                        selectedChat?.id === chat.id ||
                        selectedChat?.userId === (chat.userId || chat.id);
                      return (
                        <div
                          key={`chat-session-${chat.id || idx}`}
                          onClick={() => setSelectedChat(chat)}
                          className={`w-full p-3 sm:p-3.5 text-left transition-all hover:bg-bg-base/60 cursor-pointer flex justify-between items-center group relative active:bg-bg-base/80 ${
                            isSelected ? "bg-bg-base border-r-4 border-r-primary shadow-sm" : ""
                          }`}
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                              <div className="font-black uppercase italic text-xs truncate text-white">
                                {chat.userName}
                              </div>
                            </div>
                            <div className="text-[10px] text-text-muted truncate">
                              {chat.lastMessage || "No messages yet"}
                            </div>
                            <div className="text-[8px] text-primary/80 mt-1 font-mono font-bold uppercase">
                              {chat.updatedAt?.toDate
                                ? chat.updatedAt.toDate().toLocaleString("en-PH", {
                                    timeZone: ASIA_TIMEZONE,
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })
                                : chat.lastMessageAt?.toDate
                                ? chat.lastMessageAt.toDate().toLocaleString("en-PH", {
                                    timeZone: ASIA_TIMEZONE,
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })
                                : "Active"}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteConversation(chat);
                              }}
                              className="p-2 border border-red-500/20 text-red-400 hover:text-white hover:bg-red-500/80 transition-all opacity-60 hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 flex items-center justify-center rounded cursor-pointer shrink-0"
                              title="Delete Conversation"
                            >
                              <Trash2 size={12} />
                            </button>
                            <ChevronLeft size={14} className="text-text-muted rotate-180 lg:hidden shrink-0" />
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {/* Chat Window - Hidden on mobile when NO chat is selected */}
            <div
              className={`flex-1 bg-bg-surface border border-border-subtle flex-col overflow-hidden relative rounded-lg ${
                !selectedChat ? "hidden lg:flex" : "flex flex-1 h-full"
              }`}
            >
              {selectedChat ? (
                <>
                  <div className="p-3 sm:p-4 bg-bg-surface border-b border-border-subtle flex justify-between items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      {/* Mobile Back Button to return to active conversations list */}
                      <button
                        type="button"
                        onClick={() => setSelectedChat(null)}
                        className="lg:hidden px-2.5 py-1.5 text-white bg-bg-base hover:bg-white/10 border border-border-subtle rounded-lg flex items-center gap-1 shrink-0 cursor-pointer active:scale-95 transition-transform"
                        title="Back to conversations"
                        aria-label="Back to conversations"
                      >
                        <ChevronLeft size={16} className="text-primary" />
                        <span className="text-[10px] font-mono font-bold uppercase tracking-tight">Chats</span>
                      </button>

                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                        <UserIcon size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <h3 className="text-xs sm:text-sm font-black uppercase italic tracking-wider text-white truncate max-w-[130px] sm:max-w-[200px]">
                            {selectedChat.userName}
                          </h3>
                          <span className="text-[7px] sm:text-[8px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono font-bold px-1.5 py-0.2 rounded uppercase shrink-0">
                            Live
                          </span>
                        </div>
                        <p className="text-[8px] sm:text-[9px] text-text-muted font-mono font-bold truncate">
                          UID: {selectedChat.userId || selectedChat.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => deleteConversation(selectedChat)}
                        className="px-2.5 py-1.5 sm:px-3 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center gap-1 text-[9px] font-mono font-black uppercase rounded cursor-pointer"
                        title="Purge Conversation History"
                      >
                        <Trash2 size={12} />
                        <span className="hidden sm:inline">Purge Chat</span>
                      </button>
                    </div>
                  </div>

                  <div
                    ref={adminChatScrollRef}
                    className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 bg-bg-base/30 scrollbar-thin scrollbar-thumb-primary/20 overscroll-contain"
                  >
                    {chatMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center opacity-40 text-center py-10 space-y-2">
                        <MessageSquare size={36} className="text-primary" />
                        <p className="text-xs font-mono font-bold uppercase text-white">No messages recorded yet</p>
                        <p className="text-[9px] text-text-muted max-w-xs">
                          Send a message below to start this live support channel with the subscriber.
                        </p>
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={`chat-msg-${msg.id || idx}`}
                          className={`flex ${msg.senderRole === "admin" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] sm:max-w-[70%] p-3 sm:p-3.5 text-xs leading-relaxed ${
                              msg.senderRole === "admin"
                                ? "bg-primary text-white italic rounded-l-xl rounded-tr-xl shadow-lg shadow-primary/10"
                                : "bg-bg-surface border border-border-subtle text-white rounded-r-xl rounded-tl-xl"
                            }`}
                          >
                            <div className="text-[8px] font-mono uppercase tracking-wider opacity-70 mb-1 flex items-center justify-between gap-4">
                              <span>{msg.senderRole === "admin" ? "Admin Support" : selectedChat.userName}</span>
                              <span>
                                {msg.createdAt?.toDate
                                  ? msg.createdAt.toDate().toLocaleTimeString("en-PH", {
                                      timeZone: ASIA_TIMEZONE,
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : ""}
                              </span>
                            </div>
                            <div className="whitespace-pre-wrap">{msg.text}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Quick Response Templates for Mobile & Desktop */}
                  <div className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-slate-950/70 border-t border-border-subtle flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x">
                    <span className="text-[8px] font-mono uppercase font-bold text-text-muted shrink-0 mr-1">
                      Quick:
                    </span>
                    {[
                      "Checking your connection now...",
                      "Payment verified & posted. Thank you!",
                      "Please reboot your optical modem.",
                      "A support engineer has been assigned.",
                    ].map((tmpl) => (
                      <button
                        key={tmpl}
                        type="button"
                        onClick={() => setReply(tmpl)}
                        className="px-2 py-1 bg-slate-900 border border-slate-700/60 hover:border-primary text-slate-300 hover:text-white text-[8px] font-mono rounded whitespace-nowrap transition-colors cursor-pointer active:bg-primary/20"
                      >
                        {tmpl}
                      </button>
                    ))}
                  </div>

                  {/* Reply Input Form */}
                  <form
                    onSubmit={handleSendReply}
                    className="p-2.5 sm:p-4 bg-bg-surface border-t border-border-subtle flex gap-2 sm:gap-3 items-center"
                  >
                    <input
                      type="text"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Type response to subscriber (Enter to send)..."
                      disabled={isSendingReply}
                      className="flex-1 bg-bg-base border border-border-subtle p-2.5 sm:p-3 text-sm sm:text-xs text-white focus:outline-none focus:border-primary transition-all placeholder:text-text-muted italic rounded min-h-[44px]"
                    />
                    <button
                      type="submit"
                      disabled={!reply.trim() || isSendingReply}
                      className="px-4 sm:px-7 py-2.5 sm:py-3 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-black uppercase text-[10px] tracking-widest italic transition-all flex items-center justify-center gap-1.5 rounded cursor-pointer shrink-0 min-h-[42px]"
                    >
                      {isSendingReply ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      <span className="hidden xs:inline sm:inline">Send</span>
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center opacity-40 p-6 sm:p-8 text-center space-y-3">
                  <MessageSquare size={48} className="text-primary mb-1" />
                  <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-white">
                    Select a conversation to begin
                  </p>
                  <p className="text-[9px] sm:text-[10px] text-text-muted max-w-sm">
                    Pick any active conversation on the left, or use the dropdown to start a direct channel with a registered subscriber.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : adminTab === "tickets" ? (
        <Suspense fallback={<div className="p-12 text-center text-text-muted text-xs font-bold uppercase tracking-widest">Loading Tickets Console...</div>}>
          <AdminTicketsTab tickets={supportTickets} />
        </Suspense>
      ) : (
        <>
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4 items-center w-full">
              <div className="relative flex-1 group w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" size={16} />
                <input
                  type="text"
                  placeholder="Search by name, email, account number or client ID..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="w-full bg-bg-surface border border-border-subtle pl-12 pr-4 py-4 text-xs text-white focus:outline-none focus:border-primary transition-all italic placeholder:text-text-dim/50"
                />
              </div>
              <div className="flex flex-wrap gap-2 items-center justify-end w-full md:w-auto">
                <div className="flex flex-wrap gap-1 p-1 bg-bg-surface border border-border-subtle">
                  {(["all", "active", "due", "overdue", "paid", "suspended"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setClientFilter(f)}
                      className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${clientFilter === f ? "bg-primary text-white italic" : "text-text-muted hover:text-white"}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowBulkReminderModal(true)}
                  className={`px-4 py-2 text-[9px] font-black uppercase tracking-[0.15em] italic flex items-center gap-2 transition-all border ${
                    clients.filter(c => c.billStatus === 'overdue' || c.billStatus === 'due').length > 0
                      ? "bg-red-600 border-red-500 hover:bg-red-700 text-white shadow-lg shadow-red-600/20"
                      : "bg-bg-surface border-border-subtle text-text-muted hover:bg-bg-surface/80"
                  }`}
                >
                  <Bell size={12} className={clients.filter(c => c.billStatus === 'overdue' || c.billStatus === 'due').length > 0 ? "animate-bounce" : ""} />
                  Send Reminder ({clients.filter(c => c.billStatus === 'overdue' || c.billStatus === 'due').length})
                </button>
              </div>
            </div>
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest italic pl-1 flex items-center justify-between">
              <span>Displaying {filteredClients.length} of {clients.length} Subscribers</span>
              <span className="text-[9px] font-mono text-slate-400">Timezone: Asia/Manila (UTC+8)</span>
            </p>
          </div>
          
          <div className="sharp-card bg-bg-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-bg-surface/50">
                  <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle">
                    Subscriber &amp; Node
                  </th>
                  <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle">
                    Account ID
                  </th>
                  <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle">
                    Exact Due Date &amp; Time (PHT)
                  </th>
                  <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle text-center">
                    Subscription Status
                  </th>
                  <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle text-center">
                    Payment Status
                  </th>
                  <th className="px-6 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle text-right">
                    Operations
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => {
                  const evaluation = evaluateSubscriberStatus(client);
                  return (
                    <tr
                      key={client.uid}
                      className="border-b border-border-subtle/50 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-6 py-5">
                        <div 
                          onClick={() => triggerEditClient(client)}
                          className="group cursor-pointer hover:text-primary transition-colors inline-block"
                          title="Click to Edit Profile & UID"
                        >
                          <div className="font-bold text-white uppercase text-xs tracking-tight flex items-center gap-2">
                            {client.displayName}
                            <Edit3 size={10} className="text-text-muted group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                            {client.status === 'suspended' && (
                              <span className="px-2 py-0.5 bg-red-600/20 text-red-500 border border-red-500/30 text-[8px] font-black uppercase tracking-widest italic normal-case">
                                Suspended
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] text-text-muted font-mono flex items-center gap-1 mt-0.5">
                            {client.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div 
                          onClick={() => triggerEditClient(client)}
                          className="group cursor-pointer hover:text-primary transition-colors inline-block"
                          title="Click to Edit Profile & UID"
                        >
                          <div className="text-[10px] font-black text-primary tracking-widest uppercase mb-1 flex items-center gap-1.5">
                            #{client.accountNumber}
                            <Edit3 size={10} className="text-text-muted group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          {client.clientId && (
                            <div className="text-[9px] font-black text-white/70 tracking-widest uppercase mb-1">
                              CID: {client.clientId}
                            </div>
                          )}
                          <div className="text-[8px] text-text-dim/50 font-mono italic">
                            UID: {client.uid}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="space-y-1">
                          <div className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                            <Clock size={12} className="text-primary" />
                            <span>{evaluation.due_date} • {evaluation.due_time}</span>
                          </div>
                          <div className="text-[9px] font-mono">
                            {evaluation.subscription_status === "PAID" ? (
                              <span className="text-emerald-400 font-bold">Settlement Confirmed</span>
                            ) : evaluation.subscription_status === "OVERDUE" ? (
                              <span className="text-red-400 font-bold">Overdue (72h Grace Expired)</span>
                            ) : evaluation.subscription_status === "DUE" ? (
                              <span className="text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                72h Grace: ~{evaluation.remainingGraceHours}h {evaluation.remainingGraceMinutes}m left
                              </span>
                            ) : (
                              <span className="text-emerald-300 font-medium">Before Due Date</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded border font-mono ${
                            evaluation.subscription_status === "ACTIVE"
                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                              : evaluation.subscription_status === "DUE"
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                              : evaluation.subscription_status === "OVERDUE"
                              ? "bg-red-500/20 border-red-500/50 text-red-400 animate-pulse"
                              : "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                          }`}
                        >
                          {evaluation.subscription_status}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded border font-mono ${
                            evaluation.payment_status === "paid"
                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                              : evaluation.payment_status === "processing"
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                              : evaluation.payment_status === "rejected"
                              ? "bg-rose-500/20 border-rose-500/50 text-rose-400"
                              : "bg-slate-800 border-slate-700 text-slate-400"
                          }`}
                        >
                          {evaluation.payment_status === "processing"
                            ? "Processing"
                            : evaluation.payment_status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Dedicated Manual Subscription Renewal Button */}
                          <button
                            onClick={() => handleAdminRenewSubscription(client)}
                            className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest italic transition-all flex items-center gap-1.5 rounded cursor-pointer border ${
                              evaluation.subscription_status === "PAID"
                                ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-emerald-400 shadow-md shadow-emerald-600/30"
                                : "bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-white border-emerald-500/40"
                            }`}
                            title="Renew subscription billing cycle by 30 days"
                          >
                            <RefreshCw size={10} />
                            <span>Renew Cycle</span>
                          </button>

                          <button
                            onClick={() => triggerEditClient(client)}
                            className="px-3 py-1.5 border border-primary/30 text-primary hover:bg-primary hover:text-white text-[9px] font-black uppercase tracking-widest italic transition-all flex items-center gap-1 rounded"
                          >
                            <Edit3 size={10} /> Edit
                          </button>

                          <button
                            onClick={() => toggleUserSuspension(client.uid, client.status)}
                            className={`px-3 py-1.5 border ${client.status === 'suspended' ? "border-green-500 text-green-500 hover:bg-green-500 hover:text-white" : "border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-white"} text-[9px] font-black uppercase tracking-widest italic transition-all flex items-center gap-1 rounded`}
                          >
                            {client.status === 'suspended' ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                            {client.status === 'suspended' ? "Activate" : "Suspend"}
                          </button>

                          <button
                            onClick={() => setNotifyingUser(client)}
                            className="px-2.5 py-1.5 border border-primary/30 text-primary hover:bg-primary hover:text-white text-[9px] font-black uppercase tracking-widest italic transition-all flex items-center gap-1 rounded"
                            title="Dispatch Alert"
                          >
                            <Bell size={10} />
                          </button>

                          <button
                            onClick={() => deleteSubscriber(client)}
                            className="p-1.5 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all rounded"
                            title="Delete Subscriber"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )}

      <AnimatePresence>
        {selectedReceipt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-bg-base/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setSelectedReceipt(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="sharp-card bg-bg-base max-w-lg w-full overflow-hidden my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-primary p-6 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Receipt size={20} />
                  <span className="font-black uppercase tracking-widest italic">
                    Settlement Verification View
                  </span>
                </div>
                <button
                  onClick={() => setSelectedReceipt(null)}
                  className="hover:opacity-80 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 sm:p-8 space-y-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                    <span className="text-text-muted uppercase text-[10px]">Customer Name</span>
                    <span className="text-white font-bold">
                      {selectedReceipt.customerName ||
                        clientsMap.get(selectedReceipt.userId)?.displayName ||
                        "Subscriber"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                    <span className="text-text-muted uppercase text-[10px]">Account ID</span>
                    <span className="text-primary font-bold">
                      #{selectedReceipt.accountNumber ||
                        clientsMap.get(selectedReceipt.userId)?.accountNumber ||
                        "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                    <span className="text-text-muted uppercase text-[10px]">Payment Amount</span>
                    <span className="text-emerald-400 font-bold text-base">
                      ₱ {selectedReceipt.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                    <span className="text-text-muted uppercase text-[10px]">Payment Method</span>
                    <span className="text-white">{selectedReceipt.method || "QR Ph"}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                    <span className="text-text-muted uppercase text-[10px]">Reference / Trace ID</span>
                    <span className="text-primary font-bold break-all">
                      {selectedReceipt.referenceNumber}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                    <span className="text-text-muted uppercase text-[10px]">Date &amp; Time Submitted</span>
                    <span className="text-text-dim text-[11px]">
                      {selectedReceipt.createdAt?.toDate
                        ? selectedReceipt.createdAt
                            .toDate()
                            .toLocaleString("en-PH", { timeZone: ASIA_TIMEZONE })
                        : "Processing"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted uppercase text-[10px]">Payment Status</span>
                    <div>
                      {selectedReceipt.status === "pending" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/40 text-amber-400 rounded">
                          <Clock size={10} className="animate-spin" /> Pending Confirmation
                        </span>
                      ) : selectedReceipt.status === "confirmed" || selectedReceipt.status === "completed" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 rounded">
                          <CheckCircle2 size={10} /> Confirmed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider bg-rose-500/10 border border-rose-500/40 text-rose-400 rounded">
                          <X size={10} /> Rejected
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Audit Details if available */}
                {selectedReceipt.audit && (
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1 font-mono text-[10px]">
                    <div className="text-text-muted uppercase font-bold flex items-center gap-1">
                      <span>Audit Record ({selectedReceipt.audit.decision})</span>
                    </div>
                    <div className="text-slate-300">
                      Action by: <strong>{selectedReceipt.audit.actionBy}</strong>
                    </div>
                    {selectedReceipt.audit.notes && (
                      <div className="text-slate-400 italic">
                        Notes: {selectedReceipt.audit.notes}
                      </div>
                    )}
                  </div>
                )}

                {/* Screenshot Display */}
                {selectedReceipt.screenshotUrl ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase text-text-muted flex items-center gap-1">
                        <ImageIcon size={12} /> Uploaded Proof Screenshot
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setViewingScreenshot(getDisplayImageUrl(selectedReceipt.screenshotUrl) || null);
                            setViewingScreenshotPayment(selectedReceipt);
                          }}
                          className="text-primary hover:underline text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                        >
                          <Eye size={11} /> Open Fullscreen
                        </button>
                        <button
                          type="button"
                          disabled={isDeletingScreenshot === selectedReceipt.id}
                          onClick={() => deletePaymentScreenshot(selectedReceipt)}
                          className="text-rose-400 hover:text-rose-300 hover:underline text-[10px] font-mono flex items-center gap-1 cursor-pointer disabled:opacity-40"
                          title="Delete screenshot from Admin & Vercel Blob storage"
                        >
                          <Trash2 size={11} /> Delete Screenshot
                        </button>
                      </div>
                    </div>
                    <div
                      onClick={() => {
                        setViewingScreenshot(getDisplayImageUrl(selectedReceipt.screenshotUrl) || null);
                        setViewingScreenshotPayment(selectedReceipt);
                      }}
                      className="aspect-video bg-slate-950 border border-border-subtle overflow-hidden relative group cursor-pointer rounded-lg"
                    >
                      <img
                        src={getDisplayImageUrl(selectedReceipt.screenshotUrl)}
                        alt="Receipt proof"
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-[10px] font-black uppercase tracking-widest">
                        <ExternalLink size={14} /> Open Full Resolution
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center border-2 border-dashed border-border-subtle text-text-dim uppercase text-[10px] font-black tracking-widest italic rounded-lg">
                    No Screenshot Uploaded
                  </div>
                )}

                {/* Actions */}
                {selectedReceipt.status === "pending" ? (
                  user && selectedReceipt.userId === user.uid ? (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono text-center rounded-xl">
                      Security Policy: User cannot confirm their own payment.
                    </div>
                  ) : (
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => {
                          const r = selectedReceipt;
                          setSelectedReceipt(null);
                          setConfirmingSettlement(r);
                        }}
                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold uppercase text-xs tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/20"
                      >
                        <CheckCircle2 size={14} /> Confirm Settlement
                      </button>
                      <button
                        onClick={() => {
                          const r = selectedReceipt;
                          setSelectedReceipt(null);
                          setRejectingPayment(r);
                          setRejectionNotes("");
                        }}
                        className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold uppercase text-xs tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-rose-600/20"
                      >
                        <X size={14} /> Reject Payment
                      </button>
                    </div>
                  )
                ) : (
                  <button
                    onClick={() => setSelectedReceipt(null)}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold uppercase text-xs tracking-wider rounded-xl transition-all cursor-pointer"
                  >
                    Close Verification View
                  </button>
                )}
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

        {chatToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-hot-black/95 flex items-center justify-center p-6 backdrop-blur-xl"
            onClick={() => setChatToDelete(null)}
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
                PURGE <span className="text-primary not-italic">CHAT</span>?
              </h3>
              <p className="text-xs text-text-muted font-bold uppercase tracking-widest leading-relaxed mb-10">
                Are you sure you want to delete conversation with <span className="text-white">{chatToDelete.userName}</span>?
                All messages and chat history in this channel will be permanently scrubbed from the system.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={confirmConversationDeletion}
                  className="w-full py-5 bg-primary text-white font-black uppercase text-[12px] tracking-[0.3em] italic hover:bg-primary-dark transition-all"
                >
                  CONFIRM PURGE
                </button>
                <button
                  onClick={() => setChatToDelete(null)}
                  className="w-full py-3 text-[10px] font-black uppercase text-text-muted hover:text-white tracking-[0.4em] transition-all"
                >
                  ABORT OPERATION
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Admin Confirm Settlement Modal */}
        {confirmingSettlement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10003] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => !isProcessingSettlement && setConfirmingSettlement(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400 font-bold block">
                      Admin Settlement Review
                    </span>
                    <h3 className="text-lg font-bold text-white">
                      Confirm Settlement
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmingSettlement(null)}
                  disabled={isProcessingSettlement}
                  className="text-text-muted hover:text-white cursor-pointer disabled:opacity-50"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Details Box */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                  <span className="text-text-muted uppercase text-[11px]">Customer Name</span>
                  <span className="text-white font-bold">
                    {confirmingSettlement.customerName ||
                      clientsMap.get(confirmingSettlement.userId)?.displayName ||
                      "Subscriber"}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                  <span className="text-text-muted uppercase text-[11px]">Account ID</span>
                  <span className="text-primary font-bold">
                    #{confirmingSettlement.accountNumber ||
                      clientsMap.get(confirmingSettlement.userId)?.accountNumber ||
                      "N/A"}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                  <span className="text-text-muted uppercase text-[11px]">Payment Amount</span>
                  <span className="text-emerald-400 font-bold text-base">
                    ₱ {confirmingSettlement.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                  <span className="text-text-muted uppercase text-[11px]">Payment Method</span>
                  <span className="text-white">{confirmingSettlement.method || "QR Ph"}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                  <span className="text-text-muted uppercase text-[11px]">Transaction / Reference ID</span>
                  <span className="text-primary font-bold break-all">
                    {confirmingSettlement.referenceNumber}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                  <span className="text-text-muted uppercase text-[11px]">Date &amp; Time Submitted</span>
                  <span className="text-text-dim text-[11px]">
                    {confirmingSettlement.createdAt?.toDate
                      ? confirmingSettlement.createdAt
                          .toDate()
                          .toLocaleString("en-PH", { timeZone: ASIA_TIMEZONE })
                      : "Processing"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted uppercase text-[11px]">Current Status</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/40 text-amber-400 rounded">
                    <Clock size={10} className="animate-spin" /> Pending Confirmation
                  </span>
                </div>
              </div>

              {/* Proof Preview */}
              {confirmingSettlement.screenshotUrl && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-text-muted uppercase">
                    <span>Uploaded Screenshot Proof</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setViewingScreenshot(getDisplayImageUrl(confirmingSettlement.screenshotUrl) || null);
                          setViewingScreenshotPayment(confirmingSettlement);
                        }}
                        className="text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Eye size={12} /> View Full Size
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingScreenshot === confirmingSettlement.id}
                        onClick={() => deletePaymentScreenshot(confirmingSettlement)}
                        className="text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-40"
                        title="Delete screenshot from Admin & Vercel Blob storage"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                  <div
                    onClick={() => {
                      setViewingScreenshot(getDisplayImageUrl(confirmingSettlement.screenshotUrl) || null);
                      setViewingScreenshotPayment(confirmingSettlement);
                    }}
                    className="h-32 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden cursor-pointer group"
                  >
                    <img
                      src={getDisplayImageUrl(confirmingSettlement.screenshotUrl)}
                      alt="Proof"
                      loading="lazy"
                      decoding="async"
                      className="h-full object-contain group-hover:scale-105 transition-transform"
                    />
                  </div>
                </div>
              )}

              {/* Policy Advisory Note */}
              <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-emerald-200/90 text-[11px] space-y-1 leading-relaxed">
                <p className="font-bold flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 size={12} /> Settlement Finalization Notice:
                </p>
                <p className="text-[10px] text-text-muted">
                  • Payment status will become <strong>Confirmed</strong>.
                  <br />• ₱{confirmingSettlement.amount.toLocaleString()} will be credited toward subscriber balance.
                  <br />• <strong>Subscription renewal or extension will NOT occur automatically.</strong>
                  <br />• Permanent audit trail will record admin identity: <strong>{user?.email}</strong>.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={isProcessingSettlement}
                  onClick={() => setConfirmingSettlement(null)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs font-bold uppercase rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isProcessingSettlement}
                  onClick={handleConfirmSettlement}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold uppercase rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  {isProcessingSettlement ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  Confirm Settlement
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Admin Reject Payment Modal */}
        {rejectingPayment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10003] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => !isProcessingSettlement && setRejectingPayment(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                    <X size={22} />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-rose-400 font-bold block">
                      Admin Settlement Review
                    </span>
                    <h3 className="text-lg font-bold text-white">
                      Reject Payment Submission
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => setRejectingPayment(null)}
                  disabled={isProcessingSettlement}
                  className="text-text-muted hover:text-white cursor-pointer disabled:opacity-50"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5 font-mono text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-text-muted uppercase text-[11px]">Customer &amp; Ref ID</span>
                  <span className="text-white font-bold">
                    {rejectingPayment.customerName ||
                      clientsMap.get(rejectingPayment.userId)?.displayName ||
                      "Subscriber"}{" "}
                    • {rejectingPayment.referenceNumber}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted uppercase text-[11px]">Payment Amount</span>
                  <span className="text-rose-400 font-bold">₱ {rejectingPayment.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted uppercase text-[11px]">Payment Method</span>
                  <span className="text-slate-300">{rejectingPayment.method || "QR Ph"}</span>
                </div>
              </div>

              {/* Rejection Reason Input */}
              <div className="space-y-2">
                <label className="text-[11px] font-mono uppercase text-text-muted font-bold block">
                  Rejection Reason / Notes (Logged in Audit &amp; Sent to Subscriber)
                </label>
                <textarea
                  value={rejectionNotes}
                  onChange={(e) => setRejectionNotes(e.target.value)}
                  placeholder="State reason for rejection (e.g. proof screenshot unreadable, invalid transaction reference, amount does not match, duplicate receipt)..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-white placeholder-slate-600 focus:border-rose-500 outline-none"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Unclear screenshot proof",
                    "Reference ID not found",
                    "Amount mismatch",
                    "Duplicate submission",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRejectionNotes(preset)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded cursor-pointer transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-xl text-rose-200/90 text-[11px] leading-relaxed">
                <p className="text-[10px] text-text-muted">
                  • Payment status becomes <strong>Rejected</strong>.
                  <br />• Subscriber balance and subscription remain untouched.
                  <br />• Reason will be logged under admin <strong>{user?.email}</strong>.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={isProcessingSettlement}
                  onClick={() => {
                    setRejectingPayment(null);
                    setRejectionNotes("");
                  }}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs font-bold uppercase rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isProcessingSettlement}
                  onClick={handleRejectPayment}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold uppercase rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20 disabled:opacity-50"
                >
                  {isProcessingSettlement ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <X size={14} />
                  )}
                  Reject Payment
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
            onClick={() => {
              setViewingScreenshot(null);
              setViewingScreenshotPayment(null);
            }}
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
                  onClick={() => {
                    setViewingScreenshot(null);
                    setViewingScreenshotPayment(null);
                  }}
                  className="w-12 h-12 bg-white/10 hover:bg-primary text-white flex items-center justify-center transition-all group cursor-pointer"
                >
                  <X size={24} className="group-hover:rotate-90 transition-transform" />
                </button>
              </div>
              
              <div className="w-full h-full p-8 flex items-center justify-center">
                <img
                  src={viewingScreenshot}
                  alt="Proof of Payment"
                  decoding="async"
                  className="max-w-full max-h-full object-contain shadow-2xl border-4 border-white/5"
                />
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4">
                <a
                  href={viewingScreenshot}
                  target="_blank"
                  rel="noreferrer"
                  className="px-8 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-widest italic hover:bg-primary-dark transition-all flex items-center gap-2"
                >
                  <ExternalLink size={14} /> Open Original
                </a>
                {viewingScreenshotPayment && (
                  <button
                    type="button"
                    disabled={isDeletingScreenshot === viewingScreenshotPayment.id}
                    onClick={() => deletePaymentScreenshot(viewingScreenshotPayment)}
                    className="px-8 py-3 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={14} /> Delete Screenshot (Blob)
                  </button>
                )}
                <button
                  onClick={() => {
                    setViewingScreenshot(null);
                    setViewingScreenshotPayment(null);
                  }}
                  className="px-8 py-3 border border-white/20 text-white text-[10px] font-black uppercase tracking-widest hover:border-white transition-all cursor-pointer"
                >
                  Close Viewer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {notifyingUser && (
          <NotificationModal
            key="notif-modal"
            notifyingUser={notifyingUser}
            setNotifyingUser={setNotifyingUser}
            notifForm={notifForm}
            setNotifForm={setNotifForm}
            handleSendNotification={handleSendNotification}
          />
        )}

        {showBulkReminderModal && (
          <BulkReminderModal
            key="bulk-notif-modal"
            show={showBulkReminderModal}
            onClose={() => setShowBulkReminderModal(false)}
            bulkNotifForm={bulkNotifForm}
            setBulkNotifForm={setBulkNotifForm}
            handleSendBulkReminders={handleSendBulkReminders}
            targets={clients.filter(c => c.billStatus === 'overdue' || c.billStatus === 'due')}
          />
        )}

        {editingScheduleUser && (
          <ScheduleModal
            key="sched-modal"
            editingScheduleUser={editingScheduleUser}
            setEditingScheduleUser={setEditingScheduleUser}
            tempDueDate={tempDueDate}
            setTempDueDate={setTempDueDate}
            tempDueTime={tempDueTime}
            setTempDueTime={setTempDueTime}
            tempPaymentStatus={tempPaymentStatus}
            setTempPaymentStatus={setTempPaymentStatus}
            tempSubscriptionStatus={tempSubscriptionStatus}
            setTempSubscriptionStatus={setTempSubscriptionStatus}
            tempClientId={tempClientId}
            setTempClientId={setTempClientId}
            tempUid={tempUid}
            setTempUid={setTempUid}
            tempDisplayName={tempDisplayName}
            setTempDisplayName={setTempDisplayName}
            tempEmail={tempEmail}
            setTempEmail={setTempEmail}
            tempPhone={tempPhone}
            setTempPhone={setTempPhone}
            tempAddress={tempAddress}
            setTempAddress={setTempAddress}
            tempAccountNumber={tempAccountNumber}
            setTempAccountNumber={setTempAccountNumber}
            updateClientProfile={updateClientProfile}
          />
        )}

        {editingCycle && (
          <BillingCycleModal
            key="cycle-modal"
            editingCycle={editingCycle}
            setEditingCycle={setEditingCycle}
            handleSaveCycle={handleSaveCycle}
          />
        )}

        {showTelegramModal && (
          <TelegramConfigModal
            key="telegram-modal"
            show={showTelegramModal}
            onClose={() => setShowTelegramModal(false)}
            telegramConfig={telegramConfig}
            telegramFormToken={telegramFormToken}
            setTelegramFormToken={setTelegramFormToken}
            telegramFormChatId={telegramFormChatId}
            setTelegramFormChatId={setTelegramFormChatId}
            telegramFormEnabled={telegramFormEnabled}
            setTelegramFormEnabled={setTelegramFormEnabled}
            handleSaveTelegram={handleSaveTelegram}
            handleTestTelegram={handleTestTelegram}
            isSaving={isSavingTelegram}
            isTesting={isTestingTelegram}
          />
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
  );
}

function ScheduleModal({
  editingScheduleUser,
  setEditingScheduleUser,
  tempDueDate,
  setTempDueDate,
  tempDueTime,
  setTempDueTime,
  tempPaymentStatus,
  setTempPaymentStatus,
  tempSubscriptionStatus,
  setTempSubscriptionStatus,
  tempClientId,
  setTempClientId,
  tempUid,
  setTempUid,
  tempDisplayName,
  setTempDisplayName,
  tempEmail,
  setTempEmail,
  tempPhone,
  setTempPhone,
  tempAddress,
  setTempAddress,
  tempAccountNumber,
  setTempAccountNumber,
  updateClientProfile,
}: {
  editingScheduleUser: UserProfile | null;
  setEditingScheduleUser: (u: UserProfile | null) => void;
  tempDueDate: string;
  setTempDueDate: (s: string) => void;
  tempDueTime: string;
  setTempDueTime: (s: string) => void;
  tempPaymentStatus: "unpaid" | "processing" | "paid" | "rejected";
  setTempPaymentStatus: (s: "unpaid" | "processing" | "paid" | "rejected") => void;
  tempSubscriptionStatus: "ACTIVE" | "DUE" | "OVERDUE" | "PAID";
  setTempSubscriptionStatus: (s: "ACTIVE" | "DUE" | "OVERDUE" | "PAID") => void;
  tempClientId: string;
  setTempClientId: (s: string) => void;
  tempUid: string;
  setTempUid: (s: string) => void;
  tempDisplayName: string;
  setTempDisplayName: (s: string) => void;
  tempEmail: string;
  setTempEmail: (s: string) => void;
  tempPhone: string;
  setTempPhone: (s: string) => void;
  tempAddress: string;
  setTempAddress: (s: string) => void;
  tempAccountNumber: string;
  setTempAccountNumber: (s: string) => void;
  updateClientProfile: (
    userId: string,
    newUid: string,
    dueDateStr: string,
    dueTimeStr: string,
    paymentStatus: string,
    subscriptionStatus: string,
    clientId: string,
    displayName: string,
    email: string,
    phone: string,
    address: string,
    accountNumber: string
  ) => void;
}) {
  if (!editingScheduleUser) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10001] bg-hot-black/90 flex items-center justify-center p-6 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="sharp-card p-8 md:p-10 max-w-xl w-full border-t-8 border-primary space-y-6 bg-bg-base shadow-2xl max-h-[90vh] flex flex-col"
      >
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black uppercase italic tracking-tighter">
              CALIBRATE <span className="text-primary not-italic">PROFILE &amp; BILLING</span>
            </h3>
            <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary text-[9px] font-mono font-bold">
              Asia/Manila (PHT)
            </span>
          </div>
          <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-1">
            Subscriber Node: <span className="text-white">{editingScheduleUser.displayName || "Unknown"}</span> (#{editingScheduleUser.accountNumber})
          </p>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-thin scrollbar-thumb-primary/20">
          {/* Identity Fields */}
          <div className="space-y-4 border-b border-border-subtle/40 pb-6">
            <h4 className="text-[10px] font-black uppercase text-primary tracking-widest">
              Part I: Identity Credentials
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                  Full Name
                </label>
                <input
                  type="text"
                  value={tempDisplayName}
                  onChange={(e) => setTempDisplayName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full bg-slate-900 border border-border-subtle p-3.5 focus:outline-none focus:border-primary text-xs font-bold uppercase text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                  Account Number
                </label>
                <input
                  type="text"
                  value={tempAccountNumber}
                  onChange={(e) => setTempAccountNumber(e.target.value)}
                  placeholder="e.g. HF-7MOSBV-7017"
                  className="w-full bg-slate-900 border border-border-subtle p-3.5 focus:outline-none focus:border-primary text-xs font-mono font-bold text-white uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                  Email Address
                </label>
                <input
                  type="email"
                  value={tempEmail}
                  onChange={(e) => setTempEmail(e.target.value)}
                  placeholder="e.g. user@domain.com"
                  className="w-full bg-slate-900 border border-border-subtle p-3.5 focus:outline-none focus:border-primary text-xs font-mono font-bold text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={tempPhone}
                  onChange={(e) => setTempPhone(e.target.value)}
                  placeholder="e.g. 09123456789"
                  className="w-full bg-slate-900 border border-border-subtle p-3.5 focus:outline-none focus:border-primary text-xs font-mono font-bold text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                Billing Address
              </label>
              <input
                type="text"
                value={tempAddress}
                onChange={(e) => setTempAddress(e.target.value)}
                placeholder="e.g. 123 Quezon Ave, Manila"
                className="w-full bg-slate-900 border border-border-subtle p-3.5 focus:outline-none focus:border-primary text-xs font-bold text-white"
              />
            </div>
          </div>

          {/* Database System Core */}
          <div className="space-y-4 border-b border-border-subtle/40 pb-6">
            <h4 className="text-[10px] font-black uppercase text-primary tracking-widest">
              Part II: Core Accounts &amp; Routing Re-linking
            </h4>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-text-muted flex justify-between">
                <span>Account ID / UID (Database Reference Key)</span>
                <span className="text-primary italic font-black text-[9px]">Editable &amp; Migratable</span>
              </label>
              <input
                type="text"
                value={tempUid}
                onChange={(e) => setTempUid(e.target.value)}
                placeholder="e.g. t8mD2xFleddg8vZ8"
                className="w-full bg-slate-900 border border-border-subtle p-3.5 focus:outline-none focus:border-primary text-xs font-mono font-bold text-white select-all uppercase"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                Client ID (Assignment / Hotspot Account Mapping)
              </label>
              <input
                type="text"
                value={tempClientId}
                onChange={(e) => setTempClientId(e.target.value)}
                placeholder="e.g. PPPOE_USER_001"
                className="w-full bg-slate-900 border border-border-subtle p-3.5 focus:outline-none focus:border-primary text-xs font-mono font-bold text-white uppercase"
              />
            </div>
          </div>

          {/* Automated Billing Status System (Hidden per admin configuration) */}
        </div>

        <div className="flex gap-4 pt-4 border-t border-border-subtle/50">
          <button
            onClick={() => updateClientProfile(
              editingScheduleUser.uid, 
              tempUid, 
              tempDueDate,
              tempDueTime,
              tempPaymentStatus,
              tempSubscriptionStatus,
              tempClientId,
              tempDisplayName,
              tempEmail,
              tempPhone,
              tempAddress,
              tempAccountNumber
            )}
            className="flex-1 py-4 bg-primary hover:bg-primary-dark text-white font-black uppercase tracking-[0.2em] italic text-[11px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 cursor-pointer"
          >
            <CheckCircle2 size={14} />
            Commit Configuration
          </button>
          <button
            type="button"
            onClick={() => setEditingScheduleUser(null)}
            className="px-8 border border-border-subtle text-text-muted hover:text-white font-black uppercase tracking-widest text-[9px] transition-all cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
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
  if (!notifyingUser) return null;

  return (
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
  );
}

function BulkReminderModal({
  show,
  onClose,
  bulkNotifForm,
  setBulkNotifForm,
  handleSendBulkReminders,
  targets,
}: {
  show: boolean;
  onClose: () => void;
  bulkNotifForm: any;
  setBulkNotifForm: (f: any) => void;
  handleSendBulkReminders: (e: React.FormEvent) => void;
  targets: UserProfile[];
}) {
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000] bg-hot-black/90 flex items-center justify-center p-6 backdrop-blur-md"
    >
      <motion.form
        onSubmit={handleSendBulkReminders}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="sharp-card p-10 max-w-lg w-full border-t-8 border-primary space-y-8 bg-bg-base"
      >
        <div>
          <h3 className="text-2xl font-black uppercase italic tracking-tighter text-red-500">
            BULK <span className="text-white not-italic">REMINDERS</span>
          </h3>
          <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-2">
            Targeting <span className="text-red-500 font-black">{targets.length} subscriber nodes</span> currently marked DUE or OVERDUE.
          </p>
        </div>

        {targets.length > 0 && (
          <div className="bg-bg-surface border border-border-subtle p-4 max-h-[120px] overflow-y-auto space-y-1 rounded">
            <span className="text-[9px] font-black uppercase tracking-widest text-text-muted block mb-1">Impacted Subscribers:</span>
            <div className="flex flex-wrap gap-2">
              {targets.map(t => (
                <span key={t.uid} className="px-2 py-1 bg-red-950/40 border border-red-900/50 text-[9px] font-mono text-red-500 rounded">
                  {t.displayName || t.email}
                </span>
              ))}
            </div>
          </div>
        )}

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
                  onClick={() => setBulkNotifForm({ ...bulkNotifForm, type })}
                  className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest border transition-all ${
                    bulkNotifForm.type === type
                      ? "bg-red-600 border-red-500 text-white shadow-md shadow-red-600/30"
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
              value={bulkNotifForm.title}
              onChange={(e) =>
                setBulkNotifForm({ ...bulkNotifForm, title: e.target.value })
              }
              placeholder="e.g. PAYMENT DUE ALERT"
              className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-red-500 text-xs font-bold uppercase text-white"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
              Transmission Content
            </label>
            <textarea
              required
              value={bulkNotifForm.message}
              onChange={(e) =>
                setBulkNotifForm({ ...bulkNotifForm, message: e.target.value })
              }
              rows={4}
              placeholder="Provide details regarding account status or payment requirements..."
              className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-red-500 text-xs font-medium text-white"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={targets.length === 0}
            className="flex-1 py-4 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase tracking-[0.2em] italic text-[11px] transition-all shadow-lg shadow-red-600/20"
          >
            DISPATCH PACKETS
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-6 border border-border-subtle text-text-muted hover:text-white font-black uppercase tracking-widest text-[9px] transition-all"
          >
            Abort
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function TelegramConfigModal({
  show,
  onClose,
  telegramConfig,
  telegramFormToken,
  setTelegramFormToken,
  telegramFormChatId,
  setTelegramFormChatId,
  telegramFormEnabled,
  setTelegramFormEnabled,
  handleSaveTelegram,
  handleTestTelegram,
  isSaving,
  isTesting,
}: {
  show: boolean;
  onClose: () => void;
  telegramConfig: {
    configured: boolean;
    chatId: string;
    enabled: boolean;
    maskedToken: string;
  } | null;
  telegramFormToken: string;
  setTelegramFormToken: (s: string) => void;
  telegramFormChatId: string;
  setTelegramFormChatId: (s: string) => void;
  telegramFormEnabled: boolean;
  setTelegramFormEnabled: (b: boolean) => void;
  handleSaveTelegram: (e?: React.FormEvent) => void;
  handleTestTelegram: () => void;
  isSaving: boolean;
  isTesting: boolean;
}) {
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10002] bg-hot-black/90 flex items-center justify-center p-4 sm:p-6 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="sharp-card p-6 sm:p-10 max-w-xl w-full border-t-8 border-sky-500 space-y-6 bg-bg-base shadow-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Bot size={24} />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter text-white">
                TELEGRAM <span className="text-sky-400 not-italic">BOT ENGINE</span>
              </h3>
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-0.5">
                Instant Settlement Proof Alerts &amp; NOC Ticket Notifications
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 border border-border-subtle flex items-center justify-center text-text-muted hover:text-white hover:border-white transition-all cursor-pointer rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Status Banner */}
        <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Current Status</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border flex items-center gap-1.5 ${
                telegramConfig?.configured
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : "bg-amber-500/15 border-amber-500/30 text-amber-300"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  telegramConfig?.configured ? "bg-emerald-400 animate-ping" : "bg-amber-400"
                }`}
              />
              {telegramConfig?.configured ? "Active & Connected" : "Token Setup Required"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 text-[10px] font-mono">
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
              <span className="text-text-muted block text-[8px] uppercase">Target Chat ID</span>
              <span className="text-white font-bold">{telegramConfig?.chatId || "8732198426"}</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
              <span className="text-text-muted block text-[8px] uppercase">API Token</span>
              <span className="text-sky-400 font-bold">
                {telegramConfig?.maskedToken || "Not configured"}
              </span>
            </div>
          </div>
        </div>

        {/* Configuration Form */}
        <form onSubmit={handleSaveTelegram} className="space-y-4 flex-1 overflow-y-auto pr-1">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-black text-text-muted flex items-center justify-between">
              <span>Telegram Bot API Token (from @BotFather)</span>
              <span className="text-sky-400 text-[9px] font-mono">Secret</span>
            </label>
            <input
              type="password"
              value={telegramFormToken}
              onChange={(e) => setTelegramFormToken(e.target.value)}
              placeholder={telegramConfig?.maskedToken ? "Leave blank to keep existing token" : "e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."}
              className="w-full bg-slate-900 border border-border-subtle p-3.5 focus:outline-none focus:border-sky-400 text-xs font-mono text-white rounded"
            />
            <p className="text-[9px] text-text-muted leading-relaxed">
              Create a bot with <strong className="text-slate-300">@BotFather</strong> on Telegram, send <code className="text-sky-300">/newbot</code>, and paste the generated HTTP API token.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-black text-text-muted flex items-center justify-between">
              <span>Target Chat ID / Group ID</span>
              <span className="text-slate-400 text-[9px] font-mono">e.g. 8732198426</span>
            </label>
            <input
              type="text"
              value={telegramFormChatId}
              onChange={(e) => setTelegramFormChatId(e.target.value)}
              placeholder="8732198426"
              className="w-full bg-slate-900 border border-border-subtle p-3.5 focus:outline-none focus:border-sky-400 text-xs font-mono font-bold text-white rounded"
            />
            <p className="text-[9px] text-text-muted leading-relaxed">
              Your personal Telegram user ID or group chat ID where settlement proof alerts and customer screenshots will be forwarded.
            </p>
          </div>

          <div className="p-3 bg-slate-900/60 border border-border-subtle rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-white uppercase tracking-tight block">
                Instant Telegram Notifications Active
              </span>
              <span className="text-[9px] text-text-muted block">
                Automatically alerts you on Telegram for payment settlement proofs with screenshots.
              </span>
            </div>
            <input
              type="checkbox"
              checked={telegramFormEnabled}
              onChange={(e) => setTelegramFormEnabled(e.target.checked)}
              className="w-5 h-5 accent-sky-500 cursor-pointer"
            />
          </div>

          {/* Quick Steps Guide */}
          <div className="p-3 bg-sky-950/20 border border-sky-900/30 rounded-lg space-y-1.5 text-[9px] text-sky-300/80 font-mono">
            <span className="font-bold uppercase tracking-wider text-sky-400 block mb-1">
              💡 Setup in 3 Quick Steps:
            </span>
            <p>1. Message <strong>@BotFather</strong> on Telegram and send <code className="text-white">/newbot</code>.</p>
            <p>2. Paste your bot token above and set your Chat ID (or leave the default <strong>8732198426</strong>).</p>
            <p>3. Start your bot on Telegram, then click <strong>[Send Test Alert]</strong> below to confirm delivery!</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={handleTestTelegram}
              disabled={isTesting}
              className="flex-1 py-3.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:border-sky-500/50 font-black uppercase tracking-widest text-[10px] italic rounded transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isTesting ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
              <span>{isTesting ? "Testing Connection..." : "Send Test Alert"}</span>
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-black uppercase tracking-widest text-[10px] italic rounded transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-sky-600/20 disabled:opacity-50"
            >
              {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
              <span>{isSaving ? "Saving Settings..." : "Save Bot Config"}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
