import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const password = 'Моя длинная рабочая фраза 2026';
const updatedPassword = 'Новая длинная рабочая фраза 2027';
async function fillAccount(page: Page) {
  await expect(page.getByRole('heading', { name: 'Почти готово', exact: true })).toBeVisible();
  await page.getByLabel('Имя и фамилия', { exact: true }).fill('Айдар Тестовый');
  await page.getByLabel('Должность (необязательно)', { exact: true }).fill('Инженер');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
}
async function logout(page: Page) {
  await page.locator('.user-trigger').click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'С возвращением', exact: true })).toBeVisible();
}
test('вход и регистрация: адаптивная форма, ошибки, сохранение ввода при сбое сети', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'С возвращением', exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/auth-desktop.png', fullPage: true });
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await page.getByRole('button', { name: 'Регистрация', exact: true }).click();
  await page.getByRole('button', { name: 'Получить ссылку', exact: true }).click();
  await expect(page.getByText('Укажите корректную почту', { exact: true })).toBeVisible();
  await page.getByLabel('Рабочая почта').fill('offline@example.test');
  await page.route('**/api/auth/register/request', (route) => route.abort());
  await page.getByRole('button', { name: 'Получить ссылку', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Нет соединения');
  await expect(page.getByLabel('Рабочая почта')).toHaveValue('offline@example.test');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/auth-mobile.png', fullPage: true });
});
test('почта: подтверждение, создание аккаунта, выход, вход и восстановление пароля', async ({
  page,
}) => {
  const email = 'signup-e2e@example.test';
  await page.goto('/');
  await page.getByRole('button', { name: 'Регистрация', exact: true }).click();
  await page.getByLabel('Рабочая почта').fill(email);
  await page.getByRole('button', { name: 'Получить ссылку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проверьте почту', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Повторить через/ })).toBeDisabled();
  await page.getByRole('link', { name: 'Открыть тестовое письмо', exact: true }).click();
  await fillAccount(page);
  await page.getByLabel('Повторите пароль', { exact: true }).fill('Совсем другая фраза');
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page.getByText('Пароли не совпадают', { exact: true })).toBeVisible();
  await page.locator('#auth-confirmation').fill(password);
  await page.screenshot({ path: 'docs/registration-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page.locator('.user-trigger')).toContainText('Айдар Тестовый');
  expect((await page.request.get('/api/me')).ok()).toBe(true);
  await logout(page);
  await page.getByLabel('Рабочая почта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Показать', exact: true }).click();
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Скрыть', exact: true }).click();
  await page.locator('form').getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.locator('.user-trigger')).toContainText('Айдар Тестовый');
  await logout(page);
  await page.getByRole('button', { name: 'Забыли пароль?', exact: true }).click();
  await page.getByLabel('Рабочая почта').fill(email);
  await page.getByRole('button', { name: 'Получить ссылку', exact: true }).click();
  await page.getByRole('link', { name: 'Открыть тестовое письмо', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Новый пароль', exact: true })).toBeVisible();
  await page.getByLabel('Пароль', { exact: true }).fill(updatedPassword);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(updatedPassword);
  await page.getByRole('button', { name: 'Сохранить пароль', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Пароль обновлён', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByLabel('Пароль', { exact: true }).fill(updatedPassword);
  await page.locator('form').getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.locator('.user-trigger')).toContainText('Айдар Тестовый');
});
test('телефон: код SMS, создание аккаунта на 375px, вход по номеру и восстановление', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Регистрация', exact: true }).click();
  await page.getByRole('button', { name: 'Телефон', exact: true }).click();
  await page.getByLabel('Номер телефона', { exact: true }).fill('+7 (701) 234-56-78');
  await page.getByRole('button', { name: 'Получить код', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Введите код', exact: true })).toBeVisible();
  const code = (await page.locator('.auth-preview strong').textContent())!;
  await page.screenshot({ path: 'docs/sms-mobile.png', fullPage: true });
  await page
    .getByLabel('Код из SMS', { exact: true })
    .fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Подтвердить номер', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Неверный или устаревший код');
  await page.locator('#auth-code').fill(code);
  await page.getByRole('button', { name: 'Подтвердить номер', exact: true }).click();
  await fillAccount(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await page.screenshot({ path: 'docs/registration-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page.locator('.user-trigger')).toContainText('Айдар Тестовый');
  await logout(page);
  await page.getByRole('button', { name: 'Телефон', exact: true }).click();
  await page.getByLabel('Номер телефона').fill('+77012345678');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.locator('form').getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.locator('.user-trigger')).toContainText('Айдар Тестовый');
  await logout(page);
  await page.getByRole('button', { name: 'Телефон', exact: true }).click();
  await page.getByRole('button', { name: 'Забыли пароль?', exact: true }).click();
  await page.getByLabel('Номер телефона').fill('+77012345678');
  await page.getByRole('button', { name: 'Получить код', exact: true }).click();
  const resetCode = (await page.locator('.auth-preview strong').textContent())!;
  await page.getByLabel('Код из SMS', { exact: true }).fill(resetCode);
  await page.getByRole('button', { name: 'Подтвердить номер', exact: true }).click();
  await page.getByLabel('Пароль', { exact: true }).fill(updatedPassword);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(updatedPassword);
  await page.getByRole('button', { name: 'Сохранить пароль', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Пароль обновлён', exact: true })).toBeVisible();
});
test('SSO: корпоративный вход сохранён, локальная регистрация скрыта', async ({ page }) => {
  await page.route('**/api/auth/mode', (route) =>
    route.fulfill({
      json: { demo: false, local: false, oidc: true, preview: false, phone: false },
    }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Войти через BI Group', exact: true }),
  ).toHaveAttribute('href', '/api/auth/login');
  await expect(page.getByRole('button', { name: 'Регистрация', exact: true })).toHaveCount(0);
});
test('язык: RU → EN → KZ на входе и в кабинете, выбор сохраняется', async ({ page }) => {
  await page.goto('/');
  const language = page.getByRole('button', { name: /Язык: Русский \(RU\)/ });
  await language.click();
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Language: English \(EN\)/ }).click();
  await page.getByRole('button', { name: /Қазақша/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Қайта қош келдіңіз', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Демоны көру', exact: true }).click();
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Басты бет' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Тіл: Қазақша/ }).click();
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Home' })).toBeVisible();
  await page.locator('.user-trigger').click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
});
