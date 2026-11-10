const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const [w, h, scheme, out, wait, script] = [+process.argv[2], +process.argv[3], process.argv[4], process.argv[5], +process.argv[6] || 4000, process.argv[7]];
  const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1 });
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  p.on('pageerror', e => console.log('PAGEERROR', e.message, e.stack.split('\n')[1]));
  await p.goto('file://' + __dirname + '/../dist/strata.html');
  await p.waitForTimeout(wait);
  if (script) console.log(JSON.stringify(await p.evaluate(script)));
  await p.waitForTimeout(600);
  await p.screenshot({ path: out, fullPage: w < 600 });
  await b.close();
})();
