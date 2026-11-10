import React from 'react';
import { AlertTriangle, Phone, MapPin, Clock, ShieldAlert, X, HeartPulse } from 'lucide-react';
import { EmergencyTriageResult } from '../types/pharmacy';

interface EmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  triageData?: EmergencyTriageResult | null;
  patientName?: string;
}

export const EmergencyModal: React.FC<EmergencyModalProps> = ({
  isOpen,
  onClose,
  triageData,
  patientName = 'Patient',
}) => {
  if (!isOpen) return null;

  const severity = triageData?.severity || 'urgent_care';
  const is911 = severity === 'emergency_911';

  const defaultClinics = triageData?.recommendedClinics?.length
    ? triageData.recommendedClinics
    : [
        {
          name: 'ScriptCare Rapid Walk-In Urgent Care Clinic',
          distance: '0.6 miles away',
          address: '1240 Apothecary Way, Suite 100, Metro City',
          phone: '(555) 234-5670',
          isOpen247: true,
          estimatedWaitTime: '15 mins wait',
        },
        {
          name: 'City General Hospital Emergency Department (Level 1 Trauma)',
          distance: '1.2 miles away',
          address: '450 Health Sciences Blvd, Metro City',
          phone: '(555) 911-2000',
          isOpen247: true,
          estimatedWaitTime: 'Immediate Medical Triage',
        },
        {
          name: 'MetroHealth Urgent & Extended Primary Care',
          distance: '1.4 miles away',
          address: '610 Market Street, 2nd Floor',
          phone: '(555) 345-6789',
          isOpen247: false,
          estimatedWaitTime: '20 mins wait (Open until 10:00 PM)',
        },
      ];

  const defaultHotlines = triageData?.hotlines?.length
    ? triageData.hotlines
    : [
        { name: 'Emergency Medical Services', phone: '911', badge: 'Life-Threatening Emergency' },
        { name: 'National Poison Control Center', phone: '1-800-222-1222', badge: '24/7 Free Expert Toxicologist' },
        { name: 'ScriptCare 24/7 Clinical Pharmacy Hotline', phone: '1-800-555-7427', badge: 'On-Call Pharmacist' },
        { name: 'Suicide & Crisis Lifeline', phone: '988', badge: '24/7 Confidential Crisis Support' },
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
                <span className="text-xs font-bold uppercase tracking-wider opacity-90">
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
                  <div className="text-xs text-rose-600 dark:text-rose-400">
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
                <div className="w-10 h-10 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-xs">
                  POISON
                </div>
                <div>
                  <div className="text-sm font-bold text-amber-900 dark:text-amber-100">
                    Poison Control Center
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-400 font-mono">
                    1-800-222-1222
                  </div>
                </div>
              </div>
              <Phone className="w-5 h-5 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform" />
            </a>
          </div>

          {/* Clinical Advice for Nausea & Feeling Sick */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <HeartPulse className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Immediate Steps If You Feel Too Sick or Nauseous:
              </h3>
            </div>
            <ul className="text-xs space-y-1.5 text-slate-600 dark:text-slate-300 list-disc list-inside">
              <li>
                <strong className="text-slate-800 dark:text-slate-200">Check Meal Timing:</strong> Medications like Metformin, Metoprolol, or Augmentin cause nausea when taken on an empty stomach. Take with food or a snack.
              </li>
              <li>
                <strong className="text-slate-800 dark:text-slate-200">Stay Hydrated with Small Sips:</strong> Drink small sips of cool water, ginger tea, or electrolyte solution. Avoid gulping large amounts of water at once.
              </li>
              <li>
                <strong className="text-slate-800 dark:text-slate-200">Remain Upright:</strong> Keep your head elevated at 45 degrees or stay seated for 30 minutes after taking pills.
              </li>
              <li>
                <strong className="text-slate-800 dark:text-slate-200">Do NOT Double Up:</strong> If you threw up your dose within 15 minutes, speak with your clinical pharmacist before retaking any pills.
              </li>
            </ul>
          </div>

          {/* Nearby Urgent Care Clinics */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Nearby Walk-In Urgent Care & Emergency Clinics
              </h3>
              <span className="text-xs text-slate-500">Live Availability</span>
            </div>

            <div className="space-y-3">
              {defaultClinics.map((clinic, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl hover:border-teal-500 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                          {clinic.name}
                        </span>
                        {clinic.isOpen247 && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded">
                            Open 24/7
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {clinic.distance} · {clinic.address}
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          {clinic.estimatedWaitTime}
                        </span>
                      </div>
                    </div>

                    <a
                      href={`tel:${clinic.phone.replace(/[^0-9]/g, '')}`}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-teal-600 rounded-lg hover:bg-slate-800 dark:hover:bg-teal-500 transition-colors flex items-center gap-1 shrink-0"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Call Clinic
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 24/7 Clinical Hotlines */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">
              Direct Clinical Hotlines
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {defaultHotlines.map((hotline, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {hotline.name}
                    </div>
                    <div className="text-[11px] text-slate-500">{hotline.badge}</div>
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
          <span className="text-xs text-slate-500">
            ScriptCare Clinical Triage · Dedicated to {patientName}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
          >
            Close Emergency Panel
          </button>
        </div>
      </div>
    </div>
  );
};
