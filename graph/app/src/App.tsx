import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster, toast } from 'sonner'

const CONTRACT = '0x853Df1088469bFf13e4dFbdb3637Ef40Dfd6DC09'

type Intent = {
  id: number
  label: string
  statement: string
  confidence: number
  drift: number
  // canvas position in percent
  x: number
  y: number
  links: number[]
}

const SEED: Intent[] = [
  { id: 1, label: 'Treasury safety', statement: 'The protocol treasury should never hold more than 40% in a single volatile asset.', confidence: 88, drift: 12, x: 26, y: 30, links: [2, 3] },
  { id: 2, label: 'Fee fairness', statement: 'Transaction fees must scale sub-linearly with position size to protect small users.', confidence: 71, drift: 34, x: 58, y: 22, links: [1, 4] },
  { id: 3, label: 'Validator honesty', statement: 'Validators that equivocate forfeit their entire stake, no grace period.', confidence: 94, drift: 6, x: 22, y: 64, links: [1, 5] },
  { id: 4, label: 'Open liquidity', statement: 'Any vault should be permissionlessly composable without a whitelist.', confidence: 63, drift: 41, x: 72, y: 55, links: [2, 5] },
  { id: 5, label: 'Slow governance', statement: 'Parameter changes require a 7-day timelock and two independent quorums.', confidence: 79, drift: 23, x: 48, y: 78, links: [3, 4] },
]

function confColor(c: number) {
  if (c >= 85) return '#22d3ee'
  if (c >= 70) return '#7c5cff'
  return '#ec4899'
}

function App() {
  const [intents, setIntents] = useState<Intent[]>(SEED)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [label, setLabel] = useState('')

  const active = intents.find((i) => i.id === activeId) ?? null

  // build unique edges
  const edges: { a: Intent; b: Intent }[] = []
  intents.forEach((i) =>
    i.links.forEach((lid) => {
      if (i.id < lid) {
        const other = intents.find((n) => n.id === lid)
        if (other) edges.push({ a: i, b: other })
      }
    }),
  )

  function reevaluate(id: number) {
    toast('🜂 Re-evaluating intent against latest on-chain state…')
    setTimeout(() => {
      setIntents((list) =>
        list.map((i) => {
          if (i.id !== id) return i
          const confidence = Math.max(35, Math.min(99, i.confidence + Math.floor(Math.random() * 30 - 15)))
          const drift = Math.max(2, Math.min(80, 100 - confidence + Math.floor(Math.random() * 16 - 8)))
          return { ...i, confidence, drift }
        }),
      )
      toast.success('Intent re-evaluated — confidence and drift updated.')
    }, 1800)
  }

  function postIntent() {
    if (!draft.trim() || !label.trim()) {
      toast.error('Give the intent a label and a statement.')
      return
    }
    const id = Date.now()
    const newNode: Intent = {
      id,
      label: label.trim(),
      statement: draft.trim(),
      confidence: 50 + Math.floor(Math.random() * 20),
      drift: 30 + Math.floor(Math.random() * 30),
      x: 30 + Math.random() * 40,
      y: 30 + Math.random() * 40,
      links: intents.length ? [intents[Math.floor(Math.random() * intents.length)].id] : [],
    }
    setIntents((l) => [...l, newNode])
    setDraft('')
    setLabel('')
    setComposing(false)
    toast.success('Intent posted to the graph.')
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
      <div className="pointer-events-none absolute right-6 top-6 z-20 text-right">
        <p className="font-mono text-[10px] text-white/25">{CONTRACT.slice(0, 12)}…{CONTRACT.slice(-6)}</p>
        <p className="text-[10px] text-white/30">{intents.length} active intents</p>
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
      {!active && (
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
                  intent · {active.label}
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
              Linked to{' '}
              <span className="text-cyan-300">
                {active.links
                  .map((l) => intents.find((n) => n.id === l)?.label)
                  .filter(Boolean)
                  .join(', ') || 'no other intents'}
              </span>
            </div>

            <button
              onClick={() => reevaluate(active.id)}
              className="mt-auto w-full rounded-xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 py-3 font-bold text-[#060608] transition hover:opacity-90"
            >
              ⟳ Re-evaluate intent
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
            onClick={() => setComposing(false)}
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
                It joins the graph as a glowing node, linked into the existing intent network.
              </p>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Short label (e.g. Fee fairness)"
                className="mt-4 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-cyan-400/50"
              />
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="State the intent in full…"
                rows={3}
                className="mt-3 w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-fuchsia-400/50"
              />
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setComposing(false)}
                  className="flex-1 rounded-lg border border-white/15 py-2.5 text-sm text-white/60 transition hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={postIntent}
                  className="flex-1 rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500 py-2.5 text-sm font-bold text-[#060608] transition hover:opacity-90"
                >
                  Add to graph
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
