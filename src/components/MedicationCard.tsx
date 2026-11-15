import React, { useId, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Clock, Utensils } from 'lucide-react';
import { FoodRequirement, MedicationScheduleItem } from '../types/pharmacy';
import { PictorialWarningLabel, detectMedicationPictorials } from './PictorialWarningLabel';
import { MedicationImage, MedicationImageCaption } from './MedicationImage';
import { formatTime12h } from '../utils/medicationPhoto';

interface MedicationCardProps {
  medication: MedicationScheduleItem;
  isTaken: boolean;
  onToggleTaken: () => void;
  pharmacistName: string;
}

const FOOD_SHORT: Record<FoodRequirement, string> = {
  with_food: 'with food',
  empty_stomach: 'on an empty stomach',
  with_or_without_food: 'with or without food',
  special: 'see food tips',
};

export const MedicationCard: React.FC<MedicationCardProps> = ({
  medication: med,
  isTaken,
  onToggleTaken,
  pharmacistName,
}) => {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  const pictorials = detectMedicationPictorials(med.foodInstructions, med.warnings, med.withFood, med.medicationName);
  // A single target time only describes the dose when the medicine is taken once a day.
  const exactTime = med.timeOfDay.length === 1 && med.targetTime ? formatTime12h(med.targetTime) : null;
  const doseLine = `${med.doseAmount} ${FOOD_SHORT[med.withFood] ?? ''}`.trim();
  const fullName = `${med.medicationName} ${med.strength}`.trim();

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isTaken
          ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
      }`}
    >
      {/* Collapsed summary: everything needed to take this dose */}
      <div className="p-4 flex items-start gap-3">
        <MedicationImage medication={med} />

        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-base text-slate-900 dark:text-slate-100 leading-snug">{fullName}</h4>
          <p className="text-base text-slate-700 dark:text-slate-200">{doseLine}</p>
          {exactTime && (
            <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
              <Clock className="w-4 h-4" aria-hidden="true" /> {exactTime}
            </p>
          )}
          {pictorials.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {pictorials.slice(0, 3).map((type) => (
                <PictorialWarningLabel
                  key={type}
                  type={type}
                  size="sm"
                  showLabelText={false}
                  className="p-0.5 border-0 bg-transparent shadow-none"
                />
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleTaken}
          aria-pressed={isTaken}
          aria-label={isTaken ? `${fullName} marked as taken. Tap to undo.` : `Mark ${fullName} as taken`}
          className={`shrink-0 min-h-11 px-4 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors ${
            isTaken
              ? 'bg-emerald-700 text-white'
              : 'bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-600'
          }`}
        >
          {isTaken ? (
            <>
              <Check className="w-4 h-4" aria-hidden="true" /> Taken
            </>
          ) : (
            'Mark taken'
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={detailsId}
        className="w-full min-h-11 px-4 py-2 border-t border-slate-200 dark:border-slate-700 text-sm font-semibold text-teal-800 dark:text-teal-300 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-700/40 rounded-b-xl"
      >
        <span>{expanded ? 'Hide details' : 'Show details'}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {/* Expanded details */}
      <div id={detailsId} hidden={!expanded} className="px-4 pb-4 pt-3 space-y-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row gap-4">
          <MedicationImage medication={med} size="lg" />
          <div className="space-y-2 min-w-0">
            <MedicationImageCaption medication={med} />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-100">Form: </span>
              {med.dosageForm}
            </p>
          </div>
        </div>

        <div className="text-base flex items-start gap-2">
          <Utensils className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-slate-800 dark:text-slate-100">
            <span className="font-semibold">How to take it: </span>
            {med.frequency}. {med.foodInstructions}
          </p>
        </div>

        {med.purpose && (
          <p className="text-base text-slate-800 dark:text-slate-100">
            <span className="font-semibold">What it is for: </span>
            {med.purpose}
          </p>
        )}

        {pictorials.length > 0 && (
          <div className="flex flex-col gap-2">
            {pictorials.map((type) => (
              <PictorialWarningLabel key={type} type={type} size="md" className="w-full bg-white dark:bg-slate-900" />
            ))}
          </div>
        )}

        {med.warnings?.length > 0 && (
          <div>
            <p className="font-semibold text-base text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" /> Safety warnings
            </p>
            <ul className="list-disc pl-6 mt-1 space-y-1 text-base text-slate-800 dark:text-slate-100">
              {med.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {med.pharmacistAdvice && (
          <div className="p-3 bg-white dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
            <p className="text-sm font-semibold text-teal-800 dark:text-teal-300">Note from {pharmacistName}</p>
            <p className="text-base text-slate-700 dark:text-slate-200 mt-0.5">“{med.pharmacistAdvice}”</p>
          </div>
        )}

        <p className="text-sm text-slate-500 dark:text-slate-400">
          Refills left: {med.refillsRemaining ?? 'ask your pharmacy'}
          {med.nextRefillDate ? ` · Next refill: ${med.nextRefillDate}` : ''}
        </p>
      </div>
    </div>
  );
};
