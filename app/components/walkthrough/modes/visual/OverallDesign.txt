1. 내가 파도치는 terrain 위를 explore 하는 느낌이 났으면 좋겠어, 파도가 울렁거리면 내 높이도 영향받도록, 떠다니는 배의 입장에서 보듯이. 
    - https://codepen.io/supah/pen/oVweab
    - https://codepen.io/sabosugi/pen/XJdvYPg
+) leva hud 로는 파도의 진폭과 주기 및 디폴트 눈높이를 조절할 수 있도록

2. 전체 그리드(노드, 엣지 포함)를 파도치도록 만들고 싶어. 1번에서 말한 파도치는 terrain 위에 이들이 그려진 셈으로. 
    - 노드 (shpere) 레퍼런스: 
        https://codepen.io/sabosugi/pen/emzpagK
    - 엣지 (선분) 레퍼런스: 
        https://codepen.io/osalinasv/pen/Epjaxp
+) 그리드의 엣지 및 노드는 일정 범위 이상 벗어나면 수직 방향 trail effect + bloom 을 받아서 눈높이쯤에 수평선이 가장 빛났으면 좋겠어. 너무 가까이부터 bloom 을 시작하면 시각적으로 과하니까. 
+) 엣지 선분과 노드 스피어 둘 다 오퍼시티 80 정도의 흰색이지만, bloom 색상은 현재 속한 삼각형의 major/minor 여부에 따라서 색온도가 부드럽게 전환되었으면 좋겠어. (major: 난색, minor: 한색)
+) leva hud 로 조절 가능해야 하는 사항은 아래와 같아:
    - 현재 상태 "set as default" 기능, 페이지 다시 열어도 그 저장된 값을 default 상태로 reload 가능하도록. 
    - major, minor 에서 각각 엣지 bloom 의 색상 및 bloom 강도 + 엣지의 종류(엣지 선분은 그냥 선으로도, 파티클로 된 점선으로도, 혹은 수직으로 세워져서 위아래가 faded out 된 면으로도 구현해보고 싶어. 그 선택지도 hud 에 있어야 해-dropdown 형식으로 선택 가능하도록)
    - major, minor 에서 각각 노드 bloom 의 색상 및 bloom 강도 + 노드 sphere 의 radius 
    - bloom 이 시작되는 반경 및 overall 강도: edge, node 각각 따로따로 있어야 해. 얼마나 멀리부터 bloom 이 시작되는지. 
    - trail effect 이 시작되는 반경 및 overall 강도: edge, node 각각 따로

3. 배경에 star 있었으면 좋겠어. 우주 배경. 지금 torus 에서 쓰고 있는 거 그대로 가져오면 될 듯? 

4. 내가 explore 하면서 돌아다닐 때 속도감이 들도록 공중에 부유하는 빛나는 먼지가 필요해. 가만히 있지 않고 brownian 처럼 자연스럽게 움직여야 하고, 사이즈 jitter 있어서 인위적이지 않아야 해. 시야 너무 중앙에 있는 것들은 안 보이게 하거나 스폰 위치를 조절해서 방해가 안 되도록 해야하는데 이건 더 리소스가 적게 드는 방향으로 해줘. 이 먼지들도 major, minor 따라 bloom의 색온도가 달라져야 해. 또 평균 속도 등의 움직임 관련 파라미터들도 추후에 조절하고 싶으니 연결 가능한 방향으로 당장은 구현해줘(하고 싶은 것: attractor 등)
+) leva hud 로 조절할 것: major, minor bloom 색상 / intensity, 각각 따로. 움직임 중에서 평균속도 정도는 지금 조절할 수 있도록 해도 괜찮을지도? 
+) 비주얼 레퍼런스: https://codepen.io/wheresdara/pen/wvXBpwa

5. node 에 있으면 node sphere, edge 에 있으면 해당 선분과 선분 양 끝의 sphere, face 에 있으면 해당 면, 이루는 선분, 꼭짓점에 있는 구들 전부 다 bloom 혹은 glow 하도록 만들고 싶어. 일단 당장은 방금 서술한 로직에서 spheres 만 빛나는 걸로 해보자. selective bloom 이 여기에 적합할지 검토해줘. 그리고 이 bloom 역시 색온도가 major/minor 에 영향 받아야 해. face 일 때는 색온도를 가지고, edge / node 에서는 부드럽게 neutral 로 돌아오도록. 

6. 당장 구현하진 말고, 시도해보고 싶은 것들. 
- 해당되는 edge 에 줄 이펙트: https://codepen.io/atzedent/pen/oggKrGW 활용 가능한지. (edge 포함한 수직면에 이 이펙트가 그려져서 오로라처럼 보이도록)
- global terrain 에 이 구면의 effect 입혀서 파도가 조금 더 유기적으로 보이게 할 수 있는지, periodic motion 이라는 측면에서 검토: https://codepen.io/sabosugi/pen/jErWrMe

-----
위 요구사항을 비주얼 모드의 implementation plan 으로 잡도록 해. 그 과정에서 referenceLinks.txt 에 있는 자료들을 충분히 활용 및 검토해보고. 
현재 있는 파일들의 역할 역시 다 재검토 및 규정해서 위의 구현 계획에 맞게 활용하려면 어떤 방식으로 refector 해야할지 숙려 및 검토해. 