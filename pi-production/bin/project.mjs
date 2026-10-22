#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
// π · Projects — look at and manage the project folders from the terminal.
//
//   ./bin/project.mjs list                        every project, with its pulse
//   ./bin/project.mjs create "Al Mousalsal" --by Hadi
//   ./bin/project.mjs show <id>                   counts per table, people, last events
//   ./bin/project.mjs peek <id> <table> [n]       the first n rows of a table (default 10)
//   ./bin/project.mjs sql <id> "select …"         any read query
//   ./bin/project.mjs export <id> [file.json]     the whole project as one JSON file
//   ./bin/project.mjs import-demos [--name "Al Mousalsal"] [--brainstorm path] [--script path]
//   ./bin/project.mjs delete <id> --yes
//   (through npm, put -- before the arguments: npm run project -- create "Name" --by Hadi)
import fs from 'node:fs';
import { PROJECTS_DIR, TABLES, listProjects, openProject, createProject, deleteProject, Project } from '../lib/projects.mjs';
import { importDemos } from '../lib/import-demos.mjs';

const argv = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags[k] = v ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true); }
  else args.push(a);
}
// npm swallows --flags unless you write `npm run project -- …`; it leaves them in the environment, so read those too
for (const k of ['by', 'yes', 'name', 'brainstorm', 'script']) if (flags[k] === undefined && process.env[`npm_config_${k}`] !== undefined) flags[k] = process.env[`npm_config_${k}`] === 'true' ? true : process.env[`npm_config_${k}`];
const [cmd, ...rest] = args;
const ago = (ts) => { if (!ts) return '—'; const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(ts).toLocaleDateString(); };
const table = (rows) => { if (!rows.length) return console.log('  (no rows)'); console.table(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && v.length > 60 ? v.slice(0, 57) + '…' : typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 57) : v])))); };

try { switch (cmd) {
  case 'list': {
    const list = listProjects();
    if (!list.length) { console.log(`No projects yet in ${PROJECTS_DIR}\n  npm run project create "Name" --by You\n  npm run project import-demos`); break; }
    for (const p of list) {
      const live = p.pulse.liveSessions.map((s) => `${s.type} “${s.topic}”${s.roundOpen ? ' (round open)' : ''}`);
      console.log(`\n${p.id}  ·  ${p.name}`);
      console.log(`  people: ${p.people.join(', ') || '—'}`);
      console.log(`  live: ${live.join(' · ') || 'nothing'}${p.pulse.lobbies ? ` · ${p.pulse.lobbies} lobby` : ''}${p.pulse.openSeshes.length ? ` · ${p.pulse.openSeshes.length} open sesh` : ''}${p.pulse.pendingJobs ? ` · ${p.pulse.pendingJobs} jobs waiting for the bot` : ''}`);
      console.log(`  last: ${p.pulse.lastEvent ? `${p.pulse.lastEvent.who || ''} ${p.pulse.lastEvent.text} · ${ago(p.pulse.lastEvent.ts)}` : '—'}`);
    }
    console.log(`\n${list.length} project(s) in ${PROJECTS_DIR}`);
    break;
  }
  case 'create': {
    const p = createProject({ name: rest.join(' '), by: flags.by || null });
    console.log(`created ${p.id} → ${p.dir}/pi.db`);
    break;
  }
  case 'show': {
    const p = openProject(rest[0]);
    const info = p.info();
    console.log(`${p.id} · ${info.name}  (${p.dir}/pi.db, ${(fs.statSync(`${p.dir}/pi.db`).size / 1024).toFixed(0)} KB)`);
    if (info.logline) console.log(`logline: ${info.logline}`);
    console.log(`people: ${p.people().map((x) => x.name + (x.seat ? ` <${x.seat}>` : '')).join(', ') || '—'}`);
    const c = p.counts();
    console.log('\nrows per table:');
    console.log('  ' + TABLES.filter((t) => c[t]).map((t) => `${t} ${c[t]}`).join(' · '));
    console.log('\nlast events:');
    for (const e of p.all('SELECT ts, who, section, text FROM events ORDER BY ts DESC LIMIT 8')) console.log(`  ${new Date(e.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}  ${e.section.padEnd(10)} ${e.who || ''} ${e.text}`);
    break;
  }
  case 'peek': {
    const p = openProject(rest[0]);
    const t = rest[1];
    if (!TABLES.includes(t)) { console.log(`tables: ${TABLES.join(', ')}`); break; }
    table(p.all(`SELECT * FROM ${t} LIMIT ?`, Number(rest[2] || 10)).map(Project.row));
    break;
  }
  case 'sql': {
    const p = openProject(rest[0]);
    const q = rest.slice(1).join(' ');
    if (!/^\s*(select|with|pragma|explain)\b/i.test(q)) { console.log('read queries only (select / with / pragma)'); break; }
    table(p.all(q).map(Project.row));
    break;
  }
  case 'export': {
    const p = openProject(rest[0]);
    const json = JSON.stringify(p.export(), null, 1);
    if (rest[1]) { fs.writeFileSync(rest[1], json); console.log(`wrote ${rest[1]} (${(json.length / 1024).toFixed(0)} KB)`); } else process.stdout.write(json + '\n');
    break;
  }
  case 'import-demos': {
    const p = importDemos({ name: flags.name || 'Al Mousalsal', brainstorm: flags.brainstorm, script: flags.script, by: flags.by || 'Hadi' });
    const c = p.counts();
    console.log(`imported into ${p.id} → ${p.dir}/pi.db`);
    console.log('  ' + TABLES.filter((t) => c[t]).map((t) => `${t} ${c[t]}`).join(' · '));
    break;
  }
  case 'delete': {
    if (flags.yes !== true) { console.log(`this deletes the whole folder ${PROJECTS_DIR}/${rest[0]} — add --yes`); break; }
    deleteProject(rest[0], { forever: true }); console.log(`deleted ${rest[0]} (for good; the app's delete only moves a project to data/trash)`);
    break;
  }
  default:
    console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
} } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
