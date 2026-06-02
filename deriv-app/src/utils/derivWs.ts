/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TickData, TradeLog } from "../types";

type TickCallback = (tick: TickData) => void;
type StatusCallback = (connected: boolean, statusText: string) => void;
type AuthCallback = (authorized: boolean, userData: { balance: number; currency: string; loginId: string; email: string } | null) => void;
type TradeResultCallback = (trade: TradeLog) => void;

class DerivWebsocketManager {
  private socket: WebSocket | null = null;
  private tickCallbacks: Set<TickCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private authCallbacks: Set<AuthCallback> = new Set();
  private tradeResultCallbacks: Set<TradeResultCallback> = new Set();

  private isConnected = false;
  private isConnecting = false;
  private currentSymbol = "R_100";
  private currentAppId = "1089"; // Default test AppID or user set
  private currentToken = "";

  private authorizedUser: { balance: number; currency: string; loginId: string; email: string } | null = null;
  private activeRealContracts: Map<string, { proposalId: string; stake: number; prediction: number }> = new Map();
  private openContractsToTrack: Map<string, TradeLog> = new Map();
  private currentPendingRealTrade: TradeLog | null = null;
  private activeFallbacks: Map<string, any> = new Map();

  constructor() {
    // Avoid auto-connecting here, we let the app initiate it.
  }

  public connect(appId: string = "1089", token: string = "") {
    if (this.isConnected && this.currentAppId === appId && this.currentToken === token) {
      return;
    }

    this.disconnect();
    this.currentAppId = appId || "1089";
    this.currentToken = token;
    this.isConnecting = true;
    this.notifyStatus(false, "Connecting to Deriv WebSocket...");

    const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${this.currentAppId}`;
    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.notifyStatus(true, "Connected to Deriv");
        this.setupPing();
        this.subscribeToTicks();

        if (this.currentToken) {
          this.authorize(this.currentToken);
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingMessage(data);
        } catch (e) {
          console.error("Error parsing WebSocket message:", e);
        }
      };

      this.socket.onclose = () => {
        this.cleanup();
        this.notifyStatus(false, "Disconnected from Deriv");
        // Attempt reconnect after 5 seconds if not explicitly closed
        setTimeout(() => {
          if (!this.isConnected && !this.isConnecting) {
            this.connect(this.currentAppId, this.currentToken);
          }
        }, 5000);
      };

      this.socket.onerror = (err) => {
        console.error("WS Error:", err);
        this.notifyStatus(false, "Connection error");
      };
    } catch (e) {
      console.error("WebSocket standard initiation failed:", e);
      this.isConnecting = false;
    }
  }

  public disconnect() {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
    this.cleanup();
  }

  private pingInterval: number | null = null;
  private setupPing() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      this.send({ ping: 1 });
    }, 30000) as unknown as number;
  }

  private cleanup() {
    this.isConnected = false;
    this.isConnecting = false;
    this.authorizedUser = null;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.activeFallbacks.forEach((timeoutId) => clearTimeout(timeoutId));
    this.activeFallbacks.clear();
  }

  private send(data: object) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  public subscribeToTicks() {
    this.send({
      ticks: this.currentSymbol,
      subscribe: 1
    });
  }

  public authorize(token: string) {
    if (!token) return;
    this.currentToken = token;
    this.send({
      authorize: token
    });
  }

  public addTickCallback(cb: TickCallback) {
    this.tickCallbacks.add(cb);
  }

  public removeTickCallback(cb: TickCallback) {
    this.tickCallbacks.delete(cb);
  }

  public addStatusCallback(cb: StatusCallback) {
    this.statusCallbacks.add(cb);
    cb(this.isConnected, this.isConnected ? "Connected to Deriv" : "Disconnected");
  }

  public removeStatusCallback(cb: StatusCallback) {
    this.statusCallbacks.delete(cb);
  }

  public addAuthCallback(cb: AuthCallback) {
    this.authCallbacks.add(cb);
    cb(!!this.authorizedUser, this.authorizedUser);
  }

  public removeAuthCallback(cb: AuthCallback) {
    this.authCallbacks.delete(cb);
  }

  public addTradeResultCallback(cb: TradeResultCallback) {
    this.tradeResultCallbacks.add(cb);
  }

  public removeTradeResultCallback(cb: TradeResultCallback) {
    this.tradeResultCallbacks.delete(cb);
  }

  private notifyStatus(connected: boolean, status: string) {
    this.statusCallbacks.forEach(cb => cb(connected, status));
  }

  private handleIncomingMessage(data: any) {
    const msgType = data.msg_type;

    if (msgType === "tick") {
      const tick = data.tick;
      if (tick && tick.symbol === this.currentSymbol) {
        const quote = parseFloat(tick.quote);
        const quoteStr = tick.quote.toString();
        const parts = quoteStr.split(".");
        let lastDigit = 0;
        if (parts.length > 1) {
          lastDigit = parseInt(parts[1].slice(-1), 10);
        } else {
          lastDigit = parseInt(quoteStr.slice(-1), 10);
        }

        const date = new Date(tick.epoch * 1000);
        const timeStr = date.toLocaleTimeString([], { hour12: false });

        const tickPayload: TickData = {
          id: `${tick.epoch}-${tick.quote}-${Math.random().toString(36).substring(2, 8)}`,
          epoch: tick.epoch,
          quote: quote,
          lastDigit: isNaN(lastDigit) ? 0 : lastDigit,
          timeStr: timeStr
        };

        this.tickCallbacks.forEach(cb => cb(tickPayload));
      }
    }

    else if (msgType === "authorize") {
      if (data.error) {
        console.error("Deriv WS Auth Error:", data.error.message);
        this.authorizedUser = null;
        this.authCallbacks.forEach(cb => cb(false, null));
      } else {
        const auth = data.authorize;
        this.authorizedUser = {
          balance: parseFloat(auth.balance),
          currency: auth.currency || "USD",
          loginId: auth.loginid,
          email: auth.email
        };
        // Subscribe to actual real-time balance stream
        this.send({
          balance: 1,
          subscribe: 1
        });
        // Also subscribe to portfolio/open contracts
        this.send({
          proposal_open_contract: 1,
          subscribe: 1
        });
        this.authCallbacks.forEach(cb => cb(true, this.authorizedUser));
      }
    }

    else if (msgType === "balance") {
      const b = data.balance;
      if (b && this.authorizedUser) {
        this.authorizedUser.balance = parseFloat(b.balance);
        this.authorizedUser.currency = b.currency || this.authorizedUser.currency;
        this.authCallbacks.forEach(cb => cb(true, this.authorizedUser));
      }
    }

    else if (msgType === "proposal") {
      const echo = data.echo_req;
      if (data.error) {
        console.error("Deriv WS Proposal Error:", data.error.message);
        this.notifyStatus(this.isConnected, `Proposal error: ${data.error.message}`);
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
          this.currentPendingRealTrade = null;
          this.tradeResultCallbacks.forEach(cb => cb(failedLog));
        }
      } else if (data.proposal) {
        const prop = data.proposal;
        if (echo) {
          // Check if there is an active purchase pending for this proposal
          const propKey = `${echo.amount}_${echo.barrier}`;
          const activeItem = this.activeRealContracts.get(propKey);
          if (activeItem) {
            // Send buy order immediately!
            this.send({
              buy: prop.id,
              price: activeItem.stake
            });
            this.activeRealContracts.delete(propKey);
          }
        }
      }
    }

    else if (msgType === "buy") {
      if (data.error) {
        this.notifyStatus(this.isConnected, `Purchase error: ${data.error.message}`);
        // Handle purchase error: update the currently pending real trade to a completed error state to unlock the bot
        if (this.currentPendingRealTrade) {
          const failedLog: TradeLog = {
            ...this.currentPendingRealTrade,
            status: "lost", // Mark as lost to safely finalize and resolve the pending state
            profit: -this.currentPendingRealTrade.currentStake,
          };
          this.currentPendingRealTrade = null;
          this.tradeResultCallbacks.forEach(cb => cb(failedLog));
        }
      } else {
        const contractId = data.buy.contract_id?.toString();
        console.log("Successfully bought contract ID:", contractId);
        
        if (contractId && this.currentPendingRealTrade) {
          this.currentPendingRealTrade.contractId = contractId;
          this.openContractsToTrack.set(contractId, this.currentPendingRealTrade);
          // Notify of update so contractId is registered
          this.tradeResultCallbacks.forEach(cb => cb(this.currentPendingRealTrade!));
          
          // Explicitly subscribe to specific contract updates to guarantee live ticks collection stream
          this.send({
            proposal_open_contract: 1,
            contract_id: parseInt(contractId, 10),
            subscribe: 1
          });
        }
      }
    }

    else if (msgType === "proposal_open_contract") {
      const contract = data.proposal_open_contract;
      if (contract) {
        const contractId = contract.contract_id?.toString();
        if (contractId) {
          // If we see a new contract and it matches our pending real trade, map it!
          if (!this.openContractsToTrack.has(contractId) && this.currentPendingRealTrade) {
            this.currentPendingRealTrade.contractId = contractId;
            this.currentPendingRealTrade.entryTick = contract.entry_tick || 0;
            this.openContractsToTrack.set(contractId, this.currentPendingRealTrade);
          }

          if (this.openContractsToTrack.has(contractId)) {
            const log = this.openContractsToTrack.get(contractId)!;
            
            // If this contract is now fully initialized under tracking, clear the general pending reference
            if (this.currentPendingRealTrade && this.currentPendingRealTrade.contractId === contractId) {
              this.currentPendingRealTrade = null;
            }

            // Extract the stream ticks and digits
            const currentTicks = contract.tick_stream || [];
            const entryTick = contract.entry_tick; // reference

            const ticksCollected = currentTicks.map((t: any) => {
              if (t.tick !== undefined && t.tick !== null) return parseFloat(t.tick);
              return parseFloat(t.tick_display_value || "0");
            });
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
                status: status,
                profit: profit,
                entryTick: entryTick || log.entryTick,
                ticksCollected: ticksCollected.length > 0 ? ticksCollected : log.ticksCollected,
                digitsCollected: digitsCollected.length > 0 ? digitsCollected : log.digitsCollected,
              };

              // Clear scheduled safety fallback timer
              if (this.activeFallbacks.has(contractId)) {
                clearTimeout(this.activeFallbacks.get(contractId));
                this.activeFallbacks.delete(contractId);
              }

              this.openContractsToTrack.delete(contractId);
              this.tradeResultCallbacks.forEach(cb => cb(updatedLog));

              // Refresh user balance with accurate server wallet value if available
              if (this.authorizedUser && contract.balance_after !== undefined) {
                this.authorizedUser.balance = parseFloat(contract.balance_after);
                this.authCallbacks.forEach(cb => cb(true, this.authorizedUser));
              }
            } else {
              // Intermediate updates (tick-by-tick collection stream)
              const updatedLog: TradeLog = {
                ...log,
                entryTick: entryTick || log.entryTick,
                ticksCollected: ticksCollected,
                digitsCollected: digitsCollected,
              };
              this.openContractsToTrack.set(contractId, updatedLog);
              this.tradeResultCallbacks.forEach(cb => cb(updatedLog));

              // Schedule a safety fallback if 5 ticks are already collected but no sold message yet
              if (ticksCollected.length >= 5) {
                this.scheduleSafetyFallback(contractId);
              }
            }
          }
        }
      }
    }
  }

  private scheduleSafetyFallback(contractId: string) {
    if (this.activeFallbacks.has(contractId)) {
      return;
    }

    const timeoutId = setTimeout(() => {
      this.activeFallbacks.delete(contractId);

      if (this.openContractsToTrack.has(contractId)) {
        const log = this.openContractsToTrack.get(contractId)!;
        const ticks = log.ticksCollected;
        const digits = log.digitsCollected;

        if (ticks.length >= 5 && digits.length >= 5) {
          console.warn(`Safety fallback triggered for contract ${contractId} (5 ticks collected but no server resolution received)`);
          const exitDigit = digits[4];
          const isMatchMode = log.contractType !== "DIFFERS";
          const isWon = isMatchMode ? (exitDigit === log.digitPlaced) : (exitDigit !== log.digitPlaced);
          
          // Match mode payout: profit = stake * 8.09, differs payout: profit = stake * 0.098
          const multiplier = isMatchMode ? 8.09 : 0.098;
          const profit = isWon ? log.currentStake * multiplier : -log.currentStake;
          const status = isWon ? "won" : "lost";

          const updatedLog: TradeLog = {
            ...log,
            status: status,
            profit: parseFloat(profit.toFixed(2)),
          };

          this.openContractsToTrack.delete(contractId);
          this.tradeResultCallbacks.forEach(cb => cb(updatedLog));

          // Real balance will be updated via the official balance subscription on server resolution.
        }
      }
    }, 1500);

    this.activeFallbacks.set(contractId, timeoutId);
  }

  public placeRealTrade(stake: number, prediction: number, isMatchMode: boolean, onTradeLogCreated: (log: TradeLog) => void): boolean {
    if (!this.isConnected || !this.authorizedUser) {
      console.error("Require authorized connection to place real trade");
      return false;
    }

    const propKey = `${stake}_${prediction}`;
    this.activeRealContracts.set(propKey, {
      proposalId: "",
      stake: stake,
      prediction: prediction
    });

    // Request proposal
    this.send({
      proposal: 1,
      amount: stake,
      basis: "stake",
      contract_type: isMatchMode ? "DIGITMATCH" : "DIGITDIFF",
      currency: this.authorizedUser.currency,
      duration: 5,
      duration_unit: "t",
      barrier: prediction.toString(),
      symbol: this.currentSymbol
    });

    // Create immediate log placeholder
    const date = new Date();
    const tradeLog: TradeLog = {
      id: "real_" + Math.random().toString(36).substr(2, 9),
      timestamp: date.toLocaleTimeString([], { hour12: false }),
      digitPlaced: prediction,
      leaderDigit: prediction, // standard placeholder visual
      previousLeaderDigit: -1,
      stake: stake,
      currentStake: stake,
      durationTicks: 5,
      boughtAtEpoch: Math.floor(date.getTime() / 1000),
      entryTick: 0,
      status: "pending",
      ticksCollected: [],
      digitsCollected: [],
      contractType: isMatchMode ? "MATCH" : "DIFFERS",
      profit: 0
    };

    this.currentPendingRealTrade = tradeLog;
    // Deliver the pending placeholder to the UI immediately!
    onTradeLogCreated(tradeLog);
    return true;
  }

  // To simulate paper check in simulation mode
  public simulateTrade(stake: number, prediction: number, leader: number, prevLeader: number, tickHistory: TickData[], isMatchMode: boolean, onTradeTriggered: (log: TradeLog) => void) {
    const epochNow = tickHistory[tickHistory.length - 1]?.epoch || Math.floor(Date.now() / 1000);
    const date = new Date(epochNow * 1000);
    const entryTickValue = tickHistory[tickHistory.length - 1]?.quote || 0;

    const simLog: TradeLog = {
      id: "sim_" + Math.random().toString(36).substr(2, 9),
      timestamp: date.toLocaleTimeString([], { hour12: false }),
      digitPlaced: prediction,
      leaderDigit: leader,
      previousLeaderDigit: prevLeader,
      stake: stake,
      currentStake: stake,
      durationTicks: 5,
      boughtAtEpoch: epochNow,
      entryTick: entryTickValue,
      status: "pending",
      ticksCollected: [],
      digitsCollected: [],
      contractType: isMatchMode ? "MATCH" : "DIFFERS",
      profit: 0
    };

    onTradeTriggered(simLog);

    // Track state of tick ingestion to resolve the simulated trade
    let collectedCount = 0;
    const ticks: number[] = [];
    const digits: number[] = [];

    const simulatedTickListener = (tick: TickData) => {
      if (tick.epoch <= epochNow) return; // Skip historical ones or same tick

      collectedCount++;
      ticks.push(tick.quote);
      digits.push(tick.lastDigit);

      // Trigger standard reactive visual update for open trades
      if (collectedCount <= 5) {
        const liveLogUpdated: TradeLog = {
          ...simLog,
          entryTick: entryTickValue,
          ticksCollected: [...ticks],
          digitsCollected: [...digits],
        };
        
        if (collectedCount === 5) {
          // Resolve contract trade
          const finalExitDigit = digitFromQuote(tick.quote);
          const isMatch = finalExitDigit === prediction;
          const won = isMatchMode ? isMatch : !isMatch;
          // Payout: DIGITMATCH multiplier is 9.09. Profit is Stake * 8.09, Loss is Stake * -1
          // Payout: DIGITDIFF multiplier is 1.098. Profit is Stake * 0.098, Loss is Stake * -1
          const profit = won ? (isMatchMode ? stake * 8.09 : stake * 0.098) : -stake;
          
          const resolvedLog: TradeLog = {
            ...liveLogUpdated,
            status: won ? "won" : "lost",
            profit: parseFloat(profit.toFixed(2)),
          };

          this.removeTickCallback(simulatedTickListener);
          this.tradeResultCallbacks.forEach(cb => cb(resolvedLog));
        } else {
          // Let UI know of intermediate tick
          this.tradeResultCallbacks.forEach(cb => cb(liveLogUpdated));
        }
      }
    };

    this.addTickCallback(simulatedTickListener);
  }
}

// Utility to parse digit safely from quotes
export function digitFromQuote(quote: number): number {
  const quoteStr = quote.toString();
  const parts = quoteStr.split(".");
  if (parts.length > 1) {
    return parseInt(parts[1].slice(-1), 10);
  }
  return parseInt(quoteStr.slice(-1), 10);
}

export const derivWS = new DerivWebsocketManager();
