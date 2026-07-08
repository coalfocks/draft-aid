# Fantasy Draft Assistant

Chrome extension for live ESPN fantasy football draft help. It watches the ESPN draft page, tracks recent picks and your roster, lets you add keepers/watch-list players, and gives AI draft advice using the latest context you load into the popup.

## What It Does

- Extracts live picks from ESPN fantasy draft pages
- Tracks your roster, keepers, watch list, current pick, and picks until your next turn
- Supports uploaded ranking screenshots and CSV rankings
- Uses OpenAI/Gemini/Groq API keys saved locally in Chrome extension storage
- Includes debug tools for ESPN DOM inspection when the draft page changes

## Install For Draft Night

1. Install dependencies for local validation:
   ```bash
   npm install
   ```

2. Load the extension in Chrome:
   - Go to `chrome://extensions`
   - Enable Developer mode
   - Click Load unpacked
   - Select the `extension/` folder in this repo

3. Open your ESPN draft room:
   ```text
   https://fantasy.espn.com/football/
   ```

4. Open the extension popup and configure:
   - API key for the model you want to use
   - Your team name
   - Draft position
   - Keeper players, if any
   - Optional CSV rankings or screenshots

## Draft-Night Checklist

- Open ESPN draft room at least 15 minutes early
- Click Refresh in the popup and confirm picks/teams are detected
- If detection looks wrong, go to Settings and click Debug DOM, then Force Extract
- Upload your ranking CSV before the draft starts
- Keep the popup open on the AI Chat tab only when asking questions; ESPN extraction continues from the content script

## Local Development

```bash
npm run validate
npm test
npm run dev
```

`npm run dev` starts the optional Express helper API on `PORT` from `.env` or `3031`. The main experience is the Chrome extension; there is no React client in this repo.

## Project Structure

```text
draft-aid/
├── extension/
│   ├── manifest.json
│   ├── content.js
│   ├── background.js
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── routes/
├── services/
├── tests/
├── server.js
└── package.json
```

## Notes

- Private ESPN leagues still require you to be logged into ESPN in Chrome.
- ESPN changes its DOM often. The extractor intentionally uses multiple selectors and the Debug DOM tools are there for draft-day repair.
- Uploaded API keys stay in local Chrome extension storage.
