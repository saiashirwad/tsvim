# Runtime contracts

## Ownership comes before syntax

The public surface separates pure construction, deferred execution, and mounted
presence. A task is repeatable work; a behavior is a lifetime. A component is a
factory, so mounting the same definition twice allocates independent state.

Component factories run synchronously inside an owner. `resource`, `serial`, and
reactive subscriptions acquire that owner; they fail clearly if constructed
outside one. Pure values, task descriptions, cells, and view definitions can be
constructed without an editor effect. Views and picker controllers are instance
values: construct them inside the component when a definition may mount twice.

A scope owns a reverse-ordered collection of idempotent finalizers. Completed
children unregister themselves. Closing a scope first marks it inactive, then
closes its children and registrations. One failing finalizer is reported without
preventing the rest. A failed root mount rolls back work acquired so far.

## Tasks and concurrency

`Task<A>` uses a small callback interpreter rather than promises. This preserves
synchronous editor hooks while supporting asynchronous processes and prompts.
Each execution gets a child scope and exactly one exit: success, failure, or
cancellation. Late callbacks cannot complete it twice. Combinators preserve the
same owner and target. `Task.all` cancels siblings on failure; timeouts cancel
unfinished work.

`Task.make((scope, finish) => ...)` is a trusted boundary. Register native
cancellation through `scope.own` and check `scope.alive()` before doing anything
in a callback besides invoking `finish`. The runtime can suppress publication;
it cannot undo arbitrary side effects a callback performs itself.

`serial()` is a shared lane, not a policy attached independently to every action.
Capture selection before entering the lane when queued work must retain the item
chosen by the user. A failed mutation does not trigger its success continuation.
Cancelling a queued task removes it without blocking the following task.

Resources keep successful data separately from request state. A generation
number protects latest-result publication even when the native operation cannot
be stopped. Load failures become visible state. Explicit refresh actions also
receive the failure; background loads do not notify twice.

A subprocess receives SIGTERM when its execution is disposed. Cancellation does
not roll back writes already performed by Git or another external program, and
is not a promise to terminate independently spawned grandchildren.

## State and events

Cells track readers. Derived values call their projection when read, carrying
underlying dependencies directly to the reader. They are not a memoization cache
and do not create an observer that needs a separate lifetime. Batch writes when
several state changes form one update.

Streams are cold. Each subscriber gets its own producer registration, and every
operator preserves disposal. Scheduled and debounced emissions are guarded after
unsubscribe. `listen` and state holders own subscriptions; direct `subscribe` is
an advanced API whose returned disposer belongs to the caller.

Events run tasks. They do not ambiguously return either teardown or another
configuration. Persistent buffer behavior uses `forBuffers` or `filetypes`; these
inspect existing buffers as well as later events. Language behavior similarly
reconciles existing and newly attached clients, with one owner per buffer.

## Views and selection

Rich text is immutable data. A renderer compiles it into lines and byte-aligned
marks. Updates replace only the changed line interval, then replace owned marks.
A keyed list maps all lines of a multiline row to one item and preserves that
item's identity when the source reorders.

A placement owns a content scope and transient window scopes. Closing a panel
hides it and retains the content. Unmounting removes its buffers, windows,
subscriptions, and pending tasks. The document view saves before removing its
buffer; failures are reported and never mark unsaved content as saved.

A picker instead creates a fresh session on each opening. Prompt, results,
preview, source requests, and subscriptions live together. Query changes
invalidate async results immediately; debounce delays starting replacement work.
Preview changes use the same rule. Accepting captures an item and the origin
window, hands the accepted task to the component, and closes the session.

The fuzzy matcher is deliberately small: case-insensitive byte subsequences,
word-boundary and consecutive-match bonuses, stable ordering for ties. It is not
a full fzf/Telescope matching engine or a Unicode normalization engine. Sources
currently return bounded snapshots rather than incrementally streamed pages.
The supplied ripgrep search uses a five-second timeout, limits matches per file,
and displays at most 200 results; very large output is still buffered by the
process adapter. These boundaries leave room for a future streaming source
without coupling selection or preview logic to a particular search backend.

## What reload restores

Library-owned options, mappings, highlights, commands, autocmds, views, timers,
and subscriptions are disposed. Layered declarations restore the surviving
library layer or the captured base value. Global options and window-local values
are distinct registrations. New window-local claims follow the buffer they
belong to, without changing global defaults.

External integrations are explicit boundaries. Installing a package, loading a
Lua module, writing a file, configuring Neovim's LSP registry, or running a
third-party plugin's setup function is not inherently reversible. Package setup
can return a disposer; custom native integrations must register their own
cleanup. Reload is ownership cleanup, not a transaction that undoes external IO.

## Validation

`npm test` typechecks source and test fixtures, builds both bundles, and runs real
headless Neovim tests with failure-propagating exit codes. Core tests exercise
cancellation, ordering, resources, reactive disposal, text validation, layered
registration, view identity, Git actions, and picker interactions. Config tests
stub external packages and server activation, then mount, interact, reload, and
unmount the shipped config offline.
