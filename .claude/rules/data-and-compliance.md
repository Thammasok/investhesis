# Data model, PDPA and roadmap

Loaded every session.

## Data model essentials

- Documents use a **header + line items** model: `documents` → `document_headers` (one) and `document_line_items` (many). Each extracted field stores **value + confidence score**.
- Document `type`: `quotation | purchase_order | delivery_note | tax_invoice | invoice | receipt`. `status`: `uploaded → processing → needs_review → confirmed`, or `failed`. `source`: `upload | extension | email | etax_xml`.
- `field_corrections` records every user edit (field, old, new, who, when) — future training data.
- Money is `numeric(18,2)`, quantities `numeric(18,4)`; use decimal strings or a decimal library in TypeScript, never floats. Vendor/buyer tax IDs are 13 digits.
- Other tables: `tenants`, `users`, `memberships` (owner/admin/member), `jobs`, `audit_log`.

## PDPA baseline

- Private storage, encryption at rest, short-expiry signed URLs.
- Per-tenant configurable retention period plus a scheduled cleanup job (stub).
- Write `audit_log` entries for upload, view, edit, export, delete.

## Roadmap

Roadmap — build **Phase 1 only**, but keep structure ready for the later phases:
1. **Phase 1:** upload/scan documents → OCR extraction → user reviews/edits → copy fields or export CSV/Excel.
2. Phase 2 (not now): two-way ERP/SAP integration.
3. Phase 3 (not now): 2-way/3-way matching (PO ↔ delivery note/GR ↔ invoice), tolerances, exception queue. A future `match_results` table must be able to link one PO to many delivery notes/invoices (partial deliveries).
