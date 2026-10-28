# gradi: project notes for Claude

Personal UTS grade tracker for one user (Ken). Ken is not a developer: explain choices in plain words, keep replies short, keep changes small, and always run tests before pushing.
This file is the source of truth for rules, milestones, the bug list and future ideas. Update the status after each piece of work.

## Workflow rules (Ken's)
- Never start building until Ken says "build". Until then, plan, prototype and ask.
- Every UI change: show a prototype in chat first, offer 2-3 labeled alternatives, ask for a preference, wait for "UI locked", then wait for "build" before pushing. Don't push small UI tweaks or design code without confirming.
- Before every build, say which model and effort to use (e.g. Sonnet medium for look and layout, Opus high for grade maths and synced data) and wait for Ken to confirm.
- "Fix now" without asking is for logic or code bugs only (wrong numbers, unreadable text, unclickable buttons). Cosmetic changes go on the visual bug list below and ship in a batch.
- When Ken reports visual bugs, add them to the bug list unless he says fix now. "Note it, don't build yet" means exactly that.
- Small milestones, tested before pushing; show what changed in a few lines. Point out UX problems proactively.
- American spelling, metric units. Use subject abbreviations when talking to Ken, not codes.

## Stack
- React + Vite static PWA, live on GitHub Pages at https://mfjiae.github.io/gradi/ (base `/gradi/`). Every push to `main` runs tests and redeploys.
- IndexedDB via Dexie (`src/lib/db.js`) is each device's copy. No server.
- Tests: Vitest (`npm test`). Lint: `npm run lint` (oxlint).
- Reference app: moni (repo mfjiae/moni) for look, structure, backup and sync.

## Hard rules
- PUBLIC repo. Never commit real grades, backups or seed files. `.gitignore` is an allowlist and also blocks `*backup*.json`, `*seed*.json`, `*grades*.json`. Tests and samples use fake subjects (SAMPLE_A...).
- Real grades come from Ken's screenshots; transcribe them for Ken to check before they go anywhere. They live on his PC (`D:\Documents\Claude\Handoffs\28-10-2026_gradi-grades-transcription.md`), and reach the app through Settings → Restore from file.
- Claude has no access to gradi-data and shouldn't need it.
- Every record has a stable `uid` and `updatedAt`. Every write goes through `src/lib/store.js`, which stamps `updatedAt` and calls `requestSync()` (a no-op until M3). Deletes leave a delete mark (tombstone).
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
- Snapshot (backup now, sync later) = `{ version, subjects, tombstones, current }` (`src/lib/merge.js`).
- Backup file: `{ app: 'gradi', backupVersion: 1, savedAt, snapshot }`, named `gradi-backup-YYYY-MM-DD.json` (Sydney date).
  Restore Merge = adds what's missing (even subjects deleted here earlier), newest edit wins, never deletes. Replace = device matches the file exactly (delete marks for the rest).

## Code map
- `src/lib/grades.js` grade maths · `edit.js` pure subject edits · `store.js` database actions · `db.js` Dexie schema · `merge.js` snapshot merge · `backup.js` backup/restore · `sample.js` fake sample subjects · `display.js` Need labels
- `src/components/`: `Home.jsx` (Layout A v6), `Subjects.jsx`, `SubjectPage.jsx` (current = Marks | What do I need? + What if; official = S2: breakdown | Official result), `SubjectForm.jsx` (Add subject / Edit details), `Settings.jsx`, `ui.jsx`, `hooks.js`
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
- [x] M2.1 (28 Oct 2026): year picker (Settings stepper ◀ year ▾ ▶ and the Add/Edit subject dropdown; years run 2025 to the current Sydney calendar year automatically, plus any year a saved subject uses) and the Grade bands card as an aligned table (Grade | Marks | Grade points).
- [ ] M3: Sync to private `mfjiae/gradi-data` (adapt moni's sync.js / merge.js / github.js): fine-grained token on each device, newest edit wins, delete marks, refuses a public data repo. Settings sync section.
- [ ] Seed: Ken's real grades as a backup file made on his PC (never in this repo), loaded with Restore from file.
- [ ] M4 extras (open decisions, ask Ken): unequal part weights, drop-lowest / best N of M (M1 skills tests), bonus marks, deadlines, GPA trend chart.

## Beyond the prototype in M1 (tell Ken; change if he wants)
- "Edit details" button on the subject page opens the Add subject form prefilled, plus Official result (grade + optional mark). The prototype had no way to edit a subject or record its result.
- Backup card: Download backup / Restore from file (Merge or Replace) / Load sample subjects (only when empty) / Clear everything, replacing the prototype's JSON text box.

## Next update (noted, not built)
- M3 sync "like moni": same behavior as moni (private repo gradi-data, file `gradi.json`, token on each device; syncs automatically a moment after each edit, when the app is opened or comes back to the front, and when the phone goes back online; plus a manual Sync now button and a status line in Settings). Opus high. Needs "build".
- Grade bands table (Settings): make it symmetric. The Marks column is centered under its header, with Grade on the left and Grade points on the right, instead of sitting skewed off-center. Small UI change: show a prototype and wait for "UI locked" and "build" (can ship with M3 or alone).

## Visual bug list (cosmetic, ships in a batch)
- Phone: long part names (e.g. "Quiz 2") get cut off in the marks editor because the score boxes take the width.
- Phone: ladder scale labels "C 65 D 75 HD 85" crowd together.
- Phone, empty Home (no subjects yet, Ken's screenshot 28 Oct): the three stat cards show big "—" that look like colored bars, and the "0 credit points gained · 0 subjects now" pill crowds the session title. Consider an empty-state hint instead.
- Year box in Settings was too narrow for "2026" (fixed in M1, unreadable text).
- Phone tab bar "Add" label was dark on dark (fixed in M1, unreadable text).

## Future ideas
- Deadlines per assessment; GPA trend chart across sessions.
