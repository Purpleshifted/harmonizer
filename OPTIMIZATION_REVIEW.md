# 프로젝트 최적화 검토 (Optimization Review)

효율적인 리소스 활용을 위한 최적화 여지 분석.

---

## 1. 오디오 파이프라인 (이미 문서화됨)

`app/lib/audio/PERFORMANCE.md`, `BUFFERING_ANALYSIS.md`에 상세 분석이 있음.

### 적용된 최적화
- `faceKey` 안정화 (정렬된 노트로 polyphony 초과 방지)
- Orchestrator `MOVEMENT_THRESHOLD` 0.25
- Dirigent wave/drone 100ms 쓰로틀
- BaseDrone gain deadzone 0.02
- useSpatialDetection `MOVEMENT_THRESHOLD_SQ` 0.04
- SpatialAudio panner threshold 0.08

### 남은 개선 제안
1. **모드별 lazy connect/disconnect** — Face/Edge/Node 모드일 때만 해당 퍼포머 연결
2. **Face 아르페지오** — `faceKeyStable` 동일 시 `update(events)` 스킵
3. **Wave HRTF** — `useHRTF: false` 또는 position 업데이트 쓰로틀
4. **Orchestrator.update() 쓰로틀** — 60fps → 30fps로 제한 검토

---

## 2. 번들 / 로딩 최적화

### 2.1 라우트별 코드 스플리팅 ✅
- `/tonnetz/surface`, `/tonnetz/torus` → `dynamic(..., { ssr: false })` 사용
- `/tonnetz/walkthrough/visual`, `/tonnetz/walkthrough/unified` → 라우트별 청크로 분리 (Next.js 기본)

### 2.2 Walkthrough 모드별 로딩
| 모드 | Tone.js | Orchestrator | Leva |
|------|---------|--------------|------|
| Visual | ✗ | ✗ | ✓ (WaveSystem, GridDots Leva) |
| Unified | ✓ | ✓ | ✓ |

Visual 모드는 오디오 코드를 로드하지 않음 → 경량 유지.

### 2.3 개선 제안
- **UnifiedWalkthrough**: `preloadInstruments()`, `preloadReverbs()`, `preloadWaveBuffer()`를 "Click to Enter" 이후에 호출 (현재도 `handleEnter` 이후 호출 중 ✅)
- **선택적 Leva**: Visual 모드에서 오디오 관련 Leva 패널 미로드 → `AudioController`가 Unified에서만 마운트되므로 이미 분리됨 ✅

---

## 3. Three.js / 렌더링

### 3.1 GridDots (Terrain Grid)
- `TOTAL_NODES = (VIEW_RADIUS*2+1)²` → 201² = **40,401 포인트**
- `useMemo`로 position 버퍼 고정 ✅
- `useFrame`에서 `uPlayerPos`, `uGridOffset` 등만 업데이트 ✅

### 3.2 InstancedMesh (TonnetzGrid)
- 24×12 = 288 노드에 InstancedMesh 사용 ✅

### 3.3 개선 제안
1. **LOD (Level of Detail)** — 카메라 거리에 따라 GridDots 포인트 크기/해상도 감소 (저사양 기기 대응)
2. **Frustum culling** — PointsMaterial의 `sizeAttenuation` 활용 중일 수 있으나, `VIEW_RADIUS` 100으로 고정이면 먼 구역도 항상 그려짐. 필요 시 거리별 샘플링 검토
3. **Stars (TonnetzTorus)** — `count={5000}` 고정. 필요 시 `count`를 화면 크기/성능에 따라 조절

---

## 4. 샘플 / 메모리

### 4.1 InstrumentFactory
- `bufferCache`로 중복 로드 방지 ✅
- `preloadInstruments()`에서 모든 샘플을 한 번에 로드

### 4.2 WaveBufferCache
- OfflineAudioContext로 디코딩 (메인 스레드 블로킹 감소) ✅
- `preloadWaveBuffer()` 단일 호출로 캐시

### 4.3 개선 제안
1. **Lazy instrument loading** — Face 모드에서만 strings/horns 등 필요한 악기 샘플 로드. 복잡도 대비 이득이 적을 수 있음
2. **샘플 품질 선택** — 저사양 모드에서 샘플 레이트/비트 감소 옵션

---

## 5. React / 훅 최적화

### 5.1 useSpatialDetection
- `distSq > 0.04`일 때만 실행 (쓰로틀) ✅
- 25 candidates 순회 + 정렬 — 이동 중 초당 ~30회. 추가 쓰로틀 여지 있음 (예: 50ms 간격)

### 5.2 useFrame (AudioController)
- 매 프레임 `orchestratorRef.current.update(...)` 호출
- Orchestrator 내부에서 `distMoved > 0.25` 등으로 리스너 업데이트는 이미 제한됨
- Dirigent 내 `conductWave`, `conductDrone` 100ms 쓰로틀 ✅

### 5.3 개선 제안
1. **useFrame 콜백 최적화** — `detectionRef.current`가 null이면 early return (이미 적용됨 ✅)
2. **Leva 폴더 접기** — 기본값으로 일부 폴더 collapsed하여 초기 렌더 비용 감소

---

## 6. 워크릿 (Audio Worklet)

### 6.1 ArpEngineWorklet
- Node 1, Edge 2, Face 1 = **4개 worklet** 인스턴스
- `ArpeggiatorEngine`에서 통합 관리

### 6.2 WaveEffectWorklet
- HRTF Panner 사용 시 CPU 부담 큼 (BUFFERING_ANALYSIS 참고)
- `WAVE_SAMPLER_CONFIG.useHRTF` → `false`로 전환 시 성능 개선 가능

---

## 7. 우선순위 요약

| 우선순위 | 항목 | 예상 효과 | 구현 난이도 |
|----------|------|-----------|-------------|
| 높음 | Wave HRTF 끄기 또는 position 쓰로틀 | 버퍼링/지연 감소 | 낮음 |
| 높음 | 모드별 lazy connect (Face/Edge/Node) | 오디오 그래프 부하 감소 | 중간 |
| 중간 | Face 아르페지오 `update(events)` 스킵 | CPU 절감 | 낮음 |
| 중간 | useSpatialDetection 추가 쓰로틀 (50ms) | CPU 절감 | 낮음 |
| 낮음 | GridDots LOD / Stars count 조절 | 렌더 비용 감소 | 중간 |
| 낮음 | Orchestrator 30fps 쓰로틀 | 오디오 업데이트 부하 감소 | 낮음 |

---

## 8. 모니터링 제안

- `performance.mark` / `performance.measure`로 `Orchestrator.update`, `runSpatialDetection` 등 핵심 구간 프로파일링
- Chrome DevTools Performance 탭에서 Long Task 식별
- Lighthouse/WebPageTest로 초기 로드 시간 및 LCP 추적
