# Distribution System for Expr Editor

## Goal

Make Expr Editor trivially downloadable and runnable for non-developer consumers. One build pipeline, three distribution channels.

## Architecture

```
                          ┌──────────────────────┐
                          │   Makefile / CI       │
                          │   (single pipeline)   │
                          └───────┬──────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
            ┌────────────┐ ┌──────────┐ ┌────────────┐
            │ GitHub     │ │ Docker   │ │ npm/bun    │
            │ Releases   │ │ Image    │ │ package    │
            │ (binary)   │ │ (scratch)│ │ (npx/bunx) │
            └────────────┘ └──────────┘ └────────────┘
```

### Common Foundation: Go server with `go:embed`

A single Go binary that embeds all static assets (`dist/` including WASM binary and `wasm_exec.js`) and serves them with mandatory COOP/COEP headers. This is the output for all three channels.

### Channel 1: GitHub Releases

Pre-built binaries for linux/amd64, linux/arm64, darwin/amd64, darwin/arm64. Uploaded by CI on tag push. User downloads and runs `./expr-editor`.

### Channel 2: Docker Image

Multi-stage Dockerfile published to GitHub Container Registry (`ghcr.io/expr-lang/expr-editor`). Stages: Go WASM build → Node/Vite build → Go server build → scratch runtime.

### Channel 3: npm/bun package

Published as `better-expr-editor`. A tiny Node.js server script (`server.js`) using zero dependencies (only `http`, `fs`, `path`) that serves the static `dist/` with correct headers. User runs `npx better-expr-editor` or `bunx better-expr-editor`.

## Files

| File | Purpose |
|------|---------|
| `main.go` | Go server with `go:embed`, HTTP serving, COOP/COEP headers (at root because `go:embed` paths are source-relative) |
| `Dockerfile` | Multi-stage Docker build |
| `Makefile` | Orchestrates WASM build, JS build, Go server, npm prep, Docker |
| `server.js` | Zero-dep Node static server for npx/bunx |
| `.github/workflows/release.yml` | CI: tag triggers build + publish to all channels |

## Build Pipeline

```
make wasm       → GOOS=js GOARCH=wasm go build -o public/expr.wasm ./wasm
                → cp $(go env GOROOT)/misc/wasm/wasm_exec.js public/
make frontend  → npm run build (tsc + vite → dist/)
make server    → CGO_ENABLED=0 go build -o expr-editor .
make docker    → docker build -t expr-editor .
make npm-prep  → cp -r dist/ npm-package/ && cp server.js npm-package/
make release   → wasm + frontend + server + docker + npm-prep
```

CI runs `make release` on tag push, then:
1. Uploads platform binaries to GitHub Release
2. Pushes Docker image to ghcr.io
3. Publishes npm package to npmjs.com

## Server Behavior

- Listens on `:8080` (configurable via `PORT` env)
- Serves embedded `dist/` directory
- Sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on all responses
- Logs startup message with URL
