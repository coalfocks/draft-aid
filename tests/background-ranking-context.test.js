const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');

const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  setInterval() {},
  setTimeout() {},
  clearTimeout() {},
  fetch() {},
  chrome: {
    storage: {
      local: {
        get(_keys, callback) {
          if (typeof callback === 'function') callback({});
          return Promise.resolve({});
        },
        set() {
          return Promise.resolve();
        }
      }
    },
    runtime: {
      onMessage: { addListener() {} },
      onStartup: { addListener() {} },
      onInstalled: { addListener() {} },
      sendMessage() {
        return Promise.resolve();
      }
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(`${source}
globalThis.__draftAidTest = {
  getGlobalQualityTier,
  getGlobalQualityLabel,
  getRookieFlag,
  getExperienceClass,
  buildSourcePositionTierLabel,
  insertBeforeLastUserMessage
};`, sandbox);

const helpers = sandbox.__draftAidTest;

assert.strictEqual(
  helpers.getGlobalQualityTier({
    Player: 'James Cook',
    'Rank - Overall': 6,
    Tier: 5,
    Experience: 4
  }),
  1,
  'overall rank should drive normalized global quality tier, not FFA positional tier'
);

assert.strictEqual(helpers.getGlobalQualityLabel(1), 'elite');

assert.strictEqual(
  helpers.buildSourcePositionTierLabel('RB', 5),
  'RB positional tier 5',
  'source positional tier should be self-describing instead of a bare tier number'
);

assert.strictEqual(
  helpers.getRookieFlag({ Player: 'Ashton Jeanty', Experience: 1 }),
  1,
  'FFA Experience 1 marks current-season rookies in the 2026 export'
);

assert.strictEqual(
  helpers.getExperienceClass({ Player: 'Ashton Jeanty', Experience: 1 }),
  'current_rookie'
);

assert.strictEqual(
  helpers.getRookieFlag({ Player: 'Malik Nabers', Experience: 2 }),
  0,
  'last season rookie class should not be marked rookie this season'
);

assert.strictEqual(
  helpers.getExperienceClass({ Player: 'Jayden Daniels', Experience: 2 }),
  'second_year'
);

assert.strictEqual(
  helpers.getRookieFlag({ Player: 'Jeremiyah Love', Experience: 0 }),
  0,
  'Experience 0 rows are future/devy/unknown in this export, not current NFL rookies'
);

const guardedMessages = helpers.insertBeforeLastUserMessage(
  [
    { role: 'system', content: 'base' },
    { role: 'assistant', content: 'old Tier 5 rookie claim' },
    { role: 'user', content: 'who should I draft?' }
  ],
  { role: 'system', content: 'latest data wins' }
);

assert.strictEqual(
  JSON.stringify(guardedMessages.map(message => message.content)),
  JSON.stringify(['base', 'old Tier 5 rookie claim', 'latest data wins', 'who should I draft?']),
  'history correction guard should land immediately before the newest user question'
);

console.log('background ranking context tests passed');
