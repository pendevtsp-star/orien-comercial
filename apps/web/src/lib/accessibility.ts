// Accessibility utilities for Orien SaaS

export const accessibilityConfig = {
  // High contrast mode
  highContrast: {
    colors: {
      text: "#000000",
      background: "#FFFFFF",
      primary: "#0000EE",
      secondary: "#551A8B",
      error: "#EE0000",
      success: "#008000",
      warning: "#FF8C00",
    },
  },

  // Focus indicators
  focusStyles: {
    outline: "3px solid #0000EE",
    outlineOffset: "2px",
  },

  // Screen reader announcements
  announcements: {
    loading: "Carregando conteúdo...",
    error: "Ocorreu um erro. Por favor, tente novamente.",
    success: "Operação realizada com sucesso.",
    empty: "Nenhum dado encontrado.",
  },

  // Keyboard shortcuts
  keyboardShortcuts: {
    globalSearch: "Ctrl+K",
    help: "F1",
    escape: "Escape",
    enter: "Enter",
    space: " ",
    arrowUp: "ArrowUp",
    arrowDown: "ArrowDown",
    arrowLeft: "ArrowLeft",
    arrowRight: "ArrowRight",
    tab: "Tab",
    shiftTab: "Shift+Tab",
  },

  // ARIA labels
  ariaLabels: {
    navigation: "Navegação principal",
    content: "Conteúdo principal",
    sidebar: "Barra lateral",
    search: "Busca global",
    notifications: "Notificações",
    userMenu: "Menu do usuário",
    close: "Fechar",
    menu: "Menu",
    back: "Voltar",
    forward: "Avançar",
    refresh: "Atualizar",
    filter: "Filtrar",
    sort: "Ordenar",
    export: "Exportar",
    print: "Imprimir",
  },

  // Skip links
  skipLinks: [
    { href: "#main-content", label: "Pular para o conteúdo principal" },
    { href: "#navigation", label: "Pular para a navegação" },
    { href: "#search", label: "Pular para a busca" },
  ],

  // Reduced motion
  reducedMotion: {
    enabled: false,
    transitionDuration: "0ms",
    animationDuration: "0ms",
  },
};

// Check if user prefers reduced motion
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Check if user prefers high contrast
export function prefersHighContrast(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-contrast: high)").matches;
}

// Check if user prefers dark mode
export function prefersDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Announce to screen readers
export function announce(message: string, priority: "polite" | "assertive" = "polite") {
  if (typeof document === "undefined") return;
  
  const announcer = document.createElement("div");
  announcer.setAttribute("aria-live", priority);
  announcer.setAttribute("aria-atomic", "true");
  announcer.setAttribute("class", "sr-only");
  announcer.textContent = message;
  
  document.body.appendChild(announcer);
  
  setTimeout(() => {
    document.body.removeChild(announcer);
  }, 1000);
}

// Trap focus within a modal
export function trapFocus(element: HTMLElement) {
  const focusableElements = element.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  
  const firstFocusable = focusableElements[0] as HTMLElement;
  const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

  element.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;

    if (event.shiftKey) {
      if (document.activeElement === firstFocusable) {
        lastFocusable.focus();
        event.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        firstFocusable.focus();
        event.preventDefault();
      }
    }
  });

  firstFocusable?.focus();
}

// Get readable text from element
export function getAccessibleName(element: HTMLElement): string {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  const ariaLabelledBy = element.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const labelElement = document.getElementById(ariaLabelledBy);
    if (labelElement) return labelElement.textContent || "";
  }

  const title = element.getAttribute("title");
  if (title) return title;

  const placeholder = element.getAttribute("placeholder");
  if (placeholder) return placeholder;

  return element.textContent || "";
}

// Validate color contrast ratio
export function getContrastRatio(color1: string, color2: string): number {
  const getLuminance = (color: string) => {
    const rgb = color.match(/\d+/g);
    if (!rgb) return 0;
    const values = rgb.map((c) => {
      const sRGB = parseInt(c) / 255;
      return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
    });
    const r = values[0] ?? 0;
    const g = values[1] ?? 0;
    const b = values[2] ?? 0;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Check if color contrast meets WCAG AA
export function meetsContrastAA(color1: string, color2: string, isLargeText = false): boolean {
  const ratio = getContrastRatio(color1, color2);
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}
