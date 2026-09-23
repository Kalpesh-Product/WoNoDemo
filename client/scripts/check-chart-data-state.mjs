import assert from 'node:assert/strict';
import {getChartDataState} from '../src/utils/chartDataState.js';
for(const series of [[],[0,0],[{name:'Amount',data:[0,0]}],[NaN,null,undefined]]) assert.equal(getChartDataState(series),'empty');
for(const series of [[10,20],[{name:'Amount',data:[0,143]}],[{data:[{x:'Apr',y:-25}]}],[{data:[{x:'Apr',y:[0,45]}]}]]) assert.equal(getChartDataState(series),'populated');
assert.notEqual(getChartDataState([{data:[0,0]}]),getChartDataState([{data:[25,10]}]));
assert.equal(getChartDataState([{data:[25,10]}]),getChartDataState([{data:[30,15]}]));
console.log('Passed: empty-to-loaded series changes the mount key; subsequent loaded updates retain it, including negative and object-valued series.');
