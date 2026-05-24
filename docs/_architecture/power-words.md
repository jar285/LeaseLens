# Power Words

## Why This Document Exists

LeaseLens uses a small set of named design, engineering, security, and production references as compressed vocabulary for AI-assisted product work.

These names matter only when they change how the product is designed, implemented, reviewed, tested, or deployed. A famous name is not proof that a decision is correct. In this project, a power word is valid only when it points to a concrete lesson, constraint, failure mode, or quality standard that can be seen in the actual LeaseLens artifacts.

This document explains the initial power-word set for LeaseLens and shows how each reference should map to real project decisions.

## What A Power Word Is

A power word is a name that compresses a larger body of product and engineering knowledge.

When someone says `Don Norman`, they are not just mentioning a designer. They are invoking ideas about affordances, feedback, signifiers, mental models, and reducing user confusion.

When someone says `Martin Fowler`, they are not just mentioning an author. They are invoking small, behavior-preserving refactors that make the system easier to change without breaking what already works.

When someone says `WCAG`, they are not just mentioning accessibility. They are invoking a production standard: keyboard navigation, contrast, semantic markup, labels, focus states, readable error states, and reduced-motion support.

That compression is useful because it shortens communication. It lets us tell an AI coding agent what kind of thinking to apply without rewriting the whole theory every time.

## The Local Contract In This Repository

In LeaseLens, a named framework, designer, engineer, or standard is only valid when it does at least one of the following:

- changes an implementation decision
- changes how work is evaluated
- changes what is considered a quality risk
- clarifies a UI/UX tradeoff
- clarifies a software architecture boundary
- improves the user workflow
- improves accessibility, security, reliability, or deployability
- gives the agent a better way to interpret a concrete project artifact

If a name does none of those things, it does not belong here.

This rule exists to prevent decorative name-dropping. The goal is not to sound impressive. The goal is to make reasoning more precise.

## The Main Risk

The risk of power words is false authority.

A named reference can create the impression that a decision is automatically serious or correct because it sounds connected to a famous designer, engineer, book, or company. That is the wrong standard.

In LeaseLens, names do not replace reasoning, repository evidence, tests, accessibility checks, or working product behavior. They only help if they sharpen them.

A weak use of a power word sounds like this:

> This is good because it follows Clean Code.

A strong use sounds like this:

> This is a Robert C. Martin issue because the parser logic is coupled directly to the UI component. The upload component should not know how clause grading works. We need a boundary between presentation, use-case orchestration, parser logic, and storage/provider code.

## How To Read This Document

Each reference below answers five questions:

1. Who or what is being referenced?
2. What problem does that reference help us think about?
3. What lesson does LeaseLens take from that reference?
4. Where should this affect the project?
5. What is a good invocation example?

That structure keeps the vocabulary tied to actual product work instead of abstract prestige.

## Product Context

LeaseLens is pivoting into a tenant-facing PDF lease parser.

The main product is no longer the center chat experience. The main product is:

1. upload a lease PDF
2. parse the document
3. extract clauses
4. identify red flags
5. cite relevant NJ tenant-law sources
6. help the tenant understand risks
7. optionally use the FAB assistant for explanation or negotiation help

The product should feel like:

> CloudConvert-style simplicity meets legal-tech lease review.

But LeaseLens should not copy CloudConvert visually. The inspiration is the workflow: clear upload, clear processing, clear output, clear next action.

## Initial Power-Word Set

## Product, UX, And Interface Design

### Don Norman

Don Norman is invoked for human-centered design, affordances, signifiers, feedback, constraints, and mental models.

Problem it helps us reason about:

- whether the user understands what they can do
- whether actions are obvious
- whether the interface gives enough feedback
- whether the product behaves in a way that matches the user's expectations

Local lesson in LeaseLens:

- the user should immediately understand that the product parses lease PDFs and surfaces red flags
- upload, parsing, red-flag review, and FAB assistant behavior should all be predictable
- closing the FAB should hide the assistant, not erase the user's draft question or conversation state

Project anchors:

- PDF upload area
- parsing/progress states
- red-flags panel
- FAB assistant open/close behavior
- selected clause or selected red-flag context

Good invocation:

> This is a Don Norman issue because closing the FAB currently feels like destroying the assistant state. The control should behave like hiding a panel, not resetting the user's work.

### Jakob Nielsen / Nielsen Norman Group

Jakob Nielsen and NN/g are invoked for usability heuristics such as visibility of system status, consistency, error prevention, recognition over recall, and useful recovery from errors.

Problem it helps us reason about:

- whether users know what the system is doing
- whether loading, empty, success, and error states are clear
- whether the product prevents confusion before it happens

Local lesson in LeaseLens:

- when a lease is uploaded, the red-flags area should show clear progress instead of feeling empty
- the user should see stages such as reading the lease, extracting clauses, checking clauses, and preparing red flags
- unsupported PDFs, parsing failures, and missing text layers should have plain-English recovery paths

Project anchors:

- red-flags loading state
- parser progress animation
- upload error states
- unsupported PDF state
- empty state before upload
- review-ready state after parsing

Good invocation:

> This is a Nielsen visibility-of-system-status issue because the Red Flags panel is silent while the parser is working. We need staged progress inside the result area.

### Steve Krug

Steve Krug is invoked for clarity, scanability, and the idea that users should not have to work hard to understand an interface.

Problem it helps us reason about:

- whether the product is obvious on first use
- whether labels are plain
- whether the main action is easy to find
- whether the user can scan the screen quickly

Local lesson in LeaseLens:

- a new user should understand the product in a few seconds
- the page should not feel like a chatbot that happens to accept PDFs
- the upload/parser flow should be the dominant experience
- red flags should be readable without opening the FAB assistant

Project anchors:

- landing/empty state copy
- upload CTA
- parser-first layout
- red-flag cards
- clause result cards
- FAB quick actions

Good invocation:

> This is a Steve Krug issue because the user has to decode whether the main product is the chat, the PDF viewer, or the red-flags panel. The parser workflow needs to become visually obvious.

### Adam Wathan And Steve Schoger

Adam Wathan and Steve Schoger are invoked for practical visual design refactoring: spacing, hierarchy, typography, alignment, contrast, radius, shadows, and component consistency.

Problem it helps us reason about:

- whether the UI feels assembled or designed
- whether visual hierarchy communicates priority
- whether spacing and typography are doing enough work before adding more decoration

Local lesson in LeaseLens:

- improve the UI by refining spacing, alignment, type scale, panels, states, and component hierarchy
- do not add decorative effects unless they improve comprehension
- the parser and red flags should feel like first-class product surfaces

Project anchors:

- upload card
- PDF viewer panel
- red-flag cards
- clause cards
- FAB button and assistant drawer
- parser progress states
- header and role controls

Good invocation:

> This is a Refactoring UI issue because every panel is visually competing. We should use spacing, type hierarchy, and component emphasis to make the parser and red flags feel primary.

### Dieter Rams

Dieter Rams is invoked for restraint, usefulness, honesty, and the principle of "less, but better."

Problem it helps us reason about:

- whether an element exists for the user or only for decoration
- whether the UI is overdesigned
- whether the product communicates honestly and calmly

Local lesson in LeaseLens:

- remove visual noise that does not support the tenant's review task
- avoid flashy animation, excessive gradients, or unnecessary glass effects
- legal-tech should feel calm, serious, and trustworthy

Project anchors:

- animation choices
- empty state
- red-flags layout
- FAB behavior
- removal of Reviewer/Admin public controls
- copy that avoids legal overpromising

Good invocation:

> This is a Dieter Rams issue because the role switcher adds internal-product noise to a tenant-facing experience. Public users should not see Reviewer or Admin controls.

### Apple Human Interface Guidelines

Apple HIG is invoked for interaction polish, platform sensitivity, clarity, feedback, and refined component behavior.

Problem it helps us reason about:

- whether interactions feel polished and predictable
- whether controls communicate state
- whether motion and transitions help instead of distract

Local lesson in LeaseLens:

- the FAB assistant should open, close, preserve state, and restore context smoothly
- focus, hover, active, and disabled states should feel intentional
- motion should be subtle and respect reduced-motion preferences

Project anchors:

- FAB assistant
- parser progress motion
- button states
- drawer/panel behavior
- responsive layout
- keyboard focus handling

Good invocation:

> This is an Apple HIG polish issue because the FAB is not just a button; it is a persistent assistant surface that needs predictable state, focus, motion, and recovery behavior.

### Material Design

Material Design is invoked for component states, layout systems, interaction patterns, elevation, motion, and accessibility-aware UI structure.

Problem it helps us reason about:

- whether components have clear interaction states
- whether the layout is systematic
- whether feedback and motion are coherent

Local lesson in LeaseLens:

- buttons, cards, panels, menus, tooltips, and progress indicators should have consistent states
- the FAB menu should not behave like a random floating popup
- menus and overlays should be accessible and predictable

Project anchors:

- FAB quick-action menu
- red-flag actions
- progress indicators
- status chips
- form controls
- upload component

Good invocation:

> This is a Material-style component-state issue because the quick-action menu needs a real open, closed, focus, hover, selected, and disabled model.

### IBM Carbon Design System

Carbon is invoked for enterprise-grade UI consistency, data-heavy interfaces, accessibility, and design-system discipline.

Problem it helps us reason about:

- whether a serious tool remains consistent as it grows
- whether data/result cards are structured clearly
- whether UI patterns can scale

Local lesson in LeaseLens:

- red flags, clauses, citations, severity levels, and parser events need reusable component patterns
- the product should not create a new card pattern for every feature
- a legal-tech tool benefits from enterprise-style clarity

Project anchors:

- red-flag card component
- clause card component
- citation row component
- severity badge component
- result summary component
- status/progress component

Good invocation:

> This is a Carbon-style design-system issue because red flags, clauses, and citations are all structured result data. We need reusable patterns instead of one-off cards.

### WCAG

WCAG is invoked for accessibility requirements and inclusive production quality.

Problem it helps us reason about:

- whether the product can be used by keyboard users
- whether contrast, labels, focus, and semantics are correct
- whether loading/error states are announced clearly

Local lesson in LeaseLens:

- accessibility is not optional because tenants may rely on the product under real pressure
- the parser workflow and FAB assistant must both be usable without a mouse
- severity cannot rely on color alone

Project anchors:

- keyboard navigation
- focus states
- semantic buttons and headings
- aria-live parsing updates
- form labels
- color contrast
- reduced-motion support
- touch target size
- severity labels

Good invocation:

> This is a WCAG issue because High severity is currently communicated mostly through color. We need text labels, icons, contrast, and screen-reader-accessible labels.

## Frontend Engineering

### React Team / Dan Abramov

The React team and Dan Abramov are invoked for declarative UI, component boundaries, state ownership, and predictable rendering.

Problem it helps us reason about:

- where state should live
- what should be a reusable component
- how to avoid tangled UI logic
- how to keep rendering predictable

Local lesson in LeaseLens:

- FAB state, parser state, selected clause state, and red-flag state need clear ownership
- UI components should not directly own parser business logic
- state should be preserved intentionally, not accidentally reset by remounting

Project anchors:

- FAB assistant component
- parser state container
- PDF viewer state
- selected red flag / selected clause context
- result panels
- hooks and providers

Good invocation:

> This is a React state-ownership issue because the FAB input is being lost when the panel closes. The draft input and conversation state need to live above the visual open/closed panel state.

### Kent C. Dodds / Testing Library

Kent C. Dodds and Testing Library are invoked for testing user-visible behavior instead of implementation details.

Problem it helps us reason about:

- whether tests prove the behavior users care about
- whether components are tested through accessible interactions
- whether refactors can happen safely

Local lesson in LeaseLens:

- tests should verify that closing and reopening the FAB preserves the draft question
- tests should verify that uploading a lease displays staged progress
- tests should verify that Reviewer/Admin controls are not visible in the tenant-facing UI

Project anchors:

- FAB state persistence tests
- upload/progress tests
- parser result tests
- role removal tests
- accessibility-oriented component tests
- Playwright user flows

Good invocation:

> This is a Kent C. Dodds testing issue because we should not test internal state names. We should test that a user can type a question, close the FAB, reopen it, and still see the draft.

### Addy Osmani

Addy Osmani is invoked for frontend performance, JavaScript architecture, rendering patterns, and production web quality.

Problem it helps us reason about:

- whether the UI is doing too much client-side work
- whether rendering and bundle size are controlled
- whether expensive interactions are optimized

Local lesson in LeaseLens:

- PDF viewing, parsing progress, result cards, and FAB interactions should not make the page feel sluggish
- avoid unnecessary rerenders during parsing/progress updates
- keep client-side code lean, especially for Vercel deployment

Project anchors:

- PDF viewer rendering
- red-flag list rendering
- parser progress events
- FAB assistant state updates
- bundle and dependency review
- performance profiling

Good invocation:

> This is an Addy Osmani issue because the parser progress UI should not cause the entire PDF viewer and red-flag list to rerender on every small status update.

## Core Software Architecture

### Robert C. Martin

Robert C. Martin is invoked for clean architecture, boundaries, responsibility separation, and maintainability.

Problem it helps us reason about:

- how to prevent UI, parser logic, API logic, and storage concerns from becoming tangled
- how to keep the system understandable as it grows
- how to make changes without breaking unrelated parts

Local lesson in LeaseLens:

- upload UI should not contain clause-grading logic
- red-flag rendering should not contain legal-rule evaluation logic
- parser logic should be testable without rendering the app
- API routes should orchestrate, not become dumping grounds

Project anchors:

- parser use cases
- API routes
- red-flag grading logic
- citation matching logic
- component boundaries
- service/domain layer
- storage/provider layer

Good invocation:

> This is an Uncle Bob boundary issue because the UI component is doing parsing orchestration, legal grading, and rendering. Those responsibilities need to be separated.

### Martin Fowler

Martin Fowler is invoked for refactoring discipline: small, safe, behavior-preserving changes.

Problem it helps us reason about:

- how to improve the system without risky rewrites
- how to isolate changes
- how to move from prototype to production gradually

Local lesson in LeaseLens:

- audit hardcoded and dead code before deleting
- preserve working parser behavior while improving structure
- use small refactor steps with tests and verification

Project anchors:

- hardcoded data audit
- role removal
- FAB state refactor
- red-flags progress state
- component extraction
- test updates

Good invocation:

> This is a Martin Fowler refactor issue because we should first preserve behavior with tests, then extract the FAB state container, then change the visual behavior.

### Gang Of Four

GoF is invoked for shared design-pattern vocabulary such as Strategy, Adapter, Facade, Factory, Observer, and Command.

Problem it helps us reason about:

- how to discuss recurring structure without inventing vague language
- when a reusable pattern clarifies a design choice
- how to avoid one-off architecture

Local lesson in LeaseLens:

- use Adapter for swappable PDF parsers or AI providers
- use Strategy for different clause-grading approaches
- use Facade for a simple parser API over complex internal steps
- use Observer/Event style for parser progress updates
- use Command-style quick actions for FAB menu actions

Project anchors:

- PDF parser provider
- AI provider abstraction
- clause grading strategies
- parser progress events
- FAB quick actions
- citation provider

Good invocation:

> This is a GoF Strategy issue because text-layer parsing and OCR parsing may use different extraction approaches behind the same parser interface.

### Grady Booch

Grady Booch is invoked for object-oriented analysis, system modeling, and making important concepts explicit.

Problem it helps us reason about:

- whether the system's concepts are modeled clearly
- whether important domain objects are hidden inside generic data blobs
- whether the architecture has understandable structure

Local lesson in LeaseLens:

- Lease, Clause, RedFlag, Citation, RiskLevel, ParserRun, Review, and NegotiationDraft should be explicit concepts
- names in the code should match the product domain
- diagrams or plain-English models should clarify relationships before large refactors

Project anchors:

- domain model
- types/interfaces
- parser output schema
- red-flag schema
- citation schema
- review session model

Good invocation:

> This is a Grady Booch modeling issue because `result` is too vague. We need explicit domain models for ParserRun, Clause, RedFlag, Citation, and Review.

### Eric Evans

Eric Evans is invoked for Domain-Driven Design and aligning software language with the real domain.

Problem it helps us reason about:

- whether the code speaks the same language as the product
- whether domain concepts are first-class
- whether logic is organized around the problem instead of framework folders only

Local lesson in LeaseLens:

- the domain language should be tenant-facing lease review, not generic chatbot language
- parser-first concepts should replace chat-first concepts where appropriate
- terms like Clause, Lease, Citation, Risk, Severity, and RecommendedAction should be central

Project anchors:

- domain folder
- parser result schema
- red-flag grading rules
- UI copy
- API response shape
- test fixtures

Good invocation:

> This is an Eric Evans issue because the product pivot changed the domain language. The architecture still speaks in chat-first terms, but the domain is now lease parsing and red-flag review.

### Ward Cunningham

Ward Cunningham is invoked for technical debt and the importance of preserving knowledge in artifacts.

Problem it helps us reason about:

- why fast prototype decisions can become future cost
- why chat-only decisions are fragile
- why specs, sprints, and durable docs matter

Local lesson in LeaseLens:

- the pivot decision should be captured in specs, not only in chat
- hardcoded demo paths should be recorded and either removed or intentionally preserved
- architecture decisions should be documented so future agents do not re-litigate them

Project anchors:

- docs/foundation/power-words.md
- docs/_specs/lease-parser-pivot/spec.md
- docs/_specs/ui-ux-refactor/spec.md
- sprint docs
- QA docs
- architecture decision records

Good invocation:

> This is a Ward Cunningham technical-debt issue because the Reviewer/Admin roles were useful for prototyping, but now they are debt in the tenant-facing product unless documented and isolated.

## API And Backend Logic

### Roy Fielding

Roy Fielding is invoked for REST, resource-oriented web architecture, statelessness, and clear API boundaries.

Problem it helps us reason about:

- whether API routes represent real resources/actions clearly
- whether backend flows are predictable
- whether state is handled intentionally

Local lesson in LeaseLens:

- parser runs, leases, clauses, red flags, and reviews should have clear API semantics
- API routes should be understandable without knowing the UI internals
- avoid vague endpoints that mix unrelated responsibilities

Project anchors:

- upload endpoint
- parser-run endpoint
- red-flag endpoint
- clause endpoint
- review endpoint
- API response contracts

Good invocation:

> This is a Roy Fielding API-design issue because `/api/process` is too vague. The API should make parser runs and review results clear.

### Arnaud Lauret

Arnaud Lauret is invoked for practical API design that is easy to consume, maintain, and evolve.

Problem it helps us reason about:

- whether API responses are understandable
- whether errors are consistent
- whether API changes will break clients

Local lesson in LeaseLens:

- parser API responses should be typed, predictable, and useful to the UI
- errors should be structured and human-readable
- the UI should not scrape strings to understand backend state

Project anchors:

- API response schema
- error schema
- parser progress contract
- red-flag result contract
- frontend/backend integration tests

Good invocation:

> This is an Arnaud Lauret API-design issue because the parser route should return structured states and errors, not ambiguous strings that the UI has to guess from.

### Sam Newman

Sam Newman is invoked for service boundaries and the tradeoffs of distributed systems.

Problem it helps us reason about:

- when to split services and when not to
- how to avoid premature microservices
- how to think about boundaries before infrastructure

Local lesson in LeaseLens:

- start as a clean modular monolith
- do not split PDF parsing, grading, auth, and AI into separate services until there is a real reason
- design boundaries so future extraction is possible without creating early complexity

Project anchors:

- parser module
- grading module
- citation module
- AI assistant module
- storage module
- API orchestration layer

Good invocation:

> This is a Sam Newman issue because we should not create separate services yet. We need clean module boundaries first, then split only if operational pressure justifies it.

## Database, Storage, And Data Modeling

### Martin Kleppmann

Martin Kleppmann is invoked for reliable, scalable, and maintainable data systems.

Problem it helps us reason about:

- data consistency
- data retention
- failure modes
- storage tradeoffs
- schema evolution

Local lesson in LeaseLens:

- decide whether leases are stored permanently, temporarily, or not stored at all
- design parser results so they can be reproduced, audited, or deleted
- avoid storing sensitive lease text unless needed

Project anchors:

- lease file storage policy
- parser-run records
- review results
- red-flag records
- deletion policy
- data retention documentation

Good invocation:

> This is a Martin Kleppmann data-system issue because storing uploaded leases changes reliability, privacy, retention, and recovery requirements.

### Michael Stonebraker / Joseph Hellerstein

Stonebraker and Hellerstein are invoked for database fundamentals, relational thinking, and queryable structured data.

Problem it helps us reason about:

- whether data should be structured instead of hidden in blobs
- how to model relationships cleanly
- how to support future querying and analytics

Local lesson in LeaseLens:

- clauses, red flags, citations, parser runs, and review sessions should not all be one giant JSON blob if the product needs querying
- start simple, but keep the model understandable

Project anchors:

- database schema
- storage schema
- analytics event schema
- parser output schema
- review history schema

Good invocation:

> This is a database-modeling issue because clauses and red flags have relationships. If we need to query them later, one opaque blob will become painful.

### PostgreSQL RLS / Supabase RLS

PostgreSQL Row-Level Security and Supabase-style RLS are invoked for database-level access control and defense in depth.

Problem it helps us reason about:

- whether users can only access their own lease reviews
- whether admin/reviewer powers are isolated
- whether app-level checks are backed by database policies

Local lesson in LeaseLens:

- if users can save leases or reviews, row-level access control matters
- tenant data should not be readable across accounts
- public demo mode and authenticated mode should be clearly separated

Project anchors:

- saved lease reviews
- user accounts
- tenant-only access
- reviewer/admin internal tooling
- database policies
- auth integration

Good invocation:

> This is an RLS issue because if reviews are saved per user, the database should enforce ownership instead of relying only on frontend role checks.

## Authentication, Permissions, And Security

### OAuth / OpenID Connect

OAuth and OpenID Connect are invoked for standard authentication and authorization flows.

Problem it helps us reason about:

- how users sign in
- how identity is represented
- how access is granted and checked

Local lesson in LeaseLens:

- do not invent custom auth unless necessary
- if accounts are added, use mature auth patterns
- separate anonymous parser mode from authenticated saved-review mode

Project anchors:

- login/signup flow
- saved review history
- auth provider integration
- session handling
- account deletion

Good invocation:

> This is an OAuth/OIDC issue because once users save lease reviews, identity and session handling need to use proven patterns instead of a custom shortcut.

### Adam Shostack

Adam Shostack is invoked for threat modeling: what can go wrong, who can attack, what can be abused, and what controls reduce risk.

Problem it helps us reason about:

- security risks before coding
- sensitive data flows
- abuse scenarios
- privacy and misuse

Local lesson in LeaseLens:

- uploaded leases may contain names, addresses, rent amounts, signatures, and private details
- identify risks around upload, storage, logs, AI calls, and sharing
- do threat modeling before making storage permanent

Project anchors:

- file upload flow
- parser API
- logging policy
- AI provider calls
- storage policy
- public demo mode
- saved review mode

Good invocation:

> This is an Adam Shostack threat-modeling issue because uploading a lease creates sensitive-data risks even before we add accounts.

### Ross Anderson

Ross Anderson is invoked for security engineering as system design, not just patches or checklists.

Problem it helps us reason about:

- how security, incentives, usability, and failure modes interact
- how small design choices create system-level risks

Local lesson in LeaseLens:

- security should shape the architecture early
- legal-tech trust depends on privacy, reliability, and clear limits
- do not log sensitive lease content casually

Project anchors:

- privacy copy
- logging policy
- data retention
- upload handling
- auth model
- AI provider data handling
- incident response plan

Good invocation:

> This is a Ross Anderson security-engineering issue because privacy is not just a checkbox. The upload, storage, logging, and AI-provider paths all form one system.

### OWASP

OWASP is invoked for baseline web application security risk categories and practical security checks.

Problem it helps us reason about:

- common web app vulnerabilities
- broken access control
- injection
- insecure design
- misconfiguration
- vulnerable dependencies

Local lesson in LeaseLens:

- protect upload endpoints
- validate file type and size
- avoid leaking data in logs
- rate-limit expensive or sensitive endpoints
- do not expose admin/reviewer functions publicly

Project anchors:

- file validation
- API validation
- dependency review
- access control
- logging
- rate limits
- error handling

Good invocation:

> This is an OWASP issue because the upload endpoint accepts user-controlled files and needs validation, size limits, safe parsing, and controlled error messages.

## Hosting, Deployment, Cloud, And Compute

### Guillermo Rauch / Vercel

Guillermo Rauch and Vercel are invoked for frontend cloud, preview deployments, fast iteration, and deployment-first product development.

Problem it helps us reason about:

- whether the architecture fits Vercel
- whether deployment is part of the workflow
- whether preview builds are used for review

Local lesson in LeaseLens:

- design for Vercel deployment from the pivot onward
- avoid local-only assumptions
- keep parser work compatible with serverless/runtime constraints or isolate heavy work
- use preview deployments as part of review

Project anchors:

- Next.js architecture
- serverless API routes
- environment variables
- build configuration
- preview deployments
- Vercel runtime constraints

Good invocation:

> This is a Vercel deployment issue because PDF parsing may exceed serverless expectations if we treat it like an unlimited local process.

### Mitchell Hashimoto / HashiCorp

Mitchell Hashimoto and HashiCorp are invoked for infrastructure discipline, reproducibility, secrets, environments, and automation.

Problem it helps us reason about:

- whether environments are reproducible
- whether config is explicit
- whether secrets are handled correctly
- whether local and deployed behavior drift

Local lesson in LeaseLens:

- use environment variables deliberately
- keep deployment configuration explicit
- avoid hidden local setup assumptions
- document required services and secrets

Project anchors:

- `.env.example`
- deployment docs
- Vercel environment variables
- local development setup
- secrets handling
- build/deploy scripts

Good invocation:

> This is a HashiCorp-style infrastructure discipline issue because the app should not depend on undocumented local paths or hidden environment values.

## CI/CD And Version Control

### Jez Humble And Dave Farley

Jez Humble and Dave Farley are invoked for continuous delivery, deployment pipelines, and safe release practices.

Problem it helps us reason about:

- whether changes are always releasable
- whether verification is automated
- whether deploys are safe and repeatable

Local lesson in LeaseLens:

- every refactor should pass lint, typecheck, tests, and build
- deployment preview should be part of the acceptance process
- keep changes small enough to review

Project anchors:

- CI pipeline
- test scripts
- build scripts
- preview deployment
- release checklist
- sprint QA

Good invocation:

> This is a Continuous Delivery issue because the refactor is not done until lint, typecheck, tests, build, and preview deployment all pass.

### Nicole Forsgren / Gene Kim

Nicole Forsgren and Gene Kim are invoked for measuring delivery performance, reliability, and software delivery outcomes.

Problem it helps us reason about:

- whether the team is improving delivery quality
- whether cycle time, failure rate, and recovery matter
- whether process is actually producing better software

Local lesson in LeaseLens:

- measure whether refactors reduce risk and improve deployability
- track broken builds, failed tests, and regressions
- avoid big risky branches that are hard to merge

Project anchors:

- PR size
- sprint acceptance criteria
- CI results
- deployment history
- QA notes
- regression tracking

Good invocation:

> This is an Accelerate-style delivery issue because a giant refactor branch increases risk. We need smaller changes that keep the product deployable.

### Git Discipline / Trunk-Based Thinking

Git discipline is invoked for small commits, clean diffs, branch hygiene, and reviewable change sets.

Problem it helps us reason about:

- whether changes are understandable
- whether a refactor can be reviewed safely
- whether unrelated work is mixed together

Local lesson in LeaseLens:

- do not combine role removal, FAB state persistence, progress animation, and parser architecture changes in one giant commit
- each change should have a clear purpose and verification path

Project anchors:

- branch plan
- commit plan
- PR descriptions
- sprint docs
- QA checklist

Good invocation:

> This is a version-control discipline issue because the role cleanup should be one reviewable change, and the FAB state refactor should be another.

## Rate Limiting, Caching, CDN, And Performance

### Cloudflare

Cloudflare is invoked for rate limiting, CDN behavior, caching, request protection, and edge-oriented thinking.

Problem it helps us reason about:

- how to protect expensive endpoints
- how to reduce unnecessary server load
- how to serve static assets efficiently
- how to limit abuse

Local lesson in LeaseLens:

- upload, parse, and AI-generation endpoints should be rate-limited
- static assets should be cache-friendly
- expensive parser actions should not be unlimited

Project anchors:

- upload endpoint
- parser endpoint
- AI assistant endpoint
- public demo mode
- asset caching
- abuse protection

Good invocation:

> This is a Cloudflare/rate-limiting issue because repeated PDF uploads and AI requests can become expensive or abusive if not capped.

### Ilya Grigorik

Ilya Grigorik is invoked for web performance, network behavior, browser constraints, and performance-aware design.

Problem it helps us reason about:

- whether the app loads quickly
- whether assets are optimized
- whether network work is minimized
- whether performance is designed, not guessed

Local lesson in LeaseLens:

- the PDF parser page should load quickly even before upload
- heavy PDF and AI work should not block the initial UI unnecessarily
- performance should be tested and measured

Project anchors:

- initial page load
- PDF viewer bundle
- streaming/progress updates
- asset loading
- lazy loading
- performance budgets

Good invocation:

> This is an Ilya Grigorik performance issue because the initial parser page should not ship every heavy PDF/AI dependency before the user even uploads a lease.

### Brendan Gregg

Brendan Gregg is invoked for performance diagnosis, observability, and bottleneck analysis.

Problem it helps us reason about:

- how to find real bottlenecks instead of guessing
- how to investigate slow parsing or rendering
- how to distinguish frontend, API, parser, and storage delays

Local lesson in LeaseLens:

- if parsing feels slow, instrument the stages before optimizing randomly
- measure upload time, parse time, clause extraction time, grading time, and rendering time

Project anchors:

- parser timing logs
- performance traces
- API timing
- UI rendering measurements
- slow-path debugging

Good invocation:

> This is a Brendan Gregg issue because we should measure which parser stage is slow before rewriting the entire flow.

## Load Balancing And Scaling

### NGINX

NGINX is invoked for request routing, load balancing concepts, reverse proxying, and service-fronting behavior.

Problem it helps us reason about:

- how traffic reaches services
- how health and routing matter
- how infrastructure protects backend systems

Local lesson in LeaseLens:

- Vercel may abstract most load balancing early, but the concepts still matter
- if parser work moves to a worker service, routing and health checks become important
- avoid designing endpoints that cannot be scaled or isolated later

Project anchors:

- API gateway/proxy decisions
- worker service boundary
- parser job endpoint
- health check endpoint
- future infrastructure docs

Good invocation:

> This is a load-balancing concern because if PDF parsing becomes a separate worker, the app needs a clear routing and health-check strategy.

### Google SRE

Google SRE is invoked for reliability, service-level thinking, monitoring, incident response, and operational discipline.

Problem it helps us reason about:

- whether the product keeps working under failure
- whether we know what good service looks like
- whether errors are visible and recoverable

Local lesson in LeaseLens:

- define what "available" means for the parser workflow
- monitor parse failures, upload failures, and AI failures
- degrade gracefully when optional features fail

Project anchors:

- service health
- parser failure rate
- AI failure rate
- status/error states
- recovery paths
- incident notes

Good invocation:

> This is an SRE issue because if AI draft generation fails, the parser and red-flag results should still work.

## Error Tracking, Logs, Observability, And Recovery

### Michael Nygard

Michael Nygard is invoked for production readiness, failure design, timeouts, retries, circuit breakers, bulkheads, and graceful degradation.

Problem it helps us reason about:

- what happens when dependencies fail
- how to prevent one failing feature from breaking the whole product
- how to design for recovery

Local lesson in LeaseLens:

- AI failures should not break PDF parsing
- parser failures should show helpful recovery states
- timeouts should be explicit
- expensive calls should have limits

Project anchors:

- parser timeout
- AI timeout
- upload failure state
- retry behavior
- graceful fallback
- error boundaries

Good invocation:

> This is a Michael Nygard production-readiness issue because the assistant should fail independently from the parser and red-flags results.

### Charity Majors / Liz Fong-Jones / George Miranda

Charity Majors, Liz Fong-Jones, and George Miranda are invoked for observability: logs, events, traces, high-cardinality debugging context, and understanding production behavior.

Problem it helps us reason about:

- whether production failures can be explained
- whether logs are useful without leaking sensitive content
- whether events tell the story of a user workflow

Local lesson in LeaseLens:

- log parser stages, durations, and failure types
- do not log raw lease text or sensitive personal details
- capture enough context to debug without violating privacy

Project anchors:

- parser events
- red-flag grading events
- AI request events
- error tracking
- privacy-safe logs
- monitoring dashboards

Good invocation:

> This is an observability issue because we need to know whether parsing failed during upload, text extraction, clause extraction, grading, or rendering.

### Cindy Sridharan

Cindy Sridharan is invoked for practical observability and distributed-systems monitoring tradeoffs.

Problem it helps us reason about:

- what to monitor
- how monitoring can mislead
- how to understand systems that have multiple moving parts

Local lesson in LeaseLens:

- if parsing, AI, storage, and UI are separate paths, monitor the workflow as a whole
- avoid vanity metrics that do not explain user pain
- track meaningful failure points

Project anchors:

- parser workflow events
- API monitoring
- AI provider monitoring
- upload success rate
- user-visible error rate
- review completion rate

Good invocation:

> This is a Cindy Sridharan observability issue because uptime alone does not tell us if users can actually upload a lease and see red flags.

## AI Product Safety And Legal-Tech Boundaries

### Human-In-The-Loop Review

Human-in-the-loop is invoked for systems where AI output should support judgment rather than replace it.

Problem it helps us reason about:

- whether the product overclaims
- whether users understand the limits of AI-generated legal-adjacent output
- whether the user is encouraged to verify important decisions

Local lesson in LeaseLens:

- LeaseLens should not claim to be a lawyer
- every legal-adjacent output should be framed as informational
- negotiation drafts should be review-before-use
- citations should be visible where possible

Project anchors:

- disclaimer copy
- negotiation draft flow
- red-flag explanation
- citation display
- assistant responses
- final report

Good invocation:

> This is a human-in-the-loop issue because the app can draft a negotiation email, but the user should review it before sending and understand it is not legal advice.

### Source-Grounded AI

Source-grounded AI is invoked for responses tied to retrieved evidence, citations, or project rules rather than freeform model guesses.

Problem it helps us reason about:

- whether the assistant can explain why something is flagged
- whether outputs are traceable
- whether citations are visible and meaningful

Local lesson in LeaseLens:

- red flags should connect to clause text and citation/source references
- the assistant should not invent legal claims
- if a citation is missing, the UI should say so instead of pretending

Project anchors:

- citation provider
- statute references
- clause-to-red-flag mapping
- assistant response generation
- missing-citation state
- QA fixtures

Good invocation:

> This is a source-grounding issue because the assistant should explain the red flag using the selected clause and known NJ tenant-law source, not a generic legal answer.

## Document Processing And PDF Architecture

### Text-Layer First

Text-layer first is invoked for a pragmatic MVP parser strategy that handles PDFs with selectable text before adding OCR complexity.

Problem it helps us reason about:

- whether the parser scope is realistic
- whether scanned PDFs are supported yet
- how to communicate limitations clearly

Local lesson in LeaseLens:

- start with text-layer PDFs if that is the current capability
- detect when a PDF has no usable text
- show a clear unsupported/scanned-PDF message if OCR is not ready

Project anchors:

- PDF parser
- upload validation
- unsupported PDF state
- OCR roadmap
- text extraction tests
- sample lease fixtures

Good invocation:

> This is a text-layer-first issue because the MVP should clearly detect scanned leases instead of silently failing or pretending OCR exists.

### Page Anchoring

Page anchoring is invoked for connecting extracted results back to the source PDF.

Problem it helps us reason about:

- whether users can verify a red flag in the original lease
- whether "View on page" actions are accurate
- whether clause extraction remains trustworthy

Local lesson in LeaseLens:

- each clause and red flag should keep page references where possible
- "View on page" should navigate to the right location
- future highlight behavior should connect result cards to the source PDF

Project anchors:

- clause extraction output
- PDF viewer
- View on page action
- future highlight tool
- red-flag card
- citation mapping

Good invocation:

> This is a page-anchoring issue because a red flag is more trustworthy when the user can jump back to the exact page and clause that caused it.

## How The Agent Should Use Power Words

Use these names as prompts for better questions, not as substitutes for judgment.

Good use:

- `This is a Nielsen issue because the parser gives no visible status while red flags are being prepared.`
- `This is a React state-ownership issue because closing the FAB destroys the draft question.`
- `This is an Uncle Bob boundary issue because parser logic is inside the upload component.`
- `This is a Fowler refactor issue because we should preserve behavior and split the change into small steps.`
- `This is a WCAG issue because severity is communicated through color alone.`
- `This is a Ward Cunningham issue because the pivot decision exists only in chat and not in a durable spec.`
- `This is a Vercel deployment issue because the parser assumes local-only runtime behavior.`

Weak use:

- `This is good because it follows Don Norman.`
- `This is scalable because it mentions microservices.`
- `This is clean because it references Uncle Bob.`
- `This is polished because it looks like Apple.`
- `This is enterprise-grade because it mentions Carbon.`
- `This is secure because it mentions OWASP.`

The good use sharpens reasoning. The weak use hides behind reputation.

## Relationship To Other Foundation Docs

This document should live beside the other durable project docs.

Recommended structure:

- `docs/foundation/power-words.md` explains the named references and how to invoke them.
- `docs/foundation/orchestration-method.md` explains how LeaseLens turns requests into specs, sprints, implementation, and QA.
- `docs/foundation/technology-orientation.md` explains the current stack and deployment assumptions.
- `docs/_specs/lease-parser-pivot/spec.md` explains the parser-first product pivot.
- `docs/_specs/ui-ux-refactor/spec.md` explains the UI/UX refactor direction.
- `docs/_specs/vercel-deployment/spec.md` explains the deployment-readiness plan.
- `docs/_specs/security-privacy/spec.md` explains upload, storage, logging, and data-retention rules.

Keeping those roles separate makes the docs easier to maintain and easier for an AI agent to follow.

## Related Artifacts To Create Or Update

- `README.md` for the public product overview
- `docs/foundation/power-words.md` for compressed design and engineering vocabulary
- `docs/foundation/orchestration-method.md` for the AI-assisted workflow
- `docs/foundation/technology-orientation.md` for the stack and deployment model
- `docs/_specs/lease-parser-pivot/spec.md` for the parser-first pivot
- `docs/_specs/ui-ux-refactor/spec.md` for the next UI/UX refactor
- `docs/_specs/fab-assistant/spec.md` for FAB assistant state and behavior
- `docs/_specs/red-flags-progress/spec.md` for parser progress and red-flag loading states
- `docs/_specs/security-privacy/spec.md` for sensitive document handling
- `docs/_specs/vercel-deployment/spec.md` for production deployment constraints
- `docs/_specs/testing-quality/spec.md` for lint, typecheck, tests, build, accessibility, and preview checks

## Minimum Acceptance Standard For Invoking A Power Word

A power word is acceptable only if the agent can answer:

1. What exact decision does this name affect?
2. What concrete artifact will change?
3. What failure mode does this help prevent?
4. How will we verify the improvement?
5. What should not be done because of this principle?

If the agent cannot answer those questions, the name should not be used.

## Short Invocation Map

| Power Word | Use It When The Project Needs |
|---|---|
| Don Norman | clearer affordances, feedback, mental models |
| Jakob Nielsen | visibility of system status, error prevention, consistency |
| Steve Krug | simpler, more obvious user flows |
| Adam Wathan / Steve Schoger | practical visual polish and hierarchy |
| Dieter Rams | restraint and removal of unnecessary UI |
| Apple HIG | interaction polish and platform-feeling behavior |
| Material Design | component states, motion, and UI patterns |
| IBM Carbon | scalable design-system discipline |
| WCAG | accessibility requirements |
| React Team / Dan Abramov | component boundaries and state ownership |
| Kent C. Dodds | user-centered testing |
| Addy Osmani | frontend performance and rendering patterns |
| Robert C. Martin | clean boundaries and responsibility separation |
| Martin Fowler | safe refactoring |
| GoF | reusable pattern vocabulary |
| Grady Booch | system modeling |
| Eric Evans | domain language and domain modeling |
| Ward Cunningham | technical debt and durable project memory |
| Roy Fielding | REST/resource API thinking |
| Arnaud Lauret | practical API design |
| Sam Newman | service boundaries without premature microservices |
| Martin Kleppmann | data-system reliability and tradeoffs |
| PostgreSQL/Supabase RLS | database-level access control |
| OAuth/OIDC | mature identity and authorization |
| Adam Shostack | threat modeling |
| Ross Anderson | security engineering |
| OWASP | web security baseline |
| Guillermo Rauch / Vercel | deployment-first frontend product thinking |
| Mitchell Hashimoto / HashiCorp | environment and infrastructure discipline |
| Jez Humble / Dave Farley | continuous delivery |
| Nicole Forsgren / Gene Kim | delivery performance and reliability |
| Git Discipline | clean diffs and reviewable changes |
| Cloudflare | rate limiting, CDN, and abuse protection |
| Ilya Grigorik | web performance and network-aware design |
| Brendan Gregg | performance diagnosis |
| NGINX | routing and load-balancing concepts |
| Google SRE | reliability and operational readiness |
| Michael Nygard | production failure design |
| Charity Majors / Liz Fong-Jones / George Miranda | observability |
| Cindy Sridharan | meaningful monitoring |
| Human-In-The-Loop | safe legal-adjacent AI workflows |
| Source-Grounded AI | citation-backed AI explanations |
| Text-Layer First | realistic PDF parser MVP scope |
| Page Anchoring | connecting results back to the PDF source |
