const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');
const source = fs.readFileSync(path.resolve(__dirname,'../src/pages/Assets/AssetsDashboard.jsx'),'utf8');
const ast = parser.parse(source,{sourceType:'module',plugins:['jsx']});
const expressions = {};
function walk(node) {
  if(!node || typeof node !== 'object') return;
  if(node.type === 'VariableDeclarator' && ['parseAssetPurchaseDate','getAssetGraphDate','getFiscalYearFromDate'].includes(node.id?.name)) expressions[node.id.name] = source.slice(node.init.start,node.init.end);
  for(const [key,value] of Object.entries(node)) {
    if(['loc','comments','tokens'].includes(key)) continue;
    if(Array.isArray(value)) value.forEach(walk);
    else if(value && typeof value === 'object') walk(value);
  }
}
walk(ast.program);
const {date,fy}=Function(`const parseAssetPurchaseDate=${expressions.parseAssetPurchaseDate}; return {date:${expressions.getAssetGraphDate},fy:${expressions.getFiscalYearFromDate}};`)();
for(let month=4;month<=8;month++) {
  const d=date({purchaseDate:`2026-${String(month).padStart(2,'0')}-15T00:00:00Z`,createdAt:'2026-09-09T00:00:00Z'});
  assert.equal(d.getUTCMonth(),month-1);
  assert.equal(fy(d),'FY 2026-27');
}
assert.equal(fy(date({purchaseDate:'2026-01-23',createdAt:'2026-09-09'})),'FY 2025-26');
assert.equal(date({purchaseDate:'invalid',createdAt:'2026-09-09'}).getUTCMonth(),8);
assert.equal(date({createdAt:'2026-09-09'}).getUTCMonth(),8);
assert.equal(date({}),null);
assert.equal(date({purchaseDate:'15/04/2026'}).getMonth(),3);
console.log('Passed: purchase-month attribution, fiscal-year boundary, legacy dates and missing-date fallback.');
