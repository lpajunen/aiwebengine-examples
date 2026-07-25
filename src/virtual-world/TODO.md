# TODO: Visual Customization for Item Classes

## Background

Phase 1 (the bootstrapped dynamic item/action framework — item and action
class repositories with DB persistence and bootstrapping, per-instance item
state, the action condition/effect interpreter, the item/action/living/world
class editor UI, and the MCP management tools) is implemented. See
`assets/server/item-registry.ts`, `item-class-storage.ts`,
`action-class-storage.ts`, `action-logic-interpreter.ts`, `tool-handlers.ts`,
and `assets/public/client-editors.js`.

What remains is visual customization: item classes currently only carry a
single color tint (`visuals: { color, labelKey, fallbackLabel }` in
`item-registry.ts`), and the client (`client-world-render.js`) renders every
item with the same fixed box geometry, varying only material color by type.

---

## Phase 2: Visual Customization

- [ ] Allow item creators to specify visual appearance for new item classes:
  - Choose from primitive shapes (Box, Sphere, Cylinder, etc.) with configurable parameters
  - Select or upload icons, images, or 3D models for items
  - Set material properties (color, texture, etc.)
  - Support composite shapes (e.g., flower = stem + head)
- [ ] Update the UI and MCP API to support visual customization options during item class creation
- [ ] Ensure the client (`client-world-render.js`, three.js) can render items according to their visual definitions

---

## Notes

- No static item/action logic after bootstrapping; all is dynamic.
- All item/action lookups and execution reference the dynamic repository.
- System is extensible by players/admins at runtime.
