import {
  HeadToHeadSummary,
  MatchInfo,
  OddsSnapshot,
  RecentMatch,
  TeamForm
} from "../types";

const safe = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const isFinishedFixture = (item: any): boolean => {
  const status = String(item?.fixture?.status?.short ?? "").toUpperCase();
  const allowed = new Set(["FT", "AET", "PEN"]);
  if (allowed.has(status)) return true;
  const goalsHome = item?.goals?.home;
  const goalsAway = item?.goals?.away;
  return typeof goalsHome === "number" && typeof goalsAway === "number";
};

export const normalizeMatchInfo = (fixturePayload: any): MatchInfo => {
  const fixture = fixturePayload.fixture ?? {};
  const league = fixturePayload.league ?? {};
  const teams = fixturePayload.teams ?? {};

  return {
    fixtureId: safe(fixture.id),
    league: String(league.name ?? "Unknown League"),
    date: String(fixture.date ?? new Date().toISOString()),
    homeTeam: {
      id: safe(teams.home?.id),
      name: String(teams.home?.name ?? "Home")
    },
    awayTeam: {
      id: safe(teams.away?.id),
      name: String(teams.away?.name ?? "Away")
    }
  };
};

export const normalizeTeamForm = (teamId: number, fixtures: any[]): TeamForm => {
  const relevant = fixtures.filter((item) => {
    const homeId = safe(item?.teams?.home?.id);
    const awayId = safe(item?.teams?.away?.id);
    return (homeId === teamId || awayId === teamId) && isFinishedFixture(item);
  });

  const lastFive = relevant.slice(0, 10).map((item) => {
    const goalsHome = safe(item?.goals?.home);
    const goalsAway = safe(item?.goals?.away);
    const homeId = safe(item?.teams?.home?.id);
    const isHome = homeId === teamId;
    const teamGoals = isHome ? goalsHome : goalsAway;
    const oppGoals = isHome ? goalsAway : goalsHome;
    if (teamGoals > oppGoals) return "W" as const;
    if (teamGoals < oppGoals) return "L" as const;
    return "D" as const;
  });

  const totals = relevant.slice(0, 10).reduce(
    (acc, item) => {
      const goalsHome = safe(item?.goals?.home);
      const goalsAway = safe(item?.goals?.away);
      const homeId = safe(item?.teams?.home?.id);
      const isHome = homeId === teamId;
      acc.gf += isHome ? goalsHome : goalsAway;
      acc.ga += isHome ? goalsAway : goalsHome;
      return acc;
    },
    { gf: 0, ga: 0 }
  );

  const sampleSize = Math.max(lastFive.length, 1);

  return {
    teamId,
    lastFive,
    goalsForAvg: totals.gf / sampleSize,
    goalsAgainstAvg: totals.ga / sampleSize
  };
};

export const normalizeTeamFormFromStatistics = (teamId: number, statsPayload: any): TeamForm => {
  const rawForm = String(statsPayload?.form ?? "")
    .replace(/[^WDL]/gi, "")
    .toUpperCase()
    .slice(-10);
  const lastFive = rawForm.split("").filter(Boolean) as Array<"W" | "D" | "L">;

  const goalsForAvg = Number(statsPayload?.goals?.for?.average?.total) || 0;
  const goalsAgainstAvg = Number(statsPayload?.goals?.against?.average?.total) || 0;

  return {
    teamId,
    lastFive,
    goalsForAvg: Number.isFinite(goalsForAvg) ? goalsForAvg : 0,
    goalsAgainstAvg: Number.isFinite(goalsAgainstAvg) ? goalsAgainstAvg : 0
  };
};

export const normalizeH2H = (fixtures: any[], homeTeamId: number, awayTeamId: number): HeadToHeadSummary =>
  fixtures.filter(isFinishedFixture).reduce(
    (acc, item) => {
      const goalsHome = safe(item?.goals?.home);
      const goalsAway = safe(item?.goals?.away);
      const fixtureHomeId = safe(item?.teams?.home?.id);
      const isHomeTeamHost = fixtureHomeId === homeTeamId;
      const homeGoals = isHomeTeamHost ? goalsHome : goalsAway;
      const awayGoals = isHomeTeamHost ? goalsAway : goalsHome;

      if (homeGoals > awayGoals) acc.homeWins += 1;
      else if (awayGoals > homeGoals) acc.awayWins += 1;
      else acc.draws += 1;

      return acc;
    },
    { homeWins: 0, awayWins: 0, draws: 0 }
  );

export const normalizeOdds = (oddsPayload: any): OddsSnapshot | undefined => {
  const bookmakers = oddsPayload?.bookmakers;
  if (!Array.isArray(bookmakers) || bookmakers.length === 0) return undefined;

  const collectOdds = (betName: string, valueKey: string): number[] =>
    bookmakers
      .map((bookmaker: any) => {
        const bets = Array.isArray(bookmaker?.bets) ? bookmaker.bets : [];
        const bet = bets.find((b: any) => b?.name === betName);
        if (!bet || !Array.isArray(bet.values)) return undefined;
        const oddRaw = bet.values.find((v: any) => String(v?.value).toLowerCase() === valueKey.toLowerCase())?.odd;
        const odd = Number(oddRaw);
        return Number.isFinite(odd) && odd > 1 ? odd : undefined;
      })
      .filter((odd: number | undefined): odd is number => typeof odd === "number");

  const avg = (values: number[]): number | undefined =>
    values.length > 0 ? values.reduce((acc, v) => acc + v, 0) / values.length : undefined;

  const home = avg(collectOdds("Match Winner", "Home"));
  const draw = avg(collectOdds("Match Winner", "Draw"));
  const away = avg(collectOdds("Match Winner", "Away"));
  if (!home || !draw || !away) return undefined;

  const bttsYes = avg(collectOdds("Both Teams Score", "Yes"));
  const bttsNo = avg(collectOdds("Both Teams Score", "No"));
  const over15 = avg(collectOdds("Goals Over/Under", "Over 1.5"));
  const under15 = avg(collectOdds("Goals Over/Under", "Under 1.5"));
  const over25 = avg(collectOdds("Goals Over/Under", "Over 2.5"));
  const under25 = avg(collectOdds("Goals Over/Under", "Under 2.5"));

  return {
    home,
    draw,
    away,
    ...(bttsYes ? { bttsYes } : {}),
    ...(bttsNo ? { bttsNo } : {}),
    ...(over15 ? { over15 } : {}),
    ...(under15 ? { under15 } : {}),
    ...(over25 ? { over25 } : {}),
    ...(under25 ? { under25 } : {})
  };
};

export const summarizeRecentMatches = (teamId: number, fixtures: any[], limit = 5): RecentMatch[] =>
  fixtures
    .filter((item) => {
      const homeId = safe(item?.teams?.home?.id);
      const awayId = safe(item?.teams?.away?.id);
      return (homeId === teamId || awayId === teamId) && isFinishedFixture(item);
    })
    .slice(0, limit)
    .map((item) => {
      const homeId = safe(item?.teams?.home?.id);
      const awayId = safe(item?.teams?.away?.id);
      const homeGoals = safe(item?.goals?.home);
      const awayGoals = safe(item?.goals?.away);
      const isHome = homeId === teamId;
      const teamGoals = isHome ? homeGoals : awayGoals;
      const oppGoals = isHome ? awayGoals : homeGoals;
      const resultForFocus: "W" | "D" | "L" = teamGoals > oppGoals ? "W" : teamGoals < oppGoals ? "L" : "D";

      return {
        date: String(item?.fixture?.date ?? "").slice(0, 10),
        league: String(item?.league?.name ?? ""),
        homeTeam: String(item?.teams?.home?.name ?? "Home"),
        awayTeam: String(item?.teams?.away?.name ?? "Away"),
        score: `${homeGoals}-${awayGoals}`,
        resultForFocus
      };
    });

export const summarizeH2HMatches = (
  fixtures: any[],
  homeTeamId: number,
  awayTeamId: number,
  limit = 8
): RecentMatch[] =>
  fixtures
    .filter((item) => {
      const homeId = safe(item?.teams?.home?.id);
      const awayId = safe(item?.teams?.away?.id);
      const validPair =
        (homeId === homeTeamId && awayId === awayTeamId) ||
        (homeId === awayTeamId && awayId === homeTeamId);
      return validPair && isFinishedFixture(item);
    })
    .slice(0, limit)
    .map((item) => {
      const fixtureHomeId = safe(item?.teams?.home?.id);
      const goalsHome = safe(item?.goals?.home);
      const goalsAway = safe(item?.goals?.away);
      const homeGoalsFromPerspective = fixtureHomeId === homeTeamId ? goalsHome : goalsAway;
      const awayGoalsFromPerspective = fixtureHomeId === homeTeamId ? goalsAway : goalsHome;
      const resultForFocus: "W" | "D" | "L" =
        homeGoalsFromPerspective > awayGoalsFromPerspective
          ? "W"
          : homeGoalsFromPerspective < awayGoalsFromPerspective
            ? "L"
            : "D";

      return {
        date: String(item?.fixture?.date ?? "").slice(0, 10),
        league: String(item?.league?.name ?? ""),
        homeTeam: String(item?.teams?.home?.name ?? "Home"),
        awayTeam: String(item?.teams?.away?.name ?? "Away"),
        score: `${goalsHome}-${goalsAway}`,
        resultForFocus
      };
    });
