# MorphoIntent

**A public, multi-party Living Intent Graph — any plain-language commitment is posted as a node, re-evaluated on a cadence, and tracked with a numeric 0–100 confidence, a cumulative semantic-drift score, and an explicit status lifecycle (active → weakened → invalidated).**

MorphoIntent is not an escrow, a covenant, or a single locked agreement. It is an **open graph of many intents** posted by many parties. Anyone writes a commitment in natural language ("we will keep the bridge fee under 0.1%", "this DAO funds open-source until 2026"), it becomes a glowing node in a shared graph, and anyone can ask — on demand — *does this still hold today?* Each re-evaluation fetches live context, validators judge current validity and emit a numeric confidence, the contract **derives the status band deterministically from that confidence**, and it accumulates how far the intent has drifted from where it started. An intent isn't a static record — it morphs, weakens, and is invalidated as the world changes.

What makes it distinct:

- **A graph, not a single agreement.** Many independent intents from many authors coexist as nodes; the value is the public, queryable web of living commitments.
- **Numeric confidence drives everything.** Validators return an integer `0–100`; the status band is a pure function of that number (`>=67` active, `34–66` weakened, `<34` invalidated) — no free-form text decides state.
- **Cumulative semantic-drift score.** Every re-evaluation adds `abs(Δconfidence)` to a running drift total, surfacing how far interpretation has wandered from the original statement over its whole history.
- **Explicit lifecycle.** `active → weakened → invalidated`, with `expired` reserved for an author's explicit end-of-life flag.

- **Contract (Bradbury, chain 4221):** `0x8E6F45f0C5268be86A95cd01821080636D794d33`
- **Explorer:** https://explorer-bradbury.genlayer.com/contract/0x8E6F45f0C5268be86A95cd01821080636D794d33
- **Live app:** https://morphointent.pages.dev

## What it does

1. **`post_intent(statement, context_url, parties)`** — a `@gl.public.write` method. Stores a JSON record (author, statement, context URL, parties, `status="active"`, `confidence=100`, `drift_score=0`, `evaluations=0`, `expired=false`, `history=[]`) in the `intents` `TreeMap[str, str]` keyed by `intent_count`. Rejects empty or >2000-char statements.
2. **`expire_intent(intent_key)`** — a `@gl.public.write` method; only the author can set the explicit expiry flag, moving the intent to `status="expired"` and stopping further re-evaluation.
3. **`reevaluate(intent_key)`** — a `@gl.public.write` method anyone can trigger. It runs a fresh evaluation, computes `drift_delta = abs(new_confidence - prev_confidence)`, accumulates `drift_score` (capped at 100), and updates `status`/`confidence`/`last_reasoning` from the new verdict, appending to a rolling 5-entry `history`. Bumps the global `total_evaluations`. The **status is never taken from free-form LLM text** — it is the deterministic band of the numeric confidence.
4. The private `_evaluate(intent)` builds the non-deterministic block:
   - **Validators crawl live context.** `leader_fn` tries `gl.nondet.web.get(context_url)` (decoding 4000 bytes) and falls back to `gl.nondet.web.render(context_url, mode="text")` — so judgment is grounded in the world *as it is now*.
   - **An LLM acts as evaluator.** `gl.nondet.exec_prompt(prompt, response_format="json")` gets the statement, the previous confidence, and the live context, and must reply `{"confidence": <int 0-100>, "reasoning": "..."}`. The **leader derives the status band** from that confidence (`derive_status`), so honest leaders always satisfy the invariant.
   - **Consensus via `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`.** `validator_fn` enforces a deterministic cross-field invariant: `confidence` is an `int` in `[0,100]` (a `bool` is rejected via `isinstance(x, bool)`), `status` is in the enum, **`status` matches the confidence band** (`expired` accepted only when `confidence < 34`), and `reasoning` is a non-empty string. Validators agree the verdict is internally consistent — never byte-identical text.
4. **Reads** are free `@gl.public.view` calls: `get_intent(key)` (full record + history), `read_status(key)` → `{valid, status, confidence, drift_score}` so external contracts can act on intent validity (`valid` is true while status is `active` or `weakened`), and `stats()` → `{total_intents, total_evaluations}`.

State lives in the `intents` `TreeMap`; `intent_count` and `total_evaluations` are `u256`; the module constant `DRIFT_THRESHOLD = 30`.

## Why GenLayer

A deterministic EVM cannot decide whether a plain-language commitment "still holds today." That requires reading current, unstructured context from the open web (non-deterministic) and interpreting meaning against a prior promise (judgment). There is no hash for "the conditions of this intent are still met."

GenLayer's **Optimistic Democracy** lets validators each fetch live context, reason about validity, and *vote* on whether the leader's evaluation is acceptable. The contract owns the drift math and the lifecycle state machine; validators supply the worldly judgment that drives it.

Use MorphoIntent when a commitment's meaning must be continuously re-checked against a changing world. Use a backend job when validity is a structured condition you can compute directly (a date passed, a balance threshold) — that does not need a validator network.

## Architecture

| GenLayer contract | Frontend dir | EVM / off-chain |
| --- | --- | --- |
| `graph/morpho_intent.py` | `graph/app/` (React + Vite) | `graph/IntentBond.sol` (optional example consumer that reads `read_status` for one node) |

The graph is the product; `IntentBond.sol` is just one possible external consumer that reads a single node's status. The contract itself holds an open, multi-author set of intents and is not tied to any one bond or escrow.

## Tech

- **GenVM Python**, pinned to `py-genlayer:1jb45aa8…jpz09h6` via the `# { "Depends": ... }` header. Typed storage: `TreeMap[str, str]` plus `u256` counters.
- **`genlayer-js`** handles all reads (`client.readContract`) against `testnetBradbury`. Writes use **MetaMask with no Snap** — the app drives `window.ethereum`, ensures **chain 4221** (`0x107d`, auto-adding the Bradbury network), submits via `client.writeContract`, and waits for `FINALIZED`.
- **App-specific UI:** a React 19 + Vite intent graph (Tailwind v4, `framer-motion`, `sonner`) — post an intent, trigger re-evaluation, and visualize confidence, drift score, status, and the rolling evaluation history.

## Project structure

```
MorphoIntent/
├── graph/
│   ├── morpho_intent.py          ← GenLayer contract (living intent graph)
│   ├── IntentBond.sol            ← EVM bond contract
│   ├── index.html                ← static preview
│   └── app/                      ← frontend (Cloudflare Pages root)
│       ├── src/
│       │   ├── App.tsx           ← intent graph + drift/confidence UI
│       │   ├── genlayer.ts       ← client, wallet, read/write helpers
│       │   ├── main.tsx
│       │   └── index.css
│       ├── public/
│       ├── index.html
│       ├── package.json
│       └── vite.config.ts
└── README.md
```

## Develop

```bash
cd graph/app
npm install
npm run dev      # local dev server (Vite)
npm run build    # type-check + production build to dist/
```

## Deploy the frontend

Cloudflare Pages:

- **Root directory:** `graph/app`
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variable:** `NODE_VERSION=20`

## Why GenLayer (engineering notes)

Real gotchas learned building this:

- **Integers, not floats.** `confidence` and `drift_score` are integers in `[0, 100]`, and `validator_fn` rejects a non-int (or `bool`) confidence. Drift math (`abs`, `min(100, …)`) stays in integer space so validators agree exactly.
- **Status is derived, never parsed from prose.** The leader computes the status band from the numeric confidence (`derive_status`) and `validator_fn` re-checks that `status` matches the band. The `reasoning` text is never compared — comparing free-form LLM text across validators would hang consensus.
- **Drift is a separate signal from status.** The cumulative `drift_score` records how much interpretation has moved over the intent's life; it is surfaced to consumers but does not itself flip the lifecycle state — the confidence band does.
- **ACCEPTED ≠ executed.** Consensus means validators accepted the evaluation, not that any bond settled. `IntentBond.sol` must read `read_status` and act as a separate step.
- **Optimistic finality has an appeal window.** Each re-evaluation is provisional until the appeal window elapses; the frontend waits for `FINALIZED` before treating a new status as authoritative.
- **Evidence is untrusted (greybox).** Live context comes from a user-supplied URL with a `get`→`render` fallback; the prompt treats fetched context as adversarial input, and fetch failures degrade to `(context fetch failed)` rather than crashing the re-evaluation.

## License

MIT
