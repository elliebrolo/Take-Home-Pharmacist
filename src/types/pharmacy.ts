export type TimeOfDay = 'morning' | 'noon' | 'evening' | 'bedtime';

export type FoodRequirement = 'with_food' | 'empty_stomach' | 'with_or_without_food' | 'special';

export type UrgencyLevel = 'emergency_911' | 'urgent_care' | 'clinical_call' | 'mild_monitoring';

/**
 * Where a patient-facing medication image came from. Listed in order of preference.
 *  - pharmacist_photo : the pharmacist photographed the dispensed pill.
 *  - nlm_rximage      : US reference photo (NLM RxImage). Same drug and strength, but a
 *                       US manufacturer, so the pill may look different from the Canadian one.
 *  - dailymed_label   : package/label image from the FDA label on DailyMed (not a pill photo).
 */
export type PhotoSource = 'pharmacist_photo' | 'nlm_rximage' | 'dailymed_label';

/**
 * A medication image confirmed by a pharmacist. It is only ever shown to patients
 * when every field is present and `boundTo` still matches the medication's
 * current identity (see `getVerifiedPhoto`).
 */
export interface VerifiedMedicationPhoto {
  source: PhotoSource;
  /** Fingerprint of the product (NDC, DIN, name, strength, form) this photo was confirmed against. */
  boundTo: string;
  /** Same-origin path (/uploads/..., /nlm-images/...) or a DailyMed image URL. */
  imageUrl: string;
  /** Link to the source record (DailyMed label), when there is one. */
  sourceUrl?: string;
  /** Provenance line shown to the patient, e.g. "Courtesy of the U.S. National Library of Medicine". */
  attribution: string;
  /** Source-specific facts for the record and caption. */
  details?: {
    labeler?: string;
    imprint?: string;
    ndc?: string;
    labelTitle?: string;
    labelVersion?: string;
    setId?: string;
  };
  retrievedAt?: string; // ISO date, for sources fetched from an external service
  confirmedBy: string; // pharmacist who confirmed the match
  confirmedAt: string; // ISO date
  /** True for pre-attached sample images that no pharmacist has verified (demo data only). */
  demo?: boolean;
}

export interface MedicationScheduleItem {
  id: string;
  /** RxNorm concept id of the ingredient, set by the server when a pharmacist approves the record. */
  rxcui?: string;
  /** Health Canada Drug Identification Number of the dispensed product, entered by the pharmacist. */
  din?: string;
  /** National Drug Code of the dispensed bottle (US products), entered by the pharmacist. */
  ndc?: string;
  /**
   * Plain-language description typed by the pharmacist (e.g. "white, oval, marked PD 157").
   * Shown as text when there is no photo; never used to draw an image.
   */
  appearance?: string;
  /** Present only after a pharmacist has confirmed the image matches the dispensed product. */
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
  /** Set by the server only: who signed this version off and when. Patients only ever receive approved records. */
  approval?: { by: string; at: string };
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

export interface ChatCitation {
  id: string;
  label: string;
  quote: string;
  url?: string;
}

export interface ChatMessage {
  id: string;
  /** 'pharmacist_ai' is the AI assistant; 'pharmacist' is a reply written by a person. */
  sender: 'user' | 'pharmacist_ai' | 'pharmacist' | 'system_alert';
  kind?: string;
  citations?: ChatCitation[];
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
  ndc: string; // the NDC form that matched on DailyMed
  setId: string;
  labelTitle: string;
  labelVersion: string;
  sourceUrl: string;
  retrievedAt: string;
  candidates: PhotoCandidate[];
}

/** A US reference pill photo from NLM's RxImage set. */
export interface NlmCandidate {
  imageUrl: string;
  name: string;
  ndc: string;
  rxcui: string;
  labeler: string;
  imprint: string;
  shape: string;
  color: string;
  sizeMm: number | null;
}

/** Health Canada Drug Product Database record for a DIN. */
export interface DpdProduct {
  din: string;
  brandName: string;
  company: string;
  ingredients: Array<{ name: string; strength: string }>;
  form: string;
  status: string;
}
