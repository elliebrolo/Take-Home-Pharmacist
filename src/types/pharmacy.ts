export type TimeOfDay = 'morning' | 'noon' | 'evening' | 'bedtime';

export type FoodRequirement = 'with_food' | 'empty_stomach' | 'with_or_without_food' | 'special';

export type UrgencyLevel = 'emergency_911' | 'urgent_care' | 'clinical_call' | 'mild_monitoring';

/**
 * A photograph of the dispensed product, taken from its FDA label on DailyMed
 * and confirmed by a pharmacist. It is only ever shown to patients when every
 * field is present and `ndc` still matches the medication's current NDC
 * (see `getVerifiedPhoto`).
 */
export interface VerifiedMedicationPhoto {
  ndc: string; // NDC the photo was confirmed against
  imageUrl: string; // DailyMed-hosted image
  sourceUrl: string; // DailyMed label page, for attribution
  setId: string; // SPL set id of the label
  labelTitle: string;
  labelVersion: string;
  retrievedAt: string; // ISO date
  confirmedBy: string; // pharmacist who confirmed the match
  confirmedAt: string; // ISO date
}

export interface MedicationScheduleItem {
  id: string;
  /** National Drug Code of the dispensed bottle, entered by the pharmacist. */
  ndc?: string;
  /** Present only after a pharmacist has confirmed the photo matches the dispensed product. */
  photo?: VerifiedMedicationPhoto;
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

/**
 * A candidate image found on a DailyMed label. Never shown to patients until a
 * pharmacist confirms it. One label can cover several strengths and also
 * contains carton art and chemical structures, so the match must be checked by eye.
 */
export interface PhotoCandidate {
  name: string;
  imageUrl: string;
}

export interface PhotoLookupResult {
  ndc: string;
  setId: string;
  labelTitle: string;
  labelVersion: string;
  sourceUrl: string;
  retrievedAt: string;
  candidates: PhotoCandidate[];
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
