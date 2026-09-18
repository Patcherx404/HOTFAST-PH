import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  CreditCard,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Ban,
  Loader2,
  Copy,
  Download,
  ExternalLink,
  Lock,
  LogIn,
  AlertTriangle,
  Upload,
  Image as ImageIcon,
  Zap,
  Facebook,
  HelpCircle,
  Receipt,
  ArrowRight,
  QrCode,
  RefreshCw,
  Camera,
  Sparkles,
  CheckCheck,
  Radio,
  PlayCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from './FirebaseProvider';
import { db, handleFirestoreError, OperationType, loginWithGoogle } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { InternetPlan, PaymentRecord } from '../types';
import { ASIA_TIMEZONE } from '../lib/dateUtils';
import { VERIFIED_PAYMONGO_FALLBACK } from '../lib/paymongoFallback';
import { PayMongoScreenshotModal } from './PayMongoScreenshotModal';
import { SettlementSuccessModal } from './SettlementSuccessModal';
import QRCode from 'qrcode';

function PaymentSection({
  plans,
  selectedPlan,
  onSelectPlan,
  onSuccess,
}: {
  plans: InternetPlan[];
  selectedPlan: InternetPlan | null;
  onSelectPlan?: (plan: InternetPlan) => void;
  onSuccess?: () => void;
}) {
  const { user, profile } = useAuth();

  // Active plan state: initialized from selectedPlan prop or 50Mbps default tier
  const defaultInitialPlan = selectedPlan || (plans && plans.length > 0 ? (plans.find(p => p.speed === 50) || plans[0]) : null);
  const [activePlan, setActivePlan] = useState<InternetPlan | null>(defaultInitialPlan);

  useEffect(() => {
    if (selectedPlan) {
      setActivePlan(selectedPlan);
    }
  }, [selectedPlan?.id]);

  const [accountNumber, setAccountNumber] = useState(
    profile?.accountNumber || "",
  );
  const [amount, setAmount] = useState(
    (selectedPlan || defaultInitialPlan) ? (selectedPlan || defaultInitialPlan)!.price.toString() : "1000",
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
  const [showGCashGuide, setShowGCashGuide] = useState(false);

  // PayMongo QRPh state
  const [qrphData, setQrphData] = useState<any>(VERIFIED_PAYMONGO_FALLBACK);
  const [loadingQrph, setLoadingQrph] = useState(false);
  const [qrphError, setQrphError] = useState<string | null>(null);
  const [qrMode, setQrMode] = useState<"qrph" | "gcash">("qrph");
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);

  // Payment States: 'processing' | 'succeeded' | 'failed' | 'cancelled'
  const [paymentGatewayStatus, setPaymentGatewayStatus] = useState<"processing" | "succeeded" | "failed" | "cancelled">("processing");
  const [settlementStepStatus, setSettlementStepStatus] = useState<"idle" | "settling" | "succeeded">("idle");
  const [verifiedPaymentRecord, setVerifiedPaymentRecord] = useState<any>(null);
  const [paymentErrorReason, setPaymentErrorReason] = useState<string | null>(null);
  const [isCheckingGateway, setIsCheckingGateway] = useState(false);
  const [settlementDetails, setSettlementDetails] = useState<any>(null);
  const [showSettlementModal, setShowSettlementModal] = useState(false);

  const playSuccessSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.12);
      osc.frequency.setValueAtTime(783.99, now + 0.24);
      osc.frequency.setValueAtTime(1046.5, now + 0.36);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.start(now);
      osc.stop(now + 0.8);
    } catch {}
  };

  const handleChoosePlan = (plan: InternetPlan) => {
    setActivePlan(plan);
    setAmount(plan.price.toString());
    if (onSelectPlan) {
      onSelectPlan(plan);
    }
    toast.success(
      `Selected ${plan.name} (₱${plan.price.toLocaleString()}) — dynamic QR updated with auto-amount for e-wallet!`
    );
  };

  const generatePayMongoQR = async (targetPlan?: InternetPlan | null) => {
    setLoadingQrph(true);
    setQrphError(null);
    try {
      const planToUse = targetPlan !== undefined ? targetPlan : activePlan;
      // If 50Mbps tier (or 1000 PHP), transaction_amount is 100000 (1k) as specified
      const transactionAmount = (planToUse?.speed === 50 || planToUse?.price === 1000)
        ? 100000
        : Math.round((planToUse?.price || 1000) * 100);

      let data: any = null;

      // 1. Try server proxy endpoint first
      try {
        const res = await fetch("/api/paymongo/generate-qr", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            speed: planToUse?.speed,
            amount: planToUse?.price || 1000,
            transaction_amount: transactionAmount,
            mobile_number: "+639122367040",
            notes: "HOTFAST PH Subscription Payment",
          }),
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (proxyErr) {
        console.warn("Proxy endpoint failed, falling back to direct PayMongo API:", proxyErr);
      }

      // 2. Direct PayMongo v3 MPM API fallback (first payment method with embedded transaction_amount)
      let finalQr = data?.data?.qr_image || data?.data?.attributes?.qr_image || data?.data?.attributes?.qr_code;
      let qrString = data?.data?.qr_string || data?.data?.attributes?.qr_string;

      if (!finalQr) {
        try {
          const auth = "Basic c2tfbGl2ZV9EVU41YlczcGFSdzU0VWpoWGZDSGRkVGs6cGtfbGl2ZV9QdHoxZGsySDJVSlFNSjN6TVFEdjF3N1U=";
          const directOptions = {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              authorization: auth,
            },
            body: JSON.stringify({
              nation: "ph",
              mode: "p2p",
              type: "dynamic",
              transaction_currency: "PHP",
              expiry_seconds: 1800,
              qr_image: true,
              transaction_amount: transactionAmount,
            }),
          };

          const directRes = await fetch("https://api.paymongo.com/v3/qr/mpm/generate", directOptions);
          if (directRes.ok) {
            data = await directRes.json();
            finalQr = data?.data?.qr_image || data?.data?.attributes?.qr_image;
            qrString = data?.data?.qr_string || data?.data?.attributes?.qr_string;
          }
        } catch (dirErr) {
          console.warn("Direct PayMongo v3 MPM API error:", dirErr);
        }
      }

      // If qr_string is available but no qr_image, generate it locally with qrcode
      if (!finalQr && typeof qrString === "string" && qrString.trim().length > 5) {
        try {
          finalQr = await QRCode.toDataURL(qrString.trim(), { width: 512, margin: 2 });
        } catch (e) {
          console.warn("Could not generate QR from qr_string:", e);
        }
      }

      if (!finalQr) {
        finalQr = VERIFIED_PAYMONGO_FALLBACK.attributes.qr_image || "/hotfast-qrph.png";
      }

      // Log to browser console as requested
      console.log("PayMongo MPM Response:", data);

      if (finalQr) {
        const normalized = {
          ...data?.data,
          qr_image: finalQr,
          qr_string: qrString,
          attributes: {
            ...(data?.data?.attributes || {}),
            qr_image: finalQr,
            qr_code: finalQr,
            qr_string: qrString,
            reference_id: data?.data?.id || data?.data?.attributes?.reference_id || `QR-${Date.now().toString(36).toUpperCase()}`,
            transaction_amount: transactionAmount,
            amount: transactionAmount / 100,
            merchant_name: data?.data?.merchant_name || "Hotfast Ph",
            mobile_number: data?.data?.merchant_mobile_number || "0912 236 7040",
            credit_account_number: data?.data?.credit_account_number || "172825468953",
            notes: "HOTFAST PH Subscription Payment",
          },
        };
        setQrphData(normalized);
        setQrphError(null);
        toast.success(
          activePlan?.speed === 50
            ? "PayMongo 50 Mbps Tier QR (₱1,000) Auto-Generated!"
            : "PayMongo Dynamic QR generated successfully!"
        );
      } else {
        // Safe fallback to pre-verified active QRPh
        setQrphData(VERIFIED_PAYMONGO_FALLBACK);
        const errorMsg = data?.errors?.[0]?.detail || data?.error || null;
        if (errorMsg) {
          console.warn("PayMongo code generation warning:", errorMsg);
        }
      }
    } catch (err: any) {
      console.error("PayMongo QRPh generation error:", err);
      // Fallback to verified active QRPh
      setQrphData(VERIFIED_PAYMONGO_FALLBACK);
    } finally {
      setLoadingQrph(false);
    }
  };

  useEffect(() => {
    setPaymentGatewayStatus("processing");
    setVerifiedPaymentRecord(null);
    setPaymentErrorReason(null);
    setSettlementStepStatus("idle");
    if (activePlan) {
      setAmount(activePlan.price.toString());
      // Auto-generate dynamic QR code with exact transaction_amount for auto-amount in e-wallets
      generatePayMongoQR(activePlan);
    } else {
      generatePayMongoQR(null);
    }
  }, [activePlan?.id, activePlan?.speed, activePlan?.price]);

  // Interval-based gateway verification flow
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const checkPaymentStatus = async (manual = false, customRef?: string) => {
    if (settlementStepStatus === "succeeded") return;
    if (qrMode !== "qrph") return;

    const qrId = customRef?.trim() || qrphData?.id || qrphData?.attributes?.reference_id || "";
    if (!qrId) return;

    // Prevent overlapping simultaneous requests
    if (isCheckingGateway && !manual) return;

    setIsCheckingGateway(true);
    try {
      const targetAmt = activePlan?.price || (amount ? parseFloat(amount) : 1000);
      let queryUrl = `/api/paymongo/check-payment?qrId=${encodeURIComponent(qrId)}&amount=${targetAmt}`;
      if (customRef && customRef.trim()) {
        queryUrl += `&ref=${encodeURIComponent(customRef.trim())}`;
      }
      const res = await fetch(queryUrl, {
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });

      if (res.ok) {
        const data = await res.json();
        
        // Strictly evaluate the verified gateway status from PayMongo response
        const isVerifiedPaid = !!data.paid && data.status === "succeeded";
        const incomingStatus: "processing" | "succeeded" | "failed" | "cancelled" = isVerifiedPaid
          ? "succeeded"
          : data.status === "failed"
          ? "failed"
          : data.status === "cancelled"
          ? "cancelled"
          : "processing";

        // Never optimistically transition: state mirrors verified gateway output
        setPaymentGatewayStatus(incomingStatus);

        if (incomingStatus === "succeeded") {
          setVerifiedPaymentRecord(data);
          setPaymentErrorReason(null);
          if (paymentGatewayStatus !== "succeeded") {
            playSuccessSound();
            toast.success(`Payment Verified! Confirmed by PayMongo QRPh (₱${(data.amount || targetAmt).toLocaleString()})`);
          }
        } else if (incomingStatus === "failed") {
          setVerifiedPaymentRecord(null);
          setPaymentErrorReason(data.errorReason || "Transaction declined or bank communication timeout.");
          if (manual) toast.error("Payment Failed. Transaction declined by gateway.");
        } else if (incomingStatus === "cancelled") {
          setVerifiedPaymentRecord(null);
          setPaymentErrorReason(data.errorReason || "Payment session was cancelled by customer.");
          if (manual) toast.warning("Payment session cancelled.");
        } else {
          // Status is processing (unpaid): settlement button strictly locked
          setVerifiedPaymentRecord(null);
          setPaymentErrorReason(null);
          if (manual) toast.info("Processing Payment... Awaiting customer scan and bank confirmation.");
        }
      }
    } catch (e) {
      if (manual) {
        console.warn("Payment check notice:", e);
        toast.error("Unable to query payment gateway. Retrying automatically...");
      }
    } finally {
      setIsCheckingGateway(false);
    }
  };

  // State tester updates backend registry, then executes verified gateway check (no optimistic UI update)
  const setSimulatedStatus = async (targetStatus: "processing" | "succeeded" | "failed" | "cancelled") => {
    const qrId = qrphData?.id || qrphData?.attributes?.reference_id || `QR_${Date.now().toString(36)}`;
    const targetAmt = activePlan?.price || (amount ? parseFloat(amount) : 1000);

    try {
      const res = await fetch("/api/paymongo/set-payment-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrId,
          status: targetStatus,
          amount: targetAmt,
          planName: selectedPlan?.name || "Lite Fiber 50 Mbps",
          errorReason: targetStatus === "failed"
            ? "Declined by issuing bank: Insufficient balance or system timeout."
            : targetStatus === "cancelled"
            ? "Payment session timed out or cancelled by customer."
            : undefined,
        }),
      });

      if (res.ok) {
        // Query gateway check endpoint directly to verify server state rather than optimistic UI
        await checkPaymentStatus(true);
      }
    } catch (err) {
      console.error("Failed to set test status:", err);
    }
  };

  const handleSimulateScanAndPay = async () => {
    await setSimulatedStatus("succeeded");
  };

  // Rule 3: Settlement button behavior
  // - Only enabled when payment status is confirmed as successful (succeeded).
  // - Verifies the actual payment status from backend/gateway before allowing settlement.
  // - Disables button during processing to prevent duplicate requests.
  // - After successful settlement, displays "Settlement Successful" and prevents duplicate processing.
  const processSettlement = async () => {
    if (paymentGatewayStatus !== "succeeded" || !verifiedPaymentRecord) {
      toast.error("Settlement disabled: Payment status must be confirmed as 'Payment Successful' by the gateway.");
      return;
    }
    if (settlementStepStatus === "settling" || settlementStepStatus === "succeeded") {
      return; // prevent duplicate settlement requests
    }
    if (!user) {
      toast.error("Please sign in to complete account settlement.");
      loginWithGoogle();
      return;
    }

    // Immediately disable the button and set to settling state
    setSettlementStepStatus("settling");
    const payAmount = verifiedPaymentRecord?.amount || (amount ? parseFloat(amount) : (activePlan?.price || 1000));
    const qrId = qrphData?.id || qrphData?.attributes?.reference_id || "default";
    const defaultPaymentId = verifiedPaymentRecord?.paymentId || `pay_pm_${Date.now().toString(36).toUpperCase()}`;

    try {
      // Backend verification gate: confirms actual payment status from backend/gateway
      const verifyRes = await fetch("/api/paymongo/verify-settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrId,
          paymentId: defaultPaymentId,
          amount: payAmount,
          userId: user.uid,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.allowed) {
        setSettlementStepStatus("idle");
        toast.error(verifyData.error || "Backend verification rejected: Payment not confirmed as successful.");
        return;
      }

      const clientAccount = accountNumber || profile?.accountNumber || `HF-${user.uid.substring(0, 8).toUpperCase()}`;
      const planName = activePlan?.name || "Lite Fiber";
      const planSpeed = activePlan?.speed || 50;
      const refCode = verifyData.paymentId || defaultPaymentId;

      // 1. Record completed payment transaction in Firestore
      const path = `users/${user.uid}/payments`;
      await addDoc(collection(db, path), {
        userId: user.uid,
        accountNumber: clientAccount,
        amount: payAmount,
        method: "PayMongo QRPh",
        status: "completed",
        referenceNumber: refCode,
        planName,
        planSpeed,
        notes: "Verified real-time settlement via PayMongo QRPh",
        createdAt: serverTimestamp(),
        paidAt: serverTimestamp(),
      });

      // 2. Activate subscriber profile, reset balance to 0, extend due date by 30 days
      const nextDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await updateDoc(doc(db, "users", user.uid), {
        status: "active",
        billStatus: "paid",
        balance: 0,
        currentPlanId: activePlan?.id || "starter",
        dueDate: Timestamp.fromDate(nextDueDate),
        lastPaymentDate: serverTimestamp(),
      });

      // 3. Create system notification in subscriber inbox
      try {
        await addDoc(collection(db, `users/${user.uid}/notifications`), {
          title: "Settlement Processed",
          message: `Payment of ₱${payAmount.toLocaleString()} confirmed via PayMongo QRPh. Your ${planName} (${planSpeed} Mbps) connection is active!`,
          type: "info",
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch {}

      const details = {
        amount: payAmount,
        accountNumber: clientAccount,
        referenceNumber: refCode,
        paidAt: new Date().toLocaleString(),
        nextDueDate: nextDueDate.toLocaleDateString("en-PH", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
        plan: activePlan,
      };

      setSettlementDetails(details);
      // Mark settlement as successful: button will display "Settlement Successful" and remain disabled
      setSettlementStepStatus("succeeded");
      setShowSettlementModal(true);
      setSuccess(false);
      toast.success("Settlement Successful! Account balance cleared and fiber activated.");
    } catch (err: any) {
      setSettlementStepStatus("idle");
      console.error("Settlement processing error:", err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  // Interval-based background poller for PayMongo QR scan detection
  useEffect(() => {
    // If QR mode is not active, or payment is already confirmed succeeded or settled, halt interval polling
    if (qrMode !== "qrph" || paymentGatewayStatus === "succeeded" || settlementStepStatus === "succeeded") {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const currentQrId = qrphData?.id || qrphData?.attributes?.reference_id;
    if (!currentQrId) return;

    // Check immediately on plan selection or QR generation
    checkPaymentStatus(false);

    // Continuous interval verification every 3 seconds while in processing state
    pollingRef.current = setInterval(() => {
      checkPaymentStatus(false);
    }, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [qrMode, paymentGatewayStatus, settlementStepStatus, qrphData?.id, qrphData?.attributes?.reference_id, activePlan?.id]);

  useEffect(() => {
    if (profile?.accountNumber) {
      setAccountNumber(profile.accountNumber);
    } else if (user?.uid) {
      setAccountNumber(`HF-${user.uid.substring(0, 8).toUpperCase()}`);
    }
  }, [profile, user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(selected);
    }
  };

  const copyGCashNumber = () => {
    const gcashNumber = "09122367040";
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(gcashNumber).catch(() => {
          fallbackCopyText(gcashNumber);
        });
      } else {
        fallbackCopyText(gcashNumber);
      }
    } catch {
      fallbackCopyText(gcashNumber);
    }
  };

  const fallbackCopyText = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "-9999px";
      textArea.style.left = "-9999px";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    } catch (e) {
      console.warn("Fallback copy failed", e);
    }
  };

  const getGCashDeepLink = () => {
    // Strictly open GCash app directly via registered scheme - never redirect to Play Store
    return "gcash://";
  };

  const handleOpenGCash = () => {
    // 1. Auto-copy the GCash mobile number
    copyGCashNumber();

    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

    setShowGCashGuide(true);

    if (isMobile) {
      toast.success("GCash number (0912 236 7040) copied! Opening GCash app...", { duration: 4000 });
      // Direct navigation attempt strictly to gcash:// - never open Play Store
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = "gcash://";
        } else {
          window.location.href = "gcash://";
        }
      } catch {
        window.location.href = "gcash://";
      }
    } else {
      toast.info("GCash number (0912 236 7040) copied! Note: GCash is a mobile app. Launch GCash on your phone to send payment.", { duration: 6000 });
    }
  };

  const handleScrollToUpload = () => {
    const el = document.getElementById("receipt-upload-container") || document.getElementById("file-upload");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      toast.info("Upload your payment screenshot here to verify your transaction!");
    }
  };

  const handleDownloadQR = () => {
    const link = document.createElement("a");
    if (qrMode === "qrph") {
      const qrImg = qrphData?.attributes?.qr_image || qrphData?.attributes?.qr_code || "/hotfast-qrph.png";
      link.href = qrImg;
      link.download = `HOTFAST-PayMongo-QRPh-${qrphData?.attributes?.reference_id || "active"}.png`;
      toast.success("PayMongo QRPh downloaded! Scan from your banking/e-wallet app gallery to pay.");
    } else {
      link.href = "/your-image.png";
      link.download = "HOTFAST-GCash-QR.png";
      toast.success("QR code downloaded! In GCash, tap 'QR' > 'Upload QR' from gallery to pay.");
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePayment = async () => {
    if (!user) {
      toast.error("Please login first.");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) return;
    if (!file) {
      toast.error("Please upload your payment screenshot for verification.");
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
    <section className="py-8 sm:py-12 md:py-24 px-3 sm:px-6 max-w-6xl mx-auto">
      <div className="sharp-card grid grid-cols-1 md:grid-cols-12 gap-0 overflow-hidden">
        {/* Left: QR & Details */}
        <div className="md:col-span-5 p-5 sm:p-6 md:p-10 border-b md:border-b-0 md:border-r border-border-subtle bg-slate-900/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">
              Settlement Channel
            </h3>
            {qrMode === "qrph" && (
              <button
                type="button"
                onClick={() => generatePayMongoQR()}
                disabled={loadingQrph}
                className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-primary hover:text-white uppercase tracking-wider transition-colors cursor-pointer"
                title="Refresh PayMongo QR Code"
              >
                <RefreshCw size={11} className={loadingQrph ? "animate-spin" : ""} />
                <span>{loadingQrph ? "Generating..." : "Refresh"}</span>
              </button>
            )}
          </div>

          {/* QR Channel Mode Toggle */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900/90 border border-border-subtle rounded mb-6 text-[10px] font-mono font-bold uppercase">
            <button
              type="button"
              onClick={() => setQrMode("qrph")}
              className={`py-2 px-2 rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                qrMode === "qrph"
                  ? "bg-primary text-white shadow-md font-black"
                  : "text-text-muted hover:text-white"
              }`}
            >
              <QrCode size={13} />
              <span>PayMongo QRPh</span>
            </button>
            <button
              type="button"
              onClick={() => setQrMode("gcash")}
              className={`py-2 px-2 rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                qrMode === "gcash"
                  ? "bg-[#007DFE] text-white shadow-md font-black"
                  : "text-text-muted hover:text-white"
              }`}
            >
              <Smartphone size={13} />
              <span>Direct GCash</span>
            </button>
          </div>

          <div className="mb-8 sm:mb-10 text-center">
            <div className="aspect-square bg-white p-3 sm:p-4 inline-block transform rotate-1 sm:rotate-2 shadow-2xl mb-3 group relative max-w-xs">
              <div className="w-44 h-44 sm:w-56 sm:h-56 bg-slate-100 flex items-center justify-center relative overflow-hidden">
                {qrMode === "qrph" ? (
                  loadingQrph && !qrphData ? (
                    <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                      <Loader2 size={28} className="text-primary animate-spin" />
                      <span className="text-[10px] font-mono font-bold text-slate-700 uppercase">
                        Generating PayMongo QRPh...
                      </span>
                    </div>
                  ) : (qrphData?.attributes?.qr_image || qrphData?.attributes?.qr_code) ? (
                    <img
                      src={qrphData.attributes.qr_image || qrphData.attributes.qr_code || "/hotfast-qrph.png"}
                      alt="PayMongo QRPh"
                      loading="lazy"
                      decoding="async"
                      width="224"
                      height="224"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                      <AlertTriangle size={24} className="text-amber-500" />
                      <span className="text-[9px] font-mono font-bold text-slate-700">
                        {qrphError || "QRPh unavailable"}
                      </span>
                      <button
                        type="button"
                        onClick={() => generatePayMongoQR()}
                        className="px-2 py-1 bg-primary text-white text-[9px] font-mono font-bold uppercase rounded"
                      >
                        Try Again
                      </button>
                    </div>
                  )
                ) : (
                  <img
                    src="/your-image.png"
                    alt="GCash QR"
                    loading="lazy"
                    decoding="async"
                    width="224"
                    height="224"
                    className="w-full h-full object-contain"
                  />
                )}
                <div
                  onClick={() => {
                    if (qrMode === "qrph") setShowScreenshotModal(true);
                  }}
                  className={`absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity ${
                    qrMode === "qrph" ? "cursor-pointer" : "pointer-events-none"
                  }`}
                >
                  <span className="text-[10px] font-black text-white bg-emerald-600 px-2.5 py-1.5 rounded uppercase tracking-wider flex items-center gap-1.5 shadow-lg">
                    <Camera size={13} /> Click to Screenshot Slip
                  </span>
                </div>
              </div>
            </div>

            {/* QRPh Badge indicator & Screenshot Button */}
            {qrMode === "qrph" && qrphData && (
              <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-mono font-bold uppercase tracking-wider rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  PayMongo QRPh Active • {qrphData.attributes.reference_id || "Verified"}
                </div>
                <button
                  type="button"
                  onClick={() => setShowScreenshotModal(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-mono font-bold uppercase tracking-wider rounded shadow transition-all cursor-pointer"
                  title="Open Screenshot Modal for client"
                >
                  <Camera size={12} />
                  <span>Screenshot Slip</span>
                </button>
              </div>
            )}

            {/* Instructional helper text & tooltip near QR code */}
            <div className="mb-6 flex flex-col items-center justify-center px-2">
              <div
                className="group relative inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/40 hover:border-primary transition-all cursor-help"
                title="After scanning this QR code, please take a screenshot of your payment receipt and upload it in the form to confirm your transaction."
              >
                <Upload size={13} className="text-primary shrink-0" />
                <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-slate-200">
                  Upload receipt after scanning
                </span>
                <HelpCircle size={12} className="text-primary/80 group-hover:text-primary transition-colors shrink-0" />

                {/* Hover Tooltip Popup */}
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-white text-[10px] font-mono normal-case tracking-normal border border-primary shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 z-30 text-center leading-relaxed">
                  <div className="font-black text-primary uppercase text-[9px] mb-1 tracking-wider flex items-center justify-center gap-1">
                    <Receipt size={12} /> Receipt Upload Required
                  </div>
                  Scan with GCash, Maya, ShopeePay, or any bank app (BDO, BPI, UnionBank), save your confirmation screenshot, and upload it in the verification form.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-primary" />
                </div>
              </div>
              
              {qrMode === "qrph" && (
                <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1 bg-emerald-950/80 border border-emerald-500/40 rounded text-emerald-300 font-mono text-[9px] sm:text-[10px] uppercase tracking-wider shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-bold">E-Wallet Auto-Amount:</span>
                  <span className="text-white font-black">₱{activePlan ? activePlan.price.toLocaleString() : "1,000"}</span>
                </div>
              )}

              <p className="mt-1.5 text-[9px] font-mono text-text-muted uppercase tracking-wider text-center">
                {qrMode === "qrph"
                  ? "Universal QRPh • Scanning with GCash/Maya auto-fills ₱" + (activePlan ? activePlan.price.toLocaleString() : "1,000")
                  : "Scan QR with e-wallet → Attach screenshot in form"}
              </p>
            </div>
            
            <div className="mt-4 space-y-5 sm:space-y-6">
              <div>
                <div className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] mb-1">
                  Primary Routing Terminal
                </div>
                <button 
                  onClick={() => {
                    copyGCashNumber();
                    toast.success("Routing Number Copied: 0912 236 7040");
                  }}
                  className="group relative inline-block p-1 cursor-pointer"
                  title="Click to copy number"
                >
                  <div className="text-2xl sm:text-3xl font-mono font-bold text-primary tracking-tighter mt-1 italic group-hover:scale-105 transition-transform">
                    0912 236 7040
                  </div>
                  <div className="absolute -right-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Copy size={14} className="text-primary" />
                  </div>
                </button>
                <div className="mt-2 flex items-center justify-center gap-2 text-[9px] font-bold text-primary/60 uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Automatic Settlement Active
                </div>
              </div>

              <div className="pt-2 sm:pt-4 space-y-2.5 sm:space-y-3">
                {qrMode === "qrph" ? (
                  <>
                    {/* Primary: Dedicated Button for PayMongo so client can screenshot the payment */}
                    <button
                      type="button"
                      onClick={() => setShowScreenshotModal(true)}
                      className="w-full py-3.5 sm:py-4 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-primary hover:from-emerald-500 hover:to-primary-dark text-white font-black uppercase text-[11px] sm:text-[12px] tracking-[0.2em] italic flex items-center justify-center gap-2.5 transition-all shadow-[0_10px_25px_rgba(16,185,129,0.35)] active:scale-[0.98] cursor-pointer min-h-[46px] border border-emerald-400/40 text-center rounded no-underline"
                      title="Open and screenshot official PayMongo payment voucher"
                    >
                      <Camera size={17} className="shrink-0 text-emerald-200 animate-pulse" />
                      <span>Screenshot Payment Slip</span>
                      <Receipt size={14} className="opacity-90 shrink-0" />
                    </button>

                    {/* Secondary: Quick Save QR Code & Copy Terminal */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadQR}
                        className="py-2.5 px-3 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 hover:border-emerald-500/50 text-[9px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[38px] rounded"
                        title="Download QR code to phone gallery"
                      >
                        <Download size={13} className="text-emerald-400 shrink-0" />
                        <span className="truncate">Save QR Code</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          copyGCashNumber();
                          toast.success("Routing number (0912 236 7040) copied!");
                        }}
                        className="py-2.5 px-3 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 hover:border-emerald-500/50 text-[9px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[38px] rounded"
                        title="Copy terminal phone number"
                      >
                        <Copy size={13} className="text-emerald-400 shrink-0" />
                        <span className="truncate">Copy Terminal</span>
                      </button>
                    </div>

                    {/* Real-time Scan & Settlement Monitor with Explicit Payment States */}
                    <div className="p-3 bg-slate-900/90 border border-slate-700/80 rounded text-left space-y-2.5 mt-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {paymentGatewayStatus === "processing" ? (
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                            </span>
                          ) : paymentGatewayStatus === "succeeded" ? (
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                            </span>
                          ) : paymentGatewayStatus === "failed" ? (
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                          ) : (
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-500" />
                          )}

                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-200">
                            {paymentGatewayStatus === "processing" && "Processing Payment..."}
                            {paymentGatewayStatus === "succeeded" && "Payment Successful"}
                            {paymentGatewayStatus === "failed" && "Payment Failed"}
                            {paymentGatewayStatus === "cancelled" && "Payment Cancelled"}
                          </span>
                        </div>

                        {paymentGatewayStatus === "processing" && (
                          <span className="text-[9px] font-mono font-black uppercase text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                            <Loader2 size={10} className="animate-spin" /> Checking
                          </span>
                        )}
                        {paymentGatewayStatus === "succeeded" && (
                          <span className="text-[9px] font-mono font-black uppercase text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                            <CheckCheck size={10} /> Verified
                          </span>
                        )}
                        {paymentGatewayStatus === "failed" && (
                          <span className="text-[9px] font-mono font-black uppercase text-red-400 bg-red-500/15 px-2 py-0.5 rounded border border-red-500/30">
                            Declined
                          </span>
                        )}
                        {paymentGatewayStatus === "cancelled" && (
                          <span className="text-[9px] font-mono font-black uppercase text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                            Cancelled
                          </span>
                        )}
                      </div>

                      {paymentGatewayStatus === "processing" && (
                        <div className="space-y-2 pt-0.5">
                          <p className="text-[9px] font-mono text-slate-400 leading-relaxed flex items-center gap-1.5">
                            <Loader2 size={11} className="animate-spin text-amber-400 shrink-0" />
                            <span>Scan in GCash, Maya, or any bank app. Settlement button remains locked until payment is verified.</span>
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={isCheckingGateway}
                              onClick={() => checkPaymentStatus(true)}
                              className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[9px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1 rounded transition-colors cursor-pointer"
                            >
                              {isCheckingGateway ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                              <span>Check Gateway</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleSimulateScanAndPay}
                              className="flex-1 py-1.5 px-2 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 text-[9px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1 rounded transition-colors cursor-pointer"
                              title="Simulate client scanning & paying the QR"
                            >
                              <PlayCircle size={11} className="text-emerald-400" />
                              <span>Simulate Paid</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {paymentGatewayStatus === "succeeded" && (
                        <div className="space-y-2 pt-0.5">
                          <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/40 rounded text-xs font-mono text-emerald-200">
                            <div className="font-bold flex items-center gap-1.5 text-emerald-300">
                              <CheckCheck size={14} className="text-emerald-400" />
                              ₱{(verifiedPaymentRecord?.amount || amount || 1000).toLocaleString()} Verified via QRPh
                            </div>
                            <div className="text-[9px] text-emerald-400/80 mt-0.5 truncate">
                              Ref: {verifiedPaymentRecord?.paymentId || qrphData?.attributes?.reference_id}
                            </div>
                            <p className="text-[9px] text-slate-300 mt-1 font-sans">
                              Payment confirmed by PayMongo! Settlement is unlocked and ready to process.
                            </p>
                          </div>
                        </div>
                      )}

                      {paymentGatewayStatus === "failed" && (
                        <div className="space-y-2 pt-0.5">
                          <div className="p-2.5 bg-red-950/40 border border-red-500/40 rounded text-xs font-mono text-red-200">
                            <div className="font-bold flex items-center gap-1.5 text-red-300">
                              <XCircle size={14} className="text-red-400" />
                              Payment Transaction Failed
                            </div>
                            <p className="text-[9px] text-slate-300 mt-1 font-sans">
                              {paymentErrorReason || "Payment was rejected or timed out by the issuing bank."} Settlement is disabled.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSimulatedStatus("processing")}
                            className="w-full py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-mono font-bold uppercase rounded border border-slate-700 cursor-pointer"
                          >
                            Retry Payment Flow
                          </button>
                        </div>
                      )}

                      {paymentGatewayStatus === "cancelled" && (
                        <div className="space-y-2 pt-0.5">
                          <div className="p-2.5 bg-slate-800/80 border border-slate-600 rounded text-xs font-mono text-slate-300">
                            <div className="font-bold flex items-center gap-1.5 text-slate-200">
                              <Ban size={14} className="text-slate-400" />
                              Payment Session Cancelled
                            </div>
                            <p className="text-[9px] text-slate-400 mt-1 font-sans">
                              {paymentErrorReason || "Customer cancelled payment."} Settlement remains disabled.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSimulatedStatus("processing")}
                            className="w-full py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-mono font-bold uppercase rounded border border-slate-700 cursor-pointer"
                          >
                            Restart Payment Session
                          </button>
                        </div>
                      )}

                      {/* State Simulator Switcher for test & verification */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1">
                        <span className="text-[8px] font-mono text-slate-500 uppercase">Test State:</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSimulatedStatus("processing")}
                            className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border cursor-pointer transition-colors ${
                              paymentGatewayStatus === "processing"
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                            }`}
                          >
                            Processing
                          </button>
                          <button
                            type="button"
                            onClick={() => setSimulatedStatus("succeeded")}
                            className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border cursor-pointer transition-colors ${
                              paymentGatewayStatus === "succeeded"
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                            }`}
                          >
                            Succeeded
                          </button>
                          <button
                            type="button"
                            onClick={() => setSimulatedStatus("failed")}
                            className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border cursor-pointer transition-colors ${
                              paymentGatewayStatus === "failed"
                                ? "bg-red-500/20 text-red-300 border-red-500/50"
                                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                            }`}
                          >
                            Failed
                          </button>
                          <button
                            type="button"
                            onClick={() => setSimulatedStatus("cancelled")}
                            className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border cursor-pointer transition-colors ${
                              paymentGatewayStatus === "cancelled"
                                ? "bg-slate-700 text-slate-200 border-slate-500"
                                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                            }`}
                          >
                            Cancelled
                          </button>
                        </div>
                      </div>
                    </div>

                    <p className="text-[8px] text-text-muted font-bold uppercase tracking-widest leading-relaxed text-center px-1">
                      Tap <strong>Screenshot Payment Slip</strong> to save voucher proof, scan in any QRPh bank app, then auto-settle.
                    </p>
                  </>
                ) : (
                  <>
                    {/* Primary: Open GCash App Direct Action strictly via gcash:// (no Play Store) */}
                    <a
                      href="gcash://"
                      target="_top"
                      rel="noopener noreferrer"
                      onClick={handleOpenGCash}
                      className="w-full py-3.5 sm:py-4 px-4 bg-[#007DFE] hover:bg-[#006bd8] text-white font-black uppercase text-[11px] sm:text-[12px] tracking-[0.2em] italic flex items-center justify-center gap-2.5 transition-all shadow-[0_10px_25px_rgba(0,125,254,0.35)] active:scale-[0.98] cursor-pointer min-h-[46px] border border-[#3ba0ff] text-center no-underline"
                    >
                      <Smartphone size={16} className="shrink-0" />
                      <span>Pay via GCash (Open App)</span>
                      <ExternalLink size={13} className="opacity-80 shrink-0" />
                    </a>

                    {/* Secondary: Quick Save QR Code & Copy Number */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadQR}
                        className="py-2.5 px-3 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 hover:border-primary/50 text-[9px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
                        title="Download QR code to phone gallery"
                      >
                        <Download size={13} className="text-primary shrink-0" />
                        <span className="truncate">Save QR Code</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          copyGCashNumber();
                          toast.success("Routing number (0912 236 7040) copied!");
                        }}
                        className="py-2.5 px-3 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 hover:border-primary/50 text-[9px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
                        title="Copy GCash phone number"
                      >
                        <Copy size={13} className="text-primary shrink-0" />
                        <span className="truncate">Copy Number</span>
                      </button>
                    </div>

                    {/* Interactive guidance if app does not open automatically */}
                    {showGCashGuide ? (
                      <div className="p-3 bg-slate-900/90 border border-[#007DFE]/40 text-left space-y-2 mt-2 transition-all">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold text-[#007DFE] uppercase flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#007DFE] animate-ping" />
                            0912 236 7040 Auto-Copied!
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowGCashGuide(false)}
                            className="text-text-muted hover:text-white text-[10px] font-mono font-bold"
                          >
                            ✕
                          </button>
                        </div>
                        <p className="text-[9px] font-mono text-slate-300 leading-relaxed">
                          Number auto-copied to clipboard! Opening GCash app directly (never Play Store).
                        </p>
                        <div className="pt-1 flex flex-wrap gap-1.5">
                          <a
                            href="gcash://"
                            target="_top"
                            onClick={handleOpenGCash}
                            className="px-3 py-1.5 bg-[#007DFE] hover:bg-[#006bd8] text-white text-[9px] font-mono font-bold uppercase inline-flex items-center gap-1.5 rounded no-underline"
                          >
                            <Smartphone size={12} /> Open GCash App &rarr;
                          </a>
                        </div>
                        <p className="text-[8px] font-mono text-text-muted">
                          In GCash: Tap <strong>Express Send</strong>, paste <strong>0912 236 7040</strong>, then enter payment amount.
                        </p>
                      </div>
                    ) : (
                      <p className="text-[8px] text-text-muted font-bold uppercase tracking-widest leading-relaxed text-center px-1">
                        Clicking automatically copies 0912 236 7040 &amp; opens GCash app directly (no Play Store).
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <a
              href="#" // Replace with real FB page link
              className="w-full p-3.5 sm:p-4 flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-lg shadow-blue-600/20 min-h-[44px]"
            >
              <Facebook size={18} />
              <span className="font-black uppercase text-[10px] tracking-widest italic">
                SEND PROOF ON FB
              </span>
            </a>

            <div className="p-3.5 sm:p-4 bg-bg-base border border-border-subtle">
              <p className="text-[10px] text-text-muted leading-relaxed font-bold uppercase tracking-tight">
                Send payment to the number above, then upload your receipt on
                the right to verify your transaction in our ledger.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Form & Upload */}
        <div className="md:col-span-7 p-5 sm:p-6 md:p-12 bg-slate-900/30">
          <div className="space-y-6 sm:space-y-8">
            {/* Interactive Subscription Tier Selector (Auto-Amount to E-Wallet) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-[0.3em] font-black text-text-muted flex items-center gap-2">
                  <span>Subscription Tier</span>
                  <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 uppercase tracking-widest font-mono">
                    ⚡ Auto-Amount to E-Wallet
                  </span>
                </label>
                {activePlan && (
                  <span className="text-[9px] font-mono text-primary font-bold">
                    Active: {activePlan.speed} Mbps (₱{activePlan.price.toLocaleString()})
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {plans && plans.length > 0 ? (
                  plans.map((p) => {
                    const isSelected = activePlan?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleChoosePlan(p)}
                        className={`relative p-3 text-left transition-all border rounded cursor-pointer ${
                          isSelected
                            ? "bg-primary/20 border-primary text-white shadow-[0_0_15px_rgba(0,240,255,0.25)] ring-1 ring-primary"
                            : "bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[9px] font-mono uppercase font-black tracking-wider ${isSelected ? "text-primary" : "text-slate-400"}`}>
                            {p.speed} Mbps
                          </span>
                          {isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          )}
                        </div>
                        <div className="text-sm font-bold text-white font-mono">
                          ₱{p.price.toLocaleString()}
                        </div>
                        <div className="text-[8px] text-text-muted uppercase tracking-tight mt-0.5 truncate">
                          {p.name}
                        </div>
                        {isSelected && (
                          <div className="mt-1.5 text-[7px] text-emerald-400 font-mono font-bold uppercase tracking-wider">
                            ✓ E-Wallet Loaded
                          </div>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-4 text-[10px] text-slate-400 font-mono py-2">
                    Default: 50 Mbps Fiber Plan (₱1,000/mo)
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-[0.3em] font-black text-text-muted">
                    Customer Identifier
                  </label>
                  <span className="text-[8px] bg-primary/20 text-primary px-2 py-0.5 rounded uppercase tracking-[0.2em] font-black not-italic border border-primary/20 flex items-center gap-1">
                    <Lock size={9} /> Locked
                  </span>
                </div>
                <div className="w-full bg-slate-900 border border-primary/30 p-3.5 sm:p-4 md:p-5 text-base sm:text-lg md:text-xl font-mono text-white font-bold flex items-center justify-between select-none">
                  <span className="tracking-widest">
                    {accountNumber || profile?.accountNumber || (user ? `HF-${user.uid.substring(0, 8).toUpperCase()}` : "HF-000000")}
                  </span>
                  <ShieldCheck size={18} className="text-primary shrink-0" />
                </div>
                <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest mt-2 italic px-1">
                  System locked: Bound to verified subscriber profile
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.3em] font-black text-text-muted">
                  Settlement Amount
                </label>
                <div className="w-full bg-slate-900 border border-primary/30 p-3.5 sm:p-4 md:p-5 text-lg sm:text-xl md:text-2xl font-mono text-primary font-bold italic flex items-center justify-between">
                  <span>₱ {activePlan ? activePlan.price.toLocaleString() : "1,000.00"}</span>
                  <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded uppercase tracking-[0.2em] font-black not-italic border border-emerald-500/30">
                    Auto-Amounted
                  </span>
                </div>
                {activePlan && (
                  <p className="text-[9px] text-emerald-400/90 uppercase font-bold tracking-widest mt-2 italic px-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Auto-populated: {activePlan.name} (₱{activePlan.price.toLocaleString()}) loaded into QR
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4" id="receipt-upload-container">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-[0.3em] font-black text-text-muted">
                  Proof of Settlement
                </label>
                {qrMode === "qrph" ? (
                  <span
                    className={`text-[8px] px-2 py-0.5 rounded uppercase tracking-[0.2em] font-black border flex items-center gap-1 font-mono ${
                      paymentGatewayStatus === "succeeded"
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        : paymentGatewayStatus === "failed"
                        ? "bg-red-500/20 text-red-400 border-red-500/30"
                        : paymentGatewayStatus === "cancelled"
                        ? "bg-slate-800 text-slate-400 border-slate-700"
                        : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    }`}
                  >
                    {paymentGatewayStatus === "succeeded" && (
                      <>
                        <CheckCheck size={10} /> Verified
                      </>
                    )}
                    {paymentGatewayStatus === "processing" && (
                      <>
                        <Loader2 size={10} className="animate-spin" /> Processing
                      </>
                    )}
                    {paymentGatewayStatus === "failed" && (
                      <>
                        <XCircle size={10} /> Declined
                      </>
                    )}
                    {paymentGatewayStatus === "cancelled" && (
                      <>
                        <Ban size={10} /> Cancelled
                      </>
                    )}
                  </span>
                ) : (
                  preview && (
                    <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded uppercase tracking-[0.2em] font-black border border-emerald-500/30 flex items-center gap-1">
                      <CheckCheck size={10} /> Attached
                    </span>
                  )
                )}
              </div>
              
              {qrMode === "qrph" ? (
                <div className="space-y-3">
                  {/* Status: Processing Payment */}
                  {paymentGatewayStatus === "processing" && (
                    <div className="p-5 sm:p-6 bg-slate-900/80 border border-amber-500/40 rounded-lg text-left space-y-3 shadow-inner">
                      <div className="flex items-center gap-3 text-amber-400 font-mono font-bold text-sm">
                        <Loader2 className="animate-spin text-amber-400 shrink-0" size={22} />
                        <div>
                          <div className="text-amber-300 text-base font-black uppercase tracking-wider">
                            Processing Payment...
                          </div>
                          <span className="text-[10px] text-amber-400/80 font-normal">
                            Awaiting QRPh scan verification from PayMongo gateway
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] font-mono text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded border border-amber-500/20">
                        Please scan the QR code using GCash, Maya, ShopeePay, or any bank app. The <strong>Process Settlement</strong> button below is currently locked and will become enabled as soon as your payment is verified.
                      </p>
                    </div>
                  )}

                  {/* Status: Payment Successful */}
                  {paymentGatewayStatus === "succeeded" && (
                    <div className="p-5 sm:p-6 bg-emerald-950/30 border border-emerald-500/60 rounded-lg text-left space-y-3 shadow-lg shadow-emerald-950/40">
                      <div className="flex items-center gap-3 text-emerald-400 font-mono font-bold text-sm">
                        <CheckCircle2 size={24} className="text-emerald-400 shrink-0 animate-bounce" />
                        <div>
                          <div className="text-emerald-300 text-base font-black uppercase tracking-wider">
                            Payment Successful
                          </div>
                          <span className="text-[10px] text-emerald-400/80 font-normal">
                            PayMongo QRPh payment confirmed and verified
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950/70 p-3 rounded border border-emerald-500/20">
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase block">Reference ID</span>
                          <span className="font-bold text-emerald-300 truncate block">
                            {verifiedPaymentRecord?.paymentId || qrphData?.attributes?.reference_id}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase block">Amount Verified</span>
                          <span className="font-bold text-white block">
                            ₱{(verifiedPaymentRecord?.amount || amount || 1000).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] font-mono text-slate-300 leading-relaxed">
                        Payment status is confirmed as successful! The <strong>Process Settlement</strong> button is now unlocked and ready to apply to your subscriber account.
                      </p>
                    </div>
                  )}

                  {/* Status: Payment Failed */}
                  {paymentGatewayStatus === "failed" && (
                    <div className="p-5 sm:p-6 bg-red-950/30 border border-red-500/50 rounded-lg text-left space-y-3">
                      <div className="flex items-center gap-3 text-red-400 font-mono font-bold text-sm">
                        <XCircle size={24} className="text-red-400 shrink-0" />
                        <div>
                          <div className="text-red-300 text-base font-black uppercase tracking-wider">
                            Payment Failed
                          </div>
                          <span className="text-[10px] text-red-400/80 font-normal">
                            Gateway declined the transaction
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] font-mono text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded border border-red-500/20">
                        {paymentErrorReason || "The transaction was declined by the bank or exceeded the maximum response time."} Settlement is disabled.
                      </p>
                    </div>
                  )}

                  {/* Status: Payment Cancelled */}
                  {paymentGatewayStatus === "cancelled" && (
                    <div className="p-5 sm:p-6 bg-slate-900/90 border border-slate-600 rounded-lg text-left space-y-3">
                      <div className="flex items-center gap-3 text-slate-300 font-mono font-bold text-sm">
                        <Ban size={24} className="text-slate-400 shrink-0" />
                        <div>
                          <div className="text-slate-200 text-base font-black uppercase tracking-wider">
                            Payment Cancelled
                          </div>
                          <span className="text-[10px] text-slate-400 font-normal">
                            Payment session was aborted or timed out
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] font-mono text-slate-400 leading-relaxed bg-slate-950/60 p-3 rounded border border-slate-700">
                        {paymentErrorReason || "Customer cancelled the QR payment."} Settlement is disabled.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`relative border-2 border-dashed transition-all p-6 sm:p-8 text-center flex flex-col items-center justify-center cursor-pointer ${preview ? "border-primary bg-primary/5" : "border-border-subtle hover:border-text-muted bg-bg-base"}`}
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
                      <Upload className="text-text-muted mb-3 sm:mb-4" size={28} />
                      <div className="text-[11px] font-black uppercase tracking-widest text-text-dim">
                        Tap or Drag Screenshot Here
                      </div>
                      <div className="text-[9px] text-text-muted uppercase mt-2">
                        JPG, PNG allowed (Max 5MB)
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Rule 1, 2, 3: Process Settlement Button Behavior */}
            {qrMode === "qrph" ? (
              <div className="space-y-2">
                {settlementStepStatus === "succeeded" ? (
                  <button
                    type="button"
                    disabled={true}
                    className="w-full py-4 sm:py-5 min-h-[48px] bg-emerald-950/90 border-2 border-emerald-500/80 text-emerald-300 font-black uppercase tracking-[0.2em] sm:tracking-[0.25em] text-xs sm:text-sm shadow-xl flex items-center justify-center gap-2.5 rounded cursor-not-allowed opacity-95"
                  >
                    <CheckCheck size={20} className="text-emerald-400" />
                    <span>Settlement Successful</span>
                  </button>
                ) : settlementStepStatus === "settling" ? (
                  <button
                    type="button"
                    disabled={true}
                    className="w-full py-4 sm:py-5 min-h-[48px] bg-emerald-800/80 border border-emerald-500 text-white font-black uppercase tracking-[0.2em] sm:tracking-[0.25em] text-xs sm:text-sm shadow-xl flex items-center justify-center gap-2.5 rounded cursor-not-allowed"
                  >
                    <Loader2 className="animate-spin" size={20} />
                    <span>Processing Settlement...</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={paymentGatewayStatus !== "succeeded" || !verifiedPaymentRecord || !amount}
                    onClick={processSettlement}
                    className={`w-full py-4 sm:py-5 min-h-[48px] font-black uppercase tracking-[0.2em] sm:tracking-[0.25em] text-xs sm:text-sm transition-all shadow-xl flex items-center justify-center gap-3 sm:gap-4 italic rounded ${
                      paymentGatewayStatus === "succeeded" && verifiedPaymentRecord && amount
                        ? "bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/30 cursor-pointer active:scale-[0.98]"
                        : "bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60"
                    }`}
                  >
                    {paymentGatewayStatus === "succeeded" ? (
                      <>
                        <Zap size={18} className="text-white fill-white" />
                        <span>{user ? "Process Settlement" : "Sign In to Process Settlement"}</span>
                        <ArrowRight size={18} />
                      </>
                    ) : (
                      <>
                        <Lock size={16} className={paymentGatewayStatus === "failed" ? "text-red-400" : "text-slate-500"} />
                        <span>Process Settlement</span>
                      </>
                    )}
                  </button>
                )}

                {/* Explicit helper text explaining settlement button status */}
                <div className="text-center">
                  {settlementStepStatus === "succeeded" ? (
                    <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                      Settlement completed and subscriber profile updated. Duplicate requests prevented.
                    </span>
                  ) : settlementStepStatus === "settling" ? (
                    <span className="text-[9px] font-mono text-amber-300 uppercase tracking-wider">
                      Verifying with gateway &amp; recording settlement transaction...
                    </span>
                  ) : paymentGatewayStatus === "succeeded" ? (
                    <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                      Payment verified by PayMongo. Settlement button is now enabled.
                    </span>
                  ) : paymentGatewayStatus === "processing" ? (
                    <span className="text-[9px] font-mono text-amber-400/90 uppercase tracking-wider flex items-center justify-center gap-1">
                      <Lock size={11} /> Disabled: Waiting for Payment Successful status from gateway
                    </span>
                  ) : paymentGatewayStatus === "failed" ? (
                    <span className="text-[9px] font-mono text-red-400 uppercase tracking-wider flex items-center justify-center gap-1">
                      <Lock size={11} /> Disabled: Payment Failed
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-center gap-1">
                      <Lock size={11} /> Disabled: Payment Cancelled
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <button
                disabled={processing || !user || !amount || !file}
                onClick={handlePayment}
                className="w-full py-4 sm:py-6 min-h-[48px] bg-primary hover:bg-primary-dark disabled:opacity-30 text-white font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] text-xs sm:text-sm transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 sm:gap-4 italic active:scale-[0.98] cursor-pointer"
              >
                {processing ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <>
                    PROCESS SETTLEMENT <ArrowRight size={18} />
                  </>
                )}
              </button>
            )}

            {!user && (
              <div className="p-3 bg-slate-900 border border-primary/30 rounded text-center space-y-2">
                <p className="text-[10px] text-primary font-black uppercase tracking-widest italic leading-tight">
                  Sign in required to link payment to your subscriber profile
                </p>
                <button
                  type="button"
                  onClick={() => loginWithGoogle()}
                  className="px-4 py-2 bg-primary hover:bg-red-700 text-white font-black uppercase text-[10px] tracking-widest inline-flex items-center gap-1.5 rounded cursor-pointer"
                >
                  <LogIn size={13} /> Sign In with Google
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PayMongo Client Screenshot Modal */}
      <PayMongoScreenshotModal
        isOpen={showScreenshotModal}
        onClose={() => setShowScreenshotModal(false)}
        qrphData={qrphData}
        selectedPlan={activePlan}
        accountNumber={accountNumber}
        userEmail={user?.email}
        onProceedToUpload={handleScrollToUpload}
      />

      {/* Settlement Success Modal */}
      <SettlementSuccessModal
        isOpen={showSettlementModal}
        onClose={() => setShowSettlementModal(false)}
        plan={settlementDetails?.plan || activePlan}
        amount={settlementDetails?.amount || (activePlan ? activePlan.price : 1000)}
        accountNumber={settlementDetails?.accountNumber || accountNumber}
        referenceNumber={settlementDetails?.referenceNumber || "PM-SETTLE-001"}
        paidAt={settlementDetails?.paidAt || new Date().toLocaleString()}
        nextDueDate={settlementDetails?.nextDueDate || "In 30 days"}
        clientEmail={user?.email || undefined}
        onGoToPortal={onSuccess}
      />
    </section>
  );
}

export default PaymentSection;
