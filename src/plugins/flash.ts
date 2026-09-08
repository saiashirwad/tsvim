import { action, component, highlights, keys, Task, type Pos } from "../nvim"
import { readKey } from "../nvim/input"
export interface Target {
  readonly window: number
  readonly buffer: number
  readonly position: Pos
  readonly next: string
}
export interface Screen {
  readonly window: number
  readonly buffer: number
  readonly first: number
  readonly lines: readonly string[]
}
export const findTargets = (screens: readonly Screen[], query: string): Target[] => {
  if (query === "") return []
  const targets: Target[] = []
  for (const screen of screens)
    screen.lines.forEach((line, row) => {
      let from = 0
      for (;;) {
        const column = line.toLowerCase().indexOf(query.toLowerCase(), from)
        if (column < 0) break
        targets.push({
          window: screen.window,
          buffer: screen.buffer,
          position: { line: screen.first + row, col: column },
          next: line.substring(column + query.length, column + query.length + 1).toLowerCase(),
        })
        from = column + Math.max(1, query.length)
      }
    })
  return targets
}
export const labelTargets = (
  targets: readonly Target[],
  alphabet = "asdfghjklqwertyuiopzxcvbnm",
): Array<{ target: Target; label: string }> => {
  const available = alphabet
    .split("")
    .filter((char) => !targets.some((target) => target.next === char))
  if (available.length === 0) return []
  let width = 1
  while (Math.pow(available.length, width) < targets.length && width < 4) width++
  if (available.length === 1 && targets.length > 1) return []
  return targets.slice(0, Math.pow(available.length, width)).map((target, index) => {
    let value = index
    let label = ""
    for (let i = 0; i < width; i++) {
      label = available[value % available.length]! + label
      value = Math.floor(value / available.length)
    }
    return { target, label }
  })
}
export const jump = (
  options: { readonly backward?: boolean; readonly multiWindow?: boolean } = {},
) =>
  Task.sync((scope) => {
    const origin = vim.api.nvim_get_current_win()
    const mode = vim.fn.mode(1)
    const localOnly = mode.startsWith("no") || mode === "v" || mode === "V" || mode === "\x16"
    if (mode === "\x16") throw new Error("Flash does not support blockwise visual selections")
    const windows =
      localOnly || options.multiWindow === false ? [origin] : vim.api.nvim_tabpage_list_wins(0)
    const namespace = vim.api.nvim_create_namespace("pureluanvim.flash")
    const touched = new Set<number>()
    const cursor = vim.api.nvim_win_get_cursor(origin)
    const clear = () => {
      for (const buffer of touched)
        if (vim.api.nvim_buf_is_valid(buffer))
          vim.api.nvim_buf_clear_namespace(buffer, namespace, 0, -1)
    }
    scope.own(clear)
    let query = ""
    let prefix = ""
    for (;;) {
      if (!scope.alive()) return
      clear()
      const screens: Screen[] = windows
        .filter((win) => vim.api.nvim_win_is_valid(win))
        .map((window) =>
          vim.api.nvim_win_call(window, () => {
            const buffer = vim.api.nvim_win_get_buf(window)
            touched.add(buffer)
            const first = vim.fn.line("w0") - 1
            const last = vim.fn.line("w$")
            const lines = vim.api
              .nvim_buf_get_lines(buffer, first, last, false)
              .map((line, row) =>
                vim.fn.foldclosed(first + row + 1) >= 0 &&
                vim.fn.foldclosed(first + row + 1) !== first + row + 1
                  ? ""
                  : line,
              )
            return { window, buffer, first, lines }
          }),
        )
      const targets = findTargets(screens, query).sort((a, b) => {
        const distance = (target: Target) => {
          if (target.window !== origin)
            return 1e9 + target.window * 10000 + target.position.line * 1000 + target.position.col
          const delta =
            (target.position.line - cursor[0] + 1) * 100000 + target.position.col - cursor[1]
          const directed = options.backward ? -delta : delta
          return directed > 0 ? directed : 1e8 + directed
        }
        return distance(a) - distance(b)
      })
      const labels = labelTargets(targets)
      for (const entry of labels) {
        if (!entry.label.startsWith(prefix)) continue
        vim.api.nvim_buf_set_extmark(
          entry.target.buffer,
          namespace,
          entry.target.position.line,
          entry.target.position.col,
          {
            virt_text: [[entry.label.substring(prefix.length), "NeoFlashLabel"]],
            virt_text_pos: "overlay",
            priority: 5000,
            end_col: entry.target.position.col + query.length,
            hl_group: "NeoFlashMatch",
          },
        )
      }
      const key = readKey(`Flash › ${query}${prefix === "" ? "" : ` [${prefix}]`}`)
      if (key === undefined) {
        if (localOnly && mode.startsWith("no")) vim.api.nvim_feedkeys("\x1b", "n", false)
        return
      }
      if (key === "\b" || key === "\x7f" || key === vim.keycode("<BS>")) {
        if (prefix !== "") prefix = prefix.substring(0, prefix.length - 1)
        else query = query.substring(0, query.length - 1)
        continue
      }
      if (key === "\r" && targets.length > 0) {
        const target = targets[0]!
        vim.cmd("normal! m'")
        vim.api.nvim_set_current_win(target.window)
        vim.api.nvim_win_set_cursor(target.window, [target.position.line + 1, target.position.col])
        return
      }
      const choice = labels.find((entry) => entry.label === prefix + key)
      if (choice) {
        vim.cmd("normal! m'")
        vim.api.nvim_set_current_win(choice.target.window)
        vim.api.nvim_win_set_cursor(choice.target.window, [
          choice.target.position.line + 1,
          choice.target.position.col,
        ])
        return
      }
      if (labels.some((entry) => entry.label.startsWith(prefix + key))) prefix += key
      else {
        prefix = ""
        query += key
      }
    }
  })
export const flash = () =>
  component("flash", () => [
    highlights({
      NeoFlashLabel: { fg: "#1e1e2e", bg: "#f9e2af", bold: true },
      NeoFlashMatch: { underline: true },
    }),
    keys.in(["n", "x", "o"], {
      s: action("Flash", jump({ multiWindow: true })),
      S: action("Flash backward", jump({ backward: true, multiWindow: true })),
    }),
  ])
