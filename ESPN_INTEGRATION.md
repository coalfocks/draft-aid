# ESPN Fantasy Football Integration Guide

This guide explains how to connect your ESPN fantasy football league to the Draft Assistant for real-time draft tracking and player data.

## Overview

The ESPN integration provides:
- **Real-time draft tracking** - Automatically sync drafted players during live drafts
- **Team roster data** - View your current team and all league teams
- **Draft status monitoring** - Track draft progress and current pick
- **Player availability** - See which players are still available
- **Mock draft support** - Works with ESPN mock drafts

## Getting Started

### Step 1: Find Your League Information

You'll need these pieces of information from your ESPN league:

1. **League ID** - Found in your ESPN league URL
   ```
   https://fantasy.espn.com/football/league?leagueId=123456789
                                                   ^^^^^^^^^
                                                  This is your League ID
   ```

2. **Year** - The fantasy season year (e.g., 2024)

3. **Your Team ID** - Found in team settings or roster page URL

### Step 2: Get Authentication Tokens (For Private Leagues)

**Important**: Public leagues don't require authentication tokens. Only private leagues need these.

#### Method 1: Browser Developer Tools (Recommended)

1. **Log into ESPN Fantasy** in your web browser
2. **Navigate to your league** page
3. **Open Developer Tools** (F12 or Right-click → Inspect)
4. **Go to the Application/Storage tab**
5. **Find Cookies** for `fantasy.espn.com`
6. **Copy these two values:**
   - `espn_s2` - Long string starting with "AEB..."
   - `SWID` - String in format like "{12345678-1234-1234-1234-123456789012}"

#### Method 2: Network Tab

1. **Open Developer Tools** → **Network tab**
2. **Refresh your ESPN league page**
3. **Find any ESPN API request** (usually to `fantasy.espn.com/apis/v3/games/ffl/`)
4. **Check the Request Headers** for Cookie values
5. **Copy the `espn_s2` and `SWID` values**

### Step 3: Configure in Draft Assistant

1. **Start a new draft** in the Draft Assistant
2. **Enable ESPN Integration** in the draft configuration
3. **Enter your credentials:**
   - League ID
   - Year (current season)
   - Your Team ID
   - ESPN_S2 token (private leagues only)
   - SWID token (private leagues only)

## Features & Capabilities

### Real-Time Draft Tracking

**What it does:**
- Automatically pulls the latest draft picks from ESPN
- Updates your team roster as you draft
- Shows recently drafted players
- Tracks current pick number

**How to use:**
- Enable "Auto-sync" for live drafts (syncs every 30 seconds)
- Manual sync button for on-demand updates
- Status indicators show draft progress (PENDING/LIVE/COMPLETED)

### Mock Draft Support

**Yes, it works with ESPN mock drafts!**

ESPN mock drafts use the same API as real drafts, so the integration works seamlessly:
- Join an ESPN mock draft
- Use the mock draft's League ID
- All features work the same as real drafts
- Perfect for practicing your draft strategy

### Data Available

The integration provides:

**Draft Information:**
- All drafted players with pick numbers
- Round and pick-in-round details
- Team assignments for each pick
- Draft timing and current status

**Team Data:**
- Your current roster
- All league team rosters
- Team names and abbreviations
- Player positions and pro teams

**Player Pool:**
- Available players (not yet drafted)
- Player ownership percentages
- Projected fantasy points
- Injury status indicators

## Troubleshooting

### Common Issues

**"ESPN integration not configured"**
- Make sure you've enabled ESPN integration in draft settings
- Verify you've entered a valid League ID

**"Failed to fetch league info: 401"**
- Your ESPN_S2/SWID tokens may be expired or incorrect
- Try getting fresh tokens from your browser
- Check if your league is private (requires authentication)

**"No draft data found for this league"**
- League may not have started drafting yet
- Verify the League ID is correct
- Some leagues may not have draft data available pre-draft

**"Failed to sync with ESPN"**
- Check your internet connection
- ESPN's API may be temporarily down
- Try syncing again in a few minutes

### Token Expiration

ESPN authentication tokens expire periodically (usually after a few weeks):
- You'll see 401 errors when tokens expire
- Simply get fresh tokens using the steps above
- Update your draft configuration with new tokens

### Rate Limiting

ESPN's API has rate limits:
- Auto-sync is limited to every 30 seconds
- Manual syncing has no enforced limits
- If you get rate limited, wait a few minutes before retrying

## Privacy & Security

**Your data safety:**
- Tokens are only stored temporarily during your draft session
- No ESPN credentials are permanently saved
- All API calls go directly from your browser to ESPN
- The Draft Assistant doesn't store your ESPN data

**What ESPN can see:**
- Standard API requests for public league data
- Same requests your browser makes when using ESPN's website
- No additional tracking or data collection

## API Endpoints Used

The integration uses these ESPN Fantasy API endpoints:

```
GET /apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{leagueId}
- Parameters: view=mSettings,mTeam,mRoster,mDraftDetail
- Purpose: Get league info, teams, and draft data

GET /apis/v3/games/ffl/seasons/{year}/players
- Parameters: view=players_wl, limit=500
- Purpose: Get available player pool
```

## Advanced Configuration

### Custom Sync Intervals

You can modify the auto-sync interval by editing `ESPNStatus.js`:

```javascript
// Change from 30 seconds to your preferred interval
interval = setInterval(() => {
  syncESPNData();
}, 30000); // Change this value (in milliseconds)
```

### Additional Data Fields

The ESPN service can fetch additional data. Modify `espnService.js` to add:
- Player injury details
- Advanced stats
- Waiver wire information
- League settings and scoring

## Support

If you encounter issues:

1. Check the browser console for error messages
2. Verify your League ID and tokens are correct
3. Try with a public league first to test basic functionality
4. For private leagues, ensure your tokens haven't expired

The ESPN integration is designed to enhance your draft experience with real-time data while maintaining the flexibility to use the Draft Assistant's AI-powered recommendations.