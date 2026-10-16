# Результаты проверки · 16 октября 2026

Проверено локально на Node.js 26, Chromium 156, PostgreSQL 17, Redis 7 и отдельном S3-совместимом RustFS.

- 48 модульных / REST / инфраструктурных тестов проходят при подключённых трёх сервисах; без них три инфраструктурных теста отмечаются skip.
- Ядро `packages/core/src`: statements 100%, branches 100%, functions 100%, lines 100%.
- 5 Playwright-сценариев: сотрудник с offline/reload, руководитель и чужая команда, редактор методолога, мобильный экран 375px, axe WCAG 2/2.1 AA на результате.
- Production-сборка проходит TypeScript и Vite.
- `npm audit` — 0 найденных уязвимостей на момент проверки.
- Изображение модели в тестах — mock. Реальный сетевой вызов платной генерации не выполнялся.
- S3 integration использует настоящее хранилище: проверены запись PNG, подписанная ссылка, запрет анонимного чтения, три отказа vision и fallback.
- PostgreSQL проверен после закрытия/повторного подключения; параллельные транзакции не теряют записи.
- Redis проверен настоящими Queue/Worker/QueueEvents.

Скриншоты: [профиль desktop](profile-desktop.png), [профиль mobile](profile-mobile.png), [карточка команды](team-desktop.png), [команда mobile](team-mobile.png). Все имена и ответы синтетические.

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
