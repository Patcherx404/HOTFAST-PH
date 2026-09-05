import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  HardDrive,
  TrendingUp,
  Wifi,
  Calendar,
  Zap,
} from "lucide-react";

export interface DailyConsumption {
  dayIndex: number;
  date: string;
  fullDate: string;
  dayOfWeek: string;
  download: number; // GB
  upload: number; // GB
  total: number; // GB
  peakMbps: number;
}

interface DataConsumptionChartProps {
  accountNumber?: string;
  planName?: string;
  planSpeed?: number;
}

// Deterministic pseudo-random number generator for consistent user telemetry
function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

export default function DataConsumptionChart({
  accountNumber = "HF-000000",
  planName = "Standard Fiber",
  planSpeed = 50,
}: DataConsumptionChartProps) {
  const [viewMode, setViewMode] = useState<"combined" | "split">("combined");
  const [timeRange, setTimeRange] = useState<"7" | "14" | "30">("30");

  // Generate 30 days of deterministic consumption telemetry based on account number and plan speed
  const all30DaysData = useMemo<DailyConsumption[]>(() => {
    // Generate numerical seed from account number
    let hash = 0;
    for (let i = 0; i < accountNumber.length; i++) {
      hash = (hash << 5) - hash + accountNumber.charCodeAt(i);
      hash |= 0;
    }
    const baseSeed = Math.abs(hash) || 123456;

    const baseMultiplier = Math.max(1, planSpeed / 30);
    const result: DailyConsumption[] = [];

    const now = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayOfWeekNum = d.getDay(); // 0 = Sunday, 6 = Saturday
      const isWeekend = dayOfWeekNum === 0 || dayOfWeekNum === 6;

      const seed1 = baseSeed + i * 17;
      const seed2 = baseSeed + i * 31;
      const seed3 = baseSeed + i * 47;

      const randomFactor = seededRandom(seed1);
      const weekendBoost = isWeekend ? 1.45 : 1.0;

      // Base download between 8 and 22 GB, scaled by plan speed
      const baseDownload = (8 + randomFactor * 14) * baseMultiplier * weekendBoost;
      // Upload is typically 15-30% of download
      const uploadFactor = 0.18 + seededRandom(seed2) * 0.12;
      const baseUpload = baseDownload * uploadFactor;

      // Occasional spike (e.g. system update / 4K stream on 2-3 specific days)
      const isSpikeDay = i === 4 || i === 18 || i === 25;
      const spikeMultiplier = isSpikeDay ? 1.6 : 1.0;

      const finalDownload = parseFloat((baseDownload * spikeMultiplier).toFixed(1));
      const finalUpload = parseFloat((baseUpload * spikeMultiplier).toFixed(1));
      const finalTotal = parseFloat((finalDownload + finalUpload).toFixed(1));

      const peakMbps = Math.min(
        planSpeed,
        parseFloat((planSpeed * (0.65 + seededRandom(seed3) * 0.35)).toFixed(1))
      );

      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];

      result.push({
        dayIndex: 30 - i,
        date: `${monthNames[d.getMonth()]} ${d.getDate()}`,
        fullDate: `${dayNames[dayOfWeekNum]}, ${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
        dayOfWeek: dayNames[dayOfWeekNum],
        download: finalDownload,
        upload: finalUpload,
        total: finalTotal,
        peakMbps,
      });
    }

    return result;
  }, [accountNumber, planSpeed]);

  // Filtered slice according to the selected timeframe
  const displayData = useMemo(() => {
    const days = parseInt(timeRange, 10);
    return all30DaysData.slice(30 - days);
  }, [all30DaysData, timeRange]);

  // Calculated statistics over the full 30-day baseline
  const stats = useMemo(() => {
    const totalDownload = all30DaysData.reduce((acc, cur) => acc + cur.download, 0);
    const totalUpload = all30DaysData.reduce((acc, cur) => acc + cur.upload, 0);
    const totalCombined = totalDownload + totalUpload;
    const dailyAverage = totalCombined / all30DaysData.length;

    let peakDay = all30DaysData[0];
    for (const item of all30DaysData) {
      if (item.total > peakDay.total) {
        peakDay = item;
      }
    }

    const downloadRatio = Math.round((totalDownload / (totalCombined || 1)) * 100);
    const uploadRatio = 100 - downloadRatio;

    return {
      totalDownload: totalDownload.toFixed(1),
      totalUpload: totalUpload.toFixed(1),
      totalCombined: totalCombined.toFixed(1),
      dailyAverage: dailyAverage.toFixed(1),
      dailyAverageNum: dailyAverage,
      peakDay,
      downloadRatio,
      uploadRatio,
    };
  }, [all30DaysData]);

  return (
    <div className="bg-bg-base border border-border-subtle overflow-hidden">
      {/* Section Header */}
      <div className="px-4 sm:px-6 md:px-8 py-5 border-b border-border-subtle flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity size={14} className="text-primary animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
              Bandwidth Telemetry
            </span>
          </div>
          <h3 className="text-base sm:text-lg font-black uppercase italic tracking-tight text-white flex items-center gap-2">
            30-Day Data Consumption Trends
          </h3>
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mt-0.5">
            Node #{accountNumber} • Plan: {planName} ({planSpeed} Mbps Max Burst)
          </p>
        </div>

        {/* View Mode & Range Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-900 border border-border-subtle p-1">
            <button
              onClick={() => setViewMode("combined")}
              className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all min-h-[34px] cursor-pointer ${
                viewMode === "combined"
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-muted hover:text-white"
              }`}
            >
              Total (GB)
            </button>
            <button
              onClick={() => setViewMode("split")}
              className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all min-h-[34px] cursor-pointer ${
                viewMode === "split"
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-muted hover:text-white"
              }`}
            >
              Down / Up
            </button>
          </div>

          {/* Time Range Filter */}
          <div className="flex items-center bg-slate-900 border border-border-subtle p-1">
            <button
              onClick={() => setTimeRange("7")}
              className={`px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all min-h-[34px] cursor-pointer ${
                timeRange === "7"
                  ? "bg-slate-800 text-white font-bold"
                  : "text-text-muted hover:text-white"
              }`}
              title="Last 7 Days"
            >
              7D
            </button>
            <button
              onClick={() => setTimeRange("14")}
              className={`px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all min-h-[34px] cursor-pointer ${
                timeRange === "14"
                  ? "bg-slate-800 text-white font-bold"
                  : "text-text-muted hover:text-white"
              }`}
              title="Last 14 Days"
            >
              14D
            </button>
            <button
              onClick={() => setTimeRange("30")}
              className={`px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all min-h-[34px] cursor-pointer ${
                timeRange === "30"
                  ? "bg-slate-800 text-white font-bold border border-primary/40 text-primary"
                  : "text-text-muted hover:text-white"
              }`}
              title="Last 30 Days"
            >
              30D
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metric Summary Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-subtle border-b border-border-subtle">
        <div className="p-4 sm:p-5 bg-bg-base space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase text-text-muted tracking-widest">
              30-Day Aggregate
            </span>
            <HardDrive size={13} className="text-primary" />
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-white tracking-tight">
            {stats.totalCombined}{" "}
            <span className="text-xs font-sans text-primary uppercase font-black">GB</span>
          </div>
          <div className="text-[9px] text-text-dim flex items-center gap-2">
            <span className="text-emerald-400 font-mono font-semibold">
              ↓ {stats.totalDownload} GB
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-sky-400 font-mono font-semibold">
              ↑ {stats.totalUpload} GB
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-bg-base space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase text-text-muted tracking-widest">
              Daily Average
            </span>
            <TrendingUp size={13} className="text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-white tracking-tight">
            {stats.dailyAverage}{" "}
            <span className="text-xs font-sans text-text-muted uppercase font-black">GB/day</span>
          </div>
          <div className="text-[9px] text-text-dim">
            Normal range: ~{(stats.dailyAverageNum * 0.7).toFixed(1)} - {(stats.dailyAverageNum * 1.3).toFixed(1)} GB
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-bg-base space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase text-text-muted tracking-widest">
              Peak Day Usage
            </span>
            <Zap size={13} className="text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-amber-400 tracking-tight">
            {stats.peakDay.total}{" "}
            <span className="text-xs font-sans text-text-muted uppercase font-black">GB</span>
          </div>
          <div className="text-[9px] text-text-dim truncate">
            {stats.peakDay.date} ({stats.peakDay.dayOfWeek}) • Peak: {stats.peakDay.peakMbps} Mbps
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-bg-base space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase text-text-muted tracking-widest">
              Traffic Breakdown
            </span>
            <Wifi size={13} className="text-sky-400" />
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-white tracking-tight flex items-center gap-2">
            <span className="text-primary">{stats.downloadRatio}%</span>
            <span className="text-xs text-text-muted">/</span>
            <span className="text-sky-400">{stats.uploadRatio}%</span>
          </div>
          <div className="text-[9px] text-text-dim flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            <span>Download</span>
            <span className="text-slate-600 mx-0.5">•</span>
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />
            <span>Upload</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="p-4 sm:p-6 md:p-8 bg-bg-base">
        <div className="w-full h-72 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={displayData}
              margin={{ top: 15, right: 15, left: -15, bottom: 5 }}
            >
              <defs>
                <linearGradient id="totalGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dc2626" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e293b"
                vertical={false}
                opacity={0.7}
              />

              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: "#1e293b" }}
                interval={timeRange === "30" ? 3 : timeRange === "14" ? 1 : 0}
                dy={6}
              />

              <YAxis
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val} GB`}
                dx={-4}
              />

              <Tooltip content={<CustomTooltip />} />

              {/* Baseline Reference Line for 30-Day Average */}
              <ReferenceLine
                y={parseFloat(stats.dailyAverage)}
                stroke="#64748b"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{
                  value: `Avg: ${stats.dailyAverage} GB`,
                  position: "insideTopRight",
                  fill: "#94a3b8",
                  fontSize: 9,
                  fontWeight: 700,
                }}
              />

              {viewMode === "combined" ? (
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total Consumption"
                  stroke="#dc2626"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "#dc2626", strokeWidth: 0 }}
                  activeDot={{
                    r: 5.5,
                    fill: "#ffffff",
                    stroke: "#dc2626",
                    strokeWidth: 2.5,
                  }}
                  isAnimationActive={true}
                />
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey="download"
                    name="Download Traffic"
                    stroke="#dc2626"
                    strokeWidth={2.2}
                    dot={{ r: 2, fill: "#dc2626", strokeWidth: 0 }}
                    activeDot={{
                      r: 5,
                      fill: "#ffffff",
                      stroke: "#dc2626",
                      strokeWidth: 2,
                    }}
                    isAnimationActive={true}
                  />
                  <Line
                    type="monotone"
                    dataKey="upload"
                    name="Upload Traffic"
                    stroke="#38bdf8"
                    strokeWidth={2.2}
                    dot={{ r: 2, fill: "#38bdf8", strokeWidth: 0 }}
                    activeDot={{
                      r: 5,
                      fill: "#ffffff",
                      stroke: "#38bdf8",
                      strokeWidth: 2,
                    }}
                    isAnimationActive={true}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend and Legend Notes */}
        <div className="mt-4 pt-4 border-t border-border-subtle/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[10px]">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            {viewMode === "combined" ? (
              <div className="flex items-center gap-2">
                <span className="w-3 h-1 bg-primary inline-block rounded-full" />
                <span className="font-bold uppercase tracking-wider text-text-dim">
                  Total Daily Consumption (GB)
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1 bg-primary inline-block rounded-full" />
                  <span className="font-bold uppercase tracking-wider text-text-dim">
                    Download Traffic (GB)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1 bg-sky-400 inline-block rounded-full" />
                  <span className="font-bold uppercase tracking-wider text-text-dim">
                    Upload Traffic (GB)
                  </span>
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 border-t border-dashed border-slate-500 inline-block" />
              <span className="font-bold uppercase tracking-wider text-text-muted">
                30-Day Mean Benchmark ({stats.dailyAverage} GB)
              </span>
            </div>
          </div>

          <div className="text-[9px] text-text-muted uppercase font-mono">
            Optical Session: Active • Zero Throttling
          </div>
        </div>
      </div>
    </div>
  );
}

// Custom Tooltip component for Recharts
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const data: DailyConsumption = payload[0].payload;
    return (
      <div className="sharp-card bg-slate-950/95 border border-border-subtle p-3 shadow-2xl backdrop-blur-md min-w-[200px] text-left">
        <div className="text-[9px] font-black uppercase tracking-widest text-primary border-b border-border-subtle pb-1.5 mb-2 flex items-center justify-between">
          <span>{data.fullDate}</span>
          <span className="text-text-muted">{data.dayOfWeek}</span>
        </div>

        <div className="space-y-1.5 font-mono text-xs">
          <div className="flex justify-between items-center">
            <span className="text-text-muted text-[10px] uppercase tracking-wider">
              Total Traffic:
            </span>
            <span className="font-bold text-white text-sm">
              {data.total.toFixed(1)} GB
            </span>
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-primary flex items-center gap-1">
              <ArrowDown size={10} /> Download:
            </span>
            <span className="text-slate-200">{data.download.toFixed(1)} GB</span>
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-sky-400 flex items-center gap-1">
              <ArrowUp size={10} /> Upload:
            </span>
            <span className="text-slate-200">{data.upload.toFixed(1)} GB</span>
          </div>

          <div className="pt-1.5 border-t border-border-subtle flex justify-between items-center text-[9px] text-text-muted font-sans font-bold uppercase tracking-wider">
            <span>Peak Transfer Rate</span>
            <span className="text-amber-400 font-mono font-bold">
              {data.peakMbps} Mbps
            </span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
