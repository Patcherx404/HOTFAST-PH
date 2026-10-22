import React from "react";
import {
  MapPin,
  ExternalLink,
  Activity,
  Radio,
  Maximize2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { HOTFAST_NODE_COORDS } from "../constants";

interface LatencyMapSectionProps {
  onOpenMapModal: () => void;
  latency?: number;
}

export default function LatencyMapSection({
  onOpenMapModal,
  latency = 14,
}: LatencyMapSectionProps) {
  const openGoogleMapsDirect = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://www.google.com/maps?q=${HOTFAST_NODE_COORDS.lat},${HOTFAST_NODE_COORDS.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const mapEmbedUrl = `https://maps.google.com/maps?q=${HOTFAST_NODE_COORDS.lat},${HOTFAST_NODE_COORDS.lng}&hl=en&z=15&output=embed`;

  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6 max-w-7xl mx-auto" id="latency-map">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 sm:mb-12 gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border-l-2 border-primary text-primary text-[10px] font-black uppercase tracking-[0.3em] mb-3 sm:mb-4">
            <Radio size={12} className="animate-pulse" /> NETWORK INFRASTRUCTURE RADAR
          </div>
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tighter uppercase italic text-white">
            LATENCY <span className="text-primary not-italic">MAP</span>
          </h2>
          <p className="text-text-dim text-xs sm:text-sm uppercase tracking-widest font-bold mt-1.5 sm:mt-2">
            Fiber Uplink Hub • {HOTFAST_NODE_COORDS.region}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:flex md:flex-wrap items-center gap-2.5 sm:gap-3 w-full md:w-auto">
          <button
            onClick={openGoogleMapsDirect}
            className="w-full sm:w-auto justify-center px-4 py-3 bg-bg-surface border border-primary/40 hover:border-primary text-white text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer"
          >
            <ExternalLink size={14} className="text-primary" />
            <span>Open Google Map</span>
          </button>

          <button
            onClick={onOpenMapModal}
            className="w-full sm:w-auto justify-center px-5 py-3 bg-primary hover:bg-primary-dark text-white font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-primary/20 flex items-center gap-2 italic cursor-pointer"
          >
            <Maximize2 size={15} />
            <span>OPEN MAP BOX</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Map Card */}
      <div className="sharp-card bg-slate-900/40 border border-border-subtle overflow-hidden relative group">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Map Preview Frame */}
          <div
            onClick={onOpenMapModal}
            className="lg:col-span-8 relative h-[260px] sm:h-[380px] lg:h-[460px] cursor-pointer overflow-hidden border-b lg:border-b-0 lg:border-r border-border-subtle group"
          >
            <iframe
              title="HOTFAST PH Latency Map Location"
              src={mapEmbedUrl}
              className="w-full h-full border-0 pointer-events-none filter contrast-[1.05]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />

            {/* Dark gradient overlay with click-to-expand prompt */}
            <div className="absolute inset-0 bg-gradient-to-t from-bg-base/90 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

            {/* Click to open box prompt for mobile and desktop */}
            <div className="absolute inset-0 flex items-center justify-center opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="px-4 py-2 sm:px-6 sm:py-3 bg-primary/95 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-2xl scale-95 group-hover:scale-100 transition-transform italic border border-white/20">
                <Maximize2 size={14} />
                <span>TAP TO OPEN GOOGLE MAP BOX</span>
              </div>
            </div>

            {/* Top HUD badge */}
            <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10 pointer-events-none">
              <div className="sharp-card bg-bg-base/90 backdrop-blur-md border border-border-subtle p-2.5 sm:p-3 text-[9px] sm:text-[10px] font-mono shadow-xl">
                <div className="flex items-center gap-1.5 sm:gap-2 text-primary font-black uppercase tracking-wider mb-0.5 sm:mb-1">
                  <MapPin size={11} className="text-primary animate-pulse" />
                  <span>PRIMARY UPLINK NODE</span>
                </div>
                <div className="text-white font-bold tracking-wider text-[8px] sm:text-[10px]">
                  VISAYAS CORE GATEWAY • 12 TBPS
                </div>
              </div>
            </div>

            {/* Bottom badge */}
            <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-10 flex items-center gap-2 pointer-events-none">
              <span className="px-2.5 py-1 bg-green-500/20 border border-green-500/40 text-green-400 text-[9px] sm:text-[10px] font-mono font-bold flex items-center gap-1.5 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping"></span>
                ONLINE • {latency || 14} MS PING
              </span>
            </div>
          </div>

          {/* Side Telemetry Details */}
          <div className="lg:col-span-4 p-4 sm:p-6 lg:p-8 flex flex-col justify-between bg-bg-surface/20">
            <div>
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-border-subtle">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                  Node Telemetry
                </span>
                <span className="text-xs font-mono text-primary font-bold">
                  {HOTFAST_NODE_COORDS.nodeName}
                </span>
              </div>

              <div className="space-y-4 mb-6">
                {/* Clean, optimized Coverage Point of Presence card instead of raw coordinates */}
                <div className="bg-bg-base p-4 border border-border-subtle">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-1">
                        Coverage & Point of Presence
                      </div>
                      <div className="text-sm font-bold uppercase text-white tracking-tight">
                        Western Visayas Regional Hub
                      </div>
                    </div>
                    <ShieldCheck size={18} className="text-primary mt-0.5" />
                  </div>
                  <div className="text-[10px] text-green-400 font-mono mt-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping"></span>
                    Verified Carrier Optical Gateway
                  </div>
                </div>

                <div className="bg-bg-base p-4 border border-border-subtle">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-1">
                        Measured Sensor Latency
                      </div>
                      <div className="text-2xl font-black font-mono text-primary italic">
                        {latency || 14} <span className="text-xs font-sans not-italic text-text-dim">ms</span>
                      </div>
                    </div>
                    <Activity size={20} className="text-primary mt-1" />
                  </div>
                  <div className="text-[9px] text-green-400 font-mono mt-1 flex items-center gap-1">
                    <Zap size={10} /> Fast Edge Routing
                  </div>
                </div>

                <div className="bg-bg-base p-4 border border-border-subtle">
                  <div className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-1">
                    Uplink Topology
                  </div>
                  <div className="text-xs font-bold uppercase text-white tracking-tight">
                    Direct Fiber Carrier Aggregation
                  </div>
                  <div className="text-[10px] text-text-dim mt-1">
                    Protected redundant ring connecting Negros Occidental and Panay.
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border-subtle space-y-2">
              <button
                onClick={onOpenMapModal}
                className="w-full py-4 bg-primary hover:bg-primary-dark text-white font-black uppercase text-xs tracking-widest transition-all italic flex items-center justify-center gap-2 shadow-lg shadow-primary/20 cursor-pointer"
              >
                <Maximize2 size={14} />
                <span>OPEN GOOGLE MAP BOX</span>
              </button>

              <button
                onClick={openGoogleMapsDirect}
                className="w-full py-3 bg-bg-base hover:bg-bg-surface border border-border-subtle hover:border-primary/50 text-white font-bold uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ExternalLink size={12} className="text-primary" />
                <span>Google Maps External</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
