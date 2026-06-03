/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { BotStatus, TradingMode, BotState, UserProfile } from "../types";
import { Play, Square, Pause, ShieldCheck, HelpCircle, RefreshCw, Layers, DollarSign, Wallet, SlidersHorizontal, Volume2, VolumeX, Bell, Users, Plus, Trash2, Pencil } from "lucide-react";
import { motion } from "motion/react";

interface TradingConsoleProps {
  botState: BotState;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onUpdateState: (updates: Partial<BotState>) => void;
  winCount: number;
  lossCount: number;
  totalProfit: number;
  volumeTraded: number;
  onResetStats: () => void;
  onResetBalance: () => void;
  skippedTrades?: number;
  lastSkippedReason?: string | null;
  onClearSkipped?: () => void;
  muteZeroAlerts: boolean;
  onToggleMuteZero: (mute: boolean) => void;
  showZeroToasts: boolean;
  onToggleShowToasts: (show: boolean) => void;
  onPlayTestChime: () => void;
  profiles: UserProfile[];
  activeProfileId: string;
  onSwitchProfile: (id: string) => void;
  onCreateProfile: (name: string, apiToken?: string, appId?: string) => void;
  onDeleteProfile: (id: string) => void;
  onRenameProfile: (id: string, newName: string) => void;
}

export const TradingConsole: React.FC<TradingConsoleProps> = ({
  botState,
  onStart,
  onPause,
  onStop,
  onUpdateState,
  winCount,
  lossCount,
  totalProfit,
  volumeTraded,
  onResetStats,
  onResetBalance,
  skippedTrades,
  lastSkippedReason,
  onClearSkipped,
  muteZeroAlerts,
  onToggleMuteZero,
  showZeroToasts,
  onToggleShowToasts,
  onPlayTestChime,
  profiles,
  activeProfileId,
  onSwitchProfile,
  onCreateProfile,
  onDeleteProfile,
  onRenameProfile,
}) => {
  const [tokenInput, setTokenInput] = useState(botState.apiToken);
  const [appIdInput, setAppIdInput] = useState(botState.appId);
  const [showTokenHelp, setShowTokenHelp] = useState(false);

  // States for Profile Management
  const [isCreating, setIsCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");

  React.useEffect(() => {
    setTokenInput(botState.apiToken);
  }, [botState.apiToken]);

  React.useEffect(() => {
    setAppIdInput(botState.appId);
  }, [botState.appId]);

  const totalTrades = winCount + lossCount;
  const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

  const handleApplyCredentials = () => {
    const token = tokenInput.trim();
    const appId = appIdInput.trim() || "1089";

    // Save to state/profile
    onUpdateState({ apiToken: token, appId });

    // Directly trigger Deriv authorization via dedicated endpoint
    if (token && activeProfileId) {
      fetch("/api/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: activeProfileId,
          apiToken: token,
          appId
        })
      }).catch((err) => console.error("Authorize error:", err));
    }
  };

  return (
    <div className="bg-[#15171f] p-5 rounded-2xl border border-gray-800 shadow-2xl flex flex-col justify-between h-full" id="trading-console-card">
      <div>
        {/* Active Profile switcher segment */}
        <div className="bg-[#0e1015] p-3.5 rounded-xl border border-gray-800/80 mb-5 text-[11px]" id="profile-manager-container">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Workspace Profile
            </span>
            <span className="text-[9px] text-gray-500 font-mono">
              Saves separate tokens, balance & trade logs
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Profile Selection Dropdown */}
            <div className="flex-1 min-w-[150px]">
              <select
                id="active-profile-select"
                className="w-full bg-[#15171f] border border-gray-800 text-xs text-gray-200 font-sans p-2 rounded-lg focus:outline-none focus:border-indigo-500 cursor-pointer font-medium"
                value={activeProfileId}
                onChange={(e) => onSwitchProfile(e.target.value)}
                disabled={botState.status !== BotStatus.STOPPED}
                title="Saves configuration, tokens, logs, and simulation balance separately for each user profile."
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    👤 {p.name} {p.apiToken ? `(Live)` : "(Demo)"}
                  </option>
                ))}
              </select>
            </div>

            {/* Profile Action Triggers */}
            <div className="flex items-center gap-1.5">
              {/* Inline renaming helper */}
              {isRenaming ? (
                <div className="flex items-center gap-1 bg-[#15171f] px-2 py-1 rounded-lg border border-indigo-500/30">
                  <input
                    type="text"
                    className="bg-transparent border-none text-xs text-gray-200 focus:outline-none w-24 p-0.5"
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    placeholder="Rename..."
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (renameName.trim()) {
                        onRenameProfile(activeProfileId, renameName.trim());
                      }
                      setIsRenaming(false);
                    }}
                    className="text-emerald-400 hover:text-emerald-300 font-bold text-xs px-1"
                  >
                    Set
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRenaming(false)}
                    className="text-gray-400 hover:text-gray-100 text-xs px-1"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const activeP = profiles.find((p) => p.id === activeProfileId);
                    setRenameName(activeP ? activeP.name : "");
                    setIsRenaming(true);
                  }}
                  className="bg-[#15171f] hover:bg-[#1d202b] border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-gray-200 p-2 rounded-lg transition active:scale-95 cursor-pointer"
                  title="Rename Profile Name"
                  disabled={botState.status !== BotStatus.STOPPED}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Inline creation helper */}
              {isCreating ? (
                <div className="flex items-center gap-1 bg-[#15171f] px-2 py-1 rounded-lg border border-indigo-500/30">
                  <input
                    type="text"
                    className="bg-transparent border-none text-xs text-gray-200 focus:outline-none w-24 p-0.5"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="Custom name..."
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newProfileName.trim()) {
                        onCreateProfile(newProfileName.trim());
                        setNewProfileName("");
                      }
                      setIsCreating(false);
                    }}
                    className="text-emerald-400 hover:text-emerald-300 font-bold text-xs px-1"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewProfileName("");
                      setIsCreating(false);
                    }}
                    className="text-gray-400 hover:text-gray-100 text-xs px-1"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="bg-[#15171f] hover:bg-[#1d202b] border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-indigo-400 p-2 rounded-lg transition active:scale-95 flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                  title="Create a New Trading Account Profile"
                  disabled={botState.status !== BotStatus.STOPPED}
                >
                  <Plus className="w-3.5 h-3.5" /> <span>Add User</span>
                </button>
              )}

              {/* Delete Active Profile button (only shown if there is more than 1 profile) */}
              {profiles.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const activeP = profiles.find((p) => p.id === activeProfileId);
                    if (confirm(`Are you sure you want to permanently delete profile "${activeP?.name}"? All associated configs and logs will be lost.`)) {
                      onDeleteProfile(activeProfileId);
                    }
                  }}
                  className="bg-[#15171f] hover:bg-red-950/20 border border-gray-800 hover:border-red-500/20 text-gray-500 hover:text-red-400 p-2 rounded-lg transition active:scale-95 cursor-pointer"
                  title="Permanent Delete"
                  disabled={botState.status !== BotStatus.STOPPED}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Title / Modes */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-800 mb-5" id="console-header">
          <div className="flex items-center gap-2" id="console-title-wrap">
            <Wallet className="w-5 h-5 text-indigo-400" id="console-icon" />
            <h2 className="text-sm font-semibold text-gray-200 tracking-tight font-sans" id="console-title">
              Risk Engine & Control Panel
            </h2>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-[#0e1015] p-1 rounded-xl border border-gray-800" id="mode-switcher-container">
            <button
              id="mode-btn-sim"
              type="button"
              className={`px-3 py-1 rounded-lg text-[10.5px] font-mono tracking-wider font-bold uppercase transition-all duration-300 ${
                botState.mode === TradingMode.SIMULATION
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-gray-400 hover:text-gray-200"
              }`}
              onClick={() => onUpdateState({ mode: TradingMode.SIMULATION })}
              disabled={botState.status !== BotStatus.STOPPED}
              title="Trade with paper/mock funds using live R_100 feed"
            >
              Simulation
            </button>
            <button
              id="mode-btn-real"
              type="button"
              className={`px-3 py-1 rounded-lg text-[10.5px] font-mono tracking-wider font-bold uppercase transition-all duration-300 ${
                botState.mode === TradingMode.REAL
                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                  : "text-gray-400 hover:text-gray-200"
              }`}
              onClick={() => onUpdateState({ mode: TradingMode.REAL })}
              disabled={botState.status !== BotStatus.STOPPED}
              title="Connect real account to trade on Deriv server"
            >
              Real Account
            </button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5" id="stats-dashboard-grid">
          {/* Metric 1: Wallet Balance */}
          <div className="bg-[#0e1015] p-3 rounded-xl border border-gray-800/80 flex flex-col justify-between" id="metric-balance-box">
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                {botState.mode === TradingMode.REAL ? "Real Wallet" : "SIM Balance"}
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xs font-mono text-gray-400">$</span>
                <span className="text-base font-bold font-mono text-gray-100">
                  {(botState.mode === TradingMode.REAL ? botState.realBalance : botState.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] font-mono text-gray-500 ml-1">
                  {botState.mode === TradingMode.REAL ? (botState.currency || "USD") : "USD"}
                </span>
              </div>
            </div>
            
            {botState.mode === TradingMode.SIMULATION && (
              <button
                type="button"
                id="btn-reset-demo-balance"
                onClick={onResetBalance}
                className="mt-2.5 text-[9px] text-indigo-400 hover:text-indigo-300 font-mono font-bold flex items-center justify-center gap-1 border border-indigo-500/15 hover:border-indigo-500/40 bg-indigo-950/20 hover:bg-indigo-950/50 py-1 px-1.5 rounded-lg w-fit transition active:scale-95 cursor-pointer"
                title="Reset Demo Balance to $10,000.00"
              >
                <RefreshCw className="w-2.5 h-2.5" /> Reset Balance
              </button>
            )}
          </div>

          {/* Metric 2: Net Profit */}
          <div className="bg-[#0e1015] p-3 rounded-xl border border-gray-800/80 flex flex-col justify-between" id="metric-profit-box">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Net Profit/Loss</span>
            <div className="flex items-baseline gap-0.5 mt-1">
              <span className={`text-base font-bold font-mono ${totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {totalProfit >= 0 ? "+" : ""}${totalProfit.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Metric 3: Win Rate */}
          <div className="bg-[#0e1015] p-3 rounded-xl border border-gray-800/80 flex flex-col justify-between" id="metric-winrate-box">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Win Rate</span>
            <div className="flex items-center justify-between mt-1" id="winrate-details-wrapper">
              <span className="text-base font-bold font-mono text-gray-100">{winRate.toFixed(1)}%</span>
              <div className="flex gap-1.5 text-[9px] font-mono text-gray-500">
                <span className="text-emerald-400 font-bold">{winCount}W</span>
                <span>/</span>
                <span className="text-red-400 font-bold">{lossCount}L</span>
              </div>
            </div>
          </div>

          {/* Metric 4: Vol Traded */}
          <div className="bg-[#0e1015] p-3 rounded-xl border border-gray-800/80 flex flex-col justify-between" id="metric-volume-box">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Vol Traded</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-base font-bold font-mono text-gray-100">${volumeTraded.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Inputs section */}
        <div className="mb-5" id="settings-input-grid">
          <div>
            <label className="block text-[11px] text-gray-400 mb-1.5 font-medium" htmlFor="stake-input">
              Initial Stake ($):
            </label>
            <input
              id="stake-input"
              type="number"
              step="0.5"
              min="0.35"
              className="w-full bg-[#0e1015] border border-gray-800 text-xs text-gray-200 font-mono p-2.5 rounded-lg focus:outline-none focus:border-indigo-500"
              value={botState.initialStake}
              disabled={botState.status !== BotStatus.STOPPED}
              onChange={(e) => onUpdateState({ initialStake: Math.max(0.1, Number(e.target.value)) })}
            />
          </div>
        </div>

        {/* Dynamic Strategy Tuning Panel */}
        <div className="bg-[#0a0b0e] p-4 rounded-xl border border-indigo-950/45 mb-5 text-[11px]" id="strategy-tuning-panel">
          <h3 className="font-semibold text-indigo-400 flex items-center gap-1.5 mb-3">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Bot Strategy & Optimizer
          </h3>
          
          <div className="grid grid-cols-1 gap-3.5">
            <div>
              <label className="block text-[10.5px] text-gray-400 mb-1.5 font-medium" htmlFor="contract-type-select">
                Contract Execution Type:
              </label>
              <select
                id="contract-type-select"
                className="w-full bg-[#0e1015] border border-gray-800 text-xs text-gray-200 font-mono p-2 rounded-lg focus:outline-none focus:border-indigo-500 cursor-pointer"
                value={botState.contractType || "MATCH"}
                disabled={botState.status !== BotStatus.STOPPED}
                onChange={(e) => {
                  const val = e.target.value as "MATCH" | "DIFFERS";
                  const optimalMultiplier = val === "DIFFERS" ? 11.5 : 2.0;
                  onUpdateState({ 
                    contractType: val,
                    martingaleMultiplier: optimalMultiplier,
                    stake: botState.initialStake // reset working stake to initial stake as settings altered
                  });
                }}
              >
                <option value="MATCH">DIGITMATCH (High Reward, ~10% Win Rate, 800% profit)</option>
                <option value="DIFFERS">DIGITDIFFERS (High Safety, ~90% Win Rate, 9.8% profit)</option>
              </select>
              {botState.contractType === "DIFFERS" && (
                <div className="mt-1.5 p-2 bg-emerald-950/20 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-sans leading-relaxed">
                  🛡️ <strong>Flat Stake Active:</strong> Martingale is disabled for Digit Differs to protect small accounts from compounding risk.
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10.5px] text-gray-400 mb-1.5 font-medium" htmlFor="prediction-target-select">
                Stat Prediction Target:
              </label>
              <select
                id="prediction-target-select"
                className="w-full bg-[#0e1015] border border-gray-800 text-xs text-gray-200 font-mono p-2 rounded-lg focus:outline-none focus:border-indigo-500 cursor-pointer"
                value={botState.predictionTarget || "SECOND_HIGHEST"}
                disabled={botState.status !== BotStatus.STOPPED}
                onChange={(e) => onUpdateState({ predictionTarget: e.target.value as any })}
              >
                <option value="SECOND_HIGHEST">Second Highest percentage (Leader Hedge)</option>
                <option value="NEW_LEADER">New Stabilized Leader (Trend Follow)</option>
                <option value="OVERTAKEN_LEADER">Overtaken/Past Leader (Reversal Play)</option>
                <option value="COLDEST">Coldest/Least Recurring Digit (Gap Play)</option>
              </select>
            </div>

            <div className="border-t border-gray-800/80 pt-3 mt-1.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10.5px] text-gray-400 font-medium font-sans">Smart Skip (Zero Guard)</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={botState.enableSmartSkip !== false}
                    onChange={(e) => onUpdateState({ enableSmartSkip: e.target.checked })}
                  />
                  <div className="w-8 h-4.5 bg-gray-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                </label>
              </div>

              {botState.enableSmartSkip !== false && (
                <div className="space-y-2 text-[10px] bg-[#0e1015] p-2.5 rounded-lg border border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Skip Threshold (Danger Score):</span>
                    <span className="font-mono text-indigo-400 font-bold">{botState.smartSkipThreshold ?? 85}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    step="5"
                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    value={botState.smartSkipThreshold ?? 85}
                    onChange={(e) => onUpdateState({ smartSkipThreshold: parseInt(e.target.value, 10) })}
                  />
                  <p className="text-[9px] text-gray-500 leading-normal">
                    Skips the trade if the predicted target digit is heavily overdue and expected to show up next on VIX 100.
                  </p>

                  {skippedTrades && skippedTrades > 0 ? (
                    <div className="pt-2 border-t border-gray-800/60 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-amber-400 font-semibold flex items-center gap-1">
                          🛡️ Skipped Trades: {skippedTrades}
                        </span>
                        {onClearSkipped && (
                          <button
                            type="button"
                            onClick={onClearSkipped}
                            className="text-gray-500 hover:text-gray-300 underline text-[8.5px] cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {lastSkippedReason && (
                        <div className="text-[8.5px] text-gray-400 bg-black/40 p-1.5 rounded leading-relaxed border border-gray-800/60 max-h-16 overflow-y-auto font-mono">
                          {lastSkippedReason}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="border-t border-gray-800/80 pt-3 mt-1.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10.5px] text-gray-400 font-medium font-sans">Zero Digit Alert (0 Indicator)</span>
                <span className="text-[9.5px] text-gray-500 font-sans">Audio / Visual Alert</span>
              </div>
              <div className="space-y-2 text-[10px] bg-[#0e1015] p-2.5 rounded-lg border border-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 flex items-center gap-1.5">
                    {muteZeroAlerts ? (
                      <VolumeX className="w-3.5 h-3.5 text-gray-500 animate-pulse" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    Play Sound Alert
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={!muteZeroAlerts}
                      onChange={(e) => onToggleMuteZero(!e.target.checked)}
                    />
                    <div className="w-8 h-4.5 bg-gray-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-white"></div>
                  </label>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-indigo-400" />
                    Show Visual Banner
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={showZeroToasts}
                      onChange={(e) => onToggleShowToasts(e.target.checked)}
                    />
                    <div className="w-8 h-4.5 bg-gray-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                  </label>
                </div>

                <div className="pt-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={onPlayTestChime}
                    className="text-[9px] text-gray-400 hover:text-white font-mono flex items-center gap-1 border border-gray-800 hover:border-gray-700 bg-gray-900/60 hover:bg-gray-900 px-2   py-1 rounded cursor-pointer transition active:scale-95"
                    title="Test-play the synth chimer sound (helps activate web audio contextual stream)"
                  >
                    🔊 Test Audio Chime
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Real Account Token Authorization (Conditional) */}
        {botState.mode === TradingMode.REAL && (
          <div className="bg-[#0a0b0e] p-4 rounded-xl border border-amber-900/30 mb-5 text-[11px]" id="real-credentials-form-container">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-amber-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Configure Deriv Live Token
              </span>
              <button
                id="btn-credential-help-toggle"
                type="button"
                className="text-gray-500 hover:text-gray-300 transition"
                onClick={() => setShowTokenHelp(!showTokenHelp)}
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </div>

            {showTokenHelp && (
              <p className="text-gray-400 leading-relaxed mb-3 p-2 bg-gray-900/50 rounded border border-gray-800">
                To execute live automated trades, log into your <strong>Deriv Account</strong>, go to <strong>Settings &gt; API Token</strong>, generate a token with <strong>Read</strong> and <strong>Trade</strong> scopes, and copy it here. Your credentials remain completely local to your browser session.
              </p>
            )}

            <div className="space-y-3" id="credential-form">
              <div className="grid grid-cols-2 gap-3" id="credential-inputs-row">
                <div>
                  <label className="block text-gray-400 text-[10px] mb-1" htmlFor="deriv-appid-input">App ID (Default: 1089)</label>
                  <input
                    id="deriv-appid-input"
                    type="text"
                    className="w-full bg-[#15171f] border border-gray-800 p-2 rounded text-[11px] font-mono text-gray-200 focus:outline-none focus:border-amber-500"
                    placeholder="1089"
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-[10px] mb-1" htmlFor="deriv-token-input">API Token (Secret Key)</label>
                  <input
                    id="deriv-token-input"
                    type="password"
                    className="w-full bg-[#15171f] border border-gray-800 p-2 rounded text-[11px] font-mono text-gray-200 focus:outline-none focus:border-amber-500"
                    placeholder="e.g. cr_T0k3n_..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex-1" id="authorization-status-indicator">
                  {botState.isAuthorized ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1 font-mono text-[10.5px]">
                      ● Live Connected
                    </span>
                  ) : (
                    <span className="text-gray-500 font-mono text-[10.5px]">
                      ● Keys Not Applied
                    </span>
                  )}
                </div>
                <button
                  id="btn-apply-credentials"
                  type="button"
                  onClick={handleApplyCredentials}
                  className="bg-amber-600/20 hover:bg-amber-600 border border-amber-500/30 hover:border-amber-500 text-amber-200 hover:text-white transition duration-200 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold"
                >
                  Apply & Handshake
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Bot Control Triggers */}
      <div className="flex flex-col gap-3 mt-4" id="console-action-rows">
        {botState.errorMsg && (
          <div className="bg-red-950/20 border border-red-500/20 text-red-400 text-xs py-2 px-3 rounded-xl font-mono text-center" id="console-error-display">
            {botState.errorMsg}
          </div>
        )}

        <div className="flex items-center gap-3" id="operational-triggers-wrapper">
          {botState.status !== BotStatus.RUNNING ? (
            <button
              id="btn-trigger-start"
              type="button"
              onClick={onStart}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold font-mono tracking-wider transition-all duration-300 ${
                botState.mode === TradingMode.REAL && !botState.isAuthorized
                  ? "bg-gray-800 border border-gray-700 text-gray-500 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/10 cursor-pointer"
              }`}
              disabled={botState.mode === TradingMode.REAL && !botState.isAuthorized}
            >
              <Play className="w-4 h-4 fill-current" />
              START ENGINE
            </button>
          ) : (
            <button
              id="btn-trigger-pause"
              type="button"
              onClick={onPause}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold font-mono tracking-wider transition-all duration-300 shadow-lg shadow-amber-600/10 cursor-pointer"
            >
              <Pause className="w-4 h-4 fill-current" />
              PAUSE BOT
            </button>
          )}

          <button
            id="btn-trigger-stop"
            type="button"
            onClick={onStop}
            className={`py-3 px-4.5 rounded-xl border font-bold font-mono text-xs transition duration-200 ${
              botState.status !== BotStatus.STOPPED
                ? "bg-red-950/30 border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white cursor-pointer"
                : "bg-gray-800/10 border-gray-800 text-gray-600 cursor-not-allowed"
            }`}
            disabled={botState.status === BotStatus.STOPPED}
          >
            <Square className="w-4 h-4 fill-current" />
          </button>

          <button
            id="btn-trigger-reset-analytics"
            type="button"
            onClick={onResetStats}
            title="Reset Trading Statistics"
            className="p-3 bg-gray-800/40 hover:bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-800 rounded-xl transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
