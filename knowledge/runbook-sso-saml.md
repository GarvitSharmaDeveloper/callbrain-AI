---
title: Runbook — SSO / SAML login failures
owner: Identity team (Priya Raman)
updated: 2026-09-12
---
# SSO / SAML login failures

## Quick triage (do this while the customer is on the line)
1. Ask for the exact error text. Most common codes:
   - `SAML_ASSERTION_EXPIRED` — the IdP's assertion arrived outside our clock-skew tolerance.
   - `SAML_SIGNATURE_INVALID` — the customer rotated their IdP signing certificate.
   - `SAML_ACS_MISMATCH` — the IdP app points at a stale ACS URL.
2. Check whether the problem is **one tenant or many**. If 5+ tenants show the same error in the last hour, stop troubleshooting the individual tenant and follow the Incident Escalation Policy.
3. Check recent `auth-service` deploys. Any change to SAML validation in the last 24h is the prime suspect.

## Fix: SAML_ASSERTION_EXPIRED
- Root cause is almost always clock skew between the IdP and Orbit (or a deploy that reduced our tolerance).
- **Workaround (support can apply, no engineering needed):** set tenant flag `saml_skew_override=300` for the affected tenant. Takes effect within 60 seconds. Users must retry login.
- **Emergency access:** tenant admins can use *Admin magic-link login* (Settings → Security → Break-glass) so dispatch can keep operating.
- Permanent fix for platform-wide cases: revert the auth-service change (Identity on-call owns this).

## Fix: SAML_SIGNATURE_INVALID
- Ask the customer's IT admin to upload the new IdP certificate in Settings → Security → SSO, or send us the metadata XML.

## Escalation
- Identity on-call (PagerDuty: `identity-oncall`). Subject-matter expert: Priya Raman.
