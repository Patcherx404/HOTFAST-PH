import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Copy,
  Check,
  X,
  Share2,
  Printer,
  ShieldCheck,
  ExternalLink,
  Receipt
} from 'lucide-react';
import { toast } from 'sonner';
import { toPng } from 'html-to-image';
import type { PaymentRecord } from '../types';

export interface SettlementSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment?: PaymentRecord | null;
  customerName?: string;
  accountNumber?: string;
  amount?: number;
  referenceNumber?: string;
  planName?: string;
  method?: string;
  date?: string | Date;
}

export const SettlementSuccessModal: React.FC<SettlementSuccessModalProps> = ({
  isOpen,
  onClose,
  payment,
  customerName,
  accountNumber,
  amount,
  referenceNumber,
  planName,
  method,
  date,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const displayCustomer =
    customerName || payment?.customerName || 'HotFast Subscriber';
  const displayAccount =
    accountNumber || payment?.accountNumber || 'HF-ACC-0000';
  const displayAmount =
    amount ?? payment?.amount ?? 0;
  const displayRef =
    referenceNumber || payment?.referenceNumber || `HF-${Date.now().toString(36).toUpperCase()}`;
  const displayPlan =
    planName || payment?.planName || 'Fiber Broadband';
  const displayMethod =
    method || payment?.method || 'QR Ph / PayMongo';
  const displayDate =
    date
      ? new Date(date).toLocaleString('en-PH', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : payment?.createdAt?.toDate
      ? payment.createdAt.toDate().toLocaleString('en-PH', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : new Date().toLocaleString('en-PH', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });

  const handleCopyRef = () => {
    navigator.clipboard.writeText(displayRef);
    setCopied(true);
    toast.success('Reference number copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadReceipt = async () => {
    if (!receiptRef.current) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toPng(receiptRef.current, {
        cacheBust: true,
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: '#090d16',
      });
      const link = document.createElement('a');
      link.download = `HotFast-Receipt-${displayRef}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Official payment receipt downloaded!');
    } catch (err) {
      console.error('Failed to download receipt:', err);
      toast.error('Unable to download receipt. Please take a screenshot.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-emerald-500/30 rounded-3xl shadow-2xl overflow-hidden my-8">
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2 font-bold text-sm sm:text-base">
            <Receipt className="w-5 h-5 text-white" />
            <span>Digital Settlement Confirmation</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Printable / Capturable Receipt Card */}
          <div
            ref={receiptRef}
            className="bg-slate-950 border border-slate-800 rounded-2xl p-6 text-slate-200 shadow-inner space-y-4"
          >
            {/* Brand Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="text-lg font-black text-white tracking-wide flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  HOTFAST FIBER NETWORK
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  2026 HF NETWORK CORP • HF-V40
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 size={12} /> VERIFIED
                </span>
                <div className="text-[10px] text-slate-500 mt-1 font-mono">{displayDate}</div>
              </div>
            </div>

            {/* Settlement Amount Banner */}
            <div className="bg-slate-900/90 border border-emerald-500/20 rounded-xl p-4 text-center">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Settlement Amount
              </div>
              <div className="text-3xl sm:text-4xl font-black text-emerald-400 mt-1 tracking-tight">
                ₱{displayAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Credited toward account balance & service continuity
              </div>
            </div>

            {/* Subscriber & Transaction Details */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Subscriber Name:</span>
                <span className="font-semibold text-white">{displayCustomer}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Account Number:</span>
                <span className="font-mono font-semibold text-emerald-400">{displayAccount}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Internet Plan:</span>
                <span className="font-medium text-white">{displayPlan}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Payment Gateway:</span>
                <span className="font-medium text-white">{displayMethod}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Reference Number:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs text-slate-200">{displayRef}</span>
                  <button
                    type="button"
                    onClick={handleCopyRef}
                    className="p-1 hover:text-emerald-400 transition-colors text-slate-400"
                    title="Copy reference number"
                  >
                    {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Official Security Stamp */}
            <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5 text-slate-400">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>NOC Automated Clearance Verified</span>
              </div>
              <span className="font-mono text-[10px]">ISO/IEC-27001 SECURED</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleDownloadReceipt}
              disabled={isDownloading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Download size={15} />
              <span>{isDownloading ? 'Exporting...' : 'Save Receipt'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer"
            >
              <span>Done</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettlementSuccessModal;
