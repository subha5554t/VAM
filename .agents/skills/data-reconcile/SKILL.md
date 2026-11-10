---
name: data-reconcile
description: Verify that seller.mock.json and the analytics engine reconcile to the assignment numbers and that every spoken figure comes from a tool result.
---
# data-reconcile
Assert: Σ SKU orders = 400 (last) / 270 (current); Σ price×orders = 200000 / 135000; ASP = 500 both; cancels 32 / 38 (8% / 14% of orders, rounded); OOS 5 / 18; bridge gross ₹ = stock-outs 23085 + promotions 18570 + organic rank 23345 = 65000; weekly orders sum to totals.
Run `pnpm --filter @kam/core test`. If any assertion fails, STOP and fix data or engine; never loosen the assertion.
For transcripts: diff every number spoken against tool outputs; report any mismatch as a BLOCKER.

