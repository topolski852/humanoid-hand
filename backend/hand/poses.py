"""
ASL alphabet pose table for the InMoov hand.

Each finger is a single flexion servo (raw degrees). The mechanical vocabulary,
taken from the calibrated end-stops in the original sketch:

    thumb : 60 = extended out ....... 160 = tucked across palm
    index : 40 = up/extended ........ 170 = curled down
    middle: 30 = up/extended ........ 160 = curled down
    ring  : 150 = up/extended ....... 0   = curled down   (servo is INVERTED)
    pinky : 40 = up/extended ........ 160 = curled down
    wrist : 90 = neutral

Because every finger has only ONE axis (no spread, no thumb rotation, no per-
knuckle control), several ASL letters are physically indistinguishable on this
hand (U/V/R; the motion letters J/Z; the thumb-between-fingers letters M/N/T).
Those are marked ``approximate`` so the UI can badge them — they render as the
closest achievable static pose.
"""
from __future__ import annotations

# Named angle positions per finger (raw servo degrees).
_POS = {
    "thumb":  {"out": 60,  "in": 160, "mid": 110},
    "index":  {"up": 40,   "down": 170, "mid": 105, "hook": 135},
    "middle": {"up": 30,   "down": 160, "mid": 95,  "hook": 125},
    "ring":   {"up": 150,  "down": 0,   "mid": 75,  "hook": 60},   # inverted
    "pinky":  {"up": 40,   "down": 160, "mid": 100, "hook": 130},
}
WRIST_NEUTRAL = 90

# Order matters: [thumb, index, middle, ring, pinky].
_ORDER = ["thumb", "index", "middle", "ring", "pinky"]

# A finger is drawn "extended" in the UI glyph when it is up (or out, for thumb).
_EXTENDED_STATES = {"up", "out"}


def _pose(thumb, index, middle, ring, pinky):
    """Build a 6-angle list [thumb, index, middle, ring, pinky, wrist] from state names."""
    states = {"thumb": thumb, "index": index, "middle": middle, "ring": ring, "pinky": pinky}
    angles = [_POS[f][states[f]] for f in _ORDER]
    angles.append(WRIST_NEUTRAL)
    extended = [states[f] in _EXTENDED_STATES for f in _ORDER]
    return angles, extended


# Each entry: (thumb, index, middle, ring, pinky, approximate, description)
_LETTERS = {
    "A": ("out",  "down", "down", "down", "down", True,  "Fist, thumb along the side"),
    "B": ("in",   "up",   "up",   "up",   "up",   False, "Four fingers up, thumb across palm"),
    "C": ("mid",  "mid",  "mid",  "mid",  "mid",  True,  "Curved hand forming a C"),
    "D": ("out",  "up",   "down", "down", "down", False, "Index up, thumb meets middle"),
    "E": ("in",   "hook", "hook", "hook", "hook", True,  "Fingers curled, thumb across"),
    "F": ("out",  "hook", "up",   "up",   "up",   True,  "Thumb+index circle, three up"),
    "G": ("out",  "up",   "down", "down", "down", True,  "Index pointing (needs wrist)"),
    "H": ("in",   "up",   "up",   "down", "down", True,  "Index+middle pointing sideways"),
    "I": ("in",   "down", "down", "down", "up",   False, "Pinky up"),
    "J": ("in",   "down", "down", "down", "up",   True,  "Pinky up + J motion (static)"),
    "K": ("out",  "up",   "up",   "down", "down", True,  "Index+middle up, thumb between"),
    "L": ("out",  "up",   "down", "down", "down", False, "Thumb out + index up (L)"),
    "M": ("in",   "down", "down", "down", "down", True,  "Thumb under three fingers"),
    "N": ("in",   "down", "down", "down", "down", True,  "Thumb under two fingers"),
    "O": ("mid",  "hook", "hook", "hook", "hook", True,  "Fingertips meet thumb (O)"),
    "P": ("out",  "up",   "up",   "down", "down", True,  "K pointing down (needs wrist)"),
    "Q": ("out",  "up",   "down", "down", "down", True,  "G pointing down (needs wrist)"),
    "R": ("in",   "up",   "up",   "down", "down", True,  "Index+middle crossed (no cross)"),
    "S": ("in",   "down", "down", "down", "down", True,  "Fist, thumb across front"),
    "T": ("in",   "down", "down", "down", "down", True,  "Thumb between index+middle"),
    "U": ("in",   "up",   "up",   "down", "down", False, "Index+middle up together"),
    "V": ("in",   "up",   "up",   "down", "down", True,  "Index+middle up spread (no spread)"),
    "W": ("in",   "up",   "up",   "up",   "down", False, "Index+middle+ring up"),
    "X": ("in",   "hook", "down", "down", "down", True,  "Index hooked"),
    "Y": ("out",  "down", "down", "down", "up",   False, "Thumb + pinky out"),
    "Z": ("in",   "up",   "down", "down", "down", True,  "Index up + Z motion (static)"),
}

# Fully-open "rest" pose (all fingers extended).
REST_POSE = _pose("out", "up", "up", "up", "up")[0]

# Public table: letter -> {angles, extended, approximate, description}
SIGNS: dict[str, dict] = {}
for _letter, (_t, _i, _m, _r, _p, _approx, _desc) in _LETTERS.items():
    _angles, _extended = _pose(_t, _i, _m, _r, _p)
    SIGNS[_letter] = {
        "letter": _letter,
        "angles": _angles,             # [thumb, index, middle, ring, pinky, wrist]
        "extended": _extended,         # bool per [thumb, index, middle, ring, pinky] for the UI glyph
        "approximate": _approx,
        "description": _desc,
    }


def sign_angles(letter: str) -> list[int] | None:
    entry = SIGNS.get(letter.upper())
    return entry["angles"] if entry else None
