// Office side of the daily site diaries: list, read, edit, add from the office, PDF per day and per job, CSV.
const express = require('express');
const { q } = require('../lib/db');
const client = require('../lib/client');
const { requireUser } = require('../lib/auth');
const { csv } = require('../lib/util');
const diary = require('../lib/diary');
const { render } = require('../lib/diarypdf');

const r = express.Router();
const view = requireUser();
const edit = requireUser('manager');
const admin = requireUser('admin');
const int = v => (v === '' || v == null ? null : parseInt(v, 10));
const safeName = s => String(s || '').replace(/[^\w ,.-]+/g, '').trim();
const longDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

const LIST = `SELECT d.id, d.job_id, d.diary_date, d.author_name, d.operative_id, d.weather, d.submitted_at, d.updated_at, d.edited_by, j.name AS job, j.ref AS job_ref,
    jsonb_array_length(d.labour) AS labour, (SELECT COALESCE(SUM((l->>'hours')::numeric), 0) FROM jsonb_array_elements(d.labour) l) AS hours,
    (SELECT COUNT(*)::int FROM diary_photos p WHERE p.diary_id = d.id) AS photos,
    (d.delays IS NOT NULL AND d.delays <> '') AS has_delays, (d.safety IS NOT NULL AND d.safety <> '') AS has_safety, (d.instructions IS NOT NULL AND d.instructions <> '') AS has_instructions
    FROM diaries d JOIN jobs j ON j.id = d.job_id`;

function filters(query) {
  const where = [], params = [];
  if (int(query.job)) { params.push(int(query.job)); where.push(`d.job_id = $${params.length}`); }
  if (diary.date(query.from)) { params.push(query.from); where.push(`d.diary_date >= $${params.length}`); }
  if (diary.date(query.to)) { params.push(query.to); where.push(`d.diary_date <= $${params.length}`); }
  return { sql: where.length ? ' WHERE ' + where.join(' AND ') : '', params };
}

r.get('/', view, async (req, res) => {
  const f = filters(req.query);
  const rows = (await q(`${LIST}${f.sql} ORDER BY d.diary_date DESC, j.name, d.submitted_at DESC LIMIT 400`, f.params)).rows;
  res.json({ rows });
});

// Coverage: for each live job, which of the last 14 days have a diary (weekends included, shown greyed on screen).
r.get('/coverage', view, async (req, res) => {
  const days = 14;
  const jobs = (await q(`SELECT j.id, j.name, j.ref, j.start_on, (SELECT MAX(diary_date) FROM diaries dd WHERE dd.job_id = j.id) AS last_diary,
      ARRAY(SELECT DISTINCT dd.diary_date::text FROM diaries dd WHERE dd.job_id = j.id AND dd.diary_date > CURRENT_DATE - ${days}) AS days
      FROM jobs j WHERE j.status = 'live' ORDER BY j.name`)).rows;
  const dates = (await q(`SELECT (CURRENT_DATE - s)::text AS d FROM generate_series(${days - 1}, 0, -1) s`)).rows.map(x => x.d);
  res.json({ dates, jobs });
});

r.get('/export.csv', view, async (req, res) => {
  const f = filters(req.query);
  const rows = (await q(`SELECT d.*, j.name AS job, j.ref AS job_ref FROM diaries d JOIN jobs j ON j.id = d.job_id${f.sql} ORDER BY d.diary_date, j.name`, f.params)).rows;
  const cols = [{ label: 'Date', key: 'diary_date' }, { label: 'Job', key: 'job' }, { label: 'Ref', key: 'job_ref' }, { label: 'Filled in by', key: 'author_name' }, { label: 'Weather', key: 'weather' },
    { label: 'Labour', get: d => d.labour.map(l => `${l.name}${l.role ? ` (${l.role})` : ''}${l.hours != null ? ` ${l.hours}h` : ''}`).join('; ') },
    { label: 'Hours', get: d => d.labour.reduce((a, l) => a + (Number(l.hours) || 0), 0) },
    ...diary.TEXT_FIELDS.map(k => ({ label: diary.LABELS[k], key: k })), { label: 'Submitted', get: d => d.submitted_at }];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="site-diaries.csv"');
  res.send(csv(rows, cols));
});

// All diaries for a job (or a date range) as one PDF, oldest first.
r.get('/export.pdf', view, async (req, res) => {
  const f = filters(req.query);
  const ids = (await q(`SELECT d.id FROM diaries d${f.sql} ORDER BY d.diary_date, d.submitted_at`, f.params)).rows.map(x => x.id);
  if (!ids.length) return res.status(404).json({ error: 'No diaries to export for that selection.' });
  if (ids.length > 120) return res.status(400).json({ error: 'That is more than 120 diaries. Narrow the dates and export in parts.' });
  const diaries = [];
  for (const id of ids) { const d = await diary.load(id); d.images = await diary.photoBuffers(id); diaries.push(d); }
  const job = int(req.query.job) ? (await q('SELECT name FROM jobs WHERE id = $1', [int(req.query.job)])).rows[0] : null;
  const span = ids.length === 1 ? longDate(diaries[0].diary_date) : `${longDate(diaries[0].diary_date)} to ${longDate(diaries[diaries.length - 1].diary_date)}`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName(client.company)} - Site Diary${job ? ` - ${safeName(job.name)}` : ''} - ${diaries[0].diary_date}${ids.length > 1 ? ` to ${diaries[diaries.length - 1].diary_date}` : ''}.pdf"`);
  render(diaries, { title: `Site Diary${job ? `: ${job.name}` : ''}`, subtitle: span }).pipe(res);
});

r.get('/:id.pdf', view, async (req, res) => {
  const d = await diary.load(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found.' });
  d.images = await diary.photoBuffers(d.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${safeName(client.company)} - Site Diary - ${safeName(d.job)} - ${d.diary_date}.pdf"`);
  render([d], { title: `Site Diary: ${d.job}`, subtitle: longDate(d.diary_date) }).pipe(res);
});

r.get('/:id', view, async (req, res) => {
  const d = await diary.load(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found.' });
  d.has_signature = !!d.signature; delete d.signature;
  res.json({ diary: d, labels: diary.LABELS, weather: diary.WEATHER });
});

r.get('/:id/photo/:pid', view, async (req, res) => {
  const p = (await q('SELECT file_mime, file_data FROM diary_photos WHERE id = $1 AND diary_id = $2', [req.params.pid, req.params.id])).rows[0];
  if (!p) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.type(p.file_mime).send(p.file_data);
});

r.get('/:id/signature', view, async (req, res) => {
  const row = (await q('SELECT signature FROM diaries WHERE id = $1', [req.params.id])).rows[0];
  const m = row && row.signature && row.signature.match(/^data:(image\/\w+);base64,(.*)$/);
  if (!m) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.type(m[1]).send(Buffer.from(m[2], 'base64'));
});

// Added from the office (no signature; the office user is recorded as the author).
r.post('/', edit, async (req, res) => {
  const b = req.body || {};
  const p = diary.payload(b);
  if (!int(b.job_id)) return res.status(400).json({ error: 'Choose the job.' });
  if (!p.diary_date) return res.status(400).json({ error: 'Pick the date.' });
  if (!p.work_done) return res.status(400).json({ error: 'Say what work was carried out.' });
  const vals = diary.COLS.map(c => p[c]);
  const id = (await q(`INSERT INTO diaries (job_id, diary_date, author_name, user_id, ${diary.COLS.join(', ')}, labour, status, submitted_at)
      VALUES ($1,$2,$3,$4,${diary.COLS.map((_, i) => `$${i + 5}`).join(',')},$${diary.COLS.length + 5},'submitted',NOW()) RETURNING id`,
    [int(b.job_id), p.diary_date, req.user.name, req.user.id, ...vals, JSON.stringify(p.labour)])).rows[0].id;
  await diary.savePhotos(id, p.photos);
  res.json({ id });
});

r.put('/:id', edit, async (req, res) => {
  const cur = (await q('SELECT id FROM diaries WHERE id = $1', [req.params.id])).rows[0];
  if (!cur) return res.status(404).json({ error: 'Not found.' });
  const p = diary.payload(req.body || {});
  if (!p.diary_date) return res.status(400).json({ error: 'Pick the date.' });
  if (!p.work_done) return res.status(400).json({ error: 'Say what work was carried out.' });
  const vals = diary.COLS.map(c => p[c]);
  await q(`UPDATE diaries SET diary_date = $1, ${diary.COLS.map((c, i) => `${c} = $${i + 2}`).join(', ')}, labour = $${diary.COLS.length + 2}, edited_by = $${diary.COLS.length + 3}, updated_at = NOW() WHERE id = $${diary.COLS.length + 4}`,
    [p.diary_date, ...vals, JSON.stringify(p.labour), req.user.name, cur.id]);
  if (p.remove_photos.length) await q('DELETE FROM diary_photos WHERE diary_id = $1 AND id = ANY($2::int[])', [cur.id, p.remove_photos]);
  await diary.savePhotos(cur.id, p.photos);
  res.json({ ok: true });
});

r.delete('/:id', admin, async (req, res) => { await q('DELETE FROM diaries WHERE id = $1', [req.params.id]); res.json({ ok: true }); });

module.exports = r;
