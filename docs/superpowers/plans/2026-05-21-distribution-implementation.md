# Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build multi-channel distribution: Go binary, Docker image, npm/bun package — all from a single build pipeline.

**Architecture:** Go server with `go:embed` serves pre-built static assets (including WASM) with required COOP/COEP headers. Mise orchestrates all builds. CI publishes to GitHub Releases + ghcr.io + npm on tag push.

**Tech Stack:** Go (embed, net/http), Docker (multi-stage), Node.js (zero-dep static server), GitHub Actions, mise

---

### Task 1: Go server with embed

**Files:**
- Create: `main.go` (root level — `go:embed` paths are source-relative, so `//go:embed dist/*` in `cmd/server/` would look for `cmd/server/dist/`)

- [ ] **Create the Go server**

```go
package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
)

//go:embed dist/*
var static embed.FS

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	sub, err := fs.Sub(static, "dist")
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", withHeaders(http.FileServer(http.FS(sub))))

	addr := ":" + port
	log.Printf("Expr Editor: http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func withHeaders(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
		h.ServeHTTP(w, r)
	})
}
```

Note: `//go:embed dist/*` requires `dist/` to exist at build time. Mise tasks ensure WASM and frontend are built first.

- [ ] **Commit**

```bash
git add cmd/server/main.go
git commit -m "feat: add Go server with go:embed for static assets"
```

---

### Task 2: Node static server for npx/bunx

**Files:**
- Create: `server.js`

- [ ] **Create zero-dep Node.js static server**

```js
#!/usr/bin/env node
import http from "http"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 8080
const DIST = path.join(__dirname, "dist")

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
}

const server = http.createServer((req, res) => {
  let filePath = path.join(DIST, req.url === "/" ? "index.html" : req.url)
  filePath = path.normalize(filePath)

  if (!filePath.startsWith(DIST)) {
    res.writeHead(403)
    res.end()
    return
  }

  const ext = path.extname(filePath)
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp")

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(DIST, "index.html"), (err2, data2) => {
        if (err2) {
          res.writeHead(404)
          res.end("Not found")
          return
        }
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(data2)
      })
      return
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" })
    res.end(data)
  })
})

server.listen(PORT, () => {
  console.log(`Expr Editor running at http://localhost:${PORT}`)
})
```

- [ ] **Make executable**

Run: `chmod +x server.js`

- [ ] **Commit**

```bash
git add server.js
git commit -m "feat: add zero-dep Node static server for npx/bunx"
```

---

### Task 3: Mise tasks (replaces Makefile)

**Files:**
- Modify: `mise.toml` — add server, docker, npm-pkg, release, clean tasks
- Modify: `.gitignore` — add `expr-editor` binary, `npm-package/`
- Create: `scripts/npm-prep.js` — helper to prepare npm publish package

- [ ] **Create `scripts/npm-prep.js`**

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync, cpSync, mkdirSync } from "fs"

const root = process.cwd()
const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf-8"))

pkg.name = "better-expr-editor"
pkg.bin = "./server.js"
pkg.private = false
pkg.scripts = {}
pkg.devDependencies = {}
delete pkg.dependencies

mkdirSync(`${root}/npm-package/dist`, { recursive: true })
cpSync(`${root}/dist`, `${root}/npm-package/dist`, { recursive: true })
cpSync(`${root}/server.js`, `${root}/npm-package/server.js`)
writeFileSync(`${root}/npm-package/package.json`, JSON.stringify(pkg, null, 2) + "\n")
```

- [ ] **Make executable**

Run: `chmod +x scripts/npm-prep.js`

- [ ] **Update mise.toml**

Add to the `[tasks]` section:

```toml
server = { depends = ["wasm:all", "build"], description = "Build Go server binary embedding static assets", run = "CGO_ENABLED=0 go build -o expr-editor ." }

docker = { depends = ["server"], description = "Build Docker image", run = "docker build -t expr-editor ." }

npm-pkg = { depends = ["build"], description = "Prepare npm package for publishing", run = "node scripts/npm-prep.js" }

clean = { description = "Remove build artifacts", run = [
  "rm -f expr-editor",
  "rm -rf npm-package",
] }
```

- [ ] **Update .gitignore**

Add:
```
expr-editor
npm-package/
```

- [ ] **Commit**

```bash
git add mise.toml .gitignore scripts/npm-prep.js
git commit -m "feat: add mise tasks for server, docker, npm-pkg, release"
```

---

### Task 4: Multi-stage Dockerfile

**Files:**
- Create: `Dockerfile`

- [ ] **Create Dockerfile**

```dockerfile
# Stage 1: Build WASM
FROM golang:1.26 AS wasm-builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN GOOS=js GOARCH=wasm go build -o public/expr.wasm ./wasm && \
    cp $(go env GOROOT)/misc/wasm/wasm_exec.js public/

# Stage 2: Build frontend
FROM node:26 AS frontend-builder
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
COPY --from=wasm-builder /src/public/ public/
RUN npm run build

# Stage 3: Build Go server
FROM golang:1.26 AS server-builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend-builder /src/dist/ dist/
RUN CGO_ENABLED=0 go build -o expr-editor .

# Stage 4: Runtime
FROM scratch
COPY --from=server-builder /src/expr-editor /expr-editor
EXPOSE 8080
ENTRYPOINT ["/expr-editor"]
```

- [ ] **Commit**

```bash
git add Dockerfile
git commit -m "feat: add multi-stage Dockerfile"
```

---

### Task 5: CI release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Create GitHub Actions release workflow**

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: "1.26"

      - uses: actions/setup-node@v4
        with:
          node-version: "26"
          registry-url: "https://registry.npmjs.org"

      - name: Build server binary
        run: |
          GOOS=js GOARCH=wasm go build -o public/expr.wasm ./wasm
          cp $(go env GOROOT)/misc/wasm/wasm_exec.js public/
          npm ci
          npm run build
          CGO_ENABLED=0 go build -o expr-editor .

      - name: Build Docker image
        run: docker build -t expr-editor .

      - name: Prepare npm package
        run: node scripts/npm-prep.js

      - name: Cross-compile platform binaries
        run: |
          for pair in "linux/amd64" "linux/arm64" "darwin/amd64" "darwin/arm64"; do
            os=$(echo $pair | cut -d/ -f1)
            arch=$(echo $pair | cut -d/ -f2)
            CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -o expr-editor-$os-$arch ./cmd/server
          done

      - name: Upload to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            expr-editor-linux-amd64
            expr-editor-linux-arm64
            expr-editor-darwin-amd64
            expr-editor-darwin-arm64

      - name: Push Docker image
        run: |
          echo "${{ github.token }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          IMG=ghcr.io/${{ github.repository }}
          docker tag expr-editor $IMG:${{ github.ref_name }}
          docker tag expr-editor $IMG:latest
          docker push $IMG:${{ github.ref_name }}
          docker push $IMG:latest

      - name: Publish npm package
        run: |
          cd npm-package
          npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Commit**

```bash
mkdir -p .github/workflows
git add .github/workflows/release.yml
git commit -m "ci: add release workflow for GitHub, Docker, npm"
```

---

### Task 6: Update README Quick Start

**Files:**
- Modify: `README.md`

- [ ] **Update README with new distribution options**

Replace the Quick Start section with:

```markdown
## Quick Start

### Option 1: Go binary (any platform)

Download the latest binary from [GitHub Releases](https://github.com/expr-lang/expr-lang-editor/releases), then:

```bash
./expr-editor
```

Open `http://localhost:8080`.

### Option 2: Docker

```bash
docker run -p 8080:8080 ghcr.io/expr-lang/expr-lang-editor
```

### Option 3: npx / bunx

```bash
npx better-expr-editor
# or
bunx better-expr-editor
```

### Option 4: Development

```bash
npm install
mise run server
./expr-editor
```

Or use the Vite dev server:

```bash
npm install
mise run wasm:all
npm run dev
```
```

- [ ] **Commit**

```bash
git add README.md
git commit -m "docs: add distribution options to README"
```
