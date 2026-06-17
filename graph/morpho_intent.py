# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
from genlayer import *

DRIFT_THRESHOLD = 30  # above this, intent is considered semantically drifted
STATUS_ENUM = ("active", "weakened", "invalidated", "expired")


# ----------------------------------------------------------------------
# EVM bridge: the GenLayer contract is the *resolver* of an IntentBond
# vault (graph/IntentBond.sol). When an intent is settled, this contract
# reads its own on-chain verdict and emits the matching settlement call
# to the EVM vault — so the bond outcome is enforced by the GenLayer
# judgment, not by a trusted off-chain script. This uses the supported
# gl.evm.contract_interface primitive (same family as emit_transfer).
# ----------------------------------------------------------------------
@gl.evm.contract_interface
class IIntentBond:
    class View:
        pass

    class Write:
        def returnBond(self, id: u256, /) -> None: ...
        def claimBond(self, id: u256, /) -> None: ...
        def splitBond(self, id: u256, depositorBps: u256, /) -> None: ...


def derive_settlement(status: str, confidence: int) -> dict:
    """Pure mapping from an intent verdict to a vault action.

    active            -> returnBond  (intent holds: funds back to depositor)
    invalidated/expired -> claimBond (intent broken: funds to beneficiary)
    weakened          -> splitBond   (partial: depositor keeps confidence%)
    """
    if status == "active":
        return {"action": "returnBond", "depositor_bps": 10000}
    if status in ("invalidated", "expired"):
        return {"action": "claimBond", "depositor_bps": 0}
    # weakened: split proportionally to confidence (0-100 -> 0-10000 bps)
    bps = max(0, min(10000, int(confidence) * 100))
    return {"action": "splitBond", "depositor_bps": bps}


# ----------------------------------------------------------------------
# Deterministic verdict logic (module-level, unit-testable, shared by
# leader_fn and validator_fn). The status is a pure function of the
# numeric confidence band — no free-form LLM text comparison.
# ----------------------------------------------------------------------
def derive_status(confidence: int, expired: bool = False) -> str:
    """Map a 0-100 confidence to a lifecycle status band."""
    if expired:
        return "expired"
    if confidence >= 67:
        return "active"
    if confidence >= 34:
        return "weakened"
    return "invalidated"


def status_matches_band(status, confidence) -> bool:
    """Whether a status is consistent with the confidence band."""
    if status == "active":
        return confidence >= 67
    if status == "weakened":
        return 34 <= confidence <= 66
    if status == "invalidated":
        return confidence < 34
    if status == "expired":
        # 'expired' is only acceptable in the lowest band.
        return confidence < 34
    return False


def validate_verdict(data) -> bool:
    if not isinstance(data, dict):
        return False
    confidence = data.get("confidence")
    # confidence is an int in [0, 100]; reject bool (subclass of int).
    if not isinstance(confidence, int) or isinstance(confidence, bool):
        return False
    if confidence < 0 or confidence > 100:
        return False
    status = data.get("status")
    if status not in STATUS_ENUM:
        return False
    # Cross-field anchor: status must match the confidence band.
    if not status_matches_band(status, confidence):
        return False
    reasoning = data.get("reasoning")
    if not isinstance(reasoning, str) or not reasoning.strip():
        return False
    return True


def normalize_verdict(raw, expired: bool = False) -> dict:
    if not isinstance(raw, dict):
        raw = {}
    confidence = raw.get("confidence")
    if not isinstance(confidence, int) or isinstance(confidence, bool):
        confidence = 0
    confidence = max(0, min(100, confidence))
    if expired:
        # Expiry forces the lowest band so the invariant stays consistent.
        confidence = min(confidence, 33)
        status = "expired"
    else:
        # Leader derives status purely from the confidence band.
        status = derive_status(confidence, False)
    reasoning = raw.get("reasoning")
    if not isinstance(reasoning, str) or not reasoning.strip():
        reasoning = "no reasoning provided"
    return {"status": status, "confidence": confidence, "reasoning": reasoning}


class MorphoIntent(gl.Contract):
    intents: TreeMap[str, str]
    intent_count: u256
    total_evaluations: u256
    owner: str
    vault: str

    def __init__(self):
        self.intent_count = u256(0)
        self.total_evaluations = u256(0)
        self.owner = str(gl.message.sender_address)
        self.vault = ""

    @gl.public.write
    def post_intent(self, statement: str, context_url: str, parties: str) -> str:
        """
        Store a plain-language intent/commitment as a node in the Living
        Intent Graph.
        statement: the commitment in natural language
        context_url: where to fetch live context for re-evaluation
        parties: comma-separated addresses or names involved
        """
        statement = str(statement).strip()
        if not statement or len(statement) > 2000:
            raise Exception("statement required (max 2000)")

        key = str(int(self.intent_count))
        intent = {
            "author": str(gl.message.sender_address),
            "statement": statement,
            "context_url": str(context_url).strip() if context_url else "",
            "parties": str(parties).strip(),
            "status": "active",
            "confidence": 100,
            "drift_score": 0,
            "evaluations": 0,
            "expired": False,
            "last_reasoning": "",
            "history": [],
        }
        self.intents[key] = json.dumps(intent)
        self.intent_count += u256(1)
        return key

    @gl.public.write
    def expire_intent(self, intent_key: str) -> None:
        """The author explicitly ends an intent (sets the expiry flag)."""
        intent_key = str(intent_key)
        if intent_key not in self.intents:
            raise Exception("unknown intent")
        intent = json.loads(self.intents[intent_key])
        if str(gl.message.sender_address) != intent["author"]:
            raise Exception("only author can expire")
        intent["expired"] = True
        intent["status"] = "expired"
        self.intents[intent_key] = json.dumps(intent)

    @gl.public.write
    def reevaluate(self, intent_key: str) -> None:
        """
        Anyone can trigger re-evaluation. Validators fetch live context
        and judge whether the intent still holds today. The numeric
        confidence drives the status band deterministically.
        """
        intent_key = str(intent_key)
        if intent_key not in self.intents:
            raise Exception("unknown intent")
        intent = json.loads(self.intents[intent_key])
        if intent["status"] == "expired" or intent.get("expired"):
            raise Exception("intent expired")

        verdict = self._evaluate(intent)

        # Track drift over time
        prev_confidence = intent["confidence"]
        new_confidence = verdict["confidence"]
        drift_delta = abs(new_confidence - prev_confidence)

        intent["evaluations"] += 1
        intent["confidence"] = new_confidence
        intent["drift_score"] = min(100, intent["drift_score"] + drift_delta)
        intent["last_reasoning"] = verdict["reasoning"]
        intent["status"] = verdict["status"]

        # Append to history (keep last 5)
        intent["history"].append({
            "confidence": new_confidence,
            "status": verdict["status"],
            "reasoning": verdict["reasoning"][:200],
        })
        intent["history"] = intent["history"][-5:]

        self.intents[intent_key] = json.dumps(intent)
        self.total_evaluations += u256(1)

    def _evaluate(self, intent: dict) -> dict:
        statement = intent["statement"]
        context_url = intent["context_url"]
        prev_confidence = intent["confidence"]
        eval_count = intent["evaluations"]
        expired = bool(intent.get("expired", False))

        def leader_fn() -> str:
            live_context = "(no context URL provided)"
            if context_url and context_url.startswith("http"):
                try:
                    raw = gl.nondet.web.get(context_url)
                    live_context = raw.body.decode("utf-8")[:4000]
                except Exception:
                    try:
                        live_context = gl.nondet.web.render(context_url, mode="text")[:4000]
                    except Exception:
                        live_context = "(context fetch failed)"

            prompt = f"""You are evaluating whether a plain-language intent/commitment still holds true under current real-world context.

INTENT STATEMENT:
{statement}

PREVIOUS CONFIDENCE: {prev_confidence}% (after {eval_count} evaluations)

LIVE CONTEXT (fetched now):
{live_context}

EVALUATION RULES:
1. Judge if the intent is still valid, partially valid, or no longer valid TODAY.
2. Consider: has the world changed? Are conditions still met? Has the meaning drifted?
3. Confidence: an integer 0-100 (100 = fully holds, 0 = completely invalid now).
4. The status band follows the confidence: >=67 active, 34-66 weakened, <34 invalidated.

Reply ONLY valid JSON:
{{"confidence": <int 0-100>, "reasoning": "<why does or doesn't it still hold?>"}}"""

            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(raw, dict):
                try:
                    raw = json.loads(str(raw))
                except Exception:
                    raw = {}
            # Leader derives status from the confidence band (or expiry flag).
            return json.dumps(normalize_verdict(raw, expired))

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                data = json.loads(leader_result.calldata)
            except Exception:
                return False
            return validate_verdict(data)

        return json.loads(gl.vm.run_nondet_unsafe(leader_fn, validator_fn))

    @gl.public.view
    def get_intent(self, key: str) -> dict:
        key = str(key)
        if key not in self.intents:
            return {"exists": False}
        return json.loads(self.intents[key])

    @gl.public.view
    def read_status(self, key: str) -> dict:
        """External contracts read this to act on intent validity."""
        key = str(key)
        if key not in self.intents:
            return {"valid": False}
        i = json.loads(self.intents[key])
        return {
            "valid": i["status"] in ("active", "weakened"),
            "status": i["status"],
            "confidence": i["confidence"],
            "drift_score": i["drift_score"],
        }

    # ------------------------------------------------------------------
    # Vault settlement bridge (GenLayer verdict -> EVM IntentBond)
    # ------------------------------------------------------------------
    @gl.public.write
    def set_vault(self, vault_address: str) -> None:
        """Owner wires the IntentBond vault this contract resolves for."""
        if str(gl.message.sender_address) != self.owner:
            raise Exception("only owner")
        self.vault = str(vault_address).strip()

    @gl.public.view
    def get_vault(self) -> dict:
        return {"vault": self.vault, "owner": self.owner}

    @gl.public.view
    def preview_settlement(self, key: str) -> dict:
        """What settlement the current verdict maps to (no state change)."""
        key = str(key)
        if key not in self.intents:
            return {"exists": False}
        i = json.loads(self.intents[key])
        s = derive_settlement(i["status"], int(i["confidence"]))
        return {
            "exists": True,
            "status": i["status"],
            "confidence": int(i["confidence"]),
            "action": s["action"],
            "depositor_bps": s["depositor_bps"],
        }

    @gl.public.write
    def settle_bond(self, intent_key: str, bond_id: int) -> dict:
        """Map the GenLayer settlement of an intent into the IntentBond vault.

        This contract is the vault's resolver, so the emitted EVM call is
        authorised by the on-chain judgment of the intent — not a trusted
        off-chain actor.
        """
        if not self.vault:
            raise Exception("vault not set")
        intent_key = str(intent_key)
        if intent_key not in self.intents:
            raise Exception("unknown intent")
        i = json.loads(self.intents[intent_key])
        status = i["status"]
        confidence = int(i["confidence"])
        s = derive_settlement(status, confidence)

        bond = IIntentBond(Address(self.vault))
        bid = u256(int(bond_id))
        if s["action"] == "returnBond":
            bond.emit().returnBond(bid)
        elif s["action"] == "claimBond":
            bond.emit().claimBond(bid)
        else:
            bond.emit().splitBond(bid, u256(int(s["depositor_bps"])))

        return {
            "intent": intent_key,
            "bond_id": int(bond_id),
            "status": status,
            "confidence": confidence,
            "action": s["action"],
            "depositor_bps": s["depositor_bps"],
        }

    @gl.public.view
    def stats(self) -> dict:
        return {
            "total_intents": int(self.intent_count),
            "total_evaluations": int(self.total_evaluations),
        }
