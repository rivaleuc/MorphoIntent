# MorphoIntent

**A living intent graph — plain-language commitments that validators re-evaluate against the real world over time, tracking confidence and semantic drift.**

MorphoIntent stores commitments written in natural language ("we will keep the bridge fee under 0.1%", "this DAO funds open-source until 2026") and keeps asking, on demand, *does this still hold today?* Each re-evaluation fetches live context, an LLM judges current validity, and the contract tracks how far the intent's confidence has drifted from where it started. An intent isn't a static record — it morphs, weakens, drifts, or expires as the world changes.

- **Contract (Bradbury, chain 4221):** `0x853Df1088469bFf13e4dFbdb3637Ef40Dfd6DC09`
- **Explorer:** https://explorer-bradbury.genlayer.com/contract/0x853Df1088469bFf13e4dFbdb3637Ef40Dfd6DC09
- **Live app:** https://morphointent.pages.dev

## What it does

1. **`post_intent(statement, context_url, parties)`** — a `@gl.public.write` method. Stores a JSON record (author, statement, context URL, parties, `status="active"`, `confidence=100`, `drift_score=0`, `evaluations=0`, `history=[]`) in the `intents` `TreeMap[str, str]` keyed by `intent_count`. Rejects empty or >2000-char statements.
2. **`reevaluate(intent_key)`** — a `@gl.public.write` method anyone can trigger. It runs a fresh evaluation, computes `drift_delta = abs(new_confidence - prev_confidence)`, accumulates `drift_score` (capped at 100), updates `status`/`confidence`/`last_reasoning`, appends to a rolling 5-entry `history`, and flips status to `"drifted"` once `drift_score >= DRIFT_THRESHOLD` (30). Bumps the global `total_evaluations`.
3. The private `_evaluate(intent)` builds the non-deterministic block:
   - **Validators crawl live context.** `leader_fn` tries `gl.nondet.web.get(context_url)` (decoding 4000 bytes) and falls back to `gl.nondet.web.render(context_url, mode="text")` — so judgment is grounded in the world *as it is now*.
   - **An LLM acts as evaluator.** `gl.nondet.exec_prompt(prompt, response_format="json")` gets the statement, the previous confidence, and the live context, and must reply `{"status": "active"/"weakened"/"invalidated"/"expired", "confidence": <0-100>, "reasoning": "..."}`.
   - **Consensus via `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`.** `validator_fn` requires a `gl.vm.Return`, `status` in the allowed set, an `int` `confidence` in `[0, 100]`, and a string `reasoning` — validators agree the verdict is well-formed, not byte-identical.
4. **Reads** are free `@gl.public.view` calls: `get_intent(key)` (full record + history), `read_status(key)` → `{valid, status, confidence, drift_score}` so external contracts can act on intent validity (`valid` is true while status is `active` or `weakened`), and `stats()` → `{total_intents, total_evaluations}`.

State lives in the `intents` `TreeMap`; `intent_count` and `total_evaluations` are `u256`; the module constant `DRIFT_THRESHOLD = 30`.

## Why GenLayer

A deterministic EVM cannot decide whether a plain-language commitment "still holds today." That requires reading current, unstructured context from the open web (non-deterministic) and interpreting meaning against a prior promise (judgment). There is no hash for "the conditions of this intent are still met."

GenLayer's **Optimistic Democracy** lets validators each fetch live context, reason about validity, and *vote* on whether the leader's evaluation is acceptable. The contract owns the drift math and the lifecycle state machine; validators supply the worldly judgment that drives it.

Use MorphoIntent when a commitment's meaning must be continuously re-checked against a changing world. Use a backend job when validity is a structured condition you can compute directly (a date passed, a balance threshold) — that does not need a validator network.

## Architecture

| GenLayer contract | Frontend dir | EVM / off-chain |
| --- | --- | --- |
| `graph/morpho_intent.py` | `graph/app/` (React + Vite) | `graph/IntentBond.sol` (bond that settles on intent status) |

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

- **Integers, not floats.** `confidence`, `drift_score`, and `DRIFT_THRESHOLD` are all integers in `[0, 100]`, and `validator_fn` rejects a non-int confidence. Drift math (`abs`, `min(100, …)`) stays in integer space so validators agree exactly.
- **Validate structure, not exact LLM output.** `validator_fn` checks `status` is in the allowed set and `confidence` is an int in range; it never compares the `reasoning` text. The drift signal comes from how the *numeric* confidence moves, not from string diffs.
- **ACCEPTED ≠ executed.** Consensus means validators accepted the evaluation, not that any bond settled. `IntentBond.sol` must read `read_status` and act as a separate step.
- **Optimistic finality has an appeal window.** Each re-evaluation is provisional until the appeal window elapses; the frontend waits for `FINALIZED` before treating a new status as authoritative.
- **Evidence is untrusted (greybox).** Live context comes from a user-supplied URL with a `get`→`render` fallback; the prompt treats fetched context as adversarial input, and fetch failures degrade to `(context fetch failed)` rather than crashing the re-evaluation.

## License

MIT
