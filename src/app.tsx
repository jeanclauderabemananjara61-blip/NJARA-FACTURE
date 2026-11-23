import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileText,
  History,
  Package,
  Pencil,
  Plus,
  Printer,
  Settings as SettingsIcon,
  Trash2,
  Upload,
  Users
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { getT } from './i18n';
import { generateInvoicePdf } from './pdfGenerator';
import { storage } from './storage';
import {
  Client,
  Invoice,
  InvoiceItem,
  InvoiceSettings,
  InvoiceTemplate,
  PaperFormat,
  Product
} from './types';

type Tab = 'order' | 'products' | 'clients' | 'history' | 'settings';

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatMoney(n: number, currency: string): string {
  const rounded = Math.round(n);
  return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${currency}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function padNumber(num: number): string {
  return String(num).padStart(4, '0');
}

export default function App() {
  const [tab, setTab] = useState<Tab>('order');
  const [products, setProducts] = useState<Product[]>(() => storage.getProducts());
  const [clients, setClients] = useState<Client[]>(() => storage.getClients());
  const [invoices, setInvoices] = useState<Invoice[]>(() => storage.getInvoices());
  const [settings, setSettings] = useState<InvoiceSettings>(() => storage.getSettings());

  const t = getT(settings.language);

  useEffect(() => {
    storage.saveProducts(products);
  }, [products]);

  useEffect(() => {
    storage.saveClients(clients);
  }, [clients]);

  useEffect(() => {
    storage.saveInvoices(invoices);
  }, [invoices]);

  useEffect(() => {
    storage.saveSettings(settings);
    document.documentElement.style.setProperty('--primary', settings.accentColor || '#1d4ed8');
  }, [settings]);

  const [prodSearch, setProdSearch] = useState('');
  const [editingProdId, setEditingProdId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodUnit, setProdUnit] = useState('pcs');
  const [prodRef, setProdRef] = useState('');

  const filteredProducts = useMemo(() => {
    const q = prodSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.reference && p.reference.toLowerCase().includes(q))
    );
  }, [products, prodSearch]);

  function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!prodName.trim()) return;
    const priceNum = Number(prodPrice) || 0;
    if (editingProdId) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProdId
            ? {
                ...p,
                name: prodName.trim(),
                price: priceNum,
                unit: prodUnit.trim() || 'pcs',
                reference: prodRef.trim()
              }
            : p
        )
      );
      setEditingProdId(null);
    } else {
      const newProd: Product = {
        id: uid(),
        name: prodName.trim(),
        price: priceNum,
        unit: prodUnit.trim() || 'pcs',
        reference: prodRef.trim(),
        createdAt: Date.now()
      };
      setProducts((prev) => [newProd, ...prev]);
    }
    setProdName('');
    setProdPrice('');
    setProdUnit('pcs');
    setProdRef('');
  }

  function startEditProduct(p: Product) {
    setEditingProdId(p.id);
    setProdName(p.name);
    setProdPrice(String(p.price));
    setProdUnit(p.unit);
    setProdRef(p.reference || '');
  }

  function deleteProduct(id: string) {
    if (!window.confirm(t.deleteConfirm)) return;
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  const [clientSearch, setClientSearch] = useState('');
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cNif, setCNif] = useState('');
  const [cStat, setCStat] = useState('');

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q))
    );
  }, [clients, clientSearch]);

  function handleSaveClient(e: React.FormEvent) {
    e.preventDefault();
    if (!cName.trim()) return;
    if (editingClientId) {
      setClients((prev) =>
        prev.map((c) =>
          c.id === editingClientId
            ? {
                ...c,
                name: cName.trim(),
                phone: cPhone.trim(),
                address: cAddress.trim(),
                nif: cNif.trim(),
                stat: cStat.trim()
              }
            : c
        )
      );
      setEditingClientId(null);
    } else {
      const newClient: Client = {
        id: uid(),
        name: cName.trim(),
        phone: cPhone.trim(),
        address: cAddress.trim(),
        nif: cNif.trim(),
        stat: cStat.trim(),
        createdAt: Date.now()
      };
      setClients((prev) => [newClient, ...prev]);
    }
    setCName('');
    setCPhone('');
    setCAddress('');
    setCNif('');
    setCStat('');
  }

  function startEditClient(c: Client) {
    setEditingClientId(c.id);
    setCName(c.name);
    setCPhone(c.phone || '');
    setCAddress(c.address || '');
    setCNif(c.nif || '');
    setCStat(c.stat || '');
  }

  function deleteClient(id: string) {
    if (!window.confirm(t.deleteConfirm)) return;
    setClients((prev) => prev.filter((c) => c.id !== id));
  }

  const [selectedClientId, setSelectedClientId] = useState('');
  const [manualClientName, setManualClientName] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [selectedProductId, setSelectedProductId] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(() => settings.defaultTaxPercent);
  const [paymentMethod, setPaymentMethod] = useState(() => t.cash);
  const [invoiceTemplate, setInvoiceTemplate] = useState<InvoiceTemplate>(
    () => settings.defaultTemplate
  );
  const [invoiceFontSize, setInvoiceFontSize] = useState(() => settings.fontSize);
  const [invoiceNote, setInvoiceNote] = useState('');
  const [busyPdf, setBusyPdf] = useState(false);

  const selectedClientObj = useMemo(
    () => clients.find((c) => c.id === selectedClientId),
    [clients, selectedClientId]
  );

  function addProductToOrder(productId: string) {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === prod.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === prod.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: uid(),
          productId: prod.id,
          name: prod.name,
          unit: prod.unit,
          quantity: 1,
          unitPrice: prod.price
        }
      ];
    });
    setSelectedProductId('');
  }

  function addCustomItem() {
    setItems((prev) => [
      ...prev,
      { id: uid(), name: '', unit: 'pcs', quantity: 1, unitPrice: 0 }
    ]);
  }

  function updateItem(id: string, patch: Partial<InvoiceItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  const orderSubtotal = useMemo(
    () => items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0),
    [items]
  );
  const orderDiscount = orderSubtotal * ((Number(discountPercent) || 0) / 100);
  const orderAfterDiscount = orderSubtotal - orderDiscount;
  const orderTax = orderAfterDiscount * ((Number(taxPercent) || 0) / 100);
  const orderGrandTotal = orderAfterDiscount + orderTax;

  async function handleCreateAndExportInvoice() {
    const finalClientName = selectedClientObj
      ? selectedClientObj.name
      : manualClientName.trim();
    if (!finalClientName) {
      alert(t.emptyClientError);
      return;
    }
    const validItems = items.filter((i) => i.name.trim() && i.quantity > 0);
    if (validItems.length === 0) {
      alert(t.emptyCartError);
      return;
    }

    const invNumber = `${settings.invoicePrefix}${padNumber(settings.nextInvoiceNumber)}`;
    const newInvoice: Invoice = {
      id: uid(),
      number: invNumber,
      date: invoiceDate || todayIso(),
      clientId: selectedClientObj?.id,
      clientName: finalClientName,
      clientPhone: selectedClientObj?.phone,
      clientAddress: selectedClientObj?.address,
      clientNif: selectedClientObj?.nif,
      clientStat: selectedClientObj?.stat,
      items: validItems,
      discountPercent: Number(discountPercent) || 0,
      taxPercent: Number(taxPercent) || 0,
      paymentMethod,
      note: invoiceNote.trim(),
      template: invoiceTemplate,
      fontSize: invoiceFontSize,
      createdAt: Date.now()
    };

    setInvoices((prev) => [newInvoice, ...prev]);
    setSettings((prev) => ({
      ...prev,
      nextInvoiceNumber: prev.nextInvoiceNumber + 1
    }));

    try {
      setBusyPdf(true);
      await generateInvoicePdf(newInvoice, settings);
      setItems([]);
      setInvoiceNote('');
      setDiscountPercent(0);
    } catch (err) {
      alert(String(err));
    } finally {
      setBusyPdf(false);
    }
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 220;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngData = canvas.toDataURL('image/png');
        setSettings((prev) => ({ ...prev, companyLogo: pngData }));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function handleExportBackup() {
    const json = storage.exportAll();
    const fileName = `njara-facture-backup-${todayIso()}.json`;
    if (Capacitor.isNativePlatform()) {
      const base64 = btoa(unescape(encodeURIComponent(json)));
      const saved = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache
      });
      await Share.share({ title: fileName, url: saved.uri });
    } else {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      alert(t.backupDone);
    }
  }

  function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        storage.importAll(String(reader.result));
        setProducts(storage.getProducts());
        setClients(storage.getClients());
        setInvoices(storage.getInvoices());
        setSettings(storage.getSettings());
        alert(t.restoreDone);
      } catch {
        alert(t.restoreError);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <header className="topbar">
        <h1>{t.appName}</h1>
        <div className="topbar-right">
          <span className="badge-offline">{t.offlineBadge}</span>
          <button
            className="lang-btn"
            onClick={() =>
              setSettings((s) => ({ ...s, language: s.language === 'fr' ? 'mg' : 'fr' }))
            }
          >
            {settings.language.toUpperCase()}
          </button>
        </div>
      </header>

      <main className="container">
        {tab === 'order' && (
          <>
            <div className="card">
              <h2>
                {t.newInvoiceTitle} ({settings.invoicePrefix}
                {padNumber(settings.nextInvoiceNumber)})
              </h2>

              <div className="row-2">
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>{t.paymentMethod}</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value={t.cash}>{t.cash}</option>
                    <option value={t.mobileMoney}>{t.mobileMoney}</option>
                    <option value={t.bankTransfer}>{t.bankTransfer}</option>
                    <option value={t.credit}>{t.credit}</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>{t.selectClient}</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => {
                    setSelectedClientId(e.target.value);
                    if (e.target.value) setManualClientName('');
                  }}
                >
                  <option value="">{t.clientPlaceholder}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {!selectedClientId && (
                <div className="field">
                  <label>{t.orWalkIn}</label>
                  <input
                    type="text"
                    placeholder="Ex: Rakoto / Client comptoir"
                    value={manualClientName}
                    onChange={(e) => setManualClientName(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="card">
              <div className="field">
                <label>{t.addItemFromList}</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => addProductToOrder(e.target.value)}
                >
                  <option value="">{t.selectProductPlaceholder}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatMoney(p.price, settings.currency)} / {p.unit}
                    </option>
