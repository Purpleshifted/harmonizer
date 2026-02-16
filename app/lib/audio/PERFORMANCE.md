# 오디오 파이프라인 성능 (현재 vs 레거시)

## Max polyphony 이슈 원인

- **원인**: Face 모드에서 `faceKey`가 **매 프레임 바뀌면** `FaceSynth.trigger(notes, time)`가 매 프레임 호출됨.
- 감지/노트 배열이 프레임마다 **순서만 바뀌어도** `["C4,E4,G4"]` vs `["G4,C4,E4"]` 로 키가 달라져 trigger 연타 발생.
- `releaseAll(time)` 직후 같은 `time`에 `triggerAttack` 3번을 반복하면, 이전 음이 release 구간에 있는 동안 새 음이 겹쳐 **polyphony 8 초과** → "Note dropped" 발생.

**수정**: `faceKey`를 **정렬된 노트**로 계산 (`sortNotesByPitch(faceNotes).join(',')`). 같은 3음이면 순서와 무관하게 같은 키 → 실제 chord가 바뀔 때만 trigger.

---

## 최적화 전보다 성능이 떨어진 이유

레거시 대비 **한 번에 올라가는 그래프**와 **매 프레임 일**이 늘어난 점이 주요 원인입니다.

| 항목 | 레거시 | 현재 (Dirigent/ArpeggiatorEngine) |
|------|--------|-----------------------------------|
| **모드별 플레이어** | GlobalPlayer, FacePlayer, EdgePlayer, NodePlayer — 볼륨으로 mute, **필요 시 disconnect** 가능 | Dirigent가 Face/Edge/Node 로직을 한 update() 안에서 모두 호출. **모든 퍼포머가 매 프레임 갱신** |
| **Node 개수** | 플레이어별로 켜짐/꺼짐, 볼륨 0 시에도 그래프는 연결 | **항상** FaceEnsemble(8 voices × strings+horns), BaseDrone(4), ArpeggiatorEngine(node+edge 2+face 1 worklet), NodeSynth, FaceSynth, WaveRevolver **전부 연결** |
| **Face 아르페지오** | FacePlayer 내부 시퀀스 1개 | ArpeggiatorEngine: **Tone.Sequence** + faceSeqCallbackCount/faceCycleComplete 매 틱 처리, **매 프레임** `update(events)` 로 events 배열 교체 |
| **스케줄링** | setInterval/setTimeout (비동기) | **Transport.scheduleOnce** 다수 (FaceEnsemble release, node exit 등) — 콜백 수 증가 |
| **Worklet** | Arp는 레거시에 따라 다름 | **ArpEngineWorklet 4개** (node 1, edge 2, face 1) + **WaveEffectWorklet** 항상 로드 |

즉, “최적화”로 바꾼 구조가 **레거시보다 더 많은 노드를 항상 연결해 두고**, **매 프레임 더 많은 일**을 하게 되어, 전체적으로는 부하가 늘어날 수 있습니다.

### 개선 방향 (추가로 할 수 있는 것)

1. **모드별 lazy connect/disconnect**  
   - Face 모드일 때만 FaceEnsemble/faceArp를 그래프에 연결, 나갈 때 disconnect.
2. **Face 아르페지오**  
   - `faceKeyStable`이 바뀌지 않았으면 `update(events)` 호출 생략 (같은 패턴이면 events 참조만 유지).
3. **Drone/Wave**  
   - 사용하지 않는 구간에는 Drone/Wave 쪽 업데이트 또는 연결을 줄이기.
4. **쓰로틀**  
   - `Orchestrator.update()`를 60fps가 아니라 30fps 등으로 제한해 오디오 관련 업데이트 횟수 감소.

위와 같이 **polyphony는 faceKey 안정화로**, **성능 이슈는 “왜 레거시보다 무거워졌는지”** 위 표와 개선 방향으로 해명할 수 있습니다.
