#!/usr/bin/env python3
"""
Generate VerseIR-driven ritual color schemes from authoritative VisualBytecode.

This executable can either:
1. read a prebuilt payload from scripts/export_verseir_palette_payload.mjs, or
2. invoke that bridge directly from raw text / a text file.

The output is a plain-text report with:
- the spectral profile extracted from VerseIR tokens
- a simple palette bytecode trace
- derived dark and light ritual color slots
- refined family colors for the active linguistic field
"""

from __future__ import annotations

import argparse
import colorsys
import json
import math
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

DEFAULT_SAMPLE_TEXT = """Resonant thunder braids the oracle of glass.
Mercurial roses open where the warding vowels burn.
I cast my will through silver breath and grave-green dusk.
The abyss answers softly, but the bright sigils return."""

DEFAULT_BRIDGE = Path(__file__).with_name("export_verseir_palette_payload.mjs")
DEFAULT_REPORT = Path("output/visualbytecode_color_scheme_report.txt")
DEFAULT_PAYLOAD = Path("output/visualbytecode_palette_payload.json")

FAMILY_ORDER = [
    "IY", "IH", "EY", "AE", "A", "AO", "OW", "UW",
    "AA", "AH", "AX", "AW", "EH", "AY", "OY", "OH", "UH", "OO", "ER", "UR",
]

THEME_SLOT_ORDER = [
    "abyss",
    "panel",
    "parchment",
    "ink",
    "primary",
    "secondary",
    "tertiary",
    "border",
    "glow",
    "aurora_start",
    "aurora_end",
]


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def clamp_int(value: float, lower: int, upper: int) -> int:
    return int(round(clamp(value, lower, upper)))


def safe_text(value: object) -> str:
    return str(value or "")


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    color = safe_text(hex_color).strip().lstrip("#")
    if len(color) != 6:
        return (136, 136, 136)
    return tuple(int(color[index:index + 2], 16) for index in (0, 2, 4))


def rgb_to_hex(rgb: Iterable[int]) -> str:
    red, green, blue = [clamp_int(channel, 0, 255) for channel in rgb]
    return f"#{red:02x}{green:02x}{blue:02x}"


def hex_to_hsl(hex_color: str) -> Tuple[float, float, float]:
    red, green, blue = hex_to_rgb(hex_color)
    hue, lightness, saturation = colorsys.rgb_to_hls(red / 255.0, green / 255.0, blue / 255.0)
    return (hue * 360.0, saturation * 100.0, lightness * 100.0)


def hsl_to_hex(hue: float, saturation: float, lightness: float) -> str:
    hue = (float(hue) % 360.0) / 360.0
    saturation = clamp(float(saturation), 0.0, 100.0) / 100.0
    lightness = clamp(float(lightness), 0.0, 100.0) / 100.0
    red, green, blue = colorsys.hls_to_rgb(hue, lightness, saturation)
    return rgb_to_hex((round(red * 255), round(green * 255), round(blue * 255)))


def mix_hex(first: str, second: str, ratio: float) -> str:
    weight = clamp(float(ratio), 0.0, 1.0)
    first_rgb = hex_to_rgb(first)
    second_rgb = hex_to_rgb(second)
    mixed = tuple(round((1.0 - weight) * a + weight * b) for a, b in zip(first_rgb, second_rgb))
    return rgb_to_hex(mixed)


def adjust_hsl(hex_color: str, *, hue: float | None = None, saturation: float | None = None, lightness: float | None = None) -> str:
    base_h, base_s, base_l = hex_to_hsl(hex_color)
    return hsl_to_hex(
        base_h if hue is None else hue,
        base_s if saturation is None else saturation,
        base_l if lightness is None else lightness,
    )


def relative_luminance(hex_color: str) -> float:
    def convert(channel: int) -> float:
        value = channel / 255.0
        return value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4

    red, green, blue = hex_to_rgb(hex_color)
    return 0.2126 * convert(red) + 0.7152 * convert(green) + 0.0722 * convert(blue)


def contrast_ratio(foreground: str, background: str) -> float:
    fg = relative_luminance(foreground)
    bg = relative_luminance(background)
    lighter = max(fg, bg)
    darker = min(fg, bg)
    return (lighter + 0.05) / (darker + 0.05)


def ensure_contrast(foreground: str, background: str, target_ratio: float, prefer_light: bool) -> str:
    current = foreground
    hue, saturation, lightness = hex_to_hsl(current)
    direction = 1 if prefer_light else -1

    for _ in range(40):
        if contrast_ratio(current, background) >= target_ratio:
            return current
        lightness = clamp(lightness + direction * 2.4, 4.0, 96.0)
        current = hsl_to_hex(hue, saturation, lightness)

    return current


def circular_distance(first_hue: float, second_hue: float) -> float:
    raw = abs(float(first_hue) - float(second_hue)) % 360.0
    return min(raw, 360.0 - raw)


def circular_mean(weighted_hues: Iterable[Tuple[float, float]]) -> float:
    sin_sum = 0.0
    cos_sum = 0.0
    total = 0.0
    for hue, weight in weighted_hues:
        radians = math.radians(float(hue))
        sin_sum += math.sin(radians) * weight
        cos_sum += math.cos(radians) * weight
        total += weight

    if total <= 0 or (abs(sin_sum) < 1e-6 and abs(cos_sum) < 1e-6):
        return 0.0

    return math.degrees(math.atan2(sin_sum, cos_sum)) % 360.0


def normalized_entropy(weights: Dict[str, float]) -> float:
    values = [value for value in weights.values() if value > 0]
    if len(values) <= 1:
        return 0.0

    total = sum(values)
    entropy = 0.0
    for value in values:
        probability = value / total
        entropy -= probability * math.log2(probability)

    return entropy / math.log2(len(values))


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate VisualBytecode-driven ritual color schemes.")
    parser.add_argument("--payload", type=Path, help="Existing JSON payload produced by export_verseir_palette_payload.mjs.")
    parser.add_argument("--text", type=str, help="Inline text to compile through the VerseIR bridge.")
    parser.add_argument("--text-file", type=Path, help="Path to a text file to compile through the VerseIR bridge.")
    parser.add_argument("--output", type=Path, default=DEFAULT_REPORT, help="Text report output path.")
    parser.add_argument("--payload-output", type=Path, default=DEFAULT_PAYLOAD, help="When compiling text, also write the bridge payload here.")
    parser.add_argument("--bridge", type=Path, default=DEFAULT_BRIDGE, help="Path to the Node VerseIR export bridge.")
    parser.add_argument("--mode", type=str, default="balanced", help="VerseIR compile mode passed to the Node bridge.")
    parser.add_argument("--visual-mode", type=str, default="AESTHETIC", help="Visual mode passed to the phonetic color amplifier.")
    return parser.parse_args(argv)


def load_payload(path: Path) -> Dict[str, object]:
    return json.loads(path.read_text(encoding="utf8"))


def invoke_bridge(args: argparse.Namespace) -> Dict[str, object]:
    payload_path = args.payload_output.resolve()
    payload_path.parent.mkdir(parents=True, exist_ok=True)

    command = [
        "node",
        str(args.bridge.resolve()),
        "--mode",
        args.mode,
        "--visual-mode",
        args.visual_mode,
        "--output",
        str(payload_path),
    ]

    if args.text and args.text.strip():
        command.extend(["--text", args.text])
    elif args.text_file:
        command.extend(["--text-file", str(args.text_file.resolve())])
    else:
        command.extend(["--text", DEFAULT_SAMPLE_TEXT])

    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip() or "VerseIR bridge failed."
        raise SystemExit(message)

    return load_payload(payload_path)


def resolve_payload(args: argparse.Namespace) -> Dict[str, object]:
    if args.payload:
        return load_payload(args.payload.resolve())
    return invoke_bridge(args)


def resolve_school(token: Dict[str, object], mapping: Dict[str, str]) -> Tuple[str, str]:
    family_candidates: List[str] = []
    primary = safe_text(token.get("primaryStressedVowelFamily")).upper()
    terminal = safe_text(token.get("terminalVowelFamily")).upper()
    if primary:
        family_candidates.append(primary)
    if terminal and terminal not in family_candidates:
        family_candidates.append(terminal)
    for family in token.get("vowelFamily") or []:
        upper_family = safe_text(family).upper()
        if upper_family and upper_family not in family_candidates:
            family_candidates.append(upper_family)

    for family in family_candidates:
        school = mapping.get(family)
        if school:
            return school, family

    return "DEFAULT", family_candidates[0] if family_candidates else "AX"


def build_rhyme_counts(tokens: List[Dict[str, object]]) -> Counter:
    counts: Counter = Counter()
    for token in tokens:
        signature = safe_text(token.get("rhymeTailSignature")).strip()
        if signature:
            counts[signature] += 1
    return counts


def token_energy(token: Dict[str, object], rhyme_counts: Counter) -> float:
    text = safe_text(token.get("text"))
    letters_only = "".join(char for char in text if char.isalpha())
    phoneme_count = max(1, len(token.get("phonemes") or []))
    syllable_count = max(0, int(token.get("syllableCount") or 0))
    stress_pattern = safe_text(token.get("stressPattern"))
    onset = token.get("onset") or []
    coda = token.get("coda") or []
    consonant_skeleton = safe_text(token.get("consonantSkeleton"))
    bytecode = token.get("visualBytecode") or {}
    flags = token.get("flags") or {}
    diagnostics = token.get("phoneticDiagnostics") or {}

    primary_stress_hits = stress_pattern.count("1")
    secondary_stress_hits = stress_pattern.count("2")
    onset_density = len(onset) / phoneme_count
    coda_density = len(coda) / phoneme_count
    consonant_force = len(consonant_skeleton) / max(1, len(letters_only) or phoneme_count)
    rhyme_tail = safe_text(token.get("rhymeTailSignature")).strip()
    rhyme_peers = max(0, rhyme_counts.get(rhyme_tail, 0) - 1)
    rhyme_heat = 1.0 - math.exp(-0.42 * rhyme_peers)
    glow = clamp(float(bytecode.get("glowIntensity") or 0.0), 0.0, 1.0)
    saturation = clamp(float(bytecode.get("saturationBoost") or 0.0), 0.0, 1.0)
    syllable_depth = min(1.0, syllable_count / 4.0)

    energy = (
        0.28
        + 0.24 * syllable_depth
        + 0.15 * clamp(primary_stress_hits * 0.7 + secondary_stress_hits * 0.35, 0.0, 1.0)
        + 0.10 * onset_density
        + 0.08 * coda_density
        + 0.07 * consonant_force
        + 0.11 * rhyme_heat
        + 0.09 * glow
        + 0.08 * saturation
    )

    if bytecode.get("isAnchor"):
        energy += 0.12
    if diagnostics.get("authoritySource") or diagnostics.get("usedAuthorityCache"):
        energy += 0.03
    if flags.get("isStopWordLike"):
        energy *= 0.38
    if flags.get("unknownPhonetics"):
        energy *= 0.72

    return round(clamp(energy, 0.05, 1.8), 6)


def build_profile(payload: Dict[str, object]) -> Dict[str, object]:
    palette_context = payload.get("paletteContext") or {}
    schools: Dict[str, Dict[str, object]] = palette_context.get("schools") or {}
    mapping: Dict[str, str] = palette_context.get("vowelFamilyToSchool") or {}
    school_skins: Dict[str, Dict[str, str]] = palette_context.get("schoolSkins") or {}
    school_skins_light: Dict[str, Dict[str, str]] = palette_context.get("schoolSkinsLight") or {}
    verse_ir = payload.get("verseIR") or {}
    tokens: List[Dict[str, object]] = list(verse_ir.get("tokens") or [])

    rhyme_counts = build_rhyme_counts(tokens)
    school_energy: Dict[str, float] = defaultdict(float)
    family_energy: Dict[str, float] = defaultdict(float)
    school_token_count: Counter = Counter()
    token_profiles: List[Dict[str, object]] = []
    glow_values: List[float] = []

    for token in tokens:
        school_id, family = resolve_school(token, mapping)
        energy = token_energy(token, rhyme_counts)
        school_energy[school_id] += energy
        family_energy[family] += energy
        school_token_count[school_id] += 1
        glow_values.append(float((token.get("visualBytecode") or {}).get("glowIntensity") or 0.0))
        token_profiles.append({
            "text": safe_text(token.get("text")),
            "school": school_id,
            "family": family,
            "energy": energy,
            "effectClass": safe_text((token.get("visualBytecode") or {}).get("effectClass")) or "INERT",
            "isAnchor": bool((token.get("visualBytecode") or {}).get("isAnchor")),
            "lineIndex": int(token.get("lineIndex") or 0),
        })

    total_energy = sum(school_energy.values()) or 1.0
    school_shares = {school_id: value / total_energy for school_id, value in school_energy.items()}
    dominant_school = max(school_energy, key=school_energy.get, default="DEFAULT")
    dominant_hue = float((schools.get(dominant_school) or {}).get("colorHsl", {}).get("h", 265))

    weighted_hues = []
    warm_signal = 0.0
    for school_id, share in school_shares.items():
        hue = float((schools.get(school_id) or {}).get("colorHsl", {}).get("h", 0.0))
        weighted_hues.append((hue, share))
        warm_signal += share * math.cos(math.radians(hue - 45.0))

    ritual_hue = circular_mean(weighted_hues)
    entropy = normalized_entropy(school_energy)
    resonance = sum(glow_values) / len(glow_values) if glow_values else 0.0
    warm_bias = clamp((warm_signal + 1.0) / 2.0, 0.0, 1.0)

    dominant_meta = schools.get(dominant_school) or {"color": "#6548b8", "colorHsl": {"h": dominant_hue, "s": 48, "l": 50}}
    accent_school = pick_accent_school(dominant_school, school_shares, schools)
    shadow_school = pick_shadow_school(dominant_school, school_shares, schools)

    top_tokens = sorted(token_profiles, key=lambda item: item["energy"], reverse=True)[:8]
    top_families = sorted(family_energy.items(), key=lambda item: item[1], reverse=True)[:8]

    return {
        "payload": payload,
        "schools": schools,
        "mapping": mapping,
        "school_skins": school_skins,
        "school_skins_light": school_skins_light,
        "token_profiles": token_profiles,
        "school_energy": dict(sorted(school_energy.items(), key=lambda item: item[1], reverse=True)),
        "school_shares": school_shares,
        "family_energy": dict(sorted(family_energy.items(), key=lambda item: item[1], reverse=True)),
        "school_token_count": dict(school_token_count),
        "total_energy": total_energy,
        "dominant_school": dominant_school,
        "accent_school": accent_school,
        "shadow_school": shadow_school,
        "ritual_hue": ritual_hue,
        "dominant_hue": dominant_hue,
        "entropy": entropy,
        "resonance": resonance,
        "warm_bias": warm_bias,
        "dominant_meta": dominant_meta,
        "top_tokens": top_tokens,
        "top_families": top_families,
    }


def pick_accent_school(dominant_school: str, shares: Dict[str, float], schools: Dict[str, Dict[str, object]]) -> str:
    if len(shares) <= 1:
        return dominant_school

    dominant_hue = float((schools.get(dominant_school) or {}).get("colorHsl", {}).get("h", 265))
    best_school = dominant_school
    best_score = -1.0

    for school_id, share in shares.items():
        if school_id == dominant_school:
            continue
        hue = float((schools.get(school_id) or {}).get("colorHsl", {}).get("h", dominant_hue))
        distance = circular_distance(dominant_hue, hue)
        harmony = max(
            0.0,
            1.0 - abs(distance - 72.0) / 72.0,
            0.82 - abs(distance - 148.0) / 148.0,
        )
        lightness = float((schools.get(school_id) or {}).get("colorHsl", {}).get("l", 50))
        contrast = abs(lightness - float((schools.get(dominant_school) or {}).get("colorHsl", {}).get("l", 50))) / 50.0
        score = share * 0.58 + harmony * 0.28 + contrast * 0.14
        if score > best_score:
            best_score = score
            best_school = school_id

    return best_school


def pick_shadow_school(dominant_school: str, shares: Dict[str, float], schools: Dict[str, Dict[str, object]]) -> str:
    if shares.get("VOID", 0.0) >= 0.04:
        return "VOID"

    best_school = dominant_school
    best_score = -1.0
    for school_id, share in shares.items():
        lightness = float((schools.get(school_id) or {}).get("colorHsl", {}).get("l", 50))
        depth = 1.0 - clamp(lightness / 100.0, 0.0, 1.0)
        score = share * 0.45 + depth * 0.55
        if score > best_score:
            best_score = score
            best_school = school_id
    return best_school


def derive_theme_palette(profile: Dict[str, object], theme: str) -> Dict[str, str]:
    schools = profile["schools"]
    dominant_school = profile["dominant_school"]
    entropy = float(profile["entropy"])
    resonance = float(profile["resonance"])
    ritual_hue = float(profile["ritual_hue"])

    dominant_meta = schools.get(dominant_school) or {"color": "#ef4444", "colorHsl": {"h": 0, "s": 85, "l": 48}}
    h = float(dominant_meta["colorHsl"]["h"])
    s = float(dominant_meta["colorHsl"]["s"])
    l = float(dominant_meta["colorHsl"]["l"])

    if theme == "dark":
        # 4 Neutral/Structural Slots
        abyss = hsl_to_hex(ritual_hue, 20, 6)
        panel = hsl_to_hex(h, 25, 12)
        parchment = "#e6e4da"
        ink = "#f1efec"

        # 7 Distinct Functional Slots (The 7-Color System)
        # We space these around the dominant hue using harmonic intervals (72 deg = Pentadic harmony)
        primary = dominant_meta["color"]
        secondary = hsl_to_hex((h + 72) % 360, 60, 55)
        tertiary = hsl_to_hex((h + 144) % 360, 50, 45)
        border = hsl_to_hex(h, 30, 30)
        glow = hsl_to_hex(h, 80, 75)
        aurora_start = hsl_to_hex(h, 70, 60)
        aurora_end = hsl_to_hex((h + 45) % 360, 60, 50)
    else:
        abyss = hsl_to_hex(ritual_hue, 15, 95)
        panel = hsl_to_hex(h, 20, 90)
        parchment = "#333333"
        ink = "#090916"

        primary = dominant_meta["color"]
        secondary = hsl_to_hex((h + 72) % 360, 50, 45)
        tertiary = hsl_to_hex((h + 144) % 360, 40, 35)
        border = hsl_to_hex(h, 20, 70)
        glow = hsl_to_hex(h, 60, 40)
        aurora_start = hsl_to_hex(h, 50, 50)
        aurora_end = hsl_to_hex((h + 45) % 360, 40, 60)

    return {
        "abyss": abyss,
        "panel": panel,
        "parchment": parchment,
        "ink": ink,
        "primary": primary,
        "secondary": secondary,
        "tertiary": tertiary,
        "border": border,
        "glow": glow,
        "aurora_start": aurora_start,
        "aurora_end": aurora_end,
    }


def derive_family_palette(profile: Dict[str, object], theme: str) -> Dict[str, str]:
    skins = profile["school_skins"] if theme == "dark" else profile["school_skins_light"]
    mapping = profile["mapping"]
    family_energy = profile["family_energy"]
    if not family_energy:
        return {}

    max_energy = max(family_energy.values()) or 1.0
    family_palette: Dict[str, str] = {}

    ordered_families = [family for family in FAMILY_ORDER if family in family_energy]
    ordered_families.extend([family for family in family_energy if family not in ordered_families])

    for family in ordered_families:
        school_id = mapping.get(family, "DEFAULT")
        base_color = safe_text((skins.get(school_id) or {}).get(family) or (profile["schools"].get(school_id) or {}).get("color") or "#888888")
        hue, saturation, lightness = hex_to_hsl(base_color)
        energy_ratio = family_energy.get(family, 0.0) / max_energy

        if theme == "dark":
            refined = hsl_to_hex(
                hue,
                clamp(saturation * (0.94 + energy_ratio * 0.16), 16, 92),
                clamp(lightness + energy_ratio * 7 - 2, 14, 86),
            )
        else:
            refined = hsl_to_hex(
                hue,
                clamp(saturation * (0.92 + energy_ratio * 0.10), 14, 88),
                clamp(lightness - (7 - energy_ratio * 4), 12, 76),
            )

        family_palette[family] = refined

    return family_palette


def build_palette_bytecode(profile: Dict[str, object], dark_palette: Dict[str, str], light_palette: Dict[str, str]) -> List[str]:
    schools = profile["schools"]
    dominant_school = profile["dominant_school"]
    accent_school = profile["accent_school"]
    shadow_school = profile["shadow_school"]
    dominant_hue = float((schools.get(dominant_school) or {}).get("colorHsl", {}).get("h", 265))
    accent_hue = float((schools.get(accent_school) or {}).get("colorHsl", {}).get("h", dominant_hue))
    hue_distance = circular_distance(dominant_hue, accent_hue)

    lines = ["PALETTE_BYTECODE v1"]

    for school_id, energy in list(profile["school_energy"].items())[:5]:
        school = schools.get(school_id) or {}
        color_hsl = school.get("colorHsl") or {}
        share = profile["school_shares"].get(school_id, 0.0)
        lines.append(
            "LOAD_SCHOOL "
            f"{school_id} share={share:.4f} energy={energy:.4f} "
            f"h={float(color_hsl.get('h', 0)):.1f} s={float(color_hsl.get('s', 0)):.1f} l={float(color_hsl.get('l', 0)):.1f}"
        )

    lines.append(f"SET_DOMINANT {dominant_school} share={profile['school_shares'].get(dominant_school, 0.0):.4f}")
    lines.append(f"SET_ACCENT {accent_school} hue_distance={hue_distance:.2f}")
    lines.append(f"SET_SHADOW {shadow_school}")
    lines.append(
        "SET_FIELD "
        f"ritual_hue={profile['ritual_hue']:.2f} entropy={profile['entropy']:.4f} "
        f"resonance={profile['resonance']:.4f} warmth={profile['warm_bias']:.4f}"
    )

    for theme_name, palette in (("DARK", dark_palette), ("LIGHT", light_palette)):
        for slot in THEME_SLOT_ORDER:
            lines.append(f"EMIT_SLOT {theme_name} {slot.upper()} {palette[slot]}")

    return lines


def format_school_section(profile: Dict[str, object]) -> List[str]:
    schools = profile["schools"]
    lines = []
    for school_id, energy in profile["school_energy"].items():
        share = profile["school_shares"].get(school_id, 0.0)
        token_count = profile["school_token_count"].get(school_id, 0)
        color = safe_text((schools.get(school_id) or {}).get("color") or "#888888")
        lines.append(
            f"- {school_id:<11} energy={energy:6.3f} share={share:6.3%} "
            f"tokens={token_count:<3} base={color}"
        )
    return lines


def format_token_section(profile: Dict[str, object]) -> List[str]:
    lines = []
    for entry in profile["top_tokens"]:
        anchor = " anchor" if entry["isAnchor"] else ""
        lines.append(
            f"- {entry['text']:<14} energy={entry['energy']:.3f} "
            f"school={entry['school']:<11} family={entry['family']:<3} "
            f"effect={entry['effectClass']}{anchor}"
        )
    return lines


def format_family_palette(profile: Dict[str, object], theme: str, palette: Dict[str, str]) -> List[str]:
    lines = []
    for family, color in palette.items():
        energy = profile["family_energy"].get(family, 0.0)
        school = profile["mapping"].get(family, "DEFAULT")
        lines.append(f"- {family:<3} {color} school={school:<11} energy={energy:.3f}")
    return lines


def format_theme_slots(palette: Dict[str, str]) -> List[str]:
    return [f"- {slot:<13} {palette[slot]}" for slot in THEME_SLOT_ORDER]


def build_report(profile: Dict[str, object], dark_palette: Dict[str, str], light_palette: Dict[str, str], dark_families: Dict[str, str], light_families: Dict[str, str], bytecode: List[str]) -> str:
    payload = profile["payload"]
    metadata = payload.get("metadata") or {}
    verse_ir = payload.get("verseIR") or {}

    equation = (
        "energy = 0.28 + 0.24*syllable_depth + 0.15*stress + 0.10*onset_density + "
        "0.08*coda_density + 0.07*consonant_force + 0.11*rhyme_heat + "
        "0.09*bytecode_glow + 0.08*bytecode_saturation, with anchor / authority bonuses "
        "and stop-word / unknown-phonetics damping."
    )

    sections = [
        "VISUALBYTECODE COLOR SCHEME REPORT",
        "=================================",
        "",
        "INPUT",
        "-----",
        f"Generated at: {metadata.get('generatedAt', 'unknown')}",
        f"VerseIR version: {verse_ir.get('version', '')}",
        f"Token count: {metadata.get('tokenCount', 0)}",
        f"Line count: {metadata.get('lineCount', 0)}",
        f"Visual mode: {metadata.get('visualMode', 'AESTHETIC')}",
        f"SHA256: {metadata.get('sha256', '')}",
        "",
        "SOURCE TEXT",
        "-----------",
        safe_text(verse_ir.get("rawText")),
        "",
        "ALGORITHM",
        "---------",
        equation,
        "",
        "SPECTRAL FIELD",
        "--------------",
        f"Dominant school: {profile['dominant_school']}",
        f"Accent school: {profile['accent_school']}",
        f"Shadow school: {profile['shadow_school']}",
        f"Ritual hue: {profile['ritual_hue']:.2f}",
        f"Entropy: {profile['entropy']:.4f}",
        f"Resonance: {profile['resonance']:.4f}",
        f"Warm bias: {profile['warm_bias']:.4f}",
        "",
        "SCHOOL ENERGY",
        "-------------",
        *format_school_section(profile),
        "",
        "TOP TOKENS",
        "----------",
        *format_token_section(profile),
        "",
        "PALETTE BYTECODE",
        "----------------",
        *[f"- {line}" for line in bytecode],
        "",
        "DARK RITUAL SCHEME",
        "------------------",
        *format_theme_slots(dark_palette),
        "",
        "LIGHT RITUAL SCHEME",
        "-------------------",
        *format_theme_slots(light_palette),
        "",
        "DARK FAMILY REFINEMENTS",
        "-----------------------",
        *format_family_palette(profile, "dark", dark_families),
        "",
        "LIGHT FAMILY REFINEMENTS",
        "------------------------",
        *format_family_palette(profile, "light", light_families),
        "",
    ]

    return "\n".join(sections).rstrip() + "\n"


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    payload = resolve_payload(args)
    profile = build_profile(payload)
    dark_palette = derive_theme_palette(profile, "dark")
    light_palette = derive_theme_palette(profile, "light")
    dark_families = derive_family_palette(profile, "dark")
    light_families = derive_family_palette(profile, "light")
    bytecode = build_palette_bytecode(profile, dark_palette, light_palette)
    report = build_report(profile, dark_palette, light_palette, dark_families, light_families, bytecode)

    output_path = args.output.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report, encoding="utf8")
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
