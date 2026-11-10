import React, { useState } from 'react';
import { FileText, Sparkles, CheckCircle2, AlertTriangle, RefreshCw, Plus, Trash2, ArrowRight, ShieldAlert, Pill, Eye } from 'lucide-react';
import { ConsultationRecord, MedicationScheduleItem, DietaryWarning, TimeOfDay, FoodRequirement } from '../types/pharmacy';
import { DEFAULT_CONSULTATIONS } from '../data/defaultConsultations';
import { PictorialWarningLabel, detectMedicationPictorials, detectFoodQueryPictorial } from './PictorialWarningLabel';

interface PharmacistPortalProps {
  currentConsultation: ConsultationRecord;
  onSaveConsultation: (consultation: ConsultationRecord) => void;
  onSwitchToPatientView: () => void;
}

export const PharmacistPortal: React.FC<PharmacistPortalProps> = ({
  currentConsultation,
  onSaveConsultation,
  onSwitchToPatientView,
}) => {
  const [selectedCaseId, setSelectedCaseId] = useState(currentConsultation.id);
  const [patientName, setPatientName] = useState(currentConsultation.patientName);
  const [patientAge, setPatientAge] = useState(currentConsultation.patientAge);
  const [patientGender, setPatientGender] = useState(currentConsultation.patientGender || 'Male');
  const [transcript, setTranscript] = useState(currentConsultation.rawTranscript);
  const [clinicalSummary, setClinicalSummary] = useState(currentConsultation.clinicalSummary);
  const [medications, setMedications] = useState<MedicationScheduleItem[]>(currentConsultation.medications);
  const [dietaryWarnings, setDietaryWarnings] = useState<DietaryWarning[]>(currentConsultation.generalDietaryWarnings);

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractSuccess, setExtractSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load a preset case
  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    const found = DEFAULT_CONSULTATIONS.find((c) => c.id === caseId);
    if (found) {
      setPatientName(found.patientName);
      setPatientAge(found.patientAge);
      setPatientGender(found.patientGender || 'Male');
      setTranscript(found.rawTranscript);
      setClinicalSummary(found.clinicalSummary);
      setMedications(found.medications);
      setDietaryWarnings(found.generalDietaryWarnings);
      setError(null);
    }
  };

  // AI Extract action
  const handleAIExtract = async () => {
    if (!transcript.trim()) {
      setError('Please provide a consultation transcript to analyze.');
      return;
    }

    setIsExtracting(true);
    setError(null);
    setExtractSuccess(false);

    try {
      const response = await fetch('/api/parse-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          patientName,
          patientAge,
        }),
      });

      const data = await response.json();
      if (data.success && data.data) {
        const parsed = data.data;
        if (parsed.patientName) setPatientName(parsed.patientName);
        if (parsed.patientAge) setPatientAge(parsed.patientAge);
        if (parsed.clinicalSummary) setClinicalSummary(parsed.clinicalSummary);
        if (parsed.medications?.length > 0) {
          setMedications(parsed.medications);
        }
        if (parsed.generalDietaryWarnings?.length > 0) {
          setDietaryWarnings(parsed.generalDietaryWarnings);
        }
        setExtractSuccess(true);
        setTimeout(() => setExtractSuccess(false), 4000);
      } else {
        setError(data.error || 'Failed to extract structured data from transcript.');
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with extraction engine.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Save & publish
  const handlePublish = () => {
    const updated: ConsultationRecord = {
      ...currentConsultation,
      id: selectedCaseId || `consult-${Date.now()}`,
      patientName,
      patientAge,
      patientGender,
      rawTranscript: transcript,
      clinicalSummary,
      medications,
      generalDietaryWarnings: dietaryWarnings,
      consultationDate: new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    };

    onSaveConsultation(updated);
    onSwitchToPatientView();
  };

  // Add medication row
  const handleAddMedication = () => {
    const newMed: MedicationScheduleItem = {
      id: `med-${Date.now()}`,
      medicationName: 'New Prescription',
      genericName: 'Generic Chemical Name',
      strength: '20 mg',
      dosageForm: 'Oral tablet',
      doseAmount: '1 tablet',
      frequency: 'Once daily with dinner',
      timeOfDay: ['evening'],
      targetTime: '19:00',
      withFood: 'with_food',
      foodInstructions: 'Take with evening meal.',
      purpose: 'Cardiovascular maintenance',
      pharmacistAdvice: 'Take consistently at the same time each day.',
      warnings: ['Report unusual side effects to pharmacy'],
      fdaSchedule: 'Rx-Only (Legend Drug)',
    };
    setMedications([...medications, newMed]);
  };

  const handleRemoveMedication = (id: string) => {
    setMedications(medications.filter((m) => m.id !== id));
  };

  const handleUpdateMed = (id: string, field: keyof MedicationScheduleItem, value: any) => {
    setMedications(
      medications.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  return (
    <div className="space-y-8">
      {/* Top Banner / Consultation Intake Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Pharmacist Clinical Workspace
            </span>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Consultation Transcript Intake & Regimen Architect
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Input verbal pharmacist-patient consultation transcripts. Gemini extracts dosages, timing schedules, food rules, and verbal warnings for the patient's companion app.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePublish}
              className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold rounded-xl transition-colors shadow-sm flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Publish to Patient App
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preset Case Loader */}
        <div className="mb-6">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Load Pre-Configured Clinical Consultation Cases:
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {DEFAULT_CONSULTATIONS.map((c) => {
              const isSelected = selectedCaseId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => handleSelectCase(c.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-600 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {c.patientName} ({c.patientAge}y)
                  </div>
                  <div className="text-xs text-teal-700 dark:text-teal-400 font-medium">
                    {c.medications.map((m) => m.medicationName).join(' + ')}
                  </div>
                  <div className="text-[11px] text-slate-500 line-clamp-1 mt-1">
                    {c.clinicalSummary}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Patient Metadata Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Patient Full Name
            </label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Age
            </label>
            <input
              type="number"
              value={patientAge}
              onChange={(e) => setPatientAge(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Gender
            </label>
            <input
              type="text"
              value={patientGender}
              onChange={(e) => setPatientGender(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Transcript Textarea */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-teal-600" />
              Pharmacist Consultation Transcript (Verbatim Spoken Dialogue)
            </label>
            <span className="text-xs text-slate-400">
              {transcript.split(/\s+/).filter(Boolean).length} words
            </span>
          </div>

          <textarea
            rows={10}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste verbatim clinical dialogue, recorded consultation dictation, or counseling notes here..."
            className="w-full p-4 text-sm font-mono leading-relaxed bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100"
          />
        </div>

        {/* Extraction Button */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleAIExtract}
            disabled={isExtracting || !transcript.trim()}
            className="px-6 py-2.5 bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 dark:hover:bg-teal-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm"
          >
            {isExtracting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Parsing Transcript with Clinical Pharmacology AI...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-400" />
                Analyze & Extract Regimen with AI
              </>
            )}
          </button>

          {extractSuccess && (
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 animate-fade-in">
              <CheckCircle2 className="w-4 h-4" />
              Successfully parsed and extracted prescription schedule!
            </span>
          )}

          {error && (
            <span className="text-xs font-bold text-rose-600 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </span>
          )}
        </div>
      </div>

      {/* Extracted Regimen Review & Editor */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Pill className="w-5 h-5 text-teal-600" />
              Extracted Patient Medication Regimen ({medications.length} Prescriptions)
            </h2>
            <p className="text-xs text-slate-500">
              Verify dosages, timing slots, meal instructions, and FDA classifications before publishing to the patient portal.
            </p>
          </div>

          <button
            onClick={handleAddMedication}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Medication
          </button>
        </div>

        {/* Medication Cards Table/Grid */}
        <div className="space-y-4">
          {medications.map((med, idx) => (
            <div
              key={med.id}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-400">
                      0{idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={med.medicationName}
                      onChange={(e) => handleUpdateMed(med.id, 'medicationName', e.target.value)}
                      className="font-bold text-base text-slate-900 dark:text-slate-100 bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 focus:outline-none focus:border-teal-500"
                    />
                    <input
                      type="text"
                      value={med.strength}
                      onChange={(e) => handleUpdateMed(med.id, 'strength', e.target.value)}
                      placeholder="Strength (e.g. 40 mg)"
                      className="font-semibold text-xs px-2 py-0.5 bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300 rounded border border-teal-200 dark:border-teal-800"
                    />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Generic: {med.genericName} · Form: {med.dosageForm}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded">
                    {med.fdaSchedule}
                  </span>
                  <button
                    onClick={() => handleRemoveMedication(med.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Remove medication"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Timing, Food Requirement & Target Time */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">
                    Frequency / Dose Time
                  </label>
                  <input
                    type="text"
                    value={med.frequency}
                    onChange={(e) => handleUpdateMed(med.id, 'frequency', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 font-semibold mb-1">
                    Scheduled Time (24h)
                  </label>
                  <input
                    type="time"
                    value={med.targetTime}
                    onChange={(e) => handleUpdateMed(med.id, 'targetTime', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 font-semibold mb-1">
                    Food Relationship
                  </label>
                  <select
                    value={med.withFood}
                    onChange={(e) => handleUpdateMed(med.id, 'withFood', e.target.value as FoodRequirement)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
                  >
                    <option value="with_food">Must Take With Food</option>
                    <option value="empty_stomach">Empty Stomach (1h before/2h after)</option>
                    <option value="with_or_without_food">With or Without Food</option>
                    <option value="special">Special Meal Timing</option>
                  </select>
                </div>
              </div>

              {/* Food instructions and Spoken Pharmacist Advice */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">
                    Dietary & Food Instructions for Patient
                  </label>
                  <input
                    type="text"
                    value={med.foodInstructions}
                    onChange={(e) => handleUpdateMed(med.id, 'foodInstructions', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 font-semibold mb-1">
                    Pharmacist Verbal Tip / Spoken Counseling
                  </label>
                  <input
                    type="text"
                    value={med.pharmacistAdvice}
                    onChange={(e) => handleUpdateMed(med.id, 'pharmacistAdvice', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>

              {/* Warnings List */}
              <div className="text-xs">
                <span className="font-semibold text-slate-500">Key Safety Warnings: </span>
                <span className="text-rose-700 dark:text-rose-400">
                  {med.warnings.join(' · ')}
                </span>
              </div>

              {/* Auxiliary Pictorial Warning Preview */}
              {detectMedicationPictorials(med.foodInstructions, med.warnings, med.withFood, med.medicationName).length > 0 && (
                <div className="pt-2.5 border-t border-slate-200/50 dark:border-slate-800/50 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
                    Auxiliary Pictorial Label:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {detectMedicationPictorials(med.foodInstructions, med.warnings, med.withFood, med.medicationName).map((pType) => (
                      <PictorialWarningLabel key={pType} type={pType} size="sm" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Dietary Warnings Overview */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">
            Identified Dietary & Food-Drug Interactions
          </h3>
          <div className="space-y-2.5 text-xs">
            {dietaryWarnings.map((dw, idx) => (
              <div
                key={idx}
                className="p-3 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-amber-900 dark:text-amber-200">
                      {dw.foodOrDrink}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 shrink-0">
                      {dw.riskLevel}
                    </span>
                  </div>
                  <p className="text-amber-800 dark:text-amber-300">
                    {dw.explanation}
                  </p>
                </div>

                <div className="shrink-0">
                  <PictorialWarningLabel
                    type={detectFoodQueryPictorial(dw.foodOrDrink)}
                    size="sm"
                    className="bg-white/80 dark:bg-slate-900/80 shadow-none border-amber-300"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Publish Action Footer */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Dr. Sarah Jenkins, PharmD · ScriptCare Clinical Pharmacy
          </div>
          <button
            onClick={handlePublish}
            className="px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold rounded-xl transition-colors shadow-sm flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Publish Updates to Patient App
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
