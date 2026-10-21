// Brings the two demos' JSON files (pi-brainstorm/data/state.json, pi-script/data/state.json) into
// one project. Nothing is invented: every row comes from a field in those files, and whatever has no
// table yet lands in `kv` under a clear key, so nothing is lost.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject, J, nid } from './projects.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readJson = (f) => (f && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

export function importDemos({ name = 'Al Mousalsal', by = 'Hadi', brainstorm, script } = {}) {
  const B = readJson(brainstorm || path.join(ROOT, '..', 'pi-brainstorm', 'data', 'state.json'));
  const S = readJson(script || path.join(ROOT, '..', 'pi-script', 'data', 'state.json'));
  if (!B && !S) throw new Error('found neither demo state file; pass --brainstorm and/or --script');

  const p = createProject({ name: S?.project?.title || name, by, fromIdea: S?.project?.from || null });
  p.tx(() => {
    const people = new Set([by, ...(B?.project?.members || []), ...(S?.project?.members || [])].filter(Boolean));
    for (const n of people) p.addPerson(n);

    // ---------------------------------------------------------------- brainstorm
    if (B) {
      const ins = {
        session: p.db.prepare('INSERT INTO sessions(id,type,topic,seed,status,stage,phase,voice_json,participants_json,created_by,created_at,started_at,closed_at,origin_json,recap,flow_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
        message: p.db.prepare('INSERT INTO messages(id,session,ts,author,kind,text,picks_json,round,hidden) VALUES (?,?,?,?,?,?,?,?,?)'),
        card: p.db.prepare('INSERT INTO cards(id,session,parent,title,note,fields_json,author,sparked_by,status,alternate,reactions_json,ts,promoted_to,promoted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
        promo: p.db.prepare('INSERT INTO promotions(id,card,session,target,approved_by_json,ts,landed_json) VALUES (?,?,?,?,?,?,?)'),
        exc: p.db.prepare('INSERT INTO exceptions(id,section,ref_json,note,reason,who,ts) VALUES (?,?,?,?,?,?,?)'),
        job: p.db.prepare('INSERT INTO jobs(id,section,type,by,ts,status,payload_json,result_json,delivered_at,done_at) VALUES (?,?,?,?,?,?,?,?,?,?)'),
      };
      for (const s of Object.values(B.sessions || {})) {
        const { id, type, topic, seed, status, stage, phase, personality, participants, createdBy, createdAt, startedAt, closedAt, recap, candidates, verdicts, votes, approvals, winner, tied, round } = s;
        ins.session.run(id, type, topic, seed || null, status, stage || 0, phase || 'play', J(personality || {}), J(participants || []), createdBy || null, createdAt || Date.now(), startedAt || null, closedAt || null, null, recap || null, J({ candidates, verdicts, votes, approvals, winner, tied, round }));
      }
      for (const [sid, list] of Object.entries(B.messages || {})) for (const m of list) if (B.sessions?.[sid]) ins.message.run(m.id, sid, m.ts, m.author, m.kind, m.text, J(m.picks || []), m.round || null, m.hidden ? 1 : 0);
      const cards = Object.values(B.cards || {}).filter((c) => B.sessions?.[c.session]);
      for (const c of cards) ins.card.run(c.id, c.session, c.parent || null, c.title, c.note || '', J(c.fields || {}), c.author, c.sparkedBy || null, c.status, c.alternate ? 1 : 0, J(c.reactions || {}), c.ts, c.promotedTo || null, c.promotedAt || null);
      const importedInScript = new Set(S?.imported || []);
      for (const pr of B.promotions || []) if (B.cards?.[pr.card]) ins.promo.run(nid('pr'), pr.card, pr.session, pr.target, J(pr.approvedBy || []), pr.ts, importedInScript.has(pr.card) ? J({ section: 'script', how: 'imported by hand in the demo' }) : null);
      for (const x of B.exceptions || []) ins.exc.run(nid('ex'), 'brainstorm', J({ card: x.card, session: x.session }), x.note, x.reason, x.who || null, x.ts);
      for (const e of B.events || []) { const { id, type, session, ts, delivered, who, ...rest } = e; ins.job.run(`b-${id}`, 'brainstorm', type, who || null, ts, delivered ? 'done' : 'pending', J({ session, ...rest }), null, delivered ? ts : null, delivered ? ts : null); }
      p.kvSet('brainstorm.project', B.project || {});
    }

    // ---------------------------------------------------------------- script
    if (S) {
      const pj = S.project || {};
      p.run('UPDATE project SET logline = ?, notes = ?, settings_json = ?', pj.logline || '', pj.notes || '', J({ script: S.settings || {} }));
      for (const c of pj.characters || []) p.run('INSERT OR IGNORE INTO characters(name, added_at) VALUES (?,?)', c, pj.startedAt || Date.now());
      const ins = {
        draft: p.db.prepare('INSERT INTO drafts(id,name,owner,is_main,forked_from_json,created_at,edited_at,sesh,order_json,floating_json) VALUES (?,?,?,?,?,?,?,?,?,?)'),
        scene: p.db.prepare('INSERT INTO scenes(draft,id,title,from_card,from_label,lock_json,check_json,edit_check_json,pacing_json,place_json) VALUES (?,?,?,?,?,?,?,?,?,?)'),
        block: p.db.prepare('INSERT INTO blocks(draft,scene,id,pos,type,data_json) VALUES (?,?,?,?,?,?)'),
        shot: p.db.prepare('INSERT INTO shots(draft,scene,id,pos,framing,camera,characters,location,action,dialogue,duration,refs,blocks_json,status,by,approved_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
        version: p.db.prepare('INSERT INTO versions(draft,n,name,auto,reason,by,ts,snap_json) VALUES (?,?,?,?,?,?,?,?)'),
        snap: p.db.prepare('INSERT OR IGNORE INTO snaps(hash, blocks_json) VALUES (?,?)'),
        sesh: p.db.prepare('INSERT INTO seshes(id,draft,title,titled,by,people_json,started_at,last_at,ended_at,status,changes,base_json,base_v,v,tags_json,note,reviewed_by,reviewed_at,follows_up,ended_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
        fact: p.db.prepare('INSERT INTO facts(id,fact,scene,scene_title,source,by,at,hash,edited_json,doubt) VALUES (?,?,?,?,?,?,?,?,?,?)'),
        exc: p.db.prepare('INSERT INTO exceptions(id,section,ref_json,note,reason,who,ts) VALUES (?,?,?,?,?,?,?)'),
        job: p.db.prepare('INSERT INTO jobs(id,section,type,by,ts,status,payload_json,result_json,delivered_at,done_at) VALUES (?,?,?,?,?,?,?,?,?,?)'),
        event: p.db.prepare('INSERT INTO events(id,ts,who,section,kind,text,ref_json) VALUES (?,?,?,?,?,?,?)'),
      };
      for (const d of Object.values(S.drafts || {})) {
        ins.draft.run(d.id, d.name, d.owner, d.isMain ? 1 : 0, d.forkedFrom ? J(d.forkedFrom) : null, d.createdAt, d.editedAt || null, d.sesh || null, J(d.order || []), J(d.floating || []));
        for (const sc of Object.values(d.scenes || {})) {
          const fromCard = /^card:/.test(sc.from || '') ? sc.from.slice(5) : null;
          ins.scene.run(d.id, sc.id, sc.title, fromCard, sc.from || null, sc.lock ? J(sc.lock) : null, sc.check ? J(sc.check) : null, sc.editCheck ? J(sc.editCheck) : null, sc.pacing ? J(sc.pacing) : null, sc.placeSuggestion ? J(sc.placeSuggestion) : null);
          (sc.blocks || []).forEach((b, i) => { const { id, type, ...data } = b; ins.block.run(d.id, sc.id, id, i, type, J(data)); });
          (sc.shots || []).forEach((sh, i) => ins.shot.run(d.id, sc.id, sh.id, i, sh.framing || null, sh.camera || null, sh.characters || null, sh.location || null, sh.action || null, sh.dialogue || null, sh.duration ?? null, sh.refs || null, J(sh.blocks || []), sh.status || null, sh.by || null, sh.approvedBy || null));
        }
        for (const v of d.versions || []) ins.version.run(d.id, v.n, v.name || null, v.auto ? 1 : 0, v.reason || null, v.by || null, v.ts, J(v.snap));
      }
      for (const [hash, blocks] of Object.entries(S.snaps || {})) ins.snap.run(hash, J(blocks));
      for (const x of Object.values(S.seshes || {})) ins.sesh.run(x.id, x.draft, x.title, x.titled ? 1 : 0, x.by || null, J(x.people || []), x.startedAt, x.lastAt || null, x.endedAt || null, x.status, x.changes || 0, x.base ? J(x.base) : null, x.baseV ?? null, x.v ?? null, J(x.tags || []), x.note || null, x.reviewedBy || null, x.reviewedAt || null, x.followsUp || null, x.endedBy || null);
      for (const f of S.facts || []) ins.fact.run(f.id, f.fact, f.scene || null, f.sceneTitle || null, f.source || null, f.by || null, f.at, f.hash || null, f.edited ? J(f.edited) : null, f.doubt || null);
      for (const x of S.exceptions || []) ins.exc.run(nid('ex'), 'script', J({ scene: x.scene }), x.note, x.reason, x.who || null, x.ts);
      for (const j of S.jobs || []) { const { id, type, by, ts, status, result, deliveredAt, doneAt, ...payload } = j; ins.job.run(`s-${id}`, 'script', type, by || null, ts, status, J(payload), result === undefined ? null : J(result), deliveredAt || null, doneAt || null); }
      for (const l of S.log || []) { const { id, ts, who, kind, text, ...ref } = l; ins.event.run(`s-${id}`, ts, who || null, 'script', kind, text, Object.keys(ref).length ? J(ref) : null); }
      p.kvSet('script.mainId', S.mainId || null);
      p.kvSet('script.started', !!S.started);
      p.kvSet('script.assets', S.assets || {});
      p.kvSet('script.imported', S.imported || []);
    }
    p.log('project', 'imported', `imported the ${[B && 'brainstorm', S && 'script'].filter(Boolean).join(' and ')} demo${B && S ? 's' : ''}`, by);
  });
  return p;
}
