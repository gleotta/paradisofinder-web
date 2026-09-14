"use client";

import { createContext, useContext } from "react";

/**
 * Config de contacto que el server lee del env por request y baja al árbol
 * cliente: el número de WhatsApp de FINDER (fallback del botón "Consultar",
 * T4) y el origen público del sitio (para el link del aviso en el mensaje).
 * No es secreto: el mismo número ya viaja en el href de "Publicá tu propiedad".
 */
export interface ContactConfig {
  /** Dígitos con código de país; null = sin número configurado. */
  finderWhatsApp: string | null;
  /** Origen público (`SITE_URL`), sin barra final. */
  siteUrl: string;
}

const Ctx = createContext<ContactConfig>({ finderWhatsApp: null, siteUrl: "" });

export function ContactConfigProvider({ value, children }: { value: ContactConfig; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useContactConfig(): ContactConfig {
  return useContext(Ctx);
}
