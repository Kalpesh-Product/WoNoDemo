const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');
const audit = require('./chart-currency-audit.json');
let checked = 0;
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key,value] of Object.entries(node)) {
    if (['loc','comments','tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(item => walk(item,visit));
    else if (value && typeof value === 'object') walk(value,visit);
  }
}
for (const {file} of audit.details) {
  const source = fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8');
  const ast = parser.parse(source,{sourceType:'module',plugins:['jsx']});
  walk(ast.program,node => {
    if (node.type !== 'ObjectProperty' || node.key.name !== 'yaxis') return;
    const code = source.slice(node.start,node.end);
    if (!/Amount \(USD\)|Revenue \(USD\)/.test(code)) return;
    assert.doesNotMatch(code,/Lakhs|Crores|en-IN|\/\s*10000/);
    walk(node.value,child => {
      if (child.type !== 'ObjectProperty' || child.key.name !== 'formatter') return;
      const format = Function('return ('+source.slice(child.value.start,child.value.end)+')')();
      for (const [value,expected] of [[178506,'178,506'],[0,'0'],[-5434,'-5,434'],[10000000,'10,000,000']]) assert.equal(format(value),expected,file);
      checked++;
    });
  });
}
assert.equal(checked,audit.chartConfigurations);
const assets = fs.readFileSync(path.resolve(__dirname,'../src/pages/Assets/AssetsDashboard.jsx'),'utf8');
assert.doesNotMatch(assets,/total\s*\/\s*100000/);
console.log(`${checked} USD chart formatters passed; asset series retains full USD values.`);
