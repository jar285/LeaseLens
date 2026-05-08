# Corpus Sources — LeaseLens NJ Tenant-Law Seed

**Status:** Placeholder, populated during Sprint 13 implementation.
**Owner:** Operator + sprint-13 implementation agent.
**Read-only?** No — this file is the project's *own* provenance log
for the seed corpus. The `docs/_references/` directory is read-only
per its README. This file lives under `docs/_meta/` precisely so
provenance can be appended without touching that directory.

---

## Scope

Records the source authority, URL, and access date for every section
of the NJ tenant-law seed corpus shipped at
`src/corpus/nj-tenant-law/*.md`. Without this provenance the
`grade_clause_severity` tool's citations cannot be audited by a
reviewer.

The corpus is NJ-only by spec (Sprint 13 §2.7). Adding sources for
another state requires a charter amendment, not a corpus addition.

---

## Source authorities

| Authority | Use | Citation prefix in corpus |
|---|---|---|
| NJ Truth-in-Renting Act (P.L. 1980, c. 233) — official NJ.gov PDF | Required core | `NJ Truth-in-Renting §<n>` |
| NJ Stat 46:8 (Landlord and Tenant) | Required core for security deposit, late fees, retaliation | `NJ Stat 46:8-<n>` |
| NJ Stat 2A:18 (summary dispossess) | Selected sections relevant to early termination | `NJ Stat 2A:18-<n>` |
| NOLO NJ tenant-rights pages (publicly available) | Plain-language secondary references | `NOLO NJ — <topic>` |
| Eviction Lab / EFF tenant guides | Optional supplemental | `EFF Tenant Guide — <topic>` |

---

## Per-file provenance log

To be filled during Sprint 13 implementation. One row per file in
`src/corpus/nj-tenant-law/`. Required columns: corpus filename,
source authority, source URL, access date (ISO YYYY-MM-DD), brief
note on what was excerpted vs paraphrased.

| Corpus file | Authority | URL | Accessed | Notes |
|---|---|---|---|---|
| `security-deposit-cap.md` | NJ Stat 46:8-21.2 | https://law.justia.com/codes/new-jersey/title-46/section-46-8-21-2/ | 2026-05-07 | Plain-language paraphrase with statutory cap citation |
| `security-deposit-return.md` | NJ Stat 46:8-21.1 | https://law.justia.com/codes/new-jersey/title-46/section-46-8-21-1/ | 2026-05-07 | Paraphrase; doubling penalty noted |
| `security-deposit-interest.md` | NJ Stat 46:8-19 | https://law.justia.com/codes/new-jersey/title-46/section-46-8-19/ | 2026-05-07 | Paraphrase |
| `security-deposit-on-sale.md` | NJ Stat 46:8-20 | https://law.justia.com/codes/new-jersey/title-46/section-46-8-20/ | 2026-05-07 | Paraphrase |
| `security-deposit-itemization.md` | NJ Stat 46:8-21.1 | (same as return) | 2026-05-07 | Paraphrase + permitted/forbidden deduction examples |
| `late-fees-general.md` | NJ common law on liquidated damages | n/a (case law overview) | 2026-05-07 | Plain-language summary |
| `late-fees-senior-citizens.md` | NJ Stat 2A:42-6.1 | https://law.justia.com/codes/new-jersey/title-2a/section-2a-42-6-1/ | 2026-05-07 | Paraphrase; 5-business-day grace period verified |
| `late-fees-grace-period.md` | Common practice + federal HUD subsidy rules | n/a (multi-source) | 2026-05-07 | Paraphrase |
| `early-termination-general.md` | *Sommer v. Kridel*, 74 N.J. 446 (1977) + lease common law | https://law.justia.com/cases/new-jersey/supreme-court/1977/74-n-j-446-0.html | 2026-05-07 | Paraphrase of duty-to-mitigate doctrine |
| `early-termination-senior-disabled.md` | NJ Stat 46:8-9.1 | https://law.justia.com/codes/new-jersey/title-46/section-46-8-9-1/ | 2026-05-07 | Paraphrase; specific subsection timing referred to statute |
| `early-termination-domestic-violence.md` | NJ Stat 46:8-9.6 et seq. (NJ Safe Housing Act) | https://law.justia.com/codes/new-jersey/title-46/section-46-8-9-6/ | 2026-05-07 | Paraphrase |
| `subletting-consent.md` | NJ Stat 10:5-12 (NJLAD) + common law | https://law.justia.com/codes/new-jersey/title-10/section-10-5-12/ | 2026-05-07 | Paraphrase |
| `subletting-replacement-tenant.md` | *Sommer v. Kridel* | (same as early-termination-general) | 2026-05-07 | Paraphrase |
| `habitability-warranty.md` | *Marini v. Ireland*, 56 N.J. 130 (1970) | https://law.justia.com/cases/new-jersey/supreme-court/1970/56-n-j-130-0.html | 2026-05-07 | Paraphrase of Marini doctrine |
| `repair-and-deduct.md` | *Marini v. Ireland*, 56 N.J. 130 (1970) | (same as habitability-warranty) | 2026-05-07 | Paraphrase + procedural steps |
| `truth-in-renting-overview.md` | NJ Stat 46:8-43 to 46:8-50 (Truth-in-Renting Act) | https://law.justia.com/codes/new-jersey/title-46/section-46-8-44/ | 2026-05-07 | Paraphrase |
| `lead-paint-disclosure.md` | Title X, 24 CFR Part 35 + NJ inspection rules | https://www.epa.gov/lead/real-estate-disclosure | 2026-05-07 | Paraphrase; federal penalty figure noted |
| `entry-notice.md` | NJ common law (no statute); covenant of quiet enjoyment | n/a | 2026-05-07 | Paraphrase of market norms |
| `entry-emergency.md` | NJ common law | n/a | 2026-05-07 | Paraphrase |
| `anti-eviction-act.md` | NJ Stat 2A:18-61.1 | https://law.justia.com/codes/new-jersey/title-2a/section-2a-18-61-1/ | 2026-05-07 | Paraphrase of grounds + covered units |
| `retaliation-protection.md` | NJ Stat 2A:42-10.10 | https://law.justia.com/codes/new-jersey/title-2a/section-2a-42-10-10/ | 2026-05-07 | Paraphrase + 6-month presumption |
| `automatic-renewal-notice.md` | NJ common law on auto-renewal clauses | n/a | 2026-05-07 | Paraphrase of best practices |
| `month-to-month-conversion.md` | NJ Stat 46:8-10 + Anti-Eviction Act | https://law.justia.com/codes/new-jersey/title-46/section-46-8-10/ | 2026-05-07 | Paraphrase |
| `attorneys-fees-clauses.md` | NJ Stat 46:8-21.1 (security deposit fee-shift), 56:8-1 (Consumer Fraud Act), 2A:42-10.10 | (multi-statute) | 2026-05-07 | Paraphrase |
| `jury-trial-waivers.md` | U.S. Const. amend. VII; NJ Const. art. I, ¶ 9; case law on adhesion contracts | n/a | 2026-05-07 | Paraphrase |
| `indemnification-clauses.md` | NJ public policy on indemnification + warranty of habitability | n/a | 2026-05-07 | Paraphrase |
| `pet-clauses.md` | 42 USC §3604(f)(3)(B) (FHA) + ADA service-animal rules | https://www.hud.gov/program_offices/fair_housing_equal_opp/assistance_animals | 2026-05-07 | Paraphrase |
| `parking-and-storage.md` | NJ common law + Anti-Eviction Act + ADA | n/a | 2026-05-07 | Paraphrase |

---

## Update discipline

- Add a row each time a new corpus file is committed.
- Do not paraphrase statute text — reproduce verbatim and cite.
- Plain-language paraphrases (e.g., NOLO summaries) are allowed but
  must be flagged in the Notes column.
- Re-fetch the source URL before any sprint that ships a public
  demo, and bump the Accessed date.
