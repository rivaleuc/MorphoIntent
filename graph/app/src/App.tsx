import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Toaster, toast } from "sonner";

const CONTRACT = "0x853Df1088469bFf13e4dFbdb3637Ef40Dfd6DC09";

type Status = "active" | "weakened" | "invalidated" | "expired";
type Evaluation = {
  status: Status;
  confidence: number;
  drift: number;
  reasoning: string;
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0 },
};

const NODES = [
  { label: "Ship v2 before Q3 close", confidence: 92, drift: 8, status: "active" as Status },
  { label: "Treasury stays > 18mo runway", confidence: 74, drift: 24, status: "active" as Status },
  { label: "Partner exclusivity holds", confidence: 41, drift: 58, status: "weakened" as Status },
  { label: "Token unlock paused till audit", confidence: 18, drift: 81, status: "invalidated" as Status },
  { label: "DAO quorum remains 4%", confidence: 88, drift: 12, status: "active" as Status },
  { label: "Grant milestones on track", confidence: 63, drift: 33, status: "weakened" as Status },
];

const STEPS = [
  { n: "01", title: "Post an intent", body: "Commit a plain-language statement and a live context source the network can read." },
  { n: "02", title: "Re-evaluation", body: "Anyone triggers a re-check. Validators fetch current reality and judge whether it still holds." },
  { n: "03", title: "Drift accumulates", body: "Each pass updates confidence and adds to a drift score — the intent's meaning is tracked over time." },
];

const FEATURES = [
  { title: "Living commitments", body: "Intents are not static text — they are re-evaluated against the world as it changes." },
  { title: "Confidence as a signal", body: "A 0–100 score every other contract can read to decide whether to act." },
  { title: "Semantic drift meter", body: "Quantifies how far an intent has wandered from its original meaning." },
  { title: "Validator consensus", body: "Independent validators must agree on each verdict before it is recorded." },
  { title: "On-chain history", body: "The last evaluations are kept so you can watch confidence decay or recover." },
  { title: "Composable status", body: "External contracts query validity and react automatically to drifted intents." },
];

function statusColor(s: Status) {
  switch (s) {
    case "active": return "#3ee9d1";
    case "weakened": return "#c084fc";
    case "invalidated": return "#fb6aa6";
    case "expired": return "#6b7280";
  }
}

function Meter({ value, label, hue }: { value: number; label: string; hue: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-white/45">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${value}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: hue }}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [statement, setStatement] = useState("");
  const [contextUrl, setContextUrl] = useState("");
  const [parties, setParties] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Evaluation | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!statement.trim()) {
      toast.error("An intent statement is required.");
      return;
    }
    setLoading(true);
    setResult(null);
    toast("Broadcasting to validators…", { description: "Fetching live context and re-evaluating." });

    setTimeout(() => {
      const weak = /no longer|stopped|cancel|expired|fail|broke/i.test(statement);
      const evaluation: Evaluation = weak
        ? {
            status: "weakened",
            confidence: 46,
            drift: 54,
            reasoning:
              "Current context partially contradicts the original commitment. Conditions have shifted enough to register meaningful semantic drift.",
          }
        : {
            status: "active",
            confidence: 89,
            drift: 11,
            reasoning:
              "Live context still supports the commitment. Wording and intent remain aligned with present-day conditions; drift is minimal.",
          };
      setResult(evaluation);
      setLoading(false);
      toast[evaluation.status === "active" ? "success" : "warning"](
        `Intent ${evaluation.status}`,
        { description: `Confidence ${evaluation.confidence}% · drift ${evaluation.drift}%` }
      );
    }, 3000);
  }

  return (
    <div
      className="min-h-screen bg-[#060608] text-white/90 antialiased"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <Toaster position="top-center" theme="dark" />

      {/* ambient glow */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-40 top-10 h-[28rem] w-[28rem] rounded-full bg-cyan-500/15 blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-[30rem] w-[30rem] rounded-full bg-fuchsia-500/15 blur-[130px]" />
        <div className="absolute bottom-0 left-1/3 h-[24rem] w-[24rem] rounded-full bg-violet-600/10 blur-[120px]" />
      </div>

      <div className="relative z-10">
        {/* Navbar */}
        <header className="sticky top-0 z-40 border-b border-white/8 bg-[#060608]/70 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <a href="#top" className="flex items-center gap-3">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-fuchsia-500">
                <span className="absolute inset-0.5 rounded-md bg-[#060608]" />
                <span className="relative h-2 w-2 rounded-full bg-gradient-to-br from-cyan-300 to-fuchsia-400 shadow-[0_0_12px_2px_rgba(94,234,212,0.6)]" />
              </span>
              <span className="text-lg tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Morpho<span className="bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-transparent">Intent</span>
              </span>
            </a>
            <div className="hidden items-center gap-8 text-sm text-white/55 md:flex">
              <a href="#graph" className="hover:text-white">Graph</a>
              <a href="#how" className="hover:text-white">How it works</a>
              <a href="#features" className="hover:text-white">Features</a>
              <a href="#demo" className="rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 py-2 font-medium text-[#060608] transition hover:opacity-90">
                Post an intent
              </a>
            </div>
          </nav>
        </header>

        {/* Hero */}
        <section id="top" className="mx-auto max-w-6xl px-6 py-28 text-center md:py-36">
          <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ duration: 0.7 }}>
            <p className="mb-6 inline-block rounded-full border border-white/10 px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-white/50">
              The living intent graph
            </p>
            <h1 className="mx-auto max-w-4xl text-5xl leading-[1.05] md:text-7xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Commitments that{" "}
              <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-400 bg-clip-text text-transparent">
                stay alive
              </span>
              .
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-white/60">
              MorphoIntent re-evaluates plain-language commitments over time, tracking confidence and the semantic drift of meaning as the world changes around them.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <a href="#demo" className="rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-7 py-3 text-sm font-medium text-[#060608] shadow-[0_0_30px_-5px_rgba(94,234,212,0.5)] transition hover:opacity-90">
                Post an intent
              </a>
              <a href="#graph" className="rounded-full border border-white/15 px-7 py-3 text-sm text-white/80 transition hover:bg-white/5">
                Explore the graph
              </a>
            </div>
          </motion.div>
        </section>

        {/* Intent graph nodes */}
        <section id="graph" className="mx-auto max-w-6xl px-6 py-20">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.6 }}>
            <h2 className="text-3xl md:text-4xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Active intent nodes</h2>
            <p className="mt-3 max-w-xl text-white/55">Each node is a live commitment, glowing by status, with its current confidence and accumulated drift.</p>
          </motion.div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {NODES.map((node, i) => {
              const c = statusColor(node.status);
              return (
                <motion.div
                  key={node.label}
                  initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.5, delay: i * 0.07 }}
                  whileHover={{ y: -4 }}
                  className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: c, boxShadow: `0 0 12px 2px ${c}` }}
                    />
                    <span className="text-xs uppercase tracking-widest" style={{ color: c }}>{node.status}</span>
                  </div>
                  <p className="mb-5 text-base leading-snug text-white/90" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {node.label}
                  </p>
                  <div className="space-y-3">
                    <Meter value={node.confidence} label="Confidence" hue="linear-gradient(90deg,#3ee9d1,#7dd3fc)" />
                    <Meter value={node.drift} label="Semantic drift" hue="linear-gradient(90deg,#c084fc,#fb6aa6)" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl px-6 py-24">
          <motion.h2
            initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.6 }}
            className="text-3xl md:text-4xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            How drift is tracked
          </motion.h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.5, delay: i * 0.1 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-7"
              >
                <div className="bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-4xl text-transparent" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{s.n}</div>
                <h3 className="mt-3 text-xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-6 py-24">
          <motion.h2
            initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.6 }}
            className="text-3xl md:text-4xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            A protocol for meaning over time
          </motion.h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.45, delay: i * 0.05 }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-7"
              >
                <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-gradient-to-br from-cyan-500/0 to-fuchsia-500/0 blur-2xl transition group-hover:from-cyan-500/20 group-hover:to-fuchsia-500/20" />
                <h3 className="text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Demo */}
        <section id="demo" className="mx-auto max-w-3xl px-6 py-24">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.6 }} className="text-center">
            <h2 className="text-3xl md:text-4xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Post & re-evaluate an intent</h2>
            <p className="mt-3 text-white/55">Submit a commitment; the network returns status, confidence and drift.</p>
          </motion.div>

          <motion.form
            onSubmit={onSubmit}
            initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-10 space-y-5 rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur"
          >
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.2em] text-white/45">Intent statement</label>
              <textarea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                rows={3}
                placeholder="We commit to keeping protocol fees below 0.3% through 2026."
                className="w-full resize-none rounded-xl border border-white/10 bg-[#0b0b0f] px-4 py-3 text-sm text-white/90 outline-none transition focus:border-cyan-400/60"
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-[0.2em] text-white/45">Context source</label>
                <input
                  value={contextUrl}
                  onChange={(e) => setContextUrl(e.target.value)}
                  placeholder="https://docs.example/governance"
                  className="w-full rounded-xl border border-white/10 bg-[#0b0b0f] px-4 py-3 text-sm text-white/90 outline-none transition focus:border-fuchsia-400/60"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-[0.2em] text-white/45">Parties</label>
                <input
                  value={parties}
                  onChange={(e) => setParties(e.target.value)}
                  placeholder="core-team, treasury.eth"
                  className="w-full rounded-xl border border-white/10 bg-[#0b0b0f] px-4 py-3 text-sm text-white/90 outline-none transition focus:border-fuchsia-400/60"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-6 py-3.5 text-sm font-medium text-[#060608] shadow-[0_0_30px_-5px_rgba(94,234,212,0.5)] transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Re-evaluating…" : "Submit to the graph"}
            </button>

            {loading && (
              <div className="flex items-center justify-center gap-2 pt-2 text-sm text-white/50">
                <span className="h-2 w-2 animate-ping rounded-full bg-cyan-400" />
                Fetching live context · validators reaching consensus…
              </div>
            )}

            {result && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mt-2 rounded-2xl border border-white/10 bg-[#0b0b0f] p-6"
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif", color: statusColor(result.status) }}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColor(result.status), boxShadow: `0 0 12px 2px ${statusColor(result.status)}` }} />
                    Intent {result.status}
                  </span>
                </div>
                <div className="space-y-4">
                  <Meter value={result.confidence} label="Confidence" hue="linear-gradient(90deg,#3ee9d1,#7dd3fc)" />
                  <Meter value={result.drift} label="Semantic drift" hue="linear-gradient(90deg,#c084fc,#fb6aa6)" />
                </div>
                <p className="mt-5 text-sm leading-relaxed text-white/70">{result.reasoning}</p>
              </motion.div>
            )}
          </motion.form>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Morpho<span className="bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-transparent">Intent</span>
              </p>
              <p className="mt-1 text-sm text-white/45">A living graph of commitments, re-evaluated over time.</p>
            </div>
            <div className="text-sm text-white/50">
              <p className="uppercase tracking-[0.2em] text-white/35">Contract</p>
              <p className="mt-1 break-all font-mono text-xs text-white/70">{CONTRACT}</p>
            </div>
          </div>
          <div className="border-t border-white/8 py-5 text-center text-xs text-white/35">
            © {new Date().getFullYear()} MorphoIntent. Meaning, tracked on-chain.
          </div>
        </footer>
      </div>
    </div>
  );
}
