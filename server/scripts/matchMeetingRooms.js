function matchMeetingRooms({existing, rooms, allRooms, generatedRooms, units}) {
  const meetings=existing.map(m=>({...m})), changes=[], unmatched=[];
  const targets=meetings.filter(m=>generatedRooms.has(String(m.bookedRoom)))
    .sort((a,b)=>new Date(a.startTime)-new Date(b.startTime)||String(a._id).localeCompare(String(b._id)));
  for(const meeting of targets) {
    const previous=allRooms.find(r=>String(r._id)===String(meeting.bookedRoom));
    const attendees=new Set([meeting.bookedBy,meeting.clientBookedBy,...(meeting.internalParticipants||[]),...(meeting.clientParticipants||[])].filter(Boolean).map(String)).size+(meeting.externalParticipants||[]).length;
    const seats=Math.max(2,Number(previous?.seats||0),attendees);
    const start=new Date(meeting.startTime), end=new Date(meeting.extendTime||meeting.endTime);
    if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start) throw new Error('Invalid meeting times: '+meeting._id);
    const candidates=rooms.filter(r=>r.isActive!==false && Number(r.seats)>=seats && String(r.company)===String(meeting.company))
      .sort((a,b)=>Number(String(b.location)===String(previous?.location))-Number(String(a.location)===String(previous?.location))||Number(a.seats)-Number(b.seats)||String(a._id).localeCompare(String(b._id)));
    const room=candidates.find(r=>!meetings.some(other=>String(other._id)!==String(meeting._id)&&other.status!=='Cancelled'&&String(other.bookedRoom)===String(r._id)&&new Date(other.startTime)<end&&new Date(other.extendTime||other.endTime)>start));
    if(!room){unmatched.push({meeting:String(meeting._id),room:previous?.name||String(meeting.bookedRoom),seats,date:start.toISOString(),reason:'No eligible room with enough seats and a free time slot'});continue;}
    const location=units.find(u=>String(u._id)===String(room.location))?.unitNo;
    if(!location) throw new Error('Room unit number missing: '+room.name);
    changes.push({meeting:meeting._id,previousRoom:meeting.bookedRoom,bookedRoom:room._id,unit:room.location,location,from:previous?.name,to:room.name,seats});
    meeting.bookedRoom=room._id; meeting.location=location;
  }
  return {meetings,changes,unmatched};
}
module.exports={matchMeetingRooms};
