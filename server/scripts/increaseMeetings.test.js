const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {EJSON}=require('bson');
const {build,currentRooms,rebuildRevenue}=require('./increaseMeetings');
const root=path.resolve(__dirname,'..');
const load=p=>EJSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const rooms=load('activity-upload/rooms.json');
const visitors=load('activity-upload/visitors.json').filter(v=>v.visitorFlag==='Client');
const users=load('demo-upload/userdatas.json');
const existing=load('activity-upload/meetings.json');
const units=rooms.map(r=>({_id:r.location,unitNo:'Office'}));
const input={company:rooms[0].company,rooms,visitors,users,units,existing,through:new Date('2026-09-12T00:00:00Z')};
const result=build(input);
assert(result.meetings.length>500);
assert.equal(result.summary.length,6);
assert.equal(result.revenues.length,result.meetings.filter(m=>m.meetingType==='External').length);
assert.equal(result.visits.length,result.revenues.length);
for(const m of result.meetings){
  assert(m.endTime<=input.through);
  for(const other of [...existing,...result.meetings]){
    if(String(m._id)===String(other._id)||other.status==='Cancelled') continue;
    if(String(m.bookedRoom)===String(other.bookedRoom)) assert(!(m.startTime<other.endTime && m.endTime>other.startTime));
  }
}
for(const r of result.revenues){
  const m=result.meetings.find(m=>String(m._id)===String(r.meeting));
  assert(m);
  assert(visitors.some(v=>String(v._id)===String(m.externalClient)));
  assert.equal(r.totalAmount,m.paymentAmount);
  assert.equal(r.meetingRoomName,rooms.find(room=>String(room._id)===String(m.bookedRoom)).name);
}
assert.equal(build({...input,existing:[...existing,...result.meetings]}).meetings.length,0);
console.table(result.summary);
assert.equal(currentRooms(rooms,units).length,rooms.length);
assert.equal(currentRooms([{...rooms[0],name:'Dummy room'}],units).length,0);
const restored=rebuildRevenue({existing:result.meetings,revenue:[],rooms,visitors,through:input.through});
assert.equal(restored.rows.length,result.revenues.length);
assert.equal(restored.skipped.length,0);
assert.equal(rebuildRevenue({existing:result.meetings,revenue:restored.rows,rooms,visitors,through:input.through}).rows.length,0);
const external=result.meetings.find(m=>m.meetingType==='External');
assert.equal(rebuildRevenue({existing:[{...external,paymentAmount:999999}],revenue:[],rooms,visitors,through:input.through}).skipped.length,1);
assert.equal(rebuildRevenue({existing:[{...external,subject:'Dummy meeting'}],revenue:[],rooms,visitors,through:input.through}).rows.length,0);
for(const row of [...result.meetings,...result.revenues,...result.visits]) assert(!/\b(dummy|demo|synthetic)\b/i.test([row.subject,row.agenda,row.client,row.meetingRoomName,row.purposeOfVisit].filter(Boolean).join(' ')));
console.log('Passed: volume, six months, room conflicts, visitor references, matching revenue, cutoff and rerun idempotence.');
