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
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Headphones,
  Check,
  Sparkles,
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
  const [category, setCategory] = useState("Technical Support (No Internet / Slow Speed)");
  const [message, setMessage] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{
    ticketId: string;
    message: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Determine if subscriber details exist
  const hasUser = Boolean(user);
  const userDisplayName = profile?.displayName || user?.displayName || "";
  const userAccountNumber = profile?.accountNumber || "";
  const userEmail = profile?.email || user?.email || "";
  const userPhone = profile?.phone || "";

  // Sync profile details whenever opened
  React.useEffect(() => {
    if (isOpen) {
      if (hasUser) {
        setName(userDisplayName || "Valued Subscriber");
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
      setErrorMessage("Please enter your name so our support team knows how to address you.");
      return;
    }

    const cleanDigits = clientPhone.replace(/\D/g, "");
    if (!clientPhone || cleanDigits.length < 10) {
      setErrorMessage("Please enter a valid mobile number starting with 09 (Sample: 09171234567).");
      return;
    }

    if (!message.trim() || message.trim().length < 5) {
      setErrorMessage("Please share a brief description of your concern (at least 5 characters).");
      return;
    }

    setIsSubmitting(true);

    // Build contact string (phone number + email if available)
    const combinedContact = userEmail 
      ? `${clientPhone} (${userEmail})`
      : clientPhone;

    const generatedTicketId = `HF-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      // 1. Store in Firestore 'support_tickets' so it arrives in the Admin Console instantly
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
        console.warn("Support alert notification notice:", apiErr);
      });

      setSubmittedTicket({
        ticketId: generatedTicketId,
        message: "Thank you for reaching out! Your support ticket has been received. Our team will contact you at your mobile number shortly.",
      });

      // Clear message field for safety
      setMessage("");
    } catch (err: any) {
      console.error("Support form submission error:", err);
      // Fallback to /api/support if direct Firestore is offline
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
            message: "Thank you! Your support request has been submitted. Our team will reach out to you shortly.",
          });
          setMessage("");
          return;
        }
      } catch {}

      setErrorMessage(err?.message || "Unable to send your message right now. Please check your internet connection and try again.");
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
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 14 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg bg-slate-900 border border-slate-700/70 shadow-2xl rounded-2xl overflow-hidden my-auto z-10"
          >
            {/* Friendly Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 py-4 sm:px-6 sm:py-5 flex items-center justify-between border-b border-slate-700/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0 shadow-inner">
                  <Headphones size={20} className="text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Online 24/7 Support
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white mt-0.5">
                    Hotfast Customer Support
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 sm:p-6 max-h-[82vh] overflow-y-auto">
              {submittedTicket ? (
                /* Friendly Success State */
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-5 space-y-4"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/10">
                    <CheckCircle2 size={34} />
                  </div>

                  <div>
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-mono font-bold rounded-full border border-primary/20 mb-2">
                      Ticket #{submittedTicket.ticketId}
                    </span>
                    <h4 className="text-xl font-bold text-white">
                      Message Received!
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-sm mx-auto leading-relaxed">
                      {submittedTicket.message}
                    </p>
                  </div>

                  <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-xl text-left space-y-2.5 text-xs text-slate-300">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Name:</span>
                      <span className="font-medium text-white">{name}</span>
                    </div>
                    {accountNumber && accountNumber !== "N/A" && (
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Account Number:</span>
                        <span className="font-mono text-white">{accountNumber}</span>
                      </div>
                    )}
                    {phone && (
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Contact Number:</span>
                        <span className="font-mono text-emerald-400 font-semibold">{phone}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Inquiry Topic:</span>
                      <span className="text-primary font-medium">{category}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-3 pt-3">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      Send Another Inquiry
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-6 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-primary/20 cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* Friendly Form State */
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Warm Intro Banner */}
                  <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl flex items-start gap-3 text-xs text-slate-300">
                    <Sparkles size={16} className="text-primary shrink-0 mt-0.5" />
                    <span>
                      How can we help you today? Fill out this quick form and our support team will reach out to resolve your concern promptly.
                    </span>
                  </div>

                  {errorMessage && (
                    <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl flex items-start gap-2.5 text-xs text-red-300">
                      <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Account Information Card */}
                  <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-700/40 pb-2">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <User size={13} className="text-primary" />
                        Account Details
                      </span>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                        {user ? "Signed In" : "Guest"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Your Name {!hasUser && <span className="text-primary">*</span>}
                        </label>
                        {hasUser ? (
                          <div className="px-3 py-2 bg-slate-900/80 border border-slate-700/60 rounded-lg text-xs font-medium text-slate-200 flex items-center justify-between">
                            <span className="truncate">{userDisplayName || "Valued Subscriber"}</span>
                            <Check size={13} className="text-emerald-400 shrink-0 ml-1" />
                          </div>
                        ) : (
                          <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your Full Name"
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none rounded-lg text-xs text-white placeholder:text-slate-500 transition-colors"
                          />
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Account Number
                        </label>
                        <div className="px-3 py-2 bg-slate-900/80 border border-slate-700/60 rounded-lg text-xs font-mono font-medium text-slate-200 flex items-center justify-between">
                          <span className="truncate">{userAccountNumber || (hasUser ? "HF-CLIENT" : "Optional / New Client")}</span>
                        </div>
                      </div>
                    </div>

                    {userEmail && (
                      <div className="pt-1 border-t border-slate-700/40 flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <Mail size={12} className="text-primary" /> Email Address:
                        </span>
                        <span className="font-mono text-slate-200 truncate max-w-[220px] text-[11px]">{userEmail}</span>
                      </div>
                    )}
                  </div>

                  {/* Topic / Category Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <HelpCircle size={13} className="text-primary" /> How can we help? <span className="text-primary">*</span>
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none rounded-lg text-xs text-white transition-colors cursor-pointer"
                    >
                      <option value="Technical Support (No Internet / Slow Speed)">Technical Support (No Internet / Slow Speed / LOS)</option>
                      <option value="Billing & Payments">Billing &amp; Payments (GCash confirmation, Invoices)</option>
                      <option value="Plan Upgrade & Account Modification">Plan Upgrade &amp; Account Modification</option>
                      <option value="Fiber Line Transfer & Relocation">Fiber Line Transfer &amp; Relocation</option>
                      <option value="General Questions & Feedback">General Questions &amp; Feedback</option>
                    </select>
                  </div>

                  {/* Mobile Phone Number - Only sample starting from 09, no e.g. */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Phone size={13} className="text-primary" /> Mobile Number <span className="text-primary">*</span>
                      </label>
                      <span className="text-[11px] font-mono font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                        Sample: 09171234567
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="09123456789"
                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none rounded-lg text-sm text-white placeholder:text-slate-500 font-mono transition-colors"
                      />
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Sample: 09171234567 • We will text or call this number to assist you.
                    </span>
                  </div>

                  {/* Message / Concern */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <MessageSquare size={13} className="text-primary" /> Your Message / Concern <span className="text-primary">*</span>
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Please describe what you need help with in detail..."
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none rounded-lg text-xs text-white placeholder:text-slate-500 transition-colors resize-none leading-relaxed"
                    />
                  </div>

                  {/* Friendly Action Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 bg-gradient-to-r from-primary to-red-600 hover:from-primary-dark hover:to-red-700 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Sending your message...</span>
                        </>
                      ) : (
                        <>
                          <Send size={15} />
                          <span>Send Support Message</span>
                        </>
                      )}
                    </button>
                    <div className="text-center text-[11px] text-slate-400 mt-2.5">
                      Our friendly support team usually replies within minutes during service hours.
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

