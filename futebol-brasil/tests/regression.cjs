/* Real-browser regression tests. No external service or player data is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test, before, after, beforeEach, afterEach } = require('node:test');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(process.env.FB_HTML_PATH || path.join(__dirname, '../index.html'));
let server, browser, context, page, url, errors;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url !== '/') { res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/`;
  const engine = process.env.FB_BROWSER || 'chromium';
  browser = await pw[engine].launch({ headless: true, ...(process.env.FB_BROWSER_EXECUTABLE ? {executablePath:process.env.FB_BROWSER_EXECUTABLE} : {}) });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });
beforeEach(async () => {
  context = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block' });
  page = await context.newPage(); errors=[];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(url, {waitUntil:'domcontentloaded'});
  await page.locator('#mgr').waitFor();
  await page.evaluate(() => {
    newWorld(104729,7);S.mgr=[mkMgr('Teste',0)];startCareer();UI.me=0;UI.screen='hub';UI.tab='elenco';
    CFG.speed=1;CFG.halfStop=false;closeModal();render();
  });
});
afterEach(async () => { await context?.close(); assert.deepEqual(errors, [], 'uncaught browser errors'); });

async function liveAuto() {
  await page.evaluate(() => { ACT.automode();clearTimeout(AUTO.timer);startMatchday(false);clearTimeout(AUTO.timer); });
}
async function stop() { await page.locator('#auto-stop [data-a=autostop]').tap(); }
async function state() { return page.evaluate(() => ({on:AUTO.on,min:UI.live?.min,paused:UI.live?.paused,done:UI.live?.done,busy:!!UI.busy,turn:S.turn,screen:UI.screen})); }

test('stop before kickoff, then kickoff actually advances; preferences restored', async () => {
  await page.evaluate(() => ME().autoSub=false);
  await liveAuto(); await stop();
  assert.equal((await state()).paused,true);
  assert.equal(await page.evaluate(() => UI.live.ms.find(m=>m.mine).s.find(s=>s.user).auto),false);
  await page.locator('[data-a=lstart]').tap();
  await page.waitForFunction(() => UI.live.min>0);
  await page.locator('[data-a=lpause]').tap();
  assert.equal((await state()).paused,true);
});

test('touch stops a running calculation and no stale callback resumes it', async () => {
  await liveAuto();
  await page.evaluate(() => {
    const original=stepMin;stepMin=L=>{const until=performance.now()+12;while(performance.now()<until){}original(L);};
    void autoStep();
  });
  await page.waitForFunction(() => UI.busy&&UI.live.min>0);
  const start=Date.now();await stop();
  await page.waitForFunction(() => !UI.busy);
  const stopped=await state();
  assert.equal(stopped.on,false);assert.equal(stopped.paused,true);assert.ok(stopped.min<90);
  assert.ok(Date.now()-start<1500,'manual control returned promptly under synthetic load');
  await page.waitForTimeout(1500);assert.deepEqual(await state(),stopped);
  await page.locator('[data-a=lpause]').tap();
  await page.waitForFunction(min=>UI.live.min>min,stopped.min);
});

test('manual pause button survives redraws between touch down and touch up', async () => {
  await page.evaluate(() => {startMatchday(false);UI.live.min=10;UI.live.paused=false;renderLive();});
  await page.locator('[data-a=lpause]').waitFor();
  assert.equal(await page.evaluate(async () => {
    const b=document.querySelector('[data-a=lpause]');
    for(let i=0;i<5;i++){UI.live.min++;renderLive();await new Promise(r=>requestAnimationFrame(r));}
    return b.isConnected && b===document.querySelector('[data-a=lpause]');
  }),true);
  await page.locator('[data-a=lpause]').tap();assert.equal((await state()).paused,true);
});

test('stop after final whistle prevents automatic continuation; double finish is ignored', async () => {
  await liveAuto();
  await page.evaluate(async () => {await skipLive(AUTO.epoch);void autoStep();});
  await stop();const stopped=await state();
  await page.waitForTimeout(1500);assert.equal((await state()).turn,stopped.turn);
  await page.evaluate(async () => {const a=finishMatchday(false);const b=finishMatchday(false);await Promise.all([a,b]);});
  assert.equal((await state()).turn,stopped.turn+1);
});

test('rapid stop/start invalidates timers from the previous automatic session', async () => {
  await liveAuto();
  await page.evaluate(() => {autoNext(5);autoOff();ACT.automode();clearTimeout(AUTO.timer);autoOff();});
  const stopped=await state();await page.waitForTimeout(1400);assert.deepEqual(await state(),stopped);
});

test('stop after the fifth game is safe even with no live match left', async () => {
  await page.evaluate(() => {AUTO.on=true;AUTO.remaining=1;AUTO.y=S.year;startMatchday(true);UI.screen='live';render();});
  await page.evaluate(() => finishMatchday(false));
  // The PR keeps its original season limit; the mobile edition stops at five.
  if(html.includes(Buffer.from('Simular 5 jogos'))) assert.equal((await state()).on,false);
  assert.equal((await state()).screen,'hub');
});

test('mobile completes five automatic games and returns to usable manual controls', {timeout:30000}, async t => {
  if(!html.includes(Buffer.from('Simular 5 jogos'))) return t.skip('mobile five-game limit only');
  await page.evaluate(()=>{ME().conf=100;ACT.automode();});
  await page.waitForFunction(()=>!AUTO.on&&!UI.busy&&UI.screen==='hub',{},{timeout:25000});
  const remaining=await page.evaluate(()=>AUTO.remaining);
  assert.equal(remaining,0,'all five matches completed (no other stop condition fired)');
  assert.equal(await page.locator('#auto-stop').isVisible(),false);
  await page.locator('[data-a=play]').tap();
  await page.waitForFunction(()=>UI.screen==='live'&&!UI.busy);
  await page.locator('[data-a=lstart]').tap();
  await page.waitForFunction(()=>UI.live.min>0);
});

test('fifth-game stop on Libertadores/Champions date returns to the hub', async t => {
  if(!html.includes(Buffer.from('Simular 5 jogos'))) return t.skip('mobile five-game limit only');
  await page.evaluate(()=>{
    newWorld(104729,7);const team=S.teams.find(t=>t.name==='Flamengo');
    S.mgr=[mkMgr('Teste',team.id)];startCareer();S.year=2028;
    S.md=S.cal.findIndex(ev=>ev.t==='X'&&ev.d===5);
    if(S.md<0||!fixtureOf(team.id,curEv()))throw Error('continental fixture missing');
    AUTO.on=true;AUTO.remaining=1;AUTO.y=S.year;AUTO.seen=new Set();
    startMatchday(true);UI.screen='live';render();
  });
  await page.evaluate(()=>finishMatchday(false));
  assert.equal((await state()).screen,'hub');assert.equal((await state()).on,false);
  assert.equal(await page.locator('[data-a=play]').isVisible(),true);
});

test('backgrounding the page pauses automatic mode', async () => {
  await liveAuto();
  await page.evaluate(() => {Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal((await state()).on,false);assert.equal((await state()).paused,true);
});

test('headless dates finish atomically and stop before the next date', async () => {
  await page.evaluate(() => {
    S.md=S.cal.findIndex(ev=>ev.t==='X'&&!humanPlays(ev));
    if(S.md<0)throw Error('fixture must contain a non-human date');
    ACT.automode();clearTimeout(AUTO.timer);
    const original=stepMin;stepMin=L=>{const until=performance.now()+3;while(performance.now()<until){}original(L);};
    window.beforeTurn=S.turn;void quickSim();
  });
  await page.waitForFunction(()=>UI.busy&&UI.live?.min>0);await stop();
  await page.waitForFunction(()=>!UI.busy);
  assert.equal(await page.evaluate(()=>S.turn-window.beforeTurn),1);
  assert.equal((await state()).screen,'hub');assert.equal((await state()).on,false);
});

test('seeded online results match synchronous reference for world versions 2–7', async () => {
  const result=await page.evaluate(async () => {
    const out=[];
    for(const ver of [2,3,4,5,6,7]){
      newOnlineGame({seed:104729,ver,pool:'A',host:'a',guest:'b',hostName:'A',guestName:'B'});
      const initial=JSON.stringify(S);AUTO.on=false;
      startMatchday(true);finishMatchday(true);const expected=JSON.stringify(S);
      S=JSON.parse(initial);startMatchday('prepare');await runRemaining(UI.live);finishMatchday(true);
      out.push([ver,JSON.stringify(S)===expected]);
    }return out;
  });
  assert.deepEqual(result,[[2,true],[3,true],[4,true],[5,true],[6,true],[7,true]]);
});

test('manual override does not retract an online ready turn or change its substitutions', async () => {
  assert.deepEqual(await page.evaluate(() => {
    newOnlineGame({seed:42,ver:7,pool:'A',host:'a',guest:'b'});startMatchday('prepare');
    UI.on={sent:true};AUTO.on=true;
    // Avoid unrelated lobby rendering; inspect cancellation of local automation.
    UI.screen='start';autoOff();
    return {sent:UI.on.sent,on:AUTO.on,auto:UI.live.ms.flatMap(m=>m.s).filter(s=>s.human).every(s=>s.auto)};
  }),{sent:true,on:false,auto:true});
});

test('solo save/export survives manual cancellation and reload', async () => {
  await liveAuto();await stop();
  await page.evaluate(async () => {await skipLive();await finishMatchday(false);await save();});
  const saved=await page.evaluate(()=>JSON.stringify(S));
  assert.equal(await page.evaluate(()=>JSON.stringify(importCode(exportCode()))),saved);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-a=load]').waitFor();
  await page.locator('[data-a=load]').tap();
  assert.equal(await page.evaluate(()=>JSON.stringify(S)),saved);
});

test('mobile layouts keep the manual override visible, reachable, and at least 44px', async () => {
  await liveAuto();
  for(const [width,height] of [[320,568],[390,844],[412,915],[844,390]]){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>{window.scrollTo(0,document.body.scrollHeight);showModal('Teste','Modal de teste','<button data-a="close">Fechar</button>');});
    const box=await page.locator('#auto-stop [data-a=autostop]').boundingBox();
    assert.ok(box.height>=44&&box.width>=44);assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
    assert.ok(await page.evaluate(()=>{const el=document.querySelector('#auto-stop [data-a=autostop]'),b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page-level horizontal overflow');
  }
  await stop();assert.equal((await state()).on,false);
});

test('missing online backend leaves solo playable and shows a clear explanation', async () => {
  await page.evaluate(()=>{S=null;UI.screen='start';UI.startMode='online';render();});
  await page.waitForFunction(()=>!document.querySelector('#app').textContent.includes('Conectando ao modo online'));
  const text=await page.locator('#app').innerText();
  assert.match(text,/Online indisponível|servidor do jogo/);
  assert.equal(await page.locator('[data-a=ocreate]').count(),0);
});
