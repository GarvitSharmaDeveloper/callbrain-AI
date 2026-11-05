---
title: Incident Escalation Policy
owner: Platform (Jordan Lee)
updated: 2026-08-02
---
# Incident Escalation Policy

- **Declare an incident** when 5 or more customers report or show the same error within 60 minutes, or when any Enterprise customer's login/dispatch is fully down.
- Authentication outages are **SEV2** by default; SEV1 if more than 25% of tenants are affected.
- Once an incident is declared, support agents **must not give their own ETAs**. Use: "Engineering is actively working on it; I'll personally update you as soon as it's resolved."
- Link the customer's ticket to the incident so they are auto-notified on resolution.
- Incident commander for auth-service: Identity on-call.
