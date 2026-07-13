/**
 * Referência canônica para textos recorrentes da interface em PT-BR.
 * Novos fluxos devem preferir este catálogo a mensagens soltas nos componentes.
 */
export const copy = {
  actions: {
    cancel: "Cancelar",
    close: "Fechar",
    confirm: "Confirmar",
    save: "Salvar",
    refresh: "Atualizar",
    retry: "Tentar novamente",
  },
  states: {
    loading: "Carregando dados...",
    empty: "Nenhum registro encontrado.",
    sessionExpired: "Sua sessão expirou. Entre novamente para continuar.",
    permissionDenied: "Você não tem permissão para acessar esta área.",
    connectionUnavailable: "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.",
  },
  sales: {
    sold: "Concluída",
    cancelled: "Cancelada",
    pending: "Em aberto",
  },
  loyalty: {
    noCampaign: "Nenhuma campanha criada.",
    insufficientPoints: "Saldo de pontos insuficiente.",
    expiringSoon: "Pontos vencem em breve.",
  },
} as const;
