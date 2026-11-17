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
- [ ] Warning action buttons use the Vox mint treatment and shared mint contrast/border/glow; caution remains clear through wording and iconography, never a new gold or violet hue.
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
