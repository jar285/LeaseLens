// Sprint 13 §3c — multipart upload validation. Pure function; reads
// caps from `env`. The page-count cap is enforced after parsePdf
// returns (different validation surface — `validateLeaseUpload` only
// sees the File and cannot count pages without parsing).

import { env } from '@/lib/env';

export type ValidateLeaseUploadResult =
  | { ok: true; file: File }
  | { ok: false; error: string };

const PDF_CONTENT_TYPE = 'application/pdf';

export function validateLeaseUpload(
  file: File | null | undefined,
): ValidateLeaseUploadResult {
  if (!file) {
    return { ok: false, error: 'A PDF file is required.' };
  }
  if (file.type !== PDF_CONTENT_TYPE) {
    return {
      ok: false,
      error: `Unsupported content-type "${file.type ?? 'unknown'}". Upload a PDF (application/pdf).`,
    };
  }
  if (file.size === 0) {
    return { ok: false, error: 'File is empty (0 bytes).' };
  }
  if (file.size > env.LEASELENS_LEASE_MAX_BYTES) {
    return {
      ok: false,
      error: `File size ${file.size} bytes exceeds the limit of ${env.LEASELENS_LEASE_MAX_BYTES} bytes.`,
    };
  }
  return { ok: true, file };
}
