# Sprint 23a — Sprint QA Checklist

Use this list during human review of `sprint.md` before implementation begins.

## Phase ordering
- [ ] Phase 0 (pre-flight) requires baseline tests to pass before any edit.
- [ ] Phase 1 (tokens) is a single-file change to `globals.css` only.
- [ ] Phase 2 (inline sweep) happens after tokens land — never before.
- [ ] Phase 3 (shell extraction) is explicitly gated on the audit, not assumed.
- [ ] Phase 4 (motion sweep) is independent of Phase 3 and can run earlier if Phase 3 is skipped.
- [ ] Phase 5 (catalogue + commit) ends with smoke walk before commit.

## File map
- [ ] Every modified file appears in the file map table.
- [ ] No file in the table belongs to a 23b/c/d-scoped surface (no `LeaseUploadDropzone`, no `ChatComposer`, no `RedFlagReport`, etc.).
- [ ] Gated extractions are marked "(gated)" in both the phase narrative and the file map.

## Verification
- [ ] Each phase has a stated verification step (smoke walk, grep result, test run).
- [ ] Test impact section names every test file that might need updating, with a one-line reason.
- [ ] Commit sequence is granular enough to bisect (one concern per commit).

## Risk
- [ ] Phase 2 inline-value sweep risks changing computed style if a token value differs from the inline value — checked that token equivalents match the original computed style.
- [ ] Phase 3 extraction risks regressing the `LeaseLensWorkspaceShell.test.tsx` assertion set — re-target plan documented.
- [ ] Phase 4 motion sweep risks unmasking missing `useReducedMotion()` gates — explicit step to verify each gate.

## Sign-off
- [ ] Reviewer name + date when approved.
