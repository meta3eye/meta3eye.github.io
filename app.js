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
  $("levelValue").textContent=`LV.${p.level}`;
  $("statusValue").textContent=p.status;
  const need=xpNeeded(p.level), pct=Math.min(100,(p.exp/need)*100);
  $("xpFill").style.width=`${pct}%`;
  $("xpText").textContent=`EXP ${p.exp} / ${need}`;
  const stats=[["감지력",p.perception],["직관력",p.intuition],["집중력",p.focus],["해석력",p.interpretation],["통제력",p.control]];
  $("stats").innerHTML=stats.map(x=>`<div class="stat"><span class="label">${x[0]}</span><b>${x[1]}</b></div>`).join("");
  $("record").innerHTML=[
    ["최고 레벨",`LV.${p.highest_level}`],["연속 훈련",`${p.streak_days}일`],
    ["상태",p.status],["생성일",new Date(p.created_at).toLocaleDateString("ko-KR")]
  ].map(x=>`<div class="record-item"><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
  loadQuests();
}
async function loadQuests(){
  const {data,error}=await client.from("quest_defs").select("*").eq("active",true).lte("min_level",state.profile.level).order("min_level");
  if(error){$("questList").textContent=error.message;return;}
  $("questList").innerHTML=data.map(q=>`
    <div class="quest">
      <div><h3>${q.title}</h3><p>${q.grade}-RANK · 기본 EXP ${q.base_exp}</p></div>
      <button data-code="${q.code}" data-exp="${q.base_exp}">수행</button>
    </div>`).join("");
  $("questList").querySelectorAll("button").forEach(b=>b.onclick=()=>completeQuest(b.dataset.code,Number(b.dataset.exp)));
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
