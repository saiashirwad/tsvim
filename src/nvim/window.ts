// Windows, and floating windows built from a declarative spec.
//
//   const win = Window.current()
//   win.cursor = { row: 10, col: 0 }
//   const popup = float({ title: " Notes ", width: 0.6, height: 0.5, buffer: Buffer.scratch({ filetype: "markdown" }) })
//   popup.buffer.map.n("q", () => popup.close())

import { Buffer } from "./buffer"
import { winOpt, type Options } from "./options"

export interface Cursor {
  /** 1-based line */
  row: number
  /** 0-based byte column */
  col: number
}

export type Border = "none" | "single" | "double" | "rounded" | "solid" | "shadow" | "bold" | readonly string[]

/** Sizes: integers are cells; fractions in (0, 1] are a ratio of the editor size. */
export type Size = number

export interface FloatSpec {
  buffer?: Buffer | number
  width?: Size
  height?: Size
  /** where to anchor relative to the editor (default: center) */
  position?: "center" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "cursor"
  /** explicit offsets (override position) */
  row?: number
  col?: number
  border?: Border
  title?: string
  titlePos?: "left" | "center" | "right"
  footer?: string
  footerPos?: "left" | "center" | "right"
  /** enter the window (default true) */
  enter?: boolean
  /** keep the float on top of others */
  zindex?: number
  /** window options applied after creation (e.g. `{ number: false, wrap: true }`) */
  options?: Partial<Options>
  /** close with `q` / `<Esc>` (default true) */
  closeKeys?: boolean | readonly string[]
  /** close when the cursor leaves the window (default false) */
  closeOnLeave?: boolean
  /** highlight namespace overrides, e.g. "Normal:MyFloat,FloatBorder:MyBorder" */
  winhighlight?: string
  style?: "minimal"
  relative?: "editor" | "win" | "cursor"
}

const resolveSize = (size: Size | undefined, total: number, fallback: number): number => {
  if (size === undefined) return fallback
  if (size > 0 && size <= 1) return Math.max(1, Math.floor(total * size))
  return Math.floor(size)
}

export class Window {
  readonly id: number
  readonly opt: Options

  constructor(id: number) {
    this.id = id === 0 ? vim.api.nvim_get_current_win() : id
    this.opt = winOpt(this.id)
  }

  static current(): Window { return new Window(vim.api.nvim_get_current_win()) }
  static get(id: number): Window { return new Window(id) }
  static all(): Window[] { return vim.api.nvim_list_wins().map((id) => new Window(id)) }
  static inTab(): Window[] { return vim.api.nvim_tabpage_list_wins(vim.api.nvim_get_current_tabpage()).map((id) => new Window(id)) }

  get valid(): boolean { return vim.api.nvim_win_is_valid(this.id) }
  get buffer(): Buffer { return new Buffer(vim.api.nvim_win_get_buf(this.id)) }
  set buffer(buf: Buffer | number) { vim.api.nvim_win_set_buf(this.id, typeof buf === "number" ? buf : buf.id) }
  get height(): number { return vim.api.nvim_win_get_height(this.id) }
  set height(h: number) { vim.api.nvim_win_set_height(this.id, h) }
  get width(): number { return vim.api.nvim_win_get_width(this.id) }
  set width(w: number) { vim.api.nvim_win_set_width(this.id, w) }
  get isCurrent(): boolean { return this.id === vim.api.nvim_get_current_win() }
  get isFloating(): boolean { return (vim.api.nvim_win_get_config(this.id).relative as string) !== "" }

  get cursor(): Cursor {
    const [row, col] = vim.api.nvim_win_get_cursor(this.id)
    return { row, col }
  }
  set cursor(pos: Cursor) {
    vim.api.nvim_win_set_cursor(this.id, [pos.row, pos.col])
  }

  get config(): LuaDict { return vim.api.nvim_win_get_config(this.id) }
  configure(patch: LuaDict): void { vim.api.nvim_win_set_config(this.id, patch) }

  /** Run `fn` with this window as the current window. */
  call<T>(fn: () => T): T { return vim.api.nvim_win_call(this.id, fn) }
  get vars(): LuaDict { return vim.w[this.id]! }

  focus(): void { vim.api.nvim_set_current_win(this.id) }
  close(force = true): void { if (this.valid) vim.api.nvim_win_close(this.id, force) }
  hide(): void { if (this.valid) vim.api.nvim_win_hide(this.id) }
}

/** A floating window plus the buffer it shows. */
export class Float extends Window {
  readonly spec: FloatSpec

  constructor(id: number, spec: FloatSpec) {
    super(id)
    this.spec = spec
  }

  /** Recompute size/position from the spec (call on VimResized). */
  relayout(): void {
    this.configure(floatConfig(this.spec))
  }

  setTitle(title: string): void {
    this.configure({ title, title_pos: this.spec.titlePos ?? "center" })
  }
}

const floatConfig = (spec: FloatSpec): LuaDict => {
  const columns = vim.o.columns as number
  const lines = (vim.o.lines as number) - (vim.o.cmdheight as number) - 1
  const width = resolveSize(spec.width, columns, Math.floor(columns * 0.6))
  const height = resolveSize(spec.height, lines, Math.floor(lines * 0.6))
  const pos = spec.position ?? "center"
  let row = Math.floor((lines - height) / 2)
  let col = Math.floor((columns - width) / 2)
  if (pos.includes("top")) row = 1
  if (pos.includes("bottom")) row = lines - height - 1
  if (pos.includes("left")) col = 1
  if (pos.includes("right")) col = columns - width - 1
  const config: LuaDict = {
    relative: spec.relative ?? (pos === "cursor" ? "cursor" : "editor"),
    width,
    height,
    row: spec.row ?? (pos === "cursor" ? 1 : row),
    col: spec.col ?? (pos === "cursor" ? 0 : col),
    style: spec.style ?? "minimal",
    border: Array.isArray(spec.border) ? [...spec.border] : spec.border ?? "rounded",
  }
  if (spec.title !== undefined) { config.title = spec.title; config.title_pos = spec.titlePos ?? "center" }
  if (spec.footer !== undefined) { config.footer = spec.footer; config.footer_pos = spec.footerPos ?? "center" }
  if (spec.zindex !== undefined) config.zindex = spec.zindex
  return config
}

/** Open a floating window. */
export const float = (spec: FloatSpec = {}): Float => {
  const buf = spec.buffer === undefined ? Buffer.scratch() : typeof spec.buffer === "number" ? new Buffer(spec.buffer) : spec.buffer
  const id = vim.api.nvim_open_win(buf.id, spec.enter ?? true, floatConfig(spec))
  const win = new Float(id, spec)
  if (spec.winhighlight !== undefined) win.opt.winhighlight = spec.winhighlight
  if (spec.options) for (const k in spec.options) (win.opt as unknown as LuaDict)[k] = (spec.options as LuaDict)[k]
  const closeKeys = spec.closeKeys === false ? [] : spec.closeKeys === true || spec.closeKeys === undefined ? ["q", "<Esc>"] : spec.closeKeys
  for (const key of closeKeys) buf.map.n(key, () => win.close(), { nowait: true, desc: "Close window" })
  if (spec.closeOnLeave) buf.on("WinLeave", () => { win.close(); return true })
  return win
}

/** Split helpers. */
export const split = {
  below: (buf?: Buffer, size?: number): Window => {
    vim.cmd({ cmd: "split", mods: { split: "belowright" }, count: size })
    const w = Window.current()
    if (buf) w.buffer = buf
    return w
  },
  right: (buf?: Buffer, size?: number): Window => {
    vim.cmd({ cmd: "vsplit", mods: { split: "belowright" }, count: size })
    const w = Window.current()
    if (buf) w.buffer = buf
    return w
  },
}
