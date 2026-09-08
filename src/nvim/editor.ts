import * as Task from "./task"
import { target } from "./buffer"
import { pos, range, ordered, type Range } from "./text"
const inWindow = <A>(scope: import("./scope").Scope, fn: () => A): A => {
  const win = scope.window ?? vim.api.nvim_get_current_win()
  if (!vim.api.nvim_win_is_valid(win)) throw new Error("Target window has closed")
  return vim.api.nvim_win_call(win, fn)
}
export const editor = {
  ex: (command: string): Task.Task<void> =>
    Task.sync((scope) => inWindow(scope, () => vim.cmd(command))),
  openFile: (path: string): Task.Task<void> =>
    Task.sync((scope) => inWindow(scope, () => vim.cmd({ cmd: "edit", args: [path] }))),
  save: Task.sync((scope) => vim.api.nvim_buf_call(target(scope), () => vim.cmd("write"))),
  close: Task.sync((scope) => inWindow(scope, () => vim.cmd("close"))),
  notify: (message: string, level: "info" | "warn" | "error" = "info"): Task.Task<void> =>
    Task.sync(() => vim.notify(message, { info: 2, warn: 3, error: 4 }[level])),
  cursor: Task.sync((scope) => {
    const [line, col] = vim.api.nvim_win_get_cursor(scope.window ?? 0)
    return pos(line - 1, col)
  }),
  move: (position: import("./text").Pos): Task.Task<void> =>
    Task.sync((scope) =>
      vim.api.nvim_win_set_cursor(scope.window ?? 0, [position.line + 1, position.col]),
    ),
  selection: Task.sync((scope) =>
    inWindow(scope, (): Range => {
      const [line, col] = vim.api.nvim_win_get_cursor(0)
      const mode = vim.fn.mode()
      if (mode === "\x16")
        throw new Error(
          "Block selections are multiple ranges; a single text range cannot represent them",
        )
      if (mode !== "v" && mode !== "V") return range(pos(line - 1, col), pos(line - 1, col))
      const [, anchorLine, anchorCol] = vim.fn.getpos("v")
      const selected = ordered(range(pos(anchorLine - 1, anchorCol - 1), pos(line - 1, col)))
      if (mode === "V") return range(pos(selected.start.line), pos(selected.end.line + 1))
      const text = vim.api.nvim_get_current_line()
      const tail =
        vim.api.nvim_buf_get_lines(
          target(scope),
          selected.end.line,
          selected.end.line + 1,
          false,
        )[0] ?? text
      const byte = string.byte(tail, selected.end.col + 1)
      const width = byte === undefined ? 0 : byte < 128 ? 1 : byte < 224 ? 2 : byte < 240 ? 3 : 4
      return range(
        selected.start,
        pos(selected.end.line, Math.min(tail.length, selected.end.col + width)),
      )
    }),
  ),
  native: Task.sync,
}
export const files = {
  read: (path: string): Task.Task<readonly string[]> => Task.sync(() => vim.fn.readfile(path)),
  write: (path: string, lines: readonly string[]): Task.Task<void> =>
    Task.sync(() => {
      vim.fn.mkdir(vim.fs.dirname(path), "p")
      if (vim.fn.writefile([...lines], path) !== 0) throw new Error(`Could not write ${path}`)
    }),
  dataPath: (name: string): Task.Task<string> =>
    Task.sync(() => vim.fs.joinpath(vim.fn.stdpath("data"), name)),
}
export const diagnostics = {
  next: Task.sync(() => vim.diagnostic.jump({ count: 1, float: true })),
  previous: Task.sync(() => vim.diagnostic.jump({ count: -1, float: true })),
  show: Task.sync(() => vim.diagnostic.open_float()),
  list: Task.sync(() => vim.diagnostic.setqflist()),
}
