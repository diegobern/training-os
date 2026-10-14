import { Button, Sheet } from '../ui/primitives'
import { useT } from '../../store/useApp'

/**
 * La explicación antes de mandar a la persona a Ajustes → «Alarmas y
 * recordatorios» (Android 12+).
 *
 * Sin ese permiso el aviso de «Descanso terminado» se programa igualmente,
 * pero aproximado: Android puede retrasarlo hasta tres cuartos del descanso.
 * Por eso esta hoja no bloquea nada — el aviso ya está programado cuando
 * aparece — y «Ahora no» deja todo como está. Se enseña una sola vez (lo
 * decide `NativeShell`), la primera vez que empieza un descanso sin el
 * permiso, nunca al abrir la app.
 *
 * Se cierra como cualquier hoja: con el botón atrás, tocando fuera o con la
 * equis. Cerrarla es lo mismo que «Ahora no».
 */
export function ExactAlarmSheet({
  open,
  onAllow,
  onLater,
}: {
  open: boolean
  onAllow: () => void
  onLater: () => void
}) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onLater} title={t('native.exactAlarmTitle')}>
      <p className="text-body text-muted">{t('native.exactAlarmBody')}</p>
      <div className="mt-5 flex gap-2">
        <Button full variant="secondary" onClick={onLater}>
          {t('native.exactAlarmLater')}
        </Button>
        <Button full variant="primary" onClick={onAllow}>
          {t('native.exactAlarmAllow')}
        </Button>
      </div>
    </Sheet>
  )
}
