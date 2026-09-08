// A persistent markdown scratchpad in a floating window.
//
//   <leader>n toggles it; contents are saved to a file on close and on write.

import { Buffer, float, notify, type Float } from "../nvim"

interface ScratchpadConfig {
  path: string
}

let config: ScratchpadConfig = { path: `${vim.fn.stdpath("data")}/scratchpad.md` }
let buffer: Buffer | undefined
let window: Float | undefined

const load = (): string[] => (vim.fn.filereadable(config.path) === 1 ? vim.fn.readfile(config.path) : ["# scratchpad", ""])

const save = (): void => {
  if (!buffer?.valid) return
  vim.fn.mkdir(vim.fs.dirname(config.path), "p")
  vim.fn.writefile(buffer.lines, config.path)
  buffer.opt.modified = false
}

const ensureBuffer = (): Buffer => {
  if (buffer?.valid) return buffer
  const buf = Buffer.scratch({ filetype: "markdown", lines: load(), bufhidden: "hide", name: "scratchpad" })
  buf.opt.buftype = "acwrite"
  buf.on("BufWriteCmd", () => { save(); notify("scratchpad saved") })
  buf.on("BufLeave", save)
  buf.map.n("<C-s>", save, "Save scratchpad")
  buffer = buf
  return buf
}

const open = (): Float => {
  const buf = ensureBuffer()
  const win = float({ buffer: buf, title: " scratchpad ", width: 0.7, height: 0.7, options: { wrap: true, spell: true, number: false }, closeKeys: ["q"] })
  win.buffer.map.n("<Esc>", () => win.close(), { nowait: true })
  window = win
  return win
}

export const scratchpad = {
  setup: (opts: Partial<ScratchpadConfig>) => { config = { ...config, ...opts } },
  open,
  toggle: (): void => {
    if (window?.valid) { save(); window.close(); window = undefined }
    else open()
  },
  save,
}
