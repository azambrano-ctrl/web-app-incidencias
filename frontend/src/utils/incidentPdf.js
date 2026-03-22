import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { STATUS_LABELS, PRIORITY_LABELS, TYPE_LABELS } from './constants';

const PRIMARY  = [37, 99, 235];
const GRAY     = [100, 116, 139];
const DARK     = [30, 41, 59];
const SUCCESS  = [22, 101, 52];
const SUCCESS_BG = [240, 253, 244];

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-EC', {
    timeZone: 'America/Guayaquil',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Genera y descarga el PDF de una incidencia.
 * @param {{ inc: object, checklist: object|null, userName: string }} opts
 */
export function downloadIncidentPDF({ inc, checklist, userName }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  /* ── Header azul ── */
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, W, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('📡 IncidenciasISP', 14, 12);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Reporte de incidencia', 14, 20);
  doc.text(`Generado: ${fmtDate(new Date().toISOString())}`, W - 14, 20, { align: 'right' });
  doc.text(`Por: ${userName}`, W - 14, 26, { align: 'right' });

  let y = 38;

  /* ── Ticket number + estado ── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...DARK);
  doc.text(inc.ticket_number, 14, y);

  const statusLabel = STATUS_LABELS[inc.status] || inc.status;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  doc.text(`Estado: ${statusLabel}  ·  Prioridad: ${PRIORITY_LABELS[inc.priority] || inc.priority}  ·  Tipo: ${TYPE_LABELS[inc.type] || inc.type}`, 14, y + 7);

  y += 16;

  /* ── Info principal ── */
  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 9, cellPadding: 3, textColor: DARK },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    head: [['Campo', 'Valor']],
    body: [
      ['Título',        inc.title],
      ['Descripción',   inc.description || '—'],
      ['Creado por',    inc.created_name || '—'],
      ['Técnico asignado', inc.assigned_name || 'Sin asignar'],
      ['Fecha de creación', fmtDate(inc.created_at)],
      ['SLA / Vence',   inc.due_at ? fmtDate(inc.due_at) : 'Sin SLA'],
      ['Dirección',     inc.address || '—'],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    didDrawPage: (d) => { y = d.cursor.y + 6; },
  });

  /* ── Solución ── */
  if (inc.solution) {
    doc.setFillColor(...SUCCESS_BG);
    doc.setDrawColor(134, 239, 172);
    doc.roundedRect(14, y, W - 28, 8 + doc.splitTextToSize(inc.solution, W - 36).length * 5, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...SUCCESS);
    doc.text('✅ Solución aplicada', 18, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(inc.solution, W - 36);
    doc.text(lines, 18, y + 11);
    y += 14 + lines.length * 5;
  }

  /* ── Firma del cliente ── */
  if (inc.client_signature && inc.status === 'resolved') {
    try {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      doc.text('✍️ Firma del cliente', 14, y + 5);
      y += 8;
      // Embed signature image (data URL)
      doc.addImage(inc.client_signature, 'PNG', 14, y, 80, 30);
      y += 36;
    } catch (_) {
      // ignore if image fails
    }
  }

  /* ── Checklist ── */
  const clItems = checklist?.items || [];
  if (clItems.length > 0) {
    const checked = clItems.filter(i => i.checked).length;
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 9, cellPadding: 3, textColor: DARK },
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      head: [[`✔ Checklist — ${checked}/${clItems.length} completados`, '']],
      body: clItems.map((item, i) => [
        `${item.checked ? '☑' : '☐'}  ${item.label}`,
        item.checked ? 'Completado' : 'Pendiente',
      ]),
      columnStyles: { 1: { halign: 'center', cellWidth: 30 } },
      didDrawPage: (d) => { y = d.cursor.y + 6; },
    });
  }

  /* ── Comentarios ── */
  const comments = inc.comments || [];
  if (comments.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8, cellPadding: 3, textColor: DARK },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      head: [['💬 Comentarios', 'Usuario', 'Fecha']],
      body: comments.map(c => [c.body, c.author_name || '—', fmtDate(c.created_at)]),
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 35 },
        2: { cellWidth: 38 },
      },
      didDrawPage: (d) => { y = d.cursor.y + 6; },
    });
  }

  /* ── Footer en cada página ── */
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.setFont('helvetica', 'normal');
    doc.text(`IncidenciasISP · ${inc.ticket_number} · Documento generado automáticamente`, 14, 290);
    doc.text(`Página ${i} de ${pages}`, W - 14, 290, { align: 'right' });
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 287, W - 14, 287);
  }

  const filename = `${inc.ticket_number}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
