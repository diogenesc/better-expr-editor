import { StreamLanguage } from "@codemirror/language"

const builtins = new Set([
  "len", "filter", "map", "all", "any", "none", "one", "count",
  "sum", "mean", "median", "reduce", "find", "findIndex", "findLast", "findLastIndex",
  "groupBy", "sortBy", "sort", "type", "abs", "ceil", "floor", "round",
  "int", "float", "string", "trim", "upper", "lower", "split", "replace",
  "join", "concat", "flatten", "uniq", "reverse", "keys", "values",
  "toPairs", "fromPairs", "toJSON", "fromJSON", "toBase64", "fromBase64",
  "now", "duration", "date", "timezone", "first", "last", "get", "take",
  "min", "max", "assert", "throw",
])

const keywords = new Set([
  "and", "or", "not", "in", "matches", "contains", "startsWith", "endsWith",
  "let", "if", "else", "true", "false", "nil",
])

const hexRegex = /^0[xX][0-9a-fA-F_]+$/
const octRegex = /^0[oO][0-7_]+$/
const binRegex = /^0[bB][01_]+$/

export function exprLanguage() {
  return StreamLanguage.define<{}>({
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
        if (keywords.has(word)) return word === "true" || word === "false" || word === "nil" ? "atom" : "keyword"
        if (builtins.has(word)) return "typeName"
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
}
