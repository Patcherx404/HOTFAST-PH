import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  Zap,
  Activity,
  User as UserIcon,
  Users as UsersIcon,
  Download,
  CheckCircle2,
  Loader2,
  Calendar,
  Clock,
  RefreshCw,
  UserMinus,
  Eye,
  Copy,
  Search,
  MessageSquare,
  Send,
  Trash2,
  Filter,
  LogOut,
  Plus as PlusIcon,
  AlertTriangle,
  ExternalLink,
  Receipt,
  Server,
  Save,
  Code2,
  Edit3,
  CreditCard,
  LifeBuoy,
  TrendingUp,
  Lock,
  LogIn,
  X,
  Bell,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { ADMIN_EMAIL, isSuperAdminEmail, INTERNET_PLANS } from '../constants';
import { useAuth } from './FirebaseProvider';
import { AdminTicketsTab } from './AdminTicketsTab';
import { ASIA_TIMEZONE } from '../lib/dateUtils';
import {
  db,
  loginWithGoogle,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
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
} from 'firebase/firestore';
import {
  InternetPlan,
  PaymentRecord,
  SystemNotification,
  UserProfile,
  BillingCycle,
  ChatSession,
  ChatMessage,
  SupportTicket,
} from '../types';

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
  const [adminTab, setAdminTab] = useState<"payments" | "plans" | "clients" | "cycles" | "chats" | "tickets">(
    "payments",
  );
  const [billingCycles, setBillingCycles] = useState<BillingCycle[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
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
  const [chatToDelete, setChatToDelete] = useState<ChatSession | null>(null);
  const [notifyingUser, setNotifyingUser] = useState<UserProfile | null>(null);
  const [editingScheduleUser, setEditingScheduleUser] = useState<UserProfile | null>(null);
  const [tempDueDate, setTempDueDate] = useState("");
  const [tempClientId, setTempClientId] = useState("");
  const [tempUid, setTempUid] = useState("");
  const [tempDisplayName, setTempDisplayName] = useState("");
  const [tempEmail, setTempEmail] = useState("");
  const [tempPhone, setTempPhone] = useState("");
  const [tempAddress, setTempAddress] = useState("");
  const [tempAccountNumber, setTempAccountNumber] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<"all" | "active" | "suspended" | "overdue">("all");
  const [showBulkReminderModal, setShowBulkReminderModal] = useState(false);
  const [bulkNotifForm, setBulkNotifForm] = useState({
    title: "SETTLEMENT REQ: BALANCE DUE",
    message: "Network core warning: An outstanding balance has been detected on your subscriber node. Please complete your settlement immediately in the Billing Center to maintain active high-bandwidth uplink.",
    type: "alert" as "info" | "warning" | "alert",
  });

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

  const filteredClients = clients.filter(client => {
    const matchesSearch = 
      (client.displayName || "").toLowerCase().includes(clientSearch.toLowerCase()) || 
      (client.accountNumber || "").toLowerCase().includes(clientSearch.toLowerCase()) ||
      (client.clientId || "").toLowerCase().includes(clientSearch.toLowerCase()) ||
      (client.email || "").toLowerCase().includes(clientSearch.toLowerCase());
    
    if (!matchesSearch) return false;
    if (clientFilter === "all") return true;
    if (clientFilter === "active") return client.status !== "suspended";
    if (clientFilter === "suspended") return client.status === "suspended";
    if (clientFilter === "overdue") return client.billStatus === "overdue";
    return true;
  });

  const totalRevenue = payments.filter(p => p.status === "completed").reduce((acc, p) => acc + (p.amount || 0), 0);
  const activeSubs = clients.filter(c => c.status !== "suspended").length;
  const suspendedSubs = clients.filter(c => c.status === "suspended").length;
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

    const q = query(
      collection(db, "chats"),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSession));
      setChatSessions(chats);
    }, (error) => {
      console.error("Chats sync error:", error);
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
      const msgs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ChatMessage));
      setChatMessages(msgs);
    }, (error) => {
      console.error("Messages sync error:", error);
    });

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
      
      // If marked as completed and it wasn't completed before, adjust balance
      if (status === "completed" && oldStatus !== "completed") {
        const userDocSnapshot = await getDoc(userRef);
        const userData = userDocSnapshot.data() as UserProfile;
        const currentBalance = userData.balance || 0;
        const newBalance = currentBalance - payment.amount;
        
        const newBillStatus = newBalance <= 0 ? "paid" : "due";
        await updateDoc(userRef, {
          balance: newBalance,
          billStatus: newBillStatus,
        });


      } 
      // If was completed and now changed to failed/pending, add back to user balance
      else if (status !== "completed" && oldStatus === "completed") {
        const userDocSnapshot = await getDoc(userRef);
        const currentBalance = userDocSnapshot.data()?.balance || 0;
        const newBalance = currentBalance + payment.amount;

        await updateDoc(userRef, {
          balance: newBalance,
          billStatus: newBalance <= 0 ? "paid" : "due",
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

  const deleteConversation = (chat: ChatSession) => {
    setChatToDelete(chat);
  };

  const confirmConversationDeletion = async () => {
    if (!chatToDelete || !chatToDelete.id) return;
    const progressToast = toast.loading("Purging conversation history...");
    try {
      // 1. Delete all subcollection messages
      const messagesRef = collection(db, "chats", chatToDelete.id, "messages");
      const messagesSnap = await getDocs(messagesRef);
      for (const msgDoc of messagesSnap.docs) {
        await deleteDoc(msgDoc.ref);
      }
      
      // 2. Delete main chat doc
      await deleteDoc(doc(db, "chats", chatToDelete.id));
      
      // Update local state if the deleted chat was selected
      if (selectedChat?.id === chatToDelete.id) {
        setSelectedChat(null);
      }
      
      setChatToDelete(null);
      toast.dismiss(progressToast);
      toast.success("Conversation history fully purged!");
    } catch (e) {
      toast.dismiss(progressToast);
      console.error("Failed to delete conversation:", e);
      handleFirestoreError(e, OperationType.DELETE, `chats/${chatToDelete.id}`);
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

  const updateClientProfile = async (
    userId: string,
    newUid: string,
    dateStr: string,
    clientId: string,
    displayName: string,
    email: string,
    phone: string,
    address: string,
    accountNumber: string
  ) => {
    try {
      const newDate = new Date(dateStr);
      if (isNaN(newDate.getTime())) {
        toast.error("Invalid date format. Please use the calendar picker.");
        return;
      }

      const now = new Date();
      const isPast = newDate < now;
      const isPastGrace = newDate < new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));
      const updatedStatus = isPastGrace ? 'suspended' : 'active';
      const updatedBillStatus = isPast ? 'overdue' : (editingScheduleUser?.balance && editingScheduleUser.balance > 0 ? 'due' : 'paid');

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
            dueDate: newDate,
            clientId: clientId || "",
            status: updatedStatus,
            billStatus: updatedBillStatus
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
          dueDate: newDate,
          clientId: clientId || "",
          status: updatedStatus,
          billStatus: updatedBillStatus
        });
        toast.success("Subscriber profile updated.");
      }
      setEditingScheduleUser(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const triggerEditClient = (client: UserProfile) => {
    const current = client.dueDate?.toDate 
      ? client.dueDate.toDate()
      : (client.dueDate ? new Date(client.dueDate) : new Date());
    
    // Format for datetime-local input: YYYY-MM-DDTHH:MM
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const hours = String(current.getHours()).padStart(2, '0');
    const mins = String(current.getMinutes()).padStart(2, '0');
    
    setTempDueDate(`${year}-${month}-${day}T${hours}:${mins}`);
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
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <div className="mb-12 space-y-8">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-8">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary mb-2">
              Command Center
            </h3>
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
                  { id: "chats", label: "Live Chat", icon: MessageSquare, count: null },
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
                    filteredPayments.map((p, idx) => (
                      <tr
                      key={`admin-payment-${p.id}`}
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
                            ? p.createdAt.toDate().toLocaleDateString('en-PH', { timeZone: ASIA_TIMEZONE })
                            : "..."}
                        </div>
                        <div className="text-[9px] text-text-muted font-mono">
                          {p.createdAt?.toDate
                            ? p.createdAt.toDate().toLocaleTimeString('en-PH', { timeZone: ASIA_TIMEZONE })
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
                chatSessions.map((chat, idx) => (
                  <div
                    key={`chat-session-${chat.id || idx}`}
                    onClick={() => setSelectedChat(chat)}
                    className={`w-full p-4 border-b border-border-subtle text-left transition-all hover:bg-bg-base/50 cursor-pointer flex justify-between items-center group relative ${selectedChat?.id === chat.id ? "bg-bg-base border-r-4 border-r-primary" : ""}`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="font-black uppercase italic text-xs mb-1 truncate">{chat.userName}</div>
                      <div className="text-[10px] text-text-muted truncate">{chat.lastMessage || "No messages yet"}</div>
                      <div className="text-[8px] text-primary mt-2 font-bold uppercase">
                        {chat.updatedAt?.toDate ? chat.updatedAt.toDate().toLocaleString('en-PH', { timeZone: ASIA_TIMEZONE }) : "..."}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(chat);
                      }}
                      className="p-2 border border-red-500/20 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/40 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center rounded"
                      title="Delete Conversation"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat Window */}
          <div className="flex-1 bg-bg-surface border border-border-subtle flex flex-col overflow-hidden relative">
            {selectedChat ? (
              <>
                <div className="p-4 bg-bg-surface border-b border-border-subtle flex justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      <UserIcon size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase italic tracking-widest">{selectedChat.userName}</h3>
                      <p className="text-[9px] text-text-muted font-bold">UID: {selectedChat.userId}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteConversation(selectedChat)}
                    className="p-3 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center gap-2 text-[9px] font-black uppercase tracking-widest italic"
                    title="Purge Conversation History"
                  >
                    <Trash2 size={12} /> Purge Chat
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-bg-base/30">
                  {chatMessages.map((msg, idx) => (
                    <div key={`chat-msg-${msg.id || idx}`} className={`flex ${msg.senderRole === "admin" ? "justify-end" : "justify-start"}`}>
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
      ) : adminTab === "tickets" ? (
        <AdminTicketsTab tickets={supportTickets} />
      ) : (
        <>
          <div className="flex flex-col gap-6 mb-8">
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
              <div className="flex flex-wrap gap-3 items-center justify-end w-full md:w-auto">
                <div className="flex gap-2 p-1 bg-bg-surface border border-border-subtle">
                  {(["all", "active", "suspended", "overdue"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setClientFilter(f)}
                      className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest transition-all ${clientFilter === f ? "bg-primary text-white italic" : "text-text-muted hover:text-white"}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowBulkReminderModal(true)}
                  className={`px-5 py-3 text-[9px] font-black uppercase tracking-[0.15em] italic flex items-center gap-2 transition-all border ${
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
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest italic pl-1">
              Displaying {filteredClients.length} of {clients.length} Subscribers
            </p>
          </div>
          
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
                  <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle text-center">
                    Billing State
                  </th>
                  <th className="px-8 py-6 text-[10px] uppercase tracking-[0.3em] font-black text-text-muted border-b border-border-subtle text-right">
                    Operations
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr
                    key={client.uid}
                    className="border-b border-border-subtle/50 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-8 py-6">
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
                    <td className="px-8 py-6">
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
                              {status.toUpperCase()}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-col items-center">
                          {client.dueDate && (
                            <div className="text-[9px] font-bold uppercase tracking-tighter text-text-muted flex items-center gap-1">
                              {client.billStatus === "paid" ? "Next Due: " : "Deadline: "}
                              <span className="text-primary italic">
                                {client.dueDate?.toDate
                                  ? client.dueDate.toDate().toLocaleString('en-PH', {
                                      timeZone: ASIA_TIMEZONE,
                                      month: '2-digit',
                                      day: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: true
                                    })
                                  : typeof client.dueDate === "string"
                                    ? new Date(client.dueDate).toLocaleString('en-PH', { timeZone: ASIA_TIMEZONE })
                                    : "N/A"}
                              </span>
                            </div>
                          )}
                          <button
                            onClick={() => triggerEditClient(client)}
                            className="text-[8px] font-black uppercase text-primary hover:underline italic tracking-widest mt-1 flex items-center gap-1"
                          >
                            <Edit3 size={8} /> Edit Profile & UID
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => triggerEditClient(client)}
                          className="px-4 py-2 border border-primary/30 text-primary hover:bg-primary hover:text-white text-[9px] font-black uppercase tracking-widest italic transition-all flex items-center gap-2"
                        >
                          <Edit3 size={10} /> Edit
                        </button>
                        <button
                          onClick={() => toggleUserSuspension(client.uid, client.status)}
                          className={`px-4 py-2 border ${client.status === 'suspended' ? "border-green-500 text-green-500 hover:bg-green-500 hover:text-white" : "border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-white"} text-[9px] font-black uppercase tracking-widest italic transition-all flex items-center gap-2`}
                        >
                          {client.status === 'suspended' ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                          {client.status === 'suspended' ? "Activate" : "Suspend"}
                        </button>
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
      </>
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
    date: string,
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
          <h3 className="text-2xl font-black uppercase italic tracking-tighter">
            CALIBRATE <span className="text-primary not-italic">PROFILE & IDENTITY</span>
          </h3>
          <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-2">
            Subscriber Node: <span className="text-white">{editingScheduleUser.displayName || "Unknown"}</span>
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
                  className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-xs font-bold uppercase text-white"
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
                  className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-xs font-mono font-bold text-white uppercase"
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
                  className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-xs font-mono font-bold text-white"
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
                  placeholder="09123456789"
                  className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-xs font-mono font-bold text-white"
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
                className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-xs font-bold text-white"
              />
            </div>
          </div>

          {/* Database System Core */}
          <div className="space-y-4 border-b border-border-subtle/40 pb-6">
            <h4 className="text-[10px] font-black uppercase text-primary tracking-widest">
              Part II: Core Accounts & Routing Re-linking
            </h4>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-text-muted flex justify-between">
                <span>Account ID / UID (Database Reference Key)</span>
                <span className="text-primary italic font-black">Editable & Migratable</span>
              </label>
              <input
                type="text"
                value={tempUid}
                onChange={(e) => setTempUid(e.target.value)}
                placeholder="e.g. t8mD2xFleddg8vZ8"
                className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-xs font-mono font-bold text-white select-all uppercase"
              />
              <p className="text-[9px] text-text-muted/60 uppercase tracking-widest leading-relaxed italic">
                Modifying the database key triggers seamless migration of payment documents, Chat channels, and subscriber history.
              </p>
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
                className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-xs font-mono font-bold text-white uppercase"
              />
            </div>
          </div>

          {/* Settlement / Billing Recurrence */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase text-primary tracking-widest">
              Part III: Settlement Lifecycle
            </h4>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-text-muted">
                Settlement Due Timestamp (12-Hour Philippine Standard Time)
              </label>
              <div className="relative group">
                <input
                  type="datetime-local"
                  value={tempDueDate}
                  onChange={(e) => setTempDueDate(e.target.value)}
                  className="w-full bg-slate-900 border border-border-subtle p-4 focus:outline-none focus:border-primary text-sm font-mono font-bold uppercase text-white appearance-none"
                  style={{ colorScheme: 'dark' }}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-primary/50 group-hover:text-primary transition-colors">
                  <Calendar size={16} />
                </div>
              </div>
              {tempDueDate && (
                <div className="p-3 bg-primary/5 border border-primary/20">
                  <div className="text-[9px] text-primary font-black uppercase tracking-widest mb-1 italic">Preview Format</div>
                  <div className="text-xs font-mono font-bold text-white uppercase italic">
                    {new Date(tempDueDate).toLocaleString('en-US', {
                      timeZone: ASIA_TIMEZONE,
                      month: 'short',
                      day: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </div>
                </div>
              )}
              <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest leading-relaxed italic">
                Note: Entering historical deadlines relative to node clock will lock current access loops and trigger suspend state.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-4 pt-4 border-t border-border-subtle/50">
          <button
            onClick={() => updateClientProfile(
              editingScheduleUser.uid, 
              tempUid, 
              tempDueDate, 
              tempClientId,
              tempDisplayName,
              tempEmail,
              tempPhone,
              tempAddress,
              tempAccountNumber
            )}
            className="flex-1 py-4 bg-primary hover:bg-primary-dark text-white font-black uppercase tracking-[0.2em] italic text-[11px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
          >
            <CheckCircle2 size={14} />
            Commit Configuration
          </button>
          <button
            type="button"
            onClick={() => setEditingScheduleUser(null)}
            className="px-8 border border-border-subtle text-text-muted hover:text-white font-black uppercase tracking-widest text-[9px] transition-all"
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


export default AdminPanel;
