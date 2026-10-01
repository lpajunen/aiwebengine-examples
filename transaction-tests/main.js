/// <reference path="../types/aiwebengine.d.ts" />

// Checks for database.transaction(fn), one route each. Every route answers
// `{ test, passed, detail }` with 200 when the check held and 500 when not.

function init() {
  database.ensureTable("txtest_rows", {
    columns: [{ name: "label", type: "text" }],
  });

  for (const [path, handler] of [
    ["/test/transaction-commit", "testCommit"],
    ["/test/transaction-rollback", "testRollback"],
    ["/test/transaction-savepoint", "testSavepoint"],
    ["/test/transaction-timeout", "testTimeout"],
    ["/test/transaction-nested", "testNested"],
  ]) {
    routeRegistry.registerRoute(path, { handler, method: "GET" });
  }
}

/**
 * @param {string} test
 * @param {boolean} passed
 * @param {unknown} detail
 * @returns {HttpResponse}
 */
function verdict(test, passed, detail) {
  return {
    status: passed ? 200 : 500,
    body: JSON.stringify({ test, passed, detail }),
    contentType: "application/json",
  };
}

/**
 * A label unique to this request, so concurrent runs do not see each other.
 * @param {string} prefix
 */
function freshLabel(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
}

/** @param {string} label */
function stored(label) {
  return database.query("txtest_rows", { where: { label } }).length;
}

/**
 * The body's writes are kept when it returns, and its value is the answer.
 * @param {HandlerContext} context
 */
function testCommit(context) {
  const label = freshLabel("commit");
  const answer = database.transaction(() => {
    database.insert("txtest_rows", { label });
    return "returned";
  });
  return verdict("testCommit", answer === "returned" && stored(label) === 1, {
    answer,
    rows: stored(label),
  });
}

/**
 * The body's writes are undone when it throws, and the error reaches the
 * caller.
 * @param {HandlerContext} context
 */
function testRollback(context) {
  const label = freshLabel("rollback");
  let thrown = null;
  try {
    database.transaction(() => {
      database.insert("txtest_rows", { label });
      throw new Error("deliberate");
    });
  } catch (error) {
    thrown = /** @type {Error} */ (error).message;
  }
  return verdict(
    "testRollback",
    thrown === "deliberate" && stored(label) === 0,
    { thrown, rows: stored(label) },
  );
}

/**
 * A nested transaction is a savepoint: its failure undoes its own write and
 * leaves the outer one's.
 * @param {HandlerContext} context
 */
function testSavepoint(context) {
  const outer = freshLabel("outer");
  const inner = freshLabel("inner");
  database.transaction(() => {
    database.insert("txtest_rows", { label: outer });
    try {
      database.transaction(() => {
        database.insert("txtest_rows", { label: inner });
        throw new Error("inner only");
      });
    } catch (error) {
      // the outer transaction carries on
    }
  });
  return verdict("testSavepoint", stored(outer) === 1 && stored(inner) === 0, {
    outer: stored(outer),
    inner: stored(inner),
  });
}

/**
 * A transaction that outlives its budget is refused rather than committed.
 * @param {HandlerContext} context
 */
function testTimeout(context) {
  const label = freshLabel("timeout");
  let thrown = null;
  try {
    database.transaction(
      () => {
        const start = Date.now();
        while (Date.now() - start < 200) {
          // outlast the 100ms budget
        }
        database.insert("txtest_rows", { label });
      },
      { timeoutMs: 100 },
    );
  } catch (error) {
    thrown = /** @type {Error} */ (error).message;
  }
  return verdict(
    "testTimeout",
    thrown !== null && /timeout|timed out/i.test(thrown) && stored(label) === 0,
    { thrown, rows: stored(label) },
  );
}

/**
 * Two levels down and back: what each level keeps.
 * @param {HandlerContext} context
 */
function testNested(context) {
  const labels = {
    outer: freshLabel("l0"),
    kept: freshLabel("l1-kept"),
    lost: freshLabel("l1-lost"),
    deep: freshLabel("l2"),
  };
  database.transaction(() => {
    database.insert("txtest_rows", { label: labels.outer });
    database.transaction(() => {
      database.insert("txtest_rows", { label: labels.kept });
      database.transaction(() => {
        database.insert("txtest_rows", { label: labels.deep });
      });
    });
    try {
      database.transaction(() => {
        database.insert("txtest_rows", { label: labels.lost });
        throw new Error("this level only");
      });
    } catch (error) {
      // as above
    }
  });
  const counts = Object.fromEntries(
    Object.entries(labels).map(([key, label]) => [key, stored(label)]),
  );
  return verdict(
    "testNested",
    counts.outer === 1 &&
      counts.kept === 1 &&
      counts.deep === 1 &&
      counts.lost === 0,
    counts,
  );
}
