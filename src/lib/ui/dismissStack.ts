/**
 * La pila de cosas que se pueden cerrar.
 *
 * Una hoja abierta encima de un diálogo abierto encima de una pantalla: el
 * problema es saber qué cierra el botón "atrás" de Android, y la respuesta
 * correcta es siempre "lo último que se abrió".
 *
 * Cada componente que se pueda descartar se apunta aquí mientras está abierto
 * y se borra al cerrarse. Quien quiera cerrar el de más arriba llama a
 * `dismissTop()`, sin saber qué es ni de quién.
 *
 * Es infraestructura de interfaz, no de Android: funciona igual en el
 * navegador. Lo que la usa en Android es el manejador del botón físico
 * (`src/components/layout/NativeShell.tsx`).
 */

type Dismiss = () => void

const stack: Dismiss[] = []

/**
 * Apunta algo que se puede cerrar y devuelve la función para desapuntarlo.
 * Pensado para usarse dentro de un `useEffect`, devolviendo el resultado como
 * función de limpieza.
 */
export function pushDismissable(dismiss: Dismiss): () => void {
  stack.push(dismiss)
  let released = false
  return () => {
    if (released) return
    released = true
    const i = stack.lastIndexOf(dismiss)
    if (i !== -1) stack.splice(i, 1)
  }
}

/** ¿Hay algo abierto que se pueda cerrar? */
export function hasDismissable(): boolean {
  return stack.length > 0
}

/**
 * Cierra lo último que se abrió. Devuelve `true` si había algo.
 *
 * No saca el elemento de la pila: de eso se encarga la limpieza del propio
 * componente cuando reacciona a su `onClose`. Sacarlo aquí además dejaría la
 * pila desincronizada si el componente decidiera no cerrarse.
 */
export function dismissTop(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}

/** Sólo para los tests: deja la pila vacía. */
export function resetDismissStack(): void {
  stack.length = 0
}
