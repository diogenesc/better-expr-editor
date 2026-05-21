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
