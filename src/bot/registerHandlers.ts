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

const datePlusDays = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const buildDayPickerKeyboard = (): any => {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  rows.push([{ text: "Dzisiaj (lista meczow)", callback_data: `daypick:${datePlusDays(0)}` }]);
  for (let i = 1; i <= 10; i += 1) {
    rows.push([{ text: datePlusDays(i), callback_data: `daypick:${datePlusDays(i)}` }]);
  }
  return { inline_keyboard: rows };
};

const groupByLeague = (matches: Array<{ homeTeam: string; awayTeam: string; fixtureId: number; league: string }>) => {
  const grouped = new Map<string, Array<{ homeTeam: string; awayTeam: string; fixtureId: number; league: string }>>();
  for (const item of matches) {
    const list = grouped.get(item.league) ?? [];
    list.push(item);
    grouped.set(item.league, list);
  }
  return Array.from(grouped.entries()).map(([league, leagueMatches]) => ({ league, leagueMatches }));
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
  const buildBackToDayMenuKeyboard = (dateInput: string): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } => ({
    inline_keyboard: [
      [{ text: "⬅️ Wroc do menu dnia", callback_data: `daypick:${dateInput}` }],
      [{ text: "⬅️ Menu glowne", callback_data: "startmenu" }]
    ]
  });

  const buildBackToMainMenuKeyboard = (): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } => ({
    inline_keyboard: [[{ text: "⬅️ Wroc do menu glownego", callback_data: "startmenu" }]]
  });

  const sendHtmlInChunks = async (ctx: any, text: string, maxLength = 3800): Promise<void> => {
    if (text.length <= maxLength) {
      await ctx.reply(text, { parse_mode: "HTML" });
      return;
    }

    const sections = text.split("\n\n");
    const chunks: string[] = [];
    let current = "";

    for (const section of sections) {
      const candidate = current ? `${current}\n\n${section}` : section;
      if (candidate.length <= maxLength) {
        current = candidate;
        continue;
      }

      if (current) chunks.push(current);

      if (section.length <= maxLength) {
        current = section;
        continue;
      }

      // Fallback for exceptionally long section: split by lines.
      const lines = section.split("\n");
      let lineChunk = "";
      for (const line of lines) {
        const lineCandidate = lineChunk ? `${lineChunk}\n${line}` : line;
        if (lineCandidate.length <= maxLength) {
          lineChunk = lineCandidate;
        } else {
          if (lineChunk) chunks.push(lineChunk);
          lineChunk = line;
        }
      }
      current = lineChunk;
    }

    if (current) chunks.push(current);

    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: "HTML" });
    }
  };

  const sendDateMatchesMenu = async (ctx: any, dateInput: string): Promise<void> => {
    const matches = await matchRepository.loadMatchesByDate(dateInput);
    if (matches.length === 0) {
      await ctx.reply(`Brak meczow na ${dateInput} w top europejskich ligach.`);
      return;
    }

    const groupedLeagues = groupByLeague(matches);
    const buttons: Array<Array<{ text: string; callback_data: string }>> = [
      [{ text: `Analizuj wszystkie (${dateInput})`, callback_data: `dayall:${dateInput}` }]
    ];
    buttons.push([{ text: "📚 LIGI", callback_data: "noop" }]);
    groupedLeagues.forEach((entry, idx) => {
      const label = `${entry.league} (${entry.leagueMatches.length})`.slice(0, 58);
      buttons.push([{ text: label, callback_data: `leaguepick:${dateInput}:${idx}` }]);
    });

    buttons.push([{ text: "⚽ MECZE", callback_data: "noop" }]);
    for (const item of matches.slice(0, 60)) {
      const label = `${item.homeTeam} vs ${item.awayTeam}`.slice(0, 58);
      buttons.push([{ text: label, callback_data: `fixture:${item.fixtureId}:${dateInput}` }]);
    }
    buttons.push([{ text: "⬅️ Menu glowne", callback_data: "startmenu" }]);

    await ctx.reply("Wybierz mecz do analizy lub analizuj wszystkie:", {
      reply_markup: { inline_keyboard: buttons }
    });
  };

  const runFullDateAnalysis = async (ctx: any, selectedDate: string): Promise<void> => {
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
        await sendHtmlInChunks(ctx, formatAnalysisMessage(result));
        sentCount += 1;
      } catch (error) {
        logger.warn({ error, fixtureId: item.fixtureId }, "Failed single match in date analysis");
      }
    }
    if (sentCount === 0) {
      await ctx.reply("Nie udalo sie przygotowac analiz dla tej daty.");
      return;
    }
    await ctx.reply(`Zakonczono analize ${sentCount} meczow na ${selectedDate}.`, {
      reply_markup: buildBackToDayMenuKeyboard(selectedDate)
    });
  };

  const runLeagueDateAnalysis = async (ctx: any, selectedDate: string, leagueName: string): Promise<void> => {
    await ctx.reply(`Analizuje lige "${leagueName}" na ${selectedDate}, chwila...`);
    const matches = await matchRepository.loadMatchesByDate(selectedDate);
    const leagueMatches = matches.filter((item) => item.league === leagueName);
    if (leagueMatches.length === 0) {
      await ctx.reply(`Brak meczow ligi "${leagueName}" na ${selectedDate}.`);
      return;
    }

    let sentCount = 0;
    for (const item of leagueMatches) {
      try {
        const dataset = await matchRepository.loadDataset(item.fixtureId);
        const result = analysisEngine.analyze(dataset);
        await sendHtmlInChunks(ctx, formatAnalysisMessage(result));
        sentCount += 1;
      } catch (error) {
        logger.warn({ error, fixtureId: item.fixtureId }, "Failed single match in league-date analysis");
      }
    }
    await ctx.reply(`Zakonczono analize ${sentCount} meczow ligi "${leagueName}" na ${selectedDate}.`, {
      reply_markup: buildBackToDayMenuKeyboard(selectedDate)
    });
  };

  const startKeyboard = {
    inline_keyboard: [
      [
        { text: "Dzisiaj", callback_data: "start:today" },
        { text: "Jutro", callback_data: "start:tomorrow" }
      ],
      [{ text: "Wybierz dzien", callback_data: "start:daypicker" }],
      [
        { text: "Analizuj dzisiaj", callback_data: "start:analyze:today" },
        { text: "Analizuj jutro", callback_data: "start:analyze:tomorrow" }
      ],
      [{ text: "Pomoc (/help)", callback_data: "start:help" }]
    ]
  } as const;

  bot.start((ctx: any) => {
    const startMessage = "Menu glowne:";
    return ctx.reply(startMessage, { reply_markup: startKeyboard });
  });

  bot.help((ctx: any) => ctx.reply(usage));

  bot.command("today", async (ctx: any) => {
    try {
      await sendDateMatchesMenu(ctx, datePlusDays(0));
    } catch (error) {
      logger.error({ error }, "Failed to load today matches");
      await ctx.reply("Nie udalo sie pobrac listy meczow na dzis.");
    }
  });

  bot.command("tomorrow", async (ctx: any) => {
    try {
      await sendDateMatchesMenu(ctx, datePlusDays(1));
    } catch (error) {
      logger.error({ error }, "Failed to load tomorrow matches");
      await ctx.reply("Nie udalo sie pobrac listy meczow na jutro.");
    }
  });

  bot.command("day", async (ctx: any) => {
    const messageText = "text" in ctx.message ? ctx.message.text : "";
    const dateInput = messageText.replace(/^\/day(@\w+)?\s*/i, "").trim();
    if (!dateInput) {
      const dayPicker = buildDayPickerKeyboard();
      dayPicker.inline_keyboard.push([{ text: "⬅️ Menu glowne", callback_data: "startmenu" }]);
      await ctx.reply("Wybierz dzien:", { reply_markup: dayPicker });
      return;
    }
    if (!datePattern.test(dateInput)) {
      await ctx.reply("Uzyj formatu: /day YYYY-MM-DD lub samo /day");
      return;
    }
    try {
      await sendDateMatchesMenu(ctx, dateInput);
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
      const matchedLeague = groupByLeague(matches).find((entry) =>
        entry.league.toLowerCase().includes(leagueInput.toLowerCase())
      );
      if (!matchedLeague) {
        await ctx.reply(`Brak meczow ligi "${leagueInput}" na ${dateInput}.`);
        return;
      }
      await runLeagueDateAnalysis(ctx, dateInput, matchedLeague.league);
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
        await runFullDateAnalysis(ctx, selectedDate);
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
      await sendHtmlInChunks(ctx, formatAnalysisMessage(result));
      await ctx.reply("Wrocic do menu?", { reply_markup: buildBackToMainMenuKeyboard() });
    } catch (error) {
      logger.error({ error, query }, "Failed to analyze fixture");
      await ctx.reply("Nie udalo sie pobrac danych dla tego meczu. Sprobuj ponownie lub uzyj /today.");
    }
  });

  bot.action(/^daypick:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    const dateInput = ctx.match?.[1];
    await ctx.answerCbQuery();
    try {
      await sendDateMatchesMenu(ctx, dateInput);
    } catch (error) {
      logger.error({ error, dateInput }, "Failed daypick callback");
      await ctx.reply("Nie udalo sie pobrac meczow dla wybranego dnia.");
    }
  });

  bot.action(/^leaguepick:(\d{4}-\d{2}-\d{2}):(\d+)$/, async (ctx: any) => {
    const dateInput = ctx.match?.[1];
    const leagueIndex = Number(ctx.match?.[2] ?? -1);
    await ctx.answerCbQuery();
    try {
      const matches = await matchRepository.loadMatchesByDate(dateInput);
      const grouped = groupByLeague(matches);
      const selected = grouped[leagueIndex];
      if (!selected) {
        await ctx.reply("Nie znaleziono ligi dla tego wyboru.");
        return;
      }

      const buttons: Array<Array<{ text: string; callback_data: string }>> = [
        [{ text: `Analizuj cala lige (${selected.league})`, callback_data: `leagueall:${dateInput}:${leagueIndex}` }],
        [{ text: "Wroc do listy dni", callback_data: "daymenu" }],
        [{ text: "⬅️ Menu glowne", callback_data: "startmenu" }]
      ];
      for (const item of selected.leagueMatches) {
        const label = `${item.homeTeam} vs ${item.awayTeam}`.slice(0, 58);
        buttons.push([{ text: label, callback_data: `fixture:${item.fixtureId}:${dateInput}` }]);
      }
      await ctx.reply("Wybierz mecz z ligi lub analizuj cala lige:", {
        reply_markup: { inline_keyboard: buttons }
      });
    } catch (error) {
      logger.error({ error, dateInput, leagueIndex }, "Failed leaguepick callback");
      await ctx.reply("Nie udalo sie pobrac listy meczow tej ligi.");
    }
  });

  bot.action(/^leagueall:(\d{4}-\d{2}-\d{2}):(\d+)$/, async (ctx: any) => {
    const dateInput = ctx.match?.[1];
    const leagueIndex = Number(ctx.match?.[2] ?? -1);
    await ctx.answerCbQuery();
    try {
      const matches = await matchRepository.loadMatchesByDate(dateInput);
      const grouped = groupByLeague(matches);
      const selected = grouped[leagueIndex];
      if (!selected) {
        await ctx.reply("Nie znaleziono ligi dla tego wyboru.");
        return;
      }
      await runLeagueDateAnalysis(ctx, dateInput, selected.league);
    } catch (error) {
      logger.error({ error, dateInput, leagueIndex }, "Failed leagueall callback");
      await ctx.reply("Nie udalo sie uruchomic analizy wybranej ligi.");
    }
  });

  bot.action(/^dayall:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    const dateInput = ctx.match?.[1];
    await ctx.answerCbQuery();
    try {
      await runFullDateAnalysis(ctx, dateInput);
    } catch (error) {
      logger.error({ error, dateInput }, "Failed dayall callback");
      await ctx.reply("Nie udalo sie uruchomic analizy dla wybranego dnia.");
    }
  });

  bot.action(/^fixture:(\d+)(?::(\d{4}-\d{2}-\d{2}))?$/, async (ctx: any) => {
    const fixtureId = Number(ctx.match?.[1]);
    const selectedDate = ctx.match?.[2];
    await ctx.answerCbQuery();
    try {
      await ctx.reply("Analizuje wybrany mecz, chwila...");
      const dataset = await matchRepository.loadDataset(fixtureId);
      const result = analysisEngine.analyze(dataset);
      await sendHtmlInChunks(ctx, formatAnalysisMessage(result));
      await ctx.reply("Wrocic do menu?", {
        reply_markup: selectedDate ? buildBackToDayMenuKeyboard(selectedDate) : buildBackToMainMenuKeyboard()
      });
    } catch (error) {
      logger.error({ error, fixtureId }, "Failed fixture callback");
      await ctx.reply("Nie udalo sie pobrac analizy dla wybranego meczu.");
    }
  });

  bot.action("daymenu", async (ctx: any) => {
    await ctx.answerCbQuery();
    const dayPicker = buildDayPickerKeyboard();
    dayPicker.inline_keyboard.push([{ text: "⬅️ Menu glowne", callback_data: "startmenu" }]);
    await ctx.reply("Wybierz dzien:", { reply_markup: dayPicker });
  });

  bot.action("noop", async (ctx: any) => {
    await ctx.answerCbQuery();
  });

  bot.action("start:today", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendDateMatchesMenu(ctx, datePlusDays(0));
  });

  bot.action("start:tomorrow", async (ctx: any) => {
    await ctx.answerCbQuery();
    await sendDateMatchesMenu(ctx, datePlusDays(1));
  });

  bot.action("start:daypicker", async (ctx: any) => {
    await ctx.answerCbQuery();
    const dayPicker = buildDayPickerKeyboard();
    dayPicker.inline_keyboard.push([{ text: "⬅️ Menu glowne", callback_data: "startmenu" }]);
    await ctx.reply("Wybierz dzien:", { reply_markup: dayPicker });
  });

  bot.action("start:analyze:today", async (ctx: any) => {
    await ctx.answerCbQuery();
    await runFullDateAnalysis(ctx, datePlusDays(0));
  });

  bot.action("start:analyze:tomorrow", async (ctx: any) => {
    await ctx.answerCbQuery();
    await runFullDateAnalysis(ctx, datePlusDays(1));
  });

  bot.action("start:help", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply(usage);
  });

  bot.action("startmenu", async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply("Menu glowne:", { reply_markup: startKeyboard });
  });
};
