# GoalTrack — AtomQuest Hackathon 1.0
## Goal Setting & Tracking Portal

---

## 🚀 Quick Setup (5 Steps)

### Step 1 — Create Supabase Project
1. Go to https://supabase.com → New Project
2. Save your **Project URL** and **Anon Key** (from Settings → API)

### Step 2 — Run the Database Schema
1. In Supabase → SQL Editor → New Query
2. Paste the entire contents of `supabase_schema.sql`
3. Click **Run** — this creates all tables and seeds demo users

### Step 3 — Configure the App
Open `src/App.jsx` and replace lines 7–8:
```js
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
```

### Step 4 — Install & Run
```bash
npm install
npm run dev
```
Open http://localhost:5173

### Step 5 — Deploy to Vercel (free)
```bash
npm install -g vercel
vercel
```
Or push to GitHub → import on vercel.com → auto-deploys.

---

## 🔑 Demo Login Credentials

| Role      | Email                | What they can do |
|-----------|---------------------|-----------------|
| Employee  | employee@demo.com   | Create goals, log actuals, see check-ins |
| Manager   | manager@demo.com    | Approve goals, run check-ins, view team |
| Admin/HR  | admin@demo.com      | Cycles, audit log, reports, shared goals |

**How to login:** Enter the email → Click Sign In (no password needed in demo mode)

---

## ✅ Features Implemented

### Phase 1 — Goal Creation & Approval
- [x] Goal sheet creation with Thrust Area, Title, Description
- [x] All 4 UoM types: Numeric Min, Numeric Max, Timeline, Zero-based
- [x] Target & Weightage per goal
- [x] **Validation: Total weightage = 100%** (enforced server-side + UI)
- [x] **Validation: Min 10% per goal** (enforced server-side + UI)
- [x] **Validation: Max 8 goals** (enforced server-side + UI)
- [x] Manager L1 approval workflow with inline weightage editing
- [x] Goals locked on approval (no edits without Admin)
- [x] Return for rework (reject) workflow
- [x] Shared goals — Admin pushes KPI to multiple employees

### Phase 2 — Achievement Tracking
- [x] Quarterly actual achievement logging (Q1–Q4)
- [x] Status per goal: Not Started / On Track / Completed
- [x] Score engine: all 4 formulas implemented
  - Numeric Min: Achievement ÷ Target × 100
  - Numeric Max: Target ÷ Achievement × 100
  - Timeline: Completion date vs deadline
  - Zero: 0 → 100%, else 0%
- [x] Manager check-in module with structured comments
- [x] Planned vs Actual view per team member

### Reporting & Governance
- [x] CSV export with all goals + actuals + scores
- [x] Completion dashboard (real-time)
- [x] Audit trail — all post-lock changes logged

### Admin Features
- [x] Goal cycle management (create, activate, deactivate)
- [x] Shared goals push to multiple employees
- [x] Organization-wide overview stats
- [x] Goal unlock capability (via direct Supabase or future UI)

---

## 🏗 Architecture

```
Browser (React + Vite)
    │
    ├── Auth: Email-based demo login (Supabase users table)
    ├── State: React useState + useEffect (no Redux needed)
    └── API: Supabase JS Client → PostgreSQL
            │
            ├── users          (employees, managers, admins)
            ├── goal_cycles    (period management)
            ├── goals          (goal definitions + status)
            ├── achievements   (quarterly actuals + scores)
            ├── checkins       (manager feedback)
            └── audit_log      (change tracking)
```

**Hosting:** Vercel (frontend) + Supabase (DB + API) — both free tier, zero infrastructure cost.

---

## 💡 Score Formula Reference

| UoM Type | Formula | Example |
|----------|---------|---------|
| Numeric Min (higher=better) | (Actual ÷ Target) × 100 | Sales: actual 4.5L, target 5L → 90% |
| Numeric Max (lower=better) | (Target ÷ Actual) × 100 | TAT: target 2 days, actual 3 days → 67% |
| Timeline | Completed on/before deadline → 100%, else 0% | Submitted before due date → 100% |
| Zero-based | actual == 0 → 100%, else 0% | Safety incidents: 0 → 100% |

---

## 🔧 Environment Variables (for production)

Create `.env` file:
```
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Then in `App.jsx`:
```js
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
```
