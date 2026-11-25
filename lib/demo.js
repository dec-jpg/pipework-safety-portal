// Demo data for showing the portal with everything joined up: a register with a training matrix, gangs on live
// utility jobs, eight weeks of site diaries with hours, a materials price list, a cost ledger and variations, so the
// job costing has real-looking numbers behind it. Loaded and cleared from the Safety Simplified page. Everything
// loaded here is tagged (jobs DEMO-xxxx, people noted [demo]) so clearing it leaves real data alone.
const { q } = require('./db');

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = a => a[Math.floor(rnd() * a.length)];
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const today = () => new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) + 'T12:00:00Z');

const RATES = { Supervisor: 38, Ganger: 34, '360 Operator': 31, Pipelayer: 29, Operative: 27, Apprentice: 15, Driver: 24 };
const PEOPLE = [
  ['Tony Marsh', 'Supervisor'], ['Craig Whittle', 'Ganger'], ['Lee Farrell', 'Pipelayer'], ['Danny Cole', 'Operative'], ['Marcin Nowak', '360 Operator'],
  ['Steve Hargreaves', 'Ganger'], ['Jordan Price', 'Pipelayer'], ['Ryan Doyle', 'Operative'],
  ['Paul Ainsworth', 'Ganger'], ['Kieran Walsh', 'Pipelayer'], ['Adam Birch', 'Operative'], ['Tomasz Kowalski', '360 Operator'],
  ['Gary Lomas', 'Ganger'], ['Connor Hayes', 'Operative'],
  ['Mark Pemberton', 'Ganger'], ['Liam Scott', 'Pipelayer'], ['Josh Ridley', 'Apprentice'],
  ['Dave Thornton', 'Ganger'], ['Nathan Bell', 'Pipelayer'], ['Sam Ogden', 'Operative'],
  ['Pete Holland', 'Driver'], ['Chris Mather', 'Operative', 'Agency'], ['Ben Carter', 'Apprentice'],
];
const CORE = ['CSCS card', 'EUSR National Water Hygiene', 'NRSWA Streetworks Operative', 'Cable Avoidance (CAT and Genny)', 'Manual Handling', 'Abrasive Wheels'];
const BY_ROLE = { Supervisor: ['NRSWA Streetworks Supervisor', 'SSSTS', 'SMSTS', 'First Aid at Work', 'Confined Space Awareness'], Ganger: ['NRSWA Streetworks Supervisor', 'Emergency First Aid at Work', 'Confined Space Awareness', 'NPORS/CPCS Dumper'],
  '360 Operator': ['NPORS/CPCS 360 Excavator', 'NPORS/CPCS Dumper'], Pipelayer: ['Confined Space Awareness', 'NPORS/CPCS Dumper'], Operative: ['Confined Space Awareness'], Apprentice: [], Driver: [] };

const MATERIALS = [
  ['180mm PE100 SDR11 pipe (blue)', 'm', 14.6, 'Radius Systems'], ['125mm PE100 SDR11 pipe (blue)', 'm', 8.9, 'Radius Systems'], ['63mm PE80 SDR11 pipe (blue)', 'm', 3.4, 'Radius Systems'], ['32mm MDPE service pipe', 'm', 1.15, 'Radius Systems'],
  ['180mm PE100 SDR17.6 pipe (yellow)', 'm', 12.8, 'Radius Systems'], ['63mm PE80 SDR11 pipe (yellow)', 'm', 3.6, 'Radius Systems'],
  ['180mm electrofusion coupler', 'each', 38.5, 'Fusion Group'], ['125mm electrofusion coupler', 'each', 24.9, 'Fusion Group'], ['63mm electrofusion coupler', 'each', 9.8, 'Fusion Group'], ['Electrofusion tapping tee 180 x 32', 'each', 42, 'Fusion Group'],
  ['180mm PE gate valve', 'each', 640, 'AVK'], ['125mm PE gate valve', 'each', 410, 'AVK'], ['Hydrant assembly complete', 'each', 385, 'AVK'], ['Boundary box and 25mm stop tap', 'each', 31, 'Talbot'],
  ['Pipe bedding (10mm single size), per tonne', 't', 28, 'Armstrongs'], ['Type 1 sub-base, per tonne', 't', 24, 'Armstrongs'], ['Marker tape (blue), 365m roll', 'roll', 19, 'Wolseley'], ['Marker tape (yellow), 365m roll', 'roll', 19, 'Wolseley'],
  ['Trench sheets, hire per week', 'wk', 1.6, 'Mabey Hire'], ['Road plate 2.4m x 1.2m, hire per week', 'wk', 38, 'Mabey Hire'], ['Chapter 8 barrier, per week', 'wk', 1.9, 'TM Direct'],
];

// Jobs: [ref, name, client, type, order value, budget hours, materials budget, other budget, weeks back it started, weeks long (null = still live), gang (indices into PEOPLE), daily hours, red?]
const JOBS = [
  ['DEMO-1041', 'Chorley New Road mains renewal, Bolton', 'Network Plus (United Utilities)', 'measured', 148000, 1400, 48000, 40000, 8, null, [1, 2, 3, 4], 9.5],
  ['DEMO-1047', 'Leigh Road service connections, Atherton', 'Network Plus (United Utilities)', 'measured', 64000, 1200, 12000, 12000, 8, null, [5, 6, 7], 9],
  ['DEMO-1052', 'Altrincham gas main replacement, Phase 2', 'Network Plus (Cadent)', 'measured', 142000, 1600, 34000, 42000, 8, null, [8, 9, 10, 11], 9.5],
  ['DEMO-1055', 'Stockport repairs and maintenance (reactive)', 'Network Plus (United Utilities)', 'daywork', 38000, 800, 6000, 8000, 8, null, [12, 13], 8.5],
  ['DEMO-1058', 'Wigan Lane trunk main valve replacement', 'United Utilities', 'fixed', 54000, 400, 24000, 9000, 2, null, [14, 15, 16], 9],
  ['DEMO-1060', 'Riversway new development mains, Preston', 'Network Plus (United Utilities)', 'measured', 97000, 1300, 26000, 18000, 3, null, [17, 18, 19], 9],
  ['DEMO-1032', 'Winwick Road mains renewal, Warrington', 'Network Plus (United Utilities)', 'measured', 128000, 1500, 38000, 32000, 22, 13, [1, 2, 3, 4], 9.5],
  ['DEMO-1036', 'Salford Quays service relays', 'Network Plus (United Utilities)', 'measured', 41000, 600, 7000, 6000, 15, 6, [5, 6, 7], 9],
];
const WORK = {
  mains: ['Excavated and laid {m}m of 180mm PE main along the carriageway, bedded and backfilled to road plate level. Electrofusion joints tested.', 'Continued main lay, {m}m installed today. Two tees fitted for service transfers. Trench sheeted and plated overnight.', 'Service transfers: {n} properties cut over to the new main, boundary boxes set and flushed.', 'Pressure test on section {s} held at 10 bar for 1 hour. Chlorination and sampling arranged.', 'Backfill and Type 1 to reinstatement level on yesterday\'s run. Tarmac gang booked for Friday.', 'Hand dug around existing gas and BT services at the junction, {m}m laid by hand.'],
  gas: ['Inserted {m}m of 180mm PE into the existing cast main. Transition fittings made and tested.', 'Excavated launch pit and reception pit for next insertion length. Services located and exposed by hand.', 'Service transfers: {n} properties cut over to the new main and purged. Meters relit.', 'Tie-in to the live main completed under supervision. Bagged off and tested, no leaks.', 'Backfill and reinstatement to binder course along the footway.'],
  services: ['Service connections: {n} new 32mm MDPE services from the main to the boundary. Boundary boxes set.', 'Moled {m}m under the driveway for the new service, boundary box fitted and flushed.', 'Excavated and reconnected {n} lead services onto the main, old pipe cut and capped.', 'Reinstatement of yesterday\'s service trenches to Type 1. Footway tarmac Friday.'],
  reactive: ['Attended burst on 4" main, excavated, repair clamp fitted and main recharged by 11am. Reinstated to binder.', 'Leaking stop tap at boundary, excavated and replaced the boundary box assembly. Customer back on by 2pm.', 'Hydrant replacement at the junction. Isolated under permit, new hydrant assembly fitted and tested.', 'Investigated low pressure complaint, found partially closed valve, exercised and left open. No excavation.', 'Repair to 63mm PE service, electrofusion coupler. Back on supply by 1pm, reinstated to binder.'],
  valve: ['Excavation around the 18" trunk main valve chamber. Chamber walls broken out, services exposed and protected.', 'Old valve removed under outage and new 450mm valve craned in and bolted up. Torqued and bagged.', 'Recharged main slowly under UU supervision, chamber reinstated and new cover set to level.', 'Backfill and reinstatement of the chamber surround. Site cleared, TM collected.'],
};
const PLANT = ['8t excavator (hired), 3t dumper, breaker, trench sheets and road plates, compaction plate', '8t excavator (hired), 3t dumper, pipe trailer, electrofusion unit, trench box', '5t excavator (hired), dumper, mole, electrofusion unit', 'Van, breaker, compaction plate, pump'];
const DELAYS = ['Waited 1.5 hours for TM to arrive before we could open up.', 'Unmarked BT duct found in the line of the main, hand dig around it cost most of the morning.', 'Rain stopped the tarmac gang, reinstatement moved to Monday.', 'UU permit for the shut not issued until 11am, lost the morning.', 'Excavator down with a hydraulic hose, replacement arrived 2pm.'];
const INSTRUCTIONS = ['Network Plus supervisor asked us to extend the main a further 40m to pick up the next junction. Agreed on site, instruction to follow.', 'Client asked for two extra hydrants on this section. Confirmed as a variation.', 'Asked to relay the footway in flags rather than tarmac to match the conservation area. Rates to be agreed.'];
const SAFETY = ['Toolbox talk on cable avoidance given at 7.45am, all attended.', 'Permit to dig checked and signed before break out. CAT and Genny sweep done, services marked.', 'Near miss: dumper reversed close to the excavation edge, stop blocks moved and driver briefed.', 'Visit from Network Plus HSEQ, no issues raised, housekeeping good.', 'First aid: minor cut to hand on trench sheet, cleaned and dressed, back to work.', 'Weekly plant checks done on the excavator and dumper, no defects.', 'Confined space entry to the valve chamber under permit, gas monitor and top man in place.'];
const VISITORS = ['Network Plus supervisor on site 10am, happy with progress.', 'UU inspector checked the bedding before backfill.', 'Highways inspector checked the TM layout.', ''];
const DELIVERIES = ['Pipe delivery from Radius, 6 lengths of 180mm. All checked.', 'Bedding stone, 2 loads from Armstrongs.', 'Fittings from Fusion Group, 1 coupler short, chased.', '', ''];

async function clear() {
  const jobs = (await q("DELETE FROM jobs WHERE ref LIKE 'DEMO-%' RETURNING id")).rowCount;
  const people = (await q("DELETE FROM operatives WHERE notes = '[demo]' RETURNING id")).rowCount;
  const ids = ((await q("SELECT value FROM settings WHERE key = 'demo_material_ids'")).rows[0] || {}).value;
  let materials = 0;
  if (ids) { materials = (await q('DELETE FROM materials WHERE id = ANY($1::int[])', [JSON.parse(ids)])).rowCount; await q("DELETE FROM settings WHERE key = 'demo_material_ids'"); }
  return { jobs, people, materials };
}

async function load() {
  await clear();
  seed = 7;
  const T = today();
  await q("INSERT INTO settings (key, value) VALUES ('default_cost_rate', '28') ON CONFLICT (key) DO NOTHING");
  // People and their training
  const types = (await q('SELECT id, name, validity_months FROM qual_types WHERE active')).rows;
  const typeOf = n => types.find(t => t.name.toLowerCase() === n.toLowerCase());
  const ids = [];
  for (const [i, [name, role, employment]] of PEOPLE.entries()) {
    const phone = `07700 9${String(10000 + i * 37).slice(0, 5)}`;
    const id = (await q(`INSERT INTO operatives (full_name, phone, role, employment, start_date, notes, cost_rate) VALUES ($1,$2,$3,$4,$5,'[demo]',$6) RETURNING id`,
      [name, phone, role, employment || 'Employed', iso(addDays(T, -Math.floor(200 + rnd() * 2500))), employment === 'Agency' ? 29 : RATES[role]])).rows[0].id;
    ids.push(id);
    const wanted = [...CORE, ...(BY_ROLE[role] || [])];
    for (const n of wanted) {
      const t = typeOf(n); if (!t) continue;
      if (rnd() < 0.06) continue; // the odd gap, so the matrix has something to chase
      let expires = null;
      if (t.validity_months) {
        const r = rnd();
        const days = r < 0.07 ? -Math.floor(rnd() * 120) : r < 0.17 ? Math.floor(rnd() * 60) : Math.floor(60 + rnd() * t.validity_months * 25);
        expires = addDays(T, days);
      }
      const issued = expires ? addDays(expires, -(t.validity_months || 36) * 30) : addDays(T, -Math.floor(rnd() * 1500));
      await q('INSERT INTO quals (operative_id, qual_type_id, number, issued_on, expires_on, added_by) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, t.id, n === 'CSCS card' ? String(100000 + Math.floor(rnd() * 899999)) : n.startsWith('EUSR') ? `WH${Math.floor(1000000 + rnd() * 8999999)}` : n.startsWith('NRSWA') ? `SWQR ${Math.floor(10000000 + rnd() * 89999999)}` : null, iso(issued), expires ? iso(expires) : null, 'Demo data']);
    }
  }
  // Materials
  const matIds = [];
  for (const [name, unit, cost, supplier] of MATERIALS) matIds.push((await q('INSERT INTO materials (name, unit, unit_cost, supplier) VALUES ($1,$2,$3,$4) RETURNING id', [name, unit, cost, supplier])).rows[0].id);
  await q("INSERT INTO settings (key, value) VALUES ('demo_material_ids', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify(matIds)]);
  const mat = name => { const i = MATERIALS.findIndex(m => m[0] === name); return { id: matIds[i], ...Object.fromEntries(['name', 'unit', 'unit_cost', 'supplier'].map((k, j) => [k, MATERIALS[i][j]])) }; };
  const tokenOf = () => require('crypto').randomBytes(9).toString('base64url');

  // Jobs, diaries, costs
  let diaries = 0;
  for (const [ref, name, clientName, type, value, bh, bm, bo, weeksBack, weeksLong, gang, dayHours] of JOBS) {
    const start = addDays(T, -weeksBack * 7 - ((T.getUTCDay() + 6) % 7)); // a Monday
    const end = weeksLong ? addDays(start, weeksLong * 7 - 3) : null;
    const live = !weeksLong;
    const jobId = (await q(`INSERT INTO jobs (ref, name, address, client, client_contact, start_on, end_on, status, token, diary_token, job_type, order_value, budget_hours, budget_materials, budget_other, retention_pct)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [ref, name, name.split(', ').reverse().join(', '), clientName, pick(['Mike Hampson', 'Sarah Quigley', 'Ian Bradshaw', 'Jo Nuttall']), iso(start), end ? iso(end) : null, live ? 'live' : 'complete', tokenOf(), tokenOf(), type, value, bh, bm, bo, type === 'fixed' ? 5 : 3])).rows[0].id;
    for (const g of gang) await q('INSERT INTO job_operatives (job_id, operative_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [jobId, ids[g]]);
    const kind = /gas/i.test(name) ? 'gas' : /service/i.test(name) ? 'services' : /reactive/i.test(name) ? 'reactive' : /valve/i.test(name) ? 'valve' : 'mains';
    const ganger = PEOPLE[gang[0]];
    const last = end || addDays(T, -1);
    let week = 0;
    for (let d = new Date(start); d <= last; d = addDays(d, 1)) {
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6) continue;
      if (dow === 1) week++;
      if (rnd() < 0.04) continue; // the odd missed diary
      const hrs = dow === 5 ? Math.min(dayHours, 7.5) : dayHours + (rnd() < 0.3 ? 0.5 : 0) - (rnd() < 0.15 ? 1 : 0);
      const labour = gang.filter(() => rnd() > 0.05).map(g => ({ name: PEOPLE[g][0], role: PEOPLE[g][1], hours: hrs, operative_id: ids[g] }));
      if (rnd() < 0.3) labour.push({ name: PEOPLE[0][0], role: PEOPLE[0][1], hours: 2, operative_id: ids[0] });
      const work = pick(WORK[kind]).replace('{m}', String(18 + Math.floor(rnd() * 30))).replace('{n}', String(2 + Math.floor(rnd() * 5))).replace('{s}', String(1 + Math.floor(rnd() * 4)));
      const delays = rnd() < (ref === 'DEMO-1041' || ref === 'DEMO-1032' ? 0.35 : 0.12) ? pick(DELAYS) : null;
      await q(`INSERT INTO diaries (job_id, diary_date, author_name, operative_id, weather, conditions, labour, plant, work_done, deliveries, visitors, delays, instructions, safety, tomorrow, status, submitted_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'submitted',$16)`,
        [jobId, iso(d), ganger[0], ids[gang[0]], pick(['Dry', 'Dry', 'Overcast', 'Showers', 'Rain', 'Sunny', 'Windy']), rnd() < 0.2 ? 'Ground waterlogged after overnight rain, pumping first thing.' : null, JSON.stringify(labour),
          PLANT[kind === 'reactive' ? 3 : kind === 'services' ? 2 : kind === 'gas' ? 1 : 0], work, rnd() < 0.35 ? pick(DELIVERIES) : null, rnd() < 0.3 ? pick(VISITORS) : null, delays,
          rnd() < 0.06 ? pick(INSTRUCTIONS) : null, rnd() < 0.5 ? pick(SAFETY) : null, rnd() < 0.6 ? 'Carry on along the line. Tarmac gang Friday.' : null, new Date(d.getTime() + (17 * 60 + Math.floor(rnd() * 90)) * 60000)]);
      diaries++;
    }
    // Costs: weekly materials and plant hire, TM, subcontract reinstatement, some variations.
    const weeks = week;
    const planned = weeksLong || { 'DEMO-1041': 10, 'DEMO-1047': 10, 'DEMO-1052': 10, 'DEMO-1055': 8, 'DEMO-1058': 3, 'DEMO-1060': 8 }[ref] || weeks;
    const scale = bm / Math.max(planned, 1);
    const pipe = mat(kind === 'gas' ? '180mm PE100 SDR17.6 pipe (yellow)' : kind === 'services' ? '32mm MDPE service pipe' : '180mm PE100 SDR11 pipe (blue)');
    const over = ref === 'DEMO-1041' || ref === 'DEMO-1032' ? 1.3 : 0.95;
    for (let w = 0; w < weeks; w++) {
      const wd = addDays(start, w * 7 + 1 + Math.floor(rnd() * 3));
      if (kind !== 'reactive' && kind !== 'valve') {
        const qty = Math.round((scale * over * 0.55) / pipe.unit_cost);
        await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, supplier, reference, material_id, qty, unit, unit_cost, amount, added_by) VALUES ($1,'cost','materials',$2,$3,$4,$5,$6,$7,$8,$9,$10,'Demo data')`,
          [jobId, iso(wd), pipe.name, pipe.supplier, `INV ${Math.floor(40000 + rnd() * 9999)}`, pipe.id, qty, pipe.unit, pipe.unit_cost, Math.round(qty * pipe.unit_cost * 100) / 100]);
        const bed = mat('Pipe bedding (10mm single size), per tonne'); const t = Math.round((scale * over * 0.2) / bed.unit_cost);
        await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, supplier, reference, material_id, qty, unit, unit_cost, amount, added_by) VALUES ($1,'cost','materials',$2,$3,$4,$5,$6,$7,$8,$9,$10,'Demo data')`,
          [jobId, iso(addDays(wd, 1)), bed.name, bed.supplier, `DN ${Math.floor(7000 + rnd() * 999)}`, bed.id, t, bed.unit, bed.unit_cost, Math.round(t * bed.unit_cost * 100) / 100]);
        await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, supplier, reference, amount, added_by) VALUES ($1,'cost','materials',$2,'Fittings, couplers and tees',$3,$4,$5,'Demo data')`,
          [jobId, iso(addDays(wd, 2)), 'Fusion Group', `INV ${Math.floor(20000 + rnd() * 9999)}`, Math.round(scale * over * 0.25)]);
      } else if (kind === 'reactive') {
        await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, supplier, amount, added_by) VALUES ($1,'cost','materials',$2,'Repair clamps, couplers and boundary boxes','Wolseley',$3,'Demo data')`, [jobId, iso(wd), Math.round(scale * 0.9)]);
      }
      const plantAmt = kind === 'reactive' ? 180 : kind === 'services' ? 520 : 940;
      await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, supplier, reference, amount, added_by) VALUES ($1,'cost','plant',$2,$3,'GAP Hire',$4,$5,'Demo data')`,
        [jobId, iso(addDays(wd, 4)), kind === 'reactive' ? 'Breaker and compaction plate hire, week' : '8t excavator and 3t dumper hire, week', `HIRE ${Math.floor(300000 + rnd() * 99999)}`, plantAmt]);
      if (kind !== 'reactive') await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, supplier, amount, added_by) VALUES ($1,'cost','tm',$2,'Traffic management, week (2-way lights and barriers)','TM Direct',$3,'Demo data')`, [jobId, iso(addDays(wd, 4)), kind === 'services' ? 480 : 1150 * (over > 1 ? 1.25 : 1)]);
      if (kind !== 'reactive' && w % 2 === 1) await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, supplier, reference, amount, added_by) VALUES ($1,'cost','subcontract',$2,'Permanent reinstatement, tarmac to carriageway and footway','Northern Surfacing',$3,$4,'Demo data')`,
        [jobId, iso(addDays(wd, 4)), `APP ${Math.floor(100 + rnd() * 899)}`, Math.round(bo / Math.max(planned, 1) * 0.9 * over)]);
    }
    if (kind === 'valve') {
      const v = mat('180mm PE gate valve');
      await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, supplier, reference, amount, added_by) VALUES ($1,'cost','materials',$2,'450mm resilient seat gate valve and adaptors','AVK','INV 88213',19800,'Demo data')`, [jobId, iso(addDays(start, 2))]);
      await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, supplier, amount, added_by) VALUES ($1,'cost','plant',$2,'50t crane and lift supervisor, 1 day','Ainscough',$3,'Demo data')`, [jobId, iso(addDays(start, 8)), 2400]);
      void v;
    }
    if (ref === 'DEMO-1052') await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, reference, amount, added_by) VALUES ($1,'value','variation',$2,'Extend main 40m to pick up the Grove Lane junction, agreed on site','VO 03',11500,'Demo data')`, [jobId, iso(addDays(start, 24))]);
    if (ref === 'DEMO-1041') await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, reference, amount, added_by) VALUES ($1,'value','variation',$2,'Two additional hydrants on section 2','VO 01',3800,'Demo data')`, [jobId, iso(addDays(start, 31))]);
    if (ref === 'DEMO-1032') await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, reference, amount, added_by) VALUES ($1,'value','variation',$2,'Flagged footway reinstatement in place of tarmac (conservation area)','VO 02',6200,'Demo data')`, [jobId, iso(addDays(start, 40))]);
  }
  return { people: PEOPLE.length, jobs: JOBS.length, diaries, materials: MATERIALS.length };
}

module.exports = { load, clear };
