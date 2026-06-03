import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { WebSocket, WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
import { BotStatus, TradingMode, UserProfile, TradeLog, TickData, DigitStat, LeaderShiftState } from "./src/types";

const PORT = 3000;
const app = express();
app.use(express.json());

// Profiles JSON persistence path
const PROFILES_FILE = path.join(process.cwd(), "profiles.json");

// Loaded profiles state
let profiles: UserProfile[] = [];

// Load profiles from disk with migration fallback
function loadProfiles() {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const data = fs.readFileSync(PROFILES_FILE, "utf-8");
      profiles = JSON.parse(data);
      console.log(`Loaded ${profiles.length} user profiles from ${PROFILES_FILE}`);
    } else {
      // Default initial profile
      profiles = [
        {
          id: "default",
          name: "Default Profile",
          appId: "1089",
          apiToken: "",
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
          logs: [],
        }
      ];
      saveProfiles();
    }
  } catch (e) {
    console.error("Error reading profiles.json:", e);
    profiles = [
      {
        id: "default",
        name: "Default Profile",
        appId: "1089",
        apiToken: "",
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
        logs: [],
      }
    ];
  }
}

function saveProfiles() {
  try {
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving profiles.json:", e);
  }
}

loadProfiles();

// Active server-side tick history for R_100, capped at 1000 items
let globalTicksHistory: TickData[] = [];

// Helper to calculate last digit safely
function digitFromQuote(quote: number): number {
  const quoteStr = quote.toString();
  const parts = quoteStr.split(".");
  if (parts.length > 1) {
    return parseInt(parts[1].slice(-1), 10);
  }
  return parseInt(quoteStr.slice(-1), 10);
}

// Compute digit stats
function computeStats(tickHistory: TickData[], lookbackTicks: number): DigitStat[] {
  const counts = Array(10).fill(0);
  const windowList = tickHistory.slice(-lookbackTicks);
  const total = windowList.length || 1;

  windowList.forEach((t) => {
    if (t.lastDigit >= 0 && t.lastDigit <= 9) {
      counts[t.lastDigit]++;
    }
  });

  const unsortedStats = counts.map((count, digit) => {
    const occurrences: number[] = [];
    windowList.forEach((t, idx) => {
      if (t.lastDigit === digit) {
        occurrences.push(idx);
      }
    });

    const lastIndex = occurrences.length > 0 ? occurrences[occurrences.length - 1] : -1;
    const currentGap = lastIndex !== -1 ? (windowList.length - 1 - lastIndex) : windowList.length;

    const gaps: number[] = [];
    let prevIdx = -1;
    occurrences.forEach((idx) => {
      if (prevIdx !== -1) {
        gaps.push(idx - prevIdx);
      }
      prevIdx = idx;
    });

    const avgGap = gaps.length > 0
      ? parseFloat((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1))
      : 10;

    const maxGap = gaps.length > 0 ? Math.max(...gaps) : 10;
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

  const sorted = [...unsortedStats].sort((a, b) => b.percentage - a.percentage);
  sorted.forEach((item, index) => {
    const match = unsortedStats.find((s) => s.digit === item.digit);
    if (match) match.rank = index + 1;
  });

  return unsortedStats;
}

// Global connected clients on our Express WebSocket server
const connectedClients = new Set<WebSocket>();

// Broadcast helper
function broadcastToClients(msg: object) {
  const payload = JSON.stringify(msg);
  connectedClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

// Map profile IDs to active backend engine runs
class ServerTradingBot {
  public profileId: string;
  public status: BotStatus = BotStatus.STOPPED;
  public stake = 1.0;
  public initialStake = 1.0;
  public balance = 10000.0;
  public isAuthorized = false;
  public realBalance = 0.0;
  public errorMsg: string | null = null;

  private derivWs: WebSocket | null = null;
  private shiftState: LeaderShiftState = {
    currentLeader: null,
    newLeaderCandidate: null,
    consecutiveMatches: 0,
    confirmedLeader: null,
    secondHighest: null,
  };

  private activeTrade = false;
  private activeTradeTimeout: NodeJS.Timeout | null = null;
  private processedTrades = new Set<string>();

  // Real trading tracking
  private activeRealContracts = new Map<string, { stake: number; prediction: number }>();
  private openContractsToTrack = new Map<string, TradeLog>();
  private currentPendingRealTrade: TradeLog | null = null;
  private activeFallbacks = new Map<string, NodeJS.Timeout>();
  private pingInterval: NodeJS.Timeout | null = null;

  // Simulator tracking
  private activeSimulatedTrades: Array<{
    log: TradeLog;
    collectedCount: number;
    ticks: number[];
    digits: number[];
    epochNow: number;
    prediction: number;
    isMatchMode: boolean;
    stake: number;
  }> = [];

  constructor(profileId: string) {
    this.profileId = profileId;
    const profile = profiles.find((p) => p.id === profileId);
    if (profile) {
      this.stake = profile.initialStake;
      this.initialStake = profile.initialStake;
      this.balance = profile.balance;
    }
  }

  public getBotDetails() {
    return {
      profileId: this.profileId,
      status: this.status,
      stake: this.stake,
      initialStake: this.initialStake,
      balance: this.balance,
      realBalance: this.realBalance,
      isAuthorized: this.isAuthorized,
      errorMsg: this.errorMsg,
    };
  }

  public start() {
    if (this.status === BotStatus.RUNNING) return;
    
    // Clear any previous error and reset active martingale level
    this.errorMsg = null;
    this.status = BotStatus.RUNNING;
    this.activeTrade = false;
    
    const profile = profiles.find((p) => p.id === this.profileId);
    if (profile) {
      this.stake = profile.initialStake;
      this.initialStake = profile.initialStake;
      this.balance = profile.balance;
    }

    this.connectToDeriv();
    this.broadcastBotState();
  }

  public stop(errorText: string | null = null) {
    if (this.status === BotStatus.STOPPED) return;
    this.status = BotStatus.STOPPED;
    this.activeTrade = false;
    if (errorText) {
      this.errorMsg = errorText;
    }

    this.cleanupContracts();
    this.disconnectFromDeriv();
    this.broadcastBotState();
  }

  private disconnectFromDeriv() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.derivWs) {
      try {
        this.derivWs.close();
      } catch {}
      this.derivWs = null;
    }
    this.isAuthorized = false;
  }

  private cleanupContracts() {
    if (this.activeTradeTimeout) {
      clearTimeout(this.activeTradeTimeout);
      this.activeTradeTimeout = null;
    }
    this.activeFallbacks.forEach((to) => clearTimeout(to));
    this.activeFallbacks.clear();
    this.activeSimulatedTrades = [];
  }

  private broadcastBotState() {
    broadcastToClients({
      type: "bot_status",
      profileId: this.profileId,
      state: this.getBotDetails(),
    });
  }

  public reconnectToDeriv() {
    this.connectToDeriv();
  }

  private connectToDeriv() {
    this.disconnectFromDeriv();
    
    const profile = profiles.find((p) => p.id === this.profileId);
    if (!profile) return;

    const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${profile.appId || "1089"}`;
    console.log(`Bot ${this.profileId} connecting to Deriv: ${wsUrl}`);
    
    try {
      this.derivWs = new WebSocket(wsUrl);

      this.derivWs.on("open", () => {
        console.log(`Bot ${this.profileId} connected to Deriv WS.`);
        
        // Setup Server-side Ping
        this.pingInterval = setInterval(() => {
          if (this.derivWs && this.derivWs.readyState === WebSocket.OPEN) {
            this.derivWs.send(JSON.stringify({ ping: 1 }));
          }
        }, 30000);

        // Subscribe to Ticks
        if (this.derivWs && this.derivWs.readyState === WebSocket.OPEN) {
          this.derivWs.send(JSON.stringify({
            ticks: "R_100",
            subscribe: 1
          }));

          // Authorize if real token is provided
          if (profile.apiToken) {
            this.derivWs.send(JSON.stringify({
              authorize: profile.apiToken
            }));
          }
        }
      });

      this.derivWs.on("message", (rawMsg) => {
        try {
          const data = JSON.parse(rawMsg.toString());
          this.handleDerivMessage(data);
        } catch (e) {
          console.error(`Bot ${this.profileId} error parsing Deriv message:`, e);
        }
      });

      this.derivWs.on("close", () => {
        console.log(`Bot ${this.profileId} Deriv WS connection closed.`);
        this.isAuthorized = false;
        broadcastToClients({ type: "bot_status", profileId: this.profileId, state: this.getBotDetails() });
        
        // Always reconnect for tick data (regardless of bot status)
        setTimeout(() => {
          console.log(`Bot ${this.profileId} reconnecting to Deriv WS...`);
          this.connectToDeriv();
        }, 3000);
      });

      this.derivWs.on("error", (err) => {
        console.error(`Bot ${this.profileId} Deriv WS error:`, err);
      });

    } catch (e: any) {
      console.error(`Failed to trigger connection for bot ${this.profileId}:`, e);
      this.stop(`Connection failed: ${e.message || e}`);
    }
  }

  private handleDerivMessage(data: any) {
    const msgType = data.msg_type;
    const profile = profiles.find((p) => p.id === this.profileId);
    if (!profile) return;

    if (msgType === "tick") {
      const tick = data.tick;
      if (tick && tick.symbol === "R_100") {
        const quote = parseFloat(tick.quote);
        const lastDigit = digitFromQuote(quote);

        const date = new Date(tick.epoch * 1000);
        const timeStr = date.toLocaleTimeString([], { hour12: false });

        const tickPayload: TickData = {
          id: `${tick.epoch}-${tick.quote}-${Math.random().toString(36).substring(2, 8)}`,
          epoch: tick.epoch,
          quote: quote,
          lastDigit: isNaN(lastDigit) ? 0 : lastDigit,
          timeStr: timeStr
        };

        // If this is the active ticking server log, update the global timeline
        // Filter out duplicates
        if (!globalTicksHistory.some((t) => t.epoch === tickPayload.epoch)) {
          globalTicksHistory.push(tickPayload);
          if (globalTicksHistory.length > 1000) {
            globalTicksHistory.shift();
          }
          // Broadcast live tick to all connected browser displays
          broadcastToClients({
            type: "tick",
            tick: tickPayload
          });
        }

        // Handle active simulator steps
        this.advanceSimulatedTrades(tickPayload);

        // If bot is active, run strategy checks
        if (this.status === BotStatus.RUNNING) {
          this.executeStrategyStep();
        }
      }
    }

    else if (msgType === "authorize") {
      if (data.error) {
        console.error(`Bot ${this.profileId} Auth error:`, data.error.message);
        this.isAuthorized = false;
        
        if (profile.mode === TradingMode.REAL) {
          this.stop(`Authorization failure: ${data.error.message}`);
        }
      } else {
        const auth = data.authorize;
        this.realBalance = parseFloat(auth.balance);
        this.isAuthorized = true;
        this.broadcastBotState();

        // Subscribe to backend contract updates and balance stream
        if (this.derivWs && this.derivWs.readyState === WebSocket.OPEN) {
          this.derivWs.send(JSON.stringify({ balance: 1, subscribe: 1 }));
          this.derivWs.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
        }
      }
    }

    else if (msgType === "balance") {
      const b = data.balance;
      if (b) {
        this.realBalance = parseFloat(b.balance);
        this.broadcastBotState();
      }
    }

    else if (msgType === "proposal") {
      const echo = data.echo_req;
      if (data.error) {
        console.error(`Bot ${this.profileId} Proposal error:`, data.error.message);
        if (echo) {
          const propKey = `${echo.amount}_${echo.barrier}`;
          this.activeRealContracts.delete(propKey);
        }
        if (this.currentPendingRealTrade) {
          const failedLog: TradeLog = {
            ...this.currentPendingRealTrade,
            status: "lost",
            profit: -this.currentPendingRealTrade.currentStake,
          };
          this.resolveRealTrade(failedLog);
        }
      } else if (data.proposal) {
        const prop = data.proposal;
        if (echo) {
          const propKey = `${echo.amount}_${echo.barrier}`;
          const activeItem = this.activeRealContracts.get(propKey);
          if (activeItem && this.derivWs && this.derivWs.readyState === WebSocket.OPEN) {
            this.derivWs.send(JSON.stringify({
              buy: prop.id,
              price: activeItem.stake
            }));
            this.activeRealContracts.delete(propKey);
          }
        }
      }
    }

    else if (msgType === "buy") {
      if (data.error) {
        console.error(`Bot ${this.profileId} compra error:`, data.error.message);
        if (this.currentPendingRealTrade) {
          const failedLog: TradeLog = {
            ...this.currentPendingRealTrade,
            status: "lost",
            profit: -this.currentPendingRealTrade.currentStake,
          };
          this.resolveRealTrade(failedLog);
        }
      } else {
        const contractId = data.buy.contract_id?.toString();
        console.log(`Bot ${this.profileId} contract bought successfully: ${contractId}`);
        if (contractId && this.currentPendingRealTrade) {
          this.currentPendingRealTrade.contractId = contractId;
          this.openContractsToTrack.set(contractId, this.currentPendingRealTrade);
          
          // Send update back to frontend
          this.broadcastTradeLog(this.currentPendingRealTrade);

          // Force update subscription
          if (this.derivWs && this.derivWs.readyState === WebSocket.OPEN) {
            this.derivWs.send(JSON.stringify({
              proposal_open_contract: 1,
              contract_id: parseInt(contractId, 10),
              subscribe: 1
            }));
          }
        }
      }
    }

    else if (msgType === "proposal_open_contract") {
      const contract = data.proposal_open_contract;
      if (contract) {
        const contractId = contract.contract_id?.toString();
        if (contractId) {
          if (!this.openContractsToTrack.has(contractId) && this.currentPendingRealTrade) {
            this.currentPendingRealTrade.contractId = contractId;
            this.currentPendingRealTrade.entryTick = contract.entry_tick || 0;
            this.openContractsToTrack.set(contractId, this.currentPendingRealTrade);
          }

          if (this.openContractsToTrack.has(contractId)) {
            const log = this.openContractsToTrack.get(contractId)!;
            
            if (this.currentPendingRealTrade && this.currentPendingRealTrade.contractId === contractId) {
              this.currentPendingRealTrade = null;
            }

            const currentTicks = contract.tick_stream || [];
            const ticksCollected = currentTicks.map((t: any) => parseFloat(t.tick || t.tick_display_value || "0"));
            const digitsCollected = currentTicks.map((t: any) => {
              const qStr = t.tick_display_value || t.tick?.toString() || "0";
              const dec = qStr.split(".");
              if (dec.length > 1) return parseInt(dec[1].slice(-1), 10);
              return parseInt(qStr.slice(-1), 10);
            });

            const isComplete = contract.is_sold === 1 || contract.is_sold === true || contract.status === "won" || contract.status === "lost";

            if (isComplete) {
              const status = contract.status === "won" ? "won" : "lost";
              const profit = parseFloat(contract.profit);

              const updatedLog: TradeLog = {
                ...log,
                status,
                profit,
                entryTick: contract.entry_tick || log.entryTick,
                ticksCollected: ticksCollected.length > 0 ? ticksCollected : log.ticksCollected,
                digitsCollected: digitsCollected.length > 0 ? digitsCollected : log.digitsCollected,
              };

              // Clear background safety fallback
              if (this.activeFallbacks.has(contractId)) {
                clearTimeout(this.activeFallbacks.get(contractId)!);
                this.activeFallbacks.delete(contractId);
              }

              this.openContractsToTrack.delete(contractId);
              this.resolveRealTrade(updatedLog);

              if (contract.balance_after !== undefined) {
                this.realBalance = parseFloat(contract.balance_after);
                this.broadcastBotState();
              }
            } else {
              const updatedLog: TradeLog = {
                ...log,
                entryTick: contract.entry_tick || log.entryTick,
                ticksCollected,
                digitsCollected,
              };
              this.openContractsToTrack.set(contractId, updatedLog);
              this.broadcastTradeLog(updatedLog);

              if (ticksCollected.length >= 5) {
                this.scheduleRealSafetyFallback(contractId);
              }
            }
          }
        }
      }
    }
  }

  private scheduleRealSafetyFallback(contractId: string) {
    if (this.activeFallbacks.has(contractId)) return;

    const to = setTimeout(() => {
      this.activeFallbacks.delete(contractId);
      if (this.openContractsToTrack.has(contractId)) {
        const log = this.openContractsToTrack.get(contractId)!;
        const ticks = log.ticksCollected;
        const digits = log.digitsCollected;

        if (ticks.length >= 5 && digits.length >= 5) {
          console.warn(`Safety fallback triggered server-side for contract ${contractId}`);
          const exitDigit = digits[4];
          const isMatchMode = log.contractType !== "DIFFERS";
          const isWon = isMatchMode ? (exitDigit === log.digitPlaced) : (exitDigit !== log.digitPlaced);
          
          const multiplier = isMatchMode ? 8.09 : 0.098;
          const profit = isWon ? log.currentStake * multiplier : -log.currentStake;

          const updatedLog: TradeLog = {
            ...log,
            status: isWon ? "won" : "lost",
            profit: parseFloat(profit.toFixed(2)),
          };

          this.openContractsToTrack.delete(contractId);
          this.resolveRealTrade(updatedLog);
        }
      }
    }, 1500);

    this.activeFallbacks.set(contractId, to);
  }

  private resolveRealTrade(resolvedLog: TradeLog) {
    this.activeTrade = false;
    if (this.activeTradeTimeout) {
      clearTimeout(this.activeTradeTimeout);
      this.activeTradeTimeout = null;
    }

    if (!this.processedTrades.has(resolvedLog.id)) {
      this.processedTrades.add(resolvedLog.id);
      
      const profile = profiles.find((p) => p.id === this.profileId);
      if (profile) {
        const isLoss = resolvedLog.status === "lost";
        if (resolvedLog.contractType === "MATCH") {
          if (isLoss) {
            this.stake = parseFloat((this.stake * profile.martingaleMultiplier).toFixed(2));
          } else {
            this.stake = profile.initialStake;
          }
        } else {
          this.stake = profile.initialStake; // flat stake for differs
        }

        // Add to persistent user log list
        profile.logs = [resolvedLog, ...profile.logs].slice(0, 200);
        saveProfiles();
        
        broadcastToClients({
          type: "profiles",
          profiles: profiles
        });
      }

      this.broadcastTradeLog(resolvedLog);
      this.broadcastBotState();
    }
  }

  private advanceSimulatedTrades(tick: TickData) {
    if (this.activeSimulatedTrades.length === 0) return;

    this.activeSimulatedTrades = this.activeSimulatedTrades.filter((item) => {
      if (tick.epoch <= item.epochNow) return true; // Skip old ticks

      item.collectedCount++;
      item.ticks.push(tick.quote);
      item.digits.push(tick.lastDigit);

      const updatedLog: TradeLog = {
        ...item.log,
        ticksCollected: [...item.ticks],
        digitsCollected: [...item.digits],
      };

      if (item.collectedCount === 5) {
        const exitDigit = tick.lastDigit;
        const isMatch = exitDigit === item.prediction;
        const won = item.isMatchMode ? isMatch : !isMatch;

        const profit = won ? (item.isMatchMode ? item.stake * 8.09 : item.stake * 0.098) : -item.stake;

        const resolvedLog: TradeLog = {
          ...updatedLog,
          status: won ? "won" : "lost",
          profit: parseFloat(profit.toFixed(2)),
        };

        this.resolveSimulatedTrade(resolvedLog);
        return false; // Remove resolved simulated trade from queue
      } else {
        // Broadcast local intermediate step to listening browsers
        this.broadcastTradeLog(updatedLog);
        return true;
      }
    });
  }

  private resolveSimulatedTrade(resolvedLog: TradeLog) {
    this.activeTrade = false;
    if (this.activeTradeTimeout) {
      clearTimeout(this.activeTradeTimeout);
      this.activeTradeTimeout = null;
    }

    if (!this.processedTrades.has(resolvedLog.id)) {
      this.processedTrades.add(resolvedLog.id);

      const profile = profiles.find((p) => p.id === this.profileId);
      if (profile) {
        const isLoss = resolvedLog.status === "lost";
        this.balance = parseFloat((this.balance + resolvedLog.profit).toFixed(2));
        profile.balance = this.balance;

        if (resolvedLog.contractType === "MATCH") {
          if (isLoss) {
            this.stake = parseFloat((this.stake * profile.martingaleMultiplier).toFixed(2));
          } else {
            this.stake = profile.initialStake;
          }
        } else {
          this.stake = profile.initialStake; // Flat stake for differs
        }

        profile.logs = [resolvedLog, ...profile.logs].slice(0, 200);
        saveProfiles();

        broadcastToClients({
          type: "profiles",
          profiles: profiles
        });
      }

      this.broadcastTradeLog(resolvedLog);
      this.broadcastBotState();
    }
  }

  private broadcastTradeLog(log: TradeLog) {
    broadcastToClients({
      type: "trade_update",
      profileId: this.profileId,
      log: log
    });
  }

  private executeStrategyStep() {
    const profile = profiles.find((p) => p.id === this.profileId);
    if (!profile) return;

    if (this.activeTrade) return; // Gate block if busy on an active contract

    const lookback = profile.lookbackTicks || 100;
    if (globalTicksHistory.length < lookback) {
      // Need more ticks to run the strategy
      return;
    }

    const { shiftState, shouldTriggerTrade, prediction, leaderDigit, previousLeader } = evaluateStrategy(
      profile,
      globalTicksHistory,
      this.shiftState
    );

    this.shiftState = shiftState;

    if (shouldTriggerTrade) {
      this.triggerTrade(prediction!, leaderDigit!, previousLeader);
    }
  }

  private triggerTrade(prediction: number, leader: number, prevLeader: number) {
    const profile = profiles.find((p) => p.id === this.profileId);
    if (!profile) return;

    if (this.activeTrade) return;

    // Smart Skip calculation
    if (profile.enableSmartSkip) {
      const stats = computeStats(globalTicksHistory, profile.lookbackTicks);
      const digitStat = stats.find((s) => s.digit === prediction);
      if (digitStat && digitStat.dangerScore !== undefined) {
        const threshold = profile.smartSkipThreshold ?? 85;
        if (digitStat.dangerScore >= threshold) {
          console.log(`[SMART SKIP SERVER] Bot ${this.profileId} skipped entry prediction ${prediction}. Danger score: ${digitStat.dangerScore}% (>= ${threshold}%)`);
          broadcastToClients({
            type: "trade_skipped",
            profileId: this.profileId,
            reason: `Skipped trade on digit ${prediction}: danger score at ${digitStat.dangerScore}% is >= ${threshold}% (highly likely to appear soon)`
          });
          return;
        }
      }
    }

    this.activeTrade = true;

    // Safety timeout to prevent locks
    this.activeTradeTimeout = setTimeout(() => {
      if (this.activeTrade) {
        console.warn(`[SERVER LOG WARNING] Bot ${this.profileId} safety timeout reached. Force-unlocking bot.`);
        this.activeTrade = false;
        
        // Resolve hypothetical pending
        if (profile.mode === TradingMode.SIMULATION) {
          this.activeSimulatedTrades = [];
        } else {
          this.currentPendingRealTrade = null;
        }

        this.broadcastBotState();
      }
    }, 20000);

    const isMatchMode = profile.contractType === "MATCH";

    if (profile.mode === TradingMode.SIMULATION) {
      // Verify balance
      if (this.balance < this.stake) {
        console.warn(`Bot ${this.profileId} has insufficient simulation balance`);
        this.stop(`Insufficient demo balance. Required: $${this.stake}, available: $${this.balance}.`);
        return;
      }

      const epochNow = globalTicksHistory[globalTicksHistory.length - 1]?.epoch || Math.floor(Date.now() / 1000);
      const entryTime = new Date(epochNow * 1000).toLocaleTimeString([], { hour12: false });
      const entryTick = globalTicksHistory[globalTicksHistory.length - 1]?.quote || 0;

      const simLog: TradeLog = {
        id: "sim_" + Math.random().toString(36).substring(2, 11),
        timestamp: entryTime,
        digitPlaced: prediction,
        leaderDigit: leader,
        previousLeaderDigit: prevLeader,
        stake: profile.initialStake,
        currentStake: this.stake,
        durationTicks: 5,
        boughtAtEpoch: epochNow,
        entryTick: entryTick,
        status: "pending",
        ticksCollected: [],
        digitsCollected: [],
        contractType: profile.contractType,
        profit: 0
      };

      this.activeSimulatedTrades.push({
        log: simLog,
        collectedCount: 0,
        ticks: [],
        digits: [],
        epochNow: epochNow,
        prediction: prediction,
        isMatchMode: isMatchMode,
        stake: this.stake
      });

      // Broadcast immediately
      this.broadcastTradeLog(simLog);

    } else {
      // Real Mode Execution
      if (!this.isAuthorized) {
        this.stop("Attempted real trade but account is not authorized.");
        return;
      }

      if (this.realBalance < this.stake) {
        this.stop(`Insufficient real wallet balance. Required: $${this.stake}, present: $${this.realBalance}`);
        return;
      }

      const epochNow = globalTicksHistory[globalTicksHistory.length - 1]?.epoch || Math.floor(Date.now() / 1000);
      const entryTime = new Date(epochNow * 1000).toLocaleTimeString([], { hour12: false });
      
      const realLog: TradeLog = {
        id: "real_" + Math.random().toString(36).substring(2, 11),
        timestamp: entryTime,
        digitPlaced: prediction,
        leaderDigit: leader,
        previousLeaderDigit: prevLeader,
        stake: profile.initialStake,
        currentStake: this.stake,
        durationTicks: 5,
        boughtAtEpoch: epochNow,
        entryTick: globalTicksHistory[globalTicksHistory.length - 1]?.quote || 0,
        status: "pending",
        ticksCollected: [],
        digitsCollected: [],
        contractType: profile.contractType,
        profit: 0
      };

      this.currentPendingRealTrade = realLog;
      this.broadcastTradeLog(realLog);

      const propKey = `${this.stake}_${prediction}`;
      this.activeRealContracts.set(propKey, {
        stake: this.stake,
        prediction: prediction
      });

      // Issue actual proposal via token socket
      if (this.derivWs && this.derivWs.readyState === WebSocket.OPEN) {
        this.derivWs.send(JSON.stringify({
          proposal: 1,
          amount: this.stake,
          basis: "stake",
          contract_type: isMatchMode ? "DIGITMATCH" : "DIGITDIFF",
          currency: "USD",
          duration: 5,
          duration_unit: "t",
          barrier: prediction.toString(),
          symbol: "R_100"
        }));
      }
    }
  }

  public resetBalance() {
    this.balance = 10000.0;
    const profile = profiles.find((p) => p.id === this.profileId);
    if (profile) {
      profile.balance = 10000.0;
      profile.logs = []; // clear simulator logs
      saveProfiles();
    }
    this.broadcastBotState();
    broadcastToClients({
      type: "profiles",
      profiles: profiles
    });
  }
}

// Map tracking active bot execution threads
const runningBots = new Map<string, ServerTradingBot>();

// Ensure all profiles have instantiated bot controllers
function syncTradingBotControllers() {
  profiles.forEach((profile) => {
    if (!runningBots.has(profile.id)) {
      runningBots.set(profile.id, new ServerTradingBot(profile.id));
    }
  });
}

// Evaluate Strategy Strategy Helper
function evaluateStrategy(profile: UserProfile, tickHistory: TickData[], shiftState: LeaderShiftState) {
  const stats = computeStats(tickHistory, profile.lookbackTicks || 100);
  const sortedStats = [...stats].sort((a, b) => b.percentage - a.percentage);

  if (sortedStats.length < 2) {
    return {
      shiftState,
      shouldTriggerTrade: false,
      prediction: null,
      leaderDigit: null,
      previousLeader: -1
    };
  }

  const currentLeaderDigit = sortedStats[0].digit;
  const secondRankDigit = sortedStats[1].digit;

  let nextLeader = shiftState.currentLeader;
  let candidate = shiftState.newLeaderCandidate;
  let count = shiftState.consecutiveMatches;
  let shouldTriggerTrade = false;
  let previousLeaderVal = -1;

  if (nextLeader === null) {
    return {
      shiftState: {
        currentLeader: currentLeaderDigit,
        newLeaderCandidate: null,
        consecutiveMatches: 0,
        confirmedLeader: currentLeaderDigit,
        secondHighest: secondRankDigit,
      },
      shouldTriggerTrade: false,
      prediction: null,
      leaderDigit: null,
      previousLeader: -1
    };
  }

  if (currentLeaderDigit !== nextLeader) {
    if (currentLeaderDigit === candidate) {
      count++;
    } else {
      candidate = currentLeaderDigit;
      count = 1;
    }

    if (count >= (profile.confirmationBuffer || 3)) {
      previousLeaderVal = nextLeader;
      nextLeader = candidate;
      candidate = null;
      count = 0;
      shouldTriggerTrade = true;
    }
  } else {
    candidate = null;
    count = 0;
  }

  const newShiftState: LeaderShiftState = {
    currentLeader: nextLeader,
    newLeaderCandidate: candidate,
    consecutiveMatches: count,
    confirmedLeader: nextLeader,
    secondHighest: secondRankDigit,
  };

  let prediction = secondRankDigit;
  if (shouldTriggerTrade) {
    const target = profile.predictionTarget || "SECOND_HIGHEST";
    if (target === "SECOND_HIGHEST") {
      prediction = secondRankDigit;
    } else if (target === "NEW_LEADER") {
      prediction = currentLeaderDigit;
    } else if (target === "OVERTAKEN_LEADER") {
      prediction = previousLeaderVal !== -1 ? previousLeaderVal : secondRankDigit;
    } else if (target === "COLDEST") {
      prediction = sortedStats[sortedStats.length - 1]?.digit ?? secondRankDigit;
    }
  }

  return {
    shiftState: newShiftState,
    shouldTriggerTrade,
    prediction,
    leaderDigit: nextLeader,
    previousLeader: previousLeaderVal,
    stats
  };
}

// Connect a fallback daemon to keep historical data filling continuously
let daemonWs: WebSocket | null = null;
let daemonPing: NodeJS.Timeout | null = null;

function startDaemon() {
  if (daemonWs) {
    try {
      daemonWs.close();
    } catch {}
    daemonWs = null;
  }
  if (daemonPing) {
    clearInterval(daemonPing);
    daemonPing = null;
  }

  const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=1089`;
  console.log("Background tick listener daemon connecting...");
  
  try {
    daemonWs = new WebSocket(wsUrl);

    daemonWs.on("open", () => {
      console.log("Tick daemon connected.");
      daemonPing = setInterval(() => {
        if (daemonWs && daemonWs.readyState === WebSocket.OPEN) {
          daemonWs.send(JSON.stringify({ ping: 1 }));
        }
      }, 30000);

      if (daemonWs && daemonWs.readyState === WebSocket.OPEN) {
        daemonWs.send(JSON.stringify({
          ticks: "R_100",
          subscribe: 1
        }));
      }
    });

    daemonWs.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.msg_type === "tick" && data.tick) {
          const tick = data.tick;
          const quote = parseFloat(tick.quote);
          const lastDigit = digitFromQuote(quote);
          const date = new Date(tick.epoch * 1000);
          const timeStr = date.toLocaleTimeString([], { hour12: false });

          const tickPayload: TickData = {
            id: `${tick.epoch}-${tick.quote}-${Math.random().toString(36).substring(2, 8)}`,
            epoch: tick.epoch,
            quote,
            lastDigit,
            timeStr
          };

          if (!globalTicksHistory.some((t) => t.epoch === tickPayload.epoch)) {
            globalTicksHistory.push(tickPayload);
            if (globalTicksHistory.length > 1000) {
              globalTicksHistory.shift();
            }

            // Broadcast tick to users
            broadcastToClients({
              type: "tick",
              tick: tickPayload
            });

            // Trigger simulator checks across any running bots using simulator
            runningBots.forEach((bot) => {
              if (bot.status === BotStatus.RUNNING) {
                // Bots have their own connection details to Deriv which also receives the ticks,
                // but this acts as an ultra-reliable double trigger if needed.
              }
            });
          }
        }
      } catch {}
    });

    daemonWs.on("close", () => {
      console.log("Daemon connection lost, reconnecting in 5 seconds.");
      setTimeout(startDaemon, 5000);
    });

    daemonWs.on("error", () => {});
  } catch (e) {
    setTimeout(startDaemon, 5000);
  }
}

// Fire up daemon to guarantee ticks stream
startDaemon();

// Synchronize profile objects index
syncTradingBotControllers();

// REST API handlers
app.get("/api/profiles", (req, res) => {
  res.json({
    profiles: profiles.map((p) => {
      const activeBot = runningBots.get(p.id);
      return {
        ...p,
        balance: activeBot ? activeBot.balance : p.balance,
      };
    })
  });
});

app.post("/api/profiles", (req, res) => {
  const profileInput: UserProfile = req.body;
  if (!profileInput || !profileInput.id) {
    res.status(400).json({ error: "Missing identity metadata." });
    return;
  }

  const index = profiles.findIndex((p) => p.id === profileInput.id);
  if (index !== -1) {
    profiles[index] = {
      ...profiles[index],
      ...profileInput,
      // Retain logs
      logs: profileInput.logs || profiles[index].logs || []
    };
  } else {
    profiles.push(profileInput);
  }

  saveProfiles();
  syncTradingBotControllers();

  // If bot parameters changed, sync current active runs
  const botInst = runningBots.get(profileInput.id);
  if (botInst) {
    botInst.initialStake = profileInput.initialStake;
    botInst.balance = profileInput.balance;

    // Re-authorize with Deriv if token changed and WS is open
    if (profileInput.apiToken && botInst.derivWs && botInst.derivWs.readyState === 1) {
      console.log(`Re-authorizing bot ${profileInput.id} with new token`);
      botInst.derivWs.send(JSON.stringify({ authorize: profileInput.apiToken }));
    } else if (profileInput.apiToken && botInst.derivWs && botInst.derivWs.readyState !== 1) {
      // WS not open yet — reconnect so authorize fires on open
      botInst.reconnectToDeriv();
    }
  }

  broadcastToClients({
    type: "profiles",
    profiles: profiles
  });

  res.json({ status: "updated", profile: profiles.find((p) => p.id === profileInput.id) });
});


app.post("/api/authorize", (req, res) => {
  const { profileId, apiToken, appId } = req.body;
  if (!profileId || !apiToken) {
    res.status(400).json({ error: "Missing profileId or apiToken" });
    return;
  }

  // Update profile token
  const index = profiles.findIndex((p) => p.id === profileId);
  if (index !== -1) {
    profiles[index].apiToken = apiToken;
    if (appId) profiles[index].appId = appId;
    saveProfiles();
  }

  // Get or create bot instance
  let botInst = runningBots.get(profileId);
  if (!botInst) {
    botInst = new ServerTradingBot(profileId);
    runningBots.set(profileId, botInst);
  }

  // If WS is open, send authorize directly
  if (botInst.derivWs && botInst.derivWs.readyState === 1) {
    botInst.derivWs.send(JSON.stringify({ authorize: apiToken }));
    res.json({ status: "authorizing", message: "Authorize sent to Deriv WS" });
  } else {
    // WS not ready — reconnect (will authorize on open)
    botInst.reconnectToDeriv();
    res.json({ status: "reconnecting", message: "Reconnecting to Deriv, will authorize on open" });
  }
});

app.delete("/api/profiles/:id", (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "Missing parameter" });
    return;
  }

  // Stop bot if running
  const botInst = runningBots.get(id);
  if (botInst) {
    botInst.stop();
    runningBots.delete(id);
  }

  profiles = profiles.filter((p) => p.id !== id);
  saveProfiles();

  broadcastToClients({
    type: "profiles",
    profiles: profiles
  });

  res.json({ status: "deleted" });
});

app.get("/api/bots/state", (req, res) => {
  const list: any[] = [];
  runningBots.forEach((b) => {
    list.push(b.getBotDetails());
  });
  res.json({ bots: list });
});

app.post("/api/bot/start", (req, res) => {
  const { profileId } = req.body;
  const botInst = runningBots.get(profileId);
  if (!botInst) {
    res.status(400).json({ error: "No configured bot controller matches this profile context." });
    return;
  }

  botInst.start();
  res.json({ status: "started", botState: botInst.getBotDetails() });
});

app.post("/api/bot/stop", (req, res) => {
  const { profileId } = req.body;
  const botInst = runningBots.get(profileId);
  if (!botInst) {
    res.status(400).json({ error: "No configured bot controller matches this profile context." });
    return;
  }

  botInst.stop();
  res.json({ status: "stopped", botState: botInst.getBotDetails() });
});

app.post("/api/bot/reset-balance", (req, res) => {
  const { profileId } = req.body;
  const botInst = runningBots.get(profileId);
  if (!botInst) {
    res.status(400).json({ error: "No configured bot controller matches this profile context." });
    return;
  }

  botInst.resetBalance();
  res.json({ status: "reset", botState: botInst.getBotDetails() });
});

// Setup Web server and WebSocket routing endpoint
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle standard upgrade handshake
server.on("upgrade", (request, socket, head) => {
  const parsed = new URL(request.url || "", "http://localhost");
  const pathname = parsed.pathname;
  if (pathname === "/api/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  connectedClients.add(ws);
  console.log(`Browser UI connected to backend WebSocket. Total clients: ${connectedClients.size}`);

  // Send initial load-up stream: current profile roster, tick history timeline, and current active states
  const botStatuses = Array.from(runningBots.values()).map((b) => b.getBotDetails());
  
  ws.send(JSON.stringify({
    type: "init",
    profiles: profiles.map((p) => {
      const activeBot = runningBots.get(p.id);
      return {
        ...p,
        balance: activeBot ? activeBot.balance : p.balance,
      };
    }),
    tickHistory: globalTicksHistory,
    botStatuses: botStatuses
  }));

  ws.on("close", () => {
    connectedClients.delete(ws);
    console.log(`Browser UI disconnected. Remaining clients: ${connectedClients.size}`);
  });
});

// Vite Setup routing handles assets in dev and proxying fallbacks, in prod serve statically from dist
async function setupViteMiddleware() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Loading Vite Dev Mode server middleware...");
    const viteInstance = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(viteInstance.middlewares);
  } else {
    console.log("Loading production static folder serving.");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

setupViteMiddleware().then(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Axiom Digit backend and worker active on http://localhost:${PORT}`);
  });
});
