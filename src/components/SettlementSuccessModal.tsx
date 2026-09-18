/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  Download, 
  ShieldCheck, 
  Zap, 
  ArrowRight, 
  Copy, 
  Share2, 
  Calendar, 
  Wifi, 
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { toPng } from 'html-to-image';
import { InternetPlan } from '../types';

interface SettlementSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: InternetPlan | null;
  amount: number;
  accountNumber: string;
  referenceNumber: string;
  paidAt: string;
  nextDueDate: string;
  clientEmail?: string;
  onGoToPortal?: () => void;
}

export const SettlementSuccessModal: React.FC<SettlementSuccessModalProps> = ({
  isOpen,
  onClose,
  plan,
  amount,
  accountNumber,
  referenceNumber,
  paidAt,
  nextDueDate,
  clientEmail,
  onGoToPortal,
}) => {
  const voucherRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  if (!isOpen) return null;

  const copyRefNumber = () => {
    navigator.clipboard.writeText(referenceNumber);
    toast.success(`Reference number copied: ${referenceNumber}`);
  };

  const handleDownloadReceipt = async () => {
    if (downloading) return;
    setDownloading(true);
    const toastId = toast.loading('Generating official settlement receipt...');

    try {
      let dataUrl: string | null = null;
      if (voucherRef.current) {
        try {
          dataUrl = await toPng(voucherRef.current, {
            pixelRatio: 2,
            backgroundColor: '#050914',
            cacheBust: true,
          });
        } catch (e) {
          console.warn('html-to-image error, creating canvas receipt:', e);
        }
      }

      // 2D Canvas fallback
      if (!dataUrl) {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 700;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#050914';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Header
          ctx.fillStyle = '#10b981';
          ctx.fillRect(0, 0, canvas.width, 10);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 22px monospace';
          ctx.textAlign = 'left';
          ctx.fillText('HOTFAST PH FIBER NETWORK', 35, 55);

          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 13px monospace';
          ctx.fillText('OFFICIAL SETTLEMENT SLIP', 35, 80);

          ctx.fillStyle = '#94a3b8';
          ctx.font = '12px monospace';
          ctx.fillText(`Date: ${paidAt || new Date().toLocaleString()}`, 35, 105);

          ctx.strokeStyle = '#1e293b';
          ctx.beginPath();
          ctx.moveTo(35, 125);
          ctx.lineTo(canvas.width - 35, 125);
          ctx.stroke();

          // Subscriber info
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '14px monospace';
          ctx.fillText(`Account Number: ${accountNumber}`, 35, 160);
          ctx.fillText(`Plan Subscribed: ${plan?.name || 'Lite Fiber'} (${plan?.speed || 50} Mbps)`, 35, 195);
          ctx.fillText(`Amount Settled: PHP ${amount.toLocaleString()}`, 35, 230);
          ctx.fillText(`Settlement Channel: PayMongo QRPh (Instant)`, 35, 265);
          ctx.fillText(`Reference Code: ${referenceNumber}`, 35, 300);
          ctx.fillText(`Connection Status: ACTIVE & UNLIMITED`, 35, 335);
          ctx.fillText(`Next Due Date: ${nextDueDate}`, 35, 370);

          // Verification badge
          ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
          ctx.fillRect(35, 410, canvas.width - 70, 70);
          ctx.strokeStyle = '#10b981';
          ctx.strokeRect(35, 410, canvas.width - 70, 70);

          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 16px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('VERIFIED & SETTLED AUTOMATICALLY', canvas.width / 2, 445);
          ctx.font = '11px monospace';
          ctx.fillText('Bandwidth unthrottled & allocated to subscriber profile', canvas.width / 2, 465);

          dataUrl = canvas.toDataURL('image/png');
        }
      }

      if (dataUrl) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `HOTFAST-Settlement-Receipt-${referenceNumber}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Official settlement slip downloaded!', { id: toastId });
      } else {
        toast.error('Could not generate receipt image.', { id: toastId });
      }
    } catch (err: any) {
      toast.error('Download error: ' + (err?.message || 'unknown'), { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ type: 'spring', duration: 0.4 }}
          className="relative w-full max-w-lg bg-[#060a14] border border-emerald-500/40 rounded-xl shadow-[0_20px_60px_rgba(16,185,129,0.25)] overflow-hidden my-auto"
        >
          {/* Glowing Top Accent Bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-primary animate-pulse" />

          {/* Header Banner */}
          <div className="p-5 sm:p-6 text-center border-b border-emerald-500/20 bg-emerald-950/20">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 border-2 border-emerald-500 text-emerald-400 mb-3 shadow-[0_0_30px_rgba(16,185,129,0.4)]">
              <CheckCircle2 size={32} className="animate-bounce" />
            </div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-emerald-400 mb-1 flex items-center justify-center gap-1.5">
              <Sparkles size={12} /> Auto Payment Detected &amp; Settled
            </div>
            <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-white">
              Settlement Completed!
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-sm mx-auto font-sans">
              Your PayMongo payment of <strong className="text-emerald-400">₱{amount.toLocaleString()}</strong> has been confirmed and settled into your account.
            </p>
          </div>

          {/* Voucher Preview (Capturable) */}
          <div className="p-4 sm:p-6 space-y-4">
            <div
              ref={voucherRef}
              className="p-5 bg-slate-900/90 border border-slate-700/80 rounded-lg space-y-3 font-mono text-xs shadow-inner"
            >
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <div className="flex items-center gap-2">
                  <Wifi size={16} className="text-emerald-400" />
                  <span className="font-bold text-white uppercase tracking-wider text-xs">
                    Hotfast Ph Network
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Active • Paid
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block">
                    Account ID
                  </span>
                  <span className="font-bold text-slate-100 text-xs truncate block">
                    {accountNumber}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block">
                    Subscribed Plan
                  </span>
                  <span className="font-bold text-emerald-400 text-xs truncate block">
                    {plan?.name || 'Lite Fiber'} ({plan?.speed || 50} Mbps)
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block">
                    Settled Amount
                  </span>
                  <span className="font-bold text-white text-sm">
                    ₱{amount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block">
                    Settlement Method
                  </span>
                  <span className="font-bold text-slate-200 text-xs">
                    PayMongo QRPh
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block">
                    Settlement Date
                  </span>
                  <span className="text-slate-300 text-[10px]">
                    {paidAt || new Date().toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block">
                    Next Due Date
                  </span>
                  <span className="font-bold text-emerald-300 text-[10px]">
                    {nextDueDate}
                  </span>
                </div>
              </div>

              {/* Reference ID Pill */}
              <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="text-[8px] text-slate-400 uppercase tracking-widest block">
                    Reference Code
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold tracking-wider">
                    {referenceNumber}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={copyRefNumber}
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                  title="Copy Reference"
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>

            {/* Benefit Highlights */}
            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="p-2 bg-slate-900/60 border border-slate-800 rounded">
                <ShieldCheck size={14} className="text-emerald-400 mx-auto mb-1" />
                <span className="text-[8px] text-slate-300 font-bold uppercase block">Balance</span>
                <span className="text-[10px] font-black text-emerald-400">₱0.00</span>
              </div>
              <div className="p-2 bg-slate-900/60 border border-slate-800 rounded">
                <Zap size={14} className="text-primary mx-auto mb-1" />
                <span className="text-[8px] text-slate-300 font-bold uppercase block">Speed</span>
                <span className="text-[10px] font-black text-white">{plan?.speed || 50} Mbps</span>
              </div>
              <div className="p-2 bg-slate-900/60 border border-slate-800 rounded">
                <Calendar size={14} className="text-emerald-400 mx-auto mb-1" />
                <span className="text-[8px] text-slate-300 font-bold uppercase block">Billing</span>
                <span className="text-[10px] font-black text-emerald-400">+30 Days</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={handleDownloadReceipt}
                disabled={downloading}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-xs tracking-wider rounded flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
              >
                <Download size={15} />
                <span>{downloading ? 'Downloading Receipt...' : 'Download Official Settlement Slip'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onGoToPortal) onGoToPortal();
                }}
                className="w-full py-3 px-4 bg-primary hover:bg-primary-dark text-white font-black uppercase text-xs tracking-wider rounded flex items-center justify-center gap-2 shadow-lg shadow-primary/30 transition-all cursor-pointer"
              >
                <span>View My Account in Portal</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
