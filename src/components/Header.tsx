import React from 'react';
import { ShieldAlert, ArrowLeftRight } from 'lucide-react';

interface HeaderProps {
  currentView: 'patient' | 'pharmacist';
  onToggleView: () => void;
  onOpenEmergencyModal: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onToggleView,
  onOpenEmergencyModal,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            // stay in current view
          }}
          className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          <div className="w-8 h-8 rounded-lg bg-teal-700 flex items-center justify-center text-white font-black text-sm shadow-sm">
            Rx
          </div>
          <span>ScriptCare AI</span>
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <button
            onClick={() => {
              if (currentView !== 'patient') onToggleView();
            }}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              currentView === 'patient'
                ? 'text-teal-700 dark:text-teal-400 font-bold'
                : ''
            }`}
          >
            Patient App
          </button>
          <button
            onClick={() => {
              if (currentView !== 'pharmacist') onToggleView();
            }}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              currentView === 'pharmacist'
                ? 'text-teal-700 dark:text-teal-400 font-bold'
                : ''
            }`}
          >
            Pharmacist Workspace
          </button>
          <button
            onClick={onOpenEmergencyModal}
            className="hover:text-rose-600 transition-colors whitespace-nowrap shrink-0 text-rose-600 dark:text-rose-400 font-semibold"
          >
            Emergency & Triage
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onToggleView}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-teal-600 rounded-lg hover:bg-slate-800 dark:hover:bg-teal-500 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Switch to {currentView === 'patient' ? 'Pharmacist Suite' : 'Patient App'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
