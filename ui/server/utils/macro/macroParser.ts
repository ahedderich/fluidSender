export class MacroParseError extends Error {
  constructor(
    public lineNum: number,
    message: string,
  ) {
    super(message)
    this.name = 'MacroParseError'
  }
}

// ─── Internal node types ─────────────────────────────────────────────────────

type MacroNode =
  | { kind: 'gcode'; line: string; lineNum: number }
  | { kind: 'assign'; varName: string; expr: string; lineNum: number }
  | { kind: 'subst'; template: string; lineNum: number }
  | { kind: 'wait'; lineNum: number }
  | { kind: 'msg'; text: string; lineNum: number }
  | {
      kind: 'if'
      condition: string
      then: MacroNode[]
      elseIfs: { condition: string; body: MacroNode[] }[]
      else_: MacroNode[] | null
      lineNum: number
    }
  | { kind: 'while'; condition: string; body: MacroNode[]; lineNum: number }

export interface ParseResult {
  nodes: MacroNode[]
  requiresToolChange: boolean
}

// ─── Parser ───────────────────────────────────────────────────────────────────

type StackFrame =
  | {
      kind: 'if'
      node: Extract<MacroNode, { kind: 'if' }>
      /** which branch we're currently filling: 'then' | 'elseif' | 'else' */
      branch: 'then' | 'elseif' | 'else'
    }
  | { kind: 'while'; node: Extract<MacroNode, { kind: 'while' }> }

function currentTarget(stack: StackFrame[]): MacroNode[] {
  if (stack.length === 0) return []
  const frame = stack[stack.length - 1]!
  if (frame.kind === 'while') return frame.node.body
  if (frame.branch === 'then') return frame.node.then
  if (frame.branch === 'elseif') return frame.node.elseIfs[frame.node.elseIfs.length - 1]!.body
  return (frame.node.else_ ??= [])
}

function extractBracketCondition(directive: string, keyword: string, lineNum: number): string {
  const rest = directive.slice(keyword.length).trim()
  if (!rest.startsWith('[')) {
    throw new MacroParseError(lineNum, `'${keyword}' condition must be enclosed in [brackets]`)
  }
  const close = rest.lastIndexOf(']')
  if (close === -1) {
    throw new MacroParseError(lineNum, `'${keyword}' condition must be enclosed in [brackets]`)
  }
  return rest.slice(1, close).trim()
}

export function parseMacro(gcode: string): ParseResult {
  const lines = gcode.split('\n')
  const roots: MacroNode[] = []
  const stack: StackFrame[] = []

  const push = (node: MacroNode) => {
    if (stack.length === 0) {
      roots.push(node)
    } else {
      currentTarget(stack).push(node)
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const raw = lines[i]!.trim()

    // 1. Empty or comment
    if (raw === '' || raw.startsWith(';')) continue

    // 2. %wait
    if (/^%wait\b/i.test(raw)) {
      push({ kind: 'wait', lineNum })
      continue
    }

    // 3. %msg
    if (/^%msg\b/i.test(raw)) {
      const text = raw.slice(4).trim()
      push({ kind: 'msg', text, lineNum })
      continue
    }

    // 4. %if [condition]
    if (/^%if\s*\[/i.test(raw)) {
      const condition = extractBracketCondition(raw, raw.slice(0, raw.indexOf('[')).trimEnd(), lineNum)
      const node: Extract<MacroNode, { kind: 'if' }> = {
        kind: 'if',
        condition,
        then: [],
        elseIfs: [],
        else_: null,
        lineNum,
      }
      stack.push({ kind: 'if', node, branch: 'then' })
      continue
    }

    // 5. %elseif [condition]
    if (/^%elseif\s*\[/i.test(raw)) {
      const frame = stack[stack.length - 1]
      if (!frame || frame.kind !== 'if') {
        throw new MacroParseError(lineNum, `'%elseif' without matching '%if'`)
      }
      if (frame.branch === 'else') {
        throw new MacroParseError(lineNum, `'%elseif' after '%else'`)
      }
      const condition = extractBracketCondition(raw, raw.slice(0, raw.indexOf('[')).trimEnd(), lineNum)
      frame.node.elseIfs.push({ condition, body: [] })
      frame.branch = 'elseif'
      continue
    }

    // 6. %else
    if (/^%else\b/i.test(raw)) {
      const frame = stack[stack.length - 1]
      if (!frame || frame.kind !== 'if') {
        throw new MacroParseError(lineNum, `'%else' without matching '%if'`)
      }
      frame.branch = 'else'
      frame.node.else_ = []
      continue
    }

    // 7. %endif
    if (/^%endif\b/i.test(raw)) {
      const frame = stack[stack.length - 1]
      if (!frame || frame.kind !== 'if') {
        throw new MacroParseError(lineNum, `'%endif' without matching '%if'`)
      }
      const node = frame.node
      stack.pop()
      push(node)
      continue
    }

    // 8. %while [condition]
    if (/^%while\s*\[/i.test(raw)) {
      const condition = extractBracketCondition(raw, raw.slice(0, raw.indexOf('[')).trimEnd(), lineNum)
      const node: Extract<MacroNode, { kind: 'while' }> = {
        kind: 'while',
        condition,
        body: [],
        lineNum,
      }
      stack.push({ kind: 'while', node })
      continue
    }

    // 9. %endwhile
    if (/^%endwhile\b/i.test(raw)) {
      const frame = stack[stack.length - 1]
      if (!frame || frame.kind !== 'while') {
        throw new MacroParseError(lineNum, `'%endwhile' without matching '%while'`)
      }
      const node = frame.node
      stack.pop()
      push(node)
      continue
    }

    // 10. % assignment: %varname = expr
    if (raw.startsWith('%')) {
      const rest = raw.slice(1).trim()
      const eqIdx = rest.indexOf('=')
      if (eqIdx === -1) {
        throw new MacroParseError(lineNum, `Invalid macro directive: '${raw}'`)
      }
      const varName = rest.slice(0, eqIdx).trim()
      const expr = rest.slice(eqIdx + 1).trim()
      if (!varName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
        throw new MacroParseError(lineNum, `Invalid variable name: '${varName}'`)
      }
      push({ kind: 'assign', varName, expr, lineNum })
      continue
    }

    // 11. Contains [ → substitution template
    if (raw.includes('[')) {
      push({ kind: 'subst', template: raw, lineNum })
      continue
    }

    // 12. Plain GCode
    push({ kind: 'gcode', line: raw, lineNum })
  }

  // Check for unclosed blocks
  for (const frame of stack) {
    if (frame.kind === 'if') {
      throw new MacroParseError(
        frame.node.lineNum,
        `'%if' at line ${frame.node.lineNum} has no matching '%endif'`,
      )
    }
    if (frame.kind === 'while') {
      throw new MacroParseError(
        frame.node.lineNum,
        `'%while' at line ${frame.node.lineNum} has no matching '%endwhile'`,
      )
    }
  }

  return {
    nodes: roots,
    requiresToolChange: _detectTcUsage(roots),
  }
}

// ─── requiresToolChange detection ────────────────────────────────────────────

function _collectExprs(nodes: MacroNode[]): string[] {
  const exprs: string[] = []
  for (const node of nodes) {
    switch (node.kind) {
      case 'assign':
        exprs.push(node.expr)
        break
      case 'subst': {
        // extract all [...] from template
        const re = /\[([^\]]+)\]/g
        let m
        while ((m = re.exec(node.template)) !== null) exprs.push(m[1]!)
        break
      }
      case 'if':
        exprs.push(node.condition)
        exprs.push(..._collectExprs(node.then))
        for (const ei of node.elseIfs) {
          exprs.push(ei.condition)
          exprs.push(..._collectExprs(ei.body))
        }
        if (node.else_) exprs.push(..._collectExprs(node.else_))
        break
      case 'while':
        exprs.push(node.condition)
        exprs.push(..._collectExprs(node.body))
        break
    }
  }
  return exprs
}

function _detectTcUsage(nodes: MacroNode[]): boolean {
  return _collectExprs(nodes).some((e) => e.includes('tc.'))
}
