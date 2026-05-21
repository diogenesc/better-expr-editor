# Expr Editor

A browser-based editor for the [Expr](https://github.com/expr-lang/expr) expression language with live evaluation, syntax formatting, and AST inspection — all running client-side via Go WASM.

## Features

- **Expression editing** — CodeMirror 6 with Expr syntax highlighting, bracket matching, undo/redo
- **Live evaluation** — Run expressions against a JSON environment, see results instantly
- **Formatting** — Auto-format expressions with pipe-aware layout, logical chain alignment, and multi-line splitting
- **Environment editor** — JSON editor for environment variables with format-on-click
- **AST & Bytecode** — Inspect compiled AST or disassembled bytecode
- **Dark/light theme** — Persistent theme toggle
- **Persistence** — Expression, environment, and theme saved to `localStorage`
- **Offline WASM** — Entirely client-side; no server round-trip for evaluation

## Quick Start

```bash
# Install dependencies
npm install

# Build WASM (requires Go 1.26+)
GOOS=js GOARCH=wasm go build -o public/expr.wasm ./wasm
cp $(go env GOROOT)/misc/wasm/wasm_exec.js public/

# Start dev server
npm run dev
```

Open `http://localhost:5173`.

### Using mise

```bash
mise run wasm:all   # Build WASM + copy runtime
mise run dev        # Start dev server
mise run build      # Production build
```

## Project Structure

```
├── src/                  # TypeScript frontend
│   ├── index.ts          # App entry point, UI wiring
│   ├── editor.ts         # CodeMirror 6 setup, themes, highlighting
│   ├── bridge.ts         # TypeScript↔Go WASM bridge
│   ├── lang/             # Expr language support for CodeMirror
│   └── style.css         # Application styles (light + dark)
├── wasm/
│   └── main.go           # Go WASM entry — eval, compile, format, disassemble
├── formatter/
│   ├── formatter.go      # Expr expression formatter
│   └── formatter_test.go # Formatter tests
├── public/
│   ├── expr.wasm         # Compiled WASM binary
│   └── wasm_exec.js      # Go WASM runtime
├── _headers              # Cloudflare Pages security headers
├── index.html            # Single-page app shell
├── vite.config.ts        # Vite config with COOP/COEP headers
└── mise.toml             # Task runner configuration
```

## Architecture

```
┌─────────────────────────────────────┐
│  Browser                             │
│  ┌──────────┐  ┌──────────────────┐ │
│  │ CodeMirror│  │  Go WASM         │ │
│  │ 6 Editor  │──│  exprFormat()    │ │
│  │ (Expr +   │  │  exprRun()       │ │
│  │  JSON)    │  │  exprCompile()   │ │
│  └──────────┘  │  exprDisassemble()│ │
│       │        └──────────────────┘ │
│       │                ▲            │
│       ▼                │            │
│  ┌────────┐      ┌─────────┐       │
│  │ Result │      │ Env JSON│       │
│  │ Pane   │      │ Editor  │       │
│  └────────┘      └─────────┘       │
└─────────────────────────────────────┘
```

The Go WASM module (`wasm/main.go`) compiles [expr-lang/expr](https://github.com/expr-lang/expr) expressions, evaluates them against a provided environment, formats them, and disassembles bytecode — all without a backend server.

## Production

Deployed to Cloudflare Pages. The `_headers` file sets the required COOP/COEP headers for `SharedArrayBuffer` support (needed by Go WASM's `wasm_exec.js`).

Build with `npm run build` — output goes to `dist/`.

## Development

```bash
npm run dev     # Vite dev server on port 5173
npm run build   # TypeScript check + Vite production build
npm run preview # Preview production build locally
```

Tests (Go formatter):

```bash
go test ./formatter/
```

## Tech Stack

- **Frontend:** TypeScript, CodeMirror 6, Vite
- **Backend:** Go compiled to WASM (expr-lang/expr)
- **Deployment:** Cloudflare Pages
