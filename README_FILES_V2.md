# Files v2

Полностью новый интерфейс личного облака в стиле Finder.

## Изменения
- крупная типографика и единые SVG-иконки;
- боковая навигация Files;
- режимы списка и плитки;
- поиск, хлебные крошки, загрузка и создание папок;
- 10 ГБ на пользователя с серверной проверкой квоты;
- отображение занятого места в процентах;
- публичные ссылки на 30 дней;
- обновлённый service worker.

## Обновление
```bash
COMPOSE_PARALLEL_LIMIT=1 docker compose build backend
docker compose up -d backend
COMPOSE_PARALLEL_LIMIT=1 docker compose build web
docker compose up -d web
```
