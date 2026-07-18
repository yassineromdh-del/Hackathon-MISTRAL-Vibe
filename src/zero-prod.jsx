import { useState, useEffect } from "react";
import {
  Shield,
  ShieldCheck,
  Terminal,
  Zap,
  GitCommit,
  ArrowRight,
  ArrowLeft,
  Lock,
  Github,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* NOTE FOR YACINE:                                                    */
/* This is one artifact, so routing is simulated with state instead    */
/* of real URLs. In your actual Next.js app, split each PAGE below     */
/* into its own file and swap navigate() for router.push():            */
/*   /app/page.jsx              -> LandingPage                         */
/*   /app/dashboard/page.jsx    -> DashboardPage                       */
/*   /app/dashboard/[id]/page.jsx -> CommitDetailPage                  */
/* The "connected" guard mimics a real auth redirect                   */
/* (middleware.js / getServerSession) that sends unauthenticated       */
/* users back to "/".                                                  */
/* ------------------------------------------------------------------ */

const GATES = [
  { id: "semgrep", label: "SEMGREP", sub: "SAST" },
  { id: "gitleaks", label: "GITLEAKS", sub: "SECRETS" },
  { id: "trivy", label: "TRIVY", sub: "SCA" },
];

const COMMITS = [
  {
    id: "a3f9c1",
    prompt: "scaffold auth flow with supabase magic link",
    status: "pass",
    gates: { semgrep: "pass", gitleaks: "pass", trivy: "pass" },
    time: "00:42:11",
    diff: "+ 84  - 3   auth/callback.ts, auth/login.tsx",
  },
  {
    id: "b71e02",
    prompt: "add stripe checkout session endpoint",
    status: "fail",
    gates: { semgrep: "pass", gitleaks: "fail", trivy: "pass" },
    time: "01:18:47",
    note: "hardcoded STRIPE_SECRET_KEY in checkout.ts:14",
    diff: "+ 41  - 0   checkout.ts",
  },
  {
    id: "c4d820",
    prompt: "fix: move stripe key to env, rotate leaked secret",
    status: "pass",
    gates: { semgrep: "pass", gitleaks: "pass", trivy: "pass" },
    time: "01:24:03",
    diff: "+ 6   - 2   checkout.ts, .env.example",
  },
  {
    id: "d09fe3",
    prompt: "add file upload to user profile",
    status: "fail",
    gates: { semgrep: "fail", gitleaks: "pass", trivy: "pass" },
    time: "02:51:19",
    note: "unrestricted file type + path traversal risk, upload.ts:31",
    diff: "+ 58  - 0   upload.ts",
  },
  {
    id: "e551a7",
    prompt: "fix: whitelist mime types, sanitize filename",
    status: "running",
    gates: { semgrep: "running", gitleaks: "pending", trivy: "pending" },
    time: "02:58:40",
    diff: "+ 12  - 4   upload.ts",
  },
];

const statusColor = {
  pass: "#F5A623",
  fail: "#E5484D",
  running: "#5B8DEF",
  pending: "#3A3F4B",
};

const mono = "'JetBrains Mono', monospace";
const display = "'Space Grotesk', sans-serif";

function GateDot({ state }) {
  const color = statusColor[state] || statusColor.pending;
  const pulsing = state === "running";
  return (
    <span className="relative flex h-2.5 w-2.5">
      {pulsing && (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className="relative inline-flex rounded-full h-2.5 w-2.5"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

function TopNav({ page, navigate, connected }) {
  return (
    <div
      className="w-full flex items-center justify-between px-6 py-4 sticky top-0 z-10"
      style={{ backgroundColor: "#0B0E14", borderBottom: "1px solid #1A1E27" }}
    >
      <button
        onClick={() => navigate("landing")}
        className="flex items-center gap-2.5"
      >
        <Terminal size={16} style={{ color: "#F5A623" }} />
        <span
          style={{ color: "#E8E6E1", fontFamily: display, fontWeight: 600 }}
          className="text-[15px]"
        >
          zero-to-prod
        </span>
      </button>
      <div className="flex items-center gap-4">
        {connected && page !== "landing" && (
          <span
            className="font-mono text-[10px] tracking-wider hidden sm:block"
            style={{ color: "#565C69" }}
          >
            yacine / cyberclear-platform
          </span>
        )}
        {connected ? (
          <span
            className="flex items-center gap-1.5 font-mono text-[11px]"
            style={{ color: "#F5A623" }}
          >
            <GateDot state="pass" /> CONNECTED
          </span>
        ) : (
          <span
            className="flex items-center gap-1.5 font-mono text-[11px]"
            style={{ color: "#565C69" }}
          >
            <Lock size={11} /> NOT CONNECTED
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- PAGE 1 ---------------------------- */
function LandingPage({ navigate, connect }) {
  return (
    <div className="flex flex-col items-center px-6 pt-24 pb-20 text-center">
      <div
        className="font-mono text-[11px] tracking-wider mb-5 px-3 py-1 rounded-full"
        style={{
          color: "#F5A623",
          border: "1px solid rgba(245,166,35,0.3)",
          backgroundColor: "rgba(245,166,35,0.06)",
        }}
      >
        BUILT FOR 24H VIBE-CODING
      </div>
      <h1
        className="text-[40px] sm:text-[52px] leading-[1.05] max-w-xl"
        style={{ color: "#E8E6E1", fontFamily: display, fontWeight: 600 }}
      >
        every prompt is a commit.
        <br />
        <span style={{ color: "#F5A623" }}>every commit meets the gate.</span>
      </h1>
      <p
        className="mt-5 max-w-md text-[14px] leading-relaxed"
        style={{ color: "#8A8F99", fontFamily: mono }}
      >
        no manual review. Semgrep, Gitleaks and Trivy vote on every AI-generated
        change before it merges.
      </p>
      <button
        onClick={() => {
          connect();
          navigate("dashboard");
        }}
        className="mt-9 flex items-center gap-2 px-5 py-3 rounded-md transition-opacity hover:opacity-90"
        style={{ backgroundColor: "#F5A623" }}
      >
        <Github size={16} style={{ color: "#0B0E14" }} />
        <span
          className="text-[13px] font-medium"
          style={{ color: "#0B0E14", fontFamily: mono }}
        >
          Connect repo &amp; enter dashboard
        </span>
        <ArrowRight size={14} style={{ color: "#0B0E14" }} />
      </button>
      <div className="mt-16 grid grid-cols-3 gap-6 max-w-lg w-full">
        {GATES.map((g) => (
          <div
            key={g.id}
            className="px-4 py-3 rounded-md"
            style={{ backgroundColor: "#0F131B", border: "1px solid #1A1E27" }}
          >
            <div
              className="font-mono text-[10px] tracking-wider"
              style={{ color: "#565C69" }}
            >
              {g.sub}
            </div>
            <div
              className="font-mono text-[13px] mt-1"
              style={{ color: "#E8E6E1" }}
            >
              {g.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- PAGE 2 ---------------------------- */
function DashboardPage({ navigate, elapsed }) {
  const passed = COMMITS.filter((c) => c.status === "pass").length;
  const failed = COMMITS.filter((c) => c.status === "fail").length;
  const running = COMMITS.filter((c) => c.status === "running").length;

  return (
    <div className="w-full max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-1">
        <span
          className="font-mono text-[11px] tracking-wider"
          style={{ color: "#565C69" }}
        >
          DASHBOARD
        </span>
        <div className="flex items-center gap-1.5">
          <Zap size={12} style={{ color: "#5B8DEF" }} />
          <span className="font-mono text-[11px]" style={{ color: "#5B8DEF" }}>
            LIVE · {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
            {String(elapsed % 60).padStart(2, "0")}
          </span>
        </div>
      </div>

      <div
        className="grid grid-cols-3 gap-px mb-6 mt-4 rounded-md overflow-hidden"
        style={{ backgroundColor: "#20242E" }}
      >
        {[
          { label: "GATE PASSED", value: passed, color: "#F5A623" },
          { label: "BLOCKED", value: failed, color: "#E5484D" },
          { label: "IN FLIGHT", value: running, color: "#5B8DEF" },
        ].map((s) => (
          <div
            key={s.label}
            className="px-4 py-3"
            style={{ backgroundColor: "#0F131B" }}
          >
            <div
              className="font-mono text-[10px] tracking-wider mb-1"
              style={{ color: "#565C69" }}
            >
              {s.label}
            </div>
            <div
              className="text-[24px] font-mono font-medium"
              style={{ color: s.color }}
            >
              {String(s.value).padStart(2, "0")}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-1 px-1">
        <GitCommit size={13} style={{ color: "#565C69" }} />
        <span
          className="font-mono text-[11px] tracking-wider"
          style={{ color: "#565C69" }}
        >
          PROMPT TRAIL
        </span>
      </div>
      <div
        className="rounded-md px-3"
        style={{ backgroundColor: "#0F131B", border: "1px solid #1A1E27" }}
      >
        {COMMITS.map((c, i) => (
          <button
            key={c.id}
            onClick={() => navigate("detail", c.id)}
            className="w-full flex items-start gap-3 py-3 text-left relative"
          >
            {i !== COMMITS.length - 1 && (
              <div
                className="absolute left-[15px] top-9 bottom-0 w-px"
                style={{ backgroundColor: "#20242E" }}
              />
            )}
            <div className="mt-1.5 shrink-0">
              <GateDot state={c.status} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span
                  className="font-mono text-[13px]"
                  style={{ color: "#6B7280" }}
                >
                  {c.id}
                </span>
                <span
                  className="text-[15px] leading-snug"
                  style={{ color: "#E8E6E1" }}
                >
                  {c.prompt}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                {GATES.map((g) => (
                  <div key={g.id} className="flex items-center gap-1.5">
                    <GateDot state={c.gates[g.id]} />
                    <span
                      className="font-mono text-[10px] tracking-wider"
                      style={{ color: "#565C69" }}
                    >
                      {g.label}
                    </span>
                  </div>
                ))}
                <span
                  className="font-mono text-[11px] ml-auto"
                  style={{ color: "#3E434F" }}
                >
                  {c.time}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- PAGE 3 ---------------------------- */
function CommitDetailPage({ navigate, commitId }) {
  const commit = COMMITS.find((c) => c.id === commitId) || COMMITS[0];

  return (
    <div className="w-full max-w-2xl mx-auto px-6 py-8">
      <button
        onClick={() => navigate("dashboard")}
        className="flex items-center gap-1.5 mb-6 font-mono text-[11px]"
        style={{ color: "#565C69" }}
      >
        <ArrowLeft size={12} /> back to dashboard
      </button>

      <div className="flex items-center gap-2.5 mb-1">
        <GateDot state={commit.status} />
        <span className="font-mono text-[13px]" style={{ color: "#6B7280" }}>
          {commit.id}
        </span>
        <span
          className="font-mono text-[10px] tracking-wider ml-auto"
          style={{ color: "#3E434F" }}
        >
          {commit.time}
        </span>
      </div>
      <h2
        className="text-[20px] mb-1"
        style={{ color: "#E8E6E1", fontFamily: display, fontWeight: 600 }}
      >
        {commit.prompt}
      </h2>
      <p className="font-mono text-[12px] mb-6" style={{ color: "#565C69" }}>
        {commit.diff}
      </p>

      <div className="grid grid-cols-1 gap-2 mb-6">
        {GATES.map((g) => {
          const state = commit.gates[g.id];
          return (
            <div
              key={g.id}
              className="flex items-center justify-between px-4 py-3 rounded-md"
              style={{
                backgroundColor: "#0F131B",
                border: "1px solid #1A1E27",
              }}
            >
              <div className="flex items-center gap-2.5">
                <GateDot state={state} />
                <span
                  className="font-mono text-[12px] tracking-wider"
                  style={{ color: "#E8E6E1" }}
                >
                  {g.label}
                </span>
                <span
                  className="font-mono text-[10px]"
                  style={{ color: "#565C69" }}
                >
                  {g.sub}
                </span>
              </div>
              <span
                className="font-mono text-[11px] uppercase"
                style={{ color: statusColor[state] }}
              >
                {state}
              </span>
            </div>
          );
        })}
      </div>

      {commit.note && (
        <div
          className="px-4 py-3 rounded-md font-mono text-[12px] leading-relaxed"
          style={{
            backgroundColor: "rgba(229,72,77,0.08)",
            borderLeft: "2px solid #E5484D",
            color: "#F0A5A8",
          }}
        >
          ✕ {commit.note}
        </div>
      )}
      {commit.status === "pass" && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-md font-mono text-[12px]"
          style={{
            backgroundColor: "rgba(245,166,35,0.08)",
            borderLeft: "2px solid #F5A623",
            color: "#F5A623",
          }}
        >
          <ShieldCheck size={14} /> merged — no findings above threshold
        </div>
      )}
    </div>
  );
}

/* ---------------------------- APP ROOT ---------------------------- */
export default function App() {
  const [page, setPage] = useState("landing");
  const [connected, setConnected] = useState(false);
  const [activeCommit, setActiveCommit] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // guard: mimics a Next.js middleware redirect for protected routes
  useEffect(() => {
    if (!connected && page !== "landing") {
      setPage("landing");
    }
  }, [connected, page]);

  function navigate(target, id) {
    if (target === "detail") setActiveCommit(id);
    setPage(target);
  }

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "#0B0E14" }}>
      <TopNav page={page} navigate={navigate} connected={connected} />
      {page === "landing" && (
        <LandingPage navigate={navigate} connect={() => setConnected(true)} />
      )}
      {page === "dashboard" && connected && (
        <DashboardPage navigate={navigate} elapsed={elapsed} />
      )}
      {page === "detail" && connected && (
        <CommitDetailPage navigate={navigate} commitId={activeCommit} />
      )}
    </div>
  );
}
