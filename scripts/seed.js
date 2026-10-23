// Usage: node scripts/seed.js [count]
// Appends demo responses (flagged demo:true) to the data store so you can preview the admin analytics.
const fs = require('fs');
const path = require('path');
const demo = require('../lib/demo.js');

const file = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'responses.json');
const count = Number(process.argv[2]) || 160;
fs.mkdirSync(path.dirname(file), { recursive: true });
let existing = [];
try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { existing = []; }
const merged = existing.concat(demo.generate(count, Date.now() % 100000)).sort((a, b) => a.ts - b.ts);
fs.writeFileSync(file, JSON.stringify(merged));
console.log('Added ' + count + ' demo responses. Total now: ' + merged.length);
console.log('Remove them any time from the admin dashboard ("Remove demo data").');
