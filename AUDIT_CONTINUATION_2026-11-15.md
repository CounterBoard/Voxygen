# Voxygen — продолжение полного аудита

**Дата:** 15 ноября 2026  
**Основной репозиторий:** [CounterBoard/Voxygen](https://github.com/CounterBoard/Voxygen)  
**Ветка для документационных изменений:** `docs/functional-system-audit-2026-11-14`  
**Основная ветка реализации:** `main`

## 1. Результат этого прохода

Проведена дополнительная сверка:
- структуры основного репозитория и его текущих refs;
- конфигурации GitHub Actions в main и документационной ветке;
- package.json и состава корня репозитория;
- набора автоматических тестов;
- деклараций таблиц и триггеров основного Worker;
- репозиториев Voxygen-map-storage и Voxygen-map-assets;
- доступных метаданных последних CI runs и Release assets.

Изменения внесены только в документацию. Функциональный код, production-конфигурация, secrets и deployments не изменялись.

## 2. Подтверждённые результаты

### 2.1 CI основного приложения

Текущий workflow `.github/workflows/validate.yml` в `main`:
1. запускает Node.js 22;
2. устанавливает зависимости через `npm install --no-audit --no-fund`;
3. выполняет `npm test`;
4. выполняет `npm run build`;
5. проверяет синтаксис Worker через `node --check`;
6. выполняет Wrangler dry-run с версией 4.162.0.

Последний доступный run на main — [43636662377](https://github.com/CounterBoard/Voxygen/actions/runs/43636662377), conclusion: success.

Два более ранних run — [43636579700](https://github.com/CounterBoard/Voxygen/actions/runs/43636579700) и [43636502618](https://github.com/CounterBoard/Voxygen/actions/runs/43636502618) — завершились ошибкой на шаге `Run unit tests`. Последующие запуски прошли успешно. Точная причина двух исторических сбоев по доступным метаданным не установлена.

### 2.2 Воспроизводимость зависимостей

В корне main найден `package.json`, но не найден `package-lock.json`. Зависимости объявлены диапазонами с caret, а CI использует `npm install`, не `npm ci`.

**Риск:** состав транзитивных зависимостей может изменяться между CI-запусками.  
**Рекомендация:** добавить и коммитить lock-файл, затем перейти на `npm ci`.

### 2.3 Тестовое покрытие

В main найдено 18 файлов `tests/*.test.js`. Тесты охватывают авторизацию, RBAC, территории, менеджерские переходы, удаление аккаунтов и deletion locks, финансовую атомарность, банковскую безопасность, визуальные предметы, webhook и координаты карты.

В Worker найдены 37 деклараций `CREATE TABLE IF NOT EXISTS` и 47 деклараций `CREATE TRIGGER IF NOT EXISTS`.

**Граница:** тесты не заменяют запуск миграций на реальной копии старой D1, конкурентные испытания D1 batch или end-to-end тестирование внешних Telegram side effects.

Отдельного набора browser/component tests для React-интерфейса в репозитории не обнаружено. Текущий workflow не запускает браузерные сценарии Telegram WebView, полные end-to-end пользовательские пути или production smoke tests.

### 2.4 Различия CI-конфигурации веток

В `main` используются actions major v5 и закреплённый Wrangler 4.162.0. В документационной ветке workflow использует actions major v4 и `wrangler@latest`; сама документационная ветка не включена в push-фильтр.

Эти конфигурации неэквивалентны. В качестве действующего CI следует рассматривать workflow из main.

### 2.5 Расхождение Git refs

На момент проверки:
- main: `e21a99958afb9657ef871945a73bba7fe41c258d`;
- docs: `ec38e060439938306f342b33d698493978e233f4`.

Git compare сообщил состояние `diverged`: main ahead by 264 commits, docs branch ahead by 58 commits относительно main. Ветки разошлись, поэтому документационную ветку нельзя безусловно сливать целиком в main.

Blob `Functional_System.txt` до этого обновления совпадал в обеих ветках, но исходники и тесты в snapshots различаются. Источник истины по текущей реализации — main. Документационная ветка используется для целевых изменений документов.

### 2.6 Репозитории карты

**Voxygen-map-storage**
- Git tree содержит README.md и не содержит исходников приложения/генератора.
- GitHub Release `world-map` существует и содержит четыре image assets (три PNG и один JPEG).
- Репозиторий фактически служит Release-хранилищем исходных карт; отсутствие файлов изображения в Git tree не означает отсутствия Release assets.

**Voxygen-map-assets**
- содержит `tools/build_map.py`, `tools/download_release_asset.py`, статический Worker, контракт загрузчика, README и Python tests;
- последний доступный validation run [43601352291](https://github.com/CounterBoard/Voxygen-map-assets/actions/runs/43601352291) завершился успешно;
- GitHub Release в этом репозитории на момент проверки не обнаружен; публикация ресурсов выполняется workflow в Cloudflare Worker. Workflow сериализует запуски через concurrency group world-map-publish, но Pillow и requests устанавливаются без закреплённых версий. Генератор не запрещает повторное использование mapVersion, что может конфликтовать с годовым immutable cache; обычный backend-путь создаёт версию из timestamp-имени Release asset.

Production endpoints обоих Worker не удалось проверить через доступный публичный web-инструмент. HTTP status, реальные CORS/cache headers, manifest, preview, tiles и рендер карты в Telegram WebView остаются непроверенными.

## 3. Открытые направления аудита

| Приоритет | Область | Что ещё требуется |
|---|---|---|
| Высокий | D1 migrations | Прогон всех миграций на старой базе, повторный запуск, частичный сбой и совместимость |
| Высокий | Конкурентность | Двойные финансовые запросы, webhook replay, гонки удаления аккаунта и пользовательских действий |
| Высокий | API/RBAC | Полная матрица клиентский вызов → маршрут → метод → payload → роль → ответ |
| Высокий | Frontend | Browser/component tests, ошибки сети, таймауты, отмена и повтор запросов, мобильный WebView |
| Средний | Telegram | Повторная доставка, rate limits, ошибки Telegram API и идемпотентность side effects |
| Средний | Map pipeline | Production smoke, сбой публикации, повторный dispatch, конкурирующие mapVersion |
| Средний | Operations | Backup/restore D1, мониторинг, алерты, логирование и восстановление |
| Средний | CI | Lock-файл и детерминированная установка |

## 4. Ограничения проверки

- Проверка GitHub подтверждает состояние файлов и метаданных на момент чтения, но не гарантирует текущее production-состояние.
- Успешный CI подтверждает только те команды, которые реально перечислены в workflow.
- Наличие секрета в конфигурации не доказывает наличие или корректность его значения.
- Production endpoints и Telegram WebView в этом проходе не были проверены.
- Функциональные изменения не вносились.

## 5. Изменения документации

Результаты добавлены в `Functional_System.txt` как разделы 34.63–34.67. Этот файл и данный отчёт обновлены в документационной ветке. Текущая реализация продолжает документироваться относительно `main`.

**Статус:** дополнительный статический проход завершён; полный аудит остаётся открытым до выполнения интеграционных, конкурентных и production/runtime проверок.


## 6. Дополнительный аудит D1 migrations (15 ноября 2026)

Проверена актуальная реализация в main commit `e21a99958afb9657ef871945a73bba7fe41c258d`, в том числе `bot/src/worker.js`, `bot/schema.sql` и существующие account cleanup/deletion tests.

### Архитектура

Отдельной директории миграций нет. `bot/schema.sql` — базовая схема и прямо делегирует обновление существующих баз Worker-коду. Основная миграция реализована в `initializeWorldTables()`:
- marker: `voxygen_schema_meta.world_schema_version`;
- текущая версия: `2026-11-v37`;
- при совпадении версии инициализация пропускается;
- marker записывается только в конце основной последовательности;
- `ensureWorldTables()` кэширует Promise через WeakMap и удаляет его при ошибке, чтобы допустить повторный запуск.

Дополнительные схемы инициализируются отдельными функциями (в частности, preferences, events, manager changes, map settings); recruitment использует отдельный version marker.

### Найденные риски

**Высокий — частичный перенос `city_memberships`.** Старую таблицу переносят в `city_memberships_multi`: CREATE → INSERT OR IGNORE → DROP старой таблицы → RENAME временной. Эти действия не объединены в одну транзакцию. Если процесс прервётся после DROP, повторный запуск может создать пустую `city_memberships`, увидеть уже составной PK и пропустить восстановительный перенос. Промежуточная таблица с данными останется отдельно, а приложение будет читать пустую таблицу. Это вывод из последовательности кода; production-инцидент не утверждается.

**Средний/высокий — backfill без обязательного успеха.** UPDATE для заполнения `comments.author_mc_nickname` и `screenshots.author_mc_nickname` перехватывают ошибку, логируют её и продолжают. Основной marker версии после этого всё равно может быть записан. При следующем запуске миграция уже пропустится по marker, поэтому backfill не будет автоматически повторён.

**Общий риск — отсутствие общей транзакции.** Основная последовательность содержит множество DDL/DML операций без единой транзакционной границы. Marker в конце и идемпотентные CREATE/ALTER guards помогают восстановлению, но не делают все data migrations атомарными.

### Тесты и доказательная база

В main присутствуют тесты очистки аккаунта и deletion lock. Например, `account-cleanup.test.js` проверяет порядок и распространение ошибок с помощью mock D1. Но отдельный migration harness для запуска нескольких исторических D1 schema snapshots, повторного применения, fault injection между DDL-шагами и проверки сохранности данных не обнаружен. Наличие статических source assertions не доказывает реальное поведение SQLite/D1.

### Рекомендуемые действия

1. Переписать перенос `city_memberships` как атомарную последовательность D1 batch/транзакции с корректным восстановлением при повторном запуске.
2. Добавить fault-injection тесты после каждого этапа переноса и проверять все строки, а не только схему.
3. Сделать обязательные backfill операции блокирующими фиксацию schema version либо вести отдельный retryable progress marker.
4. Создать integration suite с legacy schema snapshots и проверками повторного запуска, индексов, triggers и целостности данных.
5. Разделить миграции на упорядоченные именованные версии и документировать bootstrap/recovery/backup/restore.

### Границы проверки

Production D1 не читалась и миграции реально не запускались. Не подтверждены применённая production schema version, наличие промежуточных таблиц, фактическое восстановление после D1 failure и backup/restore. Изменения внесены только в документацию; исходники, D1, secrets и deployments не менялись.



## 7. API audit: App.jsx ↔ Worker

Проверка выполнена по main commit `e21a99958afb9657ef871945a73bba7fe41c258d`; проверены `src/App.jsx`, `bot/src/worker.js` и `tests/route-auth-matrix.test.js`.

### Сопоставление маршрутов

В App.jsx найдено 67 строковых call-site с `fetch` и `/api/` (62 прямых литеральных URL в более узком разборе; остальные формы используют динамические URL/обёртки). В Worker обнаружено 84 строки dispatch-условий, включая разные методы и динамические пути. Прямые клиентские URL и методы сопоставлены с соответствующими Worker route branches. Несовпадений URL или HTTP-методов в проверенных прямых вызовах не выявлено. POST-совместимые aliases для admin/users/update, admin/users/delete, comments/update и comments/delete присутствуют в Worker.

Основные группы: профиль и территории; администрирование пользователей и инспекторов; отзывы/комментарии/скриншоты; события и напоминания; казна; пользовательские и глобальные настройки; карта; кастомизация и достижения. Карта/tiles используют отдельный map-assets Worker, а `/api/map` основного Worker обслуживает настройки/источник карты.

### Авторизация

Telegram initData проверяется сервером по HMAC; проверяется auth_date (не старше 24 часов, с ограничением будущей даты). Обработчики используют requireUser, requireVerifiedUser, requireMainInspector и isTerritoryManager. Публичные read-only маршруты (например, FAQ, рейтинги, комментарии, одобренные скриншоты и публичный просмотр событий) отделены от закрытых операций. GET /api/events с manage=1 дополнительно требует главного инспектора.

### Выявленные пробелы

- `tests/route-auth-matrix.test.js` содержит 71 кейс анонимного запроса с ожиданием 401.
- В тестовой матрице отсутствуют три защищённых GET, которые требуют requireUser: `GET /api/user-settings`, `GET /api/home-feature-button`, `GET /api/customization/city`.
- Матрица проверяет отсутствие initData, но не является полной матрицей ролей. Нужны негативные сценарии для обычного пользователя, инспектора, главного инспектора, менеджера чужой территории и неподтверждённого Minecraft-профиля.
- Условный security risk: код разрешает задать `INSPECTOR_CHAT_ID` как username и тогда сравнивает Telegram username. Production значение не проверялось. Для административной идентичности следует использовать только числовой Telegram ID.

### Приоритеты

1. Добавить три отсутствующих GET auth tests.
2. Расширить role/territory authorization matrix и проверять отсутствие побочных D1 изменений при отказе.
3. Проверить production `INSPECTOR_CHAT_ID` и исключить username-based admin identity.
4. Добавить интеграционные проверки payload/response и Telegram WebView E2E.
5. Провести production smoke check после сверки deployed Worker с проверенным commit.

### Границы

Это статический source audit. Production API, deployed commit, production secret/config и Telegram Android WebView не проверялись. Функциональные исходники, D1, secrets и deployments не менялись; обновлена только документация.


## 8. Углублённый аудит API-контрактов

Проверены актуальные main-файлы `src/App.jsx`, `bot/src/worker.js`, все 18 тестовых файлов и документационная ветка. Main commit: `e21a99958afb9657ef871945a73bba7fe41c258d`.

### Контракты клиента и сервера

Прямые клиентские URL и методы по-прежнему соответствуют Worker dispatch. JSON запросы передают initData в body и/или `X-Telegram-Init-Data`; GET использует header. Для multipart screenshot upload поле initData в FormData сервером не читается, но App.jsx также передаёт заголовок, поэтому текущий клиентский контракт корректен. Raw map upload также требует header и `X-Map-Size`.

Проверены ключевые поля и ограничения:
- rating: territoryId + четыре целых оценки 1–5, verified profile, cooldown 20 часов;
- comment: territoryId/text, verified profile, максимум 4000 символов и пять записей на пользователя/территорию;
- screenshot: multipart photo JPEG, territoryId, лимит 10 MB;
- event: валидируемый payload и requestKey с payload hash/replay semantics;
- reminder: eventId, value 1..10000, unit hours/minutes;
- treasury: territoryId, positive safe integer amount, operationId; deposit member/manager, withdraw manager, donate authenticated user;
- customization purchase: itemId/accountScope; сервер сам вычисляет доступные treasury accounts;
- city customization/additional info: manager-only с проверкой прав и длины.

### Финансовая атомарность и TOCTOU

Переводы deposit/donate/withdraw записывают operation ledger, debit, credit и статус в D1 batch. Ключ operationId проверяется на повторное использование с тем же payload; текущий клиент сохраняет ключ в local/session storage. Покупка визуала атомарно объединяет debit, inventory grant и gem spend log; повтор уже приобретённого товара не списывает баланс повторно.

Потенциальный TOCTOU: `treasuryWithdraw` проверяет manager до batch, но UPDATE казны не проверяет manager relation повторно; покупка за казну выбирает managerCities до batch, но debit statement не проверяет актуальную manager relation. Аналогично deposit проверяет membership до batch. При конкурентном отзыве прав между pre-check и batch ранее разрешённая операция может завершиться. Это статически видимое конкурентное окно, не воспроизведённый production exploit. Рекомендация — повторять owner/manager/member predicate в debit SQL.

Backend допускает отсутствие operationId для старых клиентов и генерирует новый UUID; повтор запроса такого legacy клиента не гарантированно идемпотентен. Текущий App.jsx для финансовых endpoint передаёт устойчивый ключ.

### Побочные эффекты при отказе

Финансовые endpoint и purchaseCustomizationItem могут создавать нулевые строки user_currency/city_treasury до проверки operationId, item или баланса. При отказе эти вспомогательные строки могут остаться. Баланс и выдача предмета при этом защищены атомарным batch — это не подтверждённое частичное списание, а побочная инициализация D1.

Screenshot upload сначала отправляет изображение в Telegram и только затем вставляет запись screenshots в D1. При сбое INSERT Telegram-фото/сообщение может остаться без записи в приложении. Не найден request key или компенсационный механизм для такого случая.

Создание event резервирует event_create_requests до batch вставки события. Reservation может остаться processing после сбоя, но повтор с тем же requestKey/payload может продолжить операцию.

### Ошибки и тесты

Worker JSON envelope использует `ok/error/code`, удаляет публичное `details`; внешняя оболочка добавляет X-Request-ID и Server-Timing. App.jsx переводит известные HTTP-статусы в пользовательские сообщения. Бинарные image/file routes являются ожидаемыми исключениями из JSON envelope.

В tests есть 18 файлов; route-auth-matrix содержит 71 анонимный 401-кейс, auth-response проверяет три настоящих Worker.fetch ответа, financial-atomicity преимущественно проверяет исходные фрагменты D1 batch, security-and-bank использует fake D1. Полной API contract suite для валидной Telegram подписи, схем request/response, отказов и отсутствия побочных изменений D1 не обнаружено.

### Приоритеты

1. Встроить актуальную проверку manager/member в финансовые debit statements и покрыть отзыв прав конкурентным тестом.
2. Сделать screenshot upload восстанавливаемым через request key/outbox или компенсацию.
3. Убрать или документировать побочную инициализацию нулевых финансовых строк при отказе.
4. Добавить event requestKey replay/fault-injection tests.
5. Добавить сквозные API contract tests для payload, response, auth, RBAC и D1 side effects.

### Границы

Это статический source/test audit. CI не запускался. Production API, deployed Worker revision, production D1/secrets и Telegram Android WebView не проверялись. Функциональные исходники, D1, secrets и deployments не изменялись; редактировалась только документация.


## 9. Закрытие доступных проверок и остаточные runtime-границы

### GitHub Actions

Проверен `.github/workflows/validate.yml` на main commit `e21a99958afb9657ef871945a73bba7fe41c258d`. Последний run `43636662377` (run 352) — success. Job log подтверждает 139/139 тестов, успешные Vite build, Worker syntax check и Wrangler 4.162.0 dry-run.

Два предыдущих красных run `43636502618` и `43636579700` завершились на двух assertions, ожидавших schema v36, хотя Worker в commit `f18e7fa...` уже перешёл на v37. Commit `0f0dea0...` синхронизировал assertions; run 350 и следующие runs успешны. Это закрытый временный CI mismatch, не текущий failing test.

Workflow содержит только backend Worker dry-run, а не production deploy.

### Конфигурация и production

В `bot/wrangler.toml` задекларированы Worker `voxygen`, D1 binding `DB` (database_name `voxygen`), cron раз в минуту и включённые observability logs. Корневой `wrangler.jsonc` задаёт assets-only Worker `voxygenebot`. Это repository config, не доказательство активной Cloudflare production конфигурации.

GitHub connector не предоставляет Cloudflare deployment state/secrets API; Cloudflare connector недоступен. Публичные Worker URLs не удалось проверить из web-fetch среды; прямой запрос из контейнера остановился на DNS resolution failure. Это не означает, что production недоступен.

Worker source использует env bindings `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `INSPECTOR_CHAT_ID`, `BANKER_TELEGRAM_ID`, `GITHUB_TOKEN`, `MAP_PIPELINE_GITHUB_TOKEN` и D1 `DB`; фактические значения не читались. Тесты подтверждают fail-closed webhook при отсутствующем/неверном secret, но не наличие корректного production secret.

Production D1 не открывалась: не проверялись schema marker, triggers, данные, миграции, integrity, backup или restore. Wrangler dry-run и fake D1 не являются production D1 validation.

### Android / browser E2E

В main нет Playwright/Puppeteer/Cypress/Appium/Detox/WebView/Android E2E файлов или browser automation dependency. Android Telegram WebView, file chooser/photo upload, viewport/keyboard/back navigation и deep links не тестировались. Это gap тестовой инфраструктуры, не установленный UI bug.

### Итог

Закрыто: актуальный CI зелёный, 139/139 tests, build, syntax, backend Wrangler dry-run. Не закрыто: production deployment revision, live API/map endpoints, Cloudflare secrets, production D1 state и Telegram Android WebView E2E. Для них требуется read-only Cloudflare access и контролируемая mobile test environment. Никакие функциональные исходники, runtime config, secrets, D1 или deployment не менялись.
