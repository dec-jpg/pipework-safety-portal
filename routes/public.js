// Operative-facing API, used by links shared on WhatsApp:
//   /t/TOKEN  a toolbox talk: read, answer the questions, sign
//   /j/TOKEN  a job pack: read the RAMS and site documents, sign each one that needs it
//   /d/TOKEN  a job's daily site diary: the supervisor fills it in at the end of the day, signs it and sends it
// Operatives identify themselves with name and mobile. If they match the register they are linked
// straight away; if not, the signature is still recorded and the office links it later.
const express = require('express');
const { q } = require('../lib/db');
const { token, clean, normPhone, surname, validImage } = require('../lib/util');
const { publicBrand } = require('../lib/brand');
const diary = require('../lib/diary');

const r = express.Router();

async function findOperative(name, phone, tok) {
  if (tok) {
    const o = (await q('SELECT * FROM operatives WHERE device_token = $1 AND active', [tok])).rows[0];
    if (o) return o;
  }
  const p = normPhone(phone);
  if (p.length < 10 || !name) return null;
  const byPhone = (await q('SELECT * FROM operatives WHERE phone = $1 AND active', [p])).rows.find(o => surname(o.full_name) === surname(name));
  if (byPhone) return byPhone;
  // First time on a phone: an exact, unique name match on the register with no mobile on file yet is taken as them, and the mobile is kept.
  const byName = (await q('SELECT * FROM operatives WHERE LOWER(full_name) = LOWER($1) AND active', [clean(name, 120)])).rows;
  if (byName.length === 1 && !byName[0].phone) {
    await q('UPDATE operatives SET phone = $1 WHERE id = $2', [p, byName[0].id]);
    return { ...byName[0], phone: p };
  }
  return null;
}

function who(req) {
  const b = req.body || {};
  return { name: clean(b.name || req.query.name, 120), phone: normPhone(b.phone || req.query.phone), tok: req.get('x-op-token') || null };
}

// Has this person already signed? Matches on the register first, then on the name and number they gave.
async function alreadySigned(col, id, op, w) {
  if (op) return !!(await q(`SELECT 1 FROM signoffs WHERE ${col} = $1 AND operative_id = $2`, [id, op.id])).rows[0];
  if (!w.name) return false;
  return !!(await q(`SELECT 1 FROM signoffs WHERE ${col} = $1 AND LOWER(name_given) = LOWER($2) AND COALESCE(phone_given,'') = $3`, [id, w.name, w.phone || ''])).rows[0];
}

async function record(col, id, op, w, signature, attempts) {
  await q(`INSERT INTO signoffs (${col}, operative_id, name_given, phone_given, signature, attempts) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, op ? op.id : null, op ? op.full_name : w.name, w.phone || (op && op.phone) || null, signature, Math.max(1, parseInt(attempts, 10) || 1)]);
}

// ---------- identity ----------
r.post('/identify', async (req, res) => {
  const w = who(req);
  if (!w.name || w.name.split(/\s+/).length < 2) return res.status(400).json({ error: 'Enter your first name and surname.' });
  if (w.phone.length < 10) return res.status(400).json({ error: 'Enter your mobile number.' });
  const op = await findOperative(w.name, w.phone);
  if (!op) return res.json({ matched: false, name: w.name, phone: w.phone });
  const t = op.device_token || token();
  if (!op.device_token) await q('UPDATE operatives SET device_token = $1 WHERE id = $2', [t, op.id]);
  res.json({ matched: true, token: t, name: op.full_name, phone: op.phone });
});

r.get('/brand', (req, res) => res.json(publicBrand()));

// ---------- toolbox talks ----------
async function talkByToken(t) { return (await q("SELECT * FROM talks WHERE token = $1 AND status IN ('issued','closed')", [t])).rows[0]; }

r.get('/t/:token', async (req, res) => {
  const t = await talkByToken(req.params.token);
  if (!t) return res.status(404).json({ error: 'This toolbox talk link is not active. Ask the office for the current link.' });
  const w = who(req);
  const op = await findOperative(w.name, w.phone, w.tok);
  res.json({
    talk: { ref: t.ref, title: t.title, intro: t.intro, sections: t.sections, questions: t.questions.map(x => ({ question: x.question, options: x.options })), closed: t.status === 'closed' },
    signed: await alreadySigned('talk_id', t.id, op, w),
  });
});

// Answers are checked before the signature screen, and again when signing.
r.post('/t/:token/check', async (req, res) => {
  const t = await talkByToken(req.params.token);
  if (!t) return res.status(404).json({ error: 'This toolbox talk link is not active.' });
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  res.json({ wrong: (t.questions || []).map((x, i) => (Number(answers[i]) === Number(x.answer) ? null : i)).filter(i => i !== null) });
});

r.post('/t/:token/sign', async (req, res) => {
  const t = await talkByToken(req.params.token);
  if (!t) return res.status(404).json({ error: 'This toolbox talk link is not active.' });
  if (t.status === 'closed') return res.status(400).json({ error: 'This talk has been closed. Ask the office if you still need to sign it.' });
  const w = who(req);
  const op = await findOperative(w.name, w.phone, w.tok);
  if (!op && (!w.name || w.phone.length < 10)) return res.status(400).json({ error: 'Enter your name and mobile number first.' });
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  const wrong = (t.questions || []).map((x, i) => (Number(answers[i]) === Number(x.answer) ? null : i)).filter(i => i !== null);
  if (wrong.length) return res.json({ ok: false, wrong });
  if (!validImage(req.body.signature, 400_000)) return res.status(400).json({ error: 'Sign in the box to confirm.' });
  if (await alreadySigned('talk_id', t.id, op, w)) return res.json({ ok: true, already: true });
  await record('talk_id', t.id, op, w, req.body.signature, req.body.attempts);
  res.json({ ok: true });
});

// ---------- job packs ----------
async function jobByToken(t) { return (await q("SELECT * FROM jobs WHERE token = $1 AND status = 'live'", [t])).rows[0]; }

r.get('/j/:token', async (req, res) => {
  const j = await jobByToken(req.params.token);
  if (!j) return res.status(404).json({ error: 'This job pack link is not active. Ask the office for the current link.' });
  const w = who(req);
  const op = await findOperative(w.name, w.phone, w.tok);
  const docs = (await q(`SELECT id, kind, title, reference, revision, requires_signoff, file_name, content, created_at FROM documents
      WHERE job_id = $1 AND current ORDER BY CASE kind WHEN 'briefing' THEN 0 WHEN 'rams' THEN 1 WHEN 'permit' THEN 2 WHEN 'plan' THEN 3 ELSE 4 END, title`, [j.id])).rows;
  for (const d of docs) d.signed = d.requires_signoff ? await alreadySigned('document_id', d.id, op, w) : null;
  res.json({ job: { name: j.name, ref: j.ref, address: j.address, client: j.client }, documents: docs });
});

r.get('/j/:token/doc/:id', async (req, res) => {
  const j = await jobByToken(req.params.token);
  if (!j) return res.status(404).send('This job pack link is not active.');
  const d = (await q('SELECT file_name, file_mime, file_data FROM documents WHERE id = $1 AND job_id = $2 AND current', [req.params.id, j.id])).rows[0];
  if (!d || !d.file_data) return res.status(404).send('Document not available.');
  res.setHeader('Content-Type', d.file_mime || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(d.file_name || 'document').replace(/"/g, '')}"`);
  res.send(d.file_data);
});

r.post('/j/:token/doc/:id/sign', async (req, res) => {
  const j = await jobByToken(req.params.token);
  if (!j) return res.status(404).json({ error: 'This job pack link is not active.' });
  const d = (await q('SELECT id FROM documents WHERE id = $1 AND job_id = $2 AND current AND requires_signoff', [req.params.id, j.id])).rows[0];
  if (!d) return res.status(404).json({ error: 'This document has been replaced. Reload the page.' });
  const w = who(req);
  const op = await findOperative(w.name, w.phone, w.tok);
  if (!op && (!w.name || w.phone.length < 10)) return res.status(400).json({ error: 'Enter your name and mobile number first.' });
  if (!validImage(req.body.signature, 400_000)) return res.status(400).json({ error: 'Sign in the box to confirm.' });
  if (await alreadySigned('document_id', d.id, op, w)) return res.json({ ok: true, already: true });
  await record('document_id', d.id, op, w, req.body.signature, 1);
  // Someone signing a job pack who is on the register gets added to the job team.
  if (op) await q('INSERT INTO job_operatives (job_id, operative_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [j.id, op.id]);
  res.json({ ok: true });
});

// ---------- daily site diary ----------
async function diaryJob(t) { return (await q("SELECT * FROM jobs WHERE diary_token = $1 AND status = 'live'", [t])).rows[0]; }
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const daysAgo = n => { const d = new Date(today() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
// Which diary is "theirs" for a day: matched to their register entry, or to the name and number they gave.
async function ownDiary(jobId, day, op, w) {
  if (op) return (await q('SELECT * FROM diaries WHERE job_id = $1 AND diary_date = $2 AND operative_id = $3 ORDER BY id DESC LIMIT 1', [jobId, day, op.id])).rows[0] || null;
  if (!w.name) return null;
  return (await q(`SELECT * FROM diaries WHERE job_id = $1 AND diary_date = $2 AND operative_id IS NULL AND LOWER(author_name) = LOWER($3) AND COALESCE(author_phone, '') = $4 ORDER BY id DESC LIMIT 1`, [jobId, day, w.name, w.phone || ''])).rows[0] || null;
}

r.get('/d/:token', async (req, res) => {
  const j = await diaryJob(req.params.token);
  if (!j) return res.status(404).json({ error: 'This site diary link is not active. Ask the office for the current link.' });
  const w = who(req);
  const op = await findOperative(w.name, w.phone, w.tok);
  let day = diary.date(req.query.date) || today();
  if (day > today()) day = today();
  if (day < daysAgo(14)) day = daysAgo(14);
  const mine = await ownDiary(j.id, day, op, w);
  if (mine) { delete mine.signature; mine.photos = (await q('SELECT id, caption FROM diary_photos WHERE diary_id = $1 ORDER BY sort, id', [mine.id])).rows; }
  const people = (await q(`SELECT o.id, o.full_name AS name, o.role, EXISTS (SELECT 1 FROM job_operatives jo WHERE jo.job_id = $1 AND jo.operative_id = o.id) AS on_team
      FROM operatives o WHERE o.active ORDER BY on_team DESC, o.full_name`, [j.id])).rows;
  // The last diary on this job (anyone's), so plant and labour can be carried forward.
  const last = (await q('SELECT diary_date, labour, plant FROM diaries WHERE job_id = $1 AND diary_date < $2 ORDER BY diary_date DESC, id DESC LIMIT 1', [j.id, day])).rows[0] || null;
  const days = (await q('SELECT DISTINCT diary_date FROM diaries WHERE job_id = $1 AND diary_date >= $2', [j.id, daysAgo(14)])).rows.map(x => x.diary_date);
  res.json({ job: { name: j.name, ref: j.ref, address: j.address, client: j.client }, date: day, today: today(), earliest: daysAgo(14), diary: mine, people, last, days, weather: diary.WEATHER, labels: diary.LABELS });
});

r.get('/d/:token/photo/:id', async (req, res) => {
  const j = await diaryJob(req.params.token);
  if (!j) return res.status(404).end();
  const p = (await q('SELECT p.file_mime, p.file_data FROM diary_photos p JOIN diaries d ON d.id = p.diary_id WHERE p.id = $1 AND d.job_id = $2', [req.params.id, j.id])).rows[0];
  if (!p) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.type(p.file_mime).send(p.file_data);
});

// Save (or update) the diary for a day. A signature is needed the first time; updates keep the existing one unless a new one is sent.
r.post('/d/:token/save', async (req, res) => {
  const j = await diaryJob(req.params.token);
  if (!j) return res.status(404).json({ error: 'This site diary link is not active.' });
  const w = who(req);
  const op = await findOperative(w.name, w.phone, w.tok);
  if (!op && (!w.name || w.phone.length < 10)) return res.status(400).json({ error: 'Enter your name and mobile number first.' });
  const p = diary.payload(req.body || {});
  if (!p.diary_date) return res.status(400).json({ error: 'Pick the date this diary is for.' });
  if (p.diary_date > today() || p.diary_date < daysAgo(14)) return res.status(400).json({ error: 'Diaries can be filled in for today or the last two weeks.' });
  if (!p.work_done) return res.status(400).json({ error: 'Say what work was carried out today, even if it was none.' });
  const sig = validImage(req.body.signature, 400_000) ? req.body.signature : null;
  const existing = await ownDiary(j.id, p.diary_date, op, w);
  if (!existing && !sig) return res.status(400).json({ error: 'Sign in the box to send the diary.' });
  const vals = diary.COLS.map(c => p[c]);
  let id;
  if (existing) {
    await q(`UPDATE diaries SET ${diary.COLS.map((c, i) => `${c} = $${i + 1}`).join(', ')}, labour = $${diary.COLS.length + 1}, signature = COALESCE($${diary.COLS.length + 2}, signature), submitted_at = NOW(), updated_at = NOW() WHERE id = $${diary.COLS.length + 3}`,
      [...vals, JSON.stringify(p.labour), sig, existing.id]);
    if (p.remove_photos.length) await q('DELETE FROM diary_photos WHERE diary_id = $1 AND id = ANY($2::int[])', [existing.id, p.remove_photos]);
    id = existing.id;
  } else {
    id = (await q(`INSERT INTO diaries (job_id, diary_date, author_name, author_phone, operative_id, ${diary.COLS.join(', ')}, labour, signature, status, submitted_at)
        VALUES ($1,$2,$3,$4,$5,${diary.COLS.map((_, i) => `$${i + 6}`).join(',')},$${diary.COLS.length + 6},$${diary.COLS.length + 7},'submitted',NOW()) RETURNING id`,
      [j.id, p.diary_date, op ? op.full_name : w.name, w.phone || (op && op.phone) || null, op ? op.id : null, ...vals, JSON.stringify(p.labour), sig])).rows[0].id;
  }
  await diary.savePhotos(id, p.photos);
  // Anyone on the register recorded as on site goes on the job team, as does the person filling it in.
  const ids = [...new Set([op ? op.id : null, ...p.labour.map(l => l.operative_id)].filter(Boolean))];
  for (const oid of ids) await q('INSERT INTO job_operatives (job_id, operative_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [j.id, oid]);
  res.json({ ok: true, id, updated: !!existing });
});

module.exports = r;
