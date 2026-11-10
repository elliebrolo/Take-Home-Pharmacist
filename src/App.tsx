import React, { useState } from 'react';
import { Header } from './components/Header';
import { PatientPortal } from './components/PatientPortal';
import { PharmacistPortal } from './components/PharmacistPortal';
import { EmergencyModal } from './components/EmergencyModal';
import { DEFAULT_CONSULTATIONS } from './data/defaultConsultations';
import { ConsultationRecord, EmergencyTriageResult } from './types/pharmacy';

export default function App() {
  const [currentView, setCurrentView] = useState<'patient' | 'pharmacist'>('patient');
  const [consultation, setConsultation] = useState<ConsultationRecord>(DEFAULT_CONSULTATIONS[0]);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [emergencyTriageData, setEmergencyTriageData] = useState<EmergencyTriageResult | null>(null);

  const handleOpenEmergencyModal = (triage?: EmergencyTriageResult) => {
    setEmergencyTriageData(triage || null);
    setIsEmergencyModalOpen(true);
  };

  const handleCloseEmergencyModal = () => {
    setIsEmergencyModalOpen(false);
    setEmergencyTriageData(null);
  };

  const handleSaveConsultation = (updated: ConsultationRecord) => {
    setConsultation(updated);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-teal-500 selection:text-white">
      {/* 3-Zone Top Navigation Contract */}
      <Header
        currentView={currentView}
        onToggleView={() => setCurrentView((prev) => (prev === 'patient' ? 'pharmacist' : 'patient'))}
        onOpenEmergencyModal={() => handleOpenEmergencyModal()}
      />

      {/* Main Viewport Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'patient' ? (
          <PatientPortal
            consultation={consultation}
            onOpenEmergencyModal={handleOpenEmergencyModal}
            onSwitchToPharmacistView={() => setCurrentView('pharmacist')}
          />
        ) : (
          <PharmacistPortal
            currentConsultation={consultation}
            onSaveConsultation={handleSaveConsultation}
            onSwitchToPatientView={() => setCurrentView('patient')}
          />
        )}
      </main>

      {/* Emergency & Urgent Care Triage Modal */}
      <EmergencyModal
        isOpen={isEmergencyModalOpen}
        onClose={handleCloseEmergencyModal}
        triageData={emergencyTriageData}
        patientName={consultation.patientName}
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 dark:text-slate-300">ScriptCare AI</span>
            <span>·</span>
            <span>Clinical Pharmacy Consultation & Patient Adherence System</span>
          </div>

          <p className="text-center sm:text-right text-slate-400">
            Clinical Safety Protocol Active · For life-threatening emergencies, call 911 immediately.
          </p>
        </div>
      </footer>
    </div>
  );
}
