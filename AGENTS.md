# AGENTS.md - Development Guide for AI Coding Agents

This document provides essential information for AI coding agents working in this repository.

---

## Build, Lint, and Test Commands

### Package Manager

This project uses **pnpm**. Always use `pnpm` instead of `npm` or `yarn`.

### Development

```bash
pnpm dev              # Start development server with hot reload
pnpm build            # Build for production
pnpm preview          # Preview production build locally
```

### Linting

```bash
pnpm lint             # Check code for linting errors
pnpm lint:fix         # Auto-fix linting issues
```

### Testing

```bash
# E2E tests with Playwright (located in tests/ directory)
pnpm test:chrome      # Run tests in Chromium (headed mode)
pnpm test:firefox     # Run tests in Firefox (headed mode)
pnpm test:safari      # Run tests in WebKit/Safari (headed mode)
```

**Running a single test:**

```bash
npx playwright test tests/browsers.test.js --headed --project=chromium
npx playwright test tests/browsers.test.js:10 --headed  # Run specific line
```

### Cleanup

```bash
pnpm clean:dist       # Remove dist directory
pnpm clean:report     # Remove Playwright test reports
```

---

## Code Style Guidelines

### Language & Modules

- **Pure JavaScript** (no TypeScript) with ES modules (`"type": "module"`)
- Use `.js` extensions explicitly in imports
- Use JSDoc comments for type hints where beneficial

### Formatting (ESLint - Antfu)

- **Style Guide:** Follows `@antfu/eslint-config` defaults
- **Print width:** 120 characters
- **Indentation:** 2 spaces (no tabs)
- **Semicolons:** None (Never use semicolons)
- **Quotes:** Single quotes (`'`) for JS/Vue, single for JSX
- **Trailing commas:** All (Multi-line objects/arrays)
- **Arrow parens:** Always
- **Line endings:** CRLF (Windows)
- **Plugins:** `prettier-plugin-tailwindcss` for class sorting

**CRITICAL FORMATTING RULES:**

1. **Respect Existing Style:** When modifying a file, mimic the existing formatting (braces, blank lines, sorting) exactly.
2. **Vue SFC:** Do NOT indent top-level content inside `<script setup>` or `<style>`.
3. **Minimal Changes:** Do NOT reformat the entire file. Only apply formatting to your specific changes.
4. **Antfu Nuances:** Allow single-line `if` statements without braces.

### Linting (ESLint)

- Uses **@antfu/eslint-config** (opinionated, comprehensive)
- Additional plugins:
  - `eslint-plugin-prettier` - Format via Prettier
  - `eslint-plugin-import` - Validate imports
  - `eslint-plugin-simple-import-sort` - Auto-sort imports
  - `eslint-plugin-sonarjs` - Code quality rules
  - `eslint-plugin-unicorn` - Modern JS best practices
  - `eslint-plugin-promise` - Promise patterns

### Naming Conventions

- **Classes:** PascalCase (`Experience`, `ChunkManager`, `Camera`)
- **Functions/Methods:** camelCase (`updateCamera`, `debugInit`, `resize`)
- **Private members:** Underscore prefix (`_adaptiveY`, `_internalState`)
- **Constants:** UPPER_SNAKE_CASE (`SEED_MAX`, `CHUNK_SIZE`)
- **Vue Components:** PascalCase file names (`Crosshair.vue`, `GameHud.vue`)
- **Pinia Stores:** camelCase with `use` prefix (`useUiStore`, `useHudStore`)

### Import Order

1. External packages (Three.js, Vue, Pinia, etc.)
2. Internal modules (from `src/`)
3. Assets (shaders, textures, models)

Example:

```javascript
import i18n from '@three/i18n.js'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import '@styles/main.scss'

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.mount('#app')
```

### Type Annotations

Use JSDoc for complex types:

```javascript
/**
 * @param {THREE.Vector3} position - Player position
 * @param {number} radius - Detection radius
 * @returns {Array<THREE.Object3D>} Nearby entities
 */
function findNearbyEntities(position, radius) { ... }
```

### Error Handling

- Use try-catch for async operations and critical paths
- Log errors with context: `console.error('Failed to load texture:', error)`
- Provide fallbacks for non-critical failures
- Validate inputs for public APIs

### Comments

- Use **Chinese comments** for complex logic (this is a bilingual codebase)
- Document "why" not "what" for non-obvious code
- Add JSDoc for all public classes and methods
- Include inline comments for tricky algorithms

Example:

```javascript
/**
 * 计算环境光遮蔽强度
 * Calculates ambient occlusion intensity
 */
calculateAO(vertices) {
  // 使用顶点法线计算遮蔽因子
  // Calculate occlusion factor using vertex normals
  ...
}
```

---

## Architecture Patterns

### Singleton Pattern (Three.js Core)

All Three.js logic is managed through the `Experience` singleton:

```javascript
import Experience from './experience.js'

class MyComponent {
  constructor() {
    this.experience = new Experience() // Returns singleton
    this.scene = this.experience.scene
    this.camera = this.experience.camera
    // Only extract what this component needs
  }
}
```

**Rules:**

- Access core systems via `this.experience`
- Only extract necessary dependencies (avoid coupling)
- All 3D components must be class-based

### State Management (Pinia)

Use Pinia for global state shared between UI and 3D logic:

```javascript
// In store (src/pinia/uiStore.js)
export const useUiStore = defineStore('ui', () => {
  const screen = ref('loading')

  function toPlaying() {
    screen.value = 'playing'
    emitter.emit('ui:pause-changed', false)
  }

  return { screen, toPlaying }
})

// In Three.js component
import { useUiStore } from '@pinia/uiStore.js'
const ui = useUiStore()
if (ui.screen === 'playing') { ... }
```

### Event Communication (mitt)

Use `mitt` event bus for decoupled cross-layer communication:

```javascript
import emitter from './utils/eventEmitter.js'

// Emit event
emitter.emit('ui:pause-changed', isPaused)
emitter.emit('core:resize', { width, height })

// Listen to event
emitter.on('core:resize', (data) => this.resize())
```

**When to use Pinia vs mitt:**

- **Pinia:** Persistent state that both UI and 3D need (mode, inventory, settings)
- **mitt:** One-time events/notifications (popups, toasts, animation complete)

### Component Lifecycle Methods

All 3D components should implement:

```javascript
class MyComponent {
  constructor() { ... }

  debugInit() {
    // Tweakpane debug UI (dev mode only)
    if (this.debug.active) {
      this.debug.ui.addBinding(this.params, 'intensity', {
        min: 0,
        max: 1,
        step: 0.01,
      })
    }
  }

  update(deltaTime) {
    // Called every frame
  }

  resize() {
    // Called on window resize
  }

  destroy() {
    // Cleanup resources
  }
}
```

---

## Project-Specific Rules

### DO NOT Modify Working Code

- **Never change UI or code that already works** unless explicitly instructed
- Avoid duplicating existing functionality; reuse components
- Always ask clarifying questions if requirements are unclear

### UI Changes Require Explicit Permission

- **Never alter UI unintentionally** - only modify if clearly part of the task
- Test all UI changes thoroughly before committing

### Resource Management

- All assets (models, textures, fonts) must be declared in `src/js/sources.js`
- Access loaded resources via `this.experience.resources.items['resourceName']`
- Place shaders in `src/shaders/` and import via `vite-plugin-glsl`

### Shader Development

- Store all GLSL shaders in `src/shaders/` directory
- Create `debugInit()` panels for all `uniform` parameters in ShaderMaterial
- Use `view: 'color'` for color uniforms in Tweakpane
- Document performance implications and optimization strategies
- Minimize conditionals and texture lookups in fragment shaders
- Test on multiple GPU vendors when possible

### Raycasting & Mouse Input

- Always use `this.experience.iMouse.normalizedMouse` for NDC coordinates
- Never manually calculate mouse positions
- Encapsulate complex interactions in `src/js/tools/` utilities

### Strict Separation: UI vs 3D

- **UI Layer (Vue):** Interface, user input, menus
- **3D Layer (Three.js):** Scene rendering, physics, game logic
- **Communication:** Via Pinia (state sync) and mitt (events)
- **Forbidden:** Direct manipulation of Three.js from Vue components

---

## Git Workflow

### Commit Message Format (Conventional Commits)

Enforced via Commitlint + Husky pre-commit hooks:

```
type(scope): subject

Examples:
feat(terrain): add biome blending algorithm
fix(camera): prevent clipping through terrain
docs(readme): update installation instructions
refactor(player): simplify movement code
perf(chunks): optimize mesh generation
test(e2e): add raycasting interaction tests
```

**Types:** feat, fix, docs, style, refactor, perf, test, build, ci, chore

### Commit Frequency

- Commit frequently to maintain reliable history
- Never unintentionally delete code/data - confirm before destructive actions
- Write comprehensive tests for all new/modified functionality

---

## File Organization

### Directory Structure

```text
src/
├── main.js              # Vue entry point
├── App.vue               # Root Vue component
├── vue/                 # Vue UI Layer
│   └── components/      # Vue components
│       ├── hud/         # In-game HUD (health, hunger, hotbar)
│       ├── menu/        # Menus (main, pause, settings, loading)
│       └── ui/          # Shared UI elements
├── pinia/               # Pinia stores
├── styles/              # Global SCSS (single entry: main.scss)
├── js/                  # Three.js Core logic
│   ├── camera/          # Camera rig, controls
│   ├── world/           # Scene, player, terrain, chunks
│   ├── interaction/     # Block breaking, raycasting
│   ├── config/          # Configuration objects
│   ├── utils/           # Utilities (input, events, resources)
│   ├── tools/           # Helper tools (noise, RNG)
│   ├── components/      # 3D components (text mesh, effects)
│   ├── experience.js    # Main singleton orchestrator
│   └── sources.js       # Asset manifest
├── shaders/             # GLSL shaders (vertex/fragment)
└── locales/             # i18n translation files
```

### Path Aliases

Always use aliases instead of deep relative paths (`../../..`):

- `@` -> `src/`
- `@ui` -> `src/vue/`
- `@ui-components` -> `src/vue/components/`
- `@pinia` -> `src/pinia/`
- `@styles` -> `src/styles/`
- `@three` -> `src/js/`

### Component Placement Rules

- **Vue components:** `src/vue/components/` (use `@ui-components/` alias)
- **3D components:** `src/js/` (use `@three/` alias)
- **Pinia stores:** `src/pinia/` (use `@pinia/` alias)
- **Styles:** `src/styles/` (use `@styles/` alias, main entry: `main.scss`)
- **Shaders:** `src/shaders/` (can create subdirectories)

---

## Testing Requirements

- Write comprehensive tests for new/modified functionality
- E2E tests go in `tests/` directory (Playwright)
- Test UI changes across different screen sizes and browsers
- Verify 3D interactions work with raycasting and collision detection

---

## Key Dependencies

- **Three.js** v0.172.0 - 3D rendering engine
- **Vue 3** v3.5.13 - UI framework (Composition API)
- **Pinia** v3.0.2 - State management
- **GSAP** v3.12.5 - Animation library
- **mitt** v3.0.1 - Event bus
- **Tailwind CSS** v3.4.9 - Utility-first CSS
- **Tweakpane** v4.0.5 - Debug UI panels
- **Vite** v5.4.0 - Build tool

---

**Last Updated:** 2026-01-20
**Repository:** Third-Person-MC (Voxel-based Minecraft-style game in Three.js + Vue 3)
