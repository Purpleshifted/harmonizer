# 연속 이동 시 버퍼링 원인 분석 (3초 이상 WASD 유지)

## 1. 핵심 의심 지점

### A. Web Audio automation 누적 (가장 유력)

**현상**: `rampTo`, `setTargetAtTime` 호출이 매 프레임 반복되면서, 3초 동안 2000개 이상의 automation 이벤트가 쌓임.

| 소스 | 호출 주기 | 3초(180f) 기준 | 비고 |
|------|-----------|----------------|------|
| **updateListener** | distMoved > 0.1마다 | ~6 × 90 = 540 | 6개 rampTo |
| **BaseDrone** (4 voice gain) | 매 프레임 | 4 × 180 = 720 | distance에 따라 gain 계속 변경 |
| **WaveRevolver** (panner) | 매 프레임 | 3 × 180 = 540 | targetPos가 원 운동 |
| **WaveRevolver** (intensity, filter) | 매 프레임 | 2 × 180 = 360 | setTargetAtTime |
| **합계** | | **~2160** | |

Tone.js는 내부적으로 `linearRampToValueAtTime` 등을 사용하고, 이는 Web Audio API 타임라인에 automation 이벤트를 추가한다. 이벤트 수가 많아지면 스케줄 처리 비용이 커져 버퍼링/지연이 생길 수 있다.

---

### B. WaveEffectWorklet의 HRTF Panner

**설정**: `WAVE_SAMPLER_CONFIG.useHRTF: true`

- Wave 파도 효과가 **HRTF Panner**를 사용
- HRTF는 컨볼루션 기반으로 CPU 부담이 큼
- 매 프레임 `updatePannerPosition`으로 position을 갱신 → position 변화 시 HRTF 재계산

`targetPos`가 `waveCycle`에 따라 매 프레임 원 운동을 하므로, HRTF Panner position 업데이트가 매우 빈번하게 일어남.

---

### C. useSpatialDetection

**이동 중**: `distSq > 0.01`일 때만 실행 → 3 units/sec, 60fps 기준 약 2프레임마다 실행

- 25 candidates 순회 및 정렬
- `getNearestTriangles` (6개)
- `getAdjacentNodes` (6개)
- `classifyTriad` 등

이동 중에는 초당 약 30회 실행 → CPU 사용이 적지 않음.

---

### D. InfiniteGridSystem (legacy 사용 시)

- 이동 시 `distanceToSquared < 0.0001`일 때만 스킵 → 거의 매 프레임 실행
- `centerU/centerV`가 바뀔 때: **1681개 인스턴스**에 대해 `setMatrixAt` 호출
- SPACING 12, 3 units/sec일 때, 셀 경계를 넘는 주기 ≈ 4초

셀 경계를 넘을 때마다 1681개 인스턴스 업데이트는 순간적으로 부하가 큼.

---

### E. BaseDrone gain ramp

- `conductDrone`이 매 프레임 호출됨
- 카메라가 움직이면 `nearestFourNotes`와의 거리가 매 프레임 바뀜 → `targetGain` 변경
- `gainDiff > 0.005` 조건으로 죽존(deadzone)을 쓰고 있으나, 이동 중에는 gain이 거의 항상 바뀌어 매 프레임 4개 voice 모두 `gain.rampTo` 호출

---

## 2. 적용한 개선 (Wave HRTF 제외)

1. **Orchestrator** `MOVEMENT_THRESHOLD` 0.1 → 0.25 — 리스너 업데이트 빈도 감소
2. **Dirigent** wave/drone 업데이트 100ms 간격 쓰로틀 — conductWave, conductDrone 10회/초로 제한
3. **BaseDrone** gain deadzone 0.005 → 0.02 — 작은 gain 변화 시 ramp 스킵
4. **useSpatialDetection** `MOVEMENT_THRESHOLD_SQ` 0.01 → 0.04 — 감지 실행 빈도 감소
5. **SpatialAudio** `updatePannerPosition` threshold 0.05 → 0.08 — 패너 업데이트 스킵 증가

## 3. 남은 개선 제안 (최후의 수단 제외)

1. **automation 호출 주기 제한 (추가 쓰로틀)**  
   - `updateListener`, `conductDrone`, `conductWave` 등에서 **이동 변화량/시간 기준**으로 업데이트 주기 제한  
   - 예: 50–100ms 간격으로만 automation 갱신

3. **Wave panner position 업데이트 쓰로틀**  
   - `targetPos`를 매 프레임이 아니라 일정 시간(예: 100–200ms)마다 갱신

---

## 4. 요약

- **원인 후보 1**: Web Audio automation 이벤트 과다 누적 (~2000개/3초)
- **원인 후보 2**: WaveEffectWorklet의 HRTF Panner + 매 프레임 position 업데이트
- **원인 후보 3**: BaseDrone gain ramp가 이동 중 거의 매 프레임 호출

가장 영향이 클 가능성이 높은 부분은 **Wave HRTF**와 **automation 호출 빈도**이다.
