import { Task, exec, pipe, type TaskValue } from "../nvim"
export interface Entry {
  readonly status: string
  readonly path: string
  readonly root: string
  readonly original?: string
}
/** Porcelain -z preserves spaces, newlines, quoting, and rename destinations. */
export const parseStatus = (raw: string, root: string): readonly Entry[] => {
  const records = raw.split("\0")
  const entries: Entry[] = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]!
    if (record.length < 4) continue
    const status = record.substring(0, 2)
    const path = record.substring(3)
    if (status.includes("R") || status.includes("C")) {
      const original = records[++i]
      if (original === undefined || original === "") throw new Error("Incomplete Git rename record")
      entries.push({ status, path, root, original })
    } else entries.push({ status, path, root })
  }
  return entries
}
/** @noSelf */
export interface Repository {
  readonly status: TaskValue<readonly Entry[]>
  readonly stage: (entry: Entry) => TaskValue<string>
  readonly unstage: (entry: Entry) => TaskValue<string>
}
export const repository = (
  directory: TaskValue<string> = Task.sync(() => vim.fn.getcwd()),
): Repository => {
  const paths = (entry: Entry) => (entry.original ? [entry.path, entry.original] : [entry.path])
  return {
    status: pipe(
      directory,
      Task.flatMap((cwd) =>
        pipe(
          exec(["git", "rev-parse", "--show-toplevel"], { cwd }),
          Task.flatMap((output) => {
            const root = output.endsWith("\n") ? output.substring(0, output.length - 1) : output
            return pipe(
              exec(["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"], {
                cwd: root,
              }),
              Task.map((raw) => parseStatus(raw, root)),
            )
          }),
        ),
      ),
    ),
    stage: (entry) => exec(["git", "add", "--", ...paths(entry)], { cwd: entry.root }),
    unstage: (entry) =>
      exec(["git", "restore", "--staged", "--", ...paths(entry)], { cwd: entry.root }),
  }
}
