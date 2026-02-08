# New Features: Import/Export, Lead Scoring, Duplicate Detection & Merge

## Pages & Navigation

| Feature | URL | Access |
|---------|-----|--------|
| Lead Import | `/app/leads/import` | All users |
| Lead Export | `/app/leads/export` | All users |
| Merge Leads | `/app/leads/merge` | Admin only |
| Lead Scoring | `/app/admin/lead-scoring` | Admin only |

The sidebar has two new sections:
- **Import / Export** – visible to all users (Lead Import, Lead Export)
- **Admin** – the existing admin section now includes "Lead Scoring" (visible to admins only)

---

## Lead Import (CSV)

**Path:** `/app/leads/import`

1. Upload a CSV file (drag-and-drop or file browser).
2. Map CSV columns to lead fields (auto-mapping by header name).
3. Choose an import mode:
   - **Create only** – fails on duplicates
   - **Upsert by email/phone** – updates existing leads that match
   - **Skip duplicates** – silently skips matching rows
4. Preview the first 20 rows with duplicate detection flags.
5. Run the import. A summary shows created/updated/skipped/failed counts.
6. Download an error CSV for failed rows.

**Duplicate detection during import:** rows are checked against existing leads using normalized email (trim + lowercase) and normalized phone (strip non-digit chars, keep leading `+`).

---

## Lead Export (CSV / Excel)

**Path:** `/app/leads/export`

1. Apply filters: Stage, Assigned Agent (admin only), Date From, Date To.
2. Choose which columns to include in the export.
3. Click **Export CSV** or **Export Excel (.xlsx)** to download.

Excel export uses the `xlsx` library and generates a proper `.xlsx` file.

---

## Duplicate Detection

Duplicates are detected by comparing:
- **Email:** trimmed and lowercased
- **Phone:** all non-digit characters stripped; leading `+` preserved

A lead is considered a duplicate if its email **OR** phone matches an existing active lead.

### Where duplicates are surfaced:
- **Lead Import preview** – rows flagged with a "Duplicate" badge and reason
- **Lead Create form** (`/app/leads/new`) – warning shown after selecting a contact
- **Lead Detail page** (`/app/leads/[leadId]`) – warning banner with link to view/merge

---

## Lead Merge (Admin Only)

**Path:** `/app/leads/merge`

Can be accessed directly or via the "Merge" button on duplicate warnings.

### Merge Flow:
1. **Select leads** – search and checkbox 2+ leads; pick a primary.
2. **Resolve fields** – for each field, choose which lead's value wins. Conflicts are highlighted.
3. **Confirm merge** – the system:
   - Applies chosen field values to the primary lead
   - Moves all activities and property matches to the primary
   - Archives (soft-deletes) merged leads with `isArchived: true` and `mergedIntoLeadId`
   - Creates an audit record in `mergeAudits` with `merged_from_ids`, `merged_at`, `merged_by`

Archived leads no longer appear in the leads list or export.

---

## Lead Scoring (Admin Only)

**Path:** `/app/admin/lead-scoring`

### Configuration:
Admins can configure scoring criteria with:
- **Toggle** – enable/disable each criterion
- **Weight** – points awarded when the criterion is met (0–100)
- **Threshold** – for threshold-type criteria (e.g., minimum budget amount, activity count)

### Default Criteria:
| Criterion | Type | Default Weight |
|-----------|------|---------------|
| Has email address | Boolean | 10 |
| Has budget set | Boolean | 15 |
| Has preferred areas | Boolean | 10 |
| Has notes | Boolean | 5 |
| Number of activities ≥ threshold | Threshold (default: 3) | 20 |
| Minimum budget ≥ threshold | Threshold (default: 50,000) | 15 |
| Activity in last 7 days | Boolean | 25 |

### Live Preview:
Select any lead from the dropdown to see a real-time score breakdown. As you adjust criteria weights/thresholds/toggles, the preview updates instantly.

### Applying Scores:
- Click **Save Config** to persist the scoring configuration.
- Click **Recompute All Scores** to recalculate scores for all active leads and store `score` and `lastScoredAt` on each lead.

---

## Schema Changes

### New Tables:
- `leadScoreConfig` – stores scoring criteria and weights
- `mergeAudits` – audit trail for lead merges

### New Fields on `leads`:
- `score` (optional number) – computed lead score
- `lastScoredAt` (optional number) – timestamp of last score computation
- `isArchived` (optional boolean) – true for soft-deleted / merged leads
- `mergedIntoLeadId` (optional lead ID) – points to the primary lead after merge

---

## Tests

Run tests with:
```bash
npm test
```

Test coverage:
- **Duplicate Detection** (`src/__tests__/duplicate-detection.test.ts`) – phone/email normalization, matching logic, archived lead exclusion
- **Lead Merge** (`src/__tests__/merge.test.ts`) – field resolution, activity transfer, archival, audit trail, multi-lead merge
- **Lead Scoring** (`src/__tests__/scoring.test.ts`) – full/empty/partial scoring, threshold logic, weight changes, recompute consistency
