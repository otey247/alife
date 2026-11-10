// Bundles index.html + engine.js + ui.js into one standalone file: node build.js
const fs = require('fs'), path = require('path');
let page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
for (const f of ['engine.js', 'ui.js'])
  page = page.replace('<script src="' + f + '"></script>', () => '<script>\n' + fs.readFileSync(path.join(__dirname, f), 'utf8') + '\n</script>');
const out = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + page + '\n</body>\n</html>\n';
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'strata.html'), out);
console.log('dist/strata.html', (out.length / 1024).toFixed(0) + ' KB');
