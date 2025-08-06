const axios = require('axios');
const WebSocket = require('ws');

class ESPNService {
  constructor() {
    this.baseURL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
    this.ws = null;
    this.draftEventCallback = null;
    this.playerDatabase = new Map(); // Cache for player information
  }

  setAuth(espnS2, swid) {
    if (espnS2 && swid) {
      this.headers.Cookie = `espn_s2=${espnS2}; SWID=${swid}`;
    }
  }

  async getLeagueInfo(leagueId, year = new Date().getFullYear()) {
    try {
      const url = `${this.baseURL}/seasons/${year}/segments/0/leagues/${leagueId}`;
      console.log(`Fetching league info from: ${url}`);
      
      const response = await axios.get(url, {
        headers: this.headers,
        params: {
          view: ['mSettings', 'mTeam', 'mRoster', 'mDraftDetail']
        }
      });

      console.log('ESPN League Response Status:', response.status);
      console.log('ESPN League Response Keys:', Object.keys(response.data || {}));
      
      if (!response.data) {
        throw new Error('No data received from ESPN API');
      }

      return response.data;
    } catch (error) {
      console.error('ESPN League Info Error:', error.message);
      if (error.response) {
        console.error('ESPN API Response Status:', error.response.status);
        console.error('ESPN API Response Data:', error.response.data);
        
        if (error.response.status === 401) {
          throw new Error('Authentication failed. Check your ESPN_S2 and SWID tokens.');
        } else if (error.response.status === 404) {
          throw new Error('League not found. Check your League ID and year.');
        }
      }
      throw new Error(`Failed to fetch league info: ${error.message}`);
    }
  }

  async testConnection(leagueId, year = new Date().getFullYear()) {
    try {
      console.log(`Testing ESPN connection for league ${leagueId} (${year})`);
      const url = `${this.baseURL}/seasons/${year}/segments/0/leagues/${leagueId}`;
      
      const response = await axios.get(url, {
        headers: this.headers,
        params: {
          view: 'mSettings'
        },
        timeout: 10000
      });

      // Check if we got HTML instead of JSON (ESPN redirect issue)
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        console.log('❌ ESPN returned HTML instead of JSON - likely authentication or league access issue');
        console.log('Response starts with:', response.data.substring(0, 200));
        return {
          success: false,
          error: 'ESPN returned HTML instead of JSON. Check: 1) League ID is correct, 2) League is not private (or provide auth tokens), 3) Year is correct.'
        };
      }

      console.log('ESPN Test Response type:', typeof response.data);
      console.log('ESPN Test Response keys:', Object.keys(response.data || {}));
      
      if (response.data && typeof response.data === 'object') {
        // ESPN API structure can vary, let's be more flexible
        if (response.data.settings) {
          console.log('✅ ESPN connection successful');
          return {
            success: true,
            leagueName: response.data.settings.name || 'Unknown League',
            size: response.data.settings.size || 'Unknown'
          };
        } else if (response.data.status && response.data.status.latestScoringPeriod) {
          // Alternative structure - league exists but no settings in this response
          console.log('✅ ESPN connection successful (alternative format)');
          return {
            success: true,
            leagueName: 'League Found',
            size: 'Unknown'
          };
        } else {
          console.log('ESPN Response structure:', JSON.stringify(response.data, null, 2));
          return {
            success: false,
            error: 'Unexpected response format from ESPN API'
          };
        }
      } else {
        return {
          success: false,
          error: 'Invalid response format from ESPN API'
        };
      }
    } catch (error) {
      console.log('❌ ESPN connection failed:', error.message);
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Headers:', error.response.headers);
      }
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async getDraftData(leagueId, year = new Date().getFullYear()) {
    try {
      const url = `${this.baseURL}/seasons/${year}/segments/0/leagues/${leagueId}`;
      console.log(`Fetching draft data from: ${url}`);
      
      const response = await axios.get(url, {
        headers: this.headers,
        params: {
          view: 'mDraftDetail'
        }
      });

      console.log('ESPN Draft Response Status:', response.status);
      console.log('ESPN Draft Response Keys:', Object.keys(response.data || {}));

      if (!response.data) {
        throw new Error('No data received from ESPN API');
      }

      const draftDetail = response.data.draftDetail;
      if (!draftDetail) {
        console.log('Available response keys:', Object.keys(response.data));
        // Draft might not have started yet - this is not necessarily an error
        console.log('No draft data found - draft may not have started yet');
        return {
          drafted: false,
          inProgress: false,
          picks: [],
          draftOrderMap: {},
          draftSettings: response.data.settings?.draftSettings || {}
        };
      }

      return {
        drafted: draftDetail.drafted || false,
        inProgress: draftDetail.inProgress || false,
        picks: draftDetail.picks || [],
        draftOrderMap: draftDetail.draftOrderMap || {},
        draftSettings: response.data.settings?.draftSettings || {}
      };
    } catch (error) {
      console.error('ESPN Draft Data Error:', error.message);
      if (error.response) {
        console.error('ESPN API Response Status:', error.response.status);
        console.error('ESPN API Response Data:', error.response.data);
      }
      throw new Error(`Failed to fetch draft data: ${error.message}`);
    }
  }

  async getTeams(leagueId, year = new Date().getFullYear()) {
    try {
      const url = `${this.baseURL}/seasons/${year}/segments/0/leagues/${leagueId}`;
      console.log(`Fetching teams from: ${url}`);
      
      const response = await axios.get(url, {
        headers: this.headers,
        params: {
          view: 'mTeam'
        }
      });

      console.log('ESPN Teams Response Status:', response.status);
      console.log('ESPN Teams Response Keys:', Object.keys(response.data || {}));
      
      if (!response.data) {
        throw new Error('No data received from ESPN API');
      }
      
      if (!response.data.teams) {
        console.log('Full ESPN Response:', JSON.stringify(response.data, null, 2));
        throw new Error('No teams data in ESPN response. This might be an invalid league ID or the league may not exist.');
      }

      if (!Array.isArray(response.data.teams)) {
        throw new Error(`Expected teams to be an array, got ${typeof response.data.teams}`);
      }

      return response.data.teams.map(team => ({
        id: team.id,
        name: (team.location || '') + ' ' + (team.nickname || 'Team'),
        abbreviation: team.abbrev || 'UNK',
        logo: team.logo || '',
        owners: team.owners || [],
        roster: team.roster?.entries || []
      }));
    } catch (error) {
      console.error('ESPN Teams Error:', error.message);
      if (error.response) {
        console.error('ESPN API Response Status:', error.response.status);
        console.error('ESPN API Response Data:', error.response.data);
      }
      throw new Error(`Failed to fetch teams: ${error.message}`);
    }
  }

  async getAvailablePlayers(leagueId, year = new Date().getFullYear(), limit = 500) {
    try {
      const url = `${this.baseURL}/seasons/${year}/players`;
      const response = await axios.get(url, {
        headers: {
          ...this.headers,
          'X-Fantasy-Filter': JSON.stringify({
            players: {
              limit: limit,
              sortPercOwned: {
                sortPriority: 1,
                sortAsc: false
              }
            }
          })
        },
        params: {
          view: 'players_wl',
          scoringPeriodId: 0
        }
      });

      return response.data.players.map(player => ({
        id: player.id,
        name: player.fullName,
        position: this.getPositionName(player.defaultPositionId),
        team: player.proTeamId ? this.getTeamAbbreviation(player.proTeamId) : 'FA',
        ownership: player.ownership?.percentOwned || 0,
        projectedPoints: player.player?.stats?.[0]?.appliedTotal || 0,
        eligible: player.status !== 'ONTEAM',
        injuryStatus: player.injuryStatus || 'ACTIVE'
      }));
    } catch (error) {
      console.error('ESPN Available Players Error:', error.message);
      throw new Error(`Failed to fetch available players: ${error.message}`);
    }
  }

  parseDraftedPlayers(draftData, teams) {
    if (!draftData.picks) return [];

    console.log('DRAFT DATA:', JSON.stringify(draftData, null, 2));

    return draftData.picks.map(pick => {
      const team = teams.find(t => t.id === pick.teamId);
      const player = pick.playerId ? {
        id: pick.playerId,
        name: pick.playerName || 'Unknown Player',
        position: this.getPositionName(pick.positionId),
        team: pick.proTeamId ? this.getTeamAbbreviation(pick.proTeamId) : 'FA'
      } : null;

      return {
        pickNumber: pick.id,
        round: pick.roundId,
        pickInRound: pick.roundPickNumber,
        teamId: pick.teamId,
        teamName: team ? team.name : 'Unknown Team',
        player: player,
        timestamp: new Date(pick.pickTime || Date.now())
      };
    }).filter(pick => pick.player); // Only include picks with valid players
  }

  getPositionName(positionId) {
    const positions = {
      1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST'
    };
    return positions[positionId] || 'UNKNOWN';
  }

  getTeamAbbreviation(teamId) {
    const teams = {
      1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN',
      8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR',
      15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ',
      21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA',
      27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU'
    };
    return teams[teamId] || 'FA';
  }

  async getPlayerInfo(playerId, year = new Date().getFullYear()) {
    if (this.playerDatabase.has(playerId)) {
      return this.playerDatabase.get(playerId);
    }

    try {
      const url = `${this.baseURL}/seasons/${year}/players/${playerId}`;
      const response = await axios.get(url, {
        headers: this.headers,
        params: {
          view: 'players_wl'
        }
      });

      if (response.data) {
        const player = response.data;
        const playerInfo = {
          id: player.id,
          name: player.fullName,
          position: this.getPositionName(player.defaultPositionId),
          team: player.proTeamId ? this.getTeamAbbreviation(player.proTeamId) : 'FA'
        };
        
        this.playerDatabase.set(playerId, playerInfo);
        return playerInfo;
      }
    } catch (error) {
      console.error(`Failed to fetch player ${playerId}:`, error.message);
    }

    return {
      id: playerId,
      name: 'Unknown Player',
      position: 'N/A',
      team: 'N/A'
    };
  }

  connectWebSocket(leagueId, espnS2, swid, userTeamId, callback) {
    console.log(`🔌 Attempting to connect to ESPN WebSocket for league ${leagueId}, team ${userTeamId}`);
    console.log('Auth tokens:', { espnS2: espnS2 ? 'SET' : 'NOT SET', swid: swid ? 'SET' : 'NOT SET' });
    
    if (this.ws) {
      console.log('Closing existing WebSocket connection');
      this.ws.close();
    }

    // Use the exact WebSocket URL format from your curl request with actual user team ID
    const guid = '{24740832-7346-415E-B564-7EAFDE7F11BD}';
    const nocache = Math.floor(Math.random() * 1000000);
    const wsUrls = [
      `wss://fantasydraft.espn.com/game-1/league-${leagueId}/JOIN?1=1&2=${leagueId}&3=${userTeamId}&4=${encodeURIComponent(guid)}&5=1:${leagueId}:${userTeamId}:${encodeURIComponent(guid)}:1198676478&6=false&7=false&8=KONA&nocache=${nocache}`
    ];

    this.draftEventCallback = callback;
    this.tryNextUrl(wsUrls, 0, espnS2, swid);
  }

  tryNextUrl(wsUrls, index, espnS2, swid) {
    if (index >= wsUrls.length) {
      console.error('💥 All WebSocket URL formats failed');
      return;
    }

    const wsUrl = wsUrls[index];
    console.log(`🌐 Trying WebSocket URL ${index + 1}/${wsUrls.length}:`, wsUrl);

    const headers = {
      'Origin': 'https://fantasy.espn.com',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Sec-WebSocket-Protocol': 'echo-protocol'
    };

    if (espnS2 && swid) {
      headers['Cookie'] = `espn_s2=${espnS2}; SWID=${swid}`;
      console.log('🔐 Using authentication cookies');
    }

    try {
      this.ws = new WebSocket(wsUrl, {
        headers: headers,
        timeout: 10000
      });

      let connectionTimeout = setTimeout(() => {
        console.log('⏰ WebSocket connection timeout, trying next URL...');
        if (this.ws) {
          this.ws.terminate();
        }
        this.tryNextUrl(wsUrls, index + 1, espnS2, swid);
      }, 5000);

      this.ws.on('open', () => {
        clearTimeout(connectionTimeout);
        console.log(`✅ ESPN WebSocket connected successfully with URL format ${index + 1}!`);
        
        // Send a test message to see if the connection is working
        console.log('📤 Sending test ping...');
      });

      this.ws.on('message', async (data) => {
        try {
          const message = data.toString().trim();
          console.log('📨 WebSocket message received:', message);
          
          // Parse ESPN's message format: "SELECTED teamId playerId pickNumber"
          if (message.startsWith('SELECTED ')) {
            const parts = message.split(' ');
            if (parts.length >= 4) {
              const teamId = parseInt(parts[1]);
              const playerId = parseInt(parts[2]);
              const pickNumber = parseInt(parts[3]);
              
              console.log(`🏈 Draft pick detected: Team ${teamId} selected player ${playerId} (pick #${pickNumber})`);
              
              // Fetch player information
              const playerInfo = await this.getPlayerInfo(playerId);
              console.log('👤 Player info retrieved:', playerInfo);
              
              const draftEvent = {
                type: 'draft_pick',
                pick: pickNumber,
                teamId: teamId,
                player: playerInfo,
                timestamp: new Date()
              };
              
              if (this.draftEventCallback) {
                console.log('🔄 Calling draft event callback');
                this.draftEventCallback(draftEvent);
              }
            }
          }
          // Log other message types for debugging
          else if (message.startsWith('SELECT ')) {
            console.log('🔍 SELECT message (outbound):', message);
          } else if (message.startsWith('AUTOSUGGEST ')) {
            console.log('💡 AUTOSUGGEST message:', message);
          } else if (message.startsWith('SELECTING ')) {
            console.log('⏳ SELECTING message:', message);
          } else if (message.startsWith('CLOCK ')) {
            console.log('⏰ CLOCK message:', message);
          } else {
            console.log('❓ Unknown message type:', message);
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      });

      this.ws.on('error', (error) => {
        clearTimeout(connectionTimeout);
        console.error(`💥 ESPN WebSocket error with URL ${index + 1}:`, error.message);
        
        // Try the next URL
        setTimeout(() => {
          this.tryNextUrl(wsUrls, index + 1, espnS2, swid);
        }, 1000);
      });

      this.ws.on('close', (code, reason) => {
        clearTimeout(connectionTimeout);
        console.log(`🔌 ESPN WebSocket connection closed. Code: ${code}, Reason: ${reason}`);
        
        if (code === 1006 || code === 1002) {
          console.log(`⚠️ WebSocket closed with error code ${code}, trying next URL...`);
          setTimeout(() => {
            this.tryNextUrl(wsUrls, index + 1, espnS2, swid);
          }, 1000);
        }
      });

    } catch (error) {
      console.error(`💥 Failed to create WebSocket connection with URL ${index + 1}:`, error);
      setTimeout(() => {
        this.tryNextUrl(wsUrls, index + 1, espnS2, swid);
      }, 1000);
    }
  }

  disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.draftEventCallback = null;
  }

  startPolling(leagueId, year, userTeamId, callback, intervalMs = 10000) {
    console.log(`🔄 Starting ESPN polling every ${intervalMs}ms for league ${leagueId}`);
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    let lastPickCount = 0;
    
    this.pollingInterval = setInterval(async () => {
      try {
        console.log('📡 Polling ESPN for draft updates...');
        const espnData = await this.syncDraftState(leagueId, year, userTeamId);
        
        // Check if new picks were made
        const currentPickCount = espnData.draftedPlayers.length;
        if (currentPickCount > lastPickCount) {
          console.log(`🏈 New picks detected: ${currentPickCount - lastPickCount} new picks`);
          
          // Get the new picks
          const newPicks = espnData.draftedPlayers.slice(lastPickCount);
          
          // Call callback for each new pick
          newPicks.forEach((pick, index) => {
            const draftEvent = {
              type: 'draft_pick',
              pick: pick.pickNumber,
              teamId: pick.teamId,
              player: pick.player,
              timestamp: pick.timestamp || new Date()
            };
            
            if (callback) {
              callback(draftEvent);
            }
          });
          
          lastPickCount = currentPickCount;
        } else {
          console.log(`📊 No new picks (${currentPickCount} total)`);
        }
      } catch (error) {
        console.error('❌ Polling error:', error.message);
      }
    }, intervalMs);
  }

  stopPolling() {
    if (this.pollingInterval) {
      console.log('🛑 Stopping ESPN polling');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async syncDraftState(leagueId, year, userTeamId) {
    try {
      console.log(`Syncing draft state for league ${leagueId} (${year}), user team: ${userTeamId}`);
      
      // Test connection first
      const connectionTest = await this.testConnection(leagueId, year);
      if (!connectionTest.success) {
        throw new Error(`Connection test failed: ${connectionTest.error}`);
      }

      console.log(`✅ Connected to league: ${connectionTest.leagueName} (${connectionTest.size} teams)`);

      // Fetch draft and team data
      let draftData, teams;
      try {
        [draftData, teams] = await Promise.all([
          this.getDraftData(leagueId, year),
          this.getTeams(leagueId, year)
        ]);
      } catch (error) {
        // If parallel requests fail, try sequential
        console.log('Parallel requests failed, trying sequential...');
        draftData = await this.getDraftData(leagueId, year);
        teams = await this.getTeams(leagueId, year);
      }

      console.log(`Fetched ${teams.length} teams and ${draftData.picks?.length || 0} draft picks`);

      const draftedPlayers = await this.parseDraftedPlayersWithPlayerInfo(draftData, teams, year);
      const userTeam = teams.find(t => t.id == userTeamId);
      const myDraftedPlayers = draftedPlayers.filter(pick => pick.teamId == userTeamId);

      return {
        draftStatus: {
          inProgress: draftData.inProgress,
          completed: draftData.drafted
        },
        draftedPlayers,
        myTeam: myDraftedPlayers.map(pick => pick.player),
        currentPick: draftedPlayers.length + 1,
        teams,
        userTeam,
        lastSync: new Date()
      };
    } catch (error) {
      console.error('ESPN Sync Error:', error.message);
      throw error;
    }
  }

  async parseDraftedPlayersWithPlayerInfo(draftData, teams, year) {
    if (!draftData.picks) return [];

    console.log('DRAFT DATA:', JSON.stringify(draftData, null, 2));

    const parsedPicks = [];
    
    for (const pick of draftData.picks) {
      const team = teams.find(t => t.id === pick.teamId);
      
      let player = null;
      if (pick.playerId && pick.playerId !== -1) {
        player = await this.getPlayerInfo(pick.playerId, year);
      }

      if (player) {
        parsedPicks.push({
          pickNumber: pick.id,
          round: pick.roundId,
          pickInRound: pick.roundPickNumber,
          teamId: pick.teamId,
          teamName: team ? team.name : 'Unknown Team',
          player: player,
          timestamp: new Date(pick.pickTime || Date.now())
        });
      }
    }
    
    return parsedPicks;
  }
}

module.exports = ESPNService;
