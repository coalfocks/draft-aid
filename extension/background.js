// Background script for Fantasy Draft Assistant
console.log('🏈 Fantasy Draft Assistant background script loaded');

let draftState = {
  picks: [],
  teams: [],
  currentPick: 1,
  leagueId: null,
  myTeam: [],
  watchList: [],
  userRoster: []
};

// Central context object for compact chat context and persistence
let context = {
  leagueId: null,
  userTeamName: null,
  // Arrays of names only to minimize tokens
  myTeam: [], // ["Player Name", ...]
  draftedPlayers: [], // ["Player Name", ...]
  screenshots: {}, // id -> { name, type, dataDump, summary, timestamp }
  lastUpdated: null
};

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Background received message:', request.type);
  
  switch (request.type) {
    case 'INIT_DATA':
      // Initialize with data from content script
      draftState = { ...draftState, ...request.data };
      console.log('📊 Draft state initialized:', draftState);
      // Seed context with league/team if provided
      if (request.data.leagueId) context.leagueId = request.data.leagueId;
      if (request.data.userTeamName) context.userTeamName = request.data.userTeamName;
      context.lastUpdated = Date.now();
      saveContextToStorage();
      break;
      
    case 'NEW_PICK':
      // Add new pick to state
      draftState.picks.push(request.data);
      draftState.currentPick = draftState.picks.length + 1;
      console.log('🏈 New pick added:', request.data);
      // Update context draftedPlayers
      if (request.data.player?.name) {
        context.draftedPlayers.push(request.data.player.name);
      }
      context.lastUpdated = Date.now();
      saveContextToStorage();
      
      // Notify popup if it's open
      chrome.runtime.sendMessage({
        type: 'PICK_UPDATE',
        data: request.data
      }).catch(() => {
        // Popup might not be open, ignore error
      });
      break;
    
    case 'REPLACE_PICKS':
      // Replace the full picks array to avoid duplicate growth on refresh
      draftState.picks = Array.isArray(request.data) ? request.data : [];
      draftState.currentPick = draftState.picks.length + 1;
      console.log('🔄 Picks replaced. Count:', draftState.picks.length);
      // Replace in context as well
      context.draftedPlayers = draftState.picks.map(p => p.player?.name).filter(Boolean);
      context.lastUpdated = Date.now();
      saveContextToStorage();
      saveStateToStorage();
      chrome.runtime.sendMessage({ type: 'PICKS_REPLACED', data: draftState.picks }).catch(() => {});
      break;
      
    case 'GET_STATE':
      // Send current state to popup
      // Also ensure context has core identifiers
      if (draftState.leagueId) context.leagueId = draftState.leagueId;
      if (draftState.userTeamName) context.userTeamName = draftState.userTeamName;
      context.lastUpdated = Date.now();
      saveContextToStorage();
      sendResponse(draftState);
      break;

    case 'GET_CONTEXT':
      sendResponse(context);
      break;

    case 'RESET_CONTEXT':
      context = { leagueId: draftState.leagueId || null, userTeamName: draftState.userTeamName || null, myTeam: [], draftedPlayers: [], screenshots: {}, lastUpdated: Date.now() };
      saveContextToStorage();
      sendResponse({ ok: true });
      break;

    case 'UPDATE_CONTEXT_PARTIAL':
      // Shallow merge for primitives and arrays; merge screenshots by id
      if (request.data) {
        if (typeof request.data.leagueId !== 'undefined') context.leagueId = request.data.leagueId;
        if (typeof request.data.userTeamName !== 'undefined') context.userTeamName = request.data.userTeamName;
        if (Array.isArray(request.data.myTeam)) context.myTeam = request.data.myTeam;
        if (Array.isArray(request.data.draftedPlayers)) context.draftedPlayers = request.data.draftedPlayers;
        if (request.data.screenshots && typeof request.data.screenshots === 'object') {
          context.screenshots = { ...context.screenshots, ...request.data.screenshots };
        }
        context.lastUpdated = Date.now();
        saveContextToStorage();
      }
      sendResponse({ ok: true });
      break;
      
    case 'UPDATE_WATCHLIST':
      // Update watch list
      draftState.watchList = request.data;
      saveStateToStorage();
      break;
      
    case 'ADD_TO_MY_TEAM':
      // Add player to my team
      draftState.myTeam.push(request.data);
      saveStateToStorage();
      break;
      
    case 'OPENAI_REQUEST':
      // Handle OpenAI API requests
      handleOpenAIRequest(request.data, sendResponse);
      return true; // Keep message channel open for async response
      
    case 'OPENAI_VISION_REQUEST':
      // Handle OpenAI Vision API requests
      handleOpenAIVisionRequest(request.data, sendResponse);
      return true; // Keep message channel open for async response

    // Client-side helpers (ESPN public endpoints, cached in context for a few messages)
    case 'FETCH_PLAYER_INJURY_NEWS':
      fetchPlayerInjuryNews(request.player).then((result) => {
        // Stash in context for a few messages (simple TTL)
        const key = `news:${(request.player || '').toLowerCase()}`;
        context.screenshots[key] = { name: key, type: 'news', dataDump: result, timestamp: new Date().toISOString() };
        context.lastUpdated = Date.now();
        saveContextToStorage();
        sendResponse(result);
      }).catch(err => sendResponse({ error: err.message }));
      return true;

    case 'SEARCH_FANTASY_NEWS':
      fetchFantasyNews(request.query).then((result) => {
        const key = `fantasy:${(request.query || '').toLowerCase()}`;
        context.screenshots[key] = { name: key, type: 'fantasy', dataDump: result, timestamp: new Date().toISOString() };
        context.lastUpdated = Date.now();
        saveContextToStorage();
        sendResponse(result);
      }).catch(err => sendResponse({ error: err.message }));
      return true;

    case 'FETCH_TEAM_STARTERS':
      fetchTeamStarters(request.teamAbbr).then((result) => {
        context.screenshots[`starters:${(request.teamAbbr || '').toLowerCase()}`] = { name: request.teamAbbr, type: 'starters', dataDump: result, timestamp: new Date().toISOString() };
        context.lastUpdated = Date.now();
        saveContextToStorage();
        sendResponse(result);
      }).catch(err => sendResponse({ error: err.message }));
      return true;
  }
});

// Save state to chrome storage
function saveStateToStorage() {
  const stateToSave = {
    ...draftState,
    lastUpdated: Date.now()
  };
  
  chrome.storage.local.set({ 
    draftState: stateToSave,
    lastDraftSync: Date.now()
  }, () => {
    console.log('💾 Draft state saved to storage:', stateToSave.picks?.length || 0, 'picks');
  });
}

// Load state from chrome storage
async function loadStateFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['draftState', 'settings'], (result) => {
      if (result.draftState && result.draftState.picks) {
        draftState = { ...draftState, ...result.draftState };
        console.log('📂 Draft state loaded from storage:', draftState.picks?.length || 0, 'picks');
      }
      
      // Also ensure settings are available
      if (result.settings) {
        console.log('⚙️ Settings loaded from storage');
      }
      
      resolve(draftState);
    });
  });
}

// Context persistence
function saveContextToStorage() {
  chrome.storage.local.set({ chatContext: context });
}

async function loadContextFromStorage() {
  return new Promise(resolve => {
    chrome.storage.local.get(['chatContext'], (result) => {
      if (result.chatContext) {
        context = { ...context, ...result.chatContext };
        console.log('📂 Context loaded from storage');
      }
      resolve(context);
    });
  });
}

// Client-side ESPN helpers
async function fetchPlayerInjuryNews(playerName) {
  if (!playerName) return { error: 'No player provided' };
  const searchQuery = playerName.toLowerCase().replace(/\s+/g, '');
  const url = 'https://site.web.api.espn.com/apis/search/v2';
  const params = new URLSearchParams({ query: `${searchQuery} injury`, limit: '10', type: 'article' });
  const resp = await fetch(`${url}?${params.toString()}`);
  const data = await resp.json();
  const articles = data.results?.[0]?.contents || [];
  const relevant = articles.filter(a => {
    const h = (a.displayName || '').toLowerCase();
    return h.includes('injury') || h.includes('hurt') || h.includes('out') || h.includes('questionable') || h.includes('doubtful');
  }).slice(0, 3);
  return {
    player: playerName,
    news: relevant.map(a => ({ headline: a.displayName, description: a.description || '', published: a.published || 'Recent', url: a.link?.web }))
  };
}

async function fetchFantasyNews(query) {
  if (!query) return { error: 'No query provided' };
  const url = 'https://site.web.api.espn.com/apis/search/v2';
  const params = new URLSearchParams({ query, limit: '15', type: 'article' });
  const resp = await fetch(`${url}?${params.toString()}`);
  const data = await resp.json();
  const articles = data.results?.[0]?.contents || [];
  const fantasyKeywords = ['fantasy', 'draft', 'waiver', 'start', 'sit', 'rankings', 'projections', 'injury', 'trade'];
  const relevant = articles.filter(a => {
    const t = ((a.displayName || '') + ' ' + (a.description || '')).toLowerCase();
    return fantasyKeywords.some(k => t.includes(k)) || t.includes('nfl') || t.includes('football');
  }).slice(0, 5);
  return {
    query,
    results: relevant.map(a => ({ headline: a.displayName, description: a.description || '', published: a.published || 'Recent', url: a.link?.web }))
  };
}

// Fetch team starters (depth) using ESPN depth chart xhr endpoint
async function fetchTeamStarters(teamAbbr) {
  if (!teamAbbr) return { error: 'No teamAbbr provided' };
  const resp = await fetch(`https://www.espn.com/nfl/team/depth/_/name/${teamAbbr.toLowerCase()}?xhr=1`);
  if (!resp.ok) return { error: `Failed to fetch depth chart (${resp.status})` };
  const data = await resp.json();
  // Attempt to parse a compact starter mapping
  const starters = {};
  try {
    const modules = data?.page?.content?.modules || [];
    // Find module with depth chart content
    const depthModule = modules.find(m => JSON.stringify(m).toLowerCase().includes('depth')); // heuristic
    const html = depthModule?.content?.html || '';
    // Fallback simple extraction from HTML strings
    // This is a heuristic: find rows like QB ... <a ...>Name</a>
    const parsePos = (pos) => {
      const regex = new RegExp(`${pos}[^\n]*?<a[^>]*>([^<]+)<`, 'i');
      const m = html.match(regex);
      return m ? m[1].trim() : null;
    };
    starters.QB = parsePos('QB') || null;
    starters.RB = parsePos('RB') || null;
    starters.TE = parsePos('TE') || null;
    // WR may have multiple
    const wrRegex = /WR[^\n]*?<a[^>]*>([^<]+)</gi;
    let wrs = [];
    let m;
    while ((m = wrRegex.exec(html)) && wrs.length < 3) {
      wrs.push(m[1].trim());
    }
    starters.WR = wrs;
  } catch (e) {
    return { teamAbbr, error: 'Unable to parse starters' };
  }
  return { teamAbbr: teamAbbr.toUpperCase(), starters };
}
// Get all historical draft data
async function getAllDraftData() {
  const stored = await new Promise(resolve => {
    chrome.storage.local.get(['draftState'], resolve);
  });
  
  return {
    picks: draftState.picks || [],
    teams: draftState.teams || [],
    userTeamId: draftState.userTeamId,
    userTeamName: draftState.userTeamName,
    leagueId: draftState.leagueId,
    lastUpdated: stored.draftState?.lastUpdated || Date.now()
  };
}

// Handle OpenAI API requests
async function handleOpenAIRequest(requestData, sendResponse) {
  try {
    // Get keys from storage
    const result = await chrome.storage.local.get(['openaiApiKey', 'googleApiKey', 'groqApiKey', 'settings']);
    
    // Choose model: prefer settings.chatModel for text chat, fallback to gpt-4o-mini
    const chatModel = result.settings?.chatModel || 'gpt-4o-mini';
    
    // Determine provider and API URL/headers
    let provider = 'openai';
    if (chatModel.startsWith('groq-')) provider = 'groq';
    else if (chatModel.startsWith('gemini-')) provider = 'gemini';

    let apiUrl = 'https://api.openai.com/v1/chat/completions';
    let headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${result.openaiApiKey || result.settings?.openaiApiKey || ''}` };

    if (provider === 'groq') {
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const groqKey = result.groqApiKey || result.settings?.groqApiKey;
      if (!groqKey) {
        sendResponse({ success: false, error: 'Groq API key not configured.' });
        return;
      }
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` };
    }

    if (provider === 'gemini') {
      apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      const googleKey = result.googleApiKey || result.settings?.googleApiKey;
      if (!googleKey) {
        sendResponse({ success: false, error: 'Google API key not configured.' });
        return;
      }
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${googleKey}` };
    }

    // Build compact context for the model
    const compactContext = {
      leagueId: context.leagueId,
      userTeamName: context.userTeamName,
      myTeam: (context.myTeam || []).slice(-20),
      draftedPlayers: (context.draftedPlayers || []).slice(-50),
      screenshots: Object.fromEntries(Object.entries(context.screenshots || {}).slice(-3))
    };

    // Tools exposed to the model via tool_calls proxy (the extension will handle these)
    const tools = [
      {
        type: 'function',
        function: {
          name: 'fetch_player_injury_news',
          description: 'Fetch latest ESPN news headlines for a given player',
          parameters: { type: 'object', properties: { player: { type: 'string' } }, required: ['player'] }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_fantasy_news',
          description: 'Search recent fantasy-relevant ESPN headlines for a query',
          parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
        }
      }
    ];

    let messages = [
      { role: 'system', content: 'You will be given a compact JSON context named CONTEXT. Use it to avoid suggesting already-drafted players and to tailor advice to the user\'s team. Prefer using available tools when unsure about injuries or recent news.' },
      { role: 'system', content: `CONTEXT: ${JSON.stringify(compactContext)}` },
      ...requestData.messages
    ];

    // First call allowing tool suggestions
    let response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: chatModel,
        messages,
        max_tokens: 1500,
        temperature: 0.7,
        tools,
        tool_choice: 'auto'
      })
    });

    const initialText = await response.text();
    let initial;
    try { initial = JSON.parse(initialText); } catch { initial = { raw: initialText }; }
    if (!response.ok) throw new Error(initial.error?.message || 'OpenAI API error');

    // Handle function calls (one round, simple)
    const toolCalls = initial.choices?.[0]?.message?.tool_calls || [];
    let data = initial;
    if (toolCalls.length > 0) {
      const toolMessages = [];
      for (const call of toolCalls) {
        const name = call.function?.name;
        let args = {};
        try { args = JSON.parse(call.function?.arguments || '{}'); } catch {}
        let result;
        if (name === 'fetch_player_injury_news') {
          result = await fetchPlayerInjuryNews(args.player);
        } else if (name === 'search_fantasy_news') {
          result = await fetchFantasyNews(args.query);
        } else {
          result = { error: `Unknown tool ${name}` };
        }
        toolMessages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify(result) });
      }

      // Second call with tool results
      const secondResponse = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: chatModel,
          messages: [ ...messages, initial.choices[0].message, ...toolMessages ],
          max_tokens: 1500,
          temperature: 0.7
        })
      });
      const finalText = await secondResponse.text();
      try { data = JSON.parse(finalText); } catch { data = { raw: finalText }; }
      if (!secondResponse.ok) {
        throw new Error(data.error?.message || 'OpenAI API error');
      }
    }
    
    sendResponse({ success: true, data: data.choices?.[0]?.message?.content || data.raw || '' });
    
  } catch (error) {
    console.error('OpenAI API error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Handle OpenAI Vision API requests  
async function handleOpenAIVisionRequest(requestData, sendResponse) {
  try {
    // Get API key from storage
    const result = await chrome.storage.local.get(['openaiApiKey', 'settings']);
    const apiKey = result.openaiApiKey || result.settings?.openaiApiKey;
    
    console.log('🔑 Vision API - Checking API key:', apiKey ? 'FOUND' : 'NOT FOUND');
    
    if (!apiKey) {
      sendResponse({ 
        success: false,
        error: 'OpenAI API key not configured. Please add your API key in the Settings tab.' 
      });
      return;
    }
    
    // Prepare messages with image content
    const messages = requestData.messages.map(msg => {
      if (msg.content && typeof msg.content === 'object' && msg.content.image) {
        return {
          role: msg.role,
          content: [
            {
              type: "text",
              text: msg.content.text || "Analyze this fantasy football related image and provide insights."
            },
            {
              type: "image_url",
              image_url: {
                url: msg.content.image
              }
            }
          ]
        };
      }
      return msg;
    });
    
    console.log('🖼️ Sending vision request with', messages.length, 'messages');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o', // gpt-4o supports vision
        messages: messages,
        max_tokens: 1500,
        temperature: 0.2
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Vision API error:', data);
      throw new Error(data.error?.message || 'OpenAI Vision API error');
    }
    
    console.log('✅ Vision API response received');
    
    sendResponse({
      success: true,
      data: data.choices[0].message.content
    });
    
  } catch (error) {
    console.error('OpenAI Vision API error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Initialize background script
async function initializeBackground() {
  console.log('🚀 Background script initializing...');
  await loadStateFromStorage();
  console.log('✅ Background script initialized with', draftState.picks?.length || 0, 'picks');
}

initializeBackground();

// Set up periodic state saving
setInterval(saveStateToStorage, 30000); // Save every 30 seconds

// Listen for extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('🔄 Extension startup - reloading state');
  loadStateFromStorage();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('🆕 Extension installed/updated');
  loadStateFromStorage();
});