import React, { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { PatientPortal } from './components/PatientPortal';
import { PharmacistPortal } from './components/PharmacistPortal';
import { EmergencyModal } from './components/EmergencyModal';
import { SignIn } from './components/SignIn';
import { ConsultationRecord, EmergencyTriageResult } from './types/pharmacy';

type Session = { role: 'patient' | 'pharmacist'; sub: string } | null;

export default function App() {
  const [session, setSession] = useState<Session | undefined>(undefined); // undefined = still checking
  const [consultation, setConsultation] = useState<ConsultationRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [emergencyTriageData, setEmergencyTriageData] = useState<EmergencyTriageResult | null>(null);

  // The server decides who you are and what you may see; the browser never chooses a patient.
  const refresh = useCallback(async () => {
    try {
      const me = await (await fetch('/api/auth/me')).json();
      setSession(me.session);
      setConsultation(null);
      setLoadError(null);
      if (me.session?.role === 'patient') {
        const r = await fetch('/api/me/consultation');
        const d = await r.json();
        if (r.ok) setConsultation(d.consultation);
        else setLoadError(d.error || 'Could not load your plan.');
      }
    } catch {
      setSession(null);
      setLoadError('Could not reach the server.');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    refresh();
  };

  const handleOpenEmergencyModal = (triage?: EmergencyTriageResult) => {
    setEmergencyTriageData(triage || null);
    setIsEmergencyModalOpen(true);
  };

  const handleCloseEmergencyModal = () => {
    setIsEmergencyModalOpen(false);
    setEmergencyTriageData(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-teal-500 selection:text-white">
      <Header
        role={session?.role ?? null}
        userLabel={session?.sub}
        onSignOut={signOut}
        onOpenEmergencyModal={() => handleOpenEmergencyModal()}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {session === undefined ? (
          <p className="text-slate-600 dark:text-slate-300">Loading…</p>
        ) : !session ? (
          <SignIn onSignedIn={refresh} />
        ) : session.role === 'patient' ? (
          consultation ? (
            <PatientPortal consultation={consultation} onOpenEmergencyModal={handleOpenEmergencyModal} />
          ) : (
            <p role="alert" className="text-slate-700 dark:text-slate-200">{loadError || 'Loading your plan…'}</p>
          )
        ) : (
          <PharmacistPortal pharmacistName={session.sub} />
        )}
      </main>

      <EmergencyModal
        isOpen={isEmergencyModalOpen}
        onClose={handleCloseEmergencyModal}
        triageData={emergencyTriageData}
        patientName={consultation?.patientName}
        pharmacyName={consultation?.pharmacyName}
        pharmacyPhone={consultation?.pharmacyPhone}
      />

      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 dark:text-slate-300">TakeHomePharmacist</span>
            <span>·</span>
            <span>Prototype with fictional demo patients. Not medical advice.</span>
          </div>
          <p className="text-center sm:text-right text-slate-500">For life-threatening emergencies, call 911 immediately.</p>
        </div>
      </footer>
    </div>
  );
}
