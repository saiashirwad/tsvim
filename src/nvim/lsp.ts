// LSP: declare servers, react to attachments with buffer-local keymaps.
//
//   lsp.setup({
//     servers: { lua_ls: {}, ts_ls: {}, rust_analyzer: { settings: {...} } },
//     onAttach: ({ client, buffer, map }) => map.n("gd", vim.lsp.buf.definition, "Go to definition"),
//   })

import { augroup } from "./events"
import { keymap, type KeymapApi } from "./keys"

/** Well-known server names from nvim-lspconfig style configs; any string is accepted. */
export type KnownServer =
  | "lua_ls" | "ts_ls" | "vtsls" | "denols" | "eslint" | "biome" | "rust_analyzer" | "gopls" | "pyright" | "basedpyright"
  | "ruff" | "clangd" | "zls" | "hls" | "ocamllsp" | "elixirls" | "jsonls" | "yamlls" | "html" | "cssls" | "tailwindcss"
  | "bashls" | "marksman" | "taplo" | "nil_ls" | "nixd" | "svelte" | "astro" | "jdtls" | "kotlin_language_server" | "sourcekit"
export type ServerName = KnownServer | (string & {})

export interface ServerConfig {
  cmd?: readonly string[]
  filetypes?: readonly string[]
  root_markers?: readonly string[]
  settings?: LuaDict
  init_options?: LuaDict
  capabilities?: LuaDict
  single_file_support?: boolean
  /** any extra `vim.lsp.Config` fields */
  [extra: string]: unknown
}

/** @noSelf */
export interface AttachContext {
  readonly client: vim.LspClient
  readonly buffer: number
  /** keymaps local to the attached buffer */
  readonly map: KeymapApi
  /** does the server support a method (e.g. "textDocument/formatting")? */
  supports(method: string): boolean
}

export interface LspSetup {
  servers: Partial<Record<ServerName, ServerConfig>>
  onAttach?: (ctx: AttachContext) => void
  onDetach?: (ctx: AttachContext) => void
  /** shared config merged into every server (`vim.lsp.config("*", …)`) */
  defaults?: ServerConfig
  /** diagnostics display (`vim.diagnostic.config`) */
  diagnostics?: LuaDict
  /** format on save for servers that support it (default false) */
  formatOnSave?: boolean | { timeout?: number; filter?: (client: vim.LspClient) => boolean }
}

const clean = (cfg: ServerConfig): LuaDict => {
  const out: LuaDict = {}
  for (const k in cfg) if (cfg[k] !== undefined) out[k] = cfg[k]
  return out
}

export const lsp = {
  setup(config: LspSetup): void {
    if (config.defaults) vim.lsp.config("*", clean(config.defaults))
    if (config.diagnostics) vim.diagnostic.config(config.diagnostics)
    const names: string[] = []
    for (const name in config.servers) {
      const cfg = config.servers[name as ServerName]
      if (cfg) vim.lsp.config(name, clean(cfg))
      names.push(name)
    }
    if (names.length > 0) vim.lsp.enable(names)

    augroup("pureluanvim.lsp", (on) => {
      on("LspAttach", (ev) => {
        const client = vim.lsp.get_client_by_id(ev.data.client_id)
        if (!client) return
        const ctx: AttachContext = {
          client,
          buffer: ev.buf,
          map: keymap.buffer(ev.buf),
          supports: (method) => client.supports_method(method, { bufnr: ev.buf }),
        }
        config.onAttach?.(ctx)
        if (config.formatOnSave && ctx.supports("textDocument/formatting")) {
          const fos = config.formatOnSave === true ? {} : config.formatOnSave
          if (!fos.filter || fos.filter(client)) {
            on("BufWritePre", { buffer: ev.buf }, () => {
              vim.lsp.buf.format({ bufnr: ev.buf, id: client.id, timeout_ms: fos.timeout ?? 2000 })
            })
          }
        }
      })
      if (config.onDetach) {
        on("LspDetach", (ev) => {
          const client = vim.lsp.get_client_by_id(ev.data.client_id)
          if (!client) return
          config.onDetach!({ client, buffer: ev.buf, map: keymap.buffer(ev.buf), supports: (m) => client.supports_method(m) })
        })
      }
    })
  },

  /** Attached clients for a buffer (default: current). */
  clients: (buffer = 0): vim.LspClient[] => vim.lsp.get_clients({ bufnr: buffer }),

  /** Toggle inlay hints for a buffer. */
  toggleInlayHints: (buffer = 0): void => {
    const enabled = vim.lsp.inlay_hint.is_enabled({ bufnr: buffer })
    vim.lsp.inlay_hint.enable(!enabled, { bufnr: buffer })
  },
}
