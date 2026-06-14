# MorphoIntent

MorphoIntent is a living intent graph on GenLayer. Instead of executing agreements with fixed logic, it stores intents (plain language commitments) whose validity is not locked at creation time. Anyone can trigger a re-evaluation: validators running different LLMs judge whether the intent still holds today under live real-world context, and consensus updates its status, confidence, and semantic drift.

## Why GenLayer

Intents are alive. Their meaning shifts as the world changes:

- **Validity is not a function of inputs at signing time.** "We will remain a capped-profit company" was true in 2023. Is it true now? Only interpretation of current context can answer this. A deterministic VM has no concept of "now" or "still."
- **Re-evaluation is legitimate.** On a deterministic chain, the same input must always produce the same output. On GenLayer, a new validator set with fresh web data can produce a different, better-grounded judgment. MorphoIntent leans on this directly.
- **Semantic drift is measurable.** Each re-evaluation shifts confidence. The protocol tracks cumulative drift across evaluations, making it observable when an intent's meaning has wandered from its original grounding.
- **No single oracle determines validity.** Multiple validators independently fetch context and judge. Consensus means no single feed or judge can unilaterally invalidate a commitment.
- **Undetermined is safe.** If validators can't reach consensus, the intent stays at its previous confidence. Ambiguity doesn't punish anyone.

## Deployed

**GenLayer (Bradbury):** `0x853Df1088469bFf13e4dFbdb3637Ef40Dfd6DC09`

## Structure

```
MorphoIntent/
├── graph/
│   ├── morpho_intent.py    ← GenLayer contract (intent store + re-evaluation)
│   └── IntentBond.sol      ← Bonds locked behind intent validity
└── .gitignore
```

Minimal. The intent graph and its financial enforcement in one directory.

## How it works

1. **Post an intent** with a statement, context URL, and parties involved
2. **Time passes.** The world changes.
3. **Anyone triggers re-evaluation.** Validators fetch the context URL and judge if the intent still holds.
4. **Confidence updates.** Status moves through: active → weakened → invalidated/expired
5. **Drift accumulates.** If confidence keeps shifting, drift_score rises. Above threshold = flagged as semantically drifted.
6. **IntentBond reacts.** If invalidated, the bonded counterparty can claim. If weakened, proportional split.
