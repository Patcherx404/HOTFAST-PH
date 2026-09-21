import React from 'react';
import { Plus, X, Smartphone } from 'lucide-react';

export const PWAInstallModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onInstall: () => Promise<boolean>;
  isInstallable: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isInAppBrowser?: boolean;
}> = ({ isOpen, onClose, onInstall, isIOS }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[10000] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-sm sm:max-w-md bg-[#0a0e17] border border-primary/50 rounded-2xl p-5 sm:p-6 shadow-2xl shadow-primary/30 relative space-y-5 animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 text-text-muted hover:text-white p-1.5 rounded-lg bg-slate-900/80 border border-border-subtle transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* App Icon & Title */}
        <div className="flex items-center gap-3.5 pr-8">
          <div className="w-14 h-14 rounded-2xl p-1 bg-slate-900 border-2 border-primary/60 shadow-lg shadow-primary/30 shrink-0 flex items-center justify-center">
            <img src="/hoticon2.png" alt="HOTFAST PH" className="w-full h-full object-contain" />
          </div>
          <div>
            <h3 className="text-lg font-black uppercase italic tracking-tight text-white leading-tight">
              HOTFAST <span className="text-primary not-italic">PH</span>
            </h3>
            <p className="text-xs text-primary font-mono font-bold uppercase tracking-wider mt-0.5">
              Add to Home Screen
            </p>
          </div>
        </div>

        {/* Simple Description */}
        <p className="text-sm text-slate-200 font-sans leading-relaxed">
          Install HOTFAST PH to your Home Screen for instant 1-tap billing, speed monitoring, and portal access.
        </p>

        {/* Direct Action Buttons - No Instructions */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            onClick={async () => {
              const installed = await onInstall();
              if (installed) {
                onClose();
              } else if (isIOS) {
                alert("To add to Home Screen: tap the Share button in Safari, then tap 'Add to Home Screen'.");
                onClose();
              } else {
                onClose();
              }
            }}
            className="flex-1 py-3 px-4 bg-primary hover:bg-red-700 text-white font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 rounded-xl shadow-lg shadow-primary/30 active:scale-[0.98] transition-all cursor-pointer border border-red-500"
          >
            <Plus size={16} />
            <span>Add to Home Screen</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-bold uppercase text-xs tracking-wider rounded-xl border border-border-subtle transition-colors cursor-pointer text-center"
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
};

export const PWAInstallBanner: React.FC<{
  onOpenModal: () => void;
  isInstalled: boolean;
}> = ({ onOpenModal, isInstalled }) => {
  if (isInstalled) return null;

  return (
    <div className="bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900 border border-primary/30 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-black/40">
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="w-11 h-11 rounded-lg p-1 bg-slate-900 border border-primary/40 shrink-0 flex items-center justify-center shadow-md">
          <img src="/hoticon2.png" alt="HOTFAST Icon" className="w-full h-full object-contain" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">
              Install HOTFAST PH App
            </h4>
            <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono font-bold">
              FREE
            </span>
          </div>
          <p className="text-[11px] text-text-muted">
            Add to home screen for 1-tap GCash payments, bill checks &amp; data stats.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenModal}
        className="w-full sm:w-auto px-4 py-2.5 bg-primary hover:bg-red-700 text-white font-black uppercase text-[10px] tracking-[0.2em] italic flex items-center justify-center gap-2 rounded-lg transition-all shrink-0 shadow-md shadow-primary/20 border border-red-500 cursor-pointer"
      >
        <Smartphone size={14} />
        <span>Add to Home Screen</span>
      </button>
    </div>
  );
};

