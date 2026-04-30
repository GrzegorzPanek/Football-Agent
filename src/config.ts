import dotenv from "dotenv";

dotenv.config();

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",
  FOOTBALL_API_BASE_URL: process.env.FOOTBALL_API_BASE_URL ?? "https://v3.football.api-sports.io",
  FOOTBALL_API_KEY: process.env.FOOTBALL_API_KEY ?? "",
  BOOKMAKER_MARGIN: parseNumber(process.env.BOOKMAKER_MARGIN, 0.05),
  CACHE_TTL_SECONDS: parseNumber(process.env.CACHE_TTL_SECONDS, 600),
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info"
};
