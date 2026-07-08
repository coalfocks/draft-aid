// Content script to extract draft data from ESPN pages
console.log('🏈 Fantasy Draft Assistant loaded on ESPN page');

let draftData = {
  picks: [],
  teams: [],
  currentPick: 1,
  leagueId: null,
  userRoster: []
};

const POSITION_PATTERN = /\b(QB|RB|WR|TE|K|DEF|DST|D\/ST)\b/;
const KNOWN_NFL_ABBRS = new Set([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN',
  'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA',
  'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB',
  'TEN', 'WAS'
]);

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizePosition(position) {
  const value = normalizeText(position).toUpperCase();
  if (value === 'D/ST' || value === 'DEF') return 'DST';
  return value || 'N/A';
}

function isLikelyPlayerName(name) {
  const text = normalizeText(name);
  if (text.length < 2 || text.length > 45) return false;
  if (/^(add|drop|waiver|news|empty|player|rank|team|position)$/i.test(text)) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 .'-]+(?:\s+(?:Jr\.?|Sr\.?|II|III|IV))?$/u.test(text);
}

function getTextFromFirst(container, selectors) {
  for (const selector of selectors) {
    const element = container?.querySelector?.(selector);
    const text = normalizeText(element?.textContent || element?.getAttribute?.('title'));
    if (text) return text;
  }
  return '';
}

function extractPositionAndTeam(container) {
  const positionText = getTextFromFirst(container, [
    'span.playerinfo__playerpos',
    'span[class*="playerinfo__playerpos"]',
    '[data-testid*="position" i]',
    '[class*="position" i]',
    '[class*="playerpos" i]'
  ]);

  const teamText = getTextFromFirst(container, [
    'span.playerinfo__playerteam',
    'span[class*="playerinfo__playerteam"]',
    '[data-testid*="team" i]',
    '[class*="playerteam" i]'
  ]);

  const allText = normalizeText(container?.textContent);
  const positionMatch = positionText.match(POSITION_PATTERN) || allText.match(POSITION_PATTERN);
  const upperTokens = allText.match(/\b[A-Z]{2,4}\b/g) || [];
  const teamMatch = teamText || upperTokens.find(token => KNOWN_NFL_ABBRS.has(token));

  return {
    position: normalizePosition(positionMatch?.[1] || positionText),
    team: normalizeText(teamMatch) || 'N/A'
  };
}

function dedupeTeams(teams) {
  const seen = new Set();
  return teams.filter(team => {
    const key = team.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Focused observer for the picks list to catch updates instantly
let picksListObserver = null;
let observedPicksList = null;
let draftObserver = null;

// Extract league ID from URL
function extractLeagueId() {
  const url = window.location.href;
  const match = url.match(/leagueId=(\d+)/);
  if (match) {
    draftData.leagueId = match[1];
    console.log('📊 League ID detected:', draftData.leagueId);
  }
}

// Extract team information
function extractTeams() {
  const teamSelectors = [
    '[data-testid="team-name"]',
    '[data-testid*="team" i] [class*="name" i]',
    '.team-name',
    '.owner-name'
  ];
  
  const teams = [];

  teamSelectors.forEach((selector) => {
    const teamElements = document.querySelectorAll(selector);
    console.log(`Trying team selector ${selector}: found ${teamElements.length} elements`);

    teamElements.forEach((element) => {
      const teamName = normalizeText(element.textContent);
      if (teamName && teamName.length < 60) {
        teams.push({
          id: teams.length + 1,
          name: teamName,
          picks: []
        });
      }
    });
  });

  const uniqueTeams = dedupeTeams(teams).map((team, index) => ({
    ...team,
    id: index + 1
  }));
  
  if (uniqueTeams.length > 0) {
    draftData.teams = uniqueTeams;
    console.log('👥 Teams extracted:', uniqueTeams.length, uniqueTeams.map(t => t.name));
  } else {
    console.log('❌ No teams found');
  }
}

// Extract user's team ID from the roster dropdown
function extractUserTeam() {
  const dropdown = document.querySelector('.roster__dropdown select');
  if (dropdown) {
    const selectedOption = dropdown.querySelector('option:checked') || dropdown.querySelector('option[selected]');
    if (selectedOption) {
      draftData.userTeamId = selectedOption.value;
      draftData.userTeamName = selectedOption.textContent.trim();
      console.log(`👤 User team identified: ${draftData.userTeamName} (ID: ${draftData.userTeamId})`);
    }
  }
}

// Extract user's current roster from roster-module
function extractUserRoster() {
  console.log('🔍 Extracting user roster from roster-module...');
  console.log('🔍 Current URL:', window.location.href);
  
  // More comprehensive search for roster
  const rosterSelectors = [
    '.roster-module',
    '[class*="roster-module"]',
    '[class*="roster"]',
    '.my-team',
    '[data-testid*="roster"]'
  ];
  
  let rosterModule = null;
  for (const selector of rosterSelectors) {
    rosterModule = document.querySelector(selector);
    if (rosterModule) {
      console.log(`✅ Found roster container with selector: ${selector}`);
      break;
    }
  }
  
  if (!rosterModule) {
    console.log('❌ No roster module found with any selector');
    console.log('Available elements with "roster" in class:', 
      document.querySelectorAll('[class*="roster"]').length);
    return [];
  }
  
  console.log('✅ Found roster module, looking for roster table...');
  console.log('Roster module HTML sample:', rosterModule.outerHTML.substring(0, 500));
  
  // Find the table within the roster module - be more flexible
  const tableSelectors = ['table', 'tbody', '[role="table"]', 'div[class*="table"]'];
  let rosterTable = null;
  
  for (const selector of tableSelectors) {
    rosterTable = rosterModule.querySelector(selector);
    if (rosterTable) {
      console.log(`✅ Found roster table with selector: ${selector}`);
      break;
    }
  }
  
  if (!rosterTable) {
    console.log('❌ Roster table not found within roster-module');
    console.log('Available tables in document:', document.querySelectorAll('table').length);
    return [];
  }
  
  console.log('✅ Found roster table, extracting players...');
  
  const roster = [];
  
  // Be more flexible about finding rows
  const rowSelectors = ['tbody tr', 'tr', '[class*="row"]', 'div[class*="player"]'];
  let rows = [];
  
  for (const selector of rowSelectors) {
    rows = rosterTable.querySelectorAll(selector);
    if (rows.length > 0) {
      console.log(`✅ Found ${rows.length} rows with selector: ${selector}`);
      break;
    }
  }
  
  if (rows.length === 0) {
    console.log('❌ No rows found in roster table');
    return [];
  }
  
  console.log(`📋 Found ${rows.length} roster rows`);
  
  rows.forEach((row, index) => {
    try {
      // Find position column (div with title "Position")
      const positionDiv = row.querySelector('div[title="Position"]');
      const position = positionDiv?.textContent?.trim();
      
      // Find player name in the next td after position
      const cells = row.querySelectorAll('td');
      let playerName = '';
      
      // Look through cells to find the one with player name (usually after position cell)
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        
        // Skip if this cell contains the position div
        if (cell.querySelector('div[title="Position"]')) continue;
        
        // Look for player name links or text
        const playerLink = cell.querySelector('a[title], a.AnchorLink');
        if (playerLink) {
          playerName = playerLink.textContent?.trim() || playerLink.title?.trim();
          if (playerName && playerName.length > 1) break;
        }
        
        // Fallback: look for any meaningful text in the cell
        const cellText = cell.textContent?.trim();
        if (cellText && cellText.length > 2 && !cellText.match(/^\d+$/)) {
          // Filter out non-player text
          if (!cellText.toLowerCase().includes('add') && 
              !cellText.toLowerCase().includes('drop') &&
              !cellText.toLowerCase().includes('waiver') &&
              cellText.match(/^[A-Za-z\s\.\'-]+$/)) {
            playerName = cellText;
            break;
          }
        }
      }
      
      // Find bye week column (div with title "Bye Week")
      const byeWeekDiv = row.querySelector('div[title="Bye Week"]');
      const byeWeek = byeWeekDiv?.textContent?.trim();
      
      if (position && playerName) {
        const player = {
          name: playerName,
          position: position,
          byeWeek: byeWeek || 'N/A'
        };
        
        roster.push(player);
        console.log(`🏈 Roster player ${index + 1}: ${playerName} (${position}) - Bye: ${byeWeek || 'N/A'}`);
      } else {
        console.log(`⚠️ Incomplete roster data for row ${index + 1}: position=${position}, name=${playerName}`);
      }
      
    } catch (error) {
      console.error(`❌ Error extracting roster row ${index + 1}:`, error);
    }
  });
  
  console.log(`📊 Successfully extracted ${roster.length} roster players`);
  
  // Update draft data with roster
  draftData.userRoster = roster;
  
  return roster;
}

// Extract draft picks from the actual draft board (not available players)
function extractDraftPicks() {
  console.log('🔍 Extracting draft picks from ESPN draft column...');
  console.log('🔍 Current URL:', window.location.href);
  console.log('🔍 Page title:', document.title);
  
  // Enhanced debugging - log what we find
  const allDivs = document.querySelectorAll('div[class*="draft"]');
  console.log(`🔍 Found ${allDivs.length} divs with 'draft' in class name`);
  
  // Look for draft columns and pick the best match by structure
  const candidateColumns = Array.from(
    document.querySelectorAll(
      '.draft-column.flex, .draft-column, [class*="draft-column"], [class*="draft"]'
    )
  );
  console.log(`🔍 Found ${candidateColumns.length} draft column candidates`);

  let bestColumn = null;
  let bestScore = -1;
  for (const col of candidateColumns) {
    const ul = col.querySelector('ul[class*="pa3"], ul');
    const liCount = ul ? ul.querySelectorAll(':scope > li').length : 0;
    const hasNameSpan = !!col.querySelector('span.playerinfo__playername, span[class*="playerinfo__playername"], span[class*="playername"]');
    const hasPickInfo = !!col.querySelector('[class*="pick-info"]');
    const score = (liCount || 0) + (hasNameSpan ? 1000 : 0) + (hasPickInfo ? 500 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestColumn = col;
    }
  }

  if (!bestColumn) {
    console.log('❌ No suitable draft column, trying alternative structures...');
    return extractFromAlternativeStructures();
  }

  console.log('✅ Selected draft column with score:', bestScore);

  // Attach a focused observer to the picks list (UL) to react instantly on changes
  const ulForObserve = getPicksListFromColumn(bestColumn);
  if (ulForObserve && ulForObserve !== observedPicksList) {
    if (picksListObserver) {
      try { picksListObserver.disconnect(); } catch {}
    }
    observedPicksList = ulForObserve;
    picksListObserver = new MutationObserver(() => {
      // Debounce a bit to batch rapid DOM updates
      clearTimeout(window.__picksDebounce__);
      window.__picksDebounce__ = setTimeout(() => {
        extractFromDraftColumn(bestColumn);
      }, 200);
    });
    picksListObserver.observe(observedPicksList, { childList: true });
    console.log('👀 Attached focused observer to picks list');
  }

  return extractFromDraftColumn(bestColumn);
}

// Extract picks from a specific draft column element
function extractFromDraftColumn(draftColumn) {
  console.log('🎯 Extracting from draft column...');

  // Use the exact structure provided: find UL with pa3, then iterate LI and select the information block
  const ul = getPicksListFromColumn(draftColumn);
  if (!ul) {
    console.log('❌ No UL found under draft column');
    return extractFromAlternativeStructures();
  }

  // Prefer only actual pick items
  let liNodes = ul.querySelectorAll(':scope > li[class*="pick-message__container"], :scope > li.pick-message__container');
  if (liNodes.length === 0) {
    liNodes = ul.querySelectorAll(':scope > li');
  }
  console.log(`📋 Found ${liNodes.length} pick li items in picks list`);

  const picks = [];
  const totalTeams = draftData.teams?.length || 12;

  liNodes.forEach((li, index) => {
    try {
      // Prefer the explicit information container
      const wrapper = li.querySelector('[class*="pick__message-information"]') ||
                      li.querySelector(':scope > div > div:nth-of-type(2)') ||
                      li.querySelector(':scope > div:nth-of-type(1) > div:nth-of-type(2)') ||
                      li;
      if (!wrapper) return;

      const nameEl = wrapper.querySelector('span.playerinfo__playername, span[class*="playerinfo__playername"]') ||
                     wrapper.querySelector('span.playerinfo_playername, span[class*="playerinfo_playername"]') ||
                     wrapper.querySelector('span[class*="playername" i], a.AnchorLink, a[title]') ||
                     li.querySelector('span.playerinfo__playername, span[class*="playerinfo__playername"], span.playerinfo_playername, span[class*="playerinfo_playername"], a.AnchorLink, a[title]');
      const playerName = normalizeText(nameEl?.textContent || nameEl?.getAttribute?.('title'));
      if (!isLikelyPlayerName(playerName)) return;

      const pickInfoElement = wrapper.querySelector('div.pick-info, [class*="pick-info"]') ||
                              li.querySelector('div.pick-info, [class*="pick-info"]');
      const pickInfoText = normalizeText(pickInfoElement?.textContent);

      let round = 'N/A';
      let pickInRound = 'N/A';
      // Authoritative round/pick from text if present; overall pick strictly sequential by DOM order
      const m = pickInfoText.match(/R(\d+),\s*P(\d+)/);
      if (m) {
        round = parseInt(m[1]);
        pickInRound = parseInt(m[2]);
      }
      const overallPick = index + 1;

      // Drafting team appears as a nested span inside pick-info, following the text
      let draftingTeam = 'Unknown Team';
      const draftingSpan = pickInfoElement?.querySelector('span');
      if (draftingSpan) {
        draftingTeam = normalizeText(draftingSpan.textContent.replace(/^\s*-\s*/, '')) || draftingTeam;
      }

      const { position, team } = extractPositionAndTeam(wrapper);

      picks.push({
        pickNumber: overallPick,
        round,
        pickInRound,
        player: { name: playerName, position, team },
        draftingTeam,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error('❌ Error extracting pick from li', e);
    }
  });

  if (picks.length === 0) {
    console.log('❌ No picks extracted using strict structure, falling back');
    // Fallback to previous span-based approach
    const nameSpans = draftColumn.querySelectorAll('span.playerinfo_playername, .playerinfo_playername, span[class*="playername" i], a.AnchorLink, a[title]');
    nameSpans.forEach((nameEl, i) => {
      try {
        const container = nameEl.closest('li') || nameEl.closest('div');
        const pickInfoElement = container?.querySelector('.pick-info');
        const pickInfoText = normalizeText(pickInfoElement?.textContent);
        let round = 'N/A';
        let pickInRound = 'N/A';
        const overallPick = i + 1;
        const m = pickInfoText.match(/R(\d+),\s*P(\d+)/);
        if (m) {
          round = parseInt(m[1]);
          pickInRound = parseInt(m[2]);
        }
        let draftingTeam = 'Unknown Team';
        if (pickInfoElement?.parentElement?.nextElementSibling?.tagName === 'SPAN') {
          draftingTeam = pickInfoElement.parentElement.nextElementSibling.textContent.trim() || draftingTeam;
        }
        const playerName = normalizeText(nameEl.textContent || nameEl.getAttribute?.('title'));
        if (!isLikelyPlayerName(playerName)) return;
        const { position, team } = extractPositionAndTeam(container);
        picks.push({
          pickNumber: overallPick,
          round,
          pickInRound,
          player: { name: playerName, position, team },
          draftingTeam,
          timestamp: new Date().toISOString()
        });
      } catch {}
    });
  }

  // Ensure sequential pick numbers 1..N regardless of round
  picks.forEach((p, i) => { p.pickNumber = i + 1; });
  console.log(`📊 Extracted ${picks.length} picks using structured approach`);
  updateDraftState(picks);
  return picks;
}

// Helper to find the UL that contains the picks for a given column
function getPicksListFromColumn(col) {
  return col.querySelector('ul[class*="pa3"]') || col.querySelector('ul');
}

// Fallback extraction for alternative page structures
function extractFromAlternativeStructures() {
  console.log('🔄 Trying fallback extraction methods...');
  
  // Try the old methods as fallback
  const draftBoardSelectors = [
    '.jsx-3316227911.draft-board-grid',
    '[class*="draft-board"]',
    '[class*="pick-component"]',
    '.draft-results',
    'table tbody tr'
  ];
  
  let draftElements = [];
  
  for (const selector of draftBoardSelectors) {
    draftElements = document.querySelectorAll(selector);
    console.log(`Trying fallback selector ${selector}: found ${draftElements.length} elements`);
    if (draftElements.length > 0) {
      break;
    }
  }
  
  if (draftElements.length > 0) {
    return extractFromDraftBoard(draftElements);
  }
  
  return extractCompletedDraftPicks();
}

// Extract from draft board grid
function extractFromDraftBoard(draftElements) {
  console.log('🎯 Extracting from draft board grid');
  const picks = [];
  
  draftElements.forEach((element) => {
    // Look for picked players within this draft element
    const playerElements = element.querySelectorAll('a.AnchorLink:not([class*="news"])');
    
    playerElements.forEach((playerLink) => {
      const playerName = playerLink.textContent?.trim() || playerLink.title?.trim();
      
      // Filter out non-player links
      if (playerName && 
          playerName.length > 1 && 
          !playerName.toLowerCase().includes('news') &&
          !playerName.toLowerCase().includes('about') &&
          !playerName.toLowerCase().includes('help') &&
          playerName.match(/^[A-Za-z\.\s\'-]+$/)) { // Only letters, spaces, periods, apostrophes, hyphens
        
        const pick = extractPickDetails(playerLink, picks.length + 1);
        if (pick && !picks.some(p => p.player.name === pick.player.name)) {
          picks.push(pick);
          console.log(`🏈 Draft pick ${pick.pickNumber}: ${pick.player.name} (${pick.player.position})`);
        }
      }
    });
  });
  
  updateDraftState(picks);
  return picks;
}

// Extract from completed draft (roster tables, etc.)
function extractCompletedDraftPicks() {
  console.log('🎯 Extracting from completed draft/rosters');
  const picks = [];
  const seenPlayers = new Set();
  
  // Look for roster tables with drafted players
  const rosterElements = document.querySelectorAll('table tbody tr, .roster-row, [class*="roster"] tr');
  
  rosterElements.forEach((row) => {
    const playerLink = row.querySelector('a.AnchorLink:not([class*="news"])');
    if (playerLink) {
      const playerName = playerLink.textContent?.trim() || playerLink.title?.trim();
      
      if (playerName && 
          !seenPlayers.has(playerName) &&
          !playerName.toLowerCase().includes('news') &&
          !playerName.toLowerCase().includes('empty') &&
          playerName.match(/^[A-Za-z\.\s\'-]+$/)) {
        
        const pick = extractPickDetails(playerLink, picks.length + 1);
        if (pick) {
          picks.push(pick);
          seenPlayers.add(playerName);
          console.log(`🏈 Completed pick ${pick.pickNumber}: ${pick.player.name} (${pick.player.position})`);
        }
      }
    }
  });
  
  updateDraftState(picks);
  return picks;
}

// Extract detailed pick information
function extractPickDetails(playerLink, pickNumber) {
  const playerName = normalizeText(playerLink.textContent || playerLink.title);
  if (!isLikelyPlayerName(playerName)) return null;
  
  const parentRow = playerLink.closest('tr') || playerLink.closest('div');
  const { position, team } = extractPositionAndTeam(parentRow || playerLink);
  
  return {
    pickNumber: pickNumber,
    player: {
      name: playerName,
      position: position,
      team: team
    },
    timestamp: new Date().toISOString()
  };
}

// Update draft state with new picks
function updateDraftState(picks) {
  // Always replace the full list to avoid duplication across refreshes
  const prevCount = draftData.picks.length;
  draftData.picks = picks;
  draftData.currentPick = picks.length + 1;
  console.log(`📊 Picks replaced: ${prevCount} -> ${picks.length}`);

  chrome.runtime.sendMessage({
    type: 'REPLACE_PICKS',
    data: picks
  }).catch(() => {});
}

// Alternative: Extract from draft results/completed picks
function extractCompletedPicks() {
  const completedPickElements = document.querySelectorAll(
    '.drafted-player, .completed-pick, [data-testid="completed-pick"]'
  );
  
  completedPickElements.forEach((element, index) => {
    const playerName = element.querySelector('.player-name, .name')?.textContent?.trim();
    const position = element.querySelector('.position')?.textContent?.trim();
    const team = element.querySelector('.team')?.textContent?.trim();
    
    if (playerName) {
      console.log(`Pick ${index + 1}: ${playerName} (${position}) - ${team}`);
    }
  });
}

// Monitor for DOM changes (real-time pick detection)
let mainObserver = null;

function createMainObserver() {
  if (mainObserver) {
    mainObserver.disconnect();
  }
  
  mainObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' || mutation.type === 'attributes') {
        // Debounce the extraction to avoid excessive calls
        clearTimeout(window.extractTimer);
        window.extractTimer = setTimeout(() => {
          extractDraftPicks();
          extractCompletedPicks();
        }, 500);
      }
    });
  });
  
  return mainObserver;
}

// Start observing when page loads
function startObserving() {
  const targetNode = document.body;
  if (targetNode) {
    const observer = createMainObserver();
    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-testid']
    });
    console.log('👀 Started observing ESPN page for draft changes');
  }
}

// Initialize when page loads
function initialize() {
  console.log('🚀 Initializing Fantasy Draft Assistant');
  console.log('📍 Current URL:', window.location.href);
  console.log('📄 Page title:', document.title);
  
  extractLeagueId();
  extractUserTeam();
  extractTeams();
  extractUserRoster();
  extractDraftPicks();
  startObserving();
  startDraftObserving();
  
  console.log('📊 Final data state:', draftData);
  
  // Send initial data to popup
  chrome.runtime.sendMessage({
    type: 'INIT_DATA',
    data: draftData
  }).then(() => {
    console.log('✅ Data sent to popup successfully');
  }).catch(error => {
    console.error('❌ Failed to send data to popup:', error);
  });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Content script received message:', request.type);
  
  if (request.type === 'GET_DRAFT_DATA') {
    sendResponse(draftData);
  } else if (request.type === 'REFRESH_DATA') {
    extractDraftPicks();
    extractCompletedPicks();
    sendResponse(draftData);
  } else if (request.type === 'DEBUG_DOM') {
    // Return debug information about the page
    const debugInfo = {
      pageTitle: document.title,
      url: window.location.href,
      elementCount: document.querySelectorAll('*').length,
      bodyClasses: document.body.className,
      hasPlayerElements: document.querySelectorAll('[class*="player"], [data-testid*="player"]').length,
      hasPickElements: document.querySelectorAll('[class*="pick"], [data-testid*="pick"]').length,
      hasDraftElements: document.querySelectorAll('[class*="draft"]').length,
      commonClasses: getCommonClasses()
    };
    console.log('🔍 Debug info:', debugInfo);
    sendResponse(debugInfo);
  } else if (request.type === 'FORCE_EXTRACT') {
    console.log('🔧 Force extracting data...');
    extractLeagueId();
    extractUserTeam();
    extractTeams();
    extractUserRoster();
    extractDraftPicks();
    sendResponse(draftData);
  } else if (request.type === 'RUN_DOM_INSPECTOR') {
    console.log('🔍 Running DOM inspector...');
    if (typeof window.inspectESPNPage === 'function') {
      window.inspectESPNPage();
      sendResponse({ success: true, message: 'DOM inspector completed - check console' });
    } else {
      console.log('🔍 DOM inspector function not loaded');
      sendResponse({ success: false, message: 'DOM inspector not available' });
    }
  }
});

// Get most common class names on the page (for debugging)
function getCommonClasses() {
  const classMap = {};
  const elements = document.querySelectorAll('*[class]');
  
  elements.forEach(el => {
    el.className.split(' ').forEach(className => {
      if (className.trim()) {
        classMap[className] = (classMap[className] || 0) + 1;
      }
    });
  });
  
  return Object.entries(classMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([className, count]) => `${className} (${count})`)
    .join(', ');
}

// Handle page navigation/refresh
let isInitialized = false;
let extractionInterval;

function ensureInitialized() {
  console.log('🔄 Ensuring initialization...');
  initialize();
  isInitialized = true;
  
  // Set up continuous monitoring for dynamic content
  startContinuousMonitoring();
}

function startContinuousMonitoring() {
  // Clear any existing interval
  if (extractionInterval) {
    clearInterval(extractionInterval);
  }
  
  // Check for new data every 5 seconds
  extractionInterval = setInterval(() => {
    console.log('🔍 Periodic check for draft updates...');
    
    const previousPickCount = draftData.picks.length;
    const previousRosterCount = draftData.userRoster?.length || 0;
    
    extractDraftPicks();
    extractUserRoster();
    
    // If we found new picks, send update
    if (draftData.picks.length > previousPickCount) {
      console.log(`📈 Found ${draftData.picks.length - previousPickCount} new picks!`);
    }
    
    // If roster changed, log it
    if (draftData.userRoster.length !== previousRosterCount) {
      console.log(`👥 Roster updated: ${previousRosterCount} → ${draftData.userRoster.length} players`);
    }
    
    // Send update if anything changed
    if (draftData.picks.length > previousPickCount || draftData.userRoster.length !== previousRosterCount) {
      chrome.runtime.sendMessage({
        type: 'DRAFT_UPDATE',
        data: draftData
      }).catch(() => {
        // Background script might not be ready, that's okay
      });
    }
    
    // Also check if draft column appeared (for dynamic loading)
    const draftColumn = document.querySelector('.draft-column.flex, .draft-column, [class*="draft-column"]');
    if (draftColumn && draftData.picks.length === 0) {
      console.log('🎯 Draft column appeared, extracting data...');
      extractDraftPicks();
    }
    
  }, 5000); // Check every 5 seconds
  
  console.log('👀 Started continuous monitoring for draft updates');
}

// Initialize immediately and on page changes
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureInitialized);
} else {
  ensureInitialized();
}

// Also initialize after delays for dynamic content
setTimeout(ensureInitialized, 2000);
setTimeout(ensureInitialized, 5000); // Additional delay for slower loading
setTimeout(ensureInitialized, 10000); // In case ESPN is really slow

// Listen for URL changes (SPA navigation)
let currentUrl = window.location.href;
setInterval(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    console.log('📍 URL changed, re-initializing...');
    setTimeout(ensureInitialized, 1000);
  }
}, 1000);

// Listen for page visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('👁️ Page became visible, checking for updates...');
    setTimeout(() => {
      extractDraftPicks();
      extractTeams();
      extractUserTeam();
      extractUserRoster();
    }, 500);
  }
});

// Enhanced DOM observer for draft-specific changes
function nodeHasClassFragment(node, fragment) {
  if (!node?.classList) return false;
  return Array.from(node.classList).some(className => className.includes(fragment));
}

function createDraftObserver() {
  return new MutationObserver((mutations) => {
    let shouldRecheckDraft = false;
    let shouldRecheckRoster = false;
    
    mutations.forEach((mutation) => {
      // Check if draft-related elements were added
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for draft elements
            if (node.classList?.contains('draft-column') ||
                nodeHasClassFragment(node, 'draft-column') ||
                node.querySelector?.('.draft-column') ||
                node.querySelector?.('[class*="draft-column"]') ||
                nodeHasClassFragment(node, 'pa3') ||
                node.querySelector?.('.pa3')) {
              shouldRecheckDraft = true;
            }
            
            // Check for roster elements
            if (node.classList?.contains('roster-module') ||
                nodeHasClassFragment(node, 'roster') ||
                node.querySelector?.('.roster-module') ||
                node.querySelector?.('[class*="roster"]') ||
                node.querySelector?.('table')) {
              shouldRecheckRoster = true;
            }
          }
        });
      }
    });
    
    if (shouldRecheckDraft) {
      console.log('🔄 DOM changed with draft elements, re-extracting...');
      setTimeout(extractDraftPicks, 1000);
    }
    
    if (shouldRecheckRoster) {
      console.log('🔄 DOM changed with roster elements, re-extracting roster...');
      setTimeout(extractUserRoster, 1000);
    }
  });
}

// Start enhanced draft observing when page loads
function startDraftObserving() {
  if (document.body) {
    if (draftObserver) {
      draftObserver.disconnect();
    }
    draftObserver = createDraftObserver();
    draftObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });
    console.log('👀 Started enhanced draft observer');
  }
}

// Debug: Log page structure for development
console.log('📋 Fantasy Draft Assistant content script loaded');
console.log('📋 Page URL:', window.location.href);

if (typeof window !== 'undefined') {
  window.__draftAidExtract = {
    extractDraftPicks,
    extractFromDraftColumn,
    extractPickDetails,
    extractTeams,
    extractUserRoster,
    getDraftData: () => draftData
  };
}
