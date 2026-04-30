export interface TeamInfo {
  id: number;
  name: string;
}

export interface MatchInfo {
  fixtureId: number;
  league: string;
  date: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
}

export interface MatchCard {
  fixtureId: number;
  league: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
}

export interface RecentMatch {
  date: string;
  league?: string;
  homeTeam: string;
  awayTeam: string;
  score: string;
  resultForFocus?: "W" | "D" | "L";
}

export interface TeamForm {
  teamId: number;
  lastFive: Array<"W" | "D" | "L">;
  goalsForAvg: number;
  goalsAgainstAvg: number;
}

export interface TeamAdvancedStats {
  sampleSize: number;
  teamOver05Pct: number;
  teamOver15Pct: number;
  teamOver25Pct: number;
  teamOver35Pct: number;
  over05Pct: number;
  over15Pct: number;
  over25Pct: number;
  over35Pct: number;
  avgCorners: number;
  avgCards: number;
  avgShotsOnTarget: number;
  cornersSamples: number;
  cardsSamples: number;
  shotsSamples: number;
}

export interface TeamContextSignals {
  avgRestDays: number;
  fatigueIndex: number;
  absencesCount: number;
  absences: string[];
  motivationIndex: number;
  motivationReason: string;
  concededLastFiveAvg: number;
  cleanSheetsLastFive: number;
}

export interface LeagueTableRow {
  rank: number;
  teamId: number;
  teamName: string;
  points: number;
  played: number;
}

export interface HeadToHeadSummary {
  homeWins: number;
  awayWins: number;
  draws: number;
}

export interface OddsSnapshot {
  home: number;
  draw: number;
  away: number;
  bttsYes?: number;
  bttsNo?: number;
  over25?: number;
  under25?: number;
}

export interface MatchDataset {
  match: MatchInfo;
  homeForm: TeamForm;
  awayForm: TeamForm;
  h2h: HeadToHeadSummary;
  homeAdvancedStats: TeamAdvancedStats;
  awayAdvancedStats: TeamAdvancedStats;
  homeContext: TeamContextSignals;
  awayContext: TeamContextSignals;
  leagueTableRows?: LeagueTableRow[];
  homeRecentMatches: RecentMatch[];
  awayRecentMatches: RecentMatch[];
  h2hRecentMatches: RecentMatch[];
  odds?: OddsSnapshot;
}

export interface MatchPrediction {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
}

export interface ValueSignal {
  market: "HOME" | "DRAW" | "AWAY" | "BTTS_YES" | "BTTS_NO" | "OVER_2_5" | "UNDER_2_5";
  modelProbability: number;
  impliedProbability: number;
  edge: number;
}

export interface BetRecommendation {
  market: string;
  confidence: number;
  reason: string;
}

export interface MarketOutlook {
  homeWin: number;
  draw: number;
  awayWin: number;
  bttsYes: number;
  bttsNo: number;
  over15: number;
  over25: number;
  over35: number;
  under25: number;
}

export interface AnalysisResult {
  match: MatchInfo;
  prediction: MatchPrediction;
  statsSummary: string[];
  homeAdvancedStats: TeamAdvancedStats;
  awayAdvancedStats: TeamAdvancedStats;
  homeContext: TeamContextSignals;
  awayContext: TeamContextSignals;
  leagueTableRows?: LeagueTableRow[];
  marketOutlook: MarketOutlook;
  valueSignals: ValueSignal[];
  homeRecentMatches: RecentMatch[];
  awayRecentMatches: RecentMatch[];
  h2hRecentMatches: RecentMatch[];
  bestBet?: BetRecommendation;
}
