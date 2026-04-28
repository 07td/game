# OSRS Tower Defense

A tower defense game built using the rs-map-viewer as a library, featuring authentic OSRS locations, enemies, and gameplay mechanics.

## Quick Start

1. Make sure the parent `rs-map-viewer` project is set up with caches
2. Install dependencies: `yarn install`  
3. Start the game: `yarn start`
4. Navigate to http://localhost:3000

## Overview

This standalone project uses the rs-map-viewer as a library to create an immersive tower defense experience set in the world of Old School RuneScape. Players defend strategic locations like Lumbridge by placing towers and fighting waves of classic OSRS enemies.

## Game Features

### Current Implementation
- **Location**: Lumbridge town defense scenario
- **Enemy Types**: 6 different OSRS creatures with unique stats:
  - Imp (fast, low health)
  - Spider (moderate stats)
  - Black Dragon (balanced)
  - Hill Giant (tanky, slower)
  - Moss Giant (high health)
  - Demon (elite enemy)

### Tower Types
- **Crossbow Tower**: Fast firing, moderate damage
  - Cost: 30 gold
  - Damage: 18
  - Cooldown: 650ms
  - Range: Medium
  
- **Obelisk of Air**: High damage, slower attacks, upgrades through Water, Earth, and Fire
  - Cost: 55 gold
  - Damage: 38
  - Cooldown: 1200ms
  - Range: Long
  
- **Cannon Tower**: Heavy damage, slow firing
  - Cost: 80 gold
  - Damage: 62
  - Cooldown: 1800ms
  - Range: Medium

### Gameplay Mechanics
- **Wave System**: Progressive difficulty with 5+ enemies per wave
- **Economy**: Start with 140 gold, earn rewards for defeating enemies
- **Lives System**: 20 lives, lose lives when enemies reach the end
- **Strategic Tower Placement**: 6 predefined tower pads around Lumbridge
- **Progressive Scaling**: Enemy health, speed, and rewards increase with each wave

## Technical Architecture

### Core Components
- `lumbridgeTd.ts` - Main game state and logic
- `lumbridgeTdEvents.ts` - Event handling system
- `lumbridgeTdRoute.ts` - Enemy pathfinding routes
- `lumbridgeTdWorld.ts` - World/map integration
- `LumbridgeTowerDefenseOverlay.tsx` - UI components

### Integration Points
- Built on existing MapViewer renderer system
- Uses OSRS cache data for authentic visuals
- WebGL-based rendering for performance
- TypeScript for type safety

## Development Setup

### Prerequisites
- Node.js and Yarn
- Existing rs-map-viewer setup (see main README.md)

### Running the Tower Defense Game
```bash
# Start the main map viewer
yarn start

# The tower defense mode is accessible through the UI
# Navigate to Lumbridge and activate TD mode
```

### File Structure
```
src/mapviewer/td/
├── lumbridgeTd.ts              # Core game logic
├── lumbridgeTdEvents.ts        # Event system
├── lumbridgeTdRoute.ts         # Pathfinding
├── lumbridgeTdWorld.ts         # World integration
├── LumbridgeTowerDefenseOverlay.css
├── LumbridgeTowerDefenseOverlay.tsx
└── CannonModelCanvas.tsx       # Tower visualization
```

## Game Balance

### Enemy Progression
- Wave 1-2: Basic enemies (Imp, Spider)
- Wave 3-4: Introduction of giants
- Wave 5+: All enemy types with scaling stats

### Economy Balance
- Starting gold: 140 (enough for 4-5 basic towers)
- Enemy rewards scale with wave progression
- Tower costs encourage strategic placement

## Future Expansion Ideas

### Additional Locations
- Falador defense scenario
- Varrock siege mode
- Wilderness survival waves
- Grand Exchange protection

### New Tower Types
- Magic towers with special effects
- Ranged towers with armor piercing
- Support towers (healing, buffs)
- Trap mechanisms

### Advanced Features
- Tower upgrades and skill trees
- Special abilities and spells
- Multiplayer cooperative defense
- Leaderboards and achievements

## Contributing

This tower defense implementation follows the existing codebase patterns and conventions. When adding features:

1. Maintain type safety with TypeScript
2. Follow existing naming conventions
3. Use the established renderer architecture
4. Test gameplay balance thoroughly

## License

This project extends the open-source rs-map-viewer. See the main project's LICENSE file for details.

---

*Built with ❤️ for the OSRS community*
