(() => {
  if (window.__SPIRIT_APP_BOOTED__) return;
  window.__SPIRIT_APP_BOOTED__ = true;

  const cfg = window.SPIRIT_CONFIG || {};
  const client = supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_PUBLISHABLE_KEY
  );

  const $ = id => document.getElementById(id);

  const state = {
    user: null,
    profile: null,
    assessmentIndex: 0,
    assessmentScore: 0,
    rankTestIndex: 0,
    rankTestAnswers: [],
    rankTestCurrentRank: "D"
  };

  /* =========================
     BASIC
  ========================= */

  function show(id, visible = true) {
    const el = $(id);
    if (el) el.classList.toggle("hidden", !visible);
  }

  function msg(text) {
    const el = $("authMessage");
    if (el) el.textContent = text || "";
  }

  function xpNeeded(level) {
    return 100 + (level - 1) * 40;
  }

  function getTodayStart() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }

  /* =========================
     ASSESSMENT
  ========================= */

  const assessment = [
    {
      q: "정보가 거의 없는 두 선택지 중 하나를 골라야 합니다. 어느 쪽을 선택하시겠습니까?",
      c: ["A", "B"]
    },
    {
      q: "짧은 시간 동안 여러 자극이 나타났습니다. 가장 먼저 눈에 들어온 것을 고르세요.",
      c: ["첫 번째", "두 번째", "세 번째", "네 번째"]
    },
    {
      q: "처음 본 장소에서 가장 강하게 느껴지는 인상을 하나 고르세요.",
      c: ["편안함", "긴장감", "낯섦", "무감각"]
    },
    {
      q: "답을 오래 생각하지 않고 즉시 하나를 선택하세요.",
      c: ["1", "2", "3", "4"]
    },
    {
      q: "마지막 질문입니다. 지금 가장 먼저 떠오르는 선택지를 고르세요.",
      c: ["A", "B", "C", "D"]
    }
  ];

  function startAssessment() {
    state.assessmentIndex = 0;
    state.assessmentScore = 0;

    show("startPanel", false);
    show("assessmentPanel", true);
    show("gamePanel", false);

    drawAssessment();
  }

  function drawAssessment() {
    const a = assessment[state.assessmentIndex];
    if (!a) return;

    const question = $("assessmentQuestion");
    const choices = $("assessmentChoices");
    const progress = $("assessmentProgress");

    if (question) question.textContent = a.q;

    if (choices) {
      choices.innerHTML = a.c
        .map(
          (text, index) =>
            `<button type="button" data-i="${index}">${text}</button>`
        )
        .join("");

      choices.querySelectorAll("button").forEach(button => {
        button.onclick = () =>
          answerAssessment(Number(button.dataset.i));
      });
    }

    if (progress) {
      progress.textContent =
        `TEST ${state.assessmentIndex + 1} / ${assessment.length}`;
    }
  }

  async function answerAssessment(index) {
    state.assessmentScore +=
      50 +
      ((index * 17 + state.assessmentIndex * 11) % 51);

    state.assessmentIndex++;

    if (state.assessmentIndex < assessment.length) {
      drawAssessment();
      return;
    }

    const score = Math.min(
      100,
      Math.round(
        state.assessmentScore / assessment.length
      )
    );

    const level = Math.max(
      1,
      Math.min(
        30,
        Math.floor(score / 4) + 1
      )
    );

    const stats = {
      perception: Math.max(1, Math.round(score * 0.8)),
      intuition: Math.max(1, Math.round(score * 0.9)),
      focus: Math.max(1, Math.round(score * 0.7)),
      interpretation: Math.max(1, Math.round(score * 0.8)),
      control: Math.max(1, Math.round(score * 0.75))
    };

    const { error } = await client.rpc(
      "save_assessment",
      {
        p_score: score,
        p_level: level,
        p_stats: stats
      }
    );

    if (error) {
      msg(error.message);
      return;
    }

    await createProfile(level, stats);
  }

  /* =========================
     PROFILE / AUTH
  ========================= */

  async function loadProfile() {
    const {
      data: { user }
    } = await client.auth.getUser();

    state.user = user;

    if (!user) {
      state.profile = null;

      show("authPanel", true);
      show("startPanel", false);
      show("gamePanel", false);

      const authState = $("authState");
      if (authState) authState.textContent = "로그인 필요";

      return;
    }

    const authState = $("authState");
    if (authState) authState.textContent = user.email;

    const {
      data,
      error
    } = await client
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      msg(error.message);
      return;
    }

    state.profile = data;

    show("authPanel", false);

    if (!data) {
      show("startPanel", true);
      show("assessmentPanel", false);
      show("gamePanel", false);
    } else {
      show("startPanel", false);
      show("assessmentPanel", false);
      show("gamePanel", true);

      render();
    }
  }

  async function signUp() {
    const email = $("email")?.value.trim();
    const password = $("password")?.value;

    if (!email || !password || password.length < 6) {
      msg("이메일과 6자 이상의 비밀번호를 입력하세요.");
      return;
    }

    const { error } = await client.auth.signUp({
      email,
      password
    });

    msg(
      error
        ? error.message
        : "가입 요청 완료. 이메일 확인이 필요한 경우 메일함을 확인하세요."
    );
  }

  async function signIn() {
    const email = $("email")?.value.trim();
    const password = $("password")?.value;

    const { error } =
      await client.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      msg(error.message);
    } else {
      msg("");
    }
  }

  async function createProfile(
    level = 1,
    stats = null
  ) {
    const s =
      stats || {
        perception: 1,
        intuition: 1,
        focus: 1,
        interpretation: 1,
        control: 1
      };

    const {
      data,
      error
    } = await client.rpc(
      "create_player",
      {
        p_player_name: "PLAYER",
        p_level: level,
        p_perception: s.perception,
        p_intuition: s.intuition,
        p_focus: s.focus,
        p_interpretation: s.interpretation,
        p_control: s.control
      }
    );

    if (error) {
      msg(error.message);
      return;
    }

    state.profile = data;

    show("startPanel", false);
    show("assessmentPanel", false);
    show("gamePanel", true);

    render();
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
    const empty = {
      sensory: 0,
      intuitive: 0,
      focus: 0,
      interpreter: 0,
      control: 0
    };

    if (!state.user) return empty;

    const {
      data,
      error
    } = await client
      .from("quest_logs")
      .select("quest_code")
      .eq("user_id", state.user.id);

    if (error) {
      console.error(
        "Awakening analysis error:",
        error
      );
      return empty;
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

      if (!effect) continue;

      for (const key in effect) {
        paths[key] += effect[key];
      }
    }

    return paths;
  }

  function getPrimaryAwakening(paths) {
    const entries =
      Object.entries(paths).sort(
        (a, b) => b[1] - a[1]
      );

    const top = entries[0];
    const second = entries[1];

    if (!top || top[1] < 30) {
      return {
        type: "UNKNOWN",
        description:
          "아직 충분한 훈련 데이터가 없습니다. 여러 유형의 훈련을 계속하십시오."
      };
    }

    const difference =
      top[1] - (second?.[1] || 0);

    if (
      top[1] >= 100 &&
      difference >= 25
    ) {
      return {
        type: AWAKENING_PATHS[top[0]].name,
        description:
          "특정 성장 경로에서 반복적으로 높은 성장 패턴이 감지되고 있습니다."
      };
    }

    return {
      type: AWAKENING_PATHS[top[0]].name,
      description:
        "특정 능력 계열에서 성장 가능성이 높게 나타나고 있습니다. 추가 훈련과 검증이 필요합니다."
    };
  }

/* =========================================
   AWAKENING ANALYSIS · ROOM CONTROL
========================================= */

function installAwakeningAnalysisRoom() {

  const entry = $("awakeningAnalysisEntry");
  const room = $("awakeningAnalysisRoom");

  if (!entry || !room) return;

  // 독립 화면을 플레이어 카드 밖으로 이동
  if (room.parentElement !== document.body) {
    document.body.appendChild(room);
  }

  // 이벤트 중복 연결 방지
  if (entry.dataset.installed === "true") return;

  entry.dataset.installed = "true";

  $("awakeningAnalysisOpen")?.addEventListener(
    "click",
    () => {
      show("awakeningAnalysisRoom", true);

      room.scrollTop = 0;

      // 입장 시 최신 분석 데이터 갱신
      renderAwakeningSystem();
    }
  );

  $("awakeningAnalysisClose")?.addEventListener(
    "click",
    () => {
      show("awakeningAnalysisRoom", false);
    }
  );
}
  
  async function renderAwakeningSystem() {
    const paths =
      await calculateAwakeningPaths();

    const analysis =
      getPrimaryAwakening(paths);

    if ($("primaryTypeValue")) {
      $("primaryTypeValue").textContent =
        analysis.type;
    }

    if ($("awakeningDescription")) {
      $("awakeningDescription").textContent =
        analysis.description;
    }

    const total =
      Object.values(paths).reduce(
        (sum, value) => sum + value,
        0
      );

    if ($("awakeningStatus")) {
      $("awakeningStatus").textContent =
        total === 0
          ? "DATA REQUIRED"
          : "ANALYZING";
    }

    const maxValue = Math.max(
      ...Object.values(paths),
      1
    );

    const sortedPaths =
      Object.entries(paths).sort(
        (a, b) => b[1] - a[1]
      );

    if ($("potentialPaths")) {
      $("potentialPaths").innerHTML =
        sortedPaths
          .map(([key, value]) => {
            const path =
              AWAKENING_PATHS[key];

            const percentage =
              Math.min(
                100,
                Math.round(
                  (value / maxValue) * 100
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
                  <div style="width:${percentage}%"></div>
                </div>
              </div>
            `;
          })
          .join("");
    }
  }

  /* =========================
     NEXT UNLOCK
  ========================= */

  function getNextUnlock(rank, level) {
    const currentRank = rank || "D";

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

    return (
      list.find(
        item => item.level > level
      ) || {
        level: 100,
        title: "UNKNOWN",
        description:
          "다음 성장 데이터가 아직 분석되지 않았습니다."
      }
    );
  }

  function renderNextUnlock() {
    const p = state.profile;
    if (!p) return;

    const next =
      getNextUnlock(
        p.rank,
        p.level
      );

    if ($("nextUnlockTitle")) {
      $("nextUnlockTitle").textContent =
        `LV.${next.level} · ${next.title}`;
    }

    if ($("nextUnlockDescription")) {
      $("nextUnlockDescription").textContent =
        next.description;
    }
  }

  /* =========================
     RANK PROMOTION SYSTEM
  ========================= */

  const RANK_ORDER = [
    "D",
    "C",
    "B",
    "A",
    "S"
  ];

  function getNextRank(rank) {
    const index =
      RANK_ORDER.indexOf(
        rank || "D"
      );

    if (index < 0) return "C";

    if (
      index >=
      RANK_ORDER.length - 1
    ) {
      return null;
    }

    return RANK_ORDER[index + 1];
  }

  const D_TO_C_PROMOTION_TEST = [
    {
      objective: "집중력 판별",
      question:
        "다음 안내를 읽은 뒤, 5초 동안 화면의 중앙에 집중하십시오. 준비가 되면 다음 단계로 진행하십시오.",
      choices: [
        {
          text: "준비 완료",
          correct: true
        }
      ]
    },

    {
      objective: "감각 관찰",
      question:
        "지금 이 순간 주변 환경에서 평소에는 의식하지 않았던 소리나 감각을 하나 선택하십시오.",
      choices: [
        {
          text: "소리",
          correct: true
        },
        {
          text: "신체 감각",
          correct: true
        },
        {
          text: "온도 변화",
          correct: true
        },
        {
          text: "특별한 감각 없음",
          correct: true
        }
      ]
    },

    {
      objective: "직관 선택",
      question:
        "아래 네 개의 선택지 중 가장 먼저 떠오르는 하나를 선택하십시오. 오래 고민하지 마십시오.",
      choices: [
        {
          text: "A",
          correct: true
        },
        {
          text: "B",
          correct: true
        },
        {
          text: "C",
          correct: true
        },
        {
          text: "D",
          correct: true
        }
      ]
    }
  ];

  const PROMOTION_TESTS = {
    D: D_TO_C_PROMOTION_TEST,
    C: D_TO_C_PROMOTION_TEST,
    B: D_TO_C_PROMOTION_TEST,
    A: D_TO_C_PROMOTION_TEST
  };

  function getPromotionTest(rank) {
    return (
      PROMOTION_TESTS[rank] ||
      D_TO_C_PROMOTION_TEST
    );
  }

  function renderRankPromotion() {
    const p = state.profile;
    if (!p) return;

    const currentRank =
      p.rank || "D";

    const nextRank =
      getNextRank(currentRank);

    const panel =
      $("rankTestPanel");

    if (!panel) return;

    if (
      !nextRank ||
      Number(p.level) < 100
    ) {
      panel.classList.add("hidden");
      return;
    }

    if ($("promotionCurrentRank")) {
      $("promotionCurrentRank").textContent =
        `${currentRank}-RANK`;
    }

    if ($("promotionNextRank")) {
      $("promotionNextRank").textContent =
        `${nextRank}-RANK`;
    }

    panel.classList.remove("hidden");
  }

  function startRankTest() {
    const currentRank =
      state.profile?.rank || "D";

    if (
      !getNextRank(currentRank) ||
      Number(state.profile?.level) < 100
    ) {
      return;
    }

    state.rankTestIndex = 0;
    state.rankTestAnswers = [];
    state.rankTestCurrentRank =
      currentRank;

    show("rankTestPanel", false);
    show("rankTestResultPanel", false);
    show("rankTestRunningPanel", true);

    renderRankTestQuestion();
  }

  function renderRankTestQuestion() {
    const index =
      state.rankTestIndex;

    const currentRank =
      state.rankTestCurrentRank ||
      state.profile?.rank ||
      "D";

    const questions =
      getPromotionTest(currentRank);

    const test = questions[index];

    if (!test) {
      finishRankTest();
      return;
    }

    if ($("rankTestTitle")) {
      $("rankTestTitle").textContent =
        `${currentRank}-RANK PROMOTION TEST`;
    }

    if ($("rankTestProgress")) {
      $("rankTestProgress").textContent =
        `TEST ${index + 1} / ${questions.length}`;
    }

    if ($("rankTestObjective")) {
      $("rankTestObjective").textContent =
        test.objective;
    }

    if ($("rankTestQuestion")) {
      $("rankTestQuestion").textContent =
        test.question;
    }

    if ($("rankTestMessage")) {
      $("rankTestMessage").textContent = "";
    }

    const choices =
      $("rankTestChoices");

    if (!choices) return;

    choices.innerHTML =
      test.choices
        .map(
          (choice, choiceIndex) => `
            <button
              type="button"
              class="rank-test-choice"
              data-choice="${choiceIndex}"
            >
              ${choice.text}
            </button>
          `
        )
        .join("");

    choices
      .querySelectorAll(
        ".rank-test-choice"
      )
      .forEach(button => {
        button.onclick = () => {
          const choiceIndex =
            Number(
              button.dataset.choice
            );

          state.rankTestAnswers.push({
            question: index,
            choice: choiceIndex
          });

          choices
            .querySelectorAll(
              ".rank-test-choice"
            )
            .forEach(
              choice =>
                (choice.disabled = true)
            );

          state.rankTestIndex++;

          renderRankTestQuestion();
        };
      });
  }

  async function finishRankTest() {
    show(
      "rankTestRunningPanel",
      false
    );

    const currentRank =
      state.rankTestCurrentRank ||
      state.profile?.rank ||
      "D";

    const targetRank =
      getNextRank(currentRank);

    if ($("rankTestMessage")) {
      $("rankTestMessage").textContent =
        "시험을 채점하고 있습니다...";
    }

    const {
      data,
      error
    } = await client.rpc(
      "submit_rank_promotion_test",
      {
        p_answers:
          state.rankTestAnswers
      }
    );

    if (error) {
      show(
        "rankTestRunningPanel",
        true
      );

      if ($("rankTestMessage")) {
        $("rankTestMessage").textContent =
          "시험 처리 실패: " +
          error.message;
      }

      return;
    }

    const result =
      Array.isArray(data)
        ? data[0]
        : data;

    if (!result) {
      show(
        "rankTestRunningPanel",
        true
      );

      if ($("rankTestMessage")) {
        $("rankTestMessage").textContent =
          "시험 결과를 받지 못했습니다.";
      }

      return;
    }

    const passed =
      result.result === "PASS";

    if ($("rankTestResultCurrentRank")) {
      $("rankTestResultCurrentRank").textContent =
        `${currentRank}-RANK`;
    }

    if ($("rankTestResultTargetRank")) {
      $("rankTestResultTargetRank").textContent =
        `${targetRank}-RANK`;
    }

    if ($("rankTestResultBadge")) {
      $("rankTestResultBadge").textContent =
        passed ? "PASS" : "FAIL";
    }

    if ($("rankTestScore")) {
      $("rankTestScore").textContent =
        `SCORE ${result.score} / 100`;
    }

    if ($("rankTestResultMessage")) {
      $("rankTestResultMessage").textContent =
        passed
          ? `${targetRank}-RANK 승급이 완료되었습니다. LV.1부터 새로운 랭크의 훈련을 시작합니다.`
          : "이번 승급시험은 불합격입니다. 현재 랭크와 LV.100은 유지되며 바로 재응시할 수 있습니다.";
    }

    if ($("rankTestResultAction")) {
      $("rankTestResultAction").textContent =
        passed
          ? "새 랭크로 게임 계속하기"
          : "다시 시험 보기";

      $("rankTestResultAction").onclick =
        async () => {
          show(
            "rankTestResultPanel",
            false
          );

          if (passed) {
            await loadProfile();
          } else {
            show(
              "rankTestPanel",
              true
            );
          }
        };
    }

    show(
      "rankTestResultPanel",
      true
    );

    await loadProfile();
  }

  /* =========================
     V3 ABILITY EVALUATION ENGINE
     Non-destructive layer
  ========================= */

  const ABILITY_KEYS = [
    "perception",
    "intuition",
    "focus",
    "interpretation",
    "control"
  ];

  const ABILITY_LABELS = {
    perception: "감지력",
    intuition: "직관력",
    focus: "집중력",
    interpretation: "해석력",
    control: "통제력"
  };
const V3_TRAINING_MAP = {
  focus_5: [
    "focus",
    "control"
  ],

 v3_focus_performance: [
    "focus"
  ],

  
  sense_observation: [
    "perception",
    "focus"
  ],

  intuition_choice: [
    "intuition"
  ],

  emotion_guess: [
    "interpretation",
    "intuition"
  ],

  life_death: [
    "perception",
    "intuition"
  ]
};
  
  /*
   * V3 원칙
   *
   * Practice      = 얼마나 했는가
   * Performance   = 얼마나 잘했는가
   * Consistency   = 얼마나 안정적인가
   * Verification  = 실제 검증이 존재하는가
   *
   * 기존 EXP와 별개의 평가 시스템이다.
   */

  const V3_CONFIG = {
    maxAbilityScore: 100,

    practiceWeight: 0.25,
    performanceWeight: 0.45,
    consistencyWeight: 0.20,
    verificationWeight: 0.10,

    inactivityDays: 30,
    decayPerMonth: 2,

    minimumTrialsForPerformance: 5,
    minimumTrialsForConsistency: 10
  };

  /*
   * 훈련량 점수
   *
   * 단순 반복으로 100점에 도달하지 않도록
   * 로그 수에 대해 점진적 증가를 사용한다.
   */
  function v3PracticeScore(count) {

    const n = Number(count) || 0;

    if (n <= 0) return 0;

    return Math.min(
      100,
      Math.round(
        100 *
        (1 - Math.exp(-n / 30))
      )
    );
  }

function v3RecencyScore(logs) {
  if (!logs || logs.length === 0) {
    return {
      score: 0,
      lastTrainingAt: null,
      daysSinceLastTraining: null
    };
  }

  const timestamps = logs
    .map((log) => new Date(log?.completed_at))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a);

  if (timestamps.length === 0) {
    return {
      score: 0,
      lastTrainingAt: null,
      daysSinceLastTraining: null
    };
  }

  const lastTrainingAt = timestamps[0];
  const now = new Date();

  const daysSinceLastTraining =
    Math.max(
      0,
      (now.getTime() - lastTrainingAt.getTime()) /
        (1000 * 60 * 60 * 24)
    );

  let score;

  if (daysSinceLastTraining <= 1) {
    score = 100;
  } else if (daysSinceLastTraining <= 7) {
    score = 90;
  } else if (daysSinceLastTraining <= 14) {
    score = 75;
  } else if (daysSinceLastTraining <= 30) {
    score = 55;
  } else if (daysSinceLastTraining <= 60) {
    score = 35;
  } else if (daysSinceLastTraining <= 90) {
    score = 15;
  } else {
    score = 0;
  }

  return {
    score,
    lastTrainingAt: lastTrainingAt.toISOString(),
    daysSinceLastTraining: Math.round(daysSinceLastTraining * 10) / 10
  };
}


  /*
   * 기존 퀘스트 기록에서
   * 능력별 훈련 횟수를 계산한다.
   */
function v3BuildPracticeData(logs) {
  const result = {};

  ABILITY_KEYS.forEach((ability) => {
    result[ability] = {
      count: 0,
      lastDate: null,
      recentCount: 0
    };
  });

  const now = Date.now();

  for (const log of logs || []) {
    const code = log?.quest_code;
  const abilities =
  V3_TRAINING_MAP[code] || [];
    
    const completedAt =
      log?.completed_at ||
      log?.created_at ||
      log?.timestamp;

    const logTime =
      completedAt
        ? new Date(completedAt).getTime()
        : NaN;

    for (const ability of abilities) {
      if (!result[ability]) continue;

      result[ability].count += 1;

      if (
        completedAt &&
        (
          !result[ability].lastDate ||
          new Date(completedAt) >
            new Date(result[ability].lastDate)
        )
      ) {
        result[ability].lastDate =
          completedAt;
      }

      if (
        Number.isFinite(logTime) &&
        now - logTime <= 30 * 86400000
      ) {
        result[ability].recentCount += 1;
      }
    }
  }

  return result;
}

  /*
   * 검증 점수.
   *
   * 현재 일반 퀘스트는 객관적 정답이 없기 때문에
   * 기본값을 낮게 잡는다.
   *
   * 향후 RV / blind / verification 결과가 연결되면
   * 이 값을 실제 검증 데이터로 올린다.
   */
  function v3VerificationScore(
    ability
  ) {

    /*
     * 현재 단계에서는
     * "훈련했다"와
     * "검증됐다"를 구분하기 위해
     * 일반 훈련에는 낮은 값을 준다.
     */

    return 10;
  }


function v3CalculateAbilityScore(ability, logs) {

  const allAbilityLogs =
    (logs || []).filter((log) => {

      const code =
        log?.quest_code;

      return V3_TRAINING_MAP[code]?.includes(
        ability
      );
    });

  // 일반 훈련 기록
  const practiceLogs =
    allAbilityLogs.filter((log) => {
      return log?.quest_code !==
        "v3_focus_performance";
    });

  // V3 수행능력 테스트 기록
  const performanceLogs =
    allAbilityLogs.filter((log) => {
      return log?.quest_code ===
        "v3_focus_performance";
    });

  const practice =
    v3PracticeScore(
      practiceLogs.length
    );

  const recency =
    v3RecencyScore(
      practiceLogs
    );

  const selfReportLogs =
    practiceLogs.filter((log) => {

      let result =
        log?.result;

      if (typeof result === "string") {
        try {
          result =
            JSON.parse(result);
        } catch (error) {
          result = null;
        }
      }

      return (
        result &&
        typeof result === "object"
      );
    });

  /*
   * 수행능력
   *
   * V3 수행 테스트가 5회 이상
   * 축적되었을 때만 정식 Performance로 인정한다.
   */

  let performance = null;

  if (
    performanceLogs.length >=
    V3_CONFIG.minimumTrialsForPerformance
  ) {

    const scores =
      performanceLogs
        .map((log) => {

          const value =
            Number(log?.score);

          return Number.isFinite(value)
            ? value
            : null;

        })
        .filter(
          Number.isFinite
        );

    if (scores.length >=
      V3_CONFIG.minimumTrialsForPerformance
    ) {

      performance =
        scores.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / scores.length;
    }
  }

  return {
    ability,

    practice,

    recency:
      recency.score,

    lastTrainingAt:
      recency.lastTrainingAt,

    daysSinceLastTraining:
      recency.daysSinceLastTraining,

    performance,

    consistency: null,

    verification: null,

    calibration: null,

    total: null,

    measured: {

      practice:
        practiceLogs.length > 0,

      performance:
        performance !== null,

      selfReport:
        selfReportLogs.length > 0,

      consistency:
        false,

      verification:
        false,

      calibration:
        false
    },

    trialCount:
      practiceLogs.length,

    selfReportCount:
      selfReportLogs.length,

    performanceTrialCount:
      performanceLogs.length
  };
}
  
  /*
   * V3 전체 능력 평가
   */


function v3EvaluateAbilities(profile, logs) {
  const practiceData =
    v3BuildPracticeData(logs);

  const result = {};

  for (const ability of ABILITY_KEYS) {
    const data =
      practiceData[ability];

    const practice =
      v3PracticeScore(
        data.count
      );

    const recencyData =
      v3RecencyScore(
        (logs || []).filter((log) => {
          const code = log?.quest_code;

          return V3_TRAINING_MAP[code]?.includes(
            ability
          );
        })
      );

    result[ability] = {
      score: null,
      practice,
      performance: null,
      consistency: null,
      verification: null,
      calibration: null,
      recency: recencyData.score,
      count: data.count,
      lastDate: recencyData.lastTrainingAt,
      daysSinceLastTraining:
        recencyData.daysSinceLastTraining
    };
  }

  return result;
}


  
  
  /*
   * 종합 Ability Score
   */
  function v3OverallAbilityScore(
    abilities
  ) {

    const values =
      Object.values(abilities || {})
       .map(x => x.score == null ? null : Number(x.score))
        .filter(Number.isFinite);

    if (!values.length) {
      return 1;
    }

    return Math.round(
      values.reduce(
        (sum, value) =>
          sum + value,
        0
      ) / values.length
    );
  }

  /*
   * Ability Score → LV
   *
   * 단순히 score * 100으로 만들지 않는다.
   *
   * LV 1~100은 종합 능력의 위치를 의미한다.
   */
  function v3AbilityToLevel(score) {

    const value =
      Math.max(
        1,
        Math.min(
          100,
          Number(score) || 1
        )
      );

    return Math.max(
      1,
      Math.min(
        100,
        Math.round(value)
      )
    );
  }

  /*
   * 랭크 판정은 기존 rank를 자동 변경하지 않는다.
   *
   * "현재 능력 수준"과
   * "공식 승급"을 분리한다.
   */
  function v3RecommendedRank(level) {

    const lv =
      Number(level) || 1;

    if (lv >= 81) return "A";
    if (lv >= 61) return "B";
    if (lv >= 31) return "C";

    return "D";
  }

async function v3EvaluateProfile() {
  if (!state.user?.id) {
    return null;
  }

  const { data: logs, error } = await client
    .from("quest_logs")
    .select("*")
    .eq("user_id", state.user.id)
    .order("completed_at", { ascending: false });

  if (error) {
    console.error("[SPIRIT SYSTEM V3] quest_logs load error:", error);
    return null;
  }

  const allLogs = Array.isArray(logs) ? logs : [];

  const abilities = {};

  for (const ability of ABILITY_KEYS) {
    abilities[ability] = v3CalculateAbilityScore(
      ability,
      allLogs
    );
  }

  return {
    userId: state.user.id,
    generatedAt: new Date().toISOString(),
    totalTrainingCount: allLogs.length,
    dataStatus: {
      practice: allLogs.length > 0,
      performance: false,
      consistency: false,
      verification: false,
      calibration: false
    },
    abilities
  };
}
  
  /*
   * Supabase에서 현재 사용자의
   * 기존 quest_logs를 읽는다.
   *
   * 기존 테이블 구조를 수정하지 않는다.
   */
async function v3LoadEvaluation() {

  if (!state.user?.id) {
    return null;
  }

  try {
    return await v3EvaluateProfile();

  } catch (error) {

    console.error(
      "[SPIRIT SYSTEM V3] evaluation error:",
      error
    );

    return null;
  }
}

  
  /*
   * 개발/검증용:
   * window에서 확인할 수 있도록 노출한다.
   *
   * 운영 화면에는 표시하지 않는다.
   */
window.SPIRIT_V3 = {
  evaluate:
    v3EvaluateProfile,

  calculateAbilityScore:
    v3CalculateAbilityScore,

  practiceScore:
    v3PracticeScore,

  recencyScore:
    v3RecencyScore,

  startFocusPerformanceTest:
    startV3FocusPerformanceTest
};
  
  /* =========================
     QUEST SYSTEM
  ========================= */

  const QUEST_LIMITS = {
    focus_5: 3,
    sense_observation: 3,
    intuition_choice: 5,
    emotion_guess: 3,
    life_death: 3
  };

/* =========================================
   DAILY QUEST · INDEPENDENT ROOM
========================================= */

function installDailyQuestRoom() {
  if ($("dailyQuestRoom")) return;

  const list = $("questList");
  const originalPanel = list?.closest(".panel");

  if (!list || !originalPanel) return;

  // 기존 DAILY QUEST 위치에 입장 카드 생성
  const entry = document.createElement("section");
  entry.id = "dailyQuestEntry";
  entry.className = "panel";

  entry.innerHTML = `
    <div class="section-title">
      <h2>DAILY QUEST</h2>
      <span class="muted">일일 수행 훈련</span>
    </div>

    <p class="muted">
      집중훈련 · 감각관찰 · 각성훈련
    </p>

    <button id="dailyQuestOpen" type="button">
      DAILY QUEST 입장 →
    </button>
  `;

  originalPanel.before(entry);

  // 독립 훈련실 생성
  const room = document.createElement("section");
  room.id = "dailyQuestRoom";
  room.className = "hidden";

  room.innerHTML = `
    <div class="daily-quest-room-inner">
      <div class="daily-quest-room-header">
        <div>
          <div class="training-status">
            SPIRIT SYSTEM · TRAINING ROOM
          </div>
          <h2>DAILY QUEST</h2>
          <p class="muted">
            오늘의 수행 훈련을 선택하십시오.
          </p>
        </div>

        <button
          id="dailyQuestClose"
          type="button"
          class="secondary"
        >
          게임으로 돌아가기
        </button>
      </div>

      <div id="dailyQuestContent"></div>
    </div>
  `;

  document.body.appendChild(room);

  // 기존 퀘스트 목록을 복제하지 않고 그대로 이동
  $("dailyQuestContent").appendChild(originalPanel);

  // 기존 집중/감각 훈련 화면도 독립적으로 표시
  ["focusTrainingPanel", "senseTrainingPanel"].forEach(id => {
    const panel = $(id);

    if (panel && panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
  });

  $("dailyQuestOpen").addEventListener(
    "click",
    openDailyQuestRoom
  );

  $("dailyQuestClose").addEventListener(
    "click",
    closeDailyQuestRoom
  );

  if (!$("dailyQuestRoomStyle")) {
    const style = document.createElement("style");
    style.id = "dailyQuestRoomStyle";

    style.textContent = `
      /* 메인 화면: 테두리만 보라색 */
      #dailyQuestEntry {
        border: 2px solid #a78bfa !important;
        border-radius: 16px;
        padding: 24px;
        margin: 22px 0;
        box-sizing: border-box;
      }

      #dailyQuestEntry h2 {
        color: inherit;
      }

      #dailyQuestOpen {
        display: block;
        width: 100%;
        margin-top: 20px;
        padding: 14px;
      }

      /* 독립 훈련실 */
      #dailyQuestRoom:not(.hidden),
      #focusTrainingPanel:not(.hidden),
      #senseTrainingPanel:not(.hidden) {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: block;
        overflow-y: auto;
        background: #0b1119;
        padding: 28px 16px 70px;
        box-sizing: border-box;
      }

      #dailyQuestRoom.hidden,
      #focusTrainingPanel.hidden,
      #senseTrainingPanel.hidden {
        display: none !important;
      }

      .daily-quest-room-inner {
        width: 100%;
        max-width: 900px;
        margin: 0 auto;
      }

      .daily-quest-room-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 20px;
        margin-bottom: 25px;
      }

      #dailyQuestContent > .panel {
        border: 1px solid #a78bfa;
        border-radius: 14px;
        padding: 22px;
      }

      #focusTrainingPanel .focus-training-box,
      #senseTrainingPanel .sense-training-box {
        width: 100%;
        max-width: 800px;
        margin: 0 auto;
        box-sizing: border-box;
      }

      @media (max-width: 600px) {
        #dailyQuestRoom:not(.hidden),
        #focusTrainingPanel:not(.hidden),
        #senseTrainingPanel:not(.hidden) {
          padding: 18px 12px 45px;
        }

        .daily-quest-room-header {
          display: block;
        }

        #dailyQuestClose {
          width: 100%;
          margin-top: 15px;
        }
      }
    `;

    document.head.appendChild(style);
  }
}

function openDailyQuestRoom() {
  installDailyQuestRoom();

  show("dailyQuestRoom", true);
  show("gamePanel", true);

  const room = $("dailyQuestRoom");
  if (room) room.scrollTop = 0;

  loadQuests();
}

function closeDailyQuestRoom() {
  show("dailyQuestRoom", false);
  show("gamePanel", true);
}

function returnToDailyQuestRoom() {
  show("focusTrainingPanel", false);
  show("senseTrainingPanel", false);
  show("gamePanel", true);
  show("dailyQuestRoom", true);

  render();

  const room = $("dailyQuestRoom");
  if (room) room.scrollTop = 0;
}
  
  async function loadQuests() {
    if (!state.profile) return;

    const playerLevel =
      state.profile.level;

    const {
      data: quests,
      error: questError
    } = await client
      .from("quest_defs")
      .select("*")
      .eq("active", true)
      .lte("min_level", playerLevel)
      .order("min_level");

    if (questError) {
      if ($("questList")) {
        $("questList").textContent =
          questError.message;
      }
      return;
    }

    const {
      data: todayLogs,
      error: logError
    } = await client
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

    for (const log of todayLogs || []) {
      todayCount[log.quest_code] =
        (todayCount[log.quest_code] || 0) +
        1;
    }

    const levelTestReady =
      state.profile.level_test_available === true;

    if ($("questNotice")) {
      $("questNotice").textContent =
        levelTestReady
          ? `LV.${state.profile.pending_level} 승급 시험을 통과해야 훈련을 계속할 수 있습니다.`
          : "";
    }

    if (!$("questList")) return;

    $("questList").innerHTML =
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

          let buttonText = "수행";

          if (levelTestReady) {
            buttonText = "승급 시험 필요";
          } else if (limitReached) {
            buttonText = "오늘 완료";
          }

          if (q.code === "focus_5") {
            return `
              <div class="quest">
                <div>
                  <h3>${q.title}</h3>
                  <p>
                    ${q.grade}-RANK ·
                    실제 5분 훈련 ·
                    EXP ${q.base_exp}
                  </p>
                  <p class="quest-count">
                    오늘 ${currentCount}/${maxCount}회
                  </p>
                </div>

                <button
                  type="button"
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
                  <h3>${q.title}</h3>
                  <p>
                    ${q.grade}-RANK ·
                    실제 관찰 훈련 ·
                    3~10분
                  </p>
                  <p class="quest-count">
                    오늘 ${currentCount}/${maxCount}회
                  </p>
                </div>

                <button
                  type="button"
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
                <h3>${q.title}</h3>
                <p>
                  ${q.grade}-RANK ·
                  기본 EXP ${q.base_exp}
                </p>
                <p class="quest-count">
                  오늘 ${currentCount}/${maxCount}회
                </p>
              </div>

              <button
                type="button"
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

    $("questList")
      .querySelector(
        ".focus-quest-button"
      )
      ?.addEventListener(
        "click",
        openFocusTraining
      );

    $("questList")
      .querySelector(
        ".sense-quest-button"
      )
      ?.addEventListener(
        "click",
        openSenseTraining
      );

    $("questList")
      .querySelectorAll(
        "[data-code]"
      )
      .forEach(button => {
        button.onclick = () =>
          completeQuest(
            button.dataset.code,
            Number(
              button.dataset.exp
            )
          );
      });
  }

  async function completeQuest(
    code,
    exp
  ) {
    const {
      data,
      error
    } = await client.rpc(
      "complete_simple_quest",
      {
        p_quest_code: code,
        p_exp: exp
      }
    );

    if (error) {
      if ($("questNotice")) {
        $("questNotice").textContent =
          error.message;
      }
      return;
    }

    state.profile = data;

    if ($("questNotice")) {
      $("questNotice").textContent =
        `${code} 완료 · EXP +${exp}`;
    }

    render();
  }



/* =========================
   V3 EVALUATION RENDER
========================= */

/* =========================================
   ABILITY ANALYSIS · INDEPENDENT ROOM
========================================= */

function installAbilityAnalysisRoom() {
  const entry = $("abilityAnalysisEntry");
  const room = $("abilityAnalysisRoom");

  if (!entry || !room) return;
  // 플레이어 카드 내부에서 독립 화면을 분리
if (room.parentElement !== document.body) {
  document.body.appendChild(room);
}

  // 이벤트 중복 연결 방지
  if (entry.dataset.installed === "true") return;

  entry.dataset.installed = "true";

  $("abilityAnalysisOpen")?.addEventListener(
    "click",
    () => {
      show("abilityAnalysisRoom", true);

      room.scrollTop = 0;

      // 입장할 때 최신 분석 데이터 갱신
      renderV3Evaluation();
    }
  );

  $("abilityAnalysisClose")?.addEventListener(
    "click",
    () => {
      show("abilityAnalysisRoom", false);
    }
  );

  if ($("abilityAnalysisStyle")) return;

  const style = document.createElement("style");
  style.id = "abilityAnalysisStyle";

  style.textContent = `

    /* 메인 화면: 제목은 무채색, 테두리만 색상 적용 */
    #abilityAnalysisEntry {
      border: 2px solid #e5a45d !important;
      border-radius: 16px !important;
      padding: 24px !important;
      margin: 22px 0 !important;
      box-sizing: border-box;
    }

    #abilityAnalysisEntry h2 {
      color: inherit !important;
    }

    #abilityAnalysisOpen {
      display: block;
      width: 100%;
      margin-top: 20px;
      padding: 14px;
    }

    /* 독립 능력 분석실 */
    #abilityAnalysisRoom:not(.hidden) {
      position: fixed;
      inset: 0;
      z-index: 11000;
      display: block;
      overflow-y: auto;
      background: #0b1119;
      padding: 28px 16px 70px;
      box-sizing: border-box;
    }

    #abilityAnalysisRoom.hidden {
      display: none !important;
    }

    .ability-analysis-inner {
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
    }

    .ability-analysis-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 18px;
      margin-bottom: 24px;
    }

    .ability-analysis-header h2 {
      margin-bottom: 8px;
    }

    #abilityAnalysisRoom .v3-evaluation-panel {
      border: 1px solid #e5a45d;
      border-radius: 14px;
      padding: 22px;
      box-sizing: border-box;
    }

    @media (max-width: 600px) {

      #abilityAnalysisRoom:not(.hidden) {
        padding: 18px 12px 45px;
      }

      .ability-analysis-header {
        display: block;
      }

      #abilityAnalysisClose {
        width: 100%;
        margin-top: 16px;
      }

      #abilityAnalysisRoom .v3-evaluation-panel {
        padding: 16px;
      }

    }

  `;

  document.head.appendChild(style);
}


/* =========================================
   MAIN LOGOUT BUTTON
========================================= */


/* =========================================
   MAIN SCREEN · BOTTOM LOGOUT
========================================= */


function installMainLogoutButton() {
  const gamePanel = $("gamePanel");
  const originalLogout = $("logoutBtn");

  if (!gamePanel || !originalLogout) return;

  // 기존 상단 버튼 유지
  const topButton = $("mainLogoutBtn");

  if (topButton && topButton.dataset.installed !== "true") {
    topButton.dataset.installed = "true";
    topButton.addEventListener("click", () => {
      originalLogout.click();
    });
  }

  // 첫 화면 하단 버튼 추가
  let footer = $("mainLogoutFooter");

  if (!footer) {
    footer = document.createElement("footer");
    footer.id = "mainLogoutFooter";

    footer.innerHTML = `
      <div class="main-logout-divider"></div>
      <button
        id="bottomLogoutBtn"
        type="button"
        class="secondary"
      >
        로그아웃
      </button>
    `;

    if (!$("mainLogoutFooterStyle")) {
      const style = document.createElement("style");
      style.id = "mainLogoutFooterStyle";

      style.textContent = `
        #mainLogoutFooter {
          width: 100%;
          box-sizing: border-box;
          margin-top: 48px;
          padding: 24px 0 36px;
          text-align: center;
        }

        #mainLogoutFooter .main-logout-divider {
          height: 1px;
          background: rgba(160,170,190,.22);
          margin-bottom: 28px;
        }

        #bottomLogoutBtn {
          display: block;
          width: 100%;
          max-width: 280px;
          margin: 0 auto;
          padding: 13px 24px;
          border-radius: 10px;
          cursor: pointer;
        }
      `;

      document.head.appendChild(style);
    }
  }

  // 메인 화면의 맨 마지막 요소로 유지
  gamePanel.appendChild(footer);

  const bottomButton = $("bottomLogoutBtn");

  if (
    bottomButton &&
    bottomButton.dataset.installed !== "true"
  ) {
    bottomButton.dataset.installed = "true";

    bottomButton.addEventListener("click", () => {
      originalLogout.click();
    });
  }
}


  
/* =========================================
   PLAYER RECORD · ROOM CONTROL
========================================= */
  
function installPlayerRecordRoom() {

  const entry = $("playerRecordEntry");
  const room = $("playerRecordRoom");

  if (!entry || !room) return;

  // 독립 화면을 메인 카드 밖으로 이동
  if (room.parentElement !== document.body) {
    document.body.appendChild(room);
  }

  // 중복 이벤트 연결 방지
  if (entry.dataset.installed === "true") return;

  entry.dataset.installed = "true";

  $("playerRecordOpen")?.addEventListener(
    "click",
    () => {
      show("playerRecordRoom", true);
      room.scrollTop = 0;
    }
  );

  $("playerRecordClose")?.addEventListener(
    "click",
    () => {
      show("playerRecordRoom", false);
    }
  );
}
  
async function renderV3Evaluation() {
  const container = $("v3Evaluation");

  if (!container || !state.user?.id) return;

 
  // 검증실은 평가 데이터 로딩과 관계없이 표시한다. 
  installLabSectionStyle();
  installFocusLab();
  senseLabV1Install();
  await senseLabLoadGrowth();
  await senseLabDashboardLoad();




  container.textContent =
    "측정 기록을 분석하고 있습니다...";

  const evaluation = await v3LoadEvaluation();

  if (!evaluation) {
    container.textContent =
      "측정 기록을 불러오지 못했습니다.";
    return;
  }

  const rows = ABILITY_KEYS.map(key => {
    const item = evaluation.abilities?.[key];

    if (!item) return "";

    const perf = item.performance == null
      ? (
          item.performanceTrialCount
            ? `${item.performanceTrialCount}/5회 축적 중`
            : "미측정"
        )
      : `${Math.round(item.performance)}점 (내부 수행지표)`;

    return `
      <div class="v3-ability">
        <h3>${ABILITY_LABELS[key]}</h3>

        <div class="v3-row">
          <span>일반 훈련</span>
          <strong>${item.trialCount}회</strong>
        </div>

        <div class="v3-row">
          <span>최근 훈련</span>
          <strong>
            ${
              item.lastTrainingAt
                ? formatV3Date(item.lastTrainingAt)
                : "없음"
            }
          </strong>
        </div>

        <div class="v3-row">
          <span>수행 측정</span>
          <strong>${perf}</strong>
        </div>

        <div class="v3-row">
          <span>일관성 / 독립 검증</span>
          <strong>미측정</strong>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="v3-status">
      <strong>능력 평가 현황</strong>
      <span>
        일반 훈련과 수행 측정은 별도 집계합니다.
      </span>
    </div>

    <div class="v3-summary">
      전체 기록
      <strong>${evaluation.totalTrainingCount}회</strong>
    </div>

    <div class="v3-abilities">
      ${rows}
    </div>

    <p class="muted">
      수행지표는 목표 반응 정확도, 오반응 및
      반응속도를 종합한 내부 지표입니다.
      초감각 능력의 증거를 의미하지 않습니다.
    </p>
  `;
}



/* =========================
   FOCUS LAB 3.0 — independent growth
========================= */
const LAB_SHAPES = [
  ["circle","●","채워진 원"],["openCircle","○","빈 원"],
  ["square","■","채워진 네모"],["openSquare","□","빈 네모"],
  ["star","★","채워진 별"],["openStar","☆","빈 별"],
  ["triangle","▲","채워진 삼각형"],["openTriangle","△","빈 삼각형"],
  ["diamond","◆","채워진 마름모"],["openDiamond","◇","빈 마름모"],
  ["heart","♥","채워진 하트"],["openHeart","♡","빈 하트"],
  ["cross","✚","십자"],["hexagon","⬢","육각형"],
  ["openHexagon","⬡","빈 육각형"],["arrow","➤","화살표"]
].map(([id,symbol,name])=>({id,symbol,name}));


const LAB_MODES = {
  normal1:{name:"일반 초급",level:1,shapes:2,switches:0,display:250,displayMin:220,displayMax:320,response:900,min:900,max:2100,weight:1},
  normal2:{name:"일반 중급",level:15,shapes:6,switches:0,display:220,displayMin:180,displayMax:280,response:850,min:750,max:1850,weight:1.10},
  normal3:{name:"일반 고급",level:30,shapes:10,switches:0,display:200,displayMin:150,displayMax:250,response:800,min:600,max:1600,weight:1.20},
  applied1:{name:"응용 초급",level:45,shapes:6,switches:1,display:180,displayMin:130,displayMax:230,response:700,min:350,max:1100,weight:1.35},
  applied2:{name:"응용 중급",level:60,shapes:10,switches:3,display:160,displayMin:110,displayMax:210,response:650,min:250,max:950,weight:1.55},
  applied3:{name:"응용 고급",level:75,shapes:16,switches:5,display:140,displayMin:90,displayMax:190,response:600,min:200,max:850,weight:1.80},
  master:{name:"MASTER CHALLENGE",level:90,shapes:16,switches:5,display:140,displayMin:70,displayMax:170,response:600,min:200,max:850,weight:1.80}
};

let focusLab=null, focusLabTimers=[], focusLabSaving=false, labProfile=null;

const labRandom=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;

function labShuffle(a){
  const r=[...a];
  for(let i=r.length-1;i>0;i--){
    const j=labRandom(0,i);
    [r[i],r[j]]=[r[j],r[i]];
  }
  return r;
}

function labLater(f,t){
  const id=setTimeout(f,t);
  focusLabTimers.push(id);
  return id;
}

function labClearTimers(){
  focusLabTimers.forEach(clearTimeout);
  focusLabTimers=[];
}


function labBuildExposureSequence(config,total){
  const low=config.displayMin??config.display;
  const high=config.displayMax??config.display;
  const third=(high-low)/3;

  const bands=[
    [low,Math.floor(low+third)],
    [Math.floor(low+third)+1,Math.floor(low+2*third)],
    [Math.floor(low+2*third)+1,high]
  ];

  const durations=[];

  for(let i=0;i<total;i+=3){
    const block=labShuffle(
      bands.map(([min,max])=>labRandom(min,max))
    );

    durations.push(
      ...block.slice(0,Math.min(3,total-i))
    );
  }

  return durations;
}

  
const labAvg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null;

function labExpNeed(l){
  return 100+(l-1)*12;
}

function labEscape(s){
  return String(s).replace(/[&<>"']/g,c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));
}

async function labLoadProfile(){
  if(!state.user?.id)return null;

  const {data,error}=await client
    .from('focus_lab_profiles')
    .select('*')
    .eq('user_id',state.user.id)
    .maybeSingle();

  if(error)throw error;

  labProfile=data||{
    level:1,
    exp:0,
    max_level:1,
    total_tests:0
  };

 
labUpdatePanel();

if(document.getElementById('labGrowthPanel')){
  labDashboardLoad();
}

return labProfile;

}

function labUpdatePanel(){
  const p=labProfile||{
    level:1,
    exp:0,
    max_level:1,
    total_tests:0
  };

  const el=$('focusLabInfo');
  if(!el)return;

  const next=Object.values(LAB_MODES)
    .find(x=>x.level>p.max_level);

  el.textContent=
    `FOCUS LV.${p.level} · EXP ${p.exp}/${labExpNeed(p.level)} · 최고 LV.${p.max_level} · ${p.total_tests}회 완료`+
    (next
      ?` · 다음 해금: ${next.name} LV.${next.level}`
      :' · 전 과정 해금');
}



/* FOCUS LAB 3.1 — Growth Dashboard (read-only) */
let labDashboardRequest = 0;

function labDashboardInstall(){
  if(document.getElementById('labGrowthPanel'))return;

  const parent=document.getElementById('focusLabPanel');
  if(!parent)return;

  const el=document.createElement('div');
  el.id='labGrowthPanel';
  el.className='panel';

  el.innerHTML=`
    <div class="section-title">
      <h2>FOCUS GROWTH · 성장 분석</h2>
      <span class="muted">동일 조건 비교</span>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0">
      <label for="labHistoryMode">과정</label>
      <select id="labHistoryMode" style="padding:9px;border-radius:8px;max-width:100%"></select>

      <label for="labHistoryCount">횟수</label>
      <select id="labHistoryCount" style="padding:9px;border-radius:8px"></select>

      <button id="labHistoryRefresh" type="button">새로고침</button>
    </div>

    <div id="labGrowthContent" aria-live="polite">
      성장 기록을 불러오는 중...
    </div>
  `;

  parent.insertAdjacentElement('afterend',el);

  const mode=document.getElementById('labHistoryMode');
  const count=document.getElementById('labHistoryCount');

  mode.innerHTML=Object.entries(LAB_MODES)
    .map(([k,v])=>`<option value="${k}">${labEscape(v.name)}</option>`)
    .join('');

  mode.onchange=()=>{
    const old=count.value;

    count.innerHTML=
      (LAB_MODES[mode.value].switches?[40,80]:[30,60])
        .map(n=>`<option value="${n}">${n}회</option>`)
        .join('');

    if([...count.options].some(o=>o.value===old)){
      count.value=old;
    }

    labDashboardLoad();
  };

  count.onchange=labDashboardLoad;

  document.getElementById('labHistoryRefresh').onclick=
    labDashboardLoad;

  mode.onchange();
}

function labDashboardMetric(v,digits=0,suffix=''){
  const n=Number(v);

  return v===null||
    v===undefined||
    !Number.isFinite(n)
      ?'기록 없음'
      :n.toFixed(digits)+suffix;
}

function labDashboardAdvice(rows){
  if(rows.length<3){
    return '동일 조건의 검사를 3회 이상 완료하면 개인별 변화 분석을 표시합니다.';
  }

  const recent=rows.slice(-3);
  const previous=rows.slice(-6,-3);

  const avg=(a,fn)=>{
    const v=a.map(fn).filter(Number.isFinite);

    return v.length
      ?v.reduce((x,y)=>x+y,0)/v.length
      :null;
  };

  const hit=avg(
    recent,
    r=>r.hits/Math.max(1,r.target_count)
  );

  const falseRate=avg(
    recent,
    r=>r.false_alarms/Math.max(1,r.non_target_count)
  );

  const rt=avg(
    recent,
    r=>r.average_reaction_ms===null
      ?NaN
      :r.average_reaction_ms
  );

  const current=avg(recent,r=>r.score);
  const prior=avg(previous,r=>r.score);

  const notes=[];

  if(hit!==null&&hit<.7){
    notes.push(
      '목표 도형을 놓치는 비율이 높습니다. 정확도를 우선하며 현재 과정을 반복하세요.'
    );
  }

  if(falseRate!==null&&falseRate>.2){
    notes.push(
      '비목표 도형에 반응하는 경향이 있습니다. 누르지 않고 기다리는 연습을 권합니다.'
    );
  }

  if(rt!==null&&rt>650){
    notes.push(
      '평균 반응시간이 비교적 깁니다. 정확도를 유지한 상태에서 속도를 점진적으로 개선하세요.'
    );
  }

  if(prior!==null&&current!==null){
    if(current>=prior+5){
      notes.push(
        '최근 3회 평균점수가 직전 3회보다 5점 이상 높습니다.'
      );
    }else if(current<=prior-5){
      notes.push(
        '최근 3회 평균점수가 직전 3회보다 5점 이상 낮습니다. 피로·환경 차이를 확인하세요.'
      );
    }
  }

  if(!notes.length){
    notes.push(
      '최근 기록이 비교적 안정적입니다. 같은 조건으로 기록을 더 축적한 뒤 상위 과정에 도전하세요.'
    );
  }

  return notes.join(' ');
}


/* =========================================
   FOCUS GROWTH · ADVANCED ANALYSIS
   동일 과정 / 동일 검사 횟수 비교
========================================= */

function labGrowthAdvancedAnalysis(rows){

  const recent=rows.slice(-10);

  const mean=values=>{
    const valid=values.filter(
      v=>typeof v==='number'&&Number.isFinite(v)
    );

    return valid.length
      ?valid.reduce((a,b)=>a+b,0)/valid.length
      :null;
  };

  const metrics={
    score:r=>Number(r.score),

    hit:r=>r.target_count>0
      ?r.hits/r.target_count*100
      :null,

    falseRate:r=>r.non_target_count>0
      ?r.false_alarms/r.non_target_count*100
      :null,

    rt:r=>r.average_reaction_ms!=null &&
      Number.isFinite(r.average_reaction_ms)
        ?r.average_reaction_ms
        :null
  };

  const metricValue=(r,key)=>{
    const value=metrics[key](r);

    return typeof value==='number' &&
      Number.isFinite(value)
        ?value
        :null;
  };

  const format=(value,unit='',digits=1)=>
    value===null
      ?'기록 없음'
      :value.toFixed(digits)+unit;

  /* -------------------------
     범용 성장 그래프
  ------------------------- */

  function graph(key,title,unit,color){

    const valid=recent
      .map(r=>({
        row:r,
        value:metricValue(r,key)
      }))
      .filter(x=>x.value!==null);

    if(!valid.length){
      return `
        <h3>${title}</h3>
        <p class="muted">측정 기록이 없습니다.</p>
      `;
    }

    const values=valid.map(x=>x.value);

    let low=Math.min(...values);
    let high=Math.max(...values);

    const margin=Math.max(
      key==='rt'?20:3,
      (high-low)*0.15
    );

    low=Math.max(0,low-margin);
    high=high+margin;

    if(key==='hit'||key==='falseRate'){
      high=Math.min(100,high);
    }

    const span=Math.max(1,high-low);

    const W=600;
    const H=190;
    const P=34;

    const points=valid.map((x,i)=>({

      x:P+(
        valid.length===1
          ?0.5
          :i/(valid.length-1)
      )*(W-P*2),

      y:H-P-(
        (x.value-low)/span
      )*(H-P*2),

      value:x.value,
      row:x.row
    }));

    const poly=points
      .map(p=>`${p.x},${p.y}`)
      .join(' ');

    return `
      <section style="margin:25px 0">

        <h3>${title} · 최근 ${valid.length}회</h3>

        <svg
          viewBox="0 0 ${W} ${H}"
          role="img"
          aria-label="${title}"
          style="
            display:block;
            width:100%;
            max-width:700px;
            background:#102039;
            border-radius:10px;
          "
        >

          <line
            x1="${P}" y1="${H-P}"
            x2="${W-P}" y2="${H-P}"
            stroke="#7891b1"
          />

          <line
            x1="${P}" y1="${P}"
            x2="${P}" y2="${H-P}"
            stroke="#7891b1"
          />

          <text
            x="${P+3}" y="${P-7}"
            fill="#d6e5ff"
            font-size="13"
          >${high.toFixed(0)}${unit}</text>

          <text
            x="${P+3}" y="${H-5}"
            fill="#d6e5ff"
            font-size="13"
          >${low.toFixed(0)}${unit}</text>

          ${
            points.length>1
              ?`
                <polyline
                  fill="none"
                  stroke="${color}"
                  stroke-width="3"
                  points="${poly}"
                />
              `
              :''
          }

          ${
            points.map(p=>`
              <circle
                cx="${p.x}"
                cy="${p.y}"
                r="5"
                fill="#ffd479"
              >
                <title>
                  ${p.value.toFixed(1)}${unit}
                  · ${new Date(
                    p.row.completed_at
                  ).toLocaleString('ko-KR')}
                </title>
              </circle>
            `).join('')
          }

        </svg>

      </section>
    `;
  }

  /* -------------------------
     최근 3회 / 직전 3회
  ------------------------- */

  const current=rows.slice(-3);
  const previous=rows.slice(-6,-3);

  function compare(key,label,unit,lowerBetter=false){

    const now=mean(
      current.map(r=>metricValue(r,key))
    );

    const before=mean(
      previous.map(r=>metricValue(r,key))
    );

    if(
      current.length<3 ||
      previous.length<3 ||
      now===null ||
      before===null
    ){
      return `
        <tr>
          <td>${label}</td>
          <td colspan="3">비교 기록 부족</td>
        </tr>
      `;
    }

    const difference=now-before;

    let status='유지';

    // 작은 변동을 개선/하락으로 과도하게 해석하지 않음
    const tolerance=
      key==='rt'?10:
      key==='score'?1:1;

    if(Math.abs(difference)>tolerance){

      const improved=lowerBetter
        ?difference<0
        :difference>0;

      status=improved?'개선':'하락';
    }

    return `
      <tr>
        <td>${label}</td>
        <td>${format(before,unit)}</td>
        <td>${format(now,unit)}</td>
        <td>
          ${difference>0?'+':''}
          ${difference.toFixed(1)}${unit}
          · ${status}
        </td>
      </tr>
    `;
  }

  /* -------------------------
     성장 분석 해석
  ------------------------- */

  const comments=[];

  if(rows.length>=6){

    const currentScore=mean(
      current.map(r=>metricValue(r,'score'))
    );

    const previousScore=mean(
      previous.map(r=>metricValue(r,'score'))
    );

    const currentRt=mean(
      current.map(r=>metricValue(r,'rt'))
    );

    const previousRt=mean(
      previous.map(r=>metricValue(r,'rt'))
    );

    if(
      currentScore!==null &&
      previousScore!==null
    ){

      const delta=currentScore-previousScore;

      if(delta>=5){
        comments.push(
          '최근 수행점수가 직전 구간보다 상승했습니다.'
        );
      }else if(delta<=-5){
        comments.push(
          '최근 수행점수가 직전 구간보다 하락했습니다.'
        );
      }else{
        comments.push(
          '최근 수행점수는 이전 구간과 큰 차이가 없습니다.'
        );
      }
    }

    if(
      currentRt!==null &&
      previousRt!==null
    ){

      const delta=currentRt-previousRt;

      if(delta<=-30){
        comments.push(
          '평균 반응시간이 단축되었습니다.'
        );
      }else if(delta>=30){
        comments.push(
          '평균 반응시간이 길어졌습니다.'
        );
      }
    }

  }else{

    comments.push(
      '동일 조건의 검사 6회가 축적되면 구간별 성장 비교가 활성화됩니다.'
    );
  }

  return `

    <div style="
      border-top:1px solid #64748b55;
      margin-top:28px;
      padding-top:20px;
    ">

      <h2>ADVANCED GROWTH ANALYSIS</h2>

      <p class="muted">
        동일 과정·동일 검사 횟수의 최근 기록을 비교합니다.
      </p>

      ${graph(
        'hit',
        '목표 적중률 변화',
        '%',
        '#9ee3c1'
      )}

      ${graph(
        'falseRate',
        '오반응률 변화',
        '%',
        '#f5ad8c'
      )}

      <h3>최근 3회 vs 직전 3회</h3>

      <div style="overflow-x:auto">

        <table style="
          width:100%;
          text-align:left;
          border-collapse:collapse;
        ">

          <thead>
            <tr>
              <th>측정 항목</th>
              <th>직전 3회</th>
              <th>최근 3회</th>
              <th>변화</th>
            </tr>
          </thead>

          <tbody>

            ${compare(
              'score','수행점수','점'
            )}

            ${compare(
              'hit','목표 적중률','%'
            )}

            ${compare(
              'falseRate','오반응률','%',true
            )}

            ${compare(
              'rt','평균 반응시간','ms',true
            )}

          </tbody>

        </table>

      </div>

      <h3>성장 변화 해석</h3>

      <p>${comments.join(' ')}</p>

      <p class="muted">
        적중률은 높을수록, 오반응률과 반응시간은
        낮을수록 유리합니다.
        단기간 변화만으로 능력 향상을 확정하지 않습니다.
      </p>

    </div>
  `;
}

  
async function labDashboardLoad(){
  const box=document.getElementById('labGrowthContent');
  const mode=document.getElementById('labHistoryMode');
  const count=document.getElementById('labHistoryCount');

  if(!box||!mode||!count||!state.user?.id)return;

  const request=++labDashboardRequest;
  const selectedMode=mode.value;
  const total=Number(count.value);

  box.textContent='저장된 검사 결과를 불러오는 중...';

  const {data,error}=await client
    .from('focus_lab_results')
    .select(
      'id,mode,total_trials,score,exp_delta,old_level,new_level,max_success_combo,max_fail_combo,result,completed_at'
    )
    .eq('user_id',state.user.id)
    .eq('mode',selectedMode)
    .eq('total_trials',total)
    .order('completed_at',{ascending:false})
    .limit(100);

  if(request!==labDashboardRequest)return;

  if(error){
    box.textContent='기록 조회 실패: '+error.message;
    return;
  }

  const rows=(data||[])
    .slice()
    .reverse()
    .map(r=>({
      ...r,
      hits:Number(r.result?.hits??0),
      target_count:Number(r.result?.target_count??0),
      false_alarms:Number(r.result?.false_alarms??0),
      non_target_count:Number(r.result?.non_target_count??0),
      average_reaction_ms:
        r.result?.average_reaction_ms==null
          ?null
          :Number(r.result.average_reaction_ms),
      switch_hits:Number(r.result?.switch_hits??0),
      switch_targets:Number(r.result?.switch_targets??0)
    }));

  if(!rows.length){
    box.innerHTML=`
      <p class="muted">
        이 과정·검사 횟수의 저장 기록이 없습니다.
        검사를 완료하면 여기에 표시됩니다.
      </p>
    `;
    return;
  }

  const recent=rows.slice(-10);
  const latest=rows[rows.length-1];

  const avg=(key)=>{
    const a=recent
      .map(x=>Number(x[key]))
      .filter(Number.isFinite);

    return a.length
      ?a.reduce((x,y)=>x+y,0)/a.length
      :null;
  };

  const lastScores=recent.map(x=>Number(x.score));

  const min=Math.max(0,Math.min(...lastScores)-10);
  const max=Math.min(100,Math.max(...lastScores)+10);
  const span=Math.max(1,max-min);

  const width=600;
  const height=190;
  const pad=24;

  const points=recent.map((r,i)=>({
    x:pad+
      (recent.length===1?.5:i/(recent.length-1))*
      (width-2*pad),
    y:height-pad-
      (r.score-min)/span*(height-2*pad),
    r
  }));

  const poly=points
    .map(p=>`${p.x},${p.y}`)
    .join(' ');

  const hit=latest.target_count
    ?latest.hits/latest.target_count*100
    :null;

  const falseRate=latest.non_target_count
    ?latest.false_alarms/latest.non_target_count*100
    :null;

  const date=r=>new Date(r.completed_at)
    .toLocaleString('ko-KR',{
      month:'numeric',
      day:'numeric',
      hour:'2-digit',
      minute:'2-digit'
    });

  box.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px;margin:12px 0">
      ${
        [
          ['비교 기록',rows.length+'회 (최근 최대 100회)'],
          ['최근 수행점수',latest.score+'/100'],
          ['최근 10회 평균',labDashboardMetric(avg('score'),1,'점')],
          ['현재 선택 과정 최고점',Math.max(...rows.map(x=>x.score))+'점'],
          ['최근 EXP 변화',(latest.exp_delta>=0?'+':'')+latest.exp_delta],
          ['최근 최대 성공 콤보',latest.max_success_combo+'회']
        ].map(([k,v])=>`
          <div style="padding:12px;border:1px solid #64748b55;border-radius:9px">
            <div class="muted" style="font-size:.85em">${k}</div>
            <strong>${v}</strong>
          </div>
        `).join('')
      }
    </div>

    <h3>수행점수 추이 · 최근 ${recent.length}회</h3>

    <svg
      viewBox="0 0 ${width} ${height}"
      role="img"
      aria-label="최근 수행점수 변화"
      style="display:block;width:100%;max-width:700px;background:#102039;border-radius:10px"
    >
      <line
        x1="${pad}"
        y1="${height-pad}"
        x2="${width-pad}"
        y2="${height-pad}"
        stroke="#7891b1"
      />

      <line
        x1="${pad}"
        y1="${pad}"
        x2="${pad}"
        y2="${height-pad}"
        stroke="#7891b1"
      />

      <text
        x="${pad+3}"
        y="${pad-5}"
        fill="#d6e5ff"
        font-size="13"
      >${max}점</text>

      <text
        x="${pad+3}"
        y="${height-5}"
        fill="#d6e5ff"
        font-size="13"
      >${min}점</text>

      ${
        points.length>1
          ?`<polyline fill="none" stroke="#72b6ff" stroke-width="3" points="${poly}"/>`
          :''
      }

      ${
        points.map((p,i)=>`
          <circle
            cx="${p.x}"
            cy="${p.y}"
            r="5"
            fill="#ffd479"
          >
            <title>
              ${i+1}번째 · ${p.r.score}점 · ${date(p.r)}
            </title>
          </circle>
        `).join('')
      }
    </svg>

    <p class="muted">
      그래프는 동일 과정·동일 검사 횟수만 비교합니다.
      최대 최근 100회 조회 중 마지막 10회를 표시합니다.
    </p>

   
    <h3>평균 반응시간 변화 · 최근 ${recent.length}회</h3>

    <p class="muted">
      동일 과정·동일 검사 횟수에서 측정된 평균 반응시간입니다.
      수치가 낮을수록 반응이 빠릅니다.
    </p>

    ${
      (() => {

        // 유효한 반응시간이 있는 검사만 사용
        const rtRows=recent.filter(r=>
          r.average_reaction_ms!==null &&
          Number.isFinite(r.average_reaction_ms) &&
          r.average_reaction_ms>=0
        );

        if(rtRows.length===0){
          return '<p class="muted">반응시간 기록이 아직 없습니다.</p>';
        }

        const values=rtRows.map(r=>r.average_reaction_ms);

        const rtMin=Math.max(0,Math.min(...values)-50);
        const rtMax=Math.max(...values)+50;
        const rtSpan=Math.max(1,rtMax-rtMin);

        const w=600;
        const h=190;
        const p=30;

        const rtPoints=rtRows.map((r,i)=>({

          x:p+(
            rtRows.length===1
              ?0.5
              :i/(rtRows.length-1)
          )*(w-p*2),

          y:h-p-(
            (r.average_reaction_ms-rtMin)/rtSpan
          )*(h-p*2),

          r
        }));

        return `
          <svg
            viewBox="0 0 ${w} ${h}"
            role="img"
            aria-label="평균 반응시간 변화"
            style="
              display:block;
              width:100%;
              max-width:700px;
              background:#102039;
              border-radius:10px;
            "
          >

            <line
              x1="${p}" y1="${h-p}"
              x2="${w-p}" y2="${h-p}"
              stroke="#7891b1"
            />

            <line
              x1="${p}" y1="${p}"
              x2="${p}" y2="${h-p}"
              stroke="#7891b1"
            />

            <text
              x="${p+3}" y="${p-7}"
              fill="#d6e5ff"
              font-size="13"
            >${Math.round(rtMax)}ms</text>

            <text
              x="${p+3}" y="${h-5}"
              fill="#d6e5ff"
              font-size="13"
            >${Math.round(rtMin)}ms</text>

            ${
              rtPoints.length>1
                ?`
                  <polyline
                    fill="none"
                    stroke="#9ee3c1"
                    stroke-width="3"
                    points="${
                      rtPoints.map(a=>`${a.x},${a.y}`).join(' ')
                    }"
                  />
                `
                :''
            }

            ${
              rtPoints.map(a=>`
                <circle
                  cx="${a.x}"
                  cy="${a.y}"
                  r="5"
                  fill="#ffd479"
                >
                  <title>
                    ${Math.round(a.r.average_reaction_ms)}ms
                    · ${date(a.r)}
                  </title>
                </circle>
              `).join('')
            }

          </svg>

          <p class="muted">
            유효한 반응시간 기록 ${rtRows.length}회 기준
          </p>
        `;

      })()
    }

       ${labGrowthAdvancedAnalysis(rows)}

    <h3>가장 최근 검사 세부 결과</h3>
    
    <p>
      목표 적중률
      <strong>${labDashboardMetric(hit,1,'%')}</strong>
      · 오반응률
      <strong>${labDashboardMetric(falseRate,1,'%')}</strong>
      · 평균 반응속도
      <strong>${labDashboardMetric(latest.average_reaction_ms,0,'ms')}</strong>
      · 최대 실패 콤보
      <strong>${latest.max_fail_combo}회</strong>
    </p>

    <h3>개인별 훈련 제안</h3>

    <p>${labEscape(labDashboardAdvice(rows))}</p>

    <details>
      <summary>최근 검사 기록 보기</summary>

      <div style="overflow-x:auto">
        <table style="width:100%;text-align:left">
          <thead>
            <tr>
              <th>날짜</th>
              <th>점수</th>
              <th>EXP</th>
              <th>적중</th>
              <th>오반응</th>
              <th>반응시간</th>
            </tr>
          </thead>

          <tbody>
            ${
              recent.slice().reverse().map(r=>`
                <tr>
                  <td>${date(r)}</td>
                  <td>${r.score}</td>
                  <td>${r.exp_delta>=0?'+':''}${r.exp_delta}</td>
                  <td>${r.hits}/${r.target_count}</td>
                  <td>${r.false_alarms}/${r.non_target_count}</td>
                  <td>${labDashboardMetric(r.average_reaction_ms,0,'ms')}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    </details>

    <p class="muted">
      본 지표는 검사 내 행동 수행 기록이며
      뇌파 측정 또는 의학적 진단이 아닙니다.
    </p>
  `;
}


/* =========================
   FOCUS LAB 3.2
   독립 입장 화면 / 성장 분석 분리
========================= */

function labInstallRooms(){

  if(document.getElementById('labHubOverlay'))return;

  const css=document.createElement('style');
  css.id='labRoomsStyle';

  css.textContent=`
    .lab-room{
      position:fixed;
      inset:0;
      z-index:2147482990;
      background:#080f1c;
      color:#f2f7ff;
      overflow-y:auto;
      padding:22px;
      box-sizing:border-box;
    }

    .lab-room[hidden]{
      display:none!important;
    }

    .lab-room-inner{
      max-width:850px;
      margin:0 auto;
      padding:24px 0 60px;
    }

    .lab-room-head{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      margin-bottom:30px;
    }

    .lab-room button{
      font:inherit;
      cursor:pointer;
      border:1px solid #577394;
      border-radius:10px;
      background:#203c60;
      color:white;
      padding:12px 18px;
    }

    .lab-room button:hover{
      background:#2d527e;
    }

    .lab-room-title{
      font-size:clamp(25px,5vw,39px);
      margin:8px 0;
    }

    .lab-room-sub{
      color:#b4c6df;
      line-height:1.7;
    }

    .lab-room-cards{
      display:grid;
      grid-template-columns:
        repeat(auto-fit,minmax(240px,1fr));
      gap:15px;
      margin-top:28px;
    }

    .lab-room-card{
      background:#101f34!important;
      border:1px solid #304763!important;
      border-radius:16px!important;
      padding:24px!important;
      display:flex;
      flex-direction:column;
      align-items:flex-start;
      gap:13px;
      text-align:left;
      min-height:190px;
    }

    .lab-room-card strong{
      font-size:23px;
    }

    .lab-room-card span{
      color:#b4c6df;
      line-height:1.5;
    }

    #labGrowthRoom #labGrowthPanel{
      background:transparent;
      border:0;
      box-shadow:none;
      padding:0;
      margin:0;
      width:100%;
      max-width:100%;
    }

    @media(max-width:500px){
      .lab-room{
        padding:14px;
      }

      .lab-room-inner{
        padding-top:12px;
      }
    }
  `;

  document.head.appendChild(css);

  /* 검증실 입구 */

  const hub=document.createElement('section');

  hub.id='labHubOverlay';
  hub.className='lab-room';
  hub.hidden=true;

  hub.innerHTML=`
    <div class="lab-room-inner">

      <div class="lab-room-head">
        <strong>
          SPIRIT SYSTEM / FOCUS LAB
        </strong>

        <button id="labHubExit" type="button">
          ← 메인으로
        </button>
      </div>

      <p class="lab-room-sub">
        INDEPENDENT FOCUS TRAINING
      </p>

      <h1 class="lab-room-title">
        집중력 검증실
      </h1>

      <p id="labHubStats" class="lab-room-sub">
        성장 정보를 불러오는 중...
      </p>

      <div class="lab-room-cards">

        <button
          id="labHubTest"
          class="lab-room-card"
          type="button"
        >
          <strong>◈ 집중력 검사</strong>

          <span>
            일반 3단계 · 응용 3단계
            <br>
            도형 반응 검사에 입장합니다.
          </span>

          <b>검사 시작 →</b>
        </button>

        <button
          id="labHubGrowth"
          class="lab-room-card"
          type="button"
        >
          <strong>↗ 성장 분석</strong>

          <span>
            검사 기록 · 점수 추이 · 반응 패턴
            <br>
            나의 성장 기록을 확인합니다.
          </span>

          <b>기록 보기 →</b>      
        </button>

        <button
          id="labHubMaster"
          class="lab-room-card"
          type="button"
        >
          <strong>✦ MASTER CHALLENGE</strong>

          <span>
            FOCUS LV.90부터 입장 가능
            <br>
            80문항 · 목표 전환 5회
            <br>
            3회 합격 및 LV.100 달성
          </span>

          <b id="labHubMasterLabel">
            도전 정보 확인 →
          </b>
        </button>



      </div>
    </div>
  `;

  /* 성장 분석 전용 화면 */

  const growth=document.createElement('section');

  growth.id='labGrowthRoom';
  growth.className='lab-room';
  growth.hidden=true;

  growth.innerHTML=`
    <div class="lab-room-inner">

      <div class="lab-room-head">
        <strong>
          FOCUS GROWTH / HISTORY
        </strong>

        <button id="labGrowthBack" type="button">
          ← 검증실로
        </button>
      </div>

      <div id="labGrowthMount"></div>

    </div>
  `;

  document.body.append(hub,growth);

  /*
   기존 3.1 성장 분석 패널을
   메인 화면에서 전용 화면으로 이동
  */

  const panel=document.getElementById('labGrowthPanel');

  if(panel){
    document
      .getElementById('labGrowthMount')
      .appendChild(panel);
  }

  /* 버튼 연결 */

  document.getElementById('labHubExit').onclick=
    labCloseRooms;

  document.getElementById('labHubTest').onclick=()=>{
    labCloseRooms();
    openFocusLab();
  };

  document.getElementById('labHubGrowth').onclick=
    labOpenGrowth;

  document.getElementById('labGrowthBack').onclick=
    labOpenHub;

  
  document.getElementById('labHubMaster').onclick=()=>{
    labCloseRooms();
    openFocusLab('master');
  };

}


/* 모든 연구실 화면 닫기 */

function labCloseRooms(){

  const hub=document.getElementById('labHubOverlay');
  const growth=document.getElementById('labGrowthRoom');

  if(hub)hub.hidden=true;
  if(growth)growth.hidden=true;

  document.body.style.overflow='';
}


/* 집중력 검증실 입장 */

/* =========================
   FOCUS LAB 3.4
   검증실 입구 / 성장 현황 / 최근 검사
========================= */

async function labOpenHub(){

  labInstallRooms();
  labCloseRooms();

  const hub=document.getElementById('labHubOverlay');
  const stats=document.getElementById('labHubStats');

  if(!hub||!stats)return;

  hub.hidden=false;
  document.body.style.overflow='hidden';

  stats.textContent='성장 정보를 불러오는 중...';

  try{

    /* 1. 독립 FOCUS 프로필 조회 */

    const p=await labLoadProfile();

    if(hub.hidden)return;

    const level=Math.max(1,Number(p.level)||1);
    const exp=Math.max(0,Number(p.exp)||0);
    const highest=Math.max(1,Number(p.max_level)||1);
    const total=Math.max(0,Number(p.total_tests)||0);

    const needed=labExpNeed(level);

    const percent=Math.max(
      0,
      Math.min(100,(exp/needed)*100)
    );

    /* 2. 다음 검사 과정 해금 정보 */

    const next=Object.values(LAB_MODES)
      .sort((a,b)=>a.level-b.level)
      .find(mode=>mode.level>highest);

    const nextName=next
      ?next.name
      :'ALL COURSES UNLOCKED';

    const nextLevel=next
      ?`LV.${next.level}`
      :'MASTER';

    const remaining=next
      ?Math.max(0,next.level-level)
      :0;

    /* 3. 성장 현황 카드 */

    stats.innerHTML=`

      <div style="
        margin-top:22px;
        padding:24px;
        background:linear-gradient(
          145deg,
          #142842,
          #101d30 70%
        );
        border:1px solid #365474;
        border-radius:18px;
        box-shadow:0 12px 35px #00000022;
        text-align:left;
      ">

        <div style="
          color:#94b5d8;
          font-size:11px;
          font-weight:700;
          letter-spacing:2px;
        ">
          PERSONAL FOCUS PROGRESS
        </div>

        <div style="
          display:flex;
          justify-content:space-between;
          align-items:flex-end;
          gap:15px;
          margin-top:18px;
        ">

          <div>

            <div style="
              font-size:11px;
              color:#a8bdd7;
              letter-spacing:1px;
            ">
              CURRENT FOCUS LEVEL
            </div>

            <div style="
              font-size:clamp(37px,8vw,52px);
              font-weight:800;
              line-height:1.25;
              color:#ffffff;
              font-variant-numeric:tabular-nums;
            ">
              LV.${level}
            </div>

          </div>

          <div style="text-align:right">

            <div style="
              font-size:11px;
              color:#a8bdd7;
            ">
              HIGHEST LEVEL
            </div>

            <div style="
              font-size:24px;
              font-weight:750;
              color:#c2dfff;
            ">
              LV.${highest}
            </div>

          </div>

        </div>

        <div style="
          height:10px;
          background:#293d57;
          border-radius:30px;
          overflow:hidden;
          margin-top:22px;
        ">

          <div style="
            width:${percent}%;
            height:100%;
            background:linear-gradient(
              90deg,
              #4f88db,
              #80c4ff
            );
            border-radius:30px;
            transition:width .5s ease;
          "></div>

        </div>

        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          margin-top:9px;
          font-size:13px;
          color:#c6d8ed;
          font-variant-numeric:tabular-nums;
        ">

          <span>
            EXP ${exp} / ${needed}
          </span>

          <strong>
            ${percent.toFixed(1)}%
          </strong>

        </div>

        <div style="
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:12px;
          margin-top:23px;
        ">

          <div style="
            background:#0b1729;
            border-radius:10px;
            padding:13px;
          ">

            <div style="
              font-size:11px;
              color:#9eb5d0;
            ">
              COMPLETED TESTS
            </div>

            <div style="
              font-size:23px;
              font-weight:750;
              margin-top:5px;
            ">
              ${total}
            </div>

          </div>

          <div style="
            background:#0b1729;
            border-radius:10px;
            padding:13px;
          ">

            <div style="
              font-size:11px;
              color:#9eb5d0;
            ">
              NEXT LEVEL
            </div>

            <div style="
              font-size:23px;
              font-weight:750;
              margin-top:5px;
            ">
              ${
                level>=100
                  ?'MASTER'
                  :`LV.${level+1}`
              }
            </div>

          </div>

        </div>

        <div style="
          border-top:1px solid #344b68;
          margin-top:20px;
          padding-top:17px;
        ">

          <div style="
            font-size:11px;
            letter-spacing:1px;
            color:#9eb5d0;
          ">
            NEXT COURSE UNLOCK
          </div>

          <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:12px;
            margin-top:8px;
          ">

            <strong style="
              font-size:16px;
              color:#e3efff;
            ">
              ${labEscape(nextName)}
            </strong>

            <span style="
              font-size:13px;
              color:#9ac9ff;
              white-space:nowrap;
            ">
              ${nextLevel}
            </span>

          </div>

          <div style="
            color:#a8bdd7;
            font-size:12px;
            margin-top:8px;
          ">
            ${
              next
                ?`해금까지 ${remaining}레벨`
                :'모든 기본 검사 과정이 해금되었습니다.'
            }
          </div>

        </div>

      </div>

      <div id="labHubLatest" style="
        margin-top:14px;
        padding:17px 20px;
        background:#101f34;
        border:1px solid #304763;
        border-radius:13px;
        text-align:left;
      ">

        <div style="
          font-size:11px;
          letter-spacing:1.5px;
          color:#9eb5d0;
        ">
          LATEST PERFORMANCE
        </div>

        <div style="
          color:#b4c6df;
          font-size:13px;
          margin-top:9px;
        ">
          최근 검사 기록을 불러오는 중...
        </div>

      </div>

    `;


    
    /* FOCUS LAB 3.5 — MASTER STATUS */

    const masterPasses=
      Math.min(3,Math.max(0,Number(p.master_passes)||0));

    const masterAttempts=
      Math.max(0,Number(p.master_attempts)||0);

    const isMaster=Boolean(p.master_at);

    const masterCard=document.getElementById('labHubMaster');
    const masterLabel=document.getElementById('labHubMasterLabel');

    if(masterCard){
      masterCard.disabled=isMaster || level<90;
      masterCard.style.opacity=
        masterCard.disabled?'.65':'1';
    }

    if(masterLabel){
      masterLabel.textContent=
        isMaster
          ?'MASTER 달성 완료'
          :level<90
            ?`LV.90 해금 · ${90-level}레벨 남음`
            :'MASTER 도전 입장 →';
    }

    const masterStatus=document.createElement('div');

    masterStatus.id='labMasterStatus';

    masterStatus.style.cssText=`
      margin-top:14px;
      padding:18px 20px;
      background:linear-gradient(135deg,#1b2945,#101b30);
      border:1px solid #53698e;
      border-radius:13px;
      text-align:left;
    `;

    masterStatus.innerHTML=`
      <div style="
        color:#b6c9e6;
        font-size:11px;
        letter-spacing:1.5px;
      ">
        MASTER PROGRESSION
      </div>

      <div style="
        font-size:21px;
        font-weight:800;
        margin-top:10px;
        color:#f4e1a5;
      ">
        ${isMaster?'✦ FOCUS MASTER':'MASTER CHALLENGE'}
      </div>

      <div style="
        margin-top:9px;
        color:#c7d7ee;
        font-size:13px;
      ">
        합격 ${masterPasses}/3회
        · 도전 ${masterAttempts}회
        · 현재 LV.${level}/100
      </div>

      <div style="
        display:flex;
        gap:7px;
        margin-top:14px;
      ">
        ${[1,2,3].map(n=>`
          <div style="
            flex:1;
            height:8px;
            border-radius:8px;
            background:${
              masterPasses>=n?'#eacb78':'#344761'
            };
          "></div>
        `).join('')}
      </div>

      <p style="
        color:#aebfda;
        font-size:12px;
        line-height:1.6;
        margin:12px 0 0;
      ">
        ${
          isMaster
            ?'모든 마스터 자격 조건을 달성했습니다.'
            :level<90
              ?'FOCUS LV.90에 도달하면 마스터 도전이 열립니다.'
              :masterPasses>=3
                ?'합격 조건을 충족했습니다. LV.100 달성이 남았습니다.'
                :'95점 이상 · 적중률 90% 이상 · 오반응률 5% 이하 · 최대 연속 실패 2회 이하'
        }
      </p>
    `;

    stats.appendChild(masterStatus);


    /* 4. 최근 검사 결과 조회 */

    const {data,error}=await client
      .from('focus_lab_results')
      .select(
        'mode,total_trials,score,exp_delta,completed_at'
      )
      .eq('user_id',state.user.id)
      .order('completed_at',{ascending:false})
      .limit(1);

    if(hub.hidden)return;

    const latest=document.getElementById('labHubLatest');

    if(!latest)return;

    if(error){

      latest.innerHTML=`
        <div style="color:#9eb5d0;font-size:12px">
          LATEST PERFORMANCE
        </div>

        <p style="color:#b4c6df">
          최근 검사 기록을 불러오지 못했습니다.
        </p>
      `;

      console.error(
        '[FOCUS LAB] latest result:',
        error
      );

      return;
    }

    const r=data?.[0];

    if(!r){

      latest.innerHTML=`
        <div style="color:#9eb5d0;font-size:12px">
          LATEST PERFORMANCE
        </div>

        <p style="color:#b4c6df">
          아직 완료된 검사 기록이 없습니다.
        </p>
      `;

      return;
    }

    const modeName=
      LAB_MODES[r.mode]?.name||r.mode||'FOCUS TEST';

    const score=Number(r.score);
    const delta=Number(r.exp_delta)||0;

    const date=r.completed_at
      ?new Date(r.completed_at).toLocaleString('ko-KR',{
          year:'numeric',
          month:'numeric',
          day:'numeric',
          hour:'2-digit',
          minute:'2-digit'
        })
      :'날짜 없음';

    latest.innerHTML=`

      <div style="
        font-size:11px;
        letter-spacing:1.5px;
        color:#9eb5d0;
      ">
        LATEST PERFORMANCE
      </div>

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        margin-top:12px;
      ">

        <div>

          <div style="
            color:#c4d7ed;
            font-size:12px;
          ">
            ${labEscape(modeName)}
            · ${Number(r.total_trials)||0}회
          </div>

          <div style="
            color:#ffffff;
            font-size:28px;
            font-weight:800;
            margin-top:5px;
          ">
            ${
              Number.isFinite(score)
                ?`${score}/100`
                :'기록 없음'
            }
          </div>

        </div>

        <div style="text-align:right">

          <div style="
            color:${delta>=0?'#8de0b2':'#ff9fa9'};
            font-size:20px;
            font-weight:750;
          ">
            EXP ${delta>=0?'+':''}${delta}
          </div>

          <div style="
            color:#9eb5d0;
            font-size:11px;
            margin-top:6px;
          ">
            ${labEscape(date)}
          </div>

        </div>

      </div>

    `;

  }catch(e){

    if(!hub.hidden){
      stats.textContent=
        '성장 기록 조회 실패: '+e.message;
    }

    console.error('[FOCUS LAB HUB]',e);

  }
}


/* 성장 분석 전용 화면 열기 */

function labOpenGrowth(){

  labInstallRooms();
  labCloseRooms();

  document.getElementById('labGrowthRoom').hidden=false;

  document.body.style.overflow='hidden';

  labDashboardLoad();
}

  
function installFocusLab(){
  if($('focusLabPanel'))return;

  const quest=$('questList')?.closest('.panel');
  if(!quest)return;

  const panel=document.createElement('div');
  panel.className='panel';
  panel.id='focusLabPanel';

  panel.innerHTML=`
    <div class="section-title">
      <h2>FOCUS LAB · 집중력 검증실</h2>
      <span class="muted">독립 성장 LV.1~100</span>
    </div>
    <div class="quest">
      <div>
        <h3>NEURAL FOCUS</h3>
        <p>일반 3단계 · 응용 3단계 · 성공/실패 콤보 · 성과 기반 승급과 강등</p>
        <p id="focusLabInfo" class="muted">FOCUS 성장 기록을 불러오는 중...</p>
      </div>
      <button id="focusLabOpen" type="button">수행</button>
    </div>
  `;

 

quest.insertAdjacentElement('afterend',panel);

$('focusLabOpen').textContent='입장 →';
$('focusLabOpen').onclick=labOpenHub;

labDashboardInstall();
labInstallRooms();



  if(!$('focusLabStyle')){
    const style=document.createElement('style');
    style.id='focusLabStyle';

    style.textContent=`
#focusLabOverlay{position:fixed;inset:0;z-index:2147483000;background:radial-gradient(ellipse at 50% 45%,#152b4a,#070e1b 75%);color:#f2f7ff;font-family:inherit;box-sizing:border-box;padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;user-select:none}
#focusLabOverlay[hidden]{display:none!important}
#focusLabOverlay *{box-sizing:border-box}
#focusLabOverlay button,#focusLabOverlay select{font:inherit;color:#fff;background:#1b3658;border:1px solid #6487ad;border-radius:10px;padding:12px 18px;cursor:pointer}
#focusLabOverlay button:disabled,#focusLabOverlay option:disabled{opacity:.45;cursor:not-allowed}
#focusLabTop{position:absolute;top:14px;left:20px;right:20px;display:flex;justify-content:space-between;align-items:center;gap:12px;z-index:3}
#focusLabBody{width:min(720px,96vw);max-height:80vh;overflow-y:auto;display:flex;flex-direction:column;align-items:center;gap:12px;line-height:1.55}
#focusLabBody select{width:min(460px,100%)}
#focusLabBody p{margin:3px 0}
.lab-muted{color:#aec3df;font-size:.9em}
.lab-target{font-size:clamp(85px,17vmin,155px)}

#focusLabStimulus{
  position:fixed;
  top:50%;
  left:50%;
  transform:translate(-50%,-50%);
  font-family:'Segoe UI Symbol','Noto Sans Symbols 2',sans-serif;
  font-size:clamp(70px,13vmin,140px);
  line-height:1;
  color:#fff;
  pointer-events:none;
  width:110px;
  height:110px;
  min-width:0;
  min-height:0;
  display:flex;
  align-items:center;
  justify-content:center;
}
#focusLabOverlay.lab-running{cursor:crosshair}
#focusLabOverlay.lab-running #focusLabBody{display:none}
#labHud{position:fixed;top:75px;left:20px;right:20px;display:none;justify-content:space-between;align-items:flex-start;pointer-events:none;z-index:2;font-variant-numeric:tabular-nums}
#focusLabOverlay.lab-running #labHud{display:flex}
.lab-hud-col{display:flex;flex-direction:column;gap:5px;text-align:left}
.lab-hud-col:last-child{text-align:right}
#labCombo{font-size:clamp(20px,3vw,36px);font-weight:900;color:#ffd678;transition:transform .12s}
#labCombo.lab-pop{transform:scale(1.13)}
#labFail{font-size:17px;color:#ff8f9d;font-weight:bold}
#labTargetHud{font-size:35px;line-height:1.1}
#labProgressBar{position:fixed;top:61px;left:20px;right:20px;height:5px;background:#263d5a;border-radius:8px;overflow:hidden;display:none}
#focusLabOverlay.lab-running #labProgressBar{display:block}
#labProgressFill{height:100%;width:0;background:#70adff;transition:width .2s}
#focusLabOverlay .lab-result{width:min(550px,100%);text-align:left;line-height:1.9;background:#10223a;padding:18px;border-radius:12px}
#focusLabOverlay .lab-choice{display:flex;justify-content:space-between;align-items:center;gap:15px;width:min(460px,100%);padding:8px 12px;background:#10223a;border:1px solid #28486c;border-radius:9px;text-align:left}
@media(max-width:500px){
  #focusLabOverlay{padding:12px}
  #focusLabTop{left:10px;right:10px}
  #labHud{left:12px;right:12px}
 #focusLabStimulus{
  width:90px;
  height:90px;
  min-width:0;
  min-height:0;
}
}
`;

    document.head.appendChild(style);
  }

  const overlay=document.createElement('div');
  overlay.id='focusLabOverlay';
  overlay.hidden=true;

  overlay.innerHTML=`
    <div id="focusLabTop">
      <strong>FOCUS LAB / NEURAL FOCUS</strong>
      <div>
        <span id="focusLabProgress"></span>
        <button id="focusLabClose" type="button">닫기</button>
      </div>
    </div>

    <div id="labProgressBar">
      <div id="labProgressFill"></div>
    </div>

    <div id="labHud">
      <div class="lab-hud-col">
        <span class="lab-muted">CURRENT TARGET</span>
        <strong id="labTargetHud"></strong>
        <span id="labCombo">0 COMBO</span>
        <span id="labFail"></span>
      </div>

      <div class="lab-hud-col">
        <span id="labTrialHud"></span>
        <span id="labExpHud" style="color:#9be6bb"></span>
        <span class="lab-muted">SPACE / LEFT CLICK</span>
      </div>
    </div>

    <div id="focusLabBody"></div>
    <div id="focusLabStimulus" aria-hidden="true"></div>
  `;


document.body.appendChild(overlay);

$('focusLabClose').textContent='← 검증실로';

$('focusLabClose').onclick=()=>{

  if(focusLabSaving)return;

  // 검사 진행 중이거나 카운트다운 중이면
  // 타이머를 중단하고 미완료 검사를 폐기한다.
  if(
    focusLab?.phase==='running' ||
    focusLab?.phase==='countdown'
  ){
    labClearTimers();
    focusLab.phase='aborted';
  }

  closeFocusLab();

  // 메인 화면이 아니라 검증실 입구로 돌아간다.
  labOpenHub();
};


  overlay.addEventListener('click',e=>{
    if(
      e.button===0&&
      focusLab?.phase==='running'&&
      !e.target.closest('button')
    ){
      recordV3PerformanceResponse();
    }
  });

  document.addEventListener('keydown',e=>{
    if(e.code==='Space'&&focusLab?.phase==='running'){
      e.preventDefault();
      if(!e.repeat)recordV3PerformanceResponse();
    }
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&focusLab?.phase==='running'){
      abortFocusLab('화면을 벗어나 측정이 중단되었습니다.');
    }
  });

  window.addEventListener('blur',()=>{
    if(focusLab?.phase==='running'){
      abortFocusLab('창의 초점이 변경되어 측정이 중단되었습니다.');
    }
  });

  labLoadProfile().catch(e=>{
    if($('focusLabInfo')){
      $('focusLabInfo').textContent=
        '성장 데이터 로딩 실패: '+e.message;
    }
  });
}

async function openFocusLab(requestedMode=null){
  installFocusLab();
  if(focusLabSaving)return;

  labClearTimers();
  focusLab={phase:'intro'};

  $('focusLabOverlay').hidden=false;
  $('focusLabOverlay').classList.remove('lab-running');
  $('focusLabStimulus').textContent='';
  $('focusLabProgress').textContent='설정';

  try{
    await labLoadProfile();
  }catch(e){
    $('focusLabBody').innerHTML=`
      <h2>성장 기록을 불러오지 못했습니다</h2>
      <p>${labEscape(e.message)}</p>
      <p>먼저 제공된 FOCUS LAB 3.0 SQL을 실행해야 합니다.</p>
    `;
    return;
  }

  const p=labProfile;


  if(
    requestedMode==='master' &&
    (
      Number(p.level)<90 ||
      Boolean(p.master_at)
    )
  ){
    $('focusLabBody').innerHTML=`
      <h1>MASTER CHALLENGE</h1>

      <p>
        ${
          p.master_at
            ?'이미 FOCUS MASTER 자격을 획득했습니다.'
            :'현재 FOCUS LV.90 이상에서 입장할 수 있습니다.'
        }
      </p>

      <p class="lab-muted">
        현재 FOCUS LV.${Number(p.level)||1}
        · 누적 합격 ${Number(p.master_passes)||0}/3회
      </p>

      <button id="labMasterBack" type="button">
        ← 검증실로
      </button>
    `;

    $('labMasterBack').onclick=()=>{
      closeFocusLab();
      labOpenHub();
    };

    return;
  }

  
  const modes=Object.entries(LAB_MODES)
    .filter(([key])=>
      requestedMode==='master'
        ?key==='master'
        :key!=='master'
    )
    .map(([key,c])=>{
      const unlocked=p.max_level>=c.level;

      return `
        <option value="${key}" ${unlocked?'':'disabled'}>
          ${c.name} · LV${c.level}
          ${unlocked?'':'🔒 해금'}
          · 도형 ${c.shapes}종
          ${c.switches?' · 목표 '+c.switches+'회 전환':''}
        </option>
      `;
    }).join('');

  $('focusLabBody').innerHTML=`
    <h1>NEURAL FOCUS</h1>

    <p>
      FOCUS LV.${p.level} ·
      EXP ${p.exp}/${labExpNeed(p.level)} ·
      최고 LV.${p.max_level}
    </p>

    <p class="lab-muted">
      SPIRIT 클래스·레벨과 별도로 성장합니다.
      해금한 과정은 강등 후에도 유지됩니다.
    </p>

    <label for="labMode">측정 과정</label>
    <select id="labMode">${modes}</select>

    <label for="labCount">측정 횟수</label>
    <select id="labCount"></select>

    <p class="lab-muted" id="labModeInfo"></p>

    <p>
      목표 도형에만 SPACE 또는 마우스 왼쪽 클릭.
      다른 도형에는 반응하지 마세요.
    </p>

    <p class="lab-muted">
      성공 콤보는 3회부터, 연속 실패 차감도
      3회부터 적용됩니다.
      검사 중에는 예상치, 종료 후에는 서버 확정치를 표시합니다.
    </p>

    <button id="labPrepare" type="button">검사 준비</button>
  `;

  const update=()=>{
    const c=LAB_MODES[$('labMode').value];
    const applied=c.switches>0;

    $('labCount').innerHTML=
      (applied?[40,80]:[30,60])
        .map(n=>`<option value="${n}">${n}회</option>`)
        .join('');

    $('labModeInfo').textContent=
`도형 ${c.shapes}종 · 목표 전환 ${c.switches}회 · 가변 노출 ${c.displayMin}~${c.displayMax}ms · 반응 ${c.response}ms · 무작위 대기 ${c.min}~${c.max}ms`;

  };

 
  $('labMode').onchange=update;

  if(requestedMode==='master'){
    $('labMode').value='master';
    $('labMode').disabled=true;
  }

  update();

  if(requestedMode==='master'){
    $('labCount').value='80';
    $('labCount').disabled=true;

    $('labModeInfo').textContent=
      
'MASTER CHALLENGE · 도형 16종 · 목표 전환 5회 · 가변 노출 70~170ms · 총 80문항 · 합격 기준 95점 이상';


    const heading=$('focusLabBody').querySelector('h1');

    if(heading){
      heading.textContent='MASTER CHALLENGE';
    }
  }

  $('labPrepare').onclick=prepareFocusLab;

}

function prepareFocusLab(){
  const modeKey=$('labMode').value;
  const c=LAB_MODES[modeKey];
  const total=Number($('labCount').value);

 
  if(
    !c ||
    (
      modeKey==='master'
        ? (
            Number(labProfile.level)<90 ||
            Boolean(labProfile.master_at)
          )
        : Number(labProfile.max_level)<c.level
    ) ||
    !(c.switches?[40,80]:[30,60]).includes(total) ||
    (modeKey==='master' && total!==80)
  )return;

  const shapes=labShuffle(LAB_SHAPES).slice(0,c.shapes);
  const targets=labShuffle(shapes).slice(0,c.switches+1);
  const boundaries=[];

  for(let i=1;i<=c.switches;i++){
    boundaries.push(
      Math.floor(total*i/(c.switches+1))
    );
  }

   // 새로운 검사마다 위치 기록 초기화
  labZoneTrials = [];
  labPositionQueue = [];
  labCurrentZone = null;

  focusLab={
    phase:'ready',
    modeKey,
    config:c,
    total,
    shapes,
    targets,
    boundaries,
    section:0,
    index:0,
    hits:0,
    misses:0,
    falseAlarms:0,
    reactionTimes:[],
    early:[],
    late:[],
    switchHits:0,
    switchTargets:0,
    trials:[],
    windowOpen:false,
    responded:false,
    startedAt:0,
    successCombo:0,
    failCombo:0,
    maxSuccess:0,
    maxFail:0,
    comboBonus:0,
    failPenalty:0,
    earlyInputs:0,
    extraInputs:0,
    estimatedExp:0,
    exposureSequence:labBuildExposureSequence(c,total)

  };

  showFocusLabTarget();
}

function showFocusLabTarget(){
  const s=focusLab;
  if(!s)return;

  s.phase='ready';

  const t=s.targets[s.section];

  $('focusLabOverlay').classList.remove('lab-running');
  $('focusLabProgress').textContent=
    `${s.config.name} · ${s.total}회`;

  $('focusLabStimulus').textContent='';

  $('focusLabBody').innerHTML=`
    <h2>
      ${s.section?'목표 도형 변경':'이번 검사의 목표'}
    </h2>

    <div class="lab-target">${t.symbol}</div>
    <h3>${t.name}</h3>

    <p>
      이 도형에만 반응하십시오.
      이전 목표는 정답이 아닙니다.
    </p>

    <p class="lab-muted">
      전환 안내 중에는 콤보가 유지되고,
      검사는 일시 정지됩니다.
    </p>

    <button id="labTargetConfirm" type="button">
      목표 확인 · 계속하기
    </button>
  `;

  $('labTargetConfirm').onclick=startV3FocusPerformanceTest;
}

function startV3FocusPerformanceTest(){
  if(focusLab?.phase!=='ready')return;

  focusLab.phase='countdown';

  let n=3;

  $('focusLabBody').innerHTML=`
    <h2>화면 전체에 주의를 기울이세요</h2>
    <h1 id="labCountdown">3</h1>
    <p>목표 도형에만 반응하십시오.</p>
  `;

  const tick=()=>{
    if(focusLab?.phase!=='countdown')return;

    if(--n===0){
      runV3FocusPerformanceTest();
      return;
    }

    $('labCountdown').textContent=n;
    labLater(tick,1000);
  };

  labLater(tick,1000);
}

function labBuildSequence(s){
  const seq=[];
  const starts=[0,...s.boundaries];
  const ends=[...s.boundaries,s.total];

  for(let section=0;section<starts.length;section++){
    const len=ends[section]-starts[section];
    const target=s.targets[section];
    const pool=[];

    const targetCount=Math.max(
      1,
      Math.round(len*.25)
    );

    for(let i=0;i<targetCount;i++){
      pool.push(target);
    }

    const distract=s.shapes.filter(
      x=>x.id!==target.id
    );

    while(pool.length<len){
      pool.push(
        distract[labRandom(0,distract.length-1)]
      );
    }

    seq.push(...labShuffle(pool));
  }

  return seq;
}

function runV3FocusPerformanceTest(){
  const s=focusLab;
  if(!s)return;

  if(!s.sequence){
    s.sequence=labBuildSequence(s);
  }

  s.phase='running';

  $('focusLabBody').innerHTML='';
  $('focusLabOverlay').classList.add('lab-running');

  labUpdateHud();

  labLater(
    showNextV3PerformanceStimulus,
    labRandom(s.config.min,s.config.max)
  );
}

function labComboMultiplier(n,fail=false){
  if(fail){
    return n>=10?1.8:
           n>=7?1.6:
           n>=5?1.35:
           n>=3?1.15:1;
  }

  return n>=20?1.6:
         n>=15?1.5:
         n>=10?1.35:
         n>=5?1.2:
         n>=3?1.1:1;
}

function labUpdateHud(){
  const s=focusLab;
  if(!s)return;

  $('labTargetHud').textContent=
    s.targets[s.section].symbol;

  $('labTrialHud').textContent=
    `${Math.min(s.index+1,s.total)} / ${s.total}`;

  $('labCombo').textContent=
    `${s.successCombo} COMBO · ×${labComboMultiplier(s.successCombo).toFixed(2)}`;

  $('labFail').textContent=
    s.failCombo>=3
      ?`${s.failCombo} FAIL · ×${labComboMultiplier(s.failCombo,true).toFixed(2)}`
      :'';

  $('labExpHud').textContent=
    `COMBO +${s.comboBonus} / FAIL -${s.failPenalty}`;

  $('labProgressFill').style.width=
    `${s.index/s.total*100}%`;
}

function labFinalizeTrial(s,stimulus,target){
  const ok=s.currentTarget
    ?s.responded
    :!s.responded;

  if(ok){
    s.successCombo++;
    s.failCombo=0;

    s.maxSuccess=Math.max(
      s.maxSuccess,
      s.successCombo
    );

    if(s.successCombo>=3&&s.hits>0){
      s.comboBonus+=Math.round(
        (labComboMultiplier(s.successCombo)-1)*4
      );
    }
  }else{
    s.failCombo++;
    s.successCombo=0;

    s.maxFail=Math.max(
      s.maxFail,
      s.failCombo
    );

    s.failPenalty+=Math.round(
      3*labComboMultiplier(s.failCombo,true)
    );
  }

  s.trials.push({
    index:s.index,
    section:s.section,
    stimulus:stimulus.id,
    target:target.id,
    is_target:s.currentTarget,
   
    responded:s.responded,
    reaction_ms:s.currentRt??null,
    display_ms:s.currentDisplayMs,
    correct:ok,

        early_inputs:s.currentEarly||0,
    extra_inputs:s.currentExtra||0
  });

  // 기존 서버 제출 기록과 별도로 위치 분석 기록 수집
  labZoneTrials.push({
    zone:labCurrentZone,
    isTarget:s.currentTarget,
    responded:s.responded,
    correct:ok,
    reactionMs:s.currentRt??null
  });

  s.index++;
  labUpdateHud();
}

/* =========================================
   FOCUS LAB · RANDOM STIMULUS POSITION
========================================= */

/* =========================================
   FOCUS LAB · 9-ZONE ATTENTION SYSTEM
========================================= */

let labPositionQueue = [];

// 현재 검사에서 사용할 위치별 측정 기록
let labZoneTrials = [];
let labCurrentZone = null;

function labSetRandomStimulusPosition() {

  const el = $("focusLabStimulus");
  if (!el) return;

  // 9개 구역을 모두 사용하면 새 순서 생성
  if (labPositionQueue.length === 0) {

    labPositionQueue = [
      0, 1, 2,
      3, 4, 5,
      6, 7, 8
    ];

    // Fisher-Yates Shuffle
    for (
      let i = labPositionQueue.length - 1;
      i > 0;
      i--
    ) {

      const j = Math.floor(
        Math.random() * (i + 1)
      );

      [
        labPositionQueue[i],
        labPositionQueue[j]
      ] = [
        labPositionQueue[j],
        labPositionQueue[i]
      ];
    }
  }

 // 이번 시행에서 사용할 구역
const zone = labPositionQueue.pop();

// 0~8을 기록하고 화면에는 1~9로 표시
labCurrentZone = zone;

const col = zone % 3;
const row = Math.floor(zone / 3);
  const width = window.innerWidth;
  const height = window.innerHeight;

  // 자극 크기를 고려하여 화면 밖으로 나가지 않도록 제한
  const rect = el.getBoundingClientRect();

  const halfW = rect.width / 2;
  const halfH = rect.height / 2;

  const left = halfW + 12;
  const right = Math.max(
    left,
    width - halfW - 12
  );

  // 상단 HUD와 하단 여백 확보
  const top = Math.min(
    height - halfH,
    Math.max(halfH + 12, 180)
  );

  const bottom = Math.max(
    top,
    height - halfH - 35
  );

  const cellW = (right - left) / 3;
  const cellH = (bottom - top) / 3;

  // 선택된 구역 안에서도 위치를 무작위로 결정
  const x = left + cellW * (
    col + 0.2 + Math.random() * 0.6
  );

  const y = top + cellH * (
    row + 0.2 + Math.random() * 0.6
  );

  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}
  
function showNextV3PerformanceStimulus(){
  const s=focusLab;

  if(!s||s.phase!=='running')return;

  if(s.index>=s.total){
    finishV3FocusPerformanceTest();
    return;
  }

  if(s.boundaries.includes(s.index)){
    s.section++;
    showFocusLabTarget();
    return;
  }

  const stimulus=s.sequence[s.index];
  const target=s.targets[s.section];

  s.currentTarget=stimulus.id===target.id;
  s.responded=false;
  s.windowOpen=true;
  s.currentRt=null;

  s.currentEarly=0;
  s.currentExtra=0;
  s.currentDisplayMs=s.exposureSequence[s.index];
  s.startedAt=performance.now();


  labUpdateHud();

// 매 시행마다 자극 위치를 새로 결정
labSetRandomStimulusPosition();

$('focusLabStimulus').textContent =
  stimulus.symbol;

  labLater(()=>{
    if(focusLab===s&&s.phase==='running'){
      $('focusLabStimulus').textContent='';
    }
  },s.currentDisplayMs);


  labLater(()=>{
    if(focusLab!==s||s.phase!=='running')return;

    s.windowOpen=false;

    if(s.currentTarget&&!s.responded){
      s.misses++;
    }

    if(s.section>0&&s.currentTarget){
      s.switchTargets++;

      if(s.responded){
        s.switchHits++;
      }
    }

    labFinalizeTrial(s,stimulus,target);

    labLater(
      showNextV3PerformanceStimulus,
      labRandom(s.config.min,s.config.max)
    );
  },s.config.response);
}

function recordV3PerformanceResponse(){
  const s=focusLab;

  if(!s||s.phase!=='running')return;

  if(!s.windowOpen){
    s.earlyInputs++;
    return;
  }

  if(s.responded){
    s.extraInputs++;
    s.currentExtra++;
    return;
  }

  s.responded=true;

  const rt=Math.round(
    performance.now()-s.startedAt
  );

  s.currentRt=rt;

  if(s.currentTarget){
    s.hits++;
    s.reactionTimes.push(rt);

    (
      s.index<s.total/2
        ?s.early
        :s.late
    ).push(rt);
  }else{
    s.falseAlarms++;
  }
}

function abortFocusLab(message){
  labClearTimers();

  if(!focusLab)return;

  focusLab.phase='aborted';

  $('focusLabOverlay').classList.remove('lab-running');
  $('focusLabStimulus').textContent='';

  $('focusLabBody').innerHTML=`
    <h2>측정 중단</h2>
    <p>${labEscape(message)}</p>

    <p class="lab-muted">
      미완료 검사는 EXP에 반영되지 않습니다.
    </p>

    <button id="labRetry" type="button">
      다시 시작
    </button>
  `;

  $('labRetry').onclick=openFocusLab;
}

function closeFocusLab(){
  if(focusLabSaving)return;

  labClearTimers();
  focusLab=null;

  if($('focusLabOverlay')){
    $('focusLabOverlay').hidden=true;
    $('focusLabOverlay').classList.remove('lab-running');
  }
}

/* =========================================
   FOCUS LAB · ATTENTION MAP
========================================= */

function labRenderAttentionMap() {

  const zones = Array.from(
    {length:9},
    (_,index)=>({
      zone:index,
      attempts:0,
      correct:0,
      hits:0,
      misses:0,
      falseAlarms:0,
      reactionTimes:[]
    })
  );

  // 구역별 기록 집계
  for(const trial of labZoneTrials){

    const z=zones[trial.zone];

    if(!z)continue;

    z.attempts++;

    if(trial.correct)z.correct++;

    if(trial.isTarget){

      if(trial.responded){
        z.hits++;

        if(Number.isFinite(trial.reactionMs)){
          z.reactionTimes.push(trial.reactionMs);
        }

      }else{
        z.misses++;
      }

    }else if(trial.responded){
      z.falseAlarms++;
    }
  }

  const cards=zones.map(z=>{

    const accuracy=z.attempts
      ?Math.round(z.correct/z.attempts*100)
      :null;

    const average=z.reactionTimes.length
      ?Math.round(
        z.reactionTimes.reduce(
          (sum,value)=>sum+value,0
        )/z.reactionTimes.length
      )
      :null;

    // 정반응 표본 3개 미만은 속도 비교 보류
    const sufficient=z.reactionTimes.length>=3;

    return `
      <div style="
        background:#16283e;
        border:1px solid #405a77;
        border-radius:10px;
        padding:12px 5px;
        text-align:center;
        min-width:0;
      ">

        <div style="
          font-size:11px;
          color:#9fb7d2;
        ">
          ZONE ${z.zone+1}
        </div>

        <div style="
          font-size:21px;
          font-weight:800;
          margin:7px 0;
          color:#fff;
        ">
          ${average===null?'-':average+'ms'}
        </div>

        <div style="font-size:12px;color:#b7c9dc;">
          정확도 ${accuracy===null?'-':accuracy+'%'}
        </div>

        <div style="font-size:11px;color:#91a7bd;">
          정반응 ${z.hits} · 놓침 ${z.misses}
        </div>

        <div style="font-size:11px;color:#91a7bd;">
          오반응 ${z.falseAlarms}
        </div>

        <div style="
          font-size:10px;
          margin-top:7px;
          color:${sufficient?'#9ee3c1':'#e5c38b'};
        ">
          ${sufficient?'속도 표본 확보':'속도 표본 부족'}
        </div>

      </div>
    `;
  }).join('');

  return `
    <section style="
      width:min(550px,100%);
      margin:22px 0;
      box-sizing:border-box;
    ">

      <h2>ATTENTION MAP</h2>

      <p class="lab-muted">
        화면 위치별 수행 분석 · 총 ${labZoneTrials.length}회
      </p>

      <div style="
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:8px;
        margin-top:15px;
      ">
        ${cards}
      </div>

      <p class="lab-muted" style="margin-top:15px;">
        평균 반응시간은 목표 도형에 올바르게 반응한
        시행만 계산합니다.
        정확도에는 방해 도형을 무시한 정반응도 포함됩니다.
        정반응 3회 미만인 구역은 속도 비교를 보류합니다.
      </p>

    </section>
  `;
}
  
async function finishV3FocusPerformanceTest(){
  const s=focusLab;

  if(!s||s.phase!=='running')return;

  labClearTimers();
  s.phase='result';

  $('focusLabOverlay').classList.remove('lab-running');
  $('focusLabStimulus').textContent='';
  $('focusLabProgress').textContent='측정 완료';

  const targets=s.trials.filter(
    t=>t.is_target
  ).length;

  const nonTargets=s.total-targets;

  const hitRate=targets
    ?s.hits/targets
    :0;

  const falseRate=nonTargets
    ?s.falseAlarms/nonTargets
    :0;

  const mean=labAvg(s.reactionTimes);
  const early=labAvg(s.early);
  const late=labAvg(s.late);

  const rtScore=mean===null
    ?0
    :Math.max(
      0,
      Math.min(1,1-(mean-250)/750)
    );

  const raw=s.config.switches
    ?hitRate*45+
      (1-falseRate)*25+
      rtScore*15+
      (s.switchTargets?s.switchHits/s.switchTargets:0)*15
    :hitRate*60+
      (1-falseRate)*25+
      rtScore*15;

  const score=Math.max(
    0,
    Math.min(100,Math.round(raw))
  );

  const achievement=Math.round(
    score*s.config.weight
  );

  const resultData={
    test_type:'FOCUS LAB 집중력 검증',
   
    test_version:'FOCUS-LAB-3.6',
    exposure_policy:'balanced-variable-v1',

    mode:s.modeKey,
    mode_name:s.config.name,
    total_trials:s.total,
    target_trials:targets,
    non_target_trials:nonTargets,
    target_switches:s.config.switches,
    shape_pool:s.shapes.map(x=>x.id),
    target_sequence:s.targets.map(x=>x.id),
    hits:s.hits,
    misses:s.misses,
    false_alarms:s.falseAlarms,
    hit_rate:Math.round(hitRate*10000)/100,
    false_alarm_rate:Math.round(falseRate*10000)/100,
    average_reaction_ms:mean,
    early_average_reaction_ms:early,
    late_average_reaction_ms:late,
    switch_hits:s.switchHits,
    switch_target_count:s.switchTargets,
    internal_score:score,
    achievement_score:achievement,
    max_success_combo:s.maxSuccess,
    max_fail_combo:s.maxFail,
    combo_bonus:s.comboBonus,
    fail_penalty:s.failPenalty,
    early_inputs:s.earlyInputs,
    extra_inputs:s.extraInputs,
    trials:s.trials,
    completed_at:new Date().toISOString()
  };

   $('focusLabBody').innerHTML=`
    <h1>집중력 측정 결과</h1>
    <h3>${s.config.name} · ${s.total}회</h3>

    ${labRenderAttentionMap()}

    <div class="lab-result">
    <div class="lab-result">
      순수 수행점수
      <strong>${score}/100</strong>

      <br>

      도전 성취점수
      <strong>${achievement}</strong>

      <br>

      목표 적중
      <strong>${s.hits}/${targets}</strong>
      · 놓침 <strong>${s.misses}</strong>

      <br>

      오반응
      <strong>${s.falseAlarms}/${nonTargets}</strong>

      <br>

      평균 반응
      <strong>${mean??'-'}ms</strong>
      · 전/후반
      <strong>${early??'-'}/${late??'-'}ms</strong>

      <br>

      최대 성공 콤보
      <strong>${s.maxSuccess}</strong>
      · 최대 실패 콤보
      <strong>${s.maxFail}</strong>

      <br>

      콤보 잠정치
      +${s.comboBonus} / -${s.failPenalty}
    </div>

    <p class="lab-muted">
      실제 성장 EXP는 서버가 전체 기록을 검증하여 확정합니다.
      수행점수와 게임 EXP는 별개입니다.
    </p>     

    <p id="focusLabSaveStatus">
      서버에서 검증 및 정산 중...
    </p>

    <button
      id="focusLabReturn"
      type="button"
      disabled
    >
      결과 확인 후 돌아가기
    </button>
  `;

 
   // 결과 화면을 항상 맨 위부터 표시
  $('focusLabBody').scrollTop=0;

  focusLabSaving=true;

  let error=null;
  let data=null;

  try{

    const r=await client.rpc(
      s.modeKey==='master'
        ?'submit_focus_lab_master'
        :'submit_focus_lab_v3',

      s.modeKey==='master'
        ?{
            p_trials:resultData.trials,
            p_target_sequence:resultData.target_sequence,
            p_shape_pool:resultData.shape_pool
          }
        :{
            p_mode:s.modeKey,
            p_trials:resultData.trials,
            p_target_sequence:resultData.target_sequence,
            p_shape_pool:resultData.shape_pool,
            p_total:s.total
          }
    );

    error=r.error;
    data=r.data;

  }catch(e){

    error=e;

  }

  focusLabSaving=false;


  if(error){
    $('focusLabSaveStatus').textContent=
      '서버 저장 실패: '+
      (error.message||error)+
      ' · EXP 변경 없음';
  }else{
    const r=Array.isArray(data)
      ?data[0]
      :data;

   
    const masterResult=s.modeKey==='master'
      ?`
        <div style="
          margin-top:15px;
          padding:16px;
          background:#142b45;
          border:1px solid #547aa4;
          border-radius:12px;
        ">
          <strong style="
            font-size:20px;
            color:${r?.master_qualified?'#9ce7bd':'#ffd39a'};
          ">
            ${
              r?.master_awarded
                ?'✦ FOCUS MASTER 획득'
                :r?.master_qualified
                  ?'MASTER CHALLENGE · PASS'
                  :'MASTER CHALLENGE · NOT PASSED'
            }
          </strong>

          <p>
            누적 합격
            <strong>${Number(r?.master_passes)||0}/3회</strong>
          </p>

          <p class="lab-muted">
            최종 MASTER 자격은
            3회 합격과 FOCUS LV.100 달성이
            모두 충족되어야 부여됩니다.
          </p>
        </div>
      `
      :'';

    $('focusLabSaveStatus').innerHTML=`
      서버 확정:
      <strong>
        ${r?.score??score}/100점 ·
        EXP ${Number(r?.exp_delta)>=0?'+':''}${r?.exp_delta??0}
      </strong>

      <br>

      FOCUS LV.${r?.old_level??'?'}
      →
      LV.${r?.new_level??'?'}
      · EXP ${r?.new_exp??'?'}

      <br>

      ${
        r?.message
          ?labEscape(r.message)
          :'검사 결과 저장 완료'
      }

      ${masterResult}
    `;


    try{
      await labLoadProfile();
    }catch(e){
      console.error(e);
    }
  }

 
$('focusLabReturn').disabled=false;

$('focusLabReturn').onclick=()=>{
  closeFocusLab();
  renderV3Evaluation();
  labOpenHub();
};

}



  function v3MeasuredText(value) {
  if (value === null || value === undefined) {
    return "미측정";
  }

  if (typeof value === "number") {
    return `${Math.round(value)}점`;
  }

  return String(value);
}

function formatV3Date(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "알 수 없음";
  }

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}
 
  /* =========================
     SPIRIT CORE 1.0
     기존 훈련 기록 기반 읽기 전용 분석
  ========================= */

  const CORE_CODES = Object.keys(V3_TRAINING_MAP);
  const CORE_DAY = 86400000;
  let coreBusy = false;

  function coreDate(log) {
    const value = log?.completed_at || log?.created_at;
    const time = value ? new Date(value).getTime() : NaN;

    return Number.isFinite(time) ? time : null;
  }

  function coreCount(logs, days, now) {
    return logs.filter(log => {
      const time = coreDate(log);

      return (
        time !== null &&
        time <= now &&
        time >= now - days * CORE_DAY
      );
    }).length;
  }

  function coreInstall() {
    if (!$("gamePanel") || $("spiritCoreEntry")) return;

    const entry = document.createElement("section");
    entry.id = "spiritCoreEntry";
    entry.className = "panel";

    entry.innerHTML = `
      <h2>SPIRIT CORE</h2>
      <p class="muted">
        훈련 기록 · 최근 7일/30일 · 다음 훈련 제안
      </p>
      <button type="button" id="spiritCoreOpen">
        개인 훈련 분석 보기 →
      </button>
    `;

    $("gamePanel").appendChild(entry);

    const room = document.createElement("section");
    room.id = "spiritCoreRoom";
    room.className = "hidden";

    room.innerHTML = `
      <div class="spirit-core-inner">
        <div class="spirit-core-head">
          <h2>SPIRIT CORE 1.0</h2>
          <button
            type="button"
            class="secondary"
            id="spiritCoreClose"
          >
            게임으로 돌아가기
          </button>
        </div>

        <div id="spiritCoreContent" role="status">
          기록을 불러올 준비가 되었습니다.
        </div>

        <button
          type="button"
          class="secondary"
          id="spiritCoreRefresh"
        >
          기록 새로고침
        </button>
      </div>
    `;

    document.body.appendChild(room);

    const style = document.createElement("style");

    style.textContent = `
      #spiritCoreRoom:not(.hidden) {
        position: fixed;
        inset: 0;
        z-index: 12000;
        overflow-y: auto;
        background: #0b1119;
        padding: 26px 16px 65px;
        box-sizing: border-box;
      }

      #spiritCoreRoom.hidden {
        display: none !important;
      }

      .spirit-core-inner {
        max-width: 860px;
        margin: auto;
      }

      .spirit-core-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 22px;
      }

      .spirit-core-grid {
        display: grid;
        grid-template-columns:
          repeat(auto-fit, minmax(170px, 1fr));
        gap: 12px;
        margin: 18px 0;
      }

      .spirit-core-card {
        border: 1px solid #657387;
        border-radius: 12px;
        padding: 16px;
      }

      .spirit-core-card strong {
        display: block;
        font-size: 24px;
        margin-top: 8px;
      }

      .spirit-core-note {
        opacity: .75;
        font-size: 13px;
        line-height: 1.6;
      }

      #spiritCoreEntry {
        border: 1px solid #8b9bba;
        border-radius: 16px;
        margin: 22px 0;
        padding: 22px;
      }

      #spiritCoreOpen {
        width: 100%;
        margin-top: 12px;
      }
    `;

    document.head.appendChild(style);

    $("spiritCoreOpen").addEventListener("click", () => {
      show("spiritCoreRoom", true);
      coreRender();
    });

    $("spiritCoreClose").addEventListener(
      "click",
      () => show("spiritCoreRoom", false)
    );

    $("spiritCoreRefresh").addEventListener(
      "click",
      coreRender
    );
  }

  async function coreRender() {
    if (coreBusy || !state.user?.id) return;

    const userId = state.user.id;
    const output = $("spiritCoreContent");

    if (!output) return;

    coreBusy = true;

    output.textContent =
      "기존 훈련 기록을 분석하고 있습니다...";

    try {
      const logs = [];
      let complete = true;

      for (let start = 0; start < 10000; start += 1000) {
        const { data, error } = await client
          .from("quest_logs")
          .select("*")
          .eq("user_id", userId)
          .order("completed_at", { ascending: false })
          .range(start, start + 999);

        if (error) throw error;

        logs.push(...(data || []));

        if (!data || data.length < 1000) break;

        if (start === 9000) complete = false;
      }

      if (state.user?.id !== userId) return;

      const relevant = logs.filter(
        x => CORE_CODES.includes(x.quest_code)
      );

      const now = Date.now();

      const seven = coreCount(relevant, 7, now);
      const thirty = coreCount(relevant, 30, now);

      const priorSeven = relevant.filter(x => {
        const t = coreDate(x);

        return (
          t !== null &&
          t < now - 7 * CORE_DAY &&
          t >= now - 14 * CORE_DAY
        );
      }).length;

      const abilities = ABILITY_KEYS.map(key => {
        const matching = relevant.filter(
          x => V3_TRAINING_MAP[x.quest_code]?.includes(key)
        );

        return {
          key,
          label: ABILITY_LABELS[key],
          count: matching.length,
          recent: coreCount(matching, 30, now)
        };
      });

      const sorted = [...abilities].sort(
        (a, b) =>
          a.recent - b.recent ||
          a.count - b.count
      );

      const next = sorted[0];

      const recommendation = !relevant.length
        ? "첫 훈련을 완료하면 실제 기록에 기반한 제안을 시작합니다."
        : `${next.label} 관련 훈련의 최근 기록이 상대적으로 적습니다. 해당 영역의 훈련을 다음 목표로 고려하세요.`;

      const card = (name, value, detail) => `
        <div class="spirit-core-card">
          <span>${name}</span>
          <strong>${value}</strong>
          <span class="spirit-core-note">${detail}</span>
        </div>
      `;

      output.innerHTML = `
        <p class="spirit-core-note">
          기존 quest_logs를 읽기만 합니다.
          이 수치는 훈련 참여 기록이며
          초감각 능력의 검증 점수가 아닙니다.
        </p>

        <div class="spirit-core-grid">
          ${card(
            "분석 대상 훈련",
            relevant.length + "회",
            "알려진 훈련 코드 기준"
          )}

          ${card(
            "최근 7일",
            seven + "회",
            "직전 7일 " + priorSeven + "회"
          )}

          ${card(
            "최근 30일",
            thirty + "회",
            "완료 시각 기준"
          )}

          ${card(
            "기록 상태",
            relevant.length >= 10
              ? "패턴 관찰 가능"
              : "자료 축적 중",
            "10회는 표시 기준이며 능력 판정 기준이 아닙니다."
          )}
        </div>

        <h3>영역별 훈련 참여</h3>

        <div class="spirit-core-grid">
          ${abilities.map(a =>
            card(
              a.label,
              a.count + "회",
              "최근 30일 " + a.recent + "회"
            )
          ).join("")}
        </div>

        <div class="spirit-core-card">
          <h3>다음 훈련 제안</h3>
          <p id="spiritCoreAdvice"></p>
        </div>

        <p class="spirit-core-note">
          ${
            complete
              ? "조회 범위: 저장된 훈련 기록"
              : "기록이 10,000건 이상입니다. 최신 10,000건만 집계했습니다."
          }

          · 훈련 유형 하나가 여러 영역에 연결되므로
          영역별 합계는 총 기록과 다를 수 있습니다.

          정확도·일관성·독립 검증은 아직 미측정입니다.
        </p>
      `;

      $("spiritCoreAdvice").textContent = recommendation;

    } catch (error) {
      console.error(
        "[SPIRIT CORE] analysis failed:",
        error
      );

      output.textContent =
        "분석 기록 조회 실패: " +
        (error?.message || "알 수 없는 오류");

    } finally {
      coreBusy = false;
    }
  }


/* =========================================
   SPIRIT CORE 1.1
   FOCUS PERFORMANCE ANALYSIS
========================================= */

async function coreRenderFocusPerformance() {
  const output = $("coreFocusPerformance");

  if (!output || !state.user?.id) return;

  const userId = state.user.id;

  output.textContent = "집중력 수행 기록 분석 중...";

  const { data, error } = await client
    .from("focus_lab_results")
    .select(
      "id,mode,total_trials,score,completed_at"
    )
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(1000);

  if (state.user?.id !== userId) return;

  if (error) {
    output.textContent =
      "집중력 기록 조회 실패: " + error.message;
    return;
  }

  const groups = new Map();

  for (const row of data || []) {
    if (row.score == null) continue;

    const score = Number(row.score);

    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100
    ) continue;

    const key =
      String(row.mode) + "|" +
      String(row.total_trials);

    if (!groups.has(key)) groups.set(key, []);

    groups.get(key).push({
      ...row,
      score
    });
  }

  if (!groups.size) {
    output.textContent =
      "아직 유효한 집중력 수행 기록이 없습니다.";
    return;
  }

  const average = values =>
    values.reduce((a, b) => a + b, 0) /
    values.length;

  const escapeHtml = value =>
    String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const sections = [];

  for (const [key, rows] of groups) {
    const [mode, trials] = key.split("|");

    const recent = rows
      .slice(0, 5)
      .map(row => row.score);

    const previous = rows
      .slice(5, 10)
      .map(row => row.score);

    const enough = recent.length >= 5;

    const recentAvg = enough
      ? average(recent)
      : null;

    const previousAvg = previous.length === 5
      ? average(previous)
      : null;

    let trend = "비교 자료 부족";

    if (recentAvg !== null && previousAvg !== null) {
      const difference = recentAvg - previousAvg;

      trend =
        difference > 2 ? "상승" :
        difference < -2 ? "하락" :
        "유지";

      trend +=
        " (" +
        (difference >= 0 ? "+" : "") +
        difference.toFixed(1) +
        "점)";
    }

    let stability = "DATA REQUIRED";

    if (enough) {
      const variance = average(
        recent.map(score =>
          Math.pow(score - recentAvg, 2)
        )
      );

      stability =
        "표준편차 " +
        Math.sqrt(variance).toFixed(1) +
        "점";
    }

    sections.push(`
      <div class="spirit-core-card">
        <h3>
          ${escapeHtml(mode)} · ${escapeHtml(trials)}문항
        </h3>

        <p>유효 기록: ${rows.length}회</p>

        <p>
          최근 수행 평균:
          <strong>
            ${enough
              ? recentAvg.toFixed(1) + "점"
              : "DATA REQUIRED"}
          </strong>
        </p>

        <p>성장 추세: ${trend}</p>
        <p>점수 안정성: ${stability}</p>

        <p class="spirit-core-note">
          최근 5회 기준.
          성장 비교에는 총 10회 이상의
          동일 조건 기록이 필요합니다.
        </p>
      </div>
    `);
  }

  output.innerHTML = sections.join("");
}

  
  /* =========================
     MAIN RENDER
  ========================= */
  
  function render() {
    const p = state.profile;
    if (!p) return;

    if ($("rankValue")) {
      $("rankValue").textContent =
        `${p.rank || "D"}-RANK`;
    }

    if ($("levelValue")) {
      $("levelValue").textContent =
        `LV.${p.level}`;
    }

    if ($("statusValue")) {
      $("statusValue").textContent =
        p.status || "";
    }

    const need =
      xpNeeded(Number(p.level));

    const pct =
      Math.min(
        100,
        ((Number(p.exp) || 0) / need) *
          100
      );

    if ($("xpFill")) {
      $("xpFill").style.width =
        `${pct}%`;
    }

    if ($("xpText")) {
      $("xpText").textContent =
        `EXP ${p.exp || 0} / ${need}`;

      if (p.level_test_available) {
        $("xpText").textContent =
          `EXP ${need} / ${need} · LEVEL TEST AVAILABLE`;
      }
    }

    const stats = [
      ["감지력", p.perception],
      ["직관력", p.intuition],
      ["집중력", p.focus],
      ["해석력", p.interpretation],
      ["통제력", p.control]
    ];

    if ($("stats")) {
      $("stats").innerHTML =
        stats
          .map(
            x => `
              <div class="stat">
                <span class="label">${x[0]}</span>
                <b>${x[1]}</b>
              </div>
            `
          )
          .join("");
    }

    if ($("record")) {
      $("record").innerHTML = [
        [
          "최고 레벨",
          `LV.${p.highest_level}`
        ],
        [
          "연속 훈련",
          `${p.streak_days}일`
        ],
        [
          "상태",
          p.status
        ],
        [
          "생성일",
          p.created_at
            ? new Date(
                p.created_at
              ).toLocaleDateString(
                "ko-KR"
              )
            : ""
        ]
      ]
        .map(
          x =>
            `<div class="record-item"><span>${x[0]}</span><b>${x[1]}</b></div>`
        )
        .join("");
    }

   loadQuests();
renderNextUnlock();
renderAwakeningSystem();
renderRankPromotion();

renderV3Evaluation();


    // 메인 기능 및 독립 훈련실 설치
    installAbilityAnalysisRoom();
    installDailyQuestRoom();
    installAwakeningAnalysisRoom();
    installPlayerRecordRoom();

    // 개인 성장 분석
    coreInstall();

    // 메인 화면의 마지막 요소
    installMainLogoutButton();

}
  
  /* =========================
     5 MIN FOCUS TRAINING
  ========================= */

  let focusTimerInterval = null;
  let focusSeconds = 300;
  let selectedFocusExp = 10;
  let selectedFocusDuration = 300;

function startFocusTraining() {
  const target =
    $("focusTarget")?.value;

  if (!target) {
    alert("집중 대상을 선택하세요.");
    return;
  }

  // 감각관찰이 실행 중이면 시작하지 않음
  if (senseTimerInterval) {
    alert("현재 감각관찰 훈련이 진행 중입니다.");
    return;
  }

  if (focusTimerInterval) {
    return;
  }

  // 집중훈련은 항상 5분
  focusSeconds = 300;
  selectedFocusDuration = 300;
  selectedFocusExp = 10;

  if ($("selectedFocusTarget")) {
    $("selectedFocusTarget").textContent =
      target;
  }

  show("focusSetup", false);
  show("focusRunning", true);
  show("focusResult", false);

  updateFocusTimer();

  focusTimerInterval =
    setInterval(() => {
      focusSeconds--;

      updateFocusTimer();

      if (focusSeconds <= 0) {
        clearInterval(
          focusTimerInterval
        );

        focusTimerInterval = null;

        finishFocusTraining();
      }
    }, 1000);
}

  function updateFocusTimer() {
    const minutes =
      Math.floor(
        focusSeconds / 60
      );

    const seconds =
      focusSeconds % 60;

    if ($("focusTimer")) {
      $("focusTimer").textContent =
        String(minutes).padStart(
          2,
          "0"
        ) +
        ":" +
        String(seconds).padStart(
          2,
          "0"
        );
    }
  }

  function playFocusEndSound(type) {
    if (!type || type === "silent") {
      return;
    }

    try {
      const AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContext) {
        return;
      }

      const audioContext =
        new AudioContext();

      const now =
        audioContext.currentTime;

      const master =
        audioContext.createGain();

      master.gain.setValueAtTime(
        0.0001,
        now
      );

      master.gain.exponentialRampToValueAtTime(
        0.12,
        now + 0.02
      );

      master.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 1.4
      );

      master.connect(
        audioContext.destination
      );

      const tones =
        type === "beep"
          ? [
              {
                frequency: 880,
                start: 0,
                duration: 0.22,
                volume: 0.65
              }
            ]
          : type === "lowbell"
            ? [
                {
                  frequency: 330,
                  start: 0,
                  duration: 0.9,
                  volume: 0.7
                },
                {
                  frequency: 495,
                  start: 0,
                  duration: 0.65,
                  volume: 0.22
                }
              ]
            : [
                {
                  frequency: 660,
                  start: 0,
                  duration: 0.8,
                  volume: 0.5
                },
                {
                  frequency: 990,
                  start: 0.04,
                  duration: 0.75,
                  volume: 0.28
                },
                {
                  frequency: 1320,
                  start: 0.08,
                  duration: 0.55,
                  volume: 0.12
                }
              ];

      tones.forEach((tone) => {
        const oscillator =
          audioContext.createOscillator();

        const gain =
          audioContext.createGain();

        const start =
          now + tone.start;

        const end =
          start + tone.duration;

        oscillator.type =
          type === "beep"
            ? "sine"
            : "triangle";

        oscillator.frequency.setValueAtTime(
          tone.frequency,
          start
        );

        gain.gain.setValueAtTime(
          0.0001,
          start
        );

        gain.gain.exponentialRampToValueAtTime(
          tone.volume,
          start + 0.015
        );

        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          end
        );

        oscillator.connect(gain);
        gain.connect(master);

        oscillator.start(start);
        oscillator.stop(end + 0.03);
      });

      setTimeout(() => {
        audioContext.close();
      }, 1700);

    } catch (error) {
      console.log(
        "알림음 재생 실패",
        error
      );
    }
  }

  function finishFocusTraining() {
    show("focusRunning", false);
    show("focusResult", true);

    const endSound =
      $("focusEndSound")?.value ||
      "bell";

    playFocusEndSound(endSound);

    const minutes =
      Math.round(
        selectedFocusDuration / 60
      );

    alert(
      `${minutes}분 집중 훈련이 종료되었습니다.`
    );
  }
  

  async function completeFocusTraining() {
    const quality =
      $("focusQuality")?.value;

    const obstacle =
      $("focusObstacle")?.value;

    const experience =
      $("focusExperience")?.value;

    const memo =
      $("focusMemo")?.value;

    const target =
      $("focusTarget")?.value;

        const duration =
      Number(
        $("focusDuration")?.value
      );

    const exp =
      selectedFocusExp || 10;

    const minutes =
      Math.round(
        duration / 60
      );

    if (
      !quality ||
      !obstacle ||
      !experience
    ) {
      if ($("focusMessage")) {
        $("focusMessage").textContent =
          "집중 상태, 방해 요소, 특별한 경험을 모두 선택하세요.";
      }
      return;
    }

    if ($("focusMessage")) {
      $("focusMessage").textContent =
        "훈련 기록을 저장하고 있습니다...";
    }

        const resultData = {
      training_type:
        `${minutes}분 집중 훈련`,
      duration_seconds:
        duration,
      exp,
      target,
      focus_quality: quality,
      obstacle,
      experience,
      memo,
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
      if ($("focusMessage")) {
        $("focusMessage").textContent =
          "저장 실패: " +
          error.message;
      }
      return;
    }

    state.profile = data;

    if ($("focusMessage")) {
      $("focusMessage").textContent =
        `훈련 기록이 저장되었습니다. EXP +${exp}`;
    }

    setTimeout(() => {
      show("focusTrainingPanel", false);
show("gamePanel", true);
show("dailyQuestRoom", true);

      if ($("focusQuality")) {
        $("focusQuality").value = "";
      }

      if ($("focusObstacle")) {
        $("focusObstacle").value = "";
      }

      if ($("focusExperience")) {
        $("focusExperience").value = "";
      }

      if ($("focusMemo")) {
        $("focusMemo").value = "";
      }

      render();
    }, 1000);
  }


function openFocusTraining() {

  // 다른 탭에서 돌아왔을 때 기존 집중 타이머 강제 종료
  if (focusTimerInterval) {
    clearInterval(focusTimerInterval);
    focusTimerInterval = null;
  }

  show("dailyQuestRoom", false);
show("gamePanel", true);

show(
  "focusTrainingPanel",
  true
);

  // 항상 처음의 수행 화면으로
  show("focusSetup", true);
  show("focusRunning", false);
  show("focusResult", false);

  // 타이머 초기화
  focusSeconds = 300;
  selectedFocusDuration = 300;
  selectedFocusExp = 10;

  if ($("focusTimer")) {
    $("focusTimer").textContent =
      "05:00";
  }

  if ($("focusMessage")) {
    $("focusMessage").textContent =
      "";
  }
}

  
  /* =========================
     SENSE OBSERVATION
  ========================= */

  let senseTimerInterval = null;
  let senseSeconds = 300;
  let selectedSenseExp = 10;

// 브라우저 탭을 벗어나면 진행 중인 훈련을 즉시 중지
document.addEventListener("visibilitychange", () => {

  if (document.visibilityState === "hidden") {

    // 집중훈련 타이머 중지
    if (focusTimerInterval) {
      clearInterval(focusTimerInterval);
      focusTimerInterval = null;
    }

    // 감각관찰 타이머 중지
    if (senseTimerInterval) {
      clearInterval(senseTimerInterval);
      senseTimerInterval = null;
    }

    // 집중훈련 화면 초기화
    show("focusSetup", true);
    show("focusRunning", false);
    show("focusResult", false);

    // 감각관찰 화면 초기화
    show("senseSetup", true);
    show("senseRunning", false);
    show("senseResult", false);

    // 타이머 표시도 초기화
    focusSeconds = 300;
    senseSeconds = 300;

    if ($("focusTimer")) {
      $("focusTimer").textContent = "05:00";
    }

    if ($("senseTimer")) {
      $("senseTimer").textContent = "05:00";
    }
  }
});

  
  function openSenseTraining() {
    if (senseTimerInterval) {
      clearInterval(
        senseTimerInterval
      );
      senseTimerInterval = null;
    }

   show("dailyQuestRoom", false);
show("gamePanel", true);

show(
  "senseTrainingPanel",
  true
);
    show("senseSetup", true);
    show("senseRunning", false);
    show("senseResult", false);

    if ($("senseMessage")) {
      $("senseMessage").textContent =
        "";
    }

    if ($("senseTimer")) {
      $("senseTimer").textContent =
        "05:00";
    }
  }

 function startSenseTraining() {
  const target =
    $("senseTarget")?.value;

  const duration =
    Number(
      $("senseDuration")?.value
    );

  if (!target) {
    alert("관찰 대상을 선택하세요.");
    return;
  }

  if (!duration) {
    alert("훈련 시간을 선택하세요.");
    return;
  }

  // 집중훈련이 실행 중이면 시작하지 않음
  if (focusTimerInterval) {
    alert("현재 집중훈련이 진행 중입니다.");
    return;
  }

  if (senseTimerInterval) {
    return;
  }

  senseSeconds = duration;

  if (duration === 180) {
    selectedSenseExp = 5;
  } else if (duration === 300) {
    selectedSenseExp = 10;
  } else if (duration === 600) {
    selectedSenseExp = 20;
  }

  if ($("selectedSenseTarget")) {
    $("selectedSenseTarget").textContent =
      target;
  }

  show("senseSetup", false);
  show("senseRunning", true);
  show("senseResult", false);

  updateSenseTimer();

  senseTimerInterval =
    setInterval(() => {
      senseSeconds--;

      updateSenseTimer();

      if (senseSeconds <= 0) {
        clearInterval(
          senseTimerInterval
        );

        senseTimerInterval = null;

        finishSenseTraining();
      }
    }, 1000);
}

  function updateSenseTimer() {
    const minutes =
      Math.floor(
        senseSeconds / 60
      );

    const seconds =
      senseSeconds % 60;

    if ($("senseTimer")) {
      $("senseTimer").textContent =
        String(minutes).padStart(
          2,
          "0"
        ) +
        ":" +
        String(seconds).padStart(
          2,
          "0"
        );
    }
  }

  function finishSenseTraining() {
    show("senseRunning", false);
    show("senseResult", true);

    playSelectedSenseSound();
  }

  function playSelectedSenseSound() {
    const sound =
      $("senseSound")?.value;

    if (!sound || sound === "silent") {
      return;
    }

    try {
      const AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContext) return;

      const audioContext =
        new AudioContext();

      const gain =
        audioContext.createGain();

      gain.connect(
        audioContext.destination
      );

      gain.gain.value =
        0.15;

      let frequency = 660;

      if (sound === "high") {
        frequency = 1100;
      } else if (sound === "low") {
        frequency = 440;
      } else if (sound === "bell") {
        frequency = 880;
      }

      if (sound === "double") {
        const now =
          audioContext.currentTime;

        [0, 0.4].forEach(
          offset => {
            const oscillator =
              audioContext.createOscillator();

            oscillator.frequency.value =
              880;

            oscillator.connect(gain);

            oscillator.start(
              now + offset
            );

            oscillator.stop(
              now +
                offset +
                0.25
            );
          }
        );
      } else {
        const oscillator =
          audioContext.createOscillator();

        oscillator.frequency.value =
          frequency;

        oscillator.connect(gain);

        oscillator.start();

        oscillator.stop(
          audioContext.currentTime +
            0.6
        );
      }

      setTimeout(() => {
        audioContext.close();
      }, 1200);
    } catch (error) {
      console.log(
        "알림음 재생 실패",
        error
      );
    }
  }

  async function completeSenseTraining() {
    const target =
      $("senseTarget")?.value;

    const duration =
      Number(
        $("senseDuration")?.value
      );

    const discovery =
      $("senseDiscovery")?.value;

    const difficulty =
      $("senseDifficulty")?.value;

    const memo =
      $("senseMemo")?.value;

    if (!discovery || !difficulty) {
      if ($("senseMessage")) {
        $("senseMessage").textContent =
          "관찰 결과와 어려웠던 점을 선택하세요.";
      }
      return;
    }

    if ($("senseCompleteButton")) {
      $("senseCompleteButton").disabled =
        true;
    }

    if ($("senseMessage")) {
      $("senseMessage").textContent =
        "훈련 기록을 저장하고 있습니다...";
    }

    const resultData = {
      training_type:
        "감각 관찰",
      target,
      duration_seconds:
        duration,
      discovery,
      difficulty,
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

    if ($("senseCompleteButton")) {
      $("senseCompleteButton").disabled =
        false;
    }

    if (error) {
      if ($("senseMessage")) {
        $("senseMessage").textContent =
          "저장 실패: " +
          error.message;
      }
      return;
    }

    state.profile = data;

    if ($("senseMessage")) {
      $("senseMessage").textContent =
        `훈련 기록이 저장되었습니다. EXP +${selectedSenseExp}`;
    }

    setTimeout(() => {
     show("senseTrainingPanel", false);
show("gamePanel", true);
show("dailyQuestRoom", true);
      if ($("senseDiscovery")) {
        $("senseDiscovery").value =
          "";
      }

      if ($("senseDifficulty")) {
        $("senseDifficulty").value =
          "";
      }

      if ($("senseMemo")) {
        $("senseMemo").value = "";
      }

      render();
    }, 1000);
  }

  /* =========================
     REMOTE VIEWING
  ========================= */

   let currentRvSessionId = null;
  let currentRvTargetCode = null;

  // 서버 제출 중 중복 실행 방지
  let rvSubmitting = false;
  let rvSubmitted = false;


/* =========================================
   REMOTE VIEWING 3.3 · RECOVERY ENGINE
========================================= */

let rvRecoveryId = null;
let rvRecoveryBusy = false;

function rvRecoveryKey() {
  return state.user?.id
    ? "spirit_rv_recovery_" + state.user.id
    : null;
}

function rvSaveRecovery(sessionId, observation = null) {
  const key = rvRecoveryKey();
  if (!key || !sessionId) return;

  try {
    sessionStorage.setItem(key, JSON.stringify({
      sessionId,
      observation,
      savedAt: new Date().toISOString()
    }));
  } catch (error) {
    console.warn("RV recovery storage unavailable", error);
  }
}

function rvReadRecovery() {
  const key = rvRecoveryKey();
  if (!key) return null;

  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function rvClearRecovery() {
  const key = rvRecoveryKey();

  if (key) {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }

  rvRecoveryId = null;
}

function rvRestoreObservation(observation) {
  if (!observation) return;

  const fields = {
    rvFormDescription: "p_form_description",
    rvColorDescription: "p_color_description",
    rvTextureDescription: "p_texture_description",
    rvTemperatureDescription: "p_temperature_description",
    rvMovementDescription: "p_movement_description",
    rvEnvironmentDescription: "p_environment_description",
    rvFreeDescription: "p_free_description"
  };

  Object.entries(fields).forEach(([id, key]) => {
    const field = rvElement(id);

    if (field) {
      field.value = observation[key] || "";
    }
  });
}

function rvShowRecoveryButton() {
  const panel = rvElement("rvSetup");
  if (!panel) return;

  let button = rvElement("rvRecoveryButton");

  if (!button) {
    button = document.createElement("button");
    button.id = "rvRecoveryButton";
    button.type = "button";
    button.className = "secondary";
    button.textContent = "이전 제출 결과 복구";
    button.style.cssText = "display:block;width:100%;margin-top:12px;";
    panel.appendChild(button);

    button.addEventListener("click", recoverRemoteViewingResult);
  }

 
  const saved = rvReadRecovery();

  // 제출 기록이 보존된 경우에만 복구 버튼 표시
  button.classList.toggle(
    "hidden",
    !saved?.sessionId || !saved?.observation
  );

}

  
  const rvFieldIds = [
    "rvFormDescription",
    "rvColorDescription",
    "rvTextureDescription",
    "rvTemperatureDescription",
    "rvMovementDescription",
    "rvEnvironmentDescription",
    "rvFreeDescription"
  ];

  function rvElement(id) {
    return document.getElementById(id);
  }

  function setRvMessage(id, value) {
    const element =
      rvElement(id);

    if (element) {
      element.textContent =
        value || "";
    }
  }

  function showRvStep(stepId) {
    [
      "rvSetup",
      "rvObservation",
      "rvReveal"
    ].forEach(id => {
      const element =
        rvElement(id);

      if (element) {
        element.classList.toggle(
          "hidden",
          id !== stepId
        );
      }
    });
  }

  function resetRvFields() {
    rvFieldIds.forEach(id => {
      const field =
        rvElement(id);

      if (field) {
        field.value = "";
      }
    });

    const image =
      rvElement(
        "rvTargetImage"
      );

    if (image) {
      image.removeAttribute("src");
    }
  }

/* REMOTE VIEWING — 독립 훈련실 */

function installRemoteViewingRoom() {
  const panel = $("remoteViewingTrainingPanel");
  if (!panel) return;

  // 기존 HTML과 이벤트 연결을 보존하면서
  // 메인 화면 바깥으로 실제 요소를 이동한다.
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }

  if ($("rvIndependentRoomStyle")) return;

  const style = document.createElement("style");
  style.id = "rvIndependentRoomStyle";

  style.textContent = `
    #remoteViewingTrainingPanel:not(.hidden) {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: block;
      overflow-y: auto;
      overscroll-behavior: contain;
      background: #0b1119;
      padding: 28px 16px 70px;
      box-sizing: border-box;
    }

    #remoteViewingTrainingPanel.hidden {
      display: none !important;
    }

    #remoteViewingTrainingPanel .remote-viewing-box {
      width: 100%;
      max-width: 850px;
      margin: 0 auto;
      box-sizing: border-box;
    }

    #remoteViewingTrainingPanel button,
    #remoteViewingTrainingPanel input,
    #remoteViewingTrainingPanel textarea {
      box-sizing: border-box;
      max-width: 100%;
    }

    @media (max-width: 600px) {
      #remoteViewingTrainingPanel:not(.hidden) {
        padding: 16px 12px 45px;
      }

      #remoteViewingTrainingPanel .remote-viewing-box {
        width: 100%;
        min-width: 0;
      }
    }
  `;

  document.head.appendChild(style);
}
  

function openRemoteViewing() {
  installRemoteViewingRoom();

  const panel = $("remoteViewingTrainingPanel");
  if (!panel) return;

  // 새로운 입장에서는 이전 세션의 화면 상태를 제거한다.
  currentRvSessionId = null;
  currentRvTargetCode = null;

  resetRvFields();

  // 이전 TARGET CODE가 DOM에 남아 있지 않도록 초기화
  const targetCode = rvElement("rvTargetCode");

  if (targetCode) {
    targetCode.textContent = "";
  }

  setRvMessage("rvMessage", "");
  setRvMessage("rvObservationMessage", "");

  // RV 3.3: 재입장 시 이전 제출 버튼 상태 초기화
  rvSubmitting = false;

  const submitButton = rvElement("rvSubmitButton");

  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "관찰 기록 제출";
  }

  setRvMessage("rvObservationMessage", "");
  
    showRvStep("rvSetup");

  // 재입장 시 TARGET CODE는 계속 비공개로 유지
  const previous = rvReadRecovery();

  rvRecoveryId = previous?.sessionId || null;

  // 제출 완료 여부는 서버 복구 RPC가 판단한다.
  rvShowRecoveryButton();

  panel.classList.remove("hidden");
  panel.scrollTop = 0;
}

  
  async function startRemoteViewingSession() {

        
 
  // 진행 중인 세션이 있으면 기존 타겟을 복원한다.
  // 새로운 서버 세션을 중복 생성하지 않는다.
  if (currentRvSessionId && currentRvTargetCode) {

    const targetCode = rvElement("rvTargetCode");

    if (targetCode) {
      targetCode.textContent = currentRvTargetCode;
    }

    showRvStep("rvObservation");

    const panel = rvElement("remoteViewingTrainingPanel");

    if (panel) {
      panel.scrollTop = 0;
    }

    return;
  }


  const button =
    rvElement(
      "rvStartButton"
    );
    
    if (button) {
      button.disabled = true;
    }

    setRvMessage(
      "rvMessage",
      "타겟을 안전하게 생성하고 있습니다..."
    );

    const {
      data,
      error
    } = await client.rpc(
      "create_rv_session"
    );

    if (button) {
      button.disabled = false;
    }

    if (error) {
      console.error(
        "create_rv_session failed",
        error
      );

      setRvMessage(
        "rvMessage",
        "타겟 생성 실패: " +
          error.message
      );

      return;
    }

    const session =
      Array.isArray(data)
        ? data[0]
        : data;

    if (
      !session ||
      !session.session_id ||
      !session.target_code
    ) {
      setRvMessage(
        "rvMessage",
        "서버가 올바른 타겟 세션을 반환하지 않았습니다."
      );

      return;
    }

       currentRvSessionId = session.session_id;
    currentRvTargetCode = session.target_code;

       rvSubmitting = false;
    rvSubmitted = false;

    // 새 세션 생성이 성공했을 때만 이전 임시 정보 정리
    rvClearRecovery();

    rvRecoveryId = currentRvSessionId;
    rvSaveRecovery(currentRvSessionId);
    if (
      rvElement(
        "rvObservationTargetCode"
      )
    ) {
      rvElement(
        "rvObservationTargetCode"
      ).textContent =
        currentRvTargetCode;
    }

    if (
      rvElement("rvTargetCode")
    ) {
      rvElement(
        "rvTargetCode"
      ).textContent =
        currentRvTargetCode;
    }

    showRvStep(
      "rvObservation"
    );
  }

  function readRvObservation() {
    return {
      p_form_description:
        rvElement(
          "rvFormDescription"
        )?.value.trim() || "",

      p_color_description:
        rvElement(
          "rvColorDescription"
        )?.value.trim() || "",

      p_texture_description:
        rvElement(
          "rvTextureDescription"
        )?.value.trim() || "",

      p_temperature_description:
        rvElement(
          "rvTemperatureDescription"
        )?.value.trim() || "",

      p_movement_description:
        rvElement(
          "rvMovementDescription"
        )?.value.trim() || "",

      p_environment_description:
        rvElement(
          "rvEnvironmentDescription"
        )?.value.trim() || "",

      p_free_description:
        rvElement(
          "rvFreeDescription"
        )?.value.trim() || ""
    };
  }

  async function submitRemoteViewingSession() {

    if (rvSubmitting) return;

    if (rvSubmitted) {
      setRvMessage(
        "rvObservationMessage",
        "이미 제출된 기록입니다. 타겟 공개 결과를 확인하세요."
      );
      return;
    }

    if (!currentRvSessionId) {
      setRvMessage(
        "rvObservationMessage",
        "유효한 세션이 없습니다. 새 타겟을 생성하세요."
      );

      return;
    }

    const observation =
      readRvObservation();

    if (
      !Object.values(
        observation
      ).some(Boolean)
    ) {
      setRvMessage(
        "rvObservationMessage",
        "관찰 기록을 한 항목 이상 입력하세요."
      );

      return;
    }

    const button =
      rvElement(
        "rvSubmitButton"
      );

      rvSubmitting = true;

    rvRecoveryId = currentRvSessionId;
    rvSaveRecovery(rvRecoveryId, observation);

    if (button) {
      button.disabled = true;
      button.textContent = "제출 처리 중...";
    }

    setRvMessage(
      "rvObservationMessage",
      "기록을 서버에 제출하고 있습니다. 잠시 기다려 주세요."
    );

    const {
      data,
      error
    } = await client.rpc(
      "submit_rv_session",
      {
        p_session_id:
          currentRvSessionId,
        ...observation
      }
    );

      rvSubmitting = false;

       if (error) {
      if (button) {
        button.disabled = true;
        button.textContent = "서버 결과 확인 필요";
      }

      console.error("submit_rv_session failed", error);

      setRvMessage(
        "rvObservationMessage",
        "서버 응답을 확인하지 못했습니다. 중복 제출하지 말고 이전 제출 결과 복구를 이용하세요."
      );

      showRvStep("rvSetup");
      rvShowRecoveryButton();
      return;
    }  

    const result =
      Array.isArray(data)
        ? data[0]
        : data;

    // 서버가 제출 결과를 반환했다면 재제출을 잠근다.
    if (result && result.storage_path) {
      rvSubmitted = true;
    }

    if (
      !result ||
      !result.storage_path
    ) {
      if (button) {
        button.disabled = false;
      }

      setRvMessage(
        "rvObservationMessage",
        "공개할 타겟 정보를 받지 못했습니다."
      );

      return;
    }

    
    try {

      await rvDisplayRevealedResult(
        result,
        observation
      );

    } catch (error) {

      console.error("RV reveal failed", error);

      // 제출은 이미 확정되었으므로 재제출하지 않는다.
      rvSubmitted = true;

      setRvMessage(
        "rvObservationMessage",
        "관찰 기록은 확정되었습니다. 이미지 공개에 실패했으므로 기존 결과를 복구하세요."
      );

      showRvStep("rvSetup");
      rvShowRecoveryButton();
      return;
    }
  }

  
async function rvDisplayRevealedResult(result, observation) {

  if (!result?.storage_path) {
    throw new Error("공개할 이미지 경로가 없습니다.");
  }

  const { data: signed, error } = await client.storage
    .from("rv-images")
    .createSignedUrl(result.storage_path, 600);

  if (error || !signed?.signedUrl) {
    throw error || new Error("이미지 URL 발급 실패");
  }

  const image = rvElement("rvTargetImage");

  if (image) {
    image.src = signed.signedUrl;
  }

  const code = rvElement("rvRevealedTargetCode");
  if (code) code.textContent = result.target_code || "—";

  const title = rvElement("rvTargetTitle");
  if (title) {
    title.textContent =
      result.source_title || "REMOTE VIEWING TARGET";
  }

  const fields = {
    Form: "p_form_description",
    Color: "p_color_description",
    Texture: "p_texture_description",
    Temperature: "p_temperature_description",
    Movement: "p_movement_description",
    Environment: "p_environment_description",
    Free: "p_free_description"
  };

  Object.entries(fields).forEach(([name, key]) => {
    const el = rvElement("rvResult" + name);

    if (el) {
      el.textContent = observation?.[key] || "—";
    }
  });

  rvSubmitted = true;
  rvSubmitting = false;

  const button = rvElement("rvSubmitButton");

  if (button) {
    button.disabled = true;
    button.textContent = "제출 완료";
  }

  currentRvSessionId = null;
  currentRvTargetCode = null;

  showRvStep("rvReveal");
}

async function recoverRemoteViewingResult() {

  if (rvRecoveryBusy || rvSubmitting) return;

  const saved = rvReadRecovery();
  const sessionId = rvRecoveryId || saved?.sessionId;

  if (!sessionId) {
    setRvMessage("rvMessage", "복구할 세션이 없습니다.");
    return;
  }

  rvRecoveryBusy = true;

  const button = rvElement("rvRecoveryButton");
  if (button) button.disabled = true;

  setRvMessage("rvMessage", "서버의 확정 기록을 확인하고 있습니다...");

  try {

    const { data, error } = await client.rpc(
      "recover_rv_session",
      { p_session_id: sessionId }
    );

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;

    if (!result?.storage_path) {
      throw new Error("확정된 공개 결과를 찾지 못했습니다.");
    }

    await rvDisplayRevealedResult(
      result,
      saved?.observation || readRvObservation()
    );

    rvRecoveryId = sessionId;

    setRvMessage("rvMessage", "");
    setRvMessage("rvObservationMessage", "");

  } catch (error) {

    console.error("RV recovery failed", error);

    setRvMessage(
      "rvMessage",
      "결과 복구 실패: " + error.message
    );

    // 실패해도 세션 식별자를 삭제하지 않는다.

  } finally {

    rvRecoveryBusy = false;

    if (button) button.disabled = false;
  }
}


function backRemoteViewingStep() {

  // 이전 단계에서는 TARGET CODE를 표시하지 않는다.
  // 단, 진행 중인 서버 세션 자체는 유지한다.


  // 제출하지 않은 관찰은 결과 복구 대상이 아니다.
  if (!rvSubmitted && !rvSubmitting) {
    rvClearRecovery();
    rvShowRecoveryButton();
  }

  
  showRvStep("rvSetup");

  const targetCode = rvElement("rvTargetCode");

  if (targetCode) {
    targetCode.textContent = "";
  }

  const panel = rvElement("remoteViewingTrainingPanel");

  if (panel) {
    panel.scrollTop = 0;
  }
}

  
  async function cancelRemoteViewing() {
    if (currentRvSessionId) {
      const {
        error
      } = await client.rpc(
        "cancel_rv_session",
        {
          p_session_id:
            currentRvSessionId
        }
      );

      if (error) {
        console.warn(
          "cancel_rv_session failed",
          error
        );
      }
    }

    currentRvSessionId = null;
    currentRvTargetCode = null;

    show(
      "remoteViewingTrainingPanel",
      false
    );

    show("gamePanel", true);

    render();
  }

  function finishRemoteViewing() {

  // 사용자가 결과 확인을 마쳤을 때만 임시 기록 정리
  rvClearRecovery();

  currentRvSessionId = null;
  currentRvTargetCode = null;

  rvSubmitting = false;
  rvSubmitted = false;

  show("remoteViewingTrainingPanel", false);
  show("gamePanel", true);

  render();
}
  /* =========================
     EVENT BINDINGS
  ========================= */

  $("signUpBtn")?.addEventListener(
    "click",
    signUp
  );

  $("signInBtn")?.addEventListener(
    "click",
    signIn
  );

  $("normalStartBtn")?.addEventListener(
    "click",
    () => createProfile(1)
  );

  $("assessmentStartBtn")?.addEventListener(
    "click",
    startAssessment
  );

  $("rankTestStartButton")?.addEventListener(
    "click",
    startRankTest
  );

  $("logoutBtn")?.addEventListener(
    "click",
    async () => {
      await client.auth.signOut();
      await loadProfile();
    }
  );

  $("focusStartButton")?.addEventListener(
    "click",
    startFocusTraining
  );

  $("focusCompleteButton")?.addEventListener(
    "click",
    completeFocusTraining
  );

 $("focusBackButton")?.addEventListener(
  "click",
  () => {
    if (focusTimerInterval) {
      clearInterval(focusTimerInterval);
      focusTimerInterval = null;
    }

    returnToDailyQuestRoom();
  }
);

  $("senseStartButton")?.addEventListener(
    "click",
    startSenseTraining
  );

  $("senseCompleteButton")?.addEventListener(
    "click",
    completeSenseTraining
  );

 $("senseBackButton")?.addEventListener(
  "click",
  () => {
    if (senseTimerInterval) {
      clearInterval(senseTimerInterval);
      senseTimerInterval = null;
    }

    returnToDailyQuestRoom();
  }
);

  $("openRemoteViewingButton")?.addEventListener(
    "click",
    openRemoteViewing
  );

  $("rvStartButton")?.addEventListener(
    "click",
    startRemoteViewingSession
  );

  $("rvSubmitButton")?.addEventListener(
    "click",
    submitRemoteViewingSession
  );

  $("rvBackButton")?.addEventListener(
    "click",
    cancelRemoteViewing
  );

 $("rvCancelButton")?.addEventListener(
  "click",
  backRemoteViewingStep
);
  
  $("rvFinishButton")?.addEventListener(
    "click",
    finishRemoteViewing
  );

  /* =========================
     SUPABASE AUTH
  ========================= */

  client.auth.onAuthStateChange(
    () => {
      loadProfile();
    }
  );

  /* =========================
     BOOT
  ========================= */

  
/* =========================================
   SPIRIT SYSTEM
   LAB SECTION VISUAL SEPARATION
========================================= */

function installLabSectionStyle() {
  if (document.getElementById("spiritLabSectionStyle")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "spiritLabSectionStyle";

  style.textContent = `
    /* FOCUS LAB */
    #focusLabPanel {
      border: 2px solid #719fd4 !important;
      border-radius: 16px !important;
      background: linear-gradient(
        145deg,
        rgba(67, 113, 171, 0.14),
        rgba(67, 113, 171, 0.035)
      ) !important;
      box-shadow:
        0 0 0 1px rgba(113, 159, 212, 0.12),
        0 8px 24px rgba(0, 0, 0, 0.12);
      padding: 22px !important;
      margin-top: 24px !important;
      margin-bottom: 24px !important;
    }

    /* SENSE LAB */
    #senseLabV1Card {
      border: 2px solid #6ea58d !important;
      border-radius: 16px !important;
      background: linear-gradient(
        145deg,
        rgba(68, 139, 102, 0.14),
        rgba(68, 139, 102, 0.035)
      ) !important;
      box-shadow:
        0 0 0 1px rgba(110, 165, 141, 0.12),
        0 8px 24px rgba(0, 0, 0, 0.12);
      padding: 22px !important;
      margin-top: 24px !important;
      margin-bottom: 24px !important;
    }

    /* FOCUS GROWTH */
    #labGrowthPanel {
      border: 2px solid #a58ac9 !important;
      border-radius: 16px !important;
      background: linear-gradient(
        145deg,
        rgba(133, 94, 172, 0.13),
        rgba(133, 94, 172, 0.035)
      ) !important;
      box-shadow:
        0 0 0 1px rgba(165, 138, 201, 0.12),
        0 8px 24px rgba(0, 0, 0, 0.12);
      padding: 22px !important;
      margin-top: 24px !important;
      margin-bottom: 24px !important;
    }

    /* 검사실 제목 구분 */
    #focusLabPanel .section-title,
    #senseLabV1Card .section-title,
    #labGrowthPanel .section-title {
      padding-bottom: 12px;
      margin-bottom: 14px;
      border-bottom: 1px solid rgba(180, 200, 190, 0.3);
    }

    /* 작은 화면에서도 내부 여백 유지 */
    @media (max-width: 600px) {
      #focusLabPanel,
      #senseLabV1Card,
      #labGrowthPanel {
        padding: 16px !important;
      }
    }
  `;

  document.head.appendChild(style);
}

  

/* =========================================
   SENSE LAB 2.0
   VISUAL 1 + VISUAL 2
   Independent growth system
========================================= */

let senseLabV1 = null;
let senseLabV1Timers = [];
let senseLabV1Saving = false;
let senseLabProfile = null;
let senseLabSelectedMode = "visual1";

const SENSE_LAB_MODES = {
  visual1: {
    name: "VISUAL 1",
    subtitle: "기본 시각 탐지",
    level: 1,
    exposure: 250,
    size: 46,
    opacity: 1,
    gapMin: 450,
    gapMax: 850,
    active: 1500,
    rpc: "submit_sense_lab_visual1",
    maxExp: 19
  },

  visual2: {
    name: "VISUAL 2",
    subtitle: "미세 시각 탐지",
    level: 15,
    exposure: 190,
    size: 24,
    opacity: 0.55,
    gapMin: 450,
    gapMax: 850,
    active: 1500,
    rpc: "submit_sense_lab_visual2",
    maxExp: 21
  },

  visual3: {
    name: "VISUAL 3",
    subtitle: "DISTRACTION CONTROL · 방해 자극 구분",
    level: 30,
    exposure: 210,
    size: 28,
    opacity: 0.8,
    gapMin: 550,
    gapMax: 1000,
    active: 1500,
    rpc: "submit_sense_lab_visual3",
    maxExp: 21
  }
};

function senseLabV1Later(fn, ms) {
  const id = setTimeout(fn, ms);
  senseLabV1Timers.push(id);
  return id;
}

function senseLabV1ClearTimers() {
  senseLabV1Timers.forEach(clearTimeout);
  senseLabV1Timers = [];
}

function senseLabV1Shuffle(items) {
  const a = [...items];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

function senseLabV15BuildSequence() {
  const targetCount =
    7 + Math.floor(Math.random() * 7);

  return senseLabV1Shuffle([
    ...Array(targetCount).fill(true),
    ...Array(20 - targetCount).fill(false)
  ]);
}

/* =========================================
   SENSE LAB 3.0
   DISTRACTION CONTROL
========================================= */

function senseLab3BuildSequence() {
  const targetCount = 7 + Math.floor(Math.random() * 7);

  const targetSequence = senseLabV1Shuffle([
    ...Array(targetCount).fill(true),
    ...Array(20 - targetCount).fill(false)
  ]);

  // 목표가 있는 문항에도 방해 자극을 배치한다.
  const targetIndices = senseLabV1Shuffle(
    targetSequence
      .map((present, index) => present ? index : -1)
      .filter(index => index >= 0)
  );

  const nonTargetIndices = senseLabV1Shuffle(
    targetSequence
      .map((present, index) => !present ? index : -1)
      .filter(index => index >= 0)
  );

  const distractorIndices = new Set([
    ...targetIndices.slice(0, Math.min(5, targetIndices.length)),
    ...nonTargetIndices.slice(0, Math.min(7, nonTargetIndices.length))
  ]);

  return targetSequence.map((present, index) => ({
    stimulus_present: present,
    distractor_present: distractorIndices.has(index)
  }));
}

function senseLab3RenderStimulus(trial, mode) {
  const stage = $("senseLabV1Stage");
  const target = $("senseLabV1Stimulus");

  if (!stage || !target) return;

  stage.querySelectorAll(".sense-lab-distractor")
    .forEach(el => el.remove());

  if (mode !== "visual3") {
    target.style.display =
      trial.stimulus_present ? "block" : "none";
    return;
  }

  // 목표 신호: 중앙의 연두색 원
  target.style.display =
    trial.stimulus_present ? "block" : "none";

  if (!trial.distractor_present) return;

  // 방해 자극: 주변의 회색 도형
  const positions = [
    [19, 24], [80, 22], [23, 76], [77, 75],
    [13, 51], [87, 50]
  ];

  const symbols = ["◆", "■", "▲", "✦", "●", "◇"];

  const selected = senseLabV1Shuffle(
    positions.map((pos, index) => ({
      pos,
      symbol: symbols[index]
    }))
  ).slice(0, 4);

  selected.forEach(item => {
    const el = document.createElement("span");

    el.className = "sense-lab-distractor";
    el.textContent = item.symbol;

    el.style.cssText = `
      position:absolute;
      left:${item.pos[0]}%;
      top:${item.pos[1]}%;
      transform:translate(-50%,-50%);
      color:#84968c;
      font-size:22px;
      opacity:.75;
      pointer-events:none;
      user-select:none;
    `;

    stage.appendChild(el);
  });
}

function senseLab3ClearStimulus() {
  $("senseLabV1Stage")
    ?.querySelectorAll(".sense-lab-distractor")
    .forEach(el => el.remove());

  const target = $("senseLabV1Stimulus");
  if (target) target.style.display = "none";
}
  
function senseLabV1Install() {
  if ($("senseLabV1Panel")) return;

  const host =
    $("focusLabPanel") ||
    $("questList")?.closest(".panel");

  if (!host) return;

  const card = document.createElement("section");
  card.id = "senseLabV1Card";
  card.className = "panel";

  card.innerHTML = `
    <div class="section-title">
      <h2>SENSE LAB · 감각 검증실</h2>
      <span class="muted">독립 성장 LV.1~100</span>
    </div>

    <p class="muted">
      감각 탐지 · 수행 측정 · 독립 성장
    </p>

    <div id="senseLabGrowthInfo"
      style="margin:15px 0;line-height:1.8">
      성장 기록을 불러오는 중...
    </div>

    <button id="senseLabV1Open"
      type="button"
      style="width:100%;padding:15px">
      SENSE LAB 입장 →
    </button>
  `;

  host.insertAdjacentElement("afterend", card);

  const panel = document.createElement("section");
  panel.id = "senseLabV1Panel";

  panel.style.cssText = `
    display:none;
    position:fixed;
    inset:0;
    z-index:99999;
    overflow:auto;
    background:#101b19;
    color:#f5f5ed;
    padding:24px 15px;
    box-sizing:border-box;
    font-family:inherit;
  `;

  panel.innerHTML = `
    <div style="
      max-width:540px;
      margin:0 auto;
      text-align:center;
    ">

      <h2>SENSE LAB 3.0</h2>

<p class="muted">
  VISUAL DETECTION TRAINING
</p>

<div id="senseLabV1Setup"
  style="text-align:left;line-height:1.8">

  <div id="senseLab21ProgressHost"
    style="margin:18px 0">
  </div>

 <div id="senseLabModeList"
  style="display:grid;gap:12px;margin:22px 0">
</div>
        <details id="senseLabV1Guide"
          style="
            border:1px solid #52685e;
            border-radius:12px;
            padding:15px;
            margin:16px 0;
          ">

          <summary style="
            cursor:pointer;
            font-weight:bold;
          ">
            검증실 안내 · 검사 방법 보기
          </summary>

          <div style="padding-top:12px">

            <h3>이 검증실은 왜 필요한가?</h3>

            <p>
              SENSE LAB은 심리물리학과
              신호탐지이론을 참고한
              시각 탐지 수행 검사입니다.
            </p>

            <p>
              실제 신호를 놓치는 경우와
              신호가 없는데 있다고 판단하는 경우를
              구분하여 기록합니다.
            </p>

            <h3>검사 방법</h3>

            <p>
              총 20문항입니다.
              중앙에 빛이 나타났을 때만
              감지 버튼을 누르세요.
              빛이 없으면 누르지 않습니다.
            </p>

            <p>
              + 표시 중 미리 누르면
              조기 반응으로 기록되고
              해당 문항을 다시 진행합니다.
            </p>

            <p style="font-size:13px;opacity:.75">
              높은 점수는 해당 검사 조건에서의
              시각 탐지 수행을 의미하며,
              초감각적 지각이나 영적 능력의
              증거를 의미하지 않습니다.
            </p>

          </div>
        </details>

        <button id="senseLabV1Start"
          type="button"
          style="
            width:100%;
            padding:17px;
            font-weight:bold;
          ">
          VISUAL 1 · 검사 시작
        </button>

        <div id="senseLabGrowthPanel"
          style="
            border:1px solid #6ea58d;
            border-radius:14px;
            padding:17px;
            margin:25px 0;
            background:rgba(68,139,102,.08);
          ">
          성장 분석을 불러오는 중...
        </div>

      </div>

      <div id="senseLabV1Running"
        style="display:none">

        <h3 id="senseLabRunningTitle">
          VISUAL 1
        </h3>

        <p id="senseLabV1Progress">
          0 / 20
        </p>

        <div id="senseLabV1ComboPanel"
          style="
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:10px;
            margin:14px 0;
          ">

          <div style="
            border:1px solid #6ea58d;
            border-radius:10px;
            padding:12px;
          ">
            <small>CURRENT COMBO</small>
            <div>
              <strong id="senseLabV1Combo"
                style="font-size:27px">0</strong>
            </div>
          </div>

          <div style="
            border:1px solid #6ea58d;
            border-radius:10px;
            padding:12px;
          ">
            <small>BEST COMBO</small>
            <div>
              <strong id="senseLabV1BestCombo"
                style="font-size:27px">0</strong>
            </div>
          </div>

        </div>

        <div id="senseLabV1Stage"
          style="
            position:relative;
            height:260px;
            max-width:420px;
            margin:20px auto;
            border:1px solid #64756e;
            border-radius:16px;
            background:#080d0c;
            display:flex;
            align-items:center;
            justify-content:center;
          ">

          <div id="senseLabV1Stimulus"
            style="
              display:none;
              width:46px;
              height:46px;
              border-radius:50%;
              background:#eafbdc;
              box-shadow:0 0 25px #c9ffad;
            ">
          </div>

          <span id="senseLabV1Fixation"
            style="font-size:24px;opacity:.65">
            +
          </span>

        </div>

        <button id="senseLabV1Respond"
          type="button"
          style="
            width:100%;
            max-width:420px;
            padding:20px;
            font-size:19px;
            font-weight:bold;
            touch-action:manipulation;
          ">
          감지!
        </button>

        <p style="font-size:13px;opacity:.7">
         <span id="senseLabResponseGuide">
  빛이 나타났을 때만 누르세요.
</span>
        </p>

      </div>

      <div id="senseLabV1Result"
        style="display:none">

        <h3>검사 결과</h3>

        <div id="senseLabV1ResultText"
          style="line-height:2">
        </div>

        <button id="senseLabRetry"
          type="button"
          style="width:100%;padding:14px;margin-top:18px">
          다른 검사 선택
        </button>

      </div>

      <p id="senseLabV1Message"
        style="min-height:24px">
      </p>

      <button id="senseLabV1Back"
        type="button"
        style="margin-top:18px">
        검증실 닫기
      </button>

    </div>
  `;

  document.body.appendChild(panel);
senseLabInstallGrowthRollup();
  
  $("senseLabV1Open").onclick = senseLabV1Open;
  $("senseLabV1Start").onclick = senseLabV1Start;
  $("senseLabV1Respond").onclick = senseLabV1Respond;
  $("senseLabV1Back").onclick = senseLabV1Close;

  $("senseLabRetry").onclick = () => {
    if (senseLabV1Saving) return;

    senseLabV1 = null;

    $("senseLabV1Result").style.display = "none";
    $("senseLabV1Setup").style.display = "block";
    $("senseLabV1Message").textContent = "";

    senseLabRenderModes();
    senseLabDashboardLoad();
  };

  senseLabRenderModes();
}

async function senseLabLoadGrowth() {
  const el = $("senseLabGrowthInfo");

  if (!el || !state.user?.id) return;

  try {
    const { data, error } = await client
      .from("sense_lab_profiles")
      .select("level,exp,max_level,total_tests")
      .eq("user_id", state.user.id)
      .maybeSingle();

    if (error) throw error;

    const p = data || {
      level: 1,
      exp: 0,
      max_level: 1,
      total_tests: 0
    };

    senseLabProfile = p;

    const level = Number(p.level);
    const exp = Number(p.exp);

    const needed =
      level >= 100
        ? 0
        : 100 + (level - 1) * 12;

    const percent =
      level >= 100
        ? 100
        : Math.min(
            100,
            Math.round(exp / needed * 100)
          );

    el.innerHTML = `
      <div style="
        display:flex;
        justify-content:space-between;
        gap:10px;
      ">
        <strong>SENSE LV.${level}</strong>
        <span>
          ${level >= 100
            ? "MAX LEVEL"
            : `EXP ${exp} / ${needed}`}
        </span>
      </div>

      <div style="
        height:9px;
        background:#293b35;
        border-radius:20px;
        overflow:hidden;
        margin:10px 0;
      ">
        <div style="
          width:${percent}%;
          height:100%;
          background:#88b8a1;
        "></div>
      </div>

      <p class="muted">
        최고 LV.${Number(p.max_level)}
        · 누적 검사 ${Number(p.total_tests)}회
      </p>

      <p class="muted" style="font-size:12px">
        다음 과정:
       ${level < 15
  ? `VISUAL 2 · LV.15 (${15 - level}레벨 남음)`
  : level < 30
    ? `VISUAL 3 · LV.30 (${30 - level}레벨 남음)`
    : "VISUAL 1~3 해금 완료"}
      </p>
    `;

    senseLab21RenderProgress();
    senseLabRenderModes();

  } catch (error) {
    console.error("SENSE PROFILE:", error);
    el.textContent = "성장 기록을 불러오지 못했습니다.";
  }
}


/* =========================================
   SENSE LAB 2.1
   NEXT UNLOCK + TRAINING MISSION
========================================= */

function senseLab21ExpRemaining(level, exp, targetLevel) {
  let remaining = 0;

  for (let lv = level; lv < targetLevel; lv++) {
    const required = 100 + (lv - 1) * 12;

    remaining += lv === level
      ? Math.max(0, required - exp)
      : required;
  }

  return remaining;
}

function senseLab21RenderProgress() {
  const host = $("senseLab21ProgressHost");

  if (!host || !senseLabProfile) return;

  let panel = $("senseLab21Progress");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "senseLab21Progress";

    panel.style.cssText = `
      margin-top:15px;
      padding:15px;
      border:1px solid #6ea58d;
      border-radius:12px;
      line-height:1.8;
    `;

    host.appendChild(panel);
  }

// 안내 패널이 다른 곳에 남아 있으면 검증실 내부로 이동
if (panel.parentElement !== host) {
  host.appendChild(panel);
}
  
  const level = Number(senseLabProfile.level || 1);
  const exp = Number(senseLabProfile.exp || 0);

  const next = Object.entries(SENSE_LAB_MODES)
    .map(([key, mode]) => ({
      key,
      ...mode
    }))
    .sort((a, b) => a.level - b.level)
    .find(mode => mode.level > level);

  const nextUnlock = next
    ? `
      <strong>NEXT UNLOCK</strong>

      <div>${next.name} · LV.${next.level}</div>

      <div>
        남은 EXP:
        <strong>
          ${senseLab21ExpRemaining(
            level,
            exp,
            next.level
          ).toLocaleString()}
        </strong>
      </div>
    `
    : `
      <strong>NEXT UNLOCK</strong>
      <div>현재 등록된 과정 모두 해금 완료</div>
    `;

  panel.innerHTML = `
    ${nextUnlock}

    <hr style="opacity:.2;margin:14px 0">

    <strong>TRAINING MISSION</strong>

    <p style="font-size:13px;opacity:.75">
      다음 검사에서 도전할 수행 목표입니다.
    </p>

    <div>정확도 90점 이상 달성</div>
    <div>오반응 1회 이하 유지</div>
    <div>최고 콤보 10회 이상 달성</div>

    <p style="font-size:12px;opacity:.65">
      목표는 검사 결과를 평가하기 위한 안내이며,
      별도의 EXP를 중복 지급하지 않습니다.
    </p>
  `;
}

  
function senseLabRenderModes() {
  const host = $("senseLabModeList");
  if (!host) return;

  const level = Number(senseLabProfile?.level || 1);

  host.innerHTML = Object.entries(SENSE_LAB_MODES)
    .map(([key, mode]) => {
      const locked = level < mode.level;
      const selected = senseLabSelectedMode === key;

      return `
        <button
          type="button"
          data-sense-mode="${key}"
          ${locked ? "disabled" : ""}
          style="
            text-align:left;
            padding:17px;
            border-radius:12px;
            border:${selected
              ? "2px solid #a9dfb7"
              : "1px solid #52685e"};
            background:${selected
              ? "rgba(110,165,141,.18)"
              : "rgba(255,255,255,.025)"};
            color:inherit;
            opacity:${locked ? ".55" : "1"};
            cursor:${locked ? "not-allowed" : "pointer"};
          ">

          <strong>${mode.name}</strong>
          <span style="float:right;font-size:12px">
            ${locked
              ? `LOCKED · LV.${mode.level}`
              : selected
                ? "SELECTED"
                : "OPEN"}
          </span>

          <div style="font-size:13px;margin-top:6px">
            ${mode.subtitle}
          </div>

          <div style="font-size:12px;opacity:.7">
            20문항 · 최대 EXP ${mode.maxExp}
          </div>
        </button>
      `;
    })
    .join("");

  host.querySelectorAll("[data-sense-mode]")
    .forEach(button => {
      button.onclick = () => {
        senseLabSelectedMode = button.dataset.senseMode;
        senseLabRenderModes();
      };
    });

  const mode = SENSE_LAB_MODES[senseLabSelectedMode];

  $("senseLabV1Start").textContent =
    `${mode.name} · 검사 시작`;
}

async function senseLabDashboardLoad() {
  const host = $("senseLabGrowthPanel");

  if (!host || !state.user?.id) return;

  const previous =
    $("senseLabHistoryMode")?.value || "visual1";

  host.innerHTML = `
    <h2>SENSE GROWTH · 성장 분석</h2>

    <label for="senseLabHistoryMode">
      검사 종류
    </label>

    <select id="senseLabHistoryMode"
      style="padding:9px;margin:10px 0">
      <option value="visual1">VISUAL 1</option>
<option value="visual2">VISUAL 2</option>
<option value="visual3">VISUAL 3</option>
    </select>

    <div id="senseGrowthContent">
      성장 기록을 불러오는 중...
    </div>
  `;

  $("senseLabHistoryMode").value = previous;

  $("senseLabHistoryMode").onchange = () => {
    senseLabDashboardRender(
      $("senseLabHistoryMode").value
    );
  };

  await senseLabDashboardRender(previous);
}


/* =========================================
   SENSE LAB 2.2
   ACHIEVEMENT SYSTEM
   Read-only / per mode
========================================= */


/* =========================================
   SENSE LAB 2.3
   PERFORMANCE ANALYSIS
   Recent 10 tests / per mode
========================================= */

function senseLab23Performance(rows, mode) {
  const host = $("senseGrowthContent");
  if (!host) return;

  $("senseLab23Performance")?.remove();

  const validRows = (rows || [])
    .filter(row =>
      row &&
      Number.isFinite(Number(row.score)) &&
      row.score !== null
    )
    .slice(0, 10)
    .reverse();

  if (!validRows.length) return;

  const panel = document.createElement("section");
  panel.id = "senseLab23Performance";

  panel.style.cssText = `
    margin-top:20px;
    padding:16px;
    border:1px solid #52685e;
    border-radius:12px;
    line-height:1.7;
  `;

  const clamp = value =>
    Math.max(0, Math.min(100, Number(value) || 0));

  const stats = validRows.map((row, index) => {
    const hits = Number(row.hits || 0);
    const misses = Number(row.misses || 0);
    const fa = Number(row.false_alarms || 0);
    const cr = Number(row.correct_rejections || 0);

    return {
      number: index + 1,
      score: clamp(row.score),
      hitRate: hits + misses
        ? clamp(hits / (hits + misses) * 100)
        : 0,
      faRate: fa + cr
        ? clamp(fa / (fa + cr) * 100)
        : 0
    };
  });

  const average = (list, key) =>
    list.length
      ? list.reduce((sum, item) => sum + item[key], 0)
        / list.length
      : 0;

  const current = stats.slice(-5);
  const previous = stats.slice(-10, -5);

  const currentAvg = average(current, "score");
  const previousAvg = average(previous, "score");

  let trendText = "비교 기록 축적 중";

  if (previous.length) {
    const diff = currentAvg - previousAvg;

    trendText =
      `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}점`;

    if (diff > 5) {
      trendText += " · 상승 추세";
    } else if (diff < -5) {
      trendText += " · 하락 추세";
    } else {
      trendText += " · 유지 구간";
    }
  }

  const bars = stats.map(item => `
    <div style="
      flex:1;
      min-width:0;
      text-align:center;
    ">
      <div style="
        height:110px;
        display:flex;
        align-items:flex-end;
        justify-content:center;
      ">
        <div style="
          width:75%;
          max-width:25px;
          height:${item.score}%;
          min-height:2px;
          border-radius:5px 5px 0 0;
          background:#a9dfb7;
        "></div>
      </div>

      <div style="
        font-size:11px;
        margin-top:5px;
      ">
        ${Math.round(item.score)}
      </div>

      <div style="
        font-size:10px;
        opacity:.6;
      ">
        ${item.number}
      </div>
    </div>
  `).join("");

  const recentHitRate = average(current, "hitRate");
  const recentFARate = average(current, "faRate");

  const progressBar = (label, value, color) => `
    <div style="margin:13px 0">
      <div style="
        display:flex;
        justify-content:space-between;
        gap:10px;
        font-size:13px;
      ">
        <span>${label}</span>
        <strong>${value.toFixed(1)}%</strong>
      </div>

      <div style="
        height:8px;
        background:#293b35;
        border-radius:20px;
        overflow:hidden;
        margin-top:6px;
      ">
        <div style="
          width:${clamp(value)}%;
          height:100%;
          border-radius:20px;
          background:${color};
        "></div>
      </div>
    </div>
  `;

  let feedback;

  if (recentFARate >= 25) {
    feedback =
      "오반응 비율이 높습니다. " +
      "다음 검사에서는 신호가 없는 상황에서 " +
      "반응을 억제하는 데 집중하세요.";
  } else if (recentHitRate < 65) {
    feedback =
      "실제 신호를 놓치는 비율이 높습니다. " +
      "화면 중앙에 시선을 안정적으로 유지하는 " +
      "훈련을 권장합니다.";
  } else if (previous.length &&
             currentAvg > previousAvg + 5) {
    feedback =
      "최근 검사 점수가 이전 구간보다 상승했습니다. " +
      "동일한 검사 조건을 유지하면서 " +
      "변화가 지속되는지 확인하세요.";
  } else {
    feedback =
      "현재 수행 기록을 유지하면서 " +
      "적중률과 오반응률을 함께 개선하는 것을 " +
      "다음 목표로 설정하세요.";
  }

  panel.innerHTML = `
    <h3>PERFORMANCE ANALYSIS</h3>

    <p style="font-size:12px;opacity:.7">
      ${SENSE_LAB_MODES[mode]?.name || "VISUAL 1"}
      · 최근 최대 10회
    </p>

    <div style="
      margin:18px 0;
      padding:14px 8px;
      border:1px solid rgba(110,165,141,.35);
      border-radius:10px;
    ">
      <strong style="font-size:13px">
        SCORE HISTORY
      </strong>

      <div style="
        display:flex;
        gap:5px;
        align-items:flex-end;
        margin-top:14px;
      ">
        ${bars}
      </div>

      <p style="
        font-size:11px;
        opacity:.65;
        text-align:center;
      ">
        오래된 검사 → 최근 검사
      </p>
    </div>

    <div style="
      display:flex;
      justify-content:space-between;
      gap:10px;
      margin:15px 0;
    ">
      <span>최근 평균 점수</span>
      <strong>${currentAvg.toFixed(1)}점</strong>
    </div>

    <div style="
      display:flex;
      justify-content:space-between;
      gap:10px;
    ">
      <span>이전 구간 대비</span>
      <strong>${trendText}</strong>
    </div>

    <hr style="opacity:.2;margin:18px 0">

    <strong>DETECTION BALANCE</strong>

    ${progressBar(
      "최근 5회 평균 적중률",
      recentHitRate,
      "#a9dfb7"
    )}

    ${progressBar(
      "최근 5회 평균 오반응률",
      recentFARate,
      "#d5a17d"
    )}

    <div style="
      padding:13px;
      border:1px solid #52685e;
      border-radius:10px;
      margin-top:17px;
      font-size:13px;
    ">
      <strong>NEXT TRAINING GUIDE</strong>
      <p>${feedback}</p>
    </div>

    <p style="
      font-size:11px;
      opacity:.6;
      margin-top:13px;
    ">
      이 분석은 저장된 검사 기록을 기반으로 합니다.
      적중률과 오반응률은 각각의 문항 유형을
      기준으로 계산한 최근 검사별 비율의 평균입니다.
    </p>
  `;

  host.appendChild(panel);
}


/* =========================================
   SENSE LAB 2.4
   COLLAPSIBLE ANALYSIS PANELS
========================================= */

function senseLabMakeCollapsible(panelId, title, initiallyOpen = false) {
  const panel = $(panelId);

  if (!panel || !panel.parentNode) return;

  // 기존 래퍼가 있으면 중복 생성하지 않는다.
  const existing = document.getElementById(
    panelId + "Rollup"
  );

  if (existing) {
    existing.remove();
  }

  const wrapper = document.createElement("details");
  wrapper.id = panelId + "Rollup";
  wrapper.open = initiallyOpen;

  wrapper.style.cssText = `
    margin-top:14px;
    border:1px solid #52685e;
    border-radius:12px;
    padding:12px 15px;
  `;

  const summary = document.createElement("summary");
  summary.textContent = title;

  summary.style.cssText = `
    cursor:pointer;
    font-weight:bold;
    padding:7px 0;
    user-select:none;
  `;

  panel.parentNode.insertBefore(wrapper, panel);

  wrapper.appendChild(summary);
  wrapper.appendChild(panel);

  // 기존 패널의 외부 테두리와 중복되지 않도록 조정
  panel.style.border = "none";
  panel.style.marginTop = "10px";
  panel.style.padding = "0";
}

  
/* =========================================
   SENSE GROWTH ROLLUP
========================================= */

function senseLabInstallGrowthRollup() {
  const panel = $("senseLabGrowthPanel");

  if (!panel || $("senseLabGrowthRollup")) return;

  const wrapper = document.createElement("details");
  wrapper.id = "senseLabGrowthRollup";
  wrapper.open = false;

  wrapper.style.cssText = `
    margin:20px 0;
    padding:12px 15px;
    border:1px solid #52685e;
    border-radius:12px;
  `;

  const summary = document.createElement("summary");

  summary.textContent = "SENSE GROWTH · 성장 분석";

  summary.style.cssText = `
    cursor:pointer;
    font-weight:bold;
    padding:7px 0;
    user-select:none;
  `;

  panel.parentNode.insertBefore(wrapper, panel);

  wrapper.appendChild(summary);
  wrapper.appendChild(panel);

  panel.style.border = "none";
  panel.style.margin = "12px 0 0";
  panel.style.padding = "0";
}

  
function senseLab22Achievements(rows, mode) {
  const host = $("senseGrowthContent");
  if (!host) return;

  const old = $("senseLab22Achievements");
  if (old) old.remove();

  if (!rows || !rows.length) return;

  const scores = rows.map(r => Number(r.score || 0));

  const total = rows.length;
  const bestScore = Math.max(...scores);

  const totalHits = rows.reduce(
    (s, r) => s + Number(r.hits || 0), 0
  );

  const totalMisses = rows.reduce(
    (s, r) => s + Number(r.misses || 0), 0
  );

  const totalFA = rows.reduce(
    (s, r) => s + Number(r.false_alarms || 0), 0
  );

  const totalCR = rows.reduce(
    (s, r) => s + Number(r.correct_rejections || 0), 0
  );

  const targetCount = totalHits + totalMisses;
  const nonTargetCount = totalFA + totalCR;

  const hitRate = targetCount
    ? Math.round(totalHits / targetCount * 100)
    : 0;

  const falseAlarmRate = nonTargetCount
    ? Math.round(totalFA / nonTargetCount * 100)
    : 0;

  const bestCombo = rows.reduce((best, row) => {
    const value = Number(row.result?.best_combo);
    return Number.isFinite(value)
      ? Math.max(best, value)
      : best;
  }, 0);

  const perfectCount = rows.filter(r =>
    Number(r.score) === 100
  ).length;

  const zeroFA = rows.filter(r =>
    Number(r.false_alarms) === 0
  ).length;

  const excellentCount = rows.filter(r =>
    Number(r.score) >= 90
  ).length;

  const achievements = [
    {
      icon: "◇",
      name: "SIGNAL HUNTER",
      desc: "검사 10회 완료",
      current: total,
      target: 10
    },
    {
      icon: "✦",
      name: "SHARP SENSE",
      desc: "90점 이상 검사 5회",
      current: excellentCount,
      target: 5
    },
    {
      icon: "◎",
      name: "FALSE ALARM ZERO",
      desc: "오반응 0회 검사 3회",
      current: zeroFA,
      target: 3
    },
    {
      icon: "◆",
      name: "COMBO MASTER",
      desc: "최고 콤보 15회 달성",
      current: bestCombo,
      target: 15
    },
    {
      icon: "★",
      name: "PERFECT DETECTION",
      desc: "100점 검사 1회 달성",
      current: perfectCount,
      target: 1
    }
  ];

  const unlocked = achievements.filter(
    a => a.current >= a.target
  ).length;

  const panel = document.createElement("section");
  panel.id = "senseLab22Achievements";

  panel.style.cssText = `
    margin-top:22px;
    padding-top:16px;
    border-top:1px solid rgba(110,165,141,.45);
  `;

  panel.innerHTML = `
    <h3>ACHIEVEMENTS · 성취 기록</h3>

    <p style="font-size:13px;opacity:.75">
      ${SENSE_LAB_MODES[mode]?.name || "VISUAL 1"}
      독립 성취 기록
    </p>

    <div style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      margin:15px 0;
    ">
      <strong>OPEN</strong>
      <strong>${unlocked} / ${achievements.length}</strong>
    </div>

    <div style="
      height:9px;
      border-radius:20px;
      overflow:hidden;
      background:#293b35;
      margin-bottom:20px;
    ">
      <div style="
        height:100%;
        width:${Math.round(
          unlocked / achievements.length * 100
        )}%;
        background:#a9dfb7;
      "></div>
    </div>

    <div style="
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:10px;
    ">
      ${achievements.map(a => {
        const complete = a.current >= a.target;
        
        return `
          <div style="
            border:${complete ? "2px" : "1px"} solid ${
  complete ? "#a9dfb7" : "#52685e"
};
background:${
  complete
    ? "rgba(110,165,141,.15)"
    : "rgba(255,255,255,.015)"
};
            border-radius:12px;
            padding:13px;
            opacity:${complete ? "1" : ".65"};
            min-width:0;
          ">
            <div style="font-size:25px">
              ${a.icon}
            </div>

            <strong style="font-size:12px">
              ${a.name}
            </strong>

            <div style="
              font-size:12px;
              margin:7px 0;
            ">
              ${a.desc}
            </div>

            <div style="font-size:12px">
              ${complete
  ? `<strong style="color:#a9dfb7">OPEN</strong>`
  : `<span style="opacity:.65">
       LOCK · ${Math.min(a.current, a.target)} / ${a.target}
     </span>`
}
            </div>          
          </div>
        `;
      }).join("")}
    </div>

    <div style="
      border:1px solid #52685e;
      border-radius:10px;
      padding:13px;
      margin-top:16px;
      line-height:1.9;
    ">
      <strong>PERSONAL BEST</strong>

      <div>최고 점수: ${bestScore}점</div>
      <div>최고 콤보: ${bestCombo}회</div>
      <div>누적 적중률: ${hitRate}%</div>
      <div>누적 오반응률: ${falseAlarmRate}%</div>
    </div>

    <p style="
      font-size:12px;
      opacity:.65;
      margin-top:13px;
    ">
      성취 배지는 검사 결과를 바탕으로 자동 계산됩니다.
      별도 EXP는 지급되지 않습니다.
    </p>
  `;

  host.appendChild(panel);
}

  
/* =========================================
   SENSE LAB 3.1
   SIGNAL DETECTION BALANCE
   Read-only analysis
========================================= */

function senseLab31DetectionBalance(rows) {

  const host = $("senseGrowthContent");
  if (!host) return;

  $("senseLab31Balance")?.remove();

  // 최신 검사 최대 10회
  const recent = (rows || []).slice(0, 10);

  if (!recent.length) return;

  const sum = key => recent.reduce(
    (total, row) => total + Number(row[key] || 0),
    0
  );

  const hits = sum("hits");
  const misses = sum("misses");
  const falseAlarms = sum("false_alarms");
  const correctRejections = sum("correct_rejections");

  const targets = hits + misses;
  const nonTargets = falseAlarms + correctRejections;

  const hitRate = targets > 0
    ? hits / targets * 100
    : null;

  const falseAlarmRate = nonTargets > 0
    ? falseAlarms / nonTargets * 100
    : null;

  const correctRejectionRate = nonTargets > 0
    ? correctRejections / nonTargets * 100
    : null;

  const missRate = targets > 0
    ? misses / targets * 100
    : null;

  const format = value =>
    value === null
      ? "측정 불가"
      : value.toFixed(1) + "%";

  const bar = (label, value, color) => `
    <div style="margin:15px 0">

      <div style="
        display:flex;
        justify-content:space-between;
        gap:10px;
        font-size:13px;
      ">
        <span>${label}</span>
        <strong>${format(value)}</strong>
      </div>

      <div style="
        height:9px;
        background:#293b35;
        border-radius:20px;
        overflow:hidden;
        margin-top:7px;
      ">
        <div style="
          width:${value === null ? 0 : Math.max(0,Math.min(100,value))}%;
          height:100%;
          background:${color};
          border-radius:20px;
        "></div>
      </div>

    </div>
  `;

  let type = "DATA REQUIRED";
  let feedback = "추가 검사 기록이 필요합니다.";

  if (hitRate !== null && falseAlarmRate !== null) {

    if (hitRate >= 85 && falseAlarmRate <= 10) {

      type = "BALANCED DETECTION";

      feedback =
        "실제 신호 탐지와 불필요한 반응 억제가 " +
        "함께 안정적으로 나타났습니다. " +
        "동일 조건에서 이 수행을 반복 유지하는 것이 다음 목표입니다.";

    } else if (hitRate >= 80 && falseAlarmRate >= 25) {

      type = "HIGH RESPONSE TENDENCY";

      feedback =
        "신호를 적극적으로 탐지하지만 " +
        "신호가 없는 상황에서도 반응하는 경향이 있습니다. " +
        "다음 검사에서는 무반응 판단의 정확도를 높여 보세요.";

    } else if (hitRate < 60 && falseAlarmRate <= 10) {

      type = "CAUTIOUS RESPONSE";

      feedback =
        "불필요한 반응은 적지만 실제 신호를 놓치는 비율이 높습니다. " +
        "반응을 억제하는 것뿐 아니라 목표 신호를 정확히 포착하는 " +
        "훈련도 필요합니다.";

    } else if (hitRate < 60 && falseAlarmRate >= 25) {

      type = "UNSTABLE DETECTION";

      feedback =
        "신호 누락과 오반응이 함께 나타납니다. " +
        "검사 환경을 일정하게 유지하고 " +
        "VISUAL 1부터 수행을 안정화하는 것이 좋습니다.";

    } else {

      type = "DEVELOPING BALANCE";

      feedback =
        "신호 탐지와 반응 억제 사이의 균형을 형성하는 단계입니다. " +
        "점수뿐 아니라 적중률과 오반응률의 변화를 함께 관찰하세요.";
    }
  }

  const panel = document.createElement("section");

  panel.id = "senseLab31Balance";

  panel.style.cssText = `
    margin-top:20px;
    padding:16px;
    border:1px solid #52685e;
    border-radius:12px;
    line-height:1.8;
  `;

  panel.innerHTML = `

    <h3>DETECTION BALANCE</h3>

    <p style="font-size:12px;opacity:.7">
      최근 최대 ${recent.length}회 검사 · 신호 탐지 균형
    </p>

    <div style="
      padding:14px;
      border:1px solid #6ea58d;
      border-radius:10px;
      margin:15px 0;
    ">

      <small>DETECTION PATTERN</small>

      <div style="
        font-size:19px;
        font-weight:bold;
        color:#a9dfb7;
        margin-top:7px;
      ">
        ${type}
      </div>

    </div>

    ${bar("목표 적중률 · HIT",hitRate,"#a9dfb7")}

    ${bar("신호 누락률 · MISS",missRate,"#d5a17d")}

    ${bar("오반응률 · FALSE ALARM",falseAlarmRate,"#e09b8d")}

    ${bar("정확한 무반응률 · CORRECT REJECTION",
      correctRejectionRate,"#8eb9d8")}

    <div style="
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:10px;
      margin:20px 0;
      font-size:13px;
    ">

      <div>정확한 감지: <strong>${hits}</strong></div>
      <div>신호 누락: <strong>${misses}</strong></div>
      <div>잘못된 반응: <strong>${falseAlarms}</strong></div>
      <div>정확한 무반응: <strong>${correctRejections}</strong></div>

    </div>

    <div style="
      border-top:1px solid #52685e;
      padding-top:15px;
    ">

      <strong>NEXT TRAINING GUIDE</strong>

      <p style="font-size:13px">
        ${feedback}
      </p>

    </div>

    <p style="
      font-size:11px;
      opacity:.6;
      margin-top:15px;
    ">
      이 분석은 저장된 검사 기록의 관찰 가능한 수행 패턴을
      설명합니다. 개인의 초감각적 능력이나 영적 상태를
      판정하는 결과는 아닙니다.
    </p>

  `;

  host.appendChild(panel);
}

  
/* =========================================
   SENSE LAB 3.2
   GROWTH STABILITY ANALYSIS
   Read-only / per mode
========================================= */

function senseLab32GrowthStability(rows) {

  const host = $("senseGrowthContent");
  if (!host) return;

  $("senseLab32Growth")?.remove();

  // 서버 조회 결과는 최신순이다.
  const valid = (rows || []).filter(r =>
    r &&
    r.score !== null &&
    Number.isFinite(Number(r.score))
  );

  const current = valid.slice(0, 3);
  const previous = valid.slice(3, 6);

  const panel = document.createElement("section");

  panel.id = "senseLab32Growth";

  panel.style.cssText = `
    margin-top:20px;
    padding:18px;
    border:1px solid #52685e;
    border-radius:12px;
    line-height:1.8;
  `;

  if (current.length < 3 || previous.length < 3) {

    panel.innerHTML = `
      <h3>GROWTH STABILITY</h3>

      <p class="muted">
        동일 과정의 검사 기록이 최소 6회 필요합니다.
      </p>

      <p>
        현재 ${valid.length}회 /
        필요 6회
      </p>

      <p class="muted">
        충분한 기록이 축적되기 전에는
        성장 여부를 판정하지 않습니다.
      </p>
    `;

    host.appendChild(panel);
    return;
  }

  const sum = (list, key) =>
    list.reduce(
      (s, r) => s + Number(r[key] || 0),
      0
    );

  const avg = (list, key) => {

    const values = list
      .map(r => r[key])
      .filter(v =>
        v !== null &&
        v !== undefined &&
        v !== "" &&
        Number.isFinite(Number(v))
      )
      .map(Number);

    return values.length
      ? values.reduce((a,b)=>a+b,0)/values.length
      : null;
  };

  const getMetrics = list => {

    const hits = sum(list, "hits");
    const misses = sum(list, "misses");
    const fa = sum(list, "false_alarms");
    const cr = sum(list, "correct_rejections");

    return {

      score: avg(list, "score"),

      hitRate: hits + misses
        ? hits / (hits + misses) * 100
        : null,

      falseRate: fa + cr
        ? fa / (fa + cr) * 100
        : null,

      reaction: avg(
        list,
        "average_reaction_ms"
      )
    };
  };

  const a = getMetrics(previous);
  const b = getMetrics(current);

  const format = (v, unit) =>
    v === null
      ? "측정 불가"
      : v.toFixed(1) + unit;

  const compare = (
    label,
    key,
    unit,
    lowerBetter,
    tolerance
  ) => {

    const oldValue = a[key];
    const newValue = b[key];

    if (oldValue === null || newValue === null) {

      return `
        <tr>
          <td>${label}</td>
          <td colspan="3">측정 기록 부족</td>
        </tr>
      `;
    }

    const delta = newValue - oldValue;

    let status = "유지";

    if (Math.abs(delta) > tolerance) {

      const improved = lowerBetter
        ? delta < 0
        : delta > 0;

      status = improved ? "개선" : "하락";
    }

    return `
      <tr>
        <td>${label}</td>
        <td>${format(oldValue,unit)}</td>
        <td>${format(newValue,unit)}</td>
        <td>
          ${delta > 0 ? "+" : ""}
          ${delta.toFixed(1)}${unit}
          · ${status}
        </td>
      </tr>
    `;
  };

  /* 종합 판정 */

  const scoreDelta =
    a.score !== null && b.score !== null
      ? b.score - a.score
      : null;

  const hitDelta =
    a.hitRate !== null && b.hitRate !== null
      ? b.hitRate - a.hitRate
      : null;

  const falseDelta =
    a.falseRate !== null && b.falseRate !== null
      ? b.falseRate - a.falseRate
      : null;

  const rtDelta =
    a.reaction !== null && b.reaction !== null
      ? b.reaction - a.reaction
      : null;

  let improved = 0;
  let declined = 0;

  const evaluate = (delta, tolerance, lowerBetter) => {

    if (delta === null) return;

    if (Math.abs(delta) <= tolerance) return;

    const good = lowerBetter
      ? delta < 0
      : delta > 0;

    if (good) improved++;
    else declined++;
  };

  evaluate(scoreDelta, 3, false);
  evaluate(hitDelta, 3, false);
  evaluate(falseDelta, 3, true);
  evaluate(rtDelta, 20, true);

  let status = "STABLE";
  let feedback =
    "최근 수행은 이전 구간과 큰 차이가 없습니다. " +
    "동일 조건에서 반복 측정을 유지하세요.";

  if (improved >= 2 && declined === 0) {

    status = "IMPROVING";

    feedback =
      "복수의 측정 항목에서 개선이 나타났습니다. " +
      "현재 검사 조건을 유지하면서 변화가 지속되는지 확인하세요.";

  } else if (declined >= 2 && improved === 0) {

    status = "DECLINING";

    feedback =
      "복수의 측정 항목에서 수행 저하가 나타났습니다. " +
      "피로도, 집중 상태, 검사 환경을 확인하고 재측정하세요.";

  } else if (improved > 0 && declined > 0) {

    status = "MIXED CHANGE";

    feedback =
      "일부 항목은 개선되었지만 다른 항목은 하락했습니다. " +
      "반응속도를 높이는 과정에서 오반응이 증가했는지, " +
      "신중한 판단으로 반응시간이 길어졌는지 확인하세요.";
  }

  panel.innerHTML = `

    <h3>GROWTH STABILITY</h3>

    <p class="muted">
      최근 3회와 직전 3회 비교
    </p>

    <div style="
      padding:15px;
      border:1px solid #6ea58d;
      border-radius:10px;
      margin:15px 0;
    ">

      <small>CURRENT GROWTH STATUS</small>

      <div style="
        font-size:20px;
        font-weight:bold;
        color:#a9dfb7;
      ">
        ${status}
      </div>

    </div>

    <div style="overflow-x:auto">

      <table style="
        width:100%;
        border-collapse:collapse;
        text-align:left;
        font-size:12px;
        min-width:440px;
      ">

        <thead>
          <tr>
            <th>측정 항목</th>
            <th>직전 3회</th>
            <th>최근 3회</th>
            <th>변화</th>
          </tr>
        </thead>

        <tbody>

          ${compare(
            "수행점수",
            "score",
            "점",
            false,
            3
          )}

          ${compare(
            "목표 적중률",
            "hitRate",
            "%",
            false,
            3
          )}

          ${compare(
            "오반응률",
            "falseRate",
            "%",
            true,
            3
          )}

          ${compare(
            "평균 반응시간",
            "reaction",
            "ms",
            true,
            20
          )}

        </tbody>

      </table>

    </div>

    <div style="
      margin-top:20px;
      border-top:1px solid #52685e;
      padding-top:15px;
    ">

      <strong>GROWTH INTERPRETATION</strong>

      <p style="font-size:13px">
        ${feedback}
      </p>

    </div>

    <p style="
      font-size:11px;
      opacity:.6;
      margin-top:15px;
    ">
      변화 판정은 최근 검사 기록의 비교 결과입니다.
      장기적인 능력 향상을 확정하는 판정은 아닙니다.
    </p>
  `;

  host.appendChild(panel);
}

  
async function senseLabDashboardRender(mode) {
  const content = $("senseGrowthContent");

  if (!content || !state.user?.id) return;

  content.textContent = "기록을 분석하고 있습니다...";

  try {
    const { data, error } = await client
      .from("sense_lab_results")
      .select(
        "score,hits,misses,false_alarms,correct_rejections,average_reaction_ms,exp_delta,result,completed_at"
      )
      .eq("user_id", state.user.id)
      .eq("mode", mode)
      .order("completed_at", { ascending: false })
      .limit(1000);

    if (error) throw error;

    const rows = data || [];

    if (!rows.length) {
      content.textContent =
        "아직 저장된 검사 기록이 없습니다.";
      return;
    }

    const sum = key => rows.reduce(
      (total, row) => total + Number(row[key] || 0),
      0
    );

    const avg = key =>
      (sum(key) / rows.length).toFixed(1);

    const targets = sum("hits") + sum("misses");
    const nonTargets =
      sum("false_alarms") + sum("correct_rejections");

    const hitRate = targets
      ? (sum("hits") / targets * 100).toFixed(1)
      : "0.0";

    const faRate = nonTargets
      ? (sum("false_alarms") / nonTargets * 100).toFixed(1)
      : "0.0";

    const recent = rows.slice(0, 5);
    const previous = rows.slice(5, 10);

    const scoreAverage = list =>
      list.length
        ? list.reduce(
            (sum, row) => sum + Number(row.score || 0),
            0
          ) / list.length
        : null;

    const recentAvg = scoreAverage(recent);
    const previousAvg = scoreAverage(previous);

    const change =
      previousAvg === null
        ? "비교 기록 축적 중"
        : `${recentAvg >= previousAvg ? "+" : ""}${(
            recentAvg - previousAvg
          ).toFixed(1)}점`;

    const combos = rows
      .map(row => Number(row.result?.best_combo))
      .filter(Number.isFinite);

    const bestCombo = combos.length
      ? Math.max(...combos)
      : null;

    const metrics = [
      ["누적 검사", `${rows.length}회`],
      ["평균 점수", `${avg("score")}점`],
      ["최고 점수", `${Math.max(...rows.map(x => Number(x.score)))}점`],
      ["평균 오반응", `${avg("false_alarms")}회`],
      ["누적 적중률", `${hitRate}%`],
      ["누적 오반응률", `${faRate}%`],
      ["최근 5회 평균", `${recentAvg.toFixed(1)}점`],
      ["이전 5회 대비", change],
      ["최고 콤보", bestCombo === null ? "기록 없음" : `${bestCombo}`],
      ["누적 획득 EXP", `+${sum("exp_delta")}`]
    ];

    content.innerHTML = `
      <div style="
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:10px;
        margin:15px 0;
      ">
        ${metrics.map(([label, value]) => `
          <div style="
            border:1px solid rgba(110,165,141,.45);
            border-radius:10px;
            padding:12px;
            min-width:0;
          ">
            <div style="font-size:12px;opacity:.7">
              ${label}
            </div>
            <strong style="font-size:19px">
              ${value}
            </strong>
          </div>
        `).join("")}
      </div>

      <p class="muted" style="font-size:12px">
        동일 검사 종류의 최근 최대 1,000건 기준입니다.
        이전 5회 비교는 기록 6회 이상부터 표시합니다.
        기기 및 화면 밝기에 따라 검사 조건이 달라질 수 있습니다.
      </p>
    `;

     senseLab22Achievements(rows, mode);
    senseLab23Performance(rows, mode);

    // SENSE LAB 3.1
    senseLab31DetectionBalance(rows);

    // SENSE LAB 3.2
    senseLab32GrowthStability(rows);
senseLabMakeCollapsible(
  "senseLab22Achievements",
  "ACHIEVEMENTS · 성취 기록",
  false
);

senseLabMakeCollapsible(
  "senseLab23Performance",
  "PERFORMANCE ANALYSIS · 수행 분석",
  false
);

  } catch (error) {
    console.error("SENSE DASHBOARD:", error);

    content.textContent =
      "성장 분석 오류: " +
      (error.message || "알 수 없는 오류");
  }
}

function senseLabV1Open() {
  if (!state.user?.id) {
    alert("로그인 후 이용할 수 있습니다.");
    return;
  }

  if (focusTimerInterval || senseTimerInterval) {
    alert("진행 중인 훈련을 먼저 종료하세요.");
    return;
  }

  if (senseLabV1Saving) return;

  senseLabV1 = null;

  $("senseLabV1Panel").style.display = "block";
  $("senseLabV1Setup").style.display = "block";
  $("senseLabV1Running").style.display = "none";
  $("senseLabV1Result").style.display = "none";
  $("senseLabV1Message").textContent = "";
$("senseLabV1Back").textContent = "검증실 닫기";
  
  const guide = $("senseLabV1Guide");
  if (guide) guide.open = false;

 senseLabLoadGrowth().then(() => {
  senseLab21RenderProgress();
});

senseLabDashboardLoad();
  
}

function senseLabV1Close() {
  if (senseLabV1Saving) {
    alert("검사 결과를 저장하고 있습니다.");
    return;
  }

  const setup = $("senseLabV1Setup");
  const running = $("senseLabV1Running");
  const result = $("senseLabV1Result");
  const back = $("senseLabV1Back");

  // 검사 중이라면 검사를 중단하고 선택 화면으로 복귀
  if (running?.style.display !== "none") {
    if (!confirm(
      "진행 중인 검사를 중단하고 이전 화면으로 돌아가시겠습니까?\n" +
      "미완료 검사는 저장되지 않으며 EXP도 지급되지 않습니다."
    )) return;

    senseLabV1ClearTimers();
    senseLab3ClearStimulus();
    senseLabV1 = null;

    running.style.display = "none";
    result.style.display = "none";
    setup.style.display = "block";

    $("senseLabV1Message").textContent = "";
    back.textContent = "검증실 닫기";

    senseLabRenderModes();
    senseLabDashboardLoad();
    return;
  }

  // 결과 화면이라면 검사 선택 화면으로 복귀
  if (result?.style.display !== "none") {
    senseLabV1 = null;

    result.style.display = "none";
    running.style.display = "none";
    setup.style.display = "block";

    $("senseLabV1Message").textContent = "";
    back.textContent = "검증실 닫기";

    senseLabRenderModes();
    senseLabDashboardLoad();
    return;
  }

  // 검사 선택 화면에서만 검증실 전체를 닫음
  senseLabV1ClearTimers();
  senseLabV1 = null;

  $("senseLabV1Panel").style.display = "none";
}


/* =========================================
   SENSE LAB 2.2
   PERSONAL RESULT FEEDBACK
========================================= */

function senseLab22ResultFeedback(data) {
  const score = Number(data.score || 0);
  const hits = Number(data.hits || 0);
  const misses = Number(data.misses || 0);
  const fa = Number(data.false_alarms || 0);
  const cr = Number(data.correct_rejections || 0);
  const combo = Number(data.best_combo || 0);

  const hitRate = hits + misses
    ? hits / (hits + misses) * 100
    : 0;

  const faRate = fa + cr
    ? fa / (fa + cr) * 100
    : 0;

  let title = "";
  let message = "";

  if (score >= 90 && fa === 0) {
    title = "EXCELLENT CONTROL";
    message =
      "신호 탐지와 무반응 판단이 모두 안정적입니다. " +
      "현재 검사 조건에서 높은 수행 수준을 보였습니다.";

  } else if (faRate >= 30) {
    title = "RESPONSE CONTROL";
    message =
      "신호가 없을 때 버튼을 누르는 비율이 높습니다. " +
      "다음 검사에서는 반응을 서두르지 않고 " +
      "신호를 확인한 뒤 누르는 데 집중하세요.";

  } else if (hitRate < 60) {
    title = "SIGNAL DETECTION";
    message =
      "실제 신호를 놓치는 비율이 높습니다. " +
      "다음 검사에서는 화면 중앙에 시선을 유지하고 " +
      "자극 출현에 집중해 보세요.";

  } else if (combo < 5) {
    title = "CONSISTENCY TRAINING";
    message =
      "연속 정답 유지가 다음 훈련 목표입니다. " +
      "반응 리듬을 일정하게 유지하는 연습을 권장합니다.";

  } else {
    title = "BALANCED PERFORMANCE";
    message =
      "현재 탐지 수행은 비교적 균형을 이루고 있습니다. " +
      "다음 검사에서는 오반응을 줄이면서 " +
      "최고 콤보 기록을 갱신해 보세요.";
  }

  return `
    <div style="
      margin-top:22px;
      padding:16px;
      border:1px solid #6ea58d;
      border-radius:12px;
      text-align:left;
      line-height:1.8;
    ">
      <strong>PERSONAL FEEDBACK</strong>

      <div style="
        font-weight:bold;
        color:#a9dfb7;
        margin:8px 0;
      ">
        ${title}
      </div>

      <p style="font-size:14px">
        ${message}
      </p>

      <div style="font-size:12px;opacity:.7">
        적중률 ${hitRate.toFixed(1)}%
        · 오반응률 ${faRate.toFixed(1)}%
      </div>
    </div>
  `;
}

  
function senseLabV1UpdateCombo() {
  const s = senseLabV1;
  if (!s) return;

  $("senseLabV1Combo").textContent = s.combo;
  $("senseLabV1BestCombo").textContent = s.bestCombo;
}

function senseLabV1Start() {
  if (senseLabV1Saving || senseLabV1) return;

  const mode = SENSE_LAB_MODES[senseLabSelectedMode];

  if (!mode) return;

  if (Number(senseLabProfile?.level || 1) < mode.level) {
    alert(`SENSE LV.${mode.level}부터 이용할 수 있습니다.`);
    return;
  }

 
  senseLabV1ClearTimers();

  const s = {
    modeKey: senseLabSelectedMode,
    mode,
    sequence: senseLabSelectedMode === "visual3"
  ? senseLab3BuildSequence()
  : senseLabV15BuildSequence(),
    index: 0,
    trials: [],
    phase: "ready",
    responded: false,
    startedAt: 0,
    reactionMs: null,
    earlyResponses: 0,
    earlyPending: 0,
    combo: 0,
    bestCombo: 0
  };

 senseLabV1 = s;
senseLabV1UpdateCombo();

const responseGuide = $("senseLabResponseGuide");

if (responseGuide) {
  responseGuide.textContent =
    s.modeKey === "visual3"
      ? "중앙의 연두색 목표 신호에만 반응하세요. 주변 도형은 방해 자극입니다."
      : "빛이 나타났을 때만 누르세요.";
}

  $("senseLabRunningTitle").textContent =
    `${mode.name} · ${mode.subtitle}`;

  const stimulus = $("senseLabV1Stimulus");

  stimulus.style.width = `${mode.size}px`;
  stimulus.style.height = `${mode.size}px`;
  stimulus.style.opacity = mode.opacity;
  stimulus.style.boxShadow =
  s.modeKey === "visual1"
    ? "0 0 25px #c9ffad"
    : "0 0 9px rgba(201,255,173,.3)";

$("senseLabV1Respond").textContent =
  s.modeKey === "visual3" ? "목표 감지!" : "감지!";

  $("senseLabV1Setup").style.display = "none";
  $("senseLabV1Result").style.display = "none";
  $("senseLabV1Running").style.display = "block";
  $("senseLabV1Back").textContent = "검사 중단 · 이전으로";

  stimulus.style.display = "none";

  $("senseLabV1Fixation").style.display = "block";
  $("senseLabV1Progress").textContent = "검사 준비";

  let countdown = 3;

  function tick() {
    if (senseLabV1 !== s || s.phase !== "ready") return;

    $("senseLabV1Fixation").textContent = countdown;
    $("senseLabV1Message").textContent =
      `검사 시작까지 ${countdown}초`;

    countdown--;

    if (countdown >= 0) {
      senseLabV1Later(tick, 1000);
    } else {
      $("senseLabV1Fixation").textContent = "START";

      senseLabV1Later(() => {
        if (senseLabV1 === s && s.phase === "ready") {
          senseLabV1Next();
        }
      }, 250);
    }
  }

  tick();
}

function senseLabV1Next() {
  const s = senseLabV1;
  if (!s) return;

senseLab3ClearStimulus();
  
  if (s.index >= 20) {
    senseLabV1Finish();
    return;
  }

  s.phase = "waiting";
  s.responded = false;
  s.reactionMs = null;

  $("senseLabV1Stimulus").style.display = "none";
  $("senseLabV1Fixation").style.display = "block";
  $("senseLabV1Fixation").textContent = "+";

  $("senseLabV1Progress").textContent =
    `${s.index + 1} / 20`;

  $("senseLabV1Message").textContent =
    "중앙을 주시하세요.";

  const gap =
    s.mode.gapMin +
    Math.floor(
      Math.random() *
      (s.mode.gapMax - s.mode.gapMin + 1)
    );

  senseLabV1Later(() => {
    if (senseLabV1 !== s || s.phase !== "waiting") return;

const currentTrial = s.sequence[s.index];

const present = s.modeKey === "visual3"
  ? currentTrial.stimulus_present
  : currentTrial;

const distractorPresent = s.modeKey === "visual3"
  ? currentTrial.distractor_present
  : false;

    s.phase = "active";
    s.startedAt = performance.now();

    $("senseLabV1Fixation").style.display = "none";

   senseLab3RenderStimulus(
  {
    stimulus_present: present,
    distractor_present: distractorPresent
  },
  s.modeKey
);

   senseLabV1Later(() => {
  if (senseLabV1 !== s || s.phase !== "active") return;

  senseLab3ClearStimulus();
}, s.mode.exposure);

    senseLabV1Later(() => {
      if (senseLabV1 !== s || s.phase !== "active") return;

      s.phase = "finalizing";

      const correct = present === s.responded;

      if (correct) {
        s.combo++;
        s.bestCombo = Math.max(s.bestCombo, s.combo);
      } else {
        s.combo = 0;
      }

      senseLabV1UpdateCombo();

    s.trials.push({
  index: s.index + 1,
  stimulus_present: present,
  distractor_present: distractorPresent,
  responded: s.responded,
  reaction_ms: s.reactionMs,
  early_before: s.earlyPending
});

      s.earlyPending = 0;
      s.index++;

      if (s.index >= 20) {
        senseLabV1Finish();
      } else {
        senseLabV1Later(() => {
          if (senseLabV1 === s && s.phase === "finalizing") {
            senseLabV1Next();
          }
        }, 180);
      }
    }, s.mode.active);

  }, gap);
}

function senseLabV1Respond() {
  const s = senseLabV1;
  if (!s) return;

  if (s.phase === "ready") return;

  if (s.phase === "waiting") {
    s.phase = "early";

    s.earlyResponses++;
    s.earlyPending++;
    s.combo = 0;

    senseLabV1UpdateCombo();
    senseLabV1ClearTimers();
    senseLab3ClearStimulus();

    $("senseLabV1Stimulus").style.display = "none";
    $("senseLabV1Fixation").style.display = "block";
    $("senseLabV1Fixation").textContent = "!";

    $("senseLabV1Message").textContent =
      `조기 반응 ${s.earlyResponses}회 · 같은 문항 재출제`;

    senseLabV1Later(() => {
      if (senseLabV1 === s && s.phase === "early") {
        senseLabV1Next();
      }
    }, 650);

    return;
  }

  if (s.phase !== "active" || s.responded) return;

  const elapsed = Math.round(
    performance.now() - s.startedAt
  );

  if (elapsed < 100 || elapsed > 1500) return;

  s.responded = true;
  s.reactionMs = elapsed;

  $("senseLabV1Message").textContent = "반응 기록됨";
}

async function senseLabV1Finish() {
  const s = senseLabV1;

  if (!s || senseLabV1Saving) return;

  senseLabV1ClearTimers();

  s.phase = "finished";
  senseLabV1Saving = true;

  $("senseLabV1Running").style.display = "none";
  $("senseLabV1Result").style.display = "block";
  $("senseLabV1Back").textContent = "검사 선택으로 돌아가기";

  $("senseLabV1ResultText").textContent =
    "서버에서 결과를 계산하고 있습니다...";

  try {
    const { data, error } = await client.rpc(
      s.mode.rpc,
      { p_trials: s.trials }
    );

    if (error) throw error;

    if (!data?.success) {
      throw new Error("검사 결과 저장에 실패했습니다.");
    }

    const score = Number(data.score);
    const combo = Number(data.best_combo);

    const grade =
      combo === 20 && Number(data.early_responses) === 0
        ? "PERFECT COMBO"
        : combo >= 15
          ? "EXCELLENT COMBO"
          : combo >= 10
            ? "GOOD COMBO"
            : "TRAINING COMPLETE";

    $("senseLabV1ResultText").innerHTML = `
      <div style="font-size:14px;opacity:.75">
        ${s.mode.name}
      </div>

      <div style="font-size:36px;font-weight:bold">
        ${score}점
      </div>

      <div style="
        color:#a9dfb7;
        font-weight:bold;
        margin:10px 0;
      ">
        ${grade}
      </div>

      <div>적중: ${Number(data.hits)}</div>
      <div>놓침: ${Number(data.misses)}</div>
      <div>오반응: ${Number(data.false_alarms)}</div>
      <div>정확한 무반응: ${Number(data.correct_rejections)}</div>
      <div>조기 반응: ${Number(data.early_responses)}회</div>

      <div>
        최고 콤보:
        ${combo} / 20
      </div>

      <div>
        평균 반응시간:
        ${data.average_reaction_ms ?? "-"}ms
      </div>

      <hr>

      <div>기본 보상: +${Number(data.base_exp)} EXP</div>
      <div>콤보 보너스: +${Number(data.combo_bonus)} EXP</div>

      <div style="
        font-size:23px;
        font-weight:bold;
        color:#a9dfb7;
        margin:12px 0;
      ">
        TOTAL EXP +${Number(data.exp_delta)}
      </div>

      <div>
        SENSE LV.${Number(data.old_level)}
        →
        LV.${Number(data.new_level)}
      </div>

      ${Number(data.exp_delta) === 0
        ? `<p style="font-size:13px;opacity:.75">
            일일 EXP 지급 제한에 도달했거나
            최고 레벨입니다. 검사 기록은 저장됩니다.
          </p>`
        : ""}
    `;

    $("senseLabV1ResultText").insertAdjacentHTML(
  "beforeend",
  senseLab22ResultFeedback(data)
);

    $("senseLabV1Message").textContent =
      "검사 결과 저장 완료";

    await senseLabLoadGrowth();
    await senseLabDashboardLoad();

  } catch (error) {
    console.error("SENSE LAB:", error);

    $("senseLabV1ResultText").textContent =
      "검사 결과를 저장하지 못했습니다.";

    $("senseLabV1Message").textContent =
      error.message || "알 수 없는 오류";

  } finally {
    senseLabV1Saving = false;
  }
}

document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "hidden" &&
    senseLabV1 &&
    senseLabV1.phase !== "finished" &&
    !senseLabV1Saving
  ) {
    senseLabV1ClearTimers();
    senseLab3ClearStimulus();
    senseLabV1 = null;

    const panel = $("senseLabV1Panel");

    if (panel) panel.style.display = "none";
  }
});

/* =========================================
   END SENSE LAB 2.0
========================================= */


  
  loadProfile();
})();
