import axios, { AxiosInstance } from "axios";
import { config } from "../config";
import { logger } from "../utils/logger";

export class FootballApiClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.FOOTBALL_API_BASE_URL,
      headers: {
        "x-apisports-key": config.FOOTBALL_API_KEY
      },
      timeout: 8000
    });
  }

  async getFixtureById(fixtureId: number): Promise<any> {
    return this.withRetry(() => this.http.get("/fixtures", { params: { id: fixtureId } }));
  }

  async getTeamForm(teamId: number, league?: string): Promise<any> {
    return this.withRetry(() =>
      this.http.get("/fixtures", {
        params: {
          team: teamId,
          // Wider sample prevents empty form for upcoming fixtures.
          last: 20,
          ...(league ? { league } : {})
        }
      })
    );
  }

  async getHeadToHead(homeTeamId: number, awayTeamId: number): Promise<any> {
    return this.withRetry(() =>
      this.http.get("/fixtures/headtohead", {
        params: { h2h: `${homeTeamId}-${awayTeamId}`, last: 5 }
      })
    );
  }

  async getOddsByFixture(fixtureId: number): Promise<any> {
    return this.withRetry(() =>
      this.http.get("/odds", {
        params: { fixture: fixtureId }
      })
    );
  }

  async getFixturesByDate(date: string): Promise<any> {
    return this.withRetry(() =>
      this.http.get("/fixtures", {
        params: { date }
      })
    );
  }

  async getTeamStatistics(leagueId: number, teamId: number, season: number, date?: string): Promise<any> {
    return this.withRetry(() =>
      this.http.get("/teams/statistics", {
        params: {
          league: leagueId,
          team: teamId,
          season,
          ...(date ? { date } : {})
        }
      })
    );
  }

  async getFixtureStatistics(fixtureId: number): Promise<any> {
    return this.withRetry(() =>
      this.http.get("/fixtures/statistics", {
        params: { fixture: fixtureId }
      })
    );
  }

  async getInjuries(teamId: number, leagueId: number, season: number): Promise<any> {
    return this.withRetry(() =>
      this.http.get("/injuries", {
        params: { team: teamId, league: leagueId, season }
      })
    );
  }

  async getStandings(leagueId: number, season: number): Promise<any> {
    return this.withRetry(() =>
      this.http.get("/standings", {
        params: { league: leagueId, season }
      })
    );
  }

  private async withRetry<T>(action: () => Promise<T>, retries = 3): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        return await action();
      } catch (error) {
        lastError = error;
        logger.warn({ attempt, error }, "API call failed");
        if (attempt < retries) {
          const delayMs = 200 * attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }
}
