# Voxygen UI / Theme QA

Дата: 15 ноября 2026  
Проверяемая база: `main` (theme token migration; текущий HEAD фиксируется при ручном QA)  
Статус: automated checks — green; manual Telegram WebView visual pass — pending.

## 1. Автоматические проверки (CI)

Workflow `.github/workflows/validate.yml` выполняет:
- `npm test` — Node.js regression tests;
- `npm run build` — production-сборка React/Vite;
- `node --check bot/src/worker.js` — синтаксис Worker;
- Wrangler deploy dry-run — проверка bundling backend.

Theme-specific automated coverage:
- Vox зарегистрирован и является default;
- нормализация ID, неизвестные/невалидные значения и fallback;
- обязательные семейства theme tokens и legacy aliases;
- root theme host и наличие общих UI primitives;
- reduced-motion override;
- разделение семантических ролей и protected content color;
- token contract для Button/IconButton, Field/TextAreaField/SelectField, ToggleField;
- token contract для SectionTitle, reactBtn, AvatarHead и ScoreBadge presets;
- сохранение семантических цветов curator/community score badges и активной реакции.

## 2. Ручная проверка в Telegram WebView (обязательна перед визуальным релизом)

Использовать актуальную production-подобную сборку и тестовый аккаунт. Не выполнять destructive/financial actions на реальных данных.

### Общее отображение
- [ ] Запуск Mini App из Telegram; нет пустого экрана, ошибок загрузки и горизонтального overflow.
- [ ] Первый экран/карта корректно помещаются в узкий viewport (320–360 CSS px).
- [ ] Проверить обычную высоту экрана, landscape и появление/скрытие клавиатуры.
- [ ] Safe-area / нижняя навигация / системные панели Telegram не перекрывают контент.
- [ ] Шрифты загружаются; при сбое font fallback сохраняет читабельность.

### Карта и навигация
- [ ] Карта отображается, тайлы загружаются, zoom/pan работают.
- [ ] Переходы между картой, списком и основными разделами не ломают layout.
- [ ] Карточки/панели поверх карты читаемы и не перекрывают необходимые map controls.
- [ ] Ошибки/загрузка/пустое состояние имеют корректное отображение.

### Компоненты и состояния
- [ ] Primary/secondary/danger buttons: normal, pressed, disabled.
- [ ] Icon buttons имеют accessible name и заметный focus-visible.
- [ ] Fields: label, hint, error, invalid, disabled; длинный текст и ввод с клавиатуры.
- [ ] Select, textarea, slider, toggle, segmented controls: touch, keyboard, state feedback.
- [ ] Surface cards и вложенные панели: контраст, границы, отсутствие обрезки.
- [ ] Dialogs/sheets: открытие, закрытие, backdrop, scroll, viewport-fit, повторное открытие.

### Контент и функциональные регрессии
- [ ] Gem сохраняет свой контентный цвет; пользовательские цвета территорий не перекрашиваются.
- [ ] Minecraft formatting и пользовательские изображения/данные остаются неизменными.
- [ ] Theme styling не меняет права, состояния, бизнес-логику и действия.
- [ ] Проверить ключевые сценарии чтения/создания/редактирования в доступных разделах.

### Доступность и движение
- [ ] Все интерактивные элементы доступны с клавиатуры; focus не теряется и не скрыт.
- [ ] Кнопки/иконки понятны без цвета; ошибки имеют текстовое обозначение.
- [ ] Проверить системную настройку Reduce Motion: интерфейс остается функциональным без выраженных анимаций.
- [ ] Контраст текста и focus indicator достаточен на всех поверхностях.

## 3. Desktop / browser sanity
- [ ] 768 px и широкие viewport: контент не растягивается чрезмерно, карта и панели сохраняют композицию.
- [ ] Hover не является единственным способом раскрыть действие.
- [ ] DevTools Console: нет новых runtime errors/warnings от theme/UI primitives.
- [ ] Network: нет новых 404 на CSS/font/assets.

## 4. Результат и фиксация дефектов
Для каждого дефекта записать: экран/сценарий, устройство и viewport, шаги воспроизведения, ожидаемое/фактическое, screenshot, severity (P0–P3). P0/P1 блокируют релиз. После исправления повторить сценарий и соседние regression checks.

**Ограничение:** автоматическая сборка и unit tests не заменяют визуальную проверку в реальном Telegram WebView. Ручные пункты отмечаются только после фактического прохождения.


### Theme semantic-state regression checks
- [ ] Warning action buttons use Vox's violet warning treatment and the warning contrast token, border and glow; they remain visually distinct from mint success and red danger.
- [ ] Success action buttons retain the Vox mint accent and success contrast.
- [ ] Primary actions use the primary contrast token in enabled and disabled states.
- [ ] Modal scrims and full-screen overlays use theme overlay roles.
- [ ] Minecraft formatting colors, visual-equipment palette, territory colors and gem color remain unchanged.


## 5. Additional checks for every shipped theme

Repeat the relevant visual and functional checks for each active theme, not only Vox:

- [ ] Theme appears in both personal and global theme selectors only after publication.
- [ ] Selecting a personal theme persists after closing/reopening the Mini App and after a fresh settings response.
- [ ] Global theme override applies without overwriting the user's personal selection; expiry/opt-out returns to the correct personal theme.
- [ ] Every semantic state remains distinguishable: primary, success, warning, danger, info, selected, disabled and validation error.
- [ ] Heading/display font, body font, Cyrillic glyphs, line wrapping and compact typography work on narrow screens.
- [ ] All dialogs, cards, fields, buttons, segmented controls, toggles, badges and navigation use the active theme values without residual Vox-only styling.
- [ ] Focus-visible, reduced-motion, safe areas, keyboard-open forms and overlay contrast remain correct.
- [ ] Protected content colors (gem, territory/map palette, Minecraft formatting and user-generated visuals) remain unchanged.
- [ ] Draft themes are absent from runtime selectors and rejected by API validation until explicitly published.


## 6. Final Vox pre-theme-expansion audit (pending)

The current UI corrections are documented in `DESIGN.md` and
`Functional_System.txt`. Before treating Vox as visually finalized or
creating additional themes, complete and record the following checks in the
actual Telegram Mini App:

- [ ] Verify compact 8 px textarea-to-action rhythm in territory recruitment
  and additional-information forms; confirm other TextAreaField instances
  retain their default spacing.
- [ ] Verify unselected Visual filter tags show a neutral grey outline and
  selected tags retain primary styling.
- [ ] Verify Lightbox close and territory back controls are both 44×44 px.
- [ ] Verify review publication button is primary/purple for residents and
  success/mint for inspectors; confirm both roles retain the same action
  availability and publish behavior.
- [ ] Recheck previously standardized profile/territory spacing, treasury
  button/field proportions, resident row, mint selected visual, interactive
  Telegram usernames and FixedToast stacking.
- [ ] Inspect every reusable UI family: cards/windows, buttons, icon buttons,
  inputs, textareas, tags/chips, segmented controls, toggles, navigation,
  dialogs, overlays and notifications.
- [ ] Run complete functional regression scenarios for map, territories,
  profiles, treasury/economy, purchases/inventory, reviews, screenshots,
  events, settings and Telegram integration.
- [ ] Perform a separate security review of frontend, API and Worker,
  including authentication, authorization, input validation, financial
  idempotency, rate limiting, error handling and personal-data exposure.
- [ ] Run `npm test`, `npm run build`, Worker syntax check and Wrangler
  bundle dry-run; retain the actual CI result.
- [ ] Only after defects are resolved and manual QA is signed off, create
  draft themes with `theme:create`, validate with `theme:check` and
  publish explicitly with `theme:publish`.

Automated checks and successful deployment do not mark the manual UI,
functional or security checklist as complete.
