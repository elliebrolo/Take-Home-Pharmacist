export type TimeOfDay = 'morning' | 'noon' | 'evening' | 'bedtime';

export type FoodRequirement = 'with_food' | 'empty_stomach' | 'with_or_without_food' | 'special';

export type UrgencyLevel = 'emergency_911' | 'urgent_care' | 'clinical_call' | 'mild_monitoring';

export interface MedicationScheduleItem {
  id: string;
  medicationName: string;
  genericName: string;
  brandName?: string;
  strength: string;
  dosageForm: string;
  doseAmount: string;
  frequency: string;
  timeOfDay: TimeOfDay[];
  targetTime: string; // e.g. "08:00" or "20:00"
  withFood: FoodRequirement;
  foodInstructions: string;
  purpose: string;
  pharmacistAdvice: string;
  warnings: string[];
  fdaSchedule: string; // e.g. "Rx-Only", "Schedule II", "Schedule IV", "OTC"
  blackBoxWarning?: string | null;
  refillsRemaining?: number;
  nextRefillDate?: string;
  pillColor?: string;
  pillShape?: string;
  imprint?: string;
}

export interface DietaryWarning {
  category: string;
  foodOrDrink: string;
  riskLevel: 'severe' | 'moderate' | 'advisory';
  interactsWith: string[];
  explanation: string;
  safeAlternative?: string;
}

export interface EmergencyTrigger {
  symptoms: string[];
  action: string;
  urgency: 'immediate_911' | 'urgent_care' | 'call_pharmacy';
}

export interface ConsultationRecord {
  id: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender?: string;
  pharmacistName: string;
  pharmacistTitle: string;
  consultationDate: string;
  pharmacyName: string;
  pharmacyPhone: string;
  rawTranscript: string;
  clinicalSummary: string;
  medications: MedicationScheduleItem[];
  generalDietaryWarnings: DietaryWarning[];
  emergencyTriggers: EmergencyTrigger[];
}

export interface DoseLog {
  id: string;
  medicationId: string;
  scheduledTime: string;
  takenAt?: string;
  status: 'pending' | 'taken' | 'snoozed' | 'skipped';
  dateStr: string; // YYYY-MM-DD
}

export interface ClinicLocation {
  name: string;
  distance: string;
  address: string;
  phone: string;
  isOpen247: boolean;
  estimatedWaitTime: string;
}

export interface HotlineContact {
  name: string;
  phone: string;
  badge: string;
}

export interface EmergencyTriageResult {
  isUrgent: boolean;
  severity: UrgencyLevel;
  matchedSymptom: string;
  patientInstruction: string;
  recommendedClinics: ClinicLocation[];
  hotlines: HotlineContact[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'pharmacist_ai' | 'system_alert';
  text: string;
  timestamp: string;
  isEmergencyAlert?: boolean;
  triageData?: EmergencyTriageResult;
  groundedInNotes?: string[];
}

export interface DrugCatalogItem {
  name: string;
  brandName: string;
  genericName: string;
  drugClass: string;
  fdaSchedule: string;
  standardDosage: string;
  blackBoxWarning?: string | null;
  boxedWarningText?: string | null;
  commonIndications: string;
  commonSideEffects: string[];
  foodInteractions: Array<{
    food: string;
    severity: 'severe' | 'moderate' | 'advisory';
    effect: string;
    instruction: string;
  }>;
  storage: string;
  pregnancyCategory: string;
  pillDescription: string;
}
