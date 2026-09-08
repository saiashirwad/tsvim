import { behavior, mount, type Behavior, type Node } from "./spec"
import { events, on } from "./events"
import { within, type Scope } from "./scope"
import { lease } from "./lease"
import * as Task from "./task"
import { target } from "./buffer"

export type KnownServer =
  | "lua_ls"
  | "ts_ls"
  | "vtsls"
  | "denols"
  | "eslint"
  | "biome"
  | "rust_analyzer"
  | "gopls"
  | "pyright"
  | "basedpyright"
  | "ruff"
  | "clangd"
  | "zls"
  | "hls"
  | "ocamllsp"
  | "elixirls"
  | "jsonls"
  | "yamlls"
  | "html"
  | "cssls"
  | "tailwindcss"
  | "bashls"
  | "marksman"
  | "taplo"
  | "nil_ls"
  | "nixd"
  | "svelte"
  | "astro"
  | "jdtls"
  | "sourcekit"
export type ServerName = KnownServer | (string & {})

export interface ServerConfig {
  cmd?: readonly string[]
  filetypes?: readonly string[]
  root_markers?: readonly string[]
  settings?: LuaDict
  init_options?: LuaDict
  capabilities?: LuaDict
  [extra: string]: unknown
}

/** @noSelf */
export interface Attached {
  readonly buffer: number
  readonly clients: readonly vim.LspClient[]
  readonly supports: (method: string) => boolean
}
/** One behavior per buffer, independent of how many clients attach. */
const attached = (build: (attached: Attached) => Behavior): Node =>
  behavior((scope) => {
    const live = new Map<number, Scope>()
    const refresh = (buffer: number, omit?: number) => {
      live.get(buffer)?.close()
      live.delete(buffer)
      if (!vim.api.nvim_buf_is_valid(buffer)) return
      const clients = vim.lsp.get_clients({ bufnr: buffer }).filter((client) => client.id !== omit)
      if (clients.length === 0) return
      const local = scope.child("language", { buffer })
      live.set(buffer, local)
      within(local, () =>
        mount(
          build({
            buffer,
            clients,
            supports: (method) => clients.some((client) => client.supports_method(method, buffer)),
          }),
          local,
        ),
      )
    }
    scope.own(events("LspAttach").subscribe((ev) => refresh(ev.buf)))
    scope.own(events("LspDetach").subscribe((ev) => refresh(ev.buf, ev.data.client_id)))
    scope.own(
      events("BufWipeout").subscribe((ev) => {
        live.get(ev.buf)?.close()
        live.delete(ev.buf)
      }),
    )
    for (const buffer of vim.api.nvim_list_bufs()) refresh(buffer)
  })
const servers = (configs: Partial<Record<ServerName, ServerConfig>>): Node =>
  behavior((scope) => {
    for (const name in configs) {
      const config = configs[name as ServerName]
      if (!config) continue
      const enabled = vim.lsp.is_enabled(name)
      // Resolved server configurations belong to Neovim's registry; enabling is scoped.
      vim.lsp.config(name, { ...config })
      scope.own(
        lease(
          `lsp:${name}`,
          () => vim.lsp.enable(name, enabled),
          () => vim.lsp.enable(name),
        ),
      )
    }
  })
const call = (fn: () => void): Task.Task<void> =>
  Task.sync((scope) => vim.api.nvim_buf_call(target(scope), fn))
export interface SymbolLocation {
  readonly name: string
  readonly path: string
  readonly position: { readonly line: number; readonly col: number }
}
const symbols: Task.Task<readonly SymbolLocation[]> = Task.make((scope, done) => {
  const buffer = target(scope)
  if (
    !vim.lsp
      .get_clients({ bufnr: buffer })
      .some((client) => client.supports_method("textDocument/documentSymbol", buffer))
  )
    return done({ tag: "success", value: [] })
  const cancel = vim.lsp.buf_request_all(
    buffer,
    "textDocument/documentSymbol",
    { textDocument: vim.lsp.util.make_text_document_params(buffer) },
    (responses) => {
      if (!scope.alive()) return
      const items: SymbolLocation[] = []
      const seen = new Set<string>()
      for (const id in responses) {
        const response = responses[id]!
        if (response.err) return done({ tag: "failure", error: response.err })
        const client = vim.lsp.get_client_by_id(tonumber(id)!)
        if (!client || !response.result) continue
        for (const item of vim.lsp.util.symbols_to_items(
          response.result as unknown[],
          buffer,
          client.offset_encoding,
        )) {
          const key = `${item.filename}:${item.lnum}:${item.col}:${item.text}`
          if (seen.has(key)) continue
          seen.add(key)
          items.push({
            name: item.text,
            path: item.filename,
            position: { line: item.lnum - 1, col: item.col - 1 },
          })
        }
      }
      done({ tag: "success", value: items })
    },
  )
  scope.own(cancel)
})
export const language = {
  servers,
  attached,
  symbols,
  definition: call(vim.lsp.buf.definition),
  declaration: call(vim.lsp.buf.declaration),
  references: call(vim.lsp.buf.references),
  implementation: call(vim.lsp.buf.implementation),
  hover: call(vim.lsp.buf.hover),
  rename: call(vim.lsp.buf.rename),
  codeAction: call(vim.lsp.buf.code_action),
  signature: call(vim.lsp.buf.signature_help),
  format: (options: { readonly timeout?: number } = {}): Task.Task<void> =>
    Task.sync((scope) =>
      vim.lsp.buf.format({ bufnr: target(scope), timeout_ms: options.timeout ?? 2000 }),
    ),
  formatOnSave: (options: { readonly timeout?: number } = {}): Node =>
    attached(({ buffer, clients }) => {
      const client = clients.find((client) =>
        client.supports_method("textDocument/formatting", buffer),
      )
      return (
        client !== undefined &&
        on(
          "BufWritePre",
          Task.sync(() =>
            vim.lsp.buf.format({
              bufnr: buffer,
              id: client.id,
              timeout_ms: options.timeout ?? 2000,
            }),
          ),
        )
      )
    }),
  inlayHints: (enabled = true): Node =>
    behavior((scope) => {
      const buffer = target(scope)
      const previous = vim.lsp.inlay_hint.is_enabled({ bufnr: buffer })
      scope.own(
        lease(
          `inlay:${buffer}`,
          () => {
            if (vim.api.nvim_buf_is_valid(buffer))
              vim.lsp.inlay_hint.enable(previous, { bufnr: buffer })
          },
          () => vim.lsp.inlay_hint.enable(enabled, { bufnr: buffer }),
        ),
      )
    }),
  toggleInlayHints: Task.sync((scope) => {
    const buffer = target(scope)
    vim.lsp.inlay_hint.enable(!vim.lsp.inlay_hint.is_enabled({ bufnr: buffer }), { bufnr: buffer })
  }),
}
