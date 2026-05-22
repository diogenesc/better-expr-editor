import { StreamLanguage } from "@codemirror/language"
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete"
import { hoverTooltip, type Tooltip } from "@codemirror/view"
import type { Extension } from "@codemirror/state"

export interface ExprFunctionDef {
  name: string
  signature?: string
  detail?: string
  info?: string
}

export interface ExprLanguageOptions {
  customFunctions?: ExprFunctionDef[]
  customKeywords?: string[]
}

const DEFAULT_KEYWORDS = new Set([
  "and", "or", "not", "in", "matches", "contains", "startsWith", "endsWith",
  "let", "if", "else", "true", "false", "nil",
])

const DEFAULT_BUILTINS: ExprFunctionDef[] = [
  { name: "len", signature: "len(v any) int", detail: "Returns length of v" },
  { name: "filter", signature: "filter(array, predicate) array", detail: "Filters array by predicate" },
  { name: "map", signature: "map(array, predicate) array", detail: "Maps array elements" },
  { name: "all", signature: "all(array, predicate) bool", detail: "True if all elements match predicate" },
  { name: "any", signature: "any(array, predicate) bool", detail: "True if any element matches predicate" },
  { name: "none", signature: "none(array, predicate) bool", detail: "True if no element matches predicate" },
  { name: "one", signature: "one(array, predicate) bool", detail: "True if exactly one element matches" },
  { name: "count", signature: "count(array, predicate) int", detail: "Counts elements matching predicate" },
  { name: "sum", signature: "sum(array) number", detail: "Sum of array elements" },
  { name: "mean", signature: "mean(array) number", detail: "Mean of array elements" },
  { name: "median", signature: "median(array) number", detail: "Median of array elements" },
  { name: "reduce", signature: "reduce(array, fn, initial) any", detail: "Reduces array" },
  { name: "find", signature: "find(array, predicate) any", detail: "Finds first matching element" },
  { name: "findIndex", signature: "findIndex(array, predicate) int", detail: "Index of first match" },
  { name: "findLast", signature: "findLast(array, predicate) any", detail: "Finds last matching element" },
  { name: "findLastIndex", signature: "findLastIndex(array, predicate) int", detail: "Index of last match" },
  { name: "groupBy", signature: "groupBy(array, key) map", detail: "Groups array by key" },
  { name: "sortBy", signature: "sortBy(array, key, order?) array", detail: "Sorts array by key" },
  { name: "sort", signature: "sort(array) array", detail: "Sorts array" },
  { name: "type", signature: "type(val) string", detail: "Returns type name" },
  { name: "abs", signature: "abs(n) number", detail: "Absolute value" },
  { name: "ceil", signature: "ceil(n) number", detail: "Ceiling" },
  { name: "floor", signature: "floor(n) number", detail: "Floor" },
  { name: "round", signature: "round(n) number", detail: "Rounds to nearest integer" },
  { name: "int", signature: "int(val) int", detail: "Converts to int" },
  { name: "float", signature: "float(val) float", detail: "Converts to float" },
  { name: "string", signature: "string(val) string", detail: "Converts to string" },
  { name: "trim", signature: "trim(s, cutset?) string", detail: "Trims string" },
  { name: "upper", signature: "upper(s) string", detail: "To uppercase" },
  { name: "lower", signature: "lower(s) string", detail: "To lowercase" },
  { name: "split", signature: "split(s, sep) []string", detail: "Splits string" },
  { name: "replace", signature: "replace(s, old, new) string", detail: "Replaces in string" },
  { name: "join", signature: "join(arr, sep) string", detail: "Joins array" },
  { name: "concat", signature: "concat(arr...) []any", detail: "Concatenates arrays" },
  { name: "flatten", signature: "flatten(arr) []any", detail: "Flattens nested arrays" },
  { name: "uniq", signature: "uniq(arr) []any", detail: "Unique elements" },
  { name: "reverse", signature: "reverse(arr) []any", detail: "Reverses array" },
  { name: "keys", signature: "keys(map) []string", detail: "Map keys" },
  { name: "values", signature: "values(map) []any", detail: "Map values" },
  { name: "toPairs", signature: "toPairs(map) [][]any", detail: "Map to key-value pairs" },
  { name: "fromPairs", signature: "fromPairs(arr) map", detail: "Pairs to map" },
  { name: "toJSON", signature: "toJSON(val) string", detail: "To JSON string" },
  { name: "fromJSON", signature: "fromJSON(s) any", detail: "From JSON string" },
  { name: "toBase64", signature: "toBase64(s) string", detail: "To base64" },
  { name: "fromBase64", signature: "fromBase64(s) string", detail: "From base64" },
  { name: "now", signature: "now() time", detail: "Current time" },
  { name: "duration", signature: "duration(s) duration", detail: "Parses duration" },
  { name: "date", signature: "date(s, format?) time", detail: "Parses date" },
  { name: "timezone", signature: "timezone(name) location", detail: "Returns timezone" },
  { name: "first", signature: "first(arr) any", detail: "First element" },
  { name: "last", signature: "last(arr) any", detail: "Last element" },
  { name: "get", signature: "get(map, key, default?) any", detail: "Get from map with default" },
  { name: "take", signature: "take(arr, n) []any", detail: "Takes first n elements" },
  { name: "min", signature: "min(a, b) number", detail: "Minimum" },
  { name: "max", signature: "max(a, b) number", detail: "Maximum" },
  { name: "assert", signature: "assert(cond, msg?)", detail: "Asserts condition" },
  { name: "throw", signature: "throw(msg)", detail: "Throws error" },
]

let currentFunctions: ExprFunctionDef[] = [...DEFAULT_BUILTINS]
let currentBuiltinSet = new Set(currentFunctions.map(f => f.name))
let currentKeywords = new Set(DEFAULT_KEYWORDS)

function buildSets(funcs: ExprFunctionDef[], keywords: string[]) {
  currentFunctions = funcs
  currentBuiltinSet = new Set(funcs.map(f => f.name))
  currentKeywords = new Set([...DEFAULT_KEYWORDS, ...keywords])
}

export function setExprFunctions(funcs: ExprFunctionDef[], keywords?: string[]) {
  buildSets(funcs, keywords || [])
}

export function getExprFunctions(): ExprFunctionDef[] {
  return currentFunctions
}

function autocompleteSource(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/\w+/)
  if (!word || (word.from === word.to && !ctx.explicit)) return null

  const options: Completion[] = []
  for (const fn of currentFunctions) {
    if (fn.name.startsWith(word.text)) {
      let label = fn.name
      if (fn.signature) label = fn.signature
      options.push({
        label,
        type: "function",
        detail: fn.detail || fn.name,
        info: fn.info || undefined,
        apply: fn.name + "()",
      })
    }
  }

  if (options.length === 0) return null

  const seen = new Set<string>()
  const deduped = options.filter(o => {
    if (seen.has(o.label)) return false
    seen.add(o.label)
    return true
  })

  return {
    from: word.from,
    options: deduped,
    validFor: /^\w*$/,
  }
}

function hoverSource(view: any, pos: number, side: number): Tooltip | null {
  const { from, to } = view.state.doc.lineAt(pos)
  let start = pos
  let end = pos
  while (start > from && /\w/.test(view.state.doc.sliceString(start - 1, start))) start--
  while (end < to && /\w/.test(view.state.doc.sliceString(end, end + 1))) end++

  const word = view.state.doc.sliceString(start, end)
  if (!word || !currentBuiltinSet.has(word)) return null

  const fn = currentFunctions.find(f => f.name === word)
  if (!fn || (!fn.signature && !fn.info && !fn.detail)) return null

  const dom = document.createElement("div")
  dom.style.padding = "4px 8px"
  dom.style.maxWidth = "420px"
  dom.style.fontSize = "13px"

  if (fn.signature) {
    const sig = document.createElement("code")
    sig.textContent = fn.signature
    sig.style.fontWeight = "600"
    dom.appendChild(sig)
  }
  if (fn.info || fn.detail) {
    const desc = document.createElement("div")
    desc.style.marginTop = fn.signature ? "4px" : "0"
    desc.style.opacity = "0.75"
    desc.textContent = fn.info || fn.detail || ""
    dom.appendChild(desc)
  }

  return {
    pos: start,
    end,
    above: true,
    create: () => ({ dom }),
  }
}

export function exprLanguage(opts?: ExprLanguageOptions): Extension[] {
  if (opts?.customFunctions || opts?.customKeywords) {
    buildSets(
      [...DEFAULT_BUILTINS, ...(opts.customFunctions || [])],
      opts.customKeywords || [],
    )
  }

  const lang = StreamLanguage.define<{}>({
    token(stream) {
      if (stream.eatSpace()) return null

      if (stream.match("//")) {
        stream.skipToEnd()
        return "comment"
      }

      if (stream.match("/*")) {
        let depth = 1
        while (depth > 0 && !stream.eol()) {
          const ch = stream.next()
          if (ch === "/" && stream.peek() === "*") {
            stream.next()
            depth++
          } else if (ch === "*" && stream.peek() === "/") {
            stream.next()
            depth--
          }
        }
        return "comment"
      }

      if (stream.match(/^b"/) || stream.match(/^b'/)) {
        const quote = stream.string[stream.start + 1]
        while (!stream.eol()) {
          const ch = stream.next()
          if (ch === "\\") stream.next()
          else if (ch === quote) break
        }
        return "string"
      }

      if (stream.match(/^"/) || stream.match(/^'/)) {
        const quote = stream.string[stream.start]
        while (!stream.eol()) {
          const ch = stream.next()
          if (ch === "\\") stream.next()
          else if (ch === quote) break
        }
        return "string"
      }

      if (stream.match(/^`/)) {
        while (!stream.eol()) {
          const ch = stream.next()
          if (ch === "`") break
        }
        return "string"
      }

      if (stream.match(/^[0-9](\.[0-9]+)?[eE][+-]?[0-9]+/)) return "number"
      if (stream.match(/^[0-9]+\.[0-9]+/)) return "number"
      if (stream.match(/^\.[0-9]+/)) return "number"

      if (stream.match(/^0[xX][0-9a-fA-F_]+/)) return "number"
      if (stream.match(/^0[oO][0-7_]+/)) return "number"
      if (stream.match(/^0[bB][01_]+/)) return "number"
      if (stream.match(/^[0-9][0-9_]*/)) return "number"

      if (stream.match(/^\.\./)) return "operator"
      if (stream.match(/^\?\?:/)) return "operator"
      if (stream.match(/^\?:/)) return "operator"
      if (stream.match(/^\?\?/)) return "operator"
      if (stream.match(/^\?\./)) return "operator"
      if (stream.match(/^\*\*/)) return "operator"
      if (stream.match(/^<=/)) return "operator"
      if (stream.match(/^>=/)) return "operator"
      if (stream.match(/^==/)) return "operator"
      if (stream.match(/^!=/)) return "operator"
      if (stream.match(/^[+\-*/%^|]/)) return "operator"
      if (stream.match(/^[<>=!]/)) return "operator"

      if (stream.match(/^#[a-zA-Z_][a-zA-Z0-9_]*/)) return "variableName"
      if (stream.match(/^#/)) return "variableName"

      if (stream.match(/^\$[a-zA-Z_][a-zA-Z0-9_]*/)) return "variableName"

      if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
        const word = stream.current()
        if (currentKeywords.has(word)) return word === "true" || word === "false" || word === "nil" ? "atom" : "keyword"
        if (currentBuiltinSet.has(word)) return "typeName"
        return "variableName"
      }

      if (stream.match(/^\(|^\)/)) return "paren"
      if (stream.match(/^\[|^\]/)) return "bracket"
      if (stream.match(/^\{|^\}/)) return "brace"
      if (stream.match(/^\./)) return "operator"
      if (stream.match(/^,|^;|^:/)) return "punctuation"

      stream.next()
      return null
    },

    startState() {
      return {}
    },
  })

  return [
    lang,
    autocompletion({ override: [autocompleteSource] }),
    hoverTooltip(hoverSource),
  ]
}
