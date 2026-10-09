# Research: Pain points in the bug-capture-to-fix workflow

## Status

Desk research, gathered 2026-10-09. Sources are vendor blogs, review sites, forum threads, surveys and academic papers. **No user interviews yet.** Treat every claim as a hypothesis to validate with real users, not as proven demand.

## Purpose

Record what people struggle with in the workflow SnapFlow sits in (capture a bug, report it, get it fixed) so product decisions, including the background-agents plan (`docs/plans/background-agents.md`), can be checked against evidence.

## 1. Bug reports are incomplete, and that costs days

- Vague reports start a ping-pong of questions. Replies arrive hours later, the developer is pulled into other work, and the issue lingers. ([Shake](https://www.shakebugs.com/blog/how-to-write-a-good-bug-report/), [Eurostar Huddle](https://huddle.eurostarsoftwaretesting.com/6-bug-reporting-mistakes-that-plague-developers-and-how-to-fix-them/))
- The "cannot reproduce" loop: a tester files a report, the developer cannot reproduce it, the report is closed, the tester refiles, and the bug stays in production. ([ResumeLens](https://www.resumelens.org/blog/qa-manual/bug-reports-that-get-fixed))
- Some developers refuse reports that lack reproduction steps.

**Need:** capture that records steps, logs and environment automatically, so the reporter does not have to write them.

## 2. Existing capture tools leave gaps

- **Price.** Marker.io starts at $39/month and users call it steep for small teams. BugHerd's richer integrations sit behind a tier of roughly $129/month. ([G2: BugHerd vs Marker.io](https://www.g2.com/compare/bugherd-vs-marker-io), [Hackceleration](https://hackceleration.com/labs/alternatives/bugherd-alternatives))
- **Depth.** BugHerd is light on the technical data developers want: console logs, network requests, session replay.
- **One-way sync.** BugHerd pushes tasks to Jira on most plans but does not pull status back, so a bug closed in Jira stays open in BugHerd.
- **Browser-only.** A Marker.io reviewer asked for a desktop app to capture feedback outside the browser window, especially for desktop apps. ([G2 reviews](https://g2.com/products/marker-io/reviews)) This is one reviewer, not a trend.

**Need:** cheaper and deeper capture, two-way status sync, and coverage outside the browser.

## 3. Screenshots leak sensitive data

- The Windows Snipping Tool "aCropalypse" flaw let attackers recover content users had cropped out. ([Petri](https://petri.com/windows-11-snipping-tool-acropalypse-flaw/))
- Microsoft Recall captured credit card and SSN data even with its sensitive-information filter enabled. ([Yahoo Tech](https://tech.yahoo.com/ai/articles/microsofts-ai-recall-feature-caught-141308852.html))
- Marker.io users have a standing feature request for automatic masking of sensitive data in screenshots and replays. ([Marker.io feedback](https://feedback.marker.io/feature-request/p/hide-sensitive-information-on-screenshots))

**Need:** automatic redaction before upload, and true removal of cropped or blurred pixels, not visual hiding.

## 4. AI agents add review and trust problems, not only speed

- 96% of developers do not fully trust AI-generated code, 95% spend time reviewing or correcting it, and 38% say reviewing it takes more effort than a coworker's code (SonarSource 2026 survey, via [FeatBit](https://featbit.co/blogs/productivity-paradox-ai-coding-2026)).
- Heavily AI-assisted teams merged 98% more PRs per day while review time grew 91% (same source). The bottleneck moved to review.
- The dominant failure mode is plausible code that passes ordinary gates and breaks inside the system.
- AI-generated PRs touching security get extra scrutiny. ([arXiv](https://arxiv.org/pdf/2604.19965))
- Positive signals: 83.8% of agent-assisted PRs are eventually merged ([alphaxiv](https://www.alphaxiv.org/abs/2605.22534)); one case study reports small-fix time falling from about 30 minutes to about 2 ([Marker.io: Hiyield](https://marker.io/customer-stories/hiyield)).

**Need:** fewer, better-evidenced PRs with reasoning attached, and a human approval step before anything writes code.

## 5. Zoho Projects users want a tighter GitHub loop

- The GitHub integration is largely read-only. To open a PR, users leave Zoho, find the repo, choose branches and reviewers, then return to update the task by hand. ([Zoho community](https://help.zoho.com/portal/en/community/topic/add-native-github-pull-request-creation-management-from-tasks-bugs))
- Teams moving from Jira find the passive integration a bottleneck.
- Zoho Desk to Zoho Projects loses most ticket detail and custom fields, so agents re-type information. ([Zoho community](https://help.zoho.com/portal/en/community/topic/zoho-bugtracker-integration-sync-additional-fields))

**Need:** capture-to-bug creation with full context, and PR status visible on the Zoho item.

## 6. Multi-repo bug routing: weak evidence

- Routing a bug to the right repo is a known problem and a few tools attempt it (for example [Kaizen Bug Router](https://mcpmarket.com/tools/skills/kaizen-bug-router)).
- No survey or review data found on how much it hurts or whether users would pay to fix it.

**Status:** unproven demand. Do not build the triage phases of the background-agents plan on this alone.

## Implications

1. Strongest evidence: incomplete reports (section 1) and screenshot privacy (section 3). Both point at capture quality and trust, not agents.
2. Real but narrow: non-browser capture and the Zoho-to-GitHub loop (sections 2 and 5).
3. High interest but crowded and trust-limited: AI agents (section 4). Evidence-rich, human-approved flows fit better than autonomous pipelines.
4. Unproven: multi-repo triage (section 6).

## Gaps in this research

- No interviews. Validate with 5 to 10 target users before committing to large features.
- Review-site and vendor content skews toward marketing and toward the vendors' own framing.
- Statistics are quoted from secondary summaries and were not checked against the original surveys.
