# Sprint 11 — operator validation notes

**Date:** 2026-05-05 (initial) · updated same day for Round 3 + Round 4
**Author:** post-impl operator validation pass
**Status:** Sprint 11 implementation + Round 2 UX revision + Round 3 architectural fixes + Round 4 legacy-DB migration — all **uncommitted**. This doc captures what was found, what's currently on disk, what's next, and how to test before commit.

> Companion docs: [spec.md §19 / §20 / §21](spec.md), [sprint.md Phase L / M / N](sprint.md), [sprint-qa.md Round 2 / 3 / 4](sprint-qa.md).

## 0. Round 2 follow-up — Round 3 fixes landed

The Round 2 manual smoke surfaced two architectural gaps when uploading a real third-party brand (the GitLab Content Style Guide):

- **Bug A:** `conversations` table wasn't scoped to `workspace_id`, so the previous workspace's chat history bled into a freshly-uploaded brand. Sending a message would have appended to the old conversation row.
- **Bug B:** `ChatEmptyState` hardcoded "Side Quest Syndicate" in the heading and all four suggested prompts. Clicking "Define Brand Voice" in a GitLab workspace sent a Side-Quest-named prompt, which the assistant correctly refused — but it was the prompt that was wrong, not the assistant.

Both fixed via TDD discipline (red → green → docs) as Round 3:
- Sixth Sprint-11 migration adds `workspace_id` to `conversations`. New `getLatestConversationForWorkspace` helper. Chat-route lookup/insert/cleanup all workspace-scoped. Foreign conversationId from a different workspace is rejected, falls through to a fresh conversation.
- `ChatEmptyState` now requires a `workspaceName: string` prop (no fallback — silent default was exactly how the bug surfaced). Suggested prompts moved into a `buildSuggestedPrompts(workspaceName)` factory and threaded through ChatTranscript → ChatUI → page.tsx.

Verification: 255 vitest tests, 0 typecheck errors, 5/5 eval. **The manual smoke in §4 below is worth re-running** — particularly steps that involve workspace switching and the empty-state copy.

## 0.1 Round 3 follow-up — Round 4 fixes landed

After Round 3, the operator continued the manual smoke. Two issues surfaced:

- **Bug C (HIGH):** Uploading a custom brand on top of an existing dev DB returned a 500 with `UNIQUE constraint failed: documents.slug`. The dev DB still carried the pre-Sprint-11 column-level UNIQUE on `slug`, which Sprint 11's `ALTER TABLE` migration couldn't drop. Documented as "run `db:seed` to reset" — but a real reviewer running locally would hit this and bounce.
- **Bug D (LOW):** The workspace popover showed three items saying the same thing on the sample workspace (`ACTIVE BRAND: Side Quest Syndicate` header + `Sample brand (active)` disabled item + `Start a new brand…`).

Both fixed via TDD discipline as Round 4. Root cause analysis followed Uncle-Bob 5-Why discipline (recorded in spec §21.1). The deeper lesson: the migration test asserted the migration *ran*, not that the migrated DB satisfied the same invariants as a fresh DB. Mechanic test, not behavior test.

- New `hasLegacySlugUnique` and `rebuildDocumentsTableWithoutSlugUnique` helpers in [migrate.ts](../../../src/lib/db/migrate.ts) — SQLite 12-step rebuild, idempotent, transaction-wrapped, preserves rows.
- WorkspaceMenu hides the redundant "Sample brand (active)" disabled item when on sample.

Verification: 259 vitest tests (+3 over Round 3 — extra one is an FK-on regression guard added when the first GREEN attempt revealed the rebuild needed a `foreign_keys` pragma toggle), 0 typecheck errors, 5/5 eval. **The Round 4 manual smoke (§5 below) specifically exercises the legacy-DB migration path** — do not run `db:seed` before testing; the whole point is to verify the migration self-heals.

## 0.2 Round 4 follow-up — Round 5 fixes landed

After Round 4, the operator restarted dev server and retried the GitLab upload. The schema migration succeeded (verified via `scripts/diag-db.mjs`) but a **different** SQLite error fired:

```
SqliteError: UNIQUE constraint failed: chunks.id   (SQLITE_CONSTRAINT_PRIMARYKEY)
```

Two new bugs found, both Sprint 11 architectural gaps:

- **Bug E (HIGH):** `chunk.id` was generated as `${slug}#${level}:${index}` in [chunk-document.ts](../../../src/lib/rag/chunk-document.ts) with no workspace dimension. Identical slug+content uploaded to two different workspaces produced duplicate chunk IDs → PRIMARY KEY collision. Sprint 11's spec added `workspace_id` to the *table* but never updated the *id derivation*. Partial fix.
- **Bug F (MEDIUM):** [ingest-upload.ts](../../../src/lib/workspaces/ingest-upload.ts) created the workspaces row first then ingested files in a loop — without try/catch. When ingest failed, the workspace row stayed orphaned. The operator's dev DB showed 4 orphan GitLab workspaces from earlier failed attempts.

Both fixed via TDD discipline as Round 5. The Uncle Bob lesson: **partial fixes leave landmines.** When a constraint becomes per-workspace (slug uniqueness), every artifact derived from it (chunk IDs, retrieval keys) needs the same per-workspace upgrade.

- `chunkDocument(slug, ...)` → `chunkDocument(documentId, ...)` — chunk IDs now namespaced by `documentId` (UUID per workspace+slug). Slug parameter dropped entirely (unused outside ID templates).
- `ingestUpload` wrapped in catch-and-delete: failed ingest deletes any partial chunks/documents AND the workspace row before rethrowing. The schema does NOT have `ON DELETE CASCADE`, so child cleanup is explicit.

Verification: 261 vitest tests (+2 over Round 4), 0 typecheck errors, 5/5 eval.

### One-off cleanup of pre-Round-5 orphan workspaces

The 4 orphan GitLab workspaces in your current dev DB pre-date this fix. Cycle 4's catch-and-delete only prevents **future** orphans. Run this SQL once via `sqlite3 data/contentops.db` (or any DB tool) to clean up:

```sql
-- Verify: this should list the 4 orphan GitLab rows.
SELECT id, name FROM workspaces
 WHERE is_sample = 0
   AND id NOT IN (SELECT DISTINCT workspace_id FROM documents);

-- Then delete:
DELETE FROM workspaces
 WHERE is_sample = 0
   AND id NOT IN (SELECT DISTINCT workspace_id FROM documents);
```

Sample workspace (`is_sample = 1`) is preserved. The single GitLab workspace that DID succeed (b7400b66...) has documents and is also preserved. The 24h TTL purge would handle these eventually anyway, but cleaning now keeps the dev DB tidy.

After this, `scripts/diag-db.mjs` should report exactly 2 workspaces: sample + the one valid GitLab.

---

## 1. What was found during operator validation

After Sprint 11 passed the headless verification gate (typecheck / 225 vitest / 5/5 eval / mcp:server), the operator started `npm run dev` and clicked through the flows. Three product issues surfaced that the test suite couldn't catch:

| # | Finding | Severity | Why automated tests missed it |
|---|---|---|---|
| F1 | First-time visitor at `/` redirects to `/onboarding`, gating chat behind setup. | HIGH | Tests asserted the redirect *fires* — they didn't ask whether the redirect was the right design. |
| F2 | Cockpit dense tables read as a debug pane, not a product surface. No copy explains who or what it serves. | MEDIUM | Tests verified data flow + render; no test evaluates legibility or framing. |
| F3 | Brand upload via a separate `/onboarding` form feels off in 2026. Users expect Claude/ChatGPT-style attach-in-chat. | HIGH | UX expectation, not a correctness assertion. |

These are the kinds of issues that *only* show up when a human uses the product. The headless gate is necessary but not sufficient — the operator-validation step in the charter §7 delivery loop is what caught them.

---

## 2. Current changes (since the original Sprint 11 implementation)

Sprint 11 had not been committed yet, so the corrections were applied on top of the working tree rather than as a separate sprint. Charter v1.7 framing of Sprint 11 (= "Workspaces & Brand Onboarding") still describes the work; only the routing and UX surfaces changed.

### Chat-first homepage
- [src/middleware.ts](../../../src/middleware.ts) issues a sample-workspace cookie when none is present. First visit lands directly in chat, no redirect.
- [src/app/page.tsx](../../../src/app/page.tsx) and [src/app/cockpit/page.tsx](../../../src/app/cockpit/page.tsx) tolerate a "workspace gone" race (cookie valid but TTL-purged) by falling back to the sample workspace and clearing the stale cookie.
- [src/app/api/chat/route.ts](../../../src/app/api/chat/route.ts) 401 redirect hint changed from `/onboarding` to `/`.

### `/onboarding` route deleted; WorkspacePicker → header popover
- Deleted: `src/app/onboarding/`, `src/components/onboarding/`.
- New [src/components/workspaces/WorkspaceMenu.tsx](../../../src/components/workspaces/WorkspaceMenu.tsx) — popover from the workspace label in the header. Items: "Use sample brand", "Start a new brand…".
- New [src/components/workspaces/BrandUploadModal.tsx](../../../src/components/workspaces/BrandUploadModal.tsx) — reusable modal hosting the upload form. Accepts `prefilledFiles` for the chat-drop path.
- [src/components/cockpit/WorkspaceHeader.tsx](../../../src/components/cockpit/WorkspaceHeader.tsx) now mounts `WorkspaceMenu`.

### Brand upload happens in chat (3b — persist + embed)
- New [src/components/chat/FileDropZone.tsx](../../../src/components/chat/FileDropZone.tsx) — wraps the chat surface. Accepts `.md` only, ≤100KB per file, max 5.
- New [src/components/chat/AttachButton.tsx](../../../src/components/chat/AttachButton.tsx) — paperclip button next to send (accessibility-first companion).
- [src/components/chat/ChatUI.tsx](../../../src/components/chat/ChatUI.tsx) holds `pendingFiles` state; both the drop and the paperclip funnel into the same `BrandUploadModal`. On submit, POST to `/api/workspaces` (unchanged) → cookie set → `router.refresh()`.

### Cockpit reframing + visual cleanup
- Subhead under the cockpit title: *"What your team sees while the AI works on behalf of {workspace.name}."*
- Per-panel headings rewritten as questions: "What has the AI done?", "Today's spend" + a *Global · all workspaces* pill, "Is retrieval grounded?", "What's queued to publish?", "Awaiting sign-off".
- [src/components/cockpit/AuditFeedPanel.tsx](../../../src/components/cockpit/AuditFeedPanel.tsx) collapses to top 5 rows by default with a `View all (N)` / `Show fewer` toggle.

### Verification status
| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` (modified files) | clean |
| `npm run test` | 242/242 (target was 232; net +57 over Sprint 10 baseline of 185) |
| `npm run eval:golden` | 5/5 against sample workspace |
| `npm run mcp:server` | starts cleanly (still hardcoded to sample workspace per spec §13.10) |
| `npm run test:e2e` | **NOT YET RUN** — operator-time |
| Manual dev-server smoke | **NOT YET RUN** — operator-time |

---

## 3. What we're focusing on next

In priority order:

1. **Operator-time E2E + manual smoke (this turn).** Run the three Playwright specs (`workspace-onboarding`, `chat-tool-use`, `cockpit-dashboard`) and walk through the flows in §4-5 below. Anything that fails goes into a Round 3 of sprint-qa.

2. **Commit Sprint 11.** Suggested message lives at the bottom of [sprint.md](sprint.md) (Phase L commit message). Bundle with the original Sprint 11 work — there's no reason to split since neither has shipped.

3. **Sprint 12: Demo Deployment + README + Loom.** Already framed in [agent-charter.md §16](../../_meta/agent-charter.md). Three big pieces:
   - Deploy to Vercel (or similar). Need to handle SQLite persistence on a serverless platform — likely sqlite-on-Turso or a reset-per-deploy demo posture.
   - Rewrite README to lead with the chat-first product story, not the architecture. Brand-upload demo flow front and center.
   - Record a Loom walkthrough for the FDE-portfolio audience (Doing Things, Distyl AI, Anthropic FDE, OpenAI FDE).

4. **Deferred from Sprint 11 (Sprint 13+ candidates):**
   - PDF / structured-data ingestion (currently markdown-only).
   - Per-caller MCP workspace selection (server is hardcoded to sample today).
   - LLM-inferred brand metadata (rejected for Sprint 11; the inline form is deterministic).
   - Per-message file-attachment-only flow (3a — rejected for the brand-onboarding scope).

---

## 4. How to test brand-document upload

### 4.1 Pre-flight

```powershell
# From the repo root
npm install            # if dependencies have shifted
npm run db:seed        # fresh sample workspace + corpus
npm run dev            # starts on localhost:3000
```

Open [localhost:3000](http://localhost:3000). You should land **directly in the chat** with `· Side Quest Syndicate` in the header. No redirect to `/onboarding`. If you see a redirect or a 404 on `/onboarding`, the middleware change didn't deploy — re-check `src/middleware.ts`.

### 4.2 The drag-drop path

1. Click the `· Side Quest Syndicate` label → popover opens with **Active brand: Side Quest Syndicate**, *Use sample brand (active)* (disabled), *Start a new brand…*. Close the popover.
2. Drag a `.md` file from your file manager onto the chat conversation area. While dragging, you should see an indigo ring + the overlay label *"Drop .md files to start a brand"*.
3. Drop. The brand-upload modal opens with **Selected files: <your-file>.md** listed (no file input visible — the drop already provided files).
4. Fill in **Brand name** (1-80 chars) and **Description** (1-280 chars). Both are required.
5. Click **Create workspace**. Button label changes to *Creating workspace…* during the request.
6. On success the modal closes, the page refreshes, and the header now shows your new brand's name.
7. Send a chat message like *"What's our brand voice?"* — the assistant should ground its answer in your uploaded content (it now retrieves from the new workspace's `chunks`).

### 4.3 The paperclip path (accessibility / touch)

Same flow, but step 2 is replaced by clicking the paperclip icon left of the send arrow → OS file picker. Same modal.

### 4.4 Edge cases worth probing

| Case | Expected behavior |
|---|---|
| Drop a `.png` | Silently ignored (no modal). |
| Drop 7 `.md` files | First 5 accepted; modal shows 5 files. |
| Drop an oversized `.md` (>100KB) | Filtered out before the modal; if all files filtered, modal doesn't open. |
| Submit with empty brand name | Inline error "Brand name must be 1-80 characters." |
| Submit with file >100KB (somehow) | Server returns 400; modal shows `<filename> exceeds 100KB.` under Files. |
| Click Cancel | Modal closes, no fetch fires, no workspace created. |
| Press Escape | Modal closes (unless mid-submit). |
| Open popover → Use sample brand (when on a custom workspace) | POST `/api/workspaces/select-sample` → cookie flips → refresh → header reads `· Side Quest Syndicate` again. |

### 4.5 TTL purge sanity check

Custom workspaces expire 24h after creation. Sample never expires. To verify the purge runs:
1. Create a custom brand.
2. In SQLite (via `sqlite3 data/contentops.sqlite` or Beekeeper), `UPDATE workspaces SET expires_at = strftime('%s','now') - 100 WHERE is_sample = 0;` to fast-forward expiry.
3. Create a second custom brand. The first one's rows in `workspaces`, `documents`, `chunks`, `audit_log`, `content_calendar`, `approvals` should be gone (cascade DELETE inside `purgeExpiredWorkspaces`).

---

## 5. How to test Creator / Editor / Admin roles

The role switcher lives in the bottom-right corner of every page in dev. Click **Creator / Editor / Admin** to flip the session cookie. The page reloads with the new role applied.

### 5.1 Creator (default)

- **What works:** chat. Asking *"summarize our brand voice"* hits `search_corpus` (read-only), retrieves from the active workspace, streams an answer.
- **What doesn't render:** the header *Cockpit* link is hidden. Visiting `/cockpit` directly redirects to `/`.
- **What doesn't fire:** mutating tools — `schedule_content_item` and `approve_draft` are not advertised to Creators in the system prompt and aren't in the role-scoped tool registry.
- **Smoke prompts:**
  - *"What are our content pillars?"* → grounded answer.
  - *"Schedule a post for tomorrow."* → assistant should refuse or punt (Creator has no scheduling tool).

### 5.2 Editor

Switch to Editor via the bottom-right switcher.

- **What works:** chat + cockpit view.
- **What you can do that Creator can't:** trigger `schedule_content_item`. Try the prompt: *"Schedule a brand-identity post for twitter tomorrow."* → the assistant should emit a `schedule_content_item` tool_use, you'll see a `ToolCard` render in the chat, and an audit row appears in the cockpit's *What has the AI done?* panel.
- **What Editor sees in the cockpit:**
  - **What has the AI done?** — only Editor's own audit rows (`actor_user_id` filtered).
  - **What's queued to publish?** — items they scheduled.
  - **Today's spend** — global.
  - **Is retrieval grounded?** — global eval status.
  - **Awaiting sign-off** — *not visible* (Admin-only panel).
- **What Editor cannot do:** approve drafts. `approve_draft` is gated by `requireAdmin` in the registry; the cockpit's Approvals panel doesn't render.

### 5.3 Admin

Switch to Admin.

- **What works:** everything Editor can do, plus approvals.
- **Smoke prompt:** *"Approve the brand-identity draft."* → emits `approve_draft` tool_use; cockpit's *Awaiting sign-off* panel updates.
- **What Admin sees that Editor doesn't:**
  - The full audit feed (no `actor_user_id` filter — Admin sees rows across all actors, including the MCP server's `actor_user_id = 'mcp-server'`).
  - The Approvals panel.
- **Undo path:** any executed audit row that has `compensating_action_json` set shows an Undo button. Click it; the row flips to *Rolled back* and the side-effect (e.g., the scheduled item) is removed.

### 5.4 Cross-role audit cleanliness

Switch from Creator → Editor → Admin in sequence and run *"schedule a brand-identity post for twitter tomorrow"* under each role that has scheduling. Verify the audit feed shows the actor_display_name correctly per row (Creator can't trigger; Editor → "Demo Editor"; Admin → "Demo Admin").

### 5.5 Per-workspace data isolation

1. As Admin, schedule a post in the **sample** workspace. Verify it appears in the *What's queued to publish?* panel.
2. Click the workspace label → *Start a new brand…* → upload a fresh brand.
3. Switch to the new workspace (it's now active after the upload). The Schedule panel should be **empty** — schedule rows are scoped to `workspace_id`.
4. Switch back to Sample via the popover. The original schedule row reappears.

---

## 6. Brand-document sources for testing

The upload pipeline accepts **markdown only**, **≤100KB per file**, **max 5 files per workspace**. Anything text-only and well-structured will work — the system doesn't care about styling, only the prose. Below are vetted public sources, ranked by how well they match ContentOps' actual use case (brand voice + audience + content guidance) — not just by how easy they are to download.

### 6.1 Best fit — drop-in markdown, real brand-voice content

1. **GitLab Handbook (brand + content style)** — *strongest match for ContentOps testing*
   - Web: [handbook.gitlab.com/handbook/marketing/brand-and-product-marketing/brand/content-style-guide/](https://handbook.gitlab.com/handbook/marketing/brand-and-product-marketing/brand/content-style-guide/)
   - Brand voice: [design.gitlab.com/brand-messaging/brand-voice/](https://design.gitlab.com/brand-messaging/brand-voice/)
   - Source repo: [gitlab.com/gitlab-com/content-sites/handbook](https://gitlab.com/gitlab-com/content-sites/handbook) (public, MIT-equivalent)
   - Why it's good: GitLab actually documents *voice*, *tone*, and *audience* explicitly — which is exactly what the ContentOps assistant retrieves against. Real, lived-in brand documentation from a real company.
   - How to use: clone the repo, navigate to `data/handbook/marketing/brand-and-product-marketing/brand/`, grab 3-4 markdown files (content style guide, voice, vocabulary), rename to ContentOps slugs (`brand-identity.md`, `audience.md`, `style-guide.md`).

### 6.2 Solid — drop-in markdown, design-system flavor

2. **VoltAgent's `awesome-design-md`** — *best fit if you want maximum variety*
   - Repo: [github.com/VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
   - License: MIT. Active.
   - What's in it: 71+ standalone `DESIGN.md` files extracted from real brands — Anthropic Claude, OpenAI, Stripe, Notion, Linear, Spotify, Apple, Tesla, Airbnb, Shopify, Vercel, Figma, Coinbase, Pinterest, Nike, Wired, and more. Each is a single drop-in `.md` file.
   - **Caveat:** these are *design-system* docs (colors, typography, components), not pure brand-voice docs. The upload mechanics work great, but the assistant's grounded answers will retrieve things like *"use indigo-600 for primary CTAs"* rather than *"we sound warm and quietly nerdy."* Excellent for verifying the upload + retrieval pipeline; less ideal for verifying the brand-voice/content-pillars angle.
   - How to use: pick a brand directory (e.g., `stripe/DESIGN.md`), download just that file, rename to `brand-identity.md`, drop it in.

3. **FINOS branding** — *public foundation brand, Apache 2.0*
   - Repo: [github.com/finos/branding](https://github.com/finos/branding)
   - Solid middle ground — real org brand, openly licensed, but more visual-asset-focused than voice/tone-focused. Grab the README and any `BRANDING.md` files.

### 6.3 Archived but still readable — public domain

4. **18F Content Guide** — *previously the headline recommendation; now archived*
   - Repo: [github.com/18F/content-guide](https://github.com/18F/content-guide)
   - Status: archived (read-only, no future updates). The content is still fully accessible — you can still `git clone` or download a zip.
   - Why it's still useful: every chapter is a standalone `.md` file in the `_pages/` and `_chapters/` directories. Voice/tone, plain language, accessibility — direct analogues to brand-identity / audience / style-guide files. License: public domain.
   - How to use: same as before. Just don't expect ongoing maintenance.

### 6.4 Public HTML — convert with `pandoc` or copy-paste into `.md`

5. **Mailchimp Content Style Guide** — [styleguide.mailchimp.com](https://styleguide.mailchimp.com/) — the canonical "how a tech company writes about itself" document. Convert each top-level section to its own `.md`.

6. **GOV.UK Style Guide** — [www.gov.uk/guidance/style-guide](https://www.gov.uk/guidance/style-guide) — government-grade clarity. Open Government Licence.

7. **Atlassian Design — Brand voice** — [atlassian.design/foundations/voice-and-tone](https://atlassian.design/foundations/voice-and-tone) — concise, designer-flavored.

### 6.3 Quick-and-dirty — a fake brand you write in 5 minutes

If you want to test the *flow* without picking a real brand:

```markdown
# brand-identity.md

# Brand identity — Riverbrook Coffee

Riverbrook is a third-wave coffee roaster based in the Pacific Northwest.
We source single-origin beans, publish farm-level traceability, and run
five neighborhood cafes that double as community workspaces.

Our voice is warm, knowledgeable, and quietly nerdy — like the friend who
knows the difference between a Geisha and a Bourbon and explains it
without making you feel dumb.
```

```markdown
# audience.md

# Audience profile — Riverbrook Coffee

Primary: 28-45-year-old urban professionals who care where their coffee
came from and will pay $5+ for a single-origin pour-over.

Secondary: home-brewing enthusiasts who follow our Instagram for tasting
notes and occasionally drop $40 on a 250g bag of competition-lot beans.
```

```markdown
# content-pillars.md

# Content pillars

1. Origin storytelling — interviews with farmers, harvest reports.
2. Brewing education — water chemistry, grind size, recipe tutorials.
3. Cafe culture — community workspace events, neighborhood tie-ins.
4. Sustainability — packaging, carbon offsets, fair-trade sourcing.
```

Three files, ~1KB each, under the 100KB ceiling and 5-file limit. Drop them in via drag, fill *Riverbrook Coffee* + a one-line description, submit. Then ask the assistant *"What's our brand voice?"* and watch it ground its answer in your made-up corpus.

### 6.4 What I would push back on

- **Don't use a real client's confidential brand book.** Anything proprietary should stay off the demo. Public guidelines or fictional ones only.
- **Don't try to upload a PDF.** The pipeline is markdown-only for Sprint 11. PDF parsing has its own correctness bugs; it's a Sprint 13+ candidate.
- **Don't use a brand book longer than ~20 pages of prose.** The 100KB-per-file × 5-file limit is plenty for a real brand, but the embedding pipeline runs synchronously inside the upload request. A 500KB total payload is fine; a 5MB one will time out.

---

## 7. Honest take on where we are

**What's good:**
- The chat-first revision turned a mediocre demo into a strong one. A reviewer landing on `/` instantly sees the product working.
- The cockpit reframing is genuinely cheap and high-leverage — it converts the cockpit from a "what is this screen for?" panel into the FDE-portfolio differentiator we want it to be.
- 242 vitest tests + 5/5 eval gives me high confidence at the headless layer. The only meaningful uncertainty is the manual smoke + the three Playwright specs.

**What's still risky:**
- `router.refresh()` after workspace creation hasn't been exercised by a real browser yet. If it doesn't cleanly switch context, the fallback is `window.location.href = '/'` — heavier but reliable. Worth watching during the manual smoke.
- The drag-drop overlay (the indigo ring + caption) hasn't been visually verified. Cross-browser it might glitch.
- The cockpit visual hierarchy is tighter than before but I haven't actually looked at it side-by-side with the screenshot you sent.

**What I'd recommend you do in the next session:**
1. Run `npm run dev` and walk through §4-5 above. Note anything that feels wrong.
2. Pick one source from §6 (the 18F Content Guide is the easiest start) and actually upload a brand. Verify the assistant grounds its answers in the new corpus.
3. If everything looks right, commit using the message at the bottom of `sprint.md` Phase L.
4. If anything looks wrong, capture the symptom and we'll debug + add a Round 3 to `sprint-qa.md`.

The scariest path is committing without the manual smoke and discovering a regression after Sprint 12 work has already started on top. The cheap insurance is 15 minutes of manual clicking before commit.
