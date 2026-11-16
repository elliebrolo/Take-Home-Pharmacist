import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { PhotoSourceProps } from './photoSourceTypes';
import { photoBinding } from '../utils/medicationPhoto';
import { prepareImageForUpload, uploadMedicationPhoto } from '../utils/imageUpload';

/**
 * Primary source: the pharmacist photographs the pill that was actually dispensed.
 * The file is only uploaded when the pharmacist confirms it, so abandoned
 * previews leave nothing on the server.
 */
export const PhotoSourceUpload: React.FC<PhotoSourceProps> = ({ medication: med, pharmacistName, onConfirm }) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleConfirm = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await prepareImageForUpload(file);
      const url = await uploadMedicationPhoto(blob);
      onConfirm({
        source: 'pharmacist_photo',
        boundTo: photoBinding(med), // the medication as it is NOW, not when the file was chosen
        imageUrl: url,
        attribution: `Photographed by ${pharmacistName}`,
        confirmedBy: pharmacistName,
        confirmedAt: new Date().toISOString(),
      });
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err: any) {
      setError(err?.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-slate-600 dark:text-slate-300">
        Best option: photograph the tablet or capsule you actually dispensed. It is the only source that always matches the
        Canadian product. Use good light and a plain background, and show the side with the markings.
      </p>

      <div>
        <label htmlFor={`photo-file-${med.id}`} className="block text-slate-500 font-semibold mb-1">
          Take or choose a photo of the pill
        </label>
        <input
          ref={inputRef}
          id={`photo-file-${med.id}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(e) => {
            setError(null);
            setFile(e.target.files?.[0] ?? null);
          }}
          className="block w-full text-slate-700 dark:text-slate-200 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:font-semibold dark:file:bg-teal-600"
        />
      </div>

      {file && (
        <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
          {previewUrl && (
            <img src={previewUrl} alt="Preview of the photo you chose" className="w-28 h-28 object-contain bg-slate-100 rounded border border-slate-200" />
          )}
          <div className="space-y-2">
            <p className="text-slate-600 dark:text-slate-300">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Camera className="w-3.5 h-3.5" aria-hidden="true" />}
              This is the pill I dispensed
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="font-semibold text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
};
