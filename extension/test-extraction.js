// Simple test script to run in ESPN console to see what we can extract
console.log('🧪 Testing ESPN data extraction...');

// Test 1: Find any player links
const playerLinks = document.querySelectorAll('a[title*=" "]');
console.log(`Found ${playerLinks.length} potential player links:`, 
  Array.from(playerLinks).slice(0, 10).map(a => ({
    text: a.textContent.trim(),
    title: a.title,
    href: a.href,
    classes: a.className
  }))
);

// Test 2: Find team names
const teamElements = document.querySelectorAll('[class*="team"]');
console.log(`Found ${teamElements.length} team elements:`,
  Array.from(teamElements).slice(0, 10).map(el => ({
    text: el.textContent.trim(),
    classes: el.className
  })).filter(el => el.text.length > 0)
);

// Test 3: Find draft board elements  
const draftElements = document.querySelectorAll('[class*="draft"], [class*="pick"], table tr');
console.log(`Found ${draftElements.length} potential draft elements`);

// Test 4: Find roster dropdown
const dropdown = document.querySelector('select');
console.log('Dropdown found:', dropdown ? dropdown.outerHTML.substring(0, 200) : 'None');

// Test 5: Page structure
console.log('Page structure sample:', document.body.innerHTML.substring(0, 1000));