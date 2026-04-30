import { Telegraf } from "telegraf";
import { AnalysisEngine } from "./analysis/analysisEngine";
import { config } from "./config";
import { MatchRepository } from "./data/matchRepository";
import { FootballApiClient } from "./data/footballApiClient";
import { registerHandlers } from "./bot/registerHandlers";
import { logger } from "./utils/logger";

const bootstrap = async (): Promise<void> => {
  if (!config.TELEGRAM_BOT_TOKEN || !config.FOOTBALL_API_KEY) {
    throw new Error("Missing required env vars: TELEGRAM_BOT_TOKEN and/or FOOTBALL_API_KEY");
  }

  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);
  const apiClient = new FootballApiClient();
  const repository = new MatchRepository(apiClient);
  const analysisEngine = new AnalysisEngine();

  registerHandlers(bot, repository, analysisEngine);

  await bot.launch();
  logger.info("Telegram football analysis bot started");

  let oddsTrackerRunning = false;
  const runOddsTracker = async (trigger: "startup" | "interval"): Promise<void> => {
    if (oddsTrackerRunning) {
      logger.warn({ trigger }, "Odds tracker skipped because previous run is still active");
      return;
    }
    oddsTrackerRunning = true;
    try {
      const stats = await repository.refreshOddsHistoryForTodayAndTomorrow(config.ODDS_TRACKER_FIXTURES_LIMIT);
      logger.info(
        { trigger, checkedFixtures: stats.checked, updatedOdds: stats.updated },
        "Background odds tracker cycle finished"
      );
    } catch (error) {
      logger.error({ error, trigger }, "Background odds tracker cycle failed");
    } finally {
      oddsTrackerRunning = false;
    }
  };

  void runOddsTracker("startup");
  setInterval(() => {
    void runOddsTracker("interval");
  }, Math.max(1, config.ODDS_TRACKER_INTERVAL_MINUTES) * 60 * 1000);
};

bootstrap().catch((error) => {
  logger.error({ error }, "Failed to start application");
  process.exit(1);
});
