# TODO: Bootstrapped Dynamic Item and Action Framework

## Overview

Implement a fully dynamic item and action system for the virtual world. All item classes (e.g., instruments, flowers) and actions (e.g., play, tune) are defined and managed in a dynamic repository. Static content is used only for initial bootstrapping if the repository is empty.

There should be a user interface (similar to the crafting UI) for defining new item classes and actions, accessible to players/admins. In addition, provide an MCP API to allow programmatic creation and management of item classes and actions.

---

## Goals

- Allow players to define and craft new item classes at runtime (e.g., new instruments, new flowers).
- Allow new actions to be defined and registered dynamically (e.g., "tune", "play").
- Item classes can specify required actions, per-instance state, and logic (e.g., a guitar must be tuned before playing, and can be played three times before retuning).
- All item and action definitions are persisted in a repository (using database API).
- On startup, if the repository is empty, bootstrap with a set of default item classes and actions.

---

## Key Components

### 1. Item Class Repository

- Stores all item class definitions (name, type, actions, state template, action logic).
- Supports CRUD operations for item classes.
- On startup, loads all item classes from the repository. If empty, loads static defaults and persists them.

### 2. Action Registry

- Stores all available actions and their handler logic.
- Supports dynamic registration of new actions at runtime.
- Each action handler can access and modify item instance state.

### 3. Item Instance State

- Each crafted item instance stores its own state (e.g., tuned/untuned, playsLeft).
- State is initialized from the item class template when crafted.

### 4. Crafting System

- Allows crafting of both new item classes (by defining their structure and logic) and item instances (from existing classes).
- When crafting a new class, specify actions, state template, and logic.
- When crafting an instance, initialize its state from the class template.

---

## Example: Guitar Instrument

- Item class: "guitar"
- Actions: ["play", "tune"]
- State: `{ tuned: false, playsLeft: 0 }`
- Logic:
  - "tune": sets `tuned: true`, `playsLeft: 3`
  - "play": requires `tuned: true` and `playsLeft > 0`, decrements `playsLeft` by 1; if `playsLeft` is 0, must "tune" again

---

## Bootstrapping Logic

- On world/server initialization:
  1. Load item classes and actions from the dynamic repository.
  2. If empty, load static defaults and persist them.
  3. All further operations use only the dynamic repository.

---

## Tasks

- [ ] Implement item class repository with bootstrapping
- [ ] Implement dynamic action registry
- [ ] Support per-instance item state
- [ ] Update crafting system for new class and instance creation
- [ ] Provide admin/player UI (similar to crafting) for defining new item classes and actions
- [ ] Provide MCP API for programmatic creation and management of item classes and actions
- [ ] Ensure persistence and runtime registration for all definitions
- [ ] Add tests and documentation

---

## Phase 2: Visual Customization

- [ ] Allow item creators to specify visual appearance for new item classes:
  - Choose from primitive shapes (Box, Sphere, Cylinder, etc.) with configurable parameters
  - Select or upload icons, images, or 3D models for items
  - Set material properties (color, texture, etc.)
  - Support composite shapes (e.g., flower = stem + head)
- [ ] Update the UI and MCP API to support visual customization options during item class creation
- [ ] Ensure client.js (three.js) can render items according to their visual definitions

---

## Notes

- No static item/action logic after bootstrapping; all is dynamic.
- All item/action lookups and execution reference the dynamic repository.
- System is extensible by players/admins at runtime.
