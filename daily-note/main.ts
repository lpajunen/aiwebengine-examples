/// <reference path="../types/aiwebengine.d.ts" />

// Daily Note: a personal schedule.
//
// A signed-in person gives the script permission, picks a time and a time
// zone, and every day at that time a run acting as them writes a note into
// their personal storage. The schedule is theirs: it survives deployments,
// ends when they withdraw permission, and is listed on their account page.

const KEY = "daily-note";
const LINES = [
  "Drink a glass of water.",
  "Write down one thing that went well yesterday.",
  "Step outside for five minutes.",
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(body: string): HttpResponse {
  return ResponseBuilder.html(
    `<!doctype html><meta charset=utf-8><title>Daily note</title>` +
      `<h1>Daily note</h1>${body}`,
  );
}

function dailyNotePage(context: HandlerContext): HttpResponse {
  if (!context.request?.auth?.isAuthenticated) {
    return page(
      `<p><a href="/auth/login?redirect=/daily-note">Sign in</a> first.</p>`,
    );
  }
  const grant = personalTasks.authorization();
  const scopes = grant.scopes ?? [];
  if (
    !grant.granted ||
    scopes.indexOf("personal_storage") === -1 ||
    scopes.indexOf("write") === -1
  ) {
    return page(
      `<p>The note is written while you are away, so it needs your ` +
        `permission (personal storage, with write). ` +
        `<a href="${escapeHtml(grant.consentUrl ?? "")}">Give it</a>.</p>`,
    );
  }

  const schedule = personalTasks.schedules().find((s) => s.key === KEY);
  const note = personalStorage.getItem("note") ?? "No note yet.";
  const state = schedule
    ? schedule.state === "active"
      ? `Next note: ${schedule.nextRunAt} (UTC).`
      : `Paused (${schedule.pausedReason}).`
    : "Not scheduled.";
  return page(
    `<p>${escapeHtml(note)}</p><p>${escapeHtml(state)}</p>` +
      `<form method=post action="/daily-note">` +
      `<input name=time value="07:00"> ` +
      `<input name=timeZone value="${escapeHtml(schedule?.timeZone ?? "UTC")}"> ` +
      `<button>Schedule</button></form>`,
  );
}

function dailyNoteSchedule(context: HandlerContext): HttpResponse {
  if (!context.request?.auth?.isAuthenticated) {
    return ResponseBuilder.error(401, "Sign in first");
  }
  const form = context.request.form ?? {};
  const match = /^(\d{1,2}):(\d{2})$/.exec(form.time ?? "");
  if (!match) return ResponseBuilder.error(400, "time must be HH:MM");
  try {
    // Saying it again under the same key replaces it.
    personalTasks.schedule({
      key: KEY,
      handler: "writeDailyNote",
      cron: `${Number(match[2])} ${Number(match[1])} * * *`,
      timeZone: form.timeZone || "UTC",
    });
  } catch (e) {
    return ResponseBuilder.error(400, e instanceof Error ? e.message : "");
  }
  return ResponseBuilder.redirect("/daily-note", 303);
}

// The scheduled run: a task acting as the person, with no request.
function writeDailyNote(context: HandlerContext): void {
  const slot = context.meta?.schedule?.scheduledFor ?? new Date().toISOString();
  const day = Math.floor(Date.parse(slot) / 86_400_000);
  let note = `${slot.slice(0, 10)}: ${LINES[day % LINES.length]}`;

  // Nobody else will say the permission is about to lapse.
  const expiresAt = personalTasks.authorization().expiresAt;
  if (expiresAt && Date.parse(expiresAt) - Date.now() < 7 * 86_400_000) {
    note += ` Your permission ends ${expiresAt.slice(0, 10)}; renew it.`;
  }
  personalStorage.setItem("note", note);
}

function init(): void {
  routeRegistry.registerRoute("/daily-note", { handler: "dailyNotePage" });
  routeRegistry.registerRoute("/daily-note", {
    handler: "dailyNoteSchedule",
    method: "POST",
  });
}
