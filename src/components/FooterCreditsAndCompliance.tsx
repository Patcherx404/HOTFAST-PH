import React from 'react';
import { ShieldCheck, Code2, Facebook, ExternalLink, ArrowRight, Lock, CheckCircle2 } from 'lucide-react';

interface FooterCreditsAndComplianceProps {
  onOpenCompliance?: () => void;
}

export const FooterCreditsAndCompliance: React.FC<FooterCreditsAndComplianceProps> = ({
  onOpenCompliance,
}) => {
  return (
    <div id="footer-credits-compliance-section" className="w-full mb-12 sm:mb-16">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-stretch">
        {/* LEFT COLUMN: COMPLIANCE */}
        <div 
          id="footer-compliance-section"
          className="rounded-2xl bg-bg-surface/50 border border-border-subtle hover:border-border-subtle/80 p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 relative overflow-hidden group shadow-lg shadow-black/30"
        >
          {/* Subtle glowing accent */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none -mr-10 -mt-10" />

          <div>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                    Compliance
                  </h3>
                  <p className="text-[11px] font-mono text-text-muted">
                    Client Privacy &amp; Data Protection
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider shrink-0">
                <Lock size={10} /> DPA COMPLIANT
              </span>
            </div>

            {/* Content summary */}
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans mb-4">
              At <strong className="text-white font-semibold">Hotfast.online</strong>, mahalaga sa amin ang privacy at security ng bawat client. Nauunawaan namin na ang personal information na ibinibigay ng aming clients ay pribado at dapat pangalagaan nang maayos laban sa unauthorized access.
            </p>

            {/* Key badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/70 border border-border-subtle/60 text-[11px] text-slate-300">
                <CheckCircle2 size={12} className="text-primary shrink-0" />
                <span className="truncate">256-Bit SSL Encrypted</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/70 border border-border-subtle/60 text-[11px] text-slate-300">
                <CheckCircle2 size={12} className="text-primary shrink-0" />
                <span className="truncate">Authorized Access Only</span>
              </div>
            </div>

            {/* Motto */}
            <div className="p-3.5 bg-primary/10 border border-primary/25 rounded-xl text-center mb-5">
              <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-white italic">
                Your data. <span className="text-primary not-italic">Your privacy.</span> Our responsibility.
              </p>
            </div>
          </div>

          {/* Action trigger */}
          <div className="pt-4 border-t border-border-subtle/70 flex items-center justify-between gap-3">
            <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
              Hotfast Network Operations
            </span>
            <button
              type="button"
              onClick={onOpenCompliance}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary/20 hover:bg-primary text-white hover:text-white border border-primary/40 hover:border-primary rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm active:scale-95"
            >
              <span>View Full Policy</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: CREDITS & DEVELOPMENT */}
        <div 
          id="footer-credits-section"
          className="rounded-2xl bg-bg-surface/50 border border-border-subtle hover:border-border-subtle/80 p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 relative overflow-hidden group shadow-lg shadow-black/30"
        >
          {/* Subtle glowing accent */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none -mr-10 -mt-10" />

          <div>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
                  <Code2 size={18} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black uppercase tracking-tight text-white">
                    Credits &amp; Development
                  </h3>
                  <p className="text-[11px] font-mono text-text-muted">
                    Engineering, Infrastructure &amp; Field Ops
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-[9px] font-mono font-bold text-primary uppercase tracking-wider shrink-0">
                CORE TEAM
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans mb-4">
              Dedicated personnel ensuring high-speed internet delivery, network reliability, server infrastructure, and on-ground client connectivity across Hotfast.online.
            </p>

            {/* Profile Cards (2 profiles) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-5">
              {/* Profile 1: IT Administrator */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-border-subtle/80 hover:border-primary/50 transition-all duration-300 flex flex-col items-center text-center group/card hover:shadow-md hover:shadow-primary/10">
                <div className="relative mb-3">
                  <img
                    src="/personal/it-is-admin.jpg"
                    alt="IT Administrator"
                    onError={(e) => {
                      // Fallback to alternate local directory paths
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes('it-admin.jpg')) {
                        target.src = '/personnels/it-admin.jpg';
                      }
                    }}
                    className="w-16 h-16 sm:w-18 sm:h-18 rounded-full object-cover border-2 border-primary/40 group-hover/card:border-primary transition-all duration-300 shadow-md shadow-black/50"
                  />
                  <span 
                    className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-900" 
                    title="Active Systems"
                  />
                </div>

                <h4 className="text-sm font-black text-white uppercase tracking-tight group-hover/card:text-primary transition-colors">
                  IT Administrator
                </h4>
                <p className="text-[10px] font-mono text-text-muted mt-0.5 uppercase tracking-wider">
                  Network Systems &amp; Dev
                </p>

                <a
                  href="https://www.facebook.com/profile.php?id=100084526025811"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3.5 inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1877F2]/15 hover:bg-[#1877F2] text-[#1877F2] hover:text-white border border-[#1877F2]/35 hover:border-[#1877F2] text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95 group/btn w-full max-w-[130px]"
                >
                  <Facebook size={12} className="fill-current shrink-0" />
                  <span>Facebook</span>
                  <ExternalLink size={10} className="opacity-70 group-hover/btn:opacity-100 shrink-0" />
                </a>
              </div>

              {/* Profile 2: Onsite Manager */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-border-subtle/80 hover:border-primary/50 transition-all duration-300 flex flex-col items-center text-center group/card hover:shadow-md hover:shadow-primary/10">
                <div className="relative mb-3">
                  <img
                    src="/personal/reumel.jpg"
                    alt="Onsite Manager"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes('/personnels/reumel.jpg')) {
                        target.src = '/personnels/reumel.jpg';
                      }
                    }}
                    className="w-16 h-16 sm:w-18 sm:h-18 rounded-full object-cover border-2 border-primary/40 group-hover/card:border-primary transition-all duration-300 shadow-md shadow-black/50"
                  />
                  <span 
                    className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-900" 
                    title="Active Onsite Operations"
                  />
                </div>

                <h4 className="text-sm font-black text-white uppercase tracking-tight group-hover/card:text-primary transition-colors">
                  Onsite Manager
                </h4>
                <p className="text-[10px] font-mono text-text-muted mt-0.5 uppercase tracking-wider">
                  Field Operations &amp; Ops
                </p>

                <a
                  href="https://www.facebook.com/reumel.gems.apol.ii"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3.5 inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1877F2]/15 hover:bg-[#1877F2] text-[#1877F2] hover:text-white border border-[#1877F2]/35 hover:border-[#1877F2] text-[11px] font-bold uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95 group/btn w-full max-w-[130px]"
                >
                  <Facebook size={12} className="fill-current shrink-0" />
                  <span>Facebook</span>
                  <ExternalLink size={10} className="opacity-70 group-hover/btn:opacity-100 shrink-0" />
                </a>
              </div>
            </div>
          </div>

          {/* Bottom row */}
          <div className="pt-4 border-t border-border-subtle/70 flex items-center justify-between gap-3 text-[10px] font-mono text-text-muted">
            <span className="uppercase tracking-wider">Hotfast Fiber ISP</span>
            <span className="text-primary font-bold uppercase tracking-wider">Philippines</span>
          </div>
        </div>
      </div>
    </div>
  );
};
