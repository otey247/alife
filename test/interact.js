const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const out = process.argv[2];
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', deviceScaleFactor: 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto('file://' + __dirname + '/../dist/strata.html');
  await p.waitForTimeout(9000);
  // click a branch in the phylogeny, pick an organism, use tools, change sliders, switch tabs
  const dock = await p.locator('#dockcv').boundingBox();
  await p.mouse.click(dock.x + dock.width * 0.5, dock.y + 34);
  await p.waitForTimeout(400);
  const lifeText = await p.locator('#p-inspect').innerText();
  for (const t of ['pop', 'traits', 'log', 'phylo']) { await p.click(`#docktabs [data-v=${t}]`); await p.waitForTimeout(250); }
  await p.click('#layer [data-v=temp]'); await p.waitForTimeout(300); await p.click('#layer [data-v=light]'); await p.waitForTimeout(300); await p.click('#layer [data-v=terrain]');
  const w = await p.locator('#world').boundingBox();
  await p.click('#tool [data-v=raise]'); await p.mouse.move(w.x + w.width / 2, w.y + w.height / 2); await p.mouse.down(); await p.mouse.move(w.x + w.width / 2 + 60, w.y + w.height / 2 + 20, { steps: 6 }); await p.mouse.up();
  await p.click('#tool [data-v=impact]'); await p.mouse.click(w.x + w.width * 0.4, w.y + w.height * 0.4);
  await p.click('#tool [data-v=seed]'); await p.selectOption('#founder', 'hunter'); await p.mouse.click(w.x + w.width * 0.5, w.y + w.height * 0.45);
  await p.click('#tool [data-v=inspect]');
  await p.mouse.move(w.x + w.width / 2, w.y + w.height / 2); await p.mouse.wheel(0, -900); await p.waitForTimeout(300);
  const picked = await p.evaluate(() => { const o = strata.orgs.find(o => o.alive && o.mobile); return o ? { x: o.x, y: o.y } : null; });
  await p.click('#sidetabs [data-v=env]');
  await p.locator('#c-gravity').fill('2.5'); await p.locator('#c-seaLevel').fill('0.5'); await p.locator('#c-temperature').fill('5');
  await p.click('#sidetabs [data-v=engine]'); await p.check('#wf');
  await p.click('#sidetabs [data-v=inspect]');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: out });
  const st = await p.evaluate(() => ({ tick: strata.tick, pop: strata.orgs.length, g: strata.P.gravity, sea: strata.P.seaLevel, ev: strata.events.slice(-6).map(e => e.text), systems: strata.systems.map(s => s.name) }));
  console.log(JSON.stringify({ errs, lifeText: lifeText.slice(0, 160), st }, null, 1));
  await p.click('#sidetabs [data-v=env]'); await p.selectOption('#start', 'proto'); await p.click('#reset'); await p.waitForTimeout(2500);
  console.log('after reset', JSON.stringify(await p.evaluate(() => ({ tick: strata.tick, pop: strata.orgs.length, start: strata.start, spp: strata.species.size }))), 'errs', errs.length);
  await b.close();
})();
