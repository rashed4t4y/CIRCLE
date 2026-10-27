# CIRCLE

**Your people. Your space. Your Circle.**

A complete React/Vite JavaScript frontend, Express REST API, and PostgreSQL database. CIRCLE uses warm neutrals, violet accents, an original circle logo, initial avatars, and responsive desktop/mobile layouts.

## Implemented features

- Registration, login, logout, secure persistent sessions.
- For You and Following feeds, pagination, loading/error/empty states.
- Posts (500 characters), optional image URLs, editing and confirmed deletion.
- Likes, comments (1,000 characters), ownership checks.
- Debounced people search, suggestions, hashtag discovery, follow/unfollow and relationship lists.
- Profiles, join date and counts; name, bio (240 characters), avatar editing.
- Persistent like/follow/comment notifications and read/unread controls.
- Accessible dialogs, toasts, mobile navigation and branded 404.
- All social content comes from the API and PostgreSQL. URLs display images; files are not uploaded.

## Windows setup

Install Node.js 22.12+ and PostgreSQL 16+. Verification used Node 24.21.0 and PostgreSQL 18.4. Get PostgreSQL from the [official Windows download page](https://www.postgresql.org/download/windows/). Select PostgreSQL Server and SQL Shell. pgAdmin is optional; Stack Builder is not needed. Keep your administrator password. The usual database port is 5432.

Open PowerShell in this project folder:

~~~powershell
node --version
npm.cmd --version
npm.cmd install
Copy-Item .env.example .env
~~~

Using npm.cmd avoids npm.ps1 execution-policy restrictions. Root installation automatically installs server/client dependencies. If lifecycle scripts are disabled:

~~~powershell
npm.cmd --prefix server install
npm.cmd --prefix client install
~~~

Open SQL Shell as the PostgreSQL administrator. Replace the password placeholder:

~~~sql
CREATE ROLE circle_app LOGIN PASSWORD '<your-database-password>';
CREATE DATABASE circle OWNER circle_app ENCODING 'UTF8'
  TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';
CREATE DATABASE circle_test OWNER circle_app ENCODING 'UTF8'
  TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';
~~~

Alternatively launch SQL Shell with the installed version's path:

~~~powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost
~~~

Edit .env:

~~~dotenv
DATABASE_URL=postgresql://circle_app:YOUR_URL_ENCODED_PASSWORD@localhost:5432/circle
TEST_DATABASE_URL=postgresql://circle_app:YOUR_URL_ENCODED_PASSWORD@localhost:5432/circle_test
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
SERVER_ORIGIN=http://localhost:3001
NODE_ENV=development
DEMO_PASSWORD=YOUR_UNIQUE_DEMO_PASSWORD
DATABASE_SSL=false
~~~

URL-encode special characters in the database password, such as @ as %40. Never commit .env.

~~~powershell
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
~~~

Open [CIRCLE](http://localhost:5173). The backend is [localhost:3001](http://localhost:3001/api/health). Use localhost consistently: cookies and origin protection distinguish it from 127.0.0.1.

Separate terminal scripts: npm.cmd run dev:server and npm.cmd run dev:client.

~~~powershell
npm.cmd run build
npm.cmd start
~~~

Express serves client/dist when present, including SPA route fallback. The compiled app is available at localhost:3001 in development mode. Production requires HTTPS origins and a TLS reverse proxy for Secure cookies. These commands do not deploy anything.

### Prepared workspace's local PostgreSQL

Verification downloaded a real PostgreSQL binary into ignored work/postgres-runtime, without installing a system service. It uses port 55432 and databases circle_utf8 and circle_test_utf8. The ignored .env is configured for it. Data is persistent. Keep that .env when using this runtime.

Restart the optional runtime in a separate terminal after it has stopped:

~~~powershell
Set-Location work\postgres-runtime
node start.mjs
~~~

Run npm.cmd run dev from the project root in another terminal. The source ZIP excludes this runtime, data, dependencies and .env; extracted copies use the standard setup above.

## Demo login

The seed creates seven fictional users: maya, lin, elliot, ava, noah, sofia and oliver, with emails username@circle.example.

- Primary email: **maya@circle.example**
- Password: your **DEMO_PASSWORD**
- Prepared workspace's generated password: **outputs/LOCAL_ACCESS.txt**

Passwords must contain at least 10 characters and at most 72 UTF-8 bytes; choose 12+ characters. Bcrypt cost is 12. Seed reruns preserve existing demo passwords and edits; changing DEMO_PASSWORD does not reset existing accounts. Profiles use initials. Seed landscape photos use Unsplash URLs and require network access; broken images have a fallback.

## Environment variables

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | PostgreSQL connection URL; UTF8 database required. |
| TEST_DATABASE_URL | Separate migrated test database. |
| CLIENT_ORIGIN | Exact frontend origin, default http://localhost:5173. |
| SERVER_ORIGIN | Exact backend/compiled-site origin, default http://localhost:3001. |
| PORT | API port, default 3001. |
| NODE_ENV | development, test, or production. |
| DEMO_PASSWORD | Required for optional demo seed only. |
| DATABASE_SSL | true enables verified PostgreSQL TLS; default false. |
| SESSION_DAYS | Session lifetime, 1–30 days; default 7. |

## Project structure and files created

~~~text
client/
  public/favicon.svg
  src/
    components/   # reusable UI, posts, composer
    context/      # authentication and toasts
    hooks/        # API resources, lists, debounce
    layouts/      # desktop and mobile shell
    pages/        # auth, feed, discovery, profiles, activity, comments
    services/api.js
    styles/index.css
    App.jsx
    main.jsx
  index.html
  vite.config.js
  package.json
  package-lock.json
server/
  src/
    routes/       # auth, users, posts, comments, topics, notifications
    middleware/   # auth, CSRF origin protection, errors
    services/     # SQL projections, sessions, validation
    app.js
    index.js
    config.js
    db.js
  db/
    schema.sql
    seed.sql
    connection.js
    migrate.js
    seed.js
  test/           # validation, integration and security
  package.json
  package-lock.json
scripts/install.js
.env.example
.gitignore
package.json
package-lock.json
README.md
QA.md
~~~

The starting folder contained only work and outputs. Application files are new. No unrelated files or existing data were deleted. Work contains temporary verification tools and local PostgreSQL data. Outputs contains the deliverable archive, access details and review evidence.

## Database tables and relationships

| Table | Relationships and rules |
| --- | --- |
| users | Unique lowercase username/email; bcrypt hash; profile fields. |
| posts | User FK; 1–500 characters; optional image URL. |
| comments | User and post FKs; 1–1,000 characters. |
| likes | User/post FKs; unique post_id/user_id pair. |
| follows | Two user FKs; unique pair; self-follow prohibited. |
| notifications | Recipient/actor user FKs; post/comment references; typed activity. |
| sessions | SHA-256 hash of random cookie token; user FK and expiration. |
| schema_migrations | Applied versions and checksums. |

Foreign keys cascade dependent social records when parents are deleted. Timestamps use TIMESTAMPTZ. Indexes cover feeds, authors, comments, follows, notifications and sessions. Counts are computed in SQL in the same round trip. User values are parameterized. Transactions keep social mutations and notifications consistent, with follow-pair advisory locking.

Migrations use a checksum ledger, transactions and advisory lock; no silent erasure. Add new migration files rather than editing applied schema.sql. Seed identifiers and conflict handling prevent duplication and preserve existing edits.

## REST API

Success: {data: ...}. Lists also return pagination: {page, limit, has_more}. Errors: {error: {message, fields?}}. Default page 1 and limit 15, capped at 50. Every social route requires authentication. New resources return 201; existing like/follow requests and normal reads/updates/deletes return 200. Status codes include 400 validation, 401 unauthenticated, 403 forbidden, 404 missing, 409 duplicate, 429 rate limit and 503 database unavailable.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | /api/health | Actual database connectivity. |
| POST | /api/auth/register | full_name, username, email, password, confirm_password. |
| POST | /api/auth/login | email/password; sets cookie. |
| POST | /api/auth/logout | Revokes session and clears cookie. |
| GET | /api/auth/me | Current profile including own email. |
| GET | /api/users/search?q= | Name/username search; empty q gives suggestions. |
| GET | /api/users/:username | Public profile and counts. |
| PATCH | /api/users/me | full_name, bio, avatar_url. |
| GET | /api/users/:username/followers | Paginated followers. |
| GET | /api/users/:username/following | Paginated following. |
| POST / DELETE | /api/users/:id/follow | Follow/unfollow. |
| GET | /api/posts | Recent feed; optional username and q filters. |
| GET | /api/posts/following | Followed users' posts. |
| POST | /api/posts | content and optional image_url. |
| GET | /api/posts/:id | Post details and counts. |
| PATCH | /api/posts/:id | Author-only edit. |
| DELETE | /api/posts/:id | Author-only deletion. |
| POST / DELETE | /api/posts/:id/like | Like/unlike. |
| GET | /api/posts/:id/comments | Paginated comments, oldest first. |
| POST | /api/posts/:id/comments | content. |
| DELETE | /api/comments/:id | Comment-author-only deletion. |
| GET | /api/notifications | Activity plus top-level unread_count. |
| PATCH | /api/notifications/:id/read | Mark your notification read. |
| PATCH | /api/notifications/read-all | Mark all your notifications read. |
| GET | /api/topics | Hashtags from the last 90 days. |

Every mutation, including login/register, requires an exact allowed Origin. Browsers supply it automatically. CLI clients must send Origin: http://localhost:5173 (or configured origin), JSON Content-Type when sending bodies, and retain cookies.

## Tests

Migrate the separate test database, then run tests. This temporary environment override leaves .env unchanged:

~~~powershell
$env:DATABASE_URL = 'postgresql://circle_app:YOUR_URL_ENCODED_PASSWORD@localhost:5432/circle_test'
npm.cmd run db:migrate
$env:DATABASE_URL = $null
npm.cmd test
npm.cmd run build
~~~

Tests create randomly named users and clean up only their own records. Without TEST_DATABASE_URL, integration suites explicitly skip; validation tests still run. No in-memory database is substituted. QA.md records actual results.

## Security and limitations

Sessions use random opaque tokens stored as hashes, HttpOnly SameSite=Lax cookies and Secure in production. The verified session supplies identity. Exact Origin checks protect mutations. Bcrypt cost 12, rate limits, bounded JSON bodies, server validation, parameterized SQL, authorization and Helmet headers are included. Public responses never expose hashes or other users' emails.

This portfolio app does not implement email verification, password recovery, moderation/reporting, file upload or realtime sockets. Notifications refresh after actions and every 30 seconds. Rate limits are process-local; multiple production instances need a shared limiter. Hosting/TLS, backups and monitoring remain deployment responsibilities. No commits, pushes or deployments were made.

## Troubleshooting

- Connection refused: start PostgreSQL, check the configured host/port and migrate. Standard installations generally use 5432; the optional workspace runtime uses 55432.
- Wrong password: check the PostgreSQL role and URL encoding. DEMO_PASSWORD is independent.
- Missing database: create it before migration; migrations do not create roles/databases.
- Encoding error: create a UTF8 database using template0, then update DATABASE_URL. Migrations/seeds reject other encodings before writing.
- Port conflict: stop the process occupying 5173 or 3001. If changing PORT, update SERVER_ORIGIN and client/vite.config.js proxy target. If changing the Vite port, update CLIENT_ORIGIN.
- Origin rejected: use localhost consistently, exact origins without trailing slash, and restart after editing .env.
- npm.ps1 blocked: use npm.cmd; no execution-policy change needed.
- Missing dependencies: rerun npm.cmd install; if scripts are disabled, install both packages explicitly.
- Session expired: sign in again.
- Remote image unavailable: check the URL/network; URL images depend on the remote host.

References: [Vite](https://vite.dev/guide/), [Express security](https://expressjs.com/en/advanced/best-practice-security/), [node-postgres parameterized SQL](https://node-postgres.com/features/queries).
