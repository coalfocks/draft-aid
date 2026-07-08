const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const contentScript = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');

function loadExtractor(html) {
  const dom = new JSDOM(html, {
    url: 'https://fantasy.espn.com/football/draft?leagueId=123456',
    pretendToBeVisual: true
  });

  const context = vm.createContext({
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    console: {
      log() {},
      warn() {},
      error() {}
    },
    chrome: {
      runtime: {
        sendMessage: () => Promise.resolve(),
        onMessage: { addListener() {} }
      }
    },
    setTimeout: dom.window.setTimeout.bind(dom.window),
    clearTimeout: dom.window.clearTimeout.bind(dom.window),
    setInterval: dom.window.setInterval.bind(dom.window),
    clearInterval: dom.window.clearInterval.bind(dom.window)
  });

  context.window.window = context.window;
  context.window.chrome = context.chrome;
  context.window.console = context.console;
  context.window.__picksDebounce__ = null;

  vm.runInContext(contentScript, context);

  return {
    extractor: context.window.__draftAidExtract,
    document: dom.window.document,
    close: () => dom.window.close()
  };
}

function testDraftColumnExtraction() {
  const { extractor, document, close } = loadExtractor(`
    <!doctype html>
    <body>
      <div class="draft-column flex">
        <ul class="pa3">
          <li class="pick-message__container">
            <div>
              <div>avatar</div>
              <div class="pick__message-information">
                <span class="playerinfo__playername">Ja'Marr Chase</span>
                <span class="playerinfo__playerpos">WR</span>
                <span class="playerinfo__playerteam">CIN</span>
                <div class="pick-info">R1, P3 <span>- Coal's Team</span></div>
              </div>
            </div>
          </li>
          <li class="pick-message__container">
            <div>
              <div>avatar</div>
              <div class="pick__message-information">
                <span class="playerinfo_playername">San Francisco 49ers</span>
                <span class="playerinfo_playerpos">D/ST</span>
                <span class="playerinfo_playerteam">SF</span>
                <div class="pick-info">R12, P8 <span>- Defense Wins</span></div>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </body>
  `);

  const picks = extractor.extractFromDraftColumn(document.querySelector('.draft-column'));
  assert.strictEqual(picks.length, 2);
  assert.strictEqual(picks[0].player.name, "Ja'Marr Chase");
  assert.strictEqual(picks[0].player.position, 'WR');
  assert.strictEqual(picks[0].player.team, 'CIN');
  assert.strictEqual(picks[0].round, 1);
  assert.strictEqual(picks[0].pickInRound, 3);
  assert.strictEqual(picks[0].draftingTeam, "Coal's Team");
  assert.strictEqual(picks[1].player.position, 'DST');
  assert.strictEqual(picks[1].player.team, 'SF');
  close();
}

function testTeamDedupe() {
  const { extractor, close } = loadExtractor(`
    <!doctype html>
    <body>
      <div class="team-name">Coal's Team</div>
      <div class="team-name">Coal's Team</div>
      <div data-testid="team-name">Draft Sharks</div>
    </body>
  `);

  extractor.extractTeams();
  const data = extractor.getDraftData();
  assert.strictEqual(JSON.stringify(data.teams.map(team => team.name)), JSON.stringify(["Draft Sharks", "Coal's Team"]));
  close();
}

testDraftColumnExtraction();
testTeamDedupe();

console.log('content extraction tests passed');
