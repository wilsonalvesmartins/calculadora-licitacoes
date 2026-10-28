from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime

# ================= AUTH SCHEMAS =================
class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    created_at: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# ================= ITEM SCHEMAS =================
class ItemBase(BaseModel):
    numero_item: int = 1
    lote: Optional[str] = None
    descricao: str
    unidade: str = "UN"
    quantidade: float = Field(default=1.0, ge=0.0)
    custo_unitario: float = Field(default=0.0, ge=0.0)
    frete_unitario: float = Field(default=0.0, ge=0.0)
    aliquota_imposto: float = Field(default=6.0, ge=0.0, le=100.0)
    valor_venda_unitario: float = Field(default=0.0, ge=0.0)
    observacao: Optional[str] = None

class ItemCreate(ItemBase):
    pass

class ItemCalculated(ItemBase):
    id: Optional[int] = None
    certame_id: Optional[int] = None
    
    # Valores calculados por item
    custo_unitario_total: float = 0.0      # custo_unitario + frete_unitario
    custo_total: float = 0.0               # quantidade * custo_unitario_total
    faturamento_bruto: float = 0.0         # quantidade * valor_venda_unitario
    imposto_total: float = 0.0             # faturamento_bruto * (aliquota_imposto / 100)
    valor_liquido_receber: float = 0.0     # faturamento_bruto - imposto_total
    lucro_liquido: float = 0.0             # faturamento_bruto - imposto_total - custo_total
    margem_liquida: float = 0.0            # (lucro_liquido / faturamento_bruto) * 100
    lance_minimo_unitario: float = 0.0     # Break-even unitário

# ================= CERTAME SCHEMAS =================
class CertameBase(BaseModel):
    orgao: str
    numero_pregao: str
    titulo: str
    modalidade: str = "Pregão Eletrônico"
    data_abertura: Optional[str] = None
    status: str = "Em Elaboração"
    aliquota_padrao: float = 6.0
    observacoes: Optional[str] = None

class CertameCreate(CertameBase):
    itens: List[ItemCreate] = []

class CertameUpdate(CertameBase):
    itens: List[ItemCreate] = []

class CertameTotais(BaseModel):
    total_itens: int = 0
    total_quantidade: float = 0.0
    total_custo_produtos: float = 0.0
    total_custo_frete: float = 0.0
    total_custos: float = 0.0
    total_faturamento: float = 0.0
    total_impostos: float = 0.0
    total_liquido_receber: float = 0.0     # Faturamento após impostos
    total_lucro_liquido: float = 0.0       # Sobra real no bolso
    margem_liquida_media: float = 0.0      # Margem % consolidada

class CertameResponse(CertameBase):
    id: int
    user_id: int
    created_at: str
    updated_at: str
    totais: CertameTotais

class CertameDetailResponse(CertameResponse):
    itens: List[ItemCalculated] = []

# ================= STATS SCHEMAS =================
class DashboardStats(BaseModel):
    total_certames: int
    total_rascunhos: int
    total_em_disputa: int
    total_ganhos: int
    total_faturamento_ganho: float
    total_lucro_ganho: float
    margem_media_ganho: float

# ================= FUNÇÃO DE CÁLCULO =================
def compute_item_metrics(item: dict) -> dict:
    """Calcula todas as métricas financeiras de um item."""
    qtd = float(item.get("quantidade") or 0.0)
    custo_un = float(item.get("custo_unitario") or 0.0)
    frete_un = float(item.get("frete_unitario") or 0.0)
    aliquota = float(item.get("aliquota_imposto") or 0.0)
    venda_un = float(item.get("valor_venda_unitario") or 0.0)

    custo_un_total = custo_un + frete_un
    custo_total = qtd * custo_un_total
    faturamento_bruto = qtd * venda_un
    imposto_total = faturamento_bruto * (aliquota / 100.0)
    valor_liquido_receber = faturamento_bruto - imposto_total
    lucro_liquido = faturamento_bruto - imposto_total - custo_total
    margem_liquida = (lucro_liquido / faturamento_bruto * 100.0) if faturamento_bruto > 0 else 0.0

    # Lance mínimo de venda unitário para margem zero (ponto de equilíbrio)
    # Venda = Custo / (1 - Alíquota)
    if aliquota < 100.0:
        lance_minimo = custo_un_total / (1.0 - (aliquota / 100.0))
    else:
        lance_minimo = custo_un_total

    result = dict(item)
    result.update({
        "custo_unitario_total": round(custo_un_total, 2),
        "custo_total": round(custo_total, 2),
        "faturamento_bruto": round(faturamento_bruto, 2),
        "imposto_total": round(imposto_total, 2),
        "valor_liquido_receber": round(valor_liquido_receber, 2),
        "lucro_liquido": round(lucro_liquido, 2),
        "margem_liquida": round(margem_liquida, 2),
        "lance_minimo_unitario": round(lance_minimo, 2),
    })
    return result

def compute_certame_totais(itens: List[dict]) -> CertameTotais:
    """Calcula os totais consolidados para uma lista de itens calculados."""
    total_itens = len(itens)
    total_qtd = sum(float(i.get("quantidade") or 0) for i in itens)
    total_custo_produtos = sum(float(i.get("quantidade") or 0) * float(i.get("custo_unitario") or 0) for i in itens)
    total_custo_frete = sum(float(i.get("quantidade") or 0) * float(i.get("frete_unitario") or 0) for i in itens)
    total_custos = sum(float(i.get("custo_total") or 0) for i in itens)
    total_faturamento = sum(float(i.get("faturamento_bruto") or 0) for i in itens)
    total_impostos = sum(float(i.get("imposto_total") or 0) for i in itens)
    total_liquido_receber = sum(float(i.get("valor_liquido_receber") or 0) for i in itens)
    total_lucro_liquido = sum(float(i.get("lucro_liquido") or 0) for i in itens)
    
    margem_liquida_media = (total_lucro_liquido / total_faturamento * 100.0) if total_faturamento > 0 else 0.0

    return CertameTotais(
        total_itens=total_itens,
        total_quantidade=round(total_qtd, 2),
        total_custo_produtos=round(total_custo_produtos, 2),
        total_custo_frete=round(total_custo_frete, 2),
        total_custos=round(total_custos, 2),
        total_faturamento=round(total_faturamento, 2),
        total_impostos=round(total_impostos, 2),
        total_liquido_receber=round(total_liquido_receber, 2),
        total_lucro_liquido=round(total_lucro_liquido, 2),
        margem_liquida_media=round(margem_liquida_media, 2)
    )
