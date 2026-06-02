/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { DigitStat, TickData } from "../types";
import { BarChart3 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface DigitStatsPanelProps {
  stats: DigitStat[];
  recentTicks: TickData[];
  lookbackTicks: number;
  onLookbackChange: (val: number) => void;
  consecutiveCount: number;
  confirmationBuffer: number;
  newLeaderCandidate: number | null;
  currentLeader: number | null;
}

export const DigitStatsPanel: React.FC<DigitStatsPanelProps> = ({
  stats,
  recentTicks,
  lookbackTicks,
  onLookbackChange,
  consecutiveCount,
  confirmationBuffer,
  newLeaderCandidate,
  currentLeader,
}) => {
  // Sort stats to easily view rankings inside helper
  const sortedStats = useMemo(() => {
    return [...stats].sort((a, b) => b.percentage - a.percentage);
  }, [stats]);

  // Extract the highest & second-highest digits
  const firstRankDigit = sortedStats[0]?.digit ?? null;
  const secondRankDigit = sortedStats[1]?.digit ?? null;

  return (
    <div className="bg-[#15171f] p-5 rounded-2xl border border-gray-800 shadow-2xl flex flex-col justify-between h-full" id="digit-stats-panel-container">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-800 mb-5" id="stats-header-container">
        <div className="flex items-center gap-2" id="stats-title-wrap">
          <BarChart3 className="w-5 h-5 text-emerald-400" id="stats-iocn" />
          <h2 className="text-sm font-semibold text-gray-200 tracking-tight font-sans" id="stats-header-title">
            DTrader Last Digit Stats
          </h2>
        </div>
        <div className="flex items-center gap-2" id="lookback-select-wrap">
          <span className="text-xs text-gray-400" id="lookback-lbl">Lookback:</span>
          <select
            id="lookback-ticks-dropdown"
            className="bg-[#0e1015] border border-gray-800 text-xs text-gray-200 font-mono py-1 px-2.5 rounded-lg focus:outline-none focus:border-emerald-500 cursor-pointer"
            value={lookbackTicks}
            onChange={(e) => onLookbackChange(Number(e.target.value))}
          >
            <option value={50}>50 ticks</option>
            <option value={100}>100 ticks</option>
            <option value={200}>200 ticks</option>
            <option value={500}>500 ticks</option>
            <option value={1000}>1000 ticks</option>
          </select>
        </div>
      </div>

      {/* Main Stats Display */}
      <div className="grid grid-cols-5 md:grid-cols-10 gap-3 mb-6" id="stats-bars-grid">
        {stats.map((item) => {
          const isHighest = item.digit === firstRankDigit;
          const isSecondHighest = item.digit === secondRankDigit;

          // Compute style classes
          let barBg = "bg-gray-700/50";
          let textColor = "text-gray-300";
          let digitBorder = "border-gray-800";
          let digitBg = "bg-[#0e0f14]";
          let percentageLabel = "text-gray-400 font-medium";

          if (isHighest) {
            barBg = "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]";
            textColor = "text-emerald-400 font-bold";
            digitBorder = "border-emerald-500/50";
            digitBg = "bg-emerald-950/30";
            percentageLabel = "text-emerald-400 font-bold";
          } else if (isSecondHighest) {
            barBg = "bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.3)]";
            textColor = "text-amber-400 font-bold";
            digitBorder = "border-amber-500/50";
            digitBg = "bg-amber-950/20";
            percentageLabel = "text-amber-400 font-bold";
          }

          return (
            <div
              key={item.digit}
              id={`digit-col-${item.digit}`}
              className={`flex flex-col items-center p-2 rounded-xl border transition-all duration-300 ${
                isHighest
                  ? "bg-emerald-950/10 border-emerald-500/20"
                  : isSecondHighest
                  ? "bg-amber-950/10 border-amber-500/20"
                  : "bg-[#0e0f14]/50 border-gray-800/60"
              }`}
            >
              {/* Digit Box */}
              <div
                id={`digit-box-${item.digit}`}
                className={`w-8 h-8 rounded-lg flex items-center justify-center border text-xs font-mono mb-2 ${digitBorder} ${digitBg} ${textColor}`}
              >
                {item.digit}
              </div>

              {/* Bar Container */}
              <div id={`percentage-vertical-track-${item.digit}`} className="h-28 w-2.5 bg-gray-900 rounded-full overflow-hidden flex flex-col justify-end mb-2">
                <motion.div
                  id={`percentage-vertical-fill-${item.digit}`}
                  className={`rounded-full ${barBg}`}
                  initial={{ height: 0 }}
                  animate={{ height: `${item.percentage * 3.5}%` }} // Scaling representation
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Percentage label */}
              <span id={`percentage-val-text-${item.digit}`} className={`text-xs font-mono ${percentageLabel}`}>
                {item.percentage.toFixed(1)}%
              </span>

              {/* Rank Tag */}
              <span id={`digit-rank-${item.digit}`} className="text-[10px] text-gray-500 mt-1 font-mono">
                {isHighest ? "1st" : isSecondHighest ? "2nd" : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* Real-time digit stream */}
      <div id="digit-stream-container">
        <div className="text-xs text-gray-400 mb-2 font-medium" id="live-ticks-lbl">Live Last-Digit Carousel (Newest on right):</div>
        <div id="digit-badge-lane" className="flex items-center gap-1.5 overflow-x-auto py-1.5 px-2 bg-[#0d0e12] border border-gray-800/80 rounded-xl scrollbar-none justify-end min-h-[46px]">
          <AnimatePresence initial={false}>
            {(() => {
              const uniqueTicksMap = new Map<string, TickData>();
              recentTicks.forEach((t) => {
                uniqueTicksMap.set(t.id, t);
              });
              const uniqueRecentList = Array.from(uniqueTicksMap.values()).slice(-12);
              return uniqueRecentList.map((tick) => {
                const isLead = tick.lastDigit === firstRankDigit;
                const isSecond = tick.lastDigit === secondRankDigit;

                let theme = "bg-gray-800/50 text-gray-300 border-gray-700/50";
                if (isLead) {
                  theme = "bg-emerald-950/80 text-emerald-400 border-emerald-500/50 shadow-sm";
                } else if (isSecond) {
                  theme = "bg-amber-950/80 text-amber-400 border-amber-500/50 shadow-sm";
                }

                return (
                  <motion.div
                    id={`live-carousel-tick-${tick.id}`}
                    key={tick.id}
                    initial={{ opacity: 0, scale: 0.6, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, x: -25 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className={`w-7 h-7 rounded-full flex flex-col items-center justify-center font-mono text-xs font-bold border ${theme} shrink-0`}
                  >
                    {tick.lastDigit}
                  </motion.div>
                );
              });
            })()}
          </AnimatePresence>
        </div>
      </div>

      {/* Predictive Analytics (Gap Analyzer) */}
      <div className="mt-5 border-t border-gray-800/80 pt-4" id="gap-analyzer-section">
        <h3 className="text-xs text-indigo-400 font-semibold mb-2 flex items-center gap-1.5 font-sans">
          📊 Digit Predictive Analytics (Gap Analyzer)
        </h3>
        <div className="overflow-x-auto rounded-xl border border-gray-800 bg-[#0d0e12] p-1.5">
          <table className="w-full text-left border-collapse text-[11px] font-mono">
            <thead>
              <tr className="border-b border-gray-800/80 text-gray-500 uppercase tracking-wider text-[9px] font-semibold">
                <th className="py-2 px-3 text-center">Digit</th>
                <th className="py-2 px-2 text-right">Count</th>
                <th className="py-2 px-2 text-right">Freq (%)</th>
                <th className="py-2 px-2 text-right">Current Gap</th>
                <th className="py-2 px-2 text-right">Avg Gap</th>
                <th className="py-2 px-2 text-right">Max Gap</th>
                <th className="py-2 px-3 text-center">Danger Score</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((item) => {
                const isZero = item.digit === 0;
                const currentGap = item.currentGap ?? 0;
                const avgGap = item.avgGap ?? 10;
                const maxGap = item.maxGap ?? 10;
                const dangerScore = item.dangerScore ?? 0;

                // Color coding for danger score
                let dangerText = "text-gray-400";
                let dangerBg = "bg-gray-800/40 border-gray-700/30";
                if (dangerScore >= 85) {
                  dangerText = "text-red-400 font-bold";
                  dangerBg = "bg-red-950/30 border-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.1)]";
                } else if (dangerScore >= 65) {
                  dangerText = "text-amber-400 font-medium";
                  dangerBg = "bg-amber-950/20 border-amber-500/20";
                } else if (dangerScore < 30) {
                  dangerText = "text-emerald-400";
                  dangerBg = "bg-emerald-950/10 border-emerald-500/10";
                }

                return (
                  <tr
                    key={item.digit}
                    className={`border-b border-gray-800/40 hover:bg-gray-800/10 last:border-0 ${
                      isZero ? "bg-indigo-950/10 border-l-2 border-l-indigo-500" : ""
                    }`}
                  >
                    <td className="py-1.5 px-3 text-center">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded font-bold text-xs ${
                        item.digit === firstRankDigit 
                          ? "bg-emerald-950/50 text-emerald-400 border border-emerald-500/30" 
                          : item.digit === secondRankDigit 
                          ? "bg-amber-950/40 text-amber-400 border border-amber-500/30" 
                          : "bg-gray-800/40 text-gray-300 border border-gray-700/30"
                      }`}>
                        {item.digit}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-300">{item.count}</td>
                    <td className="py-1.5 px-2 text-right text-gray-300 font-semibold">{item.percentage.toFixed(1)}%</td>
                    <td className={`py-1.5 px-2 text-right font-medium ${
                      currentGap >= avgGap ? "text-amber-400" : "text-gray-400"
                    }`}>
                      {currentGap}
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-500">{avgGap}</td>
                    <td className="py-1.5 px-2 text-right text-gray-500">{maxGap}</td>
                    <td className="py-1.5 px-3 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] border ${dangerBg} ${dangerText}`}>
                        {dangerScore}% {dangerScore >= 85 ? "🚨 DUE" : dangerScore >= 65 ? "⚠️ IMMINENT" : "✓ SAFE"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
