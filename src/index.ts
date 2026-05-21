import "./style.css"
import { EditorView } from "@codemirror/view"
import { createCMEditor, updateAllThemes, exprLanguage, json } from "./editor"
import { loadWasm, onReady, formatSource, runSource } from "./bridge"

const editorContainer = document.getElementById("editor-container")!
const resultContainer = document.getElementById("result-editor-container")!
const envContainer = document.getElementById("env-editor-container")!
const errorsValue = document.getElementById("errors-value")!
const outputErrors = document.getElementById("output-errors")!
const outputLoading = document.getElementById("output-loading")!
const statusCursor = document.getElementById("status-cursor")!
const statusLength = document.getElementById("status-length")!
const statusInfo = document.getElementById("status-info")!
const btnFormat = document.getElementById("btn-format") as HTMLButtonElement
const btnRun = document.getElementById("btn-run") as HTMLButtonElement
const btnTheme = document.getElementById("btn-theme") as HTMLButtonElement
const btnEnvFormat = document.getElementById("btn-env-format") as HTMLButtonElement

let view: EditorView
let envView: EditorView
let resultView: EditorView
let dark = false

function updateStatusLine(line: number, col: number) {
  statusCursor.textContent = `Ln ${line}, Col ${col}`
}

function updateStatusLength() {
  if (!view) return
  const len = view.state.doc.length
  statusLength.textContent = `${len} chars`
}

view = createCMEditor(editorContainer, {
  language: exprLanguage(),
  onCursorUpdate: (line, col) => {
    updateStatusLine(line, col)
    updateStatusLength()
  },
  onChange: () => debounceSave(),
})

envView = createCMEditor(envContainer, {
  language: json(),
  lineNumbers: false,
  onChange: () => debounceSave(),
})

resultView = createCMEditor(resultContainer, {
  language: exprLanguage(),
  readOnly: true,
  lineNumbers: false,
})

function setInfo(msg: string) {
  statusInfo.textContent = msg
}

function getEnvJSON(): string {
  const val = envView.state.doc.toString().trim()
  if (!val) return "{}"
  try {
    JSON.parse(val)
    return val
  } catch {
    return val
  }
}

function saveToLS() {
  try {
    localStorage.setItem("expr-editor-code", view.state.doc.toString())
    localStorage.setItem("expr-editor-env", envView.state.doc.toString())
  } catch { /* ignore */ }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function debounceSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveToLS, 300)
}

// Also save before page unload
window.addEventListener("beforeunload", saveToLS)

btnEnvFormat.addEventListener("click", () => {
  const val = envView.state.doc.toString().trim()
  if (!val) return
  try {
    const parsed = JSON.parse(val)
    envView.dispatch({
      changes: { from: 0, to: envView.state.doc.length, insert: JSON.stringify(parsed, null, 2) },
    })
    saveToLS()
  } catch {
    setInfo("Invalid JSON")
  }
})

async function handleRun() {
  if (!view) return
  const source = view.state.doc.toString()
  if (!source.trim()) return

  setInfo("Running…")
  btnRun.disabled = true

  try {
    const envJSON = getEnvJSON()
    outputErrors.classList.add("hidden")

    const result = runSource(source, envJSON === "{}" ? "" : envJSON)
    resultView.dispatch({
      changes: { from: 0, to: resultView.state.doc.length, insert: result },
    })
    setInfo("")
  } catch (err: any) {
    errorsValue.textContent = err.message
    outputErrors.classList.remove("hidden")
    resultView.dispatch({
      changes: { from: 0, to: resultView.state.doc.length, insert: "" },
    })
    setInfo("Error")
  } finally {
    btnRun.disabled = false
  }
}

async function handleFormat() {
  if (!view) return
  const source = view.state.doc.toString()
  if (!source.trim()) return

  setInfo("Formatting…")
  btnFormat.disabled = true

  try {
    const formatted = formatSource(source)
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: formatted },
    })
    setInfo("Formatted")
  } catch (err: any) {
    errorsValue.textContent = err.message
    outputErrors.classList.remove("hidden")
    setInfo("Format error")
  } finally {
    btnFormat.disabled = false
  }
}

function toggleTheme() {
  dark = !dark
  applyTheme()
  localStorage.setItem("expr-editor-theme", dark ? "dark" : "light")
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light")
  btnTheme.textContent = dark ? "☀️" : "🌙"
  updateAllThemes(dark)
}

btnFormat.addEventListener("click", handleFormat)
btnRun.addEventListener("click", handleRun)
btnTheme.addEventListener("click", toggleTheme)

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault()
    handleRun()
  }
  if (e.shiftKey && e.altKey && e.key === "F") {
    e.preventDefault()
    handleFormat()
  }
})

function restoreFromLS() {
  const savedTheme = localStorage.getItem("expr-editor-theme")
  if (savedTheme === "dark") {
    dark = true
    applyTheme()
  }

  const code = localStorage.getItem("expr-editor-code")
  const env = localStorage.getItem("expr-editor-env")
  if (code) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: code },
    })
  }
  if (env) {
    envView.dispatch({
      changes: { from: 0, to: envView.state.doc.length, insert: env },
    })
  }
}

async function init() {
  restoreFromLS()
  outputLoading.classList.remove("hidden")

  try {
    await loadWasm()
    outputLoading.classList.add("hidden")
    onReady(() => {
      setInfo("WASM loaded")
    })
  } catch (err: any) {
    outputLoading.textContent = "Failed to load WASM: " + err.message
    setInfo("WASM failed")
    btnFormat.disabled = true
    btnRun.disabled = true
  }
}

init()
