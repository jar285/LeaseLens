// Sprint 25 — left-pane state machine.
//
// Replaces the prior `activeLease?.pdfUrl ? <PdfViewer> : <UploadColumn>`
// ternary with an explicit four-state discriminated union, so the new
// "restoring from IndexedDB" and "cache-miss reattach" states can't
// silently disagree with each other. Reading the JSX is a switch on
// state.kind — impossible states (e.g. restoring + loaded) are
// unrepresentable.
//
// Lifecycle:
//   no activeLease                                      → empty
//   activeLease with pdfUrl                             → loaded
//   activeLease without pdfUrl, IndexedDB lookup pending → restoring
//   activeLease without pdfUrl, IndexedDB miss          → reattach
//
// The hook owns the lookup effect: when SSR rehydrates `activeLease`
// (no pdfUrl) on mount, it asks the PdfBinaryRepository for the cached
// bytes and — on hit — pushes a Blob URL into the context via
// `setActiveLease`. On miss the state remains in `reattach` and the
// shell renders a friendly re-upload affordance.

'use client';

import { useEffect, useRef, useState } from 'react';
import type { ActiveLeaseRef } from '@/components/chat/ChatStreamContext';
import { getPdfBinaryRepository } from '@/lib/lease/pdf-binary-repository';
import { useLeaseParser } from './LeaseParserContext';

export type LeftPaneState =
  | { kind: 'empty' }
  | { kind: 'restoring'; filename: string }
  | {
      kind: 'loaded';
      pdfUrl: string;
      filename: string;
      pageCount?: number;
      clauseCount?: number;
    }
  | { kind: 'reattach'; lease: ActiveLeaseRef };

export function useLeftPaneState(): LeftPaneState {
  const { activeLease, setActiveLease } = useLeaseParser();
  // `reattach` is the terminal state once an IndexedDB lookup misses for
  // a given lease_id. Without this flag we'd stay in `restoring` forever
  // on a cache miss (the activeLease still has no pdfUrl).
  const [missedLeaseId, setMissedLeaseId] = useState<string | null>(null);
  // Guards against running the lookup twice for the same lease (Strict
  // Mode double-invoke + activeLease re-renders before pdfUrl lands).
  const lookupInFlightFor = useRef<string | null>(null);

  useEffect(() => {
    if (!activeLease) {
      lookupInFlightFor.current = null;
      return;
    }
    if (activeLease.pdfUrl) return;
    if (missedLeaseId === activeLease.lease_id) return;
    if (lookupInFlightFor.current === activeLease.lease_id) return;

    const leaseId = activeLease.lease_id;
    lookupInFlightFor.current = leaseId;
    let cancelled = false;

    void (async () => {
      try {
        const blob = await getPdfBinaryRepository().get(leaseId);
        if (cancelled) return;
        if (blob) {
          const pdfUrl = URL.createObjectURL(blob);
          setActiveLease({ ...activeLease, pdfUrl });
        } else {
          setMissedLeaseId(leaseId);
        }
      } catch {
        // Treat lookup errors the same as a miss — the reattach path
        // lets the user recover by re-uploading. IndexedDB errors are
        // not actionable for the user.
        if (!cancelled) setMissedLeaseId(leaseId);
      } finally {
        if (lookupInFlightFor.current === leaseId) {
          lookupInFlightFor.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeLease, setActiveLease, missedLeaseId]);

  if (!activeLease) return { kind: 'empty' };
  if (activeLease.pdfUrl) {
    return {
      kind: 'loaded',
      pdfUrl: activeLease.pdfUrl,
      filename: activeLease.filename,
      pageCount: activeLease.page_count,
      clauseCount: activeLease.clause_count,
    };
  }
  if (missedLeaseId === activeLease.lease_id) {
    return { kind: 'reattach', lease: activeLease };
  }
  return { kind: 'restoring', filename: activeLease.filename };
}
