import { apiFetch } from '../utils/api';
import React, { useState } from 'react';
import { Utensils, AlertTriangle, CheckCircle, ShieldAlert, Search, RefreshCw, Info, HelpCircle } from 'lucide-react';
import { DietaryWarning, MedicationScheduleItem } from '../types/pharmacy';
import {
  PictorialWarningLabel,
  detectFoodQueryPictorial,
  PICTORIAL_DEFINITIONS,
  PictorialType,
} from './PictorialWarningLabel';

interface FoodSafetyCheckerProps {
  medications: MedicationScheduleItem[];
  knownWarnings: DietaryWarning[];
}

interface FoodSource {
  id: string;
  label: string;
  quote: string;
  url?: string;
}

interface InteractionResult {
  /** 'caution': a source mentions this food. 'unknown': nothing found. The app never says a food is safe. */
  verdict: 'caution' | 'unknown';
  isSafe: false;
  severity: 'none' | 'advisory' | 'moderate' | 'severe';
  title: string;
  summary: string;
  details: string;
  recommendation: string;
  affectedMedications: string[];
  sources: FoodSource[];
}

export const FoodSafetyChecker: React.FC<FoodSafetyCheckerProps> = ({
  medications,
  knownWarnings,
}) => {
  const [searchFood, setSearchFood] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<InteractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const quickFoods = [
    'Grapefruit Juice',
    'Whole Milk / Yogurt',
    'Fresh Spinach Salad',
    'Bananas (Potassium)',
    'Alcohol / Beer / Wine',
    'Morning Espresso / Coffee',
    'Aged Cheddar Cheese',
    'Cranberry Juice',
  ];

  const handleCheckFood = async (food: string) => {
    const item = food.trim();
    if (!item) return;
    setSearchFood(item);
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await apiFetch('/api/check-food-interaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foodItem: item }),
      });

      const data = await response.json();
      if (response.ok && data.success && data.result) {
        setResult(data.result);
      } else {
        // No local guess: a wrong "this is fine" is worse than no answer.
        setError(data.error || "We couldn't check that right now. Please ask your pharmacist.");
      }
    } catch {
      setError("We couldn't check that right now. Please ask your pharmacist.");
    } finally {
      setIsLoading(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'severe':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 text-sm font-bold rounded-md">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            Do not combine
          </span>
        );
      case 'moderate':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-sm font-bold rounded-md">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Be careful
          </span>
        );
      case 'advisory':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 text-sm font-bold rounded-md">
            <Info className="w-3.5 h-3.5 text-blue-600" />
            Timing tip
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-sm font-bold rounded-md">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            No known problem
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Introduction */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 rounded-xl">
            <Utensils className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Food check
            </h2>
            <p className="text-sm text-slate-500">
              Some foods and drinks do not mix with some medicines. Type a food or drink to check it against your medicines.
            </p>
          </div>
        </div>

        {/* Live Food Checker Input */}
        <div className="mt-6">
          <label className="block text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Is this food or drink OK with my medicines?
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFood}
                onChange={(e) => setSearchFood(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCheckFood(searchFood)}
                aria-label="Food or drink to check"
                placeholder="Type a food or drink, like milk or coffee"
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
              />
            </div>
            <button
              onClick={() => handleCheckFood(searchFood)}
              disabled={isLoading || !searchFood.trim()}
              className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Checking…
                </>
              ) : (
                'Check'
              )}
            </button>
          </div>

          {/* Quick Click Badges */}
          <div className="mt-3 flex flex-wrap gap-2 items-center text-sm">
            <span className="text-slate-400 font-medium">Try:</span>
            {quickFoods.map((food, idx) => (
              <button
                key={idx}
                onClick={() => handleCheckFood(food)}
                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer"
              >
                {food}
              </button>
            ))}
          </div>
        </div>

        {/* Live Interaction Analysis Result */}
        {result && (
          <div
            className={`mt-6 p-5 rounded-xl border transition-all ${
              result.severity === 'severe'
                ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900'
                : result.severity === 'moderate'
                ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900'
                : result.severity === 'advisory'
                ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {result.title}
                </h3>
              </div>
              {getSeverityBadge(result.severity)}
            </div>

            {/* Prominent Visual Pictorial Warning Label for Prohibited or Advisory Foods */}
            {result.severity !== 'none' ? (
              <div className="my-3">
                <PictorialWarningLabel
                  type={detectFoodQueryPictorial(searchFood)}
                  size="lg"
                  customSubtitle={result.recommendation}
                  className="w-full bg-white dark:bg-slate-900"
                />
              </div>
            ) : (
              /* Nothing found: say so plainly. This is not a safety confirmation. */
              <div className="my-3 p-3.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-600 text-white flex items-center justify-center font-bold text-lg shrink-0" aria-hidden="true">
                  ?
                </div>
                <div>
                  <div className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Not checked: ask your pharmacist</div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">This does not mean it is safe.</div>
                </div>
              </div>
            )}

            <p className="text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed mb-3">
              {result.summary}
            </p>

            {result.affectedMedications?.length > 0 && (
              <div className="mb-3 text-sm">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Affects:{' '}
                </span>
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  {result.affectedMedications.join(', ')}
                </span>
              </div>
            )}

            <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-lg text-sm space-y-1.5 border border-slate-200/50 dark:border-slate-800/50">
              <div>
                <strong className="text-slate-900 dark:text-slate-100">What to do: </strong>
                <span className="text-slate-700 dark:text-slate-300">{result.recommendation}</span>
              </div>
              {result.sources?.length > 0 && (
                <details>
                  <summary className="font-semibold text-teal-800 dark:text-teal-300 cursor-pointer min-h-8">Where this comes from</summary>
                  <ul className="mt-1 space-y-2">
                    {result.sources.map((src) => (
                      <li key={src.id} className="text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{src.label}: </span>
                        <span className="italic">“{src.quote}”</span>{' '}
                        {src.url && (
                          <a href={src.url} target="_blank" rel="noopener noreferrer" className="underline text-teal-800 dark:text-teal-300">
                            Open label
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {result.details && (
                <details>
                  <summary className="font-semibold text-teal-800 dark:text-teal-300 cursor-pointer min-h-8">Why?</summary>
                  <div className="text-slate-600 dark:text-slate-300 mt-1">{result.details}</div>
                </details>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-rose-50 text-rose-700 rounded-lg text-sm font-medium">
            {error}
          </div>
        )}
      </div>

      {/* Verified Consultation Dietary Warnings */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Foods and drinks your pharmacist told you about
          </h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          These come from your visit with your pharmacist.
        </p>

        {knownWarnings.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            Your pharmacist did not flag any foods or drinks. Take your pills with water unless you were told otherwise.
          </div>
        ) : (
          <div className="space-y-4">
            {knownWarnings.map((warning, idx) => {
              const picType = detectFoodQueryPictorial(warning.foodOrDrink);
              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        {warning.foodOrDrink}
                      </span>
                      <span className="text-sm text-slate-500">
                        · Affects: {warning.interactsWith.join(', ')}
                      </span>
                    </div>
                    {getSeverityBadge(warning.riskLevel)}
                  </div>

                  {/* High-Visibility Prohibition Sign & Label */}
                  <div className="my-2.5">
                    <PictorialWarningLabel
                      type={picType}
                      size="md"
                      className="w-full bg-white dark:bg-slate-900"
                    />
                  </div>

                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
                    {warning.explanation}
                  </p>

                  {warning.safeAlternative && (
                    <div className="text-sm text-teal-800 dark:text-teal-300 font-medium">
                      ✓ Instead: {warning.safeAlternative}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Visual Pharmacy Auxiliary Warning Signs Index / Legend */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <HelpCircle className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            What the signs mean
          </h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          A red circle with a line through it means <strong>do not have this</strong>.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(
            [
              'no_grapefruit',
              'no_alcohol',
              'no_dairy',
              'no_potassium_salt',
              'take_with_food',
              'empty_stomach',
              'separate_probiotics',
              'no_caffeine',
              'consistent_vitamin_k',
            ] as PictorialType[]
          ).map((type) => (
            <PictorialWarningLabel
              key={type}
              type={type}
              size="sm"
              className="bg-slate-50 dark:bg-slate-800/80 w-full"
            />
          ))}
        </div>
      </div>
    </div>
  );
};
