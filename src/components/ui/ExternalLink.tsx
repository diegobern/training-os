import type { ReactNode } from 'react'
import { isNativeAndroid } from '../../lib/native/platform'
import { openExternal } from '../../lib/native/chrome'

/**
 * Un enlace que sale de Training OS.
 *
 * En el navegador es un `<a target="_blank">` de toda la vida: abre una
 * pestaña nueva y no hay más que hablar.
 *
 * Dentro de la app de Android, `target="_blank"` hace algo bastante peor de lo
 * que parece: carga la página **dentro del WebView**, encima de la
 * aplicación, sin barra de direcciones y sin botón de volver. El usuario que
 * toca "CC BY-SA 4.0" se queda mirando la web de Creative Commons sin ninguna
 * forma evidente de regresar, y si pulsa atrás sale de la app entera.
 *
 * Por eso aquí se intercepta la pulsación y se abre en una Custom Tab de
 * Chrome, que tiene su propia barra, su propio botón de cerrar y devuelve a
 * Training OS exactamente donde estaba.
 */
export function ExternalLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => {
        // La comprobación es síncrona a propósito: hay que decidir si se
        // cancela la navegación antes de que el WebView empiece a cargarla.
        if (!isNativeAndroid()) return
        e.preventDefault()
        void openExternal(href)
      }}
    >
      {children}
    </a>
  )
}
