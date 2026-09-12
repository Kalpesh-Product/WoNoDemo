const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const mongoose = require('mongoose');
const {EJSON} = require('bson');
const Meeting = require('../models/meetings/Meetings');
const Revenue = require('../models/sales/MeetingRevenue');
const Visit = require('../models/visitor/ExternalVisits');
const {revenueFor} = require('./buildSalesUpload');
const companyId = '6799f0cd6a01edbe1bc3fcea';
const root = path.resolve(__dirname, '..');
const oid = key => new mongoose.Types.ObjectId(createHash('sha256').update('meeting-growth-v1:'+key).digest('hex').slice(0,24));
const load = file => EJSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const subjects = ['Quarterly account review','Product planning workshop','Supplier evaluation','Workspace requirements discussion','Project milestone review','Financial planning session','Client onboarding discussion','Service delivery review','Technical architecture workshop','Partnership discussion','Operations planning','Contract renewal discussion'];
function checked(Model,row) { const doc = new Model(row); const error = doc.validateSync(); if(error) throw error; return doc.toObject({versionKey:false}); }
const placeholder = /\b(demo|dummy|synthetic|test|sample)\b/i;
function currentRooms(allRooms,units) {
  return allRooms.filter(r=>r.isActive!==false && r.name?.trim() && !placeholder.test(r.name) && Number(r.seats)>=2 && units.some(u=>String(u._id)===String(r.location) && u.isActive!==false));
}
function rebuildRevenue({existing,revenue,rooms,visitors,through}) {
  const rows=[],skipped=[];
  const invoiced=new Set(revenue.map(r=>String(r.meeting)));
  for(const m of existing) {
    if(m.meetingType!=='External'||m.status==='Cancelled'||invoiced.has(String(m._id))) continue;
    if(new Date(m.startDate)<new Date('2026-04-01')||!(new Date(m.endTime)<=through)) continue;
    const room=rooms.find(r=>String(r._id)===String(m.bookedRoom));
    const visitor=visitors.find(v=>[m.externalClient,m.externalBookedBy].some(id=>id && String(id)===String(v._id)));
    try {
      if(!room||!visitor) throw new Error('Missing eligible room or visitor');
      if(placeholder.test([m.subject,m.agenda,room.name,visitor.firstName,visitor.lastName,visitor.registeredClientCompany,visitor.visitorCompany].filter(Boolean).join(' '))) throw new Error('Existing display text needs cleanup');
      if(m.paymentBaseAmount==null||m.paymentAmount==null) throw new Error('Missing recorded payment amounts');
      const row=revenueFor(m,room,visitor);
      if(Math.abs(row.taxable+row.gst-row.totalAmount)>0.02) throw new Error('Recorded payment totals do not reconcile');
      row.costPerHour=Math.round(row.taxable/Number(row.hoursBooked)*100)/100;
      rows.push(checked(Revenue,row));
    } catch(error) {skipped.push({meeting:String(m._id),reason:error.message});}
  }
  return {rows,skipped};
}
function build({company,rooms,visitors,users,units,existing,through}) {
  if (!rooms.length || !visitors.length || !users.length) throw new Error('Need active rooms, existing client visitors, and department users. No records written.');
  const meetings=[], visits=[], revenues=[], summary=[];
  const occupied=[...existing];
  const known = new Set(existing.map(r=>String(r._id)));
  for(let day=new Date('2026-04-01T00:00:00Z'); day<through; day=new Date(+day+86400000)) {
    if([0,6].includes(day.getUTCDay())) continue;
    const date=day.toISOString().slice(0,10), month=day.getUTCMonth()-3;
    const eligible=visitors.filter(v=>!v.createdAt || new Date(v.createdAt)<=day);
    if(!eligible.length) continue;
    const target=4+month+(day.getUTCDate()%3===0?1:0);
    for(let n=0;n<target;n++) {
      const meetingId=oid(`${date}:${n}`); if(known.has(String(meetingId))) continue;
      const seed=day.getUTCDate()*11+month*19+n*7;
      const external=n%3!==0, visitor=eligible[seed%eligible.length], user=users[seed%users.length];
      const hours=[1,1.5,2,2.5][seed%4];
      let booking;
      for(let slot=0;slot<14 && !booking;slot++) for(let r=0;r<rooms.length && !booking;r++) {
        const room=rooms[(seed+r)%rooms.length];
        if(external && !(Number(room.perHourPrice)>0)) continue;
        const start=new Date(+day+(3.5+slot*0.5)*3600000), end=new Date(+start+hours*3600000);
        if(end>through || end>new Date(+day+13*3600000)) continue;
        const conflict=occupied.some(m=>m.status!=='Cancelled' && new Date(m.startTime)<end && new Date(m.extendTime || m.endTime)>start && (String(m.bookedRoom)===String(room._id) || String(m.bookedBy)===String(user._id) || (m.internalParticipants||[]).some(id=>String(id)===String(user._id)) || external && [m.externalClient,m.externalBookedBy].some(id=>id && String(id)===String(visitor._id))));
        if(!conflict) booking={room,start,end};
      }
      if(!booking) continue;
      const {room,start,end}=booking;
      const taxable=external?Math.round(hours*Number(room.perHourPrice)*100)/100:0;
      const gst=external?Math.round(hours*Number(room.perHourGstPrice||0)*100)/100:0;
      const paid=external && seed%7!==0;
      const title=subjects[seed%subjects.length];
      const meeting=checked(Meeting,{_id:meetingId,company,bookedBy:user._id,receptionist:user._id,bookedRoom:room._id,location:units.find(u=>String(u._id)===String(room.location))?.unitNo,startDate:start,endDate:end,startTime:start,endTime:end,completedAt:end,completedBy:user._id,meetingType:external?'External':'Internal',status:'Completed',subject:title,agenda:`${title}: review progress, resolve open questions, and agree next actions.`,internalParticipants:[user._id],...(external?{externalClient:visitor._id,externalBookedBy:visitor._id,externalParticipants:[{name:[visitor.firstName,visitor.lastName].filter(Boolean).join(' '),mobileNumber:visitor.phoneNumber}]}:{}),paymentBaseAmount:taxable,paymentGstAmount:gst,paymentAmount:Math.round((taxable+gst)*100)/100,paymentStatus:paid,paymentVerification:paid?'Verified':'Pending',...(external?{paymentMode:['Credit Card','NEFT','Cash'][seed%3]}:{}),creditsUsed:external?0:hours*Number(room.perHourCredit||0),houeskeepingStatus:'Completed',createdAt:start,updatedAt:end});
      meetings.push(meeting); occupied.push(meeting);
      if(external) {
        revenues.push(checked(Revenue,revenueFor(meeting,room,visitor)));
        visits.push(checked(Visit,{_id:oid('visit:'+meetingId),company,visitorId:visitor._id,meeting:meetingId,visitorType:'Meeting',visitorFlag:'Client',visitorRoles:['Client'],unit:room.location,dateOfVisit:start,checkIn:start,checkOut:end,checkedInBy:user._id,checkedOutBy:user._id,toMeet:user._id,purposeOfVisit:title,visitorCompany:visitor.registeredClientCompany||visitor.visitorCompany,amount:taxable,gstAmount:gst,totalAmount:meeting.paymentAmount,paymentStatus:paid,paymentVerification:meeting.paymentVerification,paymentMode:meeting.paymentMode,createdAt:start,updatedAt:end}));
      }
    }
  }
  for(const month of [...new Set(meetings.map(m=>m.startDate.toISOString().slice(0,7)))]) {
    const rows=meetings.filter(m=>m.startDate.toISOString().startsWith(month));
    summary.push({month,newMeetings:rows.length,external:rows.filter(m=>m.meetingType==='External').length,paidRevenueUSD:Math.round(rows.filter(m=>m.paymentStatus).reduce((n,m)=>n+m.paymentBaseAmount,0)*100)/100});
  }
  return {meetings,visits,revenues,summary};
}
async function main() {
  const {values}=require('node:util').parseArgs({options:{db:{type:'string'},apply:{type:'boolean',default:false},through:{type:'string',default:new Date().toISOString()}}});
  const through=new Date(values.through);
  if(!Number.isFinite(+through)||through>new Date()||through<=new Date('2026-04-01')||through>new Date('2027-01-01')) throw new Error('Use a past cutoff in April–December 2026');
  const uri=process.env.DB_URL;
  if(!uri||values.db!=='WonoDemoUserData'||new URL(uri).hostname.toLowerCase()!=='cluster0.d9cnr.mongodb.net') throw new Error('Use target DB_URL and --db WonoDemoUserData');
  await mongoose.connect(uri,{dbName:values.db,autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:15000});
  const db=mongoose.connection.db, company=new mongoose.Types.ObjectId(companyId);
  const userIds=load('demo-upload/userdatas.json').map(u=>u._id);
  async function prepare(session) {
    if(!await db.collection('companies').findOne({_id:company},{session})) throw new Error('Company missing');
    const allRooms=await db.collection('rooms').find({company},{session}).sort({_id:1}).toArray();
    const allVisitors=await db.collection('visitors').find({company},{session}).sort({_id:1}).toArray();
    const visitors=allVisitors.filter(v=>(v.visitorFlag==='Client'||v.visitorRoles?.includes('Client')) && !placeholder.test([v.firstName,v.lastName,v.registeredClientCompany,v.visitorCompany].filter(Boolean).join(' ')));
    const users=await db.collection('userdatas').find({_id:{$in:userIds},company},{session}).sort({_id:1}).toArray();
    const units=await db.collection('units').find({company},{session}).toArray();
    const existing=await db.collection('meetings').find({company},{session}).toArray();
    const revenue=await db.collection('meetingclientrevenues').find({company},{session}).toArray();
    const rooms=currentRooms(allRooms,units);
    if(!rooms.length) throw new Error('No active named rooms with at least two seats and a valid active unit found in the current database.');
    if(!rooms.some(r=>Number(r.perHourPrice)>0)) throw new Error('Set a positive USD hourly rate on at least one active room before adding external meetings.');
    const data=build({company,rooms,visitors,users,units,existing,through});
    // Refresh denormalized room names from each meeting’s current room record.
    const labels=[];
    for(const row of revenue) {
      const meeting=existing.find(m=>String(m._id)===String(row.meeting));
      const room=meeting && rooms.find(r=>String(r._id)===String(meeting.bookedRoom));
      if(room && row.meetingRoomName!==room.name) labels.push({id:row._id,name:room.name});
    }
    const restored=rebuildRevenue({existing,revenue,rooms,visitors:allVisitors,through});
    data.revenues.push(...restored.rows);
    return {...data,labels,rooms,restored};
  }
  const preview=await prepare(); console.table(preview.summary);
  console.log(`${preview.restored.rows.length} revenue records to restore for existing external meetings.`);
  if(preview.restored.skipped.length) {console.log('Existing meetings requiring attention before revenue can be restored:');console.table(preview.restored.skipped);}
  console.table(preview.rooms.map(r=>({room:r.name,hourlyUSD:r.perHourPrice})));
  console.log(`${preview.meetings.length} meetings, ${preview.visits.length} visits, ${preview.revenues.length} revenues, ${preview.labels.length} room labels to synchronize.`);
  if(!values.apply){console.log('Preflight passed. No writes. Add --apply to import.');return;}
  // Dropped collections must exist before the multi-collection transaction.
  for(const name of ['meetings','externalvisits','meetingclientrevenues']) {
    if(!await db.listCollections({name}).hasNext()) {
      try {await db.createCollection(name);} catch(error) {if(error.code!==48) throw error;}
    }
  }
  await db.collection('meetingclientrevenues').createIndex({company:1});
  const session=await mongoose.startSession();
  try { await session.withTransaction(async()=>{
    const data=await prepare(session);
    for(const [collection,rows] of [['meetings',data.meetings],['externalvisits',data.visits],['meetingclientrevenues',data.revenues]]) {
      if(rows.length) await db.collection(collection).bulkWrite(rows.map(row=>({updateOne:{filter:collection==='meetingclientrevenues'?{company,meeting:row.meeting}:{_id:row._id,company},update:{$setOnInsert:row},upsert:true}})),{session});
    }
    for(const label of data.labels) await db.collection('meetingclientrevenues').updateOne({_id:label.id,company},{$set:{meetingRoomName:label.name}},{session});
  }); console.log('Meeting activity and corresponding revenue imported into WonoDemoUserData.'); } finally {await session.endSession();}
}
if(require.main===module) main().catch(e=>{console.error(String(e.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g,'[redacted URI]'));process.exitCode=1;}).finally(()=>mongoose.disconnect());
module.exports={build,currentRooms,rebuildRevenue};
