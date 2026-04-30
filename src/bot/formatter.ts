import { AnalysisResult, ValueSignal } from "../types";

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const esc = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const resultBadge = (result?: "W" | "D" | "L"): string => {
  if (result === "W") return "🟢";
  if (result === "L") return "🔴";
  if (result === "D") return "🟡 DRAW";
  return "";
};

const sectionHeader = (icon: string, title: string): string => `<b>${icon} ${title}:</b>`;

const describeSignals = (signals: ValueSignal[]): string => {
  if (signals.length === 0) return "Brak mocnego value dla dostepnych rynkow (sekcja informacyjna).";
  return signals
    .map(
      (item) =>
        `- ${esc(item.market)}: model ${pct(item.modelProbability)}, implied ${pct(item.impliedProbability)}, edge ${pct(item.edge)}`
    )
    .join("\n");
};

const formatBestBet = (result: AnalysisResult): string => {
  if (!result.bestBet) {
    return `${sectionHeader("🎯", "Najlepszy typ")}\n- Brak`;
  }
  return [
    sectionHeader("🎯", "Najlepszy typ"),
    `- Rynek: ${esc(result.bestBet.market)}`,
    `- Pewnosc modelu: ${pct(result.bestBet.confidence)}`,
    `- Uzasadnienie: ${esc(result.bestBet.reason)}`
  ].join("\n");
};

const formatProbabilities = (result: AnalysisResult): string =>
  [
    sectionHeader("📊", "Prawdopodobienstwa rynkow"),
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

const formatOddsTrendSection = (result: AnalysisResult): string | undefined => {
  if (!result.odds || !result.oddsTrend) return undefined;
  const trend = result.oddsTrend;
  const windowLabel = `${trend.windowHours}h`;
  const fmt = (current?: number, previous?: number, delta?: number): string => {
    if (typeof current !== "number") return "brak danych";
    if (typeof previous !== "number" || typeof delta !== "number") return `${current.toFixed(2)} (brak historii ${windowLabel})`;
    if (Math.abs(delta) < 0.01) {
      return `${previous.toFixed(2)} -> ${current.toFixed(2)} (➡️ bez zmiany)`;
    }
    const arrow = delta > 0 ? "⬆️" : "⬇️";
    return `${previous.toFixed(2)} -> ${current.toFixed(2)} (${arrow} ${Math.abs(delta).toFixed(2)})`;
  };
  const reference = trend.referenceAt ? trend.referenceAt.slice(0, 16).replace("T", " ") : "brak danych";
  return [
    sectionHeader("💹", `Rynek bukmacherski (trend ${windowLabel})`),
    `- Liczba bookmakerow uwzglednionych: ${trend.bookmakersCount}`,
    `- Kurs 1X2 teraz: 1=${result.odds.home.toFixed(2)} | X=${result.odds.draw.toFixed(2)} | 2=${result.odds.away.toFixed(2)}`,
    `- HOME (${windowLabel}): ${fmt(result.odds.home, trend.homeReference, trend.homeDelta)}`,
    `- DRAW (${windowLabel}): ${fmt(result.odds.draw, trend.drawReference, trend.drawDelta)}`,
    `- AWAY (${windowLabel}): ${fmt(result.odds.away, trend.awayReference, trend.awayDelta)}`,
    `- BTTS YES (${windowLabel}): ${fmt(result.odds.bttsYes, trend.bttsYesReference, trend.bttsYesDelta)}`,
    `- BTTS NO (${windowLabel}): ${fmt(result.odds.bttsNo, trend.bttsNoReference, trend.bttsNoDelta)}`,
    `- OVER 2.5 (${windowLabel}): ${fmt(result.odds.over25, trend.over25Reference, trend.over25Delta)}`,
    `- UNDER 2.5 (${windowLabel}): ${fmt(result.odds.under25, trend.under25Reference, trend.under25Delta)}`,
    `- Punkt startowy trendu: ${reference}`,
    `- Sentyment rynku: ${esc(trend.sentimentSummary)}`,
    `- Najmocniejszy ruch: ${esc(trend.strongestMove ?? "brak istotnej zmiany kursow")}`
  ].join("\n");
};

const formatLeagueTableSection = (result: AnalysisResult): string | undefined => {
  const rows = result.leagueTableRows ?? [];
  if (rows.length === 0) return undefined;

  const zoneBadge = (description?: string): string => {
    const normalized = String(description ?? "").toLowerCase();
    if (
      normalized.includes("relegation") ||
      normalized.includes("descent") ||
      normalized.includes("drop")
    ) {
      return "🔴";
    }
    if (normalized.includes("champions")) return "🔵";
    if (normalized.includes("europa")) return "🟦";
    if (normalized.includes("conference")) return "🔷";
    return "⚪";
  };

  const zoneLabel = (description?: string): string => {
    const normalized = String(description ?? "").toLowerCase();
    if (
      normalized.includes("relegation") ||
      normalized.includes("descent") ||
      normalized.includes("drop")
    ) {
      return "SPADEK";
    }
    if (normalized.includes("champions")) return "LM";
    if (normalized.includes("europa")) return "LE";
    if (normalized.includes("conference")) return "LKE";
    return "";
  };

  return [
    sectionHeader("🏁", "Tabela ligi (top)"),
    ...rows.map((row) => {
      const isSelected =
        row.teamId === result.match.homeTeam.id || row.teamId === result.match.awayTeam.id;
      const badge = zoneBadge(row.description);
      const shortZone = zoneLabel(row.description);
      const rawName = esc(row.teamName);
      const emphasizedName =
        badge === "🔴" ? `<b>🔴 ${rawName}</b>` : isSelected ? `<b>${rawName}</b>` : rawName;
      const zoneSuffix = shortZone ? ` [${shortZone}]` : "";
      return `- ${badge} ${row.rank}. ${emphasizedName}${zoneSuffix} | pkt: ${row.points} | mecze: ${row.played}`;
    })
  ].join("\n");
};

const formatRecentMatchesSection = (
  title: string,
  matches: Array<{ date: string; homeTeam: string; awayTeam: string; score: string; resultForFocus?: "W" | "D" | "L" }>
): string => {
  if (matches.length === 0) return `<b>${title}</b>\n- Brak danych`;
  return [
    `${sectionHeader("🗓️", title)} (proba: ${matches.length})`,
    ...matches.map((m) =>
      `- 📅 <b>${m.date}</b>\n  ${esc(m.homeTeam)} ${m.score} ${esc(m.awayTeam)}${m.resultForFocus ? ` (${resultBadge(m.resultForFocus)})` : ""}`
    )
  ].join("\n");
};

const formatAdvancedStatsSection = (
  teamName: string,
  stats: {
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
    sampleSize: number;
    cornersSamples: number;
    cardsSamples: number;
    shotsSamples: number;
  }
): string =>
  [
    sectionHeader("📈", `Zaawansowane statystyki ${esc(teamName)}`),
    `- Team over 0.5 (gole druzyny): ${pct(stats.teamOver05Pct)}`,
    `- Team over 1.5 (gole druzyny): ${pct(stats.teamOver15Pct)}`,
    `- Team over 2.5 (gole druzyny): ${pct(stats.teamOver25Pct)}`,
    `- Team over 3.5 (gole druzyny): ${pct(stats.teamOver35Pct)}`,
    `- Match over 0.5 (gole lacznie): ${pct(stats.over05Pct)}`,
    `- Match over 1.5 (gole lacznie): ${pct(stats.over15Pct)}`,
    `- Match over 2.5 (gole lacznie): ${pct(stats.over25Pct)}`,
    `- Match over 3.5 (gole lacznie): ${pct(stats.over35Pct)}`,
    `- Srednie rogi (druzyna): ${stats.avgCorners.toFixed(2)} (proba: ${stats.cornersSamples})`,
    `- Srednie kartki (druzyna): ${stats.avgCards.toFixed(2)} (proba: ${stats.cardsSamples})`,
    `- Srednie celne strzaly (druzyna): ${stats.avgShotsOnTarget.toFixed(2)} (proba: ${stats.shotsSamples})`,
    `- Liczba meczow do overow: ${stats.sampleSize}`
  ].join("\n");

const formatH2HAdvancedStats = (
  matches: Array<{ score: string }>,
  homeTeamName: string,
  awayTeamName: string
): string => {
  if (matches.length === 0) return `${sectionHeader("🤝", "Zaawansowane H2H")}\n- Brak danych`;

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
    `${sectionHeader("🤝", `Zaawansowane H2H (${esc(homeTeamName)} vs ${esc(awayTeamName)})`)} (proba: ${matches.length}):`,
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
    sectionHeader("🧭", `Kontekst meczu ${esc(teamName)}`),
    `- Sredni odpoczynek: ${context.avgRestDays.toFixed(1)} dni`,
    `- Zmeczenie: ${pct(context.fatigueIndex)} (0% = wypoczeci, 100% = mocno przemeczeni)`,
    `- Absencje kluczowych (injuries): ${context.absencesCount}`,
    `- Lista absencji: ${context.absences.length > 0 ? esc(context.absences.slice(0, 12).join(", ")) : "brak danych"}`,
    `- Motywacja/stawka: ${pct(context.motivationIndex)}`,
    `- Powod motywacji: ${esc(context.motivationReason)}`,
    `- Tracone gole (ostatnie 10): ${context.concededLastFiveAvg.toFixed(2)}`,
    `- Czyste konta (ostatnie 10): ${context.cleanSheetsLastFive}`
  ].join("\n");

export const formatAnalysisMessage = (result: AnalysisResult): string => {
  const predictionSection = [
    sectionHeader("🔮", "Predykcja"),
    `- Home win: ${pct(result.prediction.homeWinProbability)}`,
    `- Draw: ${pct(result.prediction.drawProbability)}`,
    `- Away win: ${pct(result.prediction.awayWinProbability)}`,
    `- Expected goals: ${esc(result.match.homeTeam.name)} ${result.prediction.expectedHomeGoals.toFixed(
      2
    )} - ${result.prediction.expectedAwayGoals.toFixed(2)} ${esc(result.match.awayTeam.name)}`
  ].join("\n");

  const statsSectionFormatted = [sectionHeader("📌", "Statystyki"), ...result.statsSummary.map((line) => `- ${line}`)].join("\n");

  const valueSection = [sectionHeader("💰", "Value signals"), describeSignals(result.valueSignals)].join("\n");
  const bestBetSection = formatBestBet(result);
  const homeRecentSection = formatRecentMatchesSection(
    `Ostatnie mecze ${esc(result.match.homeTeam.name)}:`,
    result.homeRecentMatches
  );
  const awayRecentSection = formatRecentMatchesSection(
    `Ostatnie mecze ${esc(result.match.awayTeam.name)}:`,
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
  const leagueTableSection = formatLeagueTableSection(result);
  const oddsTrendSection = formatOddsTrendSection(result);

  return [
    "━━━━━━━━━━━━━━",
    `⚽ <b>Mecz:</b> ${esc(result.match.homeTeam.name)} vs ${esc(result.match.awayTeam.name)}`,
    `🏆 <b>Liga:</b> <b>${esc(result.match.league)}</b>`,
    "━━━━━━━━━━━━━━",
    ...(leagueTableSection ? [leagueTableSection] : []),
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
    ...(oddsTrendSection ? [oddsTrendSection] : []),
    valueSection,
    bestBetSection,
    "━━━━━━━━━━━━━━",
    "<i>Disclaimer: analiza ma charakter informacyjny, nie jest poradą finansową.</i>"
  ].join("\n\n");
};
