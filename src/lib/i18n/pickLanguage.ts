import type { Language } from '../db/schema'

/**
 * El idioma con el que arranca una instalación NUEVA.
 *
 * Sólo cuenta el primer idioma del dispositivo, que es el que la persona ha
 * puesto delante: «es» o cualquier variante «es-*» (es-ES, es-MX, es-419…)
 * → español; todo lo demás → inglés. Un catalán con el español en segundo
 * lugar (['ca-ES', 'es-ES']) recibe inglés a propósito: no adivinamos qué
 * segundo idioma prefiere; lo cambia en Ajustes en un toque.
 *
 * Pura y sin estado: no lee nada por su cuenta. Quien la llama decide de
 * dónde salen los idiomas (ver `deviceLanguages`), y una instalación que ya
 * tiene ajustes guardados nunca pasa por aquí: su idioma es el que eligió.
 */
export function pickLanguage(languages: readonly string[]): Language {
  const first = (languages[0] ?? '').trim().toLowerCase()
  return first === 'es' || first.startsWith('es-') ? 'es' : 'en'
}

/**
 * Los idiomas del dispositivo, por orden de preferencia.
 *
 * `navigator.languages` puede venir vacío en algunos WebView; entonces se usa
 * `navigator.language`. Fuera de un navegador (las pruebas en node antiguas)
 * no hay nada que leer y la lista sale vacía, que `pickLanguage` lee como
 * inglés.
 */
export function deviceLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  const list = navigator.languages
  if (list && list.length > 0) return list
  return navigator.language ? [navigator.language] : []
}
