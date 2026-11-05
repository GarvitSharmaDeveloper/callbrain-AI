---
title: Runbook — Duplicate charge
owner: Billing Ops (Ana Gomez)
updated: 2026-10-05
---
# Duplicate charge

1. Look up payments for the invoice. Two `succeeded` payments on one invoice = duplicate.
2. Known cause since billing-service v1.18.2: the retry job can retry a soft decline twice if the issuer recovers in between. Fix in progress (BILL-412).
3. Create a refund request for the second successful payment (Refund Policy §2 — no approval needed).
4. Tell the customer: refund within 3 business days, the original invoice stays paid, no action needed from them.
