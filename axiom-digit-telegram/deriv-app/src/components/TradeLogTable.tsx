/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { TradeLog } from "../types";
import { ListFilter, FileSpreadsheet, ShieldAlert, BadgePlus, XCircle, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface TradeLogTableProps {
  logs: TradeLog[];
}

export const TradeLogTable: React.FC<TradeLogTableProps> = ({ logs }) => {
  return (
    <div className="bg-[#15171f] p-5 rounded-2xl border border-gray-800 shadow-2xl flex flex-col h-full" id="trade-logs-card">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-800 mb-4" id="log-header">
        <div className="flex items-center gap-2" id="log-title-wrap">
          <FileSpreadsheet className="w-5 h-5 text-emerald-400" id="log-icon" />
          <h2 className="text-sm font-semibold text-gray-200 tracking-tight font-sans">
            Transaction Activity Log (Live)
          </h2>
        </div>
        <span className="text-[10px] font-mono text-gray-500 bg-gray-900 px-2 py-0.5 rounded">
          {logs.length} Total Trades
        </span>
      </div>

      {/* Table Container */}
      <div className="flex-grow overflow-auto max-h-[350px] custom-scrollbar" id="log-table-wrapper">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500 bg-[#0d0e12]/40 rounded-xl border border-gray-800/50" id="logs-empty-state">
            <ShieldAlert className="w-8 h-8 text-gray-600 mb-2" />
            <span className="text-xs font-mono">No trades placed in this session</span>
            <span className="text-[10px] text-gray-600 font-sans mt-0.5">Start Bot when confirmation shift is met to see trades</span>
          </div>
        ) : (
          <div className="min-w-[650px] overflow-x-auto" id="log-table-inner">
            <table className="w-full text-left border-collapse" id="log-core-table">
              <thead>
                <tr className="border-b border-gray-800/80 text-[10px] text-gray-400 uppercase tracking-wider font-mono">
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Asset/Type</th>
                  <th className="py-2.5 px-3">Overtaken Pair</th>
                  <th className="py-2.5 px-3">Prediction</th>
                  <th className="py-2.5 px-3 text-right">Stake ($)</th>
                  <th className="py-2.5 px-3 text-center">Tick Stream (Last=Exit)</th>
                  <th className="py-2.5 px-3 text-right">Payout / Net ($)</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/40 text-xs">
                <AnimatePresence initial={false}>
                  {logs.map((log) => {
                    const isWon = log.status === "won";
                    const isLost = log.status === "lost";
                    const isPending = log.status === "pending";

                    return (
                      <motion.tr
                        id={`trade-row-${log.id}`}
                        key={log.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="hover:bg-[#0e1015]/40 transition duration-150 text-gray-300 font-mono"
                      >
                        {/* Time */}
                        <td className="py-2.5 px-3 text-gray-500 text-[11px]">
                          {log.timestamp}
                        </td>

                        {/* Asset / Type */}
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col" id={`trade-asset-${log.id}`}>
                            <span className="text-gray-200 text-[11px] font-semibold">VIX 100</span>
                            <span className="text-[9px] text-emerald-500/80 uppercase">
                              {log.contractType === "DIFFERS" ? "Digit Differs" : "Digit Match"}
                            </span>
                          </div>
                        </td>

                        {/* Shift details */}
                        <td className="py-2.5 px-3">
                          <span className="text-[10.5px] bg-[#0d0e12] border border-gray-800 px-2 py-0.5 rounded text-gray-400">
                            {log.previousLeaderDigit >= 0 ? `${log.previousLeaderDigit} → ` : ""}
                            <span className="text-emerald-400 font-bold">{log.leaderDigit}</span>
                          </span>
                        </td>

                        {/* Prediction */}
                        <td className="py-2.5 px-3">
                          <span className="text-[11px] font-bold text-amber-400 bg-amber-950/20 border border-amber-500/20 px-2 py-0.5 rounded">
                            {log.contractType === "DIFFERS" ? `Differs: ${log.digitPlaced}` : `Match: ${log.digitPlaced}`}
                          </span>
                        </td>

                        {/* Stake */}
                        <td className="py-2.5 px-3 text-right text-gray-100 font-bold">
                          ${log.currentStake.toFixed(2)}
                        </td>

                        {/* Live Ticks Stream */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-center gap-1" id={`trade-stream-${log.id}`}>
                            {Array.from({ length: 5 }).map((_, index) => {
                              const hasValue = index < log.ticksCollected.length;
                              const value = hasValue ? log.digitsCollected[index] : null;
                              const isExit = index === 4;

                              let badgeStyle = "bg-[#0c0e12] border-gray-800 text-gray-600";
                              if (hasValue) {
                                if (log.contractType === "DIFFERS") {
                                  if (value === log.digitPlaced) {
                                    badgeStyle = "bg-red-950 border-red-500/50 text-red-400 font-extrabold";
                                  } else {
                                    badgeStyle = isExit 
                                      ? "bg-emerald-950/50 border-emerald-500/20 text-emerald-400" 
                                      : "bg-gray-800 border-gray-700 text-gray-400";
                                  }
                                } else {
                                  if (value === log.digitPlaced) {
                                    badgeStyle = "bg-emerald-950 border-emerald-500/50 text-emerald-400 font-extrabold";
                                  } else {
                                    badgeStyle = isExit 
                                      ? "bg-red-950/50 border-red-500/20 text-red-400" 
                                      : "bg-gray-800 border-gray-700 text-gray-400";
                                  }
                                }
                              }

                              return (
                                <div
                                  id={`trade-tick-item-${log.id}-${index}`}
                                  key={index}
                                  className={`w-5 h-5 rounded-md border text-[10px] flex items-center justify-center font-bold ${badgeStyle}`}
                                  title={hasValue ? `Tick quote: ${log.ticksCollected[index]}` : "Waiting tick..."}
                                >
                                  {hasValue ? value : "-"}
                                </div>
                              );
                            })}
                          </div>
                        </td>

                        {/* Profit/Payout */}
                        <td className={`py-2.5 px-3 text-right font-bold text-[11.5px] ${isWon ? "text-emerald-400" : isLost ? "text-red-400" : "text-gray-400"}`}>
                          {isWon ? (
                            <span>+${log.profit.toFixed(2)}</span>
                          ) : isLost ? (
                            <span>-${Math.abs(log.profit).toFixed(2)}</span>
                          ) : (
                            <span className="animate-pulse">Pending...</span>
                          )}
                        </td>

                        {/* Status Label */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex justify-center" id={`trade-status-${log.id}`}>
                            {isWon ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-950/50 text-emerald-400 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-emerald-500/25">
                                <CheckCircle className="w-3 h-3 text-emerald-400" /> WIN
                              </span>
                            ) : isLost ? (
                              <span className="inline-flex items-center gap-1 bg-red-950/40 text-red-400 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-red-500/20">
                                <XCircle className="w-3 h-3 text-red-400" /> LOSS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-indigo-950 text-indigo-400 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-indigo-500/20 animate-pulse">
                                ACTIVE
                              </span>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
