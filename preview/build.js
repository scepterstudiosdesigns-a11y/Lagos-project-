'use strict';

// Assembles a single self-contained preview.html from the REAL stylesheet and
// the REAL seller app (public/app.js), plus the in-memory mock backend. The
// output opens offline in any browser — no server, no install.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const appjs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>LedgerLink — visual preview</title>
<style>
${css}
body { padding: 20px 0; }
.preview-note { max-width: 480px; margin: 0 auto 14px; padding: 10px 16px; font-size: 12px; color: var(--muted); text-align: center; }
.preview-note b { color: var(--accent); }
</style>
</head>
<body>
<div class="preview-note"><b>LedgerLink preview</b> — running offline with demo data. Tap the tabs at the bottom. (Account: Amaka Styles)</div>
<div class="app" id="app"></div>
<div id="toast"></div>
<script>
${mock}
</script>
<script>
${appjs}
</script>
</body>
</html>
`;

const out = path.join(root, 'preview.html');
fs.writeFileSync(out, html);
console.log('Wrote', out, `(${(html.length / 1024).toFixed(1)} KB)`);
