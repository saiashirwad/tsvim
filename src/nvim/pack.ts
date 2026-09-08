// Plugins via Neovim 0.12's built-in `vim.pack`.
//
//   plugins([
//     "nvim-treesitter/nvim-treesitter",
//     { src: "folke/which-key.nvim", setup: () => req("which-key").setup({}) },
//     { src: "stevearc/oil.nvim", version: "v2.14.0", setup: (oil) => oil.setup() },
//   ])

export interface PluginSpec {
  /** "owner/repo" (GitHub), "gh:owner/repo", or a full URL / local path */
  src: string
  /** directory name, defaults to the repo name */
  name?: string
  /** git tag, branch, or commit; defaults to the default branch */
  version?: string
  /** runs after the plugin is added; receives `require(module)` when `module` is given */
  setup?: (mod: any) => void
  /** Lua module to require and hand to `setup` (defaults to the repo name without `.nvim`/`nvim-`) */
  module?: string
  /** skip this plugin entirely */
  enabled?: boolean
}

export type Plugin = string | PluginSpec

const toUrl = (src: string): string => {
  if (src.startsWith("gh:")) return `https://github.com/${src.slice(3)}`
  if (src.includes("://") || src.startsWith("/") || src.startsWith("~") || src.startsWith(".")) return src
  if (string.match(src, "^[%w%._%-]+/[%w%._%-]+$")[0] !== undefined) return `https://github.com/${src}`
  return src
}

const repoName = (src: string): string => {
  const last = string.gsub(src, "/+$", "")[0].split("/").pop() ?? src
  return string.gsub(last, "%.git$", "")[0]
}

const guessModule = (name: string): string => string.gsub(string.gsub(string.gsub(name, "%.nvim$", "")[0], "^nvim%-", "")[0], "%.lua$", "")[0]

/** `require` a Lua module with an `any` result (use sparingly, at the plugin boundary). */
export const req = (module: string): any => require(module)

/** `require` that returns `undefined` instead of throwing when the module is missing. */
export const tryReq = (module: string): any | undefined => {
  const [ok, mod] = pcall(require, module)
  return ok ? mod : undefined
}

/** @noSelf */
export interface Plugins {
  /** names of plugins that were added */
  readonly names: string[]
  update(): void
}

/** Install (on first run) and load plugins, then run their `setup` hooks in order. */
export const plugins = (list: readonly Plugin[], options: { confirm?: boolean } = {}): Plugins => {
  const specs: vim.pack.Spec[] = []
  const hooks: Array<() => void> = []
  const names: string[] = []
  for (const item of list) {
    const spec: PluginSpec = typeof item === "string" ? { src: item } : item
    if (spec.enabled === false) continue
    const name = spec.name ?? repoName(spec.src)
    const packSpec: vim.pack.Spec = { src: toUrl(spec.src), name }
    if (spec.version !== undefined) packSpec.version = spec.version
    specs.push(packSpec)
    names.push(name)
    if (spec.setup) {
      const setup = spec.setup
      const moduleName = spec.module ?? guessModule(name)
      hooks.push(() => {
        const mod = tryReq(moduleName)
        const [ok, err] = pcall(() => setup(mod))
        if (!ok) vim.notify(`plugin setup failed for ${name}: ${tostring(err)}`, vim.log.levels.ERROR)
      })
    }
  }
  if (specs.length > 0) vim.pack.add(specs, { confirm: options.confirm ?? false })
  for (const run of hooks) run()
  return {
    names,
    update: () => vim.pack.update(names),
  }
}
