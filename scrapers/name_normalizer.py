"""Player name normalization and matching utilities."""

import difflib
import re
from scrapers.config import NAME_ALIASES


_SUFFIX_RE = re.compile(r'\s+(jr|sr|iii|ii|iv|v)\.?$', re.IGNORECASE)


def normalize_name(first: str, last: str) -> str:
    """Normalize a player name to a canonical lowercase form."""
    full = f"{first} {last}".strip().lower()
    full = full.replace(".", "")
    full = re.sub(r'\s+', ' ', full).strip()
    full = _SUFFIX_RE.sub('', full).strip()
    return full


def resolve_alias(normalized_name: str) -> str:
    """Resolve a known alias to its canonical form."""
    return NAME_ALIASES.get(normalized_name, normalized_name)


def build_canonical_key(first: str, last: str) -> str:
    """Build a canonical player key from first/last name."""
    return resolve_alias(normalize_name(first, last))


def fuzzy_match(name: str, candidates: list, threshold: float = 0.85) -> str | None:
    """Find the best fuzzy match for a name among candidates.

    Returns the best matching candidate string, or None if no match meets threshold.
    """
    if not candidates:
        return None
    best_match = None
    best_ratio = 0.0
    for candidate in candidates:
        ratio = difflib.SequenceMatcher(None, name, candidate).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = candidate
    if best_ratio >= threshold:
        return best_match
    return None


if __name__ == "__main__":
    assert normalize_name("Kenneth", "Walker III") == "kenneth walker", \
        f"Got: {normalize_name('Kenneth', 'Walker III')}"
    assert resolve_alias("gabe davis") == "gabriel davis"
    assert normalize_name("T.J.", "Hockenson") == "tj hockenson", \
        f"Got: {normalize_name('T.J.', 'Hockenson')}"
    assert normalize_name("Marvin", "Jones Jr.") == "marvin jones", \
        f"Got: {normalize_name('Marvin', 'Jones Jr.')}"
    assert build_canonical_key("Gabe", "Davis") == "gabriel davis"
    assert fuzzy_match("kenneth walker", ["kenneth walker", "ken walker", "john smith"]) == "kenneth walker"
    print("All name_normalizer tests passed.")
