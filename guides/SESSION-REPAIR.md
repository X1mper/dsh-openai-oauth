# Repairing history written before 0.5.1

Version 0.5.1 fixes optional image/search/fetch usage diagnostics that were accidentally written as mandatory, unknown session events. New records use the host's `appendPluginRecord` API and are marked `ignorable`. Hosts without that API omit these optional records.

Updating prevents new broken records; it does not rewrite existing history. If opening an old conversation reports `image/codex-llm-request`, `web/codex-search-llm-request`, or `web/codex-fetch-llm-request`, use the included repair script. It requires Python 3, zstd and a POSIX system.

1. Install 0.5.1 and stop Harness before repairing its logs.
2. From the extracted release package or repository, preview the changes:

   ```sh
   python3 scripts/repair-session-records.py --root "$HOME/.dsh/sessions"
   ```

3. Apply with backups:

   ```sh
   python3 scripts/repair-session-records.py --root "$HOME/.dsh/sessions" --apply
   ```

4. Restart Harness and reopen the conversation.

The script prints backup paths and skips locked sessions. It changes only the three affected diagnostic types and their `ignorable` flag; messages, usage payloads, sequence numbers and timestamps remain intact. Other event lines remain byte-identical. Backups default to a timestamped directory under `~/.dsh/install-backups`; use `--backup-dir PATH` to choose a different directory. Keep backups until history has been verified. Other unknown event types are deliberately left untouched.
