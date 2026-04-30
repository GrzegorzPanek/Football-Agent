import { createStatsSummary } from "./statsModule";
import { buildPrediction } from "./predictionModel";
import { buildMarketOutlook, detectValueSignals, pickMostLikelyBet } from "./valueModule";
import { AnalysisResult, MatchDataset } from "../types";

export class AnalysisEngine {
  analyze(dataset: MatchDataset): AnalysisResult {
    const prediction = buildPrediction(dataset);
    const marketOutlook = buildMarketOutlook(prediction);
    const statsSummary = createStatsSummary(dataset);
    const valueSignals = detectValueSignals(prediction, dataset.odds);
    const rawBestBet = pickMostLikelyBet(marketOutlook);
    const bestBet = {
      ...rawBestBet,
      reason: `${rawBestBet.reason} Kontekst: zmeczenie ${dataset.match.homeTeam.name} ${(
        dataset.homeContext.fatigueIndex * 100
      ).toFixed(0)}% vs ${dataset.match.awayTeam.name} ${(dataset.awayContext.fatigueIndex * 100).toFixed(
        0
      )}%, absencje ${dataset.homeContext.absencesCount}:${dataset.awayContext.absencesCount}, motywacja ${(
        dataset.homeContext.motivationIndex * 100
      ).toFixed(0)}%:${(dataset.awayContext.motivationIndex * 100).toFixed(0)}%.`
    };

    return {
      match: dataset.match,
      prediction,
      statsSummary,
      homeAdvancedStats: dataset.homeAdvancedStats,
      awayAdvancedStats: dataset.awayAdvancedStats,
      homeContext: dataset.homeContext,
      awayContext: dataset.awayContext,
      leagueTableRows: dataset.leagueTableRows,
      marketOutlook,
      valueSignals,
      homeRecentMatches: dataset.homeRecentMatches,
      awayRecentMatches: dataset.awayRecentMatches,
      h2hRecentMatches: dataset.h2hRecentMatches,
      bestBet
    };
  }
}
