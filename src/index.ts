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
};

bootstrap().catch((error) => {
  logger.error({ error }, "Failed to start application");
  process.exit(1);
});
