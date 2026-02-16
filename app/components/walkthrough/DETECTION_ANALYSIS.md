# 모드/위치 감지 & 쓰로틀링 분석

## 1. 감지 흐름

### useSpatialDetection (`shared/hooks/useSpatialDetection.ts`)
- **역할**: 카메라 위치 기준으로 node/edge/face 모드와 activeNodes 계산
- **호출 주기**: `useFrame` → 매 프레임 실행
- **쓰로틀링**: ❌ 없음 — 25 candidates, sort, getNearestTriangles, classifyTriad, getAdjacentNodes 등 매 프레임 실행
- **콜백**: `onDetectionUpdate`는 mode/activeNodeNames 변경 시에만 호출 (구조 변경 시에만 React 업데이트)

### InfiniteGridSystem (legacy)
- **역할**: 그리드 시각화 + detectionRef를 Audio에 동기화
- **쓰로틀링**: ✅ `playerPos.distanceToSquared(lastCameraPos) < 0.0001` 이면 useFrame 조기 리턴
- **주의**: 내부 `useSpatialDetection`은 별도 useFrame으로 매 프레임 실행

### ModeLogic (`lib/audio/composer/ModeLogic.ts`)
- **역할**: 오디오 모드 전환 debounce
- **쓰로틀링**: ✅ `DEBOUNCE_MS = 250` — 모드 변경 확인 전 250ms 대기

### AudioController
- **역할**: Orchestrator.update(detection, camera, delta) 호출
- **쓰로틀링**: 없음 (의도적 — 오디오는 매 프레임 업데이트 필요)

## 2. 발견 사항

| 파일 | 쓰로틀링 | 상태 |
|------|----------|------|
| useSpatialDetection | 없음 | 개선 필요 |
| InfiniteGridSystem useFrame | distanceSq < 0.0001 | 적절 |
| ModeLogic | 250ms debounce | 적절 |
| AudioController | 없음 | 의도적 (유지) |
| GridDots, ActiveHighlight 등 | 없음 | 시각적 업데이트용 (유지) |

## 3. 권장 사항

- **useSpatialDetection**: 카메라 이동이 미미할 때(예: distanceSq < threshold) detection 로직 스킵
- **InfiniteGridSystem**: detection.isStructureChanged 미설정 — useSpatialDetection에서 전달 시 설정 필요
