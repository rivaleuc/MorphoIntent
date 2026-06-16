"""Deterministic-invariant tests for the MorphoIntent contract.

ANCHOR: status band derived from confidence -
confidence>=67 => 'active', 34..66 => 'weakened', <34 => 'invalidated'.
'expired' acceptable only when confidence < 34.
"""


def test_derived_anchor_matches(contract):
    assert contract.derive_status(100) == "active"
    assert contract.derive_status(67) == "active"
    assert contract.derive_status(66) == "weakened"
    assert contract.derive_status(34) == "weakened"
    assert contract.derive_status(33) == "invalidated"
    assert contract.derive_status(0) == "invalidated"
    assert contract.derive_status(50, expired=True) == "expired"


def test_normalized_output_always_passes(contract):
    samples = [
        {"confidence": 80, "reasoning": "x"},
        {"confidence": 50, "reasoning": ""},
        {"confidence": 10, "reasoning": "x"},
        {"confidence": 999, "reasoning": "x"},
        {"confidence": True, "reasoning": "x"},
        {},
        "not a dict",
        None,
    ]
    for raw in samples:
        v = contract.normalize_verdict(raw)
        assert contract.validate_verdict(v), raw
        assert v["status"] == contract.derive_status(v["confidence"])


def test_expired_normalized_passes(contract):
    v = contract.normalize_verdict({"confidence": 90, "reasoning": "ended"}, expired=True)
    assert v["status"] == "expired"
    assert v["confidence"] < 34
    assert contract.validate_verdict(v)


def test_band_mismatch_rejected(contract):
    # high confidence but 'invalidated'
    assert not contract.validate_verdict({"status": "invalidated", "confidence": 90, "reasoning": "x"})
    # low confidence but 'active'
    assert not contract.validate_verdict({"status": "active", "confidence": 10, "reasoning": "x"})
    # mid confidence but 'active'
    assert not contract.validate_verdict({"status": "active", "confidence": 50, "reasoning": "x"})


def test_expired_only_in_low_band(contract):
    assert contract.validate_verdict({"status": "expired", "confidence": 10, "reasoning": "x"})
    assert not contract.validate_verdict({"status": "expired", "confidence": 80, "reasoning": "x"})


def test_confidence_out_of_range_rejected(contract):
    assert not contract.validate_verdict({"status": "active", "confidence": 101, "reasoning": "x"})
    assert not contract.validate_verdict({"status": "invalidated", "confidence": -1, "reasoning": "x"})


def test_bool_confidence_rejected(contract):
    assert not contract.validate_verdict({"status": "invalidated", "confidence": True, "reasoning": "x"})


def test_bad_status_rejected(contract):
    assert not contract.validate_verdict({"status": "drifted", "confidence": 80, "reasoning": "x"})


def test_empty_reasoning_rejected(contract):
    assert not contract.validate_verdict({"status": "active", "confidence": 80, "reasoning": "  "})
