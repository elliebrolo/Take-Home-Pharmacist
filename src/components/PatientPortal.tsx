import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  Bell,
  Utensils,
  MessageSquare,
  ShieldAlert,
  Calendar,
  Pill,
  Sparkles,
  Phone,
  RotateCcw,
  Volume2,
  Coffee,
  Check
} from 'lucide-react';
import { ConsultationRecord, MedicationScheduleItem, TimeOfDay } from '../types/pharmacy';
import { PatientChatbot } from './PatientChatbot';
import { FoodSafetyChecker } from './FoodSafetyChecker';
import { DrugCatalogSearch } from './DrugCatalogSearch';
import { notificationService } from '../utils/audioNotification';
import {
  PictorialWarningLabel,
  detectMedicationPictorials,
  detectFoodQueryPictorial,
} from './PictorialWarningLabel';

interface PatientPortalProps {
  consultation: ConsultationRecord;
  onOpenEmergencyModal: (triage?: any) => void;
  onSwitchToPharmacistView: () => void;
}

export const PatientPortal: React.FC<PatientPortalProps> = ({
  consultation,
  onOpenEmergencyModal,
  onSwitchToPharmacistView,
}) => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'chat' | 'food' | 'drugs' | 'reminders'>('schedule');
  const [takenDoses, setTakenDoses] = useState<Record<string, boolean>>({});
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [testNotificationSent, setTestNotificationSent] = useState(false);
  const [adherenceStreak, setAdherenceStreak] = useState(14); // 14-day streak

  // Check notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const handleToggleDose = (medId: string, slotTime: string) => {
    const key = `${medId}-${slotTime}`;
    const nextState = !takenDoses[key];
    setTakenDoses((prev) => ({
      ...prev,
      [key]: nextState,
    }));

    if (nextState) {
      notificationService.playReminderChime();
    }
  };

  const handleRequestPushNotifications = async () => {
    const status = await notificationService.requestPermission();
    if (status === 'granted') {
      setNotificationsEnabled(true);
      notificationService.sendPushNotification('ScriptCare Reminders Active', {
        body: `Dosage alerts enabled for ${consultation.patientName}. You will receive timely reminders before each scheduled dose.`,
      });
      setTestNotificationSent(true);
      setTimeout(() => setTestNotificationSent(false), 4000);
    }
  };

  const handleTestNotification = () => {
    notificationService.sendPushNotification(
      'Dosage Reminder: Metoprolol Succinate 50mg',
      {
        body: 'Take 1 tablet now with breakfast. Remember: Avoid alcohol around your morning dose.',
      }
    );
    setTestNotificationSent(true);
    setTimeout(() => setTestNotificationSent(false), 4000);
  };

  // Group medications by time slot
  const timeSlots: Array<{ id: TimeOfDay; label: string; time: string; icon: string }> = [
    { id: 'morning', label: 'Morning Regimen', time: '08:00 AM', icon: '🌅' },
    { id: 'noon', label: 'Mid-Day Regimen', time: '12:00 PM', icon: '☀️' },
    { id: 'evening', label: 'Evening Regimen', time: '06:30 PM - 08:00 PM', icon: '🌆' },
    { id: 'bedtime', label: 'Bedtime Regimen', time: '10:00 PM', icon: '🌙' },
  ];

  const getMedsForSlot = (slot: TimeOfDay) => {
    return consultation.medications.filter((m) => m.timeOfDay.includes(slot));
  };

  const totalDosesToday = consultation.medications.reduce(
    (acc, m) => acc + m.timeOfDay.length,
    0
  );
  const completedDosesToday = Object.values(takenDoses).filter(Boolean).length;
  const progressPercent = totalDosesToday > 0 ? Math.round((completedDosesToday / totalDosesToday) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Patient Care Banner with Pharmacist Attestation */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-slate-900 text-white rounded-2xl p-6 shadow-sm border border-teal-800/40 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <img
                src="/src/assets/images/avatar_pharmacist_lead_1793849084943.jpg"
                alt="Dr. Sarah Jenkins PharmD"
                className="w-16 h-16 rounded-full object-cover border-2 border-teal-400 shadow-md"
                referrerPolicy="no-referrer"
              />
              <div className="w-4 h-4 bg-emerald-400 border-2 border-slate-900 rounded-full absolute bottom-0 right-0" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-300">
                  ScriptCare Patient Portal
                </span>
                <span className="text-slate-400 text-xs">·</span>
                <span className="text-xs text-slate-300">
                  Prescribing Pharmacist: {consultation.pharmacistName}
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">
                Welcome, {consultation.patientName}
              </h1>
              <p className="text-xs text-slate-300 max-w-xl mt-1 leading-relaxed">
                Your personal prescription regimen transcribed directly from your clinical consultation on{' '}
                <strong className="text-teal-200">{consultation.consultationDate}</strong>.
              </p>
            </div>
          </div>

          {/* Quick Urgent Help Trigger Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
            <button
              onClick={() => onOpenEmergencyModal()}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 shrink-0 animate-pulse-subtle"
            >
              <ShieldAlert className="w-4 h-4" />
              Feeling Sick or Unwell? Get Urgent Help
            </button>
            <button
              onClick={onSwitchToPharmacistView}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-xl transition-colors border border-white/10 flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Pharmacist Portal
            </button>
          </div>
        </div>

        {/* Adherence & Daily Progress Bar */}
        <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <div className="text-slate-400">Today's Dose Adherence</div>
            <div className="text-base font-bold text-white mt-0.5">
              {completedDosesToday} of {totalDosesToday} Doses Taken ({progressPercent}%)
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-teal-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div>
            <div className="text-slate-400">Adherence Streak</div>
            <div className="text-base font-bold text-teal-300 mt-0.5 flex items-center gap-1.5">
              <span>🔥 {adherenceStreak} Consecutive Days</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Great job staying on schedule!</div>
          </div>

          <div>
            <div className="text-slate-400">Pharmacy On-Call Desk</div>
            <div className="text-base font-bold text-white mt-0.5 flex items-center gap-1.5 font-mono">
              <Phone className="w-3.5 h-3.5 text-teal-400" />
              {consultation.pharmacyPhone}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">24/7 Clinical Questions Line</div>
          </div>
        </div>
      </div>

      {/* Navigation Segmented Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/80 dark:bg-slate-800/80 rounded-xl overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'schedule'
              ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Today's Pill Schedule
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'chat'
              ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Ask Pharmacist AI (Chatbox)
        </button>

        <button
          onClick={() => setActiveTab('food')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'food'
              ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Utensils className="w-4 h-4" />
          Dietary & Food Safety Checker
        </button>

        <button
          onClick={() => setActiveTab('drugs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'drugs'
              ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Pill className="w-4 h-4" />
          Drug Database & FDA Warning Schedules
        </button>

        <button
          onClick={() => setActiveTab('reminders')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'reminders'
              ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Bell className="w-4 h-4" />
          Push Reminders & Alerts
        </button>
      </div>

      {/* TAB 1: Today's Pill Schedule & Timetable */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          {/* Quick Notice Banner on Critical Rules with Pictorial Prohibition Sign */}
          {consultation.generalDietaryWarnings?.length > 0 && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold text-amber-900 dark:text-amber-200">
                    Critical Dietary Restriction from Pharmacist:{' '}
                  </span>
                  <span className="text-amber-800 dark:text-amber-300">
                    {consultation.generalDietaryWarnings[0]?.foodOrDrink} — {consultation.generalDietaryWarnings[0]?.explanation}
                  </span>
                </div>
              </div>

              {/* Auxiliary Pictorial Sign for the Critical Alert */}
              <div className="shrink-0">
                <PictorialWarningLabel
                  type={detectFoodQueryPictorial(consultation.generalDietaryWarnings[0]?.foodOrDrink || '')}
                  size="sm"
                  className="bg-white/80 dark:bg-slate-900/80 shadow-none border-amber-300"
                />
              </div>
            </div>
          )}

          {/* Time Slot Timeline Cards */}
          <div className="space-y-6">
            {timeSlots.map((slot) => {
              const meds = getMedsForSlot(slot.id);
              if (meds.length === 0) return null;

              return (
                <div
                  key={slot.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
                >
                  {/* Slot Header */}
                  <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{slot.icon}</span>
                      <div>
                        <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                          {slot.label}
                        </h3>
                        <div className="text-xs text-slate-500 font-mono flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-teal-600" />
                          Recommended Time: {slot.time}
                        </div>
                      </div>
                    </div>

                    <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg">
                      {meds.length} {meds.length === 1 ? 'Medication' : 'Medications'}
                    </span>
                  </div>

                  {/* Medications in this Slot */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {meds.map((med) => {
                      const doseKey = `${med.id}-${slot.id}`;
                      const isTaken = !!takenDoses[doseKey];
                      const pictorials = detectMedicationPictorials(
                        med.foodInstructions,
                        med.warnings,
                        med.withFood,
                        med.medicationName
                      );

                      return (
                        <div
                          key={med.id}
                          className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                            isTaken
                              ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                              : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 hover:border-slate-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                                    {med.medicationName}
                                  </h4>
                                  <span className="text-xs font-semibold px-2 py-0.5 bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 rounded">
                                    {med.strength}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500">
                                  {med.doseAmount} · {med.dosageForm}
                                </div>
                              </div>

                              <button
                                onClick={() => handleToggleDose(med.id, slot.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                                  isTaken
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {isTaken ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" /> Taken
                                  </>
                                ) : (
                                  'Mark Taken'
                                )}
                              </button>
                            </div>

                            {/* Food Requirement Tag */}
                            <div className="mt-2.5 flex items-start gap-1.5 text-xs">
                              <Utensils className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  Food Instruction:{' '}
                                </span>
                                <span className="text-slate-600 dark:text-slate-300 font-medium">
                                  {med.foodInstructions}
                                </span>
                              </div>
                            </div>

                            {/* Visual Auxiliary Pictorial Warning Labels */}
                            {pictorials.length > 0 && (
                              <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  Auxiliary Pictorial Warning Label:
                                </span>
                                <div className="flex flex-col gap-1.5">
                                  {pictorials.map((picType) => (
                                    <PictorialWarningLabel
                                      key={picType}
                                      type={picType}
                                      size="sm"
                                      className="w-full bg-white dark:bg-slate-900"
                                    />
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Pharmacist Verbal Tip */}
                            {med.pharmacistAdvice && (
                              <div className="mt-2.5 p-2.5 bg-white/80 dark:bg-slate-900/60 rounded-lg border border-slate-200/60 dark:border-slate-800/60 text-xs">
                                <span className="font-bold text-teal-700 dark:text-teal-400">
                                  Dr. Jenkins' Note:{' '}
                                </span>
                                <span className="text-slate-600 dark:text-slate-300 italic">
                                  "{med.pharmacistAdvice}"
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Warnings */}
                          {med.warnings?.length > 0 && (
                            <div className="mt-3 text-[11px] text-rose-700 dark:text-rose-400 font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>{med.warnings[0]}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full Prescription Regimen Table / Overview */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 mb-1">
              Complete Prescribed Medications & Pharmacy Refills
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              All active prescriptions coordinated by {consultation.pharmacyName}.
            </p>

            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {consultation.medications.map((med) => (
                <div key={med.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-[220px]">
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {med.medicationName} {med.strength}
                    </div>
                    <div className="text-slate-500">
                      Generic: {med.genericName} · Class: {med.purpose}
                    </div>
                  </div>

                  <div className="text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">Schedule:</span> {med.frequency}
                  </div>

                  <div className="text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">Refills:</span> {med.refillsRemaining ?? 3} left (Next: {med.nextRefillDate || 'Dec 2026'})
                  </div>

                  <div className="flex items-center gap-2">
                    {detectMedicationPictorials(med.foodInstructions, med.warnings, med.withFood, med.medicationName).map((pType) => (
                      <PictorialWarningLabel
                        key={pType}
                        type={pType}
                        size="sm"
                        showLabelText={false}
                        className="p-0.5 border-0 bg-transparent shadow-none"
                      />
                    ))}
                    <span className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded">
                      {med.fdaSchedule}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Ask Pharmacist AI Chatbox */}
      {activeTab === 'chat' && (
        <PatientChatbot
          consultation={consultation}
          onOpenEmergencyModal={onOpenEmergencyModal}
        />
      )}

      {/* TAB 3: Dietary & Food Safety Checker */}
      {activeTab === 'food' && (
        <FoodSafetyChecker
          medications={consultation.medications}
          knownWarnings={consultation.generalDietaryWarnings}
        />
      )}

      {/* TAB 4: Drug Database & FDA Warning Schedules */}
      {activeTab === 'drugs' && <DrugCatalogSearch />}

      {/* TAB 5: Push Reminders & Alerts */}
      {activeTab === 'reminders' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 rounded-xl">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Push Notifications & Timely Dosage Reminders
              </h2>
              <p className="text-sm text-slate-500">
                Get browser push notifications and auditory chimes before every scheduled dose with specific meal and food instructions.
              </p>
            </div>
          </div>

          <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Browser Push Notifications Status
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {notificationsEnabled
                    ? 'Push notifications are currently active for this device.'
                    : 'Push notifications are disabled. Enable to receive reminder chimes.'}
                </div>
              </div>

              {!notificationsEnabled ? (
                <button
                  onClick={handleRequestPushNotifications}
                  className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
                >
                  Enable Push Notifications
                </button>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-lg text-xs font-bold">
                  <CheckCircle className="w-4 h-4" /> Enabled
                </span>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Test Audio Chime & Push Alert:
                </span>
                <p className="text-[11px] text-slate-500">
                  Plays the synthesized medical reminder chime and triggers a sample dose reminder.
                </p>
              </div>

              <button
                onClick={handleTestNotification}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2"
              >
                <Volume2 className="w-4 h-4" />
                Test Dosage Reminder Now
              </button>
            </div>

            {testNotificationSent && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-2 animate-fade-in">
                <CheckCircle className="w-4 h-4" />
                Test dosage notification and chime dispatched successfully!
              </div>
            )}
          </div>

          {/* Active Reminder Schedule Table */}
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-3">
              Active Push Reminder Schedule for Today
            </h3>

            <div className="space-y-2">
              {consultation.medications.map((med) => (
                <div
                  key={med.id}
                  className="p-3.5 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {med.medicationName} ({med.strength})
                    </span>
                    <span className="text-slate-500 ml-2">
                      · {med.foodInstructions}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                      {med.targetTime || '08:00'} ({med.timeOfDay.join(', ')})
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded font-semibold text-[10px]">
                      Active Alert
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
