import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  X,
  Share2,
  PlusSquare,
  Download,
  Laptop,
  Check,
  Copy,
  ExternalLink,
  AlertTriangle,
  Zap,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';

export interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall: () => Promise<boolean>;
  isInstallable: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isInAppBrowser?: boolean;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  onInstall,
  isInstallable,
  isIOS,
  isAndroid,
  isInAppBrowser = false,
}) => {
  const [activeTab, setActiveTab] = useState<'auto' | 'ios' | 'android' | 'desktop'>('auto');
  const [copied, setCopied] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // Determine initial tab based on detected platform
  useEffect(() => {
    if (isIOS) {
      setActiveTab('ios');
    } else if (isAndroid) {
      setActiveTab('android');
    } else {
      setActiveTab('desktop');
    }
  }, [isIOS, isAndroid]);

  if (!isOpen) return null;

  const currentTab = activeTab;

  const handleNativeInstall = async () => {
    try {
      setIsInstalling(true);
      const success = await onInstall();
      if (success) {
        toast.success('HOTFAST PH App installed successfully to your Home Screen!');
        onClose();
      } else if (!isInstallable) {
        // If native prompt wasn't available, switch to platform guide
        if (isIOS) setActiveTab('ios');
        else if (isAndroid) setActiveTab('android');
        else setActiveTab('desktop');
      }
    } catch (err) {
      console.error('Install prompt error:', err);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCopyLink = () => {
    const url = typeof window !== 'undefined' ? window.location.href : 'https://hotfast.ph';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
          .then(() => {
            setCopied(true);
            toast.success('Website link copied to clipboard!');
            setTimeout(() => setCopied(false), 2500);
          })
          .catch(() => fallbackCopy(url));
      } else {
        fallbackCopy(url);
      }
    } catch {
      fallbackCopy(url);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      toast.success('Website link copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.info(`URL: ${text}`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
      id="pwa-install-modal-backdrop"
    >
      <div
        className="w-full max-w-lg bg-[#0a0e17] border border-primary/40 rounded-2xl p-5 sm:p-6 shadow-2xl shadow-primary/20 relative space-y-5 my-auto max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        id="pwa-install-modal-container"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-white p-2 rounded-xl bg-slate-900/90 border border-border-subtle transition-colors cursor-pointer hover:border-primary/50"
          aria-label="Close Install Dialog"
          id="pwa-modal-close-btn"
        >
          <X size={16} />
        </button>

        {/* App Identity Banner */}
        <div className="flex items-center gap-3.5 pr-8">
          <div className="w-14 h-14 rounded-2xl p-1 bg-slate-900 border-2 border-primary/70 shadow-lg shadow-primary/30 shrink-0 flex items-center justify-center overflow-hidden">
            <img
              src="/hoticon2.png"
              alt="HOTFAST PH"
              className="w-full h-full object-contain"
              onError={(e) => {
                // Fallback to favicon if hoticon2 fails
                (e.target as HTMLImageElement).src = '/favicon.png';
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black uppercase italic tracking-tight text-white leading-tight">
                HOTFAST <span className="text-primary not-italic">PH</span>
              </h3>
              <span className="text-[9px] font-mono font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded border border-primary/30 uppercase">
                PWA
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              High-Speed Fiber Portal &amp; Billing App
            </p>
          </div>
        </div>

        {/* Feature Pills */}
        <div className="grid grid-cols-3 gap-2 py-1 text-center">
          <div className="p-2 bg-slate-900/70 border border-border-subtle rounded-xl">
            <Zap size={14} className="text-primary mx-auto mb-1" />
            <span className="text-[10px] font-bold text-slate-200 block">1-Tap Launch</span>
          </div>
          <div className="p-2 bg-slate-900/70 border border-border-subtle rounded-xl">
            <ShieldCheck size={14} className="text-emerald-400 mx-auto mb-1" />
            <span className="text-[10px] font-bold text-slate-200 block">GCash Billing</span>
          </div>
          <div className="p-2 bg-slate-900/70 border border-border-subtle rounded-xl">
            <Smartphone size={14} className="text-blue-400 mx-auto mb-1" />
            <span className="text-[10px] font-bold text-slate-200 block">Offline Ready</span>
          </div>
        </div>

        {/* In-App Browser Warning (Messenger, FB, IG, TikTok) */}
        {isInAppBrowser && (
          <div className="p-3.5 bg-amber-950/40 border border-amber-500/50 rounded-xl space-y-2 text-left">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <AlertTriangle size={15} />
              <span>In-App Browser Detected</span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              Social media apps (Facebook, Messenger, Instagram, TikTok) restrict home screen installation.
            </p>
            <div className="text-[11px] text-slate-300 space-y-1 pl-1">
              <p>1. Tap the <strong>•••</strong> menu at the top-right corner of this screen.</p>
              <p>2. Tap <strong>&quot;Open in Chrome&quot;</strong> or <strong>&quot;Open in Safari&quot;</strong>.</p>
              <p>3. Add to Home Screen from your real browser.</p>
            </div>
          </div>
        )}

        {/* One-Click Native Install Button (if browser supports direct install) */}
        {isInstallable && !isInAppBrowser && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleNativeInstall}
              disabled={isInstalling}
              className="w-full py-3.5 px-5 bg-gradient-to-r from-red-600 via-primary to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black uppercase text-xs tracking-[0.15em] flex items-center justify-center gap-2 rounded-xl shadow-xl shadow-primary/30 active:scale-[0.98] transition-all cursor-pointer border border-red-500 disabled:opacity-50"
              id="pwa-native-install-button"
            >
              <Download size={16} />
              <span>{isInstalling ? 'Opening Browser Dialog...' : 'Install HOTFAST PH App'}</span>
            </button>
            <p className="text-[10px] text-center text-text-muted">
              Click to open Chrome/Edge native install confirmation dialog
            </p>
          </div>
        )}

        {/* Platform Guidance Tabs */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">
              Installation Instructions
            </span>
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-border-subtle text-[10px]">
              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                className={`px-2.5 py-1 rounded-md font-bold uppercase transition-colors cursor-pointer ${
                  currentTab === 'ios'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-muted hover:text-white'
                }`}
              >
                iOS (iPhone)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`px-2.5 py-1 rounded-md font-bold uppercase transition-colors cursor-pointer ${
                  currentTab === 'android'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-muted hover:text-white'
                }`}
              >
                Android
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('desktop')}
                className={`px-2.5 py-1 rounded-md font-bold uppercase transition-colors cursor-pointer ${
                  currentTab === 'desktop'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-muted hover:text-white'
                }`}
              >
                PC / Mac
              </button>
            </div>
          </div>

          {/* iOS Instructions */}
          {currentTab === 'ios' && (
            <div className="bg-slate-900/60 border border-border-subtle rounded-xl p-4 space-y-3 text-left">
              <div className="flex items-center gap-2 text-xs font-bold text-white uppercase">
                <Smartphone size={14} className="text-primary" />
                <span>iPhone &amp; iPad Safari Instructions</span>
              </div>
              <ol className="text-xs text-slate-300 space-y-2.5 pl-2">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Open this page in <strong>Safari</strong> and tap the{' '}
                    <strong className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-white font-mono text-[11px]">
                      <Share2 size={12} className="text-blue-400" /> Share
                    </strong>{' '}
                    button in the bottom toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Scroll down the sharing sheet and tap{' '}
                    <strong className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-emerald-400 font-mono text-[11px]">
                      <PlusSquare size={12} /> Add to Home Screen
                    </strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Tap <strong>Add</strong> in the top-right corner. The HOTFAST PH icon will now appear on your home screen!
                  </span>
                </li>
              </ol>
            </div>
          )}

          {/* Android Instructions */}
          {currentTab === 'android' && (
            <div className="bg-slate-900/60 border border-border-subtle rounded-xl p-4 space-y-3 text-left">
              <div className="flex items-center gap-2 text-xs font-bold text-white uppercase">
                <Smartphone size={14} className="text-emerald-400" />
                <span>Android Chrome / Samsung Internet Instructions</span>
              </div>
              <ol className="text-xs text-slate-300 space-y-2.5 pl-2">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Tap the <strong>Three Dots Menu (⋮)</strong> at the top right of your browser.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Select{' '}
                    <strong className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-white font-mono text-[11px]">
                      <Download size={12} className="text-primary" /> Install app
                    </strong>{' '}
                    or <strong>&quot;Add to Home screen&quot;</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Confirm by tapping <strong>Install</strong>. The app will launch standalone without browser bars.
                  </span>
                </li>
              </ol>
            </div>
          )}

          {/* Desktop Instructions */}
          {currentTab === 'desktop' && (
            <div className="bg-slate-900/60 border border-border-subtle rounded-xl p-4 space-y-3 text-left">
              <div className="flex items-center gap-2 text-xs font-bold text-white uppercase">
                <Laptop size={14} className="text-blue-400" />
                <span>Windows, Mac &amp; Chromebook Instructions</span>
              </div>
              <ol className="text-xs text-slate-300 space-y-2.5 pl-2">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Look at the right side of the address bar for the{' '}
                    <strong className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-white font-mono text-[11px]">
                      <Download size={12} className="text-primary" /> Install
                    </strong>{' '}
                    icon.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Or click browser menu <strong>(⋮)</strong> &gt; <strong>Save and share</strong> &gt; <strong>Install HOTFAST PH</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Click <strong>Install</strong> to add a desktop icon and taskbar launcher.
                  </span>
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-bold uppercase tracking-wider rounded-xl border border-border-subtle flex items-center justify-center gap-2 transition-colors cursor-pointer"
            id="pwa-copy-link-btn"
          >
            {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
            <span>{copied ? 'Link Copied!' : 'Copy App Link'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-3 px-6 bg-slate-950 hover:bg-slate-900 text-text-muted hover:text-white text-xs font-bold uppercase tracking-wider rounded-xl border border-border-subtle transition-colors cursor-pointer"
            id="pwa-dismiss-btn"
          >
            Got It / Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Aliased export so any code importing PWAInstallPrompt works seamlessly
export const PWAInstallPrompt = PWAInstallModal;

export const PWAInstallBanner: React.FC<{
  onOpenModal: () => void;
  isInstalled: boolean;
}> = ({ onOpenModal, isInstalled }) => {
  if (isInstalled) return null;

  return (
    <div
      className="bg-gradient-to-r from-red-950/50 via-slate-900 to-slate-900 border border-primary/40 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl shadow-black/40 relative overflow-hidden group"
      id="pwa-install-banner-root"
    >
      <div className="absolute -right-12 -top-12 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-center gap-3.5 w-full sm:w-auto relative z-10">
        <div className="w-12 h-12 rounded-xl p-1 bg-slate-900 border border-primary/50 shrink-0 flex items-center justify-center shadow-lg shadow-primary/20">
          <img
            src="/hoticon2.png"
            alt="HOTFAST Icon"
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/favicon.png';
            }}
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
              Install HOTFAST PH App
            </h4>
            <span className="text-[9px] bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded font-mono font-bold">
              FREE PWA
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-text-muted mt-0.5">
            1-tap home screen access for speed tests, bill settlement &amp; statement ledger.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenModal}
        className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-red-600 to-primary hover:from-red-500 hover:to-red-600 text-white font-black uppercase text-[10px] tracking-[0.2em] italic flex items-center justify-center gap-2 rounded-xl transition-all shrink-0 shadow-lg shadow-primary/30 border border-red-500 cursor-pointer active:scale-[0.98] relative z-10"
        id="pwa-banner-open-modal-btn"
      >
        <Smartphone size={14} />
        <span>Add to Home Screen</span>
      </button>
    </div>
  );
};
