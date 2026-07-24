"use client";

import { createElement, useEffect, useState } from "react";

type ConnectionStatusCopy = {
  label: string;
  message: string;
};

export function getConnectionStatus(online: boolean): ConnectionStatusCopy | null {
  if (online) return null;

  return {
    label: "Conexão indisponível",
    message: "As alterações serão enviadas quando a conexão voltar.",
  };
}

export function ConnectionStatus({ online: initialOnline }: { online?: boolean }) {
  const [online, setOnline] = useState(initialOnline ?? true);

  useEffect(() => {
    const updateConnection = () => setOnline(window.navigator.onLine);

    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  const status = getConnectionStatus(online);
  if (!status) return null;

  return createElement(
    "div",
    {
      className: "orien-connection-status",
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
    },
    createElement("strong", null, status.label),
    createElement("span", null, status.message),
  );
}
