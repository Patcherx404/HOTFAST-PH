import React, { useState } from 'react';
import { ShieldCheck, X, Lock, Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface ComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ComplianceModal: React.FC<ComplianceModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const policyText = `CLIENT PRIVACY AND DATA PROTECTION
HOTFAST PH (Hotfast.online)

At Hotfast.online, mahalaga sa amin ang privacy at security ng bawat client. Nauunawaan namin na ang personal information na ibinibigay ng aming clients ay pribado at dapat pangalagaan nang maayos.

Ang impormasyon tulad ng pangalan, contact details, account information, service details, payment records, at iba pang kinakailangang data ay kinokolekta lamang para sa mga lehitimong layunin, tulad ng account management, billing, customer support, service activation, maintenance, at pagpapabuti ng aming services.

Hindi namin ibinabahagi o ibinibigay ang personal information ng clients sa unauthorized individuals o third parties maliban kung kinakailangan para sa lehitimong business purpose, legal requirement, o may naaangkop na authorization.

Gumagamit ang Hotfast.online ng mga security measures upang makatulong na maprotektahan ang client information laban sa unauthorized access, pagkawala, alteration, misuse, at data breaches. Ang access sa confidential information ay nililimitahan lamang sa mga taong awtorisadong humawak nito bilang bahagi ng kanilang responsibilidad.

Bilang isang internet service provider, kinikilala namin na ang privacy at security ng aming clients ay mahalagang bahagi ng aming serbisyo. Patuloy naming pinapabuti ang aming systems, policies, at security practices upang mapanatili ang tiwala at proteksyon ng aming mga clients.

Sa paggamit ng Hotfast.online services, inaasahan naming nauunawaan at pinahahalagahan ng bawat client ang kahalagahan ng responsible data handling at digital security.

Your data. Your privacy. Our responsibility.
HOTFAST.ONLINE NETWORK OPERATIONS • DATA PRIVACY STANDARD`;

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(policyText);
      setCopied(true);
      toast.success('Statement copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-[#0a0e17] border border-primary/50 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-primary/30 relative space-y-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/40 text-[10px] font-mono font-bold uppercase tracking-wider text-primary">
              <ShieldCheck size={12} className="text-primary" />
              Official Compliance Statement
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-white p-1.5 rounded-lg bg-slate-900/80 border border-border-subtle transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Heading */}
        <div>
          <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
            Client Privacy and Data Protection
          </h2>
          <p className="text-[11px] font-mono text-text-muted mt-1 uppercase tracking-wider">
            Hotfast.online Network Operations • Data Security Standard
          </p>
        </div>

        {/* Policy Body */}
        <div className="space-y-4 text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
          <p>
            At <strong className="text-white font-bold">Hotfast.online</strong>, mahalaga sa amin ang privacy at security ng bawat client. Nauunawaan namin na ang personal information na ibinibigay ng aming clients ay pribado at dapat pangalagaan nang maayos.
          </p>

          <p>
            Ang impormasyon tulad ng pangalan, contact details, account information, service details, payment records, at iba pang kinakailangang data ay kinokolekta lamang para sa mga lehitimong layunin, tulad ng account management, billing, customer support, service activation, maintenance, at pagpapabuti ng aming services.
          </p>

          <p>
            Hindi namin ibinabahagi o ibinibigay ang personal information ng clients sa unauthorized individuals o third parties maliban kung kinakailangan para sa lehitimong business purpose, legal requirement, o may naaangkop na authorization.
          </p>

          <p>
            Gumagamit ang Hotfast.online ng mga security measures upang makatulong na maprotektahan ang client information laban sa unauthorized access, pagkawala, alteration, misuse, at data breaches. Ang access sa confidential information ay nililimitahan lamang sa mga taong awtorisadong humawak nito bilang bahagi ng kanilang responsibilidad.
          </p>

          <div className="p-4 bg-slate-900/90 border-l-4 border-primary rounded-r-xl my-4 text-slate-100">
            <p className="m-0 font-medium">
              Bilang isang internet service provider, kinikilala namin na ang <strong className="text-primary font-bold">privacy at security ng aming clients ay mahalagang bahagi ng aming serbisyo</strong>. Patuloy naming pinapabuti ang aming systems, policies, at security practices upang mapanatili ang tiwala at proteksyon ng aming mga clients.
            </p>
          </div>

          <p>
            Sa paggamit ng Hotfast.online services, inaasahan naming nauunawaan at pinahahalagahan ng bawat client ang kahalagahan ng responsible data handling at digital security.
          </p>
        </div>

        {/* Closing Motto */}
        <div className="p-4 bg-primary/10 border border-primary/30 rounded-xl text-center">
          <p className="text-sm sm:text-base font-black uppercase tracking-wider text-white italic">
            Your data. <span className="text-primary not-italic">Your privacy.</span> Our responsibility.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border-subtle">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted">
            <Lock size={12} className="text-primary" />
            <span>256-Bit SSL Encrypted &amp; DPA Compliant</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleCopyText}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-border-subtle text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Copy Text to Clipboard"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              <span>{copied ? "Copied" : "Copy Statement"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-primary hover:bg-red-700 text-white font-black uppercase text-[10px] tracking-wider rounded-lg border border-red-500 transition-colors cursor-pointer shadow-sm shadow-primary/20"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
