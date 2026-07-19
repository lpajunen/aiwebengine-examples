/// <reference path="virtual-world-browser-globals.d.ts" />
// Input: keyboard, mouse, touch, and on-screen joystick.

// ── Input ────────────────────────────────────────────────────────────────
/** @type {Record<string, boolean>} */
var keys = {};
var MOVE_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "w",
  "a",
  "s",
  "d",
  "W",
  "A",
  "S",
  "D",
];

/** @param {any} el */
function isTypingTarget(el) {
  if (!el) return false;
  var tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

// Clear held movement keys when an input gains focus to prevent stuck movement
document.addEventListener("focusin", function (e) {
  if (isTypingTarget(e.target)) {
    MOVE_KEYS.forEach(function (k) {
      keys[k] = false;
    });
  }
});

document.addEventListener("keydown", function (e) {
  if (isTypingTarget(document.activeElement)) return;
  keys[e.key] = true;
  if (MOVE_KEYS.indexOf(e.key) !== -1) e.preventDefault();
  if (e.key === "i" || e.key === "I") {
    e.preventDefault();
    toggleInventoryPanel();
  }
});
document.addEventListener("keyup", function (e) {
  if (isTypingTarget(document.activeElement)) return;
  keys[e.key] = false;
});

// ── Camera orbit controls (drag + scroll) ────────────────────────────────
var isDragging = false;
var lastMouseX = 0,
  lastMouseY = 0;
var mouseClickStartX = 0,
  mouseClickStartY = 0;
var lastTouchX = 0,
  lastTouchY = 0;
var lastTouchDist = 0;
var touchTapStartX = 0,
  touchTapStartY = 0;

// Mouse controls (desktop)
document.addEventListener("mousedown", function (e) {
  if (e.button === 0) {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    mouseClickStartX = e.clientX;
    mouseClickStartY = e.clientY;
  }
});
document.addEventListener("mousemove", function (e) {
  if (!isDragging) return;
  var dx = e.clientX - lastMouseX;
  var dy = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  cameraOrbit.theta -= dx * 0.005;
  cameraOrbit.phi = Math.max(0.15, Math.min(1.4, cameraOrbit.phi - dy * 0.004));
});
document.addEventListener("mouseup", function (e) {
  if (isDragging && e.button === 0 && !isClickOnHUD(e)) {
    var ddx = e.clientX - mouseClickStartX;
    var ddy = e.clientY - mouseClickStartY;
    if (Math.sqrt(ddx * ddx + ddy * ddy) < 6) {
      var tile = pickTileFromEvent(e.clientX, e.clientY);
      if (tile) selectTile(tile.row, tile.col);
    }
  }
  isDragging = false;
});
document.addEventListener("mouseleave", function () {
  isDragging = false;
});

requireElementById("hud-inventory-panel").addEventListener(
  "wheel",
  function (e) {
    e.stopPropagation();
  },
  { passive: true },
);

requireElementById("hud-crafting-panel").addEventListener(
  "wheel",
  function (e) {
    e.stopPropagation();
  },
  { passive: true },
);

document.addEventListener(
  "wheel",
  function (e) {
    e.preventDefault();
    cameraOrbit.radius = Math.max(
      10,
      Math.min(150, cameraOrbit.radius + e.deltaY * 0.05),
    );
  },
  { passive: false },
);

// ── Joystick element references (must be defined before touch handlers) ──
var joystickBase = requireElementById("joystick-base");
var joystickStick = requireElementById("joystick-stick");
var joystickActive = false;
var joystickMouseActive = false; // separate flag for mouse vs touch
var joystickDirection = { x: 0, y: 0 }; // normalized direction

// Touch controls (mobile) - for camera rotation and pinch-to-zoom
var isTouchRotating = false;

/** @param {Touch} touch */
function isTouchOnJoystick(touch) {
  if (!joystickBase) return false;
  var joystickRect = joystickBase.getBoundingClientRect();
  return (
    touch.clientX >= joystickRect.left &&
    touch.clientX <= joystickRect.right &&
    touch.clientY >= joystickRect.top &&
    touch.clientY <= joystickRect.bottom
  );
}

/** @param {Touch} touch */
function isTouchOnButtons(touch) {
  var treeActionsDiv = document.getElementById("hud-tree-actions");
  if (treeActionsDiv) {
    var rect = treeActionsDiv.getBoundingClientRect();
    if (
      touch.clientX >= rect.left &&
      touch.clientX <= rect.right &&
      touch.clientY >= rect.top &&
      touch.clientY <= rect.bottom
    ) {
      return true;
    }
  }
  var inventoryDiv = document.getElementById("hud-inventory-panel");
  if (inventoryDiv && inventoryDiv.style.display !== "none") {
    var invRect = inventoryDiv.getBoundingClientRect();
    if (
      touch.clientX >= invRect.left &&
      touch.clientX <= invRect.right &&
      touch.clientY >= invRect.top &&
      touch.clientY <= invRect.bottom
    ) {
      return true;
    }
  }
  var craftingDiv = document.getElementById("hud-crafting-panel");
  if (craftingDiv && craftingDiv.style.display !== "none") {
    var craftingRect = craftingDiv.getBoundingClientRect();
    if (
      touch.clientX >= craftingRect.left &&
      touch.clientX <= craftingRect.right &&
      touch.clientY >= craftingRect.top &&
      touch.clientY <= craftingRect.bottom
    ) {
      return true;
    }
  }
  var tileDetailDiv = document.getElementById("hud-tile-detail");
  if (tileDetailDiv && tileDetailDiv.style.display !== "none") {
    var tileRect = tileDetailDiv.getBoundingClientRect();
    if (
      touch.clientX >= tileRect.left &&
      touch.clientX <= tileRect.right &&
      touch.clientY >= tileRect.top &&
      touch.clientY <= tileRect.bottom
    ) {
      return true;
    }
  }
  var usePickerDiv = document.getElementById("hud-use-picker");
  if (usePickerDiv && usePickerDiv.style.display !== "none") {
    var usePickerRect = usePickerDiv.getBoundingClientRect();
    if (
      touch.clientX >= usePickerRect.left &&
      touch.clientX <= usePickerRect.right &&
      touch.clientY >= usePickerRect.top &&
      touch.clientY <= usePickerRect.bottom
    ) {
      return true;
    }
  }
  return false;
}

document.addEventListener(
  "touchstart",
  function (e) {
    // Ignore if touching the joystick or buttons
    if (
      e.touches.length === 1 &&
      !isTouchOnJoystick(e.touches[0]) &&
      !isTouchOnButtons(e.touches[0])
    ) {
      e.preventDefault();
      isTouchRotating = true;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      touchTapStartX = e.touches[0].clientX;
      touchTapStartY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      e.preventDefault();
      // Pinch to zoom
      isTouchRotating = false;
      var dx = e.touches[1].clientX - e.touches[0].clientX;
      var dy = e.touches[1].clientY - e.touches[0].clientY;
      lastTouchDist = Math.sqrt(dx * dx + dy * dy);
    }
  },
  { passive: false },
);

document.addEventListener(
  "touchmove",
  function (e) {
    if (e.touches.length === 1 && isTouchRotating) {
      e.preventDefault();
      // Single finger drag for camera rotation
      var dx = e.touches[0].clientX - lastTouchX;
      var dy = e.touches[0].clientY - lastTouchY;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      cameraOrbit.theta -= dx * 0.005;
      cameraOrbit.phi = Math.max(
        0.15,
        Math.min(1.4, cameraOrbit.phi - dy * 0.004),
      );
    } else if (e.touches.length === 2) {
      e.preventDefault();
      // Pinch to zoom
      var dx = e.touches[1].clientX - e.touches[0].clientX;
      var dy = e.touches[1].clientY - e.touches[0].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var delta = lastTouchDist - dist;
      lastTouchDist = dist;
      cameraOrbit.radius = Math.max(
        10,
        Math.min(150, cameraOrbit.radius + delta * 0.2),
      );
    }
  },
  { passive: false },
);

document.addEventListener(
  "touchend",
  function (e) {
    if (e.touches.length === 0) {
      if (isTouchRotating && e.changedTouches.length > 0) {
        var ct = e.changedTouches[0];
        var tdx = ct.clientX - touchTapStartX;
        var tdy = ct.clientY - touchTapStartY;
        if (Math.sqrt(tdx * tdx + tdy * tdy) < 10) {
          var tile = pickTileFromEvent(ct.clientX, ct.clientY);
          if (tile) selectTile(tile.row, tile.col);
        }
      }
      isTouchRotating = false;
    } else if (
      e.touches.length === 1 &&
      !isTouchOnJoystick(e.touches[0]) &&
      !isTouchOnButtons(e.touches[0])
    ) {
      // Continuing with one finger after lifting second
      isTouchRotating = true;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      touchTapStartX = e.touches[0].clientX;
      touchTapStartY = e.touches[0].clientY;
    }
  },
  { passive: false },
);

// ── Joystick control functions ───────────────────────────────────────────
/**
 * @param {number} touchX
 * @param {number} touchY
 */
function updateJoystick(touchX, touchY) {
  var rect = joystickBase.getBoundingClientRect();
  var centerX = rect.left + rect.width / 2;
  var centerY = rect.top + rect.height / 2;
  var dx = touchX - centerX;
  var dy = touchY - centerY;
  var distance = Math.sqrt(dx * dx + dy * dy);
  var maxDistance = 35; // max offset from center

  if (distance > maxDistance) {
    dx = (dx / distance) * maxDistance;
    dy = (dy / distance) * maxDistance;
  }

  joystickStick.style.transform =
    "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";

  // Normalize direction
  if (distance > 10) {
    // dead zone
    joystickDirection.x = dx / maxDistance;
    joystickDirection.y = dy / maxDistance;
  } else {
    joystickDirection.x = 0;
    joystickDirection.y = 0;
  }
}

function resetJoystick() {
  joystickStick.style.transform = "translate(-50%, -50%)";
  joystickDirection.x = 0;
  joystickDirection.y = 0;
  joystickActive = false;
  joystickStick.classList.remove("active");
}

joystickBase.addEventListener(
  "touchstart",
  function (e) {
    e.preventDefault();
    e.stopPropagation();
    joystickActive = true;
    joystickStick.classList.add("active");
    updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
  },
  { passive: false },
);

joystickBase.addEventListener(
  "touchmove",
  function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (joystickActive) {
      updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
    }
  },
  { passive: false },
);

joystickBase.addEventListener(
  "touchend",
  function (e) {
    e.preventDefault();
    e.stopPropagation();
    resetJoystick();
  },
  { passive: false },
);

joystickBase.addEventListener(
  "touchcancel",
  function (e) {
    e.preventDefault();
    e.stopPropagation();
    resetJoystick();
  },
  { passive: false },
);

// Mouse event handlers for desktop
joystickBase.addEventListener("mousedown", function (e) {
  e.preventDefault();
  e.stopPropagation();
  joystickActive = true;
  joystickMouseActive = true;
  joystickStick.classList.add("active");
  updateJoystick(e.clientX, e.clientY);
});

document.addEventListener("mousemove", function (e) {
  if (joystickMouseActive) {
    e.preventDefault();
    updateJoystick(e.clientX, e.clientY);
  }
});

document.addEventListener("mouseup", function (e) {
  if (joystickMouseActive) {
    e.preventDefault();
    joystickMouseActive = false;
    resetJoystick();
  }
});
