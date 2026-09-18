import React, { useRef, useState, useEffect } from 'react';
import { toPng, toBlob } from 'html-to-image';
import QRCode from 'qrcode';
import {
  Camera,
  Download,
  Copy,
  CheckCircle2,
  X,
  Upload,
  Receipt,
  QrCode,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  Sparkles,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { InternetPlan } from '../types';

interface PayMongoScreenshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  qrphData: any;
  selectedPlan: InternetPlan | null;
  accountNumber: string;
  userEmail?: string | null;
  onProceedToUpload?: () => void;
}

export function PayMongoScreenshotModal({
  isOpen,
  onClose,
  qrphData,
  selectedPlan,
  accountNumber,
  userEmail,
  onProceedToUpload,
}: PayMongoScreenshotModalProps) {
  const voucherRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [generatedQrUrl, setGeneratedQrUrl] = useState<string | null>(null);

  // If qr_string is supplied but qr_image is missing, generate QR data URL
  useEffect(() => {
    const qrStr = qrphData?.attributes?.qr_string || qrphData?.qr_string;
    const existingImg = qrphData?.attributes?.qr_image || qrphData?.attributes?.qr_code || qrphData?.qr_image;
    if (qrStr && !existingImg) {
      QRCode.toDataURL(qrStr, { width: 512, margin: 2 })
        .then((url) => setGeneratedQrUrl(url))
        .catch(() => {});
    }
  }, [qrphData]);

  if (!isOpen) return null;

  const qrImageSrc =
    generatedQrUrl ||
    qrphData?.attributes?.qr_image ||
    qrphData?.attributes?.qr_code ||
    qrphData?.qr_image ||
    '/hotfast-qrph.png';

  const referenceId =
    qrphData?.attributes?.reference_id ||
    qrphData?.id ||
    'QRPH-' + Math.random().toString(36).substring(2, 10).toUpperCase();

  const formattedAmount = selectedPlan
    ? `₱${selectedPlan.price.toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : '₱0.00';

  const currentTime = new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Pure 2D HTML5 Canvas rendering fallback that never fails even if DOM/CSS parsing has restrictions
  const renderFallbackCanvasVoucher = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 760;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas 2D context unavailable'));

        // Background
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Subtle gradient overlay
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(1, '#050811');
        ctx.fillStyle = grad;
        ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20);

        // Border
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 4;
        ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

        // Header Title
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold italic 22px sans-serif';
        ctx.fillText('HOTFAST PH', 30, 48);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px monospace';
        ctx.fillText('OFFICIAL SETTLEMENT VOUCHER', 30, 68);

        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('PayMongo QRPh Verified', canvas.width - 30, 48);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Instore Universal Terminal', canvas.width - 30, 68);
        ctx.textAlign = 'left';

        // Divider
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(30, 85);
        ctx.lineTo(canvas.width - 30, 85);
        ctx.stroke();

        // Amount Box
        ctx.fillStyle = '#090d16';
        ctx.fillRect(30, 100, canvas.width - 60, 90);
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(30, 100, canvas.width - 60, 90);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px monospace';
        ctx.fillText('PAYABLE AMOUNT', 45, 125);

        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 28px monospace';
        ctx.fillText(formattedAmount, 45, 160);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '12px monospace';
        ctx.fillText(selectedPlan?.name || 'Subscription Payment', 45, 180);

        // Account Details right side
        ctx.textAlign = 'right';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText('ACCOUNT NUMBER', canvas.width - 45, 125);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(accountNumber || 'HF-SUBSCRIBER', canvas.width - 45, 145);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(currentTime, canvas.width - 45, 170);
        ctx.textAlign = 'left';

        // Load and draw QR code image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // White background for QR
          const qrBoxSize = 340;
          const qrX = (canvas.width - qrBoxSize) / 2;
          const qrY = 210;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(qrX, qrY, qrBoxSize, qrBoxSize);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.strokeRect(qrX, qrY, qrBoxSize, qrBoxSize);

          // Draw QR inside white box
          ctx.drawImage(img, qrX + 20, qrY + 20, qrBoxSize - 40, qrBoxSize - 40);

          // Universal banner under QR
          ctx.fillStyle = '#34d399';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('Universal QRPh: GCash • Maya • BDO • BPI • UnionBank', canvas.width / 2, 575);

          // Footer routing
          ctx.textAlign = 'left';
          ctx.strokeStyle = '#1e293b';
          ctx.beginPath();
          ctx.moveTo(30, 600);
          ctx.lineTo(canvas.width - 30, 600);
          ctx.stroke();

          ctx.fillStyle = '#94a3b8';
          ctx.font = '12px monospace';
          ctx.fillText('Merchant: Hotfast Ph', 35, 630);
          ctx.fillText('Terminal Mobile: 0912 236 7040', 35, 655);

          ctx.textAlign = 'right';
          ctx.fillText(`Ref: ${referenceId}`, canvas.width - 35, 630);
          ctx.fillText('Hotfast Ph Subscription Payment', canvas.width - 35, 655);

          // Expiry notice
          ctx.textAlign = 'center';
          ctx.fillStyle = '#64748b';
          ctx.font = '10px monospace';
          ctx.fillText('Save this slip to your gallery and scan with your bank or e-wallet app.', canvas.width / 2, 715);

          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => {
          // If image failed to load, resolve canvas as-is
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = qrImageSrc;
      } catch (err) {
        reject(err);
      }
    });
  };

  const handleCaptureScreenshot = async () => {
    if (capturing) return;
    setCapturing(true);
    const toastId = toast.loading('Capturing high-resolution payment voucher...');

    try {
      let dataUrl: string | null = null;

      // 1. Try html-to-image first (uses native SVG foreignObject, fully supports oklch and modern CSS)
      if (voucherRef.current) {
        try {
          dataUrl = await toPng(voucherRef.current, {
            pixelRatio: 2,
            backgroundColor: '#090d16',
            cacheBust: true,
          });
        } catch (domErr) {
          console.warn('html-to-image error, using direct 2D canvas generator:', domErr);
        }
      }

      // 2. Fallback to our guaranteed native HTML5 2D canvas voucher
      if (!dataUrl) {
        dataUrl = await renderFallbackCanvasVoucher();
      }

      const fileName = `HOTFAST-PayMongo-Payment-Slip-${referenceId}.png`;

      // Auto-trigger download to device
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Attempt clipboard copy if supported
      try {
        if (voucherRef.current) {
          const blob = await toBlob(voucherRef.current, {
            pixelRatio: 2,
            backgroundColor: '#090d16',
          });
          if (blob && navigator.clipboard && (window as any).ClipboardItem) {
            await navigator.clipboard.write([
              new (window as any).ClipboardItem({ 'image/png': blob }),
            ]);
            toast.dismiss(toastId);
            toast.success('Payment slip saved & copied to clipboard!');
            return;
          }
        }
      } catch {
        // Clipboard write error is non-fatal
      }

      toast.dismiss(toastId);
      toast.success('Payment slip downloaded to your device!');
    } catch (err) {
      console.error('Failed to capture voucher screenshot:', err);
      toast.dismiss(toastId);
      // Fallback: direct download of the QR code image
      const fallbackLink = document.createElement('a');
      fallbackLink.href = qrImageSrc;
      fallbackLink.download = `HOTFAST-PayMongo-QRPh-${referenceId}.png`;
      document.body.appendChild(fallbackLink);
      fallbackLink.click();
      document.body.removeChild(fallbackLink);
      toast.info('QR image downloaded. You can also take a screenshot manually!');
    } finally {
      setCapturing(false);
    }
  };

  const copyRefId = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(referenceId);
      }
      setCopiedRef(true);
      toast.success(`Reference ID copied: ${referenceId}`);
      setTimeout(() => setCopiedRef(false), 2500);
    } catch {
      toast.success(`Reference ID: ${referenceId}`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="screenshot-modal-title"
    >
      <div className="relative w-full max-w-md my-auto bg-slate-950 border border-emerald-500/40 shadow-2xl shadow-emerald-500/10 rounded-xl overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Camera size={15} />
            </div>
            <div>
              <h3
                id="screenshot-modal-title"
                className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5"
              >
                PayMongo Payment Slip
                <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded font-mono font-bold">
                  Active
                </span>
              </h3>
              <p className="text-[9px] font-mono text-slate-400">
                Ready for client screenshot or auto-download
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Voucher Container for screenshot capture */}
        <div className="p-4 sm:p-5 max-h-[75vh] overflow-y-auto space-y-4">
          <div
            ref={voucherRef}
            id="paymongo-voucher-card"
            className="p-4 sm:p-5 bg-gradient-to-b from-slate-900 via-slate-950 to-[#070b12] border-2 border-emerald-500/50 rounded-lg shadow-inner text-white relative overflow-hidden"
          >
            {/* Top Badge & Hotfast PH Logo */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3.5">
              <div>
                <div className="flex items-center gap-1 text-[11px] font-black italic tracking-widest text-primary">
                  <span>HOTFAST</span>
                  <span className="text-white">PH</span>
                </div>
                <div className="text-[8px] font-mono uppercase tracking-widest text-slate-400">
                  Official Settlement Voucher
                </div>
              </div>

              <div className="text-right">
                <div className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                  <ShieldCheck size={11} /> PayMongo Verified
                </div>
                <div className="text-[8px] font-mono text-slate-400">
                  Instore QRPh Terminal
                </div>
              </div>
            </div>

            {/* Plan and Amount Highlight */}
            <div className="bg-slate-900/80 border border-emerald-500/20 rounded p-3 mb-3.5 flex items-center justify-between">
              <div>
                <div className="text-[9px] font-mono uppercase text-slate-400 tracking-wider">
                  Payable Amount
                </div>
                <div className="text-xl sm:text-2xl font-mono font-black text-emerald-400 tracking-tight">
                  {formattedAmount}
                </div>
                <div className="text-[9px] font-mono text-slate-300 truncate max-w-[180px]">
                  {selectedPlan ? selectedPlan.name : 'Subscription Payment'}
                </div>
              </div>

              <div className="text-right space-y-1">
                <div className="text-[8px] font-mono uppercase text-slate-400">
                  Account ID
                </div>
                <div className="text-[10px] font-mono font-bold text-white bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                  {accountNumber || 'HF-SUBSCRIBER'}
                </div>
                <div className="text-[8px] font-mono text-slate-400">
                  {currentTime}
                </div>
              </div>
            </div>

            {/* QRPh Code Display */}
            <div className="text-center my-3">
              <div className="inline-block p-3 bg-white rounded-lg shadow-xl border-2 border-emerald-400/40">
                <img
                  src={qrImageSrc}
                  alt="PayMongo QRPh Code"
                  crossOrigin="anonymous"
                  width="200"
                  height="200"
                  className="w-44 h-44 sm:w-48 sm:h-48 object-contain mx-auto"
                />
              </div>

              {/* QRPh Universal Banner */}
              <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Universal QRPh: GCash • Maya • BDO • BPI • UnionBank
              </div>
            </div>

            {/* Routing & Metadata Footer */}
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-[9px] font-mono space-y-1.5">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Merchant Name:</span>
                <span className="font-bold text-white">Hotfast Ph</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Terminal Mobile:</span>
                <span className="font-bold text-emerald-400">0912 236 7040</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Reference Code:</span>
                <span className="font-mono text-[8px] text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">
                  {referenceId}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400 text-[8px] pt-1">
                <span>Notes:</span>
                <span className="italic text-slate-300 truncate max-w-[200px]">
                  HOTFAST PH Subscription Payment
                </span>
              </div>
            </div>
          </div>

          {/* Quick screenshot tip for mobile users */}
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-left space-y-1">
            <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-emerald-400 uppercase">
              <Sparkles size={12} />
              Mobile Screenshot Shortcut:
            </div>
            <p className="text-[9px] font-mono text-slate-300 leading-relaxed">
              • <strong>Android</strong>: Press <strong>Power + Volume Down</strong> buttons together.<br />
              • <strong>iPhone</strong>: Press <strong>Side Button + Volume Up</strong> together.<br />
              Or click the <strong>&quot;Auto-Download Slip&quot;</strong> button below to save directly to your gallery!
            </p>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-4 bg-slate-900/95 border-t border-slate-800 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCaptureScreenshot}
              disabled={capturing}
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-mono font-bold uppercase tracking-wider rounded flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer min-h-[40px]"
              title="Capture and download high-resolution payment slip"
            >
              <Camera size={14} className={capturing ? 'animate-spin' : ''} />
              <span>{capturing ? 'Capturing...' : 'Auto-Download Slip'}</span>
            </button>

            <button
              type="button"
              onClick={copyRefId}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-mono font-bold uppercase tracking-wider rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[40px]"
              title="Copy Reference ID to clipboard"
            >
              {copiedRef ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copiedRef ? 'Ref Copied!' : 'Copy Ref ID'}</span>
            </button>
          </div>

          {onProceedToUpload && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onProceedToUpload();
              }}
              className="w-full py-2.5 px-3 bg-primary/20 hover:bg-primary/30 border border-primary/50 text-primary hover:text-white text-[10px] font-mono font-bold uppercase tracking-wider rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
            >
              <Upload size={13} />
              <span>Proceed to Upload Receipt Proof &darr;</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
