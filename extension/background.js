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

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Background received message:', request.type);
  
  switch (request.type) {
    case 'INIT_DATA':
      // Initialize with data from content script
      draftState = { ...draftState, ...request.data };
      console.log('📊 Draft state initialized:', draftState);
      break;
      
    case 'NEW_PICK':
      // Add new pick to state
      draftState.picks.push(request.data);
      draftState.currentPick = draftState.picks.length + 1;
      console.log('🏈 New pick added:', request.data);
      
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
      saveStateToStorage();
      chrome.runtime.sendMessage({ type: 'PICKS_REPLACED', data: draftState.picks }).catch(() => {});
      break;
      
    case 'GET_STATE':
      // Send current state to popup
      sendResponse(draftState);
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
    // Get API key from storage (try multiple keys)
    const result = await chrome.storage.local.get(['openaiApiKey', 'settings']);
    const apiKey = result.openaiApiKey || result.settings?.openaiApiKey;
    
    console.log('🔑 Checking API key:', apiKey ? 'FOUND' : 'NOT FOUND');
    console.log('🔍 Storage result:', { hasApiKey: !!result.openaiApiKey, hasSettings: !!result.settings });
    
    if (!apiKey) {
      sendResponse({ 
        success: false,
        error: 'OpenAI API key not configured. Please add your API key in the Settings tab.' 
      });
      return;
    }
    
    // Choose model: prefer settings.chatModel for text chat, fallback to gpt-4o
    const chatModel = result.settings?.chatModel || 'gpt-4o-mini';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: chatModel,
        messages: requestData.messages,
        max_tokens: 1500,
        temperature: 0.7
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'OpenAI API error');
    }
    
    sendResponse({
      success: true,
      data: data.choices[0].message.content
    });
    
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