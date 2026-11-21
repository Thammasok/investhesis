# Git workflow — trunk-based, single branch

Loaded every session. This overrides any default "branch first" behaviour.

- **One branch: `main`.** Commit directly on `main`. Never create feature, fix, chore, docs or
  release branches, and never open a pull request unless the owner asks for one in that task.
- Before starting work, check `git branch --show-current` is `main`. If it isn't, stop and tell
  the owner rather than committing on the other branch.
- **Small commits that keep `main` working.** Each commit builds, lints, typechecks and passes the
  tests it touches (`pnpm lint`, `pnpm typecheck`, `pnpm test`). Don't commit a half-done step.
- Unfinished features hide behind a flag or stay unreachable from the UI instead of living on a
  branch (`.claude/knowledges/feature-flag.md`).
- History stays linear: `git pull --rebase` on `main`; no merge commits, no force-push to `main`.
- Push to `origin main` only when the owner asks.
- Worktrees or temporary branches made by tools (e.g. agent `isolation: "worktree"`) must be
  folded back into `main` as plain commits and deleted in the same task.

## Version tags — one per finished `docs/` feature, owner approves first

A version tag marks a **feature plan in `docs/` being done**, not a single task or fix. Features
live in `docs/features/<feature>/v<plan-version>/` (e.g. `docs/features/user-auth/v2.0/`); the plan is done when
every task in its `dev-plan.md` has `status: done`.

1. **Detect.** When you mark the last task of a `dev-plan.md` as done, the feature is complete.
   Don't tag after individual tasks, fixes or docs changes.
2. **Verify.** On `main`, everything committed, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.
3. **Ask the owner before creating the tag** — always, every time, even if they approved a tag
   earlier. Propose: the feature and plan (`docs/features/user-auth/v2.0`), the version, the commit, and a
   one-line summary. Wait for a yes; the owner may change the version or say not to tag.
4. **Release** (only after the yes):
   - Commit `chore(release): vX.Y.Z`, setting `version` in `apps/*/package.json` (and
     `packages/*` once they exist) to `X.Y.Z`.
   - Annotated tag on that commit:
     `git tag -a vX.Y.Z -m "vX.Y.Z: <feature> (docs/features/<feature>/v<plan-version>)"`.
   - Mark the plan's front matter `status: done` in the same release commit.
5. **Push** `main` and the tag (`git push origin main vX.Y.Z`) only when the owner says to.

Version numbers (SemVer `vMAJOR.MINOR.PATCH`):
- Each finished feature plan → MINOR bump (`v0.1.0` → `v0.2.0`). A breaking API change bumps MAJOR,
  except pre-1.0 where it also bumps MINOR. `v1.0.0` is the owner's call (Phase 1 release).
- A fix shipped to an already-tagged feature → PATCH, still only with the owner's yes.
- The tag version is the product version; it is independent of the plan folder version (`v2.0`).
- Never move or delete a pushed tag without the owner's explicit say-so.

## Commit messages — Conventional Commits 1.0.0

Spec: https://www.conventionalcommits.org/en/v1.0.0/ (local copy:
`.claude/knowledges/conventional_commits.md`).

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

- **type** (lowercase): `feat` (new feature → MINOR), `fix` (bug fix → PATCH), plus `docs`,
  `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **scope**: the area touched, in lowercase: `web`, `api`, `db`, `auth`, `scripts`, `claude`, ...
- **description**: imperative, lowercase start, no trailing period, ≤ 72 chars for the header.
- **body**: after one blank line; explain *why*, wrapped at 72 chars.
- **footers**: after one blank line, `Token: value` (e.g. `Refs: T-012`, `Co-Authored-By: ...`).
- **Breaking change** (→ MAJOR): `!` before the colon (`feat(api)!: ...`) and/or a
  `BREAKING CHANGE: <what breaks and how to migrate>` footer.
- One logical change per commit; split a commit that needs "and" in its description.
