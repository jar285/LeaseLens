// S19.3 — React adapter for the pure `computeScanNarrative` use case.
//
// Reads `toolEvents` + `activeLease` from ChatStreamContext, memoises
// the call, and returns the result. The hook is a 5-line adapter on
// purpose — all the derivation logic lives in scan-narrative.ts where
// it can be unit-tested without a React renderer.

'use client';

import { useMemo } from 'react';
import { useLeaseParser } from './LeaseParserContext';
import {
  computeScanNarrative,
  type ScanNarrativeOutput,
} from './scan-narrative';

export function useScanNarrative(): ScanNarrativeOutput {
  const { toolEvents, activeLease } = useLeaseParser();
  return useMemo(
    () => computeScanNarrative({ events: toolEvents, lease: activeLease }),
    [toolEvents, activeLease],
  );
}
