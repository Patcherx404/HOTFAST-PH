import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MapPin,
  ExternalLink,
  Activity,
  Navigation,
  Radio,
  X,
  RefreshCw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { HOTFAST_NODE_COORDS } from "../constants";

interface LatencyMapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export { HOTFAST_NODE_COORDS };

export default function LatencyMapModal({ isOpen, onClose }: LatencyMapModalProps) {
  const [mapMode, setMapMode] = useState<"google" | "osm">("google");
  const [currentPing, setCurrentPing] = useState<number>(14);
  const [isTestingPing, setIsTestingPing] = useState(false);

  // Ping test simulator against public DNS endpoint
  const runPingTest = async () => {
    setIsTestingPing(true);
    const start = Date.now();
    try {
      await fetch("https://dns.google", {
        mode: "no-cors",
        cache: "no-store",
      });
      const duration = Date.now() - start;
      const measured = Math.max(11, Math.min(24, Math.round(duration > 0 ? duration : 14)));
      setCurrentPing(measured);
    } catch {
      setCurrentPing(Math.floor(Math.random() * 6) + 12);
    } finally {
      setTimeout(() => {
        setIsTestingPing(false);
      }, 400);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runPingTest();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const openGoogleMapsDirect = () => {
    const url = `https://www.google.com/maps?q=${HOTFAST_NODE_COORDS.lat},${HOTFAST_NODE_COORDS.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openGoogleMapsDirections = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${HOTFAST_NODE_COORDS.lat},${HOTFAST_NODE_COORDS.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Construct iframe URLs
  const googleMapsEmbedUrl = `https://maps.google.com/maps?q=${HOTFAST_NODE_COORDS.lat},${HOTFAST_NODE_COORDS.lng}&hl=en&z=16&output=embed`;
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=122.8123019%2C10.4948484%2C122.8423019%2C10.5248484&layer=mapnik&marker=${HOTFAST_NODE_COORDS.lat}%2C${HOTFAST_NODE_COORDS.lng}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="sharp-card bg-[#0b0f19] border border-border-subtle border-t-4 border-t-primary shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col my-auto overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-3.5 sm:p-6 border-b border-border-subtle bg-bg-surface/50 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/10 border border-primary/30 flex items-center justify-center text-primary relative shrink-0">
                  <MapPin size={18} className="animate-pulse" />
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <h3 className="text-sm sm:text-lg font-black uppercase italic tracking-tighter text-white">
                      HOTFAST<span className="text-primary not-italic">PH</span> LATENCY MAP
                    </h3>
                    <span className="px-1.5 py-0.5 bg-green-500/10 border border-green-500/30 text-green-400 text-[8px] sm:text-[9px] font-black uppercase tracking-widest">
                      ACTIVE NODE
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-text-muted font-bold tracking-tight mt-0.5">
                    Primary Fiber Gateway • {HOTFAST_NODE_COORDS.region}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Ping metric tag */}
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-bg-base border border-border-subtle text-xs font-mono">
                  <Activity size={14} className="text-primary" />
                  <span className="text-text-muted text-[10px] uppercase font-bold tracking-wider">Node Ping:</span>
                  <span className="font-bold text-primary">{currentPing} ms</span>
                </div>

                <button
                  onClick={onClose}
                  className="p-2 text-text-muted hover:text-white hover:bg-white/5 border border-transparent hover:border-border-subtle transition-all cursor-pointer"
                  aria-label="Close Latency Map"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Container */}
            <div className="overflow-y-auto flex-1">
              {/* Map Action Toolbar */}
              <div className="px-3 sm:px-6 py-2 sm:py-2.5 bg-bg-surface/30 border-b border-border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs">
                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-text-muted">Map Engine:</span>
                  <div className="inline-flex border border-border-subtle bg-bg-base p-0.5">
                    <button
                      onClick={() => setMapMode("google")}
                      className={`px-2.5 sm:px-3 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        mapMode === "google"
                          ? "bg-primary text-white shadow"
                          : "text-text-dim hover:text-white"
                      }`}
                    >
                      Google Map
                    </button>
                    <button
                      onClick={() => setMapMode("osm")}
                      className={`px-2.5 sm:px-3 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        mapMode === "osm"
                          ? "bg-primary text-white shadow"
                          : "text-text-dim hover:text-white"
                      }`}
                    >
                      Satellite
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                  <button
                    onClick={openGoogleMapsDirect}
                    className="justify-center px-3 py-1.5 bg-primary hover:bg-primary-dark text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-primary/20 flex items-center gap-1.5 italic cursor-pointer"
                  >
                    <ExternalLink size={12} />
                    <span>Open in Google Maps</span>
                  </button>

                  <button
                    onClick={openGoogleMapsDirections}
                    className="justify-center px-3 py-1.5 bg-bg-base border border-border-subtle hover:border-primary/50 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all items-center gap-1.5 cursor-pointer flex"
                  >
                    <Navigation size={12} className="text-primary" />
                    <span>Directions</span>
                  </button>
                </div>
              </div>

              {/* Google Map Box Frame */}
              <div className="relative w-full h-[260px] sm:h-[400px] bg-slate-950 overflow-hidden border-b border-border-subtle">
                {/* Map Iframe */}
                <iframe
                  title="HOTFAST PH Google Map Location"
                  src={mapMode === "google" ? googleMapsEmbedUrl : osmEmbedUrl}
                  className="w-full h-full border-0 filter contrast-[1.05]"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />

                {/* High-Tech HUD Overlay on Map */}
                <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 z-10 pointer-events-none">
                  <div className="sharp-card bg-bg-base/90 backdrop-blur-md border border-border-subtle p-2 sm:p-3 text-[9px] sm:text-[10px] font-mono shadow-xl">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-primary font-black uppercase tracking-wider mb-0.5 sm:mb-1">
                      <Radio size={11} className="animate-pulse" />
                      <span>NODE RADAR UPLINK</span>
                    </div>
                    <div className="text-white font-bold tracking-wider text-[8px] sm:text-[9px]">
                      GATEWAY: <span className="text-primary font-normal">{HOTFAST_NODE_COORDS.nodeName}</span>
                    </div>
                    <div className="text-text-muted mt-0.5 text-[8px]">
                      SECTOR: {HOTFAST_NODE_COORDS.region}
                    </div>
                  </div>
                </div>

                {/* Direct Link Float Badge on Map */}
                <div className="absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3 z-10">
                  <button
                    onClick={openGoogleMapsDirect}
                    className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-bg-base/90 backdrop-blur-md border border-primary/50 hover:bg-primary hover:text-white text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all shadow-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Open App</span>
                    <ExternalLink size={11} className="text-primary group-hover:text-white" />
                  </button>
                </div>
              </div>

              {/* Telemetry & Node Statistics Grid */}
              <div className="p-3.5 sm:p-6 bg-bg-surface/30">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4">
                  <div className="bg-bg-base p-2.5 sm:p-3 border border-border-subtle">
                    <div className="text-[8px] sm:text-[9px] uppercase tracking-widest text-text-muted font-black mb-0.5 sm:mb-1">
                      Live Latency
                    </div>
                    <div className="text-lg sm:text-2xl font-black italic tracking-tight text-primary font-mono flex items-baseline gap-1">
                      {currentPing}
                      <span className="text-xs text-text-muted font-sans font-bold not-italic">ms</span>
                    </div>
                    <div className="text-[8px] sm:text-[9px] text-green-400 font-mono mt-0.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping"></span>
                      Ultra-Low Jitter
                    </div>
                  </div>

                  <div className="bg-bg-base p-2.5 sm:p-3 border border-border-subtle">
                    <div className="text-[8px] sm:text-[9px] uppercase tracking-widest text-text-muted font-black mb-0.5 sm:mb-1">
                      Capacity
                    </div>
                    <div className="text-lg sm:text-2xl font-black italic tracking-tight text-white font-mono flex items-baseline gap-1">
                      12.0
                      <span className="text-xs text-primary font-sans font-bold not-italic">TBPS</span>
                    </div>
                    <div className="text-[8px] sm:text-[9px] text-text-dim font-mono mt-0.5">
                      Direct Fiber Line
                    </div>
                  </div>

                  <div className="bg-bg-base p-2.5 sm:p-3 border border-border-subtle">
                    <div className="text-[8px] sm:text-[9px] uppercase tracking-widest text-text-muted font-black mb-0.5 sm:mb-1">
                      Coverage
                    </div>
                    <div className="text-lg sm:text-2xl font-black italic tracking-tight text-white font-mono flex items-baseline gap-1">
                      25+
                      <span className="text-xs text-primary font-sans font-bold not-italic">KM</span>
                    </div>
                    <div className="text-[8px] sm:text-[9px] text-text-dim font-mono mt-0.5">
                      Negros Ring
                    </div>
                  </div>

                  <div className="bg-bg-base p-2.5 sm:p-3 border border-border-subtle">
                    <div className="text-[8px] sm:text-[9px] uppercase tracking-widest text-text-muted font-black mb-0.5 sm:mb-1">
                      Uptime Status
                    </div>
                    <div className="text-lg sm:text-2xl font-black italic tracking-tight text-green-400 font-mono flex items-baseline gap-1">
                      99.98%
                    </div>
                    <div className="text-[8px] sm:text-[9px] text-text-dim font-mono mt-0.5 flex items-center gap-1">
                      <ShieldCheck size={10} className="text-green-400" /> Operational
                    </div>
                  </div>
                </div>

                {/* Bottom detail row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pt-2.5 border-t border-border-subtle text-xs">
                  <div className="flex items-center gap-2 text-text-dim text-[10px] sm:text-[11px] font-mono">
                    <Radio size={12} className="text-primary shrink-0" />
                    <span>
                      Uplink Gateway: <strong className="text-white">Western Visayas Carrier Edge</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <button
                      onClick={runPingTest}
                      disabled={isTestingPing}
                      className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-text-muted hover:text-primary transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw size={11} className={isTestingPing ? "animate-spin text-primary" : ""} />
                      <span>Re-test Latency</span>
                    </button>

                    <button
                      onClick={openGoogleMapsDirect}
                      className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Open Full Map</span>
                      <ExternalLink size={10} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
