import { MedicationScheduleItem, VerifiedMedicationPhoto } from '../types/pharmacy';

/** Props shared by the three photo-source panels in the pharmacist workspace. */
export interface PhotoSourceProps {
  medication: MedicationScheduleItem;
  pharmacistName: string;
  /** Called only when the pharmacist presses a "confirm" button. */
  onConfirm: (photo: VerifiedMedicationPhoto) => void;
}
