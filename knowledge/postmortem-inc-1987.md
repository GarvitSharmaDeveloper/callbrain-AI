---
title: Postmortem — INC-1987 SAML cert rotation broke Okta tenants
owner: Priya Raman
updated: 2026-03-10
---
# INC-1987 postmortem

- **What happened:** auth-service change to SAML validation broke logins for all Okta tenants for 47 minutes.
- **Detection:** customers called support one by one; the incident was declared after the 9th ticket. Detection was the slowest part.
- **Fix:** Identity reverted the change; Priya added the `saml_skew_override` tenant flag as a per-tenant escape hatch.
- **Action items:** (1) correlate login errors with deploys automatically; (2) let support see cross-customer impact during calls. *(This is exactly what CallBrain does.)*
