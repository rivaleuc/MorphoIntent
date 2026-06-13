# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
from genlayer import *

DRIFT_THRESHOLD = 30  # above this, intent is considered semantically drifted


class MorphoIntent(gl.Contract):
    intents: TreeMap[str, str]
    intent_count: u256
    total_evaluations: u256

    def __init__(self):
        self.intent_count = u256(0)
        self.total_evaluations = u256(0)

    @gl.public.write
    def post_intent(self, statement: str, context_url: str, parties: str) -> str:
        """
        Store a plain-language intent/commitment.
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
            "last_reasoning": "",
            "history": [],
        }
        self.intents[key] = json.dumps(intent)
        self.intent_count += u256(1)
        return key

    @gl.public.write
    def reevaluate(self, intent_key: str) -> None:
        """
        Anyone can trigger re-evaluation. Validators fetch live context
        and judge whether the intent still holds today.
        """
        intent_key = str(intent_key)
        if intent_key not in self.intents:
            raise Exception("unknown intent")
        intent = json.loads(self.intents[intent_key])
        if intent["status"] == "expired":
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

        if intent["drift_score"] >= DRIFT_THRESHOLD and intent["status"] == "active":
            intent["status"] = "drifted"

        self.intents[intent_key] = json.dumps(intent)
        self.total_evaluations += u256(1)

    def _evaluate(self, intent: dict) -> dict:
        statement = intent["statement"]
        context_url = intent["context_url"]
        prev_confidence = intent["confidence"]
        eval_count = intent["evaluations"]

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
3. Confidence: 0-100 (100 = fully holds, 0 = completely invalid now)
4. Status: "active" (still holds), "weakened" (partially valid), "invalidated" (no longer true), "expired" (explicitly ended)

Reply ONLY valid JSON:
{{"status": "active"/"weakened"/"invalidated"/"expired", "confidence": <0-100>, "reasoning": "<why does or doesn't it still hold?>"}}"""

            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            if isinstance(raw, dict):
                return json.dumps(raw)
            return str(raw).strip()

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                data = json.loads(leader_result.calldata)
                if data.get("status") not in ("active", "weakened", "invalidated", "expired"):
                    return False
                conf = data.get("confidence")
                if not isinstance(conf, int) or conf < 0 or conf > 100:
                    return False
                if not isinstance(data.get("reasoning"), str):
                    return False
                return True
            except Exception:
                return False

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

    @gl.public.view
    def stats(self) -> dict:
        return {
            "total_intents": int(self.intent_count),
            "total_evaluations": int(self.total_evaluations),
        }
