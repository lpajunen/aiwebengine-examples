/**
 * Tests for the document writer's rules: applying the model's edits, the
 * cards, and what each answer in an agent inbox does to a document,
 * including undoing an answer the person corrects.
 */

import {
  APPROVE,
  CHANGES,
  DONE,
  MAX_ATTEMPTS,
  MAX_TEXT,
  OTHER,
  REJECT,
  applyEdits,
  cleanSteps,
  docOfCard,
  failed,
  isDocId,
  newDoc,
  newDocId,
  onEvent,
  personEdit,
  readNewDoc,
  remember,
  requestChange,
  resume,
  written,
  type Doc,
  type Proposal,
} from "./rules.ts";

const NOW = "2026-11-10T12:00:00.000Z";
const LATER = "2026-11-10T12:05:00.000Z";
const ID = "dmh8x2k1a0b2";

function doc(): Doc {
  return newDoc(ID, "Q3 memo", "For the board, one page.", NOW);
}

function proposal(extra?: Partial<Proposal>): Proposal {
  return {
    summary: "Write a first draft",
    why: "A draft from the brief.",
    edits: [{ find: "", replace: "# Q3 memo\n\nRevenue grew." }],
    nextSteps: [
      { label: "Add a summary", instruction: "Add a one-line summary." },
      { label: "Shorten", instruction: "Cut it to half a page." },
    ],
    ...extra,
  };
}

/** A document whose first draft waits in the inbox as a revision card. */
function proposed(): { d: Doc; card: string } {
  const d = doc();
  written(d, "", "# Q3 memo\n\nRevenue grew.", proposal(), NOW);
  return { d, card: d.open?.externalId ?? "" };
}

function answer(externalId: string, optionId: string, instruction?: string) {
  return { type: "decided", externalId, optionId, instruction };
}

describe("ids and new documents", () => {
  test("a document id is recognised and found in a card's externalId", () => {
    const id = newDocId(Date.UTC(2026, 10, 10), 0.5);
    expect(isDocId(id)).toBe(true);
    expect(docOfCard(`rev:${id}:3`)).toBe(id);
    expect(docOfCard("welcome")).toBe(null);
    expect(docOfCard("rev:../x:1")).toBe(null);
  });

  test("the first line is the title and the rest the brief", () => {
    expect(readNewDoc("Q3 memo\r\nFor the board.\nOne page.")).toEqual({
      title: "Q3 memo",
      brief: "For the board.\nOne page.",
    });
    expect(() => readNewDoc("\nNo title")).toThrow("title first");
  });

  test("a new document waits for its first draft", () => {
    const d = doc();
    expect(d.head).toBe(0);
    expect(d.pending?.instruction).toContain("first draft");
    expect(d.open).toBe(null);
  });
});

describe("applyEdits", () => {
  test("an empty document takes the whole draft", () => {
    expect(applyEdits("", [{ find: "", replace: "Draft." }])).toEqual({
      text: "Draft.",
    });
  });

  test("replaces text found once, in order, and appends with an empty find", () => {
    const got = applyEdits("One.\n\nTwo.", [
      { find: "One.", replace: "First." },
      { find: "First.", replace: "Uno." },
      { find: "", replace: "Three." },
    ]);
    expect(got).toEqual({ text: "Uno.\n\nTwo.\n\nThree." });
  });

  test("refuses text that is missing, repeated, unchanged or too long", () => {
    expect(applyEdits("One.", [{ find: "Two", replace: "x" }])).toEqual({
      error: "Edit 1: the text it replaces is not there",
    });
    expect(applyEdits("a a", [{ find: "a", replace: "b" }])).toEqual({
      error: "Edit 1: the text it replaces appears more than once",
    });
    expect(applyEdits("a", [{ find: "a", replace: "a" }])).toEqual({
      error: "The edits change nothing",
    });
    expect(applyEdits("a", [])).toEqual({ error: "No edits" });
    const long = applyEdits("", [
      { find: "", replace: "x".repeat(MAX_TEXT + 1) },
    ]);
    expect("error" in long).toBe(true);
  });

  test("steps are cut to three with labels that fit an option", () => {
    const got = cleanSteps([
      { label: "A".repeat(60), instruction: "a" },
      { label: "B", instruction: "b" },
      { label: "", instruction: "skipped" },
      { label: "C", instruction: "c" },
      { label: "D", instruction: "d" },
    ]);
    expect(got.length).toBe(3);
    expect(got[0].label.length).toBe(40);
    expect(cleanSteps("nonsense")).toEqual([]);
  });
});

describe("a change written", () => {
  test("posts a revision card with the diff, bound to the revision it was made on", () => {
    const d = doc();
    const out = written(d, "", "# Q3 memo\n\nRevenue grew.", proposal(), NOW);
    const card = out.post[0] as Record<string, any>;
    expect(card.externalId).toBe(`rev:${ID}:1`);
    expect(card.topic).toBe(`doc:${ID}`);
    expect(card.boundTo).toEqual({ label: "Revision", value: "r1 on r0" });
    expect(card.body).toEqual({
      kind: "diff",
      before: "",
      after: "# Q3 memo\n\nRevenue grew.",
      beforeLabel: "Empty",
      afterLabel: "r1 (proposed)",
    });
    expect(card.options.map((o: { id: string }) => o.id)).toEqual([
      APPROVE,
      CHANGES,
      REJECT,
    ]);
    expect(d.pending).toBe(null);
    expect(d.open?.kind).toBe("revision");
  });

  test("a failed try is tried again, then the person hears why", () => {
    const d = doc();
    let out = failed(d, "Edit 1: the text it replaces is not there", "", NOW);
    expect(out.write).toBe(true);
    expect(d.pending?.attempts).toBe(1);
    expect(d.pending?.lastError).toContain("not there");
    for (let i = 1; i < MAX_ATTEMPTS; i++) out = failed(d, "timeout", "", NOW);
    expect(out.write).toBe(false);
    expect(d.pending).toBe(null);
    expect(d.open?.kind).toBe("steps");
    expect((out.post[0] as { summary: string }).summary).toContain(
      "could not make that change",
    );
  });
});

describe("answers on a revision card", () => {
  test("Approve keeps the revision and offers the model's next steps", () => {
    const { d, card } = proposed();
    const out = onEvent(d, answer(card, APPROVE), LATER, "");
    expect([out.addRevision?.n, out.addRevision?.by]).toEqual([1, "agent"]);
    expect(d.head).toBe(1);
    const steps = out.post[0] as Record<string, any>;
    expect(steps.externalId).toBe(`steps:${ID}:2`);
    expect(steps.body).toEqual({
      kind: "markdown",
      text: "# Q3 memo\n\nRevenue grew.",
    });
    expect(steps.options.map((o: { label: string }) => o.label)).toEqual([
      "Add a summary",
      "Shorten",
      "Something else…",
      "Done for now",
    ]);
  });

  test("Approve on a document that moved on asks for the change afresh", () => {
    const { d, card } = proposed();
    // A revision kept since the card was posted on r0.
    d.head = 1;
    const out = onEvent(d, answer(card, APPROVE), LATER, "My own start.");
    expect(out.addRevision).toBe(undefined);
    expect(out.write).toBe(true);
    expect(d.pending?.instruction).toContain("first draft");
  });

  test("Request changes asks again with the feedback and the proposal", () => {
    const { d, card } = proposed();
    const out = onEvent(d, answer(card, CHANGES, "Shorter, please"), LATER, "");
    expect(out.write).toBe(true);
    expect(out.note).toContain("Shorter, please");
    expect(d.pending?.feedback).toBe("Shorter, please");
    expect(d.pending?.previous?.text).toBe("# Q3 memo\n\nRevenue grew.");
    expect(d.open).toBe(null);
  });

  test("Reject keeps the document and remembers why", () => {
    const { d, card } = proposed();
    const out = onEvent(d, answer(card, REJECT, "Too formal"), LATER, "");
    expect(out.addRevision).toBe(undefined);
    expect(out.note).toBe('Rejected "Write a first draft": Too formal');
    expect(d.head).toBe(0);
    expect(d.open?.kind).toBe("steps");
  });

  test("expiry closes the card without a signal", () => {
    const { d, card } = proposed();
    const out = onEvent(d, { type: "expired", externalId: card }, LATER, "");
    expect(out.post).toEqual([]);
    expect(d.open).toBe(null);
  });

  test("questions, opening and an unknown option change nothing", () => {
    const { d, card } = proposed();
    onEvent(d, { type: "asked", externalId: card }, LATER, "");
    onEvent(d, answer(card, "nonsense"), LATER, "");
    expect(d.open?.externalId).toBe(card);
  });
});

describe("answers on a next-steps card", () => {
  function steps(): { d: Doc; card: string } {
    const { d, card } = proposed();
    onEvent(d, answer(card, APPROVE), LATER, "");
    return { d, card: d.open?.externalId ?? "" };
  }

  test("a step becomes the next change, with what the person added", () => {
    const { d, card } = steps();
    const out = onEvent(
      d,
      answer(card, "step2", "keep the numbers"),
      LATER,
      "x",
    );
    expect(out.write).toBe(true);
    expect(d.pending?.instruction).toBe(
      "Cut it to half a page.\n\nThe person adds: keep the numbers",
    );
  });

  test("Something else takes the person's words, and asks for them if empty", () => {
    const { d, card } = steps();
    onEvent(d, answer(card, OTHER, "Add a risks section"), LATER, "x");
    expect(d.pending?.instruction).toBe("Add a risks section");

    const again = steps();
    const out = onEvent(again.d, answer(again.card, OTHER, ""), LATER, "x");
    expect(out.write).toBe(false);
    expect((out.post[0] as { summary: string }).summary).toContain(
      "Something else",
    );
  });

  test("Done for now leaves the document idle until resumed", () => {
    const { d, card } = steps();
    onEvent(d, answer(card, DONE), LATER, "x");
    expect(d.open).toBe(null);
    expect(d.pending).toBe(null);
    const out = resume(d, "x", LATER);
    expect(d.open?.kind).toBe("steps");
    expect(out.post.length).toBe(1);
  });
});

describe("a corrected answer", () => {
  test("clearing an approval drops the revision and withdraws the next steps", () => {
    const { d, card } = proposed();
    onEvent(d, answer(card, APPROVE), LATER, "");
    const followed = d.open?.externalId as string;
    const out = onEvent(d, { type: "cleared", externalId: card }, LATER, "x");
    expect(out.withdraw).toEqual([followed]);
    expect(out.dropAbove).toBe(0);
    expect(d.head).toBe(0);
    expect(d.open?.externalId).toBe(card);
  });

  test("changing an approval to a rejection undoes it, then rejects", () => {
    const { d, card } = proposed();
    onEvent(d, answer(card, APPROVE), LATER, "");
    const out = onEvent(
      d,
      { type: "changed", externalId: card, optionId: REJECT },
      LATER,
      "",
    );
    expect(out.dropAbove).toBe(0);
    expect(d.head).toBe(0);
    expect(out.note).toContain("Rejected");
    expect(d.open?.kind).toBe("steps");
  });

  test("clearing a step before it is written cancels the work", () => {
    const { d, card } = proposed();
    onEvent(d, answer(card, APPROVE), LATER, "");
    const stepsCard = d.open?.externalId as string;
    onEvent(d, answer(stepsCard, "step1"), LATER, "x");
    expect(d.pending).not.toBe(null);
    onEvent(d, { type: "cleared", externalId: stepsCard }, LATER, "x");
    expect(d.pending).toBe(null);
    expect(d.open?.externalId).toBe(stepsCard);
  });

  test("an answer the person acted on since is not undone", () => {
    const { d, card } = proposed();
    onEvent(d, answer(card, APPROVE), LATER, "");
    const stepsCard = d.open?.externalId as string;
    onEvent(d, answer(stepsCard, "step1"), LATER, "x");
    const out = onEvent(d, { type: "cleared", externalId: card }, LATER, "x");
    expect(out.withdraw).toEqual([]);
    expect(d.head).toBe(1);
  });
});

describe("the page", () => {
  test("a wish while a change waits replaces it with one that includes the wish", () => {
    const { d, card } = proposed();
    const out = requestChange(d, "Mention the hiring freeze", LATER);
    expect(out.withdraw).toEqual([card]);
    expect(d.pending?.feedback).toBe("Mention the hiring freeze");
    expect(d.pending?.instruction).toContain("first draft");
    expect(() => requestChange(d, "  ", LATER)).toThrow("what to change");
  });

  test("the person's own edit is a revision, and a waiting change is made afresh", () => {
    const { d, card } = proposed();
    const out = personEdit(d, "My text.", "", LATER);
    expect([out.addRevision?.n, out.addRevision?.by]).toEqual([1, "person"]);
    expect(out.withdraw).toEqual([card]);
    expect(out.write).toBe(true);
    expect(personEdit(d, "My text.", "My text.", LATER).addRevision).toBe(
      undefined,
    );
  });

  test("notes keep the newest", () => {
    let notes: string[] = [];
    for (let i = 0; i < 30; i++) notes = remember(notes, `n${i}`);
    expect(notes.length).toBe(20);
    expect(notes[19]).toBe("n29");
  });
});
