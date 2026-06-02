/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { BotStatus } from "../types";
import { Play, Pause, Activity, Circle, HelpCircle, Layers, Check, Database, RefreshCw } from "lucide-react";
import { motion } from "motion/react";

interface DBotFlowProps {
  status: BotStatus;
  stake: number;
  initialStake: number;
  martingaleMultiplier: number;
  predictedDigit: number | null;
  leaderDigit: number | null;
  confirmationBuffer: number;
  consecutiveMatches: number;
  isEvaluatingTick: boolean;
  lastEvaluatedLastDigit: number | null;
  contractType?: "MATCH" | "DIFFERS";
  predictionTarget?: "SECOND_HIGHEST" | "NEW_LEADER" | "OVERTAKEN_LEADER" | "COLDEST";
}

export const DBotFlow: React.FC<DBotFlowProps> = ({
  status,
  stake,
  initialStake,
  martingaleMultiplier,
  predictedDigit,
  leaderDigit,
  confirmationBuffer,
  consecutiveMatches,
  isEvaluatingTick,
  lastEvaluatedLastDigit,
  contractType = "MATCH",
  predictionTarget = "SECOND_HIGHEST",
}) => {
  const isRunning = status === BotStatus.RUNNING;

  const getPredictionTargetLabel = () => {
    if (predictionTarget === "SECOND_HIGHEST") return "2nd Rank Digit (Default)";
    if (predictionTarget === "NEW_LEADER") return "New Leader (1st Rank)";
    if (predictionTarget === "OVERTAKEN_LEADER") return "Overtaken Leader Digit";
    if (predictionTarget === "COLDEST") return "Coldest Digit (Least Recurring)";
    return "Second Rank Digit";
  };

  return (
    <div className="bg-[#15171f] p-5 rounded-2xl border border-gray-800 shadow-2xl flex flex-col h-full" id="dbot-flow-card">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-800 mb-5" id="dbot-header">
        <div className="flex items-center gap-2" id="dbot-title-wrap">
          <Layers className="w-5 h-5 text-indigo-400" id="dbot-icon" />
          <h2 className="text-sm font-semibold text-gray-200 tracking-tight font-sans" id="dbot-header-title">
            DBot Automated Logic Flow
          </h2>
        </div>
        <div className="flex items-center gap-1.5" id="dbot-status-badge">
          <span className="relative flex h-2 w-2">
            {isRunning && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isRunning ? "bg-indigo-500" : "bg-gray-600"}`}></span>
          </span>
          <span className="text-[10px] text-gray-400 font-mono tracking-wider uppercase font-semibold">
            {status}
          </span>
        </div>
      </div>

      {/* Block Layout Workspace */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scrollbar" id="dbot-workspace">
        
        {/* Block 1: Trade Definition Block (Green theme) */}
        <div
          id="block-trade-definition"
          className={`border rounded-xl bg-[#0d0e12] overflow-hidden transition-all duration-300 ${
            isRunning ? "border-emerald-500/30" : "border-gray-800"
          }`}
        >
          {/* Header Bar */}
          <div className="bg-emerald-950/40 px-4 py-2 border-b border-emerald-500/20 flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" /> 1. TRADE DEFINITIONS
            </span>
            <span className="text-[9px] bg-emerald-900/60 text-emerald-400 px-1.5 py-0.2 rounded font-mono font-medium">
              R_100 Setup
            </span>
          </div>

          {/* Block Content */}
          <div className="p-4 space-y-2.5 text-[11px] text-gray-300">
            <div className="flex justify-between items-center bg-[#15171f] p-2 rounded-lg border border-gray-800" id="dbot-field-market">
              <span className="text-gray-400">Market / Index</span>
              <span className="font-mono text-gray-200 font-semibold bg-gray-800/80 px-2 py-0.5 rounded text-[10px]">
                Synthetic: Volatility 100
              </span>
            </div>
            
            <div className="flex justify-between items-center bg-[#15171f] p-2 rounded-lg border border-gray-800" id="dbot-field-contract">
              <span className="text-gray-400">Contract Category</span>
              <span className="font-mono text-emerald-400 font-semibold bg-emerald-950/40 border border-emerald-500/10 px-2 py-0.5 rounded text-[10px]">
                Digits: {contractType === "MATCH" ? "Match (High Risk, ~10% Win Rate)" : "Differs (Low Risk, ~90% Win Rate)"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2" id="dbot-initial-vars-fields">
              <div className="bg-[#15171f] p-2 rounded-lg border border-gray-800 flex flex-col">
                <span className="text-gray-400 text-[10px]">Variable [InitialStake]</span>
                <span className="font-mono text-gray-200 text-xs font-bold mt-1">${initialStake.toFixed(2)}</span>
              </div>
              <div className="bg-[#15171f] p-2 rounded-lg border border-gray-800 flex flex-col">
                <span className="text-gray-400 text-[10px]">Variable [Multiplier]</span>
                <span className="font-mono text-gray-200 text-xs font-bold mt-1">
                  {contractType === "DIFFERS" ? "N/A (Flat)" : `${martingaleMultiplier}x`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Block 2: Before Purchase Logic Block (Blue theme) */}
        <div
          id="block-before-purchase"
          className={`border rounded-xl bg-[#0d0e12] overflow-hidden transition-all duration-300 ${
            isRunning && isEvaluatingTick
              ? "border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.2)]"
              : "border-gray-800"
          }`}
        >
          {/* Header Bar */}
          <div className="bg-indigo-950/40 px-4 py-2 border-b border-indigo-500/20 flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-400 font-mono flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> 2. BEFORE PURCHASE
            </span>
            <span className="text-[9px] bg-indigo-900/60 text-indigo-400 px-1.5 py-0.2 rounded font-mono font-medium">
              Shift Evaluation
            </span>
          </div>

          {/* Block Content */}
          <div className="p-4 space-y-3 text-[11px] text-gray-300">
            {/* Live Indicator */}
            <div className="flex items-center justify-between bg-indigo-950/20 border border-indigo-500/10 p-2 rounded-lg">
              <span className="text-gray-400">Incoming Tick Digit:</span>
              <div className="flex items-center gap-1.5 font-mono">
                {isEvaluatingTick ? (
                  <motion.span
                    animate={{ scale: [1, 1.4, 1] }}
                    transition={{ duration: 0.2 }}
                    className="w-5 h-5 rounded bg-indigo-500 text-white font-bold flex items-center justify-center text-[10px]"
                  >
                    {lastEvaluatedLastDigit !== null ? lastEvaluatedLastDigit : "?"}
                  </motion.span>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
                <span className="text-[10px] text-gray-500">evaluating...</span>
              </div>
            </div>

            {/* Logical Rule Card */}
            <div className="space-y-2 relative pl-3 border-l-2 border-indigo-500/40">
              <div className="font-semibold text-gray-200">
                IF{" "}
                <span className="text-indigo-400 font-mono font-medium bg-indigo-950/30 px-1.5 py-0.2 rounded">
                  Leader Shift Candidate
                </span>{" "}
                holds rank 1
              </div>

              <div className="text-gray-400 ml-2" id="logic-rule-consecutive">
                consecutive ticks matching:{" "}
                <span className="font-mono text-gray-200 bg-gray-800 px-1.5 py-0.2 rounded font-bold">
                  {consecutiveMatches} / {confirmationBuffer}
                </span>
              </div>

              <div className="font-semibold text-gray-200 mt-2">
                THEN set{" "}
                <span className="text-amber-400 font-mono font-medium bg-amber-950/30 px-1.5 py-0.2 rounded font-bold">
                  Prediction
                </span>{" "}
                = {getPredictionTargetLabel()}
              </div>

              <div className="text-gray-400 ml-2 flex items-center gap-1.5" id="logic-rule-then-action">
                <span>Value:</span>
                {predictedDigit !== null ? (
                  <span className="font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded font-bold border border-amber-500/20">
                    Digit {predictedDigit}
                  </span>
                ) : (
                  <span className="italic text-gray-600">[Evaluating]</span>
                )}
              </div>

              <div className="font-semibold text-emerald-400 mt-2">
                EXECUTE buy: <span className="underline decoration-indigo-500/50">{contractType === "MATCH" ? "DIGITMATCH" : "DIGITDIFF (90% Win Probability)"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Block 3: After Purchase Logic Block (Purple theme) */}
        <div
          id="block-after-purchase"
          className={`border rounded-xl bg-[#0d0e12] overflow-hidden transition-all duration-300 ${
            isRunning ? "border-purple-500/30" : "border-gray-800"
          }`}
        >
          {/* Header Bar */}
          <div className="bg-purple-950/40 px-4 py-2 border-b border-purple-500/20 flex items-center justify-between">
            <span className="text-xs font-bold text-purple-400 font-mono flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> 3. AFTER PURCHASE
            </span>
            <span className="text-[9px] bg-purple-900/60 text-purple-400 px-1.5 py-0.2 rounded font-mono font-medium">
              {contractType === "DIFFERS" ? "Flat Stake Guard" : "Martingale Engine"}
            </span>
          </div>

          {/* Block Content */}
          <div className="p-4 space-y-3 text-[11px] text-gray-300">
            {contractType === "DIFFERS" ? (
              <div className="space-y-1.5" id="differs-flat-stake-logic">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Flat Stake Progression Enabled
                </div>
                <div className="text-gray-400 ml-3 pl-2.5 border-l border-emerald-500/20">
                  To protect small accounts from compounding recovery steps, Martingale multiplication is locked out for Digit Differs.
                  <div className="mt-1 font-semibold text-gray-200 font-mono text-[10px]">
                    Current stake is fixed to Initial Stake: ${initialStake.toFixed(2)}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Condition 1: Loss */}
                <div className="space-y-1.5" id="logic-rule-loss-block">
                  <div className="font-semibold text-red-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                    IF Contract Result equals "LOSS"
                  </div>
                  <div className="text-gray-400 ml-3 pl-2.5 border-l border-red-500/20" id="logic-rule-loss-text">
                    Multiply current stake <strong className="text-gray-200">({stake.toFixed(2)})</strong> by multiplier{" "}
                    <strong className="text-amber-500">{martingaleMultiplier}x</strong>
                    <div className="text-[10px] text-gray-500 mt-1 font-mono">
                      Next potential loss stake: ${(stake * martingaleMultiplier).toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Condition 2: Reset */}
                <div className="space-y-1.5 border-t border-gray-800/60 pt-2.5" id="logic-rule-win-block">
                  <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    ELSE (Contract Result equals "WIN")
                  </div>
                  <div className="text-gray-400 ml-3 pl-2.5 border-l border-emerald-500/20" id="logic-rule-win-text">
                    Reset current stake back to initial stake <strong className="text-emerald-400">${initialStake.toFixed(2)}</strong>
                  </div>
                </div>
              </>
            )}

            {/* Trade again */}
            <div className="border-t border-gray-800/60 pt-2.5" id="trade-again-indicator">
              <div className="font-semibold text-indigo-400 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-indigo-400" />
                EXECUTE "Trade Again" (Restart Loop)
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
