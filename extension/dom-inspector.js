// Comprehensive DOM inspector for ESPN pages
// Run this in the console on ESPN draft pages to diagnose extraction issues

function inspectESPNPage() {
  console.log('🔍 ESPN PAGE INSPECTOR');
  console.log('='.repeat(50));
  console.log('URL:', window.location.href);
  console.log('Title:', document.title);
  console.log('Ready State:', document.readyState);
  console.log('');

  // 1. DRAFT STRUCTURE ANALYSIS
  console.log('📋 DRAFT STRUCTURE ANALYSIS');
  console.log('-'.repeat(30));
  
  const draftSelectors = [
    '.draft-column.flex',
    '.draft-column',
    '[class*="draft-column"]',
    '[class*="draft"]',
    '[data-testid*="draft"]'
  ];
  
  draftSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`${selector}: ${elements.length} found`);
    if (elements.length > 0) {
      const el = elements[0];
      console.log(`  - Classes: ${el.className}`);
      console.log(`  - Children: ${el.children.length}`);
      console.log(`  - Text content: "${el.textContent.substring(0, 100)}..."`);
      
      // Look for UL/OL/list structures inside
      const lists = el.querySelectorAll('ul, ol, [role="list"]');
      console.log(`  - Lists inside: ${lists.length}`);
      lists.forEach((list, i) => {
        const items = list.children.length;
        console.log(`    List ${i+1}: ${list.tagName} with ${items} items`);
        if (list.classList.contains('pa3') || list.className.includes('pa3')) {
          console.log(`    ⭐ This is the pa3 list!`);
        }
      });
    }
  });
  
  // 2. PLAYER LINKS ANALYSIS
  console.log('\n👤 PLAYER LINKS ANALYSIS');
  console.log('-'.repeat(30));
  
  const playerSelectors = [
    'a[title*=" "]',
    'a.AnchorLink',
    'a[href*="player"]',
    '.playerinfo_playername',
    '[class*="player"]'
  ];
  
  playerSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`${selector}: ${elements.length} found`);
    
    // Sample first few
    for (let i = 0; i < Math.min(5, elements.length); i++) {
      const el = elements[i];
      const text = el.textContent?.trim();
      const title = el.title?.trim();
      const href = el.href;
      
      if (text && text.length > 2) {
        console.log(`  ${i+1}. "${text}" (title: "${title || 'none'}")`);
        if (href) console.log(`     URL: ${href.substring(0, 60)}...`);
      }
    }
  });

  // 3. ROSTER ANALYSIS
  console.log('\n🏈 ROSTER ANALYSIS');
  console.log('-'.repeat(30));
  
  const rosterSelectors = [
    '.roster-module',
    '[class*="roster-module"]',
    '[class*="roster"]',
    '.my-team',
    '[data-testid*="roster"]'
  ];
  
  rosterSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`${selector}: ${elements.length} found`);
    
    if (elements.length > 0) {
      const el = elements[0];
      console.log(`  - Classes: ${el.className}`);
      
      // Look for tables
      const tables = el.querySelectorAll('table');
      console.log(`  - Tables inside: ${tables.length}`);
      
      tables.forEach((table, i) => {
        const rows = table.querySelectorAll('tr');
        console.log(`    Table ${i+1}: ${rows.length} rows`);
        
        // Sample first row structure
        if (rows.length > 1) {
          const firstDataRow = rows[1]; // Skip header
          const cells = firstDataRow.querySelectorAll('td, th');
          console.log(`    First row: ${cells.length} cells`);
          
          cells.forEach((cell, j) => {
            const positionDiv = cell.querySelector('div[title="Position"]');
            const byeDiv = cell.querySelector('div[title="Bye Week"]');
            const playerLink = cell.querySelector('a');
            
            if (positionDiv) console.log(`      Cell ${j}: POSITION = ${positionDiv.textContent}`);
            if (byeDiv) console.log(`      Cell ${j}: BYE WEEK = ${byeDiv.textContent}`);
            if (playerLink) console.log(`      Cell ${j}: PLAYER = ${playerLink.textContent}`);
          });
        }
      });
    }
  });

  // 4. PICK INFO ANALYSIS
  console.log('\n🎯 PICK INFO ANALYSIS');
  console.log('-'.repeat(30));
  
  const pickInfoSelectors = [
    '.pick-info',
    '[class*="pick-info"]',
    '[class*="round"]',
    '[class*="pick"]'
  ];
  
  pickInfoSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`${selector}: ${elements.length} found`);
    
    for (let i = 0; i < Math.min(5, elements.length); i++) {
      const el = elements[i];
      const text = el.textContent?.trim();
      if (text) {
        console.log(`  ${i+1}. "${text}"`);
        
        // Check if it matches R#, P# pattern
        const pickMatch = text.match(/R(\d+),\s*P(\d+)/);
        if (pickMatch) {
          console.log(`     ⭐ MATCH! Round ${pickMatch[1]}, Pick ${pickMatch[2]}`);
        }
      }
    }
  });

  // 5. GENERIC STRUCTURE ANALYSIS
  console.log('\n🏗️ PAGE STRUCTURE OVERVIEW');
  console.log('-'.repeat(30));
  
  console.log('Main containers:');
  const containers = document.querySelectorAll('main, section, article, .content, .container, [role="main"]');
  containers.forEach((container, i) => {
    console.log(`  ${i+1}. ${container.tagName} - ${container.className}`);
  });
  
  console.log('\nLarge lists (>5 items):');
  const lists = document.querySelectorAll('ul, ol');
  lists.forEach((list, i) => {
    if (list.children.length > 5) {
      console.log(`  List ${i+1}: ${list.tagName} with ${list.children.length} items (class: ${list.className})`);
      
      if (list.children.length > 0) {
        const firstItem = list.children[0];
        const itemText = firstItem.textContent?.trim().substring(0, 50);
        console.log(`    First item: "${itemText}..."`);
      }
    }
  });

  console.log('\nTables:');
  const tables = document.querySelectorAll('table');
  tables.forEach((table, i) => {
    const rows = table.querySelectorAll('tr');
    console.log(`  Table ${i+1}: ${rows.length} rows (class: ${table.className})`);
  });

  // 6. CURRENT DATA EXTRACTION TEST
  console.log('\n🧪 TESTING CURRENT EXTRACTION');
  console.log('-'.repeat(30));
  
  // Test if our functions exist and work
  if (typeof window.extractDraftPicks === 'function') {
    console.log('Testing extractDraftPicks...');
    try {
      const picks = window.extractDraftPicks();
      console.log(`Result: ${picks ? picks.length : 0} picks found`);
    } catch (e) {
      console.error('Error:', e);
    }
  } else {
    console.log('extractDraftPicks function not found');
  }
  
  if (typeof window.extractUserRoster === 'function') {
    console.log('Testing extractUserRoster...');
    try {
      const roster = window.extractUserRoster();
      console.log(`Result: ${roster ? roster.length : 0} roster players found`);
    } catch (e) {
      console.error('Error:', e);
    }
  } else {
    console.log('extractUserRoster function not found');
  }

  console.log('\n✅ INSPECTION COMPLETE');
  console.log('Copy this output and analyze the structure to fix extraction');
}

// Auto-run if not in extension context
if (typeof chrome === 'undefined' || !chrome.runtime) {
  console.log('Running in console mode...');
  inspectESPNPage();
} else {
  console.log('DOM Inspector loaded. Call inspectESPNPage() to run analysis.');
  window.inspectESPNPage = inspectESPNPage;
}