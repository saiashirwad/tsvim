import { behavior, type Node } from "./spec"
import { lease } from "./lease"
import { type Mode } from "./keys"
import { invoke } from "./action"
import * as Task from "./task"
import * as Text from "./text"

/** Synchronous expression mappings: decisions return keys, never asynchronous work. */
export interface Expression {
  readonly label: string
  readonly read: (this: void) => string
}
export const expression = (
  modes: readonly Mode[],
  bindings: Readonly<Record<string, Expression>>,
): Node =>
  behavior((scope) => {
    for (const mode of modes)
      for (const lhs in bindings) {
        const binding = bindings[lhs]!
        const buffer = scope.buffer
        const canonical = vim.api.nvim_replace_termcodes(lhs, true, true, true)
        const previous = (
          buffer === undefined
            ? vim.api.nvim_get_keymap(mode)
            : vim.api.nvim_buf_get_keymap(buffer, mode)
        ).find(
          (map) =>
            vim.api.nvim_replace_termcodes(map.lhs as string, true, true, true) === canonical,
        )
        const context = (fn: () => void) =>
          buffer === undefined ? fn() : vim.api.nvim_buf_call(buffer, fn)
        scope.own(
          lease(
            `key:${buffer ?? "global"}:${mode}:${canonical}`,
            () => {
              if (buffer !== undefined && !vim.api.nvim_buf_is_valid(buffer)) return
              pcall(vim.keymap.del, mode, lhs, buffer === undefined ? {} : { buffer })
              if (previous) context(() => vim.fn.mapset(mode, false, previous))
            },
            () =>
              vim.keymap.set(mode, lhs, binding.read, {
                expr: true,
                replace_keycodes: true,
                silent: true,
                desc: binding.label,
                ...(buffer === undefined ? {} : { buffer }),
              }),
          ),
        )
      }
  })
export const byteEnd = (line: string, column: number): number => {
  const byte = string.byte(line, column + 1)
  return Math.min(
    line.length,
    column + (byte === undefined ? 0 : byte < 128 ? 1 : byte < 224 ? 2 : byte < 240 ? 3 : 4),
  )
}
export const markedRange = (buffer: number, first = "[", last = "]"): Text.Range => {
  const a = vim.api.nvim_buf_get_mark(buffer, first)
  const b = vim.api.nvim_buf_get_mark(buffer, last)
  const end = vim.api.nvim_buf_get_lines(buffer, b[0] - 1, b[0], false)[0] ?? ""
  return Text.ordered(Text.range(Text.pos(a[0] - 1, a[1]), Text.pos(b[0] - 1, byteEnd(end, b[1]))))
}
let operatorId = 0
/** Own a native motion operator. Neovim supplies counts, motions and text objects. */
export const operator = (
  label: string,
  bindings: Readonly<Record<string, string>>,
  handle: (range: Text.Range, kind: string) => Task.Task<unknown>,
): Node =>
  behavior((scope) => {
    const name = `pureluanvim_operator_${++operatorId}`
    const reference = `v:lua.${name}`
    const old = vim.go.operatorfunc
    ;(_G as LuaDict)[name] = (kind: string) => {
      const buffer = scope.buffer ?? vim.api.nvim_get_current_buf()
      if (kind === "block") {
        scope.report("Blockwise operators are not supported")
        return
      }
      invoke(
        scope,
        Task.defer(() => handle(markedRange(buffer), kind)),
      )
    }
    scope.own(() => {
      ;(_G as LuaDict)[name] = undefined
      if (vim.go.operatorfunc === reference) vim.go.operatorfunc = old ?? ""
    })
    const maps: Record<string, Expression> = {}
    for (const lhs in bindings)
      maps[lhs] = {
        label,
        read: () => {
          vim.go.operatorfunc = reference
          return `g@${bindings[lhs]}`
        },
      }
    expression(["n"], maps).install(scope)
  })
/** Read one literal key. Escape and Ctrl-C cancel without producing a value. */
export const readKey = (prompt: string): string | undefined => {
  vim.api.nvim_echo([[prompt, "Question"]], false, {})
  vim.cmd("redraw")
  const [ok, key] = pcall(() => vim.fn.getcharstr())
  vim.api.nvim_echo([[""]], false, {})
  return !ok || key === "\x1b" || key === "\x03" ? undefined : (key as string)
}
