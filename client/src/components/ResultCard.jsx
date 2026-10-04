import { useMemo, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import BiometricIslands from './BiometricIslands'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  Cell,
  ReferenceArea,
  ReferenceLine
} from 'recharts'

const FEATURE_GROUPS = [
  {
    id: 'spectral',
    title: 'Spectral Features',
    description: 'Frequency-domain descriptors that capture the tonal fingerprint of the voice.',
    items: [
      { key: 'spectral_mfccs', label: 'MFCCs (abs mean)' },
      { key: 'spectral_centroid', label: 'Spectral Centroid' },
      { key: 'spectral_bandwidth', label: 'Spectral Bandwidth' },
      { key: 'spectral_contrast', label: 'Spectral Contrast' },
      { key: 'spectral_flatness', label: 'Spectral Flatness' },
      { key: 'spectral_rolloff', label: 'Spectral Roll-off' },
      { key: 'spectral_flux', label: 'Spectral Flux' },
      { key: 'spectral_entropy', label: 'Spectral Entropy' },
      { key: 'spectral_chroma', label: 'Chroma Features' },
      { key: 'spectral_tonnetz', label: 'Tonnetz Features' }
    ]
  },
  {
    id: 'temporal',
    title: 'Temporal Features',
    description: 'Energy dynamics and micro-variations across time windows.',
    items: [
      { key: 'temporal_short_term_energy', label: 'Short-Term Energy' },
      { key: 'temporal_energy_variance', label: 'Energy Variance' },
      { key: 'temporal_zero_crossing_rate', label: 'Zero Crossing Rate' },
      { key: 'temporal_jitter', label: 'Jitter' },
      { key: 'temporal_shimmer', label: 'Shimmer' },
      { key: 'temporal_hnr', label: 'Harmonics-to-Noise Ratio' },
      { key: 'temporal_voice_breaks', label: 'Voice Breaks' },
      { key: 'temporal_modulation_energy', label: 'Modulation Energy' },
      { key: 'temporal_attack_time', label: 'Attack Time' },
      { key: 'temporal_decay_time', label: 'Decay Time' }
    ]
  },
  {
    id: 'prosodic',
    title: 'Prosodic Features',
    description: 'Pitch, cadence, and expressiveness markers.',
    items: [
      { key: 'prosodic_fundamental_frequency', label: 'Fundamental Frequency (F0)' },
      { key: 'prosodic_pitch_range', label: 'Pitch Range' },
      { key: 'prosodic_speaking_rate', label: 'Speaking Rate' },
      { key: 'prosodic_pause_duration', label: 'Pause Duration' },
      { key: 'prosodic_intonation_variation', label: 'Intonation Variation' },
      { key: 'prosodic_stress_patterns', label: 'Stress Patterns' },
      { key: 'prosodic_syllable_duration_variance', label: 'Syllable Duration Variance' },
      { key: 'prosodic_emotional_dynamics', label: 'Emotional Dynamics' },
      { key: 'prosodic_voice_onset_time', label: 'Voice Onset Time' },
      { key: 'prosodic_loudness_contour', label: 'Loudness Contour' }
    ]
  },
  {
    id: 'phase',
    title: 'Phase & Residual Features',
    description: 'Phase stability indicators that often signal vocoder artefacts.',
    items: [
      { key: 'phase_group_delay', label: 'Group Delay' },
      { key: 'phase_instantaneous_phase', label: 'Instantaneous Phase' },
      { key: 'phase_residual_distortion', label: 'Residual Phase Distortion' },
      { key: 'phase_coherence', label: 'Phase Coherence' },
      { key: 'phase_modulation_spectrum', label: 'Modulation Spectrum Phase' },
      { key: 'phase_cepstral_coefficients', label: 'Cepstral Phase Coefficients' }
    ]
  },
  {
    id: 'artifact',
    title: 'Model / Vocoder Artefact Features',
    description: 'Artefacts typically introduced by speech synthesis or heavy processing.',
    items: [
      { key: 'artifact_reconstruction', label: 'Reconstruction Artefacts' },
      { key: 'artifact_aliasing', label: 'Aliasing Artefacts' },
      { key: 'artifact_vocoder_fingerprint', label: 'Vocoder Fingerprint' },
      { key: 'artifact_noise_floor', label: 'Noise Floor Signature' },
      { key: 'artifact_absence_of_breathing', label: 'Absence of Breathing Sounds' },
      { key: 'artifact_background_consistency', label: 'Background Consistency' },
      { key: 'artifact_sample_rate_mismatch', label: 'Sample Rate Mismatch Patterns' },
      { key: 'artifact_bitrate_signature', label: 'Bitrate / Compression Signatures' },
      { key: 'artifact_glitch_click', label: 'Glitch / Click Artefacts' },
      { key: 'artifact_speech_smoothness', label: 'Speech Smoothness' }
    ]
  },
  {
    id: 'embedding',
    title: 'Deep Embedding Proxies',
    description: 'Statistical projections of neural embeddings for explainability.',
    items: [
      { key: 'embedding_wav2vec2_proxy', label: 'Wav2Vec2 Proxy' },
      { key: 'embedding_hubert_proxy', label: 'HuBERT Proxy' },
      { key: 'embedding_whisper_proxy', label: 'Whisper Proxy' },
      { key: 'embedding_speaker_proxy', label: 'Speaker Embedding Proxy' },
      { key: 'embedding_vggish_proxy', label: 'VGGish Proxy' },
      { key: 'embedding_openl3_proxy', label: 'OpenL3 Proxy' }
    ]
  },
  {
    id: 'statistical',
    title: 'Statistical & Derived Features',
    description: 'Global descriptors derived from the spectral-temporal matrices.',
    items: [
      { key: 'stat_acoustic_moment_mean', label: 'Acoustic Mean' },
      { key: 'stat_acoustic_moment_variance', label: 'Acoustic Variance' },
      { key: 'stat_temporal_derivative_energy', label: 'Temporal Δ Energy' },
      { key: 'stat_entropy_pitch_energy', label: 'Entropy (Pitch & Energy)' },
      { key: 'stat_spectrogram_texture', label: 'Spectrogram Texture' }
    ]
  }
]

const formatValue = (value, precision = 4) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(2)
  }
  if (Math.abs(value) >= 1) {
    return value.toFixed(3)
  }
  return value.toFixed(precision)
}

const ResultCard = ({ result, audioBlob }) => {
  if (!result) return null

  const [showFeatureBundle, setShowFeatureBundle] = useState(false)
  const [playbackDimension, setPlaybackDimension] = useState(null)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)

  const {
    similarity,
    verdict,
    timestamp,
    features,
    syntheticScore,
    finalScore,
    matchScore,
    biometricComparison,
    featureComparison,
    featurePenalty,
    featureDrift,
    riskScore
  } = result
  const similarityPercent = Math.round((similarity || finalScore || matchScore || 0) * 100)

  const handlePlaybackProgress = useCallback(
    ({ dimension, playing }) => {
      setPlaybackDimension(
        Number.isFinite(dimension) && dimension > 0 ? Math.round(dimension) : null
      )
      setIsAudioPlaying(Boolean(playing))
    },
    []
  )

  const verdictCategory = (() => {
    switch (verdict) {
      case 'Authentic':
        return 'success'
      case 'Possible Deepfake':
      case 'Failed':
        return 'error'
      case 'Uncertain':
      case 'Processing':
      case 'Unknown':
        return 'warning'
      default:
        return 'warning'
    }
  })()

  const featureNames = Array.isArray(features?.names) ? features.names : []
  const featureVector = Array.isArray(features?.vector) ? features.vector : null
  const featureSummary = (features && typeof features.summary === 'object') ? features.summary : null
  const referenceFeatureSummary = (features && typeof features.referenceSummary === 'object')
    ? features.referenceSummary
    : null

  const lookupFeatureValue = (key, summary, fallbackVector) => {
    if (summary && Object.prototype.hasOwnProperty.call(summary, key)) {
      return summary[key]
    }
    if (fallbackVector && featureNames.length === fallbackVector.length) {
      const idx = featureNames.indexOf(key)
      if (idx !== -1) {
        return fallbackVector[idx]
      }
    }
    return null
  }

  const groupedFeatureData = useMemo(() => {
    if (!featureSummary && !referenceFeatureSummary && !featureVector) {
      return null
    }

    return FEATURE_GROUPS.map((group) => {
      const rows = group.items.map((item) => {
        const probeValue = lookupFeatureValue(item.key, featureSummary, featureVector)
        const referenceValue = lookupFeatureValue(item.key, referenceFeatureSummary, null)
        const delta = (probeValue != null && referenceValue != null)
          ? probeValue - referenceValue
          : null

        return {
          key: item.key,
          label: item.label,
          probeValue,
          referenceValue,
          delta
        }
      })

      return {
        ...group,
        rows
      }
    })
  }, [featureSummary, referenceFeatureSummary, featureVector, featureNames])

  const chartTooltipStyle = useMemo(
    () => ({
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderRadius: 12,
      border: '1px solid rgba(148, 163, 184, 0.25)',
      color: '#e2e8f0',
      fontSize: 12,
      backdropFilter: 'blur(12px)'
    }),
    []
  )

  const previewData = useMemo(() => {
    if (!biometricComparison?.probePreview?.length) {
      return []
    }

    const limit = Math.min(
      biometricComparison.previewCount || biometricComparison.probePreview.length,
      64
    )

    return Array.from({ length: limit }, (_, idx) => ({
      index: idx + 1,
      probe: Number.isFinite(biometricComparison.probePreview[idx])
        ? Number(biometricComparison.probePreview[idx])
        : null,
      reference: Number.isFinite(biometricComparison.referencePreview?.[idx])
        ? Number(biometricComparison.referencePreview[idx])
        : null,
      delta: Number.isFinite(biometricComparison.differencePreview?.[idx])
        ? Number(biometricComparison.differencePreview[idx])
        : null
    }))
  }, [biometricComparison])

  const highlightedDimension =
    previewData.length && playbackDimension
      ? Math.max(1, Math.min(playbackDimension, previewData.length))
      : null

  const topDeltasData = useMemo(() => {
    if (!featureComparison?.topDeltas?.length) {
      return []
    }

    return featureComparison.topDeltas.slice(0, 8).map((entry) => ({
      name: entry.label || `Dim ${entry.index}`,
      delta: Number.isFinite(entry.delta) ? entry.delta : 0
    }))
  }, [featureComparison])

  const statusGlow = verdictCategory === 'success'
    ? '0 0 20px rgba(0, 255, 136, 0.5)'
    : verdictCategory === 'error'
    ? '0 0 20px rgba(255, 77, 77, 0.5)'
    : '0 0 20px rgba(255, 212, 59, 0.5)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-soft rounded-3xl p-6 md:p-8 shadow-soft-lg"
      style={{ boxShadow: statusGlow }}
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-2xl font-heading font-semibold text-text-primary">
          Verification Result
        </h3>
        <div className={`px-4 py-2 rounded-2xl text-sm font-semibold backdrop-blur-sm ${
          verdictCategory === 'success'
            ? 'bg-success/20 text-success border border-success/30'
            : verdictCategory === 'error'
            ? 'bg-error/20 text-error border border-error/30'
            : 'bg-warning/20 text-warning border border-warning/30'
        }`}>
          {verdict}
        </div>
      </div>

      {/* Similarity Score */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-text-secondary">Similarity Score</span>
          <span className={`text-2xl font-heading font-bold ${
            verdictCategory === 'success' ? 'text-success' : verdictCategory === 'error' ? 'text-error' : 'text-warning'
          }`}>
            {similarityPercent}%
          </span>
        </div>
        <div className="w-full bg-border/50 rounded-full h-4 overflow-hidden shadow-inner">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${similarityPercent}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              verdictCategory === 'success'
                ? 'bg-gradient-to-r from-primary via-accent to-success'
                : verdictCategory === 'error'
                ? 'bg-gradient-to-r from-warning to-error'
                : 'bg-warning'
            } shadow-lg`}
          />
        </div>
      </div>

      {/* Additional Scores (from API) */}
      {(syntheticScore !== undefined || finalScore !== undefined || matchScore !== undefined) && (
        <div className="mb-5 p-5 bg-dark/60 rounded-2xl border border-border/30">
          <h4 className="text-sm font-semibold text-text-primary mb-3">Analysis Scores</h4>
          <div className="grid grid-cols-2 gap-3 text-xs text-text-secondary">
            {matchScore !== undefined && (
              <div>
                <span className="text-primary">Match Score:</span> {(matchScore * 100).toFixed(1)}%
              </div>
            )}
            {syntheticScore !== undefined && (
              <div>
                <span className="text-primary">Synthetic Risk:</span> {(syntheticScore * 100).toFixed(1)}%
              </div>
            )}
            {finalScore !== undefined && (
              <div>
                <span className="text-primary">Final Score:</span> {(finalScore * 100).toFixed(1)}%
              </div>
            )}
          </div>
        </div>
      )}

      {biometricComparison?.stats && (
        <div className="mb-5 p-5 bg-dark/60 rounded-2xl border border-border/30">
          <h4 className="text-sm font-semibold text-text-primary mb-3">Embedding Delta (visual preview)</h4>
          <div className="grid grid-cols-2 gap-3 text-xs text-text-secondary">
            <div>
              <span className="text-primary">L2 Distance:</span>{' '}
              {biometricComparison.stats.l2Distance.toFixed(3)}
            </div>
            <div>
              <span className="text-primary">Mean Δ:</span>{' '}
              {biometricComparison.stats.meanDiff.toFixed(4)}
            </div>
            <div>
              <span className="text-primary">Mean |Δ|:</span>{' '}
              {biometricComparison.stats.meanAbsDiff.toFixed(4)}
            </div>
            <div>
              <span className="text-primary">Max |Δ|:</span>{' '}
              {biometricComparison.stats.maxAbsDiff.toFixed(4)}
            </div>
          </div>
          {!!biometricComparison.topDeltas?.length && (
            <div className="mt-3 text-[11px] text-text-secondary/80">
              <div className="uppercase tracking-wide text-text-secondary/60 mb-1">
                Leading Shifts
              </div>
              <div className="grid grid-cols-2 gap-1">
                {biometricComparison.topDeltas.slice(0, 4).map((delta) => (
                  <div key={delta.index} className="flex items-center justify-between">
                    <span>{delta.label || `Dim ${delta.index}`}</span>
                    <span className="text-primary font-semibold">
                      {delta.delta.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {featureComparison?.stats && (
        <div className="mb-5 p-5 bg-dark/60 rounded-2xl border border-border/30">
          <h4 className="text-sm font-semibold text-text-primary mb-3">57-D Feature Vector Delta</h4>
          <div className="grid grid-cols-2 gap-3 text-xs text-text-secondary">
            <div>
              <span className="text-primary">Mean |Δ|:</span>{' '}
              {featureComparison.stats.meanAbsDiff.toFixed(4)}
            </div>
            <div>
              <span className="text-primary">L2 Distance:</span>{' '}
              {featureComparison.stats.l2Distance.toFixed(3)}
            </div>
            <div>
              <span className="text-primary">Max |Δ|:</span>{' '}
              {featureComparison.stats.maxAbsDiff.toFixed(4)}
            </div>
            <div>
              <span className="text-primary">Mean Δ:</span>{' '}
              {featureComparison.stats.meanDiff.toFixed(4)}
            </div>
            {featureDrift?.meanAbsDiff != null && (
              <div className="col-span-2">
                <span className="text-primary">Mean Drift:</span>{' '}
                {formatValue(featureDrift.meanAbsDiff)}
                {featureDrift.maxAbsDiff != null && (
                  <span className="text-text-secondary/70">
                    {' '}| Peak |Δ| {formatValue(featureDrift.maxAbsDiff)}
                  </span>
                )}
              </div>
            )}
            {featurePenalty != null && featurePenalty > 0 && (
              <div className="col-span-2 text-primary font-semibold">
                Score penalty applied: {(featurePenalty * 100).toFixed(1)}% subtracted from final score
              </div>
            )}
          </div>
          {!!featureComparison.topDeltas?.length && (
            <div className="mt-3 text-[11px] text-text-secondary/80">
              <div className="uppercase tracking-wide text-text-secondary/60 mb-1">
                Most shifted dimensions
              </div>
              <div className="grid grid-cols-2 gap-1">
                {featureComparison.topDeltas.slice(0, 6).map((delta) => (
                  <div key={delta.index} className="flex items-center justify-between">
                    <span>{delta.label || `Dim ${delta.index}`}</span>
                    <span className="text-primary font-semibold">{delta.delta.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {biometricComparison && (
        <div className="mb-5">
          <h4 className="text-sm font-semibold text-text-primary mb-3">Feature Delta Network</h4>
          <BiometricIslands
            comparison={biometricComparison}
            audioBlob={audioBlob}
            onPlaybackProgress={handlePlaybackProgress}
          />
        </div>
      )}

      {previewData.length > 0 && (
        <div className="mb-5 p-5 bg-dark/60 rounded-2xl border border-border/30">
          <div className="flex items-center justify-between mb-3 gap-3">
            <h4 className="text-sm font-semibold text-text-primary">
              Embedding Preview (first 64 dimensions)
            </h4>
            <div className="text-[11px] text-text-secondary/70">
              {highlightedDimension
                ? `${isAudioPlaying ? 'Syncing' : 'Paused'} • Dim ${highlightedDimension}/${previewData.length}`
                : 'Awaiting playback'}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={previewData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                <XAxis
                  dataKey="index"
                  stroke="#94a3b8"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(148, 163, 184, 0.2)' }}
                />
                <YAxis
                  stroke="#94a3b8"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(148, 163, 184, 0.2)' }}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value, name) => [
                    Number.isFinite(value) ? Number(value).toFixed(3) : '—',
                    name
                  ]}
                  labelFormatter={(label) => `Dimension ${label}`}
                />
                <Legend wrapperStyle={{ paddingTop: 8 }} />
                {highlightedDimension && (
                  <>
                    <ReferenceArea
                      x1={1}
                      x2={highlightedDimension}
                      fill="rgba(56, 189, 248, 0.08)"
                      strokeOpacity={0}
                    />
                    <ReferenceLine
                      x={highlightedDimension}
                      stroke="#38bdf8"
                      strokeDasharray="4 4"
                      strokeWidth={1.25}
                    />
                  </>
                )}
                <Line
                  type="monotone"
                  dataKey="reference"
                  name="Reference"
                  stroke="#38bdf8"
                  strokeWidth={isAudioPlaying ? 2.6 : 2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="probe"
                  name="Probe"
                  stroke="#c084fc"
                  strokeWidth={isAudioPlaying ? 2.6 : 2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="delta"
                  name="Δ (Probe - Ref)"
                  stroke="#f97316"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 4"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-[11px] text-text-secondary/70">
            Visual comparison of embedding magnitudes between your current sample and the stored voiceprint.
          </p>
        </div>
      )}

      {topDeltasData.length > 0 && (
        <div className="mb-5 p-5 bg-dark/60 rounded-2xl border border-border/30">
          <h4 className="text-sm font-semibold text-text-primary mb-3">Top Feature Shifts</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topDeltasData}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                <XAxis
                  type="number"
                  stroke="#94a3b8"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(148, 163, 184, 0.2)' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  stroke="#94a3b8"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(148, 163, 184, 0.2)' }}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value) => [
                    Number.isFinite(value) ? Number(value).toFixed(3) : '—',
                    'Δ'
                  ]}
                />
                <Bar dataKey="delta" radius={[12, 12, 12, 12]}>
                  {topDeltasData.map((entry, idx) => (
                    <Cell
                      key={`cell-${entry.name}-${idx}`}
                      fill={entry.delta < 0 ? '#f97316' : '#34d399'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-[11px] text-text-secondary/70">
            Highlights the most-shifted feature dimensions between probe and reference signatures.
          </p>
        </div>
      )}

      {groupedFeatureData && (
        <div className="mb-5">
          <button
            type="button"
            onClick={() => setShowFeatureBundle((prev) => !prev)}
            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold rounded-2xl border transition ${
              showFeatureBundle
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-card/60 border-border/40 text-text-primary hover:border-primary/40 hover:bg-primary/5'
            }`}
          >
            <span>Extracted Feature Bundle (57)</span>
            <span className="text-xs text-text-secondary">
              {showFeatureBundle ? 'Hide details' : 'Show details'}
            </span>
          </button>

          {showFeatureBundle && (
            <div className="mt-4 p-5 bg-dark/60 rounded-2xl border border-border/30">
              <div className="text-[11px] text-text-secondary/70 mb-4">
                Values shown in backend ordering · Δ = probe − reference
              </div>
              <div className="space-y-4">
                {groupedFeatureData.map((group) => (
                  <details key={group.id} className="bg-card/40 rounded-2xl border border-border/30 overflow-hidden">
                    <summary className="cursor-pointer select-none px-4 py-3 text-xs font-semibold text-text-primary/90 flex items-center justify-between">
                      <span>{group.title}</span>
                      <span className="text-text-secondary/60 text-[11px]">{group.description}</span>
                    </summary>
                    <div className="overflow-x-auto px-4 pb-4">
                      <table className="min-w-full text-[11px] text-text-secondary/90">
                        <thead className="text-text-secondary/60 uppercase tracking-wide">
                          <tr>
                            <th className="text-left py-2 pr-3 font-semibold">Feature</th>
                            <th className="text-left py-2 pr-3 font-semibold">Probe</th>
                            <th className="text-left py-2 pr-3 font-semibold">Reference</th>
                            <th className="text-left py-2 font-semibold">Δ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                          {group.rows.map((row) => (
                            <tr key={row.key}>
                              <td className="py-2 pr-3 text-text-primary/90">{row.label}</td>
                              <td className="py-2 pr-3">{formatValue(row.probeValue)}</td>
                              <td className="py-2 pr-3">{formatValue(row.referenceValue)}</td>
                              <td
                                className={`py-2 font-semibold ${
                                  row.delta != null
                                    ? row.delta >= 0
                                      ? 'text-primary'
                                      : 'text-warning'
                                    : 'text-text-secondary/60'
                                }`}
                              >
                                {row.delta != null ? formatValue(row.delta) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timestamp */}
      {timestamp && (
        <div className="text-xs text-text-secondary">
          Verified: {new Date(timestamp).toLocaleString()}
        </div>
      )}

      {/* Verdict Message */}
      <div className={`mt-6 p-4 rounded-2xl backdrop-blur-sm ${
        verdictCategory === 'success'
          ? 'bg-success/10 border border-success/30'
          : verdictCategory === 'error'
          ? 'bg-error/10 border border-error/30'
          : 'bg-warning/10 border border-warning/30'
      }`}>
        <p className={`text-sm font-medium ${
          verdictCategory === 'success' ? 'text-success' : verdictCategory === 'error' ? 'text-error' : 'text-warning'
        }`}>
          {verdict === 'Authentic'
            ? '✓ Voice signature matches. This appears to be authentic.'
            : verdict === 'Possible Deepfake'
            ? '⚠ Voice signature does not match. Possible deepfake or impersonation detected.'
            : verdict === 'Failed'
            ? '⚠ Verification failed. Please review the logs or try recording again.'
            : '? Voice signature shows uncertainty. Please record again for better accuracy.'}
        </p>
      </div>
    </motion.div>
  )
}

export default ResultCard

