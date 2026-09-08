import { behavior, type Node } from "./spec"
import { invoke, type Action } from "./action"
import * as Task from "./task"

export type Nargs = 0 | 1 | "?" | "*" | "+"
type ArgsFor<N extends Nargs> = N extends 0
  ? []
  : N extends 1
    ? [string]
    : N extends "?"
      ? [] | [string]
      : N extends "+"
        ? [string, ...string[]]
        : string[]

export interface CommandArgs<N extends Nargs = "*"> {
  readonly args: string
  readonly fargs: ArgsFor<N>
  readonly bang: boolean
  readonly line1: number
  readonly line2: number
  readonly range: 0 | 1 | 2
  readonly count: number
  readonly reg: string
  readonly mods: string
  readonly smods: LuaDict
}

export type CompleteKind =
  | "arglist"
  | "augroup"
  | "buffer"
  | "color"
  | "command"
  | "compiler"
  | "dir"
  | "environment"
  | "event"
  | "expression"
  | "file"
  | "file_in_path"
  | "filetype"
  | "function"
  | "help"
  | "highlight"
  | "history"
  | "keymap"
  | "locale"
  | "lua"
  | "mapclear"
  | "mapping"
  | "menu"
  | "messages"
  | "option"
  | "packadd"
  | "shellcmd"
  | "sign"
  | "syntax"
  | "syntime"
  | "tag"
  | "tag_listfiles"
  | "user"
  | "var"

export interface CommandOptions<N extends Nargs = 0> {
  nargs?: N
  desc?: string
  bang?: boolean
  bar?: boolean
  /** `true` = current line default, `"%"` = whole file, number = count default */
  range?: boolean | "%" | number
  count?: boolean | number
  register?: boolean
  complete?:
    | CompleteKind
    | ((this: void, argLead: string, cmdLine: string, cursorPos: number) => string[])
}

/** Named actions and parameterized commands share the same task interpreter. */
export function command(name: string, action: Action): Node
export function command<N extends Nargs>(
  name: string,
  options: CommandOptions<N>,
  handle: (args: CommandArgs<N>) => Task.Task<unknown>,
): Node
export function command<N extends Nargs>(
  name: string,
  actionOrOptions: Action | CommandOptions<N>,
  handle?: (args: CommandArgs<N>) => Task.Task<unknown>,
): Node {
  return behavior((scope) => {
    const isAction = "task" in actionOrOptions
    const options = isAction ? { desc: actionOrOptions.label } : actionOrOptions
    const config: LuaDict = { force: false }
    for (const key in options) config[key] = (options as LuaDict)[key]
    const callback = (args: LuaDict) =>
      invoke(
        scope,
        isAction
          ? actionOrOptions.task
          : Task.defer(() => handle!(args as unknown as CommandArgs<N>)),
      )
    if (scope.buffer === undefined) {
      vim.api.nvim_create_user_command(name, callback, config)
      scope.own(() => {
        pcall(vim.api.nvim_del_user_command, name)
      })
    } else {
      vim.api.nvim_buf_create_user_command(scope.buffer, name, callback, config)
      scope.own(() => {
        pcall(vim.api.nvim_buf_del_user_command, scope.buffer!, name)
      })
    }
  })
}
