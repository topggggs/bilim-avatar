import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function auth(page: Page, role = 'employee') {
  await page.request.post('/api/auth/demo', {
    headers: { Origin: 'http://localhost:3011' },
    data: { userId: role },
  });
}
async function navigate(page: Page, name: string) {
  await expect(page.locator('.site-header')).toBeVisible();
  const menu = page.getByRole('button', { name: /Разделы/ });
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) !== 'true')
    await menu.click();
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
}
async function create(page: Page) {
  await page.getByRole('button', { name: 'Создать аватара', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByRole('button', { name: 'К тесту' }).click();
}
test('сотрудник: offline, reload, 15 вопросов, равные качества, профиль, аватар и 90 дней', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await auth(page);
  await page.goto('/');
  await navigate(page, 'Мой профиль');
  await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
  expect(await page.locator('.profile-shell').count()).toBe(1);
  expect(
    await page.locator('.site-header').evaluate((element) => element.getBoundingClientRect().width),
  ).toBe(await page.evaluate(() => window.innerWidth));
  expect(
    await page
      .locator('.content')
      .evaluate((element) => getComputedStyle(element, '::before').backgroundImage),
  ).toContain('academy-architecture.png');
  await create(page);
  const answer =
    'Сверю факты с проектом, проверю риски, согласую безопасный план и зафиксирую результат.';
  const field = () => page.getByRole('textbox', { name: 'Ваш ответ', exact: true });
  await expect(page.getByRole('button', { name: 'Далее', exact: true })).toBeDisabled();
  await field().fill('Коротко');
  await expect(page.getByRole('button', { name: 'Далее', exact: true })).toBeDisabled();
  await field().fill(answer);
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  const offlineAnswer = answer + ' Отмечу замечания в журнале.';
  await field().fill(offlineAnswer);
  await expect(page.getByText('Сохранено на устройстве', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Продолжить тест', exact: true }).click();
  await expect(field()).toHaveValue(offlineAnswer);
  await page.getByRole('button', { name: 'Сохранить и выйти' }).click();
  await page.getByRole('button', { name: 'Продолжить тест', exact: true }).click();
  await expect(field()).toHaveValue(offlineAnswer);
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: 'Продолжить тест', exact: true }).click();
  await expect(field()).toHaveValue(offlineAnswer);
  for (let i = 2; i < 8; i++) {
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await field().fill(answer);
  }
  const progressBar = page.locator('.question-progress > span');
  const progressAtQuestionEight = await progressBar.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  for (let i = 0; i < 7; i++)
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
  const progressAtQuestionOne = await progressBar.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(progressAtQuestionOne).toBeLessThan(progressAtQuestionEight);
  await field().fill(answer + ' Запишу результат.');
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await field().fill(answer);
  for (let i = 2; i < 15; i++) {
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await field().fill(answer);
  }
  await page.screenshot({ path: 'docs/written-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: 'docs/written-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Отправить на анализ', exact: true }).click();
  await expect(page.getByText('ИИ анализирует ответы…', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Главное качество', { exact: true }).selectOption('critical');
  await page.getByLabel('Знак отличия', { exact: true }).selectOption('confidence');
  await page.getByRole('button', { name: 'Создать аватара' }).click();
  await expect(page.getByRole('heading', { name: 'Лис-стратег', exact: true })).toBeVisible();
  const qualityMeters = page.locator('.qualities-panel').getByRole('meter');
  await expect(qualityMeters).toHaveCount(4);
  expect(await qualityMeters.nth(0).getAttribute('aria-valuenow')).toBe('50');
  expect(await qualityMeters.nth(1).getAttribute('aria-valuenow')).toBe('50');
  expect(await qualityMeters.nth(2).getAttribute('aria-valuenow')).toBe('38');
  expect(await qualityMeters.nth(3).getAttribute('aria-valuenow')).toBe('50');
  const profile = await (await page.request.get('/api/profile/employee')).json();
  expect(profile.writtenReview.items[0].answer).toBe(answer + ' Запишу результат.');
  expect(profile.writtenReview.items[1].answer).toBe(answer);
  expect(profile.writtenReview.model).toBe('e2e-fixture');
  await expect(page.getByRole('heading', { name: 'Анализ ответов', exact: true })).toBeVisible();
  await expect(page.locator('.written-review .written-insights details > summary')).toHaveCount(4);
  await expect(page.locator('.written-review .written-insights summary').first()).toHaveCSS(
    'list-style-type',
    'none',
  );
  expect(
    await page.locator('.radar').evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThanOrEqual(340);
  await expect(page.locator('.radar-dot')).toHaveCount(4);
  await expect(page.locator('.radar-dot').first()).toHaveAttribute('role', 'img');
  await expect(page.locator('.profile-page-title .date-tag')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Сильные стороны', exact: true })).toBeVisible();
  await expect(page.locator('.insight-mark')).toHaveCount(0);
  await expect(page.locator('.strength-donut')).toHaveCount(1);
  await expect(page.locator('.strength-donut')).toHaveAttribute('role', 'meter');
  await expect(page.getByRole('heading', { name: 'Зоны роста', exact: true })).toBeVisible();
  await expect(page.locator('.growth-item')).toHaveCount(4);
  await expect(page.locator('.recommendation')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Следующие рекомендации' })).toBeEnabled();
  await page.getByRole('button', { name: 'Следующие рекомендации' }).click();
  await expect(page.locator('.carousel-progress')).toContainText('2');
  await page.getByRole('button', { name: 'Предыдущие рекомендации' }).click();
  await expect(page.locator('.carousel-progress')).toContainText('1');
  await expect(page.locator('.rec-footer .button.primary')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Пройти снова' })).toBeDisabled();
  await page.getByRole('button', { name: 'Выбрать', exact: true }).click();
  await expect(page.getByText('Аватар сохранён', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/preview.png' });
  await page.screenshot({ path: 'docs/profile-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('руководитель: только команда, профиль без ответов', async ({ page }) => {
  await auth(page, 'manager');
  await page.goto('/');
  await navigate(page, 'Моя команда');
  await page.getByRole('searchbox', { name: 'Поиск по имени или должности' }).fill('Алина');
  await expect(page.locator('.team-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Статус профиля' }).selectOption('empty');
  await expect(page.getByText('Сотрудники не найдены', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Статус профиля' }).selectOption('ready');
  await expect(page.getByRole('button', { name: /Алина Нурланова/ })).toBeVisible();
  await page.getByRole('button', { name: /Алина Нурланова/ }).click();
  await expect(page.getByRole('heading', { name: 'Алина Нурланова', exact: true })).toBeVisible();
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
  const foreign = await page.request.get('/api/profile/outsider');
  expect(foreign.status()).toBe(403);
  await page.screenshot({ path: 'docs/team-desktop.png', fullPage: true });
});
test('методолог: редактор вопросов, интерпретаций и настроек', async ({ page }) => {
  await auth(page, 'methodologist');
  await page.goto('/');
  await expect(page.getByLabel('Текст вопроса 1', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/Текст вопроса/)).toHaveCount(15);
  await page.getByRole('button', { name: 'Интерпретации', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Низкий уровень', exact: true })).toHaveCount(4);
  await page.getByRole('button', { name: 'Пороги и сроки', exact: true }).click();
  await expect(page.getByLabel('Повторный тест через, дней')).toHaveValue('90');
});
test('телефон 375px: профиль и команда без горизонтального переполнения', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await auth(page, 'employee');
  await page.goto('/');
  await navigate(page, 'Мой профиль');
  await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/profile-mobile.png', fullPage: true });
  await page.getByLabel('Демонстрационная роль').selectOption('manager');
  await navigate(page, 'Моя команда');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/team-mobile.png', fullPage: true });
});

test('доступность: профиль без нарушений WCAG AA', async ({ page }) => {
  await auth(page);
  await page.goto('/');
  await navigate(page, 'Мой профиль');
  await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
});

test('главная BI: баннеры, свой профиль, маршрут и мобильная версия', async ({ page }) => {
  await auth(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('bilim-theme', 'light'));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Стройте своё будущее', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.home-quality-card strong')).toHaveText(['50%', '50%', '38%', '50%']);
  await expect(page.locator('.home-shortcuts')).toHaveCount(0);
  await expect(page.locator('.home-hero-grid + .home-overview')).toHaveCount(1);
  await expect(page.locator('.page-bg')).toHaveCount(1);
  expect(
    await page
      .locator('.page-bg')
      .evaluate((element) => (element as HTMLElement).style.backgroundImage),
  ).toContain('feTurbulence');
  await expect(page.locator('.page-bg')).toHaveCSS('background-color', 'rgb(248, 250, 252)');
  await expect(page.locator('.home-overview')).toHaveCSS('margin-top', '32px');
  await expect(page.locator('.home-overview .section-heading')).toHaveCount(0);
  await expect(page.locator('.home-overview .home-quality-grid')).toBeVisible();
  await page.screenshot({ path: 'docs/site-preview.png' });
  await page.screenshot({ path: 'docs/home-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Начать развитие', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мой маршрут', exact: true })).toBeVisible();
  await navigate(page, 'Главная');
  await page.getByRole('button', { name: 'Следующий слайд' }).click();
  await expect(
    page.getByRole('heading', { name: 'Сильные стороны. Новые возможности.', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Следующий слайд' }).click();
  await page.getByRole('button', { name: 'К маршруту', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мой маршрут', exact: true })).toBeVisible();
  await expect(page.locator('.route-stage')).toHaveCount(4);
  await page.getByRole('button', { name: 'К модулю', exact: true }).first().click();
  await expect(page.getByRole('status')).toContainText('Модуль пока не подключён.');
  await page.screenshot({ path: 'docs/route-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await navigate(page, 'Главная');
  await expect(
    page.getByRole('heading', { name: 'Стройте своё будущее', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.home-shortcuts')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/home-mobile.png', fullPage: true });
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
});

test('ранг: выполнение практики, проверка руководителем и сохранение повышения', async ({
  page,
}) => {
  await auth(page);
  await page.goto('/');
  await navigate(page, 'Мой маршрут');
  const rank = page.getByRole('region', { name: 'Ранг развития', exact: true });
  await expect(rank.getByRole('heading', { name: 'Практик', exact: true })).toBeVisible();
  await rank.getByText('Практики для роста', { exact: true }).click();
  const task = rank.locator('.rank-task').first();
  await task.getByRole('button', { name: 'Отметить выполнение', exact: true }).click();
  await task
    .getByRole('textbox')
    .fill('Две недели проверял чертежи на объекте. Отклонения разобрали с инженером.');
  await task.getByRole('button', { name: 'На проверку', exact: true }).click();
  await expect(task.getByText('На проверке', { exact: true })).toBeVisible();
  await expect(rank.getByRole('heading', { name: 'Практик', exact: true })).toBeVisible();
  await auth(page, 'manager');
  await page.reload();
  await navigate(page, 'Моя команда');
  await page.getByRole('button', { name: /Александр Ким/ }).click();
  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Специалист', exact: true })).toBeVisible();
  await auth(page);
  await page.reload();
  await navigate(page, 'Мой маршрут');
  await expect(rank.getByRole('heading', { name: 'Специалист', exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/ranks-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(rank.getByRole('heading', { name: 'Специалист', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/ranks-mobile.png', fullPage: true });
  await rank.getByText('Практики для роста', { exact: true }).click();
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
});
test('аватар: настройка образа с превью, отмена по Esc и сохранение', async ({ page }) => {
  await auth(page);
  await page.goto('/');
  await navigate(page, 'Мой профиль');
  const image = page.locator('.avatar-stage > img');
  const before = await image.getAttribute('src');
  await page.getByRole('button', { name: 'Настроить образ' }).click();
  const dialog = page.getByRole('dialog', { name: 'Образ героя' });
  await expect(dialog).toBeVisible();
  const preview = dialog.getByRole('img', { name: 'Предпросмотр аватара' });
  const initial = await preview.getAttribute('src');
  await dialog.getByRole('button', { name: 'Кепка', exact: true }).click();
  await expect(preview).not.toHaveAttribute('src', initial!);
  const accessibility = await new AxeBuilder({ page })
    .include('.avatar-editor')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(image).toHaveAttribute('src', before!);
  await page.getByRole('button', { name: 'Настроить образ' }).click();
  await dialog.getByRole('button', { name: 'Кепка', exact: true }).click();
  await dialog.getByRole('button', { name: 'Солнцезащитные', exact: true }).click();
  await dialog.getByRole('button', { name: 'Медаль', exact: true }).click();
  await dialog.getByRole('button', { name: 'Ночь', exact: true }).click();
  await dialog.getByRole('button', { name: 'Сохранить образ' }).click();
  await expect(dialog).toBeHidden();
  await expect(image).toHaveAttribute('src', /\/image\?v=\d+$/);
  const svg = await (await page.request.get((await image.getAttribute('src'))!)).text();
  for (const part of ['headwear-cap', 'eyewear-sunglasses', 'extra-medal', 'background-night'])
    expect(svg).toContain(`data-part="${part}"`);
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.reload();
  await navigate(page, 'Мой профиль');
  await expect(image).toHaveAttribute('src', /\/image\?v=\d+$/);
});
test('тёмная тема: переключатель, запоминание, системная настройка и контраст WCAG AA', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const violations = async (target: Page = page) =>
    (
      await new AxeBuilder({ page: target }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    ).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));
  const html = page.locator('html');
  await auth(page);
  await page.goto('/');
  const toggle = page.locator('.header-actions').getByRole('button', { name: 'Тёмная тема' });
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.page-bg')).toHaveCount(1);
  expect(
    await page.locator('.page-bg').evaluate((element) => getComputedStyle(element).backgroundImage),
  ).toContain('feTurbulence');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.page-bg')).toHaveCSS('background-color', 'rgb(11, 15, 23)');
  expect(
    await page
      .locator('.page-bg')
      .evaluate((element) => (element as HTMLElement).style.backgroundImage),
  ).toContain('feTurbulence');
  await expect(page.locator('.home-overview')).toHaveCSS('margin-top', '32px');
  const colours = () =>
    page.evaluate(() => [
      getComputedStyle(document.documentElement).backgroundColor,
      getComputedStyle(document.querySelector('.site-header')!).backgroundColor,
    ]);
  expect(await colours()).toEqual(['rgb(14, 18, 27)', 'rgb(23, 28, 40)']);
  await expect(
    page.getByRole('heading', { name: 'Стройте своё будущее', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/home-dark.png', fullPage: true });
  expect(await violations()).toEqual([]);
  await navigate(page, 'Мой профиль');
  await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
  await page.screenshot({ path: 'docs/profile-dark.png', fullPage: true });
  expect(await violations()).toEqual([]);
  await page.getByRole('button', { name: 'Настроить образ' }).click();
  await expect(page.getByRole('dialog', { name: 'Образ героя' })).toBeVisible();
  expect(await violations()).toEqual([]);
  await page.keyboard.press('Escape');
  await navigate(page, 'Мой маршрут');
  await page
    .getByRole('region', { name: 'Ранг развития', exact: true })
    .getByText('Практики для роста', { exact: true })
    .click();
  expect(await violations()).toEqual([]);
  for (const [role, section] of [
    ['manager', 'Моя команда'],
    ['methodologist', 'Методика и контент'],
    ['admin', 'Администрирование'],
  ]) {
    await page.getByLabel('Демонстрационная роль').selectOption(role);
    await navigate(page, section);
    await expect(page.locator('.content')).not.toBeEmpty();
    expect(await violations(), `${role}: ${section}`).toEqual([]);
  }
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(toggle).toBeHidden();
  await page.locator('.user-trigger').click();
  const item = page.locator('.user-panel').getByRole('button', { name: 'Тёмная тема' });
  await expect(item).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/menu-dark-mobile.png' });
  await item.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  const context = await browser.newContext({ baseURL, colorScheme: 'dark' });
  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByRole('heading', { name: 'С возвращением', exact: true })).toBeVisible();
  await expect(fresh.locator('html')).toHaveAttribute('data-theme', 'dark');
  await fresh.screenshot({ path: 'docs/auth-dark.png', fullPage: true });
  expect(await violations(fresh)).toEqual([]);
  await fresh.emulateMedia({ colorScheme: 'light' });
  await expect(fresh.locator('html')).toHaveAttribute('data-theme', 'light');
  await context.close();
});
