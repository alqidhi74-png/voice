import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

const buildPointBuffers = (comparison) => {
  if (!comparison?.probePreview || !comparison?.referencePreview) {
    return null
  }

  const { probePreview, referencePreview, differencePreview, previewCount } = comparison
  const count = Math.min(
    previewCount || probePreview.length,
    probePreview.length,
    referencePreview.length
  )

  if (count === 0) {
    return null
  }

  const positions = new Float32Array(count * 3)
  const targets = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const noteColors = new Array(count)
  const magnitudes = []

  let maxMagnitude = 0
  for (let i = 0; i < count; i++) {
    const magnitude = Math.abs(differencePreview?.[i] ?? probePreview[i] - referencePreview[i])
    magnitudes.push(magnitude)
    if (magnitude > maxMagnitude) {
      maxMagnitude = magnitude
    }
  }

  const safeMax = maxMagnitude || 1
  const maxYValue = Math.max(
    ...probePreview.slice(0, count).map((value) => Math.abs(value)),
    ...referencePreview.slice(0, count).map((value) => Math.abs(value)),
    1
  )
  const yScale = 1.6 / maxYValue
  const connections = []

  for (let i = 0; i < count; i++) {
    const idx = i * 3
    const t = i / Math.max(1, count - 1)
    const angle = t * Math.PI * 2

    const referenceValue = referencePreview[i]
    const probeValue = probePreview[i]
    const normalizedMagnitude = magnitudes[i] / safeMax
    const baseRadius = 1.6 + normalizedMagnitude * 1.8

    positions[idx] = Math.cos(angle) * baseRadius
    positions[idx + 1] = referenceValue * yScale
    positions[idx + 2] = Math.sin(angle) * baseRadius

    const targetRadius = baseRadius + normalizedMagnitude * 0.6
    targets[idx] = Math.cos(angle) * targetRadius
    targets[idx + 1] = probeValue * yScale
    targets[idx + 2] = Math.sin(angle) * targetRadius

    const noteColor = new THREE.Color()
    const palette = [
      '#ff6e6c',
      '#ffd166',
      '#06d6a0',
      '#118ab2',
      '#9c6cff',
      '#ff9ee2'
    ]
    noteColor.set(palette[i % palette.length])
    const pulseColor = noteColor.clone().lerp(new THREE.Color('#ffffff'), normalizedMagnitude * 0.45)

    colors[idx] = pulseColor.r
    colors[idx + 1] = pulseColor.g
    colors[idx + 2] = pulseColor.b
    noteColors[i] = noteColor

    const next = (i + 1) % count
    const jump = (i + 7) % count
    connections.push([i, next])
    connections.push([i, jump])
  }

  return {
    count,
    positions,
    targets,
    colors,
    noteColors,
    magnitudes,
    connections,
    maxMagnitude: safeMax,
    yScale
  }
}

const Connections = ({ buffers, pointsGeometry }) => {
  const lineRef = useRef(null)
  const connectionPairs = buffers.connections || []
  const linePositions = useMemo(() => {
    const arr = new Float32Array(connectionPairs.length * 6)
    return arr
  }, [connectionPairs.length])
  const lineColors = useMemo(() => new Float32Array(connectionPairs.length * 6), [connectionPairs.length])

  useFrame(() => {
    if (!lineRef.current || !pointsGeometry) return
    const pointsGeo = pointsGeometry
    const positions = pointsGeo.getAttribute('position')
    for (let i = 0; i < connectionPairs.length; i++) {
      const [a, b] = connectionPairs[i]
      const aIdx = a * 3
      const bIdx = b * 3
      const lineIdx = i * 6
      linePositions[lineIdx] = positions.array[aIdx]
      linePositions[lineIdx + 1] = positions.array[aIdx + 1]
      linePositions[lineIdx + 2] = positions.array[aIdx + 2]
      linePositions[lineIdx + 3] = positions.array[bIdx]
      linePositions[lineIdx + 4] = positions.array[bIdx + 1]
      linePositions[lineIdx + 5] = positions.array[bIdx + 2]
    }
    lineRef.current.geometry.attributes.position.needsUpdate = true
    lineRef.current.geometry.computeBoundingSphere()
  })

  useMemo(() => {
    for (let i = 0; i < connectionPairs.length; i++) {
      const [a, b] = connectionPairs[i]
      const colorA = buffers.noteColors[a] || new THREE.Color('#ffffff')
      const colorB = buffers.noteColors[b] || new THREE.Color('#ffffff')
      const gradientColor = colorA.clone().lerp(colorB, 0.5)
      const idx = i * 6
      lineColors[idx] = gradientColor.r
      lineColors[idx + 1] = gradientColor.g
      lineColors[idx + 2] = gradientColor.b
      lineColors[idx + 3] = gradientColor.r
      lineColors[idx + 4] = gradientColor.g
      lineColors[idx + 5] = gradientColor.b
    }
  }, [buffers.noteColors, connectionPairs])

  useMemo(() => {
    for (let i = 0; i < connectionPairs.length; i++) {
      const [a, b] = connectionPairs[i]
      const aIdx = a * 3
      const bIdx = b * 3
      const lineIdx = i * 6
      linePositions[lineIdx] = buffers.positions[aIdx]
      linePositions[lineIdx + 1] = buffers.positions[aIdx + 1]
      linePositions[lineIdx + 2] = buffers.positions[aIdx + 2]
      linePositions[lineIdx + 3] = buffers.positions[bIdx]
      linePositions[lineIdx + 4] = buffers.positions[bIdx + 1]
      linePositions[lineIdx + 5] = buffers.positions[bIdx + 2]
    }
  }, [buffers.positions, connectionPairs, linePositions])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3))
    return geo
  }, [linePositions, lineColors])

  return (
    <lineSegments
      ref={lineRef}
      geometry={geometry}
    >
      <lineBasicMaterial
        attach="material"
        vertexColors
        transparent
        opacity={0.6}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  )
}

const IslandsPoints = ({ comparison, buffers, onGeometryReady }) => {
  const pointsRef = useRef(null)

  useFrame(({ clock }) => {
    if (!pointsRef.current) {
      return
    }

    const geometry = pointsRef.current.geometry
    const positions = geometry.getAttribute('position')
    const colors = geometry.getAttribute('color')
    const targets = geometry.getAttribute('target')
    const elapsed = clock.getElapsedTime()

    for (let i = 0; i < positions.count; i++) {
      const idx = i * 3
      const lerpFactor = 0.06 + Math.sin(elapsed * 0.7 + i * 0.08) * 0.02

      positions.array[idx] = THREE.MathUtils.lerp(
        positions.array[idx],
        targets.array[idx],
        lerpFactor
      )
      positions.array[idx + 1] = THREE.MathUtils.lerp(
        positions.array[idx + 1],
        targets.array[idx + 1],
        lerpFactor
      )
      positions.array[idx + 2] = THREE.MathUtils.lerp(
        positions.array[idx + 2],
        targets.array[idx + 2],
        lerpFactor
      )

      const pulse = 0.7 + 0.25 * Math.sin(elapsed * 1.4 + i * 0.12)
      colors.array[idx] = THREE.MathUtils.clamp(buffers.colors[idx] * pulse, 0, 1)
      colors.array[idx + 1] = THREE.MathUtils.clamp(buffers.colors[idx + 1] * pulse, 0, 1)
      colors.array[idx + 2] = THREE.MathUtils.clamp(buffers.colors[idx + 2] * pulse, 0, 1)
    }

    positions.needsUpdate = true
    colors.needsUpdate = true
  })

  if (!buffers) {
    return null
  }

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(buffers.positions.slice(), 3))
    geo.setAttribute('target', new THREE.BufferAttribute(buffers.targets.slice(), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(buffers.colors.slice(), 3))
    return geo
  }, [buffers.positions, buffers.targets, buffers.colors])

  return (
    <points
      ref={pointsRef}
      onUpdate={(points) => {
        if (onGeometryReady) {
          onGeometryReady(points.geometry)
        }
      }}
    >
      <primitive object={geometry} />
      <pointsMaterial
        size={0.16}
        vertexColors
        depthWrite={false}
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  )
}

const PathFollower = ({ buffers, following, pointsGeometry, audioElement, onProgress }) => {
  const followerRef = useRef(null)
  const progressRef = useRef(0)
  const lastStateRef = useRef({ dimension: null, playing: null })

  useEffect(() => {
    lastStateRef.current = { dimension: null, playing: null }
    progressRef.current = 0
  }, [buffers?.count])

  useFrame(({ clock }, delta) => {
    if (!followerRef.current || !pointsGeometry) return
    const geometry = pointsGeometry

    const positions = geometry.getAttribute('position')
    let progressValue = progressRef.current

    if (audioElement && audioElement.duration > 0.01) {
      progressValue = audioElement.currentTime / audioElement.duration
      progressValue = Math.min(Math.max(progressValue, 0), 0.999999)
      progressRef.current = progressValue
    } else if (following) {
      progressValue = (progressValue + delta * 0.6) % 1
      progressRef.current = progressValue
    } else {
      progressValue = Math.min(Math.max(progressValue, 0), 0.999999)
      progressRef.current = progressValue
    }

    const count = buffers.count
    const rawIndex = progressRef.current * count
    const index = Math.min(count - 1, Math.max(0, Math.floor(rawIndex)))
    const idx = index * 3
    followerRef.current.position.set(
      positions.array[idx],
      positions.array[idx + 1],
      positions.array[idx + 2]
    )

    const intensity = Math.max(
      0.1,
      buffers.magnitudes[index] / (buffers.maxMagnitude || 1)
    )
    followerRef.current.material.opacity = 0.35 + intensity * 0.55
    followerRef.current.scale.setScalar(0.45 + intensity * 0.8)

    if (onProgress) {
      const playing = audioElement ? !audioElement.paused : following
      const dimension = Math.max(1, index + 1)
      const lastState = lastStateRef.current
      if (lastState.dimension !== dimension || lastState.playing !== playing) {
        lastStateRef.current = { dimension, playing }
        onProgress({
          dimension,
          progress: progressRef.current,
          playing
        })
      }
    }
  })

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#fefefe',
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }),
    []
  )

  return (
    <group>
      <mesh ref={followerRef}>
        <sphereGeometry args={[0.22, 32, 32]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  )
}

const PulsingCore = ({ active }) => {
  const meshRef = useRef(null)
  const materialRef = useRef(null)

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return
    const t = clock.elapsedTime
    const pulse = 0.5 + (Math.sin(t * 1.4) + 1) * 0.25
    const scale = 0.9 + pulse * 0.08 + (active ? 0.05 : 0)
    meshRef.current.scale.setScalar(scale)
    materialRef.current.emissiveIntensity = 0.25 + pulse * 0.5 + (active ? 0.2 : 0)
    materialRef.current.opacity = 0.7 + pulse * 0.2
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1.0, 64, 64]} />
      <meshStandardMaterial
        ref={materialRef}
        color="#0f172a"
        emissive="#00ffc6"
        emissiveIntensity={0.4}
        transparent
        opacity={0.85}
        metalness={0.25}
        roughness={0.28}
      />
    </mesh>
  )
}

const SummaryLegend = ({ comparison, isFollowing, onToggleFollow, audioReady, audioElement }) => {
  if (!comparison?.stats) {
    return null
  }

  const glimpse = comparison.topDeltas?.slice(0, 4) || []
  const paletteSummary = comparison.previewCount

  return (
    <div className="absolute inset-x-0 top-0 px-6 pt-4 z-10">
      <div className="bg-dark/80 border border-border/40 rounded-b-3xl px-6 py-3 text-xs text-text-secondary backdrop-blur-md shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-sm font-semibold text-text-primary uppercase tracking-wide">
              Feature Delta Network
            </div>
            <div className="text-[11px] text-text-secondary/70">
              {paletteSummary} sampled dimensions • color clusters highlight dominant shifts
            </div>
          </div>
          <button
            onClick={onToggleFollow}
            disabled={!audioReady}
            className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition ${
              !audioReady
                ? 'bg-card/40 text-text-secondary/50 cursor-not-allowed'
                : isFollowing
                ? 'bg-primary/20 text-primary'
                : 'bg-card/60 text-text-secondary hover:bg-primary/10 hover:text-primary'
            }`}
          >
            {!audioReady ? 'Loading audio…' : isFollowing ? 'Pause Voice' : 'Play Voice'}
          </button>
        </div>

        {audioReady && audioElement && (
          <div className="mt-2 text-[11px] text-text-secondary/70">
            Voice length {audioElement.duration ? audioElement.duration.toFixed(1) : '–'}s • auto-follow keeps the tracer locked to playback.
          </div>
        )}

      </div>
    </div>
  )
}

const BottomInsights = ({ comparison }) => {
  const glimpse = comparison?.topDeltas?.slice(0, 4) || []

  if (!glimpse.length) {
    return null
  }

  return (
    <div className="absolute inset-x-0 bottom-0 px-6 pb-4 z-10 pointer-events-none">
      <div className="bg-dark/70 border border-border/40 rounded-t-3xl px-6 py-3 text-xs text-text-secondary backdrop-blur-md shadow-lg">
        <div className="text-[11px] uppercase tracking-wide text-text-secondary/70 mb-2 pointer-events-auto">
          Leading Vector Shifts
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {glimpse.map((delta) => (
            <div
              key={delta.index}
              className="flex flex-col gap-1 bg-card/40 border border-border/40 rounded-xl px-3 py-2 pointer-events-auto"
            >
              <span className="text-text-secondary/80 text-[11px]">
                {delta.label || `#${delta.index}`}
              </span>
              <span className="text-primary font-semibold text-sm">{delta.delta.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const BiometricIslands = ({ comparison, audioBlob, onPlaybackProgress }) => {
  const buffers = useMemo(() => buildPointBuffers(comparison), [comparison])
  const [isFollowing, setIsFollowing] = useState(true)
  const [pointsGeometry, setPointsGeometry] = useState(null)
  const [audioElement, setAudioElement] = useState(null)
  const [audioReady, setAudioReady] = useState(false)
  const ensureAudioPlays = useCallback(() => {
    if (!audioReady || !audioElement) {
      return
    }
    if (audioElement.paused) {
      audioElement.play().catch(() => {})
    }
  }, [audioReady, audioElement])
  const audioUrlRef = useRef(null)
  const handleProgress = useCallback(
    (payload) => {
      if (onPlaybackProgress) {
        onPlaybackProgress(payload)
      }
    },
    [onPlaybackProgress]
  )

  useEffect(() => {
    if (!audioBlob) {
      setAudioElement(null)
      setAudioReady(false)
      if (onPlaybackProgress) {
        onPlaybackProgress({ dimension: null, progress: 0, playing: false })
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
        audioUrlRef.current = null
      }
      return
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
    }

    const url = URL.createObjectURL(audioBlob)
    audioUrlRef.current = url
    const audio = new Audio(url)
    audio.preload = 'auto'
    const handleLoadedMetadata = () => {
      setAudioReady(true)
      if (onPlaybackProgress) {
        onPlaybackProgress({
          dimension: buffers?.count ? 1 : null,
          progress: 0,
          playing: false
        })
      }
    }
    const handleEnded = () => {
      setIsFollowing(false)
      if (onPlaybackProgress) {
        onPlaybackProgress({
          dimension: buffers?.count ? Math.max(1, buffers.count) : null,
          progress: 1,
          playing: false
        })
      }
    }
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)
    setAudioElement(audio)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      audio.pause()
      audio.src = ''
      setAudioReady(false)
      setAudioElement(null)
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
        audioUrlRef.current = null
      }
    }
  }, [audioBlob, onPlaybackProgress, buffers])

  useEffect(() => {
    if (!audioElement) return
    if (isFollowing) {
      audioElement.currentTime = 0
      audioElement.play().catch(() => {
        setIsFollowing(false)
      })
    } else {
      audioElement.pause()
    }
  }, [isFollowing, audioElement])

  if (!buffers) {
    return (
      <div className="card-soft rounded-3xl p-6 border border-border/30 text-center text-text-secondary">
        Not enough biometric comparison data to display the visualization.
      </div>
    )
  }

  return (
    <div className="relative h-[540px] md:h-[620px] lg:h-[680px] w-full card-soft rounded-3xl border border-border/30 overflow-hidden">
      <Canvas
        camera={{ position: [0, 5.8, 11.5], fov: 40 }}
        onPointerDown={() => {
          if (!audioReady) return
          if (!isFollowing) {
            setIsFollowing(true)
          }
          ensureAudioPlays()
        }}
      >
        <color attach="background" args={['#04050a']} />
        <ambientLight intensity={0.4} />
        <pointLight position={[8, 7, 8]} intensity={1.3} color="#ffe6b5" />
        <pointLight position={[-9, -5, -7]} intensity={0.8} color="#5cc9ff" />
        <spotLight position={[0, 10, 0]} angle={0.4} intensity={0.45} color="#9c6cff" />
        <group>
          <PulsingCore active={isFollowing && audioReady} />
          <IslandsPoints
            comparison={comparison}
            buffers={buffers}
            onGeometryReady={(geometry) => {
              setPointsGeometry(geometry)
            }}
          />
          <Connections buffers={buffers} pointsGeometry={pointsGeometry} />
          <PathFollower
            buffers={buffers}
            following={isFollowing && audioReady}
            pointsGeometry={pointsGeometry}
            audioElement={audioElement}
            onProgress={handleProgress}
          />
        </group>
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.45} />
      </Canvas>
      <SummaryLegend
        comparison={comparison}
        isFollowing={isFollowing}
        onToggleFollow={() => {
          if (!audioReady) return
          setIsFollowing(prev => {
            const next = !prev
            if (next) {
              ensureAudioPlays()
            } else if (audioElement) {
              audioElement.pause()
            }
            return next
          })
        }}
        audioReady={audioReady}
        audioElement={audioElement}
      />
      <BottomInsights comparison={comparison} />
      <div className="absolute bottom-4 right-4 bg-dark/80 border border-border/40 rounded-xl px-3 py-1.5 text-[11px] text-text-secondary backdrop-blur-md">
        Path {isFollowing && audioReady ? 'syncing' : 'idle'} · {comparison.previewCount} / {comparison.dimension} dims
      </div>
    </div>
  )
}

export default BiometricIslands

