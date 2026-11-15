import React, { useState, useEffect } from 'react';
import {
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  MessageSquare,
  Phone,
  ShieldAlert,
  Utensils,
} from 'lucide-react';
import { ConsultationRecord, DietaryWarning, MedicationScheduleItem, TimeOfDay } from '../types/pharmacy';
import { PatientChatbot } from './PatientChatbot';
import { FoodSafetyChecker } from './FoodSafetyChecker';
import { MedicationCard } from './MedicationCard';
import { notificationService } from '../utils/audioNotification';
import { formatTime12h } from '../utils/medicationPhoto';
import { PictorialWarningLabel, detectFoodQueryPictorial } from './PictorialWarningLabel';

interface PatientPortalProps {
  consultation: ConsultationRecord;
  onOpenEmergencyModal: (triage?: any) => void;
}

type TabId = 'schedule' | 'chat' | 'food';

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'schedule', label: 'Today', icon: <Calendar className="w-5 h-5" aria-hidden="true" /> },
  { id: 'chat', label: 'Ask a question', icon: <MessageSquare className="w-5 h-5" aria-hidden="true" /> },
  { id: 'food', label: 'Food check', icon: <Utensils className="w-5 h-5" aria-hidden="true" /> },
];

const TIME_SLOTS: Array<{ id: TimeOfDay; label: string; fallbackTime: string; icon: string }> = [
  { id: 'morning', label: 'Morning', fallbackTime: 'around 8:00 AM', icon: '🌅' },
  { id: 'noon', label: 'Midday', fallbackTime: 'around 12:00 PM', icon: '☀️' },
  { id: 'evening', label: 'Evening', fallbackTime: 'around 6:30 PM', icon: '🌆' },
  { id: 'bedtime', label: 'Bedtime', fallbackTime: 'around 10:00 PM', icon: '🌙' },
];

const RISK_LABEL: Record<DietaryWarning['riskLevel'], { text: string; style: string }> = {
  severe: { text: 'Do not combine', style: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200' },
  moderate: { text: 'Be careful', style: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  advisory: { text: 'Timing tip', style: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200' },
};

/** Time shown on a slot header: the medicines' own scheduled times, else a generic default. */
function slotTimeText(meds: MedicationScheduleItem[], fallback: string): string {
  const times = Array.from(
    new Set(meds.filter((m) => m.timeOfDay.length === 1 && m.targetTime).map((m) => m.targetTime))
  ).sort();
  return times.length > 0 ? times.map(formatTime12h).join(' and ') : fallback;
}

export const PatientPortal: React.FC<PatientPortalProps> = ({ consultation, onOpenEmergencyModal }) => {
  const [activeTab, setActiveTab] = useState<TabId>('schedule');
  const [takenDoses, setTakenDoses] = useState<Record<string, boolean>>({});
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderNotice, setReminderNotice] = useState('');

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const handleToggleDose = (medId: string, slotId: string) => {
    const key = `${medId}-${slotId}`;
    const nextState = !takenDoses[key];
    setTakenDoses((prev) => ({ ...prev, [key]: nextState }));
    if (nextState) notificationService.playReminderChime();
  };

  const handleEnableReminders = async () => {
    const status = await notificationService.requestPermission();
    if (status === 'granted') {
      setNotificationsEnabled(true);
      notificationService.sendPushNotification('Reminders are on', {
        body: `You will get a reminder before each dose, ${consultation.patientName}.`,
      });
      setReminderNotice('Reminders are on. We sent you a test message.');
    } else {
      setReminderNotice('Reminders are blocked in your browser settings.');
    }
    setTimeout(() => setReminderNotice(''), 5000);
  };

  const getMedsForSlot = (slot: TimeOfDay) => consultation.medications.filter((m) => m.timeOfDay.includes(slot));

  const totalDosesToday = consultation.medications.reduce((acc, m) => acc + m.timeOfDay.length, 0);
  const completedDosesToday = Object.values(takenDoses).filter(Boolean).length;
  const progressPercent = totalDosesToday > 0 ? Math.round((completedDosesToday / totalDosesToday) * 100) : 0;

  const warnings = consultation.generalDietaryWarnings || [];

  return (
    <div className="space-y-6">
      {/* Greeting, today's progress, and the always-visible help button */}
      <section
        aria-label="Welcome"
        className="bg-gradient-to-r from-teal-900 via-slate-900 to-slate-900 text-white rounded-2xl p-6 shadow-sm border border-teal-800/40"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Hello, {consultation.patientName}</h1>
            <p className="text-base text-slate-200 mt-1">
              Your medicines from your visit on {consultation.consultationDate}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenEmergencyModal()}
            className="min-h-12 px-5 bg-rose-600 hover:bg-rose-700 text-white text-base font-bold rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 shrink-0"
          >
            <ShieldAlert className="w-5 h-5" aria-hidden="true" />
            Feeling unwell? Get help now
          </button>
        </div>

        <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-slate-300">Today</p>
            <p className="text-lg font-bold">
              {completedDosesToday} of {totalDosesToday} doses taken
            </p>
            <div
              role="progressbar"
              aria-label="Doses taken today"
              aria-valuemin={0}
              aria-valuemax={totalDosesToday}
              aria-valuenow={completedDosesToday}
              className="w-full bg-slate-800 rounded-full h-2 mt-2 overflow-hidden"
            >
              <div className="bg-teal-400 h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div>
            <p className="text-sm text-slate-300">Questions about your medicines? Call your pharmacy</p>
            <a
              href={`tel:${consultation.pharmacyPhone.replace(/[^\d+]/g, '')}`}
              className="text-lg font-bold flex items-center gap-2 mt-0.5 underline-offset-2 hover:underline"
            >
              <Phone className="w-5 h-5 text-teal-300" aria-hidden="true" />
              {consultation.pharmacyPhone}
            </a>
          </div>
        </div>
      </section>

      {/* Three simple tabs */}
      <div role="tablist" aria-label="Sections" className="flex items-center gap-1.5 p-1.5 bg-slate-200/80 dark:bg-slate-800/80 rounded-xl overflow-x-auto">
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-h-11 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-base font-semibold whitespace-nowrap transition-colors ${
                selected
                  ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-sm'
                  : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TODAY */}
      <div role="tabpanel" id="panel-schedule" aria-labelledby="tab-schedule" hidden={activeTab !== 'schedule'} className="space-y-6">
        {activeTab === 'schedule' && (
          <>
            {warnings.length > 0 && (
              <section aria-labelledby="avoid-heading" className="p-5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl">
                <h2 id="avoid-heading" className="text-lg font-bold text-amber-950 dark:text-amber-100">
                  Foods and drinks to watch
                </h2>
                <ul className="mt-3 space-y-3">
                  {warnings.map((w, i) => {
                    const risk = RISK_LABEL[w.riskLevel] ?? RISK_LABEL.advisory;
                    return (
                      <li key={i} className="flex items-start gap-3">
                        <PictorialWarningLabel
                          type={detectFoodQueryPictorial(w.foodOrDrink)}
                          size="sm"
                          showLabelText={false}
                          className="p-0.5 border-0 bg-transparent shadow-none"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {w.foodOrDrink}{' '}
                            <span className={`ml-1 px-2 py-0.5 text-sm font-semibold rounded ${risk.style}`}>{risk.text}</span>
                          </p>
                          {w.safeAlternative && (
                            <p className="text-base text-slate-700 dark:text-slate-200">Instead: {w.safeAlternative}</p>
                          )}
                          <details className="mt-1">
                            <summary className="text-sm font-semibold text-teal-800 dark:text-teal-300 cursor-pointer min-h-8">
                              Why?
                            </summary>
                            <p className="text-base text-slate-700 dark:text-slate-200 mt-1">{w.explanation}</p>
                          </details>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Dose reminders: a single compact control instead of a separate tab */}
            <section aria-label="Dose reminders" className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Bell className="w-6 h-6 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                <div>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Dose reminders</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {notificationsEnabled ? 'On for this device.' : 'Get a reminder before each dose.'}
                  </p>
                </div>
              </div>
              {notificationsEnabled ? (
                <span className="flex items-center gap-1.5 px-3 py-2 bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 rounded-lg text-sm font-bold">
                  <CheckCircle className="w-4 h-4" aria-hidden="true" /> On
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleEnableReminders}
                  className="min-h-11 px-4 bg-teal-700 hover:bg-teal-800 text-white text-base font-semibold rounded-xl transition-colors"
                >
                  Turn on reminders
                </button>
              )}
              <p role="status" className="w-full text-sm text-slate-600 dark:text-slate-300 empty:hidden">
                {reminderNotice}
              </p>
            </section>

            {/* Doses grouped by time of day */}
            {TIME_SLOTS.map((slot) => {
              const meds = getMedsForSlot(slot.id);
              if (meds.length === 0) return null;
              const headingId = `slot-${slot.id}`;

              return (
                <section
                  key={slot.id}
                  aria-labelledby={headingId}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl" aria-hidden="true">{slot.icon}</span>
                      <div>
                        <h2 id={headingId} className="font-bold text-xl text-slate-900 dark:text-slate-100">
                          {slot.label}
                        </h2>
                        <p className="text-base text-slate-600 dark:text-slate-300 flex items-center gap-1">
                          <Clock className="w-4 h-4 text-teal-700" aria-hidden="true" />
                          {slotTimeText(meds, slot.fallbackTime)}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg">
                      {meds.length} {meds.length === 1 ? 'medicine' : 'medicines'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {meds.map((med) => (
                      <MedicationCard
                        key={med.id}
                        medication={med}
                        isTaken={!!takenDoses[`${med.id}-${slot.id}`]}
                        onToggleTaken={() => handleToggleDose(med.id, slot.id)}
                        pharmacistName={consultation.pharmacistName}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>

      {/* ASK A QUESTION */}
      <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat" hidden={activeTab !== 'chat'}>
        {activeTab === 'chat' && <PatientChatbot consultation={consultation} onOpenEmergencyModal={onOpenEmergencyModal} />}
      </div>

      {/* FOOD CHECK */}
      <div role="tabpanel" id="panel-food" aria-labelledby="tab-food" hidden={activeTab !== 'food'}>
        {activeTab === 'food' && (
          <FoodSafetyChecker medications={consultation.medications} knownWarnings={consultation.generalDietaryWarnings} />
        )}
      </div>
    </div>
  );
};
