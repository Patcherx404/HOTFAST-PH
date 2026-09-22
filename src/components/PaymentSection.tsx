/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  QrCode,
  Download,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  Upload,
  ArrowRight,
  ExternalLink,
  Receipt,
  Lock,
  Zap,
  Info,
  Check,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "./FirebaseProvider";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { InternetPlan, PaymentRecord } from "../types";

interface PayMongoQRData {
  id: string;
  nation: string;
  type: string;
  mode: string;
  status: string;
  transaction_currency: string;
  transaction_amount: number; // in centavos
  merchant_name: string;
  merchant_city?: string;
  credit_account_number?: string;
  merchant_mobile_number?: string;
  created_at: string;
  expires_at: string;
  qr_string: string;
  qr_image: string; // Base64 data URL
}

interface PaymentSectionProps {
  plans: InternetPlan[];
  selectedPlan: InternetPlan | null;
  onSuccess?: () => void;
  onSelectPlan?: (plan: InternetPlan) => void;
}

export function PaymentSection({
  plans,
  selectedPlan,
  onSuccess,
  onSelectPlan,
}: PaymentSectionProps) {
  const { user, profile } = useAuth();

  // Selected plan state (defaults to passed plan, or user's active plan, or first plan)
  const [activePlan, setActivePlan] = useState<InternetPlan | null>(
    selectedPlan ||
      plans.find((p) => p.id === profile?.currentPlanId) ||
      plans[0] ||
      null
  );

  const [accountNumber, setAccountNumber] = useState(
    profile?.accountNumber || (user ? `HF-${user.uid.substring(0, 8).toUpperCase()}` : "HF-GUEST")
  );

  const [amount, setAmount] = useState<number>(
    activePlan ? activePlan.price : 1000
  );

  // PayMongo QR State
  const [qrData, setQrData] = useState<PayMongoQRData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Countdown timer for 30 min expiration (in seconds)
  const [timeLeft, setTimeLeft] = useState<number>(1800);
  const [isExpired, setIsExpired] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Settlement Form State
  const [customerRefNumber, setCustomerRefNumber] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState<PaymentRecord | null>(null);

  // Quick App Guide Modal / Drawer state
  const [showAppGuide, setShowAppGuide] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Sync selected plan changes
  useEffect(() => {
    if (selectedPlan) {
      setActivePlan(selectedPlan);
      setAmount(selectedPlan.price);
    }
  }, [selectedPlan]);

  // Sync account number
  useEffect(() => {
    if (profile?.accountNumber) {
      setAccountNumber(profile.accountNumber);
    } else if (user?.uid) {
      setAccountNumber(`HF-${user.uid.substring(0, 8).toUpperCase()}`);
    }
  }, [profile, user]);

  // Generate QR Ph via PayMongo
  const generateQRPh = async (targetAmount: number) => {
    if (targetAmount <= 0) return;
    setIsGenerating(true);
    setGenerationError(null);
    setIsExpired(false);

    try {
      // Clear previous timer
      if (timerRef.current) clearInterval(timerRef.current);

      const payload = {
        amount: targetAmount,
        mobile_number: "+639122367040",
        notes: `HOTFAST Payment for ${accountNumber || "Account"} - PHP ${targetAmount}`,
        expiry_seconds: 1800,
      };

      let response = await fetch("/api/paymongo/qr/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      // Seamless fallback to /api/paymongo/generate if serverless route is not yet cached or returns 404
      if (response.status === 404) {
        response = await fetch("/api/paymongo/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      }

      const result = await response.json().catch(() => null);

      if (!response.ok || !result || !result.success || !result.data) {
        throw new Error(
          result?.error ||
          result?.message ||
          "Failed to generate dynamic QR Ph code from PayMongo."
        );
      }

      const newQrData: PayMongoQRData = result.data;
      setQrData(newQrData);

      // Compute expiry countdown from PayMongo expires_at or 1800s
      let initialSeconds = 1800;
      if (newQrData.expires_at) {
        const expiryTime = new Date(newQrData.expires_at).getTime();
        const now = Date.now();
        const diffSeconds = Math.max(0, Math.floor((expiryTime - now) / 1000));
        if (diffSeconds > 0) initialSeconds = diffSeconds;
      }

      setTimeLeft(initialSeconds);
      setIsExpired(false);

      // Start countdown
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setIsExpired(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      toast.success(`Dynamic QR Ph generated for ₱${targetAmount.toLocaleString()}!`);
    } catch (err: any) {
      console.error("QR Ph generation error:", err);
      setGenerationError(err?.message || "Failed to generate QR Ph. Please try again.");
      toast.error("Could not generate QR Ph code. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Initial generation when component mounts
  useEffect(() => {
    generateQRPh(amount);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Format time remaining MM:SS
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Handle plan selection change
  const handlePlanChange = (plan: InternetPlan) => {
    setActivePlan(plan);
    setAmount(plan.price);
    if (onSelectPlan) onSelectPlan(plan);
    generateQRPh(plan.price);
  };

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedField(label);
      toast.success(`${label} copied to clipboard!`);
      setTimeout(() => setCopiedField(null), 2500);
    } catch {
      toast.error("Failed to copy. Please manually copy the text.");
    }
  };

  // Download QR Code image
  const handleDownloadQR = () => {
    if (!qrData?.qr_image) {
      toast.error("QR image is still loading. Please wait a moment.");
      return;
    }

    try {
      const link = document.createElement("a");
      link.href = qrData.qr_image;
      link.download = `HOTFAST-QRPh-P${amount}-${accountNumber}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("QR Ph Code saved to your device!", {
        description: "In GCash/Maya, tap 'QR' > 'Upload from Photos' to pay instantly on mobile.",
        duration: 5000,
      });
    } catch (err) {
      console.error("Failed to download QR:", err);
      toast.error("Failed to save image. Please screenshot the QR code.");
    }
  };

  // File upload for receipt
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit Settlement Confirmation to Firestore
  const handleSubmitSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please login to record your settlement.");
      return;
    }

    if (isExpired) {
      toast.error("This QR Ph code has expired. Please click 'Regenerate QR' to proceed.");
      return;
    }

    setIsSubmitting(true);
    const paymentsPath = `users/${user.uid}/payments`;

    try {
      const refNumber =
        customerRefNumber.trim() ||
        (qrData ? qrData.id : `QRPH-${Date.now().toString(36).toUpperCase()}`);

      const paymentData = {
        userId: user.uid,
        accountNumber,
        amount: Number(amount),
        method: "QR Ph (PayMongo)",
        status: "pending", // Manual or automated verification
        referenceNumber: refNumber,
        qrId: qrData?.id || "",
        qrString: qrData?.qr_string || "",
        screenshotUrl: receiptPreview || "",
        planName: activePlan?.name || "Fiber Internet Plan",
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, paymentsPath), paymentData);

      const record: PaymentRecord = {
        id: docRef.id,
        userId: user.uid,
        accountNumber,
        amount: Number(amount),
        method: "QR Ph (PayMongo)",
        status: "pending",
        referenceNumber: refNumber,
        qrId: qrData?.id,
        qrString: qrData?.qr_string,
        screenshotUrl: receiptPreview || undefined,
        planName: activePlan?.name,
      };

      setSubmittedRecord(record);
      setIsSubmitted(true);
      toast.success("Settlement submitted successfully!", {
        description: "Our team will verify your transaction against the QR Ph network.",
      });

      // Optional auto-redirect after 3.5 seconds
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 3500);
    } catch (err: any) {
      console.error("Settlement submission error:", err);
      handleFirestoreError(err, OperationType.CREATE, paymentsPath);
      toast.error("Failed to submit settlement. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // If submitted, show success receipt card
  if (isSubmitted && submittedRecord) {
    return (
      <section className="py-12 sm:py-20 px-4 sm:px-6 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-900/90 border border-border-subtle p-6 sm:p-10 rounded-2xl shadow-2xl relative overflow-hidden"
        >
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center space-y-4 mb-8">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-emerald-400 font-bold">
                Transaction Received
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight mt-1">
                Settlement Queued
              </h2>
              <p className="text-xs text-text-muted mt-1">
                Your QR Ph payment has been successfully recorded in our ledger.
              </p>
            </div>
          </div>

          {/* Receipt Details Box */}
          <div className="bg-slate-950/80 border border-slate-800 p-5 sm:p-6 rounded-xl space-y-4 font-mono text-xs">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <span className="text-text-muted uppercase tracking-wider text-[11px]">Channel</span>
              <span className="text-white font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                QR Ph (PayMongo)
              </span>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <span className="text-text-muted uppercase tracking-wider text-[11px]">Subscriber ID</span>
              <span className="text-white font-bold">{submittedRecord.accountNumber}</span>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <span className="text-text-muted uppercase tracking-wider text-[11px]">Plan / Tier</span>
              <span className="text-white font-bold">{submittedRecord.planName || "Fiber Internet"}</span>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <span className="text-text-muted uppercase tracking-wider text-[11px]">Reference No.</span>
              <span className="text-primary font-bold break-all text-[11px] sm:text-xs">
                {submittedRecord.referenceNumber}
              </span>
            </div>

            {submittedRecord.qrId && (
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <span className="text-text-muted uppercase tracking-wider text-[11px]">PayMongo QR ID</span>
                <span className="text-text-dim text-[10px] break-all">{submittedRecord.qrId}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-1">
              <span className="text-text-muted uppercase tracking-wider text-xs">Settlement Amount</span>
              <span className="text-lg sm:text-xl font-bold text-white">
                ₱ {submittedRecord.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                setIsSubmitted(false);
                setSubmittedRecord(null);
                generateQRPh(amount);
              }}
              className="flex-1 py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-colors text-center"
            >
              New Payment
            </button>
            <button
              onClick={() => {
                if (onSuccess) onSuccess();
              }}
              className="flex-1 py-3.5 px-4 bg-primary hover:bg-primary-dark text-white text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-colors text-center flex items-center justify-center gap-2"
            >
              Go to Subscriber Portal <ArrowRight size={14} />
            </button>
          </div>
        </motion.div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-10 md:py-16 px-3 sm:px-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="mb-6 sm:mb-8 text-center sm:text-left flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-primary/10 border border-primary/30 rounded-md text-[10px] font-mono font-bold uppercase tracking-widest text-primary mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
            Official QR Ph Merchant Gateway
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white uppercase tracking-tight italic">
            QR Ph Settlement
          </h2>
          <p className="text-xs sm:text-sm text-text-muted mt-1 max-w-xl">
            Scan and pay with any Philippine bank or e-wallet supporting the national QR Ph standard.
          </p>
        </div>

        {/* Quick Supported Icons */}
        <div className="flex items-center gap-2 self-center sm:self-auto bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-lg text-[10px] font-mono text-text-muted">
          <span className="font-bold text-white">QR Ph:</span>
          <span className="text-sky-400 font-bold">GCash</span>
          <span>•</span>
          <span className="text-emerald-400 font-bold">Maya</span>
          <span>•</span>
          <span className="text-amber-400 font-bold">BDO/BPI</span>
          <span>•</span>
          <span>40+ Banks</span>
        </div>
      </div>

      {/* Main Grid: Left = Dynamic QR Presentation, Right = Billing Details & Verification */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Dynamic QR Ph Box */}
        <div className="lg:col-span-6 bg-slate-900/80 border border-border-subtle rounded-2xl p-5 sm:p-8 shadow-xl relative overflow-hidden">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted font-bold block">
                Dynamic Payment Matrix
              </span>
              <span className="text-xs font-bold text-white">
                PayMongo Merchant-Presented Mode (MPM)
              </span>
            </div>

            {/* Countdown / Status Badge */}
            <div>
              {isGenerating ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 text-[10px] font-mono text-text-muted rounded-full">
                  <RefreshCw size={11} className="animate-spin" /> Generating...
                </span>
              ) : isExpired ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-mono font-bold rounded-full">
                  <AlertTriangle size={11} /> Expired
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold rounded-full">
                  <Clock size={11} /> {formatTime(timeLeft)}
                </span>
              )}
            </div>
          </div>

          {/* QR Code Canvas / Display Area */}
          <div className="py-6 sm:py-8 flex flex-col items-center justify-center">
            <div className="relative p-4 sm:p-5 bg-white rounded-2xl shadow-2xl transition-all max-w-[280px] sm:max-w-[320px] w-full aspect-square flex items-center justify-center group">
              {/* QR Ph Brand Badge on top */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-700 px-3 py-0.5 rounded-full shadow-lg flex items-center gap-1.5 z-10">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-white">
                  BSP QR Ph Standard
                </span>
              </div>

              {isGenerating ? (
                <div className="flex flex-col items-center justify-center text-slate-800 space-y-3 p-6 text-center">
                  <RefreshCw className="animate-spin text-primary" size={36} />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600">
                    Connecting to PayMongo...
                  </span>
                </div>
              ) : generationError ? (
                <div className="flex flex-col items-center justify-center text-red-600 space-y-3 p-4 text-center">
                  <AlertTriangle size={36} />
                  <span className="text-xs font-mono font-bold">Failed to load QR</span>
                  <button
                    onClick={() => generateQRPh(amount)}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded text-[10px] font-mono font-bold uppercase"
                  >
                    Retry
                  </button>
                </div>
              ) : isExpired ? (
                <div className="flex flex-col items-center justify-center text-slate-800 space-y-3 p-4 text-center">
                  <Clock size={36} className="text-red-500" />
                  <span className="text-xs font-mono font-bold text-red-600 uppercase">
                    QR Code Expired
                  </span>
                  <p className="text-[10px] text-slate-500">
                    For security, dynamic QR codes expire after 30 minutes.
                  </p>
                  <button
                    onClick={() => generateQRPh(amount)}
                    className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-primary-dark transition-colors cursor-pointer"
                  >
                    <RefreshCw size={12} /> Regenerate QR
                  </button>
                </div>
              ) : qrData?.qr_image ? (
                <img
                  src={qrData.qr_image}
                  alt="PayMongo QR Ph Code"
                  className="w-full h-full object-contain rounded-lg"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-800 space-y-2">
                  <QrCode size={48} className="text-slate-400" />
                  <span className="text-xs font-mono font-bold text-slate-500">
                    Generating Code...
                  </span>
                </div>
              )}
            </div>

            {/* Merchant & Amount Meta */}
            <div className="mt-5 text-center space-y-1">
              <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-text-muted">
                Merchant: <span className="text-white">Hotfast Ph</span>
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-black text-primary italic">
                ₱ {amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </div>
              {qrData?.id && (
                <div className="pt-1 flex items-center justify-center gap-1.5 text-[10px] font-mono text-text-muted">
                  <span>ID: {qrData.id.substring(0, 16)}...</span>
                  <button
                    onClick={() => handleCopy(qrData.id, "QR ID")}
                    className="text-text-muted hover:text-white transition-colors cursor-pointer p-0.5"
                    title="Copy QR ID"
                  >
                    <Copy size={11} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* QR Action Buttons: Download & Copy Payload */}
          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              disabled={!qrData?.qr_image || isGenerating || isExpired}
              onClick={handleDownloadQR}
              className="py-3 px-3 bg-slate-800/90 hover:bg-slate-700/90 disabled:opacity-40 text-slate-200 border border-slate-700 hover:border-primary/50 text-[10px] sm:text-xs font-mono font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[42px]"
              title="Download QR code to your phone gallery"
            >
              <Download size={14} className="text-primary shrink-0" />
              <span className="truncate">Save QR to Phone</span>
            </button>

            <button
              type="button"
              disabled={!qrData?.qr_string || isGenerating || isExpired}
              onClick={() => {
                if (qrData?.qr_string) handleCopy(qrData.qr_string, "QR Payload String");
              }}
              className="py-3 px-3 bg-slate-800/90 hover:bg-slate-700/90 disabled:opacity-40 text-slate-200 border border-slate-700 hover:border-primary/50 text-[10px] sm:text-xs font-mono font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[42px]"
              title="Copy official EMVCo QRPh payload string"
            >
              {copiedField === "QR Payload String" ? (
                <>
                  <Check size={14} className="text-emerald-400 shrink-0" />
                  <span className="text-emerald-400 truncate">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={14} className="text-primary shrink-0" />
                  <span className="truncate">Copy QR String</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Deep Link Launchers for Mobile */}
          <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
              <span className="uppercase font-bold tracking-wider">Mobile App Shortcuts:</span>
              <button
                type="button"
                onClick={() => setShowAppGuide(!showAppGuide)}
                className="text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle size={11} /> How to pay on mobile
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <a
                href="gcash://"
                target="_top"
                onClick={() => {
                  toast.info("Opening GCash... Tap 'QR' > 'Upload from Photos' to scan the saved code.");
                }}
                className="py-2.5 px-3 bg-[#007DFE]/15 hover:bg-[#007DFE]/25 text-[#007DFE] border border-[#007DFE]/40 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all no-underline text-center"
              >
                <Smartphone size={13} /> Open GCash App
              </a>

              <a
                href="paymaya://"
                target="_top"
                onClick={() => {
                  toast.info("Opening Maya... Tap 'Scan QR' > select image from your gallery.");
                }}
                className="py-2.5 px-3 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all no-underline text-center"
              >
                <Smartphone size={13} /> Open Maya App
              </a>
            </div>

            {/* Expandable Step-by-Step Guide for 1-Device Mobile Users */}
            {showAppGuide && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-mono space-y-2 text-slate-300"
              >
                <div className="font-bold text-white uppercase text-[10px] flex items-center gap-1">
                  <Info size={12} className="text-primary" /> Paying on the same phone?
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>Tap <strong>Save QR to Phone</strong> above to save the image to your gallery.</li>
                  <li>Open your preferred banking or e-wallet app (GCash, Maya, BDO, BPI, etc.).</li>
                  <li>Tap the <strong>QR Scanner</strong> icon.</li>
                  <li>Select <strong>Upload QR / Choose from Gallery / Album</strong>.</li>
                  <li>Confirm the exact amount (<strong>₱{amount.toLocaleString()}</strong>) and authorize payment.</li>
                </ol>
              </motion.div>
            )}
          </div>
        </div>

        {/* Right Column: Subscriber Context, Tier Picker & Settlement Verification Form */}
        <div className="lg:col-span-6 space-y-6">
          {/* Subscriber & Plan Configuration Card */}
          <div className="bg-slate-900/80 border border-border-subtle rounded-2xl p-5 sm:p-7 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted font-bold">
                Account Credentials
              </span>
              <span className="text-[9px] bg-primary/20 text-primary px-2 py-0.5 rounded uppercase tracking-[0.2em] font-black border border-primary/20 flex items-center gap-1">
                <ShieldCheck size={11} /> Verified Account
              </span>
            </div>

            {/* Account & Fixed Tier Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block">
                  Subscriber ID
                </label>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl font-mono text-sm font-bold text-white flex items-center justify-between">
                  <span className="tracking-wider">{accountNumber}</span>
                  <Lock size={14} className="text-text-muted" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block">
                  Selected Tier
                </label>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl font-mono text-sm font-bold text-primary flex items-center justify-between">
                  <span className="truncate">{activePlan?.name || "Standard Fiber"}</span>
                  <Zap size={14} className="text-primary shrink-0" />
                </div>
              </div>
            </div>

            {/* Quick Plan Switcher */}
            {plans.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted flex items-center justify-between">
                  <span>Switch Subscription Plan</span>
                  <span className="text-[9px] text-primary">Click to regenerate QR</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {plans.slice(0, 3).map((plan) => {
                    const isSelected = activePlan?.id === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => handlePlanChange(plan)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-primary/10 border-primary text-white"
                            : "bg-slate-950/60 border-slate-800 text-text-muted hover:border-slate-700"
                        }`}
                      >
                        <div className="text-[11px] font-mono font-bold truncate">
                          {plan.name}
                        </div>
                        <div className="text-[10px] font-mono text-primary font-bold mt-0.5">
                          ₱{plan.price.toLocaleString()}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Settlement Submission & Proof Form */}
          <form
            onSubmit={handleSubmitSettlement}
            className="bg-slate-900/80 border border-border-subtle rounded-2xl p-5 sm:p-7 shadow-xl space-y-5"
          >
            <div className="pb-3 border-b border-slate-800">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted font-bold block">
                Verification Ledger
              </span>
              <h3 className="text-base font-bold text-white mt-0.5">
                Confirm Your Payment
              </h3>
              <p className="text-[11px] text-text-muted mt-0.5">
                After completing payment in your bank or e-wallet app, enter your reference number or upload your confirmation slip below.
              </p>
            </div>

            {/* Bank / App Reference Number Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block">
                Payment Reference Number / Trace ID
              </label>
              <input
                type="text"
                value={customerRefNumber}
                onChange={(e) => setCustomerRefNumber(e.target.value)}
                placeholder="e.g. 1029384756 or GCash Ref No."
                className="w-full bg-slate-950 border border-slate-800 focus:border-primary focus:ring-1 focus:ring-primary p-3 rounded-xl font-mono text-sm text-white placeholder-slate-600 outline-none transition-all"
              />
              <p className="text-[9px] font-mono text-text-muted">
                Found on your GCash/Maya/Bank confirmation screen or SMS.
              </p>
            </div>

            {/* Optional Screenshot Receipt Upload */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block">
                Receipt Attachment (Optional Proof)
              </label>

              <div
                onClick={() => document.getElementById("qr-receipt-upload")?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                  receiptPreview
                    ? "border-primary bg-primary/5"
                    : "border-slate-800 hover:border-slate-700 bg-slate-950/60"
                }`}
              >
                <input
                  id="qr-receipt-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {receiptPreview ? (
                  <div className="space-y-2">
                    <img
                      src={receiptPreview}
                      alt="Receipt preview"
                      className="max-h-36 mx-auto rounded-lg object-contain shadow-md"
                    />
                    <div className="text-[10px] font-mono text-primary font-bold uppercase">
                      Tap to replace screenshot
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 py-2">
                    <Upload size={22} className="text-text-muted mx-auto mb-1" />
                    <div className="text-xs font-mono font-bold text-slate-300">
                      Upload Confirmation Screenshot
                    </div>
                    <div className="text-[10px] font-mono text-text-muted">
                      PNG, JPG up to 5MB
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || isGenerating || !user}
              className="w-full py-4 px-5 bg-primary hover:bg-primary-dark disabled:opacity-40 text-white font-mono font-black uppercase tracking-[0.2em] text-xs sm:text-sm rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 italic cursor-pointer min-h-[48px]"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Recording Settlement...
                </>
              ) : (
                <>
                  Confirm Settlement <ArrowRight size={16} />
                </>
              )}
            </button>

            {!user && (
              <p className="text-[10px] font-mono text-center text-primary font-bold uppercase tracking-wider">
                Please login with Google or your Subscriber Account to record settlements.
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
export default PaymentSection;
