import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Invoice, InvoiceSettings } from './types';
import { getT } from './i18n';

function cleanText(text: string): string {
  return (text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u202f|\u00a0/g, ' ');
}

function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount);
  const formatted = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} ${cleanText(currency)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || '#1d4ed8').replace('#', '');
  if (clean.length !== 6) return [29, 78, 216];
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [isNaN(r) ? 29 : r, isNaN(g) ? 78 : g, isNaN(b) ? 216 : b];
}

export async function generateInvoicePdf(invoice: Invoice, settings: InvoiceSettings) {
  const t = getT(settings.language);
  const isTicket =
    invoice.template === 'ticket' ||
    settings.paperFormat === 'ticket80' ||
    settings.paperFormat === 'ticket58';

  const ticketWidth = settings.paperFormat === 'ticket58' ? 58 : 80;
  const ticketHeight = Math.max(150, 120 + invoice.items.length * 14);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: isTicket
      ? [ticketWidth, ticketHeight]
      : settings.paperFormat === 'a5'
        ? 'a5'
        : 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const baseFont = Math.max(7, Math.min(18, invoice.fontSize || settings.fontSize || 10));
  const [ar, ag, ab] = hexToRgb(settings.accentColor);

  const subtotal = invoice.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const discountAmt = subtotal * ((invoice.discountPercent || 0) / 100);
  const afterDiscount = subtotal - discountAmt;
  const taxAmt = afterDiscount * ((invoice.taxPercent || 0) / 100);
  const grandTotal = afterDiscount + taxAmt;

  if (isTicket) {
    const margin = 4;
    let y = 8;
    const tf = Math.max(7, Math.min(11, baseFont - 1));

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(tf + 3);
    doc.text(cleanText(settings.companyName), pageWidth / 2, y, { align: 'center' });
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(tf - 1);
    if (settings.companyAddress) {
      doc.text(cleanText(settings.companyAddress), pageWidth / 2, y, { align: 'center' });
      y += 3.8;
    }
    if (settings.companyPhone) {
      doc.text(`Tel: ${cleanText(settings.companyPhone)}`, pageWidth / 2, y, { align: 'center' });
      y += 3.8;
    }
    if (settings.showNifStat && (settings.companyNif || settings.companyStat)) {
      const ns = [
        settings.companyNif ? `NIF: ${settings.companyNif}` : '',
        settings.companyStat ? `STAT: ${settings.companyStat}` : ''
      ]
        .filter(Boolean)
        .join(' | ');
      doc.text(cleanText(ns), pageWidth / 2, y, { align: 'center' });
      y += 3.8;
    }

    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(tf);
    doc.text(`FACTURE: ${cleanText(invoice.number)}`, margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${cleanText(invoice.date)}`, margin, y);
    y += 4;
    doc.text(`Client: ${cleanText(invoice.clientName)}`, margin, y);
    y += 4;

    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    for (const item of invoice.items) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(tf);
      const nameLines = doc.splitTextToSize(cleanText(item.name), pageWidth - margin * 2);
      doc.text(nameLines, margin, y);
      y += nameLines.length * 3.8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(tf - 0.5);
      const leftTxt = `${item.quantity} ${cleanText(item.unit)} x ${formatMoney(item.unitPrice, settings.currency)}`;
      const rightTxt = formatMoney(item.quantity * item.unitPrice, settings.currency);
      doc.text(leftTxt, margin, y);
      doc.text(rightTxt, pageWidth - margin, y, { align: 'right' });
      y += 4.5;
    }

    doc.line(margin, y, pageWidth - margin, y);
    y += 4.5;

    if (settings.showDiscount && invoice.discountPercent > 0) {
      doc.setFontSize(tf);
      doc.text(`Remise (${invoice.discountPercent}%):`, margin, y);
      doc.text(`-${formatMoney(discountAmt, settings.currency)}`, pageWidth - margin, y, { align: 'right' });
      y += 4;
    }
    if (settings.showTax && invoice.taxPercent > 0) {
      doc.setFontSize(tf);
      doc.text(`TVA (${invoice.taxPercent}%):`, margin, y);
      doc.text(formatMoney(taxAmt, settings.currency), pageWidth - margin, y, { align: 'right' });
      y += 4;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(tf + 2);
    doc.text(cleanText(t.grandTotal), margin, y);
    doc.text(formatMoney(grandTotal, settings.currency), pageWidth - margin, y, { align: 'right' });
    y += 5;

    if (settings.showPaymentMethod && invoice.paymentMethod) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(tf - 1);
      doc.text(`${cleanText(t.paymentMethod)}: ${cleanText(invoice.paymentMethod)}`, margin, y);
      y += 4.5;
    }

    if (settings.footerNote) {
      y += 2;
      doc.setFontSize(tf - 1);
      const fLines = doc.splitTextToSize(cleanText(settings.footerNote), pageWidth - margin * 2);
      doc.text(fLines, pageWidth / 2, y, { align: 'center' });
    }
  } else {
    const margin = settings.paperFormat === 'a5' ? 10 : 14;
    let y = margin;

    if (invoice.template === 'modern') {
      doc.setFillColor(ar, ag, ab);
      doc.rect(0, 0, pageWidth, 34, 'F');
    }

    let textStartX = margin;
    if (settings.showLogo && settings.companyLogo) {
      try {
        doc.addImage(settings.companyLogo, 'PNG', margin, y, 22, 22);
        textStartX = margin + 26;
      } catch {
        // Ignore invalid image format
      }
    }

    if (invoice.template === 'modern') {
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setTextColor(15, 23, 42);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(baseFont + 6);
    doc.text(cleanText(settings.companyName), textStartX, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(baseFont - 1);
    let cy = y + 11;
    if (settings.companySubtitle) {
      doc.text(cleanText(settings.companySubtitle), textStartX, cy);
      cy += 4.2;
    }
    if (settings.companyAddress) {
      doc.text(cleanText(settings.companyAddress), textStartX, cy);
      cy += 4.2;
    }
    const contactLine = [settings.companyPhone, settings.companyEmail].filter(Boolean).join(' | ');
    if (contactLine) {
      doc.text(cleanText(contactLine), textStartX, cy);
      cy += 4.2;
    }
    if (settings.showNifStat) {
      const legal = [
        settings.companyNif ? `NIF: ${settings.companyNif}` : '',
        settings.companyStat ? `STAT: ${settings.companyStat}` : '',
        settings.companyRcs ? `RCS: ${settings.companyRcs}` : ''
      ]
        .filter(Boolean)
        .join('  ');
      if (legal) {
        doc.text(cleanText(legal), textStartX, cy);
        cy += 4.2;
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(baseFont + 7);
    if (invoice.template === 'classic') {
      doc.setTextColor(ar, ag, ab);
    }
    doc.text('FACTURE', pageWidth - margin, y + 7, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(baseFont);
    if (invoice.template !== 'modern') {
      doc.setTextColor(51, 65, 85);
    }
    doc.text(`N°: ${cleanText(invoice.number)}`, pageWidth - margin, y + 13, { align: 'right' });
    doc.text(`Date: ${cleanText(invoice.date)}`, pageWidth - margin, y + 18, { align: 'right' });

    doc.setTextColor(15, 23, 42);
    y = Math.max(cy + 6, invoice.template === 'modern' ? 40 : y + 28);

    if (invoice.template === 'classic') {
      doc.setDrawColor(ar, ag, ab);
      doc.setLineWidth(0.6);
      doc.line(margin, y - 3, pageWidth - margin, y - 3);
    } else if (invoice.template === 'minimal') {
      doc.setDrawColor(203, 213, 225);
      doc.line(margin, y - 3, pageWidth - margin, y - 3);
    }

    if (settings.headerNote) {
      doc.setFontSize(baseFont - 1);
      doc.setTextColor(71, 85, 105);
      doc.text(cleanText(settings.headerNote), margin, y + 2);
      y += 7;
    }

    doc.setTextColor(15, 23, 42);
    if (invoice.template !== 'minimal') {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, pageWidth - margin * 2, settings.showClientDetails ? 22 : 13, 2, 2, 'FD');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(baseFont);
    doc.text(`Client: ${cleanText(invoice.clientName)}`, margin + 3, y + 6);

    if (settings.showClientDetails) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(baseFont - 1);
      const cLine1 = [invoice.clientPhone, invoice.clientAddress].filter(Boolean).join(' - ');
      const cLine2 = [
        invoice.clientNif ? `NIF: ${invoice.clientNif}` : '',
        invoice.clientStat ? `STAT: ${invoice.clientStat}` : ''
      ]
        .filter(Boolean)
        .join(' | ');
      if (cLine1) doc.text(cleanText(cLine1), margin + 3, y + 12);
      if (cLine2) doc.text(cleanText(cLine2), margin + 3, y + 17.5);
      y += 27;
    } else {
      y += 17;
    }

    const headRow = settings.showUnitColumn
      ? [['Désignation', cleanText(t.qty), 'Unité', cleanText(t.price), cleanText(t.total)]]
      : [['Désignation', cleanText(t.qty), cleanText(t.price), cleanText(t.total)]];

    const bodyRows = invoice.items.map((item) => {
      const lineTotal = item.quantity * item.unitPrice;
      return settings.showUnitColumn
        ? [
            cleanText(item.name),
            String(item.quantity),
            cleanText(item.unit),
            formatMoney(item.unitPrice, settings.currency),
            formatMoney(lineTotal, settings.currency)
          ]
        : [
            cleanText(item.name),
            String(item.quantity),
            formatMoney(item.unitPrice, settings.currency),
            formatMoney(lineTotal, settings.currency)
          ];
    });

    autoTable(doc, {
      startY: y,
      head: headRow,
      body: bodyRows,
      margin: { left: margin, right: margin },
      theme: invoice.template === 'minimal' ? 'plain' : 'striped',
      styles: {
        fontSize: baseFont - 0.5,
        cellPadding: 2.8,
        textColor: [15, 23, 42]
      },
      headStyles:
        invoice.template === 'minimal'
          ? { fillColor: [255, 255, 255], textColor: [15, 23, 42], fontStyle: 'bold', lineWidth: { bottom: 0.4 } }
          : { fillColor: [ar, ag, ab], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: settings.showUnitColumn
        ? {
            1: { halign: 'center' },
            2: { halign: 'center' },
            3: { halign: 'right' },
            4: { halign: 'right', fontStyle: 'bold' }
          }
        : {
            1: { halign: 'center' },
            2: { halign: 'right' },
            3: { halign: 'right', fontStyle: 'bold' }
          }
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    let ty = finalY;

    const rightColX = pageWidth - margin;
    const labelColX = pageWidth - margin - 45;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(baseFont);
    doc.text(cleanText(t.subtotal), labelColX, ty);
    doc.text(formatMoney(subtotal, settings.currency), rightColX, ty, { align: 'right' });
    ty += 5.5;

    if (settings.showDiscount && invoice.discountPercent > 0) {
      doc.text(`Remise (${invoice.discountPercent}%)`, labelColX, ty);
      doc.text(`-${formatMoney(discountAmt, settings.currency)}`, rightColX, ty, { align: 'right' });
      ty += 5.5;
    }

    if (settings.showTax && invoice.taxPercent > 0) {
      doc.text(`TVA (${invoice.taxPercent}%)`, labelColX, ty);
      doc.text(formatMoney(taxAmt, settings.currency), rightColX, ty, { align: 'right' });
      ty += 5.5;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(baseFont + 2);
    doc.setTextColor(ar, ag, ab);
    doc.text(cleanText(t.grandTotal), labelColX, ty + 2);
    doc.text(formatMoney(grandTotal, settings.currency), rightColX, ty + 2, { align: 'right' });
    doc.setTextColor(15, 23, 42);
    ty += 10;

    if (settings.showPaymentMethod && invoice.paymentMethod) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(baseFont - 0.5);
      doc.text(`${cleanText(t.paymentMethod)}: ${cleanText(invoice.paymentMethod)}`, margin, ty);
      ty += 6;
    }

    if (invoice.note) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(baseFont - 1);
      const nLines = doc.splitTextToSize(cleanText(invoice.note), pageWidth - margin * 2);
      doc.text(nLines, margin, ty);
      ty += nLines.length * 4.5 + 4;
    }

    if (settings.showSignatureBox) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(baseFont - 1);
      doc.text('Signature / Cachet', pageWidth - margin - 25, ty + 6, { align: 'center' });
      doc.setDrawColor(148, 163, 184);
      doc.rect(pageWidth - margin - 48, ty + 8, 46, 18);
      ty += 30;
    }

    if (settings.footerNote) {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(baseFont - 1);
      doc.setTextColor(100, 116, 139);
      doc.text(cleanText(settings.footerNote), pageWidth / 2, Math.max(ty + 6, pageHeight - 10), {
        align: 'center'
      });
    }
  }

  const safeNumber = cleanText(invoice.number).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Facture_${safeNumber || Date.now()}.pdf`;

  if (Capacitor.isNativePlatform()) {
    const base64 = doc.output('datauristring').split(',')[1];
    const saved = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache
    });
    await Share.share({
      title: fileName,
      url: saved.uri
    });
  } else {
    doc.save(fileName);
  }
}
