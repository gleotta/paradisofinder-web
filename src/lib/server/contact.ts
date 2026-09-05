import "server-only";

/**
 * Contacto para inmobiliarias/dueños que quieran publicar (MVP beta, 05/09):
 * botón "Publicá tu propiedad" → WhatsApp. El número vive en env del server
 * (`CONTACT_WHATSAPP`, dígitos con código de país) y se lee en cada request:
 * no viaja al bundle del cliente ni exige rebuild para cambiarlo. Sin número,
 * el botón no se muestra.
 */
const DEFAULT_TEXT = "Hola, quiero publicar propiedades en paradisofinder.com";

export function publishWhatsAppHref(): string | null {
  const digits = (process.env.CONTACT_WHATSAPP ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const text = process.env.CONTACT_WHATSAPP_TEXT?.trim() || DEFAULT_TEXT;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
