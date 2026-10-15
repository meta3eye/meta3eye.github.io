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
        .map(x => Number(x.score))
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
      <span class="muted">독립 성장 LV1~100</span>
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
#focusLabStimulus{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-family:'Segoe UI Symbol','Noto Sans Symbols 2',sans-serif;font-size:clamp(110px,19vmin,205px);line-height:1;color:#fff;pointer-events:none;min-width:220px;min-height:220px;display:flex;align-items:center;justify-content:center}
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
  #focusLabStimulus{min-width:150px;min-height:150px}
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
    <h2>화면 중앙을 응시하세요</h2>
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

  s.index++;
  labUpdateHud();
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

  $('focusLabStimulus').textContent=
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
      show(
        "focusTrainingPanel",
        false
      );

      show("gamePanel", true);

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

  show("gamePanel", false);

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

    show("gamePanel", false);
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
      show(
        "senseTrainingPanel",
        false
      );

      show("gamePanel", true);

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

  function openRemoteViewing() {
    const gamePanel =
      rvElement("gamePanel");

    const panel =
      rvElement(
        "remoteViewingTrainingPanel"
      );

    if (!gamePanel || !panel) {
      return;
    }

    gamePanel.classList.add(
      "hidden"
    );

    panel.classList.remove(
      "hidden"
    );

    currentRvSessionId = null;
    currentRvTargetCode = null;

    resetRvFields();

    setRvMessage(
      "rvMessage",
      ""
    );

    setRvMessage(
      "rvObservationMessage",
      ""
    );

    showRvStep("rvSetup");
  }

  async function startRemoteViewingSession() {
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

    currentRvSessionId =
      session.session_id;

    currentRvTargetCode =
      session.target_code;

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

    if (button) {
      button.disabled = true;
    }

    setRvMessage(
      "rvObservationMessage",
      "기록을 저장하고 타겟을 공개하고 있습니다..."
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

    if (error) {
      if (button) {
        button.disabled = false;
      }

      console.error(
        "submit_rv_session failed",
        error
      );

      setRvMessage(
        "rvObservationMessage",
        "제출 실패: " +
          error.message
      );

      return;
    }

    const result =
      Array.isArray(data)
        ? data[0]
        : data;

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

    const {
      data: signed,
      error: signedError
    } = await client.storage
      .from("rv-images")
      .createSignedUrl(
        result.storage_path,
        600
      );

    if (
      signedError ||
      !signed?.signedUrl
    ) {
      if (button) {
        button.disabled = false;
      }

      console.error(
        "Signed URL creation failed",
        signedError
      );

      setRvMessage(
        "rvObservationMessage",
        "타겟은 공개되었지만 이미지를 불러오지 못했습니다. 다시 시도하세요."
      );

      return;
    }

    if (
      rvElement(
        "rvRevealedTargetCode"
      )
    ) {
      rvElement(
        "rvRevealedTargetCode"
      ).textContent =
        result.target_code ||
        currentRvTargetCode;
    }

    if (
      rvElement(
        "rvTargetTitle"
      )
    ) {
      rvElement(
        "rvTargetTitle"
      ).textContent =
        result.source_title ||
        "REMOTE VIEWING TARGET";
    }

    const image =
      rvElement(
        "rvTargetImage"
      );

    if (image) {
      image.onerror = () =>
        setRvMessage(
          "rvObservationMessage",
          "이미지를 불러오지 못했습니다. 잠시 후 다시 시도하세요."
        );

      image.src =
        signed.signedUrl;
    }

    const resultFields = {
      Form: "form_description",
      Color: "color_description",
      Texture: "texture_description",
      Temperature:
        "temperature_description",
      Movement:
        "movement_description",
      Environment:
        "environment_description",
      Free: "free_description"
    };

    Object.entries(
      resultFields
    ).forEach(
      ([name, key]) => {
        const element =
          rvElement(
            "rvResult" + name
          );

        if (element) {
          element.textContent =
            observation[
              "p_" + key
            ] || "—";
        }
      }
    );

    if (button) {
      button.disabled = false;
    }

    currentRvSessionId = null;

    showRvStep("rvReveal");
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
    currentRvSessionId = null;
    currentRvTargetCode = null;

    show(
      "remoteViewingTrainingPanel",
      false
    );

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

    show(
      "focusTrainingPanel",
      false
    );

    show("gamePanel", true);
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
        clearInterval(
          senseTimerInterval
        );

        senseTimerInterval = null;
      }

      show(
        "senseTrainingPanel",
        false
      );

      show("gamePanel", true);
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
    cancelRemoteViewing
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
      <span class="muted">LV.1~100</span>
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

      <h2>SENSE LAB 2.0</h2>

      <p class="muted">
        VISUAL DETECTION TRAINING
      </p>

      <div id="senseLabV1Setup"
        style="text-align:left;line-height:1.8">

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
          빛이 나타났을 때만 누르세요.
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
          : "VISUAL 2 해금 완료"}
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
  const host = $("senseLabGrowthInfo");

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

  senseLabLoadGrowth();
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
    sequence: senseLabV15BuildSequence(),
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

  $("senseLabRunningTitle").textContent =
    `${mode.name} · ${mode.subtitle}`;

  const stimulus = $("senseLabV1Stimulus");

  stimulus.style.width = `${mode.size}px`;
  stimulus.style.height = `${mode.size}px`;
  stimulus.style.opacity = mode.opacity;
  stimulus.style.boxShadow =
    s.modeKey === "visual2"
      ? "0 0 9px rgba(201,255,173,.3)"
      : "0 0 25px #c9ffad";

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

    const present = s.sequence[s.index];

    s.phase = "active";
    s.startedAt = performance.now();

    $("senseLabV1Fixation").style.display = "none";

    if (present) {
      $("senseLabV1Stimulus").style.display = "block";
    }

    senseLabV1Later(() => {
      if (senseLabV1 !== s || s.phase !== "active") return;

      $("senseLabV1Stimulus").style.display = "none";
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
