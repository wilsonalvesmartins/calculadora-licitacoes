# 🏛️ Calculadora de Licitações e Dispensas

Sistema web para cálculo de custos, impostos, margem de lucro e faturamento em licitações e dispensas governamentais (Comprasnet / Portal de Compras Públicas / BLL / etc.).

Desenvolvido para operar em containers com **Docker Compose**, pronto para deploy direto no seu VPS com **Coolify**.

---

## 🔐 Credenciais de Acesso Pré-configuradas

O sistema já é inicializado com a conta de usuário pronta:
- **E-mail:** `wilsonalves.jur@gmail.com`
- **Senha:** `93281434@Neto@`

*(Essas variáveis podem ser alteradas no arquivo `.env` ou nas variáveis de ambiente do Coolify)*.

---

## 🚀 Como Subir no seu VPS com Coolify

### Método 1: Via Repositório Git (Recomendado)
1. Suba esta pasta para um repositório no seu GitHub/GitLab (privado ou público).
2. No painel do seu **Coolify**, clique em **"+ New Resource"** > **"Public/Private Repository"**.
3. Selecione o repositório da Calculadora.
4. O Coolify detectará automaticamente o arquivo `docker-compose.yml` (ou você pode selecionar o tipo **Docker Compose**).
5. Defina o seu domínio (ex: `licitacoes.seudominio.com.br`) na porta `8000`. O Coolify gerará o certificado SSL (HTTPS) automaticamente via Let's Encrypt!
6. Clique em **Deploy**. Em poucos segundos o sistema estará no ar.

---

### Método 2: Via Docker Compose Direto no Coolify
1. No painel do **Coolify**, clique em **"+ New Resource"** > **"Docker Compose"**.
2. Cole o conteúdo do arquivo `docker-compose.yml`.
3. Adicione as variáveis de ambiente necessárias (consulte `.env.example`).
4. Configure o domínio e clique em **Deploy**.

---

### Método 3: Executar Localmente (com Docker instalado)
Se quiser testar no seu computador antes de enviar para o VPS:
```bash
# Iniciar o container
docker-compose up -d --build

# Acessar no navegador:
# http://localhost:8000
```

---

## 📊 Fórmulas e Regras de Negócio de Licitação

Cada item inserido no certame calcula dinamicamente:

1. **Custo Total de Compra**:
   $$\text{Custo Total} = \text{Quantidade} \times (\text{Custo Unitário} + \text{Frete Unitário})$$

2. **Faturamento Bruto (Valor Vendido)**:
   $$\text{Faturamento} = \text{Quantidade} \times \text{Lance de Venda Unitário}$$

3. **Imposto Total**:
   $$\text{Imposto} = \text{Faturamento Bruto} \times \left(\frac{\% \text{ Alíquota}}{100}\right)$$

4. **Valor Líquido a Receber**:
   $$\text{A Receber} = \text{Faturamento Bruto} - \text{Imposto Total}$$
   *(Valor que entrará na conta bancária após as deduções e tributos)*

5. **Lucro Líquido Real**:
   $$\text{Lucro Líquido} = \text{Faturamento Bruto} - \text{Imposto Total} - \text{Custos Totais}$$

6. **Margem Líquida (%)**:
   $$\text{Margem} = \left(\frac{\text{Lucro Líquido}}{\text{Faturamento Bruto}}\right) \times 100$$

7. **Lance Mínimo de Segurança (Break-Even)**:
   $$\text{Lance Mínimo} = \frac{\text{Custo Unitário Total}}{1 - \left(\frac{\% \text{ Alíquota}}{100}\right)}$$
   *(Informa ao operador até qual centavo ele pode abaixar o lance no pregão sem operar no prejuízo)*.

---

## 🛠️ Recursos do Aplicativo

- **Dashboard Financeiro:** Visão rápida de certames em andamento, homologados, faturamento bruto e lucro acumulado.
- **Cálculo em Tempo Real:** Conforme você digita custo, quantidade, % de imposto ou lance de venda, os totais e margens atualizam instantaneamente.
- **Alíquota Rápida:** Botão para aplicar alíquota padrão (ex: Simples Nacional 6%) a todos os itens com um clique.
- **Histórico & Busca:** Filtros por status (*Em Elaboração*, *Em Disputa*, *Ganho / Homologado*, *Perdido*) e busca instantânea por órgão ou número do pregão.
- **Duplicação de Certame:** Botão de 1 clique para clonar um pregão anterior (com todos os itens e preços) para disputar um novo certame similar.
- **Ficha de Lances para Impressão / PDF:** Layout formatado para folha A4 com todos os lances mínimos para levar para a mesa de disputa do pregão.
- **Banco de Dados SQLite Persistente:** Armazenado no volume seguro do Docker (`/app/data/licitacoes.db`), garantindo que seus dados nunca se percam em atualizações de container.
