from fastapi import APIRouter, HTTPException, status, Response, Depends
from app.database import get_db_connection
from app.auth import verify_password, get_password_hash, create_access_token, get_current_user
from app.models import LoginRequest, UserResponse, ChangePasswordRequest

router = APIRouter(prefix="/api/auth", tags=["Autenticação"])

@router.post("/login")
def login(credentials: LoginRequest, response: Response):
    email = credentials.email.strip().lower()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, password_hash, name FROM users WHERE lower(email) = ?", (email,))
        user = cursor.fetchone()

        if not user or not verify_password(credentials.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="E-mail ou senha incorretos."
            )

        token = create_access_token(data={"sub": str(user["id"]), "email": user["email"]})

        # Configurar cookie seguro para navegação direta e compatibilidade
        response.set_cookie(
            key="access_token",
            value=f"Bearer {token}",
            httponly=True,
            max_age=30 * 24 * 3600,
            samesite="lax",
            secure=False # Permitir HTTP se o VPS não tiver HTTPS ainda
        )

        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"]
            }
        }

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "Desconectado com sucesso."}

@router.get("/me", response_model=UserResponse)
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT password_hash FROM users WHERE id = ?", (current_user["id"],))
        user = cursor.fetchone()

        if not user or not verify_password(data.current_password, user["password_hash"]):
            raise HTTPException(status_code=400, detail="Senha atual incorreta.")

        if len(data.new_password) < 6:
            raise HTTPException(status_code=400, detail="A nova senha deve ter no mínimo 6 caracteres.")

        new_hash = get_password_hash(data.new_password)
        cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, current_user["id"]))
        conn.commit()

        return {"message": "Senha atualizada com sucesso!"}
