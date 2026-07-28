# y-tiptap

Yjs binding for Tiptap, forked from [y-prosemirror](https://github.com/yjs/y-prosemirror). It maps a `Y.XmlFragment` to a ProseMirror state and back.

One published package, `@tiptap/y-tiptap`. Source is plain JavaScript with JSDoc types in `src/`, tests in `tests/`, a playground in `demo/`. All scripts are in `package.json`. The package manager is npm.

## Rules

- Small, single-purpose diffs. Ask the user to review. Never autocommit.
- Add a changeset when you change `src/`. Tooling-only changes need none. Public API breaks need a major bump and migration notes.
- Add or update tests for behavior users notice. Sync bugs are easy to reintroduce, so cover them.
- Fix fallow findings your change introduced. Don't suppress them.

## Before opening a PR

```bash
npm test          # lint, typecheck, bundle, then run the node test suite
fallow audit      # verdict must be pass or warn, never fail
```

`npm test` runs `npm run lint` (standard plus `tsc`), builds with rollup, and executes `dist/test.cjs`. To only typecheck and lint, run `npm run lint`.

Dependency or lockfile errors: delete `node_modules` and run `npm ci`.

## Code style

[standard](https://standardjs.com/) lints and defines the formatting. There is no commit hook, so run `npm run lint` yourself. `tsc` typechecks `src/` with `checkJs`, so types come from JSDoc comments, not from TypeScript syntax.

Prefer simple, readable code over clever code. Use early returns. Avoid deep nesting, nested ternaries, and abstractions you don't need yet. Keep functions focused. Apply DRY and SOLID pragmatically, not blindly.

### Files

- Keep files small and focused. Split unrelated utilities, types, constants and logic apart.
- ProseMirror plugins live in `src/plugins/`. Shared helpers go in `src/lib.js` and `src/utils.js`, the public surface is re-exported from `src/y-tiptap.js`.
- A helper used in one file only can stay local.

### Naming

- Short, clear, recognizable. Never shorten just to save characters. No unclear abbreviations.
- `index` for numeric indexes, the item's real name for collection values. Single letters only in small math contexts like `x` and `y`.
- Use existing project terminology: `yXmlFragment`, `mapping`, `relativePosition`, `binding`.

```js
// good
items.map((item, index) => createNode(item, index))
decorations.filter(decoration => decoration.visible)

// bad
items.map((i, idx) => createNode(i, idx))
decorations.filter(d => d.visible)
```

### Comments

- Comment only when the reason is not visible in the code. Never restate what the lines below already say.
- Two lines max. Only genuinely complex or hard to follow code earns more.
- Say why, not what: `// We keep the old value because the transaction may be reverted.`
- Concurrency and position mapping are the hard parts of this package. Explain the conflict case a branch handles, not the mechanics.
- JSDoc on exported functions with `@param` and `@returns`. Types are checked, so keep them accurate.

### Writing

Short, simple English in comments, docs, changesets and PRs. Most important information first. Assume the reader is new to the project or not a native speaker. No filler.

### Before you finish

Simplify what is hard to follow. Remove needless nesting and abstractions. Split large or unfocused files. Move reusable utilities into their own files. Drop redundant comments.

Then run `fallow` for complexity and dead code, `fallow health` for refactor targets, and `fallow audit` on your changes.

## Tests

- The runner is [`lib0/testing`](https://github.com/dmonad/lib0), not Vitest or Jest.
- Suites live in `tests/y-tiptap/<topic>.test.js`. Every exported function starting with `test` runs as a test case.
- New files must be re-exported from `tests/y-tiptap.test.js`, otherwise they never run.
- Shared editor setup, schemas and helpers are in `tests/shared.js` and `tests/complexSchema.js`. Copy an existing suite like `tests/y-tiptap/conversion.test.js` as a template.
- Node runs the tests through `tests/index.node.js`, which fakes a DOM with jsdom. The browser entry is `tests/index.js`, served from `test.html`.
- Prefer deterministic tests. `tests/y-tiptap/randomized.test.js` holds the fuzzing cases.

## Demo

`npm start` builds in watch mode and serves `demo/prosemirror.html`. It runs a y-webrtc-synced ProseMirror editor, so open two tabs to see collaboration. Use it to reproduce sync bugs by hand.

## Changesets

Run `npm run changeset`, or write the file yourself as `.changeset/short-description.md`:

```markdown
---
'@tiptap/y-tiptap': patch
---

One short sentence on what changed for the user.
```

Describe behavior users notice. No internals, no root-cause detail. Merging a changeset to `main` makes the publish workflow open a release PR.

## Docs

The README is the user-facing documentation for this package. Update it when you change the public API or the plugin options. Tiptap's own docs live in the separate `ueberdosis/tiptap-docs` repo. Ask the user for the local path when you need to change them.
