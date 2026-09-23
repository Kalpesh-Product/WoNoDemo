const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const parser=require('@babel/parser');
const read=name=>fs.readFileSync(path.resolve(__dirname,'../src/hooks',name),'utf8');
let effect,cleanup,callback,timer,changes=0,disconnected=false;
const source=read('useResponsiveChart.js').replace(/^import .*;\r?\n/gm,'').replace('export default function','function');
const run=Function('useEffect','useRef','useState','ResizeObserver','setTimeout','clearTimeout',source+'; return useResponsiveChart;')(
  fn=>{effect=fn;},()=>({current:{}}),()=>[0,()=>changes++],
  class {constructor(fn){callback=fn;}observe(){}disconnect(){disconnected=true;}},
  fn=>{timer=fn;return 1;},()=>{timer=null;}
);
run();cleanup=effect();
const resize=(width,height)=>callback([{contentRect:{width,height}}]);
resize(500,350);assert.equal(timer,undefined);
resize(500,370);assert.equal(changes,0);assert.equal(timer,undefined);
resize(700,370);assert(timer);timer();timer=null;assert.equal(changes,1);
resize(700,350);assert.equal(timer,null);
resize(0,0);resize(700,370);assert(timer);timer();assert.equal(changes,2);
cleanup();assert(disconnected);assert.equal(timer,null);
for(const name of ['useAxiosPrivate.js','useRefresh.js','useResponsiveChart.js'])parser.parse(read(name),{sourceType:'module'});
const auth=read('useAxiosPrivate.js');
assert(auth.includes('useLayoutEffect(() =>'));
assert(auth.includes('prevRequest && !prevRequest.sent'));
const barSource=fs.readFileSync(path.resolve(__dirname,'../src/components/graphs/BarGraph.jsx'),'utf8');
const barAst=parser.parse(barSource,{sourceType:'module',plugins:['jsx']});
let observedContainer=false, chartCount=0;
function walk(node) {
  if(!node||typeof node!=='object')return;
  if(node.type==='JSXOpeningElement'&&node.name.name==='div') observedContainer ||= node.attributes.some(a=>a.name?.name==='ref'&&a.value?.expression?.name==='containerRef');
  if(node.type==='JSXOpeningElement'&&node.name.name==='Chart')chartCount++;
  if(node.type==='CallExpression'&&node.callee.name==='setTimeout')assert.fail('Bar charts must not replace a mounting chart with a timer-driven loader');
  for(const [key,value] of Object.entries(node)) {
    if(['loc','comments','tokens'].includes(key))continue;
    if(Array.isArray(value))value.forEach(walk);
    else if(value&&typeof value==='object')walk(value);
  }
}
walk(barAst.program);
assert(observedContainer,'The resize observer must be attached to the rendered container');
assert.equal(chartCount,1);
console.log('Passed: chart height changes do not remount, width/visibility changes recover, cleanup and hook syntax.');
