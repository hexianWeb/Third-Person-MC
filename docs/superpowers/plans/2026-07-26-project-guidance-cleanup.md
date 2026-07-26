# Project Guidance Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicated and obsolete project guidance with one concise, WebGPU-current rule set and retain only July 2026 planning documents.

**Architecture:** `AGENTS.md` is the single source of durable repository conventions. Project skills live only in `.agents/skills/` and are retained only when baseline/forward tests show that a task-specific workflow adds value beyond code inspection. Cursor rules remain only for scoped UI guidance and the optional Linear workflow.

**Tech Stack:** Markdown, Agent Skills `SKILL.md`, Cursor MDC rules, Git, pnpm.

## Global Constraints

- Do not modify runtime code, UI, assets, package dependencies, or legacy shader source files.
- Do not modify or include the user's staged `.gitignore` and `.codegraph/.gitignore` changes.
- Use original Git creation history, not filename importance or last modification date, to classify old `docs/` files.
- Keep files created in July 2026; delete pre-July documents.
- Delete `.sisyphus/plans/` and preserve `.sisyphus/drafts/`.

---

### Task 1: Consolidate durable project rules

**Files:**
- Modify: `AGENTS.md`
- Modify: `.cursor/rules/tailwindcss-rule.mdc`
- Create: `.cursor/rules/linear-workflow.mdc`
- Delete: `.cursor/rules/vite-three-js.mdc`
- Delete: `.cursor/rules/vite-three-js-pro.mdc`
- Delete: `.cursor/rules/coding-best-practices.mdc`
- Delete: `.cursor/rules/shader-development.mdc`
- Delete: `.cursor/rules/linear-mcp.mdc`
- Delete: `.cursor/rules/git-linear-automation.mdc`

**Interfaces:**
- Consumes: current runtime architecture and package scripts.
- Produces: one canonical repository guide plus two narrowly scoped Cursor rules.

- [ ] **Step 1: Record the failing guidance audit**

Run:

```powershell
rg -n -i 'WebGLRenderer|ShaderMaterial|GLSL|vite-plugin-glsl' AGENTS.md .cursor/rules
```

Expected: matches in `AGENTS.md`, both `vite-three-js` rules, and the shader rule.

- [ ] **Step 2: Rewrite the canonical guidance**

Keep exact pnpm commands, JavaScript/ES-module style, Experience ownership, WebGPU initialization rules, TSL/NodeMaterial conventions, Vue/Three separation, Pinia/mitt ownership, input ownership, resource declaration, disposal, and verification requirements. Remove dependency-version snapshots and generic exhortations.

- [ ] **Step 3: Reduce Cursor rules to scoped concerns**

Keep `tailwindcss-rule.mdc` scoped to `*.html,*.vue`. Merge Linear behavior into `linear-workflow.mdc` with an `HX-{number}`/Linear trigger and no always-applied content.

- [ ] **Step 4: Verify stale guidance is gone**

Run:

```powershell
rg -n -i 'WebGLRenderer|ShaderMaterial|GLSL|vite-plugin-glsl' AGENTS.md .cursor/rules
```

Expected: no matches.

- [ ] **Step 5: Commit only rule changes**

```powershell
git commit --only -m "docs(rules): consolidate project guidance" -- AGENTS.md .cursor/rules
```

### Task 2: Test and consolidate project skills

**Files:**
- Conditionally create after a failed baseline: `.agents/skills/vtj-developing-webgpu/SKILL.md`
- Conditionally create after a failed baseline: `.agents/skills/vtj-optimizing-voxel-rendering/SKILL.md`
- Conditionally create after a failed baseline: `.agents/skills/vtj-controlling-third-person-camera/SKILL.md`
- Conditionally create after a failed baseline: `.agents/skills/vtj-handling-block-interactions/SKILL.md`
- Delete: `.agent/skills/`
- Delete: `.cursor/skills/`

**Interfaces:**
- Consumes: current code and the Agent Skills specification.
- Produces: a single `.agents/skills/` tree containing only workflows that improve baseline behavior.

- [ ] **Step 1: Run baseline scenarios without project skills**

Use fresh agents for WebGPU/TSL rendering, voxel rendering performance, third-person camera changes, and block interaction changes. Record whether each agent identifies the correct source files, current APIs, ownership boundaries, and verification.

- [ ] **Step 2: Keep only skills justified by baseline failures**

For each failed baseline, create one concise verb-led skill. A retained skill must use current code symbols, start its description with `Use when...`, avoid duplicating `AGENTS.md`, and contain a quick reference plus common mistakes. Do not recreate a GLSL skill.

- [ ] **Step 3: Validate each skill before moving to the next**

Run:

```powershell
Get-ChildItem .agents\skills -Filter SKILL.md -Recurse | ForEach-Object {
  python C:\Users\hx238\.codex\skills\.system\skill-creator\scripts\quick_validate.py $_.DirectoryName
}
```

Expected: `Skill is valid!`

- [ ] **Step 4: Forward-test each retained skill**

Repeat the matching baseline scenario with the skill explicitly supplied. Expected: the agent corrects the observed baseline failure without introducing obsolete renderer APIs or unrelated changes.

- [ ] **Step 5: Verify canonical location and content**

Run:

```powershell
Test-Path .agent\skills
Test-Path .cursor\skills
rg -n -i 'WebGLRenderer|ShaderMaterial|GLSL|vite-plugin-glsl' .agents\skills
```

Expected: both `Test-Path` calls return `False`; ripgrep returns no matches.

- [ ] **Step 6: Commit only skill changes**

```powershell
git commit --only -m "docs(skills): consolidate project workflows" -- .agents/skills .agent/skills .cursor/skills
```

### Task 3: Remove expired plans and documents

**Files:**
- Delete: all tracked pre-July files under `docs/`
- Keep: `docs/plans/2026-07-14-webgpu-renderer-migration.md`
- Keep: July files under `docs/superpowers/plans/` and `docs/superpowers/specs/`
- Delete: `.sisyphus/plans/`
- Keep: `.sisyphus/drafts/`

**Interfaces:**
- Consumes: Git creation dates.
- Produces: a July-only planning archive.

- [ ] **Step 1: Generate and inspect the deletion set**

For every tracked `docs/` path, read the oldest `git log --follow --format=%ad --date=short` entry. Select paths with an original date before `2026-07-01`.

- [ ] **Step 2: Delete the exact pre-July set**

Use `apply_patch` deletions. Include undated/key-looking files such as `docs/PRD.md`, `docs/SKILLS_BLUEPRINT.md`, and `docs/plans/player-code-cleanup-plan.md`.

- [ ] **Step 3: Delete `.sisyphus/plans/`**

Delete every tracked file below `.sisyphus/plans/`; do not delete `.sisyphus/drafts/`.

- [ ] **Step 4: Verify the retained archive**

Run:

```powershell
Get-ChildItem docs,.sisyphus -Recurse -File |
  ForEach-Object { $_.FullName.Substring((Resolve-Path '.').Path.Length + 1) }
git -c core.quotePath=false diff --name-status -- docs .sisyphus
```

Expected: the filesystem contains only July 2026 docs, the current cleanup design/plan, and `.sisyphus/drafts/*`; the Git diff lists every removed pre-July document and `.sisyphus/plans/*` as deleted.

- [ ] **Step 5: Commit only document removals**

```powershell
git commit --only -m "docs(plans): remove expired planning artifacts" -- docs .sisyphus/plans
```

### Task 4: Repository-wide verification

**Files:**
- Verify only; no intended edits.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: evidence that guidance is current, duplicates are absent, and the repository still validates.

- [ ] **Step 1: Check worktree ownership**

Run:

```powershell
git status --short
```

Expected: the user's `.gitignore` and `.codegraph/.gitignore` changes remain; no unrelated files are changed.

- [ ] **Step 2: Check guidance topology**

Run:

```powershell
rg --files .agents .cursor/rules docs .sisyphus
```

Expected: one skill root, scoped Cursor rules, July docs, and preserved drafts.

- [ ] **Step 3: Run lint**

Run:

```powershell
pnpm lint
```

Expected: exit code `0`.

- [ ] **Step 4: Run production build**

Run:

```powershell
pnpm build
```

Expected: exit code `0`.

- [ ] **Step 5: Review the final diff and commits**

Run:

```powershell
git diff HEAD~3..HEAD --stat
git log -4 --oneline
```

Expected: only rules, skills, and planning artifacts changed after the design commit.
