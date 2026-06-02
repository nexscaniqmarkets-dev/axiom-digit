/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useMemo, useRef } from "react";
import { useTelegram } from "./useTelegram";
import { BotStatus, TradingMode, BotState, TickData, DigitStat, TradeLog, LeaderShiftState, UserProfile } from "./types";

import { DigitStatsPanel } from "./components/DigitStatsPanel";
import { TradingConsole } from "./components/TradingConsole";
import { TradeLogTable } from "./components/TradeLogTable";
import { Zap, HelpCircle, ShieldAlert, Cpu, BellRing, BarChart3, SlidersHorizontal, History } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  // Initialize Telegram Mini App
  const { tg, isInsideTelegram, haptic } = useTelegram();

  // Load Profiles list with legacy fallback support
  const [profiles, setProfiles] = useState<UserProfile[]>(() => {
    try {
      const saved = localStorage.getItem("axiom_profiles");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse saved profiles:", e);
    }

    // Migrate existing custom settings to a Default Profile
    const legacyAppId = localStorage.getItem("deriv_app_id") || "1089";
    const legacyApiToken = localStorage.getItem("deriv_api_token") || "";
    const legacyContractType = (localStorage.getItem("deriv_contract_type") as "MATCH" | "DIFFERS") || "MATCH";
    const legacyPredictionTarget = (localStorage.getItem("deriv_prediction_target") as any) || "SECOND_HIGHEST";
    const legacyMartingaleMultiplier = parseFloat(localStorage.getItem("deriv_martingale_multiplier") || "2.0");
    const legacyInitialStake = parseFloat(localStorage.getItem("deriv_initial_stake") || "1.0");
    const legacyLookbackTicks = parseInt(localStorage.getItem("deriv_lookback_ticks") || "100", 10);
    const legacyConfirmationBuffer = parseInt(localStorage.getItem("deriv_confirmation_buffer") || "3", 10);
    const legacyMode = (localStorage.getItem("deriv_mode") as TradingMode) || TradingMode.SIMULATION;
    const legacyEnableSmartSkip = localStorage.getItem("deriv_enable_smart_skip") !== "false";
    const legacySmartSkipThreshold = parseInt(localStorage.getItem("deriv_smart_skip_threshold") || "85", 10);
    const legacyBalanceStr = localStorage.getItem("deriv_balance");
    const legacyBalance = legacyBalanceStr !== null ? parseFloat(legacyBalanceStr) : 10000.0;

    const defaultProfile: UserProfile = {
      id: "default",
      name: "Default Profile",
      appId: legacyAppId,
      apiToken: legacyApiToken,
      balance: legacyBalance,
      initialStake: legacyInitialStake,
      martingaleMultiplier: legacyMartingaleMultiplier,
      lookbackTicks: legacyLookbackTicks,
      confirmationBuffer: legacyConfirmationBuffer,
      contractType: legacyContractType,
      predictionTarget: legacyPredictionTarget,
      enableSmartSkip: legacyEnableSmartSkip,
      smartSkipThreshold: legacySmartSkipThreshold,
      mode: legacyMode,
      logs: []
    };

    return [defaultProfile];
  });

  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    return localStorage.getItem("axiom_active_profile_id") || "default";
  });

  const [botState, setBotState] = useState<BotState>(() => {
    // Determine active profile
    const initialActiveProfileId = localStorage.getItem("axiom_active_profile_id") || "default";
    let initialProfiles: UserProfile[] = [];
    try {
      const saved = localStorage.getItem("axiom_profiles");
      if (saved) {
        initialProfiles = JSON.parse(saved);
      }
    } catch {}

    const profile = initialProfiles.find((p) => p.id === initialActiveProfileId) || initialProfiles[0];
    
    if (profile) {
      return {
        status: BotStatus.STOPPED,
        mode: profile.mode,
        stake: profile.initialStake,
        initialStake: profile.initialStake,
        martingaleMultiplier: profile.martingaleMultiplier,
        lookbackTicks: profile.lookbackTicks,
        confirmationBuffer: profile.confirmationBuffer,
        balance: profile.balance,
        realBalance: 0.0,
        currency: "USD",
        isAuthorized: false,
        appId: profile.appId,
        apiToken: profile.apiToken,
        errorMsg: null,
        contractType: profile.contractType,
        predictionTarget: profile.predictionTarget,
        enableSmartSkip: profile.enableSmartSkip,
        smartSkipThreshold: profile.smartSkipThreshold
      };
    }

    return {
      status: BotStatus.STOPPED,
      mode: TradingMode.SIMULATION,
      stake: 1.0,
      initialStake: 1.0,
      martingaleMultiplier: 2.0,
      lookbackTicks: 100,
      confirmationBuffer: 3,
      balance: 10000.0,
      realBalance: 0.0,
      currency: "USD",
      isAuthorized: false,
      appId: "1089",
      apiToken: "",
      errorMsg: null,
      contractType: "MATCH",
      predictionTarget: "SECOND_HIGHEST",
      enableSmartSkip: true,
      smartSkipThreshold: 85
    };
  });

  const [tickHistory, setTickHistory] = useState<TickData[]>([]);
  
  const [logs, setLogs] = useState<TradeLog[]>(() => {
    const initialActiveProfileId = localStorage.getItem("axiom_active_profile_id") || "default";
    let initialProfiles: UserProfile[] = [];
    try {
      const saved = localStorage.getItem("axiom_profiles");
      if (saved) {
        initialProfiles = JSON.parse(saved);
      }
    } catch {}
    const profile = initialProfiles.find((p) => p.id === initialActiveProfileId) || initialProfiles[0];
    return profile ? profile.logs : [];
  });

  // Track skipped trades
  const [skippedTrades, setSkippedTrades] = useState(0);
  const [lastSkippedReason, setLastSkippedReason] = useState<string | null>(null);

  // Zero Alert state configuration
  const [zeroAlerts, setZeroAlerts] = useState<{ id: string; quote: number; timestamp: string }[]>([]);
  const [muteZeroAlerts, setMuteZeroAlerts] = useState(() => {
    return localStorage.getItem("mute_zero_alerts") === "true";
  });
  const [showZeroToasts, setShowZeroToasts] = useState(() => {
    return localStorage.getItem("show_zero_toasts") !== "false";
  });

  const muteZeroAlertsRef = useRef(muteZeroAlerts);
  muteZeroAlertsRef.current = muteZeroAlerts;

  const showZeroToastsRef = useRef(showZeroToasts);
  showZeroToastsRef.current = showZeroToasts;

  // Stale state safe callback ref
  const handleZeroAppearanceRef = useRef<(tick: TickData) => void>(() => {});

  // Local storage synchronization
  useEffect(() => {
    localStorage.setItem("mute_zero_alerts", muteZeroAlerts.toString());
  }, [muteZeroAlerts]);

  useEffect(() => {
    localStorage.setItem("show_zero_toasts", showZeroToasts.toString());
  }, [showZeroToasts]);

  // Tab layout navigation state
  const [activeTab, setActiveTab] = useState<"deck" | "analytics" | "logs">(() => {
    return (localStorage.getItem("active_tab") as "deck" | "analytics" | "logs") || "deck";
  });

  useEffect(() => {
    localStorage.setItem("active_tab", activeTab);
  }, [activeTab]);

  // Web Audio Synth Chime
  const triggerAlertChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;
      
      // Beautiful fintech chord: prime harmonic fifth
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.22);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(783.99, now + 0.08); // G5
      gain2.gain.setValueAtTime(0.12, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.4);
    } catch (e) {
      console.warn("AudioContext blocked or not supported on this browser:", e);
    }
  };

  const handleZeroAppearance = (tick: TickData) => {
    const timestampStr = new Date(tick.epoch * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    
    // Play sound if not muted
    if (!muteZeroAlertsRef.current) {
      triggerAlertChime();
    }

    // Display sliding visual toast
    if (showZeroToastsRef.current) {
      const toastId = Math.random().toString(36).substring(2, 9);
      setZeroAlerts((prev) => [
        { id: toastId, quote: tick.quote, timestamp: timestampStr },
        ...prev.slice(0, 3) // restrict active animation queue to last 4 toasts
      ]);

      setTimeout(() => {
        setZeroAlerts((prev) => prev.filter((toast) => toast.id !== toastId));
      }, 4500);
    }
  };
  handleZeroAppearanceRef.current = handleZeroAppearance;

  const handleSwitchProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    localStorage.setItem("axiom_active_profile_id", profileId);
    setSkippedTrades(0);
    setLastSkippedReason(null);
    setZeroAlerts([]);

    const activeP = profiles.find((p) => p.id === profileId);
    if (activeP) {
      setLogs(activeP.logs);
    }
  };

  const handleCreateProfile = (name: string, apiToken = "", appId = "1089") => {
    const newId = Math.random().toString(36).substring(2, 9);
    const newProfile: UserProfile = {
      id: newId,
      name: name || `Profile ${profiles.length + 1}`,
      appId,
      apiToken,
      balance: 10000.0,
      initialStake: 1.0,
      martingaleMultiplier: 2.0,
      lookbackTicks: 100,
      confirmationBuffer: 3,
      contractType: "MATCH",
      predictionTarget: "SECOND_HIGHEST",
      enableSmartSkip: true,
      smartSkipThreshold: 85,
      mode: TradingMode.SIMULATION,
      logs: []
    };

    fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newProfile)
    })
    .then(() => {
      setActiveProfileId(newId);
      localStorage.setItem("axiom_active_profile_id", newId);
    })
    .catch((err) => console.error("Error creating profile:", err));
  };

  const handleDeleteProfile = (profileId: string) => {
    if (profiles.length <= 1) return;

    fetch(`/api/profiles/${profileId}`, {
      method: "DELETE"
    })
    .then(() => {
      if (activeProfileId === profileId) {
        const remaining = profiles.filter((p) => p.id !== profileId);
        setActiveProfileId(remaining[0].id);
        localStorage.setItem("axiom_active_profile_id", remaining[0].id);
      }
    })
    .catch((err) => console.error("Error deleting profile:", err));
  };

  const handleRenameProfile = (profileId: string, newName: string) => {
    const p = profiles.find((prof) => prof.id === profileId);
    if (p) {
      const updated = { ...p, name: newName };
      fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      }).catch((err) => console.error("Error renaming profile:", err));
    }
  };
  
  // Shift Engine Tracking
  const [shiftState, setShiftState] = useState<LeaderShiftState>({
    currentLeader: null,
    newLeaderCandidate: null,
    consecutiveMatches: 0,
    confirmedLeader: null,
    secondHighest: null,
  });

  const [isEvaluatingTick, setIsEvaluatingTick] = useState(false);
  const [lastEvaluatedLastDigit, setLastEvaluatedLastDigit] = useState<number | null>(null);

  // Refs for callbacks to prevent stale state issues
  const botStateRef = useRef(botState);
  botStateRef.current = botState;
  
  const tickHistoryRef = useRef(tickHistory);
  tickHistoryRef.current = tickHistory;

  const shiftStateRef = useRef(shiftState);
  shiftStateRef.current = shiftState;

  const statsRef = useRef<DigitStat[]>([]);

  // Track active running trades to prevent duplicate orders
  const activeTradeRef = useRef<boolean>(false);
  const activeTradeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track resolved trade IDs to ensure balance and stake updates occur exactly once per trade
  const processedTradesRef = useRef<Set<string>>(new Set());

  // Connection info
  const [connectionStatus, setConnectionStatus] = useState({ connected: false, message: "Offline" });
  const socketRef = useRef<WebSocket | null>(null);

  // 1. Connect to backend websocket to sync ticks, balances, profiles and active bot statuses in real-time
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;
    
    let reconnectTimeout: NodeJS.Timeout | null = null;

    function connect() {
      console.log("Connecting client to Axiom server WS:", wsUrl);
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus({ connected: true, message: "Connected to Axiom Server" });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "init") {
            setProfiles(data.profiles);
            if (data.tickHistory) {
              setTickHistory(data.tickHistory);
            }
            
            const activeP = data.profiles.find((p: any) => p.id === activeProfileId);
            const activeStat = data.botStatuses?.find((b: any) => b.profileId === activeProfileId);
            
            setLogs(activeP ? activeP.logs : []);
            
            if (activeP) {
              setBotState((prev) => ({
                ...prev,
                status: activeStat ? activeStat.status : BotStatus.STOPPED,
                mode: activeP.mode,
                stake: activeStat ? activeStat.stake : activeP.initialStake,
                initialStake: activeP.initialStake,
                martingaleMultiplier: activeP.martingaleMultiplier,
                lookbackTicks: activeP.lookbackTicks,
                confirmationBuffer: activeP.confirmationBuffer,
                balance: activeStat ? activeStat.balance : activeP.balance,
                realBalance: activeStat ? activeStat.realBalance : 0.0,
                isAuthorized: activeStat ? activeStat.isAuthorized : false,
                appId: activeP.appId,
                apiToken: activeP.apiToken,
                errorMsg: activeStat ? activeStat.errorMsg : null,
                contractType: activeP.contractType,
                predictionTarget: activeP.predictionTarget,
                enableSmartSkip: activeP.enableSmartSkip,
                smartSkipThreshold: activeP.smartSkipThreshold,
              }));
            }
          }
          
          else if (data.type === "tick") {
            const tick = data.tick;
            setTickHistory((prev) => {
              if (prev.some((t) => t.epoch === tick.epoch)) return prev;
              const next = [...prev, tick];
              if (next.length > 200) {
                return next.slice(-200);
              }
              return next;
            });
            
            if (tick.lastDigit === 0) {
              handleZeroAppearanceRef.current(tick);
            }
            
            setLastEvaluatedLastDigit(tick.lastDigit);
            setIsEvaluatingTick(true);
            setTimeout(() => setIsEvaluatingTick(false), 120);
          }
          
          else if (data.type === "profiles") {
            setProfiles(data.profiles);
            const activeP = data.profiles.find((p: any) => p.id === activeProfileId);
            if (activeP) {
              setLogs(activeP.logs);
              setBotState((prev) => ({
                ...prev,
                initialStake: activeP.initialStake,
                martingaleMultiplier: activeP.martingaleMultiplier,
                lookbackTicks: activeP.lookbackTicks,
                confirmationBuffer: activeP.confirmationBuffer,
                appId: activeP.appId,
                apiToken: activeP.apiToken,
                contractType: activeP.contractType,
                predictionTarget: activeP.predictionTarget,
                enableSmartSkip: activeP.enableSmartSkip,
                smartSkipThreshold: activeP.smartSkipThreshold,
                mode: activeP.mode,
              }));
            }
          }
          
          else if (data.type === "trade_update") {
            if (data.profileId === activeProfileId) {
              setLogs((prev) => {
                const existingIndex = prev.findIndex((l) => l.id === data.log.id);
                if (existingIndex >= 0) {
                  const updated = [...prev];
                  updated[existingIndex] = data.log;
                  return updated;
                }
                return [data.log, ...prev];
              });
            }
          }
          
          else if (data.type === "bot_status") {
            if (data.profileId === activeProfileId) {
              const state = data.state;
              setBotState((prev) => ({
                ...prev,
                status: state.status,
                stake: state.stake,
                balance: state.balance,
                realBalance: state.realBalance,
                isAuthorized: state.isAuthorized,
                errorMsg: state.errorMsg,
              }));
            }
          }
          
          else if (data.type === "trade_skipped") {
            if (data.profileId === activeProfileId) {
              setSkippedTrades((prev) => prev + 1);
              setLastSkippedReason(data.reason);
            }
          }
        } catch (e) {
          console.error("Error parsing backend message:", e);
        }
      };

      ws.onclose = () => {
        setConnectionStatus({ connected: false, message: "Disconnected from Axiom Server" });
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [activeProfileId]);

  // Trigger strategy evaluation on every new tick history update
  useEffect(() => {
    if (tickHistory.length > 0) {
      evaluateStrategy();
    }
  }, [tickHistory]);

  // Compute active digit statistics over the current lookback ticks
  const stats: DigitStat[] = useMemo(() => {
    const counts = Array(10).fill(0);
    const windowList = tickHistory.slice(-botState.lookbackTicks);
    const total = windowList.length || 1;

    windowList.forEach((t) => {
      counts[t.lastDigit]++;
    });

    const unsortedStats = counts.map((count, digit) => {
      // Find occurrences of this digit in the windowList
      const occurrences: number[] = [];
      windowList.forEach((t, idx) => {
        if (t.lastDigit === digit) {
          occurrences.push(idx);
        }
      });

      // currentGap: ticks since last appearance. If it never appeared, it is lookback ticks.
      const lastIndex = occurrences.length > 0 ? occurrences[occurrences.length - 1] : -1;
      const currentGap = lastIndex !== -1 ? (windowList.length - 1 - lastIndex) : windowList.length;

      // Calculate gaps between consecutive occurrences
      const gaps: number[] = [];
      let prevIdx = -1;
      occurrences.forEach((idx) => {
        if (prevIdx !== -1) {
          gaps.push(idx - prevIdx);
        }
        prevIdx = idx;
      });

      // avgGap: Average gap. If there are no consecutive appearances, fall back to theoretical 10.
      const avgGap = gaps.length > 0 
        ? parseFloat((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1))
        : 10;

      const maxGap = gaps.length > 0 
        ? Math.max(...gaps)
        : 10;

      // dangerScore: probability indicator representing how overdue the digit is to appear again.
      // E.g., if average gap is 10 ticks, and it hasn't appeared for 12 ticks, it's highly overdue.
      const dangerScore = Math.min(100, Math.round((currentGap / (avgGap || 10)) * 100));

      return {
        digit,
        count,
        percentage: (count / total) * 100,
        rank: 10,
        currentGap,
        avgGap,
        maxGap,
        dangerScore,
      };
    });

    // Assign ranking
    const sorted = [...unsortedStats].sort((a, b) => b.percentage - a.percentage);
    sorted.forEach((item, index) => {
      const match = unsortedStats.find((s) => s.digit === item.digit);
      if (match) match.rank = index + 1;
    });

    return unsortedStats;
  }, [tickHistory, botState.lookbackTicks]);
  statsRef.current = stats;

  // Get current 1st and second highest digits
  const sortedStats = useMemo(() => {
    return [...stats].sort((a, b) => b.percentage - a.percentage);
  }, [stats]);

  const topDigitValue = sortedStats[0]?.digit ?? null;
  const secondHighestDigitValue = sortedStats[1]?.digit ?? null;

  const predictedDigitValue = useMemo(() => {
    const snapStats = sortedStats;
    if (snapStats.length < 2) return null;

    const currentLeaderDigit = snapStats[0].digit;
    const secondRankDigit = snapStats[1].digit;
    const target = botState.predictionTarget || "SECOND_HIGHEST";

    if (target === "SECOND_HIGHEST") {
      return secondRankDigit;
    } else if (target === "NEW_LEADER") {
      return currentLeaderDigit;
    } else if (target === "OVERTAKEN_LEADER") {
      return shiftState.confirmedLeader !== null ? shiftState.confirmedLeader : secondRankDigit;
    } else if (target === "COLDEST") {
      return snapStats[snapStats.length - 1]?.digit ?? secondRankDigit;
    }
    return secondRankDigit;
  }, [sortedStats, botState.predictionTarget, shiftState.confirmedLeader]);

  // The central logic trigger that evaluates leadership shifts (Client-Side Visual Only)
  const evaluateStrategy = () => {
    const snapStats = sortedStats;
    if (snapStats.length < 2) return;

    const currentLeaderDigit = snapStats[0].digit;
    const secondRankDigit = snapStats[1].digit;

    let nextLeader = shiftStateRef.current.currentLeader;
    let candidate = shiftStateRef.current.newLeaderCandidate;
    let count = shiftStateRef.current.consecutiveMatches;

    // Handle raw initialization
    if (nextLeader === null) {
      setShiftState({
        currentLeader: currentLeaderDigit,
        newLeaderCandidate: null,
        consecutiveMatches: 0,
        confirmedLeader: currentLeaderDigit,
        secondHighest: secondRankDigit,
      });
      return;
    }

    // Check for overtaking attempts
    if (currentLeaderDigit !== nextLeader) {
      if (currentLeaderDigit === candidate) {
        count++;
      } else {
        candidate = currentLeaderDigit;
        count = 1;
      }

      // Check if new leader stabilizes
      if (count >= botStateRef.current.confirmationBuffer) {
        nextLeader = candidate; // shift leadership!
        candidate = null;
        count = 0;
      }
    } else {
      // Reset candidate: current leader successfully defended rank 1
      candidate = null;
      count = 0;
    }

    setShiftState({
      currentLeader: nextLeader,
      newLeaderCandidate: candidate,
      consecutiveMatches: count,
      confirmedLeader: nextLeader,
      secondHighest: secondRankDigit,
    });
  };

  // Filter logs based on the active TradingMode so simulation and real account metrics are kept completely separate
  const filteredLogs = useMemo(() => {
    const isRealMode = botState.mode === TradingMode.REAL;
    return logs.filter((log) => {
      const isRealLog = log.id.startsWith("real_");
      return isRealLog === isRealMode;
    });
  }, [logs, botState.mode]);

  // Live aggregation metrics
  const tradeCounters = useMemo(() => {
    let winCount = 0;
    let lossCount = 0;
    let totalProfit = 0;
    let volumeTraded = 0;

    filteredLogs.forEach((log) => {
      if (log.status === "won") {
        winCount++;
        totalProfit += log.profit;
        volumeTraded += log.currentStake;
      } else if (log.status === "lost") {
        lossCount++;
        totalProfit += log.profit;
        volumeTraded += log.currentStake;
      } else if (log.status === "pending") {
        volumeTraded += log.currentStake;
      }
    });

    return {
      winCount,
      lossCount,
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      volumeTraded: parseFloat(volumeTraded.toFixed(2)),
    };
  }, [filteredLogs]);

  // Operational toggles
  const handleStartBot = () => {
    fetch("/api/bot/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: activeProfileId }),
    }).catch((err) => console.error("Error starting bot:", err));
  };

  const handlePauseBot = () => {
    fetch("/api/bot/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: activeProfileId }),
    }).catch((err) => console.error("Error pausing bot:", err));
  };

  const handleStopBot = () => {
    fetch("/api/bot/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: activeProfileId }),
    }).catch((err) => console.error("Error stopping bot:", err));
  };

  const handleUpdateBotState = (updates: Partial<BotState>) => {
    setBotState((prev) => {
      const next = {
        ...prev,
        ...updates,
      };
      if (updates.initialStake !== undefined) {
        next.stake = updates.initialStake;
      }
      
      const activeP = profiles.find((p) => p.id === activeProfileId);
      if (activeP) {
        const updatedProfile: UserProfile = {
          ...activeP,
          appId: next.appId,
          apiToken: next.apiToken,
          initialStake: next.initialStake,
          martingaleMultiplier: next.martingaleMultiplier,
          lookbackTicks: next.lookbackTicks,
          confirmationBuffer: next.confirmationBuffer,
          contractType: next.contractType || "MATCH",
          predictionTarget: next.predictionTarget || "SECOND_HIGHEST",
          enableSmartSkip: next.enableSmartSkip !== false,
          smartSkipThreshold: next.smartSkipThreshold || 85,
          mode: next.mode,
          balance: next.balance,
        };
        fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedProfile)
        }).catch((err) => console.error("Error updating profile:", err));
      }

      return next;
    });
  };

  const handleResetStatistics = () => {
    fetch("/api/bot/reset-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: activeProfileId }),
    })
    .then(() => {
      setLogs([]);
      setSkippedTrades(0);
      setLastSkippedReason(null);
    })
    .catch((err) => console.error("Error resetting statistics:", err));
  };

  const handleResetBalance = () => {
    fetch("/api/bot/reset-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: activeProfileId }),
    })
    .then(() => {
      setLogs([]);
      setSkippedTrades(0);
      setLastSkippedReason(null);
    })
    .catch((err) => console.error("Error resetting balance:", err));
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-gray-100 font-sans antialiased pt-[env(safe-area-inset-top,0px)]" id="main-app-content-view">
      {/* Upper Navigation Ribbons */}
      <header className="bg-[#12131a] border-b border-gray-800/80 px-4 py-3" id="nav-header">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Axiom Digit Icon"
              className="w-12 h-12 rounded-xl object-contain"
            />
            <img
              src="/banner.png"
              alt="Axiom Digit"
              className="h-10 object-contain max-w-[180px]"
            />
          </div>

          {/* Connection Indicators status right */}
          <div className="flex items-center gap-3" id="connection-ribbon">
            <div className={`px-3.5 py-1.5 rounded-full border text-xs font-mono flex items-center gap-2 ${
              connectionStatus.connected
                ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-400"
                : "bg-red-950/30 border-red-500/30 text-red-400"
            }`}>
              <span className={`w-2 h-2 rounded-full ${connectionStatus.connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}></span>
              <span>{connectionStatus.connected ? "Deriv WS Live Feed" : "WS Disconnected"}</span>
            </div>
            
            {botState.isAuthorized && botState.mode === TradingMode.REAL && (
              <span className="text-xs bg-amber-950/30 border border-amber-500/30 text-amber-400 px-3 py-1.5 rounded-full font-mono font-medium">
                Live trading on account: {botState.apiToken.substring(0, 4)}...
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 pb-32" id="workspace-main-grid-frame">
        <AnimatePresence mode="wait">
          {activeTab === "deck" && (
            <motion.div
              key="deck"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="max-w-3xl mx-auto"
              id="section-controls-workspace"
            >
              <TradingConsole
                botState={botState}
                onStart={handleStartBot}
                onPause={handlePauseBot}
                onStop={handleStopBot}
                onUpdateState={handleUpdateBotState}
                winCount={tradeCounters.winCount}
                lossCount={tradeCounters.lossCount}
                totalProfit={tradeCounters.totalProfit}
                volumeTraded={tradeCounters.volumeTraded}
                onResetStats={handleResetStatistics}
                onResetBalance={handleResetBalance}
                skippedTrades={skippedTrades}
                lastSkippedReason={lastSkippedReason}
                onClearSkipped={() => {
                  setSkippedTrades(0);
                  setLastSkippedReason(null);
                }}
                muteZeroAlerts={muteZeroAlerts}
                onToggleMuteZero={setMuteZeroAlerts}
                showZeroToasts={showZeroToasts}
                onToggleShowToasts={setShowZeroToasts}
                onPlayTestChime={triggerAlertChime}
                profiles={profiles}
                activeProfileId={activeProfileId}
                onSwitchProfile={handleSwitchProfile}
                onCreateProfile={handleCreateProfile}
                onDeleteProfile={handleDeleteProfile}
                onRenameProfile={handleRenameProfile}
              />
            </motion.div>
          )}

          {activeTab === "analytics" && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              id="section-analytics-workspace"
            >
              <DigitStatsPanel
                stats={stats}
                recentTicks={tickHistory}
                lookbackTicks={botState.lookbackTicks}
                onLookbackChange={(ticksVal) => handleUpdateBotState({ lookbackTicks: ticksVal })}
                consecutiveCount={shiftState.consecutiveMatches}
                confirmationBuffer={botState.confirmationBuffer}
                newLeaderCandidate={shiftState.newLeaderCandidate}
                currentLeader={shiftState.currentLeader}
              />
            </motion.div>
          )}

          {activeTab === "logs" && (
            <motion.div
              key="logs"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              id="section-logs-audit-list"
            >
              <TradeLogTable logs={filteredLogs} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Premium Floating Bottom Tab Navigation Deck */}
      <div 
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-4 pointer-events-none" 
        id="bottom-tab-navigation-deck"
      >
        <div className="pointer-events-auto flex items-center justify-between gap-1 p-1.5 bg-[#0e1118]/90 border border-gray-800/80 backdrop-blur-md rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
          <button
            type="button"
            onClick={() => setActiveTab("deck")}
            className={`flex-1 flex gap-2 items-center justify-center py-2.5 px-3 rounded-xl transition-all duration-300 font-sans text-xs relative cursor-pointer font-semibold ${
              activeTab === "deck"
                ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/40 border border-transparent"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Trading Deck</span>
            
            <span className="flex h-1.5 w-1.5 relative">
              {botState.status === BotStatus.RUNNING && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                botState.status === BotStatus.RUNNING
                  ? "bg-emerald-400"
                  : botState.status === BotStatus.PAUSED
                  ? "bg-amber-400"
                  : "bg-gray-500"
              }`}></span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`flex-1 flex gap-2 items-center justify-center py-2.5 px-3 rounded-xl transition-all duration-300 font-sans text-xs relative cursor-pointer font-semibold ${
              activeTab === "analytics"
                ? "text-[#6366f1] bg-[#6366f1]/10 border border-[#6366f1]/20"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/40 border border-transparent"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Analytics</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("logs")}
            className={`flex-1 flex gap-2 items-center justify-center py-2.5 px-3 rounded-xl transition-all duration-300 font-sans text-xs relative cursor-pointer font-semibold ${
              activeTab === "logs"
                ? "text-cyan-400 bg-cyan-500/10 border border-cyan-500/20"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/40 border border-transparent"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Transaction Logs</span>
            {filteredLogs.length > 0 && (
              <span className="bg-gray-800 text-gray-300 text-[10px] font-mono px-1.5 py-0.2 rounded-full border border-gray-700/60 font-bold ml-1 font-semibold">
                {filteredLogs.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Floating Zero-Alert Toast Overlay container */}
      <div 
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm pointer-events-none" 
        id="zero-toast-alert-container"
      >
        <AnimatePresence>
          {zeroAlerts.map((alert) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, x: 20 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="pointer-events-auto flex items-center gap-3.5 bg-indigo-950/90 border border-indigo-500/40 backdrop-blur-md p-4 rounded-xl shadow-[0_4px_24px_rgba(99,102,241,0.25)] text-gray-100"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-400 animate-pulse">
                <BellRing className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono tracking-wider bg-indigo-500/30 text-indigo-300 font-bold px-1.5 py-0.5 rounded uppercase">
                    Zero Indicator
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">{alert.timestamp}</span>
                </div>
                <p className="text-xs font-semibold text-gray-100 mt-1">
                  Digit <span className="text-indigo-400 text-sm font-extrabold pr-0.5">0</span> appeared on VIX 100!
                </p>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                  Spot Quote: <span className="text-gray-300">{alert.quote.toFixed(2)}</span>
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-900 mt-16 max-w-7xl mx-auto py-8 text-center text-xs text-gray-500 font-sans" id="footer-ribbon">
        <p>© 2026 Axiom Digit. All rights reserved.</p>
        <p className="mt-1 text-[10px] text-gray-600">Trading derivative contracts involves high risk. Ensure proper testing using the built-in paper trading simulator.</p>
      </footer>
    </div>
  );
}
