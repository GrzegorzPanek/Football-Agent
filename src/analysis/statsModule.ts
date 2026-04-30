import { MatchDataset } from "../types";

const formatLastFive = (name: string, values: Array<"W" | "D" | "L">): string =>
  `${name} form(10): ${values.join("-") || "no-data"}`;

export const createStatsSummary = (dataset: MatchDataset): string[] => [
  formatLastFive(dataset.match.homeTeam.name, dataset.homeForm.lastFive),
  formatLastFive(dataset.match.awayTeam.name, dataset.awayForm.lastFive),
  `${dataset.match.homeTeam.name} avg goals: ${dataset.homeForm.goalsForAvg.toFixed(2)} scored / ${dataset.homeForm.goalsAgainstAvg.toFixed(2)} conceded`,
  `${dataset.match.awayTeam.name} avg goals: ${dataset.awayForm.goalsForAvg.toFixed(2)} scored / ${dataset.awayForm.goalsAgainstAvg.toFixed(2)} conceded`,
  `${dataset.match.homeTeam.name} conceded trend(10): ${dataset.homeContext.concededLastFiveAvg.toFixed(2)} avg, clean sheets ${dataset.homeContext.cleanSheetsLastFive}/10`,
  `${dataset.match.awayTeam.name} conceded trend(10): ${dataset.awayContext.concededLastFiveAvg.toFixed(2)} avg, clean sheets ${dataset.awayContext.cleanSheetsLastFive}/10`,
  `H2H(5): home wins ${dataset.h2h.homeWins}, draws ${dataset.h2h.draws}, away wins ${dataset.h2h.awayWins}`
];
