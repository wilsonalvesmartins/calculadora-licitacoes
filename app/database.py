import sqlite3
import bcrypt
from datetime import datetime
from app.config import DATABASE_PATH, DEFAULT_USER_EMAIL, DEFAULT_USER_PASSWORD

def get_db_connection() -> sqlite3.Connection:
    """Retorna uma conexão SQLite configurada com WAL e Row factory."""
    conn = sqlite3.connect(DATABASE_PATH, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    """Inicializa as tabelas do banco de dados e cria o usuário inicial."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Tabela de usuários
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabela de certames (Pregões, Dispensas, etc.)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS certames (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                orgao TEXT NOT NULL,
                numero_pregao TEXT NOT NULL,
                titulo TEXT NOT NULL,
                modalidade TEXT DEFAULT 'Pregão Eletrônico',
                data_abertura TEXT,
                status TEXT DEFAULT 'Em Elaboração',
                aliquota_padrao REAL DEFAULT 6.0,
                observacoes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Tabela de itens do certame
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS itens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                certame_id INTEGER NOT NULL,
                numero_item INTEGER NOT NULL,
                lote TEXT,
                descricao TEXT NOT NULL,
                unidade TEXT DEFAULT 'UN',
                quantidade REAL NOT NULL DEFAULT 1,
                custo_unitario REAL NOT NULL DEFAULT 0,
                frete_unitario REAL NOT NULL DEFAULT 0,
                aliquota_imposto REAL NOT NULL DEFAULT 6.0,
                valor_venda_unitario REAL NOT NULL DEFAULT 0,
                observacao TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (certame_id) REFERENCES certames(id) ON DELETE CASCADE
            )
        """)

        # Índices para performance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_certames_user ON certames(user_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_certames_status ON certames(status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_itens_certame ON itens(certame_id);")

        conn.commit()

        # Seed do usuário padrão
        seed_default_user(cursor)
        conn.commit()

def seed_default_user(cursor):
    """Garante que o usuário solicitado existe no banco com a senha configurada."""
    cursor.execute("SELECT id, password_hash FROM users WHERE email = ?", (DEFAULT_USER_EMAIL,))
    user = cursor.fetchone()

    hashed_pw = bcrypt.hashpw(DEFAULT_USER_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    if not user:
        cursor.execute("""
            INSERT INTO users (email, password_hash, name)
            VALUES (?, ?, ?)
        """, (DEFAULT_USER_EMAIL, hashed_pw, "Wilson Alves"))
        print(f"[DB] Usuário padrão criado: {DEFAULT_USER_EMAIL}")
    else:
        # Usuário já existe, podemos manter ou atualizar a senha se necessário
        pass
