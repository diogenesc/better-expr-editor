import { linter, lintGutter, type Diagnostic } from "@codemirror/lint"
import { type Extension } from "@codemirror/state"
import { type EditorView } from "@codemirror/view"

const PREDICATE_BUILTINS = new Set([
  "map", "filter", "all", "any", "none", "one",
  "count", "find", "findIndex", "findLast", "findLastIndex",
  "groupBy", "reduce", "sortBy",
])

interface RawRPC {
  ok: boolean
  error?: string
  data?: string
}

function parseRPC(raw: string): RawRPC {
  try {
    return JSON.parse(raw)
  } catch {
    return { ok: false, error: `invalid response: ${raw}` }
  }
}

function exprCompileRaw(source: string): string {
  try {
    const raw = (globalThis as any).exprCompile(source)
    const res = parseRPC(raw)
    if (!res.ok) return res.error || "unknown error"
    return ""
  } catch {
    return ""
  }
}

interface LintMessage {
  message: string
  line: number   // 1-indexed
  col: number    // 1-indexed
}

function parseExprError(errorMsg: string): LintMessage | null {
  const m = errorMsg.match(/^(.*?)\s*\((\d+):(\d+)\)/)
  if (!m) return null
  return {
    message: m[1],
    line: parseInt(m[2], 10),
    col: parseInt(m[3], 10),
  }
}

function mightBePredicateWrapper(source: string): boolean {
  for (const fn of PREDICATE_BUILTINS) {
    if (source.includes(fn + "(")) return true
  }
  return false
}

function predicateWorkaroundHint(): string {
  return (
    "Use `{let it = #; {'key': it.field}}` to return an object literal " +
    "from a predicate wrapper, or assign to a variable first."
  )
}

function buildDiagnostics(errorMsg: string, source: string, view: EditorView): Diagnostic[] {
  const doc = view.state.doc
  const parsed = parseExprError(errorMsg)

  if (!parsed) {
    const diag: Diagnostic = {
      from: 0,
      to: doc.length || 1,
      severity: "error",
      message: `Expr: ${errorMsg}`,
      source: "Expr",
    }
    return [diag]
  }

  const line = Math.max(1, Math.min(parsed.line, doc.lines))
  const lineObj = doc.line(line)
  const col = Math.max(0, Math.min(parsed.col - 1, lineObj.length - 1))
  const from = lineObj.from + col
  const to = Math.min(from + 1, doc.length)

  let message = `Expr: ${parsed.message}`

  if (
    /unexpected token Operator\(":"\)/.test(parsed.message) &&
    mightBePredicateWrapper(source)
  ) {
    message += "\n\n" + predicateWorkaroundHint()
  }

  const diag: Diagnostic = {
    from,
    to,
    severity: "error",
    message,
    source: "Expr",
  }

  return [diag]
}

export function exprLinter(): Extension[] {
  const source = (view: EditorView): Diagnostic[] => {
    const text = view.state.doc.toString().trim()
    if (!text) return []

    const errorMsg = exprCompileRaw(text)
    if (!errorMsg) return []

    return buildDiagnostics(errorMsg, text, view)
  }

  return [
    lintGutter(),
    linter(source, { delay: 750 }),
  ]
}
