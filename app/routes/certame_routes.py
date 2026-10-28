from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import List, Optional
from datetime import datetime
from app.database import get_db_connection
from app.auth import get_current_user
from app.models import (
    CertameCreate, CertameUpdate, CertameResponse, CertameDetailResponse,
    DashboardStats, compute_item_metrics, compute_certame_totais
)

router = APIRouter(prefix="/api/certames", tags=["Certames e Cálculos"])

def _fetch_certame_items(cursor, certame_id: int) -> List[dict]:
    cursor.execute("""
        SELECT id, certame_id, numero_item, lote, descricao, unidade,
               quantidade, custo_unitario, frete_unitario, aliquota_imposto,
               valor_venda_unitario, observacao, created_at, updated_at
        FROM itens
        WHERE certame_id = ?
        ORDER BY numero_item ASC, id ASC
    """, (certame_id,))
    rows = cursor.fetchall()
    return [compute_item_metrics(dict(row)) for row in rows]

@router.get("", response_model=List[CertameResponse])
def list_certames(
    search: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: dict = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        query = """
            SELECT id, user_id, orgao, numero_pregao, titulo, modalidade,
                   data_abertura, status, aliquota_padrao, observacoes,
                   created_at, updated_at
            FROM certames
            WHERE user_id = ?
        """
        params = [current_user["id"]]

        if status_filter and status_filter.strip():
            query += " AND status = ?"
            params.append(status_filter.strip())

        if search and search.strip():
            s = f"%{search.strip()}%"
            query += " AND (orgao LIKE ? OR numero_pregao LIKE ? OR titulo LIKE ?)"
            params.extend([s, s, s])

        query += " ORDER BY updated_at DESC, id DESC"

        cursor.execute(query, params)
        certames_rows = cursor.fetchall()

        results = []
        for crow in certames_rows:
            cdict = dict(crow)
            items = _fetch_items_raw(cursor, cdict["id"])
            calculated_items = [compute_item_metrics(i) for i in items]
            totais = compute_certame_totais(calculated_items)
            cdict["totais"] = totais
            results.append(cdict)

        return results

def _fetch_items_raw(cursor, certame_id: int) -> List[dict]:
    cursor.execute("""
        SELECT id, certame_id, numero_item, lote, descricao, unidade,
               quantidade, custo_unitario, frete_unitario, aliquota_imposto,
               valor_venda_unitario, observacao
        FROM itens
        WHERE certame_id = ?
        ORDER BY numero_item ASC, id ASC
    """, (certame_id,))
    return [dict(r) for r in cursor.fetchall()]

@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, status FROM certames WHERE user_id = ?
        """, (current_user["id"],))
        rows = cursor.fetchall()

        total_certames = len(rows)
        total_rascunhos = sum(1 for r in rows if r["status"] in ("Em Elaboração", "Rascunho"))
        total_em_disputa = sum(1 for r in rows if r["status"] in ("Em Disputa", "Disputa"))
        total_ganhos = sum(1 for r in rows if r["status"] in ("Ganho / Homologado", "Ganho", "Homologado"))

        total_faturamento_ganho = 0.0
        total_lucro_ganho = 0.0

        for r in rows:
            if r["status"] in ("Ganho / Homologado", "Ganho", "Homologado"):
                items = _fetch_items_raw(cursor, r["id"])
                calc_items = [compute_item_metrics(i) for i in items]
                totais = compute_certame_totais(calc_items)
                total_faturamento_ganho += totais.total_faturamento
                total_lucro_ganho += totais.total_lucro_liquido

        margem_media = (total_lucro_ganho / total_faturamento_ganho * 100.0) if total_faturamento_ganho > 0 else 0.0

        return DashboardStats(
            total_certames=total_certames,
            total_rascunhos=total_rascunhos,
            total_em_disputa=total_em_disputa,
            total_ganhos=total_ganhos,
            total_faturamento_ganho=round(total_faturamento_ganho, 2),
            total_lucro_ganho=round(total_lucro_ganho, 2),
            margem_media_ganho=round(margem_media, 2)
        )

@router.post("", response_model=CertameDetailResponse, status_code=status.HTTP_201_CREATED)
def create_certame(data: CertameCreate, current_user: dict = Depends(get_current_user)):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        cursor.execute("""
            INSERT INTO certames (user_id, orgao, numero_pregao, titulo, modalidade,
                                 data_abertura, status, aliquota_padrao, observacoes,
                                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            current_user["id"], data.orgao.strip(), data.numero_pregao.strip(),
            data.titulo.strip(), data.modalidade.strip(), data.data_abertura,
            data.status.strip(), data.aliquota_padrao, data.observacoes,
            now, now
        ))
        certame_id = cursor.lastrowid

        # Inserir itens
        item_num = 1
        for item in data.itens:
            num = item.numero_item if item.numero_item else item_num
            cursor.execute("""
                INSERT INTO itens (certame_id, numero_item, lote, descricao, unidade,
                                  quantidade, custo_unitario, frete_unitario,
                                  aliquota_imposto, valor_venda_unitario, observacao,
                                  created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                certame_id, num, item.lote, item.descricao.strip(), item.unidade.strip(),
                item.quantidade, item.custo_unitario, item.frete_unitario,
                item.aliquota_imposto, item.valor_venda_unitario, item.observacao,
                now, now
            ))
            item_num += 1

        conn.commit()

        # Recarregar certame completo
        return get_certame_by_id(certame_id, current_user, cursor=cursor)

@router.get("/{certame_id}", response_model=CertameDetailResponse)
def get_certame(certame_id: int, current_user: dict = Depends(get_current_user)):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        return get_certame_by_id(certame_id, current_user, cursor=cursor)

def get_certame_by_id(certame_id: int, current_user: dict, cursor) -> dict:
    cursor.execute("""
        SELECT id, user_id, orgao, numero_pregao, titulo, modalidade,
               data_abertura, status, aliquota_padrao, observacoes,
               created_at, updated_at
        FROM certames
        WHERE id = ? AND user_id = ?
    """, (certame_id, current_user["id"]))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Certame não encontrado.")

    cdict = dict(row)
    calculated_items = _fetch_certame_items(cursor, certame_id)
    totais = compute_certame_totais(calculated_items)
    cdict["itens"] = calculated_items
    cdict["totais"] = totais
    return cdict

@router.put("/{certame_id}", response_model=CertameDetailResponse)
def update_certame(
    certame_id: int,
    data: CertameUpdate,
    current_user: dict = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM certames WHERE id = ? AND user_id = ?", (certame_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Certame não encontrado.")

        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        cursor.execute("""
            UPDATE certames
            SET orgao = ?, numero_pregao = ?, titulo = ?, modalidade = ?,
                data_abertura = ?, status = ?, aliquota_padrao = ?,
                observacoes = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
        """, (
            data.orgao.strip(), data.numero_pregao.strip(), data.titulo.strip(),
            data.modalidade.strip(), data.data_abertura, data.status.strip(),
            data.aliquota_padrao, data.observacoes, now,
            certame_id, current_user["id"]
        ))

        # Atualizar itens: para garantir consistência e ordenação, removemos os antigos e inserimos os novos
        cursor.execute("DELETE FROM itens WHERE certame_id = ?", (certame_id,))

        item_num = 1
        for item in data.itens:
            num = item.numero_item if item.numero_item else item_num
            cursor.execute("""
                INSERT INTO itens (certame_id, numero_item, lote, descricao, unidade,
                                  quantidade, custo_unitario, frete_unitario,
                                  aliquota_imposto, valor_venda_unitario, observacao,
                                  created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                certame_id, num, item.lote, item.descricao.strip(), item.unidade.strip(),
                item.quantidade, item.custo_unitario, item.frete_unitario,
                item.aliquota_imposto, item.valor_venda_unitario, item.observacao,
                now, now
            ))
            item_num += 1

        conn.commit()
        return get_certame_by_id(certame_id, current_user, cursor=cursor)

@router.delete("/{certame_id}")
def delete_certame(certame_id: int, current_user: dict = Depends(get_current_user)):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM certames WHERE id = ? AND user_id = ?", (certame_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Certame não encontrado.")

        cursor.execute("DELETE FROM certames WHERE id = ? AND user_id = ?", (certame_id, current_user["id"]))
        conn.commit()
        return {"message": "Certame excluído com sucesso."}

@router.post("/{certame_id}/duplicate", response_model=CertameDetailResponse)
def duplicate_certame(certame_id: int, current_user: dict = Depends(get_current_user)):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT orgao, numero_pregao, titulo, modalidade, aliquota_padrao, observacoes
            FROM certames
            WHERE id = ? AND user_id = ?
        """, (certame_id, current_user["id"]))
        orig = cursor.fetchone()
        if not orig:
            raise HTTPException(status_code=404, detail="Certame não encontrado.")

        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        new_title = f"{orig['titulo']} (Cópia)"
        new_pregao = f"{orig['numero_pregao']} - Cópia"

        cursor.execute("""
            INSERT INTO certames (user_id, orgao, numero_pregao, titulo, modalidade,
                                 status, aliquota_padrao, observacoes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'Em Elaboração', ?, ?, ?, ?)
        """, (
            current_user["id"], orig["orgao"], new_pregao, new_title,
            orig["modalidade"], orig["aliquota_padrao"], orig["observacoes"],
            now, now
        ))
        new_certame_id = cursor.lastrowid

        # Clonar itens
        cursor.execute("""
            SELECT numero_item, lote, descricao, unidade, quantidade,
                   custo_unitario, frete_unitario, aliquota_imposto,
                   valor_venda_unitario, observacao
            FROM itens
            WHERE certame_id = ?
            ORDER BY numero_item ASC
        """, (certame_id,))
        itens = cursor.fetchall()

        for it in itens:
            cursor.execute("""
                INSERT INTO itens (certame_id, numero_item, lote, descricao, unidade,
                                  quantidade, custo_unitario, frete_unitario,
                                  aliquota_imposto, valor_venda_unitario, observacao,
                                  created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                new_certame_id, it["numero_item"], it["lote"], it["descricao"],
                it["unidade"], it["quantidade"], it["custo_unitario"],
                it["frete_unitario"], it["aliquota_imposto"],
                it["valor_venda_unitario"], it["observacao"], now, now
            ))

        conn.commit()
        return get_certame_by_id(new_certame_id, current_user, cursor=cursor)
