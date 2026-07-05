const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/const text = response.text\(\)\.trim\(\)\.toUpperCase\(\);/, 'const text = response.text.trim().toUpperCase();');

fs.writeFileSync('server.ts', code);
