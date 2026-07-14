# Mobile Chat Taskbar

В мобильной версии чата верхняя панель упрощена, а второстепенные действия перенесены в нижнюю навигацию:

- Чат
- Ссылки
- Вложения
- Информация
- Ещё

Desktop-интерфейс не изменён.

## Обновление

```bash
COMPOSE_PARALLEL_LIMIT=1 docker compose build web
docker compose up -d web
```

После обновления полностью закройте PWA на iPhone и откройте снова.
