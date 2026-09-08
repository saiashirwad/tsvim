// Autocommands with typed events.
//
//   on("BufWritePre", "*.ts", (ev) => format(ev.buf))
//   on(["BufEnter", "FocusGained"], () => vim.cmd("checktime"))
//   augroup("my-config", (on) => {
//     on("TextYankPost", () => vim.highlight.on_yank())
//     on("LspAttach", (ev) => keymap.buffer(ev.buf).n("K", vim.lsp.buf.hover))
//   })

export type Event =
  | "BufAdd" | "BufDelete" | "BufEnter" | "BufFilePost" | "BufFilePre" | "BufHidden" | "BufLeave"
  | "BufModifiedSet" | "BufNew" | "BufNewFile" | "BufRead" | "BufReadCmd" | "BufReadPost" | "BufReadPre"
  | "BufUnload" | "BufWinEnter" | "BufWinLeave" | "BufWipeout" | "BufWrite" | "BufWriteCmd" | "BufWritePost" | "BufWritePre"
  | "ChanInfo" | "ChanOpen" | "CmdUndefined" | "CmdlineChanged" | "CmdlineEnter" | "CmdlineLeave"
  | "CmdwinEnter" | "CmdwinLeave" | "ColorScheme" | "ColorSchemePre" | "CompleteChanged" | "CompleteDone" | "CompleteDonePre"
  | "CursorHold" | "CursorHoldI" | "CursorMoved" | "CursorMovedC" | "CursorMovedI"
  | "DiagnosticChanged" | "DiffUpdated" | "DirChanged" | "DirChangedPre"
  | "ExitPre" | "FileAppendCmd" | "FileAppendPost" | "FileAppendPre" | "FileChangedRO" | "FileChangedShell"
  | "FileChangedShellPost" | "FileReadCmd" | "FileReadPost" | "FileReadPre" | "FileType" | "FileWriteCmd"
  | "FileWritePost" | "FileWritePre" | "FilterReadPost" | "FilterReadPre" | "FilterWritePost" | "FilterWritePre"
  | "FocusGained" | "FocusLost" | "FuncUndefined" | "InsertChange" | "InsertCharPre" | "InsertEnter" | "InsertLeave" | "InsertLeavePre"
  | "LspAttach" | "LspDetach" | "LspNotify" | "LspProgress" | "LspRequest" | "LspTokenUpdate"
  | "MenuPopup" | "ModeChanged" | "OptionSet" | "QuickFixCmdPost" | "QuickFixCmdPre" | "QuitPre" | "RecordingEnter" | "RecordingLeave"
  | "RemoteReply" | "SafeState" | "SearchWrapped" | "SessionLoadPost" | "SessionWritePost" | "ShellCmdPost" | "ShellFilterPost"
  | "Signal" | "SourceCmd" | "SourcePost" | "SourcePre" | "SpellFileMissing" | "StdinReadPost" | "StdinReadPre" | "SwapExists" | "Syntax"
  | "TabClosed" | "TabEnter" | "TabLeave" | "TabNew" | "TabNewEntered" | "TermClose" | "TermEnter" | "TermLeave" | "TermOpen"
  | "TermRequest" | "TermResponse" | "TextChanged" | "TextChangedI" | "TextChangedP" | "TextChangedT" | "TextYankPost"
  | "UIEnter" | "UILeave" | "User" | "VimEnter" | "VimLeave" | "VimLeavePre" | "VimResized" | "VimResume" | "VimSuspend"
  | "WinClosed" | "WinEnter" | "WinLeave" | "WinNew" | "WinResized" | "WinScrolled"

/** Payload carried in `args.data` for events that have one. */
export interface EventData {
  LspAttach: { client_id: number }
  LspDetach: { client_id: number }
  LspProgress: { client_id: number; params: LuaDict }
  LspNotify: { client_id: number; method: string; params: LuaDict }
  LspRequest: { client_id: number; request_id: number; request: LuaDict }
  DiagnosticChanged: { diagnostics: LuaDict[] }
  ModeChanged: undefined
  TermRequest: { sequence: string; cursor: [number, number] }
  TermResponse: { sequence: string }
  WinResized: { windows: number[] }
  WinScrolled: { windows: number[] }
  User: unknown
}

export type DataOf<E extends Event> = E extends keyof EventData ? EventData[E] : undefined

export interface AutocmdArgs<E extends Event = Event> {
  /** autocommand id */
  readonly id: number
  readonly event: E
  readonly group: number | undefined
  /** expanded value of `<amatch>` */
  readonly match: string
  /** expanded value of `<abuf>` */
  readonly buf: number
  /** expanded value of `<afile>` */
  readonly file: string
  readonly data: DataOf<E>
}

/** Return `true` to delete the autocommand after it fires (Neovim semantics). */
export type Handler<E extends Event> = (this: void, args: AutocmdArgs<E>) => boolean | void

export interface AutocmdOptions {
  pattern?: string | readonly string[]
  /** buffer-local (mutually exclusive with pattern) */
  buffer?: number
  /** run once, then delete itself */
  once?: boolean
  /** allow nested autocommands */
  nested?: boolean
  desc?: string
  group?: string | number
}

/** @noSelf */
export interface Disposable {
  dispose(): void
}

export type Pattern = string | readonly string[] | AutocmdOptions

const toOpts = (p: Pattern | undefined): AutocmdOptions =>
  p === undefined ? {} : typeof p === "string" || Array.isArray(p) ? { pattern: p as string | readonly string[] } : (p as AutocmdOptions)

const create = <E extends Event>(
  events: E | readonly E[],
  options: AutocmdOptions,
  handler: Handler<E>,
  group: string | number | undefined,
): Disposable => {
  const o: LuaDict = { callback: handler }
  if (options.pattern !== undefined) o.pattern = Array.isArray(options.pattern) ? [...options.pattern] : options.pattern
  if (options.buffer !== undefined) o.buffer = options.buffer
  if (options.once !== undefined) o.once = options.once
  if (options.nested !== undefined) o.nested = options.nested
  if (options.desc !== undefined) o.desc = options.desc
  const g = options.group ?? group
  if (g !== undefined) o.group = g
  const id = vim.api.nvim_create_autocmd(typeof events === "string" ? events : [...events], o)
  return { dispose: () => { pcall(vim.api.nvim_del_autocmd, id) } }
}

/** Register an autocommand: `on(event, handler)` or `on(event, pattern | options, handler)`. */
/** @noSelf */
export interface On {
  <E extends Event>(events: E | readonly E[], handler: Handler<E>): Disposable
  <E extends Event>(events: E | readonly E[], pattern: Pattern, handler: Handler<E>): Disposable
}

const onIn = (group: string | number | undefined): On =>
  (<E extends Event>(events: E | readonly E[], a: Pattern | Handler<E>, b?: Handler<E>): Disposable =>
    typeof a === "function" ? create(events, {}, a, group) : create(events, toOpts(a), b!, group)) as On

export const on: On = onIn(undefined)

/** Like `on`, but fires a single time. */
export const once = <E extends Event>(events: E | readonly E[], pattern: Pattern | undefined, handler: Handler<E>): Disposable =>
  create(events, { ...toOpts(pattern), once: true }, handler, undefined)

/** @noSelf */
export interface Augroup extends Disposable {
  readonly id: number
  readonly name: string
  readonly on: On
  /** remove every autocommand in the group but keep the group */
  clear(): void
}

/**
 * Create (and clear) an augroup. Autocommands registered through the provided
 * `on` belong to the group, so re-sourcing the config never duplicates them.
 */
export const augroup = (name: string, define?: (on: On, group: Augroup) => void): Augroup => {
  const id = vim.api.nvim_create_augroup(name, { clear: true })
  const group: Augroup = {
    id,
    name,
    on: onIn(id),
    clear: () => vim.api.nvim_clear_autocmds({ group: id }),
    dispose: () => { pcall(vim.api.nvim_del_augroup_by_id, id) },
  }
  define?.(group.on, group)
  return group
}

/** Fire a `User` autocommand with a pattern (a simple event bus between parts of the config). */
export const emit = (pattern: string, data?: unknown): void =>
  vim.api.nvim_exec_autocmds("User", { pattern, data, modeline: false })

/** Subscribe to `User` events by pattern. */
export const onUser = <T = unknown>(pattern: string, handler: (this: void, data: T, args: AutocmdArgs<"User">) => void): Disposable =>
  create("User", { pattern }, (args) => { handler(args.data as T, args) }, undefined)
