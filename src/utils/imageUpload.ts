const MAX_DIMENSION = 1200;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Shrinks a camera photo to a sensible size before upload (phone photos are often
 * 5-10 MB). Falls back to the original file if the browser cannot resize it.
 */
export async function prepareImageForUpload(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error('Choose a JPEG, PNG or WebP photo.');
  }
  try {
    const bitmap = await createImageBitmap(file); // applies EXIF orientation in modern browsers
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (blob) return blob;
  } catch {
    /* fall through to the original file */
  }
  if (file.size > MAX_BYTES) throw new Error('That photo is too large. Use one under 5 MB.');
  return file;
}

export async function uploadMedicationPhoto(blob: Blob): Promise<string> {
  const resp = await fetch('/api/medication-photo/upload', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'Upload failed.');
  return data.url as string;
}
