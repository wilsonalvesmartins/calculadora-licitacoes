/**
 * Calculadora de Licitações e Dispensas - Script Principal
 */

// Estado global da aplicação
const AppState = {
  certames: [],
  currentCertame: null,
  activeFilter: 'TODOS',
  searchQuery: '',
  stats: null,
  isEditing: false
};

// Funções utilitárias de formatação monetária e numérica
function formatBRL(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value) {
  const num = Number(value) || 0;
  return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  // Substitui vírgula por ponto para conversão
  const clean = String(value).replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

// ================= API CALLS =================
const API = {
  async getStats() {
    const res = await fetch('/api/certames/stats');
    if (!res.ok) throw new Error('Falha ao carregar estatísticas');
    return await res.json();
  },

  async getCertames(status = '', search = '') {
    let url = '/api/certames?';
    if (status && status !== 'TODOS') url += `status=${encodeURIComponent(status)}&`;
    if (search) url += `search=${encodeURIComponent(search)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Falha ao carregar certames');
    return await res.json();
  },

  async getCertame(id) {
    const res = await fetch(`/api/certames/${id}`);
    if (!res.ok) throw new Error('Falha ao buscar certame');
    return await res.json();
  },

  async createCertame(payload) {
    const res = await fetch('/api/certames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Erro ao criar certame');
    }
    return await res.json();
  },

  async updateCertame(id, payload) {
    const res = await fetch(`/api/certames/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Erro ao atualizar certame');
    }
    return await res.json();
  },

  async deleteCertame(id) {
    const res = await fetch(`/api/certames/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Falha ao excluir certame');
    return await res.json();
  },

  async duplicateCertame(id) {
    const res = await fetch(`/api/certames/${id}/duplicate`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Falha ao duplicar certame');
    return await res.json();
  },

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.href = '/login';
  }
};

// ================= CÁLCULO LOCAL REATIVO =================
function calculateItemLocal(item) {
  const qtd = parseNumber(item.quantidade);
  const custoUn = parseNumber(item.custo_unitario);
  const freteUn = parseNumber(item.frete_unitario);
  const aliquota = parseNumber(item.aliquota_imposto);
  const vendaUn = parseNumber(item.valor_venda_unitario);

  const custoUnTotal = custoUn + freteUn;
  const custoTotal = qtd * custoUnTotal;
  const faturamentoBruto = qtd * vendaUn;
  const impostoTotal = faturamentoBruto * (aliquota / 100.0);
  const valorLiquidoReceber = faturamentoBruto - impostoTotal;
  const lucroLiquido = faturamentoBruto - impostoTotal - custoTotal;
  const margemLiquida = faturamentoBruto > 0 ? (lucroLiquido / faturamentoBruto) * 100.0 : 0.0;

  // Lance mínimo para ponto de equilíbrio (margem zero)
  let lanceMinimo = custoUnTotal;
  if (aliquota < 100.0) {
    lanceMinimo = custoUnTotal / (1.0 - (aliquota / 100.0));
  }

  return {
    ...item,
    quantidade: qtd,
    custo_unitario: custoUn,
    frete_unitario: freteUn,
    aliquota_imposto: aliquota,
    valor_venda_unitario: vendaUn,
    custo_unitario_total: custoUnTotal,
    custo_total: custoTotal,
    faturamento_bruto: faturamentoBruto,
    imposto_total: impostoTotal,
    valor_liquido_receber: valorLiquidoReceber,
    lucro_liquido: lucroLiquido,
    margem_liquida: margemLiquida,
    lance_minimo_unitario: lanceMinimo
  };
}

function calculateCertameTotaisLocal(items) {
  const calcItems = items.map(calculateItemLocal);
  const totalItens = calcItems.length;
  const totalQtd = calcItems.reduce((acc, i) => acc + i.quantidade, 0);
  const totalCustos = calcItems.reduce((acc, i) => acc + i.custo_total, 0);
  const totalFaturamento = calcItems.reduce((acc, i) => acc + i.faturamento_bruto, 0);
  const totalImpostos = calcItems.reduce((acc, i) => acc + i.imposto_total, 0);
  const totalLiquidoReceber = calcItems.reduce((acc, i) => acc + i.valor_liquido_receber, 0);
  const totalLucroLiquido = calcItems.reduce((acc, i) => acc + i.lucro_liquido, 0);
  const margemMedia = totalFaturamento > 0 ? (totalLucroLiquido / totalFaturamento) * 100.0 : 0.0;

  return {
    calcItems,
    totais: {
      total_itens: totalItens,
      total_quantidade: totalQtd,
      total_custos: totalCustos,
      total_faturamento: totalFaturamento,
      total_impostos: totalImpostos,
      total_liquido_receber: totalLiquidoReceber,
      total_lucro_liquido: totalLucroLiquido,
      margem_liquida_media: margemMedia
    }
  };
}

// ================= UI RENDERING =================

// Renderizar cards de estatísticas no topo
function renderStats(stats) {
  if (!stats) return;
  document.getElementById('statTotalCertames').textContent = stats.total_certames;
  document.getElementById('statGanhos').textContent = stats.total_ganhos;
  document.getElementById('statFaturamento').textContent = formatBRL(stats.total_faturamento_ganho);
  document.getElementById('statLucro').textContent = formatBRL(stats.total_lucro_ganho);
  document.getElementById('statMargem').textContent = formatPercent(stats.margem_media_ganho);
}

// Status Badges
function getStatusBadge(status) {
  const map = {
    'Ganho / Homologado': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    'Ganho': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    'Em Disputa': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'Em Elaboração': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    'Perdido': 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    'Arquivado': 'bg-slate-500/15 text-slate-400 border-slate-500/30'
  };
  const cls = map[status] || 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  return `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}">${status}</span>`;
}

// Renderizar lista de certames
function renderCertamesList(certames) {
  const container = document.getElementById('certamesListContainer');
  const emptyState = document.getElementById('emptyState');

  if (!certames || certames.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  
  let html = '';
  certames.forEach(c => {
    const t = c.totais || {};
    const faturamento = formatBRL(t.total_faturamento || 0);
    const lucro = formatBRL(t.total_lucro_liquido || 0);
    const receber = formatBRL(t.total_liquido_receber || 0);
    const margem = formatPercent(t.margem_liquida_media || 0);
    const isLucroPositivo = (t.total_lucro_liquido || 0) >= 0;

    html += `
      <div class="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 rounded-2xl p-5 transition-all shadow-lg hover:shadow-xl group">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-700/60">
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-1.5">
              <span class="text-xs font-bold uppercase tracking-wider text-teal-400 bg-teal-500/10 px-2.5 py-0.5 rounded-md border border-teal-500/20">
                ${escapeHTML(c.modalidade || 'Licitação')}
              </span>
              ${getStatusBadge(c.status)}
              <span class="text-xs text-slate-400">
                <i class="fa-regular fa-calendar text-[11px] mr-1"></i>${c.data_abertura ? escapeHTML(c.data_abertura) : 'Data a definir'}
              </span>
            </div>
            <h3 class="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
              ${escapeHTML(c.orgao)}
            </h3>
            <div class="text-sm font-semibold text-slate-300 flex items-center gap-2 mt-0.5">
              <span>${escapeHTML(c.numero_pregao)}</span>
            </div>
            <p class="text-xs text-slate-400 mt-1 line-clamp-2 max-w-3xl">
              <strong class="text-slate-300">Objeto:</strong> ${escapeHTML(c.titulo)}
            </p>
          </div>

          <!-- Ações Rápidas -->
          <div class="flex items-center gap-2 self-end lg:self-center">
            <a href="/certame/${c.id}/imprimir" target="_blank" class="p-2.5 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white transition title-tooltip" title="Imprimir / Salvar PDF">
              <i class="fa-solid fa-print"></i>
            </a>
            <button onclick="handleDuplicateCertame(${c.id})" class="p-2.5 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white transition" title="Duplicar Certame">
              <i class="fa-solid fa-copy"></i>
            </button>
            <button onclick="handleEditCertame(${c.id})" class="px-3.5 py-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white font-medium text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition">
              <i class="fa-solid fa-pen-to-square"></i>
              <span>Editar</span>
            </button>
            <button onclick="handleDeleteCertame(${c.id})" class="p-2.5 rounded-xl bg-slate-700/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition" title="Excluir">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>

        <!-- Indicadores Financeiros do Certame -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs">
          <div class="bg-slate-900/60 rounded-xl p-3 border border-slate-700/40">
            <span class="text-slate-400 block mb-0.5 font-medium">Itens Inseridos</span>
            <span class="text-sm font-bold text-slate-200">${t.total_itens || 0} itens (${t.total_quantidade || 0} un)</span>
          </div>

          <div class="bg-slate-900/60 rounded-xl p-3 border border-slate-700/40">
            <span class="text-slate-400 block mb-0.5 font-medium">Faturamento Vendido</span>
            <span class="text-sm font-bold text-white">${faturamento}</span>
          </div>

          <div class="bg-slate-900/60 rounded-xl p-3 border border-slate-700/40">
            <span class="text-slate-400 block mb-0.5 font-medium">Líquido a Receber</span>
            <span class="text-sm font-bold text-teal-400">${receber}</span>
          </div>

          <div class="bg-slate-900/60 rounded-xl p-3 border border-slate-700/40 ${isLucroPositivo ? 'border-emerald-500/30' : 'border-rose-500/30'}">
            <span class="text-slate-400 block mb-0.5 font-medium">Lucro Líquido Real</span>
            <div class="flex items-baseline justify-between">
              <span class="text-sm font-bold ${isLucroPositivo ? 'text-emerald-400' : 'text-rose-400'}">${lucro}</span>
              <span class="text-[11px] font-semibold ${isLucroPositivo ? 'text-emerald-400' : 'text-rose-400'}">(${margem})</span>
            </div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Escape de HTML para evitar XSS
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ================= FORMULÁRIO DO CERTAME / ITENS =================

let currentItems = [];

function openNewCertameModal() {
  AppState.isEditing = false;
  AppState.currentCertame = null;
  document.getElementById('modalTitle').textContent = 'Novo Cálculo de Licitação / Dispensa';
  
  // Limpar campos
  document.getElementById('certameId').value = '';
  document.getElementById('orgao').value = '';
  document.getElementById('numeroPregao').value = '';
  document.getElementById('titulo').value = '';
  document.getElementById('modalidade').value = 'Pregão Eletrônico';
  document.getElementById('dataAbertura').value = '';
  document.getElementById('status').value = 'Em Elaboração';
  document.getElementById('aliquotaPadrao').value = '6.0';
  document.getElementById('observacoes').value = '';

  // Iniciar com 1 item padrão
  currentItems = [
    createEmptyItem(1)
  ];

  renderItemsTable();
  recalculateModalTotals();

  // Abrir Modal
  document.getElementById('certameModal').classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

async function handleEditCertame(id) {
  try {
    const certame = await API.getCertame(id);
    AppState.isEditing = true;
    AppState.currentCertame = certame;
    document.getElementById('modalTitle').textContent = `Editar Cálculo: ${certame.numero_pregao}`;

    document.getElementById('certameId').value = certame.id;
    document.getElementById('orgao').value = certame.orgao;
    document.getElementById('numeroPregao').value = certame.numero_pregao;
    document.getElementById('titulo').value = certame.titulo;
    document.getElementById('modalidade').value = certame.modalidade || 'Pregão Eletrônico';
    document.getElementById('dataAbertura').value = certame.data_abertura || '';
    document.getElementById('status').value = certame.status || 'Em Elaboração';
    document.getElementById('aliquotaPadrao').value = certame.aliquota_padrao || 6.0;
    document.getElementById('observacoes').value = certame.observacoes || '';

    currentItems = (certame.itens && certame.itens.length > 0) 
      ? certame.itens.map(i => ({ ...i })) 
      : [createEmptyItem(1)];

    renderItemsTable();
    recalculateModalTotals();

    document.getElementById('certameModal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  } catch (err) {
    showToast(err.message || 'Erro ao carregar dados do certame', 'error');
  }
}

function closeCertameModal() {
  document.getElementById('certameModal').classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

function createEmptyItem(num = 1) {
  const padrao = parseNumber(document.getElementById('aliquotaPadrao')?.value) || 6.0;
  return {
    numero_item: num,
    lote: '',
    descricao: '',
    unidade: 'UN',
    quantidade: 1,
    custo_unitario: 0,
    frete_unitario: 0,
    aliquota_imposto: padrao,
    valor_venda_unitario: 0,
    observacao: ''
  };
}

function addItemRow() {
  syncCurrentItemsFromDOM();
  const nextNum = currentItems.length + 1;
  currentItems.push(createEmptyItem(nextNum));
  renderItemsTable();
  recalculateModalTotals();

  // Scroll suave até o final da tabela
  setTimeout(() => {
    const tableBox = document.getElementById('itemsTableContainer');
    if (tableBox) tableBox.scrollTop = tableBox.scrollHeight;
  }, 50);
}

function duplicateItemRow(index) {
  syncCurrentItemsFromDOM();
  const base = currentItems[index];
  const clone = { ...base, numero_item: currentItems.length + 1 };
  currentItems.push(clone);
  renderItemsTable();
  recalculateModalTotals();
}

function removeItemRow(index) {
  syncCurrentItemsFromDOM();
  if (currentItems.length <= 1) {
    showToast('O certame precisa ter pelo menos 1 item.', 'warning');
    return;
  }
  currentItems.splice(index, 1);
  // Reordenar números dos itens
  currentItems.forEach((it, idx) => {
    it.numero_item = idx + 1;
  });
  renderItemsTable();
  recalculateModalTotals();
}

// Sincronizar dados dos inputs para o array em memória
function syncCurrentItemsFromDOM() {
  const rows = document.querySelectorAll('#itemsTableBody tr');
  rows.forEach((row, idx) => {
    if (!currentItems[idx]) return;
    currentItems[idx].numero_item = idx + 1;
    currentItems[idx].lote = row.querySelector('.input-lote')?.value || '';
    currentItems[idx].descricao = row.querySelector('.input-descricao')?.value || '';
    currentItems[idx].unidade = row.querySelector('.input-unidade')?.value || 'UN';
    currentItems[idx].quantidade = parseNumber(row.querySelector('.input-qtd')?.value);
    currentItems[idx].custo_unitario = parseNumber(row.querySelector('.input-custo')?.value);
    currentItems[idx].frete_unitario = parseNumber(row.querySelector('.input-frete')?.value);
    currentItems[idx].aliquota_imposto = parseNumber(row.querySelector('.input-imposto')?.value);
    currentItems[idx].valor_venda_unitario = parseNumber(row.querySelector('.input-venda')?.value);
    currentItems[idx].observacao = row.querySelector('.input-obs')?.value || '';
  });
}

// Aplicar alíquota padrão a todos os itens
function applyDefaultTaxToAll() {
  syncCurrentItemsFromDOM();
  const defaultTax = parseNumber(document.getElementById('aliquotaPadrao').value);
  currentItems.forEach(it => {
    it.aliquota_imposto = defaultTax;
  });
  renderItemsTable();
  recalculateModalTotals();
  showToast(`Alíquota de ${defaultTax}% aplicada a todos os itens!`, 'success');
}

// Renderizar linhas da tabela de itens
function renderItemsTable() {
  const tbody = document.getElementById('itemsTableBody');
  if (!tbody) return;

  let html = '';
  currentItems.forEach((item, index) => {
    const calc = calculateItemLocal(item);
    const isMargemPositiva = calc.margem_liquida >= 0;

    html += `
      <tr class="border-b border-slate-700/60 hover:bg-slate-750/30 transition text-xs" data-index="${index}">
        <!-- Item Nº & Lote -->
        <td class="py-2.5 px-2 text-center align-top">
          <span class="inline-block w-6 h-6 leading-6 rounded-lg bg-slate-700 text-slate-200 font-bold mb-1">
            ${index + 1}
          </span>
          <input 
            type="text" 
            placeholder="Lote" 
            value="${escapeHTML(item.lote || '')}" 
            class="input-lote w-12 text-[10px] text-center bg-slate-900 border border-slate-700 rounded p-1 text-slate-300 focus:ring-1 focus:ring-emerald-500"
          >
        </td>

        <!-- Descrição e Observação -->
        <td class="py-2.5 px-2 align-top">
          <input 
            type="text" 
            placeholder="Descrição detalhada do item / objeto..." 
            value="${escapeHTML(item.descricao || '')}" 
            required
            class="input-descricao w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 mb-1"
          >
          <input 
            type="text" 
            placeholder="Marca cotada / Modelo / Fornecedor (opcional)" 
            value="${escapeHTML(item.observacao || '')}" 
            class="input-obs w-full bg-slate-900/60 border border-slate-800 rounded p-1 text-[11px] text-slate-400 placeholder-slate-600 focus:ring-1 focus:ring-emerald-500"
          >
        </td>

        <!-- Unidade e Quantidade -->
        <td class="py-2.5 px-2 align-top w-28">
          <div class="flex gap-1 mb-1">
            <select class="input-unidade bg-slate-900 border border-slate-700 rounded p-1 text-slate-200 text-xs w-14">
              <option value="UN" ${item.unidade === 'UN' ? 'selected' : ''}>UN</option>
              <option value="CX" ${item.unidade === 'CX' ? 'selected' : ''}>CX</option>
              <option value="PCT" ${item.unidade === 'PCT' ? 'selected' : ''}>PCT</option>
              <option value="KG" ${item.unidade === 'KG' ? 'selected' : ''}>KG</option>
              <option value="M" ${item.unidade === 'M' ? 'selected' : ''}>M</option>
              <option value="M2" ${item.unidade === 'M2' ? 'selected' : ''}>M²</option>
              <option value="SV" ${item.unidade === 'SV' ? 'selected' : ''}>SV</option>
              <option value="HR" ${item.unidade === 'HR' ? 'selected' : ''}>HR</option>
              <option value="L" ${item.unidade === 'L' ? 'selected' : ''}>L</option>
            </select>
            <input 
              type="number" 
              step="any" 
              placeholder="Qtd" 
              value="${item.quantidade}" 
              class="input-qtd w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-right font-medium text-white focus:ring-1 focus:ring-emerald-500"
            >
          </div>
          <span class="text-[10px] text-slate-400 block text-right">Qtd total</span>
        </td>

        <!-- Custo Unitário e Frete -->
        <td class="py-2.5 px-2 align-top w-32">
          <div class="relative mb-1">
            <span class="absolute left-1.5 top-1.5 text-[10px] text-slate-500">R$</span>
            <input 
              type="number" 
              step="0.01" 
              placeholder="0,00" 
              value="${item.custo_unitario}" 
              class="input-custo w-full bg-slate-900 border border-slate-700 rounded p-1.5 pl-6 text-right font-medium text-white focus:ring-1 focus:ring-emerald-500"
            >
          </div>
          <div class="relative">
            <span class="absolute left-1.5 top-1 text-[9px] text-slate-500">+Frete</span>
            <input 
              type="number" 
              step="0.01" 
              placeholder="0,00" 
              value="${item.frete_unitario}" 
              class="input-frete w-full bg-slate-900/70 border border-slate-800 rounded p-1 pl-10 text-right text-[11px] text-slate-300 focus:ring-1 focus:ring-emerald-500"
              title="Frete ou custo extra por unidade"
            >
          </div>
        </td>

        <!-- % Imposto -->
        <td class="py-2.5 px-2 align-top w-20">
          <div class="relative">
            <input 
              type="number" 
              step="0.1" 
              value="${item.aliquota_imposto}" 
              class="input-imposto w-full bg-slate-900 border border-slate-700 rounded p-1.5 pr-5 text-right font-medium text-amber-400 focus:ring-1 focus:ring-emerald-500"
            >
            <span class="absolute right-1.5 top-1.5 text-[11px] text-slate-400">%</span>
          </div>
          <span class="text-[10px] text-slate-500 block text-right mt-1">Alíquota</span>
        </td>

        <!-- Lance Mínimo (Break-even de segurança) -->
        <td class="py-2.5 px-2 align-top w-28 bg-amber-500/5 text-right font-mono border-x border-amber-500/20">
          <span class="text-xs font-bold text-amber-300 block cell-lance-min">
            ${formatBRL(calc.lance_minimo_unitario)}
          </span>
          <span class="text-[9px] text-amber-500/80 uppercase block">Custo Zero</span>
        </td>

        <!-- Valor Vendido (Lance Ofertado Unitário) -->
        <td class="py-2.5 px-2 align-top w-32">
          <div class="relative mb-1">
            <span class="absolute left-1.5 top-1.5 text-[10px] text-emerald-500 font-bold">R$</span>
            <input 
              type="number" 
              step="0.01" 
              placeholder="0,00" 
              value="${item.valor_venda_unitario}" 
              class="input-venda w-full bg-slate-900 border-2 border-emerald-500/60 rounded p-1.5 pl-6 text-right font-bold text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
          </div>
          <span class="text-[10px] text-slate-400 block text-right">Lance un.</span>
        </td>

        <!-- Totais do Item (Faturamento, Lucro, Margem) -->
        <td class="py-2.5 px-2 align-top w-36 text-right">
          <span class="text-xs font-bold text-white block cell-faturamento">
            ${formatBRL(calc.faturamento_bruto)}
          </span>
          <div class="flex items-center justify-end gap-1 text-[11px] font-bold ${isMargemPositiva ? 'text-emerald-400' : 'text-rose-400'}">
            <span class="cell-lucro">${formatBRL(calc.lucro_liquido)}</span>
            <span class="cell-margem">(${formatPercent(calc.margem_liquida)})</span>
          </div>
          <span class="text-[10px] text-teal-400/80 block cell-receber">Rec: ${formatBRL(calc.valor_liquido_receber)}</span>
        </td>

        <!-- Ações do Item -->
        <td class="py-2.5 px-2 align-top text-center w-16">
          <div class="flex items-center justify-center gap-1">
            <button type="button" onclick="duplicateItemRow(${index})" class="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700" title="Clonar item">
              <i class="fa-regular fa-clone"></i>
            </button>
            <button type="button" onclick="removeItemRow(${index})" class="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-700" title="Remover item">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Registrar listeners de input para recalcular em tempo real
  attachInputListeners();
}

// Eventos de alteração de campos para recalcular dinamicamente
function attachInputListeners() {
  const rows = document.querySelectorAll('#itemsTableBody tr');
  rows.forEach((row, idx) => {
    const inputs = row.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        // Atualiza item na memória
        if (currentItems[idx]) {
          currentItems[idx].quantidade = parseNumber(row.querySelector('.input-qtd')?.value);
          currentItems[idx].custo_unitario = parseNumber(row.querySelector('.input-custo')?.value);
          currentItems[idx].frete_unitario = parseNumber(row.querySelector('.input-frete')?.value);
          currentItems[idx].aliquota_imposto = parseNumber(row.querySelector('.input-imposto')?.value);
          currentItems[idx].valor_venda_unitario = parseNumber(row.querySelector('.input-venda')?.value);

          // Atualiza células da linha
          const calc = calculateItemLocal(currentItems[idx]);
          const isMargemPositiva = calc.margem_liquida >= 0;

          const cellLanceMin = row.querySelector('.cell-lance-min');
          if (cellLanceMin) cellLanceMin.textContent = formatBRL(calc.lance_minimo_unitario);

          const cellFat = row.querySelector('.cell-faturamento');
          if (cellFat) cellFat.textContent = formatBRL(calc.faturamento_bruto);

          const cellLucro = row.querySelector('.cell-lucro');
          if (cellLucro) {
            cellLucro.textContent = formatBRL(calc.lucro_liquido);
            cellLucro.className = `cell-lucro ${isMargemPositiva ? 'text-emerald-400' : 'text-rose-400'}`;
          }

          const cellMargem = row.querySelector('.cell-margem');
          if (cellMargem) cellMargem.textContent = `(${formatPercent(calc.margem_liquida)})`;

          const cellReceber = row.querySelector('.cell-receber');
          if (cellReceber) cellReceber.textContent = `Rec: ${formatBRL(calc.valor_liquido_receber)}`;
        }

        recalculateModalTotals();
      });
    });
  });
}

// Recalcula a barra de totais na parte inferior do modal
function recalculateModalTotals() {
  syncCurrentItemsFromDOM();
  const { totais } = calculateCertameTotaisLocal(currentItems);

  document.getElementById('modalTotalItens').textContent = `${totais.total_itens} un`;
  document.getElementById('modalTotalCustos').textContent = formatBRL(totais.total_custos);
  document.getElementById('modalTotalImpostos').textContent = formatBRL(totais.total_impostos);
  document.getElementById('modalTotalFaturamento').textContent = formatBRL(totais.total_faturamento);
  document.getElementById('modalTotalReceber').textContent = formatBRL(totais.total_liquido_receber);
  
  const lucroEl = document.getElementById('modalTotalLucro');
  const margemEl = document.getElementById('modalTotalMargem');
  lucroEl.textContent = formatBRL(totais.total_lucro_liquido);
  margemEl.textContent = `Margem: ${formatPercent(totais.margem_liquida_media)}`;

  const isPositivo = totais.total_lucro_liquido >= 0;
  lucroEl.className = `text-xl font-black ${isPositivo ? 'text-emerald-400' : 'text-rose-400'}`;
  margemEl.className = `text-xs font-semibold ${isPositivo ? 'text-emerald-400' : 'text-rose-400'}`;
}

// Salvar certame (Criar ou Atualizar)
async function handleSaveCertame(e) {
  e.preventDefault();
  syncCurrentItemsFromDOM();

  const id = document.getElementById('certameId').value;
  const orgao = document.getElementById('orgao').value.trim();
  const numero_pregao = document.getElementById('numeroPregao').value.trim();
  const titulo = document.getElementById('titulo').value.trim();
  const modalidade = document.getElementById('modalidade').value;
  const data_abertura = document.getElementById('dataAbertura').value;
  const status = document.getElementById('status').value;
  const aliquota_padrao = parseNumber(document.getElementById('aliquotaPadrao').value) || 6.0;
  const observacoes = document.getElementById('observacoes').value.trim();

  if (!orgao || !numero_pregao || !titulo) {
    showToast('Preencha os campos obrigatórios (Órgão, Número e Objeto).', 'warning');
    return;
  }

  if (currentItems.length === 0) {
    showToast('Insira ao menos um item no certame.', 'warning');
    return;
  }

  // Validar se os itens possuem descrição
  for (let i = 0; i < currentItems.length; i++) {
    if (!currentItems[i].descricao.trim()) {
      showToast(`O Item #${i + 1} precisa de uma descrição.`, 'warning');
      return;
    }
  }

  const payload = {
    orgao,
    numero_pregao,
    titulo,
    modalidade,
    data_abertura,
    status,
    aliquota_padrao,
    observacoes,
    itens: currentItems.map((item, idx) => ({
      numero_item: idx + 1,
      lote: item.lote || null,
      descricao: item.descricao.trim(),
      unidade: item.unidade || 'UN',
      quantidade: parseNumber(item.quantidade),
      custo_unitario: parseNumber(item.custo_unitario),
      frete_unitario: parseNumber(item.frete_unitario),
      aliquota_imposto: parseNumber(item.aliquota_imposto),
      valor_venda_unitario: parseNumber(item.valor_venda_unitario),
      observacao: item.observacao ? item.observacao.trim() : null
    }))
  };

  const saveBtn = document.getElementById('saveCertameBtn');
  const originalText = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';

  try {
    if (id) {
      await API.updateCertame(id, payload);
      showToast('Cálculo atualizado com sucesso!', 'success');
    } else {
      await API.createCertame(payload);
      showToast('Novo certame e cálculo criados com sucesso!', 'success');
    }

    closeCertameModal();
    await reloadData();
  } catch (err) {
    showToast(err.message || 'Falha ao salvar certame', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalText;
  }
}

// Excluir certame
async function handleDeleteCertame(id) {
  if (!confirm('Deseja realmente excluir este certame e todo o seu histórico de cálculo?')) {
    return;
  }

  try {
    await API.deleteCertame(id);
    showToast('Certame excluído com sucesso!', 'success');
    await reloadData();
  } catch (err) {
    showToast(err.message || 'Erro ao excluir certame', 'error');
  }
}

// Duplicar certame
async function handleDuplicateCertame(id) {
  try {
    await API.duplicateCertame(id);
    showToast('Certame clonado com sucesso!', 'success');
    await reloadData();
  } catch (err) {
    showToast(err.message || 'Erro ao duplicar certame', 'error');
  }
}

// Recarregar lista e estatísticas
async function reloadData() {
  try {
    const [stats, certames] = await Promise.all([
      API.getStats(),
      API.getCertames(AppState.activeFilter, AppState.searchQuery)
    ]);
    AppState.stats = stats;
    AppState.certames = certames;
    renderStats(stats);
    renderCertamesList(certames);
  } catch (err) {
    console.error(err);
  }
}

// Toast Notificações
function showToast(message, type = 'info') {
  const toast = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  if (!toast) return;

  toastMessage.textContent = message;

  const bgMap = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white',
    warning: 'bg-amber-600 text-white',
    info: 'bg-slate-700 text-white'
  };

  const iconMap = {
    success: 'fa-solid fa-check-circle',
    error: 'fa-solid fa-circle-exclamation',
    warning: 'fa-solid fa-triangle-exclamation',
    info: 'fa-solid fa-info-circle'
  };

  toast.className = `fixed bottom-5 right-5 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-50 transition-all transform translate-y-0 opacity-100 ${bgMap[type] || bgMap.info}`;
  toastIcon.className = `${iconMap[type] || iconMap.info} text-lg`;

  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
    toast.className = 'fixed bottom-5 right-5 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-50 transition-all transform translate-y-8 opacity-0 pointer-events-none';
  }, 4000);
}

// ================= INICIALIZAÇÃO =================
document.addEventListener('DOMContentLoaded', async () => {
  // Carregar dados iniciais
  await reloadData();

  // Botão Novo Cálculo
  const newBtn = document.getElementById('newCertameBtn');
  if (newBtn) newBtn.addEventListener('click', openNewCertameModal);

  const emptyNewBtn = document.getElementById('emptyNewBtn');
  if (emptyNewBtn) emptyNewBtn.addEventListener('click', openNewCertameModal);

  // Botões do Modal
  const closeBtn = document.getElementById('closeModalBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeCertameModal);

  const cancelBtn = document.getElementById('cancelModalBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeCertameModal);

  const addItemBtn = document.getElementById('addItemBtn');
  if (addItemBtn) addItemBtn.addEventListener('click', addItemRow);

  const applyTaxBtn = document.getElementById('applyTaxBtn');
  if (applyTaxBtn) applyTaxBtn.addEventListener('click', applyDefaultTaxToAll);

  // Form Submit
  const form = document.getElementById('certameForm');
  if (form) form.addEventListener('submit', handleSaveCertame);

  // Busca rápida (com debounce)
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let timeout = null;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        AppState.searchQuery = e.target.value.trim();
        const certames = await API.getCertames(AppState.activeFilter, AppState.searchQuery);
        AppState.certames = certames;
        renderCertamesList(certames);
      }, 300);
    });
  }

  // Filtros por Status (Tabs)
  const filterTabs = document.querySelectorAll('.filter-tab');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      filterTabs.forEach(t => {
        t.classList.remove('bg-emerald-600', 'text-white');
        t.classList.add('bg-slate-800', 'text-slate-400');
      });
      tab.classList.remove('bg-slate-800', 'text-slate-400');
      tab.classList.add('bg-emerald-600', 'text-white');

      AppState.activeFilter = tab.getAttribute('data-status');
      const certames = await API.getCertames(AppState.activeFilter, AppState.searchQuery);
      AppState.certames = certames;
      renderCertamesList(certames);
    });
  });

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', API.logout);
});
