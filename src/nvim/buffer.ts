// Buffers as objects.
//
//   const buf = Buffer.current()
//   buf.lines = buf.lines.map((l) => l.trimEnd())
//   buf.map.n("q", () => buf.delete())
//   buf.on("BufWritePre", () => ...)
//   const scratch = Buffer.scratch({ filetype: "markdown", lines: ["# notes"] })

import { keymap, type KeymapApi } from "./keys"
import { on as onEvent, type Disposable, type Event, type Handler, type Pattern } from "./events"
import { bufOpt, type Options } from "./options"
import { command, type CommandHandler, type CommandOptions, type Nargs, type Command } from "./command"

export interface ScratchOptions {
  filetype?: string
  lines?: readonly string[]
  /** show in buffer list (default false) */
  listed?: boolean
  name?: string
  modifiable?: boolean
  bufhidden?: "" | "hide" | "unload" | "delete" | "wipe"
}

export class Buffer {
  readonly id: number
  readonly map: KeymapApi
  readonly opt: Options

  constructor(id: number) {
    this.id = id === 0 ? vim.api.nvim_get_current_buf() : id
    this.map = keymap.buffer(this.id)
    this.opt = bufOpt(this.id)
  }

  static current(): Buffer { return new Buffer(vim.api.nvim_get_current_buf()) }
  static get(id: number): Buffer { return new Buffer(id) }
  static all(): Buffer[] { return vim.api.nvim_list_bufs().map((id) => new Buffer(id)) }
  static loaded(): Buffer[] { return Buffer.all().filter((b) => b.loaded) }

  /** Create a scratch buffer (`nofile`, unlisted, no swap). */
  static scratch(options: ScratchOptions = {}): Buffer {
    const buf = new Buffer(vim.api.nvim_create_buf(options.listed ?? false, true))
    buf.opt.bufhidden = options.bufhidden ?? "wipe"
    if (options.filetype !== undefined) buf.opt.filetype = options.filetype
    if (options.name !== undefined) buf.name = options.name
    if (options.lines !== undefined) buf.lines = options.lines
    if (options.modifiable !== undefined) buf.opt.modifiable = options.modifiable
    return buf
  }

  /** Find a buffer by name/path, or open it. */
  static open(path: string): Buffer {
    const existing = vim.fn.bufnr(path)
    if (existing !== -1) return new Buffer(existing)
    vim.cmd({ cmd: "badd", args: [path] })
    return new Buffer(vim.fn.bufnr(path))
  }

  get valid(): boolean { return vim.api.nvim_buf_is_valid(this.id) }
  get loaded(): boolean { return vim.api.nvim_buf_is_loaded(this.id) }
  get name(): string { return vim.api.nvim_buf_get_name(this.id) }
  set name(value: string) { vim.api.nvim_buf_set_name(this.id, value) }
  get filetype(): string { return this.opt.filetype }
  set filetype(ft: string) { this.opt.filetype = ft }
  get modified(): boolean { return vim.api.nvim_get_option_value("modified", { buf: this.id }) as boolean }
  get lineCount(): number { return vim.api.nvim_buf_line_count(this.id) }
  get isCurrent(): boolean { return this.id === vim.api.nvim_get_current_buf() }

  /** All lines (0-based semantics hidden: this is the whole buffer). */
  get lines(): string[] { return vim.api.nvim_buf_get_lines(this.id, 0, -1, false) }
  set lines(value: readonly string[]) { vim.api.nvim_buf_set_lines(this.id, 0, -1, false, [...value]) }

  /** A slice of lines, 0-based, end exclusive (negative indexes count from the end). */
  slice(start: number, end = -1): string[] { return vim.api.nvim_buf_get_lines(this.id, start, end, false) }
  /** Replace lines `[start, end)` */
  splice(start: number, end: number, lines: readonly string[]): void {
    vim.api.nvim_buf_set_lines(this.id, start, end, false, [...lines])
  }
  line(index: number): string | undefined { return vim.api.nvim_buf_get_lines(this.id, index, index + 1, false)[0] }
  setLine(index: number, text: string): void { vim.api.nvim_buf_set_lines(this.id, index, index + 1, false, [text]) }
  append(...lines: string[]): void { vim.api.nvim_buf_set_lines(this.id, -1, -1, false, lines) }
  clear(): void { vim.api.nvim_buf_set_lines(this.id, 0, -1, false, []) }
  get text(): string { return this.lines.join("\n") }
  set text(value: string) { this.lines = value.split("\n") }

  /** Map over every line in place. */
  transform(fn: (line: string, index: number) => string): void {
    this.lines = this.lines.map((line, i) => fn(line, i))
  }

  /** Buffer-local autocommand. */
  on<E extends Event>(events: E | readonly E[], handler: Handler<E>): Disposable
  on<E extends Event>(events: E | readonly E[], pattern: Pattern, handler: Handler<E>): Disposable
  on<E extends Event>(events: E | readonly E[], a: Pattern | Handler<E>, b?: Handler<E>): Disposable {
    if (typeof a === "function") return onEvent(events, { buffer: this.id }, a)
    const opts = typeof a === "string" || Array.isArray(a) ? {} : (a as Exclude<Pattern, string | readonly string[]>)
    return onEvent(events, { ...opts, buffer: this.id }, b!)
  }

  /** Buffer-local user command. */
  command<N extends Nargs = "0">(name: string, handler: CommandHandler<N> | string, options: CommandOptions<N> = {}): Command {
    return command<N>(name, handler, { ...options, buffer: this.id })
  }

  /** Run `fn` with this buffer as the current buffer. */
  call<T>(fn: () => T): T { return vim.api.nvim_buf_call(this.id, fn) }

  /** Buffer variables (`vim.b`). */
  get vars(): LuaDict { return vim.b[this.id]! }

  /** Windows currently showing this buffer. */
  windows(): number[] { return vim.api.nvim_list_wins().filter((w) => vim.api.nvim_win_get_buf(w) === this.id) }

  focus(): void { vim.api.nvim_set_current_buf(this.id) }

  delete(force = false): void {
    if (this.valid) vim.api.nvim_buf_delete(this.id, { force })
  }

  /** Highlight a range with a namespace (extmark). Returns the extmark id. */
  highlight(ns: number, group: string, line: number, colStart: number, colEnd: number): number {
    return vim.api.nvim_buf_set_extmark(this.id, ns, line, colStart, { end_col: colEnd, hl_group: group })
  }
  /** Virtual text at the end of a line. */
  virtualText(ns: number, line: number, chunks: Array<[string, string]>, position: "eol" | "overlay" | "right_align" | "inline" = "eol"): number {
    return vim.api.nvim_buf_set_extmark(this.id, ns, line, 0, { virt_text: chunks, virt_text_pos: position })
  }
  clearNamespace(ns: number): void { vim.api.nvim_buf_clear_namespace(this.id, ns, 0, -1) }
}
