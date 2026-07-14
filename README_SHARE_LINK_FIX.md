# Исправление публичных ссылок хранилища

Ссылки из личного диска теперь всегда возвращаются в абсолютном формате:

```text
https://files.igorson.xyz/share/<token>
```

В `.env` должно быть:

```env
PUBLIC_SHARE_BASE_URL=https://files.igorson.xyz
```

После замены пересоберите backend и web последовательно.
