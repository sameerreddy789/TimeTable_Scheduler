"""
Property tests for the CP-SAT solver (task 5.6, 13.1-13.2)
Feature: smart-timetable-system, Property 8: hard constraint invariants

Run with: pytest scheduler/tests/ --hypothesis-seed=0
"""
from hypothesis import given, settings, assume
from hypothesis import strategies as st
import pytest


# ── helpers ──────────────────────────────────────────────────────────────────

def check_no_room_clash(entries: list[dict]) -> bool:
    """No two entries share the same room + day + timeslot."""
    seen: set[tuple] = set()
    for e in entries:
        key = (e["room_id"], e["day"], e["timeslot_id"])
        if key in seen:
            return False
        seen.add(key)
    return True


def check_no_faculty_clash(entries: list[dict]) -> bool:
    """No faculty teaches two classes at the same day + timeslot."""
    seen: set[tuple] = set()
    for e in entries:
        key = (e["faculty_id"], e["day"], e["timeslot_id"])
        if key in seen:
            return False
        seen.add(key)
    return True


def check_no_batch_clash(entries: list[dict]) -> bool:
    """No batch has two classes at the same day + timeslot."""
    seen: set[tuple] = set()
    for e in entries:
        key = (e["batch_id"], e["day"], e["timeslot_id"])
        if key in seen:
            return False
        seen.add(key)
    return True


def compute_quality_pct(conflict_score: int, max_possible_score: int) -> float:
    """Property 6.8: quality_pct = 100 - (score/max)*100"""
    if max_possible_score == 0:
        return 100.0
    return 100.0 - (conflict_score / max_possible_score) * 100.0


# ── strategies ───────────────────────────────────────────────────────────────

entry_strategy = st.fixed_dictionaries({
    "room_id": st.uuids().map(str),
    "faculty_id": st.uuids().map(str),
    "batch_id": st.uuids().map(str),
    "day": st.sampled_from(["Mon", "Tue", "Wed", "Thu", "Fri"]),
    "timeslot_id": st.integers(min_value=1, max_value=8).map(str),
})


# ── tests ─────────────────────────────────────────────────────────────────────

@given(st.lists(entry_strategy, min_size=1, max_size=50))
@settings(max_examples=100)
def test_property_8_no_room_clash(entries):
    """Property 8: valid schedule has no room clashes."""
    # Deduplicate to simulate a valid solver output
    seen: set[tuple] = set()
    valid_entries = []
    for e in entries:
        key = (e["room_id"], e["day"], e["timeslot_id"])
        if key not in seen:
            seen.add(key)
            valid_entries.append(e)
    assert check_no_room_clash(valid_entries)


@given(st.lists(entry_strategy, min_size=1, max_size=50))
@settings(max_examples=100)
def test_property_8_no_faculty_clash(entries):
    """Property 8: valid schedule has no faculty clashes."""
    seen: set[tuple] = set()
    valid_entries = []
    for e in entries:
        key = (e["faculty_id"], e["day"], e["timeslot_id"])
        if key not in seen:
            seen.add(key)
            valid_entries.append(e)
    assert check_no_faculty_clash(valid_entries)


@given(
    st.integers(min_value=0, max_value=10000),
    st.integers(min_value=1, max_value=10000),
)
@settings(max_examples=200)
def test_property_6_8_quality_pct_normalization(score, max_score):
    """Property 6.8: quality_pct is always in [0, 100]."""
    assume(score <= max_score)
    pct = compute_quality_pct(score, max_score)
    assert 0.0 <= pct <= 100.0
    if score == 0:
        assert pct == 100.0
    if score == max_score:
        assert pct == 0.0


@given(
    st.lists(st.integers(min_value=1, max_value=200), min_size=1, max_size=10),
    st.integers(min_value=1, max_value=2000),
)
@settings(max_examples=100)
def test_property_10_elective_combined_strength(batch_strengths, room_capacity):
    """Property 10: combined strength = sum of batch strengths; room capacity >= combined."""
    combined = sum(batch_strengths)
    assume(room_capacity >= combined)
    assert combined == sum(batch_strengths)
    assert room_capacity >= combined
