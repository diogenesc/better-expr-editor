#!/usr/bin/env node
import { readFileSync, writeFileSync, cpSync, mkdirSync } from "fs"

const root = process.cwd()
const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf-8"))

pkg.name = "better-expr-editor"
pkg.bin = { "better-expr-editor": "server.js" }
pkg.private = false
pkg.main = "server.js"
pkg.scripts = { start: "node server.js" }
pkg.keywords = []
pkg.author = ""
pkg.bugs = { url: "https://github.com/expr-lang/expr-lang-editor/issues" }
pkg.homepage = "https://github.com/expr-lang/expr-lang-editor#readme"
delete pkg.devDependencies
delete pkg.dependencies

mkdirSync(`${root}/npm-package/dist`, { recursive: true })
cpSync(`${root}/dist`, `${root}/npm-package/dist`, { recursive: true })
cpSync(`${root}/server.js`, `${root}/npm-package/server.js`)
writeFileSync(`${root}/npm-package/package.json`, JSON.stringify(pkg, null, 2) + "\n")
