from datetime import datetime, timedelta
from typing import Optional
import bcrypt
import jwt
from fastapi import Request, HTTPException, status, Depends
from app.config import SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_DAYS
from app.database import get_db_connection

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def get_token_from_request(request: Request) -> Optional[str]:
    # 1. Tentar ler do Cookie
    token = request.cookies.get("access_token")
    if token:
        # Pode vir com prefixo "Bearer "
        if token.startswith("Bearer "):
            return token[7:]
        return token

    # 2. Tentar ler do Header Authorization
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]

    return None

def get_current_user_optional(request: Request) -> Optional[dict]:
    token = get_token_from_request(request)
    if not token:
        return None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
    except jwt.PyJWTError:
        return None

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, name, created_at FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        if user:
            return dict(user)
    return None

def get_current_user(request: Request) -> dict:
    user = get_current_user_optional(request)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autenticado. Por favor, faça login.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
