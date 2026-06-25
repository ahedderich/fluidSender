/// A parsed GCode word: letter + value.
#[derive(Debug, Clone, PartialEq)]
pub struct Word {
    pub letter: char,
    pub value: f64,
}

/// Top-level result of parsing one input line.
#[derive(Debug, Clone, PartialEq)]
pub enum ParsedLine {
    /// Standard GCode line (one or more words)
    GCode(Vec<Word>),
    /// Jog command: `$J=...`
    Jog(Vec<Word>),
    /// Status query — real-time, sent as `?` standalone byte or line
    StatusQuery,
    /// Feed hold `!`
    FeedHold,
    /// Cycle start `~`
    CycleStart,
    /// Soft reset 0x18
    SoftReset,
    /// Jog cancel 0x85
    JogCancel,
    /// `$H` — run homing
    Home,
    /// `$X` — alarm unlock
    Unlock,
    /// `$RS=` — firmware restart
    Restart,
    /// `$$` — dump all settings
    DumpSettings,
    /// `$Config/key` — read a single config key
    ConfigRead(String),
    /// `$key=value` — write a config/settings value
    ConfigWrite(String, String),
    /// Empty line — respond with `ok`
    Empty,
    /// Unknown / unrecognised — respond with `error:20`
    Unknown(String),
}

/// Detects real-time single-byte commands without line parsing.
pub fn is_realtime_byte(b: u8) -> bool {
    matches!(b, 0x18 | 0x19 | 0x1A | 0x1B | 0x21 | 0x3F | 0x7E | 0x84 | 0x85
               | 0x90..=0x9F)
}

pub fn parse_line(raw: &str) -> ParsedLine {
    let trimmed = raw.trim();

    // Single real-time characters that might arrive as lines
    if trimmed == "?" { return ParsedLine::StatusQuery; }
    if trimmed == "!" { return ParsedLine::FeedHold; }
    if trimmed == "~" { return ParsedLine::CycleStart; }
    // 0x18 as string char
    // Real-time single-byte commands that may arrive as a one-byte "line"
    if trimmed.as_bytes() == [0x18] { return ParsedLine::SoftReset; }
    if trimmed.as_bytes() == [0x85] { return ParsedLine::JogCancel; }

    if trimmed.is_empty() { return ParsedLine::Empty; }

    // $ system commands
    if let Some(rest) = trimmed.strip_prefix('$') {
        return parse_dollar(rest);
    }

    // GCode line
    match parse_gcode_words(trimmed) {
        Ok(words) if !words.is_empty() => ParsedLine::GCode(words),
        Ok(_) => ParsedLine::Empty,
        Err(_) => ParsedLine::Unknown(trimmed.to_string()),
    }
}

fn parse_dollar(rest: &str) -> ParsedLine {
    if rest.is_empty() || rest == "$" {
        return ParsedLine::DumpSettings;
    }
    if rest == "H" { return ParsedLine::Home; }
    if rest == "X" { return ParsedLine::Unlock; }
    if rest.starts_with("RS") { return ParsedLine::Restart; }

    // $J=<gcode>
    if let Some(jog_part) = rest.strip_prefix("J=") {
        return match parse_gcode_words(jog_part) {
            Ok(words) => ParsedLine::Jog(words),
            Err(_) => ParsedLine::Unknown(format!("$J={}", jog_part)),
        };
    }

    // $Config/key
    if let Some(key) = rest.strip_prefix("Config/") {
        return ParsedLine::ConfigRead(key.to_string());
    }

    // $key=value (settings write)
    if let Some(eq_pos) = rest.find('=') {
        let key = rest[..eq_pos].to_string();
        let val = rest[eq_pos + 1..].to_string();
        return ParsedLine::ConfigWrite(key, val);
    }

    ParsedLine::Unknown(format!("${}", rest))
}

/// Parse GCode words from a line. Strips comments (parentheses and semicolons).
pub fn parse_gcode_words(line: &str) -> Result<Vec<Word>, String> {
    let mut words = Vec::new();
    let mut chars = line.chars().peekable();
    let mut in_comment = false;

    while let Some(c) = chars.next() {
        if c == '(' { in_comment = true; continue; }
        if c == ')' { in_comment = false; continue; }
        if c == ';' { break; } // rest is comment
        if in_comment || c.is_whitespace() { continue; }

        if c.is_ascii_alphabetic() {
            let letter = c.to_ascii_uppercase();
            // Read number (including sign and decimal)
            let mut num_str = String::new();
            if matches!(chars.peek(), Some('-') | Some('+')) {
                num_str.push(chars.next().unwrap());
            }
            while matches!(chars.peek(), Some('0'..='9') | Some('.')) {
                num_str.push(chars.next().unwrap());
            }
            if num_str.is_empty() || num_str == "-" || num_str == "+" {
                return Err(format!("Missing number after '{}'", letter));
            }
            let value: f64 = num_str.parse().map_err(|_| format!("Bad number: {}", num_str))?;
            words.push(Word { letter, value });
        } else {
            return Err(format!("Unexpected char: {}", c));
        }
    }

    Ok(words)
}

/// Extract axis words from a word list into an indexed array [X,Y,Z,A,B,C].
pub fn extract_axes(words: &[Word]) -> [Option<f64>; 6] {
    let mut axes = [None; 6];
    for w in words {
        match w.letter {
            'X' => axes[0] = Some(w.value),
            'Y' => axes[1] = Some(w.value),
            'Z' => axes[2] = Some(w.value),
            'A' => axes[3] = Some(w.value),
            'B' => axes[4] = Some(w.value),
            'C' => axes[5] = Some(w.value),
            _ => {}
        }
    }
    axes
}

/// Extract a word value by letter.
pub fn word_val(words: &[Word], letter: char) -> Option<f64> {
    words.iter().find(|w| w.letter == letter.to_ascii_uppercase()).map(|w| w.value)
}

/// Collect all G-codes and M-codes in the word list.
pub fn gcodes(words: &[Word]) -> Vec<f64> {
    words.iter().filter(|w| w.letter == 'G').map(|w| w.value).collect()
}

pub fn mcodes(words: &[Word]) -> Vec<f64> {
    words.iter().filter(|w| w.letter == 'M').map(|w| w.value).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_g0() {
        let ParsedLine::GCode(words) = parse_line("G0 X10 Y20") else { panic!() };
        assert_eq!(words[0], Word { letter: 'G', value: 0.0 });
        assert_eq!(words[1], Word { letter: 'X', value: 10.0 });
        assert_eq!(words[2], Word { letter: 'Y', value: 20.0 });
    }

    #[test]
    fn parse_g1_negative() {
        let ParsedLine::GCode(words) = parse_line("G1 X-5.5 F500") else { panic!() };
        assert_eq!(words[1], Word { letter: 'X', value: -5.5 });
        assert_eq!(words[2], Word { letter: 'F', value: 500.0 });
    }

    #[test]
    fn parse_m3() {
        let ParsedLine::GCode(words) = parse_line("M3 S1000") else { panic!() };
        assert_eq!(words[0], Word { letter: 'M', value: 3.0 });
        assert_eq!(words[1], Word { letter: 'S', value: 1000.0 });
    }

    #[test]
    fn parse_g38_2() {
        let ParsedLine::GCode(words) = parse_line("G38.2 Z-10 F100") else { panic!() };
        assert!((words[0].value - 38.2).abs() < 0.001);
    }

    #[test]
    fn parse_g10_l20() {
        let ParsedLine::GCode(words) = parse_line("G10 L20 P1 X0 Y0 Z0") else { panic!() };
        assert_eq!(word_val(&words, 'G'), Some(10.0));
        assert_eq!(word_val(&words, 'L'), Some(20.0));
        assert_eq!(word_val(&words, 'P'), Some(1.0));
    }

    #[test]
    fn parse_jog() {
        let ParsedLine::Jog(words) = parse_line("$J=G91 X10 F500") else { panic!() };
        assert_eq!(word_val(&words, 'X'), Some(10.0));
        assert_eq!(word_val(&words, 'F'), Some(500.0));
    }

    #[test]
    fn parse_home() {
        assert_eq!(parse_line("$H"), ParsedLine::Home);
    }

    #[test]
    fn parse_unlock() {
        assert_eq!(parse_line("$X"), ParsedLine::Unlock);
    }

    #[test]
    fn parse_status_query() {
        assert_eq!(parse_line("?"), ParsedLine::StatusQuery);
    }

    #[test]
    fn parse_config_read() {
        let ParsedLine::ConfigRead(key) = parse_line("$Config/axes/x/steps_per_mm") else { panic!() };
        assert_eq!(key, "axes/x/steps_per_mm");
    }

    #[test]
    fn parse_config_write() {
        let ParsedLine::ConfigWrite(k, v) = parse_line("$axes/x/steps_per_mm=80.000") else { panic!() };
        assert_eq!(k, "axes/x/steps_per_mm");
        assert_eq!(v, "80.000");
    }

    #[test]
    fn realtime_bytes_detected() {
        assert!(is_realtime_byte(0x18));
        assert!(is_realtime_byte(0x85));
        assert!(is_realtime_byte(0x3F));
        assert!(!is_realtime_byte(b'G'));
    }

    #[test]
    fn strip_comment() {
        let ParsedLine::GCode(words) = parse_line("G0 X5 (move to 5) Y10") else { panic!() };
        assert_eq!(word_val(&words, 'X'), Some(5.0));
        assert_eq!(word_val(&words, 'Y'), Some(10.0));
    }

    #[test]
    fn empty_line() {
        assert_eq!(parse_line("   "), ParsedLine::Empty);
    }
}
