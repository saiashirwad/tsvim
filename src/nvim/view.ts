import { behavior, mount, type Behavior, type Node } from "./spec"
import { within, type Scope } from "./scope"
import { effect, type Readable } from "./state"
import { paint, type Decoration } from "./buffer"
import { span } from "./text"
import * as Task from "./task"

export interface Chunk {
  readonly text: string
  readonly highlight?: string
}
export type Line = readonly Chunk[]
export type Document = readonly Line[]
export const text = (value: string, highlight?: string): Chunk =>
  highlight === undefined ? { text: value } : { text: value, highlight }
export const line = (...chunks: readonly Chunk[]): Line => chunks
export const lines = (...rows: readonly Line[]): Document => rows
export interface Render {
  readonly lines: readonly string[]
  readonly marks: readonly Decoration[]
}
/** Rich text compiles to byte ranges at the edge, not in plugin code. */
export const render = (document: Document): Render => {
  const output: string[] = []
  const marks: Decoration[] = []
  document.forEach((row, index) => {
    let value = ""
    for (const chunk of row) {
      if (chunk.text.includes("\n")) throw new Error("Use separate lines for multiline text")
      if (chunk.highlight && chunk.text.length > 0)
        marks.push({
          range: span(index, value.length, value.length + chunk.text.length),
          highlight: chunk.highlight,
        })
      value += chunk.text
    }
    output.push(value)
  })
  return { lines: output.length === 0 ? [""] : output, marks }
}
/** @noSelf */
export interface MountedView {
  readonly buffer: number
  readonly scope: Scope
}
/** Content is independent of placement. One live mount per view instance. @noSelf */
export interface View {
  readonly attach: (scope: Scope) => MountedView
  readonly bind: (body: Behavior) => Node
}
export interface ViewOptions {
  readonly name?: string
  readonly filetype?: string
}
export const createView = (
  install: (scope: Scope, buffer: number) => void,
  options: ViewOptions = {},
): View => {
  let current: MountedView | undefined
  const bindings = new Set<{ body: Behavior; live: Scope | undefined }>()
  const attachBinding = (entry: { body: Behavior; live: Scope | undefined }, parent: Scope) => {
    entry.live = parent.child("view-binding")
    try {
      mount(entry.body, entry.live)
    } catch (error) {
      entry.live.close()
      throw error
    }
  }
  return {
    attach: (parent) => {
      if (current?.scope.alive())
        throw new Error(
          "A view already has a placement; create another view instance to mount it twice",
        )
      const buffer = vim.api.nvim_create_buf(false, true)
      const scope = parent.child("view", { buffer })
      current = { scope, buffer }
      let wiping = false
      scope.own(() => {
        if (!wiping && vim.api.nvim_buf_is_valid(buffer))
          vim.api.nvim_buf_delete(buffer, { force: true })
        current = undefined
      })
      const wipe = vim.api.nvim_create_autocmd("BufWipeout", {
        buffer,
        once: true,
        callback: () => {
          wiping = true
          scope.close()
        },
      })
      scope.own(() => {
        pcall(vim.api.nvim_del_autocmd, wipe)
      })
      vim.api.nvim_set_option_value("bufhidden", "hide", { buf: buffer })
      if (options.name) vim.api.nvim_buf_set_name(buffer, `pureluanvim://${buffer}/${options.name}`)
      if (options.filetype)
        vim.api.nvim_set_option_value("filetype", options.filetype, { buf: buffer })
      try {
        within(scope, () => install(scope, buffer))
        for (const entry of bindings) attachBinding(entry, scope)
      } catch (error) {
        scope.close()
        throw error
      }
      return current!
    },
    bind: (body) =>
      behavior((scope) => {
        const entry = { body, live: undefined as Scope | undefined }
        bindings.add(entry)
        scope.own(() => {
          bindings.delete(entry)
          entry.live?.close()
        })
        if (current?.scope.alive()) attachBinding(entry, current.scope)
      }),
  }
}
export const draw = (buffer: number, value: Render): void => {
  const previous = vim.api.nvim_get_option_value("modifiable", { buf: buffer })
  vim.api.nvim_set_option_value("modifiable", true, { buf: buffer })
  try {
    const old = vim.api.nvim_buf_get_lines(buffer, 0, -1, false)
    let start = 0
    while (start < old.length && start < value.lines.length && old[start] === value.lines[start])
      start++
    let oldEnd = old.length
    let newEnd = value.lines.length
    while (oldEnd > start && newEnd > start && old[oldEnd - 1] === value.lines[newEnd - 1]) {
      oldEnd--
      newEnd--
    }
    if (start !== oldEnd || start !== newEnd)
      vim.api.nvim_buf_set_lines(buffer, start, oldEnd, false, [
        ...value.lines.slice(start, newEnd),
      ])
    paint(buffer, vim.api.nvim_create_namespace(`pureluanvim.view.${buffer}`), value.marks)
    vim.api.nvim_set_option_value("modified", false, { buf: buffer })
  } finally {
    vim.api.nvim_set_option_value("modifiable", previous, { buf: buffer })
  }
}
export const view = (renderDocument: () => Document, options: ViewOptions = {}): View =>
  createView((scope, buffer) => {
    vim.api.nvim_set_option_value("modifiable", false, { buf: buffer })
    effect(() => draw(buffer, render(renderDocument())), scope)
  }, options)
export interface ListOptions<A> extends ViewOptions {
  readonly key: (item: A) => string
  readonly row: (item: A) => Line | Document
  readonly empty?: Line
}
/** @noSelf */
export interface ListView<A> extends View {
  readonly withSelection: <B>(fn: (item: A) => Task.Task<B>) => Task.Task<B | undefined>
}
export const list = <A>(source: Readable<readonly A[]>, options: ListOptions<A>): ListView<A> => {
  let mounted: MountedView | undefined
  let rows: Array<{ key: string; item: A; start: number; end: number }> = []
  const content = createView((scope, buffer) => {
    mounted = { scope, buffer }
    scope.own(() => {
      mounted = undefined
      rows = []
    })
    vim.api.nvim_set_option_value("modifiable", false, { buf: buffer })
    effect(() => {
      const cursors = vim.api
        .nvim_list_wins()
        .filter((win) => vim.api.nvim_win_get_buf(win) === buffer)
        .map((win) => {
          const [row, col] = vim.api.nvim_win_get_cursor(win)
          const item = rows.find((item) => row - 1 >= item.start && row - 1 < item.end)
          return { win, key: item?.key, row: row - 1, offset: item ? row - 1 - item.start : 0, col }
        })
      const next: typeof rows = []
      const document: Line[] = []
      const seen = new Set<string>()
      for (const item of source.get()) {
        const key = options.key(item)
        if (seen.has(key)) throw new Error(`Duplicate list key: ${key}`)
        seen.add(key)
        const rendered = options.row(item)
        const itemLines: Document =
          rendered.length === 0
            ? [[]]
            : Array.isArray(rendered[0])
              ? (rendered as Document)
              : [rendered as Line]
        const start = document.length
        document.push(...itemLines)
        next.push({ key, item, start, end: document.length })
      }
      if (document.length === 0) document.push(options.empty ?? line(text("No items", "Comment")))
      draw(buffer, render(document))
      rows = next
      for (const cursor of cursors) {
        const item = rows.find((item) => item.key === cursor.key)
        const row = item
          ? Math.min(item.end - 1, item.start + cursor.offset)
          : Math.min(cursor.row, document.length - 1)
        vim.api.nvim_win_set_cursor(cursor.win, [row + 1, cursor.col])
      }
    }, scope)
  }, options)
  return {
    ...content,
    withSelection: (fn) =>
      Task.defer(() => {
        if (!mounted?.scope.alive()) return Task.succeed(undefined)
        const win = vim.api.nvim_get_current_win()
        if (vim.api.nvim_win_get_buf(win) !== mounted.buffer) return Task.succeed(undefined)
        const [row] = vim.api.nvim_win_get_cursor(win)
        const selected = rows.find((item) => row - 1 >= item.start && row - 1 < item.end)
        return selected ? fn(selected.item) : Task.succeed(undefined)
      }),
  }
}
