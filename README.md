# Sports Agent (Telegram)

Agent do analizy meczow pilkarskich na Telegramie. Dla fixture ID zwraca:
- predykcje 1X2 i expected goals,
- statystyki formy i H2H,
- sygnaly value na rynku 1X2.

## Start

1. Skopiuj `.env.example` do `.env` i uzupelnij sekrety.
2. Zainstaluj zaleznosci:
   - `npm install`
3. Uruchom bota:
   - dev: `npm run dev`
   - prod: `npm run build && npm run start`

## Telegram komendy

- `/start`
- `/help`
- `/analyze <fixtureId>`

## Testy

- `npm test`
