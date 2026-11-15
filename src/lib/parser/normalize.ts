// Superscript normalization: Moodle/Word exports use unicode ordinals like
// "6ᵗʰ November" / "22ⁿᵈ March" / "1ˣᵗ February" which chrono cannot read.
const SUPERSCRIPTS: Record<string, string> = {
  "ᵃ": "a", "ᵇ": "b", "ᵈ": "d", "ᵉ": "e",
  "ᵍ": "g", "ʰ": "h", "ⁱ": "i", "ʲ": "j", "ᵏ": "k", "ˡ": "l",
  "ᵐ": "m", "ⁿ": "n", "ᵒ": "o", "ᵖ": "p", "ʳ": "r", "ˢ": "s",
  "ᵗ": "t", "ᵘ": "u", "ᵛ": "v", "ʷ": "w", "ˣ": "x", "ʸ": "y",
  "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6",
  "⁷": "7", "⁸": "8", "⁹": "9", "⁰": "0",
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

// Spacing modifier letters (ʰ ˢ ʳ ᵉ…), Latin superscript modifiers
// (ᵃ ᵈ ᵗ …) and superscript/subscript number blocks — covers the ordinal
// glyphs Moodle/Word emit: 1ˢᵗ 2ⁿᵈ 3ʳᵈ 6ᵗʰ.
const SUPERSCRIPT_RE = /[ʰ-˿᪰-ᵿ⁰-₟¹²³⁴⁵⁶⁷⁸⁹]/g;

/** Fold unicode superscripts/subscripts to ASCII so chrono can parse them. */
export function normalizeText(text: string): string {
  return text.replace(SUPERSCRIPT_RE, (ch) => SUPERSCRIPTS[ch] ?? ch);
}
