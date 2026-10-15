#!/usr/bin/env python3
"""Simuladores para el CI de iOS (.github/workflows/ios.yml e ios-auth.yml).

  pick [--only pro]    Escribe en stdout `runtime=`, `pro=` y `plain=` (formato
                       $GITHUB_OUTPUT). Los dos iPhone salen del runtime que
                       corresponde al SDK de Xcode (`xcrun --sdk iphonesimulator
                       --show-sdk-version`), nunca de uno más antiguo: un
                       dispositivo de otro runtime puede pasar por «Data
                       Migration» al arrancar y xcodebuild deja de verlo. Si en
                       ese runtime no hay el modelo, se crea con `simctl create`.
  ready UDID           Sale con 0 cuando el UDID está en `simctl list devices
                       available` Y en `xcodebuild -showdestinations` del
                       esquema; con 1, y lo que vio, si no lo está tras
                       `--attempts` intentos (5 s entre uno y otro).

Sin UDIDs fijos: todo se decide con lo que hay instalado en la máquina.
"""
import argparse
import json
import subprocess
import sys
import time

# Con Dynamic Island (las capturas de la isla) y sin ella (notch), por orden
# de preferencia.
PRO = ['iPhone 17 Pro', 'iPhone 16 Pro']
PLAIN = ['iPhone 17e', 'iPhone 16e']


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def version_tuple(text):
    return tuple(int(x) for x in text.strip().split('.') if x.isdigit())


def choose(runtimes, devices, devicetypes, sdk):
    """Lógica pura (sin xcrun): qué runtime y qué dispositivos usar.

    Devuelve (runtime, {'pro': udid | ('create', devicetype), 'plain': ...}).
    """
    ios = [r for r in runtimes if r.get('platform', 'iOS') == 'iOS' and r.get('isAvailable', True)]
    if not ios:
        raise SystemExit('No hay ningún runtime de iOS disponible')
    same = [r for r in ios if version_tuple(r['version'])[:2] == sdk[:2]]
    # Sin runtime del SDK exacto: el más nuevo que haya (y se dice en el log).
    runtime = max(same or ios, key=lambda r: version_tuple(r['version']))
    supported = {t['name'] for t in runtime.get('supportedDeviceTypes', [])}
    by_name = {t['name']: t['identifier'] for t in devicetypes}
    in_runtime = devices.get(runtime['identifier'], [])

    def pick(names):
        for name in names:
            for d in in_runtime:
                if d['name'] == name and d.get('isAvailable', True):
                    return d['udid']
        for name in names:
            if name in by_name and (not supported or name in supported):
                return ('create', by_name[name], name)
        return ''

    return runtime, {'pro': pick(PRO), 'plain': pick(PLAIN)}


def cmd_pick(args):
    sdk = version_tuple(run('xcrun', '--sdk', 'iphonesimulator', '--show-sdk-version'))
    runtimes = json.loads(run('xcrun', 'simctl', 'list', 'runtimes', 'available', '-j'))['runtimes']
    devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '-j'))['devices']
    devicetypes = json.loads(run('xcrun', 'simctl', 'list', 'devicetypes', '-j'))['devicetypes']
    runtime, chosen = choose(runtimes, devices, devicetypes, sdk)
    print(f"SDK iphonesimulator {'.'.join(map(str, sdk))} → runtime {runtime['identifier']}", file=sys.stderr)
    print(f"runtime={runtime['identifier']}")
    for key, value in chosen.items():
        if args.only and key not in args.only:
            continue
        if isinstance(value, tuple):
            _, devicetype, name = value
            value = run('xcrun', 'simctl', 'create', f'CI {name}', devicetype, runtime['identifier']).strip()
            print(f'{key}: creado «CI {name}» {value}', file=sys.stderr)
        elif value:
            print(f'{key}: {value}', file=sys.stderr)
        else:
            print(f'::warning::No hay simulador «{key}» en {runtime["identifier"]}', file=sys.stderr)
        print(f'{key}={value}')


def available(udid):
    devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '-j'))['devices']
    return any(d['udid'] == udid for group in devices.values() for d in group)


def destinations(project, scheme):
    out = subprocess.run(
        ['xcodebuild', '-showdestinations', '-project', project, '-scheme', scheme, '-sdk', 'iphonesimulator'],
        capture_output=True, text=True,
    )
    return out.stdout + out.stderr


def cmd_ready(args):
    seen = ''
    for attempt in range(1, args.attempts + 1):
        in_simctl = available(args.udid)
        seen = destinations(args.project, args.scheme)
        in_xcodebuild = f'id:{args.udid}' in seen
        print(f'intento {attempt}: simctl={in_simctl} xcodebuild={in_xcodebuild}', file=sys.stderr)
        if in_simctl and in_xcodebuild:
            return 0
        time.sleep(5)
    print(f'::error::xcodebuild no ve el simulador {args.udid}', file=sys.stderr)
    print(seen, file=sys.stderr)
    return 1


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='cmd', required=True)
    pick = sub.add_parser('pick')
    pick.add_argument('--only', nargs='*', choices=['pro', 'plain'], help='sólo estos (no crea los demás)')
    ready = sub.add_parser('ready')
    ready.add_argument('udid')
    ready.add_argument('--project', default='ios/App/App.xcodeproj')
    ready.add_argument('--scheme', default='App')
    ready.add_argument('--attempts', type=int, default=24)
    args = parser.parse_args()
    if args.cmd == 'pick':
        cmd_pick(args)
        return 0
    return cmd_ready(args)


if __name__ == '__main__':
    sys.exit(main())
