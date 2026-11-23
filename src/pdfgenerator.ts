import { jsPDF } from 'jspdf';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Invoice, InvoiceSettings, PaperFormat } from './types';

function formatMoneyPdf(amount: number, currency: string): string {
  const rounded = Math.round(amount);
  const formatted = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} ${currency || ''}`.trim();
}

function getPageDimensions(format: PaperFormat): {
  unit: 'mm';
  format: 'a4' | 'a5' | [number, number];
  width: number;
} {
  if (format === 'a5') {
    return { unit: 'mm', format: 'a5', width: 148 };
  }
  if (format === 'thermal80') {
    return { unit: 'mm', format: [80, 297], width: 80 };
  }
  return { unit: 'mm', format: 'a4', width: 210 };
}

function hexToRgb(hex?: string): [number, number, number] {
  const clean = (hex || '#1d4ed8').replace('#', '');
  if (clean.length !== 6) return [29, 78, 216];
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return [29, 78, 216];
  return [r, g, b];
}

export async function generateInvoicePdf(
  invoice: Invoice,
  settings: InvoiceSettings
): Promise<void> {
  const paperFormat: PaperFormat = settings.paperFormat || 'a4';
  const isThermal = paperFormat === 'thermal80';
  const dim = getPageDimensions(paperFormat);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: dim.unit,
    format: dim.format
  });

  const margin = isThermal ? 4 : 14;
  const pageWidth = dim.width;
  const contentWidth = pageWidth - margin * 2;
  const baseFontSize = Math.max(
    7,
    Math.min(16, Number(invoice.fontSize || settings.fontSize || (isThermal ? 8 : 11)))
  );
  const [accentR, accentG, accentB] = hexToRgb(settings.accentColor);

  let y = margin;

  // --- LOGO SY ANARAN'NY ORINASA ---
  if (settings.companyLogo) {
    try {
      const logoSize = isThermal ? 12 : 18;
      doc.addImage(settings.companyLogo, 'PNG', margin, y, logoSize, logoSize);
      const textX = margin + logoSize + 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isThermal ? baseFontSize + 2 : baseFontSize + 4);
      doc.setTextColor(accentR, accentG, accentB);
      doc.text(settings.companyName || 'NJARA FACTURE', textX, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(Math.max(7, baseFontSize - 1));
      doc.setTextColor(80, 80, 80);
      doc.text(`${invoice.number} • ${invoice.date}`, textX, y + 11);
      y += logoSize + 5;
    } catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isThermal ? baseFontSize + 2 : baseFontSize + 4);
      doc.setTextColor(accentR, accentG, accentB);
      doc.text(settings.companyName || 'NJARA FACTURE', margin, y + 4);
      y += 10;
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isThermal ? baseFontSize + 2 : baseFontSize + 4);
    doc.setTextColor(accentR, accentG, accentB);
    doc.text(settings.companyName || 'NJARA FACTURE', margin, y + 4);
    y += 9;
  }

  // --- LAHARANA SY DATY ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(baseFontSize);
  doc.setTextColor(20, 20, 20);
  doc.text(`N°: ${invoice.number}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${invoice.date}`, pageWidth - margin, y, { align: 'right' });
  y += isThermal ? 4 : 6;

  // Tsipika manasaraka
  doc.setDrawColor(accentR, accentG, accentB);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += isThermal ? 4 : 6;

  // --- MPANJIFA (CLIENT) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(baseFontSize);
  doc.setTextColor(20, 20, 20);
  doc.text(`Client: ${invoice.clientName}`, margin, y);
  y += isThermal ? 3.8 : 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(Math.max(7, baseFontSize - 1));
  doc.setTextColor(60, 60, 60);

  if (invoice.clientPhone) {
    doc.text(`Tél: ${invoice.clientPhone}`, margin, y);
    y += isThermal ? 3.5 : 4.5;
  }
  if (invoice.clientAddress) {
    const addrLines = doc.splitTextToSize(`Adresse: ${invoice.clientAddress}`, contentWidth);
    doc.text(addrLines, margin, y);
    y += addrLines.length * (isThermal ? 3.5 : 4.5);
  }
  if (invoice.clientNif || invoice.clientStat) {
    const taxIdText = [
      invoice.clientNif ? `NIF: ${invoice.clientNif}` : '',
      invoice.clientStat ? `STAT: ${invoice.clientStat}` : ''
    ]
      .filter(Boolean)
      .join(' | ');
    doc.text(taxIdText, margin, y);
    y += isThermal ? 3.5 : 4.5;
  }
  if (invoice.paymentMethod) {
    doc.text(`Paiement: ${invoice.paymentMethod}`, margin, y);
    y += isThermal ? 4 : 6;
  }

  // --- EN-TÊTE TABLEAU ENTANA ---
  doc.setFillColor(accentR, accentG, accentB);
  doc.rect(margin, y, contentWidth, isThermal ? 5.5 : 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(7, baseFontSize - 1));
  doc.setTextColor(255, 255, 255);

  const headerY = y + (isThermal ? 3.8 : 4.8);
  if (isThermal) {
    doc.text('Désignation', margin + 1, headerY);
    doc.text('Total', pageWidth - margin - 1, headerY, { align: 'right' });
  } else {
    doc.text('Désignation', margin + 2, headerY);
    doc.text('Qté', margin + contentWidth * 0.56, headerY, { align: 'right' });
    doc.text('P.U.', margin + contentWidth * 0.76, headerY, { align: 'right' });
    doc.text('Total', pageWidth - margin - 2, headerY, { align: 'right' });
  }
  y += isThermal ? 7 : 9;

  // --- ANDALANA ENTANA ---
  doc.setTextColor(25, 25, 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(Math.max(7, baseFontSize - 1));

  let subtotal = 0;

  for (const item of invoice.items) {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    const lineTotal = qty * unitPrice;
    subtotal += lineTotal;

    const nameColWidth = isThermal ? contentWidth - 2 : contentWidth * 0.5;
    const nameLines = doc.splitTextToSize(item.name, nameColWidth);
    const rowHeight = Math.max(
      isThermal ? 7 : 6,
      nameLines.length * (isThermal ? 3.6 : 4.5) + (isThermal ? 3 : 2)
    );

    // Raha efa ho tapitra ny pejy dia manokatra pejy vaovao (afa-tsy thermal)
    if (!isThermal && y + rowHeight > doc.internal.pageSize.getHeight() - 35) {
      doc.addPage();
      y = margin;
    }

    if (isThermal) {
      doc.text(nameLines, margin + 1, y + 3.2);
      const detailLine = `${qty} ${item.unit || ''} x ${formatMoneyPdf(unitPrice, '')}`.trim();
      const subY = y + nameLines.length * 3.6 + 2.8;
      doc.setTextColor(90, 90, 90);
      doc.text(detailLine, margin + 1, subY);
      doc.setTextColor(25, 25, 25);
      doc.setFont('helvetica', 'bold');
      doc.text(formatMoneyPdf(lineTotal, settings.currency), pageWidth - margin - 1, subY, {
        align: 'right'
      });
      doc.setFont('helvetica', 'normal');
      y = subY + 4;
    } else {
      doc.text(nameLines, margin + 2, y + 4);
      doc.text(`${qty} ${item.unit || ''}`.trim(), margin + contentWidth * 0.56, y + 4, {
        align: 'right'
      });
      doc.text(formatMoneyPdf(unitPrice, ''), margin + contentWidth * 0.76, y + 4, {
        align: 'right'
      });
      doc.text(formatMoneyPdf(lineTotal, ''), pageWidth - margin - 2, y + 4, {
        align: 'right'
      });

      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.2);
      doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
      y += rowHeight + 1;
    }
  }

  y += isThermal ? 2 : 4;

  // --- KAJY TOTALY ---
  const discountPct = Math.min(100, Math.max(0, Number(invoice.discountPercent) || 0));
  const taxPct = Math.max(0, Number(invoice.taxPercent) || 0);
  const discountAmount = (subtotal * discountPct) / 100;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount = (afterDiscount * taxPct) / 100;
  const grandTotal = afterDiscount + taxAmount;

  const labelX = isThermal ? margin : pageWidth - margin - 65;
  const valX = pageWidth - margin;
  const stepY = isThermal ? 4.2 : 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(Math.max(7, baseFontSize - 0.5));
  doc.setTextColor(40, 40, 40);

  doc.text('Sous-total:', labelX, y);
  doc.text(formatMoneyPdf(subtotal, settings.currency), valX, y, { align: 'right' });
  y += stepY;

  if (discountPct > 0) {
    doc.text(`Remise (${discountPct}%):`, labelX, y);
    doc.text(`-${formatMoneyPdf(discountAmount, settings.currency)}`, valX, y, {
      align: 'right'
    });
    y += stepY;
  }

  if (taxPct > 0) {
    doc.text(`Taxe (${taxPct}%):`, labelX, y);
    doc.text(`+${formatMoneyPdf(taxAmount, settings.currency)}`, valX, y, {
      align: 'right'
    });
    y += stepY;
  }

  doc.setDrawColor(accentR, accentG, accentB);
  doc.setLineWidth(0.4);
  doc.line(labelX, y - 1, valX, y - 1);
  y += isThermal ? 3 : 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(baseFontSize + 1);
  doc.setTextColor(accentR, accentG, accentB);
  doc.text('TOTAL:', labelX, y + 2);
  doc.text(formatMoneyPdf(grandTotal, settings.currency), valX, y + 2, { align: 'right' });
  y += isThermal ? 8 : 10;

  // --- FANAMARIHANA (NOTE) ---
  if (invoice.note) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(Math.max(7, baseFontSize - 1));
    doc.setTextColor(90, 90, 90);
    const noteLines = doc.splitTextToSize(`Note: ${invoice.note}`, contentWidth);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4 + 4;
  }

  // --- FIVOAHANA (CAPACITOR OR WEB) ---
  const safeFileName = `${invoice.number.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`;

  if (Capacitor.isNativePlatform()) {
    const dataUri = doc.output('datauristring');
    const base64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;

    const savedFile = await Filesystem.writeFile({
      path: safeFileName,
      data: base64Data,
      directory: Directory.Cache
    });

    await Share.share({
      title: invoice.number,
      text: `${invoice.number} - ${invoice.clientName}`,
      url: savedFile.uri,
      dialogTitle: 'Partager la facture PDF'
    });
  } else {
    doc.save(safeFileName);
  }
}
