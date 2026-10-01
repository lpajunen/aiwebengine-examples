/// <reference path="../types/aiwebengine.d.ts" />

// Example: database transactions.
//
// `database.transaction(fn)` commits what `fn` did when it returns and rolls
// it back when it throws. Inside another transaction it is a savepoint, so an
// inner failure undoes only the inner work. A read whose value decides a later
// write takes `forUpdate`, or two concurrent callers can both act on what
// they read.

function init() {
  database.ensureTable("txdemo_accounts", {
    columns: [
      { name: "owner", type: "text" },
      { name: "balance", type: "integer", nullable: false, default: "0" },
    ],
    uniqueIndexes: [["owner"]],
  });
  database.ensureTable("txdemo_items", {
    columns: [
      { name: "item_id", type: "text" },
      { name: "quantity", type: "integer" },
    ],
  });

  routeRegistry.registerRoute("/transaction-demo/transfer", {
    handler: "handleTransfer",
    method: "POST",
  });
  routeRegistry.registerRoute("/transaction-demo/batch", {
    handler: "handleBatch",
    method: "POST",
  });
  routeRegistry.registerRoute("/transaction-demo/nested", {
    handler: "handleNested",
    method: "POST",
  });
}

/**
 * Example 1: a transfer. Both balances change, or neither does.
 *
 * The two reads are `forUpdate`: without it, two transfers out of one account
 * could each read the same balance, each decide there is enough, and each
 * commit.
 * @param {HandlerContext} context
 * @returns {HttpResponse}
 */
function handleTransfer(context) {
  const { fromAccount, toAccount, amount } = JSON.parse(
    context.request?.body || "{}",
  );

  try {
    const balances = database.transaction(
      () => {
        const [source] = database.query("txdemo_accounts", {
          where: { owner: fromAccount },
          forUpdate: true,
        });
        const [target] = database.query("txdemo_accounts", {
          where: { owner: toAccount },
          forUpdate: true,
        });
        if (!source || !target) throw new Error("no such account");
        if (source.balance < amount) throw new Error("insufficient funds");

        const from = database.update("txdemo_accounts", source.id, {
          balance: source.balance - amount,
        });
        const to = database.update("txdemo_accounts", target.id, {
          balance: target.balance + amount,
        });
        return { from: from.balance, to: to.balance };
      },
      { timeoutMs: 5000 },
    );
    return ResponseBuilder.json({ success: true, balances });
  } catch (error) {
    // Thrown inside the transaction, so nothing it wrote was kept.
    return ResponseBuilder.error(400, /** @type {Error} */ (error).message);
  }
}

/**
 * Example 2: a batch where one bad item does not cost the others.
 *
 * Each item is its own nested transaction — a savepoint inside the batch's —
 * so an item that fails is undone on its own and the batch commits the rest.
 * @param {HandlerContext} context
 * @returns {HttpResponse}
 */
function handleBatch(context) {
  const { items } = JSON.parse(context.request?.body || "{}");
  if (!Array.isArray(items)) {
    return ResponseBuilder.error(400, "items must be an array");
  }

  const results = database.transaction(
    () =>
      items.map((item, i) => {
        try {
          database.transaction(() => {
            if (!(item.quantity > 0))
              throw new Error("quantity must be positive");
            database.insert("txdemo_items", {
              item_id: String(item.id ?? i),
              quantity: item.quantity,
            });
          });
          return { item: item.id ?? i, status: "stored" };
        } catch (error) {
          return {
            item: item.id ?? i,
            status: "skipped",
            error: /** @type {Error} */ (error).message,
          };
        }
      }),
    { timeoutMs: 30000 },
  );

  return ResponseBuilder.json({ results });
}

/**
 * Example 3: nesting, step by step.
 *
 * The outer write survives the inner failure, and the second inner
 * transaction commits with the outer one.
 * @param {HandlerContext} context
 * @returns {HttpResponse}
 */
function handleNested(context) {
  /** @type {string[]} */
  const log = [];
  database.transaction(() => {
    database.insert("txdemo_items", { item_id: "outer", quantity: 1 });
    log.push("outer: wrote 'outer'");

    try {
      database.transaction(() => {
        database.insert("txdemo_items", { item_id: "inner-a", quantity: 1 });
        throw new Error("inner-a changed its mind");
      });
    } catch (error) {
      log.push("inner-a: rolled back, outer unaffected");
    }

    database.transaction(() => {
      database.insert("txdemo_items", { item_id: "inner-b", quantity: 1 });
    });
    log.push("inner-b: kept, commits with outer");
  });

  const stored = database
    .query("txdemo_items", { where: { quantity: 1 } })
    .map((row) => row.item_id);
  return ResponseBuilder.json({ log, stored });
}
