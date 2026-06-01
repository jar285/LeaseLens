# AI-Assisted Development Philosophy

## Purpose

This document explains the project philosophy for working with AI-assisted development tools.

The goal is not to randomly ask AI to build features. The goal is to guide the AI like a junior developer, assistant, or teammate who needs clear requirements, rules, tests, and feedback.

AI can be powerful, but it can also hallucinate, miss details, overbuild, or drift away from the original goal. To avoid that, this workflow uses a structured process:

**Spec → Sprint → Tests → Code → QA → Repeat**

This keeps the project clear, testable, maintainable, and easier to improve over time.

## Core Belief

AI should not replace the thinking process.

AI should support the thinking process.

A good AI-assisted workflow makes the human responsible for direction, judgment, priorities, and quality. The AI helps with drafting, planning, coding, testing, reviewing, and improving the work.

The human sets the standard.
The AI helps execute the standard.

## The Main Workflow

The basic workflow is:

1. Explain the idea in plain English.
2. Turn the idea into a clear spec.
3. QA the spec before coding.
4. Break the spec into small sprints.
5. Write tests before implementation.
6. Implement one sprint at a time.
7. QA the code against the sprint and the original spec.
8. Carry useful context into the next sprint.
9. Repeat until the solution is stable.

This workflow prevents common AI-assisted development problems such as:

* The AI making things up.
* The AI skipping important requirements.
* The code becoming messy.
* The project drifting from the original idea.
* Features being built without tests.
* The setup becoming too complicated.
* The solution becoming hard to maintain.

## Simple Explanation

The way we work with AI is by giving it a system.

First, we explain what we want in plain English. Then we write a spec, which is the high-level plan. After that, we divide the work into small sprints. For each sprint, we write the tests first, then ask the AI to code only what is needed to pass those tests. After coding, we QA the result against the original spec to make sure the project did not drift.

The short version is:

**Spec → Sprint → Tests → Code → QA → Repeat**

## Important Terms

### Spec

A spec is a high-level English document that explains what the system should do.

It should be readable by both humans and AI agents.

A good spec answers:

* What are we building?
* Who is it for?
* What problem does it solve?
* What should the system do?
* What should the system not do?
* What are the rules?
* What does success look like?

A spec should not be full of code. It should mostly be written in clear, plain English.

### Sprint

A sprint is a small chunk of work based on the spec.

The spec explains the whole idea.
The sprint explains one specific part to build.

A sprint should be small enough to review, test, and complete without mixing unrelated work.

Bad sprint:

```text
Build the whole app.
```

Good sprint:

```text
Build the recording button, recording state, and save behavior.
```

### TDD

TDD means Test-Driven Development.

This is one of the most important parts of this workflow.

The idea is:

1. Write the test first.
2. Run the test and watch it fail.
3. Write the smallest amount of code needed to pass the test.
4. Refactor the code while keeping the test passing.

This is usually called:

**Red → Green → Refactor**

Where:

* **Red** means the test fails.
* **Green** means the test passes.
* **Refactor** means improving the code without changing its behavior.

TDD matters because it forces the AI to prove that the feature works instead of simply saying that it works.

### QA

QA means Quality Assurance.

After the AI writes a spec, sprint, test, or implementation, the work should be reviewed.

QA checks:

* Did it follow the spec?
* Did it miss anything?
* Did it make something up?
* Did it break any rules?
* Did it drift away from the original idea?
* Are the tests meaningful?
* Is the code clean?
* Is the setup still easy?

### Variance

Variance means the things that are allowed to change.

Examples:

* The UI layout can change.
* The exact tech stack can change.
* The folder structure can be improved.
* The implementation can be refactored.
* The architecture can evolve if there is a good reason.

Variance gives the project flexibility.

### Invariance

Invariance means the things that must not change.

Examples:

* Do not skip tests.
* Do not hardcode secrets.
* Do not remove required features.
* Do not invent fake functions or APIs.
* Do not make the setup complicated.
* Do not break existing behavior.
* Do not code before the sprint is clear.
* Do not drift away from the original spec.

Invariance protects the project from chaos.

## Full Development Process

### Step 1: Explain the Idea

Start with a simple plain-English explanation of what you want to build.

Example:

```text
I want to build a simple system that lets someone record audio, turn that audio into text, clean it with AI, and use it to update a website.
```

At this stage, the idea does not need to be perfect. The goal is to get the concept out clearly enough so it can be shaped into a spec.

### Step 2: Create the Spec

The first real artifact should be a spec.

Prompt example:

```text
I want you to turn this idea into a high-level spec written in plain English. The spec should be readable by both humans and AI agents. Do not write code yet. Include the product goal, target user, user flow, core features, variance, invariance, risks, and definition of done.
```

### Step 3: QA the Spec

Do not trust the first version immediately.

Ask the AI to review and strengthen the spec before moving into sprints.

Prompt example:

```text
Now QA this spec. Check if anything is missing, unclear, unrealistic, duplicated, or likely to cause architectural drift. Make the spec stronger before we move into sprints.
```

### Step 4: Break the Spec into Sprints

After the spec is clear, divide the project into small sprints.

Prompt example:

```text
Read the spec and break it into small sprints. Each sprint should have one clear purpose, be easy to review, and map directly back to the spec. Do not combine unrelated work into one sprint.
```

### Step 5: Write Tests Before Code

Before implementing a sprint, define the expected behavior through tests.

Prompt example:

```text
Before coding Sprint 1, write the tests first. Use TDD. Define the expected behavior, edge cases, and acceptance criteria. Do not implement the feature until the tests are clear.
```

### Step 6: Code Only the Current Sprint

The AI should not work ahead.

Prompt example:

```text
Now implement only Sprint 1. Do not work on Sprint 2. Write the smallest clean implementation needed to pass the tests. Follow Clean Code principles, avoid duplication, and keep the setup painless.
```

### Step 7: QA the Code Against the Sprint and Spec

After implementation, review the work against both the sprint and the original spec.

Prompt example:

```text
QA the implementation against Sprint 1 and the original spec. Confirm that the tests pass, the code does not drift, no fake functions were invented, and the setup is still easy for a beginner.
```

### Step 8: Update the Next Sprint

Carry forward only useful context.

Prompt example:

```text
Update Sprint 2 with any relevant information learned from Sprint 1. Carry forward only useful context. Do not add unnecessary complexity.
```

## Expert Review Lenses

A strong AI workflow does not simply say:

```text
Make this better.
```

Instead, it asks the AI to review the work through specific expert lenses.

### Uncle Bob Martin Lens

Use this lens for:

* Clean Code
* SOLID principles
* TDD
* Clear naming
* Small functions
* No duplication
* Separation of concerns
* Maintainable structure

Prompt example:

```text
Review this like Uncle Bob Martin would. Focus on Clean Code, SOLID principles, TDD, readable naming, small functions, no duplication, and separation of concerns.
```

### Donald Knuth Lens

Use this lens for:

* Precision
* Clear reasoning
* Algorithmic thinking
* Technical correctness
* Careful explanations
* Deep problem solving

Prompt example:

```text
Review this with Donald Knuth’s level of precision. Look for vague logic, unclear assumptions, weak reasoning, and places where the implementation can be made more exact.
```

### Gang of Four Lens

Use this lens for:

* Design patterns
* Reusable architecture
* Object relationships
* Avoiding messy one-off solutions
* Recognizing when a pattern would simplify the design

Prompt example:

```text
Review the architecture using the Gang of Four design pattern mindset. Identify where a pattern would simplify the structure and where the current solution is becoming messy.
```

### Grady Booch Lens

Use this lens for:

* System architecture
* Modeling
* Boundaries
* Modules
* Big-picture structure
* Long-term maintainability

Prompt example:

```text
Review this system as Grady Booch would. Are the modules clear? Are the boundaries correct? Is the architecture understandable and stable?
```

### UX Expert Lens

Use this lens for:

* Usability
* Clarity
* Navigation
* Visual hierarchy
* Spacing
* User flow
* Interface polish
* Beginner-friendly experiences

Useful UX references include:

* Don Norman
* Steve Krug
* Peter Morville
* Adam Wathan
* Steve Schoger

Prompt example:

```text
Review this interface using Don Norman, Steve Krug, Peter Morville, Adam Wathan, and Steve Schoger as UX lenses. Make sure the interface is obvious, simple, readable, and easy to use.
```

## Main Reusable Prompt

Use this when starting a new AI-assisted project:

```text
I want you to help me turn this idea into a clean, maintainable, production-minded solution.

Do not start coding immediately.

First, write a high-level spec in plain English. The spec should be readable by both humans and AI agents. It should explain the product goal, target user, main workflow, core features, variance, invariance, risks, and definition of done.

After that, QA the spec. Look for missing requirements, unclear assumptions, architectural drift, unnecessary complexity, and anything that could cause the AI agent to hallucinate or build the wrong thing.

Then break the spec into small sprints. Each sprint should have one clear purpose and should be easy to review. Do not combine unrelated work into one sprint.

For each sprint, follow TDD:

1. Write the tests first.
2. Run or describe the expected failing tests.
3. Implement the smallest clean solution needed to pass the tests.
4. Refactor while keeping the tests passing.
5. QA the implementation against the sprint and the original spec.

Use Uncle Bob Martin’s Clean Code principles: SOLID, no duplication, clear naming, small functions, separation of concerns, and maintainable structure.

Use Donald Knuth’s precision when reasoning about logic.

Use Grady Booch’s architecture mindset when reviewing boundaries, modules, and system design.

Use the Gang of Four design pattern mindset when a reusable pattern would make the system cleaner.

Use strong UX principles from Don Norman, Steve Krug, Peter Morville, Adam Wathan, and Steve Schoger when reviewing the user experience.

The setup of the solution must be painless and easy for anyone to use. A beginner should be able to clone the project, follow the README, set up environment variables using an `.env.example`, run the tests, and start the app without confusion.
```

## Important Invariants

These rules should stay true across every project:

* Do not make up function names.
* Do not skip tests.
* Do not hardcode secrets.
* Do not overcomplicate the setup.
* Do not work ahead of the current sprint.
* Do not remove required behavior without permission.
* Do not introduce duplicated logic.
* Do not allow the project to drift away from the original spec.
* Do not hide uncertainty.
* Do not claim something works unless it has been tested or clearly verified.

## Sprint QA Report Template

At the end of each sprint, produce a QA report.

Use this format:

```md
# Sprint QA Report

## Sprint Name

[Name of the sprint]

## What Was Completed

- [Item 1]
- [Item 2]
- [Item 3]

## Tests Added

- [Test 1]
- [Test 2]
- [Test 3]

## Test Status

- Passing:
- Failing:
- Not run:

## Spec Alignment

Explain whether the sprint matches the original spec.

## Drift Check

Explain whether the implementation drifted away from the original goal.

## Code Quality Check

Review naming, duplication, structure, separation of concerns, and maintainability.

## Setup Check

Explain whether the setup is still beginner-friendly.

## Carry Forward

List only the useful information that should be carried into the next sprint.

## Diminishing Returns Check

Explain whether more changes are still valuable or whether the sprint is reaching the point where extra work would add unnecessary complexity.
```

## Definition of Done

A sprint is not done just because the AI wrote code.

A sprint is done when:

* The sprint maps back to the spec.
* The expected tests exist.
* The tests pass or failures are clearly explained.
* The implementation does not work ahead.
* The code is clean and readable.
* The setup remains simple.
* The QA report is completed.
* Any important context is carried forward.
* The project has not drifted from its original purpose.

## Short Version

We do not ask AI to build everything at once.

We make it understand the idea, write a spec, QA the spec, break the work into small sprints, write tests first, code only one sprint at a time, QA the code, and repeat.

We use expert lenses like Uncle Bob for clean code, Donald Knuth for precision, Grady Booch for architecture, the Gang of Four for design patterns, and UX experts for user experience.

## Final Teaching Explanation

Think of AI as a smart assistant, but not a perfect one.

If you give it vague instructions, it may hallucinate, skip details, or build something messy. So instead of prompting randomly, we use a system.

First, we create a spec, which is the plain-English version of what the product should be. Then we turn that spec into small sprints. Before coding, we write tests using TDD. Then we code only enough to pass those tests. After that, we QA the code against the spec to make sure the project stayed on track.

This keeps the work clean, organized, testable, and easier to maintain.
