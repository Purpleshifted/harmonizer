# 미연결 Worklet 설계 (FaceEnsemble, NodeArpeggiator, WaveRevolver, instruments)

목표: FaceEnsemble(오케스트라 샘플러), NodeArpeggiator(FM 벨), WaveRevolver(루프 플레이어)와 instruments 3종을 Worklet으로 이전할 때의 **데이터 흐름·메시지 규약·구현 단계**를 정리한다.

---

## 1. 공통 원칙

| 구분 | 메인 스레드 | 오디오 스레드 (Worklet) |
|------|-------------|--------------------------|
| **역할** | 버퍼 로딩, 노트/트리거 스케줄링, Transport·시간 변환, 보이스 할당 | 샘플 단위 연산, 버퍼 읽기, 신스/이펙트 DSP |
| **데이터 전달** | `port.postMessage()` — 버퍼 전달, noteOn/noteOff, start/stop | `process()` 내에서만 상태 변경; 파라미터는 `AudioParam` 또는 메시지로 수신 |
| **시간** | `Tone.now()`, `time` (Transport) → context time으로 변환 후 메시지에 실어 보냄 | `currentTime` 없음; 메시지에 `startTime`(초) 넣어서 “이 시점부터 재생” 식으로 처리 |

- **버퍼:** 메인에서 `decodeAudioData` / Tone으로 로드한 뒤 `postMessage(..., [buffer.getChannelData(0).buffer, ...])` 로 transfer 가능. Worklet 쪽에서는 메시지로 받은 ArrayBuffer로 다시 읽거나, 지원 환경이면 AudioBuffer를 그대로 전달.
- **노트 이벤트:** `AudioParam`만으로는 “지금 노트 온, 주파수 F, velocity V” 같은 이벤트를 표현하기 어렵기 때문에 **메시지 포트**로 보내고, Worklet은 큐에 쌓아 두었다가 `process()` 안에서 현재 프레임 시간과 비교해 재생/엔벨로프 처리.

---

## 2. FaceEnsemble + sampler-processor (instruments)

### 2.1 현재 구조

- **OrchestralVoice x8:** 각 보이스가 `strings`(createOrchestraEnsemble: contrabass+cello 레이어) + `horns`(french-horn) 두 개의 Tone.Sampler를 쓰고, Fader → Panner → dest.
- **InstrumentFactory:** 버퍼 캐시에 미리 로드, `loadInstrument(name)`, `createOrchestraEnsemble(types, volumes)` 로 Sampler 생성.
- **이벤트:** `noteOn(cmd, swellTime)` → 한 보이스에 `strings.triggerAttack(cmd.note)`, `horns.triggerAttack(octave, vel)`; `noteOff(voice, time, fadeTime)` → fader 감쇠 후 `releaseAll()`.

### 2.2 Worklet화 옵션

**옵션 A — 풀 샘플러 Worklet (무거움)**  
- **sampler-processor.js:** 한 프로세서가 “여러 버퍼(노트별)” + “다중 보이스” 재생.
- 메인: 버퍼 캐시에서 contrabass/cello/french-horn 버퍼만 골라서 `postMessage({ type: 'setBuffers', map: { 'C2': ArrayBuffer, ... } })` 로 전달. (실제로는 note name → buffer 참조.)
- 메인: 보이스별로 **노트 온** 시 `postMessage({ type: 'noteOn', voiceId, note, velocity, startTime })`, **노트 오프** 시 `postMessage({ type: 'noteOff', voiceId, time })`.
- Worklet: 보이스별 재생 위치·엔벨로프 상태 유지, `process()` 에서 버퍼에서 읽어서 합산 후 출력.  
- **난이도:** 높음. 버퍼 포맷(채널 수, 샘플레이트), 보이스 수(8), 악기 레이어(strings 2 + horns 1) 조합, swell/fade 타이밍까지 맞추려면 설계가 복잡.

**옵션 B — 톤만 Worklet (가벼움)**  
- 오케스트라 재생은 **Tone.Sampler 그대로** 두고, 8보이스 합산 후 **마스터 쪽만** Worklet 하나 통과 (예: face-ensemble-processor 에서 스테레오 폭·가벼운 사튜 또는 리미터).
- 메인: `masterFader` 뒤에 `FaceEnsembleMasterWorklet` 연결. Worklet은 입력을 그대로 통과하거나 약한 DSP만 적용.
- **난이도:** 낮음. 기존 FaceEnsemble 구조를 거의 유지.

**권장:** 단기에는 **옵션 B**. 풀 샘플러(옵션 A)는 “instruments/sampler-processor 공통 엔진”으로 설계해 두고, 나중에 한 악기(예: horns만)부터 Worklet으로 옮기는 식으로 단계적 이전.

### 2.3 옵션 A 시 메시지 규약 (참고)

```text
Main → Worklet:
  { type: 'setBuffers', instrument: 'strings'|'horns', map: { noteName: ArrayBuffer } }  // 또는 SharedArrayBuffer
  { type: 'noteOn',  voiceId: number, note: string, velocity: number, startTime: number }
  { type: 'noteOff', voiceId: number, releaseTime: number }
  { type: 'setGain', voiceId: number, gain: number }  // swell/fade

Worklet 내부:
  voices[voiceId]: { note, readOffset, envelopePhase, buffer, channelData }
  process(): 각 보이스에서 readOffset 진행, envelope 곱, 스테레오 합산 후 출력
```

---

## 3. NodeArpeggiator + fm-bell-processor (instruments)

### 3.1 현재 구조

- **Tone.PolySynth(Tone.FMSynth, BELL_SYNTH_CONFIG)** → Panner → main + spatial.
- **BELL_SYNTH_CONFIG:** harmonicity 3.01, modulationIndex 12, sine carrier, square modulator, ADSR 등.
- **이벤트:** `trigger(note, velocity, position, time)` → 주파수로 변환, `triggerAttackRelease(note, "4n", time, velocity)`.

### 3.2 Worklet화

- **fm-bell-processor.js:** FM 신스만 담당. **버퍼 없음**, `process()` 안에서 샘플 생성.
- **수식:** `out = sin(2*pi*fc*t + modulationIndex * sin(2*pi*fm*t)) * envelope(t)`, `fm = fc * harmonicity`.
- **입력:** 신호 입력 없음. 출력만 생성하므로 **AudioWorkletNode 출력 채널만 사용**, 입력은 0으로 두거나 비워 둠.

### 3.3 메인 ↔ Worklet 연동

- **노트 스케줄:** 메인에서 `trigger(note, velocity, position, time)` 호출 시  
  - `time`을 context time(초)으로 변환 (`Tone.now()` 기준 또는 `Transport` → context).  
  - duration `"4n"` 을 초로 변환.
  - `port.postMessage({ type: 'noteOn', frequency, velocity, startTime, duration })`.
- Worklet: 메시지 큐에서 `noteOn` 을 꺼내서 **보이스 슬롯**에 넣음 (최대 6). 각 보이스: phaseCarrier, phaseMod, envelope state (attack/decay/sustain/release), frequency, velocity.
- **process():**  
  - 현재 블록의 시작 샘플 인덱스로 “현재 시간” 추정 (첫 process 호출 시 기준 시간 저장, 이후 `frameCount += 128` 등으로 누적).  
  - 각 보이스에 대해 envelope가 0이 아니면 FM 샘플 생성, 합산 후 출력.
- **Panner:** Worklet 뒤에 기존 Panner 유지 (메인에 그대로 두고, NodeArpeggiator는 `synth → worklet → panner` 로만 바꾸면 됨).

### 3.4 파라미터

- **AudioParam:** `sampleRate` (k-rate, 초기화 시 한 번)  
- **메시지:** noteOn만 메시지로. frequency는 note name → Hz 는 메인에서 계산해 전달.

### 3.5 구현 시 유의

- Worklet에는 `currentTime` 이 없으므로, “블록 번호” 또는 메인에서 넘긴 `startTime`(초)과 “블록 길이·샘플레이트”로 샘플 인덱스를 역산해 envelope/phase를 진행해야 함.
- Tone의 `triggerAttackRelease(time, duration)` 과 동일한 타이밍을 맞추려면, 메인에서 `time`(Transport time)을 **AudioContext.currentTime** 기준으로 변환한 값을 `startTime` 으로 보내야 함.

---

## 4. WaveRevolver + loop-player-processor (instruments)

### 4.1 현재 구조

- **Tone.Player** (한 개 WAV, loop, fadeIn/Out) → **Tone.Filter** (lowpass 800, Q 0.5) → **Gain** (pulseGain) → **Panner** → main + wave.
- **이벤트:** `update(intensity, filterFreq, position, time)` 에서 gain·filter 주파수 갱신; 재생은 `player.start()` 한 번.

### 4.2 Worklet화 옵션

**옵션 A — 루프 재생까지 Worklet**  
- **loop-player-processor.js:**  
  - 메인: `decodeAudioData` 또는 Tone으로 버퍼 로드 후 `postMessage({ type: 'buffer', buffer })` 로 전달.  
  - 메시지: `{ type: 'start' }`, `{ type: 'stop' }` 또는 `playing` (0/1) 파라미터.  
  - process(): 내부 readIndex를 프레임마다 증가, 버퍼 끝이면 0으로 루프. 한 프레임(128 샘플) 읽고, lowpass + gain 적용 후 출력.
- **장점:** 재생·필터·gain 이 모두 오디오 스레드.  
- **단점:** 버퍼 전달·루프 인덱스·스테레오 처리 구현 필요.

**옵션 B — 재생은 Tone.Player, 필터·gain 만 Worklet**  
- 기존 **FilterWorklet** + **Gain** 그대로 사용: `Player → FilterWorklet → Gain → Panner`.  
- **장점:** 구현 거의 없음.  
- **단점:** 재생 자체는 여전히 메인 쪽 Tone.

**권장:** 단기에는 **옵션 B** 로 연동만 완료. 옵션 A는 `instruments/loop-player-processor.js` 설계로 남겨 두고, 나중에 버퍼 전달·루프 로직 구현.

### 4.3 옵션 A 시 메시지 규약 (참고)

```text
Main → Worklet:
  { type: 'buffer', buffer: AudioBuffer | or channel ArrayBuffers }
  { type: 'start' }
  { type: 'stop' }
  { type: 'setGain', value: number }
  { type: 'setFilterFreq', value: number }

Worklet:
  readIndex (float for interpolation), loop length, one-pole state, gain/filterFreq from params or messages.
```

---

## 5. 파일·연결 정리

| 대상 | Worklet 파일 | 엔진 래퍼 (engine/) | 퍼포머 연동 |
|------|--------------|----------------------|-------------|
| **FaceEnsemble** | 옵션 B: `face-ensemble-processor.js` (패스스루 또는 마스터 톤) | `FaceEnsembleMasterWorklet` (선택) | masterFader 뒤에 삽입. 옵션 A는 나중에 instruments/sampler-processor + 래퍼. |
| **NodeArpeggiator** | `instruments/fm-bell-processor.js` | `FMBellWorklet` | PolySynth 대신 FMBellWorklet 1개, 출력 → 기존 Panner. trigger 시 메시지로 noteOn. |
| **WaveRevolver** | 옵션 B: 기존 `effects/filter-processor` + Gain | (기존 FilterWorklet) | Player → FilterWorklet → Gain → Panner. 옵션 A는 `instruments/loop-player-processor.js` + `LoopPlayerWorklet`. |
| **instruments** | sampler / fm-bell / loop-player | SamplerWorklet, FMBellWorklet, LoopPlayerWorklet | 위와 같이 퍼포머별로 단계적으로 연결. |

---

## 6. 구현 순서 제안

1. **Phase 1 — 즉시 가능 (옵션 B 위주)**  
   - **WaveRevolver:** Player → FilterWorklet(input) → output → 기존 Gain → Panner. (FilterWorklet 이미 있음.)  
   - **FaceEnsemble:** 마스터 톤만 넣고 싶으면 face-ensemble-processor.js 를 패스스루 또는 가벼운 톤 보정으로 구현 후 masterFader 뒤에 연결. 없으면 스킵.

2. **Phase 2 — FM 벨**  
   - **fm-bell-processor.js** 구현: FM 연산 + 6보이스 envelope, 메시지로 noteOn (frequency, velocity, startTime, duration).  
   - **FMBellWorklet** 래퍼: addModule, createNode, port.onmessage 설정, trigger(freq, vel, position, time) 시 context time으로 변환해 postMessage.  
   - **NodeArpeggiator:** PolySynth 제거, FMBellWorklet → Panner 로 교체.

3. **Phase 3 — 루프 플레이어 (옵션 A)**  
   - **loop-player-processor.js:** 버퍼 수신, readIndex 루프, one-pole lowpass + gain. start/stop 메시지.  
   - **LoopPlayerWorklet** 래퍼: 버퍼 로드 후 전달, start/stop 호출 시 메시지.  
   - **WaveRevolver:** Player 제거, LoopPlayerWorklet → Panner.

4. **Phase 4 — 샘플러 (옵션 A)**  
   - **sampler-processor.js:** setBuffers, noteOn/noteOff 메시지, 다중 보이스·다중 버퍼 재생.  
   - **SamplerWorklet** 래퍼: InstrumentFactory 버퍼를 note 맵으로 전달, triggerAttack/releaseAll 시 메시지.  
   - **FaceEnsemble:** 한 악기(예: horns)부터 SamplerWorklet으로 교체, 이후 strings 등 확장.

---

## 7. 요약

- **메인:** 버퍼·노트 이벤트·시작 시간을 **메시지**로 보내고, **Transport/time → context time** 변환은 메인에서만 수행.  
- **Worklet:** `process()` 에서만 샘플 연산; 노트/재생 제어는 메시지 큐를 두고 블록 단위로 처리.  
- **우선 적용:** WaveRevolver는 FilterWorklet으로 체인만 정리(Phase 1). NodeArpeggiator는 FM 벨 Worklet(Phase 2)으로 완성. FaceEnsemble·풀 샘플러/루프는 Phase 3–4에서 단계적으로.

이 설계를 기준으로 `WORKLET_MAPPING.md` 의 “미연결” 항목을 Phase별로 정리해 두면 구현 시 참고하기 좋다.
