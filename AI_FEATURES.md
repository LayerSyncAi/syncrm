# Recommended AI Features for SynCRM

Based on a thorough analysis of SynCRM's architecture, existing features, and real estate CRM domain, below are AI feature recommendations organized by impact and implementation effort.

---

## 1. AI-Powered Lead Scoring (Predictive)

**Priority: High | Effort: Medium**

**What it does:** Replace the current rule-based scoring system with an ML model that learns from historical win/loss outcomes to predict which leads are most likely to convert.

**Why it matters:** The existing scoring system uses static weights (e.g., "has email = 10 points"). A predictive model can discover non-obvious patterns — for example, that leads from Facebook with a budget above a certain threshold who receive a viewing within 48 hours convert at 3x the rate.

**How it works with existing features:**
- Trains on the `leads` table using `pipelineStages.terminalOutcome` (won/lost) as the label
- Factors in data already captured: source, interest type, budget range, preferred areas, activity count/type, time-in-stage, number of property matches
- The existing `leadScoreConfig` admin page can add an "AI Score" toggle alongside the manual criteria
- Scores update via a Convex cron action that calls an inference endpoint

**Implementation approach:**
- Use Convex `actions` to call an external ML service (e.g., a lightweight model hosted on a serverless function)
- Start simple: logistic regression or gradient-boosted trees trained on lead features vs. outcome
- Fall back to the existing rule-based score when insufficient training data exists (< 100 closed leads)
- Store `aiScore` alongside the existing `score` field on leads

---

## 2. Smart Follow-Up Suggestions

**Priority: High | Effort: Low-Medium**

**What it does:** Analyzes each lead's activity history and pipeline position, then recommends the next best action with suggested timing — e.g., "Schedule a viewing within 2 days" or "Send a WhatsApp follow-up — this lead hasn't been contacted in 5 days."

**Why it matters:** Agents often manage 50+ leads. Knowing *what* to do next and *when* prevents leads from going cold. This directly impacts conversion rates.

**How it works with existing features:**
- Reads from `activities` (last contact date, types of engagement) and `leads` (current stage, time in stage)
- Surfaces suggestions on the lead detail page and the agent's task dashboard
- Can auto-create draft activities that the agent confirms with one click
- Integrates with the existing `activityReminders` system for timing

**Implementation approach:**
- Phase 1 (rule-based + LLM): Define a set of heuristics (e.g., "no contact in 3+ days in Contacted stage → suggest follow-up") and use an LLM to generate the specific message suggestion
- Phase 2 (learned): Train on activity sequences of won leads to discover optimal follow-up patterns
- Use Convex actions to call Claude API for generating contextual message suggestions

---

## 3. Lead Summarization

**Priority: High | Effort: Low**

**What it does:** Generates a concise, natural-language summary of a lead's full history — all activities, notes, stage transitions, and property interactions — in 3-5 sentences.

**Why it matters:** When an agent picks up a lead (new assignment or returning after time away), they currently have to scroll through all activities and notes. A summary gives instant context: "John is looking to buy a 3-bed apartment in Harare CBD, budget $80-120K. He's had 2 viewings (Sunrise Apartments, Parkview Flats) but found both too small. Last contact was a WhatsApp message 3 days ago discussing a new listing."

**How it works with existing features:**
- Triggered on the lead detail page (`/app/leads/[leadId]`)
- Pulls from: lead fields, all `activities` for the lead, `leadPropertyMatches`, `contacts` data
- Cached and refreshed when new activities are added
- Could also be included in the daily digest email from `activityReminders`

**Implementation approach:**
- Convex action that assembles lead context and calls Claude API with a structured prompt
- Cache the summary in a new `aiSummary` field on the lead (with `aiSummaryUpdatedAt`)
- Invalidate cache when activities are created or lead fields change
- Cost-efficient: only generates on-demand or when data changes

---

## 4. Intelligent Property Matching

**Priority: High | Effort: Medium**

**What it does:** Goes beyond the current budget/area/type filtering to match leads with properties using semantic understanding — considering lifestyle preferences from notes, viewing feedback, and implicit signals.

**Why it matters:** The existing property matching is purely mechanical (budget range + area + type). AI matching can understand that a lead who mentioned "quiet neighborhood, close to schools" in their notes would be a good match for a property described as "family-friendly suburb, 500m from primary school" — even if the areas don't overlap exactly.

**How it works with existing features:**
- Enhances the existing `leadPropertyMatches` system with AI-suggested matches
- Reads lead `notes`, `preferredAreas`, `interestType`, `budgetMin/Max` and property `description`, `location`, `price`, `type`
- Uses the existing `matchType: "suggested"` to distinguish AI matches from manual ones
- Surfaces on the lead detail page in the property suggestions component

**Implementation approach:**
- Generate embeddings for lead preferences (from notes + structured fields) and property descriptions
- Use cosine similarity to rank properties for each lead
- Store embeddings in a vector store or as part of Convex documents
- Batch-process via cron when new properties are added or lead preferences change

---

## 5. Email & Message Drafting

**Priority: Medium | Effort: Low**

**What it does:** Auto-drafts personalized follow-up emails, WhatsApp messages, and viewing confirmations based on the lead's context, stage, and recent interactions.

**Why it matters:** Agents spend significant time composing messages. AI-drafted messages (that agents review before sending) save time while maintaining personalization. A viewing confirmation can reference the specific property, date, and agent — all pulled from CRM data.

**How it works with existing features:**
- Triggered from the activity creation flow (when type is "email" or "whatsapp")
- Uses lead context (name, interests, last interaction) + activity context (type, property if applicable)
- Agent reviews and edits before sending
- Integrates with the planned email template system from the roadmap

**Implementation approach:**
- "Draft with AI" button in the activity creation modal
- Convex action that assembles context and calls Claude API
- Predefined prompt templates per activity type (follow-up, viewing invite, offer discussion, etc.)
- Agent always has final edit control

---

## 6. Duplicate Detection Enhancement (Fuzzy Matching)

**Priority: Medium | Effort: Medium**

**What it does:** Upgrades the current exact-match duplicate detection (normalized email/phone) with fuzzy matching that catches near-duplicates — typos, name variations, similar phone numbers.

**Why it matters:** Current detection misses cases like "Jon Smith" vs "John Smith", "john@gmail.com" vs "jonh@gmail.com", or phone numbers that differ by one digit. In real estate, the same person may appear with slightly different details from different sources (walk-in vs. website form).

**How it works with existing features:**
- Enhances the existing duplicate detection in `leadImport.ts` and the lead creation flow
- Adds a confidence score to duplicate matches (exact = 100%, fuzzy = 70-95%)
- Uses the existing duplicate warning UI components (`duplicate-warning.tsx`)
- Feeds into the existing merge flow with better candidate identification

**Implementation approach:**
- Name matching: Jaro-Winkler or Levenshtein distance
- Email matching: edit distance + common typo patterns
- Phone matching: digit-level edit distance
- Optional: use embeddings for semantic name matching across languages
- Can run entirely client-side or as a Convex function — no external API needed

---

## 7. Activity Sentiment & Outcome Analysis

**Priority: Medium | Effort: Low-Medium**

**What it does:** Analyzes activity notes and completion notes to detect sentiment and classify outcomes — "positive: client loved the property, wants to make an offer" vs. "negative: price too high, may look elsewhere."

**Why it matters:** Pipeline stages alone don't capture nuance. A lead in "Negotiation" might be enthusiastic or about to walk away. Sentiment analysis gives managers visibility into deal health without reading every note.

**How it works with existing features:**
- Processes `activities.description` and `activities.completionNotes`
- Adds a sentiment indicator (positive/neutral/negative) to the activity display
- Aggregates into a "deal health" signal on the lead detail page
- Can factor into the AI-powered lead scoring model

**Implementation approach:**
- LLM-based classification via Claude API (most accurate for CRM-specific language)
- Batch process on activity completion via Convex action
- Store sentiment as a field on the activity record
- Display as a colored indicator in the activity timeline

---

## 8. Conversational CRM Search

**Priority: Medium | Effort: Medium-High**

**What it does:** Natural-language search across the entire CRM: "Show me all leads interested in buying apartments in Borrowdale with a budget over $100K that haven't been contacted this week."

**Why it matters:** The existing filter system requires agents to know which fields to filter and how to combine them. Natural language lets agents ask questions the way they think, especially for complex multi-field queries.

**How it works with existing features:**
- Replaces or supplements the planned "Global search" and "Advanced filter builder" from the roadmap
- Translates natural language into Convex queries
- Returns results in the same lead/property/contact list format

**Implementation approach:**
- LLM parses the natural language query into structured filter parameters
- Map parsed filters to existing Convex query functions
- Start with lead search (most common), expand to properties and contacts
- Add a search bar to the top navigation

---

## 9. Automated Pipeline Stage Suggestions

**Priority: Low-Medium | Effort: Low**

**What it does:** Suggests moving a lead to the next pipeline stage based on activity patterns — e.g., after logging a "viewing" activity, suggest moving from "Contacted" to "Viewing Scheduled."

**Why it matters:** Agents sometimes forget to update pipeline stages, making reports and dashboards inaccurate. Gentle nudges keep the pipeline data clean.

**How it works with existing features:**
- Triggered after activity creation/completion
- Reads current `stageId` and the new activity `type`
- Presents a non-intrusive suggestion (toast or inline prompt)
- Uses the existing `leads.moveStage` mutation

**Implementation approach:**
- Simple mapping rules: activity type + current stage → suggested next stage
- Can be enhanced with ML based on historical stage transitions of won leads
- Minimal UI: a dismissible suggestion banner on the lead detail page after activity logging

---

## 10. Market Insights & Pricing Intelligence

**Priority: Low | Effort: High**

**What it does:** Analyzes the organization's property data to surface market trends — average price per area, time-on-market by property type, price trends over time — and flags properties that may be over/underpriced relative to comparable listings.

**Why it matters:** Agents advising clients on pricing need data-driven insights. Understanding that "3-bed apartments in Avondale average $95K and sell in 45 days" helps set realistic expectations.

**How it works with existing features:**
- Analyzes the `properties` table (price, type, location, status, timestamps)
- Surfaces on a new analytics dashboard section
- Can inform property descriptions and agent talking points

**Implementation approach:**
- Statistical analysis of internal property data (no external API needed to start)
- Convex query functions that compute aggregates by location/type
- LLM-generated natural language market summaries
- Phase 2: integrate external property portal data for broader market context

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks each)
| Feature | Effort | Impact |
|---------|--------|--------|
| Lead Summarization | Low | High |
| Smart Follow-Up Suggestions (rule-based) | Low-Medium | High |
| Email & Message Drafting | Low | Medium |
| Pipeline Stage Suggestions | Low | Low-Medium |

### Phase 2: Core AI (2-4 weeks each)
| Feature | Effort | Impact |
|---------|--------|--------|
| Predictive Lead Scoring | Medium | High |
| Intelligent Property Matching | Medium | High |
| Activity Sentiment Analysis | Low-Medium | Medium |
| Fuzzy Duplicate Detection | Medium | Medium |

### Phase 3: Advanced (4-8 weeks each)
| Feature | Effort | Impact |
|---------|--------|--------|
| Conversational CRM Search | Medium-High | Medium |
| Market Insights & Pricing | High | Low-Medium |

---

## Technical Prerequisites

1. **LLM API Integration**: Set up a Convex action module for Claude API calls with:
   - API key management via environment variables
   - Rate limiting and cost tracking
   - Retry logic with exponential backoff
   - Response caching to minimize API calls

2. **Schema Additions**: New fields for AI-generated data:
   - `leads.aiScore`, `leads.aiSummary`, `leads.aiSummaryUpdatedAt`
   - `activities.sentiment`
   - Optional: `aiCache` table for storing generated content

3. **Cost Management**: Most features use on-demand generation (not batch), keeping costs proportional to usage. Lead summarization and message drafting are the most cost-efficient since they only fire on user action.

4. **Privacy & Data Handling**: All AI processing uses only data already in the CRM. No customer data is used for model training. LLM calls should use ephemeral/non-training API modes.

---

## Recommended Starting Point

**Start with Lead Summarization** — it's the lowest effort, highest visibility feature. It immediately demonstrates AI value to agents, requires minimal schema changes (one new field on leads), and establishes the LLM integration pattern (Convex action → Claude API) that all subsequent features will reuse.

From there, layer in **Smart Follow-Up Suggestions** and **Email Drafting** to build a complete "AI-assisted agent workflow" before tackling the more complex predictive features.
