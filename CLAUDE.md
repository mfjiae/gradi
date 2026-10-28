# gradi: project notes for Claude

Personal UTS grade and study tracker for one user (Ken). Ken is not a developer: explain choices in plain words, keep replies short, keep changes small, and always run tests before pushing.
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
- Count the best N of M parts (component `best`, `keepBest` in grades.js; agreed 28 Oct 2026): marked parts ranked by percent (tie: earlier part). Nothing is dropped until more than N are marked; then the lowest marked parts are "Not counted" (still shown, greyed). While fewer than N are marked, the first unmarked parts fill the slots and other unmarked parts are "Optional". No rule when best is empty, >= the number of parts, or the component is a single mark. An official result still wins.
- Weights that don't add to 100% show a warning; marks are scaled to 100 meanwhile.
- A hurdle fails the subject (F) only once its component is fully marked below the hurdle; before that it shows "Below hurdle so far".
- Marks and weights are plain numbers; round only for display. Required marks round UP to one decimal so the target is actually met.
- Checked privately (script kept outside the repo) against Ken's official UTS record: overall GPA, WAM and credit points match, and so do the component totals of the subjects with full breakdowns.

## Data model
- Subject record: `{ uid, code, name, year, session, cp, target, components[], official, countsGpa, countsWam, updatedAt }`.
  Component: `{ id, name, weight, single, hurdle, best, items[] }` (best = count the best N parts, or null/absent); part: `{ id, name, score, max, w }`.
- A subject syncs as ONE record: if the same subject is edited on two devices before they sync, the newer edit wins for the whole subject.
- `meta` table: `current` = current session `{ year, session, updatedAt }` (synced); `persistAsked`, `sync` (token) and `lastBackup` `{ at }` (set by Download backup) are this device only. First run guesses the session from the date (Feb-Jun Autumn, Jul-Nov Spring, Dec-Jan Summer).
- Task record (M5, table `tasks`, key `uid`, index `subjectUid`): `{ uid, title, subjectUid, status ('open'|'progress'|'done'), important, due ('YYYY-MM-DD' Sydney date or null), time ('HH:MM' or null), repeat (null|'daily'|'weekly'|'fortnightly'|'monthly'), remind (null or days before), details, link (null or { cid, iid } = a part in the task's subject), order, doneAt, createdAt, updatedAt }`. Overdue is worked out, never stored. A task syncs as one record (newest edit wins); delete marks share the tombstones table.
- Linked tasks follow their subject (`linkedTaskChanges` in tasks.js, run by store.js on every subject save and import): a part getting its first mark ticks the task Done; renaming the part renames a task that still has the old name; removing the part drops the link. Deleting a subject deletes its tasks (with delete marks). Import keeps assessment and part ids when the names match, so links survive a re-paste.
- Snapshot (backup file and the synced gradi.json) = `{ version, subjects, tasks, tombstones, current }` (`src/lib/merge.js`). Older app versions ignore `tasks` (and keep delete marks), so a device that hasn't updated yet can't lose them.
- Backup file: `{ app: 'gradi', backupVersion: 1, savedAt, snapshot }`, named `gradi-backup-YYYY-MM-DD.json` (Sydney date).
  Restore Merge = adds what's missing (even subjects deleted here earlier), newest edit wins, never deletes. Replace = device matches the file exactly (delete marks for the rest).

## Code map
- `src/lib/grades.js` grade maths · `tasks.js` study task logic (dates, groups, repeats, countdowns, links) · `importText.js` import from text · `importTasks.js` import tasks from text · `sync.js` + `github.js` sync with gradi-data · `edit.js` pure subject edits · `store.js` database actions · `db.js` Dexie schema · `merge.js` snapshot merge · `backup.js` backup/restore · `sample.js` fake sample subjects · `display.js` Need labels
- `src/components/`: `Home.jsx` (Layout A v6), `Subjects.jsx`, `SubjectPage.jsx` (current = Marks | What do I need? + What if; official = S2: breakdown | Official result), `SubjectForm.jsx` (Add subject / Edit details), `Settings.jsx`, `ImportCard.jsx`, `Study.jsx` (Tasks list) + `Calendar.jsx`, `TaskForm.jsx` (New/Edit task pop-up), `ImportTasks.jsx` (Study → Import pop-up), `DuePrompt.jsx` (due dates after adding an assessment), `tasksUi.jsx` (task row, countdowns, Due soon), `ui.jsx`, `hooks.js`
- `src/App.jsx`: shell, sidebar + phone tab bar (Home, Subjects, Add, Study, Settings; Add makes a task on Study, a subject elsewhere), pages by address (`#/subjects`, `#/subject/<uid>`, `#/study`, `#/settings`) so the back button works. The task pop-up lives here.

## Design (locked from the prototypes, Layout A v6)
- Look of moni: dark only, IBM Plex Sans, teal accent #2EF2D4, tinted cards, desktop sidebar, phone bottom tab bar.
- Band colors: HD green, D teal, C blue, P purple, F red.
- Home: three stat cards (GPA all sessions, WAM all sessions, GPA if every target is hit; "this session ..." beneath each), then left column Subjects table + Past sessions (hidden by default, aligned table, session rows with GPA · WAM and total cp), right column "Where the marks are".
- Home also has a Due soon card (exam countdowns inside it, then overdue / next 7 days / reminder window) at the top of the right column; on phones it comes right after the stats.
- Subjects page: This session / All sessions toggle, cards; the grade pill sits top right, centered with the code (D).
- Study tab (M5, locked 28 Oct 2026): place A (own tab), exam countdowns at the top. Tasks: By status (Overdue, Open, In progress, Done collapsed), sorted by due date by default; Sort (Due date, Manual order with ⋮⋮ drag or arrow keys, Important first, Name), Group (Status, Due date, Subject, None), Filter (subject, important only). Calendar: Month on desktop, List on phones, Week too; each device remembers its view. New task = Full pop-up (title, icon row status / important / due / repeat / reminder with a dot when set, Subject (required), Link to an assessment part, Details), a sheet on phones. Due-date prompt = pop-up after adding an assessment or part in Marks (not for subjects with an official result): each new part becomes a task; Skip adds them undated; ✕ adds none. Reminders show only inside the app. Started empty: existing subjects got no tasks.
- Import tasks (M5.1, option B locked 28 Oct 2026): Import button next to New on Study opens a pop-up (sheet on phones): paste box, Text format help, live preview (New / Update / No change / Done, left alone / Skipped, with warnings), Add N tasks. Line: `SUBJECT | name | date time | link part | note … | important | repeat weekly | remind 2 days` (only code + name needed, rest any order). Dates `3 Nov`, `Tue 3 Nov 11:00 PM`, `3/11`, `2026-11-03 23:00`; no year = this year, or next year if more than 60 days ago. Subject by code (current session first). Same subject + name (any case) = update only what's given; Done tasks left alone; never deletes. Link not found = added without a link + warning; linked part already marked = added as Done. Bad line or unknown subject skips only that line.
- Not used: the split Subject view (B).

## Milestones
- [x] M1 (28 Oct 2026): React + Vite app, local only. Tested grade maths, Dexie storage with uid/updatedAt/delete marks, screens from A v6, Settings (session picker, backup download/restore, sample subjects, clear everything, sync placeholder).
- [x] M2 (28 Oct 2026): PWA install (icons, manifest, offline via vite-plugin-pwa) + GitHub Pages deploy at https://mfjiae.github.io/gradi/ with a test-and-deploy GitHub Action (same as moni's; Pages source = GitHub Actions). Phone updates arrive on the next open after a deploy.
- [x] M2.1 (28 Oct 2026): year picker (Settings stepper ◀ year ▾ ▶ and the Add/Edit subject dropdown; years run 2025 to the current Sydney calendar year automatically, plus any year a saved subject uses) and the Grade bands card as an aligned table (Grade | Marks | Grade points), symmetric: Marks centered under its header, Grade left, Grade points right.
- [x] M3 (28 Oct 2026): sync like moni (`src/lib/sync.js`, `github.js`). File `gradi.json` in the private `mfjiae/gradi-data` repo; fine-grained token (Only gradi-data, Contents read/write) stored on each device only (meta row `sync`, never in backups or the synced file). Syncs 1.5 s after each edit, on open, when the app comes back to the screen, when back online, and with Sync now. Newest edit wins per subject, delete marks, current session newest wins, retries on a clash with another device, refuses a public repo. While sync is on: Load sample subjects is hidden (so fake data can't reach gradi-data) and Clear everything warns that it clears every synced device.
- [x] M4.0 (28 Oct 2026): Import from text (Settings card, layout A Compact; `src/lib/importText.js` parser + `planImport`, `store.importSubjects`, tested). Format: blank line between subjects; first line `CODE: Name | Autumn 2026 | 6cp | D 77` (name, cp (6 if left out), result `D 77`/`HD`/`PASS`, `target 85`, `no gpa`, `no wam` optional; `2026 Autumn` also works); assessment `Name | 25% | 5/5, 20/20 | hurdle 50 | best 4` (one unnamed mark = single, several or named = parts, `-/100` = not marked, `Quiz 1=8/10`, no marks = single -/100); `#` lines ignored. Same code (any case, spaces ignored) + year + session = update: replaces the assessments (keeps them if only the first line is pasted), changes name/cp/target/result/switches only when given; identical = "No change", not written. Warnings (weights not 100%, score above max) still import; errors skip only that subject; a subject pasted twice imports once. Never deletes; clears an old delete mark. Merged phone fixes: part names wrap (B, narrower score boxes on phone), ladder band strip with letters + numbers underneath (A), quiet empty Home on phone and desktop (B: grey dash, "Needs a result/mark/subject", "No subjects yet", Add subject button; a grey dash also whenever a stat has no number), Add tab = 52 px round button in a notch (B).
- [x] M4.1 (28 Oct 2026): count the best N of M parts (option A, automatic): "Count the best [N] of M parts" box on split components, dropped parts greyed with "Not counted" (unneeded unmarked ones "Optional"); import `best 4` (or `best 4 of 5`) after the weight or the marks. Merged: Settings layout A + B (desktop two columns: Current session + Backup | Sync + Grade bands, Import from text full width below; phone one column session, sync, backup, bands, import; Backup shows "On this device: N subjects" and "Last backup") and the empty Home Add subject button removed.
- [x] M5 (28 Oct 2026): study tracker (see Design: Study tab), tasks table (Dexie v2, upgrade tested with seeded v1 data in tests and in a browser), tasks in sync, backup and restore, linked tasks auto-Done on a mark, repeating tasks, exam countdowns, Home Due soon. Merged: grade pill fix on subject cards (option D). Settings Backup shows the task count; Clear everything clears tasks too.
- [x] M5.1 (28 Oct 2026): import tasks from text (see Design: Import tasks; `src/lib/importTasks.js`, `store.importTasks`, tested).
- [ ] Seed: Ken's real grades, now easiest through Import from text (Claude writes the text from the transcription; never in this repo).
- [ ] M4 extras (open decisions, ask Ken): unequal part weights, bonus marks, GPA trend chart.
- [ ] M5 later: calendar Day, 3 days and Year views (agreed for a later update).

## Beyond the prototype in M1 (tell Ken; change if he wants)
- "Edit details" button on the subject page opens the Add subject form prefilled, plus Official result (grade + optional mark). The prototype had no way to edit a subject or record its result.
- Backup card: Download backup / Restore from file (Merge or Replace) / Load sample subjects (only when empty) / Clear everything, replacing the prototype's JSON text box.

## Visual bug list (cosmetic, ships in a batch)
- (empty) The grade pill fix shipped in M5.

## Future ideas
- GPA trend chart across sessions. Phone notifications for reminders (needs a server or push service; in-app only for now).
