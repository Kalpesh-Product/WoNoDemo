const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const mongoose=require('mongoose');
const {EJSON}=require('bson');
const Printout=require('../models/Printout');
const root=path.resolve(__dirname,'..');
const load=file=>EJSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const companyId='6799f0cd6a01edbe1bc3fcea';
const id=key=>new mongoose.Types.ObjectId(createHash('sha256').update('printout-v1:'+key).digest('hex').slice(0,24));
const descriptions=['Monthly expense reconciliation','Client onboarding checklist','Project proposal','Training handouts','Quarterly planning notes','Supplier quotation comparison','Operations checklist','Service agreement','Presentation handouts','Account review notes','Workspace allocation plan','Equipment inspection checklist','Purchase request','Employee induction pack','Invoice reconciliation','Meeting action notes'];
const clean=value=>! /\b(dummy|demo|synthetic|sample|test)\b/i.test(value||'');
function build({company,users,departments,units,clients,members,through,existing=[]}) {
  const eligibleUsers=users.filter(u=>(u.departments||[]).some(d=>departments.some(p=>String(p._id)===String(d))));
  if(!eligibleUsers.length||!units.length) throw new Error('No eligible users or active company units');
  const ids=new Set(existing.map(r=>String(r._id))), rows=[];
  for(let day=new Date('2026-04-01');day<through;day=new Date(+day+86400000)) {
    if([0,6].includes(day.getUTCDay()))continue;
    const date=day.toISOString().slice(0,10),month=day.getUTCMonth()-3;
    const count=3+month%3+(day.getUTCDate()%4===0?1:0);
    for(let n=0;n<count;n++) {
      const recordId=id(date+':'+n);if(ids.has(String(recordId)))continue;
      const seed=day.getUTCDate()*17+month*11+n*13;
      const takenAt=new Date(+day+(4+n*1.25+(seed%4)*0.15)*3600000);if(takenAt>through)continue;
      const user=eligibleUsers[seed%eligibleUsers.length];
      const eligibleMembers=members.filter(m=>m.isActive!==false&&!m.isDeleted&&clean(m.employeeName)&&(!m.dateOfJoining||new Date(m.dateOfJoining)<=takenAt)&&clients.some(c=>String(c._id)===String(m.client)&&c.isActive!==false&&clean(c.clientName)&&(!c.startDate||new Date(c.startDate)<=takenAt)&&(!c.endDate||new Date(c.endDate)>=takenAt)&&units.some(u=>String(u._id)===String(c.unit))));
      const external=n%3!==0&&eligibleMembers.length>0;
      const member=external?eligibleMembers[seed%eligibleMembers.length]:null;
      const client=member?clients.find(c=>String(c._id)===String(member.client)):null;
      const unit=client?units.find(u=>String(u._id)===String(client.unit)):units[seed%units.length];
      const department=external?null:(user.departments||[]).find(d=>departments.some(p=>String(p._id)===String(d)));
      const quantity=[3,5,8,12,16,22,28,36,48,64][seed%10]+(month+n)%5;
      const row={_id:recordId,takenBy:user._id,takenAt,unit:unit._id,location:unit.building||null,clientModel:external?'CoworkingClient':'Company',client:external?client._id:company,requestedByModel:external?'CoworkingMember':'UserData',requestedBy:external?member._id:user._id,department,printoutCount:quantity,remark:`${descriptions[seed%descriptions.length]} — ${['working copy','team review','reference copy','distribution set'][Math.floor(seed/7)%4]}, ${date}`,createdAt:takenAt,updatedAt:takenAt};
      const doc=new Printout(row),error=doc.validateSync();if(error)throw error;
      rows.push(doc.toObject({versionKey:false}));
    }
  }
  const summary=[...new Set(rows.map(r=>r.takenAt.toISOString().slice(0,7)))].map(month=>{const monthly=rows.filter(r=>r.takenAt.toISOString().startsWith(month));return {month,entries:monthly.length,pages:monthly.reduce((n,r)=>n+r.printoutCount,0),clientJobs:monthly.filter(r=>r.clientModel==='CoworkingClient').length};});
  return {rows,summary};
}
async function main(){
  const {values}=require('node:util').parseArgs({options:{db:{type:'string'},apply:{type:'boolean',default:false},through:{type:'string',default:new Date().toISOString()}}});
  const uri=process.env.DB_URL,through=new Date(values.through);
  if(!uri||values.db!=='WonoDemoUserData'||new URL(uri).hostname.toLowerCase()!=='cluster0.d9cnr.mongodb.net')throw new Error('Use target DB_URL and --db WonoDemoUserData');
  if(!Number.isFinite(+through)||through>new Date()||through<=new Date('2026-04-01')||through>=new Date('2027-01-01'))throw new Error('Cutoff must be in April–December 2026 and not in the future');
  const company=new mongoose.Types.ObjectId(companyId);
  const referenceUsers=load('demo-upload/userdatas.json');
  const departmentIds=[...new Map(referenceUsers.flatMap(u=>u.departments||[]).map(d=>[String(d),d])).values()];
  await mongoose.connect(uri,{dbName:values.db,autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:15000});
  const db=mongoose.connection.db;
  async function prepare(session){
    if(!await db.collection('companies').findOne({_id:company},{session}))throw new Error('Company missing');
    const users=await db.collection('userdatas').find({company,_id:{$in:referenceUsers.map(u=>u._id)}},{session}).sort({_id:1}).toArray();
    const departments=await db.collection('departments').find({_id:{$in:departmentIds}},{session}).toArray();
    const units=await db.collection('units').find({company,isActive:{$ne:false}},{session}).sort({_id:1}).toArray();
    const clients=await db.collection('coworkingclients').find({company,isActive:{$ne:false}},{session}).sort({_id:1}).toArray();
    const members=await db.collection('coworkingmembers').find({company,isActive:{$ne:false},isDeleted:{$ne:true}},{session}).sort({_id:1}).toArray();
    const data=build({company,users,departments,units,clients,members,through});
    const buildingIds=[...new Map(data.rows.filter(r=>r.location).map(r=>[String(r.location),r.location])).values()];
    if(await db.collection('buildings').countDocuments({_id:{$in:buildingIds}},{session})!==buildingIds.length)throw new Error('A referenced unit building is missing');
    const existing=await db.collection('printouts').find({_id:{$in:data.rows.map(r=>r._id)}},{session}).toArray();
    for(const row of existing)if(!users.some(u=>String(u._id)===String(row.takenBy))||!units.some(u=>String(u._id)===String(row.unit)))throw new Error('Existing printout ID conflicts with target company');
    return build({company,users,departments,units,clients,members,through,existing});
  }
  const preview=await prepare();console.table(preview.summary);
  console.log(`${preview.rows.length} new printout records; existing IDs skipped.`);
  if(!values.apply){console.log('Preflight passed. No database writes. Add --apply to import.');return;}
  if(!await db.listCollections({name:'printouts'}).hasNext())await db.createCollection('printouts');
  const session=await mongoose.startSession();
  try{await session.withTransaction(async()=>{const {rows}=await prepare(session);if(rows.length)await db.collection('printouts').bulkWrite(rows.map(row=>({updateOne:{filter:{_id:row._id},update:{$setOnInsert:row},upsert:true}})),{session});});console.log('Printout entries imported into WonoDemoUserData.');}finally{await session.endSession();}
}
if(require.main===module)main().catch(e=>{console.error(String(e.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g,'[redacted URI]'));process.exitCode=1;}).finally(()=>mongoose.disconnect());
module.exports={build};
