// User commands whose argument tuple is typed by `nargs`.
//
//   command("Greet", { nargs: "1" }, ({ fargs: [name] }) => notify(`hi ${name}`))
//   command("Trim", trimWhitespace, { range: true, desc: "Trim trailing whitespace" })

export type Nargs = "0" | "1" | "?" | "*" | "+"

type ArgsFor<N extends Nargs> =
  N extends "0" ? [] :
  N extends "1" ? [string] :
  N extends "?" ? [] | [string] :
  N extends "+" ? [string, ...string[]] :
  string[]

export interface CommandArgs<N extends Nargs = "*"> {
  /** the raw argument string */
  readonly args: string
  /** arguments split on unescaped whitespace, typed by `nargs` */
  readonly fargs: ArgsFor<N>
  readonly bang: boolean
  readonly line1: number
  readonly line2: number
  /** number of items in the range: 0 (none), 1, or 2 */
  readonly range: 0 | 1 | 2
  readonly count: number
  readonly reg: string
  /** e.g. "vertical", "silent" */
  readonly mods: string
  readonly smods: LuaDict
  readonly name: string
}

export type CompleteKind =
  | "arglist" | "augroup" | "buffer" | "color" | "command" | "compiler" | "dir" | "environment" | "event" | "expression"
  | "file" | "file_in_path" | "filetype" | "function" | "help" | "highlight" | "history" | "keymap" | "locale" | "lua"
  | "mapclear" | "mapping" | "menu" | "messages" | "option" | "packadd" | "shellcmd" | "sign" | "syntax" | "syntime"
  | "tag" | "tag_listfiles" | "user" | "var"

export interface CommandOptions<N extends Nargs = "0"> {
  nargs?: N
  desc?: string
  bang?: boolean
  bar?: boolean
  /** `true` = current line default (`-range`), `"%"` = whole file default, number = count default */
  range?: boolean | "%" | number
  count?: boolean | number
  register?: boolean
  keepscript?: boolean
  /** built-in completion kind, or a function returning candidates */
  complete?: CompleteKind | ((this: void, argLead: string, cmdLine: string, cursorPos: number) => string[])
  /** buffer-local command (`true` = current buffer) */
  buffer?: number | true
  force?: boolean
}

export type CommandHandler<N extends Nargs> = (this: void, args: CommandArgs<N>) => void

/** @noSelf */
export interface Command extends Disposable {
  readonly name: string
  /** run it: `cmd.run("arg1 arg2")` */
  run(args?: string): void
}

import type { Disposable } from "./events"

const register = <N extends Nargs>(name: string, handler: CommandHandler<N> | string, options: CommandOptions<N>): Command => {
  const o: LuaDict = {}
  for (const k of ["nargs", "desc", "bang", "bar", "range", "count", "register", "keepscript", "force"] as const) {
    const v = options[k]
    if (v !== undefined) o[k] = v
  }
  // the API wants numeric nargs for 0 and 1
  if (o.nargs === "0") o.nargs = 0
  if (o.nargs === "1") o.nargs = 1
  if (options.complete !== undefined) o.complete = options.complete
  if (options.force === undefined) o.force = true
  const buffer = options.buffer === true ? 0 : options.buffer
  if (buffer !== undefined) vim.api.nvim_buf_create_user_command(buffer, name, handler as never, o)
  else vim.api.nvim_create_user_command(name, handler as never, o)
  return {
    name,
    run: (args = "") => vim.cmd(`${name} ${args}`),
    dispose: () => { pcall(vim.api.nvim_del_user_command, name) },
  }
}

/** Define a user command. Options may come before or after the handler. */
export function command<N extends Nargs = "0">(name: string, options: CommandOptions<N>, handler: CommandHandler<N> | string): Command
export function command<N extends Nargs = "0">(name: string, handler: CommandHandler<N> | string, options?: CommandOptions<N>): Command
export function command<N extends Nargs = "0">(
  name: string,
  a: CommandOptions<N> | CommandHandler<N> | string,
  b?: CommandOptions<N> | CommandHandler<N> | string,
): Command {
  if (typeof a === "function" || typeof a === "string") return register(name, a, (b as CommandOptions<N>) ?? {})
  return register(name, b as CommandHandler<N> | string, a)
}

/** Run an Ex command string (`ex("wincmd p")`) – also works as a tagged template: ex`normal! gg` */
export function ex(strings: TemplateStringsArray | string, ...values: unknown[]): void {
  if (typeof strings === "string") return vim.cmd(strings)
  let out = ""
  strings.forEach((s, i) => { out += s + (i < values.length ? String(values[i]) : "") })
  vim.cmd(out)
}

/** Run an Ex command and capture its output. */
export const exOutput = (command: string): string => vim.api.nvim_exec2(command, { output: true }).output ?? ""

/** `:normal!` (no remapping) with key notation. */
export const normal = (keys: string, remap = false): void =>
  vim.cmd({ cmd: "normal", args: [vim.api.nvim_replace_termcodes(keys, true, true, true)], bang: !remap })
