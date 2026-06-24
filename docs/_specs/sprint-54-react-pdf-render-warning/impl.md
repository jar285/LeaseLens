# Implementation + QA — Sprint 54 React-PDF render-phase warning

**Status:** Shipped. **Branch:** `frontend/technical-debt`.

## Root cause (corrected during implementation)

The backlog assumed a production bug: state updates during react-pdf's render. Investigation showed the
opposite — **real react-pdf fires `onLoadSuccess` / `onGetTextSuccess` asynchronously** (from the document /
text-layer load `.then`), never during render. Production code (`PdfViewer.client.tsx`) therefore never updates
state during another component's render. The "Cannot update a component while rendering a different component"
warning was a **unit-test artifact**: the `react-pdf` mocks in `PdfViewer.test.tsx` and
`PdfViewer.highlights.test.tsx` called `onLoadSuccess`/`onGetTextSuccess` **synchronously during the mock's
render**, which is what made `setNumPages`/`setEmptyTextPages` run mid-render.

A first attempt deferred the production writes with `queueMicrotask`; that addressed a non-existent production
bug and **regressed real behavior** (the e2e `fab-assistant` red-flag-Explain flow), so it was reverted.

## What changed (test-only; production untouched)

- `PdfViewer.test.tsx` + `PdfViewer.highlights.test.tsx`: the `react-pdf` mocks now fire `onLoadSuccess` /
  `onGetTextSuccess` from a `useEffect` (post-render), matching real react-pdf's async callback timing. The
  highlights `Page` mock additionally forces one re-render after populating the text layer so
  `customTextRenderer` still reads the now-populated `pageItemsRef` and draws marks. `act()` flushes the
  effects, so the tests stay synchronous and all assertions hold.
- Added a regression test (`PdfViewer.test.tsx`, "Sprint 54 — does not emit a React render-phase update
  warning during PDF load") that spies `console.error` across a load and asserts no
  "Cannot update a component while rendering a different component" warning.
- **No production change** — `PdfViewer.client.tsx` is byte-identical to `d79b5ee`.

## Verification
- `npm run lint` clean · `npm run typecheck` clean · `npm test` **1385 passed** · `npm run build` green.
- `PdfViewer.test.tsx` + `PdfViewer.highlights.test.tsx`: **43 passed**, and a grep of the run output shows
  **0** "Cannot update a component while rendering" warnings (was emitted on essentially every PdfViewer test
  before).
- This also clears the matching P3 "PDF warnings" test-noise item.

## Note on react-pdf upgrade risk
Because production never updates state during render via these callbacks, there is no upgrade-fragility here.
The `customTextRenderer` stays pure (returns HTML, no setState). If a future change DID add a render-phase
write, the new regression test would catch it (the mocks exercise the load + text-layer paths).
