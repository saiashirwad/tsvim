import {
  component,
  events,
  exec,
  highlights,
  pipe,
  resource,
  State,
  Stream,
  statusbar,
  statusCode,
  Task,
  text,
  type Hex,
} from "../nvim"

export interface StatuslineColors {
  base: Hex
  mantle: Hex
  surface: Hex
  text: Hex
  subtext: Hex
  blue: Hex
  green: Hex
  yellow: Hex
  red: Hex
  mauve: Hex
}

const MODES: Record<string, [string, string]> = {
  n: ["NORMAL", "StModeNormal"],
  i: ["INSERT", "StModeInsert"],
  v: ["VISUAL", "StModeVisual"],
  V: ["V-LINE", "StModeVisual"],
  "\x16": ["V-BLOCK", "StModeVisual"],
  c: ["COMMAND", "StModeCommand"],
  R: ["REPLACE", "StModeReplace"],
  t: ["TERMINAL", "StModeInsert"],
  s: ["SELECT", "StModeVisual"],
  S: ["S-LINE", "StModeVisual"],
}

export const statusline = (colors: StatuslineColors) =>
  component("statusline", () => {
    const mode = State.hold(
      pipe(
        events("ModeChanged"),
        Stream.map(() => vim.api.nvim_get_mode().mode),
      ),
      vim.api.nvim_get_mode().mode,
    )
    const branch = resource(
      pipe(
        Task.defer(() => exec(["git", "branch", "--show-current"], { cwd: vim.fn.getcwd() })),
        Task.map((output) => output.trim()),
        Task.catchAll(() => Task.succeed("")),
      ),
      { initial: "", refresh: events(["BufEnter", "FocusGained", "DirChanged"]) },
    )
    return [
      highlights({
        StModeNormal: { fg: colors.base, bg: colors.blue, bold: true },
        StModeInsert: { fg: colors.base, bg: colors.green, bold: true },
        StModeVisual: { fg: colors.base, bg: colors.mauve, bold: true },
        StModeCommand: { fg: colors.base, bg: colors.yellow, bold: true },
        StModeReplace: { fg: colors.base, bg: colors.red, bold: true },
        StFile: { fg: colors.text, bg: colors.surface },
        StGit: { fg: colors.mauve, bg: colors.mantle },
        StError: { fg: colors.red, bg: colors.mantle },
        StWarn: { fg: colors.yellow, bg: colors.mantle },
        StLsp: { fg: colors.green, bg: colors.mantle },
        StFt: { fg: colors.subtext, bg: colors.surface },
        StPos: { fg: colors.base, bg: colors.blue, bold: true },
      }),
      statusbar(() => {
        const [label, group] = MODES[mode.get().substring(0, 1)] ?? [
          mode.get().toUpperCase(),
          "StModeNormal",
        ]
        const counts = vim.diagnostic.count(0)
        const errors = counts[vim.diagnostic.severity.ERROR] ?? 0
        const warnings = counts[vim.diagnostic.severity.WARN] ?? 0
        const filename = vim.fn.expand("%:~:.")
        const clients = vim.lsp
          .get_clients({ bufnr: 0 })
          .map((client) => client.name)
          .join(",")
        return {
          left: [
            text(` ${label} `, group),
            text(branch.value.get() !== "" ? `  ${branch.value.get()} ` : "", "StGit"),
            text(
              ` ${filename === "" ? "[No Name]" : filename}${vim.bo.modified ? " ●" : ""} `,
              "StFile",
            ),
            text(errors > 0 ? ` ${errors} ` : "", "StError"),
            text(warnings > 0 ? ` ${warnings} ` : "", "StWarn"),
          ],
          right: [
            text(` ${clients} `, "StLsp"),
            text(` ${vim.bo.filetype} `, "StFt"),
            statusCode(" %l:%c  %P ", "StPos"),
          ],
        }
      }),
    ]
  })
