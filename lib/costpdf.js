// Job cost report as a PDF: headline figures, budget position, week by week, labour by person, and the ledger.
const PDFDocument = require('pdfkit');
const client = require('./client');
const { CATEGORIES, JOB_TYPES } = require('./costs');

const COL = { ink: '#18201b', faint: '#6b746f', line: '#d9d4c9', shade: '#f3f1ec', good: '#2f7d4f', warn: '#b26a00', bad: '#b3261e' };
const gbp = n => (n == null ? '' : (n < 0 ? '-£' : '£') + Math.abs(Math.round(n)).toLocaleString('en-GB'));
const pct = n => (n == null ? '' : `${Math.round(n)}%`);
const fDate = iso => (iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });

function render(d) {
  const { job, weeks, people, items, byCategory, rate } = d;
  const doc = new PDFDocument({ size: 'A4', margins: { top: 54, bottom: 50, left: 44, right: 44 }, bufferPages: true, info: { Title: `${client.company} job cost report: ${job.name}`, Author: 'Safety Simplified Ltd' } });
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  const brand = client.colour || '#1f3a5f';
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const need = h => { if (doc.y + h > bottom()) doc.addPage(); };

  doc.rect(L, 40, W, 3).fill(brand);
  doc.fillColor(COL.faint).font('Helvetica').fontSize(8.5).text(`${client.company.toUpperCase()}  ·  JOB COST REPORT  ·  ${today().toUpperCase()}`, L, 52, { characterSpacing: .8 });
  doc.fillColor(COL.ink).font('Helvetica-Bold').fontSize(18).text(job.name, L, 66, { width: W });
  doc.font('Helvetica').fontSize(10.5).fillColor(COL.faint).text([job.ref, job.client, JOB_TYPES[job.job_type], job.status === 'complete' ? 'Complete' : 'Live', job.start_on ? `from ${fDate(job.start_on)}` : null].filter(Boolean).join('  ·  '), { width: W });
  doc.moveDown(.8);

  // Headline tiles
  const marginColour = job.margin < 0 ? COL.bad : job.margin_pct != null && job.margin_pct < 10 ? COL.warn : COL.good;
  const tiles = [['Value', gbp(job.value), job.variations ? `${gbp(job.order_value)} order + ${gbp(job.variations)} variations` : 'Order value'],
    ['Cost to date', gbp(job.cost), `${gbp(job.labour)} labour · ${gbp(job.materials + job.other)} other`],
    ['Margin', `${gbp(job.margin)}`, job.margin_pct == null ? '' : `${pct(job.margin_pct)} of value`, marginColour],
    ['Hours', `${Math.round(job.hours).toLocaleString('en-GB')}`, job.budget_hours ? `of ${Math.round(job.budget_hours).toLocaleString('en-GB')} allowed (${pct(job.hours_pct)})` : `${job.days} diary days`]];
  const ty = doc.y, tw = (W - 3 * 10) / 4;
  tiles.forEach(([k, v, sub, colour], i) => {
    const x = L + i * (tw + 10);
    doc.rect(x, ty, tw, 62).fill(COL.shade);
    doc.fillColor(COL.faint).font('Helvetica-Bold').fontSize(7).text(k.toUpperCase(), x + 10, ty + 9, { characterSpacing: .5 });
    doc.fillColor(colour || COL.ink).font('Helvetica-Bold').fontSize(17).text(v, x + 10, ty + 21, { width: tw - 16, lineBreak: false });
    doc.fillColor(COL.faint).font('Helvetica').fontSize(7.5).text(sub, x + 10, ty + 45, { width: tw - 16, height: 10, ellipsis: true });
  });
  doc.y = ty + 74;

  const heading = t => { need(70); doc.moveDown(.4); doc.fillColor(COL.ink).font('Helvetica-Bold').fontSize(10.5).text(t, L, doc.y, { width: W }); doc.strokeColor(COL.line).lineWidth(.6).moveTo(L, doc.y + 2).lineTo(L + W, doc.y + 2).stroke(); doc.y += 7; };
  const table = (cols, rows, opts = {}) => {
    const row = (cells, bold, shade, colour) => {
      need(18);
      const y = doc.y;
      if (shade) doc.rect(L, y - 2, W, 16).fill(COL.shade);
      let x = L + 6;
      doc.fillColor(colour || (bold ? COL.faint : COL.ink)).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 7.5 : 9);
      cells.forEach((c, i) => { doc.text(String(c ?? ''), x, y + (bold ? 2 : 1), { width: cols[i][0] - 10, height: 11, ellipsis: true, lineBreak: false, align: cols[i][2] || 'left' }); x += cols[i][0]; });
      doc.y = y + 16;
    };
    row(cols.map(c => c[1].toUpperCase()), true, true);
    rows.forEach(r => row(r.cells, false, false, r.colour));
    if (opts.total) row(opts.total, true, true, COL.ink);
  };

  // Budget position
  const budgetRows = [];
  if (job.budget_hours) budgetRows.push({ cells: ['Labour hours', Math.round(job.budget_hours), Math.round(job.hours), pct(job.hours_pct)], colour: job.hours_pct > 100 ? COL.bad : job.hours_pct > 90 ? COL.warn : COL.ink });
  if (job.budget_materials) budgetRows.push({ cells: ['Materials', gbp(job.budget_materials), gbp(job.materials), pct(job.materials_pct)], colour: job.materials_pct > 100 ? COL.bad : job.materials_pct > 90 ? COL.warn : COL.ink });
  if (job.budget_other) budgetRows.push({ cells: ['Plant, subcontract and other', gbp(job.budget_other), gbp(job.other), pct((job.other / job.budget_other) * 100)], colour: job.other > job.budget_other ? COL.bad : COL.ink });
  if (budgetRows.length) { heading('Against budget'); table([[W * .46, 'Line'], [W * .18, 'Allowed', 'right'], [W * .18, 'To date', 'right'], [W * .18, 'Used', 'right']], budgetRows); }

  // Costs by category
  heading('Cost to date');
  const catRows = [{ cells: ['Labour (diary hours at loaded rates)', `${Math.round(job.hours)} hrs`, gbp(job.labour)] }];
  for (const [k, label] of Object.entries(CATEGORIES)) if (byCategory[k]) catRows.push({ cells: [label, '', gbp(byCategory[k])] });
  table([[W * .6, 'Category'], [W * .2, 'Quantity', 'right'], [W * .2, 'Amount', 'right']], catRows, { total: ['Total cost to date', '', gbp(job.cost)] });

  if (weeks.length) {
    heading('Week by week');
    table([[W * .22, 'Week starting'], [W * .13, 'Hours', 'right'], [W * .17, 'Labour', 'right'], [W * .17, 'Other costs', 'right'], [W * .15, 'Week total', 'right'], [W * .16, 'Running cost', 'right']],
      weeks.map(w => ({ cells: [fDate(w.week), Math.round(w.hours), gbp(w.labour), gbp(w.other), gbp(w.cost), gbp(w.cumulative)] })));
  }
  if (people.length) {
    heading('Labour by person');
    table([[W * .4, 'Name'], [W * .2, 'Role'], [W * .1, 'Days', 'right'], [W * .1, 'Hours', 'right'], [W * .1, 'Rate', 'right'], [W * .1, 'Cost', 'right']],
      people.map(p => ({ cells: [p.name, p.role || '', p.days, Math.round(p.hours * 10) / 10, gbp(p.rate), gbp(p.cost)] })),
      { total: ['Total labour', '', '', Math.round(job.hours), '', gbp(job.labour)] });
    doc.fillColor(COL.faint).font('Helvetica-Oblique').fontSize(7.5).text(`Rates are loaded cost rates (wage plus on-costs). People without a rate are costed at the default of ${gbp(rate)}/hr.`, L, doc.y + 2, { width: W });
    doc.y += 12;
  }
  const costItems = items.filter(i => i.kind === 'cost'), valueItems = items.filter(i => i.kind === 'value');
  if (valueItems.length) {
    heading('Variations and additional value');
    table([[W * .15, 'Date'], [W * .49, 'Description'], [W * .2, 'Reference'], [W * .16, 'Amount', 'right']], valueItems.map(i => ({ cells: [fDate(i.cost_date), i.description, i.reference || '', gbp(i.amount)] })), { total: ['', 'Total variations', '', gbp(job.variations)] });
  }
  if (costItems.length) {
    heading('Cost ledger');
    table([[W * .15, 'Date'], [W * .17, 'Category'], [W * .36, 'Description'], [W * .18, 'Supplier'], [W * .14, 'Amount', 'right']],
      costItems.slice().reverse().map(i => ({ cells: [fDate(i.cost_date), CATEGORIES[i.category] || i.category, i.description + (i.qty != null && i.unit ? ` (${i.qty} ${i.unit})` : ''), i.supplier || '', gbp(i.amount)] })),
      { total: ['', '', 'Total other costs', '', gbp(job.materials + job.other)] });
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const keep = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    doc.fillColor(COL.faint).font('Helvetica').fontSize(7.5).text(`${client.company}  ·  Job cost report: ${job.name}  ·  Page ${i + 1} of ${range.count}  ·  From the ${client.portal} portal`, L, doc.page.height - 32, { width: W, align: 'center', lineBreak: false });
    doc.page.margins.bottom = keep;
  }
  doc.end();
  return doc;
}

module.exports = { render };
