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
  await page.goto('/');
  await navigate(page, 'Мой профиль');
  await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
  await create(page);
  await page.getByRole('radio', { name: '4 — нейтрально', exact: true }).click();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.getByRole('radio', { name: '7 — полностью согласен', exact: true }).click();
  await expect(page.getByText('Сохранено на устройстве', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Продолжить тест', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: '7 — полностью согласен', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Сохранить и выйти' }).click();
  await page.getByRole('button', { name: 'Продолжить тест', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: '7 — полностью согласен', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: 'Продолжить тест', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: '7 — полностью согласен', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: '4 — нейтрально', exact: true }).click();
  for (let i = 2; i < 15; i++) {
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await page.getByRole('radio', { name: '4 — нейтрально', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Получить профиль', exact: true }).click();
  await page.getByLabel('Главное качество', { exact: true }).selectOption('critical');
  await page.getByLabel('Знак отличия', { exact: true }).selectOption('confidence');
  await page.getByRole('button', { name: 'Создать аватара' }).click();
  await expect(page.getByRole('heading', { name: 'Лис-стратег', exact: true })).toBeVisible();
  await expect(page.getByRole('meter')).toHaveCount(4);
  for (const m of await page.getByRole('meter').all())
    expect(await m.getAttribute('aria-valuenow')).toBe('50');
  await expect(page.getByRole('heading', { name: 'Сильные стороны', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Зоны роста', exact: true })).toBeVisible();
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
  await expect(
    page.getByRole('heading', { name: 'Стройте своё будущее', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.home-quality-card strong')).toHaveText(['50%', '50%', '50%', '50%']);
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
  await page.getByRole('button', { name: 'К модулю', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Модуль пока не подключён.');
  await page.screenshot({ path: 'docs/route-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await navigate(page, 'Главная');
  await expect(
    page.getByRole('heading', { name: 'Стройте своё будущее', exact: true }),
  ).toBeVisible();
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
