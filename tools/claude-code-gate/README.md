# Approval gate for Claude Code

Approve what Claude Code wants to do from your Decision Queue, wherever you
are, instead of at the terminal.

When Claude Code would ask for permission (to run a command, edit a file,
call a tool), this hook posts a card to your queue: the command, or the edit
as a diff, with what Claude said just before asking. You answer **Allow**, or
**Deny** with a note for Claude ("run the tests first"), and Claude carries
on. Ask on the card ("What does this do?") is answered from the request.

With no answer before the timeout (5 minutes), the card is withdrawn and
Claude Code asks in the terminal as usual. Nothing is ever allowed without an
answer.

It is an agent outside the engine: one file, Node 18 or later, no
dependencies. It calls the queue's agent API (`POST /api/cards`,
`GET /api/events`, `DELETE /api/cards/:id`) with a connection token.

## Set it up

1. **Connect it.** On your queue's Agents page, under _Connect your own
   agent_, name it "Claude Code" and press Connect. Leave the webhook empty.
   Copy the token, which is shown once, then press Authorise on the same
   page: the engine links the token to you, so the queue knows whose it is.
2. **Store the token** where only you can read it:

   ```sh
   mkdir -p ~/.config/decision-queue
   (umask 077; pbpaste > ~/.config/decision-queue/token)
   ```

   Or set `DQ_TOKEN` in the environment Claude Code runs in.

3. **Add the hook** to `~/.claude/settings.json` (every project) or a
   project's `.claude/settings.json`, with the path to `gate.mjs`:

   ```json
   {
     "hooks": {
       "PermissionRequest": [
         {
           "matcher": "*",
           "hooks": [
             {
               "type": "command",
               "command": "node /path/to/gate.mjs",
               "timeout": 330
             }
           ]
         }
       ]
     }
   }
   ```

   Keep `timeout` (seconds) longer than the gate's own wait, so the gate
   withdraws its card before Claude Code stops it. `"matcher": "Bash"` gates
   only commands.

## Use it

- **Away from the terminal**: the card arrives at the top of your queue as
  _must act_. Answer it there, or from an assistant connected to the queue.
- **At the terminal**: start Claude Code with `DQ_GATE=off` to be asked
  there, without posting anything.
- **Muted** in the queue, it posts nothing and the terminal asks.

| Setting           | Default                          | Meaning                       |
| ----------------- | -------------------------------- | ----------------------------- |
| `DQ_URL`          | `https://decisionqueue.com`      | Your queue                    |
| `DQ_TOKEN`        | `~/.config/decision-queue/token` | The connection token          |
| `DQ_GATE_TIMEOUT` | `300`                            | Seconds to wait for an answer |
| `DQ_GATE`         | on                               | `off` asks in the terminal    |

## What it sends

The card holds the tool's name and input (the command, or the file's text
before and after the edit), the project's directory name, and Claude's last
message before asking, so you can judge the request and ask about it. It
goes to your own queue only. Revoking the connection on the Agents page stops
the token at once.

## Tests

```sh
node --test tools/claude-code-gate/gate.test.mjs
```

The tests run the hook against a stub of the queue on a local port.
