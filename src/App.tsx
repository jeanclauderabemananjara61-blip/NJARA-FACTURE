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
type PaymentKey = 'cash' | 'mobile_money' | 'bank_transfer' | 'credit';

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
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

function toSafeNumber(val: string, fallback = 0): number {
  if (val.trim() === '') return fallback;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  // --- PRODUCTS ---
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
    const priceNum = Math.max(0, Number(prodPrice) || 0);
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

  // --- CLIENTS ---
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

  // --- ORDER / INVOICE ---
  const [selectedClientId, setSelectedClientId] = useState('');
  const [manualClientName, setManualClientName] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [selectedProductId, setSelectedProductId] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(() => settings.defaultTaxPercent);
  const [paymentKey, setPaymentKey] = useState<PaymentKey>('cash');
  const [invoiceTemplate, setInvoiceTemplate] = useState<InvoiceTemplate>(
    () => settings.defaultTemplate
  );
  const [invoiceFontSize, setInvoiceFontSize] = useState(() => settings.fontSize);
  const [invoiceNote, setInvoiceNote] = useState('');
  const [busyPdf, setBusyPdf] = useState(false);
  const [reprintingId, setReprintingId] = useState<string | null>(null);

  useEffect(() => {
    setTaxPercent(settings.defaultTaxPercent);
  }, [settings.defaultTaxPercent]);

  useEffect(() => {
    setInvoiceTemplate(settings.defaultTemplate);
  }, [settings.defaultTemplate]);

  useEffect(() => {
    setInvoiceFontSize(settings.fontSize);
  }, [settings.fontSize]);

  function getPaymentLabel(key: PaymentKey): string {
    switch (key) {
      case 'mobile_money':
        return t.mobileMoney;
      case 'bank_transfer':
        return t.bankTransfer;
      case 'credit':
        return t.credit;
      default:
        return t.cash;
    }
  }

  const selectedClientObj = useMemo(
    () => clients.find((c) => c.id === selectedClientId),
    [clients, selectedClientId]
  );

  function addProductToOrder(productId: string) {
    if (!productId) return;
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
    () =>
      items.reduce((s, it) => {
        const qty = Math.max(0, Number(it.quantity) || 0);
        const price = Math.max(0, Number(it.unitPrice) || 0);
        return s + qty * price;
      }, 0),
    [items]
  );
  const safeDiscountPct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const safeTaxPct = Math.max(0, Number(taxPercent) || 0);
  const orderDiscount = (orderSubtotal * safeDiscountPct) / 100;
  const orderAfterDiscount = Math.max(0, orderSubtotal - orderDiscount);
  const orderTax = (orderAfterDiscount * safeTaxPct) / 100;
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
      discountPercent: safeDiscountPct,
      taxPercent: safeTaxPct,
      paymentMethod: getPaymentLabel(paymentKey),
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
      setManualClientName('');
      setSelectedClientId('');
    } catch (err) {
      alert(String(err));
    } finally {
      setBusyPdf(false);
    }
  }

  // --- HISTORY ---
  const [historySearch, setHistorySearch] = useState('');

  const filteredInvoices = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(
      (inv) =>
        inv.number.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q)
    );
  }, [invoices, historySearch]);

  async function handleReprintInvoice(inv: Invoice) {
    try {
      setReprintingId(inv.id);
      await generateInvoicePdf(inv, settings);
    } catch (err) {
      alert(String(err));
    } finally {
      setReprintingId(null);
    }
  }

  function deleteInvoice(id: string) {
    if (!window.confirm(t.deleteConfirm)) return;
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
  }

  // --- LOGO & BACKUP ---
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
    e.target.value = '';
  }

  async function handleExportBackup() {
    try {
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
    } catch (err) {
      alert(String(err));
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
    e.target.value = '';
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>{t.appName}</h1>
        <div className="topbar-right">
          <span className="badge-offline">{t.offlineBadge}</span>
          <button
            type="button"
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
                    value={paymentKey}
                    onChange={(e) => setPaymentKey(e.target.value as PaymentKey)}
                  >
                    <option value="cash">{t.cash}</option>
                    <option value="mobile_money">{t.mobileMoney}</option>
                    <option value="bank_transfer">{t.bankTransfer}</option>
                    <option value="credit">{t.credit}</option>
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
                  ))}
                </select>
              </div>

              <div className="field-actions">
                <button type="button" className="btn-secondary" onClick={addCustomItem}>
                  <Plus size={16} />
                  {t.addCustomItem}
                </button>
              </div>

              {items.length > 0 && (
                <div className="items-list">
                  {items.map((item) => {
                    const lineTotal =
                      Math.max(0, Number(item.quantity) || 0) *
                      Math.max(0, Number(item.unitPrice) || 0);
                    return (
                      <div key={item.id} className="item-row">
                        <input
                          type="text"
                          placeholder={t.itemNamePlaceholder}
                          value={item.name}
                          onChange={(e) => updateItem(item.id, { name: e.target.value })}
                        />
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(item.id, {
                              quantity: toSafeNumber(e.target.value, 0)
                            })
                          }
                        />
                        <input
                          type="text"
                          placeholder="pcs"
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                        />
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItem(item.id, {
                              unitPrice: toSafeNumber(e.target.value, 0)
                            })
                          }
                        />
                        <span className="line-total">
                          {formatMoney(lineTotal, settings.currency)}
                        </span>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="row-2">
                <div className="field">
                  <label>{t.discountPercent} (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={discountPercent}
                    onChange={(e) =>
                      setDiscountPercent(
                        Math.min(100, Math.max(0, toSafeNumber(e.target.value, 0)))
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label>{t.taxPercent} (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={taxPercent}
                    onChange={(e) =>
                      setTaxPercent(Math.max(0, toSafeNumber(e.target.value, 0)))
                    }
                  />
                </div>
              </div>

              <div className="row-2">
                <div className="field">
                  <label>{t.template}</label>
                  <select
                    value={invoiceTemplate}
                    onChange={(e) => setInvoiceTemplate(e.target.value as InvoiceTemplate)}
                  >
                    <option value="classic">{t.templateClassic}</option>
                    <option value="modern">{t.templateModern}</option>
                    <option value="compact">{t.templateCompact}</option>
                  </select>
                </div>
                <div className="field">
                  <label>{t.fontSize}</label>
                  <input
                    type="number"
                    min="8"
                    max="18"
                    value={invoiceFontSize}
                    onChange={(e) =>
                      setInvoiceFontSize(
                        Math.min(18, Math.max(8, toSafeNumber(e.target.value, 11)))
                      )
                    }
                  />
                </div>
              </div>

              <div className="field">
                <label>{t.note}</label>
                <textarea
                  rows={2}
                  value={invoiceNote}
                  onChange={(e) => setInvoiceNote(e.target.value)}
                />
              </div>

              <div className="totals-box">
                <div>
                  <span>{t.subtotal}</span>
                  <strong>{formatMoney(orderSubtotal, settings.currency)}</strong>
                </div>
                {safeDiscountPct > 0 && (
                  <div>
                    <span>
                      {t.discount} ({safeDiscountPct}%)
                    </span>
                    <strong>-{formatMoney(orderDiscount, settings.currency)}</strong>
                  </div>
                )}
                {safeTaxPct > 0 && (
                  <div>
                    <span>
                      {t.tax} ({safeTaxPct}%)
                    </span>
                    <strong>+{formatMoney(orderTax, settings.currency)}</strong>
                  </div>
                )}
                <div className="grand-total">
                  <span>{t.total}</span>
                  <strong>{formatMoney(orderGrandTotal, settings.currency)}</strong>
                </div>
              </div>

              <button
                type="button"
                className="btn-primary"
                disabled={busyPdf}
                onClick={handleCreateAndExportInvoice}
              >
                <Download size={18} />
                {busyPdf ? t.generatingPdf : t.createAndExportPdf}
              </button>
            </div>
          </>
        )}

        {tab === 'products' && (
          <>
            <form className="card" onSubmit={handleSaveProduct}>
              <h2>{editingProdId ? t.editProduct : t.addProduct}</h2>
              <div className="field">
                <label>{t.productName}</label>
                <input
                  type="text"
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                />
              </div>
              <div className="row-2">
                <div className="field">
                  <label>{t.price}</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>{t.unit}</label>
                  <input
                    type="text"
                    value={prodUnit}
                    onChange={(e) => setProdUnit(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label>{t.reference}</label>
                <input
                  type="text"
                  value={prodRef}
                  onChange={(e) => setProdRef(e.target.value)}
                />
              </div>
              <div className="field-actions">
                <button type="submit" className="btn-primary">
                  {t.save}
                </button>
                {editingProdId && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setEditingProdId(null);
                      setProdName('');
                      setProdPrice('');
                      setProdUnit('pcs');
                      setProdRef('');
                    }}
                  >
                    {t.cancel}
                  </button>
                )}
              </div>
            </form>

            <div className="card">
              <input
                type="search"
                placeholder={t.searchPlaceholder}
                value={prodSearch}
                onChange={(e) => setProdSearch(e.target.value)}
              />
              <div className="list">
                {filteredProducts.map((p) => (
                  <div key={p.id} className="list-item">
                    <div>
                      <strong>{p.name}</strong>
                      {p.reference ? <small> — {p.reference}</small> : null}
                      <div>
                        {formatMoney(p.price, settings.currency)} / {p.unit}
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => startEditProduct(p)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => deleteProduct(p.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'clients' && (
          <>
            <form className="card" onSubmit={handleSaveClient}>
              <h2>{editingClientId ? t.editClient : t.addClient}</h2>
              <div className="field">
                <label>{t.clientName}</label>
                <input
                  type="text"
                  required
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                />
              </div>
              <div className="row-2">
                <div className="field">
                  <label>{t.phone}</label>
                  <input
                    type="tel"
                    value={cPhone}
                    onChange={(e) => setCPhone(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>{t.address}</label>
                  <input
                    type="text"
                    value={cAddress}
                    onChange={(e) => setCAddress(e.target.value)}
                  />
                </div>
              </div>
              <div className="row-2">
                <div className="field">
                  <label>NIF</label>
                  <input
                    type="text"
                    value={cNif}
                    onChange={(e) => setCNif(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>STAT</label>
                  <input
                    type="text"
                    value={cStat}
                    onChange={(e) => setCStat(e.target.value)}
                  />
                </div>
              </div>
              <div className="field-actions">
                <button type="submit" className="btn-primary">
                  {t.save}
                </button>
                {editingClientId && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setEditingClientId(null);
                      setCName('');
                      setCPhone('');
                      setCAddress('');
                      setCNif('');
                      setCStat('');
                    }}
                  >
                    {t.cancel}
                  </button>
                )}
              </div>
            </form>

            <div className="card">
              <input
                type="search"
                placeholder={t.searchPlaceholder}
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
              <div className="list">
                {filteredClients.map((c) => (
                  <div key={c.id} className="list-item">
                    <div>
                      <strong>{c.name}</strong>
                      {c.phone ? <div>{c.phone}</div> : null}
                      {c.address ? <small>{c.address}</small> : null}
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => startEditClient(c)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => deleteClient(c.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'history' && (
          <div className="card">
            <h2>{t.historyTitle}</h2>
            <input
              type="search"
              placeholder={t.searchPlaceholder}
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
            <div className="list">
              {filteredInvoices.map((inv) => {
                const sub = inv.items.reduce(
                  (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
                  0
                );
                const disc = sub * ((Number(inv.discountPercent) || 0) / 100);
                const afterDisc = Math.max(0, sub - disc);
                const tax = afterDisc * ((Number(inv.taxPercent) || 0) / 100);
                const total = afterDisc + tax;

                return (
                  <div key={inv.id} className="list-item">
                    <div>
                      <strong>{inv.number}</strong> — {inv.clientName}
                      <div>
                        <small>
                          {inv.date} • {formatMoney(total, settings.currency)}
                        </small>
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={reprintingId === inv.id}
                        onClick={() => handleReprintInvoice(inv)}
                      >
                        <Printer size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => deleteInvoice(inv.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="card">
            <h2>{t.settingsTitle}</h2>

            <div className="field">
              <label>{t.companyName}</label>
              <input
                type="text"
                value={settings.companyName || ''}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, companyName: e.target.value }))
                }
              />
            </div>

            <div className="row-2">
              <div className="field">
                <label>{t.currency}</label>
                <input
                  type="text"
                  value={settings.currency}
                  onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>{t.paperFormat}</label>
                <select
                  value={settings.paperFormat}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      paperFormat: e.target.value as PaperFormat
                    }))
                  }
                >
                  <option value="a4">A4</option>
                  <option value="a5">A5</option>
                  <option value="thermal80">Thermal 80mm</option>
                </select>
              </div>
            </div>

            <div className="row-2">
              <div className="field">
                <label>{t.invoicePrefix}</label>
                <input
                  type="text"
                  value={settings.invoicePrefix}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, invoicePrefix: e.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label>{t.nextInvoiceNumber}</label>
                <input
                  type="number"
                  min="1"
                  value={settings.nextInvoiceNumber}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      nextInvoiceNumber: Math.max(1, toSafeNumber(e.target.value, 1))
                    }))
                  }
                />
              </div>
            </div>

            <div className="row-2">
              <div className="field">
                <label>{t.defaultTaxPercent} (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.defaultTaxPercent}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      defaultTaxPercent: Math.max(0, toSafeNumber(e.target.value, 0))
                    }))
                  }
                />
              </div>
              <div className="field">
                <label>{t.accentColor}</label>
                <input
                  type="color"
                  value={settings.accentColor || '#1d4ed8'}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, accentColor: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="field">
              <label>{t.companyLogo}</label>
              <input type="file" accept="image/*" onChange={handleLogoUpload} />
              {settings.companyLogo && (
                <img
                  src={settings.companyLogo}
                  alt="Logo"
                  className="logo-preview"
                />
              )}
            </div>

            <div className="field-actions">
              <button type="button" className="btn-secondary" onClick={handleExportBackup}>
                <Download size={16} />
                {t.exportBackup}
              </button>
              <label className="btn-secondary file-btn">
                <Upload size={16} />
                {t.importBackup}
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportBackup}
                  hidden
                />
              </label>
            </div>
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <button
          type="button"
          className={tab === 'order' ? 'active' : ''}
          onClick={() => setTab('order')}
        >
          <FileText size={18} />
          <span>{t.tabOrder}</span>
        </button>
        <button
          type="button"
          className={tab === 'products' ? 'active' : ''}
          onClick={() => setTab('products')}
        >
          <Package size={18} />
          <span>{t.tabProducts}</span>
        </button>
        <button
          type="button"
          className={tab === 'clients' ? 'active' : ''}
          onClick={() => setTab('clients')}
        >
          <Users size={18} />
          <span>{t.tabClients}</span>
        </button>
        <button
          type="button"
          className={tab === 'history' ? 'active' : ''}
          onClick={() => setTab('history')}
        >
          <History size={18} />
          <span>{t.tabHistory}</span>
        </button>
        <button
          type="button"
          className={tab === 'settings' ? 'active' : ''}
          onClick={() => setTab('settings')}
        >
          <SettingsIcon size={18} />
          <span>{t.tabSettings}</span>
        </button>
      </nav>
    </div>
  );
}
