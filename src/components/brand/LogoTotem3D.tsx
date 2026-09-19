/* ============================================================================
 * TRAINING OS — "THE CORE"
 *
 * A real WebGL object, not a flat mark being spun like a photo.
 *
 * What is actually modelled:
 *   · an obsidian tile, extruded with a bevelled rim so the edge catches light
 *   · the volt bolt raised out of its face in polished metal, casting a real
 *     shadow into the tile below it
 *   · two energy rings orbiting on different tilted axes, passing IN FRONT of
 *     and BEHIND the tile — that occlusion is the cue nothing flat can fake
 *   · a procedurally generated studio environment, so the clearcoat reflects
 *     something real (and no texture file has to be downloaded)
 *
 * The turntable is eased, not linear: it slows as the face comes round and
 * accelerates through the thin edge, which is where the thickness reads. The
 * whole thing also answers the pointer — drag to spin it, move the mouse and
 * the camera parallaxes. An object that responds stops looking like a video.
 * ========================================================================== */

import { useEffect, useRef } from 'react'
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
  PMREMGenerator,
  Points,
  PointsMaterial,
  Scene,
  Shape,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  WebGLRenderer,
} from 'three'

const VOLT = 0xcdff4f

/* ------------------------------------------------------------------ shapes */

/** The bolt, in the same proportions as the app icon, centred on the origin. */
function boltShape(): Shape {
  const pts: [number, number][] = [
    [0.58, 0.95],
    [-0.42, -0.06],
    [0.02, -0.06],
    [-0.28, -0.95],
    [0.62, 0.1],
    [0.16, 0.1],
  ]
  const cx = 0.1 // the outline is not symmetric; recentre it
  const s = new Shape()
  s.moveTo(pts[0][0] - cx, pts[0][1])
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0] - cx, pts[i][1])
  s.closePath()
  return s
}

function roundedSquare(half: number, radius: number): Shape {
  const s = new Shape()
  const r = Math.min(radius, half)
  s.moveTo(-half + r, -half)
  s.lineTo(half - r, -half)
  s.quadraticCurveTo(half, -half, half, -half + r)
  s.lineTo(half, half - r)
  s.quadraticCurveTo(half, half, half - r, half)
  s.lineTo(-half + r, half)
  s.quadraticCurveTo(-half, half, -half, half - r)
  s.lineTo(-half, -half + r)
  s.quadraticCurveTo(-half, -half, -half + r, -half)
  return s
}

/* ------------------------------------------------------------ environment */

/**
 * A studio in a canvas: a soft vertical gradient with two bright softboxes and
 * a volt bounce. Fed through PMREM it becomes the reflection the clearcoat
 * sees — the thing that separates "3D" from "plastic".
 */
function studioTexture(dark: boolean): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!

  const sky = g.createLinearGradient(0, 0, 0, 256)
  if (dark) {
    sky.addColorStop(0, '#404856')
    sky.addColorStop(0.2, '#171b22')
    sky.addColorStop(0.34, '#06080b')
    sky.addColorStop(1, '#000000')
  } else {
    sky.addColorStop(0, '#e6ecf5')
    sky.addColorStop(0.2, '#99a2af')
    sky.addColorStop(0.34, '#171b22')
    sky.addColorStop(1, '#04060a')
  }
  g.fillStyle = sky
  g.fillRect(0, 0, 512, 256)

  const softbox = (x: number, y: number, w: number, h: number, alpha: number) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, Math.max(w, h) / 2)
    rg.addColorStop(0, `rgba(255,255,255,${alpha})`)
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = rg
    g.beginPath()
    g.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2)
    g.fill()
  }
  softbox(120, 60, 230, 150, dark ? 0.95 : 1)
  softbox(380, 40, 170, 110, dark ? 0.6 : 0.85)

  // volt bounce from below-left: the rim colour the metal picks up
  const bounce = g.createRadialGradient(330, 235, 0, 330, 235, 190)
  bounce.addColorStop(0, `rgba(205,255,79,${dark ? 0.5 : 0.32})`)
  bounce.addColorStop(1, 'rgba(205,255,79,0)')
  g.fillStyle = bounce
  g.fillRect(0, 130, 512, 126)

  const tex = new CanvasTexture(c)
  tex.mapping = EquirectangularReflectionMapping
  tex.colorSpace = SRGBColorSpace
  return tex
}

/* ------------------------------------------------------------------ props */

export interface LogoTotem3DProps {
  /** Rendered once at a hero angle and then left still. */
  still?: boolean
  className?: string
  /** Fired once the first frame is on screen, so the flat mark can hand over. */
  onReady?: () => void
}

export default function LogoTotem3D({ still = false, className, onReady }: LogoTotem3DProps) {
  const holder = useRef<HTMLDivElement | null>(null)
  // Held in a ref so a new callback identity cannot tear the scene down and
  // rebuild it — this effect is expensive and runs on `still` alone.
  const ready = useRef(onReady)
  ready.current = onReady

  useEffect(() => {
    const mount = holder.current
    if (!mount) return

    const dark = document.documentElement.getAttribute('data-theme') === 'dark'

    /* ------------------------------------------------------------ renderer */
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      return // no WebGL: the wrapper keeps showing its flat fallback
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = dark ? 1.18 : 1.24
    // No shadow mapping. The tile is near black, so a cast shadow on it reads
    // as nothing at all — it was costing frames and buying no depth. The gap
    // between bolt and tile is conveyed instead by the bounce light below,
    // which the black surface *can* show.
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'pan-y'
    renderer.domElement.style.cursor = 'grab'
    mount.appendChild(renderer.domElement)

    const scene = new Scene()
    // 34° is the compromise: long enough to look like a product shot, short
    // enough that the near corner of the tile genuinely lunges at you.
    const camera = new PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(0, 0, 7.9)

    const pmrem = new PMREMGenerator(renderer)
    const envTex = studioTexture(dark)
    const env = pmrem.fromEquirectangular(envTex).texture
    scene.environment = env
    envTex.dispose()
    pmrem.dispose()

    /* --------------------------------------------------------------- lights */
    // Pushed well off-axis on purpose. A frontal key hides the bolt's shadow
    // behind the bolt itself; from up here it falls across the tile, and that
    // shadow between two surfaces is the detail that proves the gap is real.
    const key = new DirectionalLight(0xfff6e8, dark ? 2.6 : 2.7)
    key.position.set(5.6, 6.6, 2.6)
    scene.add(key)

    // The rim is what draws the volt silhouette when the object turns away.
    const rim = new DirectionalLight(VOLT, dark ? 5.2 : 3.4)
    rim.position.set(-5.5, 1.4, -4.4)
    scene.add(rim)

    // A hard, narrow raking light. Its only job is the specular streak that
    // runs along the bevel as the face swings past — the flash that says metal.
    const rake = new DirectionalLight(0xffffff, dark ? 1.15 : 1.35)
    rake.position.set(-1.2, 3.4, 6.5)
    scene.add(rake)

    const fill = new DirectionalLight(0x9fb6d8, dark ? 0.7 : 1.0)
    fill.position.set(-3, -4, 3)
    scene.add(fill)

    // The studio floor is deliberately black, which left the bolt's lower legs
    // dead. This lifts them just enough to keep the whole shape reading.
    const uplight = new DirectionalLight(0xd8ff9a, dark ? 0.9 : 0.8)
    uplight.position.set(0.6, -3.2, 4.2)
    scene.add(uplight)

    scene.add(new AmbientLight(0xffffff, dark ? 0.14 : 0.2))

    /* ------------------------------------------------------------- geometry */
    const totem = new Group()
    scene.add(totem)

    const tileGeo = new ExtrudeGeometry(roundedSquare(1.34, 0.44), {
      depth: 0.4,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.07,
      bevelSegments: 5,
      curveSegments: 24,
    })
    tileGeo.center()
    const tile = new Mesh(
      tileGeo,
      new MeshPhysicalMaterial({
        color: new Color(dark ? 0x05070b : 0x080b11),
        metalness: 0.22,
        roughness: 0.15,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        reflectivity: 0.8,
        envMapIntensity: dark ? 1.1 : 1.15,
      }),
    )
    totem.add(tile)

    const boltGeo = new ExtrudeGeometry(boltShape(), {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.055,
      bevelSize: 0.05,
      bevelSegments: 4,
      curveSegments: 12,
    })
    boltGeo.center()
    const bolt = new Mesh(
      boltGeo,
      new MeshPhysicalMaterial({
        // A deeper base than the brand token on purpose: ACES tone mapping
        // desaturates bright colour by design, and #CDFF4F came out pastel.
        // Starting lower lands it on the real volt once it has been mapped.
        color: new Color(0x8fce00),
        // Barely metallic. A metal tints whatever it reflects, and against a
        // bright studio that washed the volt out completely. This is a
        // saturated base under a clear gloss instead — automotive paint.
        metalness: 0.1,
        roughness: 0.3,
        clearcoat: 0.6,
        clearcoatRoughness: 0.14,
        emissive: new Color(VOLT),
        // A trace of emission so the bolt still reads as energy in shadow.
        emissiveIntensity: dark ? 0.3 : 0.16,
        envMapIntensity: 0.8,
      }),
    )
    bolt.scale.setScalar(0.9)
    bolt.rotation.set(MathUtils.degToRad(-4), MathUtils.degToRad(6), MathUtils.degToRad(-2))
    // Well proud of the face: the gap is what lets the key light throw a real
    // shadow into the tile, and a shadow between two surfaces is unfakeable.
    bolt.position.z = 0.62

    // Tucked behind the bolt, pointing at the tile. It pools volt light around
    // the bolt's base, which is what makes the gap between the two readable on
    // a black surface — and it doubles as the object's own energy source.
    const bounce = new PointLight(VOLT, dark ? 2.1 : 1.6, 1.9, 2)
    bounce.position.set(0.1, -0.1, 0.26)

    // The bolt and its own light travel together as one rig, so the whole
    // assembly can be mirrored onto the back face in a single clone.
    const boltRig = new Group()
    boltRig.add(bolt)
    boltRig.add(bounce)
    totem.add(boltRig)

    // Same rig turned half a revolution: the mark now reads correctly from
    // behind as well, so there is no blank side as the tile comes round. The
    // two rigs share geometry and material, so the second one costs one draw
    // call and no memory. Intensity was pulled back above because shadow
    // mapping is off — each bounce light reaches the far face too, and at the
    // old value the pair flattened the tile between them.
    const boltRigBack = boltRig.clone()
    boltRigBack.rotation.y = Math.PI
    totem.add(boltRigBack)

    const glowMat = (color: number, opacity: number) =>
      new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false })

    /* ----------------------------------------------------------- edge groove */
    // A thin volt band machined into the tile's waist. It traces the silhouette
    // at every angle, so the object reads as engineered rather than moulded.
    // Outside the tile's outer edge (half 1.34 + 0.07 bevel), or it is simply
    // buried in the body and never seen.
    const grooveShape = roundedSquare(1.474, 0.472)
    grooveShape.holes.push(roundedSquare(1.428, 0.455))
    const grooveGeo = new ExtrudeGeometry(grooveShape, {
      depth: 0.12,
      bevelEnabled: false,
      curveSegments: 24,
    })
    grooveGeo.center()
    const groove = new Mesh(
      grooveGeo,
      new MeshBasicMaterial({ color: 0xdcff8c, transparent: true, opacity: dark ? 0.85 : 0.7 }),
    )
    totem.add(groove)

    const grooveHaloShape = roundedSquare(1.485, 0.475)
    grooveHaloShape.holes.push(roundedSquare(1.40, 0.45))
    const grooveHaloGeo = new ExtrudeGeometry(grooveHaloShape, { depth: 0.05, bevelEnabled: false, curveSegments: 24 })
    grooveHaloGeo.center()
    totem.add(new Mesh(grooveHaloGeo, glowMat(VOLT, dark ? 0.12 : 0.07)))

    /* ---------------------------------------------------------------- rings */
    const ringGroup = new Group()
    totem.add(ringGroup)

    /** A neon tube: a near-white core inside a soft volt halo. */
    function neonRing(radius: number, core: number, halo: number, intensity: number) {
      const g = new Group()
      g.add(new Mesh(new TorusGeometry(radius, core, 8, 220), glowMat(0xf2ffd4, intensity)))
      g.add(new Mesh(new TorusGeometry(radius, halo, 8, 160), glowMat(VOLT, intensity * 0.3)))
      return g
    }

    const ringA = neonRing(1.86, 0.012, 0.055, dark ? 0.95 : 0.8)
    ringA.rotation.set(MathUtils.degToRad(64), MathUtils.degToRad(20), MathUtils.degToRad(-8))
    ringGroup.add(ringA)

    const ringB = neonRing(2.02, 0.007, 0.032, dark ? 0.5 : 0.38)
    ringB.rotation.set(MathUtils.degToRad(-84), MathUtils.degToRad(-38), MathUtils.degToRad(18))
    ringGroup.add(ringB)

    // A bead running the main ring. Nothing sells an orbit like something
    // actually travelling it — and it disappears behind the tile each lap.
    const node = new Mesh(new TorusGeometry(0.045, 0.045, 8, 16), glowMat(0xffffff, 0.95))
    const nodeHalo = new Mesh(new TorusGeometry(0.115, 0.115, 8, 16), glowMat(VOLT, 0.4))
    const nodeGroup = new Group()
    nodeGroup.add(node, nodeHalo)
    ringA.add(nodeGroup)

    /* ------------------------------------------------------------ particles */
    const COUNT = 46
    const pos = new Float32Array(COUNT * 3)
    const seed = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      const r = 2.0 + Math.random() * 1.5
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7
      pos[i * 3 + 2] = r * Math.cos(phi)
      seed[i] = Math.random() * Math.PI * 2
    }
    const dustGeo = new BufferGeometry()
    dustGeo.setAttribute('position', new Float32BufferAttribute(pos, 3))
    const dust = new Points(
      dustGeo,
      new PointsMaterial({
        color: VOLT,
        size: 0.035,
        transparent: true,
        opacity: dark ? 0.75 : 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    )
    scene.add(dust)

    /* ---------------------------------------------------------------- sizing */
    function resize() {
      const w = mount!.clientWidth || 1
      const h = mount!.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      // Keep the object the same physical size whatever the container shape.
      camera.position.z = 7.9 * Math.max(1, 1.02 / camera.aspect)
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(mount)

    /* --------------------------------------------------------- interaction */
    const pointer = new Vector2(0, 0)
    const smooth = new Vector2(0, 0)
    let dragging = false
    let lastX = 0
    let flick = 0

    const onPointerMove = (e: PointerEvent) => {
      const r = mount!.getBoundingClientRect()
      pointer.x = MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.6, 1.6)
      pointer.y = MathUtils.clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1.6, 1.6)
      if (dragging) {
        flick += (e.clientX - lastX) * 0.012
        lastX = e.clientX
      }
    }
    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      renderer.domElement.style.cursor = 'grabbing'
      renderer.domElement.setPointerCapture?.(e.pointerId)
    }
    const onUp = (e: PointerEvent) => {
      dragging = false
      renderer.domElement.style.cursor = 'grab'
      renderer.domElement.releasePointerCapture?.(e.pointerId)
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    renderer.domElement.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    /* ----------------------------------------------------- quality guard */
    // This runs on whatever phone the person owns, not on a workstation. If the
    // first second is not comfortably smooth, the scene sheds its most
    // expensive decoration rather than stuttering through it.
    let frames = 0
    let elapsed = 0
    let degraded = false
    let lastFrameAt = 0

    function degrade() {
      degraded = true
      renderer.setPixelRatio(1)
      ringB.visible = false
      dust.visible = false
      resize()
    }

    /* ------------------------------------------------- context loss safety */
    let contextLost = false
    const onLost = (e: Event) => {
      e.preventDefault()
      contextLost = true
      renderer.domElement.style.opacity = '0'
    }
    renderer.domElement.addEventListener('webglcontextlost', onLost)

    /* -------------------------------------------------------------- the loop */
    let raf = 0
    let spin = 0
    const start = performance.now()
    let visible = true

    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
          })
        : null
    io?.observe(mount)

    function frame(now: number) {
      raf = requestAnimationFrame(frame)
      if (contextLost) return
      if (!visible || document.hidden) {
        lastFrameAt = 0
        return
      }

      if (!degraded) {
        if (lastFrameAt) {
          elapsed += now - lastFrameAt
          frames++
          if (frames === 90 && elapsed / frames > 26) degrade()
        }
        lastFrameAt = now
      }

      const t = (now - start) / 1000

      /*
       * Bake mode.
       *
       * The sprite for the tab bar is rendered from this very object, and for
       * that the motion has to be something a strip of frames can actually
       * hold: a pure turntable, at an angle the baker sets, with the drift and
       * the bob switched off. The live animation eases the spin and floats the
       * totem on periods that do not divide the revolution, so sampling it
       * gives frames that are unevenly spaced AND a loop whose ends do not
       * meet — which is exactly what made the tab-bar mark stutter.
       *
       * The hook exists only while a baking script has installed it. Nothing
       * in the shipped app ever sets it.
       */
      const bake = (window as unknown as { __logoBake?: { angle: number } }).__logoBake
      if (bake) {
        totem.rotation.set(-0.17, bake.angle - 0.55, 0.04)
        totem.position.y = 0
        ringGroup.rotation.set(0, -(bake.angle - 0.55) * 1.5, 0.2)
        ringA.rotation.z = bake.angle
        ringB.rotation.z = -bake.angle * 0.68
        nodeGroup.position.set(Math.cos(bake.angle * 3) * 1.86, Math.sin(bake.angle * 3) * 1.86, 0)
        groove.material.opacity = dark ? 0.72 : 0.58
        dust.rotation.set(0, 0, 0)
        camera.position.set(0, 0, camera.position.z)
        camera.lookAt(0, 0, 0)
        renderer.render(scene, camera)
        return
      }

      // Eased turntable: slow through the face, quick across the edge. This is
      // where the thickness is visible, so it should not blur past.
      spin += 0.0118 + flick
      flick *= 0.90
      const eased = spin - 0.34 * Math.sin(2 * spin)

      totem.rotation.y = eased - 0.55
      totem.rotation.x = Math.sin(t * 0.46) * 0.15 - 0.17
      totem.rotation.z = Math.sin(t * 0.31) * 0.05 + 0.04
      totem.position.y = Math.sin(t * 0.62) * 0.13

      ringGroup.rotation.y = -(eased - 0.55) * 1.5 + t * 0.2
      ringGroup.rotation.z = Math.sin(t * 0.4) * 0.2
      ringA.rotation.z = t * 0.5
      ringB.rotation.z = -t * 0.34

      // The bead rides the main ring, in the ring's own local space.
      const orbit = t * 1.5
      nodeGroup.position.set(Math.cos(orbit) * 1.86, Math.sin(orbit) * 1.86, 0)

      groove.material.opacity = (dark ? 0.72 : 0.58) + Math.sin(t * 1.9) * 0.18

      dust.rotation.y = t * 0.06
      dust.rotation.x = Math.sin(t * 0.18) * 0.12

      // Parallax: the camera moves, not the object, so it reads as depth
      // behind the glass rather than something sliding around on top of it.
      smooth.x += (pointer.x - smooth.x) * 0.045
      smooth.y += (pointer.y - smooth.y) * 0.045
      camera.position.x = smooth.x * 0.95
      camera.position.y = -smooth.y * 0.7
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }

    if (still) {
      // Reduced motion: one considered hero frame, then nothing moves.
      totem.rotation.set(-0.17, -0.55, 0.04)
      ringGroup.rotation.set(0, 0.8, 0.2)
      renderer.render(scene, camera)
    } else {
      raf = requestAnimationFrame(frame)
    }

    mount.dataset.ready = '1'
    // After the first frame is actually on the canvas, not before: the flat
    // mark stays up until there is something real to replace it with.
    ready.current?.()

    /* ------------------------------------------------------------- teardown */
    return () => {
      cancelAnimationFrame(raf)
      io?.disconnect()
      ro?.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      renderer.domElement.removeEventListener('webglcontextlost', onLost)
      scene.traverse((obj) => {
        const m = obj as Mesh
        m.geometry?.dispose?.()
        const mat = m.material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose?.()
      })
      env.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [still])

  return <div ref={holder} className={className} aria-hidden="true" />
}
