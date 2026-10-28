FROM python:3.11-slim

# Evitar criação de arquivos .pyc e garantir output imediato de logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Instalar dependências necessárias
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements primeiro para aproveitar cache do Docker
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Criar pasta para banco de dados SQLite persistente
RUN mkdir -p /app/data

# Copiar o restante da aplicação
COPY app /app/app

# Porta exposta
EXPOSE 8000

# Healthcheck para o Coolify monitorar a saúde do container
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Comando de inicialização
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
