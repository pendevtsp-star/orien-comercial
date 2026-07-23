import { Inject, Injectable, Optional } from "@nestjs/common";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";
import type { AppConfig } from "@sgc/config";
import { APP_CONFIG } from "../config/config.module";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatResponse {
  message: string;
  actions?: Array<{ action: string; params: Record<string, unknown> }>;
  suggestions?: string[];
}

interface UserContext {
  userId: string;
  userName: string;
  tenantId: string;
  tenantName: string;
  permissions: string[];
}

interface KnowledgeArticle {
  id: string;
  category: string;
  title: string;
  content: string;
  keywords: string[];
}

@Injectable()
export class AiAssistantService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject(APP_CONFIG) private readonly config?: AppConfig,
  ) {}

  private knowledgeBase: KnowledgeArticle[] = [
    // Produtos
    {
      id: "prod-1",
      category: "Produtos",
      title: "Como cadastrar um produto",
      content: "Para cadastrar um produto:\n1. Acesse Catálogo > Produtos\n2. Clique em 'Novo Produto'\n3. Preencha os dados obrigatórios:\n   - Nome do produto\n   - SKU (código interno)\n   - Código de barras\n   - Preço de custo\n   - Preço de venda\n   - Estoque mínimo\n4. Selecione a categoria\n5. Configure o estoque inicial\n6. Clique em 'Salvar'\n\nDica: Você pode importar produtos em massa via CSV em Configurações > Importações.",
      keywords: ["cadastrar", "produto", "novo", "criar", "adicionar", "catalogo"],
    },
    {
      id: "prod-2",
      category: "Produtos",
      title: "Como consultar estoque",
      content: "Para consultar estoque:\n1. Acesse Estoque > Posição de Estoque\n2. Use os filtros por filial ou produto\n3. Visualize quantidade atual e estoque mínimo\n\nCores indicam status:\n- Verde: Estoque saudável\n- Amarelo: Estoque baixo\n- Vermelho: Estoque crítico\n\nDica: Configure alertas para notificação automática de estoque baixo.",
      keywords: ["estoque", "consultar", "quantidade", "saldo", "disponivel"],
    },
    {
      id: "prod-3",
      category: "Produtos",
      title: "Como editar um produto",
      content: "Para editar um produto:\n1. Acesse Catálogo > Produtos\n2. Localize o produto desejado\n3. Clique no ícone de editar\n4. Altere os campos necessários\n5. Clique em 'Salvar'\n\nAtenção: Alterações no preço afetam novas vendas.",
      keywords: ["editar", "produto", "alterar", "modificar", "atualizar"],
    },
    // Vendas
    {
      id: "sale-1",
      category: "Vendas",
      title: "Como criar uma venda",
      content: "Para criar uma venda:\n1. Acesse PDV (Ponto de Venda)\n2. Selecione o cliente (opcional)\n3. Adicione os produtos:\n   - Escaneie o código de barras ou busque pelo nome\n   - Informe a quantidade\n4. Escolha a forma de pagamento:\n   - Dinheiro\n   - Cartão de crédito/débito\n   - Pix\n   - Boleto\n5. Confirme a venda\n\nA venda será registrada automaticamente e o estoque atualizado.",
      keywords: ["venda", "criar", "pdv", "vender", "pagamento", "finalizar"],
    },
    {
      id: "sale-2",
      category: "Vendas",
      title: "Como criar uma DAV",
      content: "Para criar uma DAV (Documento Auxiliar de Venda):\n1. Acesse Operações > Orçamentos e pedidos\n2. Selecione tipo 'DAV'\n3. Preencha:\n   - Cliente\n   - Filial\n   - Validade\n4. Adicione os itens (produtos)\n5. Clique em 'Criar documento'\n\nA DAV pode ser:\n- Aprovada\n- Reservar estoque\n- Convertida em venda\n- Cancelada",
      keywords: ["dav", "criar", "documento", "auxiliar", "orçamento"],
    },
    {
      id: "sale-3",
      category: "Vendas",
      title: "Como cancelar uma venda",
      content: "Para cancelar uma venda:\n1. Acesse Vendas\n2. Localize a venda desejada\n3. Clique em 'Cancelar'\n4. Informe o motivo do cancelamento\n5. Confirme\n\nAtenção: O estoque será devolvido automaticamente.",
      keywords: ["cancelar", "venda", "estorno", "devolver"],
    },
    // Financeiro
    {
      id: "fin-1",
      category: "Financeiro",
      title: "Como consultar contas a receber",
      content: "Para consultar contas a receber:\n1. Acesse Financeiro\n2. Visualize as contas pendentes\n3. Use filtros por período ou cliente\n\nStatus das contas:\n- Azul: Pendente\n- Verde: Pago\n- Vermelho: Vencido\n- Cinza: Cancelado",
      keywords: ["financeiro", "receber", "conta", "pendente", "boleto"],
    },
    {
      id: "fin-2",
      category: "Financeiro",
      title: "Como registrar um pagamento",
      content: "Para registrar um pagamento:\n1. Acesse Financeiro > Contas a Receber\n2. Selecione a conta\n3. Clique em 'Registrar Pagamento'\n4. Informe:\n   - Valor pago\n   - Data do pagamento\n   - Forma de pagamento\n5. Confirme\n\nO sistema atualizará automaticamente o status da conta.",
      keywords: ["pagamento", "registrar", "receber", "quitado"],
    },
    // Estoque
    {
      id: "stock-1",
      category: "Estoque",
      title: "Como ajustar estoque",
      content: "Para ajustar estoque:\n1. Acesse Estoque > Ajustes\n2. Selecione a filial\n3. Selecione o produto\n4. Informe a quantidade (positivo para entrada, negativo para saída)\n5. Informe o motivo\n6. Confirme\n\nO ajuste será registrado no histórico de movimentações.",
      keywords: ["estoque", "ajustar", "entrada", "saida", "movimentação"],
    },
    {
      id: "stock-2",
      category: "Estoque",
      title: "Como transferir estoque entre filiais",
      content: "Para transferir estoque:\n1. Acesse Estoque > Transferências\n2. Selecione a filial de origem\n3. Selecione a filial de destino\n4. Adicione os produtos e quantidades\n5. Confirme a transferência\n\nO estoque será atualizado em ambas as filiais.",
      keywords: ["transferir", "estoque", "filial", "movimentação", "envio"],
    },
    // Relatórios
    {
      id: "rep-1",
      category: "Relatórios",
      title: "Como gerar relatórios",
      content: "Para gerar relatórios:\n1. Acesse Relatórios\n2. Selecione o tipo de relatório:\n   - Resumo gerencial\n   - Vendas\n   - Financeiro\n   - Estoque\n   - Produtos\n   - Clientes\n   - Fluxo de caixa\n3. Configure o período e filtros\n4. Clique em 'Emitir relatório'\n\nExportação:\n- CSV: Clique em 'Exportar CSV'\n- PDF: Clique em 'Baixar PDF'\n- Visualizar: Clique em 'Visualizar'",
      keywords: ["relatório", "gerar", "exportar", "pdf", "csv", "analise"],
    },
    {
      id: "rep-2",
      category: "Relatórios",
      title: "Como agendar relatórios",
      content: "Para agendar relatórios:\n1. Acesse Relatórios\n2. Configure o relatório desejado\n3. Clique em 'Agendar'\n4. Defina:\n   - Frequência (diária, semanal, mensal)\n   - Horário\n   - Destinatários (email)\n5. Confirme\n\nO relatório será enviado automaticamente.",
      keywords: ["agendar", "relatório", "automático", "email", "envio"],
    },
    // Configurações
    {
      id: "cfg-1",
      category: "Configurações",
      title: "Como configurar uma filial",
      content: "Para configurar uma filial:\n1. Acesse Configurações > Filiais\n2. Clique em 'Nova Filial'\n3. Preencha:\n   - Nome\n   - Código\n   - Endereço\n   - Telefone\n   - Email\n4. Configure as permissões\n5. Salve\n\nCada filial pode ter configurações próprias.",
      keywords: ["filial", "configurar", "loja", "unidade", "sucursal"],
    },
    {
      id: "cfg-2",
      category: "Configurações",
      title: "Como adicionar um vendedor",
      content: "Para adicionar um vendedor:\n1. Acesse Equipe\n2. Clique em 'Convidar Membro'\n3. Informe o email do vendedor\n4. Selecione o papel (Vendedor)\n5. Selecione a filial\n6. Envie o convite\n\nO vendedor receberá um email para acessar o sistema.",
      keywords: ["vendedor", "adicionar", "equipe", "membro", "convite"],
    },
    // Integrações
    {
      id: "int-1",
      category: "Integrações",
      title: "Como configurar pagamento online",
      content: "Para configurar pagamento online:\n1. Acesse Configurações > Integrações\n2. Selecione 'Asaas' (gateway de pagamento)\n3. Preencha:\n   - Chave da API\n   - Modo (sandbox/produção)\n4. Teste a conexão\n5. Ative a integração\n\nApós ativar, os pagamentos poderão ser processados online.",
      keywords: ["integração", "pagamento", "asaas", "online", "gateway"],
    },
    {
      id: "int-2",
      category: "Integrações",
      title: "Como configurar envio de emails",
      content: "Para configurar envio de emails:\n1. Acesse Configurações > Integrações\n2. Selecione 'SMTP'\n3. Preencha:\n   - Servidor SMTP\n   - Porta\n   - Usuario\n   - Senha\n   - Remetente\n4. Teste o envio\n5. Ative a integração\n\nO sistema enviará emails automáticos para notificações.",
      keywords: ["email", "smtp", "enviar", "notificação", "mensagem"],
    },
    // Fiscal
    {
      id: "fisc-1",
      category: "Fiscal",
      title: "Como emitir NF-e",
      content: "Para emitir NF-e:\n1. Acesse Fiscal\n2. Selecione a venda\n3. Clique em 'Emitir Nota'\n4. Preencha os dados fiscais:\n   - CFOP\n   - CST/CSOSN\n   - NCM\n5. Confirme a emissão\n\nA NF-e será transmitida à SEFAZ e o XML gerado.",
      keywords: ["nf-e", "nota fiscal", "emitir", "fiscal", "sefaz"],
    },
    {
      id: "fisc-2",
      category: "Fiscal",
      title: "Como consultar chave de acesso",
      content: "Para consultar chave de acesso:\n1. Acesse Fiscal > Documentos\n2. Localize a nota fiscal\n3. Clique em 'Consultar'\n4. Visualize o status na SEFAZ\n\nA chave de acesso tem 44 dígitos.",
      keywords: ["chave", "acesso", "consulta", "sefaz", "nfe"],
    },
    // IA Assistente
    {
      id: "ai-1",
      category: "IA Assistente",
      title: "Como usar o assistente virtual",
      content: "O assistente virtual está disponível no canto inferior direito da tela.\n\nFuncionalidades:\n- Tire dúvidas sobre o sistema\n- Peça instruções passo a passo\n- Solicite ações rápidas\n\nExemplos de perguntas:\n- 'Como cadastrar um produto?'\n- 'Como criar uma venda?'\n- 'Como gerar um relatório?'\n\nO assistente também oferece sugestões inteligentes baseadas no seu uso.",
      keywords: ["assistente", "ia", "chat", "ajuda", "virtual", "duvida"],
    },
  ];

  async chat(context: TenantContext, message: string): Promise<ChatResponse> {
    const userContext = await this.getUserContext(context);
    const relevantKnowledge = this.searchKnowledge(message);
    const actionMatch = this.detectAction(message);

    if (actionMatch) {
      return {
        message: `Entendi que você quer ${actionMatch.description}. Posso ajudar com isso!\n\nPara prosseguir, acesse a funcionalidade correspondente no menu.`,
        actions: [actionMatch],
        suggestions: this.getSuggestions(userContext),
      };
    }

    // Try OpenRouter if configured
    if (this.config?.OPENROUTER_API_KEY) {
      try {
        const aiResponse = await this.callOpenRouter(message, userContext, relevantKnowledge);
        return {
          message: aiResponse,
          suggestions: this.getSuggestions(userContext),
        };
      } catch (error) {
        // Fallback to knowledge base
        console.error("OpenRouter error:", error);
      }
    }

    if (relevantKnowledge.length > 0 && relevantKnowledge[0]) {
      return {
        message: relevantKnowledge[0].content,
        suggestions: this.getSuggestions(userContext),
      };
    }

    return {
      message: "Olá! Sou o assistente virtual do Orien. Como posso ajudar você hoje?\n\nPosso ajudar com:\n- Cadastro de produtos\n- Gestão de vendas\n- Consulta de estoque\n- Relatórios financeiros\n- Configurações do sistema",
      suggestions: [
        "Como cadastrar um produto?",
        "Como criar uma venda?",
        "Como gerar relatórios?",
        "Como configurar o sistema?",
      ],
    };
  }

  private async callOpenRouter(
    message: string,
    userContext: UserContext,
    relevantKnowledge: KnowledgeArticle[],
  ): Promise<string> {
    const systemPrompt = `Você é o assistente virtual do Orien, um sistema SaaS de gestão comercial.

Contexto do usuário:
- Nome: ${userContext.userName}
- Empresa: ${userContext.tenantName}
- Permissões: ${userContext.permissions.join(", ")}

Funcionalidades do sistema:
- Produtos: Cadastro, edição, estoque
- Vendas: PDV, DAV, orçamentos
- Financeiro: Contas a receber/pagar, conciliação
- Relatórios: Vendas, financeiro, estoque, produtos, clientes
- Configurações: Filiais, vendedores, integrações

Regras:
1. Seja educado e profissional em português brasileiro
2. Respostas devem ser claras e objetivas
3. Ofereça passo a passo quando possível
4. Se não souber, diga que vai encaminhar para suporte
5. Nunca compartilhe informações sensíveis
6. Sugira ações quando apropriado`;

    const knowledgeContext = relevantKnowledge.length > 0
      ? `\n\nConhecimento relevante:\n${relevantKnowledge.map((k) => `- ${k.title}: ${k.content.substring(0, 200)}...`).join("\n")}`
      : "";

    const apiKey = this.config?.OPENROUTER_API_KEY;
    const model = this.config?.OPENROUTER_MODEL ?? "meta-llama/llama-3.1-8b-instruct:free";

    if (!apiKey) {
      throw new Error("OpenRouter API key not configured");
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://useorien.com.br",
        "X-Title": "Orien SaaS",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt + knowledgeContext },
          { role: "user", content: message },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "Desculpe, não consegui processar sua mensagem.";
  }

  private async getUserContext(context: TenantContext): Promise<UserContext> {
    const result = await this.database.tenantQuery<{ name: string; email: string }>(
      context.tenantId,
      `SELECT u.name, u.email
       FROM users u
       WHERE u.id = $1`,
      [context.userId ?? ""],
    );

    const tenantResult = await this.database.tenantQuery<{ name: string }>(
      context.tenantId,
      "SELECT name FROM tenants WHERE id = $1",
      [context.tenantId],
    );

    return {
      userId: context.userId ?? "",
      userName: result.rows[0]?.name ?? "Usuário",
      tenantId: context.tenantId,
      tenantName: tenantResult.rows[0]?.name ?? "Empresa",
      permissions: context.permissions ?? [],
    };
  }

  private searchKnowledge(query: string): KnowledgeArticle[] {
    const lowerQuery = query.toLowerCase();
    return this.knowledgeBase.filter((article) =>
      article.keywords.some((keyword) => lowerQuery.includes(keyword)) ||
      article.title.toLowerCase().includes(lowerQuery) ||
      article.content.toLowerCase().includes(lowerQuery)
    );
  }

  private detectAction(message: string): { action: string; description: string; params: Record<string, unknown> } | null {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("criar venda") || lowerMessage.includes("nova venda") || lowerMessage.includes("iniciar venda")) {
      return { action: "navigate", description: "abrir o PDV para criar uma nova venda", params: { path: "/pos" } };
    }
    if (lowerMessage.includes("criar dav") || lowerMessage.includes("nova dav")) {
      return { action: "navigate", description: "abrir a página de documentos comerciais", params: { path: "/operations" } };
    }
    if (lowerMessage.includes("criar orçamento") || lowerMessage.includes("novo orçamento")) {
      return { action: "navigate", description: "abrir a página de orçamentos", params: { path: "/operations" } };
    }
    if (lowerMessage.includes("gerar relatório") || lowerMessage.includes("emitir relatório") || lowerMessage.includes("ver relatórios")) {
      return { action: "navigate", description: "abrir a página de relatórios", params: { path: "/reports" } };
    }
    if (lowerMessage.includes("consultar estoque") || lowerMessage.includes("ver estoque")) {
      return { action: "navigate", description: "abrir a página de estoque", params: { path: "/stock" } };
    }
    if (lowerMessage.includes("cadastrar produto") || lowerMessage.includes("novo produto")) {
      return { action: "navigate", description: "abrir a página de produtos", params: { path: "/products" } };
    }
    if (lowerMessage.includes("ver dashboard") || lowerMessage.includes("abrir dashboard")) {
      return { action: "navigate", description: "abrir o dashboard", params: { path: "/dashboard" } };
    }
    if (lowerMessage.includes("configurações") || lowerMessage.includes("configurar")) {
      return { action: "navigate", description: "abrir as configurações", params: { path: "/settings" } };
    }

    return null;
  }

  private getSuggestions(userContext: UserContext): string[] {
    const suggestions: string[] = [];

    if (userContext.permissions.includes("sales.create")) {
      suggestions.push("Criar uma nova venda");
      suggestions.push("Criar uma DAV");
    }
    if (userContext.permissions.includes("products.create")) {
      suggestions.push("Cadastrar um produto");
    }
    if (userContext.permissions.includes("dashboard.read")) {
      suggestions.push("Ver relatórios");
      suggestions.push("Ver dashboard");
    }
    if (userContext.permissions.includes("financial.read")) {
      suggestions.push("Consultar financeiro");
    }

    return suggestions.slice(0, 4);
  }

  getHelpForPage(page: string): { title: string; content: string; tips: string[] } {
    const helpContent: Record<string, { title: string; content: string; tips: string[] }> = {
      dashboard: {
        title: "Dashboard Executivo",
        content: "O dashboard mostra uma visão geral do seu negócio com KPIs importantes como receita, vendas, ticket médio e margem.",
        tips: [
          "Use os atalhos de período para análises rápidas",
          "Clique nos cards para ver detalhes",
          "Configure alertas para monitorar métricas importantes",
          "Exporte dados em CSV para análises externas",
        ],
      },
      sales: {
        title: "Gestão de Vendas",
        content: "Gerencie todas as suas vendas em um só lugar, desde o PDV até relatórios detalhados.",
        tips: [
          "Use o PDV para vendas rápidas",
          "Crie DAVs para vendas complexas",
          "Acompanhe o status de cada venda",
          "Use filtros para encontrar vendas específicas",
        ],
      },
      reports: {
        title: "Relatórios Gerenciais",
        content: "Visualize dados importantes do seu negócio com relatórios completos e exportáveis.",
        tips: [
          "Use os atalhos de período para análises rápidas",
          "Exporte relatórios em CSV ou PDF",
          "Agende relatórios para envio automático",
          "Use filtros avançados para análises específicas",
        ],
      },
      stock: {
        title: "Gestão de Estoque",
        content: "Controle seu estoque em tempo real, com alertas automáticos e movimentações registradas.",
        tips: [
          "Configure estoque mínimo para alertas",
          "Use transferências entre filiais",
          "Consulte o histórico de movimentações",
          "Exporte a posição de estoque",
        ],
      },
      products: {
        title: "Catálogo de Produtos",
        content: "Gerencie seu catálogo completo de produtos com preços, estoque e categorias.",
        tips: [
          "Use SKUs para identificação rápida",
          "Configure preços promocionais",
          "Use categorias para organizar",
          "Importe produtos em massa via CSV",
        ],
      },
      customers: {
        title: "Gestão de Clientes",
        content: "Cadastre e gerencie seus clientes com histórico de compras e dados de contato.",
        tips: [
          "Use tags para segmentar clientes",
          "Acompanhe o histórico de compras",
          "Configure comunicação opt-in",
          "Use campos personalizados",
        ],
      },
      financial: {
        title: "Gestão Financeira",
        content: "Controle suas contas a receber e a pagar com conciliação bancária.",
        tips: [
          "Concilie pagamentos regularmente",
          "Use filtros para análises por período",
          "Exporte dados para contabilidade",
          "Configure alertas de inadimplência",
        ],
      },
      settings: {
        title: "Configurações do Sistema",
        content: "Configure filiais, integrações, permissões e preferências do sistema.",
        tips: [
          "Configure filiais antes de começar a usar",
          "Integre com gateways de pagamento",
          "Configure permissões por perfil",
          "Personalize a aparência do sistema",
        ],
      },
    };

    return helpContent[page] ?? {
      title: "Ajuda",
      content: "Precisa de ajuda? Me pergunte sobre qualquer funcionalidade do sistema.",
      tips: ["Digite sua pergunta no chat", "Use os links de ajuda nas páginas", "Consulte a documentação"],
    };
  }
}
