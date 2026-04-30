import { describe, expect, it } from "vitest";
import { normalizeH2H, normalizeOdds, normalizeTeamForm } from "../src/data/normalizers";

describe("normalizers", () => {
  it("normalizes team form and computes averages", () => {
    const fixtures = [
      {
        teams: { home: { id: 1 }, away: { id: 2 } },
        goals: { home: 2, away: 1 }
      },
      {
        teams: { home: { id: 3 }, away: { id: 1 } },
        goals: { home: 0, away: 0 }
      }
    ];

    const form = normalizeTeamForm(1, fixtures);
    expect(form.lastFive).toEqual(["W", "D"]);
    expect(form.goalsForAvg).toBeCloseTo(1, 5);
    expect(form.goalsAgainstAvg).toBeCloseTo(0.5, 5);
  });

  it("extracts 1X2 odds", () => {
    const odds = normalizeOdds({
      bookmakers: [
        {
          bets: [
            {
              name: "Match Winner",
              values: [
                { value: "Home", odd: "2.0" },
                { value: "Draw", odd: "3.1" },
                { value: "Away", odd: "4.0" }
              ]
            }
          ]
        }
      ]
    });

    expect(odds).toEqual({ home: 2, draw: 3.1, away: 4 });
  });

  it("counts h2h results from home perspective", () => {
    const summary = normalizeH2H(
      [
        { teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: 2, away: 1 } },
        { teams: { home: { id: 2 }, away: { id: 1 } }, goals: { home: 0, away: 1 } },
        { teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: 1, away: 1 } }
      ],
      1,
      2
    );

    expect(summary).toEqual({ homeWins: 2, awayWins: 0, draws: 1 });
  });
});
