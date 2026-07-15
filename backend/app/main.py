import json
import os
import uuid
import zipfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Any, List

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from pywebpush import WebPushException, webpush
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text, UniqueConstraint, create_engine, inspect, text, func
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./messenger.db")
SECRET = os.getenv("JWT_SECRET", "change-me")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com")
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
TURN_HOST = os.getenv("TURN_HOST", "")
TURN_PORT = int(os.getenv("TURN_PORT", "3478"))
TURN_USERNAME = os.getenv("TURN_USERNAME", "messenger")
TURN_PASSWORD = os.getenv("TURN_PASSWORD", "change-turn-password")
PUBLIC_SHARE_BASE_URL = os.getenv("PUBLIC_SHARE_BASE_URL", "").strip().rstrip("/")

def public_share_base(request: Request) -> str:
    """Return an absolute public origin for generated share links."""
    configured = PUBLIC_SHARE_BASE_URL.strip()
    if configured:
        if not configured.startswith(("http://", "https://")):
            configured = "https://" + configured
        return configured.rstrip("/")
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc).split(",")[0].strip()
    if not host:
        raise HTTPException(500, "Не настроен публичный адрес для ссылок")
    return f"{proto}://{host}".rstrip("/")
SHARE_TTL_DAYS = int(os.getenv("SHARE_TTL_DAYS", "30"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

chat_members = Table(
    "chat_members", Base.metadata,
    Column("chat_id", ForeignKey("chats.id"), primary_key=True),
    Column("user_id", ForeignKey("users.id"), primary_key=True),
    Column("role", String(20), nullable=False, default="member"),
    Column("expires_at", DateTime, nullable=True),
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    display_name = Column(String(80), nullable=True)
    avatar_url = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_seen = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=True)
    home_links = Column(Text, nullable=True)
    chats = relationship("Chat", secondary=chat_members, back_populates="members")

class Chat(Base):
    __tablename__ = "chats"
    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=True)
    is_group = Column(Boolean, default=False)
    avatar_url = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    quick_links = Column(Text, nullable=True)
    is_hidden = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    members = relationship("User", secondary=chat_members, back_populates="chats")
    messages = relationship("Message", back_populates="chat", cascade="all,delete-orphan")

class ContactCategory(Base):
    __tablename__ = "contact_categories"
    __table_args__ = (UniqueConstraint("owner_id", "contact_id", name="uq_contact_category_owner_contact"),)
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    contact_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    category = Column(String(20), nullable=True)
    alias = Column(String(80), nullable=True)
    note = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    chat_id = Column(Integer, ForeignKey("chats.id"))
    sender_id = Column(Integer, ForeignKey("users.id"))
    text = Column(Text, default="")
    file_url = Column(String, nullable=True)
    file_name = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    checklist_id = Column(Integer, ForeignKey("checklists.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    chat = relationship("Chat", back_populates="messages")
    sender = relationship("User")


class Checklist(Base):
    __tablename__ = "checklists"
    id = Column(Integer, primary_key=True)
    chat_id = Column(Integer, ForeignKey("chats.id"), index=True, nullable=False)
    title = Column(String(160), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class ChecklistItem(Base):
    __tablename__ = "checklist_items"
    id = Column(Integer, primary_key=True)
    checklist_id = Column(Integer, ForeignKey("checklists.id"), index=True, nullable=False)
    text = Column(String(500), nullable=False)
    checked = Column(Boolean, default=False, nullable=False)
    position = Column(Integer, default=0, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class SharedFile(Base):
    __tablename__ = "shared_files"
    id = Column(Integer, primary_key=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    storage_name = Column(String, nullable=False)
    original_name = Column(String, nullable=False)
    mime_type = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=False, default=0)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=False)


class StorageItem(Base):
    __tablename__ = "storage_items"
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    parent_id = Column(Integer, ForeignKey("storage_items.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    is_folder = Column(Boolean, default=False, nullable=False)
    storage_name = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class MessageReceipt(Base):
    __tablename__ = "message_receipts"
    id = Column(Integer, primary_key=True)
    message_id = Column(Integer, ForeignKey("messages.id"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    endpoint = Column(Text, unique=True, nullable=False)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)

def initialize_database(max_attempts: int = 30, delay_seconds: int = 2) -> None:
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            Base.metadata.create_all(engine)
            return
        except Exception as exc:
            last_error = exc
            print(f"Database is not ready ({attempt}/{max_attempts}): {exc}", flush=True)
            time.sleep(delay_seconds)
    raise RuntimeError(f"Could not initialize database after {max_attempts} attempts") from last_error

initialize_database()
# Lightweight migration for existing installations.
try:
    user_columns = {c["name"] for c in inspect(engine).get_columns("users")}
    with engine.begin() as conn:
        if "last_seen" not in user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN last_seen TIMESTAMP"))
        if "display_name" not in user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR(80)"))
        if "avatar_url" not in user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR"))
        if "home_links" not in user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN home_links TEXT"))
        chat_columns = {c["name"] for c in inspect(engine).get_columns("chats")}
        if "avatar_url" not in chat_columns:
            conn.execute(text("ALTER TABLE chats ADD COLUMN avatar_url VARCHAR"))
        if "owner_id" not in chat_columns:
            conn.execute(text("ALTER TABLE chats ADD COLUMN owner_id INTEGER"))
        if "quick_links" not in chat_columns:
            conn.execute(text("ALTER TABLE chats ADD COLUMN quick_links TEXT"))
        if "is_hidden" not in chat_columns:
            conn.execute(text("ALTER TABLE chats ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT FALSE"))
        member_columns = {c["name"] for c in inspect(engine).get_columns("chat_members")}
        if "role" not in member_columns:
            conn.execute(text("ALTER TABLE chat_members ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'member'"))
        if "expires_at" not in member_columns:
            conn.execute(text("ALTER TABLE chat_members ADD COLUMN expires_at TIMESTAMP"))
        message_columns = {c["name"] for c in inspect(engine).get_columns("messages")}
        if "checklist_id" not in message_columns:
            conn.execute(text("ALTER TABLE messages ADD COLUMN checklist_id INTEGER"))
        contact_columns = {c["name"] for c in inspect(engine).get_columns("contact_categories")}
        if "alias" not in contact_columns:
            conn.execute(text("ALTER TABLE contact_categories ADD COLUMN alias VARCHAR(80)"))
        if "note" not in contact_columns:
            conn.execute(text("ALTER TABLE contact_categories ADD COLUMN note TEXT"))
        conn.execute(text("UPDATE users SET last_seen = COALESCE(last_seen, created_at, CURRENT_TIMESTAMP)"))
except Exception:
    pass
app = FastAPI(title="Personal Messenger API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc

class AuthIn(BaseModel):
    username: str
    password: str

class ChatIn(BaseModel):
    name: Optional[str] = None
    usernames: list[str]

class ChatUpdateIn(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    quick_links: Optional[list[Optional[dict[str, Any]]]] = None

class MemberRoleIn(BaseModel):
    role: str
    expires_at: Optional[datetime] = None

class AddMemberIn(BaseModel):
    username: str
    role: str = "member"
    expires_at: Optional[datetime] = None

class MsgIn(BaseModel):
    text: str = ""
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None

class ChecklistCreateIn(BaseModel):
    title: str
    items: list[str] = []
    member_ids: list[int] = []

class ChecklistUpdateIn(BaseModel):
    title: Optional[str] = None

class ChecklistItemCreateIn(BaseModel):
    text: str

class ChecklistItemUpdateIn(BaseModel):
    text: Optional[str] = None
    checked: Optional[bool] = None
    position: Optional[int] = None

class ProfileIn(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    home_links: Optional[list[Optional[dict[str, Any]]]] = None

class ContactCategoryIn(BaseModel):
    category: Optional[str] = None

class ContactPreferencesIn(BaseModel):
    alias: Optional[str] = None
    category: Optional[str] = None
    note: Optional[str] = None

class StorageFolderIn(BaseModel):
    name: str
    parent_id: Optional[int] = None

class StorageRenameIn(BaseModel):
    name: str

class PushIn(BaseModel):
    endpoint: str
    keys: dict


class CallEventIn(BaseModel):
    type: str
    target_user_id: Optional[int] = None
    signal: Optional[dict] = None

class CallIn(BaseModel):
    mode: str = "audio"


def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def make_token(uid: int) -> str:
    return jwt.encode({"sub": str(uid), "exp": datetime.now(timezone.utc) + timedelta(days=30)}, SECRET, algorithm="HS256")


def decode_token(token: str) -> int:
    return int(jwt.decode(token, SECRET, algorithms=["HS256"])["sub"])


def touch_user_activity(session: Session, user: User, min_interval_seconds: int = 20):
    now = datetime.now(timezone.utc)
    previous = getattr(user, "last_seen", None)
    if previous is not None and previous.tzinfo is None:
        previous = previous.replace(tzinfo=timezone.utc)
    if previous is None or (now - previous).total_seconds() >= min_interval_seconds:
        user.last_seen = now
        session.add(user)
        session.commit()


def current_user(authorization: str = Header(default=""), s: Session = Depends(db)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        uid = decode_token(authorization[7:])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(401, "Invalid token")
    user = s.get(User, uid)
    if not user:
        raise HTTPException(401, "User not found")
    touch_user_activity(s, user)
    return user


def iso_utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def user_out(u):
    online = bool(globals().get("hub") and globals()["hub"].connections.get(u.id))
    return {
        "id": u.id, "username": u.username,
        "display_name": getattr(u, "display_name", None) or u.username,
        "avatar_url": getattr(u, "avatar_url", None),
        "online": online,
        "last_seen": iso_utc(getattr(u, "last_seen", None) or getattr(u, "created_at", None) or datetime.now(timezone.utc)),
        "home_links": json.loads(getattr(u, "home_links", None)) if getattr(u, "home_links", None) else [],
    }


def checklist_out(row: Checklist, s: Session):
    items = s.query(ChecklistItem).filter_by(checklist_id=row.id).order_by(ChecklistItem.position, ChecklistItem.id).all()
    chat = s.get(Chat, row.chat_id)
    members = [user_out(member) for member in (chat.members if chat else [])]
    return {
        "id": row.id, "chat_id": row.chat_id, "title": row.title,
        "created_by": row.created_by, "created_at": iso_utc(row.created_at), "updated_at": iso_utc(row.updated_at),
        "standalone": bool(chat and getattr(chat, "is_hidden", False)),
        "members": members,
        "items": [{"id": i.id, "text": i.text, "checked": bool(i.checked), "position": i.position,
                   "created_by": i.created_by, "updated_by": i.updated_by, "updated_at": iso_utc(i.updated_at)} for i in items],
    }

def msg_out(m, s: Session | None = None):
    status = "sent"
    if s is not None:
        receipts = s.query(MessageReceipt).filter_by(message_id=m.id).all()
        if receipts and all(r.read_at for r in receipts):
            status = "read"
        elif receipts and all(r.delivered_at for r in receipts):
            status = "delivered"
    return {
        "id": m.id, "chat_id": m.chat_id, "sender": user_out(m.sender), "text": m.text,
        "file_url": m.file_url, "file_name": m.file_name, "mime_type": m.mime_type,
        "created_at": iso_utc(m.created_at), "status": status,
    }


ROLE_LABELS = {"owner": "Создатель", "admin": "Администратор", "member": "Участник", "guest": "Гость"}

def membership_rows(chat_id: int):
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT user_id, role, expires_at FROM chat_members WHERE chat_id=:cid"), {"cid": chat_id}).mappings().all()
    return {int(r["user_id"]): {"role": r["role"] or "member", "expires_at": r["expires_at"]} for r in rows}

def role_for(chat, uid: int) -> str | None:
    if chat.owner_id == uid:
        return "owner"
    row = membership_rows(chat.id).get(uid)
    if not row:
        return None
    exp = row.get("expires_at")
    if exp:
        if isinstance(exp, str):
            try: exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            except ValueError: exp = None
        if exp and exp.replace(tzinfo=exp.tzinfo or timezone.utc) <= datetime.now(timezone.utc):
            return None
    return row.get("role") or "member"

def chat_out(c, u):
    other_member = next((m for m in c.members if m.id != u.id), None) if not c.is_group else None
    contact_category = None
    contact_alias = None
    contact_note = None
    original_contact_name = None
    if other_member is not None:
        original_contact_name = getattr(other_member, "display_name", None) or other_member.username
        with SessionLocal() as category_session:
            row = category_session.query(ContactCategory).filter_by(owner_id=u.id, contact_id=other_member.id).first()
            if row:
                contact_category = row.category or None
                contact_alias = (row.alias or "").strip() or None
                contact_note = row.note or None
    title = c.name if c.is_group else (contact_alias or original_contact_name or (getattr(u, "display_name", None) or u.username))
    last = max(c.messages, key=lambda m: m.id, default=None)
    # Непрочитанные считаются по квитанциям конкретного пользователя.
    # Это работает одинаково для личных и групповых чатов.
    with SessionLocal() as count_session:
        unread_count = (count_session.query(MessageReceipt)
            .join(Message, Message.id == MessageReceipt.message_id)
            .filter(Message.chat_id == c.id,
                    MessageReceipt.user_id == u.id,
                    MessageReceipt.read_at.is_(None))
            .count())
    rows = membership_rows(c.id)
    current_role = "owner" if c.owner_id == u.id else (rows.get(u.id, {}).get("role") or "member")
    members = []
    for x in c.members:
        item = user_out(x)
        row = rows.get(x.id, {})
        item["role"] = "owner" if c.owner_id == x.id else (row.get("role") or "member")
        item["role_label"] = ROLE_LABELS.get(item["role"], item["role"])
        item["expires_at"] = iso_utc(row.get("expires_at")) if row.get("expires_at") and not isinstance(row.get("expires_at"), str) else row.get("expires_at")
        members.append(item)
    return {
        "id": c.id, "name": title, "is_group": c.is_group,
        "avatar_url": getattr(c, "avatar_url", None),
        "owner_id": getattr(c, "owner_id", None),
        "my_role": current_role,
        "can_edit": bool(c.is_group and current_role == "owner"),
        "can_manage_members": bool(c.is_group and current_role in ("owner", "admin")),
        "can_edit_links": bool((not c.is_group) or current_role in ("owner", "admin", "member")),
        "can_write": current_role != "guest",
        "can_call": current_role != "guest",
        "quick_links": json.loads(c.quick_links) if getattr(c, "quick_links", None) else [],
        "contact_category": contact_category,
        "contact_alias": contact_alias,
        "contact_note": contact_note,
        "contact_original_name": original_contact_name,
        "contact_id": other_member.id if other_member is not None else None,
        "members": members,
        "last_message": msg_out(last) if last else None,
        "unread_count": unread_count,
    }

@app.get("/api/health")
def health():
    return {"ok": True, "push_configured": bool(VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY), "turn_configured": bool(TURN_HOST)}

@app.post("/api/register")
def register(x: AuthIn, s: Session = Depends(db)):
    username = x.username.strip()
    if len(username) < 3 or len(x.password) < 6:
        raise HTTPException(400, "Логин от 3 символов, пароль от 6")
    if s.query(User).filter_by(username=username).first():
        raise HTTPException(409, "Логин уже занят")
    user = User(username=username, password_hash=pwd.hash(x.password))
    s.add(user); s.commit(); s.refresh(user)
    return {"token": make_token(user.id), "user": user_out(user)}

@app.post("/api/login")
def login(x: AuthIn, s: Session = Depends(db)):
    user = s.query(User).filter_by(username=x.username.strip()).first()
    if not user or not pwd.verify(x.password, user.password_hash):
        raise HTTPException(401, "Неверный логин или пароль")
    user.last_seen = datetime.now(timezone.utc)
    s.commit(); s.refresh(user)
    return {"token": make_token(user.id), "user": user_out(user)}

@app.get("/api/me")
def me(u=Depends(current_user)):
    return user_out(u)


@app.patch("/api/me")
def update_me(x: ProfileIn, u=Depends(current_user), s: Session = Depends(db)):
    if x.display_name is not None:
        name = x.display_name.strip()
        if not 1 <= len(name) <= 80:
            raise HTTPException(400, "Имя должно содержать от 1 до 80 символов")
        u.display_name = name
    if x.avatar_url is not None:
        if x.avatar_url and not x.avatar_url.startswith("/uploads/"):
            raise HTTPException(400, "Некорректный адрес аватара")
        u.avatar_url = x.avatar_url or None
    if x.home_links is not None:
        cleaned=[]
        for item in x.home_links[:3]:
            if not item: continue
            title=str(item.get("title", "")).strip()[:24]
            url=str(item.get("url", "")).strip()[:500]
            if title and url: cleaned.append({"title": title, "url": url})
        u.home_links = json.dumps(cleaned, ensure_ascii=False)
    s.add(u); s.commit(); s.refresh(u)
    return user_out(u)

@app.get("/api/users")
def users(q: str = "", u=Depends(current_user), s: Session = Depends(db)):
    return [user_out(x) for x in s.query(User).filter(User.username.ilike(f"%{q}%"), User.id != u.id).limit(50)]


@app.patch("/api/contacts/{contact_id}/preferences")
def update_contact_preferences(contact_id: int, x: ContactPreferencesIn, u=Depends(current_user), s: Session = Depends(db)):
    if contact_id == u.id:
        raise HTTPException(400, "Нельзя редактировать собственный контакт")
    contact = s.get(User, contact_id)
    if not contact:
        raise HTTPException(404, "Контакт не найден")
    allowed = {"family", "friends", "work"}
    category = (x.category or "").strip().lower() or None
    if category is not None and category not in allowed:
        raise HTTPException(400, "Неизвестная категория")
    alias = (x.alias or "").strip()[:80] or None
    note = (x.note or "").strip()[:2000] or None
    row = s.query(ContactCategory).filter_by(owner_id=u.id, contact_id=contact_id).first()
    if not any((category, alias, note)):
        if row:
            s.delete(row)
    elif row:
        row.category = category or ""
        row.alias = alias
        row.note = note
        row.updated_at = datetime.now(timezone.utc)
    else:
        s.add(ContactCategory(owner_id=u.id, contact_id=contact_id, category=category or "", alias=alias, note=note))
    s.commit()
    return {
        "contact_id": contact_id,
        "category": category,
        "alias": alias,
        "note": note,
        "display_name": alias or (contact.display_name or contact.username),
        "original_name": contact.display_name or contact.username,
    }

@app.patch("/api/contacts/{contact_id}/category")
def update_contact_category(contact_id: int, x: ContactCategoryIn, u=Depends(current_user), s: Session = Depends(db)):
    row = s.query(ContactCategory).filter_by(owner_id=u.id, contact_id=contact_id).first()
    return update_contact_preferences(
        contact_id,
        ContactPreferencesIn(alias=row.alias if row else None, note=row.note if row else None, category=x.category),
        u, s
    )


@app.get("/api/search")
def global_search(q: str = "", kind: str = "all", chat_id: Optional[int] = None, u=Depends(current_user), s: Session = Depends(db)):
    query = q.strip()
    if not query:
        return {"users": [], "chats": [], "messages": [], "files": [], "images": [], "links": []}
    like = f"%{query}%"
    allowed_chat_ids = [c.id for c in u.chats]
    if chat_id is not None:
        if chat_id not in allowed_chat_ids:
            raise HTTPException(404, "Чат не найден")
        allowed_chat_ids = [chat_id]
    result = {"users": [], "chats": [], "messages": [], "files": [], "images": [], "links": []}

    if kind in ("all", "users"):
        rows = s.query(User).filter(User.id != u.id).filter(
            (User.username.ilike(like)) | (User.display_name.ilike(like))
        ).limit(20).all()
        result["users"] = [user_out(x) for x in rows]

    if kind in ("all", "chats"):
        result["chats"] = [chat_out(c, u) for c in u.chats if not getattr(c, "is_hidden", False) and query.lower() in chat_out(c, u)["name"].lower()][:20]

    if allowed_chat_ids:
        base = s.query(Message).filter(Message.chat_id.in_(allowed_chat_ids))
        date_start = date_end = None
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
            try:
                parsed = datetime.strptime(query, fmt).replace(tzinfo=timezone.utc)
                date_start, date_end = parsed, parsed + timedelta(days=1)
                break
            except ValueError:
                pass
        text_rows = base.filter(Message.text.ilike(like))
        if date_start:
            text_rows = base.filter(Message.created_at >= date_start, Message.created_at < date_end)
        text_rows = text_rows.order_by(Message.id.desc()).limit(50).all()
        message_items = []
        link_items = []
        for m in text_rows:
            item = msg_out(m, s) | {"chat": chat_out(m.chat, u)}
            message_items.append(item)
            if m.text and ("http://" in m.text.lower() or "https://" in m.text.lower()):
                link_items.append(item)
        if kind in ("all", "messages"):
            result["messages"] = message_items
        if kind in ("all", "links"):
            if not link_items:
                rows = base.filter((Message.text.ilike("%http://%")) | (Message.text.ilike("%https://%"))).filter(Message.text.ilike(like)).order_by(Message.id.desc()).limit(50).all()
                link_items = [msg_out(m, s) | {"chat": chat_out(m.chat, u)} for m in rows]
            result["links"] = link_items

        file_rows = base.filter(Message.file_name.isnot(None)).filter(Message.file_name.ilike(like)).order_by(Message.id.desc()).limit(50).all()
        files = [msg_out(m, s) | {"chat": chat_out(m.chat, u)} for m in file_rows]
        if kind in ("all", "files"):
            result["files"] = [x for x in files if not (x.get("mime_type") or "").startswith("image/")]
        if kind in ("all", "images"):
            image_rows = base.filter(Message.mime_type.ilike("image/%")).order_by(Message.id.desc()).limit(50).all()
            result["images"] = [msg_out(m, s) | {"chat": chat_out(m.chat, u)} for m in image_rows if query.lower() in ((m.file_name or "") + " " + (m.text or "")).lower()]
    return result

@app.get("/api/chats")
def chats(u=Depends(current_user)):
    return sorted([chat_out(c, u) for c in u.chats if not getattr(c, "is_hidden", False)], key=lambda c: c["last_message"]["id"] if c["last_message"] else 0, reverse=True)

@app.post("/api/chats")
def create_chat(x: ChatIn, u=Depends(current_user), s: Session = Depends(db)):
    names = list(dict.fromkeys(n.strip() for n in x.usernames if n.strip()))
    members = s.query(User).filter(User.username.in_(names)).all()
    if len(members) != len(names):
        raise HTTPException(400, "Один или несколько пользователей не найдены")
    all_members = [u] + [m for m in members if m.id != u.id]
    group = len(all_members) > 2 or bool(x.name and x.name.strip())
    if not group:
        wanted = {m.id for m in all_members}
        for c in u.chats:
            if not c.is_group and {m.id for m in c.members} == wanted:
                return chat_out(c, u)
    chat = Chat(name=(x.name or "").strip() or None, is_group=group, members=all_members, owner_id=u.id if group else None)
    s.add(chat); s.commit(); s.refresh(chat)
    if group:
        with engine.begin() as conn:
            conn.execute(text("UPDATE chat_members SET role=CASE WHEN user_id=:owner THEN 'owner' ELSE 'member' END WHERE chat_id=:cid"), {"owner": u.id, "cid": chat.id})
    return chat_out(chat, u)


@app.patch("/api/chats/{cid}")
def update_chat(cid: int, x: ChatUpdateIn, u=Depends(current_user), s: Session = Depends(db)):
    chat = require_chat(cid, u, s)
    if (x.name is not None or x.avatar_url is not None) and not chat.is_group:
        raise HTTPException(400, "Название и иконка доступны только для группового чата")

    # Название и иконку группы по-прежнему меняет создатель.
    if x.name is not None or x.avatar_url is not None:
        if chat.owner_id is not None and chat.owner_id != u.id:
            raise HTTPException(403, "Название и иконку группы может менять только её создатель")
        if chat.owner_id is None:
            chat.owner_id = u.id

    if x.name is not None:
        name = x.name.strip()
        if not 1 <= len(name) <= 120:
            raise HTTPException(400, "Название должно содержать от 1 до 120 символов")
        chat.name = name
    if x.avatar_url is not None:
        if x.avatar_url and not x.avatar_url.startswith("/uploads/"):
            raise HTTPException(400, "Некорректный адрес иконки")
        chat.avatar_url = x.avatar_url or None

    # Быстрые ссылки рядом с названием могут менять все участники группы.
    if x.quick_links is not None:
        if len(x.quick_links) > 10:
            raise HTTPException(400, "Можно добавить не более 10 быстрых ссылок")
        cleaned = []
        for item in x.quick_links:
            if not item:
                cleaned.append(None)
                continue
            title = str(item.get("title", "")).strip()[:24]
            url = str(item.get("url", "")).strip()[:500]
            if not title or not url or ":" not in url:
                raise HTTPException(400, "Укажите название и корректную ссылку")
            cleaned.append({"title": title, "url": url})
        chat.quick_links = json.dumps(cleaned, ensure_ascii=False)
    s.add(chat); s.commit(); s.refresh(chat)
    return chat_out(chat, u)


@app.post("/api/chats/{cid}/members")
def add_group_member(cid: int, x: AddMemberIn, u=Depends(current_user), s: Session = Depends(db)):
    chat = require_chat(cid, u, s)
    if not chat.is_group:
        raise HTTPException(400, "Это не групповой чат")
    actor_role = role_for(chat, u.id)
    if actor_role not in ("owner", "admin"):
        raise HTTPException(403, "Недостаточно прав")
    role = x.role.strip().lower()
    if role not in ("admin", "member", "guest"):
        raise HTTPException(400, "Некорректная роль")
    if actor_role == "admin" and role == "admin":
        raise HTTPException(403, "Администратор не может назначать администраторов")
    member = s.query(User).filter_by(username=x.username.strip()).first()
    if not member:
        raise HTTPException(404, "Пользователь не найден")
    if member.id not in {m.id for m in chat.members}:
        chat.members.append(member); s.commit()
    with engine.begin() as conn:
        conn.execute(text("UPDATE chat_members SET role=:role, expires_at=:exp WHERE chat_id=:cid AND user_id=:uid"), {"role": role, "exp": x.expires_at, "cid": cid, "uid": member.id})
    s.refresh(chat)
    return chat_out(chat, u)

@app.patch("/api/chats/{cid}/members/{uid}")
def update_group_member(cid: int, uid: int, x: MemberRoleIn, u=Depends(current_user), s: Session = Depends(db)):
    chat = require_chat(cid, u, s)
    actor_role = role_for(chat, u.id)
    target_role = role_for(chat, uid)
    role = x.role.strip().lower()
    if actor_role not in ("owner", "admin"):
        raise HTTPException(403, "Недостаточно прав")
    if uid == u.id or target_role == "owner":
        raise HTTPException(403, "Эту роль изменить нельзя")
    if role not in ("admin", "member", "guest"):
        raise HTTPException(400, "Некорректная роль")
    if actor_role == "admin" and (target_role == "admin" or role == "admin"):
        raise HTTPException(403, "Администратор не может изменять администраторов")
    with engine.begin() as conn:
        result = conn.execute(text("UPDATE chat_members SET role=:role, expires_at=:exp WHERE chat_id=:cid AND user_id=:uid"), {"role": role, "exp": x.expires_at if role == "guest" else None, "cid": cid, "uid": uid})
        if result.rowcount == 0:
            raise HTTPException(404, "Участник не найден")
    s.refresh(chat)
    return chat_out(chat, u)

@app.delete("/api/chats/{cid}/members/{uid}")
def remove_group_member(cid: int, uid: int, u=Depends(current_user), s: Session = Depends(db)):
    chat = require_chat(cid, u, s)
    actor_role = role_for(chat, u.id)
    target_role = role_for(chat, uid)
    if actor_role not in ("owner", "admin"):
        raise HTTPException(403, "Недостаточно прав")
    if target_role == "owner" or uid == u.id:
        raise HTTPException(403, "Этого участника удалить нельзя")
    if actor_role == "admin" and target_role == "admin":
        raise HTTPException(403, "Администратор не может удалить администратора")
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM chat_members WHERE chat_id=:cid AND user_id=:uid"), {"cid": cid, "uid": uid})
    s.expire(chat, ["members"])
    return chat_out(chat, u)

def require_chat(cid, u, s):
    chat = s.get(Chat, cid)
    if not chat or u.id not in {m.id for m in chat.members} or (chat.is_group and role_for(chat, u.id) is None):
        raise HTTPException(404, "Чат не найден")
    return chat

@app.get("/api/chats/{cid}/messages")
async def messages(cid: int, u=Depends(current_user), s: Session = Depends(db)):
    chat = require_chat(cid, u, s)
    now = datetime.now(timezone.utc)
    incoming_ids = [m.id for m in s.query(Message).filter(Message.chat_id == cid, Message.sender_id != u.id).all()]
    changed = []
    if incoming_ids:
        receipts = s.query(MessageReceipt).filter(MessageReceipt.message_id.in_(incoming_ids), MessageReceipt.user_id == u.id).all()
        for r in receipts:
            if not r.delivered_at: r.delivered_at = now
            if not r.read_at:
                r.read_at = now
                changed.append(r.message_id)
        s.commit()
    for mid in changed:
        message = s.get(Message, mid)
        if message:
            await hub.send_users([message.sender_id], {"type":"message_status", "message_id":mid, "status":msg_out(message, s)["status"]})
    rows = s.query(Message).filter_by(chat_id=cid).order_by(Message.id.desc()).limit(500).all()
    return [msg_out(m, s) for m in reversed(rows)]


def storage_item_out(item: StorageItem):
    return {
        "id": item.id, "parent_id": item.parent_id, "name": item.name,
        "is_folder": item.is_folder, "mime_type": item.mime_type,
        "size_bytes": item.size_bytes or 0,
        "created_at": iso_utc(item.created_at), "updated_at": iso_utc(item.updated_at),
        "download_url": None if item.is_folder else f"/api/storage/{item.id}/download",
    }

def require_storage_item(item_id: int, u: User, s: Session) -> StorageItem:
    item = s.get(StorageItem, item_id)
    if not item or item.owner_id != u.id:
        raise HTTPException(404, "Элемент хранилища не найден")
    return item

def storage_descendants(s: Session, owner_id: int, parent_id: int) -> list[StorageItem]:
    result = []
    children = s.query(StorageItem).filter_by(owner_id=owner_id, parent_id=parent_id).all()
    for child in children:
        result.append(child)
        if child.is_folder:
            result.extend(storage_descendants(s, owner_id, child.id))
    return result

@app.get("/api/storage")
def storage_list(parent_id: Optional[int] = None, u=Depends(current_user), s: Session = Depends(db)):
    if parent_id is not None:
        parent = require_storage_item(parent_id, u, s)
        if not parent.is_folder:
            raise HTTPException(400, "Указанный элемент не является папкой")
    items = (s.query(StorageItem)
        .filter(StorageItem.owner_id == u.id, StorageItem.parent_id.is_(None) if parent_id is None else StorageItem.parent_id == parent_id)
        .order_by(StorageItem.is_folder.desc(), StorageItem.name.asc()).all())
    used_bytes = s.query(func.coalesce(func.sum(StorageItem.size_bytes), 0)).filter(
        StorageItem.owner_id == u.id, StorageItem.is_folder.is_(False)
    ).scalar() or 0
    quota_bytes = int(os.getenv("STORAGE_QUOTA_BYTES", str(10 * 1024 * 1024 * 1024)))
    return {
        "items": [storage_item_out(x) for x in items],
        "parent_id": parent_id,
        "used_bytes": int(used_bytes),
        "quota_bytes": quota_bytes,
        "usage_percent": round((int(used_bytes) / quota_bytes) * 100, 1) if quota_bytes > 0 else 0,
    }

@app.post("/api/storage/folders")
def storage_create_folder(x: StorageFolderIn, u=Depends(current_user), s: Session = Depends(db)):
    name = x.name.strip().strip("/\\")
    if not name or len(name) > 255:
        raise HTTPException(400, "Некорректное имя папки")
    if x.parent_id is not None:
        parent = require_storage_item(x.parent_id, u, s)
        if not parent.is_folder:
            raise HTTPException(400, "Родитель не является папкой")
    exists = s.query(StorageItem).filter_by(owner_id=u.id, parent_id=x.parent_id, name=name).first()
    if exists:
        raise HTTPException(409, "Элемент с таким именем уже существует")
    item = StorageItem(owner_id=u.id, parent_id=x.parent_id, name=name, is_folder=True)
    s.add(item); s.commit(); s.refresh(item)
    return storage_item_out(item)

@app.post("/api/storage/upload")
def storage_upload(files: List[UploadFile] = File(...), parent_id: Optional[int] = Form(default=None), u=Depends(current_user), s: Session = Depends(db)):
    if not files:
        raise HTTPException(400, "Файлы не выбраны")
    if parent_id is not None:
        parent = require_storage_item(parent_id, u, s)
        if not parent.is_folder:
            raise HTTPException(400, "Родитель не является папкой")
    base_dir = UPLOAD_DIR / "personal" / str(u.id)
    base_dir.mkdir(parents=True, exist_ok=True)
    quota_bytes = int(os.getenv("STORAGE_QUOTA_BYTES", str(10 * 1024 * 1024 * 1024)))
    used_bytes = s.query(func.coalesce(func.sum(StorageItem.size_bytes), 0)).filter(
        StorageItem.owner_id == u.id, StorageItem.is_folder.is_(False)
    ).scalar() or 0
    created = []
    for file in files[:100]:
        original = Path(file.filename or "file").name
        target_name = original
        n = 2
        while s.query(StorageItem).filter_by(owner_id=u.id, parent_id=parent_id, name=target_name).first():
            stem, suffix = Path(original).stem, Path(original).suffix
            target_name = f"{stem} ({n}){suffix}"; n += 1
        storage_name = f"personal/{u.id}/{uuid.uuid4().hex}{Path(original).suffix[:20]}"
        target = UPLOAD_DIR / storage_name
        size = 0
        with target.open("wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if quota_bytes > 0 and int(used_bytes) + sum(x.size_bytes or 0 for x in created) + size > quota_bytes:
                    out.close()
                    target.unlink(missing_ok=True)
                    raise HTTPException(413, "Недостаточно места в хранилище")
                out.write(chunk)
        item = StorageItem(owner_id=u.id, parent_id=parent_id, name=target_name, is_folder=False,
                           storage_name=storage_name, mime_type=file.content_type, size_bytes=size)
        s.add(item); created.append(item)
    s.commit()
    for item in created: s.refresh(item)
    return {"items": [storage_item_out(x) for x in created]}

@app.patch("/api/storage/{item_id}")
def storage_rename(item_id: int, x: StorageRenameIn, u=Depends(current_user), s: Session = Depends(db)):
    item = require_storage_item(item_id, u, s)
    name = x.name.strip().strip("/\\")
    if not name or len(name) > 255:
        raise HTTPException(400, "Некорректное имя")
    if s.query(StorageItem).filter(StorageItem.owner_id == u.id, StorageItem.parent_id == item.parent_id,
                                   StorageItem.name == name, StorageItem.id != item.id).first():
        raise HTTPException(409, "Элемент с таким именем уже существует")
    item.name = name; item.updated_at = datetime.now(timezone.utc)
    s.commit(); s.refresh(item)
    return storage_item_out(item)

@app.delete("/api/storage/{item_id}")
def storage_delete(item_id: int, u=Depends(current_user), s: Session = Depends(db)):
    item = require_storage_item(item_id, u, s)
    targets = storage_descendants(s, u.id, item.id) if item.is_folder else []
    for target in list(reversed(targets)) + [item]:
        if not target.is_folder and target.storage_name:
            (UPLOAD_DIR / target.storage_name).unlink(missing_ok=True)
        s.delete(target)
    s.commit()
    return {"ok": True}

@app.get("/api/storage/{item_id}/download")
def storage_download(item_id: int, u=Depends(current_user), s: Session = Depends(db)):
    item = require_storage_item(item_id, u, s)
    if item.is_folder or not item.storage_name:
        raise HTTPException(400, "Папку нельзя скачать напрямую")
    path = UPLOAD_DIR / item.storage_name
    if not path.exists():
        raise HTTPException(404, "Файл отсутствует")
    return FileResponse(path, filename=item.name, media_type=item.mime_type or "application/octet-stream")

@app.post("/api/storage/{item_id}/share")
def storage_share(item_id: int, request: Request, u=Depends(current_user), s: Session = Depends(db)):
    item = require_storage_item(item_id, u, s)
    token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=SHARE_TTL_DAYS)
    if item.is_folder:
        descendants = [x for x in storage_descendants(s, u.id, item.id) if not x.is_folder and x.storage_name]
        storage_name = f"share-{token}.zip"
        zip_path = UPLOAD_DIR / storage_name
        item_by_id = {x.id: x for x in s.query(StorageItem).filter(StorageItem.owner_id == u.id).all()}
        def relative_archive_path(child):
            parts = [child.name]
            parent_id = child.parent_id
            while parent_id and parent_id != item.id:
                parent_item = item_by_id.get(parent_id)
                if not parent_item:
                    break
                parts.append(parent_item.name)
                parent_id = parent_item.parent_id
            return "/".join(reversed(parts))
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for child in descendants:
                source = UPLOAD_DIR / child.storage_name
                if source.exists():
                    zf.write(source, arcname=relative_archive_path(child))
        original_name = f"{item.name}.zip"; mime_type = "application/zip"; size = zip_path.stat().st_size
    else:
        storage_name = item.storage_name; original_name = item.name; mime_type = item.mime_type; size = item.size_bytes
    row = SharedFile(token=token, storage_name=storage_name, original_name=original_name,
                     mime_type=mime_type, size_bytes=size, owner_id=u.id, expires_at=expires_at)
    s.add(row); s.commit()
    base = public_share_base(request)
    return {"share_url": f"{base}/share/{token}", "expires_at": iso_utc(expires_at), "file_name": original_name}

@app.post("/api/share-upload")
def share_upload(request: Request, files: List[UploadFile] = File(...), u=Depends(current_user), s: Session = Depends(db)):
    files = [item for item in files if item and item.filename]
    if not files:
        raise HTTPException(400, "Не выбраны файлы")
    if len(files) > 50:
        raise HTTPException(400, "Можно выбрать не более 50 файлов")

    token = uuid.uuid4().hex
    max_total = 500 * 1024 * 1024
    total_size = 0

    if len(files) == 1:
        item = files[0]
        ext = Path(item.filename or "").suffix[:16]
        storage_name = f"share-{token}{ext}"
        path = UPLOAD_DIR / storage_name
        try:
            with path.open("wb") as target:
                while chunk := item.file.read(1024 * 1024):
                    total_size += len(chunk)
                    if total_size > max_total:
                        raise HTTPException(413, "Максимальный общий размер — 500 МБ")
                    target.write(chunk)
        except Exception:
            path.unlink(missing_ok=True)
            raise
        original_name = item.filename or "file"
        mime_type = item.content_type or "application/octet-stream"
    else:
        storage_name = f"share-{token}.zip"
        path = UPLOAD_DIR / storage_name
        used_names = set()
        try:
            with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                for index, item in enumerate(files, start=1):
                    source_name = Path(item.filename or f"file-{index}").name or f"file-{index}"
                    candidate = source_name
                    stem = Path(source_name).stem or f"file-{index}"
                    suffix = Path(source_name).suffix
                    counter = 2
                    while candidate.lower() in used_names:
                        candidate = f"{stem} ({counter}){suffix}"
                        counter += 1
                    used_names.add(candidate.lower())
                    with archive.open(candidate, "w") as target:
                        while chunk := item.file.read(1024 * 1024):
                            total_size += len(chunk)
                            if total_size > max_total:
                                raise HTTPException(413, "Максимальный общий размер — 500 МБ")
                            target.write(chunk)
        except Exception:
            path.unlink(missing_ok=True)
            raise
        original_name = f"files-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.zip"
        mime_type = "application/zip"
        total_size = path.stat().st_size

    expires_at = datetime.now(timezone.utc) + timedelta(days=SHARE_TTL_DAYS)
    row = SharedFile(token=token, storage_name=storage_name, original_name=original_name, mime_type=mime_type, size_bytes=total_size, owner_id=u.id, expires_at=expires_at)
    s.add(row); s.commit()
    base = public_share_base(request)
    return {"share_url": f"{base}/share/{token}", "file_name": row.original_name, "file_count": len(files), "expires_at": expires_at.isoformat()}

@app.get("/share/{token}")
def download_shared(token: str, s: Session = Depends(db)):
    row = s.query(SharedFile).filter_by(token=token).first()
    if not row:
        raise HTTPException(404, "Ссылка не найдена")
    expires = row.expires_at
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires and expires < datetime.now(timezone.utc):
        (UPLOAD_DIR / row.storage_name).unlink(missing_ok=True)
        s.delete(row); s.commit()
        raise HTTPException(410, "Срок действия ссылки истёк")
    path = UPLOAD_DIR / row.storage_name
    if not path.exists():
        raise HTTPException(404, "Файл не найден")
    return FileResponse(path, media_type=row.mime_type or "application/octet-stream", filename=row.original_name)

@app.post("/api/upload")
def upload(file: UploadFile = File(...), u=Depends(current_user)):
    ext = Path(file.filename or "").suffix[:12]
    name = f"{uuid.uuid4().hex}{ext}"
    path = UPLOAD_DIR / name
    size = 0
    with path.open("wb") as target:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > 100 * 1024 * 1024:
                target.close(); path.unlink(missing_ok=True)
                raise HTTPException(413, "Максимальный размер файла — 100 МБ")
            target.write(chunk)
    return {"file_url": f"/uploads/{name}", "file_name": file.filename, "mime_type": file.content_type}

class Hub:
    def __init__(self):
        self.connections: dict[int, set[WebSocket]] = {}
    async def connect(self, uid, ws):
        await ws.accept(); self.connections.setdefault(uid, set()).add(ws)
    def disconnect(self, uid, ws):
        bucket = self.connections.get(uid, set())
        bucket.discard(ws)
        if not bucket:
            self.connections.pop(uid, None)
    async def send_users(self, uids, payload):
        for uid in set(uids):
            for ws in list(self.connections.get(uid, set())):
                try:
                    await ws.send_json(payload)
                except Exception:
                    self.disconnect(uid, ws)

hub = Hub()

async def broadcast_presence(uid: int, online: bool, session: Session):
    user = session.get(User, uid)
    if not user:
        return
    if not online:
        user.last_seen = datetime.now(timezone.utc)
        session.commit(); session.refresh(user)
    peer_ids = {m.id for c in user.chats for m in c.members if m.id != uid}
    payload = {"type": "presence", "user": user_out(user) | {"online": online}}
    await hub.send_users(list(peer_ids), payload)

@app.get("/api/users/{uid}/presence")
def user_presence(uid: int, u=Depends(current_user), s: Session = Depends(db)):
    target = s.get(User, uid)
    if not target:
        raise HTTPException(404, "Пользователь не найден")
    return user_out(target)

ACTIVE_CALLS: dict[str, dict] = {}
CALL_EVENTS: dict[int, list[dict]] = {}
CALL_EVENT_SEQ = 0

def queue_call_event(user_ids: list[int], payload: dict) -> dict:
    global CALL_EVENT_SEQ
    CALL_EVENT_SEQ += 1
    event = dict(payload)
    event["event_id"] = CALL_EVENT_SEQ
    for uid in set(user_ids):
        bucket = CALL_EVENTS.setdefault(uid, [])
        bucket.append(event)
        # Do not let an abandoned client grow server memory indefinitely.
        if len(bucket) > 500:
            del bucket[:-500]
    return event



def send_push(s: Session, uid: int, title: str, body: str, url: str, kind: str = "message", call_id: str | None = None) -> dict:
    if not (VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY):
        return {"sent": 0, "failed": 0, "reason": "VAPID keys are not configured"}
    sent = failed = 0
    subscriptions = s.query(PushSubscription).filter_by(user_id=uid).all()
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=json.dumps({"title": title, "body": body[:180], "url": url, "tag": f"{kind}-{call_id or url.split('=')[-1]}", "kind": kind, "call_id": call_id}, ensure_ascii=False),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
                ttl=86400,
            )
            sent += 1
        except WebPushException as exc:
            failed += 1
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                s.delete(sub)
        except Exception:
            failed += 1
    s.commit()
    return {"sent": sent, "failed": failed, "subscriptions": len(subscriptions)}

@app.post("/api/chats/{cid}/messages")
async def send_message(cid: int, x: MsgIn, u=Depends(current_user), s: Session = Depends(db)):
    chat = require_chat(cid, u, s)
    if chat.is_group and role_for(chat, u.id) == "guest":
        raise HTTPException(403, "Гость не может отправлять сообщения")
    if not x.text.strip() and not x.file_url:
        raise HTTPException(400, "Пустое сообщение")
    u.last_seen = datetime.now(timezone.utc)
    s.add(u)
    message = Message(chat_id=cid, sender_id=u.id, text=x.text.strip(), file_url=x.file_url, file_name=x.file_name, mime_type=x.mime_type)
    s.add(message); s.commit(); s.refresh(message)
    ids = [member.id for member in chat.members]
    recipient_ids = [uid for uid in ids if uid != u.id]
    for uid in recipient_ids:
        s.add(MessageReceipt(message_id=message.id, user_id=uid))
    s.commit()
    online_ids = [uid for uid in recipient_ids if hub.connections.get(uid)]
    if online_ids:
        now = datetime.now(timezone.utc)
        s.query(MessageReceipt).filter(MessageReceipt.message_id == message.id, MessageReceipt.user_id.in_(online_ids)).update({MessageReceipt.delivered_at: now}, synchronize_session=False)
        s.commit()
    payload = {"type": "message", "message": msg_out(message, s)}
    await hub.send_users(ids, payload)
    preview = x.text.strip() or x.file_name or "Новое вложение"
    for uid in ids:
        if uid != u.id:
            send_push(s, uid, getattr(u, "display_name", None) or u.username, preview, f"/?chat={cid}")
    return msg_out(message, s)

def _checklist_access(list_id: int, u, s: Session):
    row = s.get(Checklist, list_id)
    if not row:
        raise HTTPException(404, "Список не найден")
    chat = require_chat(row.chat_id, u, s)
    if chat.is_group and role_for(chat, u.id) == "guest":
        raise HTTPException(403, "Гость не может редактировать список")
    return row, chat

async def _broadcast_checklist(row: Checklist, chat: Chat, s: Session):
    await hub.send_users([m.id for m in chat.members], {"type": "checklist_update", "checklist": checklist_out(row, s)})

@app.get("/api/checklists")
def all_checklists(u=Depends(current_user), s: Session = Depends(db)):
    chat_ids = [c.id for c in u.chats]
    rows = s.query(Checklist).filter(Checklist.chat_id.in_(chat_ids)).order_by(Checklist.updated_at.desc()).all() if chat_ids else []
    chats_by_id = {c.id: c for c in u.chats}
    result = []
    for row in rows:
        chat = chats_by_id.get(row.chat_id)
        payload = checklist_out(row, s)
        payload["chat"] = {"id": row.chat_id, "name": "Совместный список" if chat and getattr(chat, "is_hidden", False) else (chat_out(chat, u)["name"] if chat else "Чат")}
        result.append(payload)
    return result

@app.post("/api/checklists")
async def create_standalone_checklist(x: ChecklistCreateIn, u=Depends(current_user), s: Session = Depends(db)):
    title = x.title.strip()
    if not title:
        raise HTTPException(400, "Введите название списка")
    selected_ids = []
    for uid in x.member_ids[:100]:
        try:
            value = int(uid)
        except (TypeError, ValueError):
            continue
        if value != u.id and value not in selected_ids:
            selected_ids.append(value)
    selected = s.query(User).filter(User.id.in_(selected_ids)).all() if selected_ids else []
    if len(selected) != len(selected_ids):
        raise HTTPException(400, "Один из выбранных пользователей не найден")
    chat = Chat(name=f"Список: {title[:100]}", is_group=True, owner_id=u.id, is_hidden=True)
    chat.members = [u, *selected]
    s.add(chat); s.flush()
    row = Checklist(chat_id=chat.id, title=title[:160], created_by=u.id)
    s.add(row); s.commit(); s.refresh(row)
    await _broadcast_checklist(row, chat, s)
    return checklist_out(row, s)

@app.get("/api/chats/{cid}/checklists")
def chat_checklists(cid: int, u=Depends(current_user), s: Session = Depends(db)):
    require_chat(cid, u, s)
    return [checklist_out(r, s) for r in s.query(Checklist).filter_by(chat_id=cid).order_by(Checklist.updated_at.desc()).all()]

@app.post("/api/chats/{cid}/checklists")
async def create_checklist(cid: int, x: ChecklistCreateIn, u=Depends(current_user), s: Session = Depends(db)):
    chat = require_chat(cid, u, s)
    if chat.is_group and role_for(chat, u.id) == "guest":
        raise HTTPException(403, "Гость не может создавать списки")
    title = x.title.strip()
    if not title:
        raise HTTPException(400, "Введите название списка")
    row = Checklist(chat_id=cid, title=title[:160], created_by=u.id)
    s.add(row); s.flush()
    for pos, value in enumerate(x.items[:100]):
        value = value.strip()
        if value:
            s.add(ChecklistItem(checklist_id=row.id, text=value[:500], position=pos, created_by=u.id))
    message = Message(chat_id=cid, sender_id=u.id, text="", checklist_id=row.id)
    s.add(message); s.commit(); s.refresh(row); s.refresh(message)
    ids = [member.id for member in chat.members]
    for uid in ids:
        if uid != u.id:
            s.add(MessageReceipt(message_id=message.id, user_id=uid))
    s.commit()
    await hub.send_users(ids, {"type": "message", "message": msg_out(message, s)})
    return checklist_out(row, s)

@app.patch("/api/checklists/{list_id}")
async def update_checklist(list_id: int, x: ChecklistUpdateIn, u=Depends(current_user), s: Session = Depends(db)):
    row, chat = _checklist_access(list_id, u, s)
    if x.title is not None:
        title = x.title.strip()
        if not title: raise HTTPException(400, "Название не может быть пустым")
        row.title = title[:160]
    row.updated_at = datetime.now(timezone.utc); s.commit(); s.refresh(row)
    await _broadcast_checklist(row, chat, s)
    return checklist_out(row, s)

@app.delete("/api/checklists/{list_id}")
async def delete_checklist(list_id: int, u=Depends(current_user), s: Session = Depends(db)):
    row, chat = _checklist_access(list_id, u, s)
    message_ids = [m.id for m in s.query(Message).filter_by(checklist_id=row.id).all()]
    if message_ids:
        s.query(MessageReceipt).filter(MessageReceipt.message_id.in_(message_ids)).delete(synchronize_session=False)
        s.query(Message).filter(Message.id.in_(message_ids)).delete(synchronize_session=False)
    s.query(ChecklistItem).filter_by(checklist_id=row.id).delete(synchronize_session=False)
    s.delete(row); s.commit()
    await hub.send_users([m.id for m in chat.members], {"type": "checklist_delete", "checklist_id": list_id})
    return {"ok": True}

@app.post("/api/checklists/{list_id}/items")
async def add_checklist_item(list_id: int, x: ChecklistItemCreateIn, u=Depends(current_user), s: Session = Depends(db)):
    row, chat = _checklist_access(list_id, u, s)
    value = x.text.strip()
    if not value: raise HTTPException(400, "Пункт не может быть пустым")
    last = s.query(func.max(ChecklistItem.position)).filter_by(checklist_id=list_id).scalar()
    item = ChecklistItem(checklist_id=list_id, text=value[:500], position=(last or 0)+1, created_by=u.id, updated_by=u.id)
    s.add(item); row.updated_at=datetime.now(timezone.utc); s.commit(); s.refresh(row)
    await _broadcast_checklist(row, chat, s)
    return checklist_out(row, s)

@app.patch("/api/checklists/{list_id}/items/{item_id}")
async def update_checklist_item(list_id: int, item_id: int, x: ChecklistItemUpdateIn, u=Depends(current_user), s: Session = Depends(db)):
    row, chat = _checklist_access(list_id, u, s)
    item = s.query(ChecklistItem).filter_by(id=item_id, checklist_id=list_id).first()
    if not item: raise HTTPException(404, "Пункт не найден")
    if x.text is not None:
        value=x.text.strip()
        if not value: raise HTTPException(400, "Пункт не может быть пустым")
        item.text=value[:500]
    if x.checked is not None: item.checked=bool(x.checked)
    if x.position is not None: item.position=max(0,int(x.position))
    item.updated_by=u.id; row.updated_at=datetime.now(timezone.utc); s.commit(); s.refresh(row)
    await _broadcast_checklist(row, chat, s)
    return checklist_out(row, s)

@app.delete("/api/checklists/{list_id}/items/{item_id}")
async def delete_checklist_item(list_id: int, item_id: int, u=Depends(current_user), s: Session = Depends(db)):
    row, chat = _checklist_access(list_id, u, s)
    item=s.query(ChecklistItem).filter_by(id=item_id, checklist_id=list_id).first()
    if not item: raise HTTPException(404, "Пункт не найден")
    s.delete(item); row.updated_at=datetime.now(timezone.utc); s.commit(); s.refresh(row)
    await _broadcast_checklist(row, chat, s)
    return checklist_out(row, s)

@app.get("/api/push/public-key")
def vapid_key():
    return {"key": VAPID_PUBLIC_KEY, "configured": bool(VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY)}

@app.get("/api/push/status")
def push_status(u=Depends(current_user), s: Session = Depends(db)):
    return {"configured": bool(VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY), "subscriptions": s.query(PushSubscription).filter_by(user_id=u.id).count()}

@app.post("/api/push/subscribe")
def subscribe(x: PushIn, u=Depends(current_user), s: Session = Depends(db)):
    p256dh = x.keys.get("p256dh", "")
    auth = x.keys.get("auth", "")
    if not x.endpoint or not p256dh or not auth:
        raise HTTPException(400, "Некорректная push-подписка")
    row = s.query(PushSubscription).filter_by(endpoint=x.endpoint).first()
    if not row:
        row = PushSubscription(endpoint=x.endpoint, user_id=u.id, p256dh=p256dh, auth=auth)
    row.user_id = u.id; row.p256dh = p256dh; row.auth = auth
    s.add(row); s.commit()
    return {"ok": True}

@app.post("/api/push/test")
def push_test(u=Depends(current_user), s: Session = Depends(db)):
    result = send_push(s, u.id, "Messenger", "Тестовое уведомление работает", "/")
    if not result.get("sent"):
        raise HTTPException(503, result)
    return result

@app.get("/api/calls/events")
def poll_call_events(after: int = 0, u=Depends(current_user)):
    events = [e for e in CALL_EVENTS.get(u.id, []) if int(e.get("event_id", 0)) > after]
    return {"events": events[:100], "last_event_id": events[-1]["event_id"] if events else after}

@app.get("/api/calls/ice")
def call_ice(u=Depends(current_user)):
    servers = [{"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}]
    if TURN_HOST:
        servers.append({
            "urls": [f"turn:{TURN_HOST}:{TURN_PORT}?transport=udp", f"turn:{TURN_HOST}:{TURN_PORT}?transport=tcp"],
            "username": TURN_USERNAME,
            "credential": TURN_PASSWORD,
        })
    return {"iceServers": servers, "turn_configured": bool(TURN_HOST)}

def call_expired(call, now=None):
    now = now or datetime.now(timezone.utc)
    age = now - call["created_at"]
    if call.get("ended") or age > timedelta(hours=4):
        return True
    # Неотвеченный звонок не должен восстанавливаться спустя минуты.
    if len(call.get("participants", [])) <= 1 and age > timedelta(minutes=2):
        return True
    return False

@app.get("/api/calls/by-id/{call_id}")
def get_call(call_id: str, u=Depends(current_user)):
    call = ACTIVE_CALLS.get(call_id)
    if not call or u.id not in call["member_ids"] or call_expired(call) or u.id in call.get("declined_ids", []):
        if call and call_expired(call): ACTIVE_CALLS.pop(call_id, None)
        raise HTTPException(404, "Звонок уже завершён или недоступен")
    return {k: v for k, v in call.items() if k != "created_at"} | {"created_at": iso_utc(call["created_at"])}

@app.get("/api/calls/active")
def active_calls(u=Depends(current_user)):
    now = datetime.now(timezone.utc)
    result = []
    expired = []
    for call_id, call in ACTIVE_CALLS.items():
        if call_expired(call, now):
            expired.append(call_id)
        elif u.id in call["member_ids"] and u.id not in call.get("declined_ids", []):
            result.append({k: v for k, v in call.items() if k != "created_at"} | {"created_at": iso_utc(call["created_at"])})
    for call_id in expired:
        ACTIVE_CALLS.pop(call_id, None)
    return result

@app.post("/api/chats/{cid}/calls")
async def start_call(cid: int, x: CallIn, u=Depends(current_user), s: Session = Depends(db)):
    chat = require_chat(cid, u, s)
    if chat.is_group and role_for(chat, u.id) == "guest":
        raise HTTPException(403, "Гость не может начинать звонки")
    if x.mode not in ("audio", "video"):
        raise HTTPException(400, "Допустимы audio или video")
    call_id = uuid.uuid4().hex
    member_ids = [m.id for m in chat.members]
    call = {
        "call_id": call_id, "chat_id": cid, "chat_name": chat_out(chat, u)["name"], "mode": x.mode,
        "caller": user_out(u), "member_ids": member_ids, "participants": [u.id], "declined_ids": [], "created_at": datetime.now(timezone.utc), "ended": False,
    }
    ACTIVE_CALLS[call_id] = call
    payload = {"type": "call_invite", "call": {k: v for k, v in call.items() if k != "created_at"} | {"created_at": iso_utc(call["created_at"])}}
    recipients = [uid for uid in member_ids if uid != u.id]
    payload = queue_call_event(recipients, payload)
    await hub.send_users(recipients, payload)
    label = "Видеозвонок" if x.mode == "video" else "Аудиозвонок"
    for uid in member_ids:
        if uid != u.id:
            send_push(s, uid, getattr(u, "display_name", None) or u.username, f"Входящий {label.lower()}", f"/?chat={cid}&call={call_id}", "call", call_id)
    return payload["call"]

async def process_call_event(uid: int, data: dict, s: Session):
    event_type = data.get("type")
    call_id = data.get("call_id", "")
    call = ACTIVE_CALLS.get(call_id)
    if not call or uid not in call["member_ids"]:
        return
    sender = s.get(User, uid)
    if not sender:
        return
    base = {"type": event_type, "call_id": call_id, "chat_id": call["chat_id"], "from": user_out(sender)}
    if event_type == "call_accept":
        if uid not in call["participants"]:
            call["participants"].append(uid)
        base["participants"] = call["participants"]
        base = queue_call_event(call["member_ids"], base)
        await hub.send_users(call["member_ids"], base)
    elif event_type in ("call_reject", "call_hangup"):
        if uid in call["participants"]:
            call["participants"].remove(uid)
        if event_type == "call_reject" and uid not in call.setdefault("declined_ids", []):
            call["declined_ids"].append(uid)
        base["participants"] = call["participants"]
        # В личном чате завершение любым участником завершает звонок полностью.
        # В группе выход участника не завершает разговор остальных, кроме выхода инициатора.
        personal_call = len(call["member_ids"]) <= 2
        if personal_call or uid == call["caller"]["id"] or not call["participants"]:
            call["ended"] = True
            base["ended"] = True
        base = queue_call_event(call["member_ids"], base)
        await hub.send_users(call["member_ids"], base)
    elif event_type == "webrtc_signal":
        target = int(data.get("target_user_id", 0))
        if target not in call["member_ids"]:
            return
        base["signal"] = data.get("signal", {})
        base = queue_call_event([target], base)
        await hub.send_users([target], base)


@app.post("/api/calls/{call_id}/event")
async def call_event_http(call_id: str, x: CallEventIn, u=Depends(current_user), s: Session = Depends(db)):
    if x.type not in {"call_accept", "call_reject", "call_hangup", "webrtc_signal"}:
        raise HTTPException(400, "Недопустимое событие звонка")
    data = {"type": x.type, "call_id": call_id}
    if x.target_user_id is not None:
        data["target_user_id"] = x.target_user_id
    if x.signal is not None:
        data["signal"] = x.signal
    await process_call_event(u.id, data, s)
    return {"ok": True}

@app.post("/api/calls/{call_id}/leave")
async def leave_call(call_id: str, u=Depends(current_user), s: Session = Depends(db)):
    call = ACTIVE_CALLS.get(call_id)
    if not call or u.id not in call["member_ids"]:
        return {"ok": True, "ended": True}
    await process_call_event(u.id, {"type": "call_hangup", "call_id": call_id}, s)
    return {"ok": True, "ended": bool(call.get("ended"))}

@app.post("/api/calls/{call_id}/reject")
async def reject_call_http(call_id: str, u=Depends(current_user), s: Session = Depends(db)):
    call = ACTIVE_CALLS.get(call_id)
    if not call or u.id not in call["member_ids"]:
        return {"ok": True}
    await process_call_event(u.id, {"type": "call_reject", "call_id": call_id}, s)
    return {"ok": True}

@app.websocket("/ws")
async def websocket(ws: WebSocket, token_q: str):
    try:
        uid = decode_token(token_q)
    except Exception:
        await ws.close(code=4401); return
    await hub.connect(uid, ws)
    session = SessionLocal()
    user = session.get(User, uid)
    if user:
        user.last_seen = datetime.now(timezone.utc)
        session.commit()
    await broadcast_presence(uid, True, session)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            user = session.get(User, uid)
            if user:
                user.last_seen = datetime.now(timezone.utc)
                session.commit()
            if data.get("type") == "ping":
                continue
            if data.get("type") in {"call_accept", "call_reject", "call_hangup", "webrtc_signal"}:
                await process_call_event(uid, data, session)
    except WebSocketDisconnect:
        hub.disconnect(uid, ws)
    finally:
        hub.disconnect(uid, ws)
        if not hub.connections.get(uid):
            await broadcast_presence(uid, False, session)
        session.close()
