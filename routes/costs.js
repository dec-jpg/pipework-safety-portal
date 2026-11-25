// Office side of job costing: the overview across jobs, one job's breakdown, the cost and variation ledger, the materials
// price list, hours by person (the timesheet), exports, and the default cost rate. Managers and admins only; viewers
// cannot see money.
const express = require('express');
const { q } = require('../lib/db');
const client = require('../lib/client');
const { requireUser } = require('../lib/auth');
const { clean, csv, validImage } = require('../lib/util');
const costs = require('../lib/costs');
const { render } = require('../lib/costpdf');

const r = express.Router();
const edit = requireUser('manager');
const admin = requireUser('admin');
const owner = requireUser('owner');
const int = v => (v === '' || v == null ? null : parseInt(v, 10));
const num = v => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const safeName = s => String(s || '').replace(/[^\w ,.-]+/g, '').trim();
const london = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

r.get('/summary', edit, async (req, res) => {
  const s = await costs.summary();
  res.json({ ...s, categories: costs.CATEGORIES, job_types: costs.JOB_TYPES });
});

r.put('/settings', admin, async (req, res) => {
  const v = num((req.body || {}).default_cost_rate);
  if (v == null || v < 0) return res.status(400).json({ error: 'Enter the default hourly cost rate.' });
  await q("INSERT INTO settings (key, value) VALUES ('default_cost_rate', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [String(v)]);
  res.json({ ok: true });
});

// ---------- materials price list ----------
r.get('/materials', edit, async (req, res) => {
  res.json({ rows: (await q('SELECT * FROM materials ORDER BY active DESC, name')).rows.map(m => ({ ...m, unit_cost: m.unit_cost == null ? null : +m.unit_cost })) });
});
function matValues(b) { return [clean(b.name, 160), clean(b.unit, 30), num(b.unit_cost), clean(b.supplier, 120), b.active === undefined ? true : !!b.active]; }
r.post('/materials', edit, async (req, res) => {
  const v = matValues(req.body || {});
  if (!v[0]) return res.status(400).json({ error: 'Give the item a name.' });
  res.json({ row: (await q('INSERT INTO materials (name, unit, unit_cost, supplier, active) VALUES ($1,$2,$3,$4,$5) RETURNING *', v)).rows[0] });
});
r.put('/materials/:id', edit, async (req, res) => {
  const v = matValues(req.body || {});
  if (!v[0]) return res.status(400).json({ error: 'Give the item a name.' });
  await q('UPDATE materials SET name = $1, unit = $2, unit_cost = $3, supplier = $4, active = $5 WHERE id = $6', [...v, req.params.id]);
  res.json({ ok: true });
});
// Paste a price list: one per line, "Name, unit, unit cost[, supplier]".
r.post('/materials/import', edit, async (req, res) => {
  const lines = String((req.body || {}).text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let added = 0;
  for (const line of lines) {
    const [name, unit, cost, supplier] = line.split(/\t|,/).map(x => x && x.trim());
    if (!name) continue;
    await q('INSERT INTO materials (name, unit, unit_cost, supplier) VALUES ($1,$2,$3,$4)', [name.slice(0, 160), (unit || '').slice(0, 30) || null, num((cost || '').replace(/[£,]/g, '')), (supplier || '').slice(0, 120) || null]);
    added++;
  }
  res.json({ added });
});

// ---------- hours (timesheet) ----------
r.get('/hours', edit, async (req, res) => {
  const to = date(req.query.to) || london();
  const from = date(req.query.from) || new Date(new Date(to + 'T12:00:00Z').getTime() - 6 * 864e5).toISOString().slice(0, 10);
  res.json({ from, to, ...(await costs.hours(from, to, int(req.query.job))) });
});
r.get('/hours.csv', edit, async (req, res) => {
  const to = date(req.query.to) || london();
  const from = date(req.query.from) || new Date(new Date(to + 'T12:00:00Z').getTime() - 6 * 864e5).toISOString().slice(0, 10);
  const { rows } = await costs.hours(from, to, int(req.query.job));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="hours ${from} to ${to}.csv"`);
  res.send(csv(rows, [{ label: 'Name', key: 'name' }, { label: 'Role', key: 'role' }, { label: 'Date', key: 'diary_date' }, { label: 'Job', key: 'job' }, { label: 'Job ref', key: 'job_ref' }, { label: 'Hours', key: 'hours' }, { label: 'Rate', key: 'rate' }, { label: 'Cost', key: 'cost' }]));
});

// ---------- one job ----------
r.get('/jobs/:id.pdf', edit, async (req, res) => {
  const d = await costs.detail(int(req.params.id));
  if (!d) return res.status(404).json({ error: 'Not found.' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${safeName(client.company)} - Job cost report - ${safeName(d.job.name)} - ${london()}.pdf"`);
  render(d).pipe(res);
});

r.get('/jobs/:id', edit, async (req, res) => {
  const d = await costs.detail(int(req.params.id));
  if (!d) return res.status(404).json({ error: 'Not found.' });
  res.json({ ...d, categories: costs.CATEGORIES, job_types: costs.JOB_TYPES });
});

r.get('/jobs/:id/export.csv', edit, async (req, res) => {
  const d = await costs.detail(int(req.params.id));
  if (!d) return res.status(404).json({ error: 'Not found.' });
  const rows = [
    ...d.people.map(p => ({ date: '', kind: 'labour', category: 'Labour', description: `${p.name}${p.role ? ` (${p.role})` : ''}: ${p.hours} hours over ${p.days} days at £${p.rate}/hr`, supplier: '', reference: '', qty: p.hours, unit: 'hr', unit_cost: p.rate, amount: p.cost })),
    ...d.items.map(i => ({ date: i.cost_date, kind: i.kind === 'value' ? 'variation' : 'cost', category: i.kind === 'value' ? 'Variation' : costs.CATEGORIES[i.category] || i.category, description: i.description, supplier: i.supplier, reference: i.reference, qty: i.qty, unit: i.unit, unit_cost: i.unit_cost, amount: i.amount })),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName(d.job.name)} costs.csv"`);
  res.send(csv(rows, ['date', 'kind', 'category', 'description', 'supplier', 'reference', 'qty', 'unit', 'unit_cost', 'amount'].map(k => ({ label: k.replace('_', ' '), key: k }))));
});

// ---------- the ledger ----------
function itemValues(b) {
  const kind = b.kind === 'value' ? 'value' : 'cost';
  const category = kind === 'value' ? 'variation' : costs.CATEGORIES[b.category] ? b.category : 'other';
  const qty = num(b.qty), unit_cost = num(b.unit_cost);
  let amount = num(b.amount);
  if (amount == null && qty != null && unit_cost != null) amount = Math.round(qty * unit_cost * 100) / 100;
  return { kind, category, cost_date: date(b.cost_date), description: clean(b.description, 300), supplier: clean(b.supplier, 120), reference: clean(b.reference, 80),
    material_id: int(b.material_id), qty, unit: clean(b.unit, 30), unit_cost, amount };
}
r.post('/jobs/:id/items', edit, async (req, res) => {
  const v = itemValues(req.body || {});
  if (!v.cost_date) return res.status(400).json({ error: 'Pick the date.' });
  if (!v.description) return res.status(400).json({ error: 'Say what it is.' });
  if (v.amount == null) return res.status(400).json({ error: 'Enter the amount (net of VAT).' });
  const f = (req.body || {}).file;
  const fileOk = f && f.data && /^data:(image\/(png|jpeg)|application\/pdf);base64,/.test(f.data) && f.data.length < 6_000_000;
  const m = fileOk ? f.data.match(/^data:([\w/.+-]+);base64,(.*)$/) : null;
  const row = (await q(`INSERT INTO job_costs (job_id, kind, category, cost_date, description, supplier, reference, material_id, qty, unit, unit_cost, amount, file_name, file_mime, file_data, added_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [req.params.id, v.kind, v.category, v.cost_date, v.description, v.supplier, v.reference, v.material_id, v.qty, v.unit, v.unit_cost, v.amount,
      m ? clean(f.name, 160) || 'attachment' : null, m ? m[1] : null, m ? Buffer.from(m[2], 'base64') : null, req.user.name])).rows[0];
  res.json({ id: row.id });
});
r.put('/items/:id', edit, async (req, res) => {
  const v = itemValues(req.body || {});
  if (!v.cost_date || !v.description || v.amount == null) return res.status(400).json({ error: 'Date, description and amount are needed.' });
  await q(`UPDATE job_costs SET kind = $1, category = $2, cost_date = $3, description = $4, supplier = $5, reference = $6, material_id = $7, qty = $8, unit = $9, unit_cost = $10, amount = $11, updated_at = NOW() WHERE id = $12`,
    [v.kind, v.category, v.cost_date, v.description, v.supplier, v.reference, v.material_id, v.qty, v.unit, v.unit_cost, v.amount, req.params.id]);
  res.json({ ok: true });
});
r.delete('/items/:id', edit, async (req, res) => { await q('DELETE FROM job_costs WHERE id = $1', [req.params.id]); res.json({ ok: true }); });
r.get('/items/:id/file', edit, async (req, res) => {
  const f = (await q('SELECT file_name, file_mime, file_data FROM job_costs WHERE id = $1 AND file_data IS NOT NULL', [req.params.id])).rows[0];
  if (!f) return res.status(404).end();
  res.setHeader('Content-Disposition', `inline; filename="${safeName(f.file_name)}"`);
  res.type(f.file_mime).send(f.file_data);
});

// ---------- demo data (Safety Simplified only) ----------
r.post('/demo', owner, async (req, res) => {
  const { load } = require('../lib/demo');
  res.json(await load());
});
r.delete('/demo', owner, async (req, res) => {
  const { clear } = require('../lib/demo');
  res.json(await clear());
});
r.get('/demo', owner, async (req, res) => {
  const n = (await q("SELECT COUNT(*)::int AS n FROM jobs WHERE ref LIKE 'DEMO-%'")).rows[0].n;
  res.json({ loaded: n > 0, jobs: n });
});

module.exports = r;
