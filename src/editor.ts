import { EditorView, keymap, lineNumbers, highlightSpecialChars, drawSelection } from "@codemirror/view"
import { EditorState, Compartment, Extension } from "@codemirror/state"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search"
import { syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput } from "@codemirror/language"
import { json } from "@codemirror/lang-json"
import { tags } from "@lezer/highlight"
import { exprLanguage } from "./lang"

const darkTheme = EditorView.theme({
  "&": { backgroundColor: "#1a1a2e", color: "#e4e4e4" },
  ".cm-gutters": { backgroundColor: "#16213e", color: "#8888aa", borderRight: "1px solid #2a2a4a" },
  ".cm-activeLineGutter": { backgroundColor: "#0f3460" },
  ".cm-cursor": { borderLeftColor: "#4ea8de" },
  ".cm-selectionBackground": { backgroundColor: "#2a2a4a33" },
  "&.cm-focused .cm-selectionBackground": { backgroundColor: "#2a2a4a55" },
  ".cm-matchingBracket": { backgroundColor: "#2a2a4a", outline: "1px solid #4ea8de" },
}, { dark: true })

const lightTheme = EditorView.theme({
  "&": { backgroundColor: "#ffffff", color: "#212529" },
  ".cm-gutters": { backgroundColor: "#f8f9fa", color: "#6c757d", borderRight: "1px solid #dee2e6" },
}, { dark: false })

const lightHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#d73a49" },
  { tag: tags.atom, color: "#008080" },
  { tag: tags.number, color: "#098658" },
  { tag: tags.string, color: "#032f62" },
  { tag: tags.typeName, color: "#6f42c1" },
  { tag: tags.variableName, color: "#24292e" },
  { tag: tags.comment, color: "#6a737d", fontStyle: "italic" },
  { tag: tags.operator, color: "#d73a49" },
  { tag: tags.paren, color: "#24292e" },
  { tag: tags.bracket, color: "#24292e" },
  { tag: tags.brace, color: "#24292e" },
  { tag: tags.punctuation, color: "#24292e" },
])

const darkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#ff7b72" },
  { tag: tags.atom, color: "#79c0ff" },
  { tag: tags.number, color: "#79c0ff" },
  { tag: tags.string, color: "#a5d6ff" },
  { tag: tags.typeName, color: "#d2a8ff" },
  { tag: tags.variableName, color: "#e4e4e4" },
  { tag: tags.comment, color: "#8b949e", fontStyle: "italic" },
  { tag: tags.operator, color: "#ff7b72" },
  { tag: tags.paren, color: "#e4e4e4" },
  { tag: tags.bracket, color: "#e4e4e4" },
  { tag: tags.brace, color: "#e4e4e4" },
  { tag: tags.punctuation, color: "#e4e4e4" },
])

const allViews: EditorView[] = []
const themeComps = new WeakMap<EditorView, Compartment>()
const hlComps = new WeakMap<EditorView, Compartment>()
let _dark = false

export function createCMEditor(parent: HTMLElement, opts: {
  doc?: string
  language?: Extension
  readOnly?: boolean
  lineNumbers?: boolean
  onCursorUpdate?: (line: number, col: number) => void
  onChange?: (doc: string) => void
} = {}): EditorView {
  const themeComp = new Compartment()
  const hlComp = new Compartment()

  const exts: Extension[] = [
    highlightSpecialChars(),
    bracketMatching(),
    drawSelection(),
    highlightSelectionMatches(),
    themeComp.of(_dark ? darkTheme : lightTheme),
    hlComp.of(syntaxHighlighting(_dark ? darkHighlight : lightHighlight)),
    keymap.of([
      ...searchKeymap,
      ...(opts.readOnly ? [] : [...defaultKeymap, ...historyKeymap, indentWithTab]),
    ]),
  ]

  if (opts.onChange) {
    exts.push(EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onChange!(u.state.doc.toString())
    }))
  }
  if (opts.lineNumbers !== false) exts.push(lineNumbers())
  if (opts.language) exts.push(opts.language)
  if (opts.readOnly) {
    exts.push(EditorState.readOnly.of(true))
  } else {
    exts.push(history())
    exts.push(indentOnInput())
  }

  const view = new EditorView({
    state: EditorState.create({ doc: opts.doc || "", extensions: exts }),
    parent,
  })

  allViews.push(view)
  themeComps.set(view, themeComp)
  hlComps.set(view, hlComp)

  if (opts.onCursorUpdate) {
    view.dom.addEventListener("keyup", () => {
      const pos = view.state.selection.main.head
      const line = view.state.doc.lineAt(pos)
      const col = pos - line.from + 1
      opts.onCursorUpdate!(line.number, col)
    })
  }

  return view
}

export function updateAllThemes(dark: boolean) {
  _dark = dark
  const theme = dark ? darkTheme : lightTheme
  const hl = dark ? syntaxHighlighting(darkHighlight) : syntaxHighlighting(lightHighlight)
  for (const v of allViews) {
    const tc = themeComps.get(v)
    const hc = hlComps.get(v)
    if (tc && hc) {
      v.dispatch({
        effects: [tc.reconfigure(theme), hc.reconfigure(hl)],
      })
    }
  }
}

export function createEditor(parent: HTMLElement, onCursorUpdate: (line: number, col: number) => void): EditorView {
  return createCMEditor(parent, { language: exprLanguage(), onCursorUpdate })
}

export { exprLanguage, json }
