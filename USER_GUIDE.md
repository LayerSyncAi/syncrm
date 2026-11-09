# SynCRM User Guide

**The Real Estate CRM Built for Teams That Close Deals**

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Dashboard](#3-dashboard)
4. [Leads Management](#4-leads-management)
5. [Contacts](#5-contacts)
6. [Owners (Sellers & Landlords)](#6-owners-sellers--landlords)
7. [Properties](#7-properties)
8. [Tasks & Activities](#8-tasks--activities)
9. [Lead Import & Export](#9-lead-import--export)
10. [Property Sharing & Collaboration](#10-property-sharing--collaboration)
11. [Document Management](#11-document-management)
12. [Administration (Admin Only)](#12-administration-admin-only)
13. [Commission Tracking](#13-commission-tracking)
14. [Lead Scoring](#14-lead-scoring)
15. [Duplicate Detection & Lead Merge](#15-duplicate-detection--lead-merge)
16. [Tips & Best Practices](#16-tips--best-practices)
17. [Vision & Roadmap](#17-vision--roadmap)

---

## 1. Introduction

### What is SynCRM?

SynCRM is a modern, real-time Customer Relationship Management system purpose-built for real estate agencies and property teams. It helps agents and administrators manage leads, properties, contacts, tasks, commissions, and documents — all in one place.

### Who is it for?

- **Agents** — capture leads, track activities, match properties, manage tasks, and close deals efficiently.
- **Administrators** — oversee the entire pipeline, manage users, configure pipeline stages, set commission structures, define lead scoring rules, and monitor team performance.

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **Real-Time Data** | Built on Convex, every change is instantly reflected across all users — no page refreshes needed. Live dashboard indicators show data is always current. |
| **Role-Based Access** | Agents see only their own leads and contacts; admins have full visibility across the organization. Sensitive operations (user management, commission configs, lead merging) are locked to admins. |
| **Pipeline-Driven Workflow** | Customizable pipeline stages guide leads from first contact to deal close, ensuring no opportunity falls through the cracks. |
| **Smart Property Matching** | Automatically suggests properties based on a lead's budget, preferred areas, and interest type (buy/rent). Compare multiple properties side-by-side. |
| **Lead Scoring** | Configurable, weighted scoring criteria help teams prioritize hot leads and identify neglected opportunities. |
| **Commission Automation** | Define split scenarios (shared deals, own property, company property) and automatically calculate agent and company payouts when deals close. |
| **Collaboration Tools** | Property sharing between agents, activity timelines, and team-wide visibility enable seamless teamwork. |
| **Import/Export** | Bulk import leads via CSV, export filtered data to CSV or Excel for reporting and external use. |
| **Document Management** | Attach contracts, IDs, proof of funds, and other documents directly to leads or properties with organized folder categories. |
| **Onboarding Tour** | First-time users get an interactive guided tour of the interface to get productive immediately. |
| **Multi-Tenant** | Each organization operates in its own isolated data space, supporting agencies of any size. |

### Technology Overview

SynCRM is built with modern, proven technologies:

- **Frontend**: Next.js 16, React 19, Tailwind CSS, Framer Motion (polished animations throughout)
- **Backend**: Convex (real-time database, serverless functions, authentication)
- **Authentication**: Convex Auth with email/password, password reset flows, and force-change-password support
- **File Storage**: Convex Storage for document uploads
- **Export**: XLSX library for Excel export support

---

## 2. Getting Started

### 2.1 Signing Up (First User / Organization Setup)

The very first user to sign up becomes the organization admin. During sign-up, you provide:

1. **Full Name** — your display name throughout the system
2. **Email** — used for login and notifications
3. **Organization Name** — the name of your agency or team
4. **Password** — minimum 8 characters; must be confirmed

After signing up, you are automatically signed in and an organization is created for you. All subsequent users are created by the admin from the Admin > Users page.

### 2.2 Signing In

Navigate to the login page and enter your email and password. If your admin has flagged your account for a password reset, you will be redirected to the **Force Change Password** page before accessing the app.

### 2.3 Forgot Password

Click **"Forgot password?"** on the login page. Enter your email address and a password reset link will be sent to you. Follow the link to set a new password.

### 2.4 The Onboarding Tour

First-time users see an interactive guided tour powered by React Joyride. The tour walks you through:

1. **Welcome screen** — introduction to SynCRM
2. **Main navigation** — Dashboard, Leads, Contacts, Owners, Properties, Tasks
3. **Dashboard** — your pipeline overview at a glance
4. **Leads** — where you manage opportunities
5. **Contacts** — your address book
6. **Properties** — your property inventory
7. **Tasks** — activity tracking and follow-ups
8. **Import/Export** — bulk data operations
9. **Admin section** (if admin) — user and system management
10. **Profile** — account settings and timezone

You can skip the tour at any time or replay it later.

### 2.5 Navigation

The sidebar is your command center with these main sections:

| Section | Items | Visibility |
|---------|-------|------------|
| **Main** | Dashboard, Leads, Contacts, Owners, Properties, Tasks | All users |
| **Import / Export** | Lead Import, Lead Export | All users |
| **Admin** | Users, Roles, Stages, Lead Scoring, Commissions | Admin only |

The sidebar can be **collapsed** (desktop only) by clicking the arrow button on its edge. When collapsed, hovering over icons shows tooltip labels. On mobile, the sidebar slides in as an overlay and can be closed with the X button.

The **top bar** shows the current page title and provides access to your profile and logout.

---

## 3. Dashboard

**Path:** `/app/dashboard`

The dashboard is your real-time command center. All data updates live — indicated by a green pulsing "Live" indicator.

### 3.1 Pipeline Overview

At the top, you see:

- **Win Rate** — a percentage bar showing your overall conversion rate from lead to closed-won.

### 3.2 KPI Cards

Four key performance indicator cards display:

- **Total Leads** — all active leads in the pipeline
- **Open Leads** — leads currently being worked
- **Won Deals** — leads that reached a terminal "won" stage
- **Lost Deals** — leads that reached a terminal "lost" stage

Each card features animated counters that roll up from zero on page load.

### 3.3 Lead Score Distribution

A visual breakdown of all scored leads into five temperature bands:

| Band | Score Range | Meaning |
|------|------------|---------|
| Cold | 0–19 | Very low engagement or fit |
| Cool | 20–39 | Below average, needs nurturing |
| Warm | 40–59 | Moderate engagement |
| Hot | 60–79 | High potential, actively engaged |
| On Fire | 80–100 | Top priority, ready to close |

Shows the count of leads in each band and what percentage of total leads are scored.

### 3.4 Average Score by Stage

Displays the average lead score for each pipeline stage. This reveals:

- Which stages have the highest-quality leads
- Where leads might be stalling (low scores in mid-pipeline stages)
- Color coding: green (70+), yellow (40–69), red (below 40)

### 3.5 Top Unworked Leads

A prioritized list of **high-scoring leads with no activity in the last 7 days**. Each entry shows:

- Lead score with color-coded badge
- Lead name and assigned owner
- Link to the lead detail page

This section ensures hot leads don't go cold due to neglect.

### 3.6 Leads by Stage

A bar chart showing how many leads sit in each pipeline stage, with animated progress bars. This gives you an instant read on pipeline health and bottlenecks.

---

## 4. Leads Management

### 4.1 Leads List

**Path:** `/app/leads`

The main leads table displays all your leads (agents see only their own; admins see all). Each row shows:

| Column | Description |
|--------|-------------|
| **Contact** | Lead name and phone number |
| **Interest** | "Buy" or "Rent" badge |
| **Score** | Color-coded score badge (green 70+, yellow 40–69, red below 40, or "--" if unscored) |
| **Stage** | Dropdown to move the lead to a different pipeline stage inline |
| **Owner** | The assigned agent |
| **Property** | Attached property name (if any) |
| **Actions** | View (eye icon) and Delete (trash icon) buttons |

#### Filtering

The filter bar above the table provides powerful filtering:

- **Stage** — filter by any pipeline stage
- **Interest type** — Rent, Buy, or all
- **Lead Score** — Hot (70+), Warm (40–69), Cold (0–39), or Not scored
- **Location keyword** — search within preferred areas
- **Search** — full-text search by name or phone
- **Owner** (admin only) — filter by assigned agent

#### Sorting

Click the **Score** column header to cycle through: unsorted → descending (highest first) → ascending (lowest first) → unsorted.

#### Pagination

Leads are paginated (50 per page by default) with next/previous controls at the bottom.

#### Bulk Matching

Click the **"Bulk Match"** button to open the bulk property matching modal. This lets you match multiple leads to properties simultaneously based on their preferences.

### 4.2 Creating a New Lead

**Path:** `/app/leads/new`

The lead creation form is split into two columns:

**Left column — Lead details:**

1. **Contact** (required) — search for an existing contact or create a new one inline
   - Type to search by name, phone, or email
   - Click "+ New Contact" to create a contact right from the lead form
   - After selecting a contact, their details are displayed and **duplicate detection** runs automatically
2. **Interest type** (required) — Rent or Buy
3. **Source** (required) — Walk-in, Referral, Facebook, WhatsApp, Website, Property portal, or Other
4. **Budget Min / Budget Max** — with currency selector (supports multi-currency)
5. **Initial Stage** (required) — which pipeline stage to place the lead in
6. **Assign to** (admin only) — assign to any active agent, or default to yourself
7. **Preferred Areas** — select from existing locations or add new ones. Areas appear as removable tags
8. **Notes** — free text for any additional context

**Right column — Attach Properties (optional):**

1. Search properties by title or location
2. Toggle between "All available" and "Recommended" (auto-filtered by interest type, budget, and preferred areas)
3. Select multiple properties with checkboxes
4. Selected properties appear as dismissible tags showing title, price, and location

When saving with multiple properties selected, the system creates **one lead per property** — all linked to the same contact. This is ideal for clients interested in multiple listings.

### 4.3 Lead Detail Page

**Path:** `/app/leads/[leadId]`

The detail page has several sections:

#### Hero Card

At the top, a summary card shows:

- Lead name, phone, email
- Interest type and source badges
- Current pipeline stage (with dropdown to change)
- Budget range
- Preferred areas
- Lead score
- Assigned owner
- Creation date

#### Editing a Lead's Details

Click **Edit details** on the hero card to update anything you learn about the lead after it was created: name, phone, email, interest type (rent/buy), source, budget range and currency, and preferred areas (pick from the suggestion list or add a new location). Name, phone and email are shared with the linked contact, so saving them also updates the contact record and any other leads for that contact. A lead that has already moved past the first pipeline stage must keep at least a phone number or an email address. Every edit is recorded in the audit log and the lead score is recalculated.

#### Duplicate Warning

If this lead's email or phone matches another active lead, a warning banner appears with a link to view and merge the duplicates. The same warning appears inside the edit dialog while you type a new phone or email.

#### Tabs

| Tab | Content |
|-----|---------|
| **Timeline** | Chronological activity feed — calls, emails, WhatsApp messages, meetings, viewings, and notes. Each activity shows type, title, description, scheduled date, completion status, and who created it. |
| **Documents** | Upload and manage documents organized by folder (Mandates to Sell, Contracts, ID Copies, Proof of Funds, Lead Documentation) |
| **Matched Properties** | Properties that have been explicitly matched to this lead, with match type (suggested, requested, viewed, offered). Supports removing matches and viewing property details in a modal. |
| **Suggested** | AI-powered property suggestions based on the lead's preferences, budget, and location. Shows match score and allows attaching suggested properties. Supports side-by-side property comparison. |
| **Notes** | Editable notes field with auto-save |

#### Close Details

For leads in terminal stages (won/lost), additional fields appear:

- **Close Reason** — why the deal was won or lost
- **Deal Value** — the transaction amount with currency
- When a lead is won, the system prompts you to close sibling leads (other leads on the same property) as lost

#### Activities

From the timeline tab, you can create new activities:

- **Type**: Call, WhatsApp, Email, Meeting, Viewing, or Note
- **Title** and **Description**
- **Scheduled date/time** (optional)
- **Assigned to** — which agent should follow up
- Mark activities as complete with optional completion notes

### 4.4 Deleting a Lead

Leads can be deleted from both the leads list and the detail page. Deletion requires typing a confirmation phrase to prevent accidental data loss. Deleting a lead also removes its activities and frees any attached properties.

---

## 5. Contacts

**Path:** `/app/contacts`

Contacts are the people behind your leads. A single contact can have multiple leads (e.g., someone looking to both rent and buy).

### 5.1 Contacts List

Displays all contacts with:

- **Name** and **Phone**
- **Email** and **Company** (if provided)
- **Assigned agent(s)** — contacts can be shared across agents
- **Role** — buyers/tenants by default; switch the filter to see owners
- **Actions** — edit and delete

**Visibility rules:**
- **Agents** see only contacts they own
- **Admins** see all contacts in the organization

### 5.2 Creating a Contact

Click "+ New Contact" to open the creation form:

- **Name** (required) — minimum 2 characters
- **Phone** (required) — minimum 7 digits
- **Email** (optional) — validated format
- **Company** (optional)
- **Preferred Areas** (optional)
- **Notes** (optional)

### 5.3 Editing a Contact

Click the settings/edit icon on any contact row to open the edit drawer. All fields can be updated. Changes are saved in real-time.

### 5.4 Deleting a Contact

Click the trash icon to delete. A confirmation dialog prevents accidental deletion. Contacts with active leads cannot be deleted.

---

## 6. Owners (Sellers & Landlords)

**Path:** `/app/owners`

Owners are the clients whose property you represent — the sellers and landlords
on the supply side of the business, as against the buyers and tenants in
Contacts.

> **Two different "owners".** Throughout the app, *Owner* on this page means the
> **client** who owns a property. The agent who owns a record is labelled
> **assigned agent** (on Contacts and Owners) or **agent ownership** (on a
> property's Documentation tab). They are unrelated.

### 6.1 One person, two roles

An owner is a contact carrying a **seller / landlord / both** role, not a
separate record. A landlord who is also house-hunting is therefore **one
person** in the system: they appear in both Owners and Contacts, share one
activity timeline, and are caught by the same duplicate detection.

- Contacts defaults to **Buyers & tenants**; use the **Role** filter to show
  Owners or Everyone.
- Owners shows only contacts with an owner role.
- An owner who is also a buyer/tenant is badged as such in both lists.

### 6.2 Owners List

Shows name, type, phone, email, **how many properties they hold**, and the
assigned agent. Search by name, phone, email or company, and filter by type.
Visibility follows the same rules as Contacts: agents see the owners assigned to
them, admins see the whole organization.

### 6.3 Creating an Owner

Click **"+ New Owner"** and provide:

- **Name** (required)
- **Type** (required) — Seller, Landlord, or Both
- **Phone** and/or **Email** — at least one is required
- **Company** (optional) — for corporate landlords
- **Notes** (optional)

If the phone number already belongs to a contact, that person is **marked as an
owner** instead of a second record being created, and you are told so.

### 6.4 Removing an Owner

Removing an owner always unlinks them from their properties. What happens to the
record depends on who they are:

- **Owner only** — the record is deleted.
- **Also a buyer/tenant** — only the owner role is removed. Their contact
  record, leads and history are kept.

### 6.5 Owners on a Property

Each property has an **Owner** tab showing the seller or landlord it belongs to.
Owner information sits alongside the mandate, so the tab follows the same access
rules as Documents: admins, the owning agent(s), and explicit collaborators.

From the tab you can:

- **New owner** — quick-add a name and contact and link them in one step, the
  same pattern as creating a contact from a lead. The role defaults from the
  listing (rental → landlord, sale → seller).
- **Link existing** — search Owners and attach someone already on file.
- **Unlink** — break the property link. The owner record itself is kept.

A property can have several owners (joint sellers), and an owner can hold
several properties — their full portfolio is listed on their detail page. The
linked owner is also shown at a glance on the property's Details tab.

---

## 7. Properties

**Path:** `/app/properties`

Properties represent the real estate inventory your team is selling or renting.

### 6.1 Properties List

Properties can be viewed in **table** or **grid** (card) view. Each property shows:

| Field | Description |
|-------|-------------|
| **Title** | The property listing name |
| **Type** | House, Apartment, Land, Commercial, or Other |
| **Listing Type** | Rent or Sale |
| **Price** | With currency formatting |
| **Location** | Area/neighborhood |
| **Area** | Size in m² |
| **Bedrooms / Bathrooms** | Room counts |
| **Status** | Available, Under Offer, Let, Sold, or Off Market |
| **Created By** | The agent who listed it |

#### Filtering

- **Type** — House, Apartment, Land, etc.
- **Listing type** — Rent or Sale
- **Status** — Available, Under Offer, etc.
- **Search** — by title or location

### 6.2 Creating a Property

**Path:** `/app/properties/new`

Fill in:

1. **Title** (required)
2. **Type** — House, Apartment, Land, Commercial, Other
3. **Listing type** — Rent or Sale
4. **Price** with currency selector
5. **Location**
6. **Area** (m²)
7. **Bedrooms** and **Bathrooms** (optional)
8. **Description**
9. **Images** — upload property photos with drag-and-drop support

### 6.3 Property Detail (Edit Drawer)

Click any property row to open the detail drawer with four tabs:

| Tab | Content |
|-----|---------|
| **Details** | View and edit all property fields |
| **Sharing** | Share this property with other agents for their leads (see section 9) |
| **Documentation** | Upload and manage documents (mandates, contracts, etc.) |
| **Gallery** | View, upload, and manage property images |

### 6.4 Property Status Flow

Properties move through statuses as deals progress:

```
Available → Under Offer → Sold / Let
                ↘ Off Market (withdrawn)
```

---

## 8. Tasks & Activities

**Path:** `/app/tasks`

The tasks page is your daily action center. It shows all activities assigned to you (or all users, for admins).

### 7.1 Summary Cards

At the top, four animated KPI cards show:

- **Due Today** — tasks scheduled for today
- **Overdue** — past-due tasks not yet completed
- **Upcoming** — future tasks on the horizon
- **Completed** — tasks marked as done

### 7.2 Task Table

Each task row displays:

| Column | Description |
|--------|-------------|
| **Due Date Ring** | A visual ring indicator showing urgency — green (plenty of time), yellow (approaching), red (overdue) |
| **Title** | Task name with lead link |
| **Type** | Call, WhatsApp, Email, Meeting, Viewing, or Note — shown as a colored badge |
| **Lead** | The associated lead name (clickable to go to lead detail) |
| **Status** | Todo or Completed badge |
| **Scheduled** | Date and time |
| **Actions** | View details, open lead, delete |

### 7.3 Filtering Tasks

- **Status** — Todo, Completed, or All
- **Type** — Call, WhatsApp, Email, Meeting, Viewing, Note, or All

### 7.4 Task Detail Modal

Click the eye icon to open a detailed view of any task. From here you can:

- View full description and notes
- Mark as complete with completion notes
- Navigate to the associated lead

### 7.5 Activity Reminders

The system includes automated reminders:

- **Pre-reminders** — sent before a scheduled activity
- **Daily digest** — a summary of today's upcoming activities
- **Overdue reminders** — alerts for past-due tasks

Reminders are delivered via email and are deduped to prevent spam.

---

## 9. Lead Import & Export

### 8.1 Lead Import (CSV)

**Path:** `/app/leads/import`

Bulk import leads from CSV files:

1. **Upload** — drag and drop or browse for a CSV file. The system parses it using a Web Worker for large files.
2. **Map columns** — the system auto-maps CSV headers to lead fields (including **Primary Agent**, detected from headers such as "Primary Agent", "Agent" or "Assigned To"). You can manually adjust mappings. The mapping you import with is remembered in your browser and re-applied to the next file with the same columns.
3. **Choose the lead source for this batch** (required) — e.g. PropertyBook or Property.co.zw. Every lead in the upload is tagged with it, so imported lists are no longer filed under "Other". If the file has its own Source column you can tick *Use the mapped Source column*: rows that name a known source (value or label, e.g. "Property Book") keep it, and the rest fall back to the batch source.
4. **Choose import mode:**
   - **Create only** — fails on duplicates
   - **Upsert by email/phone** — updates existing leads that match
   - **Skip duplicates** — silently skips matching rows
5. **Preview** — see the first 20 rows with duplicate detection flags, the source, the interest type and the agent each row will receive, plus how many rows will be auto-assigned or left unassigned.
6. **Run import** — a summary shows created/updated/skipped/failed counts, and auto-assigned vs unassigned counts when a Primary Agent column is mapped.
7. **Issues report** — download a CSV of failed rows, unmatched agents and unreadable interest types.

**Primary Agent → assigned agent.** Each row's Primary Agent is matched to an active member of your organisation by name, ignoring case, punctuation, extra spaces and word order, and accepting initials or a first/last name on its own ("J. Moyo", "John M", "Moyo John" and "john.moyo@…" all find John Moyo). If the name matches more than one agent, or nobody, the system does not guess: the lead is imported **Unassigned**. Unassigned leads are visible to every user in the organisation (filter the Leads list by *Assigned agent → Unassigned*); an admin can assign them, and any agent can take one with *Edit details → Assign to me*. Rows with an empty Primary Agent, or imports without the column, behave as before (you own the leads).

**Interest type.** Portal wording is understood: *rent, renting, rental, to let, for rent, lease…* → Renting; *buy, buying, purchase, for sale, sale…* → Buying. Empty or unrecognised values are never defaulted to Buying: the preview lists them so you can say what each means, and anything left as *Flag for review* is imported with an **Interest type needs review** badge until an agent confirms it from the lead's profile.

**Duplicate detection during import:** Each row is checked against existing leads using:
- Normalized email (trimmed, lowercased)
- Normalized phone (non-digit characters stripped, leading `+` preserved)

### 8.2 Lead Export (CSV / Excel)

**Path:** `/app/leads/export`

Export your leads data with filters:

1. **Apply filters:**
   - Stage
   - Assigned Agent (admin only)
   - Date From / Date To
2. **Choose columns** to include in the export
3. **Download format:**
   - **CSV** — lightweight, universal format
   - **Excel (.xlsx)** — formatted spreadsheet with proper column types

Exported data respects role-based access — agents only export their own leads, admins can export any agent's leads.

---

## 10. Property Sharing & Collaboration

Property sharing is a core collaboration feature that enables two agents to work together on a deal.

### How It Works

1. **Agent A** (property holder) has a property listing.
2. **Agent B** (lead holder) has a client looking for that type of property.
3. Agent A shares their property with Agent B, linking it to Agent B's specific lead.
4. Together they work the deal to close.

### Sharing a Property

From the property detail → **Sharing** tab:

1. Click to create a new share
2. Select the **agent** you want to share with
3. Select their **lead** that this property matches
4. Add optional **notes** about the arrangement
5. Submit the share

### Share Statuses

| Status | Meaning |
|--------|---------|
| **Active** | Property is being shown/negotiated for this lead |
| **Closed Won** | The deal closed successfully |
| **Closed Lost** | The deal did not close |
| **Cancelled** | The share was withdrawn |

### Commission Impact

When a shared deal closes, the commission split is automatically calculated based on admin-configured commission scenarios (see section 12).

---

## 11. Document Management

Documents can be attached to both **leads** and **properties**.

### Folder Categories

| Folder | Use Case |
|--------|----------|
| **Mandates to Sell** | Signed mandates authorizing the sale/rental |
| **Contracts** | Purchase agreements, lease contracts |
| **ID Copies** | Client identification documents |
| **Proof of Funds** | Bank statements, pre-approval letters |
| **Lead Documentation** | Any other relevant lead paperwork |

### Uploading Documents

1. Navigate to a lead detail → **Documents** tab, or a property detail → **Documentation** tab
2. Select the appropriate folder
3. Drag and drop or click to browse for files
4. The file is uploaded to secure cloud storage (Convex Storage)

### Viewing & Managing

- View file name, size, and upload date
- Download documents
- Delete documents when no longer needed

Documents are scoped to the organization — only team members can access them.

---

## 12. Administration (Admin Only)

The admin section is only visible to users with the **admin** role.

### 11.1 User Management

**Path:** `/app/admin/users`

#### Viewing Users

See all users in the organization with:
- Name, email, role (admin/agent)
- Active status
- Timezone
- Password reset status

#### Creating a New User

1. Click "+ Add User"
2. Fill in:
   - **Full Name** (required)
   - **Email** (required)
   - **Role** — Admin or Agent
   - **Active status** — enable/disable the account
3. The system creates the user with Convex Auth. You can set them to **reset password on next login**.

#### Editing a User

Open the edit drawer for any user to:
- Update name, email, role
- Enable/disable the account
- Set timezone
- Force a password reset on next login

#### Password Management

Admins can:
- Trigger a **force password reset** — user must change their password at next login
- The force-change-password page (`/app/force-change-password`) handles this flow

### 11.2 Role Management

**Path:** `/app/admin/roles`

View all users and their current roles. Toggle between **Admin** and **Agent** using the animated switch control. The system prevents you from demoting yourself if you're the last admin.

**Role differences:**

| Capability | Admin | Agent |
|-----------|-------|-------|
| View all leads | Yes | Own leads only |
| View all contacts | Yes | Own contacts only |
| Assign leads to any agent | Yes | No (auto-assigned to self) |
| Filter by owner | Yes | No |
| Manage users | Yes | No |
| Configure pipeline stages | Yes | No |
| Configure lead scoring | Yes | No |
| Configure commissions | Yes | No |
| Merge duplicate leads | Yes | No |
| Export all agents' data | Yes | Own data only |

### 11.3 Pipeline Stage Management

**Path:** `/app/admin/stages`

Pipeline stages define the journey a lead takes from first contact to deal close.

#### Viewing Stages

A table shows all stages with:
- **Order** — the position in the pipeline (drag to reorder)
- **Name** — stage display name
- **Description** — what this stage means
- **Action** — suggested action for leads in this stage
- **Terminal** — whether this is an end state
- **Terminal Outcome** — Won or Lost (for terminal stages)

#### Creating / Editing a Stage

1. Click "+ New Stage" or edit an existing one
2. Fill in:
   - **Name** (required)
   - **Description** — helps agents understand what each stage means
   - **Action** — recommended next step for leads in this stage
   - **Terminal** — toggle if this is an end state
   - **Terminal Outcome** — Won or Lost (only for terminal stages)
3. Save the stage

#### Reordering Stages

Drag stages by their grip handle to reorder them. The order determines how stages appear in the pipeline view and dropdowns.

#### Deleting Stages

Stages can be deleted if no leads are currently in that stage. The system prevents deletion of stages with active leads to maintain data integrity.

### 11.4 Lead Scoring Configuration

**Path:** `/app/admin/lead-scoring`

See full details in [section 14](#14-lead-scoring).

### 11.5 Commission Configuration

**Path:** `/app/admin/commissions`

See full details in [section 13](#13-commission-tracking).

---

## 13. Commission Tracking

**Path:** `/app/admin/commissions` (Admin only)

SynCRM automates commission calculations for closed deals.

### 12.1 Commission Scenarios

Three deal scenarios are supported:

| Scenario | Description | Example Split |
|----------|-------------|---------------|
| **Shared Deal** | Property shared between two agents. Agent A holds the property, Agent B closes with their lead. | 40% Property Agent / 40% Lead Agent / 20% Company |
| **Own Property & Own Lead** | Agent closes a deal using their own listing and their own lead. | 0% Property Agent / 80% Lead Agent / 20% Company |
| **Company Property** | Agent brings a lead to a company-listed property. | 0% Property Agent / 60% Lead Agent / 40% Company |

### 12.2 Configuring Commission Splits

Admins create commission configurations:

1. **Name** — descriptive name for the config
2. **Description** — explain when this config applies
3. **Scenario** — select which scenario
4. **Property Agent %** — percentage to the property holder
5. **Lead Agent %** — percentage to the deal closer
6. **Company %** — company cut
7. **Is Default** — whether this is the default config for its scenario

The three percentages must always total 100%.

### 12.3 Commission Records

When a deal closes (lead reaches a terminal "won" stage), the system generates a commission record:

- **Deal value** — from the lead's deal value field
- **Split breakdown** — amounts for property agent, lead agent, and company
- **Status flow:** Pending → Approved → Paid

Admins can review and update commission statuses. The commission records page shows:
- All deal commissions with filtering by status
- Detailed breakdown of each deal's split

---

## 14. Lead Scoring

**Path:** `/app/admin/lead-scoring` (Admin only)

Lead scoring assigns a numerical score (0–100) to each lead based on configurable criteria, helping teams prioritize their efforts.

### 13.1 How Scoring Works

Each criterion has:
- **Toggle** — enable or disable the criterion
- **Weight** — points awarded when met (0–100)
- **Threshold** — for threshold-type criteria (e.g., minimum budget amount, minimum activity count)

The final score is the sum of weights for all met criteria, capped at 100.

### 13.2 Default Scoring Criteria

| Criterion | Type | Default Weight | What It Measures |
|-----------|------|---------------|-----------------|
| Has email address | Boolean | 10 | Contact completeness |
| Has budget set | Boolean | 15 | Buyer seriousness |
| Has preferred areas | Boolean | 10 | Specificity of interest |
| Has notes | Boolean | 5 | Engagement level |
| Number of activities >= threshold | Threshold (default: 3) | 20 | How actively the lead is being worked |
| Minimum budget >= threshold | Threshold (default: 50,000) | 15 | Deal size potential |
| Activity in last 7 days | Boolean | 25 | Recency of engagement |

### 13.3 Live Preview

Select any lead from the dropdown to see a **real-time score breakdown**. As you adjust criteria weights, thresholds, and toggles, the preview updates instantly — no need to save first.

### 13.4 Saving & Applying Scores

- **Save Config** — persists your scoring criteria configuration
- **Recompute All Scores** — recalculates scores for all active leads and stores the result (score and timestamp) on each lead

### 13.5 Where Scores Appear

- **Leads list** — Score column with color-coded badges
- **Dashboard** — Score distribution chart, average score by stage, top unworked leads
- **Lead detail** — Score displayed in the hero card
- **Filters** — Filter leads by score range (Hot/Warm/Cold/Unscored)

---

## 15. Duplicate Detection & Lead Merge

### 14.1 Duplicate Detection

Duplicates are identified by comparing:
- **Email** — trimmed and lowercased
- **Phone** — all non-digit characters stripped; leading `+` preserved

A lead is considered a duplicate if its email **OR** phone matches another active lead.

#### Where Duplicates Are Surfaced

| Location | How It Appears |
|----------|---------------|
| **Lead creation form** | Warning shown after selecting a contact that matches an existing lead |
| **Lead detail page** | Warning banner with link to view/merge |
| **CSV import preview** | Rows flagged with a "Duplicate" badge and reason |

### 14.2 Lead Merge (Admin Only)

**Path:** `/app/leads/merge`

When duplicates are detected, admins can merge them:

#### Merge Flow

1. **Select leads** — search and select 2 or more leads to merge. Choose which one is the **primary** (the survivor).
2. **Resolve fields** — for each field where values differ, choose which lead's value wins. Conflicts are highlighted in the UI.
3. **Confirm merge** — the system:
   - Applies chosen field values to the primary lead
   - Moves all activities from merged leads to the primary
   - Moves all property matches to the primary
   - Archives (soft-deletes) merged leads with `isArchived: true`
   - Records the merge in an audit trail (`mergeAudits` table) with who merged what and when

Archived leads no longer appear in the leads list, exports, or dashboards.

---

## 15A. Platform Administration (LayerSync Staff Only)

SynCRM is multi-tenant: every organisation is an isolated data space. LayerSync support staff sometimes need to look inside an organisation — to confirm an update went through, to verify a feature is working, or to investigate something a client reports — **without** creating a user account inside the client's CRM.

**Platform admins** are separate accounts that sit above all organisations:

- They have no organisation of their own, so they never appear in any client's **Users** page.
- Signing in lands them on **Platform** (`/app/platform`), which lists every organisation on the deployment with user / lead / contact / property counts and the date of the last activity.
- **Open** puts the platform admin into that organisation in a **read-only view**: the dashboard, leads, contacts, properties, reports and admin pages all render exactly as an admin of that organisation would see them, under a yellow "Platform view" banner. Every write is refused with "Platform view is read-only", so nothing in the client's data is ever changed or attributed to a LayerSync account. The client's **Logs** page records that platform support opened the organisation, for transparency.
- **Exit organisation** in the banner (or on the Platform page) returns to the overview.
- **Platform admins** card: grant platform access to a colleague by email (a new account is created with the deployment's temporary password and must be changed on first sign-in), or revoke it.
- **Delete** an organisation (trash icon, type the slug to confirm) removes the organisation and all of its data in the background — users and their logins, leads, contacts, properties, documents, activities, settings. There is no export and no undo.

The first platform admin on a deployment is created from the command line; see `docs/platform-admin.md`.

---

## 16. Tips & Best Practices

### For Agents

1. **Log every interaction** — create activities for calls, emails, WhatsApp messages, and meetings. This builds a complete timeline and improves lead scores.
2. **Use preferred areas** — filling in preferred areas on leads enables smart property matching and recommendations.
3. **Set budgets** — specifying budget ranges makes property suggestions much more relevant and boosts lead scores.
4. **Check "Top Unworked Leads"** daily — the dashboard highlights high-scoring leads that haven't been contacted in 7+ days.
5. **Attach properties early** — when creating a lead, use the "Recommended" filter to quickly find matching properties.
6. **Use tasks** — schedule follow-ups as activities with due dates. The due date ring provides a visual urgency indicator.
7. **Upload documents promptly** — attach contracts, IDs, and proof of funds to leads as soon as you receive them.
8. **Leverage property sharing** — if you have a client who needs a property listed by another agent, ask them to share it with you.

### For Admins

1. **Configure pipeline stages thoughtfully** — stages should reflect your actual sales process. Use descriptions and suggested actions to guide agents.
2. **Set up lead scoring early** — even default criteria help prioritize leads. Adjust weights based on what matters most for your market.
3. **Review commission configs** — ensure split percentages are fair and agreed upon before deals start closing.
4. **Monitor the dashboard** — the "Avg Score by Stage" and "Top Unworked Leads" sections reveal where attention is needed.
5. **Use import for bulk operations** — when onboarding, import existing leads via CSV rather than creating them one by one.
6. **Merge duplicates regularly** — check for and merge duplicate leads to keep data clean and avoid wasted effort.
7. **Manage user access** — disable accounts for departed team members rather than deleting them to preserve historical data.
8. **Set timezones for users** — ensures activity reminders and timestamps are correct for each team member.

---

## 17. Vision & Roadmap

### The Vision

SynCRM aims to be the **most intuitive and collaborative real estate CRM** available — purpose-built for the unique workflows of property agencies. Our guiding principles:

- **Real-time first** — every action is instantly visible to the whole team
- **Agent-centric** — the UI is designed for busy agents who need speed, not complexity
- **Data-driven decisions** — scoring, analytics, and insights help teams focus on what moves deals forward
- **Collaboration over competition** — property sharing and commission tracking make inter-agent deals seamless

### What's Coming Next

#### Phase 1: Core Integration (In Progress)
- Full frontend-backend integration for all pages
- Complete authentication flows
- Error handling and loading states across the app
- Client-side form validation

#### Phase 2: Essential CRM Features
- **Communication integration** — click-to-call, click-to-email, WhatsApp deep links, email templates
- **Activity improvements** — recurring activities, activity templates, calendar view, email reminders for upcoming tasks
- **Enhanced property matching** — improved auto-suggestion algorithms and match scoring
- **Global search** — search across leads, contacts, properties, and tasks from one input
- **Saved filters/views** — save your frequently used filter combinations
- **Dashboard analytics** — conversion funnels, lead source breakdowns, agent performance metrics, pipeline velocity tracking

#### Phase 3: Advanced Features
- **Integrations** — WhatsApp Business API, Google/Outlook Calendar sync, email service integration (SendGrid/Mailgun), property portal APIs
- **Document management** — document preview, secure sharing links, document categories
- **Reporting** — custom report builder, scheduled report emails, PDF export, agent commission reports
- **Customization** — custom fields for leads and properties, custom pipeline stages per property type, configurable lead sources
- **Audit & compliance** — complete audit trail, data retention policies, GDPR tools
- **AI features** — AI-powered lead summaries, next-best-action recommendations, predictive lead scoring, automated follow-up suggestions

### Performance Goals

| Metric | Target |
|--------|--------|
| Page load time | < 2 seconds |
| API response time | < 500ms |
| Test coverage | > 70% |
| Lead conversion improvement | 15%+ |

---

## Quick Reference

### Keyboard & Navigation Shortcuts

| Action | How |
|--------|-----|
| Collapse/expand sidebar | Click the arrow on sidebar edge |
| Quick search leads | Type in the Search field on Leads page |
| Change lead stage | Use the inline dropdown on any lead row |
| Navigate to lead | Click the lead name or eye icon |
| Create new lead | Click "New Lead" button on Leads page |

### URL Reference

| Page | Path |
|------|------|
| Dashboard | `/app/dashboard` |
| Leads list | `/app/leads` |
| Create lead | `/app/leads/new` |
| Lead detail | `/app/leads/[leadId]` |
| Import leads | `/app/leads/import` |
| Export leads | `/app/leads/export` |
| Merge leads | `/app/leads/merge` |
| Contacts | `/app/contacts` |
| Properties | `/app/properties` |
| Create property | `/app/properties/new` |
| Tasks | `/app/tasks` |
| Admin: Users | `/app/admin/users` |
| Admin: Roles | `/app/admin/roles` |
| Admin: Stages | `/app/admin/stages` |
| Admin: Lead Scoring | `/app/admin/lead-scoring` |
| Admin: Commissions | `/app/admin/commissions` |

### Lead Sources

| Source | Description |
|--------|-------------|
| Walk-in | Client visited the office in person |
| Referral | Referred by another client or contact |
| Facebook | Lead from Facebook ads or posts |
| Instagram | Lead from Instagram |
| TikTok | Lead from TikTok |
| WhatsApp | Inquiry via WhatsApp |
| Website | Lead from your website |
| PropertyBook | Lead from a propertybook.co.zw listing |
| Property.co.zw | Lead from a property.co.zw listing |
| Other | Any other source |

**Other portal (retired).** Leads used to be recorded against a single generic
"Property Portal" source, which hid which platform they actually came from. That
option can no longer be chosen for new leads — pick **PropertyBook** or
**Property.co.zw** instead. Existing leads keep their value (shown as "Other
portal") and are listed under **Lead Source Review**
(`/app/leads/source-review`), where you can reassign them one at a time or in
bulk. A banner on the Leads page links there while any remain.

Because these source values match the marketing spend channels, per-portal
spend and the leads it produced line up in the Lead Sources report.

### Activity Types

| Type | Icon | Use For |
|------|------|---------|
| Call | Phone | Phone calls with the client |
| WhatsApp | Message | WhatsApp conversations |
| Email | Mail | Email exchanges |
| Meeting | Calendar | In-person or virtual meetings |
| Viewing | Eye | Property viewing appointments |
| Follow-up | Phone | Chasing a client after earlier contact |
| Paperwork | Signature | Contracts, mandates, ID copies, admin |
| Note | Note | Internal notes and observations |

The type you pick drives the **Tasks by type** breakdown in Reports, so
choosing Follow-up or Paperwork instead of Note makes the report describe the
work rather than just counting it.

### Task context and outcomes

A task can be linked to a **lead**, a **property**, and a **contact**. Tasks
created from a lead inherit the lead and its contact automatically; standalone
tasks let you pick a property and contact when you create them. Completing a
task requires a short note ("left voicemail", "viewing rescheduled").

Reports → Tasks uses all of this:

- **Tasks by type** — how much of the work was calls, viewings, follow-ups or
  paperwork.
- **On-time rate** — completed on or before the due date, as a share of
  completed tasks that had a due date. Tasks with no due date are excluded
  rather than counted either way. This is separate from **Overdue**, which
  counts work still not done and already past due.
- **Completed task log** — every task completed in the period with what it
  related to and the note left on completion, exportable to CSV and PDF.

---

*SynCRM — Sync your team. Close more deals.*
