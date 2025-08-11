// Debug script to run in ESPN console to diagnose extraction issues
console.log('🔧 DEBUG: ESPN DOM Structure Analysis');
console.log('URL:', window.location.href);
console.log('Title:', document.title);

// 1. Check for draft column structure you mentioned
console.log('\n=== DRAFT COLUMN ANALYSIS ===');
const draftColumn = document.querySelector('.draft-column.flex');
console.log('Draft column found:', !!draftColumn);
if (draftColumn) {
  console.log('Draft column HTML sample:', draftColumn.outerHTML.substring(0, 500));
  
  const ul = draftColumn.querySelector('ul.pa3');
  console.log('UL.pa3 found:', !!ul);
  if (ul) {
    const lis = ul.querySelectorAll('li');
    console.log(`Found ${lis.length} LI elements`);
    
    // Sample first few picks
    for (let i = 0; i < Math.min(3, lis.length); i++) {
      const li = lis[i];
      console.log(`\nPick ${i + 1}:`, li.outerHTML.substring(0, 300));
      
      const playerName = li.querySelector('.playerinfo_playername');
      console.log('Player name element:', playerName?.textContent);
      
      const pickInfo = li.querySelector('.pick-info');
      console.log('Pick info element:', pickInfo?.textContent);
    }
  }
}

// 2. Check for roster module
console.log('\n=== ROSTER MODULE ANALYSIS ===');
const rosterModule = document.querySelector('.roster-module');
console.log('Roster module found:', !!rosterModule);
if (rosterModule) {
  console.log('Roster module HTML sample:', rosterModule.outerHTML.substring(0, 500));
  
  const table = rosterModule.querySelector('table');
  console.log('Roster table found:', !!table);
  if (table) {
    const rows = table.querySelectorAll('tbody tr');
    console.log(`Found ${rows.length} roster rows`);
    
    // Sample first few roster entries
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const row = rows[i];
      console.log(`\nRoster ${i + 1}:`, row.outerHTML.substring(0, 300));
      
      const positionDiv = row.querySelector('div[title="Position"]');
      console.log('Position:', positionDiv?.textContent);
      
      const byeDiv = row.querySelector('div[title="Bye Week"]');
      console.log('Bye week:', byeDiv?.textContent);
      
      // Look for player name
      const cells = row.querySelectorAll('td');
      cells.forEach((cell, idx) => {
        const playerLink = cell.querySelector('a[title], a.AnchorLink');
        if (playerLink) {
          console.log(`Cell ${idx} player link:`, playerLink.textContent?.trim());
        }
      });
    }
  }
}

// 3. Look for alternative draft structures
console.log('\n=== ALTERNATIVE DRAFT STRUCTURES ===');
const alternatives = [
  '.jsx-3316227911.draft-board-grid',
  '[class*="draft-board"]',
  '[class*="pick-component"]',
  '.draft-results',
  'table tbody tr'
];

alternatives.forEach(selector => {
  const elements = document.querySelectorAll(selector);
  console.log(`${selector}: ${elements.length} elements found`);
  if (elements.length > 0) {
    console.log('First element sample:', elements[0].outerHTML.substring(0, 200));
  }
});

// 4. Generic player search
console.log('\n=== GENERIC PLAYER SEARCH ===');
const playerLinks = document.querySelectorAll('a[title*=" "], a.AnchorLink');
console.log(`Found ${playerLinks.length} potential player links`);
const validPlayers = [];
for (let i = 0; i < Math.min(10, playerLinks.length); i++) {
  const link = playerLinks[i];
  const text = link.textContent?.trim();
  const title = link.title?.trim();
  const playerName = text || title;
  
  if (playerName && 
      playerName.length > 2 && 
      !playerName.toLowerCase().includes('news') &&
      !playerName.toLowerCase().includes('add') &&
      playerName.match(/^[A-Za-z\s\.\'-]+$/)) {
    validPlayers.push({
      name: playerName,
      href: link.href,
      classes: link.className,
      parent: link.closest('tr, li, div[class*="pick"]')?.className || 'unknown'
    });
  }
}
console.log('Valid players found:', validPlayers);

// 5. Check current data extraction results
console.log('\n=== CURRENT EXTRACTION TEST ===');
// Try running our current extraction functions if they exist
if (typeof extractDraftPicks === 'function') {
  console.log('Testing extractDraftPicks...');
  try {
    const result = extractDraftPicks();
    console.log('Draft picks result:', result);
  } catch (e) {
    console.error('extractDraftPicks error:', e);
  }
}

if (typeof extractUserRoster === 'function') {
  console.log('Testing extractUserRoster...');
  try {
    const result = extractUserRoster();
    console.log('Roster result:', result);
  } catch (e) {
    console.error('extractUserRoster error:', e);
  }
}