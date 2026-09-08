import { behavior, type Node } from "./spec"
import { invoke, type Action } from "./action"
import { lease } from "./lease"
import * as Task from "./task"
export type Mode = "n" | "i" | "v" | "x" | "s" | "o" | "t" | "c"
export interface BindingOptions {
  readonly silent?: boolean
  readonly nowait?: boolean
}
export interface Bindings {
  readonly [key: string]: Action
}
export interface KeyTree {
  readonly [key: string]: Action | KeyTree
}
const flatten = (tree: KeyTree, prefix = ""): Array<[string, Action]> => {
  const out: Array<[string, Action]> = []
  for (const key in tree) {
    const value = tree[key]!
    if (typeof value.label === "string" && "task" in value)
      out.push([prefix + key, value as Action])
    else out.push(...flatten(value as KeyTree, prefix + key))
  }
  return out
}
const bind = (
  modes: readonly Mode[],
  tree: KeyTree,
  prefix = "",
  options: BindingOptions = {},
): Node =>
  behavior((scope) => {
    const buffer = scope.buffer
    const inContext = <A>(fn: () => A): A =>
      buffer === undefined ? fn() : vim.api.nvim_buf_call(buffer, fn)
    for (const mode of modes)
      for (const [lhs, action] of flatten(tree, prefix)) {
        const canonical = vim.api.nvim_replace_termcodes(lhs, true, true, true)
        const previous = (
          buffer === undefined
            ? vim.api.nvim_get_keymap(mode)
            : vim.api.nvim_buf_get_keymap(buffer, mode)
        ).find(
          (map) =>
            vim.api.nvim_replace_termcodes(map.lhs as string, true, true, true) === canonical,
        )
        const opts: LuaDict = {
          desc: action.label,
          silent: options.silent ?? true,
          nowait: options.nowait ?? false,
        }
        if (buffer !== undefined) opts.buffer = buffer
        scope.own(
          lease(
            `key:${buffer ?? "global"}:${mode}:${canonical}`,
            () => {
              if (buffer !== undefined && !vim.api.nvim_buf_is_valid(buffer)) return
              pcall(vim.keymap.del, mode, lhs, buffer === undefined ? {} : { buffer })
              if (previous) inContext(() => vim.fn.mapset(mode, false, previous))
            },
            () => {
              if (buffer !== undefined && !vim.api.nvim_buf_is_valid(buffer)) return
              vim.keymap.set(mode, lhs, () => invoke(scope, action.task), opts)
            },
          ),
        )
      }
  })
export const keys = {
  normal: (bindings: Bindings, options?: BindingOptions) => bind(["n"], bindings, "", options),
  insert: (bindings: Bindings) => bind(["i"], bindings),
  visual: (bindings: Bindings) => bind(["v"], bindings),
  terminal: (bindings: Bindings) => bind(["t"], bindings),
  in: (modes: readonly Mode[], bindings: Bindings) => bind(modes, bindings),
  leader: (bindings: KeyTree) => bind(["n"], bindings, "<leader>"),
  prefix: (prefix: string, bindings: KeyTree, modes: readonly Mode[] = ["n"]) =>
    bind(modes, bindings, prefix),
  /** Key notation is explicit, so strings never change meaning by context. */
  feed: (notation: string, remap = false): Task.Task<void> =>
    Task.sync(() =>
      vim.api.nvim_feedkeys(
        vim.api.nvim_replace_termcodes(notation, true, true, true),
        remap ? "m" : "n",
        false,
      ),
    ),
}
