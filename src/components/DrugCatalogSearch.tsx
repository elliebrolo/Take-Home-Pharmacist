import React, { useState, useEffect } from 'react';
import { Pill, Search, ShieldAlert, AlertTriangle, FileText, CheckCircle2, PackageCheck } from 'lucide-react';
import { DrugCatalogItem } from '../types/pharmacy';
import { PictorialWarningLabel, detectFoodQueryPictorial } from './PictorialWarningLabel';

interface DrugCatalogSearchProps {
  initialSearch?: string;
}

export const DrugCatalogSearch: React.FC<DrugCatalogSearchProps> = ({ initialSearch = '' }) => {
  const [query, setQuery] = useState(initialSearch);
  const [drugs, setDrugs] = useState<DrugCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState<DrugCatalogItem | null>(null);

  const fetchDrugs = async (searchTerm: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/drug-lookup?q=${encodeURIComponent(searchTerm)}`);
      const data = await response.json();
      setDrugs(data.results || []);
      if (data.results?.length > 0 && !selectedDrug) {
        setSelectedDrug(data.results[0]);
      }
    } catch (e) {
      console.error('Failed to query pharmacy database:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDrugs(query);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDrugs(query);
  };

  const getScheduleBadge = (schedule: string) => {
    if (schedule.includes('Schedule II') || schedule.includes('C-II')) {
      return (
        <span className="px-2.5 py-0.5 text-xs font-bold bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 rounded border border-purple-300 dark:border-purple-800">
          DEA Schedule II Controlled
        </span>
      );
    }
    if (schedule.includes('Schedule IV') || schedule.includes('C-IV')) {
      return (
        <span className="px-2.5 py-0.5 text-xs font-bold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 rounded border border-indigo-300 dark:border-indigo-800">
          DEA Schedule IV Controlled
        </span>
      );
    }
    if (schedule.includes('OTC')) {
      return (
        <span className="px-2.5 py-0.5 text-xs font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 rounded border border-emerald-300 dark:border-emerald-800">
          Over The Counter (OTC)
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 text-xs font-bold bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 rounded border border-teal-300 dark:border-teal-800">
        FDA Rx-Only (Legend Drug)
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 rounded-xl">
            <Pill className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Pharmacy Drug Database & FDA Warning Schedules
            </h2>
            <p className="text-sm text-slate-500">
              Search any prescription or OTC medication to view FDA control schedules, Black Box warnings, standard dosing, and pill identifiers.
            </p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                fetchDrugs(e.target.value);
              }}
              placeholder="Search medication name (e.g. Atorvastatin, Metformin, Lisinopril, Warfarin, Cipro)..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-colors shrink-0"
          >
            Search Catalog
          </button>
        </form>

        {/* Quick Suggestion Pills */}
        <div className="mt-3 flex flex-wrap gap-2 items-center text-xs">
          <span className="text-slate-400 font-medium">Common looked-up drugs:</span>
          {['Atorvastatin', 'Metformin', 'Lisinopril', 'Metoprolol', 'Amoxicillin-Clavulanate', 'Warfarin', 'Ciprofloxacin', 'Alprazolam'].map(
            (med, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setQuery(med);
                  fetchDrugs(med);
                }}
                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
              >
                {med}
              </button>
            )
          )}
        </div>
      </div>

      {/* Main Split Grid: Drug List on Left, Comprehensive Profile on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left List */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            <span>Matching Medications ({drugs.length})</span>
            {isLoading && <span className="text-blue-600 animate-pulse">Searching...</span>}
          </div>

          {drugs.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-sm text-slate-500">
              No matching medications found for "{query}". Try typing a generic or brand name.
            </div>
          ) : (
            <div className="space-y-2">
              {drugs.map((drug) => {
                const isSelected = selectedDrug?.name === drug.name;
                return (
                  <button
                    key={drug.name}
                    onClick={() => setSelectedDrug(drug)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 shadow-sm'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                          {drug.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {drug.brandName} · {drug.genericName}
                        </div>
                      </div>
                      <div className="shrink-0">{getScheduleBadge(drug.fdaSchedule)}</div>
                    </div>

                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                      {drug.drugClass}
                    </div>

                    {drug.blackBoxWarning && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Black Box Warning</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Detail Card */}
        <div className="lg:col-span-7">
          {selectedDrug ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
              {/* Header Title */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {selectedDrug.name}
                  </h3>
                  {getScheduleBadge(selectedDrug.fdaSchedule)}
                </div>
                <div className="text-sm text-slate-500 font-medium">
                  Brand Name: <span className="text-slate-800 dark:text-slate-200">{selectedDrug.brandName}</span> · Generic: <span className="text-slate-800 dark:text-slate-200">{selectedDrug.genericName}</span>
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-400 mt-1 font-semibold">
                  Pharmacological Class: {selectedDrug.drugClass}
                </div>
              </div>

              {/* FDA Black Box Warning (if applicable) */}
              {selectedDrug.blackBoxWarning && (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-500 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-bold text-sm tracking-wide">
                    <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>FDA BOXED WARNING: {selectedDrug.blackBoxWarning}</span>
                  </div>
                  <p className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed font-medium">
                    {selectedDrug.boxedWarningText}
                  </p>
                </div>
              )}

              {/* Clinical Dosing & Administration Schedule */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Standard Prescribing & Dosing Schedule
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedDrug.standardDosage}
                </p>
                <div className="text-xs text-slate-500">
                  <strong className="text-slate-700 dark:text-slate-300">Clinical Indications: </strong>
                  {selectedDrug.commonIndications}
                </div>
              </div>

              {/* Food & Dietary Warnings */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                  Critical Food & Beverage Warnings
                </h4>
                <div className="space-y-2.5">
                  {selectedDrug.foodInteractions.map((fi, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border text-xs ${
                        fi.severity === 'severe'
                          ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900'
                          : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {fi.food}
                        </span>
                        <span
                          className={`font-semibold uppercase text-[10px] ${
                            fi.severity === 'severe' ? 'text-rose-600' : 'text-amber-600'
                          }`}
                        >
                          {fi.severity} Warning
                        </span>
                      </div>

                      {/* Visual Auxiliary Prohibition Sign */}
                      <div className="my-2">
                        <PictorialWarningLabel
                          type={detectFoodQueryPictorial(fi.food)}
                          size="sm"
                          customSubtitle={fi.instruction}
                          className="w-full bg-white dark:bg-slate-900"
                        />
                      </div>

                      <p className="text-slate-600 dark:text-slate-300 mb-1">{fi.effect}</p>
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        → Instruction: {fi.instruction}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pill Appearance & Storage */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 mb-1">
                    <PackageCheck className="w-3.5 h-3.5 text-teal-600" />
                    Physical Appearance / Imprint
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">
                    {selectedDrug.pillDescription}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    Storage & Climate Requirements
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">
                    {selectedDrug.storage}
                  </p>
                </div>
              </div>

              {/* Common Side Effects */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Frequently Reported Side Effects
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDrug.commonSideEffects.map((se, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs"
                    >
                      {se}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
              Select a medication on the left to review FDA schedule, black box labels, and prescribing details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
