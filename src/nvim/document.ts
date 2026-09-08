import { createView, type View, type MountedView } from "./view"
import * as Task from "./task"
import { events } from "./events"
/** An editable, file-backed view. The buffer survives hiding and saves on leave/unmount. */
export interface DocumentView extends View {
  readonly save: Task.Task<void>
}
export const document = (
  path: string,
  options: { readonly filetype?: string; readonly initial?: readonly string[] } = {},
): DocumentView => {
  let mounted: MountedView | undefined
  const save = () => {
    if (!mounted || !vim.api.nvim_buf_is_valid(mounted.buffer)) return
    if (!vim.api.nvim_get_option_value("modified", { buf: mounted.buffer })) return
    vim.fn.mkdir(vim.fs.dirname(path), "p")
    if (vim.fn.writefile(vim.api.nvim_buf_get_lines(mounted.buffer, 0, -1, false), path) !== 0)
      throw new Error(`Could not save ${path}`)
    vim.api.nvim_set_option_value("modified", false, { buf: mounted.buffer })
  }
  const content = createView(
    (scope, buffer) => {
      mounted = { scope, buffer }
      const exists = vim.fn.filereadable(path) === 1
      vim.api.nvim_buf_set_lines(
        buffer,
        0,
        -1,
        false,
        exists ? vim.fn.readfile(path) : [...(options.initial ?? [""])],
      )
      vim.api.nvim_set_option_value("buftype", "acwrite", { buf: buffer })
      vim.api.nvim_set_option_value("modified", !exists, { buf: buffer })
      scope.own(() => {
        save()
        mounted = undefined
      })
      scope.own(
        events(["BufWriteCmd", "BufLeave"], { buffer }).subscribe(() => {
          try {
            save()
          } catch (error) {
            scope.report(error)
          }
        }),
      )
    },
    { name: path, ...(options.filetype === undefined ? {} : { filetype: options.filetype }) },
  )
  return { ...content, save: Task.sync(save) }
}
