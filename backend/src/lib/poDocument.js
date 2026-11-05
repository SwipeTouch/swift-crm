const PDFDocument = require('pdfkit');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, ImageRun, BorderStyle, HeadingLevel,
} = require('docx');

// Use "INR" text rather than the ₹ glyph (the PDF core fonts lack it).
const inr = (n) => 'INR ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const BILLING = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly' };

function monthsBetween(a, b) {
  if (!a || !b) return null;
  return Math.max(1, Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24 * 30.44)));
}

function logoBuffer(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:(image\/[\w+.-]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  return { buffer: Buffer.from(m[2], 'base64'), type: m[1] };
}

// Shared computed view of a PO for both generators.
function buildViewModel(po, template) {
  const months = monthsBetween(po.dealDate, po.contractExpiry);
  const valueLine = po.valueType === 'PSPM'
    ? `${inr(po.perStudentRate)} / student / month × ${po.studentStrength} students`
    : `Lump sum ${inr(po.monthlyAmount)} / month`;
  const contacts = Array.isArray(po.contacts) ? po.contacts : [];
  return {
    po, template, months, valueLine, contacts,
    contractBase: months ? po.baseAmount * months : null,
    contractTotal: months ? po.grandTotal * months : null,
  };
}

// Rows used for the end-of-document details table (both formats).
function detailRows(vm) {
  const { po } = vm;
  const rows = [
    ['School Name', po.schoolName],
    ['Addressed to', po.addresseeTitle || '—'],
    ['Board', po.board || '—'],
    ['Deal Date', fmtDate(po.dealDate)],
    ['Contract Expiry', fmtDate(po.contractExpiry)],
    ['Contract Period', vm.months ? `${vm.months} months` : '—'],
    ['Value Type', po.valueType === 'PSPM' ? 'Per Student Per Month (PSPM)' : 'Lump Sum'],
  ];
  if (po.valueType === 'PSPM') {
    rows.push(['Per Student Rate', inr(po.perStudentRate)]);
    rows.push(['Total Student Strength', String(po.studentStrength ?? '—')]);
  } else {
    rows.push(['Monthly Amount', inr(po.monthlyAmount)]);
  }
  rows.push(['Monthly Base', inr(po.baseAmount)]);
  rows.push([`GST @ ${po.gstPercent}%`, inr(po.gstAmount)]);
  rows.push(['Monthly Total (incl. GST)', inr(po.grandTotal)]);
  if (vm.months) rows.push(['Contract Total (incl. GST)', inr(vm.contractTotal)]);
  rows.push(['Billing Cycle', BILLING[po.billingCycle] || po.billingCycle]);
  return rows;
}

/* ---------------------------------- PDF ---------------------------------- */

function generatePdf(vm) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { po, template } = vm;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Header: company (left) + logo (right)
    const lg = logoBuffer(template.logo);
    if (lg) {
      try { doc.image(lg.buffer, right - 120, 45, { fit: [120, 60], align: 'right' }); } catch (e) { /* unsupported image */ }
    }
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1d6fe0').text(template.companyName || 'Company', left, 50, { width: width - 130 });
    doc.font('Helvetica').fontSize(9).fillColor('#444');
    if (template.companyAddress) doc.text(template.companyAddress, { width: width - 130 });
    const contactBits = [template.companyPhone && `Ph: ${template.companyPhone}`, template.companyEmail].filter(Boolean).join('  ·  ');
    if (contactBits) doc.text(contactBits, { width: width - 130 });
    doc.moveDown(0.5);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#1d6fe0').lineWidth(1.5).stroke();
    doc.moveDown(0.8);

    // Ref + date
    doc.fillColor('#000').font('Helvetica').fontSize(10);
    const refY = doc.y;
    doc.text(`PO No: ${po.poNumber}`, left, refY);
    doc.text(`Date: ${fmtDate(po.dealDate)}`, left, refY, { width, align: 'right' });
    doc.moveDown(1);

    // Addressee
    doc.font('Helvetica-Bold').text('To,');
    doc.font('Helvetica').text(`${po.addresseeTitle ? po.addresseeTitle + ', ' : ''}${po.schoolName}`);
    if (po.board) doc.text(`Board: ${po.board}`);
    doc.moveDown(0.8);

    // Subject + salutation
    doc.font('Helvetica-Bold').text(`Subject: Work Order – ${template.productName || 'Services'}`);
    doc.moveDown(0.6);
    doc.font('Helvetica').text(`Dear ${po.addresseeTitle || 'Sir/Madam'},`);
    doc.moveDown(0.5);
    doc.text(
      `This Purchase Order confirms the engagement with ${po.schoolName} for ${template.productName || 'our services'}. ` +
      `The agreed commercial is ${vm.valueLine}, billed ${(BILLING[po.billingCycle] || po.billingCycle).toLowerCase()}` +
      `${vm.months ? `, for a contract period of ${vm.months} months (until ${fmtDate(po.contractExpiry)})` : ''}.`,
      { align: 'justify' }
    );
    doc.moveDown(0.8);

    // Deal highlight box
    const boxTop = doc.y;
    doc.roundedRect(left, boxTop, width, 70, 4).fillAndStroke('#f5f8ff', '#1d6fe0');
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(11).text(po.schoolName, left + 12, boxTop + 10, { width: width - 24 });
    doc.font('Helvetica').fontSize(10).text(`Deal value: ${vm.valueLine}`, left + 12);
    doc.font('Helvetica-Bold').text(
      `Monthly: ${inr(po.baseAmount)} + ${po.gstPercent}% GST (${inr(po.gstAmount)}) = ${inr(po.grandTotal)}`,
      left + 12
    );
    doc.y = boxTop + 78;
    doc.moveDown(0.5);

    // Bank details
    if (template.bankDetails) {
      doc.font('Helvetica-Bold').fontSize(10).text('Bank Details');
      doc.font('Helvetica').fontSize(9).text(template.bankDetails);
      doc.moveDown(0.8);
    }
    doc.font('Helvetica').fontSize(10).text('Thanking you and assuring you of our best services.');
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').text(`For ${template.companyName || 'Company'}`);
    doc.font('Helvetica').fillColor('#888').text('(Authorised Signatory)');
    doc.fillColor('#000');

    // Annexure 1 – Modules
    const bulletList = (title, text) => {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#1d6fe0').text(title, { align: 'center' });
      doc.moveDown(0.8);
      doc.font('Helvetica').fontSize(10).fillColor('#000');
      String(text || '').split('\n').map((s) => s.trim()).filter(Boolean)
        .forEach((line, i) => doc.text(`${i + 1}. ${line}`, { paragraphGap: 4 }));
    };
    bulletList('MODULES OFFERED – Annexure 1', template.modules);
    bulletList('IMPORTANT TERMS & CONDITIONS – Annexure 2', template.terms);

    // Details table (at the end)
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#1d6fe0').text('Purchase Order – Details', { align: 'center' });
    doc.moveDown(0.8);
    doc.fillColor('#000');
    drawKvTable(doc, detailRows(vm));

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).text('Points of Contact');
    doc.moveDown(0.3);
    drawContactsTable(doc, vm.contacts);

    doc.end();
  });
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function drawKvTable(doc, rows) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const labelW = 190;
  doc.fontSize(10);
  rows.forEach(([k, v]) => {
    const vText = String(v == null ? '' : v);
    const h = Math.max(doc.heightOfString(vText, { width: width - labelW - 16 }), doc.heightOfString(String(k), { width: labelW - 16 })) + 10;
    ensureSpace(doc, h);
    const y = doc.y;
    doc.rect(left, y, labelW, h).fillAndStroke('#f7f7f7', '#dddddd');
    doc.rect(left + labelW, y, width - labelW, h).stroke('#dddddd');
    doc.fillColor('#000').font('Helvetica-Bold').text(String(k), left + 8, y + 5, { width: labelW - 16 });
    doc.font('Helvetica').text(vText, left + labelW + 8, y + 5, { width: width - labelW - 16 });
    doc.y = y + h;
  });
}

function drawContactsTable(doc, contacts) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cols = [width * 0.4, width * 0.35, width * 0.25];
  const header = ['Name', 'Email', 'Phone'];
  const rowH = 22;
  const drawRow = (cells, bold) => {
    ensureSpace(doc, rowH);
    const y = doc.y;
    let x = left;
    cells.forEach((c, i) => {
      doc.rect(x, y, cols[i], rowH).fillAndStroke(bold ? '#eef3fc' : '#ffffff', '#dddddd');
      doc.fillColor('#000').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).text(String(c || '—'), x + 6, y + 6, { width: cols[i] - 12, ellipsis: true });
      x += cols[i];
    });
    doc.y = y + rowH;
  };
  drawRow(header, true);
  (contacts.length ? contacts : [{}]).forEach((c) => drawRow([c.name, c.email, c.phone]));
}

/* ---------------------------------- DOCX --------------------------------- */

const P = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: opts.size, color: opts.color })], spacing: { after: opts.after ?? 120 }, alignment: opts.align, heading: opts.heading });

function docxCell(text, { bold, shade, width } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: shade ? { fill: shade } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text: String(text == null ? '' : text), bold })] })],
  });
}

function docxKvTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([k, v]) => new TableRow({ children: [docxCell(k, { bold: true, shade: 'F7F7F7', width: 40 }), docxCell(v, { width: 60 })] })),
  });
}

function docxContactsTable(contacts) {
  const header = new TableRow({ children: ['Name', 'Email', 'Phone'].map((h) => docxCell(h, { bold: true, shade: 'EEF3FC' })) });
  const body = (contacts.length ? contacts : [{}]).map((c) => new TableRow({ children: [docxCell(c.name), docxCell(c.email), docxCell(c.phone)] }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] });
}

async function generateDocx(vm) {
  const { po, template } = vm;
  const headerChildren = [];
  const lg = logoBuffer(template.logo);
  if (lg) {
    try {
      headerChildren.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ data: lg.buffer, transformation: { width: 120, height: 60 } })] }));
    } catch (e) { /* unsupported */ }
  }

  const letter = [
    ...headerChildren,
    P(template.companyName || 'Company', { bold: true, size: 32, color: '1d6fe0' }),
    template.companyAddress ? P(template.companyAddress, { size: 18, color: '444444' }) : null,
    P(`PO No: ${po.poNumber}        Date: ${fmtDate(po.dealDate)}`, { after: 200 }),
    P('To,', { bold: true, after: 20 }),
    P(`${po.addresseeTitle ? po.addresseeTitle + ', ' : ''}${po.schoolName}`, { after: 20 }),
    po.board ? P(`Board: ${po.board}`) : null,
    P(`Subject: Work Order – ${template.productName || 'Services'}`, { bold: true }),
    P(`Dear ${po.addresseeTitle || 'Sir/Madam'},`),
    P(`This Purchase Order confirms the engagement with ${po.schoolName} for ${template.productName || 'our services'}. The agreed commercial is ${vm.valueLine}, billed ${(BILLING[po.billingCycle] || po.billingCycle).toLowerCase()}${vm.months ? `, for a contract period of ${vm.months} months (until ${fmtDate(po.contractExpiry)})` : ''}.`),
    P(`Deal value: ${vm.valueLine}`, { bold: true, after: 20 }),
    P(`Monthly: ${inr(po.baseAmount)} + ${po.gstPercent}% GST (${inr(po.gstAmount)}) = ${inr(po.grandTotal)}`, { bold: true }),
    template.bankDetails ? P('Bank Details', { bold: true, after: 20 }) : null,
    template.bankDetails ? P(template.bankDetails) : null,
    P(`For ${template.companyName || 'Company'}`, { bold: true }),
  ].filter(Boolean);

  const annexure = (title, text) => [
    new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 28, color: '1d6fe0' })], alignment: AlignmentType.CENTER, pageBreakBefore: true, spacing: { after: 200 } }),
    ...String(text || '').split('\n').map((s) => s.trim()).filter(Boolean).map((line, i) => P(`${i + 1}. ${line}`, { after: 60 })),
  ];

  const detailsSection = [
    new Paragraph({ children: [new TextRun({ text: 'Purchase Order – Details', bold: true, size: 28, color: '1d6fe0' })], alignment: AlignmentType.CENTER, pageBreakBefore: true, spacing: { after: 200 } }),
    docxKvTable(detailRows(vm)),
    P('', { after: 120 }),
    P('Points of Contact', { bold: true }),
    docxContactsTable(vm.contacts),
  ];

  const doc = new Document({ sections: [{ children: [...letter, ...annexure('MODULES OFFERED – Annexure 1', template.modules), ...annexure('IMPORTANT TERMS & CONDITIONS – Annexure 2', template.terms), ...detailsSection] }] });
  return Packer.toBuffer(doc);
}

module.exports = { buildViewModel, generatePdf, generateDocx };
