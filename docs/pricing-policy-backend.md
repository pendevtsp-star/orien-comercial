# Pricing Policy Backend

The `pricing` module is the backend authority for commercial price policy.

## Endpoints

- `GET /pricing/segments` lists official customer segments for the active tenant.
- `POST /pricing/segments` creates or updates an official segment (`pricing.policies.manage`).
- `GET /pricing/policies` lists tenant-scoped, paginated policy versions.
- `POST /pricing/policies` creates a new immutable policy version, including priority from 0 to 1000 (`pricing.policies.manage`).
- `POST /pricing/policies/:id/deactivate` deactivates a version.
- `GET /pricing/resolve` resolves effective legacy price, policy limits, and projected margin.
- `POST /pricing/approvals` creates a ten-minute approval request for the authenticated seller.
- `POST /pricing/approvals/:id/decision` records a decision by a second authenticated user with `pricing.exceptions.authorize`.

## Sale Enforcement

Customer segments come only from `customers.customer_segment_id`; sale requests cannot send a segment.
When a policy applies, the API checks the rounded net item total after discount. Higher priority wins before specificity. A remaining tie between different scopes is rejected as a safe configuration error. `warn` returns a sale warning, `block` rejects the item, and `approval_required` requires an approved request. Price-limit exceptions also require an approved request and a reason. The requester cannot approve their own request.

Each approval fixes the base unit price, discount, net total, cost total, projected margin, quantity, and policy version. Any later difference invalidates it. The approval reason is the protected source of truth: validation and consumption lock and return that reason, and the sale snapshot uses it instead of any client-supplied sale-item reason. Each sold item stores the policy, limits, cost, calculated margin, and approval references as immutable snapshots. Human audit events omit the exception reason; it remains only on the protected approval record and its sale-item snapshot.
