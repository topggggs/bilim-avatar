# Результаты проверки · 16 октября 2026

Проверено локально на Node.js 26, Chromium 156, PostgreSQL 17, Redis 7 и отдельном S3-совместимом RustFS.

- 48 модульных / REST / инфраструктурных тестов проходят при подключённых трёх сервисах; без них три инфраструктурных теста отмечаются skip.
- Ядро `packages/core/src`: statements 100%, branches 100%, functions 100%, lines 100%.
- 6 Playwright-сценариев: сотрудник с offline/reload, руководитель и чужая команда, редактор методолога, мобильный экран 375px, axe WCAG 2/2.1 AA на результате, главная с баннерами и учебный маршрут. Дополнительно проверены поиск и фильтр команды, мобильное меню и доступность главной.
- Production-сборка проходит TypeScript и Vite. Docker-образ собран на Node.js 24; проверены старт, HTML, health и вход в демонстрационный аккаунт.
- `npm audit` — 0 найденных уязвимостей на момент проверки.
- Генерация персонального аватара в тестах — mock. Архитектурный баннер главной отдельно создан встроенным imagegen и сохранён в проекте. Реальный сетевой вызов платной генерации не выполнялся.
- S3 integration использует настоящее хранилище: проверены запись PNG, подписанная ссылка, запрет анонимного чтения, три отказа vision и fallback.
- PostgreSQL проверен после закрытия/повторного подключения; параллельные транзакции не теряют записи.
- Redis проверен настоящими Queue/Worker/QueueEvents.

Скриншоты: [главная desktop](home-desktop.png), [главная mobile](home-mobile.png), [маршрут](route-desktop.png), [профиль desktop](profile-desktop.png), [профиль mobile](profile-mobile.png), [карточка команды](team-desktop.png), [команда mobile](team-mobile.png). Все имена и ответы синтетические.

Автоматическая проверка доступности не заменяет ручную проверку с экранным диктором. Safari, Samsung Internet, старые Android/iOS, нагрузочные показатели на инфраструктуре заказчика, реальный Bilim SSO и модель изображений остаются непроверенными.

Восстановление результата локальных команд:

```bash
npm ci
npm run test:coverage
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

Инфраструктурные тесты активируются `TEST_DATABASE_URL`, `TEST_REDIS_URL`, `TEST_S3_ENDPOINT`; см. README. GitHub CI запускает стандартные проверки и PostgreSQL/Redis. Публичные данные сотрудников и секреты в репозиторий не включаются.

Документация провайдера, использованная при реализации: [Images API](https://developers.openai.com/api/reference/resources/images/methods/generate), [Images and vision](https://developers.openai.com/api/docs/guides/images-vision). Docker-конфигурация S3 следует [официальной документации RustFS](https://docs.rustfs.com/en/installation/container).

План следующих доработок: [roadmap.md](roadmap.md). Источник визуального направления, файл баннера и промпт: [visual-assets.md](visual-assets.md).
