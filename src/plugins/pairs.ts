import { component, forBuffers, type Behavior } from "../nvim"
import { expression } from "../nvim/input"
const pairs: Readonly<Record<string, string>> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "`": "`",
}
export const pairKeys = (before: string, after: string, key: string): string => {
  if (key === "<BS>")
    return pairs[before.slice(-1)] === after.substring(0, 1) && before !== "" ? "<BS><Del>" : "<BS>"
  if (key === "<CR>")
    return pairs[before.slice(-1)] === after.substring(0, 1) && before !== ""
      ? "<CR><Esc>O"
      : "<CR>"
  if (after.startsWith(key) && Object.values(pairs).includes(key)) return "<Right>"
  const close = pairs[key]
  if (!close) return key
  if (before.endsWith("\\")) return key
  if (key === "'" && string.match(before, "[%w_]$")[0] !== undefined) return key
  // Quotes inside a word or string should not grow another pair.
  if (
    key === close &&
    (string.match(after, "^[%w_]")[0] !== undefined || before.split(key).length % 2 === 0)
  )
    return key
  if (after !== "" && string.match(after, "^[%w_]")[0] !== undefined) return key
  return key + close + "<Left>"
}
export const autoPairs = (): Behavior =>
  component("pairs", () => [
    forBuffers(
      (id) =>
        !["purepicker_prompt", "purepicker", "neo-explorer"].includes(
          vim.api.nvim_get_option_value("filetype", { buf: id }) as string,
        ) && vim.api.nvim_get_option_value("buftype", { buf: id }) === "",
      () => {
        const bindings: Record<string, { label: string; read: (this: void) => string }> = {}
        for (const key of ["(", ")", "[", "]", "{", "}", '"', "'", "`", "<BS>", "<CR>"])
          bindings[key] = {
            label: "Automatic pair",
            read: () => {
              if (key === "<CR>" && vim.fn.pumvisible() === 1) return "<C-y>"
              const [, column] = vim.api.nvim_win_get_cursor(0)
              const line = vim.api.nvim_get_current_line()
              return pairKeys(line.substring(0, column), line.substring(column), key)
            },
          }
        return expression(["i"], bindings)
      },
    ),
  ])
