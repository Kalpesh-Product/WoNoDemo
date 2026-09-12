const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {EJSON}=require('bson');
const {build}=require('./importPrintoutUpload');
const load=file=>EJSON.parse(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'));
const users=load('demo-upload/userdatas.json');
const clients=load('sales-upload/coworkingclients.json');
const members=load('member-revenue-upload/coworkingmembers.json');
const units=[...new Map(clients.map(c=>[String(c.unit),{_id:c.unit,building:c.building}])).values()];
const departments=[...new Map(users.flatMap(u=>u.departments).map(d=>[String(d),{_id:d}])).values()];
const input={company:clients[0].company,users,clients,members,units,departments,through:new Date('2026-09-12T00:00:00Z')};
const data=build(input);
assert(data.rows.length>400);
assert.equal(data.summary.length,6);
assert.equal(new Set(data.rows.map(r=>String(r._id))).size,data.rows.length);
assert(new Set(data.rows.map(r=>r.printoutCount)).size>15);
assert(new Set(data.rows.filter(r=>r.department).map(r=>String(r.department))).size===8);
assert(new Set(data.rows.map(r=>String(r.client))).size>8);
for(const row of data.rows){
  assert(row.takenAt>=new Date('2026-04-01')&&row.takenAt<=input.through);
  assert(!/\b(dummy|demo|synthetic|sample)\b/i.test(row.remark));
  assert(Number.isInteger(row.printoutCount)&&row.printoutCount>0);
  if(row.clientModel==='CoworkingClient'){
    const client=clients.find(c=>String(c._id)===String(row.client));
    const member=members.find(m=>String(m._id)===String(row.requestedBy));
    assert.equal(String(member.client),String(client._id));
    assert.equal(String(row.unit),String(client.unit));
    assert(row.takenAt>=new Date(client.startDate));
  }
}
assert.equal(build({...input,existing:data.rows}).rows.length,0);
console.table(data.summary);
console.log('Passed: schemas, unique IDs, six months, eight departments, varied quantities/clients, linked members and units, natural remarks, and reruns.');
