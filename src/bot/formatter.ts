import { AnalysisResult, ValueSignal } from "../types";

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const resultBadge = (result?: "W" | "D" | "L"): string => {
  if (result === "W") return "🟢 WIN";
  if (result === "L") return "🔴 LOSS";
  if (result === "D") return "🟡 DRAW";
  return "";
};

const describeSignals = (signals: ValueSignal[]): string => {
  if (signals.length === 0) return "Brak mocnego value dla dostepnych rynkow (sekcja informacyjna).";
  return signals
    .map(
      (item) =>
        `- ${item.market}: model ${pct(item.modelProbability)}, implied ${pct(item.impliedProbability)}, edge ${pct(item.edge)}`
    )
    .join("\n");
};

const formatBestBet = (result: AnalysisResult): string => {
  if (!result.bestBet) {
    return "Najlepszy typ:\n- Brak";
  }
  return [
    "Najlepszy typ:",
    `- Rynek: ${result.bestBet.market}`,
    `- Pewnosc modelu: ${pct(result.bestBet.confidence)}`,
    `- Uzasadnienie: ${result.bestBet.reason}`
  ].join("\n");
};

const formatProbabilities = (result: AnalysisResult): string =>
  [
    "Prawdopodobienstwa rynkow:",
    `- 1 (home win): ${pct(result.marketOutlook.homeWin)}`,
    `- X (draw): ${pct(result.marketOutlook.draw)}`,
    `- 2 (away win): ${pct(result.marketOutlook.awayWin)}`,
    `- BTTS yes: ${pct(result.marketOutlook.bttsYes)}`,
    `- BTTS no: ${pct(result.marketOutlook.bttsNo)}`,
    `- Over 1.5: ${pct(result.marketOutlook.over15)}`,
    `- Over 2.5: ${pct(result.marketOutlook.over25)}`,
    `- Over 3.5: ${pct(result.marketOutlook.over35)}`,
    `- Under 2.5: ${pct(result.marketOutlook.under25)}`
  ].join("\n");

const formatRecentMatchesSection = (
  title: string,
  matches: Array<{ date: string; homeTeam: string; awayTeam: string; score: string; resultForFocus?: "W" | "D" | "L" }>
): string => {
  if (matches.length === 0) return `${title}\n- Brak danych`;
  return [
    `${title} (proba: ${matches.length})`,
    ...matches.map((m) =>
      `- ${m.date}: ${m.homeTeam} ${m.score} ${m.awayTeam}${m.resultForFocus ? ` (${resultBadge(m.resultForFocus)})` : ""}`
    )
  ].join("\n");
};

const formatAdvancedStatsSection = (
  teamName: string,
  stats: {
    over05Pct: number;
    over15Pct: number;
    over25Pct: number;
    over35Pct: number;
    avgCorners: number;
    avgCards: number;
    sampleSize: number;
    cornersSamples: number;
    cardsSamples: number;
  }
): string =>
  [
    `Zaawansowane statystyki ${teamName}:`,
    `- Over 0.5: ${pct(stats.over05Pct)}`,
    `- Over 1.5: ${pct(stats.over15Pct)}`,
    `- Over 2.5: ${pct(stats.over25Pct)}`,
    `- Over 3.5: ${pct(stats.over35Pct)}`,
    `- Srednie rogi: ${stats.avgCorners.toFixed(2)} (proba: ${stats.cornersSamples})`,
    `- Srednie kartki: ${stats.avgCards.toFixed(2)} (proba: ${stats.cardsSamples})`,
    `- Liczba meczow do overow: ${stats.sampleSize}`
  ].join("\n");

const formatH2HAdvancedStats = (
  matches: Array<{ score: string }>,
  homeTeamName: string,
  awayTeamName: string
): string => {
  if (matches.length === 0) return "Zaawansowane H2H:\n- Brak danych";

  const totals = matches
    .map((m) => m.score.split("-").map((value) => Number(value.trim())))
    .filter((pair) => pair.length === 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
    .map(([homeGoals, awayGoals]) => homeGoals + awayGoals);

  const sample = totals.length || 1;
  const over = (line: number): string =>
    `${pct(totals.length === 0 ? 0 : totals.filter((value) => value > line).length / sample)}`;
  const avgGoals =
    totals.length === 0 ? 0 : totals.reduce((acc, value) => acc + value, 0) / totals.length;

  return [
    `Zaawansowane H2H (${homeTeamName} vs ${awayTeamName}) (proba: ${matches.length}):`,
    `- Over 0.5: ${over(0.5)}`,
    `- Over 1.5: ${over(1.5)}`,
    `- Over 2.5: ${over(2.5)}`,
    `- Over 3.5: ${over(3.5)}`,
    `- Srednia goli w H2H: ${avgGoals.toFixed(2)}`
  ].join("\n");
};

const formatContextSection = (
  teamName: string,
  context: {
    avgRestDays: number;
    fatigueIndex: number;
    absencesCount: number;
    motivationIndex: number;
    concededLastFiveAvg: number;
    cleanSheetsLastFive: number;
    absences: string[];
    motivationReason: string;
  }
): string =>
  [
    `Kontekst meczu ${teamName}:`,
    `- Sredni odpoczynek: ${context.avgRestDays.toFixed(1)} dni`,
    `- Zmeczenie: ${pct(context.fatigueIndex)}`,
    `- Absencje kluczowych (injuries): ${context.absencesCount}`,
    `- Lista absencji: ${context.absences.length > 0 ? context.absences.slice(0, 12).join(", ") : "brak danych"}`,
    `- Motywacja/stawka: ${pct(context.motivationIndex)}`,
    `- Powod motywacji: ${context.motivationReason}`,
    `- Tracone gole (ostatnie 10): ${context.concededLastFiveAvg.toFixed(2)}`,
    `- Czyste konta (ostatnie 10): ${context.cleanSheetsLastFive}`
  ].join("\n");

export const formatAnalysisMessage = (result: AnalysisResult): string => {
  const predictionSection = [
    "<b>Predykcja:</b>",
    `- Home win: ${pct(result.prediction.homeWinProbability)}`,
    `- Draw: ${pct(result.prediction.drawProbability)}`,
    `- Away win: ${pct(result.prediction.awayWinProbability)}`,
    `- Expected goals: ${result.match.homeTeam.name} ${result.prediction.expectedHomeGoals.toFixed(
      2
    )} - ${result.prediction.expectedAwayGoals.toFixed(2)} ${result.match.awayTeam.name}`
  ].join("\n");

  const statsSectionFormatted = ["<b>Statystyki:</b>", ...result.statsSummary.map((line) => `- ${line}`)].join("\n");

  const valueSection = ["<b>Value signals:</b>", describeSignals(result.valueSignals)].join("\n");
  const bestBetSection = formatBestBet(result);
  const homeRecentSection = formatRecentMatchesSection(
    `Ostatnie mecze ${result.match.homeTeam.name}:`,
    result.homeRecentMatches
  );
  const awayRecentSection = formatRecentMatchesSection(
    `Ostatnie mecze ${result.match.awayTeam.name}:`,
    result.awayRecentMatches
  );
  const h2hRecentSection = formatRecentMatchesSection("Bezposrednie mecze H2H:", result.h2hRecentMatches);
  const h2hAdvancedSection = formatH2HAdvancedStats(
    result.h2hRecentMatches,
    result.match.homeTeam.name,
    result.match.awayTeam.name
  );
  const homeAdvancedSection = formatAdvancedStatsSection(
    result.match.homeTeam.name,
    result.homeAdvancedStats
  );
  const awayAdvancedSection = formatAdvancedStatsSection(
    result.match.awayTeam.name,
    result.awayAdvancedStats
  );
  const homeContextSection = formatContextSection(result.match.homeTeam.name, result.homeContext);
  const awayContextSection = formatContextSection(result.match.awayTeam.name, result.awayContext);
  const probabilitiesSection = formatProbabilities(result);

  return [
    `<b>Mecz:</b> ${result.match.homeTeam.name} vs ${result.match.awayTeam.name}`,
    `<b>Liga:</b> <b>${result.match.league}</b>`,
    predictionSection,
    statsSectionFormatted,
    homeRecentSection,
    awayRecentSection,
    h2hRecentSection,
    h2hAdvancedSection,
    homeAdvancedSection,
    awayAdvancedSection,
    homeContextSection,
    awayContextSection,
    probabilitiesSection,
    valueSection,
    bestBetSection,
    "<i>Disclaimer: analiza ma charakter informacyjny, nie jest poradą finansową.</i>"
  ].join("\n\n");
};
