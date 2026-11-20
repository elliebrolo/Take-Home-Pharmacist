import React from 'react';
import { AlertTriangle, Phone, MapPin, Clock, ShieldAlert, X, HeartPulse } from 'lucide-react';
import { EmergencyTriageResult } from '../types/pharmacy';

interface EmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  triageData?: EmergencyTriageResult | null;
  patientName?: string;
  pharmacyName?: string;
  pharmacyPhone?: string;
}

export const EmergencyModal: React.FC<EmergencyModalProps> = ({
  isOpen,
  onClose,
  triageData,
  patientName = 'Patient',
  pharmacyName,
  pharmacyPhone,
}) => {
  if (!isOpen) return null;

  const severity = triageData?.severity || 'urgent_care';
  const is911 = severity === 'emergency_911';

  // Real numbers only. There is no clinic directory behind this app, so no clinics are listed.
  const defaultHotlines = triageData?.hotlines?.length
    ? triageData.hotlines
    : [
        { name: 'Emergency services', phone: '911', badge: 'Life-threatening emergency' },
        { name: 'Poison Control', phone: '1-800-222-1222', badge: 'Poisoning or overdose' },
        ...(pharmacyPhone ? [{ name: pharmacyName || 'Your pharmacy', phone: pharmacyPhone, badge: 'Your pharmacy' }] : []),
        { name: 'Crisis line', phone: '988', badge: 'Call or text, 24/7' },
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
        {/* Header Alert Stripe */}
        <div
          className={`p-6 ${
            is911
              ? 'bg-rose-600 text-white'
              : 'bg-amber-500 text-slate-950'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/20 rounded-xl">
                {is911 ? (
                  <ShieldAlert className="w-7 h-7 text-white" />
                ) : (
                  <AlertTriangle className="w-7 h-7 text-slate-950" />
                )}
              </div>
              <div>
                <span className="text-sm font-bold uppercase tracking-wider opacity-90">
                  {is911 ? 'Critical Emergency Alert' : 'Urgent Care & Clinical Safety Triage'}
                </span>
                <h2 className="text-2xl font-bold tracking-tight">
                  {is911 ? 'Immediate Medical Evaluation Required' : 'Safety Guidance & Clinic Support'}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-black/10 transition-colors text-inherit"
              aria-label="Close modal"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <p className="mt-3 text-sm font-medium leading-relaxed opacity-95">
            {triageData?.patientInstruction ||
              'If you feel severely ill, cannot keep fluids down, experience chest pain, facial swelling, or severe dizziness, prioritize your immediate safety by contacting urgent medical care below.'}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Quick Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="tel:911"
              className="flex items-center justify-between p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold">
                  911
                </div>
                <div>
                  <div className="text-sm font-bold text-rose-900 dark:text-rose-100">
                    Call 911 Emergency
                  </div>
                  <div className="text-sm text-rose-600 dark:text-rose-400">
                    Immediate first responders
                  </div>
                </div>
              </div>
              <Phone className="w-5 h-5 text-rose-600 dark:text-rose-400 group-hover:scale-110 transition-transform" />
            </a>

            <a
              href="tel:18002221222"
              className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-sm">
                  POISON
                </div>
                <div>
                  <div className="text-sm font-bold text-amber-900 dark:text-amber-100">
                    Poison Control Center
                  </div>
                  <div className="text-sm text-amber-700 dark:text-amber-400 font-mono">
                    1-800-222-1222
                  </div>
                </div>
              </div>
              <Phone className="w-5 h-5 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform" />
            </a>
          </div>

          {/* Only plain, non-clinical guidance. Medical advice for symptoms is left to people. */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <HeartPulse className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">If you are worried right now</h3>
            </div>
            <ul className="text-sm space-y-1.5 text-slate-700 dark:text-slate-200 list-disc list-inside">
              <li>If you think it is an emergency, call 911. Do not wait for a message back from this app.</li>
              <li>Keep your medicine bottles with you so you can tell the person who helps you what you take.</li>
              <li>Do not take extra doses to make up for anything. Ask your pharmacist first.</li>
            </ul>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            This app can't find clinics near you. For urgent care, call your pharmacy, a nurse line, or search for your nearest emergency department.
          </p>

          {/* 24/7 Clinical Hotlines */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">
              Phone numbers
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {defaultHotlines.map((hotline, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {hotline.name}
                    </div>
                    <div className="text-sm text-slate-500">{hotline.badge}</div>
                  </div>
                  <a
                    href={`tel:${hotline.phone.replace(/[^0-9]/g, '')}`}
                    className="font-mono font-bold text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    {hotline.phone}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-sm text-slate-500">
            For {patientName} · TakeHomePharmacist
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
          >
            Close Emergency Panel
          </button>
        </div>
      </div>
    </div>
  );
};
