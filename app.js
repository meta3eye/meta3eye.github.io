const cfg = window.SPIRIT_CONFIG || {};
const client = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);
const state = { user:null, profile:null, assessmentIndex:0, assessmentScore:0 };

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

renderAwakeningSystem();
  
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

const QUEST_LIMITS = {
  focus_5: 3,
  sense_observation: 3,

  intuition_choice: 5,
  emotion_guess: 3,
  life_death: 3
};


function getTodayStart() {

  const now = new Date();

  now.setHours(
    0,
    0,
    0,
    0
  );

  return now.toISOString();

}


async function loadQuests() {

  const playerLevel =
    state.profile.level;


  const { data: quests, error: questError } =
    await client
      .from("quest_defs")
      .select("*")
      .eq("active", true)
      .lte("min_level", playerLevel)
      .order("min_level");


  if (questError) {

    $("questList").textContent =
      questError.message;

    return;
  }


  const { data: todayLogs, error: logError } =
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
    (todayLogs || [])
  ) {

    todayCount[log.quest_code] =
      (
        todayCount[log.quest_code] || 0
      ) + 1;

  }


  const levelTestReady =
    state.profile.level_test_available === true;


  if (levelTestReady) {

    $("questNotice").textContent =
      `LV.${state.profile.pending_level} 승급 시험을 통과해야 훈련을 계속할 수 있습니다.`;

  }

  else {

    $("questNotice").textContent = "";

  }


  $("questList").innerHTML =
    quests.map(q => {


      const maxCount =
        QUEST_LIMITS[q.code] || 1;


      const currentCount =
        todayCount[q.code] || 0;


      const limitReached =
        currentCount >= maxCount;


      const questLocked =
        levelTestReady || limitReached;


      let buttonText = "수행";


      if (levelTestReady) {

        buttonText =
          "승급 시험 필요";

      }

      else if (limitReached) {

        buttonText =
          "오늘 완료";

      }


      // -------------------------
      // 5분 집중 훈련
      // -------------------------

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


      // -------------------------
      // 감각 관찰
      // -------------------------

      if (q.code === "sense_observation") {

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


      // -------------------------
      // 나머지 퀘스트
      // -------------------------

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

    }).join("");


  document
    .querySelector(".focus-quest-button")
    ?.addEventListener(
      "click",
      openFocusTraining
    );


  document
    .querySelector(".sense-quest-button")
    ?.addEventListener(
      "click",
      openSenseTraining
    );


  $("questList")
    .querySelectorAll("[data-code]")
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
