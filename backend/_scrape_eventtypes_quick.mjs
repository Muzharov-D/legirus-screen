import 'dotenv/config';
import fs from 'fs';
import * as ffspb from './services/ffspbApi.js';

const OUT = 'C:/Users/dmuzharov/_eventtypes_quick.json';
const LOG = 'C:/Users/dmuzharov/_eventtypes_quick.log';
function log(s) { fs.appendFileSync(LOG, s + '\n'); }
fs.writeFileSync(LOG, '');

const tids = ['44321','44333','44334','44335','44336','44337','44338','44339','44345','44346','44347','44348'];
const PER_TID = 12;

const matchIds = [];
for (const tid of tids) {
  try {
    const ms = await ffspb.listMatches(tid, { hasLineups: true });
    const slice = ms.slice(0, PER_TID);
    for (const mm of slice) { const id = mm['@id']?.split('/').pop(); if (id) matchIds.push({ tid, id }); }
    log(`tid=${tid} took=${slice.length}/${ms.length}`);
  } catch (e) { log(`tid=${tid} err ${e.message.slice(0,80)}`); }
}
log(`TOTAL=${matchIds.length}`);

const byType = new Map();
let n = 0;
for (const { tid, id } of matchIds) {
  n++;
  try {
    const full = await ffspb.getMatch(id);
    const ev = full.events || [];
    for (const e of ev) {
      const t = e.eventType;
      if (!byType.has(t)) byType.set(t, { count: 0, samples: [] });
      const slot = byType.get(t);
      slot.count++;
      if (slot.samples.length < 8) {
        slot.samples.push({
          tid, matchId: id,
          minute: e.minute, addedTime: e.addedTime,
          author: e.author?.surname,
          authorProfileId: e.author?.member?.id ?? null,
          assist: e.assist?.surname || null,
          assistProfileId: e.assist?.member?.id || null,
          team: e.team?.name?.slice(0, 30),
          comment: e.comment || '',
          wideComment: e.wideComment || '',
          rawKeys: Object.keys(e),
        });
      }
    }
  } catch (e) {}
  if (n % 10 === 0) log(`progress ${n}/${matchIds.length}`);
}

const result = {};
for (const [t, info] of [...byType.entries()].sort((a,b)=>a[0]-b[0])) {
  result['type_' + t] = info;
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
log(`DONE → ${OUT}`);
