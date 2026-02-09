# Visual Sandbox Status & Architecture

## Overview
The `TonnetzWalkthrough` has been refactored into a route-based architecture with isolated modes. The **Visual Sandbox** is now a dedicated environment for experimenting with visual effects, free from audio logic dependencies.

## 1. Route Architecture
Navigation is handled via Next.js routes:

- **Selection Page**: `/tonnetz/walkthrough` (`app/tonnetz/walkthrough/page.tsx`)
- **Visual Sandbox**: `/tonnetz/walkthrough/visual` (`app/tonnetz/walkthrough/visual/page.tsx`)
  - **Status**: Active, no audio, Leva enabled.
- **Audio Mode**: `/tonnetz/walkthrough/audio` (Legacy audio)
- **Unified Mode**: `/tonnetz/walkthrough/unified` (Merge target)

## 2. Visual Sandbox Structure (`modes/visual`)
Located in: `app/components/walkthrough/modes/visual/`

### Key Components & Leva Integrations
| Component | Status | Leva Controls |
|-----------|--------|---------------|
| `TonnetzWalkthrough.tsx` | **Refactored** | **Post-Processing**: Bloom Intensity, Bloom Radius. |
| `visual/InfiniteGridSystem.tsx` | **Active** | **Grid**: Color, Glow<br>**Wave**: Speed, Scale (Uniforms connected) |
| `visual/FloatingSpheres.tsx` | **Active** | **Appearance**: Colors, Size, Opacity<br>**Animation**: Pulse Speed |
| `visual/ActiveHighlight.tsx` | **Active** | **Colors**: Face, Edge, Pulse<br>**Opacity**: Face, Edge |

### File Structure
```
modes/visual/
├── TonnetzWalkthrough.tsx  (Entry point)
├── visual/
│   ├── InfiniteGridSystem.tsx (Grid & Wave)
│   ├── FloatingSpheres.tsx    (Spheres)
│   ├── ActiveHighlight.tsx    (Interaction)
│   └── NodeLabels.tsx         (Labels)
└── hooks/
    └── useSpatialDetection.ts (Raycasting)
```

## 3. Visual Polish Targets (Phase 3)
1.  **Enhance Active Highlighting**:
    - Particle bursts or shockwaves on node activation.
    - Organic/Flowing shader for Face (triangle) highlights (replacing transparent mesh).

2.  **Refine Infinite Grid**:
    - React to user cursor/interaction (ripple effect).
    - Vertical Trails (cursor connector).

3.  **Floating Spheres**:
    - Avoidance behavior (repel from cursor).
    - Dramatic state changes (Major vs Minor).

4.  **Post-Processing**:
    - Chromatic Aberration, Tilt-Shift, or Film Grain.
