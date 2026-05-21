interface RPCResponse {
  ok: boolean
  data?: string
  error?: string
}

let ready = false
let readyCallbacks: Array<() => void> = []

export function onReady(cb: () => void) {
  if (ready) {
    cb()
  } else {
    readyCallbacks.push(cb)
  }
}

export async function loadWasm() {
  if (typeof (globalThis as any).Go !== "undefined") {
    const go = new (globalThis as any).Go()
    const result = await WebAssembly.instantiateStreaming(
      fetch("expr.wasm"),
      go.importObject
    )
    go.run(result.instance)
    ready = true
    for (const cb of readyCallbacks) cb()
    readyCallbacks = []
  }
}

function parseResponse(raw: string): RPCResponse {
  try {
    return JSON.parse(raw)
  } catch {
    return { ok: false, error: `invalid response: ${raw}` }
  }
}

export function formatSource(source: string): string {
  const raw = (globalThis as any).exprFormat(source)
  const res = parseResponse(raw)
  if (!res.ok) throw new Error(res.error)
  return res.data!
}

export function compileSource(source: string): string {
  const raw = (globalThis as any).exprCompile(source)
  const res = parseResponse(raw)
  if (!res.ok) throw new Error(res.error)
  return res.data!
}

export function runSource(source: string, envJSON?: string): string {
  const raw = (globalThis as any).exprRun(source, envJSON || "")
  const res = parseResponse(raw)
  if (!res.ok) throw new Error(res.error)
  return res.data!
}

export function disassembleSource(source: string): string {
  const raw = (globalThis as any).exprDisassemble(source)
  const res = parseResponse(raw)
  if (!res.ok) throw new Error(res.error)
  return res.data!
}
