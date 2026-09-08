import { behavior, mount, type Behavior, type Node } from "./spec"
import { within, type Scope } from "./scope"
import * as Stream from "./stream"
import * as Task from "./task"

export type Event =
  | "BufAdd"
  | "BufDelete"
  | "BufEnter"
  | "BufFilePost"
  | "BufFilePre"
  | "BufHidden"
  | "BufLeave"
  | "BufModifiedSet"
  | "BufNew"
  | "BufNewFile"
  | "BufRead"
  | "BufReadCmd"
  | "BufReadPost"
  | "BufReadPre"
  | "BufUnload"
  | "BufWinEnter"
  | "BufWinLeave"
  | "BufWipeout"
  | "BufWrite"
  | "BufWriteCmd"
  | "BufWritePost"
  | "BufWritePre"
  | "ChanInfo"
  | "ChanOpen"
  | "CmdUndefined"
  | "CmdlineChanged"
  | "CmdlineEnter"
  | "CmdlineLeave"
  | "CmdwinEnter"
  | "CmdwinLeave"
  | "ColorScheme"
  | "ColorSchemePre"
  | "CompleteChanged"
  | "CompleteDone"
  | "CompleteDonePre"
  | "CursorHold"
  | "CursorHoldI"
  | "CursorMoved"
  | "CursorMovedC"
  | "CursorMovedI"
  | "DiagnosticChanged"
  | "DiffUpdated"
  | "DirChanged"
  | "DirChangedPre"
  | "ExitPre"
  | "FileChangedRO"
  | "FileChangedShell"
  | "FileChangedShellPost"
  | "FileReadPost"
  | "FileReadPre"
  | "FileType"
  | "FileWritePost"
  | "FileWritePre"
  | "FocusGained"
  | "FocusLost"
  | "InsertChange"
  | "InsertCharPre"
  | "InsertEnter"
  | "InsertLeave"
  | "InsertLeavePre"
  | "LspAttach"
  | "LspDetach"
  | "LspNotify"
  | "LspProgress"
  | "LspRequest"
  | "LspTokenUpdate"
  | "ModeChanged"
  | "OptionSet"
  | "QuickFixCmdPost"
  | "QuickFixCmdPre"
  | "QuitPre"
  | "RecordingEnter"
  | "RecordingLeave"
  | "SafeState"
  | "SearchWrapped"
  | "SessionLoadPost"
  | "SessionWritePost"
  | "ShellCmdPost"
  | "ShellFilterPost"
  | "Cell"
  | "SourcePost"
  | "SourcePre"
  | "StdinReadPost"
  | "StdinReadPre"
  | "SwapExists"
  | "Syntax"
  | "TabClosed"
  | "TabEnter"
  | "TabLeave"
  | "TabNew"
  | "TabNewEntered"
  | "TermClose"
  | "TermEnter"
  | "TermLeave"
  | "TermOpen"
  | "TermRequest"
  | "TermResponse"
  | "TextChanged"
  | "TextChangedI"
  | "TextChangedP"
  | "TextChangedT"
  | "TextYankPost"
  | "UIEnter"
  | "UILeave"
  | "User"
  | "VimEnter"
  | "VimLeave"
  | "VimLeavePre"
  | "VimResized"
  | "VimResume"
  | "VimSuspend"
  | "WinClosed"
  | "WinEnter"
  | "WinLeave"
  | "WinNew"
  | "WinResized"
  | "WinScrolled"

export interface EventData {
  LspAttach: { client_id: number }
  LspDetach: { client_id: number }
  LspProgress: { client_id: number; params: LuaDict }
  LspNotify: { client_id: number; method: string; params: LuaDict }
  LspRequest: { client_id: number; request_id: number; request: LuaDict }
  DiagnosticChanged: { diagnostics: LuaDict[] }
  TermRequest: { sequence: string; cursor: [number, number] }
  TermResponse: { sequence: string }
  WinResized: { windows: number[] }
  WinScrolled: { windows: number[] }
  User: unknown
}
export type DataOf<E extends Event> = E extends keyof EventData ? EventData[E] : undefined

export interface Ev<E extends Event = Event> {
  readonly id: number
  readonly event: E
  /** `<amatch>` */
  readonly match: string
  /** `<abuf>` */
  readonly buf: number
  /** `<afile>` */
  readonly file: string
  readonly data: DataOf<E>
}

export interface EventOptions {
  readonly pattern?: string | readonly string[]
  readonly buffer?: number
  readonly nested?: boolean
}
export const events = <E extends Event>(
  event: E | readonly E[],
  options: EventOptions = {},
): Stream.Stream<Ev<E>> =>
  Stream.make((emit) => {
    const config: LuaDict = { callback: (ev: Ev<E>) => emit(ev) }
    if (options.buffer !== undefined) config.buffer = options.buffer
    else if (options.pattern !== undefined)
      config.pattern = typeof options.pattern === "string" ? options.pattern : [...options.pattern]
    if (options.nested !== undefined) config.nested = options.nested
    const id = vim.api.nvim_create_autocmd(typeof event === "string" ? event : [...event], config)
    return () => {
      pcall(vim.api.nvim_del_autocmd, id)
    }
  })
export const on = <E extends Event>(
  event: E | readonly E[],
  handle: Task.Task<unknown> | ((ev: Ev<E>) => Task.Task<unknown>),
  options: EventOptions = {},
): Node =>
  behavior((scope) => {
    const opts = scope.buffer === undefined ? options : { ...options, buffer: scope.buffer }
    return events(event, opts).subscribe((ev) => {
      const target = scope.child("event", {
        buffer: ev.buf,
        window: vim.api.nvim_get_current_win(),
      })
      Task.execute(
        target,
        typeof handle === "function" ? Task.defer(() => handle(ev)) : handle,
        (exit) => {
          target.close()
          if (exit.tag === "failure") scope.report(exit.error)
        },
      )
    })
  })
/** A scope per matching buffer, including buffers already present at mount. */
export const forBuffers = (
  matches: (buffer: number) => boolean,
  build: (buffer: number) => Behavior,
): Node =>
  behavior((scope) => {
    const live = new Map<number, Scope>()
    const inspect = (buffer: number) => {
      if (!vim.api.nvim_buf_is_valid(buffer) || !vim.api.nvim_buf_is_loaded(buffer)) return
      const existing = live.get(buffer)
      if (!matches(buffer)) {
        existing?.close()
        live.delete(buffer)
        return
      }
      if (existing) return
      const child = scope.child("buffer", { buffer })
      live.set(buffer, child)
      try {
        within(child, () => mount(build(buffer), child))
      } catch (error) {
        child.close()
        live.delete(buffer)
        throw error
      }
    }
    scope.own(events(["BufEnter", "FileType", "BufWinEnter"]).subscribe((ev) => inspect(ev.buf)))
    scope.own(
      events("BufWipeout").subscribe((ev) => {
        live.get(ev.buf)?.close()
        live.delete(ev.buf)
      }),
    )
    for (const buffer of vim.api.nvim_list_bufs()) inspect(buffer)
  })
export const filetypes = (types: string | readonly string[], body: Behavior): Node => {
  const names = typeof types === "string" ? [types] : types
  return forBuffers(
    (buffer) =>
      names.includes(vim.api.nvim_get_option_value("filetype", { buf: buffer }) as string),
    () => body,
  )
}
export const userEvents = <A>(name: string): Stream.Stream<A> =>
  Stream.map((ev: Ev<"User">) => ev.data as A)(events("User", { pattern: name }))
export const emit = (name: string, data?: unknown): Task.Task<void> =>
  Task.sync(() => vim.api.nvim_exec_autocmds("User", { pattern: name, data, modeline: false }))
