import { useEffect, useRef, useState } from 'react'
import { Spinner } from '../../shared/Spinner'
import styles from './ModelViewer.module.css'

interface ModelViewerProps {
  /** GLB/glTF URL — loads without CORS when it's the local cache (asset:) */
  url: string
  /** Load failure (parser, network, CORS) — the parent falls back to a file card */
  onError?: () => void
}

/**
 * 3D generation result viewer — three.js orbit view. Deep-sea lighting (hemi + key light),
 * auto-framing from the bounding box. Renders only on interaction/resize (no rAF loop)
 */
export function ModelViewer({ url, onError }: ModelViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const errorRef = useRef(onError)
  errorRef.current = onError

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined

    void (async () => {
      // three is heavy — load only when a 3D node is actually visible
      const THREE = await import('three')
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
      const el = mountRef.current
      if (disposed || !el) return

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      el.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
      scene.add(new THREE.HemisphereLight(0xeaf4f4, 0x0c1519, 1.4))
      const key = new THREE.DirectionalLight(0xffffff, 1.8)
      key.position.set(2, 4, 3)
      scene.add(key)

      const controls = new OrbitControls(camera, renderer.domElement)
      const render = () => renderer.render(scene, camera)
      controls.addEventListener('change', render)

      const ro = new ResizeObserver(() => {
        const w = el.clientWidth
        const h = el.clientHeight
        if (w === 0 || h === 0) return
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        render()
      })
      ro.observe(el)

      new GLTFLoader().load(
        url,
        (gltf) => {
          if (disposed) return
          scene.add(gltf.scene)
          // Frame the camera using the bounding box
          const box = new THREE.Box3().setFromObject(gltf.scene)
          const size = box.getSize(new THREE.Vector3()).length() || 1
          const center = box.getCenter(new THREE.Vector3())
          controls.target.copy(center)
          camera.position
            .copy(center)
            .add(new THREE.Vector3(size * 0.55, size * 0.4, size * 0.8))
          camera.near = size / 100
          camera.far = size * 10
          camera.updateProjectionMatrix()
          controls.update()
          render()
          setLoading(false)
        },
        undefined,
        () => {
          if (!disposed) errorRef.current?.()
        },
      )

      cleanup = () => {
        ro.disconnect()
        controls.dispose()
        renderer.dispose()
        renderer.domElement.remove()
      }
    })()

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [url])

  return (
    <div ref={mountRef} className={styles.viewer}>
      {loading && (
        <div className={styles.loading}>
          <Spinner size={16} />
        </div>
      )}
    </div>
  )
}
