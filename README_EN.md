# Third-Person-MC (Web Third-Person MC / Web3D Demo)

[中文](README.md) | English

> A Web 3D demonstration built with **Three.js + Vue 3**, showcasing **Minecraft-style multi-world portals** and **Souls-like target locking combat**.  
> Goal: To make Web3D a project that is "runnable, playable, and iteratively improvable," rather than just a screenshot demo.

- Online Preview: `https://third-person-mc.vercel.app/`
- Debug Panel: `https://third-person-mc.vercel.app/#debug`
- Product Requirements (PRD, early version, may vary from final implementation): [`docs/PRD.md`](docs/PRD.md)

## Table of Contents

- [Visual Preview](#visual-preview)
- [Gameplay & Controls](#gameplay--controls)
- [Biomes & Terrain Generation](#biomes--terrain-generation)
- [Camera Adaptation & HUD](#camera-adaptation--hud)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Credits](#credits)
- [TODO](#todo)
- [Quick Start](#quick-start)
- [License](#license)

## Visual Preview

### Start Screen
<img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/image.webp" width="960" alt="Start Screen Display" />

| Attack Effect | Terrain: Multi-Biome Mosaic |
| :--- | :--- |
| <img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/attack.gif" width="420" alt="Attack Effect Preview" /><br/>Attack Effect Preview | <img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/多生态拼图.webp" width="420" alt="Multi-Biome Mosaic" /><br/>Terrain: Multi-Biome Mosaic |

## Core Highlights (Project Realization)

- **Movement System**: Third-person character movement and stance switching (Walk/Run/Jump), emphasizing control feedback and animation blending.
- **Biomes**: Procedural terrain based on random seeds and noise (includes Plains, Forest, Desert, Frozen Ocean, etc.).
- **Third-Person Camera**: Obstacle avoidance and anti-clipping logic for uneven terrain, enhancing playability and visual stability.

> Note: The repository also integrates HUD/Menu UI, resource loading, shader pipelines, and other infrastructure. See "Project Structure" and PRD for details.

## Gameplay & Controls

> Aimed at "onboarding readers within 30 seconds."

| Action | Key | Description |
| --- | --- | --- |
| **Move** | `W / A / S / D` | 8-directional movement with stance switching |
| **Normal Attack** | `Z` | Supports combo sequences |
| **Heavy Attack** | `X` | Powerful hit feedback |
| **Lock Target** | `Middle Mouse` | (WIP) Souls-like locking logic |
| **Block** | `C` | Defensive action |
| **Interact** | `E / F` | (WIP) Gathering or opening portals |
| **Close Menu** | `ESC` | Exit or pause |

## Biomes & Terrain Generation

Terrain emphasizes "Voxel style + Procedural Biome transitions" while maintaining a stable frame rate.

| Plains | Forest |
| :--- | :--- |
| <img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/01.2rvmobho84.gif" width="420" alt="Plains" /><br/>Plains Biome | <img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/05.6f16budguw.gif" width="420" alt="Forest" /><br/>Forest Biome |

| Birch Forest | Cherry Blossom |
| :--- | :--- |
| <img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/06.7lkhkg2dhn.gif" width="420" alt="Birch Forest" /><br/>Birch Forest Biome | <img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/08.b9e9easke.gif" width="420" alt="Cherry Blossom" /><br/>Cherry Blossom Biome |

| Desert | Frozen Ocean |
| :--- | :--- |
| <img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/07.9gx2d2et4h.gif" width="420" alt="Desert" /><br/>Desert Biome | <img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/冻洋.webp" width="420" alt="Frozen Ocean" /><br/>Frozen Ocean Biome |

### Terrain Generation Logic (Noise & FBM)

#### One Seed, One World (PRNG)
<img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/seed.webp" width="960" alt="One Seed, One World" />

| Amplitude Adjustment (Noise) | Detail Adjustment (FBM) |
| :--- | :--- |
| <img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/地形振幅.gif" width="420" alt="Amplitude" /><br/>Terrain Amplitude | <img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/FBM.gif" width="420" alt="FBM" /><br/>Ground Details |

## Camera Adaptation & HUD

Core Goal: Free camera rotation, automatic obstacle avoidance without clipping through terrain.

### HUD UI Overview
<img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/HUD.webp" width="960" alt="HUD Overview" />

| Camera Following | Over-the-Shoulder |
| :--- | :--- |
| <img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/03.6f16budgsi.gif" width="420" alt="Camera Follow" /><br/>Camera Follow Demo | <img src="https://github.com/hexianWeb/picx-images-hosting/raw/master/相机调整.gif" width="420" alt="Over-the-Shoulder" /><br/>Camera Stance Adj. |

## Technology Stack

### Core Framework
- **Three.js (v0.172+)**: Core 3D engine
- **Vue 3**: UI development framework
- **Vite**: Ultra-fast build tool and dev server
- **Pinia**: Reactive state management (Sync UI & 3D)

### Rendering & Animation
- **GLSL (Custom Shaders)**: Portals, terrain rendering, and post-processing
- **three-custom-shader-material**: Material enhancement plugin
- **GSAP**: High-performance animation library
- **InstancedMesh**: Optimized large-scale voxel and vegetation rendering

### Tools & Engineering
- **mitt**: Global event bus for real-time UI/3D communication
- **Tailwind CSS**: Utility-first CSS framework
- **Sass/PostCSS**: Preprocessor support
- **Playwright**: E2E testing
- **Husky & Commitlint**: Git commit standards

## Project Structure

```text
E:\圖形學\Third-Person-MC\
├── public/                 # Static assets
│   ├── models/             # GLB/GLTF models (Character, Blocks)
│   ├── textures/           # Textures (Environment, Blocks, HUD)
│   └── fonts/              # Minecraft fonts
├── src/
│   ├── components/         # Vue UI components
│   │   ├── hud/            # In-game HUD (Health, XP, Hotbar, etc.)
│   │   ├── menu/           # Main Menu, Settings, Loading screens
│   │   └── MiniMap.vue     # Minimap component
│   ├── js/                 # Core logic
│   │   ├── camera/         # Camera Controller & Rig
│   │   ├── world/          # Scene elements, Player logic, Terrain system
│   │   │   └── terrain/    # Biome gen, Chunk management, AO calculation
│   │   ├── interaction/    # Raycasting, Block interaction
│   │   ├── utils/          # Debug, Events, Input handling
│   │   └── experience.js   # Framework singleton entry
│   ├── shaders/            # Custom GLSL shaders
│   └── vue/                # Pinia Stores
├── docs/                   # Documentation & Plans
└── vite.config.js          # Vite config
```

## Credits
- **Models**: Custom Minecraft-style modeling ( character.glb ), skins from [https://www.minecraftskins.com/](https://www.minecraftskins.com/)
- **Textures**: Extracted from Minecraft [Mojang/bedrock-samples](Mojang/bedrock-samples), optimized by [hexianWeb](https://github.com/hexianWeb).
- **Fonts**: [Minecraftia-Regular.ttf](https://www.dafont.com/minecraftia.font)
- **SFX**: Planned to be generated by Suno AI (Hit, Ambience **Not yet generated**)

## TODO
- [ ] **Player's Loyal Dog**: Companion AI and follow system
- [ ] **Better Biomes**: Smooth transitions and more vegetation types
- [ ] **Inventory System**: Items management and interaction UI
- [ ] **Digging Effects**: Block breaking particles and animations
- [ ] **Skin Switching**: Real-time player skin updates
- [ ] **Locked Target FX**: Enhanced visual feedback for Souls-like locking

## Quick Start

### Prerequisites

- Node.js (LTS recommended)
- Package Manager: pnpm recommended (repository includes `pnpm-lock.yaml`)

### Installation & Run

```bash
pnpm install
pnpm dev
```

Open the local address provided by terminal (Vite starts with `--host`).

## Common Commands

```bash
# Develop
pnpm dev

# Build / Preview
pnpm build
pnpm preview

# Lint
pnpm lint
pnpm lint:fix

# E2E (Playwright)
pnpm test:chrome
pnpm test:firefox
pnpm test:safari
```

## Docs & Entry Points

- PRD: [`docs/PRD.md`](docs/PRD.md)
- Planning: [`docs/plans/`](docs/plans/)

## Development Conventions

- Core logic organized via **Experience Singleton** in `src/js/experience.js`
- Decoupled UI (Vue) and 3D (Three.js): State via Pinia, events via mitt
- New 3D components should include a `debugInit` panel for tuning

(See `.cursor/rules/` for more details)

## Contribution

- Code of Conduct: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- Husky + Commitlint enabled, follow Conventional Commits

## License

MIT, see [`LICENSE`](LICENSE).
