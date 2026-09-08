import * as Task from "./task"
export interface ProcessOptions {
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
  readonly stdin?: string
  readonly timeout?: number
}
export interface ProcessResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}
export interface ProcessFailure {
  readonly kind: "process"
  readonly command: readonly string[]
  readonly code: number
  readonly stderr: string
}
/** argv is always an argument vector, never interpolated shell source. */
export const process = (
  argv: readonly string[],
  options: ProcessOptions = {},
): Task.Task<ProcessResult> =>
  Task.make((scope, done) => {
    let exited = false
    const job = vim.system([...argv], { ...options, text: false }, (result) => {
      exited = true
      vim.schedule(() => {
        if (scope.alive())
          done({
            tag: "success",
            value: { code: result.code, stdout: result.stdout ?? "", stderr: result.stderr ?? "" },
          })
      })
    })
    scope.own(() => {
      if (!exited) job.kill(15)
    })
  })
/** Nonzero exit is a task failure; use process() when exit codes are domain data. */
export const exec = (argv: readonly string[], options: ProcessOptions = {}): Task.Task<string> =>
  Task.flatMap((result: ProcessResult) =>
    result.code === 0
      ? Task.succeed(result.stdout)
      : Task.fail({
          kind: "process",
          command: argv,
          code: result.code,
          stderr: result.stderr,
        } satisfies ProcessFailure),
  )(process(argv, options))
export const prompt = (label: string, initial?: string): Task.Task<string | undefined> =>
  Task.make((scope, done) => {
    vim.ui.input(
      initial === undefined ? { prompt: label } : { prompt: label, default: initial },
      (value) => {
        if (scope.alive()) done({ tag: "success", value })
      },
    )
  })
export const choose = <A>(
  items: readonly A[],
  options: { readonly prompt?: string; readonly label?: (item: A) => string } = {},
): Task.Task<A | undefined> =>
  Task.make((scope, done) => {
    const config: { prompt?: string; format_item?: (item: A) => string } = {}
    if (options.prompt !== undefined) config.prompt = options.prompt
    if (options.label !== undefined) config.format_item = options.label
    vim.ui.select([...items], config, (value) => {
      if (scope.alive()) done({ tag: "success", value })
    })
  })
