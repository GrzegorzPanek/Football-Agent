import { config } from "../config";
import { BetRecommendation, MarketOutlook, MatchPrediction, OddsSnapshot, ValueSignal } from "../types";

const impliedProbability = (odd: number): number => (odd > 0 ? 1 / odd : 0);
const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
const poisson = (k: number, lambda: number): number => (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);

const calcBttsProbability = (homeXg: number, awayXg: number): number => {
  const homeZero = poisson(0, homeXg);
  const awayZero = poisson(0, awayXg);
  return 1 - homeZero - awayZero + homeZero * awayZero;
};

const calcOver25Probability = (homeXg: number, awayXg: number): number => {
  const totalLambda = homeXg + awayXg;
  const underOrEqualTwo = poisson(0, totalLambda) + poisson(1, totalLambda) + poisson(2, totalLambda);
  return 1 - underOrEqualTwo;
};

export const detectValueSignals = (
  prediction: MatchPrediction,
  odds?: OddsSnapshot
): ValueSignal[] => {
  if (!odds) return [];

  const candidates: ValueSignal[] = [
    {
      market: "HOME",
      modelProbability: prediction.homeWinProbability,
      impliedProbability: impliedProbability(odds.home),
      edge: prediction.homeWinProbability - impliedProbability(odds.home)
    },
    {
      market: "DRAW",
      modelProbability: prediction.drawProbability,
      impliedProbability: impliedProbability(odds.draw),
      edge: prediction.drawProbability - impliedProbability(odds.draw)
    },
    {
      market: "AWAY",
      modelProbability: prediction.awayWinProbability,
      impliedProbability: impliedProbability(odds.away),
      edge: prediction.awayWinProbability - impliedProbability(odds.away)
    }
  ];

  const bttsYesProbability = calcBttsProbability(
    prediction.expectedHomeGoals,
    prediction.expectedAwayGoals
  );
  const over25Probability = calcOver25Probability(
    prediction.expectedHomeGoals,
    prediction.expectedAwayGoals
  );

  if (odds.bttsYes) {
    candidates.push({
      market: "BTTS_YES",
      modelProbability: bttsYesProbability,
      impliedProbability: impliedProbability(odds.bttsYes),
      edge: bttsYesProbability - impliedProbability(odds.bttsYes)
    });
  }
  if (odds.bttsNo) {
    candidates.push({
      market: "BTTS_NO",
      modelProbability: 1 - bttsYesProbability,
      impliedProbability: impliedProbability(odds.bttsNo),
      edge: (1 - bttsYesProbability) - impliedProbability(odds.bttsNo)
    });
  }
  if (odds.over25) {
    candidates.push({
      market: "OVER_2_5",
      modelProbability: over25Probability,
      impliedProbability: impliedProbability(odds.over25),
      edge: over25Probability - impliedProbability(odds.over25)
    });
  }
  if (odds.under25) {
    candidates.push({
      market: "UNDER_2_5",
      modelProbability: 1 - over25Probability,
      impliedProbability: impliedProbability(odds.under25),
      edge: (1 - over25Probability) - impliedProbability(odds.under25)
    });
  }

  return candidates
    .filter((item) => item.edge > config.BOOKMAKER_MARGIN)
    .sort((a, b) => b.edge - a.edge);
};

export const pickBestBet = (valueSignals: ValueSignal[]): BetRecommendation | undefined => {
  const best = valueSignals[0];
  if (!best) return undefined;

  return {
    market: best.market,
    confidence: best.modelProbability,
    reason: `Najwyzsze value: edge ${(best.edge * 100).toFixed(1)}% vs implied probability rynku.`
  };
};

export const buildMarketOutlook = (prediction: MatchPrediction): MarketOutlook => {
  const bttsYes = calcBttsProbability(prediction.expectedHomeGoals, prediction.expectedAwayGoals);
  const over25 = calcOver25Probability(prediction.expectedHomeGoals, prediction.expectedAwayGoals);
  const totalLambda = prediction.expectedHomeGoals + prediction.expectedAwayGoals;
  const over15 = 1 - (poisson(0, totalLambda) + poisson(1, totalLambda));
  const over35 = 1 - (poisson(0, totalLambda) + poisson(1, totalLambda) + poisson(2, totalLambda) + poisson(3, totalLambda));

  return {
    homeWin: prediction.homeWinProbability,
    draw: prediction.drawProbability,
    awayWin: prediction.awayWinProbability,
    bttsYes,
    bttsNo: 1 - bttsYes,
    over15,
    over25,
    over35,
    under25: 1 - over25
  };
};

export const pickMostLikelyBet = (outlook: MarketOutlook): BetRecommendation => {
  const candidates = [
    { market: "HOME_WIN", confidence: outlook.homeWin },
    { market: "DRAW", confidence: outlook.draw },
    { market: "AWAY_WIN", confidence: outlook.awayWin },
    { market: "BTTS_YES", confidence: outlook.bttsYes },
    { market: "BTTS_NO", confidence: outlook.bttsNo },
    { market: "OVER_2_5", confidence: outlook.over25 },
    { market: "UNDER_2_5", confidence: outlook.under25 }
  ].sort((a, b) => b.confidence - a.confidence);

  const best = candidates[0];
  return {
    market: best.market,
    confidence: best.confidence,
    reason: "Najwyzsze prawdopodobienstwo scenariusza wg modelu."
  };
};
