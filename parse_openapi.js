const fs = require('fs');
const openapi = JSON.parse(fs.readFileSync('openapi.json', 'utf8'));
console.log(JSON.stringify(openapi.definitions, null, 2));
