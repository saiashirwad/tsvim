// A tiny async git status panel: shows `git status --short`, lets you stage,
// unstage and open files. Demonstrates async/await over `vim.system`.

import { Buffer, float, hl, notify, sh, type Float } from "../nvim"

interface Entry {
  readonly status: string
  readonly path: string
}

let panel: Float | undefined
const ns = hl.namespace("pureluanvim.git")

const parse = (lines: string[]): Entry[] =>
  lines.filter((l) => l.length > 3).map((l) => ({ status: l.substring(0, 2), path: l.substring(3) }))

const render = (buf: Buffer, entries: Entry[]): void => {
  buf.opt.modifiable = true
  buf.lines = entries.length === 0 ? ["  working tree clean"] : entries.map((e) => `${e.status}  ${e.path}`)
  buf.opt.modifiable = false
  buf.clearNamespace(ns)
  entries.forEach((e, i) => {
    const group = e.status[0] !== " " && e.status[0] !== "?" ? "DiagnosticInfo" : e.status.includes("?") ? "DiagnosticHint" : "DiagnosticWarn"
    buf.highlight(ns, group, i, 0, 2)
  })
}

const refresh = async (buf: Buffer): Promise<Entry[]> => {
  const result = await sh(["git", "status", "--short"])
  if (!result.ok) {
    render(buf, [])
    notify(result.stderr.trim() || "git status failed", "warn")
    return []
  }
  const entries = parse(result.lines)
  if (buf.valid) render(buf, entries)
  return entries
}

const open = async (): Promise<void> => {
  const buf = Buffer.scratch({ filetype: "gitstatus", name: "git status" })
  let entries: Entry[] = []
  const win = float({ buffer: buf, title: " git status ", width: 0.5, height: 0.4, position: "center", footer: " s stage · u unstage · <CR> open · r refresh " })
  panel = win

  const current = (): Entry | undefined => entries[win.cursor.row - 1]
  const reload = async () => { entries = await refresh(buf) }

  buf.map.n.many({
    r: [() => void reload(), "Refresh"],
    s: [async () => {
      const e = current()
      if (!e) return
      await sh(["git", "add", "--", e.path])
      await reload()
    }, "Stage file"],
    u: [async () => {
      const e = current()
      if (!e) return
      await sh(["git", "restore", "--staged", "--", e.path])
      await reload()
    }, "Unstage file"],
    "<CR>": [() => {
      const e = current()
      if (!e) return
      win.close()
      vim.cmd({ cmd: "edit", args: [e.path] })
    }, "Open file"],
  })

  await reload()
}

export const gitPanel = {
  open,
  toggle: (): void => {
    if (panel?.valid) { panel.close(); panel = undefined } else void open()
  },
}
