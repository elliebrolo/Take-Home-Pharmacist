import React from 'react';
import { LogOut } from 'lucide-react';

interface HeaderProps {
  role: 'patient' | 'pharmacist' | null;
  userLabel?: string;
  onSignOut: () => void;
  onOpenEmergencyModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ role, userLabel, onSignOut, onOpenEmergencyModal }) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        <div className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          <div className="w-8 h-8 rounded-lg bg-teal-700 flex items-center justify-center text-white font-black text-sm shadow-sm">Rx</div>
          <span>TakeHomePharmacist</span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          {role && (
            <span className="text-teal-700 dark:text-teal-400 font-bold">{role === 'patient' ? 'Patient App' : 'Pharmacist Workspace'}</span>
          )}
          <button
            onClick={onOpenEmergencyModal}
            className="hover:text-rose-600 transition-colors whitespace-nowrap shrink-0 text-rose-600 dark:text-rose-400 font-semibold"
          >
            Emergency numbers
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {role && (
            <>
              <span className="hidden sm:block text-sm text-slate-600 dark:text-slate-300 max-w-40 truncate">{role === 'pharmacist' ? userLabel : ''}</span>
              <button
                onClick={onSignOut}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-teal-600 rounded-lg hover:bg-slate-800 dark:hover:bg-teal-500 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
