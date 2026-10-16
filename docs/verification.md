# Результаты проверки · 16 октября 2026

Проверено локально на Node.js 26, Chromium 156, PostgreSQL 17, Redis 7 и отдельном S3-совместимом RustFS.

- В актуальном прогоне: 80 модульных / REST / инфраструктурных тестов проходят с подключёнными PostgreSQL, Redis и S3, без пропусков. Проверены регистрация по почте и телефону, scrypt, одноразовые ссылки/SMS, ограничения попыток, восстановление и отзыв сессий, ошибки доставки, назначение первого администратора через CLI, ранги и обновление старых снимков.
- Ядро `packages/core/src`: statements 100%, branches 100%, functions 100%, lines 100%.
- 11 Playwright-сценариев: сотрудник с offline/reload, руководитель и чужая команда, редактор методолога, мобильный экран 375px, axe WCAG 2/2.1 AA на результате, главная с баннерами и учебный маршрут. Дополнительно проверены поиск и фильтр команды, мобильное меню, ранги с подтверждением руководителя, перезагрузка после повышения, доступность главной и маршрута с практиками. Четыре новых сценария проверяют регистрацию/вход/восстановление по почте и SMS, сетевую ошибку без потери ввода, мобильную форму и сохранение корпоративного входа.
- Production-сборка проходит TypeScript и Vite. Предыдущий Docker-образ собран на Node.js 24 и проверен на запуск; новые формы проверены из актуальной production-сборки. В compose исправлен образ S3 на проверенный RustFS с закреплённым digest.
- `npm audit` — 0 найденных уязвимостей на момент проверки.
- Генерация персонального аватара в тестах — mock. Архитектурный баннер главной отдельно создан встроенным imagegen и сохранён в проекте. Реальный сетевой вызов платной генерации не выполнялся.
- S3 integration использует настоящее хранилище: проверены запись PNG, подписанная ссылка, запрет анонимного чтения, три отказа vision и fallback.
- PostgreSQL, включая практики, аккаунты, токены и SMS-проверки, проверен после закрытия/повторного подключения; параллельные транзакции не теряют записи.
- Redis проверен настоящими Queue/Worker/QueueEvents.

Скриншоты: [главная desktop](home-desktop.png), [главная mobile](home-mobile.png), [маршрут](route-desktop.png), [профиль desktop](profile-desktop.png), [профиль mobile](profile-mobile.png), [карточка команды](team-desktop.png), [команда mobile](team-mobile.png). Также: [ранги desktop](ranks-desktop.png), [ранги mobile](ranks-mobile.png). Новые формы: [вход desktop](auth-desktop.png), [регистрация desktop](registration-desktop.png), [регистрация mobile](registration-mobile.png), [SMS mobile](sms-mobile.png). Все имена, номера и ответы синтетические.

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

Регистрация, параметры SMTP/SMS и эксплуатационные ограничения: [authentication.md](authentication.md). Реальные письма и платные SMS не отправлялись; адаптеры доставки проверены с mock-провайдерами.
