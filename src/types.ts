export type Language = 'fr' | 'mg';
export type InvoiceTemplate = 'classic' | 'modern' | 'minimal' | 'ticket';
export type PaperFormat = 'a4' | 'a5' | 'ticket80' | 'ticket58';

export interface Product {
  id: string;
  name: string;
  price: number;
  unit: string;
  reference?: string;
  createdAt: number;
}

export interface Client {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  nif?: string;
  stat?: string;
  createdAt: number;
}

export interface InvoiceItem {
  id: string;
  productId?: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  number: string;
  date: string;
  clientId?: string;
  clientName: string;
  clientPhone?: string;
  clientAddress?: string;
  clientNif?: string;
  clientStat?: string;
  items: InvoiceItem[];
  discountPercent: number;
  taxPercent: number;
  paymentMethod: string;
  note?: string;
  template: InvoiceTemplate;
  fontSize: number;
  createdAt: number;
}

export interface InvoiceSettings {
  language: Language;
  companyName: string;
  companySubtitle: string;
  companyLogo: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyNif: string;
  companyStat: string;
  companyRcs: string;
  currency: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  defaultTemplate: InvoiceTemplate;
  paperFormat: PaperFormat;
  fontSize: number;
  accentColor: string;
  defaultTaxPercent: number;
  showLogo: boolean;
  showNifStat: boolean;
  showClientDetails: boolean;
  showUnitColumn: boolean;
  showDiscount: boolean;
  showTax: boolean;
  showPaymentMethod: boolean;
  showSignatureBox: boolean;
  headerNote: string;
  footerNote: string;
}
