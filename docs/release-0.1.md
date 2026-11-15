# Codex Analytics 0.1 — Alpha

First installable alpha of the local-first VS Code extension.

## Install / Установка

Download `codex-analytics-0.1.0.vsix` below. In VS Code choose **Extensions → … → Install from VSIX**, then open the Analytics Activity Bar icon or run **Codex Analytics: Open Dashboard**.

Скачайте VSIX ниже и установите через **Extensions → … → Install from VSIX**. Откройте Analytics слева или команду **Codex Analytics: Open Dashboard**.

## Included

- Incremental Codex journal import in a worker thread, portable local SQLite/WASM storage.
- Official App Server quota reads using existing Codex authentication.
- Token deltas, observed operation metrics, quota reset/overlap checks and rounding bounds.
- Nine analytical sections, history filters, empirical forecasts and manually priced finance scenarios.
- CSV/JSON export; prompts, source code and authentication tokens are not stored in the analytics database.
- English/Russian documentation, MIT license and Windows/Linux CI packaging.

## Validation

16 automated tests passed locally. All nine UI sections rendered in headless Edge. The VSIX installation was verified with an isolated VS Code profile. Local journal integration imported 3 files / 73 tasks at the time of the check. No private session data is included in this repository or release.

## Alpha limitations / Ограничения

Quota deltas are account-wide observations, not exact per-operation billing. Unobserved clients may contribute. Missing metrics stay unavailable. Tool classification is heuristic; task completion is not proof of success. Reliable read-volume/defect/semantic-retry counts are unavailable from generic shell logs. Complexity, project size and future retries do not yet have trained coefficients. Forecasts need at least five suitable observations per target and are not guarantees. Only one importing VS Code window should write to the local database at a time.

Это альфа-версия: часть метрик недоступна, прогнозы требуют локальной истории. Подробности см. в README.ru.md и docs/measurement.md.
