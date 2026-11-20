import React, { useEffect, useState } from 'react';
import { LockKeyhole, UserRound } from 'lucide-react';

interface PatientOption {
  patientId: string;
  name: string;
  needsCode: boolean;
}

interface SignInProps {
  onSignedIn: () => void;
}

/**
 * Prototype sign-in. Patients pick one of the fictional demo patients (and enter their
 * access code when one is configured); pharmacists enter the passcode set on the server.
 * A real deployment needs a real identity provider.
 */
export const SignIn: React.FC<SignInProps> = ({ onSignedIn }) => {
  const [role, setRole] = useState<'patient' | 'pharmacist'>('patient');
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState('');
  const [code, setCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/patients')
      .then((r) => r.json())
      .then((d) => {
        setPatients(d.patients || []);
        if (d.patients?.[0]) setPatientId(d.patients[0].patientId);
      })
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const needsCode = patients.find((p) => p.patientId === patientId)?.needsCode;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(role === 'patient' ? { role, patientId, code } : { role, passcode, name }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error || 'Sign-in failed.');
      else onSignedIn();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
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
              <span className="flex items-center gap-1.5 mb-1"><UserRound className="w-4 h-4" aria-hidden="true" /> Demo patient</span>
              <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className={field}>
                {patients.map((p) => <option key={p.patientId} value={p.patientId}>{p.name}</option>)}
              </select>
            </label>
            {needsCode && (
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Access code
                <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" className={`mt-1 ${field}`} />
              </label>
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
    </div>
  );
};
