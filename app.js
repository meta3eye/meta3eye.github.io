(() => {
if (window.__SPIRIT_APP_BOOTED__) return;
window.__SPIRIT_APP_BOOTED__ = true;

const cfg = window.SPIRIT_CONFIG || {};
const client = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);
const state = { user:null, profile:null, assessmentIndex:0, assessmentScore:0, rankTestIndex: 0,
rankTestAnswers: [] };



const assessment = [
  {q:"정보가 거의 없는 두 선택지 중 하나를 골라야 합니다. 어느 쪽을 선택하시겠습니까?", c:["A","B"]},
  {q:"짧은 시간 동안 여러 자극이 나타났습니다. 가장 먼저 눈에 들어온 것을 고르세요.", c:["첫 번째","두 번째","세 번째","네 번째"]},
  {q:"처음 본 장소에서 가장 강하게 느껴지는 인상을 하나 고르세요.", c:["편안함","긴장감","낯섦","무감각"]},
  {q:"답을 오래 생각하지 않고 즉시 하나를 선택하세요.", c:["1","2","3","4"]},
  {q:"마지막 질문입니다. 지금 가장 먼저 떠오르는 선택지를 고르세요.", c:["A","B","C","D"]}
];

function show(id, visible=true){ $(id).classList.toggle("hidden", !visible); }
function msg(t){ $("authMessage").textContent=t||""; }

function xpNeeded(level){ return 100 + (level-1)*40; }

async function loadProfile(){
  const {data:{user}} = await client.auth.getUser();
  state.user=user;
  if(!user){ state.profile=null; show("authPanel",true); show("startPanel",false); show("gamePanel",false); $("authState").textContent="로그인 필요"; return; }
  $("authState").textContent=user.email;
  const {data,error}=await client.from("profiles").select("*").eq("id",user.id).maybeSingle();
  if(error){ msg(error.message); return; }
  state.profile=data;
  show("authPanel",false);
  if(!data){ show("startPanel",true); show("gamePanel",false); }
  else { show("startPanel",false); show("gamePanel",true); render(); }
}

async function signUp(){
  const email=$("email").value.trim(), password=$("password").value;
  if(!email || password.length<6){ msg("이메일과 6자 이상의 비밀번호를 입력하세요."); return; }
  const {error}=await client.auth.signUp({email,password});
  msg(error ? error.message : "가입 요청 완료. 이메일 확인이 필요한 경우 메일함을 확인하세요.");
}
async function signIn(){
  const email=$("email").value.trim(), password=$("password").value;
  const {error}=await client.auth.signInWithPassword({email,password});
  if(error) msg(error.message); else msg("");
}
async function createProfile(level=1, stats=null){
  const s=stats||{perception:1,intuition:1,focus:1,interpretation:1,control:1};
  const {data,error}=await client.rpc("create_player",{
    p_player_name:"PLAYER",
    p_level:level,
    p_perception:s.perception,p_intuition:s.intuition,p_focus:s.focus,
    p_interpretation:s.interpretation,p_control:s.control
  });
  if(error){msg(error.message);return;}
  state.profile=data;
  show("startPanel",false);show("assessmentPanel",false);show("gamePanel",true);render();
}
function render(){
  const p=state.profile;if(!p)return;
  $("rankValue").textContent =
  `${p.rank || "D"}-RANK`;
  $("levelValue").textContent=`LV.${p.level}`;
  $("statusValue").textContent=p.status;


  
  const need=xpNeeded(p.level), pct=Math.min(100,(p.exp/need)*100);
  $("xpFill").style.width=`${pct}%`;
  $("xpText").textContent=`EXP ${p.exp} / ${need}`;

if (p.level_test_available) {

  $("xpText").textContent =
    `EXP ${need} / ${need} · LEVEL TEST AVAILABLE`;

}
  
  const stats=[["감지력",p.perception],["직관력",p.intuition],["집중력",p.focus],["해석력",p.interpretation],["통제력",p.control]];
  $("stats").innerHTML=stats.map(x=>`<div class="stat"><span class="label">${x[0]}</span><b>${x[1]}</b></div>`).join("");
  $("record").innerHTML=[
    ["최고 레벨",`LV.${p.highest_level}`],["연속 훈련",`${p.streak_days}일`],
    ["상태",p.status],["생성일",new Date(p.created_at).toLocaleDateString("ko-KR")]
  ].map(x=>`<div class="record-item"><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");  
  loadQuests();
renderNextUnlock();
renderAwakeningSystem();
renderRankPromotion();
  
}

/* =========================
   AWAKENING SYSTEM
========================= */

const AWAKENING_PATHS = {
  sensory: {
    name: "SENSORY PATH",
    label: "감지형"
  },

  intuitive: {
    name: "INTUITIVE PATH",
    label: "직관형"
  },

  focus: {
    name: "FOCUS PATH",
    label: "집중형"
  },

  interpreter: {
    name: "INTERPRETATION PATH",
    label: "해석형"
  },

  control: {
    name: "CONTROL PATH",
    label: "통제형"
  }
};


const QUEST_AWAKENING_EFFECT = {
  focus_5: {
    focus: 12,
    control: 4
  },

  sense_observation: {
    sensory: 12,
    focus: 3
  },

  intuition_choice: {
    intuitive: 12
  },

  emotion_guess: {
    interpreter: 8,
    intuitive: 5
  },

  life_death: {
    sensory: 10,
    intuitive: 10
  }
};


async function calculateAwakeningPaths() {

  if (!state.user) {
    return {
      sensory: 0,
      intuitive: 0,
      focus: 0,
      interpreter: 0,
      control: 0
    };
  }


  const { data, error } =
    await client
      .from("quest_logs")
      .select("quest_code")
      .eq(
        "user_id",
        state.user.id
      );


  if (error) {

    console.error(
      "Awakening analysis error:",
      error
    );

    return {
      sensory: 0,
      intuitive: 0,
      focus: 0,
      interpreter: 0,
      control: 0
    };
  }


  const paths = {
    sensory: 0,
    intuitive: 0,
    focus: 0,
    interpreter: 0,
    control: 0
  };


  for (const log of data || []) {

    const effect =
      QUEST_AWAKENING_EFFECT[
        log.quest_code
      ];

    if (!effect) {
      continue;
    }


    for (const key in effect) {

      paths[key] +=
        effect[key];

    }

  }


  return paths;

}


function getPrimaryAwakening(
  paths
) {

  const entries =
    Object.entries(paths)
      .sort(
        (a, b) =>
          b[1] - a[1]
      );


  const top =
    entries[0];


  const second =
    entries[1];


  if (!top || top[1] < 30) {

    return {
      type: "UNKNOWN",
      description:
        "아직 충분한 훈련 데이터가 없습니다. 여러 유형의 훈련을 계속하십시오."
    };

  }


  const difference =
    top[1] - second[1];


  if (
    top[1] >= 100 &&
    difference >= 25
  ) {

    return {
      type:
        AWAKENING_PATHS[
          top[0]
        ].name,

      description:
        "특정 성장 경로에서 반복적으로 높은 성장 패턴이 감지되고 있습니다."
    };

  }


  return {
    type:
      AWAKENING_PATHS[
        top[0]
      ].name,

    description:
      "특정 능력 계열에서 성장 가능성이 높게 나타나고 있습니다. 추가 훈련과 검증이 필요합니다."
  };

}


async function renderAwakeningSystem() {

  const paths =
    await calculateAwakeningPaths();


  const analysis =
    getPrimaryAwakening(paths);


  $("primaryTypeValue").textContent =
    analysis.type;


  $("awakeningDescription").textContent =
    analysis.description;


  const total =
    Object.values(paths)
      .reduce(
        (sum, value) =>
          sum + value,
        0
      );


  $("awakeningStatus").textContent =
    total === 0
      ? "DATA REQUIRED"
      : "ANALYZING";


  const maxValue =
    Math.max(
      ...Object.values(paths),
      1
    );


  const sortedPaths =
    Object.entries(paths)
      .sort(
        (a, b) =>
          b[1] - a[1]
      );


  $("potentialPaths").innerHTML =
    sortedPaths
      .map(
        ([key, value]) => {

          const path =
            AWAKENING_PATHS[key];


          const percentage =
            Math.min(
              100,
              Math.round(
                value / maxValue * 100
              )
            );


          return `
            <div class="potential-path">

              <div class="potential-path-name">
                ${path.name}
              </div>

              <div class="potential-path-value">
                ${value}
              </div>

              <div class="potential-bar">
                <div
                  style="
                    width:${percentage}%
                  "
                ></div>
              </div>

            </div>
          `;

        }
      )
      .join("");

}

/* =========================
   NEXT UNLOCK SYSTEM
========================= */

function getNextUnlock(
  rank,
  level
) {

  const currentRank =
    rank || "D";


  const unlocks = {

    D: [
      {
        level: 5,
        title: "훈련 기록 분석",
        description:
          "훈련 기록을 통해 초기 성장 패턴이 분석됩니다."
      },

      {
        level: 10,
        title: "첫 번째 능력 분석",
        description:
          "특정 능력 계열의 성장 가능성이 표시됩니다."
      },

      {
        level: 20,
        title: "잠재 경로 감지",
        description:
          "현재 가장 강하게 성장하고 있는 능력 경로를 확인할 수 있습니다."
      },

      {
        level: 30,
        title: "직관 훈련 해금",
        description:
          "새로운 정답형 훈련이 해금됩니다."
      },

      {
        level: 50,
        title: "AWAKENING ANALYSIS",
        description:
          "주요 성장 경로가 본격적으로 분석됩니다."
      },

      {
        level: 100,
        title: "D-RANK PROMOTION TEST",
        description:
          "C-RANK 진입을 위한 승급 시험에 도전할 수 있습니다."
      }
    ],

    C: [
      {
        level: 10,
        title: "고급 직관 훈련",
        description:
          "제한된 정보에서 선택하는 훈련이 강화됩니다."
      },

      {
        level: 50,
        title: "SPECIALIZATION DETECTION",
        description:
          "특정 능력 계열의 세부 특화 가능성이 분석됩니다."
      },

      {
        level: 100,
        title: "C-RANK PROMOTION TEST",
        description:
          "B-RANK 승급 시험이 준비됩니다."
      }
    ],

    B: [
      {
        level: 30,
        title: "BLIND TEST",
        description:
          "정답을 사전에 알 수 없는 검증형 테스트가 강화됩니다."
      },

      {
        level: 100,
        title: "B-RANK PROMOTION TEST",
        description:
          "A-RANK 진입을 위한 고난도 시험입니다."
      }
    ],

    A: [
      {
        level: 50,
        title: "ADVANCED VERIFICATION",
        description:
          "복수 능력을 동시에 검증하는 고난도 테스트가 열립니다."
      },

      {
        level: 100,
        title: "A-RANK PROMOTION TEST",
        description:
          "최고 랭크 진입 시험에 도전할 수 있습니다."
      }
    ],

    S: [
      {
        level: 100,
        title: "MASTER RECORD",
        description:
          "S-RANK 최종 성장 기록이 완성됩니다."
      }
    ]

  };


  const list =
    unlocks[currentRank] || [];


  const next =
    list.find(
      item =>
        item.level > level
    );


  if (next) {
    return next;
  }


  return {
    level: 100,
    title: "UNKNOWN",
    description:
      "다음 성장 데이터가 아직 분석되지 않았습니다."
  };

}


function renderNextUnlock() {

  const p =
    state.profile;


  if (!p) {
    return;
  }


  const next =
    getNextUnlock(
      p.rank,
      p.level
    );


  $("nextUnlockTitle").textContent =
    `LV.${next.level} · ${next.title}`;


  $("nextUnlockDescription").textContent =
    next.description;

}


/* =========================================================
   CONSCIOUSNESS / BRAIN STATE TRAINING SYSTEM
   ADDITIVE MODULE — EXISTING SPIRIT SYSTEM IS PRESERVED
========================================================= */

const CS_TRAINING_TYPES = {
  beta: {
    name: "BETA",
    label: "집중 · 주의 · 의식 통제",
    stat: "focus",
    defaultExp: 10
  },

  alpha: {
    name: "ALPHA",
    label: "이완된 집중 · 신체 이완 · 주변 인식",
    stat: "relaxation",
    defaultExp: 15
  },

  theta: {
    name: "THETA",
    label: "내부 이미지 · 감각 · 의식 변화 관찰",
    stat: "awareness",
    defaultExp: 20
  },

  deep: {
    name: "DEEP STATE",
    label: "깊은 이완 · 의식 안정 탐색",
    stat: "awareness",
    defaultExp: 25
  }
};


const cs_state = {
  active: false,
  paused: false,

  trainingType: null,
  duration: 0,
  remainingSeconds: 0,

  timer: null,
  preparationTimer: null,

  startedAt: null,
  completedAt: null,

  preparationSeconds: 5
};


/* =========================================================
   SAFE DOM HELPERS
========================================================= */

function cs_element(id) {
  return document.getElementById(id);
}


function cs_show(id, visible = true) {

  const element = cs_element(id);

  if (!element) {
    return;
  }

  element.classList.toggle(
    "hidden",
    !visible
  );

}


function cs_setText(id, value) {

  const element = cs_element(id);

  if (!element) {
    return;
  }

  element.textContent =
    value == null
      ? ""
      : value;

}


/* =========================================================
   TRAINING TYPE INFO
========================================================= */

function cs_getTrainingInfo(type) {

  return CS_TRAINING_TYPES[type]
    || CS_TRAINING_TYPES.beta;

}


/* =========================================================
   TIME FORMAT
========================================================= */

function cs_formatTime(seconds) {

  const safeSeconds =
    Math.max(
      0,
      Number(seconds) || 0
    );

  const minutes =
    Math.floor(
      safeSeconds / 60
    );

  const remain =
    safeSeconds % 60;

  return (
    String(minutes)
      .padStart(2, "0")
    +
    ":"
    +
    String(remain)
      .padStart(2, "0")
  );

}


/* =========================================================
   STOP TIMERS
========================================================= */

function cs_clearTimers() {

  if (cs_state.timer) {

    clearInterval(
      cs_state.timer
    );

    cs_state.timer =
      null;

  }


  if (cs_state.preparationTimer) {

    clearInterval(
      cs_state.preparationTimer
    );

    cs_state.preparationTimer =
      null;

  }

}


/* =========================================================
   OPEN TRAINING
========================================================= */

function cs_openTraining(type) {

  const info =
    cs_getTrainingInfo(type);


  cs_clearTimers();


  cs_state.active =
    false;

  cs_state.paused =
    false;

  cs_state.trainingType =
    type;

  cs_state.duration =
    0;

  cs_state.remainingSeconds =
    0;


  const gamePanel =
    cs_element("gamePanel");

  const trainingPanel =
    cs_element(
      "consciousnessTrainingPanel"
    );


  if (!trainingPanel) {

    console.warn(
      "consciousnessTrainingPanel not found"
    );

    return;

  }


  if (gamePanel) {

    gamePanel.classList.add(
      "hidden"
    );

  }


  trainingPanel.classList.remove(
    "hidden"
  );


  cs_setText(
    "csTrainingTitle",
    info.name
  );


  cs_setText(
    "csTrainingLabel",
    info.label
  );


  cs_setText(
    "csTrainingMessage",
    ""
  );


  cs_setText(
    "csTimer",
    "00:00"
  );


  cs_setText(
    "csPreparationTimer",
    ""
  );


  cs_show(
    "csSetup",
    true
  );

  cs_show(
    "csPreparation",
    false
  );

  cs_show(
    "csRunning",
    false
  );

  cs_show(
    "csResult",
    false
  );


  cs_updateInstructions(
    type
  );

}


/* =========================================================
   INSTRUCTIONS
========================================================= */

function cs_updateInstructions(type) {

  const element =
    cs_element(
      "csInstructions"
    );


  if (!element) {
    return;
  }


  const instructions = {

    beta: `
      <ol>
        <li>자세를 안정시킵니다.</li>
        <li>선택한 대상에 주의를 둡니다.</li>
        <li>생각이 다른 곳으로 이동한 것을 알아차립니다.</li>
        <li>억지로 밀어내지 말고 다시 집중 대상으로 돌아옵니다.</li>
        <li>훈련 종료 후 자신의 집중 상태를 기록합니다.</li>
      </ol>
    `,

    alpha: `
      <ol>
        <li>편안한 자세를 취합니다.</li>
        <li>호흡을 자연스럽게 관찰합니다.</li>
        <li>신체의 긴장된 부분을 알아차립니다.</li>
        <li>호흡과 함께 긴장을 천천히 이완합니다.</li>
        <li>주변 소리와 신체 감각을 억지로 판단하지 않고 관찰합니다.</li>
      </ol>
    `,

    theta: `
      <ol>
        <li>눈을 편안하게 감거나 시선을 안정시킵니다.</li>
        <li>내부에서 자연스럽게 발생하는 이미지와 색상을 관찰합니다.</li>
        <li>특정 장면을 억지로 만들어내지 않습니다.</li>
        <li>떠오르는 형태, 움직임, 느낌을 있는 그대로 기록합니다.</li>
        <li>아무것도 관찰되지 않아도 정상적인 훈련 결과입니다.</li>
      </ol>
    `,

    deep: `
      <ol>
        <li>안전하고 편안한 장소에서 훈련합니다.</li>
        <li>호흡과 신체 감각을 자연스럽게 관찰합니다.</li>
        <li>생각이 나타났다가 사라지는 과정을 판단하지 않고 지켜봅니다.</li>
        <li>졸거나 잠드는 것을 목표로 하지 않습니다.</li>
        <li>깨어 있는 상태에서 깊은 이완과 의식 안정 상태를 탐색합니다.</li>
      </ol>
    `

  };


  element.innerHTML =
    instructions[type]
    ||
    instructions.beta;

}


/* =========================================================
   START BUTTON
========================================================= */

function cs_startTraining() {

  const type =
    cs_state.trainingType;


  if (!type) {

    alert(
      "훈련 유형을 선택하세요."
    );

    return;

  }


  const durationSelect =
    cs_element(
      "csDuration"
    );


  const duration =
    Number(
      durationSelect?.value
    );


  if (
    !duration ||
    duration < 60
  ) {

    alert(
      "훈련 시간을 선택하세요."
    );

    return;

  }


  cs_state.duration =
    duration;

  cs_state.remainingSeconds =
    duration;

  cs_state.preparationSeconds =
    5;


  cs_show(
    "csSetup",
    false
  );

  cs_show(
    "csPreparation",
    true
  );

  cs_show(
    "csRunning",
    false
  );

  cs_show(
    "csResult",
    false
  );


  cs_setText(
    "csTrainingMessage",
    "훈련 준비 중..."
  );


  cs_setText(
    "csPreparationTimer",
    String(
      cs_state.preparationSeconds
    )
  );


  cs_state.preparationTimer =
    setInterval(
      () => {

        cs_state.preparationSeconds--;


        cs_setText(
          "csPreparationTimer",
          cs_state.preparationSeconds > 0
            ? String(
                cs_state.preparationSeconds
              )
            : "START"
        );


        if (
          cs_state.preparationSeconds <= 0
        ) {

          clearInterval(
            cs_state.preparationTimer
          );


          cs_state.preparationTimer =
            null;


          cs_beginTraining();

        }

      },
      1000
    );

}


/* =========================================================
   ACTUAL TRAINING START
========================================================= */

function cs_beginTraining() {

  cs_state.active =
    true;

  cs_state.paused =
    false;

  cs_state.startedAt =
    new Date();


  cs_show(
    "csPreparation",
    false
  );

  cs_show(
    "csRunning",
    true
  );


  cs_setText(
    "csTrainingMessage",
    "TRAINING ACTIVE"
  );


  cs_updateTimer();


  cs_state.timer =
    setInterval(
      () => {

        if (
          !cs_state.active ||
          cs_state.paused
        ) {

          return;

        }


        cs_state.remainingSeconds--;


        cs_updateTimer();


        if (
          cs_state.remainingSeconds <= 0
        ) {

          cs_finishTraining();

        }

      },
      1000
    );

}


/* =========================================================
   UPDATE TIMER / PROGRESS
========================================================= */

function cs_updateTimer() {

  cs_setText(
    "csTimer",
    cs_formatTime(
      cs_state.remainingSeconds
    )
  );


  const progress =
    cs_state.duration > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (
              (
                cs_state.duration
                -
                cs_state.remainingSeconds
              )
              /
              cs_state.duration
            )
            * 100
          )
        )
      : 0;


  const fill =
    cs_element(
      "csProgressFill"
    );


  if (fill) {

    fill.style.width =
      progress + "%";

  }


  cs_setText(
    "csProgressText",
    Math.round(
      progress
    ) + "%"
  );

}


/* =========================================================
   PAUSE / RESUME
========================================================= */

function cs_togglePause() {

  if (
    !cs_state.active
  ) {

    return;

  }


  cs_state.paused =
    !cs_state.paused;


  const button =
    cs_element(
      "csPauseButton"
    );


  if (button) {

    button.textContent =
      cs_state.paused
        ? "RESUME"
        : "PAUSE";

  }


  cs_setText(
    "csTrainingMessage",
    cs_state.paused
      ? "훈련이 일시정지되었습니다."
      : "훈련을 다시 시작합니다."
  );

}


/* =========================================================
   MANUAL STOP
========================================================= */

function cs_stopTraining() {

  if (
    !cs_state.active
  ) {

    return;

  }


  const confirmStop =
    confirm(
      "현재 훈련을 종료하시겠습니까?"
    );


  if (
    !confirmStop
  ) {

    return;

  }


  cs_finishTraining(
    true
  );

}


/* =========================================================
   FINISH TRAINING
========================================================= */

function cs_finishTraining(
  manuallyStopped = false
) {

  cs_clearTimers();


  cs_state.active =
    false;

  cs_state.paused =
    false;

  cs_state.completedAt =
    new Date();


  cs_show(
    "csRunning",
    false
  );

  cs_show(
    "csResult",
    true
  );


  const info =
    cs_getTrainingInfo(
      cs_state.trainingType
    );


  cs_setText(
    "csResultTitle",
    info.name
      +
      " TRAINING RESULT"
  );


  cs_setText(
    "csResultMessage",
    manuallyStopped
      ? "훈련이 사용자의 요청으로 종료되었습니다. 수행 결과를 기록할 수 있습니다."
      : "훈련 시간이 완료되었습니다. 자신의 상태를 기록하세요."
  );


  cs_playEndSound();

}


/* =========================================================
   END SOUND
========================================================= */

function cs_playEndSound() {

  try {

    const audioContext =
      new (
        window.AudioContext
        ||
        window.webkitAudioContext
      )();


    const oscillator =
      audioContext.createOscillator();


    const gain =
      audioContext.createGain();


    oscillator.connect(
      gain
    );


    gain.connect(
      audioContext.destination
    );


    oscillator.frequency.value =
      660;


    gain.gain.value =
      0.12;


    oscillator.start();


    oscillator.stop(
      audioContext.currentTime
      + 0.5
    );


    setTimeout(
      () => {

        audioContext.close();

      },
      800
    );

  }
  catch(error) {

    console.log(
      "CS training sound error",
      error
    );

  }

}


/* =========================================================
   SCORE CALCULATION
========================================================= */

function cs_calculateScore(
  result
) {

  let score =
    0;


  const durationRatio =
    cs_state.duration > 0
      ? (
          (
            cs_state.duration
            -
            cs_state.remainingSeconds
          )
          /
          cs_state.duration
        )
      : 0;


  score +=
    Math.min(
      40,
      Math.round(
        durationRatio * 40
      )
    );


  const difficulty =
    Number(
      result.difficulty
    ) || 0;


  const focus =
    Number(
      result.focus_score
    ) || 0;


  const relaxation =
    Number(
      result.relaxation_score
    ) || 0;


  const awareness =
    Number(
      result.awareness_score
    ) || 0;


  const innerVision =
    Number(
      result.inner_vision_score
    ) || 0;


  score +=
    Math.round(
      (
        focus
        +
        relaxation
        +
        awareness
        +
        innerVision
      )
      / 4
      * 4
    );


  score +=
    Math.min(
      20,
      difficulty * 4
    );


  return Math.min(
    100,
    Math.max(
      0,
      Math.round(score)
    )
  );

}


/* =========================================================
   EXP CALCULATION
========================================================= */

function cs_calculateExp(
  score
) {

  const info =
    cs_getTrainingInfo(
      cs_state.trainingType
    );


  let exp =
    info.defaultExp;


  if (
    score >= 90
  ) {

    exp += 10;

  }
  else if (
    score >= 75
  ) {

    exp += 5;

  }


  if (
    cs_state.duration >= 1200
  ) {

    exp += 5;

  }


  return exp;

}


/* =========================================================
   READ RESULT FORM
========================================================= */

function cs_readResult() {

  const getValue =
    (id) => {

      const element =
        cs_element(id);

      return element
        ? element.value
        : "";

    };


  return {

    difficulty:
      getValue(
        "csDifficulty"
      ),

    focus_score:
      getValue(
        "csFocusScore"
      ),

    relaxation_score:
      getValue(
        "csRelaxationScore"
      ),

    awareness_score:
      getValue(
        "csAwarenessScore"
      ),

    inner_vision_score:
      getValue(
        "csInnerVisionScore"
      ),

    notes:
      getValue(
        "csNotes"
      )

  };

}


/* =========================================================
   SAVE TRAINING SESSION
========================================================= */

async function cs_saveTraining() {

  const result =
    cs_readResult();


  const message =
    cs_element(
      "csSaveMessage"
    );


  if (
    !result.difficulty
    ||
    !result.focus_score
    ||
    !result.relaxation_score
    ||
    !result.awareness_score
  ) {

    if (message) {

      message.textContent =
        "난이도, 집중, 이완, 인식 상태를 모두 선택하세요.";

    }

    return;

  }


  const score =
    cs_calculateScore(
      result
    );


  const exp =
    cs_calculateExp(
      score
    );


  const payload = {

    training_type:
      "consciousness_training",

    training_stage:
      cs_state.trainingType,

    duration_seconds:
      cs_state.duration,

    completed:
      true,

    difficulty:
      Number(
        result.difficulty
      ),

    focus_score:
      Number(
        result.focus_score
      ),

    relaxation_score:
      Number(
        result.relaxation_score
      ),

    awareness_score:
      Number(
        result.awareness_score
      ),

    inner_vision_score:
      Number(
        result.inner_vision_score
      ) || 0,

    user_notes:
      result.notes,

    score:
      score,

    exp_reward:
      exp,

    started_at:
      cs_state.startedAt
        ? cs_state.startedAt.toISOString()
        : null,

    completed_at:
      cs_state.completedAt
        ? cs_state.completedAt.toISOString()
        : new Date().toISOString()

  };


  if (message) {

    message.textContent =
      "훈련 기록을 저장하고 있습니다...";

  }


  const saveButton =
    cs_element(
      "csSaveButton"
    );


  if (saveButton) {

    saveButton.disabled =
      true;

  }


  /*
     IMPORTANT:

     This first attempts the new dedicated RPC:

     complete_consciousness_training

     Required SQL RPC parameter names:
       p_result
       p_exp
  */

  const {
    data,
    error
  } = await client.rpc(
    "complete_consciousness_training",
    {
      p_result: payload,
      p_exp: exp
    }
  );


  if (saveButton) {

    saveButton.disabled =
      false;

  }


  if (error) {

    console.error(
      "Consciousness training save error:",
      error
    );


    if (message) {

      message.textContent =
        "저장 실패: "
        + error.message;

    }

    return;

  }


  const profile =
    Array.isArray(data)
      ? data[0]
      : data;


  if (profile) {

    state.profile =
      profile;

  }


  cs_setText(
    "csEarnedExp",
    "EXP +"
    + exp
  );


  cs_setText(
    "csFinalScore",
    "SCORE "
    + score
    + " / 100"
  );


  if (message) {

    message.textContent =
      "훈련 기록이 저장되었습니다.";

  }


  if (
    state.profile
  ) {

    render();

  }

}


/* =========================================================
   BACK TO GAME
========================================================= */

function cs_backToGame() {

  cs_clearTimers();


  cs_state.active =
    false;

  cs_state.paused =
    false;


  const trainingPanel =
    cs_element(
      "consciousnessTrainingPanel"
    );


  const gamePanel =
    cs_element(
      "gamePanel"
    );


  if (trainingPanel) {

    trainingPanel.classList.add(
      "hidden"
    );

  }


  if (gamePanel) {

    gamePanel.classList.remove(
      "hidden"
    );

  }


  if (
    state.profile
  ) {

    render();

  }

}


/* =========================================================
   RESET RESULT FORM
========================================================= */

function cs_resetResultForm() {

  const ids = [

    "csDifficulty",

    "csFocusScore",

    "csRelaxationScore",

    "csAwarenessScore",

    "csInnerVisionScore",

    "csNotes"

  ];


  ids.forEach(
    (id) => {

      const element =
        cs_element(id);

      if (!element) {

        return;

      }


      if (
        element.tagName ===
        "TEXTAREA"
      ) {

        element.value =
          "";

      }
      else {

        element.selectedIndex =
          0;

      }

    }
  );


  cs_setText(
    "csSaveMessage",
    ""
  );


  cs_setText(
    "csEarnedExp",
    ""
  );


  cs_setText(
    "csFinalScore",
    ""
  );

}


/* =========================================================
   TRAINING MENU BUTTONS
========================================================= */

document.addEventListener(
  "click",
  (event) => {

    const button =
      event.target.closest(
        "[data-cs-training]"
      );


    if (
      !button
    ) {

      return;

    }


    const type =
      button.dataset
        .csTraining;


    cs_openTraining(
      type
    );

  }
);


/* =========================================================
   TRAINING PANEL BUTTONS
========================================================= */

cs_element(
  "csStartButton"
)?.addEventListener(
  "click",
  () => {

    cs_startTraining();

  }
);


cs_element(
  "csPauseButton"
)?.addEventListener(
  "click",
  () => {

    cs_togglePause();

  }
);


cs_element(
  "csStopButton"
)?.addEventListener(
  "click",
  () => {

    cs_stopTraining();

  }
);


cs_element(
  "csSaveButton"
)?.addEventListener(
  "click",
  () => {

    cs_saveTraining();

  }
);


cs_element(
  "csBackButton"
)?.addEventListener(
  "click",
  () => {

    cs_backToGame();

  }
);


cs_element(
  "csResultBackButton"
)?.addEventListener(
  "click",
  () => {

    cs_backToGame();

  }
);


/* =========================================================
   EXTERNAL OPEN FUNCTIONS
   FOR EXISTING HTML onclick BUTTONS
========================================================= */

window.cs_openBetaTraining =
  () => cs_openTraining(
    "beta"
  );


window.cs_openAlphaTraining =
  () => cs_openTraining(
    "alpha"
  );


window.cs_openThetaTraining =
  () => cs_openTraining(
    "theta"
  );


window.cs_openDeepTraining =
  () => cs_openTraining(
    "deep"
  );  


/* =========================================================
   RANK PROMOTION SYSTEM
   PERFORMANCE-BASED TEST
   D-RANK → C-RANK
========================================================= */

const RANK_ORDER = [
  "D",
  "C",
  "B",
  "A",
  "S"
];


const PROMOTION_TESTS = {

  D: [
    {
      type: "focus",
      objective: "집중 유지",
      question:
        "화면 중앙의 점에 집중하십시오. 시험이 종료될 때까지 다른 행동을 하지 마십시오.",
      duration: 20
    },

    {
      type: "impulse",
      objective: "충동 억제",
      question:
        "화면에 나타나는 보상 유혹에 반응하지 마십시오.",
      duration: 15
    },

    {
      type: "attention",
      objective: "주의 전환",
      question:
        "신호가 나타나면 가능한 빠르게 SIGNAL 버튼을 누르십시오.",
      duration: 10
    },

    {
      type: "observation",
      objective: "자기 상태 관찰",
      question:
        "지금까지의 시험 과정에서 자신의 집중, 충동, 감정, 신체 감각 및 주의 변화를 기록하십시오.",
      duration: 0
    }
  ]

};


const promotionState = {

  active: false,

  currentRank: null,

  currentIndex: 0,

  timer: null,

  remainingSeconds: 0,

  impulseClicked: false,

  attentionSignalShown: false,

  attentionSignalTime: null,

  attentionReactionTime: null,

  results: []

};


/* =========================================================
   RANK HELPERS
========================================================= */

function getNextRank(rank) {

  const index =
    RANK_ORDER.indexOf(
      rank || "D"
    );

  if (index < 0) {
    return "C";
  }

  if (
    index >=
    RANK_ORDER.length - 1
  ) {
    return null;
  }

  return RANK_ORDER[index + 1];

}


function getPromotionTest(rank) {

  return (
    PROMOTION_TESTS[rank]
    ||
    PROMOTION_TESTS.D
  );

}


/* =========================================================
   SAFE RANK UI HELPERS
========================================================= */

function rankElement(id) {

  return document.getElementById(id);

}


function rankShow(id, visible = true) {

  const element =
    rankElement(id);

  if (!element) {
    return;
  }

  element.classList.toggle(
    "hidden",
    !visible
  );

}


function rankSetText(id, value) {

  const element =
    rankElement(id);

  if (!element) {
    return;
  }

  element.textContent =
    value == null
      ? ""
      : value;

}


function rankFormatTime(seconds) {

  const safeSeconds =
    Math.max(
      0,
      Number(seconds) || 0
    );

  const minutes =
    Math.floor(
      safeSeconds / 60
    );

  const remain =
    safeSeconds % 60;

  return (
    String(minutes)
      .padStart(2, "0")
    +
    ":"
    +
    String(remain)
      .padStart(2, "0")
  );

}


/* =========================================================
   RENDER PROMOTION PANEL
========================================================= */

function renderRankPromotion() {

  const profile =
    state.profile;

  if (!profile) {
    return;
  }


  const panel =
    rankElement(
      "rankTestPanel"
    );

  if (!panel) {
    return;
  }


  const currentRank =
    profile.rank || "D";

  const nextRank =
    getNextRank(
      currentRank
    );


  if (
    !nextRank
    ||
    Number(profile.level) < 100
  ) {

    panel.classList.add(
      "hidden"
    );

    return;

  }


  rankSetText(
    "promotionCurrentRank",
    `${currentRank}-RANK`
  );


  rankSetText(
    "promotionNextRank",
    `${nextRank}-RANK`
  );


  panel.classList.remove(
    "hidden"
  );

}


/* =========================================================
   RESET TEST AREAS
========================================================= */

function resetPromotionAreas() {

  rankShow(
    "promotionFocusArea",
    false
  );

  rankShow(
    "promotionImpulseArea",
    false
  );

  rankShow(
    "promotionAttentionArea",
    false
  );

  rankShow(
    "promotionObservationArea",
    false
  );


  const impulseTarget =
    rankElement(
      "promotionImpulseTarget"
    );

  if (impulseTarget) {

    impulseTarget.classList.add(
      "hidden"
    );

  }


  const attentionButton =
    rankElement(
      "promotionAttentionButton"
    );

  if (attentionButton) {

    attentionButton.classList.add(
      "hidden"
    );

  }


  const observationInput =
    rankElement(
      "promotionObservationInput"
    );

  if (observationInput) {

    observationInput.value = "";

  }

}


/* =========================================================
   CLEAR TEST TIMER
========================================================= */

function clearPromotionTimer() {

  if (promotionState.timer) {

    clearInterval(
      promotionState.timer
    );

    promotionState.timer =
      null;

  }

}


/* =========================================================
   START RANK TEST
========================================================= */

function startRankTest() {

  const profile =
    state.profile;

  if (!profile) {
    return;
  }


  const currentRank =
    profile.rank || "D";


  const nextRank =
    getNextRank(
      currentRank
    );


  if (
    !nextRank
    ||
    Number(profile.level) < 100
  ) {

    return;

  }


  clearPromotionTimer();


  promotionState.active =
    true;

  promotionState.currentRank =
    currentRank;

  promotionState.currentIndex =
    0;

  promotionState.remainingSeconds =
    0;

  promotionState.impulseClicked =
    false;

  promotionState.attentionSignalShown =
    false;

  promotionState.attentionSignalTime =
    null;

  promotionState.attentionReactionTime =
    null;

  promotionState.results =
    [];


  rankShow(
    "rankTestPanel",
    false
  );

  rankShow(
    "rankTestResultPanel",
    false
  );

  rankShow(
    "rankTestRunningPanel",
    true
  );


  rankSetText(
    "rankTestMessage",
    ""
  );


  runPromotionStage();

}


/* =========================================================
   RUN CURRENT STAGE
========================================================= */

function runPromotionStage() {

  clearPromotionTimer();

  resetPromotionAreas();


  const tests =
    getPromotionTest(
      promotionState.currentRank
    );


  const test =
    tests[
      promotionState.currentIndex
    ];


  if (!test) {

    finishPromotionTest();

    return;

  }


  const currentRank =
    promotionState.currentRank;

  const total =
    tests.length;


  rankSetText(
    "rankTestTitle",
    `${currentRank}-RANK PROMOTION TEST`
  );


  rankSetText(
    "rankTestProgress",
    `TEST ${promotionState.currentIndex + 1} / ${total}`
  );


  rankSetText(
    "rankTestObjective",
    test.objective
  );


  rankSetText(
    "rankTestQuestion",
    test.question
  );


  rankSetText(
    "rankTestMessage",
    ""
  );


  rankSetText(
    "rankTestTimer",
    test.duration > 0
      ? rankFormatTime(
          test.duration
        )
      : "OBSERVE"
  );


  if (
    test.type === "focus"
  ) {

    startFocusPromotionTest(
      test
    );

  }

  else if (
    test.type === "impulse"
  ) {

    startImpulsePromotionTest(
      test
    );

  }

  else if (
    test.type === "attention"
  ) {

    startAttentionPromotionTest(
      test
    );

  }

  else if (
    test.type === "observation"
  ) {

    startObservationPromotionTest();

  }

}


/* =========================================================
   GENERIC COUNTDOWN
========================================================= */

function startPromotionCountdown(
  seconds,
  onFinish
) {

  promotionState.remainingSeconds =
    seconds;


  rankSetText(
    "rankTestTimer",
    rankFormatTime(
      promotionState.remainingSeconds
    )
  );


  promotionState.timer =
    setInterval(
      () => {

        promotionState.remainingSeconds--;


        rankSetText(
          "rankTestTimer",
          rankFormatTime(
            promotionState.remainingSeconds
          )
        );


        if (
          promotionState.remainingSeconds <= 0
        ) {

          clearPromotionTimer();

          onFinish();

        }

      },
      1000
    );

}


/* =========================================================
   TEST 1
   FOCUS MAINTENANCE
========================================================= */

function startFocusPromotionTest(
  test
) {

  rankShow(
    "promotionFocusArea",
    true
  );


  startPromotionCountdown(
    test.duration,
    () => {

      promotionState.results.push({
        type: "focus",
        completed: true,
        duration: test.duration,
        score: 25
      });


      nextPromotionStage();

    }
  );

}


/* =========================================================
   TEST 2
   IMPULSE CONTROL
========================================================= */

function startImpulsePromotionTest(
  test
) {

  promotionState.impulseClicked =
    false;


  rankShow(
    "promotionImpulseArea",
    true
  );


  const impulseTarget =
    rankElement(
      "promotionImpulseTarget"
    );


  if (impulseTarget) {

    impulseTarget.onclick =
      () => {

        promotionState.impulseClicked =
          true;


        impulseTarget.textContent =
          "반응 기록됨";


        impulseTarget.classList.add(
          "hidden"
        );


        rankSetText(
          "rankTestMessage",
          "충동 반응이 기록되었습니다. 시험은 계속됩니다."
        );

      };

  }


  const appearAfter =
    Math.floor(
      Math.random() * 7000
    )
    + 3000;


  setTimeout(
    () => {

      if (
        !promotionState.active
      ) {
        return;
      }


      if (
        promotionState.currentIndex !== 1
      ) {
        return;
      }


      if (impulseTarget) {

        impulseTarget.classList.remove(
          "hidden"
        );

      }

    },
    appearAfter
  );


  startPromotionCountdown(
    test.duration,
    () => {

      const score =
        promotionState.impulseClicked
          ? 0
          : 25;


      promotionState.results.push({
        type: "impulse",
        clicked: promotionState.impulseClicked,
        score: score
      });


      nextPromotionStage();

    }
  );

}


/* =========================================================
   TEST 3
   ATTENTION SWITCHING
========================================================= */

function startAttentionPromotionTest(
  test
) {

  promotionState.attentionSignalShown =
    false;

  promotionState.attentionSignalTime =
    null;

  promotionState.attentionReactionTime =
    null;


  rankShow(
    "promotionAttentionArea",
    true
  );


  const attentionButton =
    rankElement(
      "promotionAttentionButton"
    );


  if (attentionButton) {

    attentionButton.onclick =
      () => {

        if (
          !promotionState.attentionSignalShown
        ) {
          return;
        }


        if (
          promotionState.attentionReactionTime
          !== null
        ) {
          return;
        }


        promotionState.attentionReactionTime =
          Date.now()
          -
          promotionState.attentionSignalTime;


        attentionButton.disabled =
          true;


        const reaction =
          promotionState.attentionReactionTime;


        let score =
          0;


        if (
          reaction <= 500
        ) {

          score = 25;

        }

        else if (
          reaction <= 1000
        ) {

          score = 22;

        }

        else if (
          reaction <= 2000
        ) {

          score = 18;

        }

        else if (
          reaction <= 3000
        ) {

          score = 12;

        }

        else {

          score = 5;

        }


        promotionState.results.push({
          type: "attention",
          reaction_time_ms: reaction,
          score: score
        });


        clearPromotionTimer();


        rankSetText(
          "rankTestTimer",
          "SIGNAL COMPLETE"
        );


        setTimeout(
          () => {

            nextPromotionStage();

          },
          1000
        );

      };


    }


  const signalDelay =
    Math.floor(
      Math.random() * 4000
    )
    + 2000;


  setTimeout(
    () => {

      if (
        !promotionState.active
      ) {
        return;
      }


      if (
        promotionState.currentIndex !== 2
      ) {
        return;
      }


      promotionState.attentionSignalShown =
        true;


      promotionState.attentionSignalTime =
        Date.now();


      if (attentionButton) {

        attentionButton.disabled =
          false;

        attentionButton.classList.remove(
          "hidden"
        );

      }


      rankSetText(
        "rankTestMessage",
        "SIGNAL DETECTED"
      );

    },
    signalDelay
  );


  startPromotionCountdown(
    test.duration,
    () => {

      if (
        promotionState.attentionReactionTime
        === null
      ) {

        promotionState.results.push({
          type: "attention",
          reaction_time_ms: null,
          score: 0
        });


        nextPromotionStage();

      }

    }
  );

}


/* =========================================================
   TEST 4
   SELF OBSERVATION
========================================================= */

function startObservationPromotionTest() {

  rankShow(
    "promotionObservationArea",
    true
  );


  rankSetText(
    "rankTestTimer",
    "RECORD"
  );


  const submitButton =
    rankElement(
      "promotionObservationSubmit"
    );


  if (submitButton) {

    submitButton.onclick =
      submitPromotionObservation;

  }

}


/* =========================================================
   SUBMIT OBSERVATION
========================================================= */

function submitPromotionObservation() {

  const input =
    rankElement(
      "promotionObservationInput"
    );


  const text =
    input
      ? input.value.trim()
      : "";


  if (
    text.length < 20
  ) {

    rankSetText(
      "rankTestMessage",
      "최소 20자 이상 자신의 상태를 기록하십시오."
    );

    return;

  }


  const score =
    text.length >= 100
      ? 25
      : text.length >= 50
        ? 20
        : 15;


  promotionState.results.push({
    type: "observation",
    text: text,
    length: text.length,
    score: score
  });


  nextPromotionStage();

}


/* =========================================================
   NEXT STAGE
========================================================= */

function nextPromotionStage() {

  promotionState.currentIndex++;


  runPromotionStage();

}


/* =========================================================
   FINISH PROMOTION TEST
========================================================= */

async function finishPromotionTest() {

  clearPromotionTimer();


  promotionState.active =
    false;


  rankShow(
    "rankTestRunningPanel",
    false
  );


  const currentRank =
    promotionState.currentRank
    ||
    state.profile?.rank
    ||
    "D";


  const targetRank =
    getNextRank(
      currentRank
    );


  const totalScore =
    promotionState.results.reduce(
      (
        total,
        result
      ) => {

        return (
          total
          +
          (
            Number(
              result.score
            )
            || 0
          )
        );

      },
      0
    );


  rankShow(
    "rankTestResultPanel",
    true
  );


  rankSetText(
    "rankTestResultCurrentRank",
    `${currentRank}-RANK`
  );


  rankSetText(
    "rankTestResultTargetRank",
    `${targetRank}-RANK`
  );


  rankSetText(
    "rankTestResultBadge",
    "PROCESSING"
  );


  rankSetText(
    "rankTestScore",
    `SCORE ${totalScore} / 100`
  );


  rankSetText(
    "rankTestResultMessage",
    "시험 결과를 서버에 기록하고 있습니다..."
  );


  const resultAction =
    rankElement(
      "rankTestResultAction"
    );


  if (resultAction) {

    resultAction.disabled =
      true;

  }


  /*
    기존 승급시험 RPC를 사용한다.

    기존 서버 구조를 유지하기 위해
    p_answers 이름을 그대로 사용한다.

    각 수행 결과를 서버로 전달한다.
  */

  const {
    data,
    error
  } = await client.rpc(
    "submit_rank_promotion_test",
    {
      p_answers:
        promotionState.results
    }
  );


  if (error) {

    console.error(
      "Rank promotion test error:",
      error
    );


    rankSetText(
      "rankTestResultBadge",
      "SAVE ERROR"
    );


    rankSetText(
      "rankTestResultMessage",
      "시험 수행은 완료되었지만 서버 저장에 실패했습니다: "
      + error.message
    );


    if (resultAction) {

      resultAction.disabled =
        false;

      resultAction.textContent =
        "게임으로 돌아가기";


      resultAction.onclick =
        () => {

          rankShow(
            "rankTestResultPanel",
            false
          );

          rankShow(
            "rankTestPanel",
            true
          );

        };

    }


    return;

  }


  const result =
    Array.isArray(data)
      ? data[0]
      : data;


  if (!result) {

    rankSetText(
      "rankTestResultBadge",
      "ERROR"
    );


    rankSetText(
      "rankTestResultMessage",
      "서버에서 승급 결과를 받지 못했습니다."
    );


    if (resultAction) {

      resultAction.disabled =
        false;

    }


    return;

  }


  const passed =
    result.result === "PASS";


  rankSetText(
    "rankTestResultBadge",
    passed
      ? "PASS"
      : "FAIL"
  );


  rankSetText(
    "rankTestScore",
    `SCORE ${
      result.score != null
        ? result.score
        : totalScore
    } / 100`
  );


  rankSetText(
    "rankTestResultMessage",
    passed
      ? `${targetRank}-RANK 승급이 완료되었습니다. 새로운 랭크의 성장 단계가 시작됩니다.`
      : "이번 승급시험은 통과하지 못했습니다. 현재 랭크는 유지되며 다시 도전할 수 있습니다."
  );


  if (resultAction) {

    resultAction.disabled =
      false;


    resultAction.textContent =
      passed
        ? "새 랭크로 게임 계속하기"
        : "다시 시험 보기";


    resultAction.onclick =
      async () => {

        rankShow(
          "rankTestResultPanel",
          false
        );


        if (passed) {

          await loadProfile();

        }

        else {

          rankShow(
            "rankTestPanel",
            true
          );

        }

      };

  }


  await loadProfile();

}


/* =========================================================
   RANK TEST CLEANUP
========================================================= */

function resetPromotionTest() {

  clearPromotionTimer();


  promotionState.active =
    false;

  promotionState.currentIndex =
    0;

  promotionState.results =
    [];

  promotionState.impulseClicked =
    false;

  promotionState.attentionSignalShown =
    false;

  promotionState.attentionSignalTime =
    null;

  promotionState.attentionReactionTime =
    null;


  resetPromotionAreas();

}
  
/* =========================
   RANK PROMOTION SYSTEM
========================= */

const RANK_ORDER = ["D", "C", "B", "A", "S"];

const PROMOTION_TESTS = {
  D: [
    { type: "focus", objective: "집중 유지", duration: 10 },
    { type: "impulse", objective: "충동 억제", duration: 12 },
    { type: "attention", objective: "주의 전환", duration: 10 },
    { type: "observation", objective: "자기 상태 관찰", duration: 0 }
  ],
  C: [
    { type: "focus", objective: "집중 유지", duration: 15 },
    { type: "impulse", objective: "충동 억제", duration: 15 },
    { type: "attention", objective: "주의 전환", duration: 12 },
    { type: "observation", objective: "자기 상태 관찰", duration: 0 }
  ],
  B: [
    { type: "focus", objective: "집중 유지", duration: 20 },
    { type: "impulse", objective: "충동 억제", duration: 18 },
    { type: "attention", objective: "주의 전환", duration: 15 },
    { type: "observation", objective: "자기 상태 관찰", duration: 0 }
  ],
  A: [
    { type: "focus", objective: "집중 유지", duration: 30 },
    { type: "impulse", objective: "충동 억제", duration: 25 },
    { type: "attention", objective: "주의 전환", duration: 20 },
    { type: "observation", objective: "자기 상태 관찰", duration: 0 }
  ]
};

const QUEST_LIMITS = {
  focus_5: 3,
  sense_observation: 3,
  intuition_choice: 5,
  emotion_guess: 3,
  life_death: 3
};

let rankTestTimer = null;
let rankTestAttentionTimer = null;
let rankTestStartedAt = 0;
let rankTestElapsed = 0;
let rankTestImpulseClicked = false;
let rankTestAttentionReaction = null;

function getNextRank(rank) {
  const index = RANK_ORDER.indexOf(rank || "D");

  if (index < 0) {
    return "C";
  }

  if (index >= RANK_ORDER.length - 1) {
    return null;
  }

  return RANK_ORDER[index + 1];
}

function getPromotionTest(rank) {
  return PROMOTION_TESTS[rank] || PROMOTION_TESTS.D;
}

function clearRankTestTimers() {
  if (rankTestTimer) {
    clearInterval(rankTestTimer);
    rankTestTimer = null;
  }

  if (rankTestAttentionTimer) {
    clearTimeout(rankTestAttentionTimer);
    rankTestAttentionTimer = null;
  }
}

function hidePromotionAreas() {
  [
    "promotionFocusArea",
    "promotionImpulseArea",
    "promotionAttentionArea",
    "promotionObservationArea"
  ].forEach(id => {
    const element = $(id);

    if (element) {
      element.classList.add("hidden");
    }
  });

  const impulseTarget = $("promotionImpulseTarget");

  if (impulseTarget) {
    impulseTarget.classList.add("hidden");
    impulseTarget.onclick = null;
  }

  const attentionButton = $("promotionAttentionButton");

  if (attentionButton) {
    attentionButton.classList.add("hidden");
    attentionButton.onclick = null;
  }
}

function formatRankTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));

  return (
    "00:" +
    String(value).padStart(2, "0")
  );
}

function renderRankPromotion() {
  const profile = state.profile;
  const panel = $("rankTestPanel");

  if (!profile || !panel) {
    return;
  }

  const currentRank =
    profile.rank || "D";

  const nextRank =
    getNextRank(currentRank);

  if (
    !nextRank ||
    Number(profile.level) < 100
  ) {
    panel.classList.add("hidden");
    return;
  }

  const current =
    $("promotionCurrentRank");

  const next =
    $("promotionNextRank");

  if (current) {
    current.textContent =
      `${currentRank}-RANK`;
  }

  if (next) {
    next.textContent =
      `${nextRank}-RANK`;
  }

  panel.classList.remove("hidden");
}

function startRankTest() {
  const profile = state.profile;

  if (!profile) {
    return;
  }

  const currentRank =
    profile.rank || "D";

  const nextRank =
    getNextRank(currentRank);

  if (
    !nextRank ||
    Number(profile.level) < 100
  ) {
    return;
  }

  clearRankTestTimers();

  state.rankTestIndex = 0;
  state.rankTestAnswers = [];
  state.rankTestScores = [];
  state.rankTestCurrentRank = currentRank;

  $("rankTestPanel")?.classList.add("hidden");

  $("rankTestRunningPanel")?.classList.remove("hidden");

  hidePromotionAreas();

  renderRankTestQuestion();
}

function updateRankTestTimer(total) {
  const elapsed =
    Math.floor(
      (Date.now() - rankTestStartedAt) / 1000
    );

  rankTestElapsed = elapsed;

  const timer =
    $("rankTestTimer");

  if (timer) {
    timer.textContent =
      formatRankTime(elapsed);
  }

  if (
    total > 0 &&
    elapsed >= total
  ) {
    clearRankTestTimers();

    completeCurrentRankTest(false);
  }
}

function completeCurrentRankTest(success) {
  clearRankTestTimers();

  const index =
    state.rankTestIndex;

  const tests =
    getPromotionTest(
      state.rankTestCurrentRank || "D"
    );

  const test =
    tests[index];

  if (!test) {
    finishRankTest();
    return;
  }

  let score =
    success ? 100 : 0;

  if (
    test.type === "attention" &&
    rankTestAttentionReaction !== null
  ) {
    score =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(
            100 -
            rankTestAttentionReaction * 2
          )
        )
      );
  }

  if (
    test.type === "impulse" &&
    rankTestImpulseClicked
  ) {
    score = 0;
  }

  if (test.type === "observation") {
    const input =
      $("promotionObservationInput");

    score =
      input &&
      input.value.trim().length >= 20
        ? 100
        : 40;
  }

  state.rankTestScores.push(score);

  state.rankTestAnswers.push({
    index,
    type: test.type,
    score
  });

  state.rankTestIndex++;

  if (
    state.rankTestIndex >=
    tests.length
  ) {
    finishRankTest();
  } else {
    renderRankTestQuestion();
  }
}

function renderRankTestQuestion() {
  clearRankTestTimers();

  hidePromotionAreas();

  const currentRank =
    state.rankTestCurrentRank ||
    state.profile?.rank ||
    "D";

  const tests =
    getPromotionTest(currentRank);

  const index =
    state.rankTestIndex || 0;

  const test =
    tests[index];

  if (!test) {
    finishRankTest();
    return;
  }

  const title =
    $("rankTestTitle");

  const progress =
    $("rankTestProgress");

  const objective =
    $("rankTestObjective");

  const question =
    $("rankTestQuestion");

  const message =
    $("rankTestMessage");

  if (title) {
    title.textContent =
      `${currentRank}-RANK PROMOTION TEST`;
  }

  if (progress) {
    progress.textContent =
      `TEST ${index + 1} / ${tests.length}`;
  }

  if (objective) {
    objective.textContent =
      test.objective;
  }

  if (message) {
    message.textContent = "";
  }

  if (question) {
    question.textContent = "";
  }

  rankTestStartedAt =
    Date.now();

  rankTestElapsed = 0;

  rankTestImpulseClicked =
    false;

  rankTestAttentionReaction =
    null;

  if (test.type === "focus") {

    $("promotionFocusArea")
      ?.classList.remove("hidden");

    if (question) {
      question.textContent =
        "화면 중앙의 점에 집중하십시오. 다른 행동을 하지 말고 시험 종료까지 집중을 유지하십시오.";
    }

    rankTestTimer =
      setInterval(
        () =>
          updateRankTestTimer(
            test.duration
          ),
        250
      );

    return;
  }

  if (test.type === "impulse") {

    $("promotionImpulseArea")
      ?.classList.remove("hidden");

    if (question) {
      question.textContent =
        "아무 행동도 하지 말고 화면을 유지하십시오. 나타나는 요소에 반응하지 마십시오.";
    }

    const target =
      $("promotionImpulseTarget");

    if (target) {

      const delay =
        3000 +
        Math.floor(
          Math.random() * 4000
        );

      rankTestAttentionTimer =
        setTimeout(() => {

          target.classList.remove(
            "hidden"
          );

          target.onclick = () => {

            rankTestImpulseClicked =
              true;

            if (message) {
              message.textContent =
                "충동 반응이 기록되었습니다.";
            }
          };

        }, delay);
    }

    rankTestTimer =
      setInterval(
        () =>
          updateRankTestTimer(
            test.duration
          ),
        250
      );

    return;
  }

  if (test.type === "attention") {

    $("promotionAttentionArea")
      ?.classList.remove("hidden");

    if (question) {
      question.textContent =
        "화면을 주시하십시오. 신호가 나타나면 가능한 빠르게 버튼을 누르십시오.";
    }

    const button =
      $("promotionAttentionButton");

    if (button) {

      const delay =
        2000 +
        Math.floor(
          Math.random() * 4000
        );

      rankTestAttentionTimer =
        setTimeout(() => {

          const shownAt =
            performance.now();

          button.classList.remove(
            "hidden"
          );

          button.onclick = () => {

            rankTestAttentionReaction =
              performance.now() -
              shownAt;

            completeCurrentRankTest(
              true
            );
          };

        }, delay);
    }

    rankTestTimer =
      setInterval(
        () =>
          updateRankTestTimer(
            test.duration
          ),
        250
      );

    return;
  }

  if (test.type === "observation") {

    $("promotionObservationArea")
      ?.classList.remove("hidden");

    if (question) {
      question.textContent =
        "방금까지의 시험 과정에서 자신의 상태를 관찰하고 기록하십시오.";
    }

    const input =
      $("promotionObservationInput");

    if (input) {
      input.value = "";
    }

    const submit =
      $("promotionObservationSubmit");

    if (submit) {
      submit.onclick = () => {
        completeCurrentRankTest(true);
      };
    }
  }
}

function finishRankTest() {
  clearRankTestTimers();

  hidePromotionAreas();

  $("rankTestRunningPanel")
    ?.classList.add("hidden");

  const panel =
    $("rankTestPanel");

  if (!panel) {
    return;
  }

  const currentRank =
    state.rankTestCurrentRank ||
    state.profile?.rank ||
    "D";

  const nextRank =
    getNextRank(currentRank);

  const scores =
    state.rankTestScores || [];

  const score =
    Math.round(
      scores.reduce(
        (sum, value) =>
          sum + value,
        0
      ) /
      Math.max(
        scores.length,
        1
      )
    );

  const passed =
    score >= 70;

  panel.innerHTML = `
    <div class="section-title">
      <h2>
        ${
          passed
            ? "PROMOTION TEST PASSED"
            : "PROMOTION TEST FAILED"
        }
      </h2>

      <span class="muted">
        ${currentRank}-RANK → ${nextRank}-RANK
      </span>
    </div>

    <div class="rank-test-description">

      <p>
        SCORE ${score} / 100
      </p>

      <p class="muted">
        ${
          passed
            ? "승급시험 기준을 충족했습니다."
            : "승급시험 기준을 충족하지 못했습니다. 다시 도전하십시오."
        }
      </p>

    </div>

    <button
      id="rankTestRetryButton"
      type="button"
    >
      ${
        passed
          ? "시험 결과 확인"
          : "다시 시험하기"
      }
    </button>
  `;

  panel.classList.remove(
    "hidden"
  );

  $("rankTestRetryButton").onclick =
    () => {

      if (passed) {

        panel.innerHTML = `
          <div class="section-title">
            <h2>TEST COMPLETE</h2>
            <span class="muted">RESULT</span>
          </div>

          <p class="message">
            ${currentRank}-RANK 승급 시험 통과
            · 목표 ${nextRank}-RANK
          </p>

          <button
            id="rankTestCloseButton"
            type="button"
          >
            게임으로 돌아가기
          </button>
        `;

        $("rankTestCloseButton").onclick =
          () => {

            panel.classList.add(
              "hidden"
            );

            $("gamePanel")
              ?.classList.remove(
                "hidden"
              );

            render();
          };

      } else {

        startRankTest();

      }
    };
}

function getTodayStart() {

  const now =
    new Date();

  now.setHours(
    0,
    0,
    0,
    0
  );

  return now.toISOString();
}

async function loadQuests() {

  if (!state.profile) {
    return;
  }

  const playerLevel =
    state.profile.level;

  const {
    data: quests,
    error: questError
  } =
    await client
      .from("quest_defs")
      .select("*")
      .eq("active", true)
      .lte(
        "min_level",
        playerLevel
      )
      .order("min_level");

  if (questError) {

    const list =
      $("questList");

    if (list) {
      list.textContent =
        questError.message;
    }

    return;
  }

  const {
    data: todayLogs,
    error: logError
  } =
    await client
      .from("quest_logs")
      .select("quest_code")
      .gte(
        "completed_at",
        getTodayStart()
      );

  if (logError) {
    console.error(logError);
  }

  const todayCount = {};

  for (
    const log of
    todayLogs || []
  ) {

    todayCount[
      log.quest_code
    ] =
      (
        todayCount[
          log.quest_code
        ] || 0
      ) + 1;
  }

  const levelTestReady =
    state.profile
      .level_test_available === true;

  const notice =
    $("questNotice");

  if (notice) {

    notice.textContent =
      levelTestReady
        ? `LV.${state.profile.pending_level} 승급 시험을 통과해야 훈련을 계속할 수 있습니다.`
        : "";
  }

  const list =
    $("questList");

  if (!list) {
    return;
  }

  list.innerHTML =
    (quests || [])
      .map(q => {

        const maxCount =
          QUEST_LIMITS[q.code] || 1;

        const currentCount =
          todayCount[q.code] || 0;

        const limitReached =
          currentCount >= maxCount;

        const questLocked =
          levelTestReady ||
          limitReached;

        let buttonText =
          "수행";

        if (levelTestReady) {
          buttonText =
            "승급 시험 필요";
        }
        else if (limitReached) {
          buttonText =
            "오늘 완료";
        }

        if (q.code === "focus_5") {

          return `
            <div class="quest">

              <div>

                <h3>
                  ${q.title}
                </h3>

                <p>
                  ${q.grade}-RANK ·
                  실제 5분 훈련 ·
                  EXP ${q.base_exp}
                </p>

                <p class="quest-count">
                  오늘
                  ${currentCount}
                  /
                  ${maxCount}회
                </p>

              </div>

              <button
                class="focus-quest-button"
                ${questLocked ? "disabled" : ""}
              >
                ${buttonText}
              </button>

            </div>
          `;
        }

        if (
          q.code ===
          "sense_observation"
        ) {

          return `
            <div class="quest">

              <div>

                <h3>
                  ${q.title}
                </h3>

                <p>
                  ${q.grade}-RANK ·
                  실제 관찰 훈련 ·
                  3~10분
                </p>

                <p class="quest-count">
                  오늘
                  ${currentCount}
                  /
                  ${maxCount}회
                </p>

              </div>

              <button
                class="sense-quest-button"
                ${questLocked ? "disabled" : ""}
              >
                ${buttonText}
              </button>

            </div>
          `;
        }

        return `
          <div class="quest">

            <div>

              <h3>
                ${q.title}
              </h3>

              <p>
                ${q.grade}-RANK ·
                기본 EXP ${q.base_exp}
              </p>

              <p class="quest-count">
                오늘
                ${currentCount}
                /
                ${maxCount}회
              </p>

            </div>

            <button
              data-code="${q.code}"
              data-exp="${q.base_exp}"
              ${questLocked ? "disabled" : ""}
            >
              ${buttonText}
            </button>

          </div>
        `;

      })
      .join("");

  list
    .querySelector(
      ".focus-quest-button"
    )
    ?.addEventListener(
      "click",
      openFocusTraining
    );

  list
    .querySelector(
      ".sense-quest-button"
    )
    ?.addEventListener(
      "click",
      openSenseTraining
    );

  list
    .querySelectorAll(
      "[data-code]"
    )
    .forEach(button => {

      button.onclick = () => {

        completeQuest(
          button.dataset.code,
          Number(
            button.dataset.exp
          )
        );

      };

    });
}
  
async function completeQuest(code,exp){
  const {data,error}=await client.rpc("complete_simple_quest",{p_quest_code:code,p_exp:exp});
  if(error){$("questNotice").textContent=error.message;return;}
  state.profile=data;
  $("questNotice").textContent=`${code} 완료 · EXP +${exp}`;
  render();
}
function startAssessment(){
  state.assessmentIndex=0;state.assessmentScore=0;
  show("startPanel",false);show("assessmentPanel",true);show("gamePanel",false);drawAssessment();
}
function drawAssessment(){
  const a=assessment[state.assessmentIndex];
  $("assessmentQuestion").textContent=a.q;
  $("assessmentChoices").innerHTML=a.c.map((x,i)=>`<button data-i="${i}">${x}</button>`).join("");
  $("assessmentChoices").querySelectorAll("button").forEach(b=>b.onclick=()=>answerAssessment(Number(b.dataset.i)));
  $("assessmentProgress").textContent=`TEST ${state.assessmentIndex+1} / ${assessment.length}`;
}
async function answerAssessment(i){
  state.assessmentScore += 50 + ((i*17 + state.assessmentIndex*11)%51);
  state.assessmentIndex++;
  if(state.assessmentIndex<assessment.length){drawAssessment();return;}
  const score=Math.min(100,Math.round(state.assessmentScore/assessment.length));
  const level=Math.max(1,Math.min(30,Math.floor(score/4)+1));
  const stats={perception:Math.max(1,Math.round(score*.8)),intuition:Math.max(1,Math.round(score*.9)),focus:Math.max(1,Math.round(score*.7)),interpretation:Math.max(1,Math.round(score*.8)),control:Math.max(1,Math.round(score*.75))};
  const {error}=await client.rpc("save_assessment",{p_score:score,p_level:level,p_stats:stats});
  if(error){msg(error.message);return;}
  await createProfile(level,stats);
}
$("signUpBtn").onclick=signUp;
$("signInBtn").onclick=signIn;
$("normalStartBtn").onclick=()=>createProfile(1);
$("assessmentStartBtn").onclick=startAssessment;

$("logoutBtn").onclick=async()=>{await client.auth.signOut();loadProfile();};
  
client.auth.onAuthStateChange(()=>loadProfile());
loadProfile();


let focusTimerInterval = null;
let focusSeconds = 300;
let focusStarted = false;


// 5분 집중 훈련 시작
function startFocusTraining() {

  const target = document.getElementById("focusTarget").value;

  if (!target) {
    alert("집중 대상을 선택하세요.");
    return;
  }

  focusStarted = true;
  focusSeconds = 300;

  document.getElementById("selectedFocusTarget").textContent = target;

  document.getElementById("focusSetup").classList.add("hidden");
  document.getElementById("focusRunning").classList.remove("hidden");
  document.getElementById("focusResult").classList.add("hidden");

  updateFocusTimer();


  focusTimerInterval = setInterval(() => {

    focusSeconds--;

    updateFocusTimer();


    if (focusSeconds <= 0) {

      clearInterval(focusTimerInterval);

      focusTimerInterval = null;

      finishFocusTraining();
    }

  }, 1000);
}


// 타이머 화면 업데이트
function updateFocusTimer() {

  const minutes = Math.floor(focusSeconds / 60);

  const seconds = focusSeconds % 60;

  const formattedMinutes =
    String(minutes).padStart(2, "0");

  const formattedSeconds =
    String(seconds).padStart(2, "0");

  document.getElementById("focusTimer").textContent =
    formattedMinutes + ":" + formattedSeconds;
}


// 훈련 종료
function finishFocusTraining() {

  focusStarted = false;

  document.getElementById("focusRunning").classList.add("hidden");

  document.getElementById("focusResult").classList.remove("hidden");


  // 종료 알림음
  try {

    const audioContext =
      new (window.AudioContext || window.webkitAudioContext)();

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.connect(gain);

    gain.connect(audioContext.destination);

    oscillator.frequency.value = 880;

    gain.gain.value = 0.15;

    oscillator.start();

    setTimeout(() => {

      oscillator.stop();

      audioContext.close();

    }, 700);

  } catch (error) {

    console.log("알림음 재생 실패", error);

  }


  alert("5분 집중 훈련이 종료되었습니다.");
}


// 집중 훈련 결과 저장
async function completeFocusTraining() {

  const quality =
    document.getElementById("focusQuality").value;

  const obstacle =
    document.getElementById("focusObstacle").value;

  const experience =
    document.getElementById("focusExperience").value;

  const memo =
    document.getElementById("focusMemo").value;

  const target =
    document.getElementById("focusTarget").value;


  if (!quality || !obstacle || !experience) {

    document.getElementById("focusMessage").textContent =
      "집중 상태, 방해 요소, 특별한 경험을 모두 선택하세요.";

    return;
  }


  document.getElementById("focusMessage").textContent =
    "훈련 기록을 저장하고 있습니다...";


  const resultData = {

    training_type: "5분 집중 훈련",

    target: target,

    focus_quality: quality,

    obstacle: obstacle,

    experience: experience,

    memo: memo,

    completed_at:
      new Date().toISOString()

  };


  const {
    data,
    error
  } = await client.rpc(
    "complete_focus_quest",
    {
      p_result: resultData
    }
  );


  if (error) {

    console.error(error);

    document.getElementById("focusMessage").textContent =
      "저장 실패: " + error.message;

    return;
  }


  // 최신 플레이어 정보 반영
  state.profile = data;


  document.getElementById("focusMessage").textContent =
    "훈련 기록이 저장되었습니다. EXP +10";


  // 기존 게임 화면 다시 표시
  setTimeout(() => {

    document
      .getElementById("focusTrainingPanel")
      .classList.add("hidden");


    document
      .getElementById("gamePanel")
      .classList.remove("hidden");


    // 입력값 초기화
    document.getElementById("focusQuality").value = "";
    document.getElementById("focusObstacle").value = "";
    document.getElementById("focusExperience").value = "";
    document.getElementById("focusMemo").value = "";


    // 기존 플레이어 화면 갱신
    render();

  }, 1000);

}


document
  .getElementById("focusStartButton")
  .addEventListener(
    "click",
    startFocusTraining
  );


document
  .getElementById("focusCompleteButton")
  .addEventListener(
    "click",
    completeFocusTraining
  );


document
  .getElementById("focusBackButton")
  .addEventListener(
    "click",
    () => {

      document
        .getElementById("focusTrainingPanel")
        .classList.add("hidden");


      document
        .getElementById("gamePanel")
        .classList.remove("hidden");

    }
  );



function openFocusTraining() {

  // 기존 게임 화면 숨김
  document
    .getElementById("gamePanel")
    .classList.add("hidden");


  // 5분 집중 훈련 화면 표시
  document
    .getElementById("focusTrainingPanel")
    .classList.remove("hidden");


  // 시작 화면 표시
  document
    .getElementById("focusSetup")
    .classList.remove("hidden");


  // 타이머 화면 숨김
  document
    .getElementById("focusRunning")
    .classList.add("hidden");


  // 결과 화면 숨김
  document
    .getElementById("focusResult")
    .classList.add("hidden");


  // 타이머 초기화
  focusSeconds = 300;

  document
    .getElementById("focusTimer")
    .textContent = "05:00";


  // 결과 메시지 초기화
  document
    .getElementById("focusMessage")
    .textContent = "";

}



/* =========================
   감각 관찰 훈련
========================= */

let senseTimerInterval = null;
let senseSeconds = 300;
let selectedSenseExp = 10;


function openSenseTraining() {

  if (senseTimerInterval) {
    clearInterval(senseTimerInterval);
    senseTimerInterval = null;
  }

  document
    .getElementById("gamePanel")
    .classList.add("hidden");

  document
    .getElementById("senseTrainingPanel")
    .classList.remove("hidden");


  document
    .getElementById("senseSetup")
    .classList.remove("hidden");

  document
    .getElementById("senseRunning")
    .classList.add("hidden");

  document
    .getElementById("senseResult")
    .classList.add("hidden");


  document
    .getElementById("senseMessage")
    .textContent = "";


  document
    .getElementById("senseTimer")
    .textContent = "05:00";

}


function startSenseTraining() {

  const target =
    document.getElementById("senseTarget").value;

  const duration =
    Number(
      document.getElementById("senseDuration").value
    );


  if (!target) {
    alert("관찰 대상을 선택하세요.");
    return;
  }


  if (!duration) {
    alert("훈련 시간을 선택하세요.");
    return;
  }


  if (senseTimerInterval) {
    return;
  }


  senseSeconds = duration;


  // 시간에 따른 EXP
  if (duration === 180) {
    selectedSenseExp = 5;
  }

  else if (duration === 300) {
    selectedSenseExp = 10;
  }

  else if (duration === 600) {
    selectedSenseExp = 20;
  }


  document
    .getElementById("selectedSenseTarget")
    .textContent = target;


  document
    .getElementById("senseSetup")
    .classList.add("hidden");

  document
    .getElementById("senseRunning")
    .classList.remove("hidden");

  document
    .getElementById("senseResult")
    .classList.add("hidden");


  updateSenseTimer();


  senseTimerInterval = setInterval(() => {

    senseSeconds--;

    updateSenseTimer();


    if (senseSeconds <= 0) {

      clearInterval(senseTimerInterval);

      senseTimerInterval = null;

      finishSenseTraining();

    }

  }, 1000);

}


function updateSenseTimer() {

  const minutes =
    Math.floor(senseSeconds / 60);

  const seconds =
    senseSeconds % 60;


  document
    .getElementById("senseTimer")
    .textContent =
      String(minutes).padStart(2, "0")
      + ":"
      + String(seconds).padStart(2, "0");

}


function finishSenseTraining() {

  document
    .getElementById("senseRunning")
    .classList.add("hidden");

  document
    .getElementById("senseResult")
    .classList.remove("hidden");


  playSelectedSenseSound();

}


function playSelectedSenseSound() {

  const sound =
    document.getElementById("senseSound").value;


  if (sound === "silent") {
    return;
  }


  try {

    const audioContext =
      new (
        window.AudioContext
        || window.webkitAudioContext
      )();


    const gain =
      audioContext.createGain();

    gain.connect(audioContext.destination);

    gain.gain.value = 0.15;


    let frequency = 660;
    let duration = 0.6;


    if (sound === "high") {
      frequency = 1100;
    }

    else if (sound === "low") {
      frequency = 440;
    }

    else if (sound === "bell") {
      frequency = 880;
    }


    function playTone(
      freq,
      startTime,
      toneDuration
    ) {

      const oscillator =
        audioContext.createOscillator();

      oscillator.frequency.value = freq;

      oscillator.connect(gain);

      oscillator.start(startTime);

      oscillator.stop(
        startTime + toneDuration
      );

    }


    if (sound === "double") {

      const now =
        audioContext.currentTime;

      playTone(
        880,
        now,
        0.25
      );

      playTone(
        880,
        now + 0.4,
        0.25
      );


      setTimeout(() => {
        audioContext.close();
      }, 1000);

    }

    else {

      const oscillator =
        audioContext.createOscillator();

      oscillator.frequency.value =
        frequency;

      oscillator.connect(gain);

      oscillator.start();

      oscillator.stop(
        audioContext.currentTime
        + duration
      );


      setTimeout(() => {
        audioContext.close();
      }, 1000);

    }

  }

  catch (error) {
    console.log(
      "알림음 재생 실패",
      error
    );
  }

}


async function completeSenseTraining() {

  const target =
    document.getElementById("senseTarget").value;

  const duration =
    Number(
      document.getElementById("senseDuration").value
    );

  const discovery =
    document.getElementById("senseDiscovery").value;

  const difficulty =
    document.getElementById("senseDifficulty").value;

  const memo =
    document.getElementById("senseMemo").value;


  if (!discovery || !difficulty) {

    document
      .getElementById("senseMessage")
      .textContent =
        "관찰 결과와 어려웠던 점을 선택하세요.";

    return;
  }


  document
    .getElementById("senseCompleteButton")
    .disabled = true;

  document
    .getElementById("senseMessage")
    .textContent =
      "훈련 기록을 저장하고 있습니다...";


  const resultData = {

    training_type:
      "감각 관찰",

    target: target,

    duration_seconds:
      duration,

    discovery:
      discovery,

    difficulty:
      difficulty,

    memo:
      memo,

    completed_at:
      new Date().toISOString()

  };


  const {
    data,
    error
  } = await client.rpc(
    "complete_sense_observation_quest",
    {
      p_result: resultData,
      p_exp: selectedSenseExp
    }
  );


  document
    .getElementById("senseCompleteButton")
    .disabled = false;


  if (error) {

    console.error(error);

    document
      .getElementById("senseMessage")
      .textContent =
        "저장 실패: "
        + error.message;

    return;
  }


  state.profile = data;


  document
    .getElementById("senseMessage")
    .textContent =
      `훈련 기록이 저장되었습니다. EXP +${selectedSenseExp}`;


  setTimeout(() => {

    document
      .getElementById("senseTrainingPanel")
      .classList.add("hidden");


    document
      .getElementById("gamePanel")
      .classList.remove("hidden");


    document
      .getElementById("senseDiscovery")
      .value = "";

    document
      .getElementById("senseDifficulty")
      .value = "";

    document
      .getElementById("senseMemo")
      .value = "";


    render();

  }, 1000);

}


document
  .getElementById("senseStartButton")
  .addEventListener(
    "click",
    startSenseTraining
  );


document
  .getElementById("senseCompleteButton")
  .addEventListener(
    "click",
    completeSenseTraining
  );


document
  .getElementById("senseBackButton")
  .addEventListener(
    "click",
    () => {

      if (senseTimerInterval) {
        clearInterval(senseTimerInterval);
        senseTimerInterval = null;
      }


      document
        .getElementById("senseTrainingPanel")
        .classList.add("hidden");


      document
        .getElementById("gamePanel")
        .classList.remove("hidden");

    }
  );


/* =========================================
   REMOTE VIEWING
   The target path never enters the browser until submit_rv_session succeeds.
========================================= */

let currentRvSessionId = null;
let currentRvTargetCode = null;

const rvFieldIds = [
  "rvFormDescription", "rvColorDescription", "rvTextureDescription",
  "rvTemperatureDescription", "rvMovementDescription",
  "rvEnvironmentDescription", "rvFreeDescription"
];

function rvElement(id) {
  return document.getElementById(id);
}

function setRvMessage(id, value) {
  const element = rvElement(id);
  if (element) element.textContent = value || "";
}

function showRvStep(stepId) {
  ["rvSetup", "rvObservation", "rvReveal"].forEach((id) => {
    const element = rvElement(id);
    if (element) element.classList.toggle("hidden", id !== stepId);
  });
}

function resetRvFields() {
  rvFieldIds.forEach((id) => {
    const field = rvElement(id);
    if (field) field.value = "";
  });
  const image = rvElement("rvTargetImage");
  if (image) image.removeAttribute("src");
}

function openRemoteViewing() {
  const gamePanel = rvElement("gamePanel");
  const panel = rvElement("remoteViewingTrainingPanel");
  if (!gamePanel || !panel) return;

  gamePanel.classList.add("hidden");
  panel.classList.remove("hidden");
  currentRvSessionId = null;
  currentRvTargetCode = null;
  resetRvFields();
  setRvMessage("rvMessage", "");
  setRvMessage("rvObservationMessage", "");
  showRvStep("rvSetup");
}

async function startRemoteViewingSession() {
  const button = rvElement("rvStartButton");
  if (button) button.disabled = true;
  setRvMessage("rvMessage", "타겟을 안전하게 생성하고 있습니다...");

  const { data, error } = await client.rpc("create_rv_session");
  if (button) button.disabled = false;
  if (error) {
    console.error("create_rv_session failed", error);
    setRvMessage("rvMessage", "타겟 생성 실패: " + error.message);
    return;
  }

  const session = Array.isArray(data) ? data[0] : data;
  if (!session || !session.session_id || !session.target_code) {
    setRvMessage("rvMessage", "서버가 올바른 타겟 세션을 반환하지 않았습니다.");
    return;
  }

  currentRvSessionId = session.session_id;
  currentRvTargetCode = session.target_code;
  rvElement("rvObservationTargetCode").textContent = currentRvTargetCode;
  rvElement("rvTargetCode").textContent = currentRvTargetCode;
  showRvStep("rvObservation");
}

function readRvObservation() {
  return {
    p_form_description: rvElement("rvFormDescription").value.trim(),
    p_color_description: rvElement("rvColorDescription").value.trim(),
    p_texture_description: rvElement("rvTextureDescription").value.trim(),
    p_temperature_description: rvElement("rvTemperatureDescription").value.trim(),
    p_movement_description: rvElement("rvMovementDescription").value.trim(),
    p_environment_description: rvElement("rvEnvironmentDescription").value.trim(),
    p_free_description: rvElement("rvFreeDescription").value.trim()
  };
}

async function submitRemoteViewingSession() {
  if (!currentRvSessionId) {
    setRvMessage("rvObservationMessage", "유효한 세션이 없습니다. 새 타겟을 생성하세요.");
    return;
  }
  const observation = readRvObservation();
  if (!Object.values(observation).some(Boolean)) {
    setRvMessage("rvObservationMessage", "관찰 기록을 한 항목 이상 입력하세요.");
    return;
  }

  const button = rvElement("rvSubmitButton");
  button.disabled = true;
  setRvMessage("rvObservationMessage", "기록을 저장하고 타겟을 공개하고 있습니다...");

  const { data, error } = await client.rpc("submit_rv_session", {
    p_session_id: currentRvSessionId,
    ...observation
  });
  if (error) {
    button.disabled = false;
    console.error("submit_rv_session failed", error);
    setRvMessage("rvObservationMessage", "제출 실패: " + error.message);
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.storage_path) {
    button.disabled = false;
    setRvMessage("rvObservationMessage", "공개할 타겟 정보를 받지 못했습니다.");
    return;
  }

  // The Storage policy permits this only after the session is revealed.
  const { data: signed, error: signedError } = await client.storage
    .from("rv-images")
    .createSignedUrl(result.storage_path, 600);
  if (signedError || !signed?.signedUrl) {
    button.disabled = false;
    console.error("Signed URL creation failed", signedError);
    setRvMessage("rvObservationMessage", "타겟은 공개되었지만 이미지를 불러오지 못했습니다. 다시 시도하세요.");
    return;
  }

  rvElement("rvRevealedTargetCode").textContent = result.target_code || currentRvTargetCode;
  rvElement("rvTargetTitle").textContent = result.source_title || "REMOTE VIEWING TARGET";
  const image = rvElement("rvTargetImage");
  image.onerror = () => setRvMessage("rvObservationMessage", "이미지를 불러오지 못했습니다. 잠시 후 다시 시도하세요.");
  image.src = signed.signedUrl;
  ["Form", "Color", "Texture", "Temperature", "Movement", "Environment", "Free"].forEach((name) => {
    rvElement("rvResult" + name).textContent = observation["p_" + ({ Form: "form_description", Color: "color_description", Texture: "texture_description", Temperature: "temperature_description", Movement: "movement_description", Environment: "environment_description", Free: "free_description" })[name]] || "—";
  });
  button.disabled = false;
  currentRvSessionId = null;
  showRvStep("rvReveal");
}

async function cancelRemoteViewing() {
  if (currentRvSessionId) {
    const { error } = await client.rpc("cancel_rv_session", { p_session_id: currentRvSessionId });
    if (error) console.warn("cancel_rv_session failed", error);
  }
  currentRvSessionId = null;
  currentRvTargetCode = null;
  rvElement("remoteViewingTrainingPanel").classList.add("hidden");
  rvElement("gamePanel").classList.remove("hidden");
  render();
}

function finishRemoteViewing() {
  currentRvSessionId = null;
  currentRvTargetCode = null;
  rvElement("remoteViewingTrainingPanel").classList.add("hidden");
  rvElement("gamePanel").classList.remove("hidden");
  render();
}

rvElement("openRemoteViewingButton")?.addEventListener("click", openRemoteViewing);
rvElement("rvStartButton")?.addEventListener("click", startRemoteViewingSession);
rvElement("rvSubmitButton")?.addEventListener("click", submitRemoteViewingSession);
rvElement("rvBackButton")?.addEventListener("click", cancelRemoteViewing);
rvElement("rvCancelButton")?.addEventListener("click", cancelRemoteViewing);
rvElement("rvFinishButton")?.addEventListener("click", finishRemoteViewing);

})();

