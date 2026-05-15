# Sprint 23b — Spec QA Checklist

Use during human review of `spec.md` before sprint kickoff.

## Problem statement
- [ ] Names three concrete weaknesses in the current left pane, each grounded with a file:line reference.
- [ ] Cites the handoff §12 mandate as the source of the "document tray" direction.
- [ ] Explicitly lists what is NOT changing (upload contract, scan flow, classifier, etc.).

## Invariants
- [ ] All 12 cross-sprint invariants are present (verbatim from 23a/spec.md §2).
- [ ] Sprint-23b-specific invariants (13–17) cover: upload contract, scroll chain, dialog sizing, sticky callout, `scrollToPage` handle.
- [ ] PDF focus dialog sizing invariant (§21 fail-attempt #1) is explicit.

## Design system
- [ ] No new tokens added; only consumes 23a additions.
- [ ] Each component-refactor row names: path, phase, what changes — no rename, no signature change.
- [ ] `PdfReadingControls.compact?` is described as additive (defaults to current behavior).
- [ ] State-coverage matrix in §3c reflects all five dropzone states.

## Acceptance criteria
- [ ] Each AC is concretely verifiable in a smoke walk.
- [ ] AC #6 explicitly references the `h-screen w-screen` invariant (no regression).
- [ ] AC #7 covers both inline and focus-mode sticky callout.
- [ ] AC #9 covers test/typecheck/lint/build.

## Out of scope
- [ ] Excludes legal-pipeline changes.
- [ ] Excludes clause-highlight in PDF body (real text anchoring).
- [ ] Excludes mobile-responsive treatment.
- [ ] Excludes 23c/23d surfaces.

## Sign-off
- [ ] Reviewer name + date.
