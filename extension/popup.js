// Popup script for Fantasy Draft Assistant
console.log('🏈 Fantasy Draft Assistant popup loaded');

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

let settings = {
  openaiApiKey: '',
  myTeamName: '',
  draftPosition: ''
};

let chatHistory = [];
let uploadedImages = [];
let csvDatasets = {}; // id -> { id, name, columns, normalizedColumns, rows, timestamp }
let lastLeagueId = null;
let lastPickCount = null;
let chatErrorState = false; // Track if chat is in error state
let lastErrorTime = null;

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
  csvUpload: document.getElementById('csv-upload'),
  csvUploadBtn: document.getElementById('csv-upload-btn'),
  csvCount: document.getElementById('csv-count'),
  clearCsvsBtn: document.getElementById('clear-csvs'),
  csvChips: document.getElementById('csv-chips'),
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
  resetChatBtn: document.getElementById('reset-chat'),
  truncateChatBtn: document.getElementById('truncate-chat'),
  keeperNameInput: document.getElementById('keeper-name-input'),
  addKeeperBtn: document.getElementById('add-keeper'),
  bulkAddKeepersBtn: document.getElementById('bulk-add-keepers'),
  keepersList: document.getElementById('keepers-list'),
  keepersCount: document.getElementById('keepers-count')
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
  
  // Ensure draftedPlayers is synced with initial keepers
  if (draftState.keepers && draftState.keepers.length > 0) {
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONTEXT_PARTIAL',
      data: { 
        draftedPlayers: draftState.picks.map(p => p.player?.name).filter(Boolean)
      }
    }).catch(() => {});
  }
  
  // Set up auto-refresh for draft picks every 10 seconds
  setInterval(() => {
    if (draftState.leagueId) { // Only refresh if we're in a draft
      requestDraftData();
    }
  }, 10000);
}

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings', 'openaiApiKey', 'googleApiKey', 'groqApiKey', 'chatHistory', 'uploadedImages', 'lastLeagueId', 'lastPickCount', 'csvDatasets', 'pendingChatResponse', 'keepers']);
  
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
  
  // Check for pending response
  if (result.pendingChatResponse) {
    // Add the pending response to chat
    setTimeout(() => {
      addChatMessage('ai', result.pendingChatResponse.response);
      // Show notification that response was loaded
      const notificationDiv = document.createElement('div');
      notificationDiv.className = 'chat-notification';
      notificationDiv.textContent = '✓ Response received while you were away';
      notificationDiv.style.cssText = 'background: #28a745; color: white; padding: 8px; border-radius: 4px; margin: 8px; text-align: center;';
      elements.chatMessages?.insertBefore(notificationDiv, elements.chatMessages.firstChild);
      
      // Remove notification after 3 seconds
      setTimeout(() => {
        if (notificationDiv.parentNode) {
          notificationDiv.parentNode.removeChild(notificationDiv);
        }
      }, 3000);
    }, 500);
    
    // Clear the pending response
    chrome.storage.local.remove('pendingChatResponse');
  }
  
  // Load uploaded images
  if (result.uploadedImages) {
    uploadedImages = result.uploadedImages;
    updateImageGallery();
  }
  // Load CSV datasets
  if (result.csvDatasets && typeof result.csvDatasets === 'object') {
    csvDatasets = result.csvDatasets;
    updateCsvUI();
    // Share with background so it's in context immediately
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONTEXT_PARTIAL',
      data: { csvDatasets }
    }).catch(() => {});
  }
  if (result.lastLeagueId) {
    lastLeagueId = result.lastLeagueId;
  }
  if (typeof result.lastPickCount === 'number') {
    lastPickCount = result.lastPickCount;
  }
  
  // Load keepers
  if (result.keepers && Array.isArray(result.keepers)) {
    draftState.keepers = result.keepers;
    
    // Add keepers to picks if not already there
    result.keepers.forEach(keeperName => {
      // Check if this keeper is already in picks
      const alreadyInPicks = draftState.picks.some(pick => 
        pick.player?.name === keeperName && pick.player?.position === 'KEEPER'
      );
      
      if (!alreadyInPicks) {
        const keeperPick = {
          pickNumber: 0,
          player: {
            name: keeperName,
            position: 'KEEPER',
            team: 'KEEPER'
          },
          draftingTeam: 'Keeper'
        };
        draftState.picks.push(keeperPick);
      }
    });
    
    // Immediately sync to background context (keepers are now in draftedPlayers)
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONTEXT_PARTIAL',
      data: { 
        draftedPlayers: draftState.picks.map(p => p.player?.name).filter(Boolean)
      }
    }).catch(() => {});
  }
  
  console.log('⚙️ Settings loaded:', { 
    hasApiKey: !!settings.openaiApiKey, 
    teamName: settings.myTeamName,
    chatMessages: chatHistory.length,
    images: uploadedImages.length,
    hasPendingResponse: !!result.pendingChatResponse,
    keepers: draftState.keepers.length
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
      // Save current keepers before updating state
      const currentKeepers = draftState.keepers || [];
      
      // Auto-reset chat if league changed
      if (response.leagueId && lastLeagueId && response.leagueId !== lastLeagueId) {
        resetChatToBaseline();
      }
      draftState = { ...draftState, ...response };
      
      // Restore keepers if they were cleared
      if (currentKeepers.length > 0) {
        draftState.keepers = currentKeepers;
        // Re-add keeper picks if missing
        currentKeepers.forEach(keeperName => {
          const alreadyInPicks = draftState.picks.some(pick => 
            pick.player?.name === keeperName && pick.player?.position === 'KEEPER'
          );
          if (!alreadyInPicks) {
            draftState.picks.unshift({
              pickNumber: 0,
              player: {
                name: keeperName,
                position: 'KEEPER',
                team: 'KEEPER'
              },
              draftingTeam: 'Keeper'
            });
          }
        });
      }
      
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
          applyDraftResponse(response);
        }
      });
    }
  });
}

function addKeepersToPicks() {
  if (!draftState.keepers || draftState.keepers.length === 0) return;

  draftState.keepers.forEach(keeperName => {
    const alreadyInPicks = draftState.picks.some(pick =>
      pick.player?.name === keeperName && pick.player?.position === 'KEEPER'
    );

    if (!alreadyInPicks) {
      draftState.picks.unshift({
        pickNumber: 0,
        player: {
          name: keeperName,
          position: 'KEEPER',
          team: 'KEEPER'
        },
        draftingTeam: 'Keeper'
      });
    }
  });
}

function applyDraftResponse(response) {
  if (!response) return;

  if (response.leagueId && lastLeagueId && response.leagueId !== lastLeagueId) {
    resetChatToBaseline();
  }

  const currentKeepers = draftState.keepers || [];
  draftState = { ...draftState, ...response };

  if (currentKeepers.length > 0 && (!draftState.keepers || draftState.keepers.length === 0)) {
    draftState.keepers = currentKeepers;
  }

  addKeepersToPicks();

  if (response.leagueId && response.leagueId !== lastLeagueId) {
    lastLeagueId = response.leagueId;
    chrome.storage.local.set({ lastLeagueId });
  }

  if (Array.isArray(response.picks)) {
    if (typeof lastPickCount === 'number' && lastPickCount > 0 && response.picks.length === 0) {
      resetChatToBaseline();
    }
    lastPickCount = response.picks.length;
    chrome.storage.local.set({ lastPickCount });
  }

  updateUI();
}

function sendMessageToEspnTab(tab, message, onSuccess, onFailure) {
  chrome.tabs.sendMessage(tab.id, message, (response) => {
    if (!chrome.runtime.lastError && response) {
      onSuccess(response);
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    }, () => {
      if (chrome.runtime.lastError) {
        onFailure?.(chrome.runtime.lastError.message);
        return;
      }

      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, message, (retryResponse) => {
          if (chrome.runtime.lastError || !retryResponse) {
            onFailure?.(chrome.runtime.lastError?.message || 'No response from content script');
            return;
          }
          onSuccess(retryResponse);
        });
      }, 500);
    });
  });
}

// Clear current picks and force content to re-extract, then sync UI
function refreshAndSync() {
  // Show loading state
  if (elements.refreshPicksBtn) {
    elements.refreshPicksBtn.disabled = true;
    elements.refreshPicksBtn.textContent = 'Refreshing...';
  }
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url.includes('fantasy.espn.com')) {
      // Reset button
      if (elements.refreshPicksBtn) {
        elements.refreshPicksBtn.disabled = false;
        elements.refreshPicksBtn.textContent = 'Refresh Picks';
      }
      return;
    }
    
    sendMessageToEspnTab(tab, { type: 'FORCE_EXTRACT' }, (response) => {
      const currentKeepers = draftState.keepers || [];
      applyDraftResponse(response);
      addDebugLog(`Refreshed: ${response.picks?.length || 0} picks found (+ ${currentKeepers.length} keepers)`);

      if (elements.refreshPicksBtn) {
        elements.refreshPicksBtn.disabled = false;
        elements.refreshPicksBtn.textContent = 'Refresh Picks';
      }
    }, (errorMessage) => {
      console.error('Refresh error:', errorMessage);
      addDebugLog('Failed to refresh: ' + errorMessage);
      if (elements.refreshPicksBtn) {
        elements.refreshPicksBtn.disabled = false;
        elements.refreshPicksBtn.textContent = 'Refresh Picks';
      }
    });
  });
}

// Set up event listeners
function setupEventListeners() {
  // Draft board actions
  elements.addToWatchlistBtn?.addEventListener('click', addToWatchlist);
  elements.refreshPicksBtn?.addEventListener('click', refreshAndSync);
  
  // Keeper actions
  elements.addKeeperBtn?.addEventListener('click', addKeeper);
  elements.bulkAddKeepersBtn?.addEventListener('click', bulkAddKeepers);
  elements.keeperNameInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addKeeper();
  });
  
  // Chat actions
  elements.sendChatBtn?.addEventListener('click', sendChatMessage);
  elements.chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
  elements.resetChatBtn?.addEventListener('click', resetChatToBaseline);
  elements.truncateChatBtn?.addEventListener('click', truncateChatHistory);
  elements.uploadBtn?.addEventListener('click', () => elements.imageUpload?.click());
  elements.imageUpload?.addEventListener('change', handleImageUpload);
  elements.csvUploadBtn?.addEventListener('click', () => elements.csvUpload?.click());
  elements.csvUpload?.addEventListener('change', handleCsvUpload);
  elements.clearCsvsBtn?.addEventListener('click', clearAllCSVs);
  // CSV chips: handle remove via event delegation
  elements.csvChips?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-btn');
    if (!btn) return;
    const id = btn.getAttribute('data-csv-id');
    if (!id) return;
    delete csvDatasets[id];
    chrome.storage.local.set({ csvDatasets }).catch(() => {});
    chrome.runtime.sendMessage({ type: 'UPDATE_CONTEXT_PARTIAL', data: { csvDatasets } }).catch(() => {});
    updateCsvUI();
    addDebugLog(`Removed CSV: ${btn.textContent.replace(/^×\s*/, '')}`);
  });
  
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
  elements.recentPicks?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-player]');
    if (!button) return;
    addPlayerToMyTeam(button.dataset.playerName, button.dataset.playerPosition);
  });
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PICK_UPDATE') {
      // Single pick update
      if (!draftState.picks.some(p => p.pickNumber === request.data.pickNumber)) {
        draftState.picks.push(request.data);
        draftState.currentPick = draftState.picks.length + 1;
        updateUI();
        addDebugLog(`New pick #${request.data.pickNumber}: ${request.data.player?.name}`);
      }
    } else if (request.type === 'PICKS_REPLACED') {
      // Full picks replacement - preserve keepers
      const oldCount = draftState.picks.length;
      const keeperPicks = draftState.picks.filter(pick => 
        pick.player?.position === 'KEEPER'
      );
      
      draftState.picks = request.data || [];
      
      // Re-add keeper picks at the beginning
      if (keeperPicks.length > 0) {
        // Add keepers that aren't already in the new picks
        keeperPicks.forEach(keeperPick => {
          const alreadyExists = draftState.picks.some(pick => 
            pick.player?.name === keeperPick.player?.name && pick.player?.position === 'KEEPER'
          );
          if (!alreadyExists) {
            draftState.picks.unshift(keeperPick);
          }
        });
      }
      
      draftState.currentPick = draftState.picks.length + 1;
      updateUI();
      if (oldCount !== draftState.picks.length) {
        addDebugLog(`Picks updated: ${oldCount} → ${draftState.picks.length}`);
      }
    } else if (request.type === 'DRAFT_UPDATE') {
      // Full draft state update from content script
      if (request.data) {
        const oldPickCount = draftState.picks.length;
        const currentKeepers = draftState.keepers || [];
        
        draftState = { ...draftState, ...request.data };
        
        // Restore keepers if they were cleared
        if (currentKeepers.length > 0 && (!draftState.keepers || draftState.keepers.length === 0)) {
          draftState.keepers = currentKeepers;
          
          // Re-add keepers to picks if missing
          currentKeepers.forEach(keeperName => {
            const alreadyInPicks = draftState.picks.some(pick => 
              pick.player?.name === keeperName && pick.player?.position === 'KEEPER'
            );
            
            if (!alreadyInPicks) {
              draftState.picks.unshift({
                pickNumber: 0,
                player: {
                  name: keeperName,
                  position: 'KEEPER',
                  team: 'KEEPER'
                },
                draftingTeam: 'Keeper'
              });
            }
          });
        }
        
        updateUI();
        if (oldPickCount !== draftState.picks.length) {
          addDebugLog(`Draft sync: ${oldPickCount} → ${draftState.picks.length} picks`);
        }
      }
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
  // First, ensure keepers are always in picks
  if (draftState.keepers && draftState.keepers.length > 0) {
    draftState.keepers.forEach(keeperName => {
      const alreadyInPicks = draftState.picks.some(pick => 
        pick.player?.name === keeperName && pick.player?.position === 'KEEPER'
      );
      if (!alreadyInPicks) {
        draftState.picks.unshift({
          pickNumber: 0,
          player: {
            name: keeperName,
            position: 'KEEPER',
            team: 'KEEPER'
          },
          draftingTeam: 'Keeper'
        });
      }
    });
  }
  
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
  
  // Update keepers
  updateKeepers();
  
  // Update debug info
  updateDebugInfo();
  // Keep background context in sync (myTeam and draftedPlayers which includes keepers)
  // Count keepers in the drafted list
  const keeperCount = draftState.picks.filter(p => p.player?.position === 'KEEPER').length;
  const draftedNames = draftState.picks.map(p => p.player?.name).filter(Boolean);
  
  console.log(`📋 Updating context: ${draftedNames.length} total players (${keeperCount} keepers)`);
  
  chrome.runtime.sendMessage({
    type: 'UPDATE_CONTEXT_PARTIAL',
    data: {
      myTeam: draftState.myTeam.map(p => p.name),
      draftedPlayers: draftedNames // This now includes keepers
    }
  }).catch(() => {});
  // Also update background with CSV presence
  chrome.runtime.sendMessage({
    type: 'UPDATE_CONTEXT_PARTIAL',
    data: { csvDatasets }
  }).catch(() => {});
}
function updateCsvBadge() {
  if (!elements.csvCount) return;
  const count = Object.keys(csvDatasets).length;
  elements.csvCount.style.display = count > 0 ? 'inline-block' : 'none';
  elements.csvCount.textContent = `CSVs: ${count}`;
  const names = Object.values(csvDatasets).map(d => d.name).join(', ');
  elements.csvCount.title = count > 0 ? `CSV datasets loaded: ${names}` : 'CSV datasets loaded';
}

function updateCsvChips() {
  if (!elements.csvChips) return;
  const list = Object.values(csvDatasets);
  if (list.length === 0) {
    elements.csvChips.innerHTML = '';
    if (elements.clearCsvsBtn) elements.clearCsvsBtn.style.display = 'none';
    return;
  }
  const escapeHtml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  elements.csvChips.innerHTML = list.map(ds => (
    `<button class="chip-btn" data-csv-id="${ds.id}" title="Remove ${escapeHtml(ds.name)}">× ${escapeHtml(ds.name)}</button>`
  )).join('');
  if (elements.clearCsvsBtn) elements.clearCsvsBtn.style.display = 'inline';
}

function updateCsvUI() {
  updateCsvBadge();
  updateCsvChips();
}

function normalizeHeader(header, index) {
  if (header == null) header = '';
  const trimmed = String(header).trim().replace(/^"|"$/g, '');
  let normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  if (!normalized) normalized = index === 0 ? 'index' : `col_${index + 1}`;
  const aliasMap = { pos: 'position', plyr: 'player', ppr: 'points', proj: 'points', projection: 'points', projections: 'points', team_name: 'team' };
  if (aliasMap[normalized]) normalized = aliasMap[normalized];
  return normalized;
}

function parseCsvText(text) {
  // Light CSV parse to avoid adding dependencies in extension
  // Attempt to split lines and commas while respecting basic quotes
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { // escaped quote
        cell += '"'; i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
      row = []; cell = '';
      // swallow \r\n pairs
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }

  if (rows.length === 0) return { columns: [], normalizedColumns: [], rows: [], rawRowCount: 0 };
  // Decide if first row is header: if any cell is non-numeric or has spaces/letters, treat as header
  const headerRow = rows[0];
  const likelyHeader = headerRow.some(c => /[A-Za-z]/.test(c));
  let columns = [];
  let normalizedColumns = [];
  let dataRows = [];
  if (likelyHeader) {
    columns = headerRow.map(c => (c || '').replace(/^"|"$/g, ''));
    normalizedColumns = columns.map((c, i) => normalizeHeader(c, i));
    dataRows = rows.slice(1).map((r, ri) => {
      const obj = {};
      normalizedColumns.forEach((col, i) => { obj[col] = r[i]; });
      if (Object.prototype.hasOwnProperty.call(obj, 'index') && (obj.index == null || obj.index === '')) obj.index = ri + 1;
      return obj;
    });
  } else {
    columns = headerRow.map((_, i) => `col_${i + 1}`);
    normalizedColumns = columns.map((c, i) => normalizeHeader(c, i));
    dataRows = rows.slice(1).map((r, ri) => {
      const obj = {};
      normalizedColumns.forEach((col, i) => { obj[col] = r[i]; });
      if (Object.prototype.hasOwnProperty.call(obj, 'index') && (obj.index == null || obj.index === '')) obj.index = ri + 1;
      return obj;
    });
  }

  return { columns, normalizedColumns, rows: dataRows, rawRowCount: rows.length };
}

async function handleCsvUpload(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  for (const file of files) {
    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      const id = `${file.name}_${Date.now()}`;
      csvDatasets[id] = { id, name: file.name, ...parsed, timestamp: new Date().toISOString() };
      addDebugLog(`CSV loaded: ${file.name} — rows: ${parsed.rows.length}, cols: ${parsed.normalizedColumns.length}`);
    } catch (e) {
      console.error('CSV parse error:', e);
      addDebugLog(`CSV parse error: ${e.message}`);
    }
  }
  // Persist to storage for background usage
  chrome.storage.local.set({ csvDatasets }).catch(() => {});
  // Push to background context immediately
  chrome.runtime.sendMessage({ type: 'UPDATE_CONTEXT_PARTIAL', data: { csvDatasets } }).catch(() => {});
  updateCsvUI();
  // Clear input
  event.target.value = '';
}

function clearAllCSVs() {
  if (Object.keys(csvDatasets).length === 0) return;
  if (!confirm('Clear all uploaded CSV datasets?')) return;
  csvDatasets = {};
  chrome.storage.local.set({ csvDatasets }).catch(() => {});
  chrome.runtime.sendMessage({ type: 'UPDATE_CONTEXT_PARTIAL', data: { csvDatasets } }).catch(() => {});
  updateCsvUI();
  addDebugLog('Cleared all CSV datasets');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
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
      <span class="pick-number">#${escapeHtml(pick.pickNumber)}</span>
      <div class="player-info">
        <div class="player-name">${escapeHtml(pick.player.name)}</div>
        <div class="player-details">${escapeHtml(pick.player.position)} - ${escapeHtml(pick.player.team)}</div>
      </div>
      <button class="btn btn-small" data-add-player data-player-name="${escapeAttr(pick.player.name)}" data-player-position="${escapeAttr(pick.player.position)}">
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
        <span class="player-name">${escapeHtml(player.name)}</span>
        <span class="player-position">${escapeHtml(player.position)}</span>
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
        <span class="player-name">${escapeHtml(player.name)}</span>
        <span class="player-position">${escapeHtml(player.position)}</span>
      </div>
      <button class="btn btn-small" onclick="removeFromWatchlist(${index})">Remove</button>
    </div>
  `).join('');
}

// Update keepers display
function updateKeepers() {
  if (!elements.keepersList || !elements.keepersCount) return;
  
  elements.keepersCount.textContent = draftState.keepers.length;
  
  if (draftState.keepers.length === 0) {
    elements.keepersList.innerHTML = '<div class="no-data">No keeper players added yet</div>';
    return;
  }
  
  elements.keepersList.innerHTML = draftState.keepers.map((keeper, index) => {
    // Handle both string and object formats
    const keeperName = typeof keeper === 'string' ? keeper : keeper.name || keeper.player?.name || '[Unknown]';
    return `
      <div class="player-card">
        <div>
          <span class="player-name">${escapeHtml(keeperName)}</span>
          <span class="player-position" style="color: #dc3545;">KEEPER</span>
        </div>
        <button class="btn btn-small keeper-remove-btn" data-index="${index}">Remove</button>
      </div>
    `;
  }).join('');
  
  // Add event listeners to remove buttons
  document.querySelectorAll('.keeper-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      removeKeeper(index);
    });
  });
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
    
    sendMessageToEspnTab(tab, { type: 'DEBUG_DOM' }, (response) => {
      addDebugLog(`✅ Communication working!`);
      addDebugLog(`Elements found: ${response.elementCount}`);
      addDebugLog(`Title: ${response.pageTitle}`);
      console.log('🔍 DOM Debug Response:', response);

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
    }, (errorMessage) => {
      addDebugLog(`Message error: ${errorMessage}`);
      tryDirectInspection(tab.id);
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
    
    sendMessageToEspnTab(tab, { type: 'FORCE_EXTRACT' }, (response) => {
      const currentKeepers = draftState.keepers || [];
      applyDraftResponse(response);
      addDebugLog(`✅ Extracted ${response.picks?.length || 0} picks, ${response.userRoster?.length || 0} roster players (+ ${currentKeepers.length} keepers)`);
    }, (errorMessage) => {
      addDebugLog(`Message error: ${errorMessage}`);
      tryDirectExtraction(tab.id);
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
      
      // Preserve keepers before updating
      const currentKeepers = draftState.keepers || [];
      
      // Update state with what we found
      draftState = { ...draftState, ...extractedData };
      
      // Restore keepers and add to picks
      if (currentKeepers.length > 0) {
        draftState.keepers = currentKeepers;
        
        // Re-add keepers to picks
        currentKeepers.forEach(keeperName => {
          const alreadyInPicks = draftState.picks.some(pick => 
            pick.player?.name === keeperName && pick.player?.position === 'KEEPER'
          );
          
          if (!alreadyInPicks) {
            draftState.picks.unshift({
              pickNumber: 0,
              player: {
                name: keeperName,
                position: 'KEEPER',
                team: 'KEEPER'
              },
              draftingTeam: 'Keeper'
            });
          }
        });
      }
      
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

// Add keeper
function addKeeper() {
  const keeperName = elements.keeperNameInput?.value.trim();
  
  if (!keeperName) return;
  
  // Check if already exists
  if (draftState.keepers.includes(keeperName)) {
    addDebugLog(`${keeperName} is already in keepers list`);
    return;
  }
  
  // Add to keepers list for display
  draftState.keepers.push(keeperName);
  
  // ALSO add to draftedPlayers as a keeper pick
  const keeperPick = {
    pickNumber: 0, // Keepers are pre-draft, so pick 0
    player: {
      name: keeperName,
      position: 'KEEPER',
      team: 'KEEPER'
    },
    draftingTeam: 'Keeper'
  };
  
  // Add to picks array
  draftState.picks.push(keeperPick);
  
  // Clear input
  if (elements.keeperNameInput) elements.keeperNameInput.value = '';
  
  // Update UI and save
  updateKeepers();
  updateUI(); // This will update drafted players list
  saveKeepers();
  
  // Update context for AI - keepers are now in draftedPlayers
  chrome.runtime.sendMessage({
    type: 'UPDATE_CONTEXT_PARTIAL',
    data: { 
      draftedPlayers: draftState.picks.map(p => p.player?.name).filter(Boolean)
    }
  });
  
  addDebugLog(`Added keeper: ${keeperName} (also added to drafted players)`);
}

// Bulk add keepers
function bulkAddKeepers() {
  const bulkInput = prompt('Enter multiple keeper names (one per line):');
  if (!bulkInput) return;
  
  const newNames = bulkInput
    .split('\n')
    .map(name => name.trim())
    .filter(name => name.length > 0 && !draftState.keepers.includes(name));
  
  if (newNames.length > 0) {
    // Add to keepers list
    draftState.keepers = [...draftState.keepers, ...newNames];
    
    // Add each keeper to draftedPlayers
    newNames.forEach(keeperName => {
      const keeperPick = {
        pickNumber: 0, // Keepers are pre-draft
        player: {
          name: keeperName,
          position: 'KEEPER',
          team: 'KEEPER'
        },
        draftingTeam: 'Keeper'
      };
      draftState.picks.push(keeperPick);
    });
    
    updateKeepers();
    updateUI(); // Update drafted players display
    saveKeepers();
    
    // Update context for AI - keepers are now in draftedPlayers
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONTEXT_PARTIAL',
      data: { 
        draftedPlayers: draftState.picks.map(p => p.player?.name).filter(Boolean)
      }
    });
    
    addDebugLog(`Added ${newNames.length} keepers (also added to drafted players)`);
  }
}

// Remove keeper
function removeKeeper(index) {
  const removed = draftState.keepers[index];
  draftState.keepers.splice(index, 1);
  
  // Also remove from picks array
  draftState.picks = draftState.picks.filter(pick => 
    !(pick.player?.name === removed && pick.player?.position === 'KEEPER')
  );
  
  updateKeepers();
  updateUI(); // Update drafted players display
  saveKeepers();
  
  // Update context for AI - update draftedPlayers (keepers removed)
  chrome.runtime.sendMessage({
    type: 'UPDATE_CONTEXT_PARTIAL',
    data: { 
      draftedPlayers: draftState.picks.map(p => p.player?.name).filter(Boolean)
    }
  });
  
  addDebugLog(`Removed keeper: ${removed} (also removed from drafted players)`);
}

// Save keepers to storage
function saveKeepers() {
  chrome.storage.local.set({ 
    keepers: draftState.keepers,
    draftState: draftState // Save entire draft state including picks
  });
  
  // Always sync to background immediately
  chrome.runtime.sendMessage({
    type: 'UPDATE_CONTEXT_PARTIAL',
    data: { 
      draftedPlayers: draftState.picks.map(p => p.player?.name).filter(Boolean)
    }
  }).catch(() => {});
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
  
  // Check if we're in error state and need to wait
  if (chatErrorState && lastErrorTime) {
    const timeSinceError = Date.now() - lastErrorTime;
    if (timeSinceError < 5000) { // 5 second cooldown after errors
      addChatMessage('ai', 'Please wait a moment before sending another message.');
      return;
    }
    // Clear error state if enough time has passed
    clearChatErrorState();
  }
  
  // Add user message to chat
  addChatMessage('user', message);
  
  // Store the message in case we need to restore it on error
  const originalMessage = message;
  elements.chatInput.value = '';
  
  // Add loading animation
  showChatLoading();
  
  // Generate a unique message ID for tracking
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Debug: Log current draft state before building context
  console.log('🐛 Current draft state for context:', {
    picks: draftState.picks?.length || 0,
    myTeam: draftState.myTeam?.length || 0,
    teams: draftState.teams?.length || 0,
    currentPick: draftState.currentPick,
    userTeamName: draftState.userTeamName,
    leagueId: draftState.leagueId,
    keepers: draftState.keepers
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
  
  // All unavailable players are now in picks (including keepers) - just names, no positions to save tokens
  const allUnavailable = draftState.picks.map(p => p.player.name).filter(Boolean);

  // Create optimized context (reduce tokens)
  const rosterSummary = Object.entries(rosterByPosition)
    .map(([pos, players]) => `${pos}:${players.length}`)
    .join(', ') || 'Empty';
  
  const byeConflicts = Object.entries(byeWeekAnalysis)
    .filter(([week, players]) => players.length > 1)
    .map(([week, players]) => `Wk${week}:${players.length}`)
    .join(', ');

  const context = `P#${draftState.currentPick}/R${pickInfo.currentRound} Next:${pickInfo.picksUntilMyTurn}away
Team:${rosterSummary}${byeConflicts ? ` Bye:${byeConflicts}` : ''}`;
  
  // Store pending message info
  const pendingMessage = {
    id: messageId,
    userMessage: message,
    timestamp: Date.now(),
    context: context
  };
  
  // Save to storage so background can process it
  chrome.storage.local.set({ 
    pendingChatMessage: pendingMessage,
    chatHistory: chatHistory 
  });

  try {
    // Send CSV data to background
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONTEXT_PARTIAL',
      data: { 
        csvDatasets: csvDatasets,
        draftedPlayers: allUnavailable // Just the names as strings
      }
    }).catch(() => {});
    
    const response = await chrome.runtime.sendMessage({
      type: 'OPENAI_REQUEST',
      messageId: messageId,
      data: {
        messages: [
          { 
            role: 'system', 
            content: `Draft assistant. ${allUnavailable.length} players unavailable.
${context}
Give ONE pick with supporting data. Format: "PICK: [Name] - [key stats]"
${csvDatasets && Object.keys(csvDatasets).length > 0 ? 'Using your rankings' : 'Using consensus'}`
          },
          ...chatHistory.slice(-4), // Reduce chat history to save tokens
          { role: 'user', content: message }
        ]
      }
    });
    
    if (response.success) {
      hideChatLoading();
      
      // Check for empty response
      if (!response.data || response.data.trim() === '') {
        console.error('Received empty response');
        addChatMessage('ai', 'I received an empty response. Let me try again...');
        
        // Retry once automatically
        setTimeout(async () => {
          showChatLoading();
          try {
            const retryResponse = await chrome.runtime.sendMessage({
              type: 'OPENAI_REQUEST',
              data: {
                messages: [
                  { 
                    role: 'system', 
                    content: `You are an expert fantasy football draft assistant. 

${context}

${csvDatasets && Object.keys(csvDatasets).length > 0 ? 
  `USING YOUR RANKINGS: ${Object.values(csvDatasets).map(ds => ds.name).join(', ')}` : 
  'USING CONSENSUS RANKINGS (suggest uploading custom rankings for personalized advice)'}`
                  },
                  ...chatHistory.slice(-6), // Keep same history as main request
                  { role: 'user', content: message }
                ]
              }
            });
            
            hideChatLoading();
            if (retryResponse.success && retryResponse.data && retryResponse.data.trim()) {
              addChatMessage('ai', retryResponse.data);
              chatErrorState = false;
              lastErrorTime = null;
            } else {
              handleChatError('Still receiving empty responses. Please try a different question.', originalMessage);
            }
          } catch (retryError) {
            hideChatLoading();
            handleChatError(retryError.message, originalMessage);
          }
        }, 1000);
        
        return;
      }
      
      addChatMessage('ai', response.data);
      // Clear error state on success
      chatErrorState = false;
      lastErrorTime = null;
      
      // Estimate token usage (rough estimate)
      const estimatedTokens = Math.ceil((context.length + message.length + response.data.length) / 4);
      console.log(`📊 Estimated tokens used: ~${estimatedTokens}`);
      addDebugLog(`Chat response received (~${estimatedTokens} tokens)`);
    } else {
      hideChatLoading();
      handleChatError(response.error || 'Unknown error occurred', originalMessage);
    }
  } catch (error) {
    hideChatLoading();
    handleChatError(error.message, originalMessage);
  }
}

// Show chat loading animation
function showChatLoading() {
  if (!elements.chatMessages) return;
  
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'chat-loading';
  loadingDiv.id = 'chat-loading';
  loadingDiv.innerHTML = `
    <strong>AI:</strong>
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  
  elements.chatMessages.appendChild(loadingDiv);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Hide chat loading animation
function hideChatLoading() {
  const loadingDiv = document.getElementById('chat-loading');
  if (loadingDiv && loadingDiv.parentNode) {
    loadingDiv.parentNode.removeChild(loadingDiv);
  }
}

// Handle chat errors with recovery
function handleChatError(errorMessage, originalMessage = null) {
  console.error('Chat error:', errorMessage);
  
  // Track error state
  chatErrorState = true;
  lastErrorTime = Date.now();
  
  // Determine error type and provide helpful message
  let userMessage = '';
  let recoveryAction = null;
  
  if (errorMessage.includes('API key')) {
    userMessage = 'Please configure your API key in the Settings tab.';
    recoveryAction = 'configure_api_key';
  } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    userMessage = 'Rate limit reached. Please wait a moment before trying again.';
    recoveryAction = 'wait_and_retry';
  } else if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
    userMessage = 'Network error. Please check your connection and try again.';
    recoveryAction = 'check_network';
  } else if (errorMessage.includes('context length') || errorMessage.includes('token')) {
    userMessage = 'Message too long. Try a shorter question, truncate chat history, or reset the chat.';
    recoveryAction = 'context_too_long';
  } else {
    userMessage = `Error: ${errorMessage}. Try again or reset the chat if the issue persists.`;
    recoveryAction = 'generic_retry';
  }
  
  // Add error message with recovery hint
  addChatMessage('ai', userMessage);
  
  // Show recovery tips based on error type
  if (recoveryAction === 'context_too_long') {
    addChatMessage('ai', 'Tip: Try the "Truncate History" button to keep recent messages, or "Reset chat" to start fresh.');
  } else if (recoveryAction === 'reset_chat') {
    addChatMessage('ai', 'Tip: Click "Reset chat" to start fresh.');
  }
  
  // Restore the original message to input box if provided
  if (originalMessage && elements.chatInput) {
    elements.chatInput.value = originalMessage;
    elements.chatInput.focus();
    addDebugLog('Restored your message to input box');
  }
  
  // Log for debugging
  const model = (settings && settings.chatModel) ? settings.chatModel : '(unknown)';
  console.error('Chat error details:', { model, errorMessage, recoveryAction });
  addDebugLog(`Chat error: ${errorMessage.substring(0, 50)}...`);
}

// Clear error state when user takes action
function clearChatErrorState() {
  if (chatErrorState) {
    chatErrorState = false;
    lastErrorTime = null;
    addDebugLog('Chat error state cleared');
  }
}

// Restore chat history
function restoreChatHistory() {
  if (!elements.chatMessages) return;
  
  // Clear existing messages
  elements.chatMessages.innerHTML = '';
  
  // If no history, show welcome message
  if (!chatHistory || chatHistory.length === 0) {
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'chat-message ai';
    welcomeDiv.innerHTML = `<strong>AI:</strong> Hi! I'm your draft assistant. Ask me about players, strategy, or upload screenshots for analysis!`;
    elements.chatMessages.appendChild(welcomeDiv);
    return;
  }
  
  // Add saved messages
  chatHistory.forEach(msg => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${msg.role === 'user' ? 'user' : 'ai'}`;
    
    // Handle image analysis messages specially
    let content = msg.content;
    if (content.startsWith('[IMAGE ANALYSIS]')) {
      content = content.replace('[IMAGE ANALYSIS] ', '');
    }
    
    messageDiv.innerHTML = `<strong>${msg.role === 'user' ? 'You' : 'AI'}:</strong> ${linkifyAndEscape(content)}`;
    elements.chatMessages.appendChild(messageDiv);
  });
  
  // Scroll to bottom
  setTimeout(() => {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }, 100);
}

// Truncate chat history to keep only recent messages
function truncateChatHistory() {
  if (!chatHistory || chatHistory.length === 0) {
    addChatMessage('ai', 'No chat history to truncate.');
    return;
  }
  
  // Keep only the last 10 messages (5 exchanges)
  const messagesToKeep = 10;
  const originalLength = chatHistory.length;
  
  if (originalLength <= messagesToKeep) {
    addChatMessage('ai', `Chat history is already short (${originalLength} messages). No need to truncate.`);
    return;
  }
  
  // Keep recent messages
  chatHistory = chatHistory.slice(-messagesToKeep);
  
  // Save truncated history
  chrome.storage.local.set({ chatHistory: chatHistory }).then(() => {
    // Restore the truncated history to UI
    restoreChatHistory();
    
    // Add info message
    addChatMessage('ai', `Chat history truncated. Kept last ${messagesToKeep} messages (removed ${originalLength - messagesToKeep} older messages).`);
    
    // Clear error state
    clearChatErrorState();
    
    addDebugLog(`Chat truncated: ${originalLength} → ${messagesToKeep} messages`);
  }).catch(err => {
    console.error('Failed to save truncated history:', err);
    addChatMessage('ai', 'Failed to truncate chat history. Please try again.');
  });
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
  
  // Clear error state
  clearChatErrorState();
  
  addDebugLog('Chat reset to baseline');

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
  
  // Save to storage immediately
  chrome.storage.local.set({ chatHistory: chatHistory }).catch(err => {
    console.error('Failed to save chat history:', err);
  });
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
    
    // Show loading animation
    showChatLoading();
    
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
      
      hideChatLoading();
      
      if (response.success) {
        // Add the image analysis to chat history with special tagging for context
        addChatMessage('ai', response.data, true); // true indicates this is image analysis
        // Clear error state on success
        chatErrorState = false;
        lastErrorTime = null;
      } else {
        handleChatError(response.error || 'Vision analysis failed');
      }
      
    } catch (error) {
      hideChatLoading();
      handleChatError(error.message);
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
    <div class="image-thumbnail" data-image-id="${escapeAttr(image.id)}">
      <img src="${image.data}" alt="${escapeAttr(image.name)}" onclick="showImageModal('${escapeAttr(image.id)}')">
      <div class="image-info">
        ${new Date(image.timestamp).toLocaleDateString()}
      </div>
      <button class="delete-btn" onclick="deleteImage('${escapeAttr(image.id)}')" title="Delete image">×</button>
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
    <img src="${image.data}" alt="${escapeAttr(image.name)}" style="max-width: 95vw; max-height: 95vh; object-fit: contain;">
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
window.removeFromWatchlist = removeFromWatchlist;
window.showImageModal = showImageModal;
window.closeImageModal = closeImageModal;
window.deleteImage = deleteImage;

// Save state before popup closes
window.addEventListener('beforeunload', () => {
  // Save current chat state
  if (chatHistory.length > 0) {
    chrome.storage.local.set({ 
      chatHistory: chatHistory,
      uploadedImages: uploadedImages,
      csvDatasets: csvDatasets
    }).catch(() => {});
  }
});

// Also save when popup loses focus (user clicks outside)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && chatHistory.length > 0) {
    chrome.storage.local.set({ 
      chatHistory: chatHistory,
      uploadedImages: uploadedImages,
      csvDatasets: csvDatasets
    }).catch(() => {});
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
