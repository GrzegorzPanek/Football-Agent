import { Telegraf } from "telegraf";
import { AnalysisEngine } from "../analysis/analysisEngine";
import { MatchRepository } from "../data/matchRepository";
import { formatAnalysisMessage } from "./formatter";
import { logger } from "../utils/logger";

const usage = [
  "Uzycie:",
  "/today (top europejskie ligi)",
  "/tomorrow",
  "/day YYYY-MM-DD",
  "/analyze today",
  "/analyze tomorrow",
  "/analyze YYYY-MM-DD",
  "/analyzeleague YYYY-MM-DD | NAZWA_LIGI",
  "/analyze <fixtureId>",
  "/analyze <home team> vs <away team>",
  "Przyklad:",
  "/analyze today",
  "/analyze 2026-05-07",
  "/analyzeleague 2026-05-03 | Premier League",
  "/analyze 1201234",
  "/analyze Barcelona vs Real Madrid",
  "/today",
  "/day 2026-05-07"
].join("\n");

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const resolveDateKeyword = (query: string): string | undefined => {
  const normalized = query.trim().toLowerCase();
  if (normalized === "today") return new Date().toISOString().slice(0, 10);
  if (normalized === "tomorrow") {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  if (datePattern.test(query.trim())) return query.trim();
  return undefined;
};

const formatGroupedMatches = (title: string, matches: Array<{ homeTeam: string; awayTeam: string; fixtureId: number; league: string }>): string => {
  const grouped = new Map<string, Array<{ homeTeam: string; awayTeam: string; fixtureId: number }>>();
  for (const item of matches) {
    const current = grouped.get(item.league) ?? [];
    current.push({ homeTeam: item.homeTeam, awayTeam: item.awayTeam, fixtureId: item.fixtureId });
    grouped.set(item.league, current);
  }

  const sections: string[] = [title];
  for (const [league, leagueMatches] of grouped) {
    sections.push(``, `<b>${league}</b>`);
    for (const m of leagueMatches) {
      sections.push(`- ${m.homeTeam} vs ${m.awayTeam} (id: ${m.fixtureId})`);
    }
  }
  return sections.join("\n");
};

const parseAnalyzeInput = (input: string): { fixtureId?: number; home?: string; away?: string } => {
  const trimmed = input.trim();
  const asNumber = Number(trimmed);
  if (trimmed && !Number.isNaN(asNumber)) {
    return { fixtureId: asNumber };
  }

  const vsSeparator = /\s+vs\s+/i;
  if (vsSeparator.test(trimmed)) {
    const [home, away] = trimmed.split(vsSeparator);
    if (home && away) {
      return { home: home.trim(), away: away.trim() };
    }
  }

  return {};
};

export const registerHandlers = (
  bot: Telegraf,
  matchRepository: MatchRepository,
  analysisEngine: AnalysisEngine
): void => {
  bot.start((ctx: any) => {
    const startMessage = [
      "Czesc! Jestem agentem do analizy meczow pilkarskich.",
      "",
      "Dostepne komendy:",
      "/today - lista meczow na dzis",
      "/tomorrow - lista meczow na jutro",
      "/day YYYY-MM-DD - lista meczow na wskazany dzien",
      "/analyze today - analiza wszystkich meczow dzisiaj",
      "/analyze tomorrow - analiza wszystkich meczow jutro",
      "/analyze YYYY-MM-DD - analiza wszystkich meczow na podana date",
      "/analyzeleague YYYY-MM-DD | NAZWA_LIGI - analiza po konkretnej lidze i dacie",
      "/analyze <fixtureId> - szczegolowa analiza wybranego meczu",
      "/analyze TeamA vs TeamB - wyszukanie meczu po nazwach druzyn",
      "/help - skrot uzycia"
    ].join("\n");
    return ctx.reply(startMessage);
  });

  bot.help((ctx: any) => ctx.reply(usage));

  bot.command("today", async (ctx: any) => {
    try {
      const matches = await matchRepository.loadTodayMatches();
      if (matches.length === 0) {
        await ctx.reply("Brak meczow na dzis w top europejskich ligach.");
        return;
      }

      await ctx.reply(
        formatGroupedMatches("Dzisiejsze mecze (top europejskie ligi):", matches.slice(0, 60)),
        { parse_mode: "HTML" }
      );
    } catch (error) {
      logger.error({ error }, "Failed to load today matches");
      await ctx.reply("Nie udalo sie pobrac listy meczow na dzis.");
    }
  });

  bot.command("tomorrow", async (ctx: any) => {
    try {
      const matches = await matchRepository.loadTomorrowMatches();
      if (matches.length === 0) {
        await ctx.reply("Brak meczow na jutro w top europejskich ligach.");
        return;
      }
      await ctx.reply(
        formatGroupedMatches("Jutrzejsze mecze (top europejskie ligi):", matches.slice(0, 80)),
        { parse_mode: "HTML" }
      );
    } catch (error) {
      logger.error({ error }, "Failed to load tomorrow matches");
      await ctx.reply("Nie udalo sie pobrac listy meczow na jutro.");
    }
  });

  bot.command("day", async (ctx: any) => {
    const messageText = "text" in ctx.message ? ctx.message.text : "";
    const dateInput = messageText.replace(/^\/day(@\w+)?\s*/i, "").trim();
    if (!datePattern.test(dateInput)) {
      await ctx.reply("Uzyj formatu: /day YYYY-MM-DD");
      return;
    }
    try {
      const matches = await matchRepository.loadMatchesByDate(dateInput);
      if (matches.length === 0) {
        await ctx.reply(`Brak meczow na ${dateInput} w top europejskich ligach.`);
        return;
      }
      await ctx.reply(
        formatGroupedMatches(`Mecze na ${dateInput} (top europejskie ligi):`, matches.slice(0, 120)),
        { parse_mode: "HTML" }
      );
    } catch (error) {
      logger.error({ error, dateInput }, "Failed to load matches by date");
      await ctx.reply("Nie udalo sie pobrac listy meczow dla tej daty.");
    }
  });

  bot.command("analyzeleague", async (ctx: any) => {
    const messageText = "text" in ctx.message ? ctx.message.text : "";
    const payload = messageText.replace(/^\/analyzeleague(@\w+)?\s*/i, "").trim();
    const [dateInputRaw, leagueInputRaw] = payload.split("|");
    const dateInput = (dateInputRaw ?? "").trim();
    const leagueInput = (leagueInputRaw ?? "").trim();

    if (!datePattern.test(dateInput) || !leagueInput) {
      await ctx.reply("Uzycie: /analyzeleague YYYY-MM-DD | NAZWA_LIGI\nPrzyklad: /analyzeleague 2026-05-03 | Premier League");
      return;
    }

    try {
      await ctx.reply(`Analizuje lige "${leagueInput}" na ${dateInput}, chwila...`);
      const matches = await matchRepository.loadMatchesByDate(dateInput);
      const leagueMatches = matches.filter((item) =>
        item.league.toLowerCase().includes(leagueInput.toLowerCase())
      );

      if (leagueMatches.length === 0) {
        await ctx.reply(`Brak meczow ligi "${leagueInput}" na ${dateInput}.`);
        return;
      }

      let sentCount = 0;
      for (const item of leagueMatches) {
        try {
          const dataset = await matchRepository.loadDataset(item.fixtureId);
          const result = analysisEngine.analyze(dataset);
          await ctx.reply(formatAnalysisMessage(result), { parse_mode: "HTML" });
          sentCount += 1;
        } catch (error) {
          logger.warn({ error, fixtureId: item.fixtureId }, "Failed single match in /analyzeleague");
        }
      }

      await ctx.reply(`Zakonczono analize ${sentCount} meczow ligi "${leagueInput}" na ${dateInput}.`);
    } catch (error) {
      logger.error({ error, dateInput, leagueInput }, "Failed analyzeleague command");
      await ctx.reply("Nie udalo sie przygotowac analizy ligi dla tej daty.");
    }
  });

  bot.command("analyze", async (ctx: any) => {
    const messageText = "text" in ctx.message ? ctx.message.text : "";
    const query = messageText.replace(/^\/analyze(@\w+)?\s*/i, "").trim();
    const parsed = parseAnalyzeInput(query);

    if (!query) {
      await ctx.reply(usage);
      return;
    }

    try {
      const selectedDate = resolveDateKeyword(query);
      if (selectedDate) {
        await ctx.reply(`Analizuje mecze na ${selectedDate}, chwila...`);
        const matches = await matchRepository.loadMatchesByDate(selectedDate);
        if (matches.length === 0) {
          await ctx.reply(`Brak meczow na ${selectedDate} w top europejskich ligach.`);
          return;
        }

        let sentCount = 0;
        for (const item of matches) {
          try {
            const dataset = await matchRepository.loadDataset(item.fixtureId);
            const result = analysisEngine.analyze(dataset);
            await ctx.reply(formatAnalysisMessage(result), { parse_mode: "HTML" });
            sentCount += 1;
          } catch (error) {
            logger.warn({ error, fixtureId: item.fixtureId }, "Failed single match in /analyze today");
          }
        }

        if (sentCount === 0) {
          await ctx.reply("Nie udalo sie przygotowac analiz dzisiejszych meczow.");
          return;
        }

        await ctx.reply(`Zakonczono analize ${sentCount} meczow na ${selectedDate}.`);
        return;
      }

      await ctx.reply("Analizuje mecz, chwila...");
      const fixtureId =
        parsed.fixtureId ??
        (parsed.home && parsed.away
          ? await matchRepository.findFixtureByTeams(parsed.home, parsed.away)
          : undefined);

      if (!fixtureId) {
        await ctx.reply(
          "Nie znalazlem meczu po tej frazie. Uzyj /today albo podaj konkretne fixtureId."
        );
        return;
      }

      const dataset = await matchRepository.loadDataset(fixtureId);
      const result = analysisEngine.analyze(dataset);
      await ctx.reply(formatAnalysisMessage(result), { parse_mode: "HTML" });
    } catch (error) {
      logger.error({ error, query }, "Failed to analyze fixture");
      await ctx.reply("Nie udalo sie pobrac danych dla tego meczu. Sprobuj ponownie lub uzyj /today.");
    }
  });
};
