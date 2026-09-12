import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Send,
  MessageSquare,
  User,
  Hash,
  Phone,
  Mail,
  Lock,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useAuth } from "./FirebaseProvider";
import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const { user, profile } = useAuth();

  const [name, setName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("Technical & Connectivity");
  const [message, setMessage] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{
    ticketId: string;
    message: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Determine if subscriber details exist and lock them
  const hasUser = Boolean(user);
  const userDisplayName = profile?.displayName || user?.displayName || "";
  const userAccountNumber = profile?.accountNumber || "";
  const userEmail = profile?.email || user?.email || "";
  const userPhone = profile?.phone || "";

  // Sync profile details whenever opened
  React.useEffect(() => {
    if (isOpen) {
      if (hasUser) {
        setName(userDisplayName || "Subscriber Client");
        setAccountNumber(userAccountNumber || "HF-CLIENT");
        setEmail(userEmail || (user?.email ? user.email : ""));
      } else {
        if (!name) setName("");
        setAccountNumber("N/A");
      }
      if (userPhone && !phone) {
        setPhone(userPhone);
      }
    }
  }, [isOpen, profile, user, hasUser, userDisplayName, userAccountNumber, userEmail, userPhone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    const clientName = (hasUser ? (userDisplayName || name) : name || "").trim();
    const clientAccount = (userAccountNumber || accountNumber || "").trim();
    const clientPhone = phone.trim();

    if (!clientName || clientName.length < 2) {
      setErrorMessage("Please enter your full name (at least 2 characters).");
      return;
    }

    if (!clientPhone || clientPhone.length < 7) {
      setErrorMessage("Phone number is required. Please fill up a valid contact number (e.g. 0917-XXX-XXXX).");
      return;
    }

    if (!message.trim() || message.trim().length < 5) {
      setErrorMessage("Please describe your concern or message (at least 5 characters).");
      return;
    }

    setIsSubmitting(true);

    // Build contact string (phone number + email if available)
    const combinedContact = userEmail 
      ? `${clientPhone} (${userEmail})`
      : clientPhone;

    const generatedTicketId = `HF-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      // 1. Always store directly in Firestore 'support_tickets' so it arrives in the Admin Console instantly
      await addDoc(collection(db, "support_tickets"), {
        ticketId: generatedTicketId,
        clientName,
        accountNumber: clientAccount !== "N/A" ? clientAccount : "N/A",
        contact: combinedContact,
        phone: clientPhone,
        category,
        message: message.trim(),
        status: "open",
        userId: user?.uid || null,
        createdAt: serverTimestamp(),
      });

      // 2. Also dispatch to Telegram via /api/support if available (non-blocking for resilience)
      fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: generatedTicketId,
          name: clientName,
          accountNumber: clientAccount !== "N/A" ? clientAccount : undefined,
          contact: combinedContact,
          phone: clientPhone,
          category,
          message: message.trim(),
        }),
      }).catch((apiErr) => {
        console.warn("Telegram dispatch notice:", apiErr);
      });

      setSubmittedTicket({
        ticketId: generatedTicketId,
        message: "Your support request has been registered and dispatched directly to the Hotfast Admin Console! Our team will review your ticket shortly.",
      });

      // Clear input fields for safety
      setMessage("");
    } catch (err: any) {
      console.error("Support form submission error:", err);
      // If direct Firestore failed (e.g. offline), try fallback to /api/support
      try {
        const res = await fetch("/api/support", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: clientName,
            accountNumber: clientAccount !== "N/A" ? clientAccount : undefined,
            contact: combinedContact,
            phone: clientPhone,
            category,
            message: message.trim(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setSubmittedTicket({
            ticketId: data.ticketId || generatedTicketId,
            message: "Your support request has been submitted to the administrator.",
          });
          setMessage("");
          return;
        }
      } catch {}

      setErrorMessage(err?.message || "Failed to submit support request. Please check your network connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmittedTicket(null);
    setErrorMessage("");
    setMessage("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/85 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            className="relative w-full max-w-lg bg-bg-surface border border-primary/40 shadow-2xl rounded-lg overflow-hidden my-auto z-10"
          >
            {/* Top Banner */}
            <div className="bg-gradient-to-r from-primary via-primary-dark to-slate-900 px-5 py-4 sm:px-6 sm:py-5 flex items-center justify-between border-b border-primary/30">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-black/30 border border-white/20 flex items-center justify-center text-white shrink-0">
                  <MessageSquare size={18} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-300 bg-black/30 px-2 py-0.5 rounded border border-amber-400/30">
                      NOC Dispatch
                    </span>
                    <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Active 24/7
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black uppercase tracking-wide text-white mt-0.5">
                    Hotfast Customer Support
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/25 hover:bg-black/50 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 sm:p-6 max-h-[80vh] overflow-y-auto">
              {submittedTicket ? (
                /* Success State */
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-4 space-y-4"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/10">
                    <CheckCircle2 size={32} />
                  </div>

                  <div>
                    <span className="inline-block px-3 py-1 bg-primary/15 text-primary text-[10px] font-mono font-black uppercase tracking-wider rounded border border-primary/30 mb-2">
                      Reference #{submittedTicket.ticketId}
                    </span>
                    <h4 className="text-lg font-black uppercase tracking-tight text-white">
                      Support Request Dispatched
                    </h4>
                    <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto leading-relaxed">
                      {submittedTicket.message}
                    </p>
                  </div>

                  <div className="bg-bg-base border border-border-subtle p-3.5 rounded text-left space-y-2 text-xs">
                    <div className="flex items-center justify-between text-text-dim text-[10px] font-mono uppercase tracking-wider">
                      <span>Routing</span>
                      <span className="text-emerald-400 font-bold">Admin Telegram NOC</span>
                    </div>
                    <div className="flex items-center justify-between text-text-muted">
                      <span>Client:</span>
                      <span className="font-semibold text-white">{name}</span>
                    </div>
                    {accountNumber && (
                      <div className="flex items-center justify-between text-text-muted">
                        <span>Account:</span>
                        <span className="font-mono text-white">{accountNumber}</span>
                      </div>
                    )}
                    {phone && (
                      <div className="flex items-center justify-between text-text-muted">
                        <span>Contact:</span>
                        <span className="font-mono text-white">{phone}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-text-muted">
                      <span>Category:</span>
                      <span className="text-primary font-medium">{category}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider transition-colors rounded cursor-pointer"
                    >
                      Send Another
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-5 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-black uppercase tracking-wider transition-colors rounded shadow-md shadow-primary/25 cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* Form State */
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="bg-bg-base/70 border border-border-subtle p-3 rounded flex items-start gap-2.5 text-xs text-text-muted">
                    <Zap size={16} className="text-primary shrink-0 mt-0.5" />
                    <span>
                      Submitting this form immediately routes your inquiry to our Hotfast network support administrator on duty.
                    </span>
                  </div>

                  {errorMessage && (
                    <div className="p-3 bg-red-500/15 border border-red-500/40 rounded flex items-start gap-2.5 text-xs text-red-300">
                      <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Read-only Subscriber / Client Information Block */}
                  <div className="bg-bg-base/90 border border-border-subtle rounded-md p-3 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-border-subtle/50 pb-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-dim flex items-center gap-1.5">
                        <Lock size={11} className="text-amber-400" />
                        Verified Subscriber Information (Immutable)
                      </span>
                      <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        {user ? "Authenticated" : "Active Session"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-[9px] font-mono uppercase tracking-wider text-text-dim mb-0.5 flex items-center gap-1">
                          <User size={10} className="text-primary" /> Client Name {!hasUser && <span className="text-primary">*</span>}
                        </label>
                        {hasUser ? (
                          <div className="px-2.5 py-1.5 bg-slate-900/90 border border-border-subtle/70 rounded text-xs font-semibold text-slate-100 flex items-center justify-between select-none">
                            <span className="truncate">{userDisplayName || "Subscriber Client"}</span>
                            <Lock size={11} className="text-text-dim shrink-0 ml-1" />
                          </div>
                        ) : (
                          <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your Full Name"
                            className="w-full px-2.5 py-1.5 bg-bg-base border border-border-subtle focus:border-primary focus:outline-none rounded text-xs text-white placeholder:text-text-dim"
                          />
                        )}
                      </div>

                      <div>
                        <label className="block text-[9px] font-mono uppercase tracking-wider text-text-dim mb-0.5 flex items-center gap-1">
                          <Hash size={10} className="text-primary" /> Account Number
                        </label>
                        <div className="px-2.5 py-1.5 bg-slate-900/90 border border-border-subtle/70 rounded text-xs font-mono font-bold text-slate-100 flex items-center justify-between select-none">
                          <span className="truncate">{userAccountNumber || (hasUser ? "HF-CLIENT" : "N/A")}</span>
                          <Lock size={11} className="text-text-dim shrink-0 ml-1" />
                        </div>
                      </div>
                    </div>

                    {userEmail && (
                      <div className="pt-1 border-t border-border-subtle/40 flex items-center justify-between text-[11px] text-text-muted">
                        <span className="flex items-center gap-1 text-text-dim text-[10px] font-mono uppercase">
                          <Mail size={11} className="text-primary" /> Registered Email:
                        </span>
                        <span className="font-mono text-slate-300 truncate max-w-[240px]">{userEmail}</span>
                      </div>
                    )}
                  </div>

                  {/* Category Selection */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5 flex items-center gap-1">
                      <HelpCircle size={12} className="text-primary" /> Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-bg-base border border-border-subtle focus:border-primary focus:outline-none rounded text-xs text-white transition-colors cursor-pointer"
                    >
                      <option value="Technical & Connectivity">Technical &amp; Connectivity (LOS / Slow Speed)</option>
                      <option value="Billing & Payments">Billing, Due Date &amp; GCash Proofs</option>
                      <option value="Account & Plan Upgrade">Account Modification &amp; Speed Upgrade</option>
                      <option value="Relocation / Transfer">Relocation / Fiber Line Transfer</option>
                      <option value="General Inquiry">General Inquiry / Feedback</option>
                    </select>
                  </div>

                  {/* Fill up Phone Number - REQUIRED directly below Category */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1">
                        <Phone size={12} className="text-primary" /> Fill Up Phone Number <span className="text-primary">*</span>
                      </label>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                        Required
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. 0917-123-4567 or +63 912 345 6789"
                        className="w-full px-3 py-2 bg-bg-base border border-border-subtle focus:border-primary focus:outline-none rounded text-xs text-white placeholder:text-text-dim font-mono transition-colors"
                      />
                    </div>
                    <span className="text-[10px] text-text-dim mt-1 block">
                      Our NOC technical team will contact this phone number regarding your concern.
                    </span>
                  </div>

                  {/* Message */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5 flex items-center gap-1">
                      <MessageSquare size={12} className="text-primary" /> Message / Concern <span className="text-primary">*</span>
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Please describe your concern in detail..."
                      className="w-full px-3 py-2 bg-bg-base border border-border-subtle focus:border-primary focus:outline-none rounded text-xs text-white placeholder:text-text-dim transition-colors resize-none leading-relaxed"
                    />
                  </div>

                  {/* Security & Action */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 bg-gradient-to-r from-primary to-red-600 hover:from-primary-dark hover:to-red-700 disabled:opacity-60 text-white text-xs font-black uppercase tracking-widest rounded flex items-center justify-center gap-2 shadow-lg shadow-primary/25 transition-all cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Dispatching to NOC...</span>
                        </>
                      ) : (
                        <>
                          <Send size={15} />
                          <span>Send Support Request</span>
                        </>
                      )}
                    </button>
                    <div className="flex items-center justify-center gap-2 text-[9px] text-text-dim font-mono mt-2.5">
                      <ShieldCheck size={12} className="text-emerald-400" />
                      <span>Protected by rate limiting &amp; server-side encryption</span>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
