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
  ShieldCheck,
  Upload,
  ArrowRight,
  Zap,
  Info,
  Check,
  Eye,
  ImageIcon,
  Send,
  X,
  Sparkles,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "./FirebaseProvider";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, addDoc, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import QRCode from "qrcode";
import { InternetPlan, PaymentRecord } from "../types";
import { OFFICIAL_PAYMONGO_STATIC_QR } from "../lib/paymongoStaticQR";

interface PayMongoQRData {
  id: string;
  payment_intent_id?: string;
  checkout_url?: string;
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
  notes?: string;
  created_at: string;
  expires_at: string | null;
  qr_string: string;
  qr_image: string; // Base64 data URL
}

interface PaymentSectionProps {
  plans: InternetPlan[];
  selectedPlan: InternetPlan | null;
  onSuccess?: () => void;
  onSelectPlan?: (plan: InternetPlan) => void;
}

// Global Static QR Ph Cache & in-flight promise (Guarantees minimal requests)
let cachedClientStaticQR: PayMongoQRData | null = OFFICIAL_PAYMONGO_STATIC_QR;
let staticQrInFlightPromise: Promise<PayMongoQRData | null> | null = null;

export function PaymentSection({
  plans,
  selectedPlan,
  onSuccess,
  onSelectPlan,
}: PaymentSectionProps) {
  const { user, profile } = useAuth();

  // Selected plan state
  const [activePlan, setActivePlan] = useState<InternetPlan | null>(
    selectedPlan || null
  );

  const [accountNumber, setAccountNumber] = useState(
    profile?.accountNumber || (user ? `HF-${user.uid.substring(0, 8).toUpperCase()}` : "HF-GUEST")
  );

  const [amount, setAmount] = useState<number>(
    selectedPlan ? selectedPlan.price : 1000
  );

  // PayMongo Static QR State
  const [qrData, setQrData] = useState<PayMongoQRData | null>(OFFICIAL_PAYMONGO_STATIC_QR);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Settlement Form State
  const [customerRefNumber, setCustomerRefNumber] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState<PaymentRecord | null>(null);
  const [viewingProof, setViewingProof] = useState<string | null>(null);

  // UI helpers
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // 10-minute countdown timer (600 seconds)
  const [timeLeft, setTimeLeft] = useState<number>(600);
  const [isExpired, setIsExpired] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Start / Reset 10-minute timer whenever activePlan changes
  useEffect(() => {
    if (activePlan) {
      setTimeLeft(600);
      setIsExpired(false);

      if (timerRef.current) clearInterval(timerRef.current);

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
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activePlan]);

  // Sync selected plan changes and always scroll to top
  useEffect(() => {
    if (selectedPlan) {
      setActivePlan(selectedPlan);
      setAmount(selectedPlan.price);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setActivePlan(null);
    }
  }, [selectedPlan]);

  // Scroll to top whenever active plan changes
  useEffect(() => {
    if (activePlan) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activePlan]);

  // Sync account number
  useEffect(() => {
    if (profile?.accountNumber) {
      setAccountNumber(profile.accountNumber);
    } else if (user?.uid) {
      setAccountNumber(`HF-${user.uid.substring(0, 8).toUpperCase()}`);
    }
  }, [profile, user]);

  // Generate Official PayMongo Static QR Ph
  const generateQRPh = async (forceRefresh: boolean = false) => {
    if (cachedClientStaticQR && !forceRefresh) {
      setQrData(cachedClientStaticQR);
      setIsGenerating(false);
      setGenerationError(null);
      return;
    }

    if (forceRefresh) {
      cachedClientStaticQR = null;
    }

    if (staticQrInFlightPromise) {
      setIsGenerating(true);
      try {
        const inFlightResult = await staticQrInFlightPromise;
        if (inFlightResult) {
          setQrData(inFlightResult);
          setIsGenerating(false);
          setGenerationError(null);
          return;
        }
      } catch {
        // continue
      }
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const effectiveAccount = accountNumber || (user ? `HF-${user.uid.substring(0, 8).toUpperCase()}` : "HF-CUSTOMER");
      const payload = {
        mode: "static",
        is_static: true,
        accountNumber: effectiveAccount,
        mobile_number: "+639122367040",
        notes: "HOTFAST PH Static Merchant QR",
      };

      let newQrData: PayMongoQRData | null = null;

      staticQrInFlightPromise = (async () => {
        try {
          const resp = await fetch("/api/paymongo/static", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await resp.json().catch(() => null);
          if (data?.success && data?.data?.qr_image) {
            return data.data as PayMongoQRData;
          }
        } catch (err: any) {
          console.warn("Static QR Ph fetch notice:", err?.message || err);
        }
        return null;
      })();

      newQrData = await staticQrInFlightPromise;
      staticQrInFlightPromise = null;
      if (newQrData) {
        cachedClientStaticQR = newQrData;
      }

      // Fallback to verified authentic PayMongo Static QR if fetch returned empty
      if (!newQrData || !newQrData.qr_image) {
        newQrData = OFFICIAL_PAYMONGO_STATIC_QR;
        cachedClientStaticQR = OFFICIAL_PAYMONGO_STATIC_QR;
      }

      setQrData(newQrData);
      setGenerationError(null);
    } catch (err: any) {
      console.warn("Static QR Ph network notice, activating authentic PayMongo QR:", err);
      setQrData(OFFICIAL_PAYMONGO_STATIC_QR);
      cachedClientStaticQR = OFFICIAL_PAYMONGO_STATIC_QR;
      setGenerationError(null);
    } finally {
      setIsGenerating(false);
    }
  };

  // Initial generation when component mounts
  useEffect(() => {
    if (activePlan) {
      generateQRPh();
    }
  }, []);

  // Format time remaining MM:SS
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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
      toast.success(`${label} copied!`, {
        description: `"${text}" is now in your clipboard.`,
        duration: 2500,
      });
      setTimeout(() => setCopiedField(null), 2500);
    } catch {
      toast.error("Could not copy automatically. Please copy manually.");
    }
  };

  // Download QR Code image with friendly mobile instructions
  const handleDownloadQR = async () => {
    if (!qrData?.qr_image) {
      toast.error("QR image is still loading. Please wait a moment.");
      return;
    }

    try {
      const fileName = `HOTFAST-QRPh-P${amount}-${accountNumber || "Subscriber"}.png`;
      if (qrData.qr_image.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = qrData.qr_image;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        try {
          const resp = await fetch(qrData.qr_image);
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch {
          const fallbackQr = await QRCode.toDataURL(qrData.qr_string || `HOTFAST-${amount}`, { width: 500, margin: 2 });
          const link = document.createElement("a");
          link.href = fallbackQr;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }

      toast.success("QR Code saved to your photos!", {
        description: "Open GCash or Maya > tap 'QR' > select 'Upload from Gallery' to pay without a second screen.",
        duration: 6000,
      });
    } catch (err) {
      console.error("Failed to download QR:", err);
      toast.error("Failed to save image. You can take a screenshot of the QR code instead.");
    }
  };

  // File upload for receipt with automatic downscaling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        const rawResult = reader.result as string;
        try {
          const img = new Image();
          img.onload = () => {
            const maxDim = 1200;
            let width = img.width;
            let height = img.height;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              const compressed = canvas.toDataURL("image/jpeg", 0.82);
              setReceiptPreview(compressed);
            } else {
              setReceiptPreview(rawResult);
            }
          };
          img.onerror = () => {
            setReceiptPreview(rawResult);
          };
          img.src = rawResult;
        } catch {
          setReceiptPreview(rawResult);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit Settlement Confirmation to Firestore
  const handleSubmitSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in first to submit your payment.");
      return;
    }

    if (!receiptPreview) {
      toast.error("Receipt screenshot required", {
        description: "Please attach a screenshot of your successful transfer so our team can verify it.",
      });
      return;
    }

    setIsSubmitting(true);
    const paymentsPath = `users/${user.uid}/payments`;

    try {
      const refNumber =
        customerRefNumber.trim() ||
        (qrData ? qrData.id : `QRPH-${Date.now().toString(36).toUpperCase()}`);

      const customerName =
        profile?.displayName || user.displayName || user.email?.split("@")[0] || "Subscriber";

      const methodLabel = "QR Ph (PayMongo)";

      // Attempt uploading receipt proof to Vercel Blob CDN if image was selected
      let uploadedScreenshotUrl = receiptPreview || "";
      if (receiptPreview && receiptPreview.startsWith("data:")) {
        try {
          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              base64Data: receiptPreview,
              filename: `receipt_${accountNumber || "proof"}_${Date.now()}.jpg`,
            }),
          });
          if (uploadRes.ok) {
            const uploadJson = await uploadRes.json();
            if (uploadJson?.url) {
              uploadedScreenshotUrl = uploadJson.url;
            }
          }
        } catch (uploadErr) {
          console.warn("Vercel Blob upload fallback to base64 preview:", uploadErr);
        }
      }

      const paymentData = {
        userId: user.uid,
        customerName,
        accountNumber,
        amount: Number(amount),
        method: methodLabel,
        status: "pending",
        referenceNumber: refNumber,
        qrId: qrData?.id || "",
        qrString: qrData?.qr_string || "",
        screenshotUrl: uploadedScreenshotUrl || "",
        planName: activePlan?.name || "Fiber Internet Plan",
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, paymentsPath), paymentData);

      try {
        await updateDoc(doc(db, "users", user.uid), {
          payment_status: "processing",
        });
      } catch (e) {
        console.warn("Could not set user payment_status to processing:", e);
      }

      // Dispatch real-time Telegram Bot Notification to Admin
      try {
        fetch("/api/telegram/payment-settlement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId: docRef.id,
            userId: user.uid,
            customerName,
            accountNumber,
            clientId: profile?.clientId || undefined,
            amount: Number(amount),
            method: methodLabel,
            referenceNumber: refNumber,
            planName: activePlan?.name || "Fiber Internet Plan",
            screenshotUrl: uploadedScreenshotUrl || undefined,
            submittedAt: new Date().toISOString(),
          }),
        }).catch((err) => {
          console.warn("Telegram settlement notification dispatch notice:", err);
        });
      } catch (tgError) {
        console.warn("Could not dispatch Telegram alert:", tgError);
      }

      const record: PaymentRecord = {
        id: docRef.id,
        userId: user.uid,
        customerName,
        accountNumber,
        amount: Number(amount),
        method: "QR Ph (PayMongo)",
        status: "pending",
        referenceNumber: refNumber,
        qrId: qrData?.id,
        qrString: qrData?.qr_string,
        screenshotUrl: uploadedScreenshotUrl || undefined,
        planName: activePlan?.name,
        createdAt: new Date(),
      };

      setSubmittedRecord(record);
      setIsSubmitted(true);
      toast.success("Payment submitted successfully!", {
        description: "Our operations team is now verifying your transfer. We'll update your account shortly!",
        duration: 5000,
      });
    } catch (err: any) {
      console.error("Settlement submission error:", err);
      handleFirestoreError(err, OperationType.CREATE, paymentsPath);
      toast.error("Failed to submit payment proof. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // Screen A: Submitted Confirmation Screen (Friendly, Reassuring, Clear)
  // =========================================================================
  if (isSubmitted && submittedRecord) {
    return (
      <section className="py-10 sm:py-16 px-4 sm:px-6 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 border border-emerald-500/30 p-6 sm:p-10 rounded-3xl shadow-2xl relative overflow-hidden"
        >
          {/* Subtle soft backdrop glow */}
          <div className="absolute -top-16 -right-16 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Friendly Success Icon & Heading */}
          <div className="text-center space-y-3 mb-8">
            <div className="w-16 h-16 bg-emerald-500/15 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-500/10">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-full mb-2">
                <Sparkles size={12} /> Payment Received for Verification
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Thank you! Your payment is under review
              </h2>
              <p className="text-sm text-text-muted mt-2 max-w-md mx-auto leading-relaxed">
                We've received your receipt for <strong className="text-white">₱{submittedRecord.amount.toLocaleString()}</strong>. Our team typically verifies transfers within <strong className="text-emerald-400">5 to 15 minutes</strong>.
              </p>
            </div>
          </div>

          {/* Friendly 3-Step Verification Timeline */}
          <div className="mb-6 p-4 bg-slate-950/70 border border-slate-800 rounded-2xl">
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 px-1">
              What happens next?
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <div className="w-5 h-5 bg-emerald-500 text-slate-950 rounded-full flex items-center justify-center text-[10px] font-bold mx-auto mb-1">
                  ✓
                </div>
                <div className="text-[11px] font-bold text-emerald-400">Submitted</div>
                <div className="text-[10px] text-text-muted">Receipt sent</div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 animate-pulse">
                <div className="w-5 h-5 bg-amber-500 text-slate-950 rounded-full flex items-center justify-center text-[10px] font-bold mx-auto mb-1">
                  2
                </div>
                <div className="text-[11px] font-bold text-amber-400">Verifying</div>
                <div className="text-[10px] text-text-muted">~5-15 mins</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <div className="w-5 h-5 bg-slate-800 text-slate-400 rounded-full flex items-center justify-center text-[10px] font-bold mx-auto mb-1">
                  3
                </div>
                <div className="text-[11px] font-bold text-slate-400">Activated</div>
                <div className="text-[10px] text-text-muted">Plan renewed</div>
              </div>
            </div>
          </div>

          {/* Receipt Screenshot Preview (Collapsible / Tap to view) */}
          {submittedRecord.screenshotUrl && (
            <div className="mb-6 bg-slate-950/80 border border-slate-800 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-xs text-text-muted font-medium mb-2.5">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <ImageIcon size={14} className="text-emerald-400" /> Attached Transfer Receipt
                </span>
                <button
                  type="button"
                  onClick={() => setViewingProof(submittedRecord.screenshotUrl || null)}
                  className="text-primary hover:text-primary-light flex items-center gap-1 transition-colors cursor-pointer text-xs"
                >
                  <Eye size={13} /> View full receipt
                </button>
              </div>
              <div
                onClick={() => setViewingProof(submittedRecord.screenshotUrl || null)}
                className="cursor-pointer group relative overflow-hidden rounded-xl border border-slate-800/80 bg-black/40 max-h-40 flex items-center justify-center"
              >
                <img
                  src={submittedRecord.screenshotUrl}
                  alt="Uploaded receipt"
                  className="max-h-40 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold">
                  <Eye size={15} /> Tap to expand
                </div>
              </div>
            </div>
          )}

          {/* Clean Payment Summary Card */}
          <div className="bg-slate-950/80 border border-slate-800 p-5 rounded-2xl space-y-3 text-xs">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-800">
              <span className="text-text-muted">Amount Paid</span>
              <span className="text-base font-black text-white">
                ₱{submittedRecord.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-800">
              <span className="text-text-muted">Account Number</span>
              <span className="font-semibold text-primary">{submittedRecord.accountNumber}</span>
            </div>
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-800">
              <span className="text-text-muted">Plan</span>
              <span className="font-semibold text-white">{submittedRecord.planName || activePlan?.name}</span>
            </div>
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-800">
              <span className="text-text-muted">Payment Method</span>
              <span className="font-semibold text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                QR Ph (GCash/Maya/Bank)
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Reference Number</span>
              <span className="font-mono text-slate-300">{submittedRecord.referenceNumber}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => {
                setIsSubmitted(false);
                setSubmittedRecord(null);
                setReceiptPreview(null);
                setReceiptFile(null);
                setCustomerRefNumber("");
                generateQRPh();
              }}
              className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-colors text-center cursor-pointer order-2 sm:order-1"
            >
              Make Another Payment
            </button>
            <button
              type="button"
              onClick={() => {
                if (onSuccess) onSuccess();
              }}
              className="flex-1 py-3 px-5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all text-center flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/25 order-1 sm:order-2"
            >
              Go to My Subscriber Portal <ArrowRight size={14} />
            </button>
          </div>
        </motion.div>

        {/* Lightbox for Viewing Proof Screenshot */}
        <AnimatePresence>
          {viewingProof && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
              onClick={() => setViewingProof(null)}
            >
              <div className="relative max-w-3xl w-full max-h-[90vh] flex flex-col items-center">
                <button
                  onClick={() => setViewingProof(null)}
                  className="absolute -top-10 right-0 text-white hover:text-primary transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <X size={16} /> Close
                </button>
                <img
                  src={viewingProof}
                  alt="Receipt expanded"
                  className="max-h-[85vh] w-auto max-w-full rounded-2xl border border-slate-700 shadow-2xl object-contain"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    );
  }

  // =========================================================================
  // Screen B: Tier Selector (When activePlan is not yet selected)
  // =========================================================================
  if (!activePlan) {
    return (
      <section className="py-8 sm:py-14 px-4 sm:px-6 max-w-6xl mx-auto animate-in fade-in duration-300">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/30 rounded-full text-xs font-semibold text-primary mb-3">
            <Sparkles size={13} /> Step 1: Choose Your Plan
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight">
            Select Your Fiber Internet Plan
          </h2>
          <p className="text-sm text-text-muted mt-2 max-w-xl mx-auto">
            Choose a plan to continue to the easy QR Ph payment page. You can pay using GCash, Maya, or any Philippine bank.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-slate-900/90 border rounded-3xl p-6 flex flex-col justify-between transition-all hover:border-primary/60 hover:shadow-xl hover:shadow-primary/5 ${
                plan.isPopular ? "border-primary/60 shadow-lg shadow-primary/10" : "border-slate-800"
              }`}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[11px] font-bold px-3 py-0.5 rounded-full shadow-md">
                  Most Popular
                </div>
              )}

              <div>
                <div className="text-text-muted text-xs font-semibold tracking-wider uppercase mb-1">
                  {plan.name}
                </div>
                <div className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-1">
                  {plan.speed} <span className="text-base font-normal text-text-muted">Mbps</span>
                </div>
                <div className="text-xs font-semibold text-primary mb-4 flex items-center gap-1.5">
                  <Zap size={13} /> Unlimited Fiber Internet
                </div>

                <div className="space-y-2 mb-6 border-t border-slate-800 pt-4">
                  {plan.features.slice(0, 4).map((feat, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-slate-300">
                      <Check size={13} className="text-emerald-400 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-800">
                <div className="text-2xl font-black text-white mb-4">
                  ₱{plan.price.toLocaleString()}{" "}
                  <span className="text-xs font-normal text-text-muted">/ month</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActivePlan(plan);
                    setAmount(plan.price);
                    if (onSelectPlan) onSelectPlan(plan);
                    generateQRPh();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`w-full py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    plan.isPopular
                      ? "bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/25"
                      : "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 hover:border-primary/40"
                  }`}
                >
                  <span>Select &amp; Pay</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // =========================================================================
  // Screen C: Main Friendly QR Ph Payment & Verification Interface
  // =========================================================================
  return (
    <section 
      style={{ height: "885.656px" }}
      className="py-6 sm:py-10 md:py-14 px-4 sm:px-6 max-w-5xl mx-auto"
    >
      {/* Friendly Stepper Header */}
      <div className="mb-6 sm:mb-8">
        <div 
          style={{ height: "83px" }}
          className="pb-4 border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-3"
        >
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-xs font-semibold text-emerald-400 mb-2">
              <ShieldCheck size={13} /> Secure National QR Ph Payment
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Pay Your Internet Bill
            </h2>
            <p className="text-xs sm:text-sm text-text-muted mt-1 max-w-lg">
              Scan or upload the QR code using GCash, Maya, or any Philippine banking app.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setActivePlan(null);
              if (onSelectPlan) onSelectPlan(null as any);
              toast.info("Please pick a plan from the list.");
            }}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Change selected plan"
          >
            <X size={13} className="text-text-muted" />
            <span>Change Plan</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: QR Code Display Card */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col justify-between">
          <div>
            {/* Card Header */}
            <div 
              style={{ height: "4.5px" }}
              className="flex items-center justify-between pb-4 border-b border-slate-800 overflow-hidden"
            >
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  National QR Ph Code
                </span>
              </div>
              <span className="text-[11px] text-text-muted font-medium">
                Official PayMongo Gateway
              </span>
            </div>

            {/* Small Session Countdown Timer above QR Ph */}
            <div className="flex items-center justify-center pt-3 pb-1">
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-medium ${
                  isExpired
                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                    : timeLeft <= 120
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse"
                    : "bg-slate-950/80 border-slate-800 text-slate-300"
                }`}
                title="Session countdown timer"
              >
                <Clock size={11} className={isExpired ? "text-red-400" : "text-primary"} />
                <span>Session: {isExpired ? "Expired" : formatTime(timeLeft)}</span>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => {
                    generateQRPh(true);
                    setTimeLeft(600);
                    setIsExpired(false);
                    toast.success("Session refreshed");
                  }}
                  className="ml-0.5 text-text-muted hover:text-white transition-colors cursor-pointer"
                  title="Refresh timer"
                >
                  <RefreshCw size={10} className={isGenerating ? "animate-spin text-primary" : ""} />
                </button>
              </div>
            </div>

            {/* QR Code Presentation Box */}
            <div className="my-5 flex flex-col items-center justify-center">
              <div 
                style={{ height: "283px" }}
                className="relative p-4 sm:p-5 bg-white rounded-2xl shadow-xl max-w-[260px] sm:max-w-[280px] w-full aspect-square flex items-center justify-center"
              >
                {/* QR Ph Badge */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-700 px-3 py-0.5 rounded-full shadow flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                    QR Ph Standard
                  </span>
                </div>

                {isGenerating ? (
                  <div className="flex flex-col items-center justify-center text-slate-800 space-y-2 p-6 text-center">
                    <RefreshCw className="animate-spin text-primary" size={32} />
                    <span className="text-xs font-semibold text-slate-600">
                      Loading QR Code...
                    </span>
                  </div>
                ) : generationError ? (
                  <div className="flex flex-col items-center justify-center text-red-600 space-y-2 p-3 text-center">
                    <AlertTriangle size={28} />
                    <span className="text-xs font-bold">Failed to load QR</span>
                    <button
                      type="button"
                      onClick={() => generateQRPh(true)}
                      className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
                    >
                      Retry
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
                    <QrCode size={40} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500">
                      Generating Code...
                    </span>
                  </div>
                )}
              </div>

              {/* Amount & Copy Controls */}
              <div className="mt-5 text-center space-y-2 w-full">
                <div className="text-xs font-medium text-text-muted">
                  Amount to Transfer
                </div>
                <div className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-center justify-center gap-2">
                  <span>₱{amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(amount.toFixed(2), "Amount")}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-text-muted hover:text-white rounded-lg transition-colors cursor-pointer"
                    title="Copy exact amount"
                  >
                    {copiedField === "Amount" ? (
                      <Check size={14} className="text-emerald-400" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>

                {/* Account Reference with quick copy */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                  <span className="text-text-muted">Account Ref:</span>
                  <strong className="text-white font-mono">{accountNumber}</strong>
                  <button
                    type="button"
                    onClick={() => handleCopy(accountNumber, "Account Number")}
                    className="text-text-muted hover:text-white transition-colors cursor-pointer p-0.5"
                    title="Copy Account Reference"
                  >
                    {copiedField === "Account Number" ? (
                      <Check size={13} className="text-emerald-400" />
                    ) : (
                      <Copy size={13} />
                    )}
                  </button>
                </div>

                {/* Supported Wallets & Banks Badges Below QR Ph */}
                <div className="pt-2.5 flex flex-wrap items-center justify-center gap-1.5 text-xs">
                  <span className="text-text-muted font-medium text-[11px] mr-0.5">Supported:</span>
                  <span className="font-bold text-sky-400 bg-sky-400/10 border border-sky-400/20 px-2 py-0.5 rounded-md text-[11px]">GCash</span>
                  <span className="font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-md text-[11px]">Maya</span>
                  <span className="font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-md text-[11px]">BDO / BPI</span>
                  <span className="font-bold text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md text-[11px]">+40 Banks</span>
                </div>
              </div>
            </div>
          </div>

          {/* Friendly Action: Save QR Button */}
          <div className="pt-2">
            <button
              type="button"
              disabled={!qrData?.qr_image || isGenerating}
              onClick={handleDownloadQR}
              className="w-full py-3.5 px-4 bg-primary hover:bg-primary-dark disabled:opacity-40 text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-primary/20"
            >
              <Download size={15} />
              <span>Save QR to Photos / Phone</span>
            </button>
            <p className="text-[11px] text-center text-text-muted mt-2">
              💡 On mobile? Save the QR image, then open GCash/Maya &gt; tap QR &gt; select "Upload from Photos".
            </p>
          </div>
        </div>

        {/* Right Column: Upload Proof & Submit Form */}
        <div className="lg:col-span-6">
          <form
            onSubmit={handleSubmitSettlement}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5"
          >
            {/* Form Header */}
            <div className="pb-4 border-b border-slate-800">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold rounded-full mb-1">
                <CheckCircle size={12} /> Step 2: Upload Receipt
              </div>
              <h3 className="text-lg font-bold text-white">
                Confirm Your Payment
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Attach a screenshot of your successful GCash, Maya, or Bank transfer. Our team will verify and renew your internet plan.
              </p>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Payment Screenshot / Receipt</span>
                <span className="text-emerald-400 text-[11px] font-medium">Required</span>
              </label>

              <div
                onClick={() => document.getElementById("qr-receipt-upload")?.click()}
                className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                  receiptPreview
                    ? "border-emerald-500/70 bg-emerald-500/5"
                    : "border-slate-800 hover:border-slate-700 bg-slate-950/70"
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
                      className="max-h-40 mx-auto rounded-xl object-contain shadow-lg border border-emerald-500/30"
                    />
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                        <Check size={13} /> Screenshot attached
                      </span>
                      <span className="text-text-muted text-xs">·</span>
                      <span className="text-xs text-primary hover:underline font-medium">
                        Tap to replace
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 py-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                      <Upload size={22} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        Tap to upload your payment screenshot
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        PNG, JPG, or screenshot up to 5MB
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Optional Reference Number */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Reference / Transaction Number</span>
                <span className="text-text-muted text-[11px]">Optional</span>
              </label>
              <input
                type="text"
                value={customerRefNumber}
                onChange={(e) => setCustomerRefNumber(e.target.value)}
                placeholder="e.g. 10023489123 or leave blank if on screenshot"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary transition-colors font-mono"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || isGenerating || !user}
              className="w-full py-4 px-5 bg-primary hover:bg-primary-dark disabled:opacity-40 text-white font-bold text-sm rounded-2xl transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Submitting Receipt...</span>
                </>
              ) : (
                <>
                  <span>Submit Payment Proof</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {/* Reassurance Info Box */}
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1 text-xs text-text-muted">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <Clock size={13} className="text-emerald-400" />
                <span>Fast Verification (~5-15 mins)</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                An operations administrator will verify your transfer and update your connection status. Need urgent help? Chat with us anytime!
              </p>
            </div>

            {!user && (
              <p className="text-xs text-center text-primary font-semibold">
                Please sign in to your Hotfast account to record payments.
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

export default PaymentSection;
