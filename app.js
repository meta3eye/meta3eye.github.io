const cfg = window.SPIRIT_CONFIG || {};
const client = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);
const state = { user: null, profile: null, assessmentIndex: 0, assessmentScore: 0, rankTestIndex: 0, rankTestAnswers: [] };
const assessment = [
  { q: "정보가 거의 없는 두 선택지 중 하나를 골라야 합니다. 어느 쪽을 선택하시겠습니까?", c: ["A", "B"] },
  { q: "짧은 시간 동안 여러 자극이 나타났습니다. 가장 먼저 눈에 들어온 것을 고르세요.", c: ["첫 번째", "두 번째", "세 번째", "네 번째"] },
  { q: "처음 본 장소에서 가장 강하게 느껴지는 인상을 하나 고르세요.", c: ["편안함", "긴장감", "낯섦", "무감각"] },
  { q: "답을 오래 생각하지 않고 즉시 하나를 선택하세요.", c: ["1", "2", "3", "4"] },
  { q: "마지막 질문입니다. 지금 가장 먼저 떠오르는 선택지를 고르세요.", c: ["A", "B", "C", "D"] }
];
const AWAKENING_PATHS = { sensory: { name: "SENSORY PATH" }, intuitive: { name: "INTUITIVE PATH" }, focus: { name: "FOCUS PATH" }, interpreter: { name: "INTERPRETATION PATH" }, control: { name: "CONTROL PATH" } };
const QUEST_AWAKENING_EFFECT = { focus_5: { focus: 12, control: 4 }, sense_observation: { sensory: 12, focus: 3 }, intuition_choice: { intuitive: 12 }, emotion_guess: { interpreter: 8, intuitive: 5 }, life_death: { sensory: 10, intuitive: 10 } };
const QUEST_LIMITS = { focus_5: 3, sense_observation: 3, intuition_choice: 5, emotion_guess: 3, life_death: 3 };
const RANK_ORDER = ["D", "C", "B", "A", "S"];
const D_TO_C_PROMOTION_TEST = [
  { objective: "집중력 판별", question: "다음 안내를 읽은 뒤, 5초 동안 화면의 중앙에 집중하십시오. 준비가 되면 다음 단계로 진행하십시오.", choices: [{ text: "준비 완료", correct: true }] },
  { objective: "감각 관찰", question: "지금 이 순간 주변 환경에서 평소에는 의식하지 않았던 소리나 감각을 하나 선택하십시오.", choices: ["소리", "신체 감각", "온도 변화", "특별한 감각 없음"].map(text => ({ text, correct: true })) },
  { objective: "직관 선택", question: "아래 네 개의 선택지 중 가장 먼저 떠오르는 하나를 선택하십시오. 오래 고민하지 마십시오.", choices: ["A", "B", "C", "D"].map(text => ({ text, correct: true })) }
];

function show(id, visible = true) { const el = $(id); if (el) el.classList.toggle("hidden", !visible); }
function msg(text) { const el = $("authMessage"); if (el) el.textContent = text || ""; }
function xpNeeded(level) { return 100 + (level - 1) * 40; }
function getTodayStart() { const date = new Date(); date.setHours(0, 0, 0, 0); return date.toISOString(); }
function getNextRank(rank) { const i = RANK_ORDER.indexOf(rank || "D"); return i < 0 ? "C" : (i < RANK_ORDER.length - 1 ? RANK_ORDER[i + 1] : null); }

async function loadProfile() {
  const { data: { user } } = await client.auth.getUser(); state.user = user;
  if (!user) { state.profile = null; show("authPanel"); show("startPanel", false); show("gamePanel", false); if ($("authState")) $("authState").textContent = "로그인 필요"; return; }
  if ($("authState")) $("authState").textContent = user.email;
  const { data, error } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) return msg(error.message);
  state.profile = data; show("authPanel", false); show("startPanel", !data); show("gamePanel", !!data); if (data) render();
}
async function signUp() { const email = $("email").value.trim(), password = $("password").value; if (!email || password.length < 6) return msg("이메일과 6자 이상의 비밀번호를 입력하세요."); const { error } = await client.auth.signUp({ email, password }); msg(error ? error.message : "가입 요청 완료. 이메일 확인이 필요한 경우 메일함을 확인하세요."); }
async function signIn() { const email = $("email").value.trim(), password = $("password").value; const { error } = await client.auth.signInWithPassword({ email, password }); msg(error ? error.message : ""); }
async function createProfile(level = 1, stats = null) { const s = stats || { perception: 1, intuition: 1, focus: 1, interpretation: 1, control: 1 }; const { data, error } = await client.rpc("create_player", { p_player_name: "PLAYER", p_level: level, p_perception: s.perception, p_intuition: s.intuition, p_focus: s.focus, p_interpretation: s.interpretation, p_control: s.control }); if (error) return msg(error.message); state.profile = data; show("startPanel", false); show("assessmentPanel", false); show("gamePanel"); render(); }

function render() {
  const p = state.profile; if (!p) return; const need = xpNeeded(p.level), pct = Math.min(100, (p.exp / need) * 100);
  if ($("rankValue")) $("rankValue").textContent = `${p.rank || "D"}-RANK`; if ($("levelValue")) $("levelValue").textContent = `LV.${p.level}`; if ($("statusValue")) $("statusValue").textContent = p.status;
  if ($("xpFill")) $("xpFill").style.width = `${pct}%`; if ($("xpText")) $("xpText").textContent = p.level_test_available ? `EXP ${need} / ${need} · LEVEL TEST AVAILABLE` : `EXP ${p.exp} / ${need}`;
  if ($("stats")) $("stats").innerHTML = [["감지력", p.perception], ["직관력", p.intuition], ["집중력", p.focus], ["해석력", p.interpretation], ["통제력", p.control]].map(([n, v]) => `<div class="stat"><span class="label">${n}</span><b>${v}</b></div>`).join("");
  if ($("record")) $("record").innerHTML = [["최고 레벨", `LV.${p.highest_level}`], ["연속 훈련", `${p.streak_days}일`], ["상태", p.status], ["생성일", new Date(p.created_at).toLocaleDateString("ko-KR")]].map(([n, v]) => `<div class="record-item"><span>${n}</span><b>${v}</b></div>`).join("");
  loadQuests(); renderNextUnlock(); renderAwakeningSystem(); renderRankPromotion();
}

async function calculateAwakeningPaths() { const paths = { sensory: 0, intuitive: 0, focus: 0, interpreter: 0, control: 0 }; if (!state.user) return paths; const { data, error } = await client.from("quest_logs").select("quest_code").eq("user_id", state.user.id); if (error) { console.error("Awakening analysis error:", error); return paths; } for (const log of data || []) for (const key in QUEST_AWAKENING_EFFECT[log.quest_code] || {}) paths[key] += QUEST_AWAKENING_EFFECT[log.quest_code][key]; return paths; }
function getPrimaryAwakening(paths) { const [top, second] = Object.entries(paths).sort((a, b) => b[1] - a[1]); if (!top || top[1] < 30) return { type: "UNKNOWN", description: "아직 충분한 훈련 데이터가 없습니다. 여러 유형의 훈련을 계속하십시오." }; return { type: AWAKENING_PATHS[top[0]].name, description: top[1] >= 100 && top[1] - second[1] >= 25 ? "특정 성장 경로에서 반복적으로 높은 성장 패턴이 감지되고 있습니다." : "특정 능력 계열에서 성장 가능성이 높게 나타나고 있습니다. 추가 훈련과 검증이 필요합니다." }; }
async function renderAwakeningSystem() { const paths = await calculateAwakeningPaths(), analysis = getPrimaryAwakening(paths), maxValue = Math.max(...Object.values(paths), 1); if ($("primaryTypeValue")) $("primaryTypeValue").textContent = analysis.type; if ($("awakeningDescription")) $("awakeningDescription").textContent = analysis.description; if ($("awakeningStatus")) $("awakeningStatus").textContent = Object.values(paths).some(Boolean) ? "ANALYZING" : "DATA REQUIRED"; if ($("potentialPaths")) $("potentialPaths").innerHTML = Object.entries(paths).sort((a, b) => b[1] - a[1]).map(([key, value]) => `<div class="potential-path"><div class="potential-path-name">${AWAKENING_PATHS[key].name}</div><div class="potential-path-value">${value}</div><div class="potential-bar"><div style="width:${Math.round(value / maxValue * 100)}%"></div></div></div>`).join(""); }

function getNextUnlock(rank, level) { const unlocks = { D: [[5,"훈련 기록 분석","훈련 기록을 통해 초기 성장 패턴이 분석됩니다."],[10,"첫 번째 능력 분석","특정 능력 계열의 성장 가능성이 표시됩니다."],[20,"잠재 경로 감지","현재 가장 강하게 성장하고 있는 능력 경로를 확인할 수 있습니다."],[30,"직관 훈련 해금","새로운 정답형 훈련이 해금됩니다."],[50,"AWAKENING ANALYSIS","주요 성장 경로가 본격적으로 분석됩니다."],[100,"D-RANK PROMOTION TEST","C-RANK 진입을 위한 승급 시험에 도전할 수 있습니다."]], C: [[10,"고급 직관 훈련","제한된 정보에서 선택하는 훈련이 강화됩니다."],[50,"SPECIALIZATION DETECTION","특정 능력 계열의 세부 특화 가능성이 분석됩니다."],[100,"C-RANK PROMOTION TEST","B-RANK 승급 시험이 준비됩니다."]], B: [[30,"BLIND TEST","정답을 사전에 알 수 없는 검증형 테스트가 강화됩니다."],[100,"B-RANK PROMOTION TEST","A-RANK 진입을 위한 고난도 시험입니다."]], A: [[50,"ADVANCED VERIFICATION","복수 능력을 동시에 검증하는 고난도 테스트가 열립니다."],[100,"A-RANK PROMOTION TEST","최고 랭크 진입 시험에 도전할 수 있습니다."]], S: [[100,"MASTER RECORD","S-RANK 최종 성장 기록이 완성됩니다."]] }; const item = (unlocks[rank || "D"] || []).find(x => x[0] > level); return item ? { level: item[0], title: item[1], description: item[2] } : { level: 100, title: "UNKNOWN", description: "다음 성장 데이터가 아직 분석되지 않았습니다." }; }
function renderNextUnlock() { if (!state.profile) return; const next = getNextUnlock(state.profile.rank, state.profile.level); if ($("nextUnlockTitle")) $("nextUnlockTitle").textContent = `LV.${next.level} · ${next.title}`; if ($("nextUnlockDescription")) $("nextUnlockDescription").textContent = next.description; }

function renderRankPromotion() { const p = state.profile, panel = $("rankTestPanel"); if (!p || !panel) return; const next = getNextRank(p.rank); if (!next || p.level < 100) return panel.classList.add("hidden"); if ($("promotionCurrentRank")) $("promotionCurrentRank").textContent = `${p.rank || "D"}-RANK`; if ($("promotionNextRank")) $("promotionNextRank").textContent = `${next}-RANK`; panel.classList.remove("hidden"); }
function startRankTest() { if (!state.profile || state.profile.level < 100) return alert("LV.100에 도달해야 승급시험에 도전할 수 있습니다."); state.rankTestIndex = 0; state.rankTestAnswers = []; show("rankTestPanel", false); show("rankTestRunningPanel"); renderRankTestQuestion(); }
function renderRankTestQuestion() { const test = D_TO_C_PROMOTION_TEST[state.rankTestIndex]; if (!test) return finishRankTest(); const total = D_TO_C_PROMOTION_TEST.length, rank = state.profile.rank || "D"; $("rankTestTitle").textContent = `${rank}-RANK PROMOTION TEST`; $("rankTestProgress").textContent = `TEST ${state.rankTestIndex + 1} / ${total}`; $("rankTestObjective").textContent = test.objective; $("rankTestQuestion").textContent = test.question; $("rankTestMessage").textContent = ""; $("rankTestChoices").innerHTML = test.choices.map((choice, i) => `<button class="rank-test-choice" data-choice="${i}">${choice.text}</button>`).join(""); $("rankTestChoices").querySelectorAll("button").forEach(button => button.onclick = () => { state.rankTestAnswers.push({ question: state.rankTestIndex, choice: Number(button.dataset.choice) }); state.rankTestIndex++; renderRankTestQuestion(); }); }
function finishRankTest() { show("rankTestRunningPanel", false); const panel = $("rankTestPanel"), current = state.profile.rank || "D", next = getNextRank(current); panel.classList.remove("hidden"); panel.innerHTML = `<div class="section-title"><h2>TEST COMPLETE</h2><span class="muted">RESULT PENDING</span></div><div class="rank-test-header"><div class="rank-test-current"><span class="label">CURRENT RANK</span><strong>${current}-RANK</strong></div><div class="rank-test-arrow">→</div><div class="rank-test-next"><span class="label">TARGET RANK</span><strong>${next}-RANK</strong></div></div><div class="rank-test-description"><p>승급시험이 완료되었습니다.</p><p class="muted">현재는 시험 진행 구조를 확인하는 단계입니다. 실제 PASS / FAIL 판정은 다음 단계에서 연결됩니다.</p></div><button id="rankTestRetryButton">시험 다시 확인하기</button>`; $("rankTestRetryButton").onclick = startRankTest; }

async function loadQuests() { if (!state.profile) return; const { data: quests, error } = await client.from("quest_defs").select("*").eq("active", true).lte("min_level", state.profile.level).order("min_level"); if (error) { if ($("questList")) $("questList").textContent = error.message; return; } const { data: logs } = await client.from("quest_logs").select("quest_code").gte("completed_at", getTodayStart()); const counts = {}; for (const log of logs || []) counts[log.quest_code] = (counts[log.quest_code] || 0) + 1; const blocked = state.profile.level_test_available === true; if ($("questNotice")) $("questNotice").textContent = blocked ? `LV.${state.profile.pending_level} 승급 시험을 통과해야 훈련을 계속할 수 있습니다.` : ""; $("questList").innerHTML = (quests || []).map(q => { const count = counts[q.code] || 0, limit = QUEST_LIMITS[q.code] || 1, disabled = blocked || count >= limit, cls = q.code === "focus_5" ? "focus-quest-button" : q.code === "sense_observation" ? "sense-quest-button" : "", attrs = cls ? `class="${cls}"` : `data-code="${q.code}" data-exp="${q.base_exp}"`; return `<div class="quest"><div><h3>${q.title}</h3><p>${q.grade}-RANK · 기본 EXP ${q.base_exp}</p><p class="quest-count">오늘 ${count} / ${limit}회</p></div><button ${attrs} ${disabled ? "disabled" : ""}>${blocked ? "승급 시험 필요" : disabled ? "오늘 완료" : "수행"}</button></div>`; }).join(""); $("questList").querySelector(".focus-quest-button")?.addEventListener("click", openFocusTraining); $("questList").querySelector(".sense-quest-button")?.addEventListener("click", openSenseTraining); $("questList").querySelectorAll("[data-code]").forEach(b => b.onclick = () => completeQuest(b.dataset.code, Number(b.dataset.exp))); }
async function completeQuest(code, exp) { const { data, error } = await client.rpc("complete_simple_quest", { p_quest_code: code, p_exp: exp }); if (error) { $("questNotice").textContent = error.message; return; } state.profile = data; $("questNotice").textContent = `${code} 완료 · EXP +${exp}`; render(); }

function startAssessment() { state.assessmentIndex = 0; state.assessmentScore = 0; show("startPanel", false); show("assessmentPanel"); show("gamePanel", false); drawAssessment(); }
function drawAssessment() { const a = assessment[state.assessmentIndex]; $("assessmentQuestion").textContent = a.q; $("assessmentChoices").innerHTML = a.c.map((text, i) => `<button data-i="${i}">${text}</button>`).join(""); $("assessmentChoices").querySelectorAll("button").forEach(b => b.onclick = () => answerAssessment(Number(b.dataset.i))); $("assessmentProgress").textContent = `TEST ${state.assessmentIndex + 1} / ${assessment.length}`; }
async function answerAssessment(i) { state.assessmentScore += 50 + ((i * 17 + state.assessmentIndex * 11) % 51); state.assessmentIndex++; if (state.assessmentIndex < assessment.length) return drawAssessment(); const score = Math.min(100, Math.round(state.assessmentScore / assessment.length)), level = Math.max(1, Math.min(30, Math.floor(score / 4) + 1)), stats = { perception: Math.max(1, Math.round(score * .8)), intuition: Math.max(1, Math.round(score * .9)), focus: Math.max(1, Math.round(score * .7)), interpretation: Math.max(1, Math.round(score * .8)), control: Math.max(1, Math.round(score * .75)) }; const { error } = await client.rpc("save_assessment", { p_score: score, p_level: level, p_stats: stats }); if (error) return msg(error.message); createProfile(level, stats); }

let focusTimerInterval = null, focusSeconds = 300, senseTimerInterval = null, senseSeconds = 300, selectedSenseExp = 10;
function formatTimer(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function openFocusTraining() { show("gamePanel", false); show("focusTrainingPanel"); show("focusSetup"); show("focusRunning", false); show("focusResult", false); focusSeconds = 300; $("focusTimer").textContent = "05:00"; $("focusMessage").textContent = ""; }
function startFocusTraining() { const target = $("focusTarget").value; if (!target) return alert("집중 대상을 선택하세요."); focusSeconds = 300; $("selectedFocusTarget").textContent = target; show("focusSetup", false); show("focusRunning"); show("focusResult", false); clearInterval(focusTimerInterval); focusTimerInterval = setInterval(() => { $("focusTimer").textContent = formatTimer(--focusSeconds); if (focusSeconds <= 0) { clearInterval(focusTimerInterval); focusTimerInterval = null; finishFocusTraining(); } }, 1000); }
function finishFocusTraining() { show("focusRunning", false); show("focusResult"); alert("5분 집중 훈련이 종료되었습니다."); }
async function completeFocusTraining() { const quality = $("focusQuality").value, obstacle = $("focusObstacle").value, experience = $("focusExperience").value; if (!quality || !obstacle || !experience) return $("focusMessage").textContent = "집중 상태, 방해 요소, 실제 경험을 모두 선택하세요."; const result = { training_type: "5분 집중 훈련", target: $("focusTarget").value, focus_quality: quality, obstacle, experience, memo: $("focusMemo").value, completed_at: new Date().toISOString() }; const { data, error } = await client.rpc("complete_focus_quest", { p_result: result }); if (error) return $("focusMessage").textContent = `저장 실패: ${error.message}`; state.profile = data; $("focusMessage").textContent = "훈련 기록이 저장되었습니다. EXP +10"; setTimeout(() => { show("focusTrainingPanel", false); show("gamePanel"); render(); }, 1000); }
function openSenseTraining() { clearInterval(senseTimerInterval); senseTimerInterval = null; show("gamePanel", false); show("senseTrainingPanel"); show("senseSetup"); show("senseRunning", false); show("senseResult", false); $("senseTimer").textContent = "05:00"; $("senseMessage").textContent = ""; }
function startSenseTraining() { const target = $("senseTarget").value, duration = Number($("senseDuration").value); if (!target || !duration) return alert("관찰 대상과 훈련 시간을 선택하세요."); selectedSenseExp = duration === 180 ? 5 : duration === 600 ? 20 : 10; senseSeconds = duration; $("selectedSenseTarget").textContent = target; show("senseSetup", false); show("senseRunning"); senseTimerInterval = setInterval(() => { $("senseTimer").textContent = formatTimer(--senseSeconds); if (senseSeconds <= 0) { clearInterval(senseTimerInterval); senseTimerInterval = null; show("senseRunning", false); show("senseResult"); } }, 1000); }
async function completeSenseTraining() { const discovery = $("senseDiscovery").value, difficulty = $("senseDifficulty").value; if (!discovery || !difficulty) return $("senseMessage").textContent = "관찰 결과와 어려웠던 점을 선택하세요."; const result = { training_type: "감각 관찰 훈련", target: $("senseTarget").value, duration_seconds: Number($("senseDuration").value), discovery, difficulty, memo: $("senseMemo").value, completed_at: new Date().toISOString() }; const { data, error } = await client.rpc("complete_sense_observation_quest", { p_result: result, p_exp: selectedSenseExp }); if (error) return $("senseMessage").textContent = `저장 실패: ${error.message}`; state.profile = data; $("senseMessage").textContent = `훈련 기록이 저장되었습니다. EXP +${selectedSenseExp}`; setTimeout(() => { show("senseTrainingPanel", false); show("gamePanel"); render(); }, 1000); }

function bind(id, fn) { $(id)?.addEventListener("click", fn); }
bind("signUpBtn", signUp); bind("signInBtn", signIn); bind("normalStartBtn", () => createProfile(1)); bind("assessmentStartBtn", startAssessment); bind("rankTestStartButton", startRankTest); bind("logoutBtn", async () => { await client.auth.signOut(); loadProfile(); });
bind("focusStartButton", startFocusTraining); bind("focusCompleteButton", completeFocusTraining); bind("focusBackButton", () => { clearInterval(focusTimerInterval); show("focusTrainingPanel", false); show("gamePanel"); });
bind("senseStartButton", startSenseTraining); bind("senseCompleteButton", completeSenseTraining); bind("senseBackButton", () => { clearInterval(senseTimerInterval); show("senseTrainingPanel", false); show("gamePanel"); });
client.auth.onAuthStateChange(() => loadProfile()); loadProfile();

/* =========================================
   REMOTE VIEWING SYSTEM
========================================= */

let currentRvSessionId = null;


/* =========================================
   리모트뷰잉 화면 열기
========================================= */

function openRemoteViewing() {

  const gamePanel =
    document.getElementById("gamePanel");

  const rvTrainingPanel =
    document.getElementById("rvTrainingPanel");

  if (!gamePanel || !rvTrainingPanel) {
    console.error(
      "리모트뷰잉 화면 요소를 찾을 수 없습니다."
    );
    return;
  }


  gamePanel.classList.add("hidden");

  rvTrainingPanel.classList.remove("hidden");


  /*
    시작 화면 표시
  */

  document
    .getElementById("rvSetup")
    .classList.remove("hidden");


  /*
    관찰 화면 숨김
  */

  document
    .getElementById("rvObservation")
    .classList.add("hidden");


  /*
    결과 화면 숨김
  */

  document
    .getElementById("rvResult")
    .classList.add("hidden");


  /*
    메시지 초기화
  */

  document
    .getElementById("rvSetupMessage")
    .textContent = "";


  /*
    이전 세션 초기화
  */

  currentRvSessionId = null;

}


/* =========================================
   리모트뷰잉 타겟 생성
========================================= */

async function startRemoteViewingSession() {

  const button =
    document.getElementById("rvStartButton");


  const message =
    document.getElementById("rvSetupMessage");


  if (!state.user) {

    message.textContent =
      "로그인 후 이용할 수 있습니다.";

    return;

  }


  button.disabled = true;

  message.textContent =
    "서버에서 실제 타겟을 선택하고 있습니다...";


  const {
    data,
    error
  } = await client.rpc(
    "create_rv_session"
  );


  button.disabled = false;


  if (error) {

    console.error(
      "RV session create error:",
      error
    );


    message.textContent =
      error.message;

    return;

  }


  /*
    RPC 반환값 확인
  */

  const session =
    Array.isArray(data)
      ? data[0]
      : data;


  if (!session) {

    message.textContent =
      "리모트뷰잉 세션 생성에 실패했습니다.";

    return;

  }


  currentRvSessionId =
    session.session_id;


  /*
    타겟 코드 표시
  */

  document
    .getElementById("rvTargetCode")
    .textContent =
      session.target_code;


  /*
    시작 화면 숨김
  */

  document
    .getElementById("rvSetup")
    .classList.add("hidden");


  /*
    관찰 화면 표시
  */

  document
    .getElementById("rvObservation")
    .classList.remove("hidden");


  /*
    기존 입력값 초기화
  */

  document
    .getElementById("rvFormDescription")
    .value = "";

  document
    .getElementById("rvColorDescription")
    .value = "";

  document
    .getElementById("rvTextureDescription")
    .value = "";

  document
    .getElementById("rvTemperatureDescription")
    .value = "";

  document
    .getElementById("rvMovementDescription")
    .value = "";

  document
    .getElementById("rvEnvironmentDescription")
    .value = "";

  document
    .getElementById("rvFreeDescription")
    .value = "";


  document
    .getElementById("rvObservationMessage")
    .textContent = "";

}


/* =========================================
   리모트뷰잉 관찰 기록 제출
========================================= */

async function submitRemoteViewing() {

  const message =
    document.getElementById(
      "rvObservationMessage"
    );


  const button =
    document.getElementById(
      "rvSubmitButton"
    );


  if (!currentRvSessionId) {

    message.textContent =
      "활성화된 리모트뷰잉 세션이 없습니다.";

    return;

  }


  const formDescription =
    document
      .getElementById(
        "rvFormDescription"
      )
      .value
      .trim();


  const colorDescription =
    document
      .getElementById(
        "rvColorDescription"
      )
      .value
      .trim();


  const textureDescription =
    document
      .getElementById(
        "rvTextureDescription"
      )
      .value
      .trim();


  const temperatureDescription =
    document
      .getElementById(
        "rvTemperatureDescription"
      )
      .value
      .trim();


  const movementDescription =
    document
      .getElementById(
        "rvMovementDescription"
      )
      .value
      .trim();


  const environmentDescription =
    document
      .getElementById(
        "rvEnvironmentDescription"
      )
      .value
      .trim();


  const freeDescription =
    document
      .getElementById(
        "rvFreeDescription"
      )
      .value
      .trim();


  /*
    최소한 하나는 기록하도록 설정
  */

  if (
    !formDescription &&
    !colorDescription &&
    !textureDescription &&
    !temperatureDescription &&
    !movementDescription &&
    !environmentDescription &&
    !freeDescription
  ) {

    message.textContent =
      "관찰한 내용을 최소 한 가지 이상 기록하세요.";

    return;

  }


  button.disabled = true;

  message.textContent =
    "관찰 기록을 저장하고 실제 타겟을 공개하고 있습니다...";


  const {
    data,
    error
  } = await client.rpc(
    "submit_rv_session",
    {

      p_session_id:
        currentRvSessionId,

      p_form_description:
        formDescription || null,

      p_color_description:
        colorDescription || null,

      p_texture_description:
        textureDescription || null,

      p_temperature_description:
        temperatureDescription || null,

      p_movement_description:
        movementDescription || null,

      p_environment_description:
        environmentDescription || null,

      p_free_description:
        freeDescription || null

    }
  );


  button.disabled = false;


  if (error) {

    console.error(
      "RV submit error:",
      error
    );


    message.textContent =
      error.message;

    return;

  }


  /*
    RPC 반환값 확인
  */

  const result =
    Array.isArray(data)
      ? data[0]
      : data;


  if (!result) {

    message.textContent =
      "타겟 정보를 가져오지 못했습니다.";

    return;

  }


  /*
    실제 타겟 코드
  */

  document
    .getElementById(
      "rvResultTargetCode"
    )
    .textContent =
      result.target_code;


  /*
    이미지 제목
  */

  document
    .getElementById(
      "rvResultTitle"
    )
    .textContent =
      result.source_title ||
      "REMOTE VIEWING TARGET";


  /*
    Supabase Storage 실제 이미지 URL 생성
  */

  const {
    data: publicUrlData
  } = client
    .storage
    .from("rv-images")
    .getPublicUrl(
      result.storage_path
    );


  const imageUrl =
    publicUrlData.publicUrl;


  const image =
    document.getElementById(
      "rvResultImage"
    );


  image.src =
    imageUrl;


  /*
    관찰 화면 숨김
  */

  document
    .getElementById("rvObservation")
    .classList.add("hidden");


  /*
    결과 화면 표시
  */

  document
    .getElementById("rvResult")
    .classList.remove("hidden");


  document
    .getElementById("rvResultMessage")
    .textContent =
      "실제 타겟 이미지가 공개되었습니다.";


  /*
    현재 세션 종료 처리
  */

  currentRvSessionId = null;

}


/* =========================================
   리모트뷰잉 취소
========================================= */

function cancelRemoteViewing() {

  currentRvSessionId = null;


  document
    .getElementById("rvTrainingPanel")
    .classList.add("hidden");


  document
    .getElementById("gamePanel")
    .classList.remove("hidden");


  render();

}


/* =========================================
   리모트뷰잉 종료
========================================= */

function finishRemoteViewing() {

  currentRvSessionId = null;


  document
    .getElementById("rvTrainingPanel")
    .classList.add("hidden");


  document
    .getElementById("gamePanel")
    .classList.remove("hidden");


  render();

}


/* =========================================
   이벤트 연결
========================================= */

document
  .getElementById("rvStartButton")
  ?.addEventListener(
    "click",
    startRemoteViewingSession
  );


document
  .getElementById("rvSubmitButton")
  ?.addEventListener(
    "click",
    submitRemoteViewing
  );


document
  .getElementById("rvBackButton")
  ?.addEventListener(
    "click",
    cancelRemoteViewing
  );


document
  .getElementById("rvCancelButton")
  ?.addEventListener(
    "click",
    cancelRemoteViewing
  );


document
  .getElementById("rvFinishButton")
  ?.addEventListener(
    "click",
    finishRemoteViewing
  );
