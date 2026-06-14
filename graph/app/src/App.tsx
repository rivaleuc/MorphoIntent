import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { read, write, CONTRACT, connectWallet, isWalletConnected } from './genlayer'

type Intent = {
  id: number
  key: string
  label: string
  statement: string
  status: string
  confidence: number
  drift: number
  evaluations: number
  reasoning: string
  // canvas position in percent
  x: number
  y: number
  links: number[]
}

function confColor(c: number) {
  if (c >= 85) return '#22d3ee'
  if (c >= 70) return '#7c5cff'
  return '#ec4899'
}

// Normalise a 0-1 or 0-100 value into a 0-100 integer.
function pct(v: any) {
  let n = Number(v ?? 0)
  if (!Number.isFinite(n)) n = 0
  if (n > 0 && n <= 1) n *= 100
  return Math.round(n)
}

function deriveLabel(statement: string, status: string) {
  const w = (statement || '').trim().split(/\s+/).slice(0, 3).join(' ')
  return w || status || 'intent'
}

function intentFrom(i: number, total: number, raw: any): Intent {
  const statement = String(raw?.statement ?? '')
  const angle = (2 * Math.PI * i) / Math.max(total, 1)
  const radius = total <= 1 ? 0 : 28
  return {
    id: i,
    key: String(i),
    label: deriveLabel(statement, String(raw?.status ?? '')),
    statement,
    status: String(raw?.status ?? 'active'),
    confidence: pct(raw?.confidence),
    drift: pct(raw?.drift_score),
    evaluations: Number(raw?.evaluations ?? 0),
    reasoning: String(raw?.last_reasoning ?? ''),
    x: 50 + radius * Math.cos(angle),
    y: 50 + radius * Math.sin(angle),
    links: i > 0 ? [i - 1] : [],
  }
}

function App() {
  const [intents, setIntents] = useState<Intent[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [composing, setComposing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [reevaluatingId, setReevaluatingId] = useState<number | null>(null)
  const [statement, setStatement] = useState('')
  const [contextUrl, setContextUrl] = useState('')
  const [parties, setParties] = useState('')
  const [wallet, setWallet] = useState<string | null>(null)

  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

  async function handleConnect() {
    try {
      const addr = await connectWallet()
      setWallet(addr)
      toast.success(`Wallet connected · ${shortAddr(addr)}`)
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to connect wallet')
    }
  }

  const active = intents.find((i) => i.id === activeId) ?? null

  // build unique edges
  const edges: { a: Intent; b: Intent }[] = []
  intents.forEach((i) =>
    i.links.forEach((lid) => {
      const other = intents.find((n) => n.id === lid)
      if (other && i.id > lid) edges.push({ a: i, b: other })
    }),
  )

  async function loadIntents() {
    setLoading(true)
    try {
      const stats = (await read('stats')) as any
      const total = Number(stats?.total_intents ?? 0)
      const loaded: Intent[] = []
      for (let i = 0; i < total; i++) {
        try {
          const raw = (await read('get_intent', [String(i)])) as any
          if (raw) loaded.push(intentFrom(i, total, raw))
        } catch {
          // skip
        }
      }
      setIntents(loaded)
    } catch (e: any) {
      toast.error(`Failed to load intents: ${e?.message ?? e}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadIntents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function reevaluate(id: number) {
    const node = intents.find((i) => i.id === id)
    if (!node) return
    setReevaluatingId(id)
    const tid = toast.loading('🜂 Re-evaluating intent against latest on-chain state… (30–60s)')
    try {
      await write('reevaluate', [node.key])
      const raw = (await read('get_intent', [node.key])) as any
      setIntents((list) =>
        list.map((i) =>
          i.id === id
            ? {
                ...i,
                confidence: pct(raw?.confidence),
                drift: pct(raw?.drift_score),
                status: String(raw?.status ?? i.status),
                evaluations: Number(raw?.evaluations ?? i.evaluations),
                reasoning: String(raw?.last_reasoning ?? i.reasoning),
              }
            : i,
        ),
      )
      toast.success('Intent re-evaluated — confidence and drift updated.', { id: tid })
    } catch (e: any) {
      toast.error(`Re-evaluation failed: ${e?.message ?? e}`, { id: tid })
    } finally {
      setReevaluatingId(null)
    }
  }

  async function postIntent() {
    if (!statement.trim()) {
      toast.error('State the intent in full.')
      return
    }
    setPosting(true)
    const tid = toast.loading('Posting intent on-chain… (30–60s)')
    try {
      await write('post_intent', [statement.trim(), contextUrl.trim(), parties.trim()])
      const stats = (await read('stats')) as any
      toast.success(`Intent posted — ${Number(stats?.total_intents ?? 0)} in the graph.`, { id: tid })
      setStatement('')
      setContextUrl('')
      setParties('')
      setComposing(false)
      await loadIntents()
    } catch (e: any) {
      toast.error(`Post failed: ${e?.message ?? e}`, { id: tid })
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#060608] text-slate-100 antialiased">
      <Toaster theme="dark" position="top-center" richColors />

      {/* iridescent ambient glows */}
      <div className="pointer-events-none absolute -left-40 top-1/4 h-[460px] w-[460px] rounded-full bg-cyan-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[460px] w-[460px] rounded-full bg-fuchsia-500/10 blur-[130px]" />

      {/* floating title */}
      <div className="pointer-events-none absolute left-6 top-6 z-20">
        <h1 className="bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-lg font-black tracking-tight text-transparent">
          MorphoIntent
        </h1>
        <p className="text-[10px] uppercase tracking-[0.3em] text-white/30">intent graph · live</p>
      </div>
      <div className="pointer-events-none absolute right-6 top-6 z-20 flex flex-col items-end gap-2 text-right">
        <button
          onClick={handleConnect}
          className="pointer-events-auto rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 py-1.5 text-sm font-bold text-[#060608] shadow-lg shadow-fuchsia-500/30 transition hover:opacity-90"
        >
          {wallet ? shortAddr(wallet) : isWalletConnected() ? 'Connected' : 'Connect Wallet'}
        </button>
        <p className="font-mono text-[10px] text-white/25">{CONTRACT.slice(0, 12)}…{CONTRACT.slice(-6)}</p>
        <p className="text-[10px] text-white/30">{loading ? 'loading…' : `${intents.length} active intents`}</p>
      </div>

      {/* CANVAS */}
      <div className="absolute inset-0">
        {/* edges */}
        <svg className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {edges.map((e, i) => {
            const lit = active && (active.id === e.a.id || active.id === e.b.id)
            return (
              <line
                key={i}
                x1={`${e.a.x}%`}
                y1={`${e.a.y}%`}
                x2={`${e.b.x}%`}
                y2={`${e.b.y}%`}
                stroke="url(#edge)"
                strokeWidth={lit ? 1.8 : 0.8}
                strokeOpacity={lit ? 0.9 : 0.25}
              />
            )
          })}
        </svg>

        {/* nodes */}
        {intents.map((node) => {
          const color = confColor(node.confidence)
          const isActive = node.id === activeId
          return (
            <motion.button
              key={node.id}
              onClick={() => setActiveId(node.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={{ scale: 1.12 }}
            >
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: color }}
                animate={{ opacity: [0.18, 0.4, 0.18], scale: [1, 1.5, 1] }}
                transition={{ duration: 3 + node.id * 0.3, repeat: Infinity, ease: 'easeInOut' }}
              />
              <span
                className="relative flex h-16 w-16 flex-col items-center justify-center rounded-full border text-center"
                style={{
                  borderColor: color,
                  background: `radial-gradient(circle at 50% 35%, ${color}33, #060608 75%)`,
                  boxShadow: isActive ? `0 0 28px ${color}` : `0 0 12px ${color}66`,
                }}
              >
                <span className="text-[10px] font-bold leading-none text-white">{node.confidence}%</span>
              </span>
              <span className="mt-1.5 block w-24 -translate-x-[18px] text-center text-[10px] font-medium text-white/55">
                {node.label}
              </span>
            </motion.button>
          )
        })}

        {!loading && intents.length === 0 && (
          <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-white/30">
            No intents yet — post the first one with +
          </p>
        )}
        {loading && (
          <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-white/30">
            Loading intent graph from chain…
          </p>
        )}
      </div>

      {/* FLOATING + BUTTON */}
      <button
        onClick={() => setComposing(true)}
        className="absolute bottom-8 right-8 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-2xl font-light text-[#060608] shadow-lg shadow-fuchsia-500/30 transition hover:scale-110"
        aria-label="Post new intent"
      >
        +
      </button>

      {/* hint */}
      {!active && !loading && intents.length > 0 && (
        <p className="pointer-events-none absolute bottom-10 left-1/2 z-10 -translate-x-1/2 text-xs text-white/30">
          click a glowing node to inspect its intent
        </p>
      )}

      {/* RIGHT DRAWER — intent detail */}
      <AnimatePresence>
        {active && (
          <motion.aside
            key={active.id}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="absolute right-0 top-0 z-40 flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-[#0a0a0f]/95 p-7 backdrop-blur-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <span
                  className="text-[10px] uppercase tracking-[0.3em]"
                  style={{ color: confColor(active.confidence) }}
                >
                  intent · {active.status}
                </span>
                <h2 className="mt-2 text-xl font-bold leading-snug text-white">{active.statement}</h2>
              </div>
              <button
                onClick={() => setActiveId(null)}
                className="ml-3 shrink-0 text-white/40 transition hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* confidence */}
            <div className="mt-8">
              <div className="flex justify-between text-xs text-white/50">
                <span>confidence</span>
                <span style={{ color: confColor(active.confidence) }}>{active.confidence}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: confColor(active.confidence) }}
                  animate={{ width: `${active.confidence}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
            </div>

            {/* drift meter */}
            <div className="mt-6">
              <div className="flex justify-between text-xs text-white/50">
                <span>drift from origin</span>
                <span className="text-fuchsia-300">{active.drift}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-500"
                  animate={{ width: `${active.drift}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-white/35">
                Drift measures how far the validators&apos; current interpretation has moved from the original
                statement.
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/50">
              <div className="mb-2 flex justify-between">
                <span>evaluations</span>
                <span className="text-cyan-300">{active.evaluations}</span>
              </div>
              <p className="leading-relaxed">
                {active.reasoning || 'No reasoning recorded yet — re-evaluate to query the validators.'}
              </p>
            </div>

            <button
              onClick={() => reevaluate(active.id)}
              disabled={reevaluatingId === active.id}
              className="mt-auto w-full rounded-xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 py-3 font-bold text-[#060608] transition hover:opacity-90 disabled:opacity-50"
            >
              {reevaluatingId === active.id ? '⟳ Re-evaluating…' : '⟳ Re-evaluate intent'}
            </button>
            <p className="mt-3 break-all font-mono text-[10px] text-white/20">{CONTRACT}</p>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* COMPOSE NEW INTENT MODAL */}
      <AnimatePresence>
        {composing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !posting && setComposing(false)}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0f] p-7"
            >
              <h3 className="bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-xl font-bold text-transparent">
                Post a new intent
              </h3>
              <p className="mt-1 text-sm text-white/45">
                It joins the graph as a glowing node, evaluated by the validator network.
              </p>
              <textarea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder="State the intent in full…"
                rows={3}
                className="mt-4 w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-cyan-400/50"
              />
              <input
                value={contextUrl}
                onChange={(e) => setContextUrl(e.target.value)}
                placeholder="Context URL (evidence / source)"
                className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-fuchsia-400/50"
              />
              <input
                value={parties}
                onChange={(e) => setParties(e.target.value)}
                placeholder="Parties (e.g. DAO, counterparty)"
                className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-fuchsia-400/50"
              />
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setComposing(false)}
                  disabled={posting}
                  className="flex-1 rounded-lg border border-white/15 py-2.5 text-sm text-white/60 transition hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={postIntent}
                  disabled={posting}
                  className="flex-1 rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500 py-2.5 text-sm font-bold text-[#060608] transition hover:opacity-90 disabled:opacity-50"
                >
                  {posting ? 'Posting…' : 'Add to graph'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
