import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Printer, QrCode, XCircle } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface LinkRow {
  id: number;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  status: 'active' | 'used' | 'expired' | 'revoked';
}
interface Fresh {
  code: string;
  url: string;
  expiresAt: string;
  qr: string; // data URL
}

const STATUS: Record<LinkRow['status'], string> = { active: 'Not used yet', used: 'Used', expired: 'Expired', revoked: 'Revoked' };

/**
 * Pharmacist: give an approved patient access to their own plan. The code is shown once, as a QR code to scan and
 * as text to type. It works one time, until it expires, and can be revoked while unused.
 */
export const PatientAccessPanel: React.FC<{ patientId: string; patientName: string; pharmacyName: string; approved: boolean }> = ({ patientId, patientName, pharmacyName, approved }) => {
  const [hours, setHours] = useState(72);
  const [fresh, setFresh] = useState<Fresh | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadLinks = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/patients/${encodeURIComponent(patientId)}/access-links`);
      const d = await r.json();
      if (r.ok) setLinks(d.links);
    } catch { /* the list is a convenience */ }
  }, [patientId]);

  useEffect(() => {
    setFresh(null); // a code belongs to one patient: never carry it over when the pharmacist switches
    setMsg(null);
    setCopied(false);
    if (approved) loadLinks();
    else setLinks([]);
  }, [patientId, approved, loadLinks]);

  const create = async () => {
    setBusy(true);
    setMsg(null);
    setCopied(false);
    try {
      const r = await apiFetch(`/api/patients/${encodeURIComponent(patientId)}/access-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not create the link.');
      const QRCode = (await import('qrcode')).default; // loaded only when needed
      const qr = await QRCode.toDataURL(d.url, { errorCorrectionLevel: 'M', margin: 2, width: 280 });
      setFresh({ code: d.code, url: d.url, expiresAt: d.expiresAt, qr });
      loadLinks();
    } catch (e: any) {
      setMsg(e.message || 'Could not create the link.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: number) => {
    const r = await apiFetch(`/api/access-links/${id}`, { method: 'DELETE' });
    if (!r.ok) setMsg('That link could not be revoked. It may already have been used.');
    loadLinks();
  };

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.url);
      setCopied(true);
    } catch {
      setMsg('Could not copy. Select the link and copy it by hand.');
    }
  };

  const print = () => {
    document.body.classList.add('printing-access');
    window.print();
    document.body.classList.remove('printing-access');
  };

  const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <section aria-labelledby="access-heading" className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
      <h2 id="access-heading" className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
        <QrCode className="w-5 h-5 text-teal-700" aria-hidden="true" /> Patient access (QR code)
      </h2>

      {!approved ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Approve and publish this plan first. A patient can only be given access to an approved plan.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Give {patientName} access to their own plan. The code is shown only once and works one time. Anyone who has it can open this patient's medicine plan until it is used or expires, so hand it only to the patient or their caregiver.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Valid for
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mt-1 block min-h-11 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg">
                <option value={24}>24 hours</option>
                <option value={72}>3 days</option>
                <option value={168}>7 days</option>
              </select>
            </label>
            <button type="button" onClick={create} disabled={busy} className="min-h-11 px-4 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-lg">
              {busy ? 'Creating…' : 'Create access code'}
            </button>
          </div>
          {msg && <p role="alert" className="mt-2 text-sm font-semibold text-rose-700 dark:text-rose-300">{msg}</p>}

          {fresh && (
            <div className="mt-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              <div id="access-print" className="flex flex-col sm:flex-row items-center gap-4">
                <img src={fresh.qr} alt={`QR code that opens ${patientName}'s medicine plan`} width={200} height={200} className="bg-white" />
                <div className="space-y-2 text-center sm:text-left">
                  <p className="text-sm text-slate-700 dark:text-slate-200"><strong>{patientName}</strong>: your medicine plan from {pharmacyName}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">Scan with your phone camera, or type this code at the sign-in page:</p>
                  <p className="font-mono text-lg font-bold tracking-wider text-slate-900 dark:text-slate-100 break-all" aria-label="Access code">{fresh.code}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">Works once. Expires {when(fresh.expiresAt)}. If it stops working, ask {pharmacyName} for a new one.</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={copy} className="min-h-11 px-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-semibold flex items-center gap-1.5">
                  <Copy className="w-4 h-4" aria-hidden="true" /> {copied ? 'Link copied' : 'Copy link'}
                </button>
                <button type="button" onClick={print} className="min-h-11 px-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-semibold flex items-center gap-1.5">
                  <Printer className="w-4 h-4" aria-hidden="true" /> Print
                </button>
              </div>
            </div>
          )}

          {links.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Recent codes</h3>
              <ul className="mt-1 divide-y divide-slate-200 dark:divide-slate-700">
                {links.map((l) => (
                  <li key={l.id} className="py-2 flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-semibold">{STATUS[l.status]}</span>
                    <span className="text-slate-500">
                      created {when(l.createdAt)} by {l.createdBy}
                      {l.status === 'used' && l.usedAt ? `, used ${when(l.usedAt)}` : l.status === 'active' ? `, expires ${when(l.expiresAt)}` : ''}
                    </span>
                    {l.status === 'active' && (
                      <button type="button" onClick={() => revoke(l.id)} className="ml-auto min-h-11 px-3 text-rose-800 dark:text-rose-300 font-semibold flex items-center gap-1">
                        <XCircle className="w-4 h-4" aria-hidden="true" /> Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
};
