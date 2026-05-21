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
