/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum BotStatus {
  STOPPED = "STOPPED",
  RUNNING = "RUNNING",
  PAUSED = "PAUSED",
}

export enum TradingMode {
  SIMULATION = "SIMULATION",
  REAL = "REAL",
}

export interface TickData {
  id: string;
  epoch: number;
  quote: number;
  lastDigit: number;
  timeStr: string;
}

export interface DigitStat {
  digit: number;
  count: number;
  percentage: number;
  rank: number; // 1 is highest, 10 is lowest
  currentGap?: number; // Ticks since this digit last appeared
  avgGap?: number;     // Average gap between appearances of this digit
  maxGap?: number;     // Maximum gap between appearances of this digit
  dangerScore?: number; // Calculated probability or urgency score (0-100) of appearing next
}

export interface TradeLog {
  id: string;
  timestamp: string;
  digitPlaced: number;       // The second-highest digit we predicted
  leaderDigit: number;       // The digit that took the leadership
  previousLeaderDigit: number; // The leader that was overtaken
  stake: number;
  currentStake: number;      // Actual stake placed (after Martingale)
  durationTicks: number;     // Constrained to 5 ticks
  boughtAtEpoch: number;
  entryTick: number;         // Decimal quote of initial tick
  status: "pending" | "won" | "lost";
  ticksCollected: number[];  // Ticks during the contracts (max 5)
  digitsCollected: number[]; // Last digits of those ticks
  profit: number;
  contractId?: string;       // Real contract ID from API if real trading
  contractType?: "MATCH" | "DIFFERS"; // Track if it's a MATCH or DIFFERS contract
}

export interface BotState {
  status: BotStatus;
  mode: TradingMode;
  stake: number;
  initialStake: number;
  martingaleMultiplier: number;
  lookbackTicks: number;
  confirmationBuffer: number;
  balance: number;
  realBalance: number;
  currency: string;
  isAuthorized: boolean;
  appId: string;
  apiToken: string;
  errorMsg: string | null;
  contractType?: "MATCH" | "DIFFERS";
  predictionTarget?: "SECOND_HIGHEST" | "NEW_LEADER" | "OVERTAKEN_LEADER" | "COLDEST";
  enableSmartSkip?: boolean;
  smartSkipThreshold?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  appId: string;
  apiToken: string;
  balance: number;
  initialStake: number;
  martingaleMultiplier: number;
  lookbackTicks: number;
  confirmationBuffer: number;
  contractType: "MATCH" | "DIFFERS";
  predictionTarget: "SECOND_HIGHEST" | "NEW_LEADER" | "OVERTAKEN_LEADER" | "COLDEST";
  enableSmartSkip: boolean;
  smartSkipThreshold: number;
  mode: TradingMode;
  logs: TradeLog[];
}

export interface LeaderShiftState {
  currentLeader: number | null;
  newLeaderCandidate: number | null;
  consecutiveMatches: number;
  confirmedLeader: number | null;
  secondHighest: number | null;
}
