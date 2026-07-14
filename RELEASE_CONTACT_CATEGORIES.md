# Contact Categories Update

## Added
- Personal contact categories: Family, Friends, Work, or no category.
- Category selector in the contact information panel.
- Categories are private to each account.
- Main chat list is grouped in this order: Family, Friends, Work, Other, Groups.
- Empty categories are hidden automatically.
- Incoming messages are fixed to the left; outgoing messages are fixed to the right.

## Deployment
Rebuild both backend and frontend because a new database table and API endpoint were added.

```bash
COMPOSE_PARALLEL_LIMIT=1 docker compose build --no-cache backend
COMPOSE_PARALLEL_LIMIT=1 docker compose up -d backend
COMPOSE_PARALLEL_LIMIT=1 docker compose build --no-cache web
COMPOSE_PARALLEL_LIMIT=1 docker compose up -d web
```
