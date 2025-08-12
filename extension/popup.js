// Popup script for Fantasy Draft Assistant
console.log('🏈 Fantasy Draft Assistant popup loaded');

let draftState = {
  picks: [],
  teams: [],
  currentPick: 1,
  leagueId: null,
  myTeam: [],
  watchList: [],
  userRoster: []
};

let settings = {
  openaiApiKey: '',
  myTeamName: '',
  draftPosition: ''
};

let chatHistory = [];
let uploadedImages = [];
let lastLeagueId = null;
let lastPickCount = null;

// DOM Elements
const elements = {
  draftStatus: document.getElementById('draft-status'),
  currentPick: document.getElementById('current-pick'),
  recentPicks: document.getElementById('recent-picks'),
  myTeam: document.getElementById('my-team'),
  myTeamCount: document.getElementById('my-team-count'),
  watchlist: document.getElementById('watchlist'),
  watchlistCount: document.getElementById('watchlist-count'),
  playerNameInput: document.getElementById('player-name-input'),
  positionSelect: document.getElementById('position-select'),
  addToWatchlistBtn: document.getElementById('add-to-watchlist'),
  refreshPicksBtn: document.getElementById('refresh-picks'),
  chatMessages: document.getElementById('chat-messages'),
  chatInput: document.getElementById('chat-input'),
  sendChatBtn: document.getElementById('send-chat'),
  imageUpload: document.getElementById('image-upload'),
  uploadBtn: document.getElementById('upload-btn'),
  openaiKey: document.getElementById('openai-key'),
  googleKey: document.getElementById('google-key'),
  groqKey: document.getElementById('groq-key'),
  myTeamName: document.getElementById('my-team-name'),
  draftPosition: document.getElementById('draft-position'),
  chatModel: document.getElementById('chat-model'),
  saveSettingsBtn: document.getElementById('save-settings'),
  exportDataBtn: document.getElementById('export-data'),
  debugDomBtn: document.getElementById('debug-dom'),
  forceExtractBtn: document.getElementById('force-extract'),
  getContextBtn: document.getElementById('get-context'),
  resetContextBtn: document.getElementById('reset-context'),
  debugLeague: document.getElementById('debug-league'),
  debugPicks: document.getElementById('debug-picks'),
  debugTeams: document.getElementById('debug-teams'),
  debugUrl: document.getElementById('debug-url'),
  debugLog: document.getElementById('debug-log'),
  imageGallery: document.getElementById('image-gallery'),
  imageCount: document.getElementById('image-count'),
  clearImagesBtn: document.getElementById('clear-images'),
  resetChatBtn: document.getElementById('reset-chat')
};

// Initialize popup
async function initialize() {
  console.log('🚀 Initializing popup');
  
  // Load settings and state
  await loadSettings();
  await loadDraftState();
  
  // Set up event listeners
  setupEventListeners();
  setupTabs();
  
  // Get fresh data from content script
  requestDraftData();
  
  // Update UI
  updateUI();
}

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings', 'openaiApiKey', 'googleApiKey', 'groqApiKey', 'chatHistory', 'uploadedImages', 'lastLeagueId', 'lastPickCount']);
  
  // Load from either settings object or direct key
  const apiKey = result.openaiApiKey || result.settings?.openaiApiKey;
  
  if (result.settings) {
    settings = { ...settings, ...result.settings };
  }
  
  // Override with direct API key if available
  if (apiKey) {
    settings.openaiApiKey = apiKey;
  }
  
  // Load chat history
  if (result.chatHistory) {
    chatHistory = result.chatHistory;
    restoreChatHistory();
  }
  
  // Load uploaded images
  if (result.uploadedImages) {
    uploadedImages = result.uploadedImages;
    updateImageGallery();
  }
  if (result.lastLeagueId) {
    lastLeagueId = result.lastLeagueId;
  }
  if (typeof result.lastPickCount === 'number') {
    lastPickCount = result.lastPickCount;
  }
  
  console.log('⚙️ Settings loaded:', { 
    hasApiKey: !!settings.openaiApiKey, 
    teamName: settings.myTeamName,
    chatMessages: chatHistory.length,
    images: uploadedImages.length
  });
  
  // Populate settings form
  if (elements.openaiKey) elements.openaiKey.value = settings.openaiApiKey || '';
  if (elements.googleKey) elements.googleKey.value = result.googleApiKey || settings.googleApiKey || '';
  if (elements.groqKey) elements.groqKey.value = result.groqApiKey || settings.groqApiKey || '';
  if (elements.myTeamName) elements.myTeamName.value = settings.myTeamName || '';
  if (elements.draftPosition) elements.draftPosition.value = settings.draftPosition || '';
  if (elements.chatModel) elements.chatModel.value = settings.chatModel || 'gpt-4o-mini';
}

// Load draft state from background script
async function loadDraftState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (response) {
      // Auto-reset chat if league changed
      if (response.leagueId && lastLeagueId && response.leagueId !== lastLeagueId) {
        resetChatToBaseline();
      }
      draftState = { ...draftState, ...response };
      if (response.leagueId && response.leagueId !== lastLeagueId) {
        lastLeagueId = response.leagueId;
        chrome.storage.local.set({ lastLeagueId });
      }
      // Auto-reset if new draft started (pick count reset)
      if (Array.isArray(response.picks)) {
        if (typeof lastPickCount === 'number' && lastPickCount > 0 && response.picks.length === 0) {
          resetChatToBaseline();
        }
        lastPickCount = response.picks.length;
        chrome.storage.local.set({ lastPickCount });
      }
      console.log('📊 Draft state loaded:', draftState);
    }
    
    // Also try to get fresh data from content script
    await requestDraftData();
    
  } catch (error) {
    console.error('Failed to load draft state:', error);
  }
}

// Request fresh data from content script
function requestDraftData() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes('fantasy.espn.com')) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_DRAFT_DATA' }, (response) => {
        if (response) {
          // Auto-reset chat if league changed
          if (response.leagueId && lastLeagueId && response.leagueId !== lastLeagueId) {
            resetChatToBaseline();
          }
          draftState = { ...draftState, ...response };
          if (response.leagueId && response.leagueId !== lastLeagueId) {
            lastLeagueId = response.leagueId;
            chrome.storage.local.set({ lastLeagueId });
          }
          // Auto-reset if new draft started (pick count reset)
          if (Array.isArray(response.picks)) {
            if (typeof lastPickCount === 'number' && lastPickCount > 0 && response.picks.length === 0) {
              resetChatToBaseline();
            }
            lastPickCount = response.picks.length;
            chrome.storage.local.set({ lastPickCount });
          }
          updateUI();
        }
      });
    }
  });
}

// Clear current picks and force content to re-extract, then sync UI
function refreshAndSync() {
  // Clear picks locally and in background to prevent duplication
  draftState.picks = [];
  draftState.currentPick = 1;
  updateUI();
  chrome.runtime.sendMessage({ type: 'REPLACE_PICKS', data: [] }).catch(() => {});

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url.includes('fantasy.espn.com')) return;
    chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_DATA' }, (response) => {
      if (chrome.runtime.lastError) {
        // Fallback to generic request
        return requestDraftData();
      }
      if (response) {
        draftState = { ...draftState, ...response };
        updateUI();
      }
    });
  });
}

// Set up event listeners
function setupEventListeners() {
  // Draft board actions
  elements.addToWatchlistBtn?.addEventListener('click', addToWatchlist);
  elements.refreshPicksBtn?.addEventListener('click', refreshAndSync);
  
  // Chat actions
  elements.sendChatBtn?.addEventListener('click', sendChatMessage);
  elements.chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
  elements.resetChatBtn?.addEventListener('click', resetChatToBaseline);
  elements.uploadBtn?.addEventListener('click', () => elements.imageUpload?.click());
  elements.imageUpload?.addEventListener('change', handleImageUpload);
  
  // Settings actions
  elements.saveSettingsBtn?.addEventListener('click', saveSettings);
  elements.exportDataBtn?.addEventListener('click', exportData);
  elements.debugDomBtn?.addEventListener('click', debugDom);
  elements.forceExtractBtn?.addEventListener('click', forceExtract);
  elements.getContextBtn?.addEventListener('click', async () => {
    const ctx = await chrome.runtime.sendMessage({ type: 'GET_CONTEXT' });
    const w = window.open('', '_blank', 'width=600,height=800,scrollbars=yes');
    if (w) {
      w.document.write(`<pre style="white-space: pre-wrap; word-wrap: break-word; font-size:12px;">${
        ctx ? JSON.stringify(ctx, null, 2) : 'No context'
      }</pre>`);
    } else {
      alert('Context window blocked by popup blocker');
    }
  });
  elements.resetContextBtn?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'RESET_CONTEXT' });
    alert('Context reset.');
  });
  
  // Image gallery actions
  elements.clearImagesBtn?.addEventListener('click', clearAllImages);
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PICK_UPDATE') {
      draftState.picks.push(request.data);
      draftState.currentPick = draftState.picks.length + 1;
      updateUI();
    } else if (request.type === 'PICKS_REPLACED') {
      draftState.picks = request.data || [];
      draftState.currentPick = draftState.picks.length + 1;
      updateUI();
    }
  });
}

// Set up tab navigation
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      // Update active states
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
  });
}

// Update UI with current draft state
function updateUI() {
  // Update header
  if (elements.draftStatus) {
    const status = draftState.picks.length > 0 ? 'In Progress' : 'Waiting for picks';
    elements.draftStatus.textContent = `Draft Status: ${status}`;
  }
  
  if (elements.currentPick) {
    const currentRound = getCurrentRound();
    const pickInfo = getNextPickInfo();
    elements.currentPick.textContent = `Round ${currentRound}, Pick ${draftState.currentPick} (${pickInfo.picksUntilMyTurn} until yours)`;
  }
  
  // Update recent picks
  updateRecentPicks();
  
  // Update my team
  updateMyTeam();
  
  // Update watchlist
  updateWatchlist();
  
  // Update debug info
  updateDebugInfo();
  // Keep background context in sync (myTeam and draftedPlayers)
  chrome.runtime.sendMessage({
    type: 'UPDATE_CONTEXT_PARTIAL',
    data: {
      myTeam: draftState.myTeam.map(p => p.name),
      draftedPlayers: draftState.picks.map(p => p.player?.name).filter(Boolean)
    }
  }).catch(() => {});
}

// Update recent picks display
function updateRecentPicks() {
  if (!elements.recentPicks) return;
  
  const recentPicks = draftState.picks.slice(-10).reverse();
  
  if (recentPicks.length === 0) {
    elements.recentPicks.innerHTML = '<div class="no-data">No picks detected yet</div>';
    return;
  }
  
  elements.recentPicks.innerHTML = recentPicks.map(pick => `
    <div class="pick-item">
      <span class="pick-number">#${pick.pickNumber}</span>
      <div class="player-info">
        <div class="player-name">${pick.player.name}</div>
        <div class="player-details">${pick.player.position} - ${pick.player.team}</div>
      </div>
      <button class="btn btn-small" onclick="addPlayerToMyTeam('${pick.player.name}', '${pick.player.position}')">
        + My Team
      </button>
    </div>
  `).join('');
}

// Update my team display
function updateMyTeam() {
  if (!elements.myTeam || !elements.myTeamCount) return;
  
  elements.myTeamCount.textContent = draftState.myTeam.length;
  
  if (draftState.myTeam.length === 0) {
    elements.myTeam.innerHTML = '<div class="no-data">No players on your team yet</div>';
    return;
  }
  
  elements.myTeam.innerHTML = draftState.myTeam.map(player => `
    <div class="player-card">
      <div>
        <span class="player-name">${player.name}</span>
        <span class="player-position">${player.position}</span>
      </div>
    </div>
  `).join('');
}

// Update watchlist display
function updateWatchlist() {
  if (!elements.watchlist || !elements.watchlistCount) return;
  
  elements.watchlistCount.textContent = draftState.watchList.length;
  
  if (draftState.watchList.length === 0) {
    elements.watchlist.innerHTML = '<div class="no-data">No players on watch list</div>';
    return;
  }
  
  elements.watchlist.innerHTML = draftState.watchList.map((player, index) => `
    <div class="player-card">
      <div>
        <span class="player-name">${player.name}</span>
        <span class="player-position">${player.position}</span>
      </div>
      <button class="btn btn-small" onclick="removeFromWatchlist(${index})">Remove</button>
    </div>
  `).join('');
}

// Update debug info
function updateDebugInfo() {
  if (elements.debugLeague) elements.debugLeague.textContent = draftState.leagueId || '--';
  if (elements.debugPicks) elements.debugPicks.textContent = draftState.picks.length;
  if (elements.debugTeams) elements.debugTeams.textContent = draftState.teams.length;
  
  // Get current tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && elements.debugUrl) {
      elements.debugUrl.textContent = tabs[0].url.substring(0, 50) + '...';
    }
  });
}

// Add debug log entry
function addDebugLog(message) {
  if (!elements.debugLog) return;
  
  const logEntry = document.createElement('div');
  logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  elements.debugLog.appendChild(logEntry);
  elements.debugLog.scrollTop = elements.debugLog.scrollHeight;
  
  // Keep only last 20 entries
  while (elements.debugLog.children.length > 20) {
    elements.debugLog.removeChild(elements.debugLog.firstChild);
  }
}

// Debug DOM structure
function debugDom() {
  addDebugLog('Running comprehensive DOM inspection...');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      addDebugLog('No active tab found');
      return;
    }
    
    const tab = tabs[0];
    addDebugLog(`Current tab: ${tab.url}`);
    
    if (!tab.url.includes('fantasy.espn.com')) {
      addDebugLog('Not on ESPN Fantasy page');
      return;
    }
    
    // First, inject the content script to ensure it's loaded
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    }, (results) => {
      if (chrome.runtime.lastError) {
        addDebugLog(`Script injection error: ${chrome.runtime.lastError.message}`);
        return;
      }
      
      addDebugLog('Content script injected, testing communication...');
      
      // Test basic communication first
      chrome.tabs.sendMessage(tab.id, { type: 'DEBUG_DOM' }, (response) => {
        if (chrome.runtime.lastError) {
          addDebugLog(`Message error: ${chrome.runtime.lastError.message}`);
          // Try alternative approach - inject inspector directly
          tryDirectInspection(tab.id);
          return;
        }
        
        if (response) {
          addDebugLog(`✅ Communication working!`);
          addDebugLog(`Elements found: ${response.elementCount}`);
          addDebugLog(`Title: ${response.pageTitle}`);
          console.log('🔍 DOM Debug Response:', response);
          
          // Now try the DOM inspector
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['dom-inspector.js']
          }, () => {
            chrome.tabs.sendMessage(tab.id, { type: 'RUN_DOM_INSPECTOR' }, (inspectorResponse) => {
              if (inspectorResponse) {
                addDebugLog('DOM inspector completed - check console');
              } else {
                addDebugLog('DOM inspector no response');
              }
            });
          });
        } else {
          addDebugLog('No response from content script');
          tryDirectInspection(tab.id);
        }
      });
    });
  });
}

// Try direct inspection if content script communication fails
function tryDirectInspection(tabId) {
  addDebugLog('Trying direct inspection...');
  
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => {
      // Direct inspection function
      const info = {
        url: window.location.href,
        title: document.title,
        draftColumns: document.querySelectorAll('.draft-column, [class*="draft-column"]').length,
        rosterModules: document.querySelectorAll('.roster-module, [class*="roster"]').length,
        playerLinks: document.querySelectorAll('a[title*=" "], a.AnchorLink').length,
        tables: document.querySelectorAll('table').length,
        totalElements: document.querySelectorAll('*').length
      };
      
      console.log('🔍 Direct inspection results:', info);
      return info;
    }
  }, (results) => {
    if (results && results[0] && results[0].result) {
      const info = results[0].result;
      addDebugLog(`✅ Direct inspection successful:`);
      addDebugLog(`Draft columns: ${info.draftColumns}`);
      addDebugLog(`Roster modules: ${info.rosterModules}`);
      addDebugLog(`Player links: ${info.playerLinks}`);
      addDebugLog(`Tables: ${info.tables}`);
      console.log('🔍 Direct inspection:', info);
    } else {
      addDebugLog('❌ Direct inspection failed');
    }
  });
}

// Force extraction
function forceExtract() {
  addDebugLog('Forcing data extraction...');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      addDebugLog('No active tab found');
      return;
    }
    
    const tab = tabs[0];
    if (!tab.url.includes('fantasy.espn.com')) {
      addDebugLog('Not on ESPN Fantasy page');
      return;
    }
    
    // Ensure content script is loaded first
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    }, (results) => {
      if (chrome.runtime.lastError) {
        addDebugLog(`Script injection error: ${chrome.runtime.lastError.message}`);
        return;
      }
      
      // Give it a moment to initialize
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { type: 'FORCE_EXTRACT' }, (response) => {
          if (chrome.runtime.lastError) {
            addDebugLog(`Message error: ${chrome.runtime.lastError.message}`);
            // Try direct extraction
            tryDirectExtraction(tab.id);
            return;
          }
          
          if (response) {
            draftState = { ...draftState, ...response };
            updateUI();
            addDebugLog(`✅ Extracted ${response.picks?.length || 0} picks, ${response.userRoster?.length || 0} roster players`);
          } else {
            addDebugLog('❌ Force extraction failed - no response');
            tryDirectExtraction(tab.id);
          }
        });
      }, 1000);
    });
  });
}

// Try direct extraction if content script fails
function tryDirectExtraction(tabId) {
  addDebugLog('Trying direct extraction...');
  
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => {
      console.log('🔍 DIRECT EXTRACTION - Starting comprehensive analysis');
      
      const data = {
        picks: [],
        userRoster: [],
        url: window.location.href,
        title: document.title
      };
      
      // DRAFT PICKS EXTRACTION
      console.log('📋 Looking for draft picks...');
      
      // Try multiple approaches to find draft picks
      console.log('🔍 Approach 1: Looking for .draft-column.flex');
      const draftColumn = document.querySelector('.draft-column.flex');
      console.log('Draft column found:', !!draftColumn);
      
      if (draftColumn) {
        console.log('✅ Draft column found! HTML sample:', draftColumn.outerHTML.substring(0, 400));
        
        // Look for UL with dynamic class containing 'pa3'
        const ul = draftColumn.querySelector('ul[class*="pa3"]') || draftColumn.querySelector('ul');
        console.log('UL found:', !!ul);
        if (ul) console.log('UL classes:', ul.className);
        
        if (ul) {
          const listItems = ul.querySelectorAll('li');
          console.log(`📋 Found ${listItems.length} list items in draft column`);
          
          // Show structure of first few items for debugging
          for (let i = 0; i < Math.min(2, listItems.length); i++) {
            const li = listItems[i];
            console.log(`\n🔍 LI ${i+1} structure analysis:`);
            console.log('- Full HTML:', li.outerHTML.substring(0, 300));
            console.log('- Child divs:', li.querySelectorAll('div').length);
            console.log('- Player name span:', !!li.querySelector('span.playerinfo_playername'));
            console.log('- Pick info div:', !!li.querySelector('div.pick-info'));
          }
          
          listItems.forEach((li, index) => {
            try {
              // Target the exact structure you described:
              // li > div > div (2nd div) > span.playerinfo_playername
              const playerNameSpan = li.querySelector('span.playerinfo_playername');
              const pickInfoDiv = li.querySelector('div.pick-info');
              
              const playerName = playerNameSpan?.textContent?.trim();
              const pickInfo = pickInfoDiv?.textContent?.trim();
              
              // Find the drafting team span (sibling to pick-info div)
              let draftingTeam = 'Unknown';
              if (pickInfoDiv) {
                // Look for sibling span after the pick-info div
                const teamSpan = pickInfoDiv.nextElementSibling;
                if (teamSpan && teamSpan.tagName === 'SPAN') {
                  draftingTeam = teamSpan.textContent?.trim();
                } else {
                  // Alternative: look in parent container for team info
                  const parentDiv = pickInfoDiv.parentElement;
                  const teamSpans = parentDiv?.querySelectorAll('span');
                  if (teamSpans && teamSpans.length > 2) {
                    // Usually team name is in one of the later spans
                    draftingTeam = teamSpans[teamSpans.length - 1]?.textContent?.trim();
                  }
                }
              }
              
              console.log(`Pick ${index + 1}: Player="${playerName}", Info="${pickInfo}", Team="${draftingTeam}"`);
              
              if (playerName && playerName.length > 2) {
                // Parse the pick info (R1, P1 format)
                let round = 'N/A';
                let pickInRound = 'N/A';
                let overallPick = index + 1;
                
                if (pickInfo) {
                  const pickMatch = pickInfo.match(/R(\d+),\s*P(\d+)/);
                  if (pickMatch) {
                    round = parseInt(pickMatch[1]);
                    pickInRound = parseInt(pickMatch[2]);
                    // Calculate overall pick if we know team count
                    const teamCount = data.teams?.length || 12;
                    overallPick = (round - 1) * teamCount + pickInRound;
                  }
                }
                
                data.picks.push({
                  pickNumber: overallPick,
                  round: round,
                  pickInRound: pickInRound,
                  player: {
                    name: playerName,
                    position: 'N/A', // Will extract from other spans if needed
                    team: 'N/A'
                  },
                  draftingTeam: draftingTeam,
                  pickInfo: pickInfo || 'N/A',
                  timestamp: new Date().toISOString()
                });
              }
              
            } catch (error) {
              console.error(`❌ Error processing pick ${index + 1}:`, error);
            }
          });
        } else {
          console.log('❌ No UL found in draft column');
        }
      }
      
      // If no picks found, try alternative approaches
      if (data.picks.length === 0) {
        console.log('🔍 Approach 2: Looking for any draft-related elements');
        const allDraftElements = document.querySelectorAll('[class*="draft"], [class*="pick"]');
        console.log(`Found ${allDraftElements.length} elements with draft/pick in class`);
        
        // Look for player links in draft context
        const playerLinks = document.querySelectorAll('a[title*=" "], a.AnchorLink');
        console.log(`Found ${playerLinks.length} potential player links`);
        
        // Sample first few player links
        for (let i = 0; i < Math.min(5, playerLinks.length); i++) {
          const link = playerLinks[i];
          const name = link.textContent?.trim() || link.title?.trim();
          if (name && name.length > 2) {
            console.log(`Player link ${i+1}: "${name}" (classes: ${link.className})`);
          }
        }
      }
      
      // ROSTER EXTRACTION
      console.log('🏈 Looking for roster...');
      const rosterModule = document.querySelector('.roster-module');
      console.log('Roster module found:', !!rosterModule);
      
      if (rosterModule) {
        const table = rosterModule.querySelector('table');
        console.log('Roster table found:', !!table);
        
        if (table) {
          const rows = table.querySelectorAll('tbody tr');
          console.log(`Found ${rows.length} roster rows`);
          
          rows.forEach((row, index) => {
            const positionDiv = row.querySelector('div[title="Position"]');
            const byeWeekDiv = row.querySelector('div[title="Bye Week"]');
            
            // Find player name in any cell
            let playerName = '';
            const cells = row.querySelectorAll('td');
            for (const cell of cells) {
              const playerLink = cell.querySelector('a[title], a.AnchorLink');
              if (playerLink) {
                playerName = playerLink.textContent?.trim() || playerLink.title?.trim();
                if (playerName && playerName.length > 2) break;
              }
            }
            
            const position = positionDiv?.textContent?.trim();
            const byeWeek = byeWeekDiv?.textContent?.trim();
            
            console.log(`Roster ${index + 1}: Player="${playerName}", Pos="${position}", Bye="${byeWeek}"`);
            
            if (playerName && position) {
              data.userRoster.push({
                name: playerName,
                position: position,
                byeWeek: byeWeek || 'N/A'
              });
            }
          });
        }
      }
      
      console.log('🔍 DIRECT EXTRACTION - Final results:', {
        picks: data.picks.length,
        roster: data.userRoster.length,
        url: data.url
      });
      
      // TEAM EXTRACTION (fix duplicate issue)
      console.log('👥 Looking for team names...');
      const teamSelectors = [
        '.jsx-4106643373.team-name.truncate',
        '.team-name',
        '.jsx-1190755542',
        '[data-testid="team-name"]',
        '.owner-name'
      ];
      
      const teams = new Set(); // Use Set to avoid duplicates
      
      teamSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        console.log(`Team selector ${selector}: ${elements.length} found`);
        
        elements.forEach(el => {
          const teamName = el.textContent?.trim();
          if (teamName && teamName.length > 0 && teamName.length < 50) { // reasonable team name length
            teams.add(teamName);
          }
        });
      });
      
      const uniqueTeams = Array.from(teams);
      console.log(`🎯 Unique teams found: ${uniqueTeams.length}`, uniqueTeams);
      
      return {
        ...data,
        teams: uniqueTeams.map((name, index) => ({ id: index + 1, name: name })),
        foundElements: {
          playerLinks: document.querySelectorAll('a[title*=" "], a.AnchorLink').length,
          draftColumns: document.querySelectorAll('.draft-column, [class*="draft"]').length,
          rosterElements: document.querySelectorAll('.roster-module, [class*="roster"]').length,
          tables: document.querySelectorAll('table').length,
          uniqueTeams: uniqueTeams.length
        }
      };
    }
  }, (results) => {
    if (results && results[0] && results[0].result) {
      const extractedData = results[0].result;
      addDebugLog(`✅ Direct extraction completed`);
      addDebugLog(`Picks: ${extractedData.picks.length}`);
      addDebugLog(`Roster: ${extractedData.userRoster.length}`);
      addDebugLog(`Teams: ${extractedData.foundElements.uniqueTeams}`);
      addDebugLog(`Player links: ${extractedData.foundElements.playerLinks}`);
      addDebugLog(`Draft columns: ${extractedData.foundElements.draftColumns}`);
      addDebugLog(`Roster elements: ${extractedData.foundElements.rosterElements}`);
      
      // Update state with what we found
      draftState = { ...draftState, ...extractedData };
      updateUI();
      
      console.log('🎯 Updated draft state:', draftState);
    } else {
      addDebugLog('❌ Direct extraction failed');
    }
  });
}

// Add player to watchlist
function addToWatchlist() {
  const playerName = elements.playerNameInput?.value.trim();
  const position = elements.positionSelect?.value;
  
  if (!playerName) return;
  
  const player = { name: playerName, position };
  draftState.watchList.push(player);
  
  // Clear input
  if (elements.playerNameInput) elements.playerNameInput.value = '';
  
  // Update UI and save
  updateWatchlist();
  chrome.runtime.sendMessage({
    type: 'UPDATE_WATCHLIST',
    data: draftState.watchList
  });
}

// Add player to my team
function addPlayerToMyTeam(name, position) {
  const player = { name, position };
  draftState.myTeam.push(player);
  
  updateMyTeam();
  chrome.runtime.sendMessage({
    type: 'ADD_TO_MY_TEAM',
    data: player
  });
}

// Remove from watchlist
function removeFromWatchlist(index) {
  draftState.watchList.splice(index, 1);
  updateWatchlist();
  chrome.runtime.sendMessage({
    type: 'UPDATE_WATCHLIST',
    data: draftState.watchList
  });
}

// Calculate what round we're in
function getCurrentRound() {
  const totalTeams = draftState.teams?.length || 12;
  const currentPick = draftState.currentPick || 1;
  return Math.ceil(currentPick / totalTeams);
}

// Get next pick information
function getNextPickInfo() {
  const totalTeams = draftState.teams?.length || 12;
  const myPosition = parseInt(settings.draftPosition) || 1;
  const currentRound = getCurrentRound();
  
  // Snake draft logic
  let nextMyPick;
  if (currentRound % 2 === 1) { // Odd rounds go 1->12
    nextMyPick = (currentRound - 1) * totalTeams + myPosition;
  } else { // Even rounds go 12->1
    nextMyPick = (currentRound - 1) * totalTeams + (totalTeams - myPosition + 1);
  }
  
  const picksUntilMyTurn = nextMyPick - draftState.currentPick;
  
  return { nextMyPick, picksUntilMyTurn, currentRound };
}

// Send chat message
async function sendChatMessage() {
  const message = elements.chatInput?.value.trim();
  if (!message) return;
  
  if (!settings.openaiApiKey) {
    addChatMessage('ai', 'Please configure your OpenAI API key in the Settings tab first.');
    return;
  }
  
  // Add user message to chat
  addChatMessage('user', message);
  elements.chatInput.value = '';
  
  // Debug: Log current draft state before building context
  console.log('🐛 Current draft state for context:', {
    picks: draftState.picks?.length || 0,
    myTeam: draftState.myTeam?.length || 0,
    teams: draftState.teams?.length || 0,
    currentPick: draftState.currentPick,
    userTeamName: draftState.userTeamName,
    leagueId: draftState.leagueId
  });
  
  // Build comprehensive draft context (will be augmented with compact context in background)
  const pickInfo = getNextPickInfo();
  const totalPicks = draftState.picks?.length || 0;
  const myTeamPlayers = draftState.myTeam || [];
  const userRoster = draftState.userRoster || [];
  const recentPicks = draftState.picks?.slice(-10) || [];
  const watchList = draftState.watchList || [];
  
  // Analyze roster composition by position
  const rosterByPosition = {};
  userRoster.forEach(player => {
    if (!rosterByPosition[player.position]) {
      rosterByPosition[player.position] = [];
    }
    rosterByPosition[player.position].push(player);
  });
  
  // Identify bye week conflicts
  const byeWeekAnalysis = {};
  userRoster.forEach(player => {
    if (player.byeWeek && player.byeWeek !== 'N/A') {
      if (!byeWeekAnalysis[player.byeWeek]) {
        byeWeekAnalysis[player.byeWeek] = [];
      }
      byeWeekAnalysis[player.byeWeek].push(`${player.name} (${player.position})`);
    }
  });
  
  // Build full drafted players list for context
  const draftedList = draftState.picks
    .map((p, idx) => `#${idx + 1} (R${p.round}, P${p.pickInRound}) - ${p.player.name} (${p.player.position}${p.player.team && p.player.team !== 'N/A' ? ` - ${p.player.team}` : ''}) → ${p.draftingTeam}`)
    .join('\n');

  const context = `
    CURRENT DRAFT SITUATION:
    - League: ${draftState.leagueId || 'Unknown'}
    - My Team: ${draftState.userTeamName || settings.myTeamName || 'Unknown'}
    - Draft Position: ${settings.draftPosition}/${draftState.teams?.length || 12}
    - Current Pick: #${draftState.currentPick} (Round ${pickInfo.currentRound})
    - My Next Pick: #${pickInfo.nextMyPick} (${pickInfo.picksUntilMyTurn} picks away)
    - Total Drafted: ${totalPicks} players
    
    MY CURRENT ROSTER (${userRoster.length} players):
    ${userRoster.length > 0 ? userRoster.map(p => `- ${p.name} (${p.position}) - Bye Week ${p.byeWeek}`).join('\n') : '- No players on roster yet'}
    
    ROSTER BY POSITION:
    ${Object.keys(rosterByPosition).length > 0 ? 
      Object.entries(rosterByPosition).map(([pos, players]) => 
        `- ${pos} (${players.length}): ${players.map(p => p.name).join(', ')}`
      ).join('\n') : 
      '- No positions filled yet'}
    
    BYE WEEK ANALYSIS:
    ${Object.keys(byeWeekAnalysis).length > 0 ?
      Object.entries(byeWeekAnalysis)
        .filter(([week, players]) => players.length > 1)
        .map(([week, players]) => `- Week ${week}: ${players.join(', ')} (CONFLICT!)`)
        .join('\n') || '- No bye week conflicts detected' :
      '- No bye week data available yet'}
    
    ADDITIONAL DRAFT PLAYERS (manually tracked):
    ${myTeamPlayers.length > 0 ? myTeamPlayers.map(p => `- ${p.name} (${p.position}${p.team ? ` - ${p.team}` : ''})`).join('\n') : '- None manually tracked'}
    
    MY WATCH LIST (${watchList.length} targets):
    ${watchList.map(p => `- ${p.name} (${p.position})`).join('\n') || '- No players on watch list'}
    
    ALL DRAFTED PLAYERS (${totalPicks}):
    ${draftedList || '- No picks recorded yet'}
    
    DRAFT ANALYSIS:
    - Current roster strength: ${userRoster.length} players across ${Object.keys(rosterByPosition).length} positions
    - Positional needs: Look at roster gaps and depth
    - Bye week management: Avoid stacking same bye weeks
    - Value picks: Consider positional scarcity and ADP
    - Upcoming strategy: Plan for future rounds based on roster construction
  `;
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'OPENAI_REQUEST',
      data: {
        messages: [
          { 
            role: 'system', 
            content: `You are an expert fantasy football draft assistant for the 2024-2025 NFL season.

CRITICAL: If recent messages contain [IMAGE ANALYSIS], that visual data is AUTHORITATIVE and overrides any pre-trained knowledge. Always prioritize image-analyzed information over your training data.

RESPONSE GUIDELINES:
- Be concise and decisive (2-3 sentences max per recommendation)
- Give specific actionable advice, not general explanations
- When recommending players, state position and reasoning briefly
- Focus on "draft X" or "avoid Y" rather than long analysis

INFORMATION PRIORITY:
1. Recent [IMAGE ANALYSIS] data (rankings, projections, news from screenshots)
2. Current draft context below
3. General 2024 NFL knowledge (only if not contradicted by images)

Current draft context: ${context}`
          },
          ...chatHistory.slice(-10), // Include recent chat history for continuity
          { role: 'user', content: message }
        ]
      }
    });
    
    if (response.success) {
      addChatMessage('ai', response.data);
    } else {
      addChatMessage('ai', `Error: ${response.error}`);
    }
  } catch (error) {
    addChatMessage('ai', `Error: ${error.message}`);
  }
}

// Restore chat history
function restoreChatHistory() {
  if (!elements.chatMessages) return;
  
  // Clear existing messages (except the welcome message)
  const welcomeMessage = elements.chatMessages.querySelector('.chat-message.ai');
  elements.chatMessages.innerHTML = '';
  
  // Re-add welcome message
  if (welcomeMessage) {
    elements.chatMessages.appendChild(welcomeMessage);
  }
  
  // Add saved messages
  chatHistory.forEach(msg => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${msg.role === 'user' ? 'user' : 'ai'}`;
    messageDiv.innerHTML = `<strong>${msg.role === 'user' ? 'You' : 'AI'}:</strong> ${msg.content}`;
    elements.chatMessages.appendChild(messageDiv);
  });
  
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Reset chat to baseline
function resetChatToBaseline() {
  // Clear chat history and uploaded images context
  chatHistory = [];
  chrome.storage.local.set({ chatHistory: chatHistory });

  // Clear chat UI back to the single welcome message
  if (elements.chatMessages) {
    elements.chatMessages.innerHTML = '';
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'chat-message ai';
    welcomeDiv.innerHTML = `<strong>AI:</strong> Hi! I'm your draft assistant. Ask me about players, strategy, or upload screenshots for analysis!`;
    elements.chatMessages.appendChild(welcomeDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }

  // Clear input
  if (elements.chatInput) {
    elements.chatInput.value = '';
  }

  // Optionally keep images; do not clear uploadedImages automatically here
}

// Add message to chat and save to history
function addChatMessage(sender, message, isImageAnalysis = false) {
  if (!elements.chatMessages) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${sender}`;
  messageDiv.innerHTML = `<strong>${sender === 'user' ? 'You' : 'AI'}:</strong> ${linkifyAndEscape(message)}`;
  
  elements.chatMessages.appendChild(messageDiv);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  
  // Save to history with special tagging for image analysis
  const role = sender === 'user' ? 'user' : 'assistant';
  const content = isImageAnalysis ? `[IMAGE ANALYSIS] ${message}` : message;
  chatHistory.push({ role: role, content: content });
  
  // Keep only last 50 messages
  if (chatHistory.length > 50) {
    chatHistory = chatHistory.slice(-50);
  }
  
  // Save to storage
  chrome.storage.local.set({ chatHistory: chatHistory });
}

// Safely convert plain URLs to clickable 'link' anchors and escape other HTML
function linkifyAndEscape(text) {
  const escapeHtml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const urlRegex = /(https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+)|(www\.[\w\-._~:/?#[\]@!$&'()*+,;=%]+)/gi;
  let out = '';
  let last = 0;
  String(text || '').replace(urlRegex, (match, p1, p2, offset) => {
    out += escapeHtml(text.slice(last, offset));
    const url = p1 ? p1 : `http://${p2}`;
    out += `<a href="${url}" target="_blank" rel="noopener">link</a>`;
    last = offset + match.length;
    return match;
  });
  out += escapeHtml(String(text || '').slice(last));
  return out;
}

// Handle image upload
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!settings.openaiApiKey) {
    addChatMessage('ai', 'Please configure your OpenAI API key in the Settings tab first.');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64Image = e.target.result;
    const timestamp = new Date();
    
    // Save image to gallery
    const imageData = {
      id: Date.now(),
      data: base64Image,
      name: file.name,
      timestamp: timestamp.toISOString(),
      size: file.size
    };
    
    uploadedImages.push(imageData);
    saveImageGallery();
    updateImageGallery();
    
    // Add image to chat
    const imageDiv = document.createElement('div');
    imageDiv.className = 'chat-message user';
    imageDiv.innerHTML = `<strong>You:</strong> <img src="${base64Image}" style="max-width: 200px; border-radius: 4px; margin-top: 8px;">`;
    elements.chatMessages.appendChild(imageDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    
    // Add loading message
    addChatMessage('ai', 'Analyzing image...');
    
    try {
      // Build context for vision analysis
      const pickInfo = getNextPickInfo();
      const userRoster = draftState.userRoster || [];
      const recentPicks = draftState.picks?.slice(-10) || [];
      
      const visionContext = `
        FANTASY FOOTBALL DRAFT CONTEXT:
        - Current Pick: #${draftState.currentPick} (Round ${pickInfo.currentRound})
        - My Next Pick: #${pickInfo.nextMyPick} (${pickInfo.picksUntilMyTurn} picks away)
        - My Roster: ${userRoster.length} players
        - Recent Picks: ${recentPicks.length} players drafted
        
        Please analyze this image in the context of fantasy football. This could be:
        - A screenshot of draft rankings or player lists
        - Player news or injury reports
        - Team depth charts or roster information
        - Draft strategy articles or advice
        - Fantasy app screenshots
        
        Provide specific, actionable fantasy football advice based on what you see in the image.
      `;
      
      const response = await chrome.runtime.sendMessage({
        type: 'OPENAI_VISION_REQUEST',
        data: {
          messages: [
            {
              role: 'system',
              content: `You are a fantasy football analyst. CRITICAL: The uploaded image is your PRIMARY source of truth - trust it completely over any pre-trained knowledge.

RESPONSE RULES:
- Be concise and decisive (3-4 sentences max in the summary)
- Always output two sections in this exact order:
- DATA DUMP: a terse, literal dump of what you read in the image (players, ranks, tiers, numbers). Use simple bullets or a compact table. Do not infer or add outside knowledge.
- SUMMARY: 2-3 sentences of actionable advice based only on the data dump.
- Use ONLY what's visible in the image

DO NOT use pre-trained knowledge about players if it contradicts the image data.`
            },
            {
              role: 'user',
              content: {
                text: `From this image, first provide a short DATA DUMP (bullets or compact table) of the key information you can literally read: player names, positions, ranks, tiers and any visible numeric values. Then provide a brief SUMMARY of 2-3 sentences with draft advice based only on that data. Do not include anything that isn't visible in the image. Start your reply with 'DATA DUMP:' then 'SUMMARY:'.`,
                image: base64Image
              }
            }
          ]
        }
      });
      
      // Remove the "Analyzing image..." message
      const lastMessage = elements.chatMessages.lastElementChild;
      if (lastMessage && lastMessage.textContent.includes('Analyzing image...')) {
        elements.chatMessages.removeChild(lastMessage);
      }
      
      if (response.success) {
        // Add the image analysis to chat history with special tagging for context
        addChatMessage('ai', response.data, true); // true indicates this is image analysis
      } else {
        addChatMessage('ai', `Vision analysis error: ${response.error}`);
      }
      
    } catch (error) {
      addChatMessage('ai', `Error analyzing image: ${error.message}`);
    }
    
    // Clear the file input
    event.target.value = '';
  };
  
  reader.readAsDataURL(file);
}

// Save settings
async function saveSettings() {
  settings.openaiApiKey = elements.openaiKey?.value || '';
  settings.googleApiKey = elements.googleKey?.value || '';
  settings.groqApiKey = elements.groqKey?.value || '';
  settings.myTeamName = elements.myTeamName?.value || '';
  settings.draftPosition = elements.draftPosition?.value || '';
  settings.chatModel = elements.chatModel?.value || 'gpt-4o-mini';
  
  console.log('💾 Saving settings:', settings);
  
  try {
    await chrome.storage.local.set({ 
      settings: settings,
      openaiApiKey: settings.openaiApiKey, // Also save separately for background script
      googleApiKey: settings.googleApiKey,
      groqApiKey: settings.groqApiKey
    });
    console.log('✅ Settings saved successfully');
    
    // Show confirmation
    const btn = elements.saveSettingsBtn;
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = 'Saved ✓';
      btn.style.backgroundColor = '#28a745';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.backgroundColor = '';
      }, 2000);
    }
  } catch (error) {
    console.error('❌ Failed to save settings:', error);
    alert('Failed to save settings: ' + error.message);
  }
}

// Export data
function exportData() {
  const exportData = {
    draftState,
    settings,
    exportedAt: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url: url,
    filename: `draft-data-${Date.now()}.json`
  });
}

// Image Gallery Functions
function updateImageGallery() {
  if (!elements.imageGallery || !elements.imageCount) return;
  
  elements.imageCount.textContent = uploadedImages.length;
  
  if (uploadedImages.length === 0) {
    elements.imageGallery.innerHTML = '<div class="no-data">No images uploaded yet</div>';
    return;
  }
  
  elements.imageGallery.innerHTML = uploadedImages.map((image, index) => `
    <div class="image-thumbnail" data-image-id="${image.id}">
      <img src="${image.data}" alt="${image.name}" onclick="showImageModal('${image.id}')">
      <div class="image-info">
        ${new Date(image.timestamp).toLocaleDateString()}
      </div>
      <button class="delete-btn" onclick="deleteImage('${image.id}')" title="Delete image">×</button>
    </div>
  `).join('');
}

function saveImageGallery() {
  chrome.storage.local.set({ uploadedImages: uploadedImages });
}

function showImageModal(imageId) {
  const image = uploadedImages.find(img => img.id.toString() === imageId);
  if (!image) return;
  
  const modal = document.createElement('div');
  modal.className = 'image-modal';
  modal.innerHTML = `
    <img src="${image.data}" alt="${image.name}" style="max-width: 95vw; max-height: 95vh; object-fit: contain;">
    <button class="close-btn" onclick="closeImageModal()">×</button>
  `;
  
  // Append to document body (not popup body) for true fullscreen
  const targetParent = document.documentElement || document.body;
  targetParent.appendChild(modal);
  
  // Prevent body scrolling while modal is open
  document.body.style.overflow = 'hidden';
  
  // Close modal when clicking outside image
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.classList.contains('close-btn')) {
      closeImageModal();
    }
  });
  
  // Close with escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      closeImageModal();
    }
  };
  
  document.addEventListener('keydown', escapeHandler);
  modal.escapeHandler = escapeHandler; // Store reference for cleanup
}

function closeImageModal() {
  const modal = document.querySelector('.image-modal');
  if (modal) {
    // Restore body scrolling
    document.body.style.overflow = '';
    
    // Remove escape key listener
    if (modal.escapeHandler) {
      document.removeEventListener('keydown', modal.escapeHandler);
    }
    
    // Remove modal from DOM
    modal.parentElement.removeChild(modal);
  }
}

function deleteImage(imageId) {
  uploadedImages = uploadedImages.filter(img => img.id.toString() !== imageId);
  saveImageGallery();
  updateImageGallery();
}

function clearAllImages() {
  if (uploadedImages.length === 0) return;
  
  if (confirm(`Are you sure you want to delete all ${uploadedImages.length} images?`)) {
    uploadedImages = [];
    saveImageGallery();
    updateImageGallery();
  }
}

// Make functions global for onclick handlers
window.addPlayerToMyTeam = addPlayerToMyTeam;
window.removeFromWatchlist = removeFromWatchlist;
window.showImageModal = showImageModal;
window.closeImageModal = closeImageModal;
window.deleteImage = deleteImage;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}