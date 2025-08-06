# Fantasy Draft Assistant 🏈

An AI-powered fantasy football draft assistant that helps you make optimal draft decisions during your fantasy football draft.

## Features

- **OpenAI-Powered Chat Assistant**: Get real-time draft advice and strategy recommendations
- **Draft Configuration**: Set up your league settings, draft position, and roster requirements
- **Draft Tracking**: Record picks and track your team composition
- **Watch List Management**: Keep track of players you're targeting
- **Screenshot Analysis**: Upload draft board screenshots for AI analysis using GPT-4 Vision
- **Real-time Draft Updates**: Track current pick and draft status

## Prerequisites

- Node.js (v14 or higher)
- OpenAI API key

## Setup

1. **Clone and install dependencies**:
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   PORT=3001
   ```

3. **Start the application**:
   ```bash
   npm run dev
   ```

   This will start both the backend server (port 3001) and frontend client (port 3000).

4. **Open your browser** to `http://localhost:3000`

## Usage

### Initial Setup
1. Configure your draft settings:
   - Your draft position (1-16)
   - Total number of teams
   - Scoring system (Standard, PPR, Half PPR)
   - Roster requirements (QB, RB, WR, etc.)

### During the Draft
1. **Chat with AI**: Ask questions about draft strategy, player recommendations, bye weeks, etc.
2. **Record Picks**: Manually track who gets drafted by which team
3. **Manage Watch List**: Add/remove players you're targeting
4. **Upload Screenshots**: Take screenshots of your draft board and get AI analysis

### Chat Examples
- "Who should I draft next?"
- "What positions should I prioritize?"
- "Tell me about bye week conflicts on my team"
- "Who are the best sleepers available?"

## Project Structure

```
draft-aid/
├── server.js              # Express server
├── routes/
│   ├── openai.js         # OpenAI API routes
│   └── draft.js          # Draft state management
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   └── App.js       # Main app component
│   └── build/           # Production build
└── uploads/             # Screenshot uploads
```

## API Endpoints

- `POST /api/openai/chat` - Chat with AI assistant
- `POST /api/openai/analyze-screenshot` - Analyze draft board screenshots
- `GET /api/draft/state` - Get current draft state
- `POST /api/draft/configure` - Configure draft settings
- `POST /api/draft/player-drafted` - Record a drafted player
- `POST /api/draft/watchlist` - Manage watch list
- `POST /api/upload-screenshot` - Upload screenshot files

## Future Enhancements

- ESPN API integration for automatic draft tracking
- Player rankings and projections data
- Advanced analytics and team optimization
- Mobile app version
- League synchronization features

## Contributing

Feel free to submit issues and pull requests to improve the fantasy draft assistant!

## License

MIT License