# Arpeggiator & Note Picker – 구현 상태 (스케치 대비)

스케치 네 개(ArpLogic, EdgeLogic, NotePickerLogic, Threshold)를 기준으로 현재 코드와의 차이를 정리한 문서입니다.

---

## 1. ArpLogicSketch.png

**요약:** Mode Switch → Note Catcher + Mode Logic Presets → Pattern Generator; Note Catcher → Sound Presets; Pattern Generator + Sound Presets → Arp Engine → audio out.

| 스케치 구성요소 | 현재 구현 | 비고 |
|----------------|-----------|------|
| **Mode Switch** | `useSpatialDetection`의 `mode` (node/edge/face) | 동일 개념. 단일 스위치 UI는 없음. |
| **Note Catcher** | `useSpatialDetection` 전체 (근처 노드/엣지/면 감지) | “모드에 따라 근처 음 감지”에 해당. |
| **Mode Logic Presets** | 없음 | 모드별 tempo, 등장빈도 등 preset 미구현. |
| **Pattern Generator** | `ArpeggiatorPlayer` 내부 `generateMainPattern` / `generateSparklePattern` | 스케치처럼 Note Catcher + Preset → Pattern 분리 구조는 아님. |
| **Sound Presets** | 없음 | Node/Edge/Face별 사운드 preset 미구현. |
| **Arp Engine** | Edge만: `ArpeggiatorPlayer` (Tone.Sequence + Synth). Node: `NodeFocusPad`. Face: `ChordPlayer` | 통합 “Arp Engine” 1개가 아니라 모드별 플레이어 분리. |
| **audio out** | 각 플레이어 → 리버브/리미터 → destination | 구현됨. |

**갭:** Mode Logic Presets, Sound Presets, 통합 Arp Engine(단일 워크릿/엔진) 미구현.

---

## 2. NotePickerLogicSketch.png

**요약:** Note Picker = Which Line {l1,l2} + Nearest Dot {d} + Which Hex {h1..h6}. 조건·throttle/debounce 규칙 → Edge Arp / Node Arp 입력.

| 스케치 구성요소 | 현재 구현 | 비고 |
|----------------|-----------|------|
| **Which Line {l1, l2}** | `activeEdge` (note1, note2 / pos1, pos2) | Is Edge일 때만 의미상 동일. |
| **Nearest Dot {d}** | `activeNodes[0]` (node 모드), 엣지 시 c1 | “Nearest Dot”은 있으나 스케치처럼 별도 이름으로 쓰이지 않음. |
| **Which Hex {h1..h6}** | `nearestNeighbors` (최대 6) | Is Edge일 때 재감지 규칙은 없음. |
| **① Which Line 동작 조건** | Is Edge T, Is Node F일 때만 | useSpatialDetection에서 엣지 판별은 함. throttle/debounce는 **AudioController**에서 모드/구조만 80ms 디바운스 적용. |
| **② Nearest Dot throttle/debounce** | 디바운스는 모드·구조에만 적용 | “Nearest Dot” 단위 throttle/debounce 없음. |
| **③ Which Hex: Is Edge T, Line/Dot 변할 때마다 재감지** | 없음 | Line/Dot 변경 시점에 맞춘 재감지 로직 없음. |
| **Edge Arp 입력** | {l1,l2} → edge 두 노드, {d, h1..h6} → nearestNeighbors | 데이터는 비슷하게 사용. 스케치의 “2” (Edge Arp)에 대응. |
| **Node Arp 입력** | {h1..h6}만 | NodeFocusPad는 단일 노드만 사용. hex 6개를 활용하는 “Node Arp” 패턴은 아님. |

**갭:** Which Line/Nearest Dot/Which Hex에 대한 명시적 throttle·debounce·재감지 규칙, Node Arp용 {h1..h6} 패턴 미구현.

---

## 3. ThresholdSketch.png (1) – Which Triangle / Is Edge / Is Node

**요약:** Which Triangle → Drone, Face Ensemble, Face Synth. Is Edge F → Face only. Is Edge T → Is Node F → Edge ON; Is Node T → Node ON (Node 시 Face 볼륨↓). Is Edge/Is Node용 threshold.

| 스케치 구성요소 | 현재 구현 | 비고 |
|----------------|-----------|------|
| **Which Triangle** | `activeTriangle`, `nearestTriangles` | 출력 {note1, note2, note3}에 해당. |
| **Which Triangle → Drone / Face Ensemble / Face Synth** | Drone: AmbientDrone. Face: ChordPlayer (코드+혼). Face Synth는 동일 플레이어 내 | 개념적으로 대응. |
| **Is Edge F → Face only** | mode === 'face' 시 Face 볼륨 up | 구현됨. |
| **Is Edge T → Is Node F → Edge ON** | mode === 'edge' 시 Edge Arp ON | 구현됨. |
| **Is Node T → Node ON, Face 볼륨↓** | Node 시 NodeFocusPad ON, Face는 volFace 0.25로 감쇠 | “먹먹하게”는 배경만 줄인 수준. |
| **Is Edge / Is Node threshold** | useSpatialDetection: NODE_ENTER/EXIT, EDGE_ENTER/EXIT (거리 히스테리시스) | 스케치의 “threshold 정하도록”에 부합. |

**갭:** “Node ON일 때 Face 볼륨을 더 먹먹하게” 같은 별도 처리 정도만 조정 여지 있음.

---

## 4. ThresholdSketch.png (2) – Control / Motion threshold, Cruising

**요약:** control threshold α(키 누름 시간): t&lt;α → debounce로 모드 확인, t≥α → t=α부터 throttle. motion threshold Δ(이동 거리): d&lt;Δ → debounce로 which triangle, d≥Δ → Is Edge 바뀔 때마다 which Triangle. “Cruising”이면 Is Edge여도 Face 볼륨 안 줄임. 이동속도×t &gt; Δ 되도록 조정.

| 스케치 구성요소 | 현재 구현 | 비고 |
|----------------|-----------|------|
| **control threshold α (key press)** | 없음 | 키 입력/포인터 lock 시간 기반 α, t&lt;α debounce, t≥α throttle 미구현. |
| **motion threshold Δ** | LISTENER_UPDATE에 MOVEMENT_THRESHOLD 0.1 등 | “d≥Δ일 때 Is Edge 바뀔 때마다 which Triangle” 규칙은 없음. |
| **Cruising 시 Face 볼륨 유지** | 없음 | “주행” 판단 및 Is Edge여도 Face 볼륨 안 줄이는 로직 없음. |
| **이동속도×t &gt; Δ 조정** | 없음 | 플레이어 경험용 튜닝 가이드만 있음. |

**갭:** α/Δ 기반 제어, Cruising 판단 및 Face 볼륨 예외 처리 미구현.

---

## 5. 현재 적용한 완료 사항

- **WaveEffectWorklet:** 플레이어 생성 전에 `Tone.start()`를 반드시 호출(두 AudioController 모두). “No AudioContext yet” 경고 제거(초기화 실패 시 재시도만 하도록).
- **모드 전환 시 버퍼링 완화:**  
  - 모드+구조(mode + activeNodes 이름 목록)를 **80ms 디바운스** 후에만 “안정된 detection”으로 반영(ThresholdSketch의 α에 해당하는 시간역할).  
  - playChord, startArpeggio, NodeFocusPad.start, updateActiveHorns 등 **무거운 업데이트는 stable detection 기준**으로만 실행.

---

## 6. 스케치 완전 반영을 위해 필요한 작업 (요약)

1. **ArpLogic:** Mode Logic Presets(모드별 tempo·등장빈도), Sound Presets(노드/엣지/페이스별), 통합 Arp Engine(또는 워크릿) 도입 검토.
2. **NotePicker:** Which Line / Nearest Dot / Which Hex 각각에 throttle·debounce·재감지 규칙 명시; Node Arp를 {h1..h6} 기반 패턴으로 확장.
3. **Threshold (α/Δ):** 키 누름 시간 α, 이동 거리 Δ를 파라미터로 두고, t&lt;α debounce·t≥α throttle, d≥Δ일 때 Is Edge 변경 시 which Triangle 재계산.
4. **Cruising:** “주행” 상태 판별 후, Is Edge여도 Face 볼륨을 줄이지 않는 분기 추가.

이 문서는 `references/ArpLogicSketch.png`, `NotePickerLogicSketch.png`, `ThresholdSketch.png`(및 EdgeLogic 스케치) 내용을 꼼꼼히 읽고 현재 코드와 비교한 결과입니다.
