# CIRCLE — profile media and messaging QA

Verified on 28 October 2026 in the existing Windows workspace, using PostgreSQL and headless Microsoft Edge. The existing environment file was preserved. No database reset, seed rewrite, commit, push, or deployment was performed. Browser and integration fixtures were removed from the separate test database after each run.

## Completed

- Profile and cover image upload, temporary previews, replacement, staged removal, defaults, shared avatar rendering, and database persistence.
- Actual image decoding/re-encoding, size/pixel limits, generated filenames, authenticated mutations, bounded multipart parsing, and safe cleanup.
- Unique one-to-one conversations, inbox, profile Message button, chronological cursor history, retry-safe sends, read receipts, and unread navigation badges.
- Session-authenticated Socket.IO invalidations, private participant-only delivery, reconnect refresh, periodic reconciliation, origin protection, and graceful shutdown.
- Existing routes, authentication, posts, follows, comments, and notifications retained.

## Verified results

| Command/check | Result |
| --- | --- |
| npm.cmd run db:migrate | All three migrations already applied; checksums matched. No tables reset. |
| node scripts/migrate-test.js | Separate test database had all three migrations; checksums matched. |
| npm.cmd test | **42 passed, 0 failed, 0 skipped.** Includes existing API/security/validation tests and new media/messaging coverage. |
| npm.cmd run build | **Passed**, 1,638 transformed modules. |
| npm.cmd run test:browser | **3 passed** using actual HTTP, PostgreSQL, and Socket.IO in Edge. |
| Editor diagnostics | No errors reported. |
| git diff --check | No whitespace errors. |
| Screenshot inspection | Desktop 1440×1000 and mobile 390×844 chat layouts reviewed; mobile browser assertion confirmed no horizontal overflow. |

Browser coverage includes preview URLs, save/reload persistence, cancellation, replacement/removal, empty inbox/chat, profile Message action, live unread badge, sender/recipient delivery, read receipts, Enter/Shift+Enter, older history, reload, and switching conversations.

Backend coverage includes spoofed/truncated/oversized uploads, unauthorized mutations, cleanup, concurrent conversation creation, duplicate send retries, sender identity, membership checks, chronological cursors, read/send races, private socket delivery, missing/forged/expired/revoked sessions, reconnect recovery, and polling origin checks.

Browser testing found that same-origin Socket.IO polling GET requests omit Origin. The server now permits only verified same-origin Fetch Metadata plus an exact configured Host in that case; foreign and unverified requests remain rejected. A regression test covers this.

## Changed files

| Area | Files and purpose |
| --- | --- |
| Schema | [002_profile_media.sql](server/db/002_profile_media.sql), [003_messaging.sql](server/db/003_messaging.sql), [migrate.js](server/db/migrate.js): forward-only migrations registered after the unchanged initial schema. |
| Media API | [media.js storage](server/src/services/media.js), [media.js routes](server/src/routes/media.js), [users.js](server/src/routes/users.js), [queries.js](server/src/services/queries.js): decoded images, atomic saves, legacy avatar cleanup, cover projection. |
| Messaging API | [messages.js](server/src/routes/messages.js), [messaging.js](server/src/services/messaging.js), [realtime.js](server/src/services/realtime.js): authenticated conversations, messages, read tracking, private updates. |
| Server integration | [app.js](server/src/app.js), [index.js](server/src/index.js), [security.js](server/src/middleware/security.js): static images, routes, precise CSP additions, socket server, startup/schema checks, missing-file responses. |
| Profile UI | [EditProfile.jsx](client/src/components/EditProfile.jsx), [ProfilePage.jsx](client/src/pages/ProfilePage.jsx): previews, cover rendering, media controls, Message button. |
| Messaging UI | [MessagesPage.jsx](client/src/pages/MessagesPage.jsx), [MessagingContext.jsx](client/src/context/MessagingContext.jsx): responsive inbox/chat, retry drafts, read receipts, live counts and reconnects. |
| Client integration | [App.jsx](client/src/App.jsx), [AppLayout.jsx](client/src/layouts/AppLayout.jsx), [api.js](client/src/services/api.js), [index.css](client/src/styles/index.css), [vite.config.js](client/vite.config.js): routing, badges, multipart support, styling, upload/socket proxies. |
| Automated checks | [media.test.js](server/test/media.test.js), [messages.test.js](server/test/messages.test.js), [features.spec.js](tests/features.spec.js), [playwright.config.js](playwright.config.js), [migrate-test.js](scripts/migrate-test.js): isolated PostgreSQL, socket, media, and browser tests. |
| Dependencies/scripts | Root [package.json](package.json) and [lockfile](package-lock.json), server [package.json](server/package.json) and [lockfile](server/package-lock.json), client [package.json](client/package.json) and [lockfile](client/package-lock.json). Added Multer, Sharp, Socket.IO, client/test socket clients, and Playwright. |
| Configuration/docs | [.env.example](.env.example), [.gitignore](.gitignore), [README.md](README.md), this report: optional storage directory, ignored uploads/browser outputs, setup/API/limitations. |
| Workspace task | [tasks.json](../.vscode/tasks.json): production build task for the enclosing VS Code workspace. |

## Run locally

~~~powershell
npm.cmd run db:migrate
npm.cmd run db:migrate:test
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run dev
~~~

Dependencies are installed in this workspace. Fresh copies should run npm.cmd install first. Browser checks default to local Microsoft Edge; see [README](README.md) for browser configuration. No reseeding is needed for the new features.

## Remaining limits

No requested development feature is intentionally left as a stub. Production deployment was not requested or performed. Local uploaded images require a persistent volume and backups; ephemeral hosts need an object-storage adapter. Multiple API instances need shared storage, a Socket.IO adapter, and shared rate limits. HTTPS reverse-proxy behavior, other browser engines, physical mobile devices, high load, and full accessibility auditing were not verified.

The baseline report below is retained as historical evidence; its earlier counts and scope are not the current results.

---

## Earlier baseline verification (27 October 2026)

Verified on 27 October 2026 (Asia/Dhaka), Windows, Node.js 24.21.0, npm 11.19.0, real PostgreSQL 18.4.

## Actual results

| Check | Result |
| --- | --- |
| Dependency installation | Passed. Separate client/server installs avoid Windows workspace symlink restrictions. |
| Frontend production build | Passed; 1,606 modules. HTML 0.61 kB, CSS 32.08 kB (7.48 gzip), JS 313.61 kB (98.34 gzip). |
| Backend startup | Passed; real PostgreSQL connection and schema checks. |
| Health endpoint | HTTP 200, database connected. |
| Compiled frontend serving | HTTP 200 for / and /u/maya, verifying SPA fallback. |
| Automated suite | 25 passed, 0 failed, 0 skipped; node --test. |
| Migration repeatability | Applied initial migration, reran with already-applied result; repeated separately on test DB. |
| Seed repeatability | Ran twice; counts unchanged: 7 users, 15 posts, 10 comments, 29 likes, 16 follows, 8 notifications. |
| Direct DB constraint checks | All 7 passed: self-follow, duplicate like, missing post FK, empty post, long post, bad session hash, self-notification. |
| Password hashing | All seven demo hashes verified as bcrypt cost 12. |
| Server production dependency audit | 0 known vulnerabilities reported by npm audit --omit=dev. |
| Client production dependency audit | 0 known vulnerabilities reported by npm audit --omit=dev. |

The test runner's 25 total includes the two parent test cases, 21 nested API/security cases and two validation cases.

## Automated coverage

server/test/api.test.js verifies:
- Actual DB health and anonymous protection.
- Registration validation, cookie flags, password hashing, current user.
- Case-insensitive duplicate email/username rejection.
- Foreign/missing Origin rejection.
- Post creation, content/URL validation, session-derived identity.
- Pagination, profile filtering, literal search and injection-shaped input.
- Post edit/delete authorization.
- Idempotent like/unlike and persisted counts.
- Self-follow prevention, both relationship lists, Following feed.
- Comment validation, ownership and count updates.
- Profile validation and private-field exclusion.
- Persistent like/follow/comment notifications; read controls scoped to recipient.
- Comment/post deletion, unfollow, logout and wrong-password handling.

server/test/security.test.js verifies:
- Parallel likes create one relationship and notification.
- Parallel follows create one relationship and notification.
- Racing follow/unfollow keeps notifications consistent.
- Malformed JSON/foreign Origin cannot change content.
- Post deletion cascades through comments, likes and related notifications.
- Only token hashes are stored; logged-out cookies cannot be replayed.
- Login rotates tokens; expired sessions cannot authenticate.

server/test/validation.test.js verifies bounded field types, passwords/UTF-8 byte limits, unsafe image URL schemes, ID/page limits and escaped literal search terms.

Tests run against a dedicated PostgreSQL database. Randomly named test users are cleaned up; no in-memory substitute was used.

## Browser verification

Used the in-app Chromium browser with live API/database data:
- Demo login, incorrect-password error, successful retry and logout.
- Home feed and For You/Following switching, including ArrowRight keyboard navigation.
- Publishing and editing a test post.
- Post details, empty comments state, adding a comment and updated count.
- Search for Sofia, profile navigation, follow button/count update and follower list.
- Own-profile edit form and successful save.
- Notifications and mark-all-as-read.
- Mobile composer and Escape dismissal.
- Feed load-more fetched the remaining posts and showed the caught-up state.
- Branded 404 and return-home navigation.
- Desktop 1440x1000, tablet 768x1024, mobile 390x844 and narrow 320x740 layouts.
- documentElement.scrollWidth equaled clientWidth at tablet, mobile and narrow sizes; no horizontal overflow.
- Browser console check before intentional invalid login contained no warnings/errors.
- Saved desktop/mobile screenshots in outputs.

The browser-created test post and its comment were removed, and the temporary follow relationship was restored. Demo notifications were marked read during UI testing. Original seed content remains.

## Issues found and resolved

- npm workspace linking failed with EPERM in this Windows sandbox. Root installation now invokes separate package installs without workspace symlinks.
- Portable PostgreSQL inherited Windows WIN1252 encoding. Created separate UTF8 databases using template0 and preserved original empty databases. Migrations/seeds now reject non-UTF8 databases before writes.
- Modal focus was reinitialized on polling rerenders. A stable effect and latest callback ref preserve focus.
- Feed tabs lacked complete keyboard/ARIA behavior. Added arrow/Home/End keys, roving tabIndex and tabpanel association.
- Vite now binds to localhost, matching documented cookie/origin configuration.

## Remaining verification limits

No requested core feature is intentionally stubbed. The following were not verified:
- Other browser engines and physical mobile devices.
- Real HTTPS hosting, external PostgreSQL TLS, reverse proxies and multi-instance operation.
- Large-scale load, penetration testing, screen-reader auditing or offline/network-failure simulation across every page.

At the earlier baseline, photos were URL embeds and notifications used polling. The profile upload and private messaging implementation above supersedes those earlier scope limits.

No commit, push or deployment was performed. Local verification servers are stopped after handoff; database files remain. README.md and outputs/LOCAL_ACCESS.txt explain restarting.
