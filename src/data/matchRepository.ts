import { appCache } from "./cache";
import { FootballApiClient } from "./footballApiClient";
import {
  normalizeH2H,
  normalizeMatchInfo,
  normalizeOdds,
  normalizeTeamForm,
  normalizeTeamFormFromStatistics,
  summarizeH2HMatches,
  summarizeRecentMatches
} from "./normalizers";
import {
  LeagueTableRow,
  MatchCard,
  MatchDataset,
  OddsSnapshot,
  OddsTrendInfo,
  TeamAdvancedStats,
  TeamContextSignals
} from "../types";
import { logger } from "../utils/logger";

const TOP_EUROPEAN_LEAGUE_IDS = new Set<number>([
  39, // Premier League
  140, // La Liga
  135, // Serie A
  78, // Bundesliga
  61, // Ligue 1
  88, // Eredivisie
  94, // Primeira Liga
  203, // Super Lig
  106, // Ekstraklasa
  107, // 1. Liga (PL)
  119, // (legacy mapping used in some feeds)
  271, // Superliga (Denmark)
  2, // UEFA Champions League
  3, // UEFA Europa League
  848 // UEFA Conference League
]);

const isAllowedPolishLeague = (leagueNameRaw: string, countryRaw: string): boolean => {
  const leagueName = leagueNameRaw.toLowerCase();
  const country = countryRaw.toLowerCase();
  if (!country.includes("poland")) return false;
  return leagueName.includes("ekstraklasa") || leagueName === "1. liga" || leagueName.includes(" i liga");
};

export class MatchRepository {
  constructor(private readonly apiClient: FootballApiClient) {}
  private readonly oddsTrendWindowHours = 72;
  private readonly oddsHistoryTtlSeconds = 60 * 60 * (this.oddsTrendWindowHours + 24);

  private updateOddsHistory(fixtureId: number, odds?: OddsSnapshot): Array<{ timestamp: number; odds: OddsSnapshot }> {
    if (!odds) return [];
    const key = `odds-history:${fixtureId}`;
    const now = Date.now();
    const existing = appCache.get<Array<{ timestamp: number; odds: OddsSnapshot }>>(key) ?? [];
    const next = [...existing, { timestamp: now, odds }]
      .filter((item) => now - item.timestamp <= this.oddsHistoryTtlSeconds * 1000)
      .slice(-200);
    appCache.set(key, next, this.oddsHistoryTtlSeconds);
    return next;
  }

  private buildOddsTrend(
    odds: OddsSnapshot | undefined,
    history: Array<{ timestamp: number; odds: OddsSnapshot }>,
    bookmakersCount: number
  ): OddsTrendInfo | undefined {
    if (!odds) return undefined;
    const now = Date.now();
    const cutoff = now - this.oddsTrendWindowHours * 60 * 60 * 1000;
    const inWindow = history.filter((item) => item.timestamp >= cutoff);
    const reference = inWindow.length > 0 ? inWindow[0] : undefined;
    const delta = (current: number, prev?: number): number | undefined =>
      typeof prev === "number" ? current - prev : undefined;

    const homeDelta = delta(odds.home, reference?.odds.home);
    const drawDelta = delta(odds.draw, reference?.odds.draw);
    const awayDelta = delta(odds.away, reference?.odds.away);
    const bttsYesDelta =
      typeof odds.bttsYes === "number" ? delta(odds.bttsYes, reference?.odds.bttsYes) : undefined;
    const bttsNoDelta =
      typeof odds.bttsNo === "number" ? delta(odds.bttsNo, reference?.odds.bttsNo) : undefined;
    const over25Delta =
      typeof odds.over25 === "number" ? delta(odds.over25, reference?.odds.over25) : undefined;
    const under25Delta =
      typeof odds.under25 === "number" ? delta(odds.under25, reference?.odds.under25) : undefined;

    const implied = {
      home: 1 / odds.home,
      draw: 1 / odds.draw,
      away: 1 / odds.away
    };
    const impliedSum = implied.home + implied.draw + implied.away;
    const norm = {
      home: implied.home / impliedSum,
      draw: implied.draw / impliedSum,
      away: implied.away / impliedSum
    };
    const sentimentSummary =
      norm.home >= norm.away && norm.home >= norm.draw
        ? `Rynek faworyzuje gospodarza (${(norm.home * 100).toFixed(1)}% implied).`
        : norm.away >= norm.home && norm.away >= norm.draw
          ? `Rynek faworyzuje gosci (${(norm.away * 100).toFixed(1)}% implied).`
          : `Rynek mocno wycenia remis (${(norm.draw * 100).toFixed(1)}% implied).`;

    const moves = [
      { label: "HOME", delta: homeDelta },
      { label: "DRAW", delta: drawDelta },
      { label: "AWAY", delta: awayDelta },
      { label: "BTTS_YES", delta: bttsYesDelta },
      { label: "BTTS_NO", delta: bttsNoDelta },
      { label: "OVER_2_5", delta: over25Delta },
      { label: "UNDER_2_5", delta: under25Delta }
    ].filter((item) => typeof item.delta === "number") as Array<{ label: string; delta: number }>;

    const strongestMove =
      moves.length > 0
        ? moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]
        : undefined;
    const hasMeaningfulMove = moves.some((item) => Math.abs(item.delta) >= 0.01);

    return {
      referenceAt: reference ? new Date(reference.timestamp).toISOString() : undefined,
      windowHours: this.oddsTrendWindowHours,
      bookmakersCount,
      homeReference: reference?.odds.home,
      drawReference: reference?.odds.draw,
      awayReference: reference?.odds.away,
      bttsYesReference: reference?.odds.bttsYes,
      bttsNoReference: reference?.odds.bttsNo,
      over25Reference: reference?.odds.over25,
      under25Reference: reference?.odds.under25,
      homeDelta,
      drawDelta,
      awayDelta,
      bttsYesDelta,
      bttsNoDelta,
      over25Delta,
      under25Delta,
      sentimentSummary,
      strongestMove:
        strongestMove && hasMeaningfulMove
          ? `${strongestMove.label} ${strongestMove.delta < 0 ? "spadl" : "wzrosl"} o ${Math.abs(strongestMove.delta).toFixed(2)}`
          : undefined
    };
  }

  private buildFirstLegState(
    fixturePayload: any,
    homeTeamId: number,
    awayTeamId: number,
    h2hFixtures: any[]
  ): { homeGoals: number; awayGoals: number } | undefined {
    const leagueId = Number(fixturePayload?.league?.id);
    const season = Number(fixturePayload?.league?.season);
    const currentKickoff = new Date(String(fixturePayload?.fixture?.date ?? "")).getTime();
    if (!Number.isFinite(currentKickoff)) return undefined;

    const previousLegs = (Array.isArray(h2hFixtures) ? h2hFixtures : [])
      .filter((item) => this.isFinishedFixture(item))
      .filter((item) => {
        const itemDate = new Date(String(item?.fixture?.date ?? "")).getTime();
        const itemLeagueId = Number(item?.league?.id);
        const itemSeason = Number(item?.league?.season);
        const itemHomeId = Number(item?.teams?.home?.id);
        const itemAwayId = Number(item?.teams?.away?.id);
        const validPair =
          (itemHomeId === homeTeamId && itemAwayId === awayTeamId) ||
          (itemHomeId === awayTeamId && itemAwayId === homeTeamId);
        return (
          validPair &&
          itemDate < currentKickoff &&
          itemLeagueId === leagueId &&
          itemSeason === season
        );
      })
      .sort((a, b) => {
        const dateA = new Date(String(a?.fixture?.date ?? "")).getTime();
        const dateB = new Date(String(b?.fixture?.date ?? "")).getTime();
        return dateB - dateA;
      });

    if (previousLegs.length === 0) return undefined;
    const firstLeg = previousLegs[0];
    const firstLegHomeId = Number(firstLeg?.teams?.home?.id);
    const goalsHome = Number(firstLeg?.goals?.home ?? 0);
    const goalsAway = Number(firstLeg?.goals?.away ?? 0);

    return {
      homeGoals: firstLegHomeId === homeTeamId ? goalsHome : goalsAway,
      awayGoals: firstLegHomeId === homeTeamId ? goalsAway : goalsHome
    };
  }

  private buildFallbackH2HFixtures(homeTeamId: number, awayTeamId: number, homeFixtures: any[], awayFixtures: any[]): any[] {
    const combined = [...homeFixtures, ...awayFixtures];
    const uniqueById = new Map<number, any>();
    for (const item of combined) {
      const fixtureId = Number(item?.fixture?.id);
      if (Number.isFinite(fixtureId) && !uniqueById.has(fixtureId)) {
        uniqueById.set(fixtureId, item);
      }
    }

    return Array.from(uniqueById.values())
      .filter((item) => this.isFinishedFixture(item))
      .filter((item) => {
        const homeId = Number(item?.teams?.home?.id);
        const awayId = Number(item?.teams?.away?.id);
        return (
          (homeId === homeTeamId && awayId === awayTeamId) ||
          (homeId === awayTeamId && awayId === homeTeamId)
        );
      })
      .sort((a, b) => {
        const dateA = new Date(String(a?.fixture?.date ?? "")).getTime();
        const dateB = new Date(String(b?.fixture?.date ?? "")).getTime();
        return dateB - dateA;
      })
      .slice(0, 8);
  }

  private formatDateOffset(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private isValidDateString(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  private isFinishedFixture(item: any): boolean {
    const status = String(item?.fixture?.status?.short ?? "").toUpperCase();
    return ["FT", "AET", "PEN"].includes(status);
  }

  private parseNumericStat(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const cleaned = value.replace("%", "").trim();
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private computeAdvancedStats(teamId: number, recentFixtures: any[], fixtureStatsById: Map<number, any[]>): TeamAdvancedStats {
    const finished = recentFixtures
      .filter((item) => this.isFinishedFixture(item))
      .slice(0, 10);

    const goalTotals = finished.map((item) => {
      const home = Number(item?.goals?.home ?? 0);
      const away = Number(item?.goals?.away ?? 0);
      return home + away;
    });
    const teamGoals = finished.map((item) => {
      const homeId = Number(item?.teams?.home?.id ?? 0);
      const homeGoals = Number(item?.goals?.home ?? 0);
      const awayGoals = Number(item?.goals?.away ?? 0);
      return homeId === teamId ? homeGoals : awayGoals;
    });
    const sampleSize = goalTotals.length || 1;
    const over = (line: number): number =>
      goalTotals.length === 0 ? 0 : goalTotals.filter((total) => total > line).length / sampleSize;
    const teamOver = (line: number): number =>
      teamGoals.length === 0 ? 0 : teamGoals.filter((total) => total > line).length / sampleSize;

    let cornersSum = 0;
    let cardsSum = 0;
    let shotsSum = 0;
    let cornersSamples = 0;
    let cardsSamples = 0;
    let shotsSamples = 0;

    for (const fixture of finished) {
      const fixtureId = Number(fixture?.fixture?.id);
      const statsRows = fixtureStatsById.get(fixtureId) ?? [];
      const teamStats = statsRows.find((row: any) => Number(row?.team?.id) === teamId);
      if (!teamStats || !Array.isArray(teamStats.statistics)) continue;

      const cornersRaw = teamStats.statistics.find((s: any) => s?.type === "Corner Kicks")?.value;
      const yellowRaw = teamStats.statistics.find((s: any) => s?.type === "Yellow Cards")?.value;
      const redRaw = teamStats.statistics.find((s: any) => s?.type === "Red Cards")?.value;
      const shotsOnGoalRaw = teamStats.statistics.find((s: any) => s?.type === "Shots on Goal")?.value;

      const corners = this.parseNumericStat(cornersRaw);
      const yellow = this.parseNumericStat(yellowRaw);
      const red = this.parseNumericStat(redRaw);
      const shotsOnGoal = this.parseNumericStat(shotsOnGoalRaw);

      if (typeof corners === "number") {
        cornersSum += corners;
        cornersSamples += 1;
      }
      if (typeof yellow === "number" || typeof red === "number") {
        cardsSum += (yellow ?? 0) + (red ?? 0);
        cardsSamples += 1;
      }
      if (typeof shotsOnGoal === "number") {
        shotsSum += shotsOnGoal;
        shotsSamples += 1;
      }
    }

    return {
      sampleSize: goalTotals.length,
      teamOver05Pct: teamOver(0.5),
      teamOver15Pct: teamOver(1.5),
      teamOver25Pct: teamOver(2.5),
      teamOver35Pct: teamOver(3.5),
      over05Pct: over(0.5),
      over15Pct: over(1.5),
      over25Pct: over(2.5),
      over35Pct: over(3.5),
      avgCorners: cornersSamples > 0 ? cornersSum / cornersSamples : 0,
      avgCards: cardsSamples > 0 ? cardsSum / cardsSamples : 0,
      avgShotsOnTarget: shotsSamples > 0 ? shotsSum / shotsSamples : 0,
      cornersSamples,
      cardsSamples,
      shotsSamples
    };
  }

  private computeContextSignals(
    teamId: number,
    recentFixtures: any[],
    matchDateIso: string,
    injuries: string[],
    standingsRow: any,
    standingsRows: any[],
    isCupCompetition: boolean,
    cupRound?: string,
    firstLegState?: { homeGoals: number; awayGoals: number },
    isHomeTeamInCurrentFixture = false
  ): TeamContextSignals {
    const finished = recentFixtures.filter((item) => this.isFinishedFixture(item)).slice(0, 10);
    const matchDate = new Date(matchDateIso);

    const rests = finished
      .slice(0, 3)
      .map((item) => new Date(String(item?.fixture?.date ?? "")))
      .filter((d) => !Number.isNaN(d.getTime()))
      .map((d) => Math.max(0, (matchDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
    const avgRestDays = rests.length === 0 ? 5 : rests.reduce((a, b) => a + b, 0) / rests.length;
    const fatigueIndex = Math.max(0, Math.min(1, (4 - avgRestDays) / 4));

    let concededSum = 0;
    let cleanSheets = 0;
    for (const item of finished) {
      const homeId = Number(item?.teams?.home?.id ?? 0);
      const homeGoals = Number(item?.goals?.home ?? 0);
      const awayGoals = Number(item?.goals?.away ?? 0);
      const conceded = homeId === teamId ? awayGoals : homeGoals;
      concededSum += conceded;
      if (conceded === 0) cleanSheets += 1;
    }
    const concededLastFiveAvg = finished.length === 0 ? 0 : concededSum / finished.length;

    let motivationIndex = isCupCompetition ? 0.8 : 0.5;
    let motivationReason = isCupCompetition
      ? "Mecz pucharowy - wysoka stawka awansu/eliminacji."
      : "Mecz ligowy o standardowej wadze.";

    if (isCupCompetition) {
      const normalizedRound = String(cupRound ?? "").toLowerCase();
      const isKnockoutRound =
        normalizedRound.includes("semi") ||
        normalizedRound.includes("final") ||
        normalizedRound.includes("quarter") ||
        normalizedRound.includes("round of 16") ||
        normalizedRound.includes("1/8") ||
        normalizedRound.includes("1/4") ||
        normalizedRound.includes("play-off") ||
        normalizedRound.includes("playoff");
      const isLeagueStyleRound =
        normalizedRound.includes("league stage") ||
        normalizedRound.includes("group") ||
        normalizedRound.includes("regular season");

      if (isKnockoutRound && normalizedRound.includes("semi")) {
        motivationIndex = Math.max(motivationIndex, 0.95);
        motivationReason = "Polfinal pucharu - bezposrednia walka o final.";
      } else if (isKnockoutRound && normalizedRound.includes("final")) {
        motivationIndex = Math.max(motivationIndex, 0.98);
        motivationReason = "Final pucharu - najwyzsza mozliwa stawka meczu.";
      } else if (
        isKnockoutRound &&
        (normalizedRound.includes("quarter") || normalizedRound.includes("1/4"))
      ) {
        motivationIndex = Math.max(motivationIndex, 0.9);
        motivationReason = "Cwiercfinal pucharu - stawka awansu do top4.";
      } else if (
        isKnockoutRound &&
        (normalizedRound.includes("round of 16") ||
          normalizedRound.includes("1/8") ||
          normalizedRound.includes("play-off") ||
          normalizedRound.includes("playoff"))
      ) {
        motivationIndex = Math.max(motivationIndex, 0.85);
        motivationReason = "Faza pucharowa - mecz o awans do kolejnej rundy.";
      } else if (isLeagueStyleRound) {
        motivationIndex = Math.max(motivationIndex, 0.62);
        motivationReason =
          "Etap ligowy europejskich rozgrywek - wynik ma znaczenie tabelowe, ale to nie jest mecz eliminacyjny.";
      } else if (!isKnockoutRound) {
        motivationIndex = Math.max(motivationIndex, 0.7);
        motivationReason =
          "Rozgrywki pucharowe, ale bez jednoznacznej fazy eliminacyjnej w danych - przyjeto podwyzszona stawke.";
      }

      if (isKnockoutRound && firstLegState) {
        const teamFirstLegGoals = isHomeTeamInCurrentFixture ? firstLegState.homeGoals : firstLegState.awayGoals;
        const oppFirstLegGoals = isHomeTeamInCurrentFixture ? firstLegState.awayGoals : firstLegState.homeGoals;
        const firstLegLabel = `${firstLegState.homeGoals}:${firstLegState.awayGoals}`;
        const roundLabel = cupRound ?? "drabinka";

        if (teamFirstLegGoals > oppFirstLegGoals) {
          motivationIndex = Math.max(motivationIndex, 0.9);
          motivationReason =
            `Faza pucharowa (${roundLabel}) - pierwszy mecz ${firstLegLabel}, druzyna broni zaliczki w dwumeczu.`;
        } else if (teamFirstLegGoals < oppFirstLegGoals) {
          motivationIndex = Math.max(motivationIndex, 0.97);
          motivationReason =
            `Faza pucharowa (${roundLabel}) - pierwszy mecz ${firstLegLabel}, druzyna musi odrabiac strate w dwumeczu.`;
        } else {
          motivationIndex = Math.max(motivationIndex, 0.94);
          motivationReason =
            `Faza pucharowa (${roundLabel}) - pierwszy mecz ${firstLegLabel}, dwumecz jest calkowicie otwarty.`;
        }
      }
    } else {
      const rank = Number(standingsRow?.rank);
      const points = Number(standingsRow?.points);
      const rows = Array.isArray(standingsRows) ? standingsRows : [];
      if (Number.isFinite(rank) && rows.length > 0) {
        const byRank = rows
          .map((row: any) => ({
            rank: Number(row?.rank),
            points: Number(row?.points),
            description: String(row?.description ?? "").toLowerCase()
          }))
          .filter((row) => Number.isFinite(row.rank) && Number.isFinite(row.points))
          .sort((a, b) => a.rank - b.rank);

        const hasEuropeanZone = byRank.some((row) =>
          row.description.includes("champions") ||
          row.description.includes("europa") ||
          row.description.includes("conference")
        );
        const hasRelegationZone = byRank.some((row) =>
          row.description.includes("relegation") ||
          row.description.includes("descent") ||
          row.description.includes("drop")
        );

        const europeanCut = byRank
          .filter((row) =>
            row.description.includes("champions") ||
            row.description.includes("europa") ||
            row.description.includes("conference")
          )
          .reduce((max, row) => Math.max(max, row.rank), 0);

        const relegationCut = byRank
          .filter((row) =>
            row.description.includes("relegation") ||
            row.description.includes("descent") ||
            row.description.includes("drop")
          )
          .reduce((min, row) => Math.min(min, row.rank), Number.POSITIVE_INFINITY);

        const pointsByRank = new Map<number, number>();
        for (const row of byRank) pointsByRank.set(row.rank, row.points);
        const currentPoints = Number.isFinite(points) ? points : 0;

        const pointsToEurope =
          hasEuropeanZone && Number.isFinite(pointsByRank.get(Math.max(1, europeanCut)) ?? NaN)
            ? Math.max(0, (pointsByRank.get(Math.max(1, europeanCut)) ?? currentPoints) - currentPoints)
            : undefined;
        const pointsToSafety =
          hasRelegationZone && Number.isFinite(pointsByRank.get(Math.max(1, relegationCut - 1)) ?? NaN)
            ? Math.max(0, (pointsByRank.get(Math.max(1, relegationCut - 1)) ?? currentPoints) - currentPoints)
            : undefined;
        const pointsToRelegation =
          hasRelegationZone && Number.isFinite(pointsByRank.get(relegationCut) ?? NaN)
            ? Math.max(0, currentPoints - (pointsByRank.get(relegationCut) ?? currentPoints))
            : undefined;

        if (hasEuropeanZone && rank > europeanCut && typeof pointsToEurope === "number" && pointsToEurope <= 6) {
          motivationIndex = Math.max(motivationIndex, pointsToEurope <= 3 ? 0.9 : 0.82);
          motivationReason =
            `Druzyna traci ${pointsToEurope} pkt do strefy pucharowej, wiec wynik mocno wplywa na szanse awansu do Europy.`;
        } else if (hasEuropeanZone && rank <= europeanCut) {
          const chaserGap = typeof pointsToRelegation === "number" ? pointsToRelegation : 0;
          motivationIndex = Math.max(motivationIndex, chaserGap <= 3 ? 0.86 : 0.76);
          motivationReason =
            `Druzyna broni miejsca w strefie pucharowej; margines nad goniacymi to ok. ${chaserGap} pkt.`;
        }

        if (hasRelegationZone && rank >= relegationCut) {
          motivationIndex = Math.max(motivationIndex, 0.92);
          motivationReason =
            "Druzyna jest w strefie spadkowej - kazdy mecz ma krytyczna wage dla utrzymania.";
        } else if (hasRelegationZone && rank < relegationCut && typeof pointsToRelegation === "number" && pointsToRelegation <= 6) {
          motivationIndex = Math.max(motivationIndex, pointsToRelegation <= 3 ? 0.88 : 0.8);
          motivationReason =
            `Druzyna jest blisko strefy spadkowej (zapas ${pointsToRelegation} pkt), dlatego wynik mocno wplywa na ryzyko spadku.`;
        } else if (typeof pointsToEurope === "number" && pointsToEurope > 6 && typeof pointsToRelegation === "number" && pointsToRelegation > 6) {
          motivationIndex = Math.max(motivationIndex, 0.55);
          motivationReason =
            "Pozycja i dystans punktowy do kluczowych stref sugeruja umiarkowana stawke meczu.";
        }
      }
    }
    motivationIndex = Math.max(0, Math.min(1, motivationIndex));

    return {
      avgRestDays,
      fatigueIndex,
      absencesCount: injuries.length,
      absences: injuries,
      motivationIndex,
      motivationReason,
      concededLastFiveAvg,
      cleanSheetsLastFive: cleanSheets
    };
  }

  private isKnockoutRound(cupRound?: string): boolean {
    const normalizedRound = String(cupRound ?? "").toLowerCase();
    return (
      normalizedRound.includes("semi") ||
      normalizedRound.includes("final") ||
      normalizedRound.includes("quarter") ||
      normalizedRound.includes("round of 16") ||
      normalizedRound.includes("1/8") ||
      normalizedRound.includes("1/4") ||
      normalizedRound.includes("play-off") ||
      normalizedRound.includes("playoff")
    );
  }

  async loadMatchesByDate(date: string): Promise<MatchCard[]> {
    if (!this.isValidDateString(date)) {
      throw new Error("Invalid date format. Use YYYY-MM-DD.");
    }

    const cacheKey = `matches:${date}`;
    const cached = appCache.get<MatchCard[]>(cacheKey);
    if (cached) return cached;

    const fixturesResponse = await this.apiClient.getFixturesByDate(date);
    const payload = fixturesResponse.data?.response ?? [];
    const cards: MatchCard[] = payload
      .filter((item: any) => {
        const leagueId = Number(item?.league?.id);
        const leagueName = String(item?.league?.name ?? "").toLowerCase();
        const countryName = String(item?.league?.country ?? "");
        return (
          TOP_EUROPEAN_LEAGUE_IDS.has(leagueId) ||
          isAllowedPolishLeague(leagueName, countryName)
        );
      })
      .map((item: any) => {
        const normalized = normalizeMatchInfo(item);
        return {
          fixtureId: normalized.fixtureId,
          league: normalized.league,
          date: normalized.date,
          homeTeam: normalized.homeTeam.name,
          awayTeam: normalized.awayTeam.name
        };
      });

    appCache.set(cacheKey, cards);
    return cards;
  }

  async loadTodayMatches(): Promise<MatchCard[]> {
    return this.loadMatchesByDate(this.formatDateOffset(0));
  }

  async loadTomorrowMatches(): Promise<MatchCard[]> {
    return this.loadMatchesByDate(this.formatDateOffset(1));
  }

  async findFixtureByTeams(homeQuery: string, awayQuery: string, date = this.formatDateOffset(0)): Promise<number | undefined> {
    const todayMatches = await this.loadMatchesByDate(date);
    const normalizedHome = homeQuery.trim().toLowerCase();
    const normalizedAway = awayQuery.trim().toLowerCase();

    const exact = todayMatches.find(
      (item) =>
        item.homeTeam.toLowerCase().includes(normalizedHome) &&
        item.awayTeam.toLowerCase().includes(normalizedAway)
    );
    if (exact) return exact.fixtureId;

    const swapped = todayMatches.find(
      (item) =>
        item.homeTeam.toLowerCase().includes(normalizedAway) &&
        item.awayTeam.toLowerCase().includes(normalizedHome)
    );
    return swapped?.fixtureId;
  }

  async loadDataset(fixtureId: number): Promise<MatchDataset> {
    const cacheKey = `dataset:${fixtureId}`;
    const cached = appCache.get<MatchDataset>(cacheKey);
    if (cached) return cached;

    const fixtureResponse = await this.apiClient.getFixtureById(fixtureId);
    const fixturePayload = fixtureResponse.data?.response?.[0];
    if (!fixturePayload) {
      throw new Error(`Fixture ${fixtureId} not found`);
    }

    const match = normalizeMatchInfo(fixturePayload);
    const leagueId = Number(fixturePayload?.league?.id);
    const season = Number(fixturePayload?.league?.season);
    const fixtureDate = String(fixturePayload?.fixture?.date ?? "").slice(0, 10);
    const isCupCompetition = String(fixturePayload?.league?.type ?? "").toLowerCase() === "cup";
    const cupRound = String(fixturePayload?.league?.round ?? "");
    const canUseTeamStats = Number.isFinite(leagueId) && Number.isFinite(season);
    const safeTeamStats = (teamId: number): Promise<any> => {
      if (!canUseTeamStats) return Promise.resolve({ data: { response: undefined } });
      return this.apiClient
        .getTeamStatistics(leagueId, teamId, season, fixtureDate)
        .catch((error) => {
          logger.warn({ teamId, leagueId, season, error }, "Team statistics unavailable, using fixtures fallback");
          return { data: { response: undefined } };
        });
    };

    const [homeFormRes, awayFormRes, homeStatsRes, awayStatsRes, h2hRes, oddsRes] = await Promise.all([
      this.apiClient.getTeamForm(match.homeTeam.id),
      this.apiClient.getTeamForm(match.awayTeam.id),
      safeTeamStats(match.homeTeam.id),
      safeTeamStats(match.awayTeam.id),
      this.apiClient.getHeadToHead(match.homeTeam.id, match.awayTeam.id),
      this.apiClient.getOddsByFixture(match.fixtureId)
    ]);

    const [injuriesHomeRes, injuriesAwayRes, standingsRes] = await Promise.all([
      canUseTeamStats
        ? this.apiClient.getInjuries(match.homeTeam.id, leagueId, season).catch(() => ({ data: { response: [] } }))
        : Promise.resolve({ data: { response: [] } }),
      canUseTeamStats
        ? this.apiClient.getInjuries(match.awayTeam.id, leagueId, season).catch(() => ({ data: { response: [] } }))
        : Promise.resolve({ data: { response: [] } }),
      canUseTeamStats
        ? this.apiClient.getStandings(leagueId, season).catch(() => ({ data: { response: [] } }))
        : Promise.resolve({ data: { response: [] } })
    ]);

    const homeFixtures = homeFormRes.data?.response ?? [];
    const awayFixtures = awayFormRes.data?.response ?? [];
    const h2hFixturesApi = h2hRes.data?.response ?? [];
    const oddsPayload = oddsRes.data?.response?.[0];
    const odds = normalizeOdds(oddsPayload);
    const bookmakersCount = Array.isArray(oddsPayload?.bookmakers) ? oddsPayload.bookmakers.length : 0;
    const oddsHistory = this.updateOddsHistory(match.fixtureId, odds);
    const oddsTrend = this.buildOddsTrend(odds, oddsHistory, bookmakersCount);
    const fallbackH2H = this.buildFallbackH2HFixtures(match.homeTeam.id, match.awayTeam.id, homeFixtures, awayFixtures);
    const mergedH2HMap = new Map<number, any>();
    for (const item of [...(Array.isArray(h2hFixturesApi) ? h2hFixturesApi : []), ...fallbackH2H]) {
      const fixtureId = Number(item?.fixture?.id);
      if (Number.isFinite(fixtureId) && !mergedH2HMap.has(fixtureId)) {
        mergedH2HMap.set(fixtureId, item);
      }
    }
    const h2hFixtures = Array.from(mergedH2HMap.values())
      .sort((a, b) => {
        const dateA = new Date(String(a?.fixture?.date ?? "")).getTime();
        const dateB = new Date(String(b?.fixture?.date ?? "")).getTime();
        return dateB - dateA;
      })
      .slice(0, 8);
    const firstLegState = this.buildFirstLegState(
      fixturePayload,
      match.homeTeam.id,
      match.awayTeam.id,
      h2hFixtures
    );

    const homeStatsPayload = homeStatsRes.data?.response;
    const awayStatsPayload = awayStatsRes.data?.response;

    const homeFormFromStats = normalizeTeamFormFromStatistics(match.homeTeam.id, homeStatsPayload);
    const awayFormFromStats = normalizeTeamFormFromStatistics(match.awayTeam.id, awayStatsPayload);
    const homeFormFallback = normalizeTeamForm(match.homeTeam.id, homeFixtures);
    const awayFormFallback = normalizeTeamForm(match.awayTeam.id, awayFixtures);

    const homeForm = homeFormFromStats.lastFive.length > 0 ? homeFormFromStats : homeFormFallback;
    const awayForm = awayFormFromStats.lastFive.length > 0 ? awayFormFromStats : awayFormFallback;

    const relevantFixtureIds = Array.from(
      new Set(
        [...homeFixtures, ...awayFixtures]
          .filter((item: any) => this.isFinishedFixture(item))
          .slice(0, 20)
          .map((item: any) => Number(item?.fixture?.id))
          .filter((id) => Number.isFinite(id))
      )
    );
    const statsEntries = await Promise.all(
      relevantFixtureIds.map(async (id) => {
        try {
          const response = await this.apiClient.getFixtureStatistics(id);
          return [id, response.data?.response ?? []] as const;
        } catch (error) {
          logger.warn({ id, error }, "Fixture statistics unavailable");
          return [id, []] as const;
        }
      })
    );
    const fixtureStatsById = new Map<number, any[]>(statsEntries);

    const homeAdvancedStats = this.computeAdvancedStats(match.homeTeam.id, homeFixtures, fixtureStatsById);
    const awayAdvancedStats = this.computeAdvancedStats(match.awayTeam.id, awayFixtures, fixtureStatsById);

    const standingsTable =
      standingsRes.data?.response?.[0]?.league?.standings?.[0] ??
      standingsRes.data?.response?.[0]?.league?.standings?.flat?.()[0] ??
      [];
    const standingsRows = Array.isArray(standingsTable) ? standingsTable : [];
    const isCupKnockout = isCupCompetition && this.isKnockoutRound(cupRound);
    const leagueTableRows: LeagueTableRow[] | undefined = !isCupKnockout
      ? standingsRows
          .map((row: any) => ({
            rank: Number(row?.rank),
            teamId: Number(row?.team?.id),
            teamName: String(row?.team?.name ?? ""),
            points: Number(row?.points ?? 0),
            played: Number(row?.all?.played ?? 0),
            description: String(row?.description ?? "")
          }))
          .filter(
            (row: LeagueTableRow) =>
              Number.isFinite(row.rank) &&
              Number.isFinite(row.teamId) &&
              row.teamName.length > 0
          )
          .sort((a: LeagueTableRow, b: LeagueTableRow) => a.rank - b.rank)
          .slice(0, 12)
      : undefined;
    const homeStanding = standingsRows.find((row: any) => Number(row?.team?.id) === match.homeTeam.id);
    const awayStanding = standingsRows.find((row: any) => Number(row?.team?.id) === match.awayTeam.id);

    const homeContext = this.computeContextSignals(
      match.homeTeam.id,
      homeFixtures,
      fixturePayload?.fixture?.date ?? new Date().toISOString(),
      Array.isArray(injuriesHomeRes.data?.response)
        ? injuriesHomeRes.data.response
            .map((row: any) => String(row?.player?.name ?? "").trim())
            .filter((name: string) => name.length > 0)
        : [],
      homeStanding,
      standingsRows,
      isCupCompetition,
      cupRound,
      firstLegState,
      true
    );
    const awayContext = this.computeContextSignals(
      match.awayTeam.id,
      awayFixtures,
      fixturePayload?.fixture?.date ?? new Date().toISOString(),
      Array.isArray(injuriesAwayRes.data?.response)
        ? injuriesAwayRes.data.response
            .map((row: any) => String(row?.player?.name ?? "").trim())
            .filter((name: string) => name.length > 0)
        : [],
      awayStanding,
      standingsRows,
      isCupCompetition,
      cupRound,
      firstLegState,
      false
    );

    const dataset: MatchDataset = {
      match,
      homeForm,
      awayForm,
      h2h: normalizeH2H(h2hFixtures, match.homeTeam.id, match.awayTeam.id),
      homeAdvancedStats,
      awayAdvancedStats,
      homeContext,
      awayContext,
      leagueTableRows,
      homeRecentMatches: summarizeRecentMatches(match.homeTeam.id, homeFixtures, 10),
      awayRecentMatches: summarizeRecentMatches(match.awayTeam.id, awayFixtures, 10),
      h2hRecentMatches: summarizeH2HMatches(h2hFixtures, match.homeTeam.id, match.awayTeam.id, 8),
      odds,
      oddsTrend
    };

    appCache.set(cacheKey, dataset);
    return dataset;
  }
}
