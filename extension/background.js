// Background script for Fantasy Draft Assistant
console.log('🏈 Fantasy Draft Assistant background script loaded');

// Load saved keepers on startup
chrome.storage.local.get(['keepers'], (result) => {
  if (result.keepers && Array.isArray(result.keepers)) {
    draftState.keepers = result.keepers;
    console.log('📋 Loaded keepers:', draftState.keepers.length);
  }
});

let draftState = {
  picks: [],
  teams: [],
  currentPick: 1,
  leagueId: null,
  myTeam: [],
  watchList: [],
  userRoster: [],
  keepers: []
};

// Central context object for compact chat context and persistence
let context = {
  leagueId: null,
  userTeamName: null,
  // Arrays of names only to minimize tokens
  myTeam: [], // ["Player Name", ...]
  draftedPlayers: [], // ["Player Name", ...] - includes both drafted and keeper players
  screenshots: {}, // id -> { name, type, dataDump, summary, timestamp }
  csvDatasets: {}, // id -> { id, name, columns, normalizedColumns, rows, timestamp }
  lastUpdated: null
};

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Background received message:', request.type);
  
  switch (request.type) {
    case 'INIT_DATA':
      // Initialize with data from content script, but preserve keepers
      const currentKeepers = draftState.keepers || [];
      draftState = { ...draftState, ...request.data };
      if (currentKeepers.length > 0 && (!draftState.keepers || draftState.keepers.length === 0)) {
        draftState.keepers = currentKeepers;
      }
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
      context = { leagueId: draftState.leagueId || null, userTeamName: draftState.userTeamName || null, myTeam: [], draftedPlayers: [], screenshots: {}, csvDatasets: {}, lastUpdated: Date.now() };
      saveContextToStorage();
      sendResponse({ ok: true });
      break;

    case 'UPDATE_CONTEXT_PARTIAL':
      // Shallow merge for primitives and arrays; merge screenshots by id
      if (request.data) {
        if (typeof request.data.leagueId !== 'undefined') context.leagueId = request.data.leagueId;
        if (typeof request.data.userTeamName !== 'undefined') context.userTeamName = request.data.userTeamName;
        if (Array.isArray(request.data.myTeam)) context.myTeam = request.data.myTeam;
        if (Array.isArray(request.data.draftedPlayers)) {
          context.draftedPlayers = request.data.draftedPlayers;
          console.log('📋 Updated drafted players in context (includes keepers):', context.draftedPlayers.length);
        }
        if (request.data.screenshots && typeof request.data.screenshots === 'object') {
          context.screenshots = { ...context.screenshots, ...request.data.screenshots };
        }
        if (request.data.csvDatasets !== undefined) {
          context.csvDatasets = request.data.csvDatasets;
          console.log('📊 Updated CSV datasets in context:', Object.keys(request.data.csvDatasets || {}).length);
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
      handleOpenAIRequest(request.data, sendResponse, request.messageId);
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
        const currentKeepers = draftState.keepers || [];
        draftState = { ...draftState, ...result.draftState };
        // Preserve keepers if they were already loaded
        if (currentKeepers.length > 0 && (!draftState.keepers || draftState.keepers.length === 0)) {
          draftState.keepers = currentKeepers;
        }
        console.log('📂 Draft state loaded from storage:', draftState.picks?.length || 0, 'picks,', draftState.keepers?.length || 0, 'keepers');
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
async function handleOpenAIRequest(requestData, sendResponse, messageId) {
  try {
    // Get keys from storage
    const result = await chrome.storage.local.get(['openaiApiKey', 'googleApiKey', 'groqApiKey', 'anthropicApiKey', 'settings', 'pendingChatMessage']);
    
    // Get CSV data from request or context
    const csvDatasets = requestData.csvData ? Object.values(requestData.csvData) : 
                       context.csvDatasets ? Object.values(context.csvDatasets) : [];
    
    // Choose model: prefer settings.chatModel for text chat, fallback to gpt-4o-mini
    const chatModel = (result.settings?.chatModel || 'gpt-4o-mini').trim();

    // Simple, explicit routing:
    // - If model starts with 'groq-', route to Groq and strip the prefix before sending
    // - Else if starts with 'gemini-', route to Gemini
    // - Else if includes 'claude', route to Anthropic via OpenAI-compat endpoint
    // - Else route to OpenAI
    const isGroq = chatModel.startsWith('groq-');
    const isGemini = chatModel.startsWith('gemini-');
    const isClaude = chatModel.includes('claude');
    const provider = isGroq ? 'groq' : (isGemini ? 'gemini' : (isClaude ? 'anthropic' : 'openai'));
    const modelForApi = isGroq ? chatModel.replace(/^groq-/, '') : chatModel;

    let apiUrl = 'https://api.openai.com/v1/chat/completions';
    let headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${result.openaiApiKey || result.settings?.openaiApiKey || ''}` };

    if (provider === 'groq') {
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const groqKey = result.groqApiKey || result.settings?.groqApiKey;
      if (!groqKey) {
        console.error('Groq selected but API key missing. Model:', chatModel);
        sendResponse({ success: false, error: 'Groq API key not configured.', model: chatModel, provider: 'groq' });
        return;
      }
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` };
    }

    if (provider === 'gemini') {
      apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      const googleKey = result.googleApiKey || result.settings?.googleApiKey;
      if (!googleKey) {
        console.error('Gemini selected but API key missing. Model:', chatModel);
        sendResponse({ success: false, error: 'Google API key not configured.', model: chatModel, provider: 'gemini' });
        return;
      }
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${googleKey}` };
    }

    if (provider === 'anthropic') {
      // Anthropic native Messages API - different format from OpenAI
      apiUrl = 'https://api.anthropic.com/v1/messages';
      const anthropicKey = result.anthropicApiKey || result.settings?.anthropicApiKey;
      if (!anthropicKey) {
        console.error('Claude selected but API key missing. Model:', chatModel);
        sendResponse({ success: false, error: 'Anthropic API key not configured. Add it in Settings.', model: chatModel, provider: 'anthropic' });
        return;
      }
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      };
    }

    console.log('🔧 LLM routing:', { provider, apiUrl, modelConfigured: chatModel, modelSent: modelForApi });

    // CSV datasets already retrieved above from request or context
    
    // Create unavailable list (keepers are now included in draftedPlayers)
    const allUnavailable = (context.draftedPlayers || [])
      .filter(item => item && typeof item === 'string');
    
    console.log('📋 Unavailable players:', allUnavailable.length, 'total');
    
    console.log('📊 CSV datasets available:', csvDatasets.length, csvDatasets.map(ds => ds.name));
    
    const compactContext = {
      // Only include unavailable list as array of strings
      allUnavailable: allUnavailable,
      // Basic counts only
      counts: `${allUnavailable.length}drafted,${(context.myTeam || []).length}team`,
      // Only last screenshot summary if exists
      lastScreenshot: context.screenshots ? Object.values(context.screenshots).slice(-1)[0]?.summary : null,
      // Include full CSV data for accurate rankings
      csvData: csvDatasets.length > 0 ? csvDatasets.map(ds => ({
        name: ds.name,
        // Include all rows but compress format
        data: (ds.rows || []).map(row => {
          // Extract player name
          let playerName = null;
          ['player', 'name', 'player_name', 'full_name'].forEach(col => {
            if (row[col] !== undefined && !playerName) playerName = row[col];
          });
          
          if (!playerName) return null;
          
          // Build compact row with abbreviated keys
          const compact = { n: playerName };
          
          // Add position
          ['position', 'pos'].forEach(col => {
            if (row[col] !== undefined && !compact.p) compact.p = row[col];
          });
          
          // Add rank/tier/points (all that exist)
          if (row.rank !== undefined) compact.r = row.rank;
          else if (row.overall_rank !== undefined) compact.r = row.overall_rank;
          else if (row.ranking !== undefined) compact.r = row.ranking;
          
          if (row.tier !== undefined) compact.t = row.tier;
          if (row.points !== undefined) compact.pts = Math.round(row.points);
          else if (row.projection !== undefined) compact.pts = Math.round(row.projection);
          else if (row.proj !== undefined) compact.pts = Math.round(row.proj);
          
          // Add team if available
          if (row.team !== undefined) compact.tm = row.team;
          else if (row.tm !== undefined) compact.tm = row.tm;
          
          // Add any other important numeric fields (ADP, value, etc)
          if (row.adp !== undefined) compact.adp = row.adp;
          if (row.value !== undefined) compact.v = row.value;
          
          return compact;
        }).filter(row => row !== null)
      })) : null
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
      },
      {
        type: 'function',
        function: {
          name: 'fetch_team_starters',
          description: 'Fetch ESPN depth chart starters for an NFL team (QB, RB, TE, WRs). Use team abbreviation like PHI, KC, DAL.',
          parameters: { type: 'object', properties: { teamAbbr: { type: 'string' } }, required: ['teamAbbr'] }
        }
      }
    ];

    const systemPrompt = `Fantasy draft assistant. Give ONE clear recommendation with data, unless the player asks for more suggestions.
Format: "PICK: [Player] - [1-2 key stats/reasons]"
NEVER recommend from CONTEXT.allUnavailable list. Don't mention unavailable players.
Use CONTEXT.csvData rankings if available (n=name, r=rank, t=tier, pts=points).
ADP = average draft position (ie 5.06 means 5th round, 6th pick).`;

    let messages = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `CONTEXT: ${JSON.stringify(compactContext)}` },
      ...requestData.messages
    ];

    // Determine if it's a GPT-5 model
    const isGPT5Model = modelForApi.includes('gpt-5') || modelForApi.includes('gpt5');
    const isClaudeModel = modelForApi.includes('claude');
    // Models that use max_completion_tokens instead of max_tokens
    const usesCompletionTokens = isGPT5Model || isClaudeModel;

    // Anthropic uses a different request format
    if (provider === 'anthropic') {
      // Extract system messages into top-level system param
      const systemMessages = messages.filter(m => m.role === 'system');
      const chatMessages = messages.filter(m => m.role !== 'system');
      const systemText = systemMessages.map(m => m.content).join('\n\n');

      // Convert tools to Anthropic format
      const anthropicTools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters
      }));

      const anthropicRequest = {
        model: modelForApi,
        system: systemText,
        messages: chatMessages,
        max_tokens: 8000,
        temperature: 0.3,
        tools: anthropicTools
      };

      let anthropicResponse = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(anthropicRequest)
      });

      const anthropicText = await anthropicResponse.text();
      let anthropicData;
      try { anthropicData = JSON.parse(anthropicText); } catch { anthropicData = { raw: anthropicText }; }

      if (!anthropicResponse.ok) {
        throw new Error(anthropicData.error?.message || `Anthropic API error: ${anthropicResponse.status}`);
      }

      // Handle tool calls (Anthropic format)
      const anthropicToolUses = (anthropicData.content || []).filter(c => c.type === 'tool_use');
      let finalContent = anthropicData.content || [];

      if (anthropicToolUses.length > 0) {
        // Build tool results in Anthropic format
        const toolResultBlocks = [];
        for (const tu of anthropicToolUses) {
          let toolResult;
          if (tu.name === 'fetch_player_injury_news') {
            toolResult = await fetchPlayerInjuryNews(tu.input?.player);
          } else if (tu.name === 'search_fantasy_news') {
            toolResult = await fetchFantasyNews(tu.input?.query);
          } else if (tu.name === 'fetch_team_starters') {
            toolResult = await fetchTeamStarters(tu.input?.teamAbbr);
          } else {
            toolResult = { error: `Unknown tool ${tu.name}` };
          }
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(toolResult)
          });
        }

        // Second call with tool results
        const secondAnthropicRequest = {
          model: modelForApi,
          system: systemText,
          messages: [
            ...chatMessages,
            { role: 'assistant', content: anthropicData.content },
            { role: 'user', content: toolResultBlocks }
          ],
          max_tokens: 8000,
          temperature: 0.3
        };

        const secondResponse = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(secondAnthropicRequest)
        });
        const secondText = await secondResponse.text();
        try { anthropicData = JSON.parse(secondText); } catch { anthropicData = { raw: secondText }; }
        if (!secondResponse.ok) {
          throw new Error(anthropicData.error?.message || 'Anthropic API error');
        }
      }

      // Extract text from Anthropic response
      let responseContent = '';
      if (Array.isArray(anthropicData.content)) {
        responseContent = anthropicData.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('');
      } else if (typeof anthropicData === 'string') {
        responseContent = anthropicData;
      } else {
        responseContent = anthropicData.raw || '';
      }

      if (!responseContent || responseContent.trim() === '') {
        sendResponse({ success: false, error: `Received empty response from Anthropic.` });
        return;
      }

      sendResponse({ success: true, data: responseContent });
      return;
    }

    // Standard OpenAI-compatible flow (OpenAI, Groq, Gemini OpenAI-compat)
    let requestParams = {
      model: modelForApi,
      messages,
      temperature: isGPT5Model ? 1.0 : 0.3,
      tools,
      tool_choice: 'auto'
    };

    if (usesCompletionTokens) {
      requestParams.max_completion_tokens = 8000;
    } else {
      requestParams.max_tokens = 4000;
    }
    
    // First call allowing tool suggestions
    let response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestParams)
    });

    const initialText = await response.text();
    let initial;
    try { 
      initial = JSON.parse(initialText); 
    } catch (e) { 
      console.error('Failed to parse response as JSON:', e, 'Raw text:', initialText);
      initial = { raw: initialText }; 
    }
    
    if (!response.ok) {
      console.error('API error response:', response.status, initial);
      throw new Error(initial.error?.message || `${provider} API error: ${response.status}`);
    }

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
        } else if (name === 'fetch_team_starters') {
          result = await fetchTeamStarters(args.teamAbbr);
        } else {
          result = { error: `Unknown tool ${name}` };
        }
        toolMessages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify(result) });
      }

      // Second call with tool results
      const secondRequestParams = {
        model: modelForApi,
        messages: [ ...messages, initial.choices[0].message, ...toolMessages ],
        temperature: isGPT5Model ? 1.0 : 0.3
      };

      if (usesCompletionTokens) {
        secondRequestParams.max_completion_tokens = 8000;
      } else {
        secondRequestParams.max_tokens = 4000;
      }
      
      const secondResponse = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(secondRequestParams)
      });
      const finalText = await secondResponse.text();
      try { data = JSON.parse(finalText); } catch { data = { raw: finalText }; }
      if (!secondResponse.ok) {
        throw new Error(data.error?.message || 'OpenAI API error');
      }
    }
    
    // Handle different response formats for different providers
    let responseContent = '';
    if (data.choices && data.choices[0] && data.choices[0].message) {
      responseContent = data.choices[0].message.content || '';
    } else if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      // Gemini native format
      responseContent = data.candidates[0].content.parts?.[0]?.text || '';
    } else if (typeof data === 'string') {
      responseContent = data;
    } else {
      responseContent = data.raw || '';
    }
    
    // Validate response is not empty
    if (!responseContent || responseContent.trim() === '') {
      console.error('Empty response from LLM. Provider:', provider, 'Model:', modelForApi, 'Full response:', data);
      sendResponse({ 
        success: false, 
        error: `Received empty response from ${provider}. Please try a different model.` 
      });
      return;
    }
    
    // Log if AI mentions unavailable players (but don't modify response)
    const responseUpper = responseContent.toUpperCase();
    const violatingPlayers = allUnavailable.filter(player => {
      if (!player || typeof player !== 'string') return false;
      try {
        return responseUpper.includes(player.toUpperCase());
      } catch (e) {
        return false;
      }
    });
    
    if (violatingPlayers.length > 0) {
      console.warn('⚠️ AI mentioned unavailable players:', violatingPlayers);
    }
    
    // Store the response for when popup reopens
    if (messageId && result.pendingChatMessage && result.pendingChatMessage.id === messageId) {
      const responseData = {
        messageId: messageId,
        response: responseContent,
        timestamp: Date.now(),
        success: true
      };
      
      chrome.storage.local.set({ 
        pendingChatResponse: responseData,
        pendingChatMessage: null // Clear the pending message
      });
      
      // Try to show notification if popup is closed
      chrome.windows.getCurrent((window) => {
        if (!window.focused) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('logo192.png'),
            title: 'Fantasy Draft Assistant',
            message: 'Your AI response is ready!',
            priority: 2
          });
        }
      });
    }
    
    sendResponse({ success: true, data: responseContent });
    
  } catch (error) {
    console.error('OpenAI/Groq/Gemini API error:', error);
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
    
    const visionContent = data.choices?.[0]?.message?.content || '';
    
    // Validate vision response
    if (!visionContent || visionContent.trim() === '') {
      console.error('Empty vision response:', data);
      sendResponse({
        success: false,
        error: 'Received empty response from vision API. Please try again.'
      });
      return;
    }
    
    sendResponse({
      success: true,
      data: visionContent
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
