import React, { useEffect, useState } from 'react';
import { KeyRound, LockKeyhole, UserRound } from 'lucide-react';
import { apiFetch, clientKind, isNativeApp, parseAccessInput, rememberSession, savedServerUrl, setServerUrl } from '../utils/api';

interface PatientOption {
  patientId: string;
  name: string;
  needsCode: boolean;
}

interface SignInProps {
  onSignedIn: () => void;
  /** Shown above the form, for example when a scanned link did not work. */
  notice?: string | null;
}

/**
 * Sign-in.
 *  - Patients normally arrive by scanning the QR code from their pharmacy, which signs them in directly. If that
 *    cannot be scanned, they can paste or type the code printed under it.
 *  - Demo mode also lists the fictional patients so the prototype can be tried without a QR code.
 *  - Pharmacists enter the passcode set on the server.
 * A real deployment needs a real identity provider.
 */
export const SignIn: React.FC<SignInProps> = ({ onSignedIn, notice }) => {
  const [role, setRole] = useState<'patient' | 'pharmacist'>('patient');
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [patientId, setPatientId] = useState('');
  const [code, setCode] = useState('');
  const [accessInput, setAccessInput] = useState('');
  const [passcode, setPasscode] = useState('');
  const [name, setName] = useState('');
  const [server, setServer] = useState(savedServerUrl());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setListLoaded(false);
    apiFetch('/api/auth/patients')
      .then((r) => r.json())
      .then((d) => {
        setPatients(d.patients || []);
        if (d.patients?.[0]) setPatientId(d.patients[0].patientId);
      })
      .catch(() => setError('Could not reach the server.'))
      .finally(() => setListLoaded(true));
  }, [server]);

  const showDemoPicker = patients.length > 0;
  const needsCode = patients.find((p) => p.patientId === patientId)?.needsCode;
  const post = async (path: string, body: object) => {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, client: clientKind() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error || 'Sign-in failed.');
      else {
        rememberSession(d);
        onSignedIn();
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (role === 'pharmacist') return post('/api/auth/login', { role, passcode, name });
    // A patient with a code from their pharmacy
    if (accessInput.trim()) {
      const parsed = parseAccessInput(accessInput);
      if (!parsed) return setError('That code does not look right. It has 20 letters and numbers, in groups of four.');
      return post('/api/auth/redeem', { code: parsed });
    }
    if (!showDemoPicker) return setError('Enter the access code from your pharmacy.');
    return post('/api/auth/login', { role, patientId, code });
  };

  const saveServer = (value: string) => {
    if (!setServerUrl(value)) return setError('Enter an address starting with https://');
    setError(null);
    setServer(value.trim());
  };

  const field = 'w-full min-h-11 px-3 py-2 text-base bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100';

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <LockKeyhole className="w-5 h-5 text-teal-700" aria-hidden="true" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Sign in</h1>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
        Prototype with fictional demo patients. Your account decides what you can see.
      </p>
      {notice && <p role="alert" className="mb-4 text-sm font-semibold text-rose-700 dark:text-rose-300">{notice}</p>}

      <div role="tablist" aria-label="Who are you?" className="grid grid-cols-2 gap-2 mb-4">
        {(['patient', 'pharmacist'] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={role === r}
            onClick={() => { setRole(r); setError(null); }}
            className={`min-h-11 rounded-lg font-semibold border ${role === r ? 'bg-teal-700 text-white border-teal-700' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700'}`}
          >
            I am a {r}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {role === 'patient' ? (
          <>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span className="flex items-center gap-1.5 mb-1"><KeyRound className="w-4 h-4" aria-hidden="true" /> Access code from your pharmacy</span>
              <input
                type="text"
                value={accessInput}
                onChange={(e) => setAccessInput(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                className={`mt-0 ${field}`}
              />
              <span className="block mt-1 text-xs font-normal text-slate-600 dark:text-slate-300">
                Scan the QR code on your take-home sheet with your phone camera. If you cannot, type or paste the code printed under it.
              </span>
            </label>
            {showDemoPicker && (
              <fieldset className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
                <legend className="text-xs font-bold uppercase tracking-wide text-slate-500 pr-2">Demo only</legend>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span className="flex items-center gap-1.5 mb-1"><UserRound className="w-4 h-4" aria-hidden="true" /> Demo patient</span>
                  <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className={field}>
                    {patients.map((p) => <option key={p.patientId} value={p.patientId}>{p.name}</option>)}
                  </select>
                </label>
                {needsCode && (
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Demo patient code
                    <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" className={`mt-1 ${field}`} />
                  </label>
                )}
              </fieldset>
            )}
            {listLoaded && !showDemoPicker && !error && (
              <p className="text-xs text-slate-600 dark:text-slate-300">Your pharmacy gives you the code when your medicine plan is ready.</p>
            )}
          </>
        ) : (
          <>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Your name (recorded when you approve a plan)
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`mt-1 ${field}`} />
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Pharmacist passcode
              <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} className={`mt-1 ${field}`} />
            </label>
          </>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>}
        <button type="submit" disabled={busy} className="w-full min-h-11 bg-slate-900 dark:bg-teal-600 text-white font-bold rounded-lg disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {isNativeApp() && (
        <details className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          <summary className="cursor-pointer min-h-11 flex items-center font-semibold">Server address (testing only)</summary>
          <label className="block mt-1">
            <span className="sr-only">Server address</span>
            <input
              type="url"
              defaultValue={server}
              placeholder="https://your-service.run.app"
              onBlur={(e) => saveServer(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              className={field}
            />
          </label>
          <p className="mt-1 text-xs">Leave empty to use the address this app was built with.</p>
        </details>
      )}
    </div>
  );
};
