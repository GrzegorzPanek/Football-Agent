import { MatchDataset, MatchPrediction } from "../types";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const formPoints = (lastFive: Array<"W" | "D" | "L">): number =>
  lastFive.reduce((acc, item) => {
    if (item === "W") return acc + 3;
    if (item === "D") return acc + 1;
    return acc;
  }, 0);

export const buildPrediction = (dataset: MatchDataset): MatchPrediction => {
  const homeStrength = formPoints(dataset.homeForm.lastFive) / 15 + dataset.homeForm.goalsForAvg * 0.2;
  const awayStrength = formPoints(dataset.awayForm.lastFive) / 15 + dataset.awayForm.goalsForAvg * 0.2;
  const motivationBoost = (dataset.homeContext.motivationIndex - dataset.awayContext.motivationIndex) * 0.25;
  const fatiguePenaltyHome = dataset.homeContext.fatigueIndex * 0.2;
  const fatiguePenaltyAway = dataset.awayContext.fatigueIndex * 0.2;
  const absencePenaltyHome = Math.min(dataset.homeContext.absencesCount, 6) * 0.03;
  const absencePenaltyAway = Math.min(dataset.awayContext.absencesCount, 6) * 0.03;

  const homeDef = dataset.homeForm.goalsAgainstAvg;
  const awayDef = dataset.awayForm.goalsAgainstAvg;

  const expectedHomeGoals = clamp(
    1.2 + homeStrength * 0.7 - awayDef * 0.25 + motivationBoost - fatiguePenaltyHome - absencePenaltyHome,
    0.2,
    3.5
  );
  const expectedAwayGoals = clamp(
    1.0 + awayStrength * 0.55 - homeDef * 0.25 - motivationBoost - fatiguePenaltyAway - absencePenaltyAway,
    0.2,
    3.2
  );

  const diff = expectedHomeGoals - expectedAwayGoals;
  const drawProbability = clamp(0.22 - Math.abs(diff) * 0.06, 0.12, 0.3);

  const homeShare = 1 / (1 + Math.exp(-diff));
  const homeWinProbability = clamp(homeShare * (1 - drawProbability), 0.1, 0.8);
  const awayWinProbability = clamp((1 - drawProbability) - homeWinProbability, 0.1, 0.8);

  const sum = homeWinProbability + drawProbability + awayWinProbability;

  return {
    homeWinProbability: homeWinProbability / sum,
    drawProbability: drawProbability / sum,
    awayWinProbability: awayWinProbability / sum,
    expectedHomeGoals,
    expectedAwayGoals
  };
};
