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

  const TRAINING_ABILITY_MAP = {

    focus_5: {
      focus: 1.0,
      control: 0.25
    },

    sense_observation: {
      perception: 1.0,
      focus: 0.25
    },

    intuition_choice: {
      intuition: 1.0
    },

    emotion_guess: {
      interpretation: 0.65,
      intuition: 0.35
    },

    life_death: {
      perception: 0.50,
      intuition: 0.50
    }
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

    ABILITY_KEYS.forEach(key => {

      result[key] = {
        count: 0,
        lastDate: null,
        recentCount: 0
      };

    });

    const now =
      Date.now();

    for (const log of logs || []) {

      const map =
        TRAINING_ABILITY_MAP[
          log.quest_code
        ];

      if (!map) continue;

      const completedAt =
        log.completed_at ||
        log.created_at ||
        log.timestamp;

      const logTime =
        completedAt
          ? new Date(completedAt).getTime()
          : NaN;

      for (const ability of Object.keys(map)) {

        const weight =
          Number(map[ability]) || 0;

        result[ability].count += weight;

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
          now - logTime <=
            30 * 86400000
        ) {
          result[ability].recentCount +=
            weight;
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
  const abilityLogs = (logs || []).filter((log) => {
    const code = log?.quest_code;
    return V3_TRAINING_MAP[code]?.includes(ability);
  });

  const practice = v3PracticeScore(abilityLogs.length);

 const recency = v3RecencyScore(abilityLogs);

  return {
    ability,
    practice,
   recency: recency.score,
lastTrainingAt: recency.lastTrainingAt,
daysSinceLastTraining: recency.daysSinceLastTraining,
    performance: null,
    consistency: null,
    verification: null,
    calibration: null,
    total: null,
    measured: {
      practice: abilityLogs.length > 0,
      performance: false,
      consistency: false,
      verification: false,
      calibration: false
    },
    trialCount: abilityLogs.length
  };
}

  /*
   * V3 전체 능력 평가
   */


function v3EvaluateAbilities(
  profile,
  logs
) {
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
    evaluate: v3EvaluateProfile,
    calculateAbilityScore:
      v3CalculateAbilityScore,
    practiceScore:
      v3PracticeScore,
    recencyScore:
      v3RecencyScore
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
  const container =
    document.getElementById("v3Evaluation");

  if (!container) return;

  if (!state.user?.id) {
    container.innerHTML = `
      <div class="v3-empty">
        로그인 후 V3 평가 데이터를 확인할 수 있습니다.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="v3-loading">
      훈련 데이터를 분석하고 있습니다...
    </div>
  `;

  try {
    const evaluation =
      await v3LoadEvaluation();

    if (!evaluation) {
      container.innerHTML = `
        <div class="v3-empty">
          V3 평가 데이터를 불러오지 못했습니다.
        </div>
      `;
      return;
    }

    const abilityRows =
      ABILITY_KEYS.map((ability) => {

        const item =
          evaluation.abilities?.[ability];

        if (!item) return "";

        const label =
          ABILITY_LABELS[ability];

        const practiceText =
          item.trialCount > 0
            ? `${item.trialCount}회`
            : "없음";

        const recencyText =
          item.lastTrainingAt
            ? formatV3Date(
                item.lastTrainingAt
              )
            : "없음";

        return `
          <div class="v3-ability">
            <h3>${label}</h3>

            <div class="v3-row">
              <span>훈련량</span>
              <strong>${practiceText}</strong>
            </div>

            <div class="v3-row">
              <span>최근 훈련</span>
              <strong>${recencyText}</strong>
            </div>

            <div class="v3-row">
              <span>수행능력</span>
              <strong>
                ${v3MeasuredText(item.performance)}
              </strong>
            </div>

            <div class="v3-row">
              <span>일관성</span>
              <strong>
                ${v3MeasuredText(item.consistency)}
              </strong>
            </div>

            <div class="v3-row">
              <span>검증</span>
              <strong>
                ${v3MeasuredText(item.verification)}
              </strong>
            </div>

            <div class="v3-row">
              <span>신뢰도 보정</span>
              <strong>
                ${v3MeasuredText(item.calibration)}
              </strong>
            </div>
          </div>
        `;
      }).join("");

    container.innerHTML = `
      <div class="v3-status">
        <strong>현재 평가 상태</strong>
        <span>훈련 데이터 기반</span>
      </div>

      <div class="v3-summary">
        전체 훈련 기록
        <strong>
          ${evaluation.totalTrainingCount}회
        </strong>
      </div>

      <div class="v3-notice">
        현재는 훈련량과 최근성만 측정됩니다.
        객관적 수행능력·일관성·검증 데이터가 충분히
        축적되기 전까지 종합 능력점수는 산출하지 않습니다.
      </div>

      <div class="v3-abilities">
        ${abilityRows}
      </div>
    `;

  } catch (error) {

    console.error(
      "[SPIRIT SYSTEM V3] render error:",
      error
    );

    container.innerHTML = `
      <div class="v3-empty">
        V3 평가 중 오류가 발생했습니다.
      </div>
    `;
  }
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

  loadProfile();
})();
