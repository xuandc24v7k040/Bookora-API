# Bookora — Customer Support Chat — Phase 1 Handoff

## 1. Status / gate

**BOOKORA — CUSTOMER SUPPORT CHAT — PHASE 1 FOUNDATION — DONE (VERIFIED)**

Gate 1 is verified. This is the backend/realtime foundation, not completion of the Chat UI. No mandatory case remains blocked.

Authority: `Bookora_Customer_Support_Chat_Master_Spec.md` v1.0.0, decision lock 2026-11-23, and the supplied Phase 1 BOUND/VERIFY prompt. The supplied images guide future composition; Phase 1 adds no Customer Chatbox, Admin Inbox or Orders CTA UI.

| Case | Status | Evidence / remaining verification |
|---|---|---|
| P1-01 | PASS | Actual local repositories, HEADs, initial changes and safe disposable PostgreSQL audited |
| P1-02 | PASS | GENERAL + owned ORDER; order branch overrides client branch; atomic first message |
| P1-03 | PASS | Foreign owner, branch spoof and unauthorized principal negative HTTP tests |
| P1-04 | PASS | Empty-scope GENERAL/ORDER races, DB partial uniqueness, distinct message preservation |
| P1-05 | PASS | Branch Admin catalog/migration grants; delegated Staff; orders-only Cashier denied |
| P1-06 | PASS | Concurrent claim winner/conflict; explicit takeover; old assignee blocked |
| P1-07 | PASS | Resolve rejects sends; reopen clears assignment; newer active ticket reused |
| P1-08 | PASS | Sender-wide DB idempotency, payload conflict, ordered concurrent append/history |
| P1-09 | PASS | Monotonic per-user reads, unread separation, assignee receipt reset on reassign |
| P1-10 | PASS | Real private R2 image/PDF/MP4/WebM/DOCX/ZIP, exact 10 MiB, negative file access and cleanup |
| P1-11 | PASS | Real HTTP + Socket.IO delivery, owner/branch recipients and sender echo |
| P1-12 | PASS | Authenticated typing start, TTL stop, throttle and foreign/spoof negative cases |
| P1-13 | PASS | Emit failure preserves commit; 141.46-second browser socket outage recovers at attempt 9 and reconciles missed sequence 3 without reload |
| P1-14 | PASS | Assignment/session and permission override live revoke deny protected REST/events/files |
| P1-15 | PASS | 40 sends, 100 users/sockets and 12 direct Socket.IO typing signals; final numbers below |
| P1-16 | PASS | Real UI login in Edge + independent in-app browser, generated API/HTTP/private file access, actual WS frames and reconnect |
| P1-17 | PASS | Existing backend Orders/Notifications 24 tests; Web shared HTTP/realtime/Unicode 55 tests; real Order UI + Bell change observed |
| P1-18 | PASS | BE/Web builds, typechecks/lint, Prisma validation/status/preservation, OpenAPI lint/contract, Orval/Zod, diff checks |

## 2. Preflight / source authority

| Repository | Actual path | HEAD / branch |
|---|---|---|
| Backend | `D:\CTU\CT466E\bookora-api\bookora-api` | `df4e47052de77387094c82d1fc9528871bd3479c`, `master` |
| Web | `D:\CTU\CT466E\bookora-web\bookora-web` | `54c463f695861d5cc9d32d13cd33f5e957f68e9a`, `master` |

Initial working trees: only `AGENTS.md` and `CLAUDE.md` modified in each repository. These pre-existing changes are preserved. No add/commit/push/pull/rebase/reset/clean/restore was performed. Final HEADs remain unchanged.

The existing local `DATABASE_URL` points to localhost PostgreSQL, database `bookora_db`; it was inspected without printing credentials. All migrations, fixtures, race tests and browser mutations for this work use separately created `bookora_it_*` databases through `test/helpers/postgres-test-database.ts`. No application migration or seed was run against `bookora_db`; deploy the additive migration to the intended application environment before using Support there. Disposable fixture teardown uses the existing helper and affects only its generated database. The final browser fixture, its private R2 objects and loopback control server were closed successfully (HTTP 200).

R2 credentials/private/public storage configuration already exists. Tests use unpredictable keys under `support/staged/` in the configured private bucket and delete only objects tracked by their disposable fixture. No credentials, signed URLs or real customer records are included in this handoff.

Web development surface: `http://localhost:5173`. Browser harness temporarily redirects the existing Axios client and shared realtime manager in memory to isolated API `http://localhost:18000`. It uses ordinary UI password login, CSRF cookies/headers, AuthSession and the existing Gateway. The fixture's supported test Turnstile configuration is disabled on both sides; production Auth configuration/source is unchanged. No second Socket.IO connection is created for the Support probe.

## 3. Findings / minimal changes / impact

| ID | Source / finding | Decision and regression boundary |
|---|---|---|
| S-01 | `auth/guards/jwt-access.guard.ts`, `csrf.guard.ts`, `authorization.service.ts`: live AuthSession and principal resolution available | KEEP; Support uses existing guards, validation and CSRF |
| S-02 | `authorization.service.ts`: effective branch role grants + ALLOW/DENY; delegation allowlist in `authorization.constants.ts` | Add four Support permissions; default only Branch Admin; enable explicit staff delegation; no role-name ACL shortcut |
| S-03 | `Order.userId`, `Order.branchId`, existing scoped Orders read API | Owner lookup is authoritative; safe Support context has no shipping/payment/contact PII and never grants Orders access |
| RT-01 | `realtime.gateway.ts`, `realtime-publisher.ts`, `realtime.module.ts`: authenticated `/realtime`, server-owned user rooms | Reuse; add domain-neutral inbound registration port and two explicit typing handlers |
| RT-02 | Gateway revalidates token/session/fingerprint before protected delivery | KEEP; Support domain batches recipient fanout in groups of 10; no worker/notification dependency |
| RT-03 | `src/lib/realtime/connection.ts`: shared manager had five finite reconnect attempts and no outbound typed signal | Infinite attempts with existing capped backoff/jitter; typed volatile emit and Support contract augmentation |
| D-01 | Prisma multifile schema/ULIDs; disposable database helper and forward migrations available | Add five Support models + two enums, SQL partial indexes/checks/triggers; lock scope/ticket transactionally |
| F-01 | `R2ObjectStorageService`: private writes/deletes exist, private reads missing | Add private read method; Support authorized proxy, staged lifecycle/expiry/cleanup; public media behavior retained |
| A-01 | Backend Swagger export; Web `openapi:sync`, Orval/Zod and postprocessors | Use actual pipeline; generator postprocessor corrects Support Unicode length semantics, never manual generated edits |
| T-01 | Real PostgreSQL/HTTP/Socket helpers and runtime fixture available | Reuse; add optional frontend origin to fixture helper, preserving its previous default |

GitNexus index matched both initial HEADs. Pre-edit upstream analysis: AppModule MEDIUM (13 direct refs); RealtimeGateway LOW (2 direct refs; DI boundary lower-bound warning); RealtimePublisher MEDIUM (11 direct refs, kept unchanged); private storage MEDIUM (7 direct refs); seedCatalog MEDIUM (6 direct refs, development/fixture seed flows); delegation constant LOW; Web connect LOW (2 direct refs, realtime session lifecycle). Fixture helper MEDIUM (8 direct refs, test/browser fixture flows). New Support symbols are absent from the baseline index and return UNKNOWN, not a proven zero blast radius. Source review plus real integration tests cover those additions. Final `detect_changes(scope:all)` reports aggregate backend HIGH (17 mapped symbols / 6 flows) and Web MEDIUM (6 / 3). This warning was reported before final review. It includes pre-existing AGENTS/CLAUDE edits and line-shift mappings of unchanged public storage methods; actual source diff and storage/Auth/Orders/Notifications regressions were inspected. No commit was made.

## 4. Decisions and REST contract freeze

All routes below are under `/api/v1/support`. All require an authenticated session; mutations require existing CSRF cookie/header. BRANCH callers must pass their selected `X-Branch-Id` and effective branch permission. CUSTOMER owner scope is resolved from the session; a header cannot change ownership or ORDER branch. SYSTEM is denied even if its global catalog contains Support codes.

For Web BRANCH consumers, pass the existing request option `{ branchScoped: true }` to generated operations; this invokes the shared branch context interceptor. CUSTOMER consumers use the generated operation without that flag. Headers are optional in OpenAPI because this route family also serves CUSTOMER; the branch requirement is enforced at runtime for BRANCH.

| Method / path | operationId | Input / result |
|---|---|---|
| GET `tickets` | `supportTicketsList` | status/type/branchId/query/cursor/limit (1..50, default 30) -> ticket summaries + nextCursor |
| GET `unread` | `supportUnread` | principal/selected branch -> total unreadCount |
| GET `orders/:orderId/context` | `supportOwnedOrderContext` | owned order -> orderId/orderCode/branchId/status/activeTicketId/canViewOrderDetail |
| POST `tickets` | `supportTicketCreate` | type, optional branchId/orderId/subject, required first message -> canonical send result |
| GET `tickets/:ticketId` | `supportTicketDetail` | authorized summary, names, last message, cursors, version, unread |
| GET `tickets/:ticketId/order-context` | `supportTicketOrderContext` | minimal order context; canViewOrderDetail reflects actual Orders permission |
| GET `tickets/:ticketId/messages` | `supportMessagesList` | beforeSequence OR afterSequence + limit -> ascending canonical messages and nextSequence |
| POST `tickets/:ticketId/messages` | `supportMessageSend` | clientMessageId, optional text/attachmentIds -> canonical message |
| POST `tickets/:ticketId/read` | `supportTicketRead` | lastReadSequence -> canonical monotonic watermark |
| POST `tickets/:ticketId/claim` | `supportTicketClaim` | OPEN -> IN_PROGRESS, assignee=actor; conflict for losing claim |
| POST `tickets/:ticketId/unclaim` | `supportTicketUnclaim` | current effective assignee or manager -> OPEN/unassigned |
| POST `tickets/:ticketId/reassign` | `supportTicketReassign` | assigneeId; requires manage and eligible active branch target |
| POST `tickets/:ticketId/resolve` | `supportTicketResolve` | current effective assignee or manager -> RESOLVED |
| POST `tickets/:ticketId/reopen` | `supportTicketReopen` | owning Customer explicitly reopens unassigned, or returns existing active scope |
| GET `tickets/:ticketId/activities` | `supportTicketActivities` | cursor -> 30 activities + nextCursor |
| POST `attachments` | `supportAttachmentUpload` | multipart file + ticketId, OR Customer type/branchId/orderId pre-chat context -> safe descriptor |
| DELETE `attachments/:attachmentId` | `supportAttachmentDiscard` | owner-only unattached staged upload -> id; marks for deletion |
| GET `attachments/:attachmentId/content` | `supportAttachmentContent` | live ticket ACL -> private binary response |

Success JSON uses the existing `{ statusCode, message, data }` envelope. A send result in `data` is `{ ticketId, message: SupportMessageDto, replayed }`. Message DTO: `id,ticketId,senderUserId,senderType,senderName,clientMessageId,text,sequence,createdAt,attachments`. Attachment DTO: `id,filename,mimeType,size`; no object key, bucket, signed URL or credentials.

Example first send:

```json
{"type":"GENERAL","branchId":"<authorized-branch-ulid>","subject":"Sản phẩm có vấn đề","message":{"clientMessageId":"stable-client-send-001","text":"Mình cần hỗ trợ sản phẩm.","attachmentIds":[]}}
```

State: OPEN/unassigned -> IN_PROGRESS/one assignee -> RESOLVED; explicit Customer reopen clears assignment. Managers must reassign/take over before replying. Offline/disconnect never unclaims. Retry/no-op transitions do not append duplicate activity.

Important machine errors: `SUPPORT_TICKET_NOT_FOUND` (foreign IDs indistinguishable), `SUPPORT_FORBIDDEN`, `SUPPORT_BRANCH_UNAVAILABLE`, `SUPPORT_TICKET_ALREADY_CLAIMED`, `SUPPORT_ASSIGNEE_INVALID`, `SUPPORT_TICKET_RESOLVED`, `SUPPORT_MESSAGE_REPLAY_CONFLICT`, `SUPPORT_MESSAGE_EMPTY`, `SUPPORT_MESSAGE_TOO_LONG`, `SUPPORT_ATTACHMENT_INVALID`, `SUPPORT_ATTACHMENT_TOO_LARGE`, `SUPPORT_TOO_MANY_ATTACHMENTS`, `SUPPORT_UPLOAD_LIMIT`, `SUPPORT_CURSOR_INVALID`, `SUPPORT_READ_INVALID`. Field validation and HTTP throttling retain the project's standard error envelope. Socket signal ACK is `{ok:true}` or `{ok:false,code}`.

## 5. Socket contract

Namespace `/realtime`; existing cookie/Origin/AuthSession checks; one shared connection per tab. Envelope `version: 1` is distinct from monotonically increasing ticket `ticketVersion`.

| Event | Direction | Data |
|---|---|---|
| `chat.ticket.changed` | server -> owner + effective branch readers | ticketId, branchId, status, assigneeId, updatedAt, ticketVersion, lastSequence |
| `chat.message.created` | server -> same authorized readers, including sender's other tabs | Message DTO + messageId, branchId, ticketVersion, contentOmitted:false; or bounded reference below |
| `chat.read.updated` | server -> reader's own sessions; actual Customer/assignee receipts only to the pair | ticketId, userId, lastReadSequence, receipt; visible receipts also carry ticketVersion |
| `chat.typing.start` / `chat.typing.stop` | client -> server -> current Customer/assignee counterpart only | client supplies only ticketId; server supplies actorId, expiresAt, version |

The existing 8 KiB transport budget remains. When Unicode text/metadata would exceed it, message event is `{version:1,ticketId,messageId,clientMessageId,sequence,branchId,ticketVersion,contentOmitted:true}`. Consumers use a scoped history delta (`afterSequence`) to recover content; they must not refetch the entire thread on every normal event.

Typing throttle is at least 200 ms per connection, maximum 1 KiB signal; server TTL 3 seconds, explicit stop/disconnect cleanup. No DB typing writes, arbitrary room join or client-provided identity. Client uses typed volatile emit, so disconnected signals are not queued.

Every actual recipient socket is revalidated through existing live authorization before delivery. No global broadcast or Bell/NotificationRecord per chat message. State writes commit before publication is scheduled; caught publisher failure never changes a committed HTTP success into 500. Events are best effort and may arrive out of order. Dedupe by message ID/clientMessageId, order by sequence, reject stale ticketVersion, and reconcile bounded REST deltas after reconnect/focus.

## 6. DB, concurrency and migration

Migration: `prisma/migrations/20261124090000_support_chat_foundation/migration.sql`; models: `prisma/schema/33-support.models.prisma`, with inverse User/Branch/Order relations in the existing files.

- `SupportTicket` is the conversation; no redundant 1:1 Ticket/Conversation.
- SQL partial unique active GENERAL `(customer_id,branch_id)` and ORDER `(customer_id,order_id)`; resolved histories can repeat.
- DB check: OPEN has no assignee; IN_PROGRESS has one; GENERAL has no order, ORDER requires one; valid nonnegative cursor ranges.
- DB trigger locks immutable owner/branch/type/order and verifies ORDER ownership + branch at insertion.
- Deferred DB constraint requires a ticket's first message at commit.
- Message unique `(sender_user_id,client_message_id)` and `(ticket_id,sequence)`; SHA-256 canonical payload hash detects key reuse with changed content/scope.
- Advisory transaction locks serialize initial scope creation/reopen; row locks serialize append/lifecycle/read; staged rows are locked in stable ID order before finalization.
- Read state unique ticket/user; DB monotonic update trigger; service rejects cursor beyond committed history. Assignee receipt watermark resets on reassignment and does not inherit pre-claim reading.
- Claim loser gets typed 409, while concurrent distinct first sends converge to one ticket and retain each message.

All application migrations are additive and forward-only. Preservation test compares existing Customer/Branch/Order/Notification rows before/after Support SQL in a disposable database. Standard fixture migration deployment and status evidence are recorded with final checks.

## 7. Private files

Allowed: JPEG/JPG, PNG, WebP, PDF, MP4, WebM, DOCX, ZIP. Maximum 10 MiB actual bytes/file and five files/message; maximum 20 outstanding staged uploads per user. Text cap is 4,000 Unicode code points on both backend and generated Zod through the generation pipeline.

Upload over HTTP only. File validation checks extension, MIME, actual bytes, image metadata/pixel budget, supported video header, PDF header/EOF and bounded ZIP central-directory structure; DOCX requires its expected document entries. ZIP is never extracted/executed. No malware-free guarantee or new antivirus infrastructure is claimed.

Stage row exists before the R2 write, binds uploader to immutable pre-chat/ticket scope and expires after one hour. Message commit connects only owned, ready, unexpired, unattached files in the same scope. Replay reuses canonical attachments. Failed/ambiguous writes remain tracked for cleanup. A bounded 60-second cleanup pass claims at most 50 expired unattached rows; failed deletes remain retryable. This timer is unrelated to realtime message delivery.

Downloads recheck session + ticket owner/branch ACL at request time. Authorized proxy returns `private, no-store`, `nosniff`, sandbox CSP and RFC 5987 filename. Images may be inline; PDF/video/DOCX/ZIP are attachment downloads (safe preview/player can consume authorized bytes in Phase 2). No public URL or long-lived bearer file access is returned. Test objects are removed before fixture DB teardown.

## 8. Performance evidence

Harness: `test/support-chat.e2e-spec.ts`; genuine HTTP requests and Socket.IO websocket clients use one Node process/monotonic clock. Customer and Admin log in through `/auth/login` and use returned HttpOnly cookies. Four warm-up sends then 40 measured sends, 20 in each direction; no polling or cross-process `performance.now()` subtraction.

Final measured values (milliseconds):

| Metric | n | min | P50 | P95 | max |
|---|---:|---:|---:|---:|---:|
| HTTP request start -> recipient socket callback | 40 | 37.00 | 47.34 | **80.77** | 83.22 |
| Commit -> publisher invocation | 40 | 2.28 | 2.67 | **4.80** | 16.84 |
| Commit -> checked fanout completion | 40 | 11.45 | 15.82 | 21.88 | 31.88 |
| Message delivery with 100 distinct users/sockets | 8 | 48.44 | 61.66 | **103.64** | 103.64 |
| Direct Socket.IO typing emit -> recipient callback | 12 | 11.07 | 15.20 | **24.38** | 24.38 |

`latency.json`, `load.json`, `typing.json` contain the actual samples' aggregates/method. Load has 33 connected effective branch readers and verifies all 64 unrelated Customer recipients receive no protected message. Typing has six trials per direction and no per-keystroke loop. No artificial delay is added to improve metrics.

The browser CDP controller also measured 12 typing trials: P50 221.65 ms, P95/max 495.58 ms. That upper-bound measurement includes the browser-tool/CDP command and event-bridge round trips; it is explicitly not the pure signal latency. The direct same-clock Socket.IO harness above isolates the actual signal and meets the 400 ms budget. Both measurements are retained rather than hiding the CDP outlier.

L0/L5 are measured by the common harness; L1 is service entry after request validation; L2 is the interactive transaction promise resolving after commit; L3 is recipient resolution completion immediately before publisher invocation. `commitToEmitCompleteMs` is an upper bound through completion of the publisher's checked fanout promises, not a cross-clock packet timestamp. No Vue bubble latency is claimed in Phase 1.

## 9. Automated/integration checks

Reproducible aggregate runner: `node test/run-support-verification.cjs` from API root. It runs the actual npm scripts, writes each stdout/stderr log plus exact exit code to `checks.json`, and serves the exported canonical OpenAPI artifact temporarily on a loopback HTTP port for the existing Web sync script. No generated file is manually edited.

Commands: BE `npm run type-check`, `npm run lint`, `npm run prisma:validate`, `npm run build`; targeted unit/regression Jest; real PostgreSQL/HTTP/Socket/R2 e2e suites; `npm run docs:openapi`, `docs:contract`, `docs:lint`; Web `npm run gen:api:local`, targeted Vitest including shared HTTP client and Unicode contract, then `npm run build` (Vue typecheck + Vite).

Final actual results: all latest recorded commands exit **0**. BE typecheck, full lint, build and Prisma validate PASS. Unit/regression: **26 suites / 302 tests PASS**. Real e2e: **4 suites / 45 tests PASS** (17 Support including preservation, 4 private R2, 24 existing Orders/Notifications). The expanded Support suite was rerun after adding direct typing measurement: **17/17 PASS**, 51.641 seconds. Web targeted checks: **7 files / 55 tests PASS**. Web build runs Vue typecheck and Vite successfully; existing large-chunk warnings remain, not new Support UI bundles.

Swagger export, contract check and Redocly lint PASS; exported contract has **249 operations / 307 schemas**. Web canonical sync has **183 paths**. Orval/Zod generation and verification PASS: 39 Zod files, 279 `zod.ulid()` uses, zero forbidden occurrences. The source header duplication found during the first OpenAPI lint was fixed at decorators and regenerated; `checks.json` preserves that earlier failure plus the subsequent passing run. `--contracts-only` reruns only the dependent pipeline after that correction. Both full generation and the standalone `gen:api:zod` entry point apply Unicode normalization.

Final browser fixture `prisma migrate status`: **33 migrations; database schema up to date**. `migration-preservation.json` confirms byte-equivalent existing rows and exactly four Branch Admin Support grants, none for Staff/Cashier defaults. `git diff --check` PASS in both repositories. Final targeted lint and typecheck were rerun after the fixture-control/typing additions and passed.

## 10. Runtime/browser evidence

Real browser contexts: Edge Profile 1 Branch Admin and independent ChatGPT in-app browser Customer, both at localhost:5173. Real login forms, CSRF/session flow and existing manager were used. Ordinary generated Support API operations were dynamically imported by the temporary in-memory harness. First message, claim, reply, read receipt and typing reached the opposite browser through WebSocket; no Chat UI/demo page was committed.

The first browser attempt was stopped by Computer Use URL-confidence enforcement; after the user enabled CDP, browser control worked. A provisional outage attempt was invalidated by contract-generation HMR and is **not** counted as a PASS. The final frozen-contract run blocks only the isolated API's `socket.io` HTTP/WS paths with CDP, leaving HTTP and Vite HMR online. It observed **141,462.2 ms offline**, eight failed attempts, then automatic reconnection on attempt nine using WebSocket. The shared manager's reconcile hook fetched only `afterSequence=2` and recovered the one persisted missed message, sequence 3, without F5 or a page reload.

Actual browser negatives: guest HTTP **401**, another owner's real ticket **404**, wrong selected branch **404**. Volatile typing returned false while offline. Owner and staff downloaded a real 119-byte private PNG; the ORDER ticket's first message contained only that attachment. Both read directions were observed (assignee watermark 2, customer watermark 3). Captured real frames include `chat.message.created`, ticket/read/typing updates, `order.changed` and `notification.changed`; the frame buffer was not truncated.

Existing Admin Order detail was operated through its actual **Xác nhận đơn -> Lưu thay đổi** UI. The other browser's existing Customer Order detail changed to **Đã xác nhận** without refresh and its Bell badge became 1. This is an isolated COD fixture; no live payment endpoint was invoked. `browser.json`, `admin.jpg`, `customer.jpg` and `browser-server-timings.json` retain sanitized evidence. Screenshots show existing Orders surfaces, not an unimplemented Chat UI.

The final run's Edge cookies/storage were restored without exposing values. Test cookies were removed from the private in-app context and that tab closed. Reload removed the in-memory probe and verified Axios returned to **http://localhost:8000/api/v1** with `window.__supportQA` absent. No browser security setting or production Auth code is changed. Earlier interrupted tool sessions are not used as passing evidence.

Evidence directory: `C:\Users\Admin\AppData\Local\Temp\bookora-support-evidence` (logs, checks.json, latency.json, load.json, typing.json, browser.json, browser fixture/timings, migration preservation/status, final-git.json and screenshots). Test-only sample videos are bounded MDN CC0 flower fixtures, not user media. Four specifically identified disposable databases left by interrupted earlier tool sessions were audited with zero active connections and removed; `orphan-fixture-cleanup.json` records the exact owned names and outcomes. No wildcard/database reset or application database operation was used.

## 11. Changed files / non-regression

Backend additions: Support feature module (`dto`, policy, repository, service, controller, realtime adapter, upload/file validation and private file lifecycle), additive schema/migration, inbound realtime registry, Support HTTP/Socket/R2 tests, fixture media helper, browser runtime and verification runner.

Backend integration edits: AppModule registration, permission catalog/default Branch Admin grants/delegation allowlist, existing Gateway typing extension, RealtimeModule provider/export, private storage read method, optional test-helper frontend origin, canonical generated OpenAPI.

Web edits: shared typed volatile emit and persistent reconnect, Support event contract augmentation, reconnect expectation/Unicode contract tests, generated canonical/OpenAPI/Orval/Zod artifacts, Unicode generation postprocessor and npm generation command. No Customer/Admin Chat UI, Orders CTA, themes, Auth source, Order/Payment logic or Notification worker implementation is changed.

Pre-existing AGENTS.md/CLAUDE.md modifications remain untouched. Both HEADs remain the values in section 2; no commits/pushes. Final status includes only the described source/contract/test changes plus that preserved baseline. Generated Web additions are confined to the `support` endpoint/Zod tag, `support*` models and the generated models index; existing feature endpoints/themes are unchanged. Backend schema changes are additive; Orders, Notifications worker and Auth business source files are unchanged.

`final-git.json` is the exact final per-repository tracked/untracked file manifest, HEAD and diff-stat snapshot. Additional post-run validation: latest BE typecheck/targeted lint exit 0; expanded Support suite 17/17 exit 0; standalone `npm run gen:api:zod` (including Unicode normalization and generated validation) exit 0, followed by the generated Unicode contract test 1/1 exit 0. These follow-ups cover the final harness/measurement and alternate generation-entry changes without needlessly repeating unrelated R2 or commerce tests.

## 12. Phase 2 lock / limitations

Gate 1 is VERIFIED; Phase 2 may consume this handoff together with the unchanged Master Spec and its own implementation prompt. Master Spec remains authoritative. Phase 2 consumes generated Support operations/models/Zod, `src/lib/realtime/support-contract.ts`, and the shared connection's typed `on/emit`, `onReset`, `onReconcile` APIs. This task did not begin Phase 2. Apply the provided migration to the intended application database through its normal deployment workflow before enabling Support there; verification here used isolated databases.

Use `{branchScoped:true}` for BRANCH requests, user/branch-scoped query keys, optimistic clientMessageId reconciliation, sequence/version guards, bounded delta recovery and real visibility-based read updates. Clear protected cache/file object URLs on session/branch changes. Unassigned manager cannot reply until explicit reassign. Support order context does not authorize full Orders detail or PII.

Runtime is one API instance; no Redis adapter/multi-instance broadcast is introduced. Files have validation/download isolation, not antivirus certification. No SLA, auto-assignment, chatbot, Bell message flood, refund/order mutation, public attachments or official Chat UI is implemented. Changes to this contract require regenerated artifacts and relevant Gate 1 regressions before frontend integration.
