// Daily site diaries as a PDF: one diary per section (each starts on a new page), with the day's details, labour, every
// section that was filled in, photos two to a row and the signature. Portrait A4, Safety Simplified house style.
const PDFDocument = require('pdfkit');
const client = require('./client');
const { TEXT_FIELDS, LABELS } = require('./diary');

const COL = { ink: '#18201b', faint: '#6b746f', line: '#d9d4c9', shade: '#f3f1ec', warn: '#b26a00', bad: '#b3261e' };
const longDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const london = d => (d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

function render(diaries, { title, subtitle }) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 54, bottom: 50, left: 44, right: 44 }, bufferPages: true, info: { Title: `${client.company} ${title}`, Author: 'Safety Simplified Ltd' } });
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  const brand = client.colour || '#1f3a5f';
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const need = h => { if (doc.y + h > bottom()) doc.addPage(); };

  diaries.forEach((d, idx) => {
    if (idx) doc.addPage();
    // Header band
    doc.rect(L, 40, W, 3).fill(brand);
    doc.fillColor(COL.faint).font('Helvetica').fontSize(8.5).text(`${client.company.toUpperCase()}  ·  DAILY SITE DIARY`, L, 52, { characterSpacing: .8 });
    doc.fillColor(COL.ink).font('Helvetica-Bold').fontSize(18).text(d.job, L, 66, { width: W });
    doc.font('Helvetica').fontSize(10.5).fillColor(COL.faint).text([d.job_ref, d.job_client, d.job_address].filter(Boolean).join('  ·  '), { width: W });
    doc.moveDown(.6);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COL.ink).text(longDate(d.diary_date), { width: W });
    doc.moveDown(.4);

    // Meta box
    const metaY = doc.y;
    const meta = [['Filled in by', d.author_name + (d.operative_name && d.operative_name !== d.author_name ? ` (${d.operative_name})` : '')], ['Weather', d.weather || 'Not recorded'],
      ['Submitted', london(d.submitted_at)], ['Labour on site', `${d.labour.length} ${d.labour.length === 1 ? 'person' : 'people'}${d.labour.some(l => l.hours != null) ? `, ${d.labour.reduce((a, l) => a + (Number(l.hours) || 0), 0)} hours` : ''}`]];
    doc.rect(L, metaY, W, 46).fill(COL.shade);
    meta.forEach(([k, v], i) => {
      const x = L + 10 + i * (W / 4);
      doc.fillColor(COL.faint).font('Helvetica-Bold').fontSize(7).text(k.toUpperCase(), x, metaY + 9, { width: W / 4 - 14, characterSpacing: .5 });
      doc.fillColor(COL.ink).font('Helvetica').fontSize(9.5).text(v, x, metaY + 21, { width: W / 4 - 14, height: 22, ellipsis: true });
    });
    doc.y = metaY + 56;
    if (d.edited_by) { doc.fillColor(COL.faint).font('Helvetica-Oblique').fontSize(8).text(`Edited in the office by ${d.edited_by}, ${london(d.updated_at)}`, L, doc.y, { width: W }); doc.moveDown(.5); }

    const heading = (t, colour = COL.ink) => {
      need(40);
      doc.moveDown(.5);
      doc.fillColor(colour).font('Helvetica-Bold').fontSize(10.5).text(t, L, doc.y, { width: W });
      doc.strokeColor(COL.line).lineWidth(.6).moveTo(L, doc.y + 2).lineTo(L + W, doc.y + 2).stroke();
      doc.y += 7;
    };
    const para = t => { doc.fillColor(COL.ink).font('Helvetica').fontSize(10).text(t, L, doc.y, { width: W, lineGap: 1.5 }); doc.moveDown(.3); };

    // Labour table
    if (d.labour.length) {
      heading('Labour on site');
      const cols = [[W * .5, 'Name'], [W * .3, 'Role'], [W * .2, 'Hours']];
      const row = (cells, bold, shade) => {
        need(18);
        const y = doc.y;
        if (shade) doc.rect(L, y - 2, W, 16).fill(COL.shade);
        let x = L + 6;
        doc.fillColor(bold ? COL.faint : COL.ink).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 7.5 : 9.5);
        cells.forEach((c, i) => { doc.text(String(c), x, y + (bold ? 2 : 1), { width: cols[i][0] - 10, height: 11, ellipsis: true, lineBreak: false }); x += cols[i][0]; });
        doc.y = y + 16;
      };
      row(cols.map(c => c[1].toUpperCase()), true, true);
      d.labour.forEach(l => row([l.name, l.role || '', l.hours != null ? l.hours : ''], false, false));
    }
    if (d.conditions) { heading(LABELS.conditions); para(d.conditions); }
    if (d.plant) { heading(LABELS.plant); para(d.plant); }
    heading(LABELS.work_done); para(d.work_done || 'No work recorded.');
    for (const f of ['deliveries', 'visitors']) if (d[f]) { heading(LABELS[f]); para(d[f]); }
    if (d.delays) { heading(LABELS.delays, COL.warn); para(d.delays); }
    if (d.instructions) { heading(LABELS.instructions, COL.warn); para(d.instructions); }
    if (d.safety) { heading(LABELS.safety, COL.bad); para(d.safety); }
    if (d.tomorrow) { heading(LABELS.tomorrow); para(d.tomorrow); }

    // Photos, two per row
    const images = (d.images || []).filter(p => /jpeg|png/.test(p.file_mime));
    if (images.length) {
      const gap = 12, pw = (W - gap) / 2, ph = pw * .72;
      need(ph + 70);
      heading(`Photos (${images.length})`);
      for (let i = 0; i < images.length; i += 2) {
        need(ph + 28);
        const y = doc.y;
        images.slice(i, i + 2).forEach((p, k) => {
          const x = L + k * (pw + gap);
          try { doc.image(p.file_data, x, y, { fit: [pw, ph], align: 'center', valign: 'center' }); } catch { doc.fillColor(COL.faint).fontSize(8).text('Photo could not be rendered', x, y + ph / 2, { width: pw, align: 'center' }); }
          doc.strokeColor(COL.line).lineWidth(.5).rect(x, y, pw, ph).stroke();
          doc.fillColor(COL.faint).font('Helvetica').fontSize(8).text(p.caption || `Photo ${i + k + 1}`, x, y + ph + 4, { width: pw, height: 12, ellipsis: true });
        });
        doc.y = y + ph + 20;
      }
    }

    // Signature
    need(90);
    doc.moveDown(.6);
    const sy = doc.y;
    doc.strokeColor(COL.line).lineWidth(.6).rect(L, sy, W, 72).stroke();
    doc.fillColor(COL.faint).font('Helvetica-Bold').fontSize(7).text('SIGNED', L + 10, sy + 8, { characterSpacing: .5 });
    const m = d.signature && d.signature.match(/^data:image\/(png|jpeg);base64,(.*)$/);
    if (m) { try { doc.image(Buffer.from(m[2], 'base64'), L + 10, sy + 18, { fit: [160, 48] }); } catch { /* skip */ } }
    else doc.fillColor(COL.faint).font('Helvetica-Oblique').fontSize(9).text(d.user_id ? 'Entered in the office, not signed on site' : 'No signature on file', L + 10, sy + 30);
    doc.fillColor(COL.ink).font('Helvetica').fontSize(9.5).text(d.author_name, L + 200, sy + 22, { width: W - 210 });
    doc.fillColor(COL.faint).fontSize(8.5).text(`${longDate(d.diary_date)}${d.submitted_at ? `, sent ${london(d.submitted_at)}` : ''}`, L + 200, sy + 38, { width: W - 210 });
    doc.y = sy + 80;
  });

  // Footers (written inside the bottom margin, so the margin is lifted while writing to stop pdfkit adding pages)
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const keep = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    doc.fillColor(COL.faint).font('Helvetica').fontSize(7.5)
      .text(`${client.company}  ·  ${title}  ·  Page ${i + 1} of ${range.count}  ·  Recorded on the ${client.portal} portal, built and supported by Safety Simplified Ltd`, L, doc.page.height - 32, { width: W, align: 'center', lineBreak: false });
    doc.page.margins.bottom = keep;
  }
  doc.end();
  return doc;
}

module.exports = { render };
