# Встроенные веб-приложения

Ресурсы чата (например `finance.igorson.xyz`) теперь открываются во внутреннем окне мессенджера.

Чтобы сайт разрешал встраивание, на его стороне добавьте заголовок:

```http
Content-Security-Policy: frame-ancestors 'self' https://messenger.igorson.xyz;
```

И удалите/не используйте запрет:

```http
X-Frame-Options: DENY
```

Допустим вариант `X-Frame-Options: SAMEORIGIN` только если приложение и мессенджер реально работают в одном origin. Для разных поддоменов используйте CSP `frame-ancestors`.
