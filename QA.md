# CIRCLE — QA report

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

External image URLs depend on the remote host and network. Photos are URL embeds, not uploads. Notifications use polling rather than WebSockets. Email verification, password reset, moderation/reporting and file uploads are outside the requested core scope.

No commit, push or deployment was performed. Local verification servers are stopped after handoff; database files remain. README.md and outputs/LOCAL_ACCESS.txt explain restarting.
