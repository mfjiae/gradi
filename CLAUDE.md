# gradi: project notes for Claude

Personal UTS grade tracker for one user (Ken). Ken is not a developer: explain choices in plain words, keep replies short, keep changes small, and always run tests before pushing.
This file is the source of truth for rules, milestones, the bug list and future ideas. Update the status after each piece of work.

## Workflow rules (Ken's)
- Never start building until Ken says "build". Until then, plan, prototype and ask.
- Every UI change: show a prototype in chat first, offer 2-3 labeled alternatives, ask for a preference, wait for "UI locked", then wait for "build" before pushing. Don't push small UI tweaks or design code without confirming.
- Before every build, say which model and effort to use and wait for Ken to confirm. Pick the cheapest pair that still gives no bugs: Sonnet low/medium for look, layout and doc edits; Sonnet high or Opus medium for code that writes saved data (parsers, importers); Opus high only for grade maths or sync changes. Give one line of why. Re-state it whenever the task changes.
- "Fix now" without asking is for logic or code bugs only (wrong numbers, unreadable text, unclickable buttons). Cosmetic changes go on the visual bug list below and ship in a batch.
- When Ken reports visual bugs, add them to the bug list unless he says fix now. "Note it, don't build yet" means exactly that.
- Prototypes show both phone and desktop, unless the change is for one device only.
- Batch small updates: when a small update (including bug-list items) is close in time or area to a bigger update, merge them into that one build instead of pushing separately. Say what was merged. UI changes still need their phone/desktop prototype and "UI locked" first.
- Small milestones, tested before pushing; show what changed in a few lines. Point out UX problems proactively.
- American spelling, metric units. Use subject abbreviations when talking to Ken, not codes.

## Stack
- React + Vite static PWA, live on GitHub Pages at https://mfjiae.github.io/gradi/ (base `/gradi/`). Every push to `main` runs tests and redeploys.
- IndexedDB via Dexie (`src/lib/db.js`) is each device's copy. No server.
- Tests: Vitest (`npm test`). Lint: `npm run lint` (oxlint).
- Reference app: moni (repo mfjiae/moni) for look, structure, backup and sync.

## Hard rules
- PUBLIC repo. Never commit real grades, backups or seed files. `.gitignore` is an allowlist and also blocks `*backup*.json`, `*seed*.json`, `*grades*.json`. Tests and samples use fake subjects (SAMPLE_A...).
- Real grades come from Ken's screenshots; transcribe them for Ken to check before they go anywhere. They live on his PC (`D:\Documents\Claude\Handoffs\28-10-2026_gradi-grades-transcription.md`), and reach the app through Settings → Import from text (or Restore from file).
- Claude has no access to gradi-data and shouldn't need it.
- Every record has a stable `uid` and `updatedAt`. Every write goes through `src/lib/store.js`, which stamps `updatedAt` and calls `requestSync()` (sync.js hooks in). Sync's own writes (`sync.js` writeLocal) go straight to the database so they don't trigger another sync. Deletes leave a delete mark (tombstone).
- Database changes (`db.js`): a table's key can never change in place (the upgrade fails and the app stays on "Loading…"). Drop the table in one version (`name: null`), re-create it in the next. Test an UPGRADE with seeded data before pushing a schema change.
- Dark theme only, no toggle. Color tokens live in `src/index.css`.

## Grade maths (`src/lib/grades.js`, tested in `__tests__/grades.test.js`). Confirm with Ken before changing.
- Bands use the whole-number mark: HD 85+ = 7, D 75-84 = 6, C 65-74 = 5, P 50-64 = 4, F below 50 = 0.
- GPA = grade points weighted by credit points (default 6). WAM = marks weighted by credit points.
- Official result (grade, optional mark) wins over components for that subject. "Pass, not graded" (PASS) has no grade points and is left out of GPA and WAM but its credit points count as gained.
- Per-subject switches `countsGpa` / `countsWam` (default on). A subject with no mark is never in WAM.
- Home: the main numbers are all sessions, official results only. "This session" figures (on-track GPA, WAM from averages so far) sit beneath.
- "GPA if every target is hit": official subjects at their grade, every other subject at its target's band, including subjects with no marks yet (M1 change from the prototype, which skipped those).
- Parts within a component are weighted by points (total scored / total available), like Canvas. Custom part weights are a later extra (`w`, null for now).
- Weights that don't add to 100% show a warning; marks are scaled to 100 meanwhile.
- A hurdle fails the subject (F) only once its component is fully marked below the hurdle; before that it shows "Below hurdle so far".
- Marks and weights are plain numbers; round only for display. Required marks round UP to one decimal so the target is actually met.
- Checked privately (script kept outside the repo) against Ken's official UTS record: overall GPA, WAM and credit points match, and so do the component totals of the subjects with full breakdowns.

## Data model
- Subject record: `{ uid, code, name, year, session, cp, target, components[], official, countsGpa, countsWam, updatedAt }`.
  Component: `{ id, name, weight, single, hurdle, items[] }`; part: `{ id, name, score, max, w }`.
- A subject syncs as ONE record: if the same subject is edited on two devices before they sync, the newer edit wins for the whole subject.
- `meta` table: `current` = current session `{ year, session, updatedAt }` (synced); `persistAsked` (this device only). First run guesses the session from the date (Feb-Jun Autumn, Jul-Nov Spring, Dec-Jan Summer).
- Snapshot (backup file and the synced gradi.json) = `{ version, subjects, tombstones, current }` (`src/lib/merge.js`).
- Backup file: `{ app: 'gradi', backupVersion: 1, savedAt, snapshot }`, named `gradi-backup-YYYY-MM-DD.json` (Sydney date).
  Restore Merge = adds what's missing (even subjects deleted here earlier), newest edit wins, never deletes. Replace = device matches the file exactly (delete marks for the rest).

## Code map
- `src/lib/grades.js` grade maths · `importText.js` import from text · `sync.js` + `github.js` sync with gradi-data · `edit.js` pure subject edits · `store.js` database actions · `db.js` Dexie schema · `merge.js` snapshot merge · `backup.js` backup/restore · `sample.js` fake sample subjects · `display.js` Need labels
- `src/components/`: `Home.jsx` (Layout A v6), `Subjects.jsx`, `SubjectPage.jsx` (current = Marks | What do I need? + What if; official = S2: breakdown | Official result), `SubjectForm.jsx` (Add subject / Edit details), `Settings.jsx`, `ImportCard.jsx`, `ui.jsx`, `hooks.js`
- `src/App.jsx`: shell, sidebar + phone tab bar, pages by address (`#/subjects`, `#/subject/<uid>`, `#/settings`) so the back button works.

## Design (locked from the prototypes, Layout A v6)
- Look of moni: dark only, IBM Plex Sans, teal accent #2EF2D4, tinted cards, desktop sidebar, phone bottom tab bar.
- Band colors: HD green, D teal, C blue, P purple, F red.
- Home: three stat cards (GPA all sessions, WAM all sessions, GPA if every target is hit; "this session ..." beneath each), then left column Subjects table + Past sessions (hidden by default, aligned table, session rows with GPA · WAM and total cp), right column "Where the marks are".
- Subjects page: This session / All sessions toggle, cards.
- Not used: the split Subject view (B).

## Milestones
- [x] M1 (28 Oct 2026): React + Vite app, local only. Tested grade maths, Dexie storage with uid/updatedAt/delete marks, screens from A v6, Settings (session picker, backup download/restore, sample subjects, clear everything, sync placeholder).
- [x] M2 (28 Oct 2026): PWA install (icons, manifest, offline via vite-plugin-pwa) + GitHub Pages deploy at https://mfjiae.github.io/gradi/ with a test-and-deploy GitHub Action (same as moni's; Pages source = GitHub Actions). Phone updates arrive on the next open after a deploy.
- [x] M2.1 (28 Oct 2026): year picker (Settings stepper ◀ year ▾ ▶ and the Add/Edit subject dropdown; years run 2025 to the current Sydney calendar year automatically, plus any year a saved subject uses) and the Grade bands card as an aligned table (Grade | Marks | Grade points), symmetric: Marks centered under its header, Grade left, Grade points right.
- [x] M3 (28 Oct 2026): sync like moni (`src/lib/sync.js`, `github.js`). File `gradi.json` in the private `mfjiae/gradi-data` repo; fine-grained token (Only gradi-data, Contents read/write) stored on each device only (meta row `sync`, never in backups or the synced file). Syncs 1.5 s after each edit, on open, when the app comes back to the screen, when back online, and with Sync now. Newest edit wins per subject, delete marks, current session newest wins, retries on a clash with another device, refuses a public repo. While sync is on: Load sample subjects is hidden (so fake data can't reach gradi-data) and Clear everything warns that it clears every synced device.
- [x] M4.0 (28 Oct 2026): Import from text (Settings card, layout A Compact; `src/lib/importText.js` parser + `planImport`, `store.importSubjects`, tested). Format: blank line between subjects; first line `CODE: Name | Autumn 2026 | 6cp | D 77` (name, cp (6 if left out), result `D 77`/`HD`/`PASS`, `target 85`, `no gpa`, `no wam` optional; `2026 Autumn` also works); assessment `Name | 25% | 5/5, 20/20 | hurdle 50` (one unnamed mark = single, several or named = parts, `-/100` = not marked, `Quiz 1=8/10`, no marks = single -/100); `#` lines ignored. Same code (any case, spaces ignored) + year + session = update: replaces the assessments (keeps them if only the first line is pasted), changes name/cp/target/result/switches only when given; identical = "No change", not written. Warnings (weights not 100%, score above max) still import; errors skip only that subject; a subject pasted twice imports once. Never deletes; clears an old delete mark. Merged phone fixes: part names wrap (B, narrower score boxes on phone), ladder band strip with letters + numbers underneath (A), quiet empty Home on phone and desktop (B: grey dash, "Needs a result/mark/subject", "No subjects yet", Add subject button; a grey dash also whenever a stat has no number), Add tab = 52 px round button in a notch (B).
- [ ] Seed: Ken's real grades, now easiest through Import from text (Claude writes the text from the transcription; never in this repo).
- [ ] M4 extras (open decisions, ask Ken): unequal part weights, drop-lowest / best N of M (M1 skills tests), bonus marks, deadlines, GPA trend chart.

## Beyond the prototype in M1 (tell Ken; change if he wants)
- "Edit details" button on the subject page opens the Add subject form prefilled, plus Official result (grade + optional mark). The prototype had no way to edit a subject or record its result.
- Backup card: Download backup / Restore from file (Merge or Replace) / Load sample subjects (only when empty) / Clear everything, replacing the prototype's JSON text box.

## Visual bug list (cosmetic, ships in a batch)
- Empty Home (phone and desktop): remove the "Add subject" button under the stat cards. Ken: the sidebar (desktop) and Add tab (phone) already have one. Added in M4.0, Ken asked to remove it right after.
- Settings layout, UI LOCKED A + B (28 Oct 2026, prototype "gradi Settings Layout Prototype"): desktop = two columns, left Current session + Backup, right Sync + Grade bands, Import from text full width below (no stretched empty space in Backup, Sync or Current session). Phone stays one column. Backup card also shows "On this device: N subjects" and "Last backup: <when>" (last backup date = device-only `meta` row set when Download backup is pressed; never in backups or the synced file; "never" until then). Ships with the Add subject removal above. Waiting for Ken's "build" (Sonnet medium).
- (The four phone items shipped in M4.0 on 28 Oct 2026.)

## Future ideas
- Deadlines per assessment; GPA trend chart across sessions.
