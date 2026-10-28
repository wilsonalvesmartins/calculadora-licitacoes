from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path

from app.database import init_db, get_db_connection
from app.auth import get_current_user_optional, get_current_user
from app.routes import auth_routes, certame_routes
from app.routes.certame_routes import get_certame_by_id

# Caminhos base
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

# Criar pastas se não existirem
STATIC_DIR.mkdir(parents=True, exist_ok=True)
(STATIC_DIR / "css").mkdir(parents=True, exist_ok=True)
(STATIC_DIR / "js").mkdir(parents=True, exist_ok=True)
TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicialização do banco SQLite e seeding do usuário inicial
    init_db()
    print("✓ Banco de dados e tabelas prontos.")
    yield

app = FastAPI(
    title="Calculadora de Licitações e Dispensas",
    description="Sistema web para cálculo de custos, impostos, margens de lucro e faturamento em certames públicos.",
    version="1.0.0",
    lifespan=lifespan
)

# Servir arquivos estáticos
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Configurar templates Jinja2
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# Registrar rotas da API
app.include_router(auth_routes.router)
app.include_router(certame_routes.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "Calculadora de Licitações", "version": "1.0.0"}

@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    user = get_current_user_optional(request)
    if user:
        return RedirectResponse(url="/", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/", response_class=HTMLResponse)
def index_page(request: Request):
    user = get_current_user_optional(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse("index.html", {"request": request, "user": user})

@app.get("/certame/{certame_id}/imprimir", response_class=HTMLResponse)
def print_page(certame_id: int, request: Request):
    user = get_current_user_optional(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)

    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            certame_data = get_certame_by_id(certame_id, user, cursor)
        except HTTPException:
            return RedirectResponse(url="/", status_code=302)

    return templates.TemplateResponse("print.html", {
        "request": request,
        "certame": certame_data,
        "user": user
    })
