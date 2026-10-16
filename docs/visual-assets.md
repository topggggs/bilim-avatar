# Визуальные материалы

Визуальная система адаптирована под Bilim с ориентиром на композицию и сине-белую палитру [BI Group](https://bi.group/ru). Фотографии проектов и рекламные материалы с сайта не копировались.

Файл: [academy-architecture.png](../apps/web/public/assets/academy-architecture.png). Создан встроенным инструментом imagegen; это оригинальная вымышленная архитектура, не изображение конкретного объекта BI Group.

Промпт:

> Use case: photorealistic-natural. Asset type: original photographic website hero background for an employee development platform in construction. Create a sophisticated wide horizontal architectural photograph, approximately 16:9. A modern residential quarter in Astana-like contemporary Central Asian urban architecture, tall elegant pale limestone buildings and restrained blue reflective glass, a slightly low angle with pleasing vertical lines, a landscaped plaza at the bottom edge. Fresh clear cyan sky, soft morning sunlight, professional architectural magazine photography, premium realistic materials, natural colors, calm confident mood. Put most architectural detail on the right two thirds, leave the left third as a quiet blue sky area so website text can be overlaid in code. No people, no text, no signs, no logos, no watermarks, no mascots, no stickers, no interface, no graphic shapes. Original invented buildings, not a picture of a known real project.

Текст баннеров и кнопки реализованы в HTML/React и доступны для экранного диктора; они не встроены в изображение.

## Персонажи

`packages/core/src/avatar.ts` содержит 20 оригинальных векторных персонажей: по четыре архетипа для кино, аниме, животных, спорта и фэнтези. Во всех вариантах сохранены каска с эмблемой BI и сигнальный жилет. Вселенная меняет силуэт, лицо и снаряжение; архетип — позу и основной инструмент. Пол меняет фигуру и причёску, стиль — палитру. Усиленный вариант отличается золотой отделкой без отдельных стикеров.

`avatarCatalog` экспортирует `{ id, universe, archetype, name, config }`. Для превью используется `buildAvatar(entry.config).fallbackSvg`. Каталог показывает примеры архетипов; итоговый архетип сотрудника определяется результатом теста. Существующая конфигурация и сохранённые профили совместимы.

SVG состоят из встроенных векторных фигур и не содержат внешних ресурсов или пользовательских строк. Все значения конфигурации проверяются по закрытым перечням, включая `gender` и `boosted`. Промпт описывает оригинального персонажа без лицензированных героев и персональных данных.

Контактный лист: [avatar-catalog.png](avatar-catalog.png). Проверены все 1920 допустимых сочетаний, уникальность каталога, неизменяемость метаданных и отклонение недопустимой конфигурации.
