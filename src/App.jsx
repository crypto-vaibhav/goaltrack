import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client ────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://qbzfxgalwnktrnjkuxjs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiemZ4Z2Fsd25rdHJuamt1eGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjgwODYsImV4cCI6MjA5NDQ0NDA4Nn0.5tmA8hy5pvYAo72udbwjGxgik0RZ8ziuHFLW0u7Zqug";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true); setError("");
    const { data, error } = await supabase.from("users").select("*").eq("email", email.trim()).single();
    setLoading(false);
    if (error || !data) { setError("User not found. Use a demo account below."); return; }
    onLogin(data);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#060e1e", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', 'Courier New', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes slideIn { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0f172a; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
      `}</style>
      <div style={{ width: "100%", maxWidth: 420, padding: 20 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: "#f59e0b", fontWeight: 500, textTransform: "uppercase", marginBottom: 8 }}>ATOMQUEST HACKATHON 1.0</div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 36, fontWeight: 800, color: "#f1f5f9", margin: 0, lineHeight: 1.1 }}>
            Goal<span style={{ color: "#6366f1" }}>Track</span>
          </h1>
          <p style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>Performance Management Portal</p>
        </div>
        {/* Card */}
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, padding: 28 }}>
          <form onSubmit={handleLogin}>
            <Field label="Email Address">
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="enter your email" style={inputStyle} required />
            </Field>
            {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "12px", background: "#6366f1", border: "none",
              borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", transition: "opacity 0.2s"
            }}>{loading ? "Signing in…" : "Sign In"}</button>
          </form>
          {/* Demo accounts */}
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #1e293b" }}>
            <p style={{ fontSize: 11, color: "#475569", textAlign: "center", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Demo Accounts</p>
            <div style={{ display: "flex", gap: 8 }}>
              {DEMO_ACCOUNTS.map(a => (
                <button key={a.email} onClick={() => { setEmail(a.email); }} style={{
                  flex: 1, background: "#1e293b", border: `1px solid #334155`,
                  borderRadius: 10, padding: "10px 8px", cursor: "pointer", color: "#f1f5f9",
                  fontFamily: "inherit", transition: "border-color 0.2s"
                }} onMouseOver={e => e.currentTarget.style.borderColor = a.color} onMouseOut={e => e.currentTarget.style.borderColor = "#334155"}>
                  <div style={{ fontSize: 18 }}>{a.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: a.color }}>{a.label}</div>
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
    primary: { background: "#6366f1", color: "#fff" },
    success: { background: "#10b981", color: "#fff" },
    danger:  { background: "#ef4444", color: "#fff" },
    ghost:   { background: "#1e293b", color: "#94a3b8", border: "1px solid #334155" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles[variant], padding: "9px 18px", border: "none", borderRadius: 8,
      fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "inherit", opacity: disabled ? 0.5 : 1, transition: "opacity 0.2s", ...s
    }}>{children}</button>
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
    if (Math.abs(totalWeightage - 100) > 0.01) { toast.error("Total weightage must equal 100%"); return; }
    const draftIds = goals.filter(g => g.status === "draft").map(g => g.id);
    await supabase.from("goals").update({ status: "submitted" }).in("id", draftIds);
    await supabase.from("audit_log").insert(draftIds.map(id => ({ goal_id: id, changed_by: user.id, action: "submitted" })));
    toast.success("Goals submitted for approval!");
    fetch();
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
    
    let updatedAch = null;
    if (existing && existing.id) {
      const { data } = await supabase.from("achievements").update(payload).eq("id", existing.id).select().single();
      updatedAch = data;
    } else {
      const { data } = await supabase.from("achievements").insert({ ...payload, progress_status: "not_started" }).select().single();
      updatedAch = data;
    }
    
    if (updatedAch) {
      setAchievements(p => ({
        ...p, [goal.id]: { ...p[goal.id], [quarter]: updatedAch }
      }));
    }
    setSaving(p => ({ ...p, [goal.id]: false }));
  }

  async function saveStatus(goal, status) {
    if (!isQuarterOpen(quarter)) { toast.error(`Quarter ${quarter.toUpperCase()} update window is closed`); return; }
    const existing = achievements[goal.id]?.[quarter];
    let updatedAch = null;
    if (existing && existing.id) {
      const { data } = await supabase.from("achievements").update({ progress_status: status }).eq("id", existing.id).select().single();
      updatedAch = data;
    } else {
      const { data } = await supabase.from("achievements").insert({ goal_id: goal.id, quarter, progress_status: status, score: null }).select().single();
      updatedAch = data;
    }
    
    if (updatedAch) {
      setAchievements(p => ({
        ...p, [goal.id]: { ...p[goal.id], [quarter]: updatedAch }
      }));
    }
    toast.success("Status updated");
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
              <div key={goal.id} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
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
    fetch();
  }

  async function returnForRework(employee_id) {
    if (!isGoalSettingOpen()) { toast.error("Goal setting window is closed"); return; }
    const res = confirm("Return these goals back to draft state? This will erase any existing actuals for this quarter.");
    if (!res) return;
    const empGoals = submissions.find(s => s.goals[0].employee_id === employee_id)?.goals || [];
    const ids = empGoals.filter(g => g.status === "submitted").map(g => g.id);
    await supabase.from("goals").update({ status: "draft" }).in("id", ids);
    await supabase.from("audit_log").insert(ids.map(id => ({ goal_id: id, changed_by: user.id, action: "returned_for_rework" })));
    toast.warn("Goals returned for rework");
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
      <PageHeader title="Team Dashboard" subtitle="Monitor your team's goal progress" />
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>
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
                <tr key={log.id} style={{ borderBottom: "1px solid #1e293b" }}>
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

  function handleLogin(u) { setUser(u); setPage(defaultPage[u.role]); }
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
