# Project Guidance Cleanup Design

## Goal

Remove obsolete WebGL/GLSL guidance, eliminate duplicated rules and skills, and retain only current July planning documents.

## Decisions

### Canonical instruction surfaces

- Keep durable repository conventions, commands, architecture boundaries, and verification requirements in `AGENTS.md`.
- Keep Cursor rules only when they are Cursor-specific or path-scoped.
- Store project skills only in `.agents/skills/`, the shared Agent Skills location supported by Codex and Cursor.
- Do not mirror skills into `.agent/skills/` or `.cursor/skills/`.

### Skills

Most existing `vtj-*` skills restate project conventions or duplicate one another. Move those facts into `AGENTS.md` and retain only workflows that add non-obvious, task-specific guidance:

- `vtj-webgpu-rendering`: WebGPURenderer initialization, TSL, NodeMaterial, RenderPipeline, uniforms, device loss, and pipeline warm-up.
- `vtj-voxel-rendering-performance`: InstancedMesh capacity, fixed render slots, material generations, disposal, and profiling.
- `vtj-third-person-camera`: camera rig, view modes, collision avoidance, smoothing, and input ownership.
- `vtj-block-interaction`: input actions, normalized pointer coordinates, raycasting, block targeting, and interaction ownership.

Delete the GLSL shader skill instead of translating it in place. The WebGPU skill is a separate workflow with current concepts and triggers.

### Rules

- Rewrite `AGENTS.md` as the concise source of truth for the current JavaScript/Vue/Three.js WebGPU architecture.
- Delete the overlapping always-applied Cursor rules `vite-three-js.mdc`, `vite-three-js-pro.mdc`, and `coding-best-practices.mdc`.
- Delete `shader-development.mdc`.
- Keep a short path-scoped Tailwind/Vue rule.
- Merge the overlapping Linear rules into one conditional workflow rule.

### Documentation retention

- Determine age by original creation/history date, not by perceived importance or a later incidental edit.
- Delete every pre-July file under `docs/`, including `PRD.md`, `SKILLS_BLUEPRINT.md`, `player-code-cleanup-plan.md`, and the player ground-detection documents.
- Keep documents created in July 2026, including July plans and their paired design specs.
- Keep this July design and its implementation plan.
- Delete `.sisyphus/plans/` completely while leaving `.sisyphus/drafts/` unchanged.

## Validation

- Validate every retained skill against the Agent Skills frontmatter and directory-name rules.
- Run forward tests for each rewritten skill using realistic project tasks.
- Confirm active guidance contains no obsolete WebGLRenderer, ShaderMaterial, or GLSL instructions.
- Confirm `.agent/skills`, `.cursor/skills`, old docs, and `.sisyphus/plans` are absent.
- Run repository lint and build commands after the guidance cleanup.

## Non-goals

- Do not delete legacy shader source files or remove build dependencies in this cleanup.
- Do not modify runtime code, UI, assets, or the user's existing staged changes.
