/// <reference path="../../../../types/virtual-world-browser-globals.d.ts" />

function createSessionId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return (
    "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)
  );
}
var sessionId = createSessionId();

var AUTH_STATE_OK = "ok";
var AUTH_STATE_EXTENDING = "extending";
var AUTH_STATE_EXPIRED = "expired";
var AUTH_STATE_REDIRECTING = "redirecting";
var authState = AUTH_STATE_OK;
/** @type {number | null} */
var authProbeRetryTimer = null;
var authProbeAttempts = 0;
var authProbeInFlight = false;
var authSseCheckPending = false;
/** @type {Promise<boolean> | null} */
var authRefreshPromise = null;
/** @type {number | null} */
var authRefreshIntervalTimer = null;
var browserFetch = window.fetch.bind(window);
var AUTH_PROBE_MAX_ATTEMPTS = 3;
var AUTH_LOGIN_REDIRECT_DELAY_MS = 800;
var AUTH_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/**
 * @param {string} text
 * @param {boolean} isError
 */
function setAuthStatusMessage(text, isError) {
  var el = document.getElementById("hud-auth-status");
  if (!el) return;
  if (!text) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.style.display = "block";
  if (isError) {
    el.style.background = "rgba(130, 36, 26, 0.9)";
    el.style.borderColor = "rgba(255, 120, 100, 0.7)";
  } else {
    el.style.background = "rgba(120, 70, 10, 0.86)";
    el.style.borderColor = "rgba(255, 196, 112, 0.6)";
  }
}

function loginRedirectUrl() {
  return "/auth/login?redirect=" + encodeURIComponent("/virtual-world/play");
}

function redirectToLogin() {
  if (authState === AUTH_STATE_REDIRECTING) return;
  authState = AUTH_STATE_REDIRECTING;
  setAuthStatusMessage("Session expired. Redirecting to login...", true);
  setTimeout(function () {
    window.location.href = loginRedirectUrl();
  }, AUTH_LOGIN_REDIRECT_DELAY_MS);
}

function handleAuthRecovery() {
  authState = AUTH_STATE_OK;
  authProbeAttempts = 0;
  if (authProbeRetryTimer) {
    clearTimeout(authProbeRetryTimer);
    authProbeRetryTimer = null;
  }
  setAuthStatusMessage("", false);
  flushMove();
}

/**
 * @param {string} reason
 * @returns {Promise<boolean>}
 */
function refreshSessionSilently(reason) {
  if (isAuthUnavailable()) return Promise.resolve(false);
  if (authRefreshPromise) return authRefreshPromise;
  authRefreshPromise = browserFetch("/auth/refresh", {
    method: "POST",
    cache: "no-store",
  })
    .then(function (res) {
      if (res.status === 401) return false;
      return res.ok;
    })
    .catch(function () {
      return false;
    })
    .finally(function () {
      authRefreshPromise = null;
    });
  return authRefreshPromise;
}

/** @returns {Promise<boolean>} */
function probeAuthStatus() {
  return browserFetch("/virtual-world/current-world", {
    method: "GET",
    cache: "no-store",
  })
    .then(function (res) {
      if (res.status === 401) return false;
      return res.ok;
    })
    .catch(function () {
      return false;
    });
}

function runAuthProbeAttempt() {
  if (authState !== AUTH_STATE_EXTENDING) return;
  if (authProbeInFlight) return;
  if (authProbeAttempts >= AUTH_PROBE_MAX_ATTEMPTS) {
    authState = AUTH_STATE_EXPIRED;
    redirectToLogin();
    return;
  }
  var delay =
    authProbeAttempts === 0
      ? 0
      : Math.min(4000, Math.pow(2, authProbeAttempts - 1) * 1000);
  authProbeRetryTimer = setTimeout(function () {
    if (authState !== AUTH_STATE_EXTENDING) return;
    authProbeInFlight = true;
    refreshSessionSilently("recovery")
      .then(function (refreshed) {
        if (!refreshed) return false;
        return probeAuthStatus();
      })
      .then(function (ok) {
        authProbeInFlight = false;
        if (ok) {
          handleAuthRecovery();
          return;
        }
        authProbeAttempts += 1;
        runAuthProbeAttempt();
      })
      .catch(function () {
        authProbeInFlight = false;
        authProbeAttempts += 1;
        runAuthProbeAttempt();
      });
  }, delay);
}

/** @param {string} source */
function handleAuth401(source) {
  if (authState === AUTH_STATE_REDIRECTING || authState === AUTH_STATE_EXPIRED)
    return;
  if (authState === AUTH_STATE_EXTENDING) return;
  authState = AUTH_STATE_EXTENDING;
  authProbeAttempts = 0;
  setAuthStatusMessage("Session expired, trying to reconnect...", false);
  console.warn("Auth expired during request:", source);
  runAuthProbeAttempt();
}

function isAuthUnavailable() {
  return (
    authState === AUTH_STATE_REDIRECTING || authState === AUTH_STATE_EXPIRED
  );
}

/**
 * @param {string} code
 * @returns {Error & { code: string }}
 */
function createAuthError(code) {
  var authErr = /** @type {Error & { code: string }} */ (new Error(code));
  authErr.code = code;
  return authErr;
}

function scheduleSessionRefresh() {
  if (authRefreshIntervalTimer) {
    clearInterval(authRefreshIntervalTimer);
    authRefreshIntervalTimer = null;
  }
  authRefreshIntervalTimer = setInterval(function () {
    if (authState !== AUTH_STATE_OK) return;
    refreshSessionSilently("interval").then(function (ok) {
      if (!ok) handleAuth401("refresh_interval");
    });
  }, AUTH_REFRESH_INTERVAL_MS);
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState !== "visible") return;
  if (authState !== AUTH_STATE_OK) return;
  refreshSessionSilently("visibility").then(function (ok) {
    if (!ok) handleAuth401("visibility_refresh");
  });
});

/**
 * @param {string} path
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
function fetchWithAuth(path, options) {
  if (isAuthUnavailable()) {
    return Promise.reject(createAuthError("AUTH_STOPPED"));
  }
  var requestOptions = options || {};
  return browserFetch(path, requestOptions)
    .then(function (res) {
      if (res.status !== 401) return res;
      return refreshSessionSilently("request_retry").then(function (refreshed) {
        if (!refreshed) {
          handleAuth401(path);
          throw createAuthError("AUTH_401");
        }
        return browserFetch(path, requestOptions).then(function (retryRes) {
          if (retryRes.status === 401) {
            handleAuth401(path);
            throw createAuthError("AUTH_401");
          }
          return retryRes;
        });
      });
    })
    .then(function (res) {
      if (res.status === 401) {
        handleAuth401(path);
        throw createAuthError("AUTH_401");
      }
      return res;
    });
}

/**
 * @param {string} path
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
function fetchJsonWithAuth(path, options) {
  return fetchWithAuth(path, options).then(function (res) {
    return res.json();
  });
}

/** @param {string} source */
function scheduleSSEAuthCheck(source) {
  if (authState !== AUTH_STATE_OK || authSseCheckPending) return;
  authSseCheckPending = true;
  setTimeout(function () {
    authSseCheckPending = false;
    probeAuthStatus().then(function (ok) {
      if (!ok) handleAuth401(source);
    });
  }, 250);
}

/**
 * @param {number} retryCount
 * @returns {number}
 */
function getSSEReconnectDelayMs(retryCount) {
  var capped = Math.min(retryCount, 5);
  if (authState === AUTH_STATE_EXTENDING) {
    return Math.min(10000, 1000 * Math.pow(2, capped));
  }
  return Math.min(6000, 600 * Math.pow(2, capped));
}
