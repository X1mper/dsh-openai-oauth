# Parent-account delegation migration (review before installation)

This installable, public integration contains no profile prompts or credentials.
It uses the supported ConfigEditor service rather than writing the profile.
Its bundle only inserts the migration plugin, not new preset declarations.
The default mode is **dry-run**; nothing has been installed.

Install only through Harness plugin_manager install_bundle with this absolute
directory as target after parent review. The required dsh-openai-oauth/subagents
export must already be installed and loadable.

The runtime walks complete raw preset configs for standard and the pi role
presets, changes only stock spawn delegation with fixed openai-codex
agentOptions or the unpinned generic subagent, preserves model/effort,
removes fixed account selection, and leaves fork and other providers untouched.
There is one child-model catalog per composition. Persona text and all
unrelated declarations are preserved. ConfigEditor persists full configs with
its ordinary validation, locking, atomic write and Loader reconciliation.

For an explicit migration use mode: apply and an absolute backupPath under
private ignored artifacts. The backup includes private full preset configs:
never commit/publish it. New snapshots use lossless V8 structured encoding in a
JSON envelope, preserving undefined fields and Loader expression markers.
Legacy v1 JSON backups remain readable. Files are exclusive-create mode 0600
and written before edits. Existing backups are never replaced: safe resume
requires ALL current configs to match their saved before/after states.
Apply is idempotent. Rollback uses mode: rollback and the same
backupPath, refuses subsequent conflicting changes, and tolerates partial
apply (already-original configs). Multi-row edits are not transactional;
a failure requires reviewing logs and guarded rollback before retrying.

Installation only registers codex_apply_subagent_accounts; it never runs a migration.
Call that no-argument action explicitly after installation to execute the configured
mode outside the HMR activation chain. Timers inherit the activation AsyncLocalStorage
and cannot safely initiate ConfigEditor HMR transactions.
Optional reportPath writes a private JSON status (planned/complete/failed), with
only changed tool names/model/effort, never prompts.
The action returns sanitized status; installation success alone does not mean migration success.
Verify the final ConfigEditor/dump output and use a new parent session.

Important: ConfigEditor can edit **active** preset declaration entries only.
The disabled pi-workflow declaration is intentionally not activated or changed;
the pure transform supports it. A separate private generated bundle is prepared
under ignored artifacts/subagent-accounts-inactive. It overrides the full actual
declaration by id, retaining disabled:true. Install that bundle only after review;
it contains private role prompts and must never be tracked or published.
No disabled flag is changed. No package source/version or profile is edited here.

No forced restart: new preset revisions mount through normal Loader rules.
Existing sessions and their children retain their revision. Replacing an
already-loaded module package needs a host restart for its new JS generation;
installing a new bundle may apply live, subject to install results.

Validation: node integrations/subagent-accounts/validate.mjs and
node --test integrations/subagent-accounts/*.test.mjs.
Failure reports contain stage, preset/completed IDs, whitelisted error codes,
error class, message hash and package-relative stack locations, never raw errors.
Actual effective profile dry transform: standard 6 rows; pi-supersearcher 2;
pi-superworker 5; pi-pixel 3; pi-sugar-taster 2; pi-worker 5.
Inactive pi-workflow has 5 additional transformable rows.
