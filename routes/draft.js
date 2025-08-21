const express = require('express');
const router = express.Router();
const ESPNService = require('../services/espnService');

let draftState = {
  leagueSettings: null,
  draftedPlayers: [],
  myTeam: [],
  watchList: [],
  currentPick: 1,
  myDraftPosition: null,
  totalTeams: 12,
  tierData: {},
  espnConfig: null,
  espnData: null,
  lastESPNSync: null,
  keepers: []
};

const espnService = new ESPNService();

router.get('/state', (req, res) => {
  res.json(draftState);
});

router.post('/configure', (req, res) => {
  const { 
    leagueSettings, 
    myDraftPosition, 
    totalTeams,
    scoringSystem,
    espnConfig,
    keepers
  } = req.body;
  
  draftState.leagueSettings = leagueSettings;
  draftState.myDraftPosition = myDraftPosition;
  draftState.totalTeams = totalTeams;
  draftState.scoringSystem = scoringSystem;
  draftState.espnConfig = espnConfig;
  draftState.keepers = keepers || [];

  if (espnConfig && espnConfig.enabled) {
    if (espnConfig.espnS2 && espnConfig.swid) {
      espnService.setAuth(espnConfig.espnS2, espnConfig.swid);
    }
  }
  
  res.json({ message: 'Draft configuration saved', draftState });
});

router.post('/player-drafted', (req, res) => {
  const { player, team, pick } = req.body;
  
  draftState.draftedPlayers.push({
    player,
    team,
    pick,
    timestamp: new Date()
  });
  
  draftState.currentPick = pick + 1;
  
  if (team === 'me') {
    draftState.myTeam.push(player);
  }
  
  res.json({ message: 'Player draft recorded', draftState });
});

router.post('/watchlist', (req, res) => {
  const { player, action } = req.body;
  
  if (action === 'add') {
    if (!draftState.watchList.find(p => p.name === player.name)) {
      draftState.watchList.push(player);
    }
  } else if (action === 'remove') {
    draftState.watchList = draftState.watchList.filter(p => p.name !== player.name);
  }
  
  res.json({ message: `Player ${action}ed to watchlist`, watchList: draftState.watchList });
});

router.post('/tier-data', (req, res) => {
  const { position, tierData } = req.body;
  
  draftState.tierData[position] = {
    ...tierData,
    uploadedAt: new Date()
  };
  
  res.json({ message: 'Tier data saved', tierData: draftState.tierData });
});

router.post('/update-keepers', (req, res) => {
  const { keepers } = req.body;
  
  if (!Array.isArray(keepers)) {
    return res.status(400).json({ error: 'Keepers must be an array' });
  }
  
  draftState.keepers = keepers;
  
  res.json({ 
    message: 'Keepers updated successfully', 
    keepers: draftState.keepers 
  });
});

router.post('/espn-sync', async (req, res) => {
  try {
    if (!draftState.espnConfig || !draftState.espnConfig.enabled) {
      return res.status(400).json({ error: 'ESPN integration not configured' });
    }

    const { leagueId, year, userTeamId, espnS2, swid } = draftState.espnConfig;
    
    if (!leagueId) {
      return res.status(400).json({ error: 'ESPN league ID not provided' });
    }

    // Set auth tokens before making requests
    if (espnS2 && swid) {
      console.log('Setting ESPN auth tokens for private league');
      espnService.setAuth(espnS2, swid);
    } else {
      console.log('No auth tokens provided - assuming public league');
    }

    const espnData = await espnService.syncDraftState(
      leagueId, 
      year || new Date().getFullYear(),
      userTeamId
    );

    draftState.espnData = espnData;
    draftState.lastESPNSync = new Date();
    
    if (espnData.draftedPlayers.length > 0) {
      draftState.draftedPlayers = espnData.draftedPlayers;
      draftState.myTeam = espnData.myTeam;
      draftState.currentPick = espnData.currentPick;
    }

    // Debug draft status
    console.log('📊 Draft Status Check:', {
      inProgress: espnData.draftStatus.inProgress,
      completed: espnData.draftStatus.completed,
      drafted: espnData.drafted,
      draftedPlayers: espnData.draftedPlayers?.length || 0
    });

    // Use WebSocket for real-time updates (polling won't work since REST API doesn't update)
    console.log('🔌 Starting ESPN WebSocket for real-time draft updates...');
    espnService.connectWebSocket(leagueId, espnS2, swid, userTeamId, (draftEvent) => {
      console.log('📡 WebSocket draft pick received:', draftEvent);
      
      // Find team name
      const team = espnData.teams?.find(t => t.id === draftEvent.teamId);
      const teamName = team ? team.name : `Team ${draftEvent.teamId}`;
      
      // Update draft state with new pick
      const newPick = {
        player: draftEvent.player,
        team: draftEvent.teamId === userTeamId ? 'me' : teamName,
        pick: draftEvent.pick,
        timestamp: draftEvent.timestamp
      };
      
      draftState.draftedPlayers.push(newPick);
      draftState.currentPick = Math.max(draftState.currentPick, draftEvent.pick + 1);
      
      if (draftEvent.teamId == userTeamId) {
        draftState.myTeam.push(draftEvent.player);
      }
      
      // Update ESPN data with formatted pick
      if (!draftState.espnData) draftState.espnData = {};
      if (!draftState.espnData.draftedPlayers) draftState.espnData.draftedPlayers = [];
      
      draftState.espnData.draftedPlayers.push({
        pickNumber: draftEvent.pick,
        teamId: draftEvent.teamId,
        teamName: teamName,
        player: draftEvent.player,
        timestamp: draftEvent.timestamp
      });
      
      draftState.lastESPNSync = new Date();
      
      console.log(`📊 Updated draft state: ${draftState.draftedPlayers.length} total picks, current pick: ${draftState.currentPick}`);
    });

    // Prepare response data with recent picks for the frontend
    const recentPicks = espnData.draftedPlayers.slice(-10).map(pick => ({
      pick: pick.pickNumber,
      player: pick.player,
      team: pick.teamName,
      timestamp: pick.timestamp
    }));

    res.json({ 
      message: 'ESPN data synced successfully',
      espnData: {
        ...espnData,
        recentPicks: recentPicks
      },
      lastSync: draftState.lastESPNSync
    });
  } catch (error) {
    console.error('ESPN sync error:', error);
    res.status(500).json({ 
      error: 'Failed to sync with ESPN',
      details: error.message 
    });
  }
});

router.get('/espn-status', (req, res) => {
  const isConfigured = draftState.espnConfig && draftState.espnConfig.enabled;
  const lastSync = draftState.lastESPNSync;
  const hasDraftData = draftState.espnData && draftState.espnData.draftedPlayers;

  res.json({
    configured: isConfigured,
    lastSync,
    hasDraftData: !!hasDraftData,
    draftInProgress: draftState.espnData?.draftStatus?.inProgress || false,
    draftCompleted: draftState.espnData?.draftStatus?.completed || false,
    webSocketConnected: espnService.ws && espnService.ws.readyState === 1,
    leagueId: draftState.espnConfig?.leagueId,
    totalPicks: draftState.draftedPlayers?.length || 0
  });
});

router.post('/espn-stop', (req, res) => {
  console.log('🛑 Stopping ESPN polling and WebSocket connections');
  espnService.stopPolling();
  espnService.disconnectWebSocket();
  res.json({ message: 'ESPN connections stopped' });
});

router.post('/reset', (req, res) => {
  // Stop any active connections
  espnService.stopPolling();
  espnService.disconnectWebSocket();
  
  draftState = {
    leagueSettings: null,
    draftedPlayers: [],
    myTeam: [],
    watchList: [],
    currentPick: 1,
    myDraftPosition: null,
    totalTeams: 12,
    tierData: {},
    espnConfig: null,
    espnData: null,
    lastESPNSync: null,
    keepers: []
  };
  
  res.json({ message: 'Draft state reset', draftState });
});

module.exports = router;