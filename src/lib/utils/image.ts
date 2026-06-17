/**
 * Shrinks a captured photo before upload so the crop-diagnosis request is fast
 * and small (full-res phone photos are 2–4 MB and routinely blow the request
 * timeout). Uses expo-image-manipulator when the native module is present in
 * the build; otherwise it returns the original image unchanged so the app keeps
 * working on builds that predate the dependency.
 */
const MAX_DIMENSION = 1280;
const COMPRESS_QUALITY = 0.6;

export async function compressForUpload(
  uri: string,
  mimeType?: string | null,
): Promise<{ uri: string; mimeType: string }> {
  const fallback = { uri, mimeType: mimeType ?? 'image/jpeg' };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Manip: any = require('expo-image-manipulator');
    const jpeg = Manip?.SaveFormat?.JPEG ?? 'jpeg';

    // Legacy API (manipulateAsync) — present through SDK 55.
    if (typeof Manip?.manipulateAsync === 'function') {
      const result = await Manip.manipulateAsync(
        uri,
        [{ resize: { width: MAX_DIMENSION } }],
        { compress: COMPRESS_QUALITY, format: jpeg },
      );
      if (result?.uri) return { uri: result.uri, mimeType: 'image/jpeg' };
    }

    // New context API (SDK 52+): ImageManipulator.manipulate(...).renderAsync().
    const ctxApi = Manip?.ImageManipulator ?? Manip;
    if (typeof ctxApi?.manipulate === 'function') {
      const image = await ctxApi.manipulate(uri).resize({ width: MAX_DIMENSION }).renderAsync();
      const saved = await image.saveAsync({ compress: COMPRESS_QUALITY, format: jpeg });
      if (saved?.uri) return { uri: saved.uri, mimeType: 'image/jpeg' };
    }
  } catch {
    // Native module not in this build, or manipulation failed — upload original.
  }
  return fallback;
}

/**
 * Read a local image file as a base64 string (no data: prefix). Robust across
 * expo-file-system API changes (new File API in SDK 54+, legacy readAsStringAsync).
 * Returns null if it can't be read.
 */
export async function uriToBase64(uri: string): Promise<string | null> {
  // New File API (SDK 54+)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FS: any = require('expo-file-system');
    if (FS?.File) {
      const file = new FS.File(uri);
      if (typeof file.base64 === 'function') return await file.base64();
      if (typeof file.base64Sync === 'function') return file.base64Sync();
    }
    if (typeof FS?.readAsStringAsync === 'function') {
      const enc = FS.EncodingType?.Base64 ?? 'base64';
      return await FS.readAsStringAsync(uri, { encoding: enc });
    }
  } catch {
    /* try legacy entrypoint */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Legacy: any = require('expo-file-system/legacy');
    if (typeof Legacy?.readAsStringAsync === 'function') {
      const enc = Legacy.EncodingType?.Base64 ?? 'base64';
      return await Legacy.readAsStringAsync(uri, { encoding: enc });
    }
  } catch {
    /* give up */
  }
  return null;
}
