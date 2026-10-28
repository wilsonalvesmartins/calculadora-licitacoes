import os
from pathlib import Path

# Diretórios base
BASE_DIR = Path(__file__).resolve().parent.parent

# Configurações de ambiente
PORT = int(os.getenv("PORT", "8000"))
DATABASE_PATH = os.getenv("DATABASE_PATH", str(BASE_DIR / "data" / "licitacoes.db"))
SECRET_KEY = os.getenv("SECRET_KEY", "chave_secreta_padrao_licitacoes_2026_segura_jwt_abc123")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30

# Usuário padrão para o primeiro acesso
DEFAULT_USER_EMAIL = os.getenv("DEFAULT_USER_EMAIL", "wilsonalves.jur@gmail.com").strip().lower()
DEFAULT_USER_PASSWORD = os.getenv("DEFAULT_USER_PASSWORD", "93281434@Neto@")

# Garantir que a pasta do banco exista
db_dir = Path(DATABASE_PATH).parent
db_dir.mkdir(parents=True, exist_ok=True)
