'use server';

// Sprint 44A.3 — server action the client error boundaries call to record a
// crash in the server logger. ALLOWLIST ONLY: the error digest + name. We never
// send the client error message (it could carry PII); the logger's serializer
// would scrub it anyway, but the safest contract is not to send it at all.

import { logger } from './logger';

export async function reportClientError(info: {
  digest?: string;
  name?: string;
}): Promise<void> {
  logger.error(
    { source: 'client', digest: info.digest, errName: info.name },
    'client.error_boundary',
  );
}
