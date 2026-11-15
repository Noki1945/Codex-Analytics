# Measurement contract (v0.1)

## Beta 0.2 additions

Forecast and report computations execute in the worker thread using the last loaded aggregate dataset, with correlated request IDs. The interface's selected task IDs define the forecast/report/export population. Additional folders add sources to the same local history; source records remain available after later scans of the default directory. Standard scans optionally include `archived_sessions`; a missing optional archive is ignored, while other missing directories appear in import diagnostics. Filters and form values persist through VS Code webview state, separate from the analytics database. Export contains only selected task IDs when the interface supplies them.

## Sources

Protocol verified against the locally installed Codex CLI `0.169.0-alpha.11.1` generated TypeScript bindings and the [official App Server documentation](https://learn.chatgpt.com/docs/app-server). `initialize`, `initialized`, then `account/rateLimits/read` are the only outgoing protocol methods. A separate stdio process does not observe other clients' turn events; existing tasks are collected from local rollout JSONL journals. Local journal schemas are version-dependent; unknown records are ignored. The importer handles `session_meta`, `turn_context`, `event_msg` task boundaries/token counts, and function/custom tool calls/results.

## What a number means

- Token fields are official cumulative counter deltas, not character-to-token estimates. Cached input is included in input; reasoning output is included in output and not added twice. Counter regression marks a gap.
- Duration is the interval between journal task boundaries, including tool waits. Missing completion is not assigned a duration. Per-stage duration is unavailable in this adapter.
- Five-hour/week identity comes from 300/10080-minute windows, never primary/secondary position alone. Missing or differently sized windows stay unavailable. Snapshots are timestamps from the journal; manual live reads are not retroactively assigned to tasks.
- Quota difference is in percentage points with a conservative ±1-point rounding interval, not the relative percentage change. A zero difference does not mean zero cost. Stale starting/ending snapshots, missing records, overlaps and mixed categories downgrade the observation; reset/bucket changes invalidate it. Account-wide contributions from unobserved clients remain possible even for bounded observations.
- Normalization uses bounded, single-operation observations with positive measured denominators. Mixed tasks retain task-level aggregate costs and are not divided arbitrarily among labels. There is no cost per fixed defect or per retry without a reliable denominator.
- Patch metrics are derived only from `apply_patch` calls with an explicit successful result. File counts count change events, not unique file paths. Added/deleted lines are patch lines; replacement lines are not invented as a third exact count. Creation characters count Unicode code points with normalized LF. Generic command writes are not measured. Reading a file via a command does not establish how much text reached the model.
- Detected tool failures are a lower bound based on explicit exit-code markers. Repeated reads/tests are exact repeated tool-argument fingerprints, not semantic retry counts. Completion is a protocol status, not verified task success. Dollar cost, credits consumed per task and retry-only costs remain unavailable.

## Statistics and forecasts

Mean, interpolated empirical percentiles, sample standard deviation, sample count, approximate two-sided Student-t mean intervals (normal/independent-sample assumption) are provided. These intervals describe the mean, not individual predictions. Single observations have no confidence interval.

Forecasts select complete non-gap single-category tasks from the exact model (and project if supplied). Each recorded target is normalized by the chosen positive volume and scaled to requested volume. Five observations are required separately per target. P10/P90 are empirical prediction bounds, fit probability is the fraction of scaled historical costs below the supplied remaining quota. This is not a calibrated probability on a new project. Complexity, future retries and project size are accepted but no learned effect is claimed or applied. The deterministic held-out unit fixture verifies mechanics, not real-world forecast accuracy; larger real-world holdout evaluation is still needed.

Burn estimates use chronological unique snapshots and at least five nonnegative intervals longer than a minute within the same current quota window. Mean percentage points/hour, daily extrapolation, exhaustion timestamp and empirical frequency of reaching the limit before reset assume observed pace continues. They can be biased by idle time or other clients. Current window must not already be expired.

## Storage and operational limits

sql.js provides portable SQLite in WASM, avoiding native Node ABI dependencies on Windows. Parsing, SQL operations and writes run in a worker thread. The database is atomically replaced from an in-memory snapshot, suitable for personal histories; it is not designed for multiple VS Code processes writing simultaneously or unbounded multi-gigabyte archives. Keep one active importing VS Code window. Checkpoints store complete normalized tasks and safe parser state, byte offsets and a prefix hash. Incomplete final lines are re-read after append. Truncation or prefix replacement triggers re-import. In-place rewrites beyond the prefix are outside the append-only journal assumption.

Project paths are hashed but technical session/turn IDs and timestamps remain potentially identifying; exports contain the same aggregates. Settings and financial inputs are not exported into the analytics database. CSV protects spreadsheet formula prefixes. Webview uses a restrictive CSP and text-only rendering of imported values.

## Remaining scope

### Alpha 2 refinements

Quota burn now uses total observed percentage-point increase divided by total observed time. The empirical hit frequency is also weighted by interval duration. Snapshots older than five minutes do not produce an exhaustion forecast. Task forecasts use up to the latest 100 compatible observations and reject training volumes outside one quarter to four times the requested volume, limiting unsupported extrapolation. These bounds do not establish real-world accuracy; the deterministic holdout fixture still verifies mechanics only.

Duplicate task records prefer a completed observation over an incomplete copy. Overlap detection uses sorted intervals and a running maximum end time, avoiding the previous full pairwise scan. Token counters must be nonnegative safe integers and cached input cannot exceed total input.

### Alpha 3 refinements

Quota prediction bounds include the observed rounding bounds. Fit frequency counts historical upper cost bounds that fit, with a Wilson interval describing finite-sample uncertainty. Similar-task capacity uses the empirical P90 upper cost, not the median. Only fresh, unexpired App Server snapshots supply remaining quotas.

Temporal validation evaluates up to 30 later tasks from the latest 500 eligible observations. Training records must finish before the held-out task starts; at least five compatible observations are required. MAE and empirical coverage describe this historical check, not guaranteed future accuracy. This is a bounded rolling evaluation, not a claim of independent scientific validation.

Completed tasks now occupy separate SQLite rows, while checkpoints retain only incremental parser state. Legacy databases receive a one-time local backup before migration. Writes use an exclusive PID lock; an active competing writer receives an explicit error. An abandoned lock is recovered only when its recorded process is gone. History displays 50 rows per page. A synthetic 10,000-task storage benchmark is available through `node scripts/benchmark.cjs`; its results are specific to the execution machine and do not measure forecast accuracy. The database and complete aggregate dataset are still loaded in memory, so unbounded archives remain outside the tested scale.

No reliable programming-language or semantic complexity filter exists without a trusted source. No semantic defect count, task-success verifier, causal operation-cost attribution, automatic official pricing feed, real retry-cost allocation or reset purchasing is implemented. These are explicitly unavailable rather than fabricated. A remote GitHub repository and Marketplace publication require account access and a real publisher identity.
