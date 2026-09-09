// Talking to a living.
//
// A conversation is a list of nodes on the living's class (world-domain.ts):
// what it says, and what the player may say back. This module resolves which
// node a player is in and what they may pick, and hands a chosen action to the
// ordinary action pipeline.
//
// It deliberately owns no verbs of its own. A choice that gives the gatekeeper
// a flower names `give_flower`, and that action charges the flower, produces
// the letter, awards the XP and makes her answer in the player's language —
// all of which already worked before dialogue existed. Anything a choice could
// "do" is something an action should be able to do anyway, so a second copy of
// cost/produces/effects here would be a fork of the vocabulary, not a feature.
//
// Conversation state lives in the client: it sends back the node it is on and
// the choice it picked, and every step is re-validated here. Nothing is
// stored, so a player who closes the panel, reloads or crashes has simply
// stopped talking — which is what stopping talking looks like.

import { evaluateEntityConditions } from "./action-logic-interpreter.ts";
import { getLivingClass } from "./living-registry.ts";
import { getWorldClassForWorld } from "./world-bootstrap.ts";
import { loadWorldPlacementInstances } from "./world-placement-instances.ts";
import { loadPlayerInventory } from "./item-storage.ts";
import { getPlayerWorld } from "./player-persistence.ts";
import { loadWorldNPCs } from "./npc-storage.ts";
import { NEARBY_TARGET_TILE_DISTANCE } from "./runtime-config.ts";
import { performTreeActionForUser } from "./tree-action-helpers.ts";
import { getCanonicalPlayerState } from "./player-snapshots.ts";
import {
  DialogueChoice,
  DialogueNode,
  DialogueSpec,
  isWithinTileDistance,
  resolveNPCDisplayName,
} from "./world-domain.ts";

export type PublicDialogueChoice = {
  // The index into the node's own choice list, so the client sends back
  // something this module can re-validate rather than trusting a payload.
  index: number;
  text: string;
  text_key?: string;
};

export type PublicDialogueNode = {
  id: string;
  text: string;
  text_key?: string;
  choices: PublicDialogueChoice[];
};

function playerConditionContext(userId: string): {
  class_id: string;
  values: Record<string, unknown>;
} {
  const inv = loadPlayerInventory(userId);
  return {
    class_id: String((inv && inv.class_id) || ""),
    values: (inv && inv.values) || {},
  };
}

function nodeIsOpen(node: DialogueNode, player: unknown): boolean {
  return evaluateEntityConditions(
    node.conditions,
    player as Record<string, unknown>,
  ).ok;
}

/** The choices this player may actually see, with their original indexes. */
function openChoices(
  node: DialogueNode,
  player: unknown,
): PublicDialogueChoice[] {
  const out: PublicDialogueChoice[] = [];
  const choices = Array.isArray(node.choices) ? node.choices : [];
  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    if (!choice || typeof choice.text !== "string") continue;
    if (
      !evaluateEntityConditions(
        choice.conditions,
        player as Record<string, unknown>,
      ).ok
    ) {
      continue;
    }
    out.push({
      index: i,
      text: choice.text,
      ...(choice.textKey ? { text_key: choice.textKey } : {}),
    });
  }
  return out;
}

function toPublicNode(node: DialogueNode, player: unknown): PublicDialogueNode {
  return {
    id: String(node.id),
    text: String(node.text || ""),
    ...(node.textKey ? { text_key: node.textKey } : {}),
    choices: openChoices(node, player),
  };
}

/**
 * The living being talked to, once it is established that the player may talk
 * to it: it exists in their world, is close enough, and has something to say.
 */
function resolveDialogueTarget(
  userId: string,
  targetLivingId: string,
): {
  worldId: string;
  npc: any;
  nodes: DialogueNode[];
  displayName: string;
} | null {
  const worldId = getPlayerWorld(userId);
  if (!worldId) return null;
  const npc = loadWorldNPCs(worldId)[targetLivingId];
  if (!npc) return null;

  const canonical = getCanonicalPlayerState(worldId, userId);
  if (
    !isWithinTileDistance(
      Number(npc.row),
      Number(npc.col),
      Number(canonical.row),
      Number(canonical.col),
      NEARBY_TARGET_TILE_DISTANCE,
    )
  ) {
    return null;
  }

  // This living's own conversation wins over its class's: the class says what
  // every gatekeeper has in common, the placement what only the one at this
  // gate knows. Read here rather than copied onto the NPC when it materializes
  // — a conversation runs to kilobytes and an NPC row is rewritten every tick.
  const livingClass = getLivingClass(String(npc.class_id || ""));
  const placed = placementDialogueFor(worldId, targetLivingId);
  const spec =
    placed || (livingClass ? livingClass.dialogue : undefined) || null;
  const nodes = spec && Array.isArray(spec.nodes) ? spec.nodes : [];
  if (nodes.length === 0) return null;

  return {
    worldId: worldId,
    npc: npc,
    nodes: nodes,
    displayName: resolveNPCDisplayName(worldId, targetLivingId, npc),
  };
}

/**
 * The conversation authored on the placement that created this NPC, if any.
 * Costs one instance lookup, paid only when somebody actually talks.
 */
function placementDialogueFor(
  worldId: string,
  npcId: string,
): DialogueSpec | null {
  const worldClass = getWorldClassForWorld(worldId);
  if (!worldClass || !Array.isArray(worldClass.placements)) return null;
  const instances = loadWorldPlacementInstances(worldId);
  const placementIds = Object.keys(instances);
  for (let i = 0; i < placementIds.length; i++) {
    const instance = instances[placementIds[i]];
    if (!instance || !instance.data) continue;
    if (String(instance.data.npcId || "") !== npcId) continue;
    for (let p = 0; p < worldClass.placements.length; p++) {
      const placement = worldClass.placements[p];
      if (placement && String(placement.id) === placementIds[i]) {
        return placement.dialogue || null;
      }
    }
    return null;
  }
  return null;
}

function findNode(nodes: DialogueNode[], nodeId: string): DialogueNode | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i] && String(nodes[i].id) === nodeId) return nodes[i];
  }
  return null;
}

/** The greeting: the first node this player is allowed to be in. */
function openingNode(
  nodes: DialogueNode[],
  player: unknown,
): DialogueNode | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i] && nodeIsOpen(nodes[i], player)) return nodes[i];
  }
  return null;
}

export function openDialogueForUser(
  userId: string,
  targetLivingId: string,
): { status: number; payload: any } {
  const target = resolveDialogueTarget(userId, String(targetLivingId || ""));
  if (!target) {
    return {
      status: 200,
      payload: { ok: false, error: "error.nothing_to_say" },
    };
  }
  const player = playerConditionContext(userId);
  const node = openingNode(target.nodes, player);
  if (!node) {
    return {
      status: 200,
      payload: { ok: false, error: "error.nothing_to_say" },
    };
  }
  return {
    status: 200,
    payload: {
      ok: true,
      target_living_id: String(targetLivingId),
      display_name: target.displayName,
      node: toPublicNode(node, player),
    },
  };
}

export function advanceDialogueForUser(
  userId: string,
  body: any,
): { status: number; payload: any } {
  const targetLivingId = String((body && body.target_living_id) || "");
  const target = resolveDialogueTarget(userId, targetLivingId);
  if (!target) {
    return {
      status: 200,
      payload: { ok: false, error: "error.nothing_to_say" },
    };
  }

  const node = findNode(target.nodes, String((body && body.node_id) || ""));
  const player = playerConditionContext(userId);
  // Re-checked rather than trusted: the client sends back where it thinks it
  // is, and a node the player may no longer be in is not a node they may act
  // from.
  if (!node || !nodeIsOpen(node, player)) {
    return {
      status: 200,
      payload: { ok: false, error: "error.dialogue_moved_on" },
    };
  }

  const choiceIndex = Number(body && body.choice_index);
  const available = openChoices(node, player);
  const chosen = available.find(function (c) {
    return c.index === choiceIndex;
  });
  if (!chosen) {
    return {
      status: 200,
      payload: { ok: false, error: "error.dialogue_moved_on" },
    };
  }
  const choice: DialogueChoice = (node.choices || [])[choiceIndex];

  // The doing, handed to the action pipeline exactly as the palette would.
  let actionResult: any = null;
  if (choice.action) {
    const performed = performTreeActionForUser(userId, {
      action: String(choice.action),
      target_living_id: targetLivingId,
    });
    actionResult = performed.payload;
    // A refused action stops the conversation where it is — the player is
    // told why, and the line they were promised does not follow an act that
    // never happened.
    if (!actionResult || actionResult.ok === false) {
      return {
        status: 200,
        payload: {
          ok: false,
          error: (actionResult && actionResult.error) || "error.action_failed",
          action_result: actionResult,
        },
      };
    }
  }

  // Conditions are re-read after the action: a choice that set a quest flag or
  // took an item has changed what the player may hear next, and the whole
  // point of a conversation is that the next line knows what just happened.
  const playerAfter = playerConditionContext(userId);
  const nextNode = choice.next
    ? findNode(target.nodes, String(choice.next))
    : null;
  if (!nextNode || !nodeIsOpen(nextNode, playerAfter)) {
    return {
      status: 200,
      payload: {
        ok: true,
        ended: true,
        target_living_id: targetLivingId,
        display_name: target.displayName,
        ...(actionResult ? { action_result: actionResult } : {}),
      },
    };
  }

  return {
    status: 200,
    payload: {
      ok: true,
      target_living_id: targetLivingId,
      display_name: target.displayName,
      node: toPublicNode(nextNode, playerAfter),
      ...(actionResult ? { action_result: actionResult } : {}),
    },
  };
}

/** Whether this living has anything to say — the client asks before offering Talk. */
export function livingHasDialogue(classId: string): boolean {
  const cls = getLivingClass(String(classId || ""));
  return !!(
    cls &&
    cls.dialogue &&
    Array.isArray(cls.dialogue.nodes) &&
    cls.dialogue.nodes.length > 0
  );
}
