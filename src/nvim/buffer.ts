import * as Task from "./task"
import * as Stream from "./stream"
import * as Text from "./text"
import { behavior, type Node } from "./spec"
import { effect, type Readable } from "./state"
import type { Scope } from "./scope"

export type BufferRef = number
export interface Decoration {
  readonly range: Text.Range | Text.Pos
  readonly highlight?: string
  readonly virtualText?: string | ReadonlyArray<readonly [string, string]>
  readonly placement?: "eol" | "overlay" | "right_align" | "inline"
  readonly sign?: { readonly text: string; readonly highlight: string }
  readonly priority?: number
}
export interface Snapshot {
  readonly id: BufferRef
  readonly name: string
  readonly filetype: string
  readonly lines: readonly string[]
  readonly modified: boolean
  readonly tick: number
}
export const target = (scope: Scope): number => scope.buffer ?? vim.api.nvim_get_current_buf()
export const snapshot = (id: number): Snapshot => ({
  id,
  name: vim.api.nvim_buf_get_name(id),
  filetype: vim.api.nvim_get_option_value("filetype", { buf: id }) as string,
  lines: vim.api.nvim_buf_get_lines(id, 0, -1, false),
  modified: vim.api.nvim_get_option_value("modified", { buf: id }) as boolean,
  tick: vim.api.nvim_buf_get_changedtick(id),
})
const apply = (id: number, edits: readonly Text.Edit[]): void => {
  // Pure validation and preview happen before the first native mutation.
  const lines = vim.api.nvim_buf_get_lines(id, 0, -1, false)
  Text.applyEdits(lines, edits)
  const sorted = [...edits].sort((a, b) =>
    Text.comparePos(Text.ordered(b.range).start, Text.ordered(a.range).start),
  )
  let first = true
  for (const edit of sorted) {
    const { start, end } = Text.ordered(edit.range)
    if (!first)
      vim.api.nvim_buf_call(id, () => {
        pcall(vim.cmd, "undojoin")
      })
    first = false
    if (Text.isLinewiseEdit(edit))
      vim.api.nvim_buf_set_lines(id, start.line, end.line, false, [...edit.text.slice(0, -1)])
    else vim.api.nvim_buf_set_text(id, start.line, start.col, end.line, end.col, [...edit.text])
  }
}
export const buffer = {
  read: Task.sync((scope) => snapshot(target(scope))),
  /** Bind a computation to one buffer; later asynchronous continuations keep that target. */
  at:
    (id: BufferRef) =>
    <A>(task: Task.Task<A>): Task.Task<A> =>
      Task.make((scope, done) => {
        const local = scope.child("buffer", { buffer: id })
        Task.execute(local, task, done)
      }),
  edit: (...edits: readonly Text.Edit[]): Task.Task<void> =>
    Task.sync((scope) => apply(target(scope), edits)),
  transform: (edit: (lines: readonly string[]) => readonly Text.Edit[]): Task.Task<void> =>
    Task.sync((scope) => {
      const id = target(scope)
      const saved: Array<[number, LuaDict]> = vim.api
        .nvim_list_wins()
        .filter((win) => vim.api.nvim_win_get_buf(win) === id)
        .map((win) => [win, vim.api.nvim_win_call(win, () => vim.fn.winsaveview())])
      try {
        apply(id, edit(vim.api.nvim_buf_get_lines(id, 0, -1, false)))
      } finally {
        for (const [win, view] of saved)
          if (vim.api.nvim_win_is_valid(win))
            vim.api.nvim_win_call(win, () => vim.fn.winrestview(view))
      }
    }),
  /** Reject stale async edits instead of applying them to changed text. */
  commit: (base: Snapshot, edits: readonly Text.Edit[]): Task.Task<void> =>
    Task.sync(() => {
      if (
        !vim.api.nvim_buf_is_valid(base.id) ||
        vim.api.nvim_buf_get_changedtick(base.id) !== base.tick
      )
        throw new Error("Buffer changed while edits were being prepared")
      apply(base.id, edits)
    }),
  changes: (id: BufferRef): Stream.Stream<Snapshot> =>
    Stream.make((emit) => {
      let active = true
      vim.api.nvim_buf_attach(id, false, {
        on_lines: () => {
          if (!active) return true
          vim.schedule(() => {
            if (active && vim.api.nvim_buf_is_valid(id)) emit(snapshot(id))
          })
          return false
        },
        on_detach: () => {
          active = false
        },
      })
      return () => {
        active = false
      }
    }),
}
export const paint = (id: number, namespace: number, marks: readonly Decoration[]): void => {
  vim.api.nvim_buf_clear_namespace(id, namespace, 0, -1)
  for (const mark of marks) {
    const r =
      "line" in mark.range ? { start: mark.range, end: undefined } : Text.ordered(mark.range)
    const config: LuaDict = {}
    if (r.end) {
      config.end_row = r.end.line
      config.end_col = r.end.col
    }
    if (mark.highlight) config.hl_group = mark.highlight
    if (mark.virtualText) {
      config.virt_text =
        typeof mark.virtualText === "string"
          ? [[mark.virtualText, mark.highlight ?? "Normal"]]
          : mark.virtualText.map((chunk) => [...chunk])
      config.virt_text_pos = mark.placement ?? "eol"
    }
    if (mark.sign) {
      config.sign_text = mark.sign.text
      config.sign_hl_group = mark.sign.highlight
    }
    if (mark.priority !== undefined) config.priority = mark.priority
    vim.api.nvim_buf_set_extmark(id, namespace, r.start.line, r.start.col, config)
  }
}
export const decorations = (name: string, source: Readable<readonly Decoration[]>): Node =>
  behavior((scope) => {
    const id = target(scope)
    const namespace = vim.api.nvim_create_namespace(`pureluanvim.${name}.${id}`)
    scope.own(() => {
      if (vim.api.nvim_buf_is_valid(id)) vim.api.nvim_buf_clear_namespace(id, namespace, 0, -1)
    })
    effect(() => {
      if (vim.api.nvim_buf_is_valid(id)) paint(id, namespace, source.get())
    }, scope)
  })
