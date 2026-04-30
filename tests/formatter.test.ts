import { describe, expect, it } from "vitest";
import { formatAnalysisMessage } from "../src/bot/formatter";
import { AnalysisResult } from "../src/types";

describe("formatAnalysisMessage", () => {
  it("contains mandatory sections", () => {
    const input: AnalysisResult = {
      match: {
        fixtureId: 99,
        league: "League A",
        date: "2026-01-01",
        homeTeam: { id: 10, name: "Home FC" },
        awayTeam: { id: 20, name: "Away FC" }
      },
      prediction: {
        homeWinProbability: 0.5,
        drawProbability: 0.25,
        awayWinProbability: 0.25,
        expectedHomeGoals: 1.5,
        expectedAwayGoals: 0.9
      },
      statsSummary: ["line 1", "line 2"],
      homeAdvancedStats: {
        sampleSize: 5,
        over05Pct: 1,
        over15Pct: 0.8,
        over25Pct: 0.6,
        over35Pct: 0.2,
        avgCorners: 4.2,
        avgCards: 2.1,
        avgShotsOnTarget: 5.1,
        cornersSamples: 5,
        cardsSamples: 5,
        shotsSamples: 5
      },
      awayAdvancedStats: {
        sampleSize: 5,
        over05Pct: 0.9,
        over15Pct: 0.7,
        over25Pct: 0.5,
        over35Pct: 0.2,
        avgCorners: 3.8,
        avgCards: 2.6,
        avgShotsOnTarget: 4.2,
        cornersSamples: 5,
        cardsSamples: 5,
        shotsSamples: 5
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
      marketOutlook: {
        homeWin: 0.5,
        draw: 0.25,
        awayWin: 0.25,
        bttsYes: 0.52,
        bttsNo: 0.48,
        over15: 0.7,
        over25: 0.55,
        over35: 0.3,
        under25: 0.45
      },
      valueSignals: [],
      homeRecentMatches: [],
      awayRecentMatches: [],
      h2hRecentMatches: []
    };

    const text = formatAnalysisMessage(input);
    expect(text).toContain("Predykcja:");
    expect(text).toContain("Statystyki:");
    expect(text).toContain("Value signals:");
    expect(text).toContain("Ostatnie mecze Home FC:");
    expect(text).toContain("Bezposrednie mecze H2H:");
    expect(text).toContain("Zaawansowane statystyki Home FC:");
    expect(text).toContain("Kontekst meczu Home FC:");
    expect(text).toContain("Prawdopodobienstwa rynkow:");
    expect(text).toContain("Disclaimer:");
  });
});
