// Job costing: the numbers behind each job. Labour is never typed in; it is the hours in the site diaries priced at each
// person's loaded cost rate (wage plus on-costs), with a default rate for anyone without one. Everything else is the
// cost ledger (materials, plant, subcontract, other) and the value ledger (order value plus agreed variations).
const { q } = require('./db');

const CATEGORIES = { materials: 'Materials', plant: 'Plant and hire', subcontract: 'Subcontract', tm: 'Traffic management', other: 'Other' };
const JOB_TYPES = { measured: 'Measured (schedule of rates)', fixed: 'Fixed price', daywork: 'Daywork' };

async function defaultRate() {
  const r = (await q("SELECT value FROM settings WHERE key = 'default_cost_rate'")).rows[0];
  return r && Number(r.value) ? Number(r.value) : 0;
}

// Every labour line from every diary, priced. One row per person per diary.
const LABOUR = `
  SELECT d.job_id, d.diary_date, d.id AS diary_id, (l->>'name') AS name, NULLIF(l->>'operative_id', '')::int AS operative_id, (l->>'role') AS role,
    COALESCE((l->>'hours')::numeric, 0) AS hours,
    COALESCE(o.cost_rate, $1::numeric) AS rate,
    COALESCE((l->>'hours')::numeric, 0) * COALESCE(o.cost_rate, $1::numeric) AS cost
  FROM diaries d CROSS JOIN LATERAL jsonb_array_elements(d.labour) l
  LEFT JOIN operatives o ON o.id = NULLIF(l->>'operative_id', '')::int`;

// Per-job totals: value, labour, other costs by category, margin, budgets.
async function summary(jobId) {
  const rate = await defaultRate();
  const params = [rate]; let where = '';
  if (jobId) { params.push(jobId); where = ' WHERE j.id = $2'; }
  const rows = (await q(`
    WITH lab AS (SELECT job_id, SUM(hours) AS hours, SUM(cost) AS cost, COUNT(DISTINCT diary_date) AS days, MAX(diary_date) AS last_day FROM (${LABOUR}) x GROUP BY job_id),
    costs AS (SELECT job_id, SUM(amount) FILTER (WHERE kind = 'cost') AS cost_total,
        SUM(amount) FILTER (WHERE kind = 'cost' AND category = 'materials') AS materials,
        SUM(amount) FILTER (WHERE kind = 'cost' AND category <> 'materials') AS other,
        SUM(amount) FILTER (WHERE kind = 'value') AS variations, COUNT(*) FILTER (WHERE kind = 'value') AS variation_count FROM job_costs GROUP BY job_id)
    SELECT j.id, j.ref, j.name, j.client, j.status, j.job_type, j.start_on, j.end_on, j.order_value, j.budget_hours, j.budget_materials, j.budget_other, j.retention_pct,
      COALESCE(lab.hours, 0) AS hours, COALESCE(lab.cost, 0) AS labour, COALESCE(lab.days, 0) AS days, lab.last_day,
      COALESCE(c.materials, 0) AS materials, COALESCE(c.other, 0) AS other, COALESCE(c.variations, 0) AS variations, COALESCE(c.variation_count, 0)::int AS variation_count,
      COALESCE(j.order_value, 0) + COALESCE(c.variations, 0) AS value,
      COALESCE(lab.cost, 0) + COALESCE(c.cost_total, 0) AS cost
    FROM jobs j LEFT JOIN lab ON lab.job_id = j.id LEFT JOIN costs c ON c.job_id = j.id${where}
    ORDER BY j.status = 'live' DESC, j.start_on DESC NULLS LAST, j.name`, params)).rows;
  for (const r of rows) {
    for (const k of ['order_value', 'budget_hours', 'budget_materials', 'budget_other', 'retention_pct', 'hours', 'labour', 'materials', 'other', 'variations', 'value', 'cost']) r[k] = r[k] == null ? null : Number(r[k]);
    r.days = Number(r.days);
    r.margin = r.value - r.cost;
    r.margin_pct = r.value ? (r.margin / r.value) * 100 : null;
    r.budget_cost = (r.budget_hours || 0) * rate; // only used when there is no better figure
    r.hours_pct = r.budget_hours ? (r.hours / r.budget_hours) * 100 : null;
    r.materials_pct = r.budget_materials ? (r.materials / r.budget_materials) * 100 : null;
    // Traffic light: red when losing money or clearly over budget, amber when heading that way, green otherwise, grey when nothing to judge against.
    r.rag = !r.value ? 'grey' : r.margin < 0 || (r.hours_pct || 0) > 110 || (r.materials_pct || 0) > 115 ? 'red'
      : (r.margin_pct != null && r.margin_pct < 10) || (r.hours_pct || 0) > 90 || (r.materials_pct || 0) > 95 ? 'amber' : 'green';
  }
  return { rows, rate };
}

// The detail behind one job: by week, by person, and the ledger.
async function detail(jobId) {
  const { rows, rate } = await summary(jobId);
  const job = rows[0];
  if (!job) return null;
  const weeks = (await q(`
    WITH lab AS (SELECT date_trunc('week', diary_date)::date AS wk, SUM(hours) AS hours, SUM(cost) AS labour FROM (${LABOUR}) x WHERE job_id = $2 GROUP BY 1),
    oth AS (SELECT date_trunc('week', cost_date)::date AS wk, SUM(amount) FILTER (WHERE kind = 'cost') AS other, SUM(amount) FILTER (WHERE kind = 'value') AS value FROM job_costs WHERE job_id = $2 GROUP BY 1)
    SELECT COALESCE(lab.wk, oth.wk) AS week, COALESCE(lab.hours, 0) AS hours, COALESCE(lab.labour, 0) AS labour, COALESCE(oth.other, 0) AS other, COALESCE(oth.value, 0) AS value
    FROM lab FULL OUTER JOIN oth ON oth.wk = lab.wk ORDER BY 1`, [rate, jobId])).rows.map(w => ({ week: w.week, hours: +w.hours, labour: +w.labour, other: +w.other, value: +w.value, cost: +w.labour + +w.other }));
  let run = 0; for (const w of weeks) { run += w.cost; w.cumulative = run; }
  const people = (await q(`SELECT operative_id, MAX(name) AS name, MAX(role) AS role, SUM(hours) AS hours, MAX(rate) AS rate, SUM(cost) AS cost, COUNT(DISTINCT diary_date) AS days
      FROM (${LABOUR}) x WHERE job_id = $2 GROUP BY operative_id, LOWER(name) ORDER BY SUM(cost) DESC`, [rate, jobId])).rows
    .map(p => ({ ...p, hours: +p.hours, rate: +p.rate, cost: +p.cost, days: +p.days }));
  const items = (await q(`SELECT id, kind, category, cost_date, description, supplier, reference, material_id, qty, unit, unit_cost, amount, file_name, (file_data IS NOT NULL) AS has_file, added_by, created_at
      FROM job_costs WHERE job_id = $1 ORDER BY cost_date DESC, id DESC`, [jobId])).rows.map(i => ({ ...i, qty: i.qty == null ? null : +i.qty, unit_cost: i.unit_cost == null ? null : +i.unit_cost, amount: +i.amount }));
  const byCategory = {};
  for (const i of items) if (i.kind === 'cost') byCategory[i.category] = (byCategory[i.category] || 0) + i.amount;
  return { job, rate, weeks, people, items, byCategory };
}

// Hours per person per day across jobs for a date range (the timesheet view).
async function hours(from, to, jobId) {
  const rate = await defaultRate();
  const params = [rate, from, to]; let extra = '';
  if (jobId) { params.push(jobId); extra = ' AND x.job_id = $4'; }
  const rows = (await q(`SELECT x.operative_id, MAX(x.name) AS name, MAX(x.role) AS role, x.job_id, j.name AS job, j.ref AS job_ref, x.diary_date, SUM(x.hours) AS hours, MAX(x.rate) AS rate, SUM(x.cost) AS cost
      FROM (${LABOUR}) x JOIN jobs j ON j.id = x.job_id WHERE x.diary_date BETWEEN $2 AND $3${extra}
      GROUP BY x.operative_id, LOWER(x.name), x.job_id, j.name, j.ref, x.diary_date ORDER BY name, x.diary_date`, params)).rows;
  return { rate, rows: rows.map(r => ({ ...r, hours: +r.hours, rate: +r.rate, cost: +r.cost })) };
}

module.exports = { CATEGORIES, JOB_TYPES, LABOUR, defaultRate, summary, detail, hours };
