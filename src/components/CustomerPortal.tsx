/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Zap,
  ArrowRight,
  CreditCard,
  MapPin,
  X,
  Activity,
  History,
  CheckCircle2,
  Loader2,
  Image as ImageIcon,
  ExternalLink,
  Receipt,
  AlertTriangle,
  Calendar,
  Clock,
  MessageSquare,
  Send,
} from "lucide-react";
import { useAuth } from "./FirebaseProvider";
import { getDisplayImageUrl } from "../lib/blobUtils";
import { evaluateSubscriberStatus, ASIA_TIMEZONE } from "../lib/billingEngine";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { InternetPlan, PaymentRecord } from "../types";

export default function CustomerPortal({ 
  plans, 
  onPay, 
  onOpenLatencyMap,
  onOpenInstallModal,
  isInstalled,
  onOpenSupport,
}: { 
  plans: InternetPlan[]; 
  onPay: () => void; 
  onOpenLatencyMap?: () => void;
  onOpenInstallModal?: () => void;
  isInstalled?: boolean;
  onOpenSupport?: () => void;
}) {
  const { user, profile } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(
    null,
  );

  const currentPlan = plans.find((p) => p.id === profile?.currentPlanId);

  const dueDate = profile?.dueDate?.toDate ? profile.dueDate.toDate() : null;
  const daysRemaining = dueDate ? Math.ceil((dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;

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
          snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as PaymentRecord),
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

  const billingEval = evaluateSubscriberStatus(profile) || {
    subscription_status: "ACTIVE" as const,
    payment_status: "unpaid" as const,
    due_date: "N/A",
    due_time: "12:00 PM",
    remainingGraceHours: 72,
    statusExplanation: "Account active.",
  };

  return (
    <div className="py-6 sm:py-12 px-3 sm:px-6 max-w-7xl mx-auto space-y-4">
      <div className="space-y-px bg-border-subtle border border-border-subtle">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-px">
        <div className="md:col-span-8 bg-bg-base p-5 sm:p-8 md:p-12 flex flex-col sm:flex-row items-center sm:items-start md:items-center justify-between text-center sm:text-left gap-6 sm:gap-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-5 sm:gap-8 w-full sm:w-auto">
            <div 
              style={{ height: "73px", width: "106px" }}
              className="p-1 border border-border-subtle rounded-full overflow-hidden group shrink-0"
            >
              <img
                src={user.photoURL || ""}
                alt="avatar"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            </div>
            <div className="w-full sm:w-auto">
              <div className="text-[10px] font-black uppercase text-text-muted tracking-[0.4em] mb-2 sm:mb-3">
                Network Profile
              </div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-black uppercase italic tracking-tighter">
                {profile?.displayName}
              </div>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-start justify-center sm:justify-start gap-3 sm:gap-4 mt-4 md:mt-4 text-left">
                <div className="flex flex-col bg-slate-900/40 p-2.5 sm:p-0 sm:bg-transparent border sm:border-0 border-border-subtle/60">
                  <span className="text-[8px] font-black uppercase text-text-muted tracking-widest mb-1 underline decoration-primary/30">Network Node</span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-mono text-primary font-bold">
                      #{profile?.accountNumber}
                    </span>
                    {profile?.clientId && (
                      <span className="text-[8px] font-mono text-white/50 font-bold uppercase tracking-widest italic">
                        CID: {profile.clientId}
                      </span>
                    )}
                    <button
                      onClick={onOpenLatencyMap}
                      className="text-[8px] font-mono text-primary hover:underline flex items-center gap-1 mt-0.5 cursor-pointer"
                      title="Open Google Map Box for Node Uplink"
                    >
                      <MapPin size={9} /> View Uplink Map
                    </button>
                  </div>
                </div>

                <div className="w-px h-8 bg-border-subtle hidden sm:block mx-1 self-center" />

                <div className="flex flex-col bg-slate-900/40 p-2.5 sm:p-0 sm:bg-transparent border sm:border-0 border-border-subtle/60">
                  <span className="text-[8px] font-black uppercase text-text-muted tracking-widest mb-1 underline decoration-primary/30">Subscribed Tier</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase text-text-dim tracking-widest flex items-center gap-1.5">
                      <Activity size={10} className="text-primary shrink-0" /> {currentPlan?.name || "Standard Account"}
                    </span>
                  </div>
                </div>

                <div className="w-px h-8 bg-border-subtle hidden sm:block mx-1 self-center" />

                <div className="flex flex-col bg-slate-900/40 p-2.5 sm:p-0 sm:bg-transparent border sm:border-0 border-border-subtle/60">
                  <span className="text-[8px] font-black uppercase text-text-muted tracking-widest mb-1 underline decoration-primary/30">Exact Due Date &amp; Time</span>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-white uppercase flex items-center gap-1.5">
                        <Calendar size={10} className="text-primary shrink-0" /> 
                        {billingEval.due_date} • {billingEval.due_time}
                      </span>
                    </div>
                    <span className="text-[8px] font-mono text-slate-400">
                      Philippine Time (Asia/Manila)
                    </span>
                  </div>
                </div>

                <div className="w-px h-8 bg-border-subtle hidden sm:block mx-1 self-center" />

                <div className="flex flex-col bg-slate-900/40 p-2.5 sm:p-0 sm:bg-transparent border sm:border-0 border-border-subtle/60">
                  <span className="text-[8px] font-black uppercase text-text-muted tracking-widest mb-1 underline decoration-primary/30">Billing Status</span>
                  <div className="flex items-center gap-1.5">
                    {profile?.status === 'suspended' ? (
                      <>
                        <span className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
                        <span className="text-[10px] font-black uppercase text-red-600 tracking-widest italic flex items-center gap-1 font-mono">
                          <AlertTriangle size={10} /> SUSPENDED
                        </span>
                      </>
                    ) : billingEval.subscription_status === 'OVERDUE' ? (
                      <>
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-red-400 tracking-widest italic font-mono">
                          OVERDUE
                        </span>
                      </>
                    ) : billingEval.subscription_status === 'DUE' ? (
                      <>
                        <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-amber-300 tracking-widest italic font-mono">
                          DUE (72h Grace: {billingEval.remainingGraceHours}h {billingEval.remainingGraceMinutes}m)
                        </span>
                      </>
                    ) : billingEval.subscription_status === 'PAID' ? (
                      <>
                        <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                        <span className="text-[10px] font-black uppercase text-emerald-400 tracking-widest italic font-mono">
                          PAID
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                        <span className="text-[10px] font-black uppercase text-emerald-400 tracking-widest italic font-mono">
                          ACTIVE
                        </span>
                      </>
                    )}
                  </div>
                  {/* Payment status badge */}
                  <div className="text-[8px] font-mono text-text-muted mt-0.5">
                    Payment: <span className="uppercase font-bold text-white">{billingEval.payment_status}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`md:col-span-4 ${
          billingEval.subscription_status === 'OVERDUE'
            ? "bg-red-600"
            : billingEval.subscription_status === 'DUE'
            ? "bg-amber-600"
            : "bg-emerald-600"
        } p-6 sm:p-8 md:p-12 text-white flex flex-col justify-between group overflow-hidden relative transition-all duration-300`}>
          <div className="absolute top-0 right-0 p-8 opacity-10 -mr-4 -mt-4 group-hover:scale-110 transition-transform">
            <CreditCard size={120} />
          </div>
          
          <div className="relative z-10">
            <div className="text-[10px] font-black uppercase text-white/60 tracking-[0.4em] mb-3 sm:mb-4">
              Billing Center
            </div>
            <div className="text-3xl sm:text-4xl md:text-5xl font-mono font-bold italic tracking-tighter uppercase whitespace-pre-wrap leading-none">
              {billingEval.subscription_status}
            </div>
            
            {billingEval.subscription_status !== 'PAID' ? (
              <button
                onClick={onPay}
                className={`mt-6 sm:mt-8 flex items-center justify-center gap-3 w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 bg-white font-black uppercase text-xs tracking-widest italic hover:bg-slate-100 transition-all shadow-xl shadow-black/20 group/btn active:scale-[0.98] cursor-pointer min-h-[44px] ${
                  billingEval.subscription_status === 'OVERDUE'
                    ? "text-red-600"
                    : billingEval.subscription_status === 'DUE'
                    ? "text-amber-700"
                    : "text-emerald-600"
                }`}
              >
                SECURE SETTLEMENT <ArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
              </button>
            ) : (
              <div className="mt-6 sm:mt-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest italic px-4 py-2 border border-white/30 bg-white/10 w-fit">
                <CheckCircle2 size={12} /> Cycle Synchronized
              </div>
            )}
            
            {totalPending > 0 && (
              <div className="mt-4 sm:mt-6 inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/20 text-[9px] font-black uppercase tracking-widest italic">
                <Loader2 size={12} className="animate-spin" /> Waiting for Admin Confirmation
              </div>
            )}
          </div>

          <div className="mt-8 sm:mt-12 flex justify-between items-center border-t border-white/20 pt-4 sm:pt-6 relative z-10">
            <div className="text-[10px] font-black uppercase tracking-widest italic">
              {billingEval.subscription_status === 'OVERDUE' 
                ? 'Action Required • 72h Grace Expired' 
                : billingEval.subscription_status === 'DUE' 
                ? `72-Hour Grace Period Active (~${billingEval.remainingGraceHours}h left)` 
                : billingEval.subscription_status === 'PAID'
                ? 'Settlement Confirmed by Admin'
                : 'System Online • Before Due Date'}
            </div>
            <Zap size={16} />
          </div>
        </div>
      </div>

      <div className="bg-bg-base p-0 relative">
        <div className="px-4 sm:px-6 md:px-10 py-4 sm:py-6 md:py-8 border-b border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-[0.3em] sm:tracking-[0.4em] flex items-center gap-2.5 sm:gap-3 italic text-primary">
            <History size={16} className="not-italic" /> Settlement Ledger
          </h3>
          <div className="flex gap-3">
            <button className="text-[9px] sm:text-[10px] font-black uppercase text-text-muted tracking-widest hover:text-white transition-colors">
              Export CSV
            </button>
            <button className="text-[9px] sm:text-[10px] font-black uppercase text-text-muted tracking-widest hover:text-white transition-colors">
              PDF Export
            </button>
          </div>
        </div>

        {/* Mobile Ledger Card View */}
        <div className="md:hidden divide-y divide-border-subtle">
          {payments.length === 0 ? (
            <div className="px-4 py-12 text-center text-text-muted italic font-medium uppercase tracking-[0.2em] text-xs">
              No transaction history detected
            </div>
          ) : (
            payments.map((p) => (
              <div key={`portal-m-payment-${p.id}`} className="p-4 space-y-3 bg-bg-base hover:bg-slate-900/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-tight text-text-dim">
                    {p.createdAt?.toDate
                      ? p.createdAt.toDate().toLocaleDateString("en-PH", {
                          timeZone: ASIA_TIMEZONE,
                          month: "short",
                          day: "2-digit",
                          year: "numeric",
                        })
                      : "Processing"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-slate-900 border border-border-subtle text-primary rounded">
                      {p.method}
                    </span>
                    {p.status === "pending" ? (
                      <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase bg-amber-500/10 border border-amber-500/30 text-amber-400 inline-flex items-center gap-1 rounded">
                        <Clock size={10} className="animate-spin" /> Under Review
                      </span>
                    ) : p.status === "confirmed" || p.status === "completed" ? (
                      <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 inline-flex items-center gap-1 rounded">
                        <CheckCircle2 size={10} /> Confirmed
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase bg-rose-500/10 border border-rose-500/30 text-rose-400 inline-flex items-center gap-1 rounded">
                        <X size={10} /> Rejected
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-white/80">
                    {p.referenceNumber}
                  </div>
                  <div className="font-mono font-bold text-lg text-primary italic">
                    ₱ {p.amount.toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedReceipt(p)}
                  className="w-full py-2.5 px-3 bg-slate-900/80 border border-border-subtle hover:border-primary text-text-dim hover:text-white text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-[0.99] rounded"
                >
                  <Receipt size={14} className="text-primary" /> View Settlement Details
                </button>
              </div>
            ))
          )}
        </div>

        {/* Desktop Ledger Table View */}
        <div className="hidden md:block overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="px-6 md:px-8 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle">
                  Timestamp
                </th>
                <th className="px-6 md:px-8 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle">
                  Reference ID
                </th>
                <th className="px-6 md:px-8 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle">
                  Channel
                </th>
                <th className="px-6 md:px-8 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle text-right">
                  Amount
                </th>
                <th className="px-6 md:px-8 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle text-center">
                  Status
                </th>
                <th className="px-6 md:px-8 py-5 text-[10px] uppercase tracking-[0.25em] font-black text-text-muted border-b border-border-subtle text-right">
                  Receipt
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 md:px-10 py-20 text-center text-text-muted italic font-medium uppercase tracking-[0.2em] text-xs"
                  >
                    No transaction history detected
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr
                    key={`portal-payment-${p.id}`}
                    className="border-b border-border-subtle hover:bg-slate-900/30 transition-colors group"
                  >
                    <td className="px-6 md:px-8 py-5 text-[10px] md:text-xs font-bold uppercase tracking-tight text-text-dim whitespace-nowrap">
                      {p.createdAt?.toDate
                        ? p.createdAt
                            .toDate()
                            .toLocaleDateString("en-PH", {
                              timeZone: ASIA_TIMEZONE,
                              month: "short",
                              day: "2-digit",
                              year: "numeric",
                            })
                        : "Processing"}
                    </td>
                    <td className="px-6 md:px-8 py-5 text-xs font-mono text-primary group-hover:text-white transition-colors whitespace-nowrap">
                      {p.referenceNumber}
                    </td>
                    <td className="px-6 md:px-8 py-5">
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-slate-900 border border-border-subtle rounded">
                        {p.method}
                      </span>
                    </td>
                    <td className="px-6 md:px-8 py-5 text-right font-mono font-bold text-base md:text-lg italic tabular-nums whitespace-nowrap">
                      ₱ {p.amount.toLocaleString()}
                    </td>
                    <td className="px-6 md:px-8 py-5 text-center">
                      {p.status === "pending" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded">
                          <Clock size={10} className="animate-spin" /> Waiting for Admin Confirmation
                        </span>
                      ) : p.status === "confirmed" || p.status === "completed" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded">
                          <CheckCircle2 size={10} /> Confirmed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded">
                          <X size={10} /> Rejected
                        </span>
                      )}
                    </td>
                    <td className="px-6 md:px-8 py-5 text-right">
                      <button
                        onClick={() => setSelectedReceipt(p)}
                        className="p-2 border border-border-subtle hover:border-primary text-text-muted hover:text-primary transition-all cursor-pointer rounded"
                        title="View Settlement Details"
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
              className="fixed inset-0 z-[150] bg-bg-base/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
              onClick={() => setSelectedReceipt(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="sharp-card bg-bg-base max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col my-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-primary p-4 sm:p-6 text-white flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-2">
                    <Receipt size={20} />
                    <span className="font-black uppercase tracking-widest italic text-sm sm:text-base">
                      Digital Settlement Receipt
                    </span>
                  </div>
                  <button 
                    onClick={() => setSelectedReceipt(null)}
                    className="p-1 text-white hover:opacity-80 cursor-pointer"
                    aria-label="Close receipt"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-5 sm:p-8 space-y-4 overflow-y-auto">
                  {/* Status Banner in Modal */}
                  {selectedReceipt.status === "pending" ? (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5">
                      <Clock size={16} className="text-amber-400 shrink-0 mt-0.5 animate-spin" />
                      <div className="space-y-0.5 text-left">
                        <div className="text-[10px] font-mono uppercase font-bold text-amber-300">
                          Waiting for Admin Confirmation
                        </div>
                        <p className="text-[11px] text-text-muted leading-tight">
                          Your proof screenshot has been received and routed to the Admin Console. Subscription renewal or extension will remain inactive until confirmed by an administrator.
                        </p>
                      </div>
                    </div>
                  ) : selectedReceipt.status === "confirmed" || selectedReceipt.status === "completed" ? (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2.5">
                      <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 text-left">
                        <div className="text-[10px] font-mono uppercase font-bold text-emerald-300">
                          Payment Confirmed
                        </div>
                        <p className="text-[11px] text-text-muted leading-tight">
                          Settlement verified and credited by network administrator.
                          {selectedReceipt.audit?.actionBy && ` (Admin: ${selectedReceipt.audit.actionBy})`}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5">
                      <X size={16} className="text-rose-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 text-left">
                        <div className="text-[10px] font-mono uppercase font-bold text-rose-300">
                          Payment Rejected
                        </div>
                        <p className="text-[11px] text-text-muted leading-tight">
                          Reason: {selectedReceipt.rejectionReason || "Verification was not successful. Please re-submit valid proof."}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between border-b border-border-subtle pb-3">
                    <span className="text-[10px] font-black uppercase text-text-muted">
                      REFERENCE
                    </span>
                    <span className="font-mono text-xs font-bold text-primary">
                      {selectedReceipt.referenceNumber}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border-subtle pb-3">
                    <span className="text-[10px] font-black uppercase text-text-muted">
                      DATE
                    </span>
                    <span className="text-xs font-bold uppercase">
                      {selectedReceipt.createdAt?.toDate
                        ? selectedReceipt.createdAt.toDate().toLocaleString('en-PH', { timeZone: ASIA_TIMEZONE })
                        : "Processing"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border-subtle pb-3">
                    <span className="text-[10px] font-black uppercase text-text-muted">
                      AMOUNT PAID
                    </span>
                    <span className="text-xl sm:text-2xl font-mono font-bold italic text-primary">
                      ₱ {selectedReceipt.amount.toLocaleString()}
                    </span>
                  </div>

                  {selectedReceipt.screenshotUrl && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-black uppercase text-text-muted flex items-center gap-2">
                        <ImageIcon size={12} /> Uploaded Proof Screenshot
                      </span>
                      <div className="aspect-video bg-slate-900 border border-border-subtle overflow-hidden relative group rounded-lg">
                        <img
                          src={getDisplayImageUrl(selectedReceipt.screenshotUrl)}
                          alt="Receipt proof"
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-contain"
                        />
                        <a
                          href={getDisplayImageUrl(selectedReceipt.screenshotUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-[10px] font-black uppercase tracking-widest"
                        >
                          <ExternalLink size={14} /> View Large Image
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 text-center">
                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest italic leading-tight">
                      Electronically recorded ledger item • Subject to administrator confirmation
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 24/7 Dedicated Support Banner for Portal Users */}
        <div className="mt-12 bg-gradient-to-r from-slate-900 via-bg-surface to-slate-900 border border-border-subtle p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0 mt-0.5">
              <MessageSquare size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black uppercase tracking-wider text-white">Need Assistance with your Service?</h4>
                <span className="text-[9px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 border border-emerald-500/20">NOC DISPATCH</span>
              </div>
              <p className="text-xs text-text-muted mt-1 max-w-xl">
                Submit an urgent support ticket directly to our network engineering team. Submissions notify the Hotfast support administrator in real time.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSupport}
            className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-black uppercase tracking-wider rounded transition-all shadow-md shadow-primary/20 shrink-0 cursor-pointer flex items-center gap-2"
          >
            <Send size={13} />
            <span>Open Support Ticket</span>
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
