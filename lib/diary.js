// Daily site diaries: shared pieces for the site-side form and the office.
const { q } = require('./db');
const { clean, validImage } = require('./util');

const WEATHER = ['Dry', 'Sunny', 'Overcast', 'Showers', 'Rain', 'Heavy rain', 'Windy', 'Frost', 'Snow or ice', 'Fog'];
const TEXT_FIELDS = ['conditions', 'plant', 'work_done', 'deliveries', 'visitors', 'delays', 'instructions', 'safety', 'tomorrow'];
const LABELS = {
  conditions: 'Site conditions', plant: 'Plant and equipment on site', work_done: 'Work carried out', deliveries: 'Deliveries and materials',
  visitors: 'Visitors and inspections', delays: 'Delays, problems and downtime', instructions: 'Instructions and variations received', safety: 'Health and safety', tomorrow: 'Planned for tomorrow',
};
const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

// Cleans what the form sent into the columns. Labour is [{name, role, hours, operative_id}].
function payload(b) {
  const out = { diary_date: date(b.diary_date), weather: WEATHER.includes(b.weather) ? b.weather : clean(b.weather, 40) };
  for (const f of TEXT_FIELDS) out[f] = clean(b[f], 8000);
  out.labour = (Array.isArray(b.labour) ? b.labour : []).map(l => ({
    name: clean(l.name, 120) || '', role: clean(l.role, 80) || '', hours: l.hours === '' || l.hours == null ? null : Math.max(0, Math.min(24, Number(l.hours) || 0)),
    operative_id: Number(l.operative_id) || null,
  })).filter(l => l.name).slice(0, 60);
  out.photos = (Array.isArray(b.photos) ? b.photos : []).filter(p => p && validImage(p.data, 2_000_000)).map(p => ({ data: p.data, caption: clean(p.caption, 200) })).slice(0, 12);
  out.remove_photos = (Array.isArray(b.remove_photos) ? b.remove_photos : []).map(Number).filter(Boolean);
  return out;
}

const COLS = ['weather', ...TEXT_FIELDS];

async function savePhotos(diaryId, photos) {
  if (!photos.length) return;
  const base = (await q('SELECT COALESCE(MAX(sort), 0) AS s FROM diary_photos WHERE diary_id = $1', [diaryId])).rows[0].s;
  for (const [i, p] of photos.entries()) {
    const m = p.data.match(/^data:(image\/\w+);base64,(.*)$/);
    await q('INSERT INTO diary_photos (diary_id, caption, file_mime, file_data, sort) VALUES ($1,$2,$3,$4,$5)', [diaryId, p.caption, m[1], Buffer.from(m[2], 'base64'), base + i + 1]);
  }
}

// One diary with its photo list (no image data) for the office pages and the PDF.
async function load(id) {
  const d = (await q(`SELECT d.*, j.name AS job, j.ref AS job_ref, j.client AS job_client, j.address AS job_address, o.full_name AS operative_name
      FROM diaries d JOIN jobs j ON j.id = d.job_id LEFT JOIN operatives o ON o.id = d.operative_id WHERE d.id = $1`, [id])).rows[0];
  if (!d) return null;
  d.photos = (await q('SELECT id, caption, file_mime, sort FROM diary_photos WHERE diary_id = $1 ORDER BY sort, id', [id])).rows;
  return d;
}

async function photoBuffers(diaryId) {
  return (await q('SELECT id, caption, file_mime, file_data FROM diary_photos WHERE diary_id = $1 ORDER BY sort, id', [diaryId])).rows;
}

const isEmpty = d => !d.work_done && !d.labour.length && !TEXT_FIELDS.some(f => d[f]);

module.exports = { WEATHER, TEXT_FIELDS, LABELS, COLS, payload, savePhotos, load, photoBuffers, isEmpty, date };
