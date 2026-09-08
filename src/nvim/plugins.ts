// Plugins via Neovim 0.12's built-in `vim.pack`, as a declaration.
//
//   plugins([
//     "nvim-lua/plenary.nvim",
//     plugin("stevearc/oil.nvim", { view_options: { show_hidden: true } }),   // require("oil").setup({...})
//     plugin({ src: "nvim-treesitter/nvim-treesitter", version: "main" }),
//     plugin({ src: "echasnovski/mini.pairs", module: "mini.pairs", setup: (m) => m.setup() }),
//   ])

import { behavior, type Node } from "./spec"
import * as Task from "./task"

export interface PluginSpec {
  /** "owner/repo" (GitHub), "gh:owner/repo", or a URL / local path */
  src: string
  name?: string
  /** git tag, branch or commit */
  version?: string
  /** Lua module to require (default: derived from the repo name) */
  module?: string
  /** passed to `require(module).setup(opts)` */
  opts?: LuaDict
  /** runs after the plugin is loaded, with `require(module)` */
  setup?: (mod: any) => void | (() => void)
  enabled?: boolean
}

export type Plugin = string | PluginSpec

/** Short form: `plugin(src, setupOpts?)`; full form: `plugin({ src, version, setup, … })`. */
export function plugin(src: string, opts?: LuaDict): PluginSpec
export function plugin(full: PluginSpec): PluginSpec
export function plugin(a: string | PluginSpec, opts?: LuaDict): PluginSpec {
  if (typeof a === "string") return opts === undefined ? { src: a } : { src: a, opts }
  return a
}

const toUrl = (src: string): string => {
  if (src.startsWith("gh:")) return `https://github.com/${src.slice(3)}`
  if (src.includes("://") || src.startsWith("/") || src.startsWith("~") || src.startsWith("."))
    return src
  if (string.match(src, "^[%w%._%-]+/[%w%._%-]+$")[0] !== undefined)
    return `https://github.com/${src}`
  return src
}
const repoName = (src: string): string =>
  string.gsub(string.gsub(src, "/+$", "")[0].split("/").pop() ?? src, "%.git$", "")[0]
const guessModule = (name: string): string =>
  string.gsub(string.gsub(name, "%.nvim$", "")[0], "^nvim%-", "")[0]

/** `require` that returns `undefined` when the module is missing. */
export const tryRequire = (module: string): any | undefined => {
  const [ok, mod] = pcall(require, module)
  return ok ? mod : undefined
}

/** Install (on first run), load, then configure plugins in order. */
export const packages = (list: readonly Plugin[], options: { confirm?: boolean } = {}): Node =>
  behavior((scope) => {
    const specs: vim.pack.Spec[] = []
    const after: Array<() => void> = []
    for (const item of list) {
      const p: PluginSpec = typeof item === "string" ? { src: item } : item
      if (p.enabled === false) continue
      const name = p.name ?? repoName(p.src)
      const packSpec: vim.pack.Spec = { src: toUrl(p.src), name }
      if (p.version !== undefined) packSpec.version = p.version
      specs.push(packSpec)
      if (p.setup || p.opts) {
        const moduleName = p.module ?? guessModule(name)
        after.push(() => {
          const mod = tryRequire(moduleName)
          const [ok, err] = pcall(() => {
            if (p.opts) mod.setup(p.opts)
            const close = p.setup?.(mod)
            if (close) scope.own(close)
          })
          if (!ok)
            vim.notify(`plugin setup failed for ${name}: ${tostring(err)}`, vim.log.levels.ERROR)
        })
      }
    }
    if (specs.length > 0) vim.pack.add(specs, { confirm: options.confirm ?? false })
    for (const run of after) run()
  })

export const updatePackages = Task.sync(() => vim.pack.update())
