import { describe, expect, it } from "vitest";
import { AnalysisEngine } from "../src/analysis/analysisEngine";
import { MatchDataset } from "../src/types";

const dataset: MatchDataset = {
  match: {
    fixtureId: 1,
    league: "Test League",
    date: "2026-01-01",
    homeTeam: { id: 11, name: "Home FC" },
    awayTeam: { id: 22, name: "Away FC" }
  },
  homeForm: { teamId: 11, lastFive: ["W", "W", "D", "L", "W"], goalsForAvg: 1.8, goalsAgainstAvg: 1.0 },
  awayForm: { teamId: 22, lastFive: ["L", "D", "W", "L", "D"], goalsForAvg: 1.1, goalsAgainstAvg: 1.4 },
  h2h: { homeWins: 3, draws: 1, awayWins: 1 },
  homeAdvancedStats: {
    sampleSize: 5,
    over05Pct: 1,
    over15Pct: 0.8,
    over25Pct: 0.6,
    over35Pct: 0.2,
    avgCorners: 4.2,
    avgCards: 2.1,
    cornersSamples: 5,
    cardsSamples: 5
  },
  awayAdvancedStats: {
    sampleSize: 5,
    over05Pct: 0.9,
    over15Pct: 0.7,
    over25Pct: 0.5,
    over35Pct: 0.2,
    avgCorners: 3.8,
    avgCards: 2.6,
    cornersSamples: 5,
    cardsSamples: 5
  },
  homeContext: {
    avgRestDays: 4.2,
    fatigueIndex: 0.2,
    absencesCount: 1,
    absences: ["Player A"],
    motivationIndex: 0.8,
    motivationReason: "Top table battle",
    concededLastFiveAvg: 0.8,
    cleanSheetsLastFive: 2
  },
  awayContext: {
    avgRestDays: 3.6,
    fatigueIndex: 0.3,
    absencesCount: 2,
    absences: ["Player B", "Player C"],
    motivationIndex: 0.75,
    motivationReason: "European spots",
    concededLastFiveAvg: 1.2,
    cleanSheetsLastFive: 1
  },
  homeRecentMatches: [],
  awayRecentMatches: [],
  h2hRecentMatches: [],
  odds: { home: 2.1, draw: 3.2, away: 3.6 }
};

describe("AnalysisEngine", () => {
  it("returns normalized probabilities", () => {
    const result = new AnalysisEngine().analyze(dataset);
    const total =
      result.prediction.homeWinProbability +
      result.prediction.drawProbability +
      result.prediction.awayWinProbability;
    expect(total).toBeCloseTo(1, 5);
  });

  it("builds stats summary with at least 4 lines", () => {
    const result = new AnalysisEngine().analyze(dataset);
    expect(result.statsSummary.length).toBeGreaterThanOrEqual(4);
  });
});
