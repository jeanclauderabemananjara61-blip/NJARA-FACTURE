import { Client, Invoice, InvoiceSettings, Product } from './types';

const KEYS = {
  PRODUCTS: 'njara_products_v1',
  CLIENTS: 'njara_clients_v1',
  INVOICES: 'njara_invoices_v1',
  SETTINGS: 'njara_settings_v1'
};

export const defaultSettings: InvoiceSettings = {
  language: 'fr',
  companyName: 'NJARA FACTURE',
  companySubtitle: '',
  companyLogo: '',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  companyNif: '',
  companyStat: '',
  companyRcs: '',
  currency: 'Ar',
  invoicePrefix: 'FAC-',
  nextInvoiceNumber: 1,
  defaultTemplate: 'classic',
  paperFormat: 'a4',
  fontSize: 10,
  accentColor: '#1d4ed8',
  defaultTaxPercent: 0,
  showLogo: true,
  showNifStat: true,
  showClientDetails: true,
  showUnitColumn: true,
  showDiscount: true,
  showTax: false,
  showPaymentMethod: true,
  showSignatureBox: true,
  headerNote: '',
  footerNote: 'Merci pour votre confiance !'
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const storage = {
  getProducts: (): Product[] => readJson<Product[]>(KEYS.PRODUCTS, []),
  saveProducts: (items: Product[]) => localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(items)),

  getClients: (): Client[] => readJson<Client[]>(KEYS.CLIENTS, []),
  saveClients: (items: Client[]) => localStorage.setItem(KEYS.CLIENTS, JSON.stringify(items)),

  getInvoices: (): Invoice[] => readJson<Invoice[]>(KEYS.INVOICES, []),
  saveInvoices: (items: Invoice[]) => localStorage.setItem(KEYS.INVOICES, JSON.stringify(items)),

  getSettings: (): InvoiceSettings => ({
    ...defaultSettings,
    ...readJson<Partial<InvoiceSettings>>(KEYS.SETTINGS, {})
  }),
  saveSettings: (settings: InvoiceSettings) =>
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings)),

  exportAll: () =>
    JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        products: storage.getProducts(),
        clients: storage.getClients(),
        invoices: storage.getInvoices(),
        settings: storage.getSettings()
      },
      null,
      2
    ),

  importAll: (jsonText: string) => {
    const data = JSON.parse(jsonText);
    if (Array.isArray(data.products)) storage.saveProducts(data.products);
    if (Array.isArray(data.clients)) storage.saveClients(data.clients);
    if (Array.isArray(data.invoices)) storage.saveInvoices(data.invoices);
    if (data.settings && typeof data.settings === 'object') {
      storage.saveSettings({ ...defaultSettings, ...data.settings });
    }
  }
};
