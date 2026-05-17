import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { PublicClientApplication } from "@azure/msal-browser";
import { jwtDecode } from "jwt-decode";

// ── Supabase client ────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://qbzfxgalwnktrnjkuxjs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiemZ4Z2Fsd25rdHJuamt1eGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjgwODYsImV4cCI6MjA5NDQ0NDA4Nn0.5tmA8hy5pvYAo72udbwjGxgik0RZ8ziuHFLW0u7Zqug";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── MSAL Configuration ────────────────────────────────────────────────────────
const msalConfig = {
  auth: {
    clientId: "YOUR_AZURE_CLIENT_ID", // Replace with your actual Azure AD Client ID
    authority: "https://login.microsoftonline.com/YOUR_TENANT_ID", // Replace with your Tenant ID
    redirectUri: window.location.origin
  }
};
const msalInstance = new PublicClientApplication(msalConfig);
// Init MSAL instance asynchronously
msalInstance.initialize().catch(()=>console.log("MSAL Init Error"));

// ── Notification Service (Email & Teams) ───────────────────────────────────────
const NotificationService = {
  TEAMS_WEBHOOK_URL: "https://YOUR_TENANT.webhook.office.com/webhookb2/...", // Replace with real webhook

  async sendTeamsCard(title, text, linkUrl, linkText) {
    if (!this.TEAMS_WEBHOOK_URL || this.TEAMS_WEBHOOK_URL.includes("YOUR_TENANT")) {
      console.log("[MOCK TEAMS MSG]", { title, text, linkUrl });
      return;
    }
    const card = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      "themeColor": "6366f1",
      "summary": title,
      "sections": [{ "activityTitle": title, "activitySubtitle": text, "markdown": true }],
      "potentialAction": [{
        "@type": "OpenUri",
        "name": linkText || "Open Portal",
        "targets": [{ "os": "default", "uri": linkUrl }]
      }]
    };
    fetch(this.TEAMS_WEBHOOK_URL, { method: "POST", body: JSON.stringify(card) }).catch(console.error);
  },

  async sendEmail(toEmail, subject, body) {
    // In production, use Edge functions/SendGrid
    console.log(`[MOCK EMAIL] To: ${toEmail} | Sub: ${subject} | Body: ${body}`);
  },

  async notifySubmission(employeeName, managerEmail, employeeId) {
    const link = `${window.location.origin}/?page=approvals&emp=${employeeId}`;
    await this.sendEmail(managerEmail, "Goals Submitted for Approval", `${employeeName} submitted goals.`);
    await this.sendTeamsCard("Goal Submission", `**${employeeName}** has submitted new goals for approval.`, link, "Review Goals");
  },

  async notifyApproval(employeeEmail) {
    const link = `${window.location.origin}/?page=my-goals`;
    await this.sendEmail(employeeEmail, "Goals Approved", "Your manager approved your goals and they are locked.");
    await this.sendTeamsCard("Goals Approved", "Your goals have been officially approved and locked.", link, "View Goals");
  },

  async notifyRework(employeeEmail) {
    const link = `${window.location.origin}/?page=my-goals`;
    await this.sendEmail(employeeEmail, "Goals Returned for Rework", "Your manager requested changes to your goals.");
    await this.sendTeamsCard("Goals Need Rework", "Your manager has returned your goals for rework.", link, "Edit Goals");
  },

  async notifyCheckinReminder(employeeEmail, employeeName, quarter) {
    const link = `${window.location.origin}/?page=checkins`;
    await this.sendEmail(employeeEmail, `Reminder: ${quarter} Update Due`, `Hi ${employeeName}, please update your ${quarter} goal actuals.`);
    await this.sendTeamsCard("Check-in Reminder", `Hi **${employeeName}**, a friendly reminder to log your actual achievements for **${quarter}**.`, link, "Update Check-ins");
  },

  async notifyCheckinUpdate(employeeName, managerEmail, quarter) {
    const link = `${window.location.origin}/?page=checkins`;
    await this.sendEmail(managerEmail, `Check-in Update: ${quarter}`, `${employeeName} made progress updates.`);
    await this.sendTeamsCard("Check-in Progress Logged", `**${employeeName}** updated their ${quarter} metrics.`, link, "View Log");
  },

  async notifyEscalation(toEmail, subject, body, linkPage) {
    const link = `${window.location.origin}/?page=${linkPage || "escalations"}`;
    await this.sendEmail(toEmail, subject, body);
    await this.sendTeamsCard(subject, body, link, "View Escalation");
  }
};

// ── Escalation Module (Rule-Based) ─────────────────────────────────────────────
const ESCALATION_RULES = [
  {
    id: "PENDING_APPROVAL_MANAGER",
    name: "Submitted goals pending 3+ days (manager)",
    target: "manager",
    condition: "Goal status is submitted and unchanged for 3+ days",
    action: "Notify employee's manager",
    evaluate({ goals, users, openKeys }) {
      const now = Date.now();
      const hits = [];
      for (const g of goals.filter(x => x.status === "submitted")) {
        const days = (now - new Date(g.updated_at).getTime()) / 86400000;
        if (days < 3 || days >= 7) continue;
        const emp = users.find(u => u.id === g.employee_id);
        if (!emp?.manager_id) continue;
        const key = `${this.id}:${g.id}:manager`;
        if (openKeys.has(key)) continue;
        hits.push({
          ruleId: this.id,
          entityType: "goal",
          entityId: g.id,
          employeeId: emp.id,
          targetUserId: emp.manager_id,
          escalatedTo: "manager",
          dedupeKey: key,
          message: `${emp.name}: goals pending approval for ${Math.floor(days)} day(s)`,
          linkPage: "approvals",
        });
      }
      return hits;
    },
  },
  {
    id: "PENDING_APPROVAL_ADMIN",
    name: "Submitted goals pending 7+ days (admin)",
    target: "admin",
    condition: "Goal status is submitted and unchanged for 7+ days",
    action: "Notify HR/admin",
    evaluate({ goals, users, admins, openKeys }) {
      const now = Date.now();
      const hits = [];
      for (const g of goals.filter(x => x.status === "submitted")) {
        const days = (now - new Date(g.updated_at).getTime()) / 86400000;
        if (days < 7) continue;
        const emp = users.find(u => u.id === g.employee_id);
        if (!emp || !admins.length) continue;
        const key = `${this.id}:${g.id}:admin`;
        if (openKeys.has(key)) continue;
        hits.push({
          ruleId: this.id,
          entityType: "goal",
          entityId: g.id,
          employeeId: emp.id,
          escalatedTo: "admin",
          dedupeKey: key,
          notifyAdmins: admins,
          message: `${emp.name}: goals pending approval for ${Math.floor(days)} day(s) — admin escalation`,
          linkPage: "overview",
        });
      }
      return hits;
    },
  },
  {
    id: "MISSING_QUARTER_CHECKIN",
    name: "No check-in for active quarter",
    target: "employee",
    condition: "Locked goals exist but no achievement logged for the active cycle quarter",
    action: "Notify employee and manager",
    evaluate({ goals, users, achievements, cycle, openKeys }) {
      if (!cycle?.phase || cycle.phase === "goal_setting") return [];
      const quarter = cycle.phase;
      const hits = [];
      const byEmployee = {};
      goals.filter(g => g.status === "locked").forEach(g => {
        if (!byEmployee[g.employee_id]) byEmployee[g.employee_id] = [];
        byEmployee[g.employee_id].push(g);
      });
      for (const [empId, empGoals] of Object.entries(byEmployee)) {
        const emp = users.find(u => u.id === empId);
        if (!emp) continue;
        const goalIds = empGoals.map(g => g.id);
        const hasCheckin = achievements.some(a => goalIds.includes(a.goal_id) && a.quarter === quarter);
        if (hasCheckin) continue;

        const key = `${this.id}:${empId}:employee`;
        if (openKeys.has(key)) continue;
        hits.push({
          ruleId: this.id,
          entityType: "employee",
          entityId: empId,
          employeeId: empId,
          targetUserId: empId,
          escalatedTo: "employee",
          dedupeKey: key,
          message: `${emp.name}: no ${quarter.toUpperCase()} check-in logged for locked goals`,
          linkPage: "checkins",
        });

        if (emp.manager_id) {
          const mgrKey = `${this.id}:${empId}:manager`;
          if (!openKeys.has(mgrKey)) {
            hits.push({
              ruleId: this.id,
              entityType: "employee",
              entityId: empId,
              employeeId: empId,
              targetUserId: emp.manager_id,
              escalatedTo: "manager",
              dedupeKey: mgrKey,
              message: `${emp.name}: missing ${quarter.toUpperCase()} check-in on locked goals`,
              linkPage: "team",
            });
          }
        }
      }
      return hits;
    },
  },
];

async function runEscalationCheck() {
  const [
    { data: goals },
    { data: users },
    { data: achievements },
    { data: cycle },
    { data: openEsc },
  ] = await Promise.all([
    supabase.from("goals").select("id, employee_id, status, updated_at, title"),
    supabase.from("users").select("id, name, email, role, manager_id"),
    supabase.from("achievements").select("goal_id, quarter"),
    supabase.from("goal_cycles").select("*").eq("is_active", true).maybeSingle(),
    supabase.from("escalations").select("rule_id, entity_id, employee_id, escalated_to").eq("status", "open"),
  ]);

  const admins = (users || []).filter(u => u.role === "admin");

  const openKeys = new Set(
    (openEsc || []).map(e => `${e.rule_id}:${e.entity_id}:${e.escalated_to}`)
  );

  const ctx = {
    goals: goals || [],
    users: users || [],
    achievements: achievements || [],
    cycle: cycle || null,
    admins,
    openKeys,
  };

  const hits = ESCALATION_RULES.flatMap(rule => rule.evaluate(ctx));
  const userById = Object.fromEntries((users || []).map(u => [u.id, u]));
  let created = 0;

  for (const hit of hits) {
    const { error } = await supabase.from("escalations").insert({
      rule_id: hit.ruleId,
      entity_type: hit.entityType,
      entity_id: hit.entityId,
      employee_id: hit.employeeId,
      escalated_to: hit.escalatedTo,
      message: hit.message,
      status: "open",
    });
    if (error) continue;

    openKeys.add(hit.dedupeKey);

    const recipients = hit.notifyAdmins || [userById[hit.targetUserId]].filter(Boolean);
    for (const recipient of recipients) {
      if (!recipient?.email) continue;
      await NotificationService.notifyEscalation(
        recipient.email,
        `Escalation: ${hit.message}`,
        hit.message,
        hit.linkPage
      );
    }
    created++;
  }

  return created;
}

// ── Analytics Module ───────────────────────────────────────────────────────────
function computeAnalytics({ goals, achievements, users, checkins, escalations, cycle }, quarterFilter = "all") {
  const employees = (users || []).filter(u => u.role === "employee");
  const goalById = Object.fromEntries((goals || []).map(g => [g.id, g]));
  const activeQuarter = cycle?.phase && cycle.phase !== "goal_setting" ? cycle.phase : null;
  const quarter = quarterFilter === "all" ? null : quarterFilter;

  const statusCounts = { draft: 0, submitted: 0, approved: 0, rejected: 0, locked: 0 };
  (goals || []).forEach(g => { if (statusCounts[g.status] !== undefined) statusCounts[g.status]++; });

  function employeeWeightedScore(empId, q) {
    const empGoals = (goals || []).filter(g => g.employee_id === empId && g.status === "locked");
    let wSum = 0;
    let wTotal = 0;
    empGoals.forEach(g => {
      const ach = (achievements || []).find(a => a.goal_id === g.id && a.quarter === q && a.score != null);
      if (ach) {
        const w = parseFloat(g.weightage) || 0;
        wSum += parseFloat(ach.score) * w;
        wTotal += w;
      }
    });
    return wTotal > 0 ? wSum / wTotal : null;
  }

  const quarterAvgs = {};
  ["q1", "q2", "q3", "q4"].forEach(q => {
    const scores = (achievements || [])
      .filter(a => a.quarter === q && a.score != null && goalById[a.goal_id])
      .map(a => parseFloat(a.score));
    quarterAvgs[q] = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : null;
  });

  const progressCounts = { not_started: 0, on_track: 0, completed: 0 };
  const progressAch = quarter
    ? (achievements || []).filter(a => a.quarter === quarter)
    : achievements || [];
  progressAch.forEach(a => {
    if (progressCounts[a.progress_status] !== undefined) progressCounts[a.progress_status]++;
  });

  const leaderboard = employees
    .map(emp => {
      const q = quarter || activeQuarter;
      const score = q ? employeeWeightedScore(emp.id, q) : null;
      const anyScores = ["q1", "q2", "q3", "q4"]
        .map(qu => ({ qu, score: employeeWeightedScore(emp.id, qu) }))
        .filter(x => x.score != null);
      const fallback = anyScores.length ? anyScores[anyScores.length - 1] : null;
      return {
        id: emp.id,
        name: emp.name,
        department: emp.department || "—",
        score: score ?? fallback?.score ?? null,
        usedQuarter: q || fallback?.qu,
        lockedCount: (goals || []).filter(g => g.employee_id === emp.id && g.status === "locked").length,
      };
    })
    .filter(e => e.score != null)
    .sort((a, b) => b.score - a.score);

  const deptMap = {};
  employees.forEach(emp => {
    const dept = emp.department || "Unassigned";
    if (!deptMap[dept]) deptMap[dept] = { employees: 0, goals: 0, locked: 0, scores: [] };
    deptMap[dept].employees++;
    const empGoals = (goals || []).filter(g => g.employee_id === emp.id);
    deptMap[dept].goals += empGoals.length;
    deptMap[dept].locked += empGoals.filter(g => g.status === "locked").length;
    const q = quarter || activeQuarter;
    if (q) {
      const sc = employeeWeightedScore(emp.id, q);
      if (sc != null) deptMap[dept].scores.push(sc);
    }
  });
  const departments = Object.entries(deptMap)
    .map(([name, d]) => ({
      name,
      employees: d.employees,
      goals: d.goals,
      lockRate: d.goals > 0 ? Math.round((d.locked / d.goals) * 100) : 0,
      avgScore: d.scores.length ? d.scores.reduce((s, n) => s + n, 0) / d.scores.length : null,
    }))
    .sort((a, b) => b.goals - a.goals);

  const thrustMap = {};
  (goals || []).forEach(g => {
    if (!thrustMap[g.thrust_area]) thrustMap[g.thrust_area] = { count: 0, scores: [] };
    thrustMap[g.thrust_area].count++;
  });
  (achievements || []).forEach(a => {
    const g = goalById[a.goal_id];
    if (g && a.score != null) {
      if (!thrustMap[g.thrust_area]) thrustMap[g.thrust_area] = { count: 0, scores: [] };
      if (!quarter || a.quarter === quarter) thrustMap[g.thrust_area].scores.push(parseFloat(a.score));
    }
  });
  const thrustAreas = Object.entries(thrustMap)
    .map(([name, d]) => ({
      name,
      count: d.count,
      avgScore: d.scores.length ? d.scores.reduce((s, n) => s + n, 0) / d.scores.length : null,
    }))
    .sort((a, b) => b.count - a.count);

  const employeesWithLocked = employees.filter(e =>
    (goals || []).some(g => g.employee_id === e.id && g.status === "locked")
  ).length;

  const checkinEmps = { q1: new Set(), q2: new Set(), q3: new Set(), q4: new Set() };
  (checkins || []).forEach(c => checkinEmps[c.quarter]?.add(c.employee_id));
  const checkinRates = Object.fromEntries(
    ["q1", "q2", "q3", "q4"].map(q => [
      q,
      employees.length ? Math.round((checkinEmps[q].size / employees.length) * 100) : 0,
    ])
  );

  const scoredAch = (achievements || []).filter(a => {
    if (a.score == null || !goalById[a.goal_id]) return false;
    return !quarter || a.quarter === quarter;
  });
  const overallAvgScore = scoredAch.length
    ? scoredAch.reduce((s, a) => s + parseFloat(a.score), 0) / scoredAch.length
    : null;

  const openEscalations = (escalations || []).filter(e => e.status === "open").length;
  const selectedQuarterAvg = quarter ? quarterAvgs[quarter] : null;

  return {
    cycle,
    activeQuarter,
    quarter,
    statusCounts,
    quarterAvgs,
    progressCounts,
    departments,
    thrustAreas,
    leaderboard,
    checkinRates,
    kpis: {
      totalGoals: (goals || []).length,
      totalEmployees: employees.length,
      overallAvgScore,
      selectedQuarterAvg,
      goalLockRate: employees.length ? Math.round((employeesWithLocked / employees.length) * 100) : 0,
      pendingApprovals: statusCounts.submitted,
      openEscalations,
    },
  };
}

function AnalyticsBar({ label, value, max, color = "#6366f1", suffix = "" }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: "#94a3b8" }}>{label}</span>
        <span style={{ color: "#f1f5f9", fontWeight: 600 }}>{value}{suffix}</span>
      </div>
      <div style={{ background: "#1e293b", borderRadius: 4, height: 8 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

// ── Auth Context ───────────────────────────────────────────────────────────────
const AuthContext = createContext(null);


// ── Score calculator ───────────────────────────────────────────────────────────
function calcScore(goal, actual) {
  if (actual === null || actual === undefined || actual === "") return null;
  const t = parseFloat(goal.target_value);
  const a = parseFloat(actual);
  switch (goal.uom_type) {
    case "numeric_min": return t > 0 ? Math.min((a / t) * 100, 150).toFixed(1) : 0;
    case "numeric_max": return a > 0 ? Math.min((t / a) * 100, 150).toFixed(1) : 0;
    case "zero":        return a === 0 ? 100 : 0;
    default:            return null;
  }
}

function calcTimelineScore(targetDate, actualDate) {
  if (!targetDate || !actualDate) return null;
  const t = new Date(targetDate), d = new Date(actualDate);
  return d <= t ? 100 : 0;
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function Toast({ toasts, remove }) {
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => remove(t.id)} style={{
          background: t.type === "error" ? "#ff4444" : t.type === "warning" ? "#f59e0b" : "#10b981",
          color: "#fff", padding: "12px 18px", borderRadius: 10, cursor: "pointer",
          fontSize: 14, fontWeight: 500, boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          animation: "slideIn 0.3s ease", maxWidth: 320
        }}>{t.message}</div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = (message, type = "success") => {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  };
  const remove = (id) => setToasts(p => p.filter(t => t.id !== id));
  return { toasts, remove, success: m => add(m, "success"), error: m => add(m, "error"), warn: m => add(m, "warning") };
}

// ── Badge ──────────────────────────────────────────────────────────────────────
function Badge({ status }) {
  const map = {
    draft: ["#94a3b8", "#1e293b"], submitted: ["#3b82f6", "#fff"],
    approved: ["#10b981", "#fff"], rejected: ["#ef4444", "#fff"],
    locked: ["#6366f1", "#fff"], not_started: ["#94a3b8", "#fff"],
    on_track: ["#f59e0b", "#fff"], completed: ["#10b981", "#fff"]
  };
  const [bg, fg] = map[status] || ["#94a3b8", "#fff"];
  return (
    <span style={{ background: bg, color: fg, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}

// ── Score Bar ──────────────────────────────────────────────────────────────────
function ScoreBar({ score }) {
  if (score === null || score === undefined) return <span style={{ color: "#64748b", fontSize: 13 }}>—</span>;
  const pct = Math.min(parseFloat(score), 100);
  const color = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, background: "#1e293b", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{score}%</span>
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, width: "100%", maxWidth: 600, maxHeight: "90vh", overflow: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Input / Select helpers ─────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", background: "#1e293b", border: "1px solid #334155",
  borderRadius: 8, padding: "10px 14px", color: "#f1f5f9", fontSize: 14,
  outline: "none", boxSizing: "border-box"
};
const labelStyle = { fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: 0.5 };

function Field({ label, children }) {
  return <div style={{ marginBottom: 16 }}><label style={labelStyle}>{label}</label>{children}</div>;
}

// ── Schedule Enforcement ───────────────────────────────────────────────────────
function isGoalSettingOpen() {
  return true; // For testing bypass: new Date().getMonth() === 4; // May
}
function isQuarterOpen(q) {
  return true; // For testing bypass:
  /*
  const m = new Date().getMonth();
  if (q === "q1") return m === 6; // July
  if (q === "q2") return m === 9; // October
  if (q === "q3") return m === 0; // January
  if (q === "q4") return m === 2 || m === 3; // March or April
  return false;
  */
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const DEMO_ACCOUNTS = [
    { email: "employee@demo.com", label: "Employee", icon: "👤", color: "#10b981" },
    { email: "manager@demo.com",  label: "Manager",  icon: "👔", color: "#6366f1" },
    { email: "admin@demo.com",    label: "Admin/HR", icon: "🛡", color: "#f59e0b" },
  ];

  async function handleSSOLogin() {
    setLoading(true); setError("");
    try {
      const loginResponse = await msalInstance.loginPopup({ scopes: ["User.Read", "User.ReadBasic.All"] });
      const idToken = loginResponse.idToken;
      const accessToken = loginResponse.accessToken;
      const decoded = jwtDecode(idToken);
      
      const userEmail = loginResponse.account.username;
      
      // Determine Role based on Azure AD Groups (Roles returned in decoded token if configured on Azure side)
      let role = "employee"; // Default fallback
      if (decoded.roles) {
        if (decoded.roles.includes("AdminGroup")) role = "admin";
        else if (decoded.roles.includes("ManagerGroup")) role = "manager";
      }

      // Fetch Organizational Hierarchy (The user's Manager) from Microsoft Graph
      let managerId = null;
      try {
        const graphRes = await fetch("https://graph.microsoft.com/v1.0/me/manager", {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (graphRes.ok) {
          const managerData = await graphRes.json();
          const managerEmail = managerData.mail || managerData.userPrincipalName;
          
          // Look up the manager in your Supabase DB to get their internal ID
          const { data: managerRecord } = await supabase
            .from("users")
            .select("id")
            .eq("email", managerEmail.trim())
            .single();
            
          if (managerRecord) {
            managerId = managerRecord.id;
          }
        }
      } catch (err) {
        console.warn("No manager found in Active Directory for this user.");
      }

      // Sync User Data to Supabase User Table to keep Hierarchy and DB relationships robust
      let { data, error: dbError } = await supabase.from("users").select("*").eq("email", userEmail.trim()).single();
      
      if (!data) {
        // Automatically provision via AD Sync if they don't exist
        const name = loginResponse.account.name || userEmail.split("@")[0];
        const res = await supabase.from("users").insert({
          email: userEmail,
          name: name,
          role: role,
          manager_id: managerId,
          id: loginResponse.account.localAccountId // use Azure ID as UUID mapping
        }).select().single();
        if (res.error) throw res.error;
        data = res.data;
      } else {
        // Update existing user's manager and role in case it changed in Azure AD
        await supabase.from("users").update({ manager_id: managerId, role: role }).eq("id", data.id);
        // Refresh local data copy with latest updates
        data.manager_id = managerId;
        data.role = role;
      }

      onLogin(data);
    } catch (err) {
      console.error(err);
      setError("SSO Login failed. Verify Configuration.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true); setError("");
    const { data, error } = await supabase.from("users").select("*").eq("email", email.trim()).single();
    setLoading(false);
    if (error || !data) { setError("User not found. Use a demo account below."); return; }
    onLogin(data);
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #020617 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', 'Courier New', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; }
        @keyframes slideIn { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes glow { 0%,100%{box-shadow: 0 0 15px rgba(99, 102, 241, 0.4);} 50%{box-shadow: 0 0 30px rgba(99, 102, 241, 0.7);} }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0f172a; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
      `}</style>
      <div style={{ width: "100%", maxWidth: 440, padding: 20 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 12, letterSpacing: 5, color: "#38bdf8", fontWeight: 600, textTransform: "uppercase", marginBottom: 10 }}>ATOMQUEST HACKATHON 1.0</div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 42, fontWeight: 800, color: "#f8fafc", margin: 0, lineHeight: 1.1, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
            Goal<span style={{ color: "#818cf8" }}>Track</span>
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14, marginTop: 10, fontWeight: 500 }}>Performance Management Portal</p>
        </div>
        {/* Card */}
        <div style={{ background: "rgba(30, 41, 59, 0.7)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 24, padding: 32, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}>
          <form onSubmit={handleLogin}>
            <Field label="Email Address">
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="enter your email" style={inputStyle} required />
            </Field>
            {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "14px", background: "linear-gradient(to right, #4f46e5, #6366f1)", border: "none",
              borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", transition: "all 0.3s ease", boxShadow: "0 4px 15px rgba(99, 102, 241, 0.4)"
            }} onMouseOver={e => !loading && (e.currentTarget.style.transform = "translateY(-2px)")} onMouseOut={e => !loading && (e.currentTarget.style.transform = "translateY(0)")}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          {/* SSO Microsoft Button */}
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <button onClick={handleSSOLogin} disabled={loading} style={{
              width: "100%", padding: "14px", background: "#000", border: "1px solid #333",
              borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "background 0.2s"
            }} onMouseOver={e => e.currentTarget.style.background="#111"} onMouseOut={e => e.currentTarget.style.background="#000"}>
              <svg width="20" height="20" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
              Sign in with Azure AD (SSO)
            </button>
          </div>

          {/* Demo accounts */}
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <p style={{ fontSize: 12, color: "#64748b", textAlign: "center", marginBottom: 16, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>Demo Accounts</p>
            <div style={{ display: "flex", gap: 10 }}>
              {DEMO_ACCOUNTS.map(a => (
                <button key={a.email} onClick={() => { setEmail(a.email); }} style={{
                  flex: 1, background: "rgba(15, 23, 42, 0.6)", border: `1px solid rgba(255,255,255,0.05)`,
                  borderRadius: 12, padding: "12px 8px", cursor: "pointer", color: "#f8fafc",
                  fontFamily: "inherit", transition: "all 0.2s ease"
                }} onMouseOver={e => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.background = "rgba(15, 23, 42, 0.9)"; e.currentTarget.style.transform = "translateY(-2px)"; }} 
                   onMouseOut={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"; e.currentTarget.style.background = "rgba(15, 23, 42, 0.6)"; e.currentTarget.style.transform = "translateY(0)"; }}>
                  <div style={{ fontSize: 22, textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}>{a.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6, color: a.color }}>{a.label}</div>
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#475569", textAlign: "center", marginTop: 10 }}>Click a role, then Sign In</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR + LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════
function Layout({ user, onLogout, page, setPage, children }) {
  const navItems = {
    employee: [
      { id: "my-goals",   label: "My Goals",      icon: "🎯" },
      { id: "checkins",   label: "Check-ins",      icon: "📋" },
    ],
    manager: [
      { id: "team",       label: "Team Dashboard", icon: "👥" },
      { id: "approvals",  label: "Approvals",      icon: "✅" },
      { id: "checkins",   label: "Check-ins",      icon: "📋" },
    ],
    admin: [
      { id: "overview",   label: "Overview",       icon: "📊" },
      { id: "analytics",  label: "Analytics",      icon: "📉" },
      { id: "escalations", label: "Escalations",   icon: "🚨" },
      { id: "cycles",     label: "Cycles",         icon: "📅" },
      { id: "audit",      label: "Audit Log",      icon: "🔍" },
      { id: "reports",    label: "Reports",        icon: "📈" },
      { id: "shared",     label: "Shared Goals",   icon: "🔗" },
    ],
  }[user.role] || [];

  const roleColor = { employee: "#10b981", manager: "#6366f1", admin: "#f59e0b" }[user.role];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#060e1e", color: "#f1f5f9", fontFamily: "'DM Mono', 'Courier New', monospace" }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: "#0a1628", borderRight: "1px solid #1e293b", padding: "24px 0", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "0 20px 24px", borderBottom: "1px solid #1e293b" }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: "#f1f5f9" }}>
            Goal<span style={{ color: "#6366f1" }}>Track</span>
          </div>
          <div style={{ fontSize: 10, color: "#475569", marginTop: 2, letterSpacing: 1 }}>ATOMQUEST 1.0</div>
        </div>
        <nav style={{ flex: 1, padding: "16px 12px" }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer",
              background: page === item.id ? "#1e293b" : "transparent",
              color: page === item.id ? "#f1f5f9" : "#64748b",
              fontSize: 13, fontFamily: "inherit", fontWeight: page === item.id ? 600 : 400,
              textAlign: "left", transition: "all 0.2s", marginBottom: 4,
              borderLeft: page === item.id ? `3px solid ${roleColor}` : "3px solid transparent"
            }}>{item.icon} {item.label}</button>
          ))}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: "1px solid #1e293b" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{user.name}</div>
          <div style={{ fontSize: 11, color: roleColor, textTransform: "uppercase", letterSpacing: 0.5 }}>{user.role}</div>
          <button onClick={onLogout} style={{ marginTop: 10, fontSize: 12, color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>→ Sign out</button>
        </div>
      </div>
      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: 32 }}>
        {children}
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, fontFamily: "'Syne', sans-serif", color: "#f1f5f9" }}>{title}</h2>
        {subtitle && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Btn({ onClick, children, variant = "primary", disabled, style: s }) {
  const styles = {
    primary: { background: "linear-gradient(to right, #4f46e5, #6366f1)", color: "#fff", boxShadow: "0 4px 15px rgba(99, 102, 241, 0.3)" },
    success: { background: "linear-gradient(to right, #059669, #10b981)", color: "#fff", boxShadow: "0 4px 15px rgba(16, 185, 129, 0.3)" },
    danger:  { background: "linear-gradient(to right, #dc2626, #ef4444)", color: "#fff", boxShadow: "0 4px 15px rgba(239, 68, 68, 0.3)" },
    ghost:   { background: "rgba(30, 41, 59, 0.6)", color: "#cbd5e1", border: "1px solid rgba(255,255,255,0.05)" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles[variant], padding: "10px 20px", border: "none", borderRadius: 10,
      fontSize: 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "inherit", opacity: disabled ? 0.6 : 1, transition: "all 0.2s ease",
      ...s
    }} onMouseOver={e => !disabled && (e.currentTarget.style.transform = "translateY(-1px)")}
       onMouseOut={e => !disabled && (e.currentTarget.style.transform = "translateY(0)")}
       onMouseDown={e => !disabled && (e.currentTarget.style.transform = "translateY(1px)")}>
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE — MY GOALS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
const THRUST_AREAS = ["Revenue Growth","Cost Reduction","Customer Satisfaction","Product Quality","Safety","People Development","Process Excellence","Innovation","Compliance","Sustainability"];
const UOM_TYPES = [
  { value: "numeric_min", label: "Numeric Min (higher is better, e.g. Sales)" },
  { value: "numeric_max", label: "Numeric Max (lower is better, e.g. TAT, Cost)" },
  { value: "timeline",    label: "Timeline (date-based completion)" },
  { value: "zero",        label: "Zero-based (0 = success, e.g. Safety incidents)" },
];

function MyGoalsPage({ user, toast }) {
  const [goals, setGoals] = useState([]);
  const [cycle, setCycle] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const [{ data: g }, { data: c }] = await Promise.all([
      supabase.from("goals").select("*").eq("employee_id", user.id).order("created_at"),
      supabase.from("goal_cycles").select("*").eq("is_active", true).single()
    ]);
    setGoals(g || []);
    setCycle(c);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { fetch(); }, [fetch]);

  const totalWeightage = goals.filter(g => g.status !== "rejected").reduce((s, g) => s + parseFloat(g.weightage || 0), 0);
  const activeGoals = goals.filter(g => g.status !== "rejected");
  const allApproved = activeGoals.length > 0 && activeGoals.every(g => ["approved","locked"].includes(g.status));
  
  const goalSettingOpen = isGoalSettingOpen();
  const canSubmit = goalSettingOpen && activeGoals.some(g => g.status === "draft") && Math.abs(totalWeightage - 100) < 0.01;
  const isLocked = activeGoals.length > 0 && activeGoals.every(g => g.status === "locked");

  async function submitGoals() {
    if (!isGoalSettingOpen()) { toast.error("Goal Setting window is closed."); return; }
    if (totalWeightage !== 100) { toast.error(`Total weightage must be exactly 100%. Currently ${totalWeightage}%`); return; }
    const res = confirm("Submit goals for approval? They will be locked from further edits.");
    if (!res) return;
    
    const draftIds = activeGoals.map(g => g.id);
    await supabase.from("goals").update({ status: "submitted" }).in("id", draftIds);
    await supabase.from("audit_log").insert(draftIds.map(id => ({ goal_id: id, changed_by: user.id, action: "submitted" })));
    toast.success("Goals submitted for approval");
    fetch();

    // Notification Trigger
    const { data: userData } = await supabase.from("users").select("manager:manager_id(id,email)").eq("id", user.id).single();
    if (userData?.manager?.email) {
      NotificationService.notifySubmission(user.name, userData.manager.email, user.id);
    }
  }

  async function deleteGoal(id) {
    await supabase.from("goals").delete().eq("id", id);
    toast.success("Goal deleted");
    fetch();
  }

  if (loading) return <div style={{ color: "#64748b" }}>Loading…</div>;

  return (
    <div>
      <PageHeader
        title="My Goals"
        subtitle={cycle ? `Cycle: ${cycle.name} • ${cycle.phase.replace(/_/g, " ").toUpperCase()}` : "No active cycle"}
        action={
          goalSettingOpen && !isLocked && activeGoals.length < 8 && !activeGoals.some(g => g.status === "submitted") && (
            <Btn onClick={() => { setEditGoal(null); setShowForm(true); }}>+ Add Goal</Btn>
          )
        }
      />
      {!goalSettingOpen && (
        <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          Goal Setting window is closed. Goals can only be created or submitted during May.
        </div>
      )}

      {/* Weightage meter */}
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>Total Weightage</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: Math.abs(totalWeightage - 100) < 0.01 ? "#10b981" : totalWeightage > 100 ? "#ef4444" : "#f59e0b" }}>
            {totalWeightage.toFixed(0)}% / 100%
          </span>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 6, height: 8 }}>
          <div style={{ width: `${Math.min(totalWeightage, 100)}%`, height: "100%", borderRadius: 6, transition: "width 0.4s",
            background: Math.abs(totalWeightage - 100) < 0.01 ? "#10b981" : totalWeightage > 100 ? "#ef4444" : "#6366f1" }} />
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: "#64748b" }}>
          <span>Goals: {activeGoals.length}/8</span>
          <span>Min per goal: 10%</span>
          {Math.abs(totalWeightage - 100) > 0.01 && <span style={{ color: "#f59e0b" }}>⚠ Must total 100% to submit</span>}
        </div>
      </div>

      {/* Goals list */}
      {goals.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 17, color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>No goals yet</div>
          <div style={{ fontSize: 14, marginBottom: 24 }}>Click the <b style={{ color: "#6366f1" }}>+ Add Goal</b> button above to create your first goal.</div>
          <Btn onClick={() => { setEditGoal(null); setShowForm(true); }}>+ Add Your First Goal</Btn>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {goals.map(goal => (
            <GoalCard key={goal.id} goal={goal} isLocked={isLocked}
              onEdit={() => { setEditGoal(goal); setShowForm(true); }}
              onDelete={() => deleteGoal(goal.id)}
            />
          ))}
        </div>
      )}

      {/* Submit bar */}
      {!isLocked && activeGoals.some(g => g.status === "draft") && (
        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <Btn onClick={submitGoals} variant="success" disabled={!canSubmit}>
            Submit All Goals for Approval →
          </Btn>
        </div>
      )}

      {showForm && (
        <GoalFormModal
          user={user} cycle={cycle} editGoal={editGoal}
          existingGoals={goals} toast={toast}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetch(); }}
        />
      )}
    </div>
  );
}

function GoalCard({ goal, isLocked, onEdit, onDelete }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20, display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: { draft:"#475569", submitted:"#3b82f6", approved:"#10b981", locked:"#6366f1", rejected:"#ef4444" }[goal.status] || "#475569", flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ fontSize: 11, background: "#1e293b", padding: "2px 8px", borderRadius: 6, color: "#94a3b8" }}>{goal.thrust_area}</span>
          <Badge status={goal.status} />
          {goal.is_shared && <span style={{ fontSize: 11, background: "#312e81", color: "#c7d2fe", padding: "2px 8px", borderRadius: 6 }}>🔗 Shared</span>}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>{goal.title}</div>
        {goal.description && <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>{goal.description}</div>}
        <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
          <span>📐 {UOM_TYPES.find(u => u.value === goal.uom_type)?.label.split(" ")[0]} {UOM_TYPES.find(u => u.value === goal.uom_type)?.label.split("(")[0].trim()}</span>
          {goal.target_value !== null && <span>🎯 Target: <b style={{ color: "#94a3b8" }}>{goal.target_value}</b></span>}
          {goal.target_date && <span>📅 Due: <b style={{ color: "#94a3b8" }}>{goal.target_date}</b></span>}
          <span>⚖ Weightage: <b style={{ color: "#f1f5f9" }}>{goal.weightage}%</b></span>
        </div>
      </div>
      {!isLocked && goal.status === "draft" && (
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Btn onClick={onEdit} variant="ghost" style={{ padding: "6px 12px" }}>Edit</Btn>
          {!goal.is_shared && <Btn onClick={onDelete} variant="danger" style={{ padding: "6px 12px" }}>Del</Btn>}
        </div>
      )}
    </div>
  );
}

function GoalFormModal({ user, cycle, editGoal, existingGoals, toast, onClose, onSaved }) {
  const [form, setForm] = useState({
    thrust_area: editGoal?.thrust_area || "",
    title: editGoal?.title || "",
    description: editGoal?.description || "",
    uom_type: editGoal?.uom_type || "numeric_min",
    target_value: editGoal?.target_value || "",
    target_date: editGoal?.target_date || "",
    weightage: editGoal?.weightage || "",
  });
  const [saving, setSaving] = useState(false);

  const otherGoals = existingGoals.filter(g => g.id !== editGoal?.id && g.status !== "rejected");
  const otherTotal = otherGoals.reduce((s, g) => s + parseFloat(g.weightage || 0), 0);
  const maxW = 100 - otherTotal;

  async function save() {
    const w = parseFloat(form.weightage);
    if (!form.thrust_area || !form.title || !form.uom_type || !form.weightage) { toast.error("Fill all required fields"); return; }
    if (w < 10) { toast.error("Minimum weightage is 10%"); return; }
    if (w > maxW + 0.01) { toast.error(`Max allowed weightage is ${maxW.toFixed(0)}%`); return; }
    if (!editGoal && otherGoals.length >= 8) { toast.error("Maximum 8 goals allowed"); return; }

    setSaving(true);
    const payload = { ...form, employee_id: user.id, cycle_id: cycle?.id, weightage: w, target_value: form.target_value || null, target_date: form.target_date || null };

    if (editGoal) {
      await supabase.from("goals").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editGoal.id);
      await supabase.from("audit_log").insert({ goal_id: editGoal.id, changed_by: user.id, action: "edited", field_changed: "multiple" });
      toast.success("Goal updated");
    } else {
      const { data } = await supabase.from("goals").insert({ ...payload, status: "draft" }).select().single();
      await supabase.from("audit_log").insert({ goal_id: data.id, changed_by: user.id, action: "created" });
      toast.success("Goal added!");
    }
    setSaving(false);
    onSaved();
  }

  const isTimeline = form.uom_type === "timeline";
  const isZero = form.uom_type === "zero";
  const isShared = editGoal?.is_shared === true;

  return (
    <Modal title={editGoal ? (isShared ? "Edit Shared Goal Weightage" : "Edit Goal") : "Add New Goal"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <div style={{ gridColumn: "1/-1" }}>
          <Field label="Thrust Area *">
            <select disabled={isShared} value={form.thrust_area} onChange={e => setForm(p => ({ ...p, thrust_area: e.target.value }))} style={inputStyle}>
              <option value="">Select thrust area…</option>
              {THRUST_AREAS.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <Field label="Goal Title *">
            <input disabled={isShared} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} placeholder="e.g. Increase Q2 Sales Revenue" />
          </Field>
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <Field label="Description">
            <textarea disabled={isShared} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...inputStyle, height: 70, resize: "vertical" }} placeholder="Optional details…" />
          </Field>
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <Field label="Unit of Measurement (UoM) *">
            <select disabled={isShared} value={form.uom_type} onChange={e => setForm(p => ({ ...p, uom_type: e.target.value, target_value: "", target_date: "" }))} style={inputStyle}>
              {UOM_TYPES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </Field>
        </div>
        {!isZero && !isTimeline && (
          <Field label="Target Value *">
            <input disabled={isShared} type="number" value={form.target_value} onChange={e => setForm(p => ({ ...p, target_value: e.target.value }))} style={inputStyle} placeholder="e.g. 5000000" />
          </Field>
        )}
        {isTimeline && (
          <Field label="Target Date *">
            <input disabled={isShared} type="date" value={form.target_date} onChange={e => setForm(p => ({ ...p, target_date: e.target.value }))} style={inputStyle} />
          </Field>
        )}
        <Field label={`Weightage % * (max ${maxW.toFixed(0)}%)`}>
          <input type="number" min="10" max={maxW} value={form.weightage} onChange={e => setForm(p => ({ ...p, weightage: e.target.value }))} style={inputStyle} placeholder="10–100" />
        </Field>
      </div>
      {isZero && <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }}>Zero-based: achievement of 0 = 100% score. No target value needed.</p>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn onClick={onClose} variant="ghost">Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? "Saving…" : editGoal ? "Update Goal" : "Add Goal"}</Btn>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE — CHECK-INS PAGE (log actuals)
// ═══════════════════════════════════════════════════════════════════════════════
function EmployeeCheckinsPage({ user, toast }) {
  const [goals, setGoals] = useState([]);
  const [achievements, setAchievements] = useState({});
  const [quarter, setQuarter] = useState("q1");
  const [saving, setSaving] = useState({});
  const [myCheckins, setMyCheckins] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: g } = await supabase.from("goals").select("*").eq("employee_id", user.id).eq("status", "locked");
      const { data: a } = await supabase.from("achievements").select("*").in("goal_id", (g || []).map(x => x.id));
      const { data: c } = await supabase.from("checkins").select("*, manager:manager_id(name)").eq("employee_id", user.id).order("created_at", { ascending: false });
      setGoals(g || []);
      const map = {};
      (a || []).forEach(ach => { if (!map[ach.goal_id]) map[ach.goal_id] = {}; map[ach.goal_id][ach.quarter] = ach; });
      setAchievements(map);
      setMyCheckins(c || []);
    })();
  }, [user.id]);

  async function saveAchievement(goal, field, value) {
    if (!isQuarterOpen(quarter)) { toast.error(`Quarter ${quarter.toUpperCase()} update window is closed`); return; }
    setSaving(p => ({ ...p, [goal.id]: true }));
    const existing = achievements[goal.id]?.[quarter];
    let score = null;
    if (goal.uom_type === "timeline") {
      score = calcTimelineScore(goal.target_date, field === "actual_date" ? value : existing?.actual_date);
    } else {
      const av = field === "actual_value" ? value : existing?.actual_value;
      score = calcScore(goal, av);
    }
    const payload = { goal_id: goal.id, quarter, [field]: value, score, updated_at: new Date().toISOString() };
    if (existing) {
      await supabase.from("achievements").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("achievements").insert({ ...payload, progress_status: "not_started" });
    }
    setAchievements(p => ({
      ...p, [goal.id]: { ...p[goal.id], [quarter]: { ...(p[goal.id]?.[quarter] || {}), [field]: value, score } }
    }));
    setSaving(p => ({ ...p, [goal.id]: false }));
  }

  async function saveStatus(goal, status) {
    if (!isQuarterOpen(quarter)) { toast.error(`Quarter ${quarter.toUpperCase()} update window is closed`); return; }
    const existing = achievements[goal.id]?.[quarter];
    if (existing) {
      await supabase.from("achievements").update({ progress_status: status }).eq("id", existing.id);
    } else {
      await supabase.from("achievements").insert({ goal_id: goal.id, quarter, progress_status: status, score: null });
    }
    setAchievements(p => ({ ...p, [goal.id]: { ...p[goal.id], [quarter]: { ...(p[goal.id]?.[quarter] || {}), progress_status: status } } }));
    toast.success("Status updated");

    // Notification Trigger (only notify if manager is present in checkins data)
    if (myCheckins[0]?.manager?.email || user) {
      const { data: userData } = await supabase.from("users").select("manager:manager_id(email)").eq("id", user.id).single();
      if (userData?.manager?.email) {
        NotificationService.notifyCheckinUpdate(user.name, userData.manager.email, quarter.toUpperCase());
      }
    }
  }

  return (
    <div>
      <PageHeader title="Quarterly Check-ins" subtitle="Log your actual achievements against planned targets" />
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["q1","q2","q3","q4"].map(q => {
          const isOpen = isQuarterOpen(q);
          return (
            <button key={q} onClick={() => setQuarter(q)} style={{
              padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              background: quarter === q ? "#6366f1" : "#1e293b", color: quarter === q ? "#fff" : (isOpen ? "#94a3b8" : "#475569"),
              fontWeight: 700, fontSize: 13, fontFamily: "inherit", position: "relative"
            }}>
              {q.toUpperCase()}
              {!isOpen && <span style={{ marginLeft: 6, fontSize: 10 }}>🔒</span>}
            </button>
          )
        })}
      </div>

      {!isQuarterOpen(quarter) && (
        <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {quarter.toUpperCase()} update window is closed. 
          {quarter === "q1" ? " (Open in July)" : quarter === "q2" ? " (Open in October)" : quarter === "q3" ? " (Open in January)" : " (Open in March / April)"}
        </div>
      )}

      {goals.length === 0 ? (
        <div style={{ color: "#64748b", textAlign: "center", padding: 60 }}>No locked goals yet. Goals must be approved before logging check-ins.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {goals.map(goal => {
            const ach = achievements[goal.id]?.[quarter] || {};
            const isTimeline = goal.uom_type === "timeline";
            return (
              <div key={goal.id} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
                <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, background: "#1e293b", padding: "2px 8px", borderRadius: 6, color: "#94a3b8" }}>{goal.thrust_area}</span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{UOM_TYPES.find(u => u.value === goal.uom_type)?.label.split("(")[0].trim()}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 12 }}>{goal.title}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
                  <div>
                    <label style={labelStyle}>Planned Target</label>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#6366f1" }}>{isTimeline ? goal.target_date : goal.target_value}</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Actual {isTimeline ? "Date" : "Achievement"}</label>
                    {isTimeline ? (
                      <input disabled={!isQuarterOpen(quarter)} type="date" defaultValue={ach.actual_date || ""} onBlur={e => saveAchievement(goal, "actual_date", e.target.value)} style={inputStyle} />
                    ) : (
                      <input disabled={!isQuarterOpen(quarter)} type="number" defaultValue={ach.actual_value || ""} onBlur={e => saveAchievement(goal, "actual_value", e.target.value)} style={inputStyle} placeholder="Enter actual" />
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select disabled={!isQuarterOpen(quarter)} value={ach.progress_status || "not_started"} onChange={e => saveStatus(goal, e.target.value)} style={inputStyle}>
                      <option value="not_started">Not Started</option>
                      <option value="on_track">On Track</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Score:</span>
                  <div style={{ flex: 1 }}><ScoreBar score={ach.score} /></div>
                  {saving[goal.id] && <span style={{ fontSize: 11, color: "#6366f1" }}>Saving…</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manager comments */}
      {myCheckins.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#94a3b8", marginBottom: 12 }}>Manager Feedback</h3>
          {myCheckins.map(c => (
            <div key={c.id} style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: 16, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                <Badge status={c.quarter} />
                <span style={{ fontSize: 12, color: "#475569" }}>{c.manager?.name} • {new Date(c.created_at).toLocaleDateString()}</span>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>{c.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGER — APPROVALS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function ApprovalsPage({ user, toast }) {
  const [submissions, setSubmissions] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editWeightage, setEditWeightage] = useState({});
  const [editTarget, setEditTarget] = useState({});

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data: emps } = await supabase.from("users").select("*").eq("manager_id", user.id);
    const teamIds = (emps || []).map(t => t.id);
    if (!teamIds.length) { setSubmissions([]); setLoading(false); return; }
    const { data: goals } = await supabase.from("goals").select("*, employee:employee_id(id,name,email)").in("employee_id", teamIds).in("status", ["submitted","approved","locked","rejected"]).order("updated_at", { ascending: false });
    // Group by employee
    const grouped = {};
    (goals || []).forEach(g => {
      const eid = g.employee_id;
      if (!grouped[eid]) grouped[eid] = { employee: g.employee, goals: [] };
      grouped[eid].goals.push(g);
    });
    setSubmissions(Object.values(grouped));
    setLoading(false);
  }, [user.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function approveAll(employeeId) {
    const empGoals = submissions.find(s => s.goals[0].employee_id === employeeId)?.goals || [];
    const totalWeight = empGoals.filter(g => g.status !== "rejected").reduce((s, g) => s + parseFloat(g.weightage || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      toast.error(`Total weightage is ${totalWeight.toFixed(0)}%. It must equal exactly 100% to approve.`);
      return;
    }

    const ids = empGoals.filter(g => g.status === "submitted").map(g => g.id);
    await supabase.from("goals").update({ status: "locked" }).in("id", ids);
    await supabase.from("audit_log").insert(ids.map(id => ({ goal_id: id, changed_by: user.id, action: "approved_and_locked" })));
    toast.success("Goals approved and locked!");
    
    // Notification Trigger
    const employeeEmail = submissions.find(s => s.goals[0].employee_id === employeeId)?.employee?.email;
    if (employeeEmail) NotificationService.notifyApproval(employeeEmail);

    fetch();
  }

  async function returnForRework(employeeId) {
    if (!isGoalSettingOpen()) { toast.error("Goal setting window is closed"); return; }
    const res = confirm("Return these goals back to draft state? This will erase any existing actuals for this quarter.");
    if (!res) return;
    const empGoals = submissions.find(s => s.goals[0].employee_id === employeeId)?.goals || [];
    const ids = empGoals.filter(g => g.status === "submitted").map(g => g.id);
    await supabase.from("goals").update({ status: "draft" }).in("id", ids);
    await supabase.from("audit_log").insert(ids.map(id => ({ goal_id: id, changed_by: user.id, action: "returned_for_rework" })));
    toast.warn("Goals returned for rework");
    
    // Notification Trigger
    const employeeEmail = submissions.find(s => s.goals[0].employee_id === employeeId)?.employee?.email;
    if (employeeEmail) NotificationService.notifyRework(employeeEmail);

    fetch();
  }

  async function updateWeightage(goalId, val) {
    const w = parseFloat(val);
    if (isNaN(w) || w < 10) { toast.error("Min weightage is 10%"); return; }
    await supabase.from("goals").update({ weightage: w, updated_at: new Date().toISOString() }).eq("id", goalId);
    await supabase.from("audit_log").insert({ goal_id: goalId, changed_by: user.id, action: "weightage_edited", new_value: String(w) });
    toast.success("Weightage updated");
    fetch();
  }

  async function updateTarget(goal, val) {
    if (!val) { toast.error("Target cannot be empty"); return; }
    const isTimeline = goal.uom_type === "timeline";
    const payload = isTimeline ? { target_date: val } : { target_value: val };
    await supabase.from("goals").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", goal.id);
    await supabase.from("audit_log").insert({ goal_id: goal.id, changed_by: user.id, action: "target_edited", new_value: String(val) });
    toast.success("Target updated");
    fetch();
  }

  if (loading) return <div style={{ color: "#64748b" }}>Loading…</div>;

  return (
    <div>
      <PageHeader title="Goal Approvals" subtitle="Review team goals submitted for approval" />
      
      {!isGoalSettingOpen() && (
        <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          Goal Setting window is closed. (Approvals are only allowed during May)
        </div>
      )}

      {submissions.length === 0 ? (
        <div style={{ color: "#64748b", textAlign: "center", padding: 60 }}>No pending submissions</div>
      ) : (
        submissions.map(sub => {
          const hasSubmitted = sub.goals.some(g => g.status === "submitted");
          const allLocked = sub.goals.every(g => g.status === "locked");
          const total = sub.goals.filter(g => g.status !== "rejected").reduce((s, g) => s + parseFloat(g.weightage || 0), 0);
          return (
            <div key={sub.employee?.id || sub.goals[0]?.employee_id} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
              <div onClick={() => setExpanded(expanded === (sub.employee?.id || sub.goals[0]?.employee_id) ? null : (sub.employee?.id || sub.goals[0]?.employee_id))} style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{sub.employee.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{sub.employee.email} • {sub.goals.length} goals • {total.toFixed(0)}% total</div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {allLocked && <Badge status="locked" />}
                  {hasSubmitted && <Badge status="submitted" />}
                  <span style={{ color: "#64748b", fontSize: 18 }}>{expanded === (sub.employee?.id || sub.goals[0]?.employee_id) ? "▲" : "▼"}</span>
                </div>
              </div>
              {expanded === (sub.employee?.id || sub.goals[0]?.employee_id) && (
                <div style={{ borderTop: "1px solid #1e293b", padding: 20 }}>
                  {sub.goals.map(goal => {
                    const isTimeline = goal.uom_type === "timeline";
                    const isZero = goal.uom_type === "zero";
                    return (
                    <div key={goal.id} style={{ background: "#1e293b", borderRadius: 10, padding: 14, marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{goal.title}</div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                            {goal.thrust_area} • {UOM_TYPES.find(u => u.value === goal.uom_type)?.label.split("(")[0].trim()} •
                            Target: {goal.target_value || goal.target_date || "—"}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <Badge status={goal.status} />
                          {goal.status === "submitted" && (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              {!isZero && (
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <input type={isTimeline ? "date" : "number"} defaultValue={isTimeline ? goal.target_date : goal.target_value}
                                    onChange={e => setEditTarget(p => ({ ...p, [goal.id]: e.target.value }))}
                                    style={{ ...inputStyle, width: isTimeline ? 130 : 90, padding: "4px 8px", fontSize: 12 }} />
                                  <Btn onClick={() => updateTarget(goal, editTarget[goal.id] ?? (isTimeline ? goal.target_date : goal.target_value))} variant="ghost" style={{ padding: "4px 10px", fontSize: 12 }}>Save Tgt</Btn>
                                </div>
                              )}
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <input type="number" defaultValue={goal.weightage} min="10"
                                  onChange={e => setEditWeightage(p => ({ ...p, [goal.id]: e.target.value }))}
                                  style={{ ...inputStyle, width: 70, padding: "4px 8px", fontSize: 12 }} />
                                <span style={{ fontSize: 12, color: "#64748b" }}>%</span>
                                <Btn onClick={() => updateWeightage(goal.id, editWeightage[goal.id] ?? goal.weightage)} variant="ghost" style={{ padding: "4px 10px", fontSize: 12 }}>Save Wt</Btn>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )})}
                  {hasSubmitted && (
                    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <Btn onClick={() => approveAll(sub.employee?.id || sub.goals[0]?.employee_id)} variant="success" disabled={!isGoalSettingOpen()}>Approve & Lock</Btn>
                    <Btn onClick={() => returnForRework(sub.employee?.id || sub.goals[0]?.employee_id)} variant="danger" disabled={!isGoalSettingOpen()}>Return for Rework</Btn>
                  </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGER — TEAM DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function TeamDashboardPage({ user, toast }) {
  const [team, setTeam] = useState([]);
  const [selected, setSelected] = useState(null);
  const [goals, setGoals] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [quarter, setQuarter] = useState("q1");

  useEffect(() => {
    supabase.from("users").select("*").eq("manager_id", user.id).then(({ data }) => setTeam(data || []));
  }, [user.id]);

  async function sendReminders() {
    if (!team.length) return;
    toast.success("Sending automated reminders to team...");
    for (const member of team) {
      if (member.email) {
        await NotificationService.notifyCheckinReminder(member.email, member.name, quarter.toUpperCase());
      }
    }
  }

  useEffect(() => {
    if (!selected) return;
    (async () => {
      const { data: g } = await supabase.from("goals").select("*").eq("employee_id", selected.id);
      const { data: a } = await supabase.from("achievements").select("*").in("goal_id", (g || []).map(x => x.id)).eq("quarter", quarter);
      setGoals(g || []);
      setAchievements(a || []);
    })();
  }, [selected, quarter]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <PageHeader title="Team Dashboard" subtitle="Monitor your team's goal progress and check-ins" />
        <Btn onClick={sendReminders} style={{ background: "linear-gradient(to right, #f59e0b, #d97706)" }}>🔔 Send Check-in Reminders</Btn>
      </div>
      
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2.5fr", gap: 24 }}>
        {/* Team list */}
        <div>
          {team.map(member => (
            <div key={member.id} onClick={() => setSelected(member)} style={{
              background: selected?.id === member.id ? "#1e293b" : "#0f172a",
              border: `1px solid ${selected?.id === member.id ? "#6366f1" : "#1e293b"}`,
              borderRadius: 10, padding: 14, marginBottom: 8, cursor: "pointer"
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{member.name}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{member.department}</div>
            </div>
          ))}
        </div>
        {/* Detail */}
        {selected ? (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {["q1","q2","q3","q4"].map(q => {
                const isOpen = isQuarterOpen(q);
                return (
                  <button key={q} onClick={() => setQuarter(q)} style={{
                    padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: quarter === q ? "#6366f1" : "#1e293b", color: quarter === q ? "#fff" : (isOpen ? "#94a3b8" : "#475569"),
                    fontWeight: 700, fontSize: 13, fontFamily: "inherit", position: "relative"
                  }}>
                    {q.toUpperCase()}
                    {!isOpen && <span style={{ marginLeft: 6, fontSize: 10 }}>🔒</span>}
                  </button>
                )
              })}
            </div>
            
            {!isQuarterOpen(quarter) && (
              <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
                {quarter.toUpperCase()} update window is closed. 
              </div>
            )}

            {goals.length === 0 ? (
              <div style={{ color: "#475569", textAlign: "center", padding: 60 }}>No goals found for {selected.name}</div>
            ) : (
              goals.map(goal => {
                const ach = achievements.find(a => a.goal_id === goal.id);
                return (
                  <div key={goal.id} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 16, marginBottom: 10 }}>
                    <div style={{ display: "flex", justify: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{goal.title}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                          {goal.thrust_area} • {UOM_TYPES.find(u => u.value === goal.uom_type)?.label.split("(")[0].trim()} •
                          Target: {goal.target_value || goal.target_date || "—"}
                        </div>
                      </div>
                      {ach && <Badge status={ach.progress_status} />}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontSize: 13 }}>
                      <div><span style={{ color: "#64748b" }}>Planned:</span> <b style={{ color: "#6366f1" }}>{goal.target_value || goal.target_date || "—"}</b></div>
                      <div><span style={{ color: "#64748b" }}>Actual:</span> <b style={{ color: "#f1f5f9" }}>{ach?.actual_value || ach?.actual_date || "—"}</b></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "#64748b" }}>Score:</span> <ScoreBar score={ach?.score} /></div>
                    </div>
                  </div>
                );
              })
            )}
            <CheckinPanel manager={user} employee={selected} quarter={quarter} toast={toast} />
          </div>
        ) : (
          <div style={{ color: "#475569", textAlign: "center", padding: 60 }}>Select a team member to view their goals</div>
        )}
      </div>
    </div>
  );
}

function CheckinPanel({ manager, employee, quarter, toast }) {
  const [comment, setComment] = useState("");
  const [prev, setPrev] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("checkins").select("*").eq("employee_id", employee.id).eq("quarter", quarter).order("created_at")
      .then(({ data }) => setPrev(data || []));
  }, [employee.id, quarter]);

  async function save() {
    if (!isQuarterOpen(quarter)) { toast.error(`${quarter.toUpperCase()} check-in window is closed.`); return; }
    if (!comment.trim()) return;
    setSaving(true);
    await supabase.from("checkins").insert({ manager_id: manager.id, employee_id: employee.id, quarter, comment: comment.trim() });
    toast.success("Check-in comment saved!");
    setComment("");
    const { data } = await supabase.from("checkins").select("*").eq("manager_id", manager.id).eq("employee_id", employee.id).eq("quarter", quarter).order("created_at", { ascending: false });
    setPrev(data || []);
    setSaving(false);
  }

  return (
    <div style={{ marginTop: 20, background: "#0f172a", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
      <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#94a3b8" }}>Manager Check-in — {quarter.toUpperCase()}</h4>
      <textarea value={comment} onChange={e => setComment(e.target.value)} style={{ ...inputStyle, height: 80, resize: "vertical", marginBottom: 10 }} placeholder="Add structured check-in comment…" />
      <Btn onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Check-in Comment"}</Btn>
      {prev.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>Previous comments:</div>
          {prev.map(p => (
            <div key={p.id} style={{ background: "#1e293b", borderRadius: 8, padding: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 2 }}>{new Date(p.created_at).toLocaleString()}</div>
              <div>{p.comment}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
          <input disabled={!isQuarterOpen(quarter)} value={comment} onChange={e => setComment(e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder={isQuarterOpen(quarter) ? "Add a check-in comment to document the discussion…" : "Check-in window is closed"} />
          <Btn disabled={!isQuarterOpen(quarter) || saving} onClick={save}>{saving ? "Saving…" : "Post Comment"}</Btn>
        </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
function AdminOverviewPage({ user, toast }) {
  const [stats, setStats] = useState({ users: 0, goals: 0, locked: 0, submitted: 0, checkins: 0 });

  useEffect(() => {
    (async () => {
      const [{ count: u }, { count: g }, { count: l }, { count: s }, { count: c }] = await Promise.all([
        supabase.from("users").select("*", { count: "exact", head: true }),
        supabase.from("goals").select("*", { count: "exact", head: true }),
        supabase.from("goals").select("*", { count: "exact", head: true }).eq("status", "locked"),
        supabase.from("goals").select("*", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("checkins").select("*", { count: "exact", head: true }),
      ]);
      setStats({ users: u, goals: g, locked: l, submitted: s, checkins: c });
    })();
  }, []);

  async function forceUnlockEmployeeGoals(employeeId) {
    if (!confirm("Are you sure you want to unlock ALL goals for this employee? This will reset them to draft status.")) return;
    const { data } = await supabase.from("goals").select("id").eq("employee_id", employeeId).eq("status", "locked");
    if (!data || data.length === 0) return;
    
    await supabase.from("goals").update({ status: "draft" }).in("id", data.map(g => g.id));
    
    for (const g of data) {
      await supabase.from("audit_log").insert({ goal_id: g.id, changed_by: user.id, action: "admin_unlocked" });
    }
    
    toast.success(`Unlocked ${data.length} goals for the employee!`);
    setStats(p => ({ ...p, locked: p.locked - data.length }));
  }

  const statCards = [
    { label: "Total Users",      value: stats.users,    color: "#6366f1", icon: "👥" },
    { label: "Total Goals",      value: stats.goals,    color: "#10b981", icon: "🎯" },
    { label: "Locked Goals",     value: stats.locked,   color: "#6366f1", icon: "🔒" },
    { label: "Pending Approval", value: stats.submitted, color: "#f59e0b", icon: "⏳" },
    { label: "Check-ins Done",   value: stats.checkins, color: "#06b6d4", icon: "✅" },
  ];

  return (
    <div>
      <PageHeader title="Admin Overview" subtitle="Organization-wide goal progress at a glance" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 32 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: "'Syne', sans-serif" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <CompletionDashboard forceUnlockGoal={forceUnlockEmployeeGoals} />
    </div>
  );
}

function CompletionDashboard({ forceUnlockGoal }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: users } = await supabase.from("users").select("id,name,role,department").eq("role", "employee");
      const { data: goals } = await supabase.from("goals").select("employee_id,status");
      const { data: ach } = await supabase.from("achievements").select("goal_id,quarter");
      const { data: goals2 } = await supabase.from("goals").select("id,employee_id");
      const goalIdsByEmp = {};
      (goals2 || []).forEach(g => { if (!goalIdsByEmp[g.employee_id]) goalIdsByEmp[g.employee_id] = []; goalIdsByEmp[g.employee_id].push(g.id); });
      const rows = (users || []).map(u => {
        const empGoals = (goals || []).filter(g => g.employee_id === u.id);
        const submitted = empGoals.filter(g => ["submitted","approved","locked"].includes(g.status)).length;
        const locked = empGoals.filter(g => g.status === "locked").length;
        const gIds = goalIdsByEmp[u.id] || [];
        const checkedIn = new Set((ach || []).filter(a => gIds.includes(a.goal_id)).map(a => a.quarter)).size;
        return { ...u, totalGoals: empGoals.length, submitted, locked, checkedIn };
      });
      setData(rows);
    })();
  }, []);

  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e293b" }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#94a3b8" }}>Employee Completion Dashboard</h3>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["Employee","Department","Goals","Submitted","Locked","Check-ins", "Actions"].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.id} style={{ borderBottom: "1px solid #0f172a" }}
                onMouseOver={e => e.currentTarget.style.background = "#1e293b"}
                onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "10px 16px", color: "#f1f5f9", fontWeight: 600 }}>{row.name}</td>
                <td style={{ padding: "10px 16px", color: "#64748b" }}>{row.department}</td>
                <td style={{ padding: "10px 16px", color: "#f1f5f9" }}>{row.totalGoals}</td>
                <td style={{ padding: "10px 16px" }}><Badge status={row.submitted > 0 ? "submitted" : "draft"} /></td>
                <td style={{ padding: "10px 16px" }}><Badge status={row.locked > 0 ? "locked" : "draft"} /></td>
                <td style={{ padding: "10px 16px", color: row.checkedIn > 0 ? "#10b981" : "#64748b" }}>{row.checkedIn} / 4 quarters</td>
                <td style={{ padding: "10px 16px" }}>
                  {row.locked > 0 && <Btn onClick={() => forceUnlockGoal(row.id)} variant="danger" style={{ padding: "4px 8px", fontSize: 11 }}>Unlock Goals</Btn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — REPORTS (CSV Export)
// ═══════════════════════════════════════════════════════════════════════════════
function ReportsPage({ toast }) {
  const [loading, setLoading] = useState(false);

  async function exportCSV() {
    setLoading(true);
    const { data: goals } = await supabase.from("goals").select("*, employee:employee_id(name,department)");
    const { data: ach } = await supabase.from("achievements").select("*");
    const achMap = {};
    (ach || []).forEach(a => { if (!achMap[a.goal_id]) achMap[a.goal_id] = {}; achMap[a.goal_id][a.quarter] = a; });

    const rows = [["Employee","Department","Thrust Area","Goal Title","UoM","Target","Weightage","Q1 Actual","Q1 Score","Q2 Actual","Q2 Score","Q3 Actual","Q3 Score","Q4 Actual","Q4 Score","Status"]];
    (goals || []).forEach(g => {
      const row = [
        g.employee?.name, g.employee?.department, g.thrust_area, g.title,
        g.uom_type, g.target_value || g.target_date, g.weightage + "%",
      ];
      ["q1","q2","q3","q4"].forEach(q => {
        const a = achMap[g.id]?.[q];
        row.push(a?.actual_value || a?.actual_date || "—");
        row.push(a?.score !== undefined && a?.score !== null ? a.score + "%" : "—");
      });
      row.push(g.status);
      rows.push(row);
    });

    const csv = rows.map(r => r.map(cell => `"${String(cell || "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "achievement_report.csv"; a.click();
    URL.revokeObjectURL(url);
    setLoading(false);
    toast.success("Report downloaded!");
  }

  return (
    <div>
      <PageHeader title="Reports" subtitle="Export achievement data for all employees" />
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: 32, display: "flex", gap: 24, alignItems: "center" }}>
        <div style={{ fontSize: 40 }}>📊</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>Achievement Report</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Exports all goals with Planned Target vs. Actual Achievement for all employees, across all quarters. Includes computed scores.</div>
        </div>
        <Btn onClick={exportCSV} variant="success" disabled={loading}>{loading ? "Generating…" : "⬇ Export CSV"}</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — SHARED GOALS
// ═══════════════════════════════════════════════════════════════════════════════
function SharedGoalsPage({ user, toast }) {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ thrust_area: "", title: "", uom_type: "numeric_min", target_value: "", selectedEmployees: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("users").select("id,name,department").eq("role", "employee").then(({ data }) => setEmployees(data || []));
  }, []);

  async function push() {
    if (!form.title || !form.thrust_area || form.selectedEmployees.length === 0) { toast.error("Fill all fields and select employees"); return; }
    setSaving(true);
    const cycle = await supabase.from("goal_cycles").select("id").eq("is_active", true).single();
    const baseGoal = { thrust_area: form.thrust_area, title: form.title, uom_type: form.uom_type, target_value: form.target_value || null, is_shared: true, status: "draft", weightage: 10, cycle_id: cycle.data?.id };
    for (const eid of form.selectedEmployees) {
      const { data: g } = await supabase.from("goals").insert({ ...baseGoal, employee_id: eid }).select().single();
      await supabase.from("audit_log").insert({ goal_id: g.id, changed_by: user.id, action: "shared_goal_pushed" });
    }
    toast.success(`Shared goal pushed to ${form.selectedEmployees.length} employees!`);
    setForm({ thrust_area: "", title: "", uom_type: "numeric_min", target_value: "", selectedEmployees: [] });
    setSaving(false);
  }

  return (
    <div>
      <PageHeader title="Shared Goals" subtitle="Push a departmental KPI to multiple employees" />
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: 24, maxWidth: 600 }}>
        <Field label="Thrust Area"><select value={form.thrust_area} onChange={e => setForm(p => ({ ...p, thrust_area: e.target.value }))} style={inputStyle}><option value="">Select…</option>{THRUST_AREAS.map(t => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Goal Title"><input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} placeholder="e.g. Zero Safety Incidents Q1" /></Field>
        <Field label="UoM Type"><select value={form.uom_type} onChange={e => setForm(p => ({ ...p, uom_type: e.target.value }))} style={inputStyle}>{UOM_TYPES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}</select></Field>
        <Field label="Target Value"><input type="number" value={form.target_value} onChange={e => setForm(p => ({ ...p, target_value: e.target.value }))} style={inputStyle} placeholder="Optional for Zero-based goals" /></Field>
        <Field label="Push To Employees">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {employees.map(emp => (
              <label key={emp.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#94a3b8", fontSize: 13 }}>
                <input type="checkbox" checked={form.selectedEmployees.includes(emp.id)} onChange={e => setForm(p => ({ ...p, selectedEmployees: e.target.checked ? [...p.selectedEmployees, emp.id] : p.selectedEmployees.filter(id => id !== emp.id) }))} />
                {emp.name} <span style={{ color: "#475569" }}>({emp.department})</span>
              </label>
            ))}
          </div>
        </Field>
        <Btn onClick={push} variant="success" disabled={saving}>{saving ? "Pushing…" : "🔗 Push Shared Goal"}</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — CYCLES & AUDIT
// ═══════════════════════════════════════════════════════════════════════════════

function CyclesPage({ toast }) {
  return (
    <div>
      <PageHeader title="Goal Cycles" subtitle="Manage Performance Cycles" />
      <div style={{ color: "#64748b", padding: 40, textAlign: "center", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14 }}>
        Cycle configuration is managed in the database schema directly for this version.
      </div>
    </div>
  );
}

function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  
  useEffect(() => {
    supabase.from("audit_log")
      .select("*, changed_by(name,role), goal_id(title, status)")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setLogs(data || []));
  }, []);

  return (
    <div>
      <PageHeader title="System Audit Logs" subtitle="Track all changes to goals after locking" />
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b", background: "#1e293b" }}>
              <th style={{ padding: "10px 16px", textAlign: "left", color: "#64748b" }}>Timestamp</th>
              <th style={{ padding: "10px 16px", textAlign: "left", color: "#64748b" }}>User</th>
              <th style={{ padding: "10px 16px", textAlign: "left", color: "#64748b" }}>Action</th>
              <th style={{ padding: "10px 16px", textAlign: "left", color: "#64748b" }}>Goal Reference</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan="4" style={{ padding: 40, textAlign: "center", color: "#64748b" }}>No logs recorded yet.</td></tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} style={{ borderBottom: "1px solid #0f172a" }}>
                  <td style={{ padding: "10px 16px", color: "#f1f5f9" }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={{ padding: "10px 16px", color: "#94a3b8" }}>{log.changed_by?.name || "System"} <span style={{ fontSize: 11, color: "#64748b" }}>({log.changed_by?.role || "unknown"})</span></td>
                  <td style={{ padding: "10px 16px", color: "#6366f1", fontWeight: 600 }}>{log.action?.replace(/_/g, " ").toUpperCase()}</td>
                  <td style={{ padding: "10px 16px", color: "#f1f5f9" }}>{log.goal_id?.title || "Unknown Goal"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — ANALYTICS MODULE
// ═══════════════════════════════════════════════════════════════════════════════
function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quarterFilter, setQuarterFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: goals },
      { data: achievements },
      { data: users },
      { data: checkins },
      escRes,
      { data: cycle },
    ] = await Promise.all([
      supabase.from("goals").select("*"),
      supabase.from("achievements").select("*"),
      supabase.from("users").select("*"),
      supabase.from("checkins").select("*"),
      supabase.from("escalations").select("*"),
      supabase.from("goal_cycles").select("*").eq("is_active", true).maybeSingle(),
    ]);
    const escalations = escRes.error ? [] : escRes.data;
    setData(computeAnalytics(
      { goals, achievements, users, checkins, escalations, cycle },
      quarterFilter
    ));
    setLoading(false);
  }, [quarterFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) return <div style={{ color: "#64748b" }}>Loading analytics…</div>;

  const { kpis, statusCounts, quarterAvgs, progressCounts, departments, thrustAreas, leaderboard, checkinRates, cycle, activeQuarter } = data;
  const statusTotal = Object.values(statusCounts).reduce((s, n) => s + n, 0);
  const progressTotal = Object.values(progressCounts).reduce((s, n) => s + n, 0);
  const maxQuarterAvg = Math.max(...Object.values(quarterAvgs).filter(v => v != null), 1);

  const fmt = n => (n != null ? `${n.toFixed(1)}%` : "—");

  return (
    <div>
      <PageHeader
        title="Analytics Module"
        subtitle={cycle ? `${cycle.name} • ${cycle.phase.replace(/_/g, " ").toUpperCase()}` : "Organization performance insights"}
        action={
          <select value={quarterFilter} onChange={e => setQuarterFilter(e.target.value)} style={{ ...inputStyle, width: 140 }}>
            <option value="all">All quarters</option>
            {["q1", "q2", "q3", "q4"].map(q => <option key={q} value={q}>{q.toUpperCase()}</option>)}
          </select>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Avg Achievement Score", value: fmt(quarterFilter !== "all" ? kpis.selectedQuarterAvg : kpis.overallAvgScore), color: "#60a5fa", icon: "📈" },
          { label: "Employees w/ Locked Goals", value: `${kpis.goalLockRate}%`, color: "#10b981", icon: "🔒" },
          { label: "Pending Approvals", value: kpis.pendingApprovals, color: "#f59e0b", icon: "⏳" },
          { label: "Open Escalations", value: kpis.openEscalations, color: "#ef4444", icon: "🚨" },
          { label: "Total Goals", value: kpis.totalGoals, color: "#6366f1", icon: "🎯" },
        ].map(s => (
          <div key={s.label} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: "'Syne', sans-serif" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#60a5fa" }}>Goal Status Distribution</h3>
          {Object.entries(statusCounts).map(([status, count]) => (
            <AnalyticsBar key={status} label={status.replace(/_/g, " ")} value={count} max={statusTotal || 1} color={
              status === "locked" ? "#6366f1" : status === "submitted" ? "#f59e0b" : status === "draft" ? "#94a3b8" : status === "approved" ? "#10b981" : "#ef4444"
            } />
          ))}
        </div>

        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#60a5fa" }}>
            Quarterly Avg Scores{activeQuarter && quarterFilter === "all" ? ` (active: ${activeQuarter.toUpperCase()})` : ""}
          </h3>
          {["q1", "q2", "q3", "q4"].map(q => (
            <AnalyticsBar
              key={q}
              label={q.toUpperCase()}
              value={quarterAvgs[q] != null ? quarterAvgs[q].toFixed(1) : 0}
              max={maxQuarterAvg}
              color={q === activeQuarter ? "#60a5fa" : "#6366f1"}
              suffix={quarterAvgs[q] != null ? "%" : " (no data)"}
            />
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#60a5fa" }}>Check-in Participation</h3>
          {["q1", "q2", "q3", "q4"].map(q => (
            <AnalyticsBar key={q} label={`${q.toUpperCase()} employees with check-ins`} value={checkinRates[q]} max={100} color="#06b6d4" suffix="%" />
          ))}
        </div>

        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#60a5fa" }}>Progress Status{quarterFilter !== "all" ? ` (${quarterFilter.toUpperCase()})` : ""}</h3>
          {Object.entries(progressCounts).map(([status, count]) => (
            <AnalyticsBar
              key={status}
              label={status.replace(/_/g, " ")}
              value={count}
              max={progressTotal || 1}
              color={status === "completed" ? "#10b981" : status === "on_track" ? "#f59e0b" : "#94a3b8"}
            />
          ))}
          {progressTotal === 0 && <div style={{ color: "#64748b", fontSize: 13 }}>No achievement records for this filter.</div>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e293b" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#60a5fa" }}>By Department</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b", background: "#1e293b" }}>
                {["Department", "Employees", "Goals", "Locked %", "Avg Score"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {departments.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>No department data</td></tr>
              ) : departments.map(d => (
                <tr key={d.name} style={{ borderBottom: "1px solid #0f172a" }}>
                  <td style={{ padding: "10px 14px", color: "#f1f5f9", fontWeight: 600 }}>{d.name}</td>
                  <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{d.employees}</td>
                  <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{d.goals}</td>
                  <td style={{ padding: "10px 14px", color: "#6366f1" }}>{d.lockRate}%</td>
                  <td style={{ padding: "10px 14px", color: "#10b981" }}>{fmt(d.avgScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e293b" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#60a5fa" }}>By Thrust Area</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b", background: "#1e293b" }}>
                {["Thrust Area", "Goals", "Avg Score"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {thrustAreas.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>No goals yet</td></tr>
              ) : thrustAreas.slice(0, 8).map(t => (
                <tr key={t.name} style={{ borderBottom: "1px solid #0f172a" }}>
                  <td style={{ padding: "10px 14px", color: "#f1f5f9" }}>{t.name}</td>
                  <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{t.count}</td>
                  <td style={{ padding: "10px 14px", color: "#10b981" }}>{fmt(t.avgScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e293b" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#60a5fa" }}>Employee Performance (weighted by goal weightage)</h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b", background: "#1e293b" }}>
              {["Rank", "Employee", "Department", "Locked Goals", "Weighted Score", "Quarter"].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#64748b", fontSize: 11, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leaderboard.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#64748b" }}>No scored achievements yet. Log check-ins with actuals to populate analytics.</td></tr>
            ) : (
              leaderboard.map((emp, i) => (
                <tr key={emp.id} style={{ borderBottom: "1px solid #0f172a" }}>
                  <td style={{ padding: "10px 16px", color: "#64748b" }}>#{i + 1}</td>
                  <td style={{ padding: "10px 16px", color: "#f1f5f9", fontWeight: 600 }}>{emp.name}</td>
                  <td style={{ padding: "10px 16px", color: "#94a3b8" }}>{emp.department}</td>
                  <td style={{ padding: "10px 16px", color: "#94a3b8" }}>{emp.lockedCount}</td>
                  <td style={{ padding: "10px 16px" }}><ScoreBar score={emp.score?.toFixed(1)} /></td>
                  <td style={{ padding: "10px 16px", color: "#64748b" }}>{emp.usedQuarter?.toUpperCase() || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — ESCALATION MODULE (RULE-BASED)
// ═══════════════════════════════════════════════════════════════════════════════
function EscalationPage({ toast }) {
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);

  const loadLogs = useCallback(async () => {
    const { data } = await supabase
      .from("escalations")
      .select("*, employee:employee_id(name)")
      .order("created_at", { ascending: false })
      .limit(50);
    setLogs(data || []);
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function runCheck() {
    setRunning(true);
    try {
      const created = await runEscalationCheck();
      await loadLogs();
      toast.success(created > 0 ? `${created} escalation(s) triggered` : "No new escalations — all rules passed");
    } catch (err) {
      console.error(err);
      toast.error("Escalation check failed. Ensure the escalations table exists in Supabase.");
    }
    setRunning(false);
  }

  async function resolve(id) {
    await supabase.from("escalations").update({ status: "resolved" }).eq("id", id);
    toast.success("Escalation resolved");
    loadLogs();
  }

  const ruleLabel = id => ESCALATION_RULES.find(r => r.id === id)?.name || id;

  return (
    <div>
      <PageHeader
        title="Escalation Module (Rule-Based)"
        subtitle="Automatically escalates overdue approvals and missing check-ins"
        action={<Btn onClick={runCheck} disabled={running}>{running ? "Running…" : "▶ Run Escalation Check"}</Btn>}
      />

      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e293b" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#60a5fa" }}>Active Rules</h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b", background: "#1e293b" }}>
              {["Rule", "Condition", "Action", "Escalate To"].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ESCALATION_RULES.map(rule => (
              <tr key={rule.id} style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={{ padding: "10px 16px", color: "#f1f5f9", fontWeight: 600 }}>{rule.name}</td>
                <td style={{ padding: "10px 16px", color: "#94a3b8" }}>{rule.condition}</td>
                <td style={{ padding: "10px 16px", color: "#94a3b8" }}>{rule.action}</td>
                <td style={{ padding: "10px 16px" }}><Badge status={rule.target === "manager" ? "submitted" : rule.target === "admin" ? "locked" : "on_track"} /> <span style={{ color: "#64748b", fontSize: 11, marginLeft: 6 }}>{rule.target}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e293b" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#94a3b8" }}>Escalation Log</h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b", background: "#1e293b" }}>
              {["When", "Rule", "Employee", "Message", "To", "Status", ""].map(h => (
                <th key={h || "act"} style={{ padding: "10px 16px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#64748b" }}>No escalations yet. Run a check to evaluate rules.</td></tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} style={{ borderBottom: "1px solid #0f172a" }}>
                  <td style={{ padding: "10px 16px", color: "#94a3b8" }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={{ padding: "10px 16px", color: "#60a5fa", fontSize: 12 }}>{ruleLabel(log.rule_id)}</td>
                  <td style={{ padding: "10px 16px", color: "#f1f5f9" }}>{log.employee?.name || "—"}</td>
                  <td style={{ padding: "10px 16px", color: "#cbd5e1" }}>{log.message}</td>
                  <td style={{ padding: "10px 16px", color: "#64748b", textTransform: "capitalize" }}>{log.escalated_to}</td>
                  <td style={{ padding: "10px 16px" }}><Badge status={log.status === "open" ? "rejected" : "approved"} /></td>
                  <td style={{ padding: "10px 16px" }}>
                    {log.status === "open" && (
                      <Btn onClick={() => resolve(log.id)} variant="ghost" style={{ padding: "4px 8px", fontSize: 11 }}>Resolve</Btn>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const toast = useToast();

  const defaultPage = {
    employee: "my-goals",
    manager: "team",
    admin: "overview"
  };
  const [page, setPage] = useState("my-goals");

  function handleLogin(u) {
    setUser(u);
    // Deep Linking Support
    const params = new URLSearchParams(window.location.search);
    const deepLinkPage = params.get("page");
    if (deepLinkPage) {
      setPage(deepLinkPage);
    } else {
      setPage(defaultPage[u.role]);
    }
  }
  function handleLogout() { setUser(null); }

  if (!user) return (
    <>
      <style>{`@keyframes slideIn { from { transform:translateX(30px);opacity:0 } to { transform:translateX(0);opacity:1 } }`}</style>
      <LoginPage onLogin={handleLogin} />
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </>
  );

  function renderPage() {
    if (user.role === "employee") {
      if (page === "my-goals") return <MyGoalsPage user={user} toast={toast} />;
      if (page === "checkins") return <EmployeeCheckinsPage user={user} toast={toast} />;
    }
    if (user.role === "manager") {
      if (page === "team")      return <TeamDashboardPage user={user} toast={toast} />;
      if (page === "approvals") return <ApprovalsPage user={user} toast={toast} />;
      if (page === "checkins")  return <EmployeeCheckinsPage user={user} toast={toast} />;
    }
    if (user.role === "admin") {
      if (page === "overview") return <AdminOverviewPage user={user} toast={toast} />;
      if (page === "analytics") return <AnalyticsPage />;
      if (page === "escalations") return <EscalationPage toast={toast} />;
      if (page === "cycles")   return <CyclesPage toast={toast} />;
      if (page === "audit")    return <AuditLogPage />;
      if (page === "reports")  return <ReportsPage toast={toast} />;
      if (page === "shared")   return <SharedGoalsPage user={user} toast={toast} />;
    }
    return <div style={{ color: "#64748b" }}>Page not found</div>;
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes slideIn { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0f172a; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        input[type=number]::-webkit-inner-spin-button { opacity: 1; }
      `}</style>
      <Layout user={user} onLogout={handleLogout} page={page} setPage={setPage}>
        {renderPage()}
      </Layout>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    </>
  );
}
