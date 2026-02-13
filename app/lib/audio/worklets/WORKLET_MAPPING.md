# Worklet ↔ Performer 매핑

전체 Worklet 개편 시 **어느 퍼포머가 어떤 프로세서를 쓰는지** 정리.  
“조금씩 떼어 온” 프로세서는 개편 시 해당 퍼포머용 Worklet 파일에 **합쳐서** 넣을 것.

---

## 이사 완료 현황 (현재 구조 기준)

| 구분 | 상태 | 설명 |
|------|------|------|
| **BaseDrone** | ✅ 이사 완료 | `HarmonicSaturator` → `LimiterWorklet`. `base-drone-processor.js` (사튜) + `effects/limiter-processor.js`. |
| **FaceSynth** | ✅ 이사 완료 | `StereoWidthWorklet` → `face-synth-processor.js` (스테레오 폭). |
| **FaceArpeggiator** | ✅ 이사 완료 | `FilterWorklet` + `DelayWorklet` → `effects/filter-processor.js`, `effects/delay-processor.js`. |
| **EdgeArpeggiator** | ✅ 이사 완료 | `FilterWorklet` → `DelayWorklet` → `LimiterWorklet` (effects 전부 사용). |
| **NodeSynth** | ✅ 이사 완료 | `NodeSynthWobbleWorklet` → `performer/node-synth-processor.js` (LFO+lowpass 웨이블). |
| **WaveRevolver** | ✅ 이사 완료 | Player → **FilterWorklet** → Gain → Panner. `effects/filter-processor.js`. |
| **NodeArpeggiator** | ✅ 이사 완료 | **FMBellWorklet** → Panner. `instruments/fm-bell-processor.js` + `engine/FMBellWorklet.ts`. |
| **FaceEnsemble** | ⏳ 스텁만 | `face-ensemble-processor.js` 파일만 있음, Tone.Sampler 그대로 사용. |
| **effects/** | ✅ 구현·연결 | `delay-processor`, `filter-processor`, `limiter-processor` 구현됨. 래퍼: `DelayWorklet`, `FilterWorklet`, `LimiterWorklet` (engine/). |
| **instruments/** | ✅ fm-bell 연결 | `fm-bell-processor` 구현·연결. `sampler-processor`, `loop-player-processor` 는 스텁만. |

**정리:** 이사 완료 — **BaseDrone, FaceSynth, FaceArpeggiator, EdgeArpeggiator, NodeSynth, WaveRevolver, NodeArpeggiator**. 미연결: FaceEnsemble, instruments 중 sampler/loop-player.

→ 미연결 구간의 **데이터 흐름·메시지 규약·구현 단계**는 **`WORKLET_DESIGN.md`** 참고.

---

## 1. 퍼포머별 리뷰 — 체인 요약 & 동원 프로세서

### BaseDrone (`performer/BaseDrone.js`)

| 항목 | 내용 |
|------|------|
| **시그널 체인** | DroneVoice x4 (Osc → Panner → Gain) → **masterGain** → **HarmonicSaturator** → **Limiter** → main + ambient |
| **소스** | `DRONE_OSC_CONFIG` (sine, drive, mix, limiterThreshold) |
| **동원할 프로세서** | **Saturator** (이미 Worklet), **Limiter** (선택), 또는 **드론 보이스 전체** (오실 4 + 합산 + 사튜 + 리미터) |
| **목표 Worklet 파일** | `worklets/performer/base-drone-processor.js` |
| **비고** | saturator-processor.js → 여기로 합침. 드론 전체를 한 Worklet으로 옮기면 오실·합산·사튜·리미터를 process() 안에서 처리 가능. |

---

### FaceSynth (`performer/FaceSynth.js`)

| 항목 | 내용 |
|------|------|
| **시그널 체인** | PolySynth (FACE_SYNTH_CONFIG) → **Filter** (lowpass 1500) → **Gain** → **StereoWidthWorklet** → main; Gain → spatial |
| **소스** | `FACE_SYNTH_CONFIG` (fatsawtooth x3, envelope, volume) |
| **동원할 프로세서** | **Stereo width** (이미 Worklet), **Lowpass filter** (선택), 또는 **패드 신스 전체** (오실+엔벨+필터+스테레오폭) |
| **목표 Worklet 파일** | `worklets/performer/face-synth-processor.js` |
| **비고** | stereo-width-processor.js → 여기로 합침. 전체 옮기면 PolySynth 대체용 단일 프로세서. |

---

### FaceEnsemble (`performer/FaceEnsemble.js`)

| 항목 | 내용 |
|------|------|
| **시그널 체인** | OrchestralVoice x8: **(strings + horns)** → **Fader** → **Panner** → masterFader → main; Panner → spatial. strings/horns = Tone.Sampler (InstrumentFactory) |
| **소스** | `ORCHESTRA_CONFIG` (strings: contrabass/cello, horns: french-horn), `InstrumentFactory` |
| **동원할 프로세서** | **샘플 재생** (worklets/instruments: strings/horns 버퍼 재생), **Fader** (gain ramp — 선택, 단순 Gain으로 대체 가능), **스테레오 폭/가벼운 사튜** (마스터 톤 — 선택) |
| **목표 Worklet 파일** | `worklets/performer/face-ensemble-processor.js` (마스터 톤 보정만 할 경우), 또는 instruments 쪽 **sampler-processor** 공유 |
| **비고** | DSP보다 Sampler 로딩·보이스 할당이 핵심. Worklet화는 instruments/ 샘플 재생 엔진을 쓰는 방향이 자연스러움. |

---

### FaceArpeggiator (`performer/FaceArpeggiator.js`)

| 항목 | 내용 |
|------|------|
| **시그널 체인** | PolySynth (ASTRAL_ARP_CONFIG: sine) → **Filter** (highpass 600) → **FeedbackDelay** (4n., 0.4 fb, 0.5 wet) → **Gain** → main + deep |
| **소스** | `ASTRAL_ARP_CONFIG` (oscillator, volume, filter) |
| **동원할 프로세서** | **FeedbackDelay** (딜레이 타임·피드백·웻), **Highpass filter** (선택), 또는 **아스트랄 아프 전체** (신스+필터+딜레이) |
| **목표 Worklet 파일** | `worklets/performer/face-arpeggiator-processor.js` |
| **비고** | createDelay() = Tone.FeedbackDelay. 딜레이를 Worklet으로 옮기면 오디오 스레드에서 안정적. 범용 delay-processor를 effects/에 두고 재사용 가능. |

---

### EdgeArpeggiator (`performer/EdgeArpeggiator.js`)

| 항목 | 내용 |
|------|------|
| **시그널 체인** | IndependentVoice x7 (Synth → Panner → Gain → masterGain) → **Filter** (highpass 600) → **FeedbackDelay** (8n., 0.25 fb, 0.3 wet) → **Limiter** (-6) → main + spatial |
| **소스** | `ARP_SYNTH_CONFIG` (sine, envelope, volume) |
| **동원할 프로세서** | **FeedbackDelay**, **Highpass filter**, **Limiter** (선택), 또는 **엣지 아프 공통 체인** (filter → delay → limiter) |
| **목표 Worklet 파일** | `worklets/performer/edge-arpeggiator-processor.js` |
| **비고** | FaceArpeggiator와 비슷하게 delay·filter를 Worklet으로. 공통이면 worklets/effects/ 에 delay-processor, filter-processor 두고 둘 다 사용. |

---

### NodeArpeggiator (`performer/NodeArpeggiator.js`)

| 항목 | 내용 |
|------|------|
| **시그널 체인** | PolySynth (Tone.FMSynth, BELL_SYNTH_CONFIG) → **Panner** (HRTF) → main + spatial |
| **소스** | `BELL_SYNTH_CONFIG` (harmonicity, modulationIndex, envelope, modulation) |
| **동원할 프로세서** | **FM 벨 신스** (worklets/instruments: FM 오실+엔벨로프), **Panner/HRTF** (선택, 공간감을 Worklet에서 처리할 경우) |
| **목표 Worklet 파일** | `worklets/performer/node-arpeggiator-processor.js` (HRTF만 Worklet일 수 있음), 또는 instruments **fm-bell-processor.js** |
| **비고** | 체인이 단순. Worklet화 이점은 FM 신스 자체를 오디오 스레드로 옮기는 것. |

---

### NodeSynth (`performer/NodeSynth.js`)

| 항목 | 내용 |
|------|------|
| **시그널 체인** | PolySynth (NODE_SYNTH_CONFIG) → **Filter** (lowpass, **LFO** → frequency 300~800) → masterGain; **NoiseSynth** (NOISE_WASH_CONFIG) → masterGain; → main + deep |
| **소스** | `NODE_SYNTH_CONFIG`, `NOISE_WASH_CONFIG` |
| **동원할 프로세서** | **Filter + LFO** (웨이블 필터), **Noise wash** (핑크 노이즈+엔벨로프), 또는 **노드 패드 전체** (패드 신스 + 필터+LFO + 노이즈) |
| **목표 Worklet 파일** | `worklets/performer/node-synth-processor.js` |
| **비고** | LFO로 필터 주파수 변조가 핵심. Worklet에서 LFO+filter 한 블록으로 처리하면 샘플 정확. |

---

### WaveRevolver (`performer/WaveRevolver.js`)

| 항목 | 내용 |
|------|------|
| **시그널 체인** | **Player** (루프 WAV) → **Filter** (lowpass 800, Q 0.5) → **Gain** (pulseGain) → **Panner** → main + wave |
| **소스** | `WAVE_SAMPLER_CONFIG` (path, period, baseVolume, refDistance, useHRTF 등) |
| **동원할 프로세서** | **샘플 재생** (worklets/instruments: 루프 버퍼 재생), **Lowpass filter** (선택), 또는 **웨이브 리볼버 전체** (재생+필터+gain) |
| **목표 Worklet 파일** | `worklets/performer/wave-revolver-processor.js` 또는 instruments **loop-player-processor.js** 공유 |
| **비고** | Player + Filter + Gain을 한 Worklet으로 두면 환경음 전용. 버퍼는 메인에서 전달. |

---

## 2. 이미 구현된 Worklet (부분 구현 → 합침 완료)

| Worklet 스크립트 | 엔진 래퍼 | 소속 퍼포머 | 역할 | 합침 결과 |
|------------------|------------|-------------|------|------------|
| ~~`saturator-processor.js`~~ | `engine/HarmonicSaturator.ts` | **BaseDrone** | 드론 합산 후 사튜레이션 | **합침 완료** → `worklets/performer/base-drone-processor.js`. 래퍼는 해당 경로/프로세서명 사용 중. |
| ~~`stereo-width-processor.js`~~ | `engine/StereoWidthWorklet.ts` | **FaceSynth** | 패드 메인 체인 스테레오 폭 | **합침 완료** → `worklets/performer/face-synth-processor.js`. 래퍼는 해당 경로/프로세서명 사용 중. |

(구 파일 `saturator-processor.js`, `stereo-width-processor.js` 는 삭제됨.)

---

## 3. 퍼포머별 목표 프로세서 정리 (한눈에)

| 퍼포머 | 목표 Worklet 파일 | 동원할 프로세서 (정리) |
|--------|-------------------|------------------------|
| BaseDrone | `performer/base-drone-processor.js` | Saturator (있음), Limiter(선택), 또는 드론 전체(오실+합산+사튜+리미터) |
| FaceSynth | `performer/face-synth-processor.js` | Stereo width (있음), Filter(선택), 또는 패드 신스 전체 |
| FaceEnsemble | `performer/face-ensemble-processor.js` 또는 instruments 공유 | 샘플 재생(instruments), Fader/스테레오(선택) |
| FaceArpeggiator | `performer/face-arpeggiator-processor.js` | FeedbackDelay, Filter(선택), 또는 아스트랄 아프 전체 |
| EdgeArpeggiator | `performer/edge-arpeggiator-processor.js` | FeedbackDelay, Filter, Limiter(선택) 또는 filter→delay→limiter 블록 |
| NodeArpeggiator | `performer/node-arpeggiator-processor.js` 또는 instruments | FM 벨 신스(instruments), Panner/HRTF(선택) |
| NodeSynth | `performer/node-synth-processor.js` | Filter+LFO(웨이블), Noise wash, 또는 노드 패드 전체 |
| WaveRevolver | `performer/wave-revolver-processor.js` 또는 instruments | 루프 샘플 재생(instruments), Filter(선택), 또는 재생+필터+gain |

---

## 4. 공통/재사용 프로세서 제안 (worklets/effects 또는 performer 내부)

- **delay-processor.js** — FeedbackDelay (FaceArpeggiator, EdgeArpeggiator 공통)
- **filter-processor.js** — HP/LP 파라미터 (여러 퍼포머에서 공통)
- **limiter-processor.js** — 리미터 (BaseDrone, EdgeArpeggiator)

이들을 `worklets/effects/` 에 두고, 퍼포머별 Worklet 파일에서는 “한 프로세서에 체인 전체”를 넣거나, 위 공통 프로세서를 여러 개 붙이는 방식 선택 가능.

---

## 5. 폴더 구조 목표 (개편 후)

- **`public/worklets/performer/`** — 퍼포머별 DSP (위 표의 목표 Worklet 파일). 기존 saturator / stereo-width 는 BaseDrone, FaceSynth 쪽에 합침.
- **`public/worklets/instruments/`** — 샘플 재생, FM 벨, 패드/노이즈 엔진 등 (sources 설정을 파라미터로 받음).
- **`public/worklets/effects/`** — (선택) delay, filter, limiter 등 공통 효과.

자세한 전환 범위·관례는 `AUDIOWORKLET.md`의 “Performer / Sources 전환 범위와 폴더 구조” 섹션 참고.

---

## 6. 파일 구조 트리

```
public/worklets/
├── performer/
│   ├── README.md
│   ├── base-drone-processor.js     # BaseDrone
│   ├── face-synth-processor.js     # FaceSynth
│   ├── face-ensemble-processor.js  # FaceEnsemble
│   ├── face-arpeggiator-processor.js
│   ├── edge-arpeggiator-processor.js
│   ├── node-arpeggiator-processor.js
│   ├── node-synth-processor.js
│   └── wave-revolver-processor.js
├── instruments/
│   ├── README.md
│   ├── sampler-processor.js        # FaceEnsemble strings/horns
│   ├── fm-bell-processor.js        # NodeArpeggiator (✅ 연결)
│   └── loop-player-processor.js    # WaveRevolver loop
└── effects/
    ├── README.md
    ├── delay-processor.js          # FaceArpeggiator, EdgeArpeggiator
    ├── filter-processor.js         # 공통 HP/LP
    └── limiter-processor.js        # BaseDrone, EdgeArpeggiator
```

- **퍼포머 프로세서**는 `/worklets/performer/<name>.js` 로 로드 (예: `addModule('/worklets/performer/base-drone-processor.js')`).
- **인스트루먼트·이펙트**는 `/worklets/instruments/<name>.js`, `/worklets/effects/<name>.js` 로 로드.
