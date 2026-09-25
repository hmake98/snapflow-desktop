# 0001 — Zoho bug attachments are embedded image URLs, not native uploads

## Status

Accepted (interim)

## Context

The GitHub connector (`main/services/connectors.ts`, `uploadScreenshotToGitHub`) uploads the screenshot as a real committed file in the target repo and links it into the issue.

The Zoho connector (`syncToZoho` in the same file) has no equivalent. It embeds the Snap's Supabase `cloudFileUrl` / `cloudScreenshotUrls` directly as `<img>` tags in the bug's HTML description (`ZohoService.createBug`'s `imageUrl` / description-building code). No file is ever uploaded to Zoho itself.

This is a real feature-parity gap between the two connectors, discovered during a functional-gap audit (2026-09-24). It was not blind-fixed because:

- Zoho Projects' Bugs REST API, as used elsewhere in `zoho.ts`, exposes no attachment-upload endpoint today.
- Implementing one would require API research and testing against a live Zoho portal, which wasn't available at audit time.

## Decision

Keep the URL-embed approach for Zoho for now, rather than guess at an untested attachment API.

## Consequences

- Zoho bug pages show the screenshot inline via Zoho's HTML description rendering — works today, but depends on the Supabase-hosted URL staying reachable.
- If the Supabase storage object is deleted or the workspace's cloud sync is disabled, previously-created Zoho bugs are left with a broken image link. GitHub's committed-file attachments don't have this failure mode.
- The two connectors are visibly asymmetric to a user comparing a GitHub issue vs. a Zoho bug for the same Snap.

## Revisit when

Zoho's attachment REST endpoint is confirmed and can be tested against a real portal/sandbox — then `syncToZoho` should upload the file directly instead of embedding a URL.
