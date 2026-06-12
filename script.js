const STORAGE_KEY = 'backspin:v1';
const VALID_VIEWS = ['play', 'history', 'setup', 'data'];
const VALID_THEMES = ['light', 'dark'];
const MAX_COURSES = 10;
const SCORE_WHEEL_VALUES = [null, ...Array.from({ length: 20 }, (_, index) => index + 1)];
const PUTTS_WHEEL_VALUES = [null, 0, 1, 2, 3, '4++'];

let state = loadState();
let isRoundConfirmOpen = false;
let activeRegulationHelp = null;
let isPuttsHelpOpen = false;

const REGULATION_HELP = {
  fir: {
    label: 'FIR',
    title: 'Fairway in Regulation',
    description: 'Your tee shot finishes in the fairway.',
  },
  gir: {
    label: 'GIR',
    title: 'Green in Regulation',
    description: 'You reach the green with at least two strokes left for par.',
  },
};

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDefaultCourse(name = 'St. Johns Golf & Country Club') {
  const pars = [4, 5, 3, 4, 3, 4, 4, 5, 4, 4, 4, 5, 3, 4, 4, 5, 3, 4];
  const yardages = [338, 456, 137, 306, 123, 340, 328, 473, 358, 326, 342, 465, 137, 326, 360, 480, 174, 371];
  return {
    id: makeId(),
    name,
    holes: Array.from({ length: 18 }, (_, index) => ({
      number: index + 1,
      par: pars[index],
      yardage: yardages[index],
    })),
  };
}

function createEmptyRound(courseId) {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    courseId,
    startedAt: now,
    updatedAt: now,
    activeHoleIndex: 0,
    scores: Array(18).fill(null),
    putts: Array(18).fill(null),
    fir: Array(18).fill(false),
    gir: Array(18).fill(false),
  };
}

function getDefaultState() {
  const course = createDefaultCourse();
  return {
    activeView: 'play',
    theme: 'light',
    activeCourseId: course.id,
    courses: [course],
    currentRound: createEmptyRound(course.id),
    roundHistory: [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.warn('Backspin recovered from invalid saved data.', error);
    return getDefaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeState(value) {
  const defaults = getDefaultState();
  const next = value && typeof value === 'object' ? value : {};
  const incomingCourses = Array.isArray(next.courses) && next.courses.length ? next.courses : [next.course].filter(Boolean);
  let courses = incomingCourses
    .map((course, index) => normalizeCourse(course, defaults.courses[0], index))
    .filter(Boolean)
    .slice(0, MAX_COURSES);

  if (!courses.length) courses = defaults.courses;

  const activeCourseId = courses.some((course) => course.id === next.activeCourseId)
    ? next.activeCourseId
    : courses[0].id;

  const currentRound = normalizeRound(next.currentRound, createEmptyRound(activeCourseId), activeCourseId);
  if (!courses.some((course) => course.id === currentRound.courseId)) {
    currentRound.courseId = activeCourseId;
  }

  return {
    activeView: VALID_VIEWS.includes(next.activeView) ? next.activeView : defaults.activeView,
    theme: VALID_THEMES.includes(next.theme) ? next.theme : defaults.theme,
    activeCourseId,
    courses,
    currentRound,
    roundHistory: Array.isArray(next.roundHistory)
      ? next.roundHistory.map((round) => normalizeRound(round, null, activeCourseId)).filter(Boolean).slice(0, 20)
      : [],
  };
}

function normalizeCourse(course, fallback, index = 0) {
  const safeCourse = course && typeof course === 'object' ? course : {};
  const holes = Array.isArray(safeCourse.holes) ? safeCourse.holes : [];
  const id = typeof safeCourse.id === 'string' && safeCourse.id ? safeCourse.id : makeId();
  return {
    id,
    name: typeof safeCourse.name === 'string' && safeCourse.name.trim()
      ? safeCourse.name.trim()
      : index === 0 ? fallback.name : `Course ${index + 1}`,
    holes: Array.from({ length: 18 }, (_, holeIndex) => {
      const hole = holes[holeIndex] && typeof holes[holeIndex] === 'object' ? holes[holeIndex] : fallback.holes[holeIndex];
      const par = Number(hole.par);
      const yardage = Number(hole.yardage);
      return {
        number: holeIndex + 1,
        par: [3, 4, 5].includes(par) ? par : fallback.holes[holeIndex].par,
        yardage: Number.isInteger(yardage) && yardage > 0 ? yardage : fallback.holes[holeIndex].yardage,
      };
    }),
  };
}

function normalizeRound(round, fallback, fallbackCourseId) {
  if (!round || typeof round !== 'object') return fallback;
  const fallbackRound = fallback || createEmptyRound(fallbackCourseId);
  const scores = Array.isArray(round.scores) ? round.scores : [];
  const putts = Array.isArray(round.putts) ? round.putts : [];
  const fir = Array.isArray(round.fir) ? round.fir : [];
  const gir = Array.isArray(round.gir) ? round.gir : [];
  const activeHoleIndex = Number(round.activeHoleIndex);
  return {
    id: typeof round.id === 'string' && round.id ? round.id : fallbackRound.id,
    courseId: typeof round.courseId === 'string' && round.courseId ? round.courseId : fallbackRound.courseId,
    startedAt: typeof round.startedAt === 'string' ? round.startedAt : fallbackRound.startedAt,
    updatedAt: typeof round.updatedAt === 'string' ? round.updatedAt : fallbackRound.updatedAt,
    completedAt: typeof round.completedAt === 'string' ? round.completedAt : undefined,
    courseName: typeof round.courseName === 'string' ? round.courseName : undefined,
    courseHoles: Array.isArray(round.courseHoles) ? round.courseHoles : undefined,
    activeHoleIndex: Number.isInteger(activeHoleIndex) && activeHoleIndex >= 0 && activeHoleIndex < 18 ? activeHoleIndex : 0,
    scores: Array.from({ length: 18 }, (_, index) => normalizeScore(scores[index])),
    putts: Array.from({ length: 18 }, (_, index) => normalizePutts(putts[index])),
    fir: Array.from({ length: 18 }, (_, index) => normalizeBoolean(fir[index])),
    gir: Array.from({ length: 18 }, (_, index) => normalizeBoolean(gir[index])),
  };
}

function normalizeScore(value) {
  const score = Number(value);
  return Number.isInteger(score) && score > 0 ? score : null;
}

function normalizePutts(value) {
  if (value === '4++') return '4++';
  if (value === null || value === undefined || value === '') return null;
  const putts = Number(value);
  return Number.isInteger(putts) && putts >= 0 && putts <= 3 ? putts : null;
}

function normalizeWheelValue(field, value) {
  if (field === 'score') return normalizeScore(value);
  if (field === 'putts') return normalizePutts(value);
  return null;
}

function formatWheelValue(value) {
  return value === null || value === undefined ? '—' : String(value);
}

function serializeWheelValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

function normalizeBoolean(value) {
  return value === true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getActiveCourse() {
  return state.courses.find((course) => course.id === state.activeCourseId) || state.courses[0];
}

function getActiveCourseRounds(rounds = state.roundHistory) {
  const course = getActiveCourse();
  return rounds.filter((round) => !round.courseId || round.courseId === course.id);
}

function setActiveView(view) {
  if (!VALID_VIEWS.includes(view)) return;
  state.activeView = view;
  if (view !== 'play') {
    isRoundConfirmOpen = false;
    activeRegulationHelp = null;
  }
  if (view !== 'history') {
    isPuttsHelpOpen = false;
  }
  saveState();
  renderApp();
}

function setTheme(theme) {
  if (!VALID_THEMES.includes(theme)) return;
  state.theme = theme;
  saveState();
  renderApp();
}

function toggleTheme() {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function getCurrentHole() {
  return getActiveCourse().holes[state.currentRound.activeHoleIndex];
}

function getCurrentScore() {
  return state.currentRound.scores[state.currentRound.activeHoleIndex];
}

function getCurrentPutts() {
  return state.currentRound.putts?.[state.currentRound.activeHoleIndex] ?? null;
}

function getCurrentRegulationStat(stat) {
  return state.currentRound[stat]?.[state.currentRound.activeHoleIndex] === true;
}

function setCurrentRegulationStat(stat, value) {
  if (!['fir', 'gir'].includes(stat)) return;
  state.currentRound.courseId = getActiveCourse().id;
  if (!Array.isArray(state.currentRound[stat])) {
    state.currentRound[stat] = Array(18).fill(false);
  }
  state.currentRound[stat][state.currentRound.activeHoleIndex] = value === true;
  state.currentRound.updatedAt = new Date().toISOString();
  saveState();
  renderApp();
}

function toggleRegulationHelp(stat) {
  if (!REGULATION_HELP[stat]) return;
  activeRegulationHelp = activeRegulationHelp === stat ? null : stat;
  renderApp();
}

function togglePuttsHelp() {
  isPuttsHelpOpen = !isPuttsHelpOpen;
  renderApp();
}

function setActiveHole(index) {
  if (!Number.isInteger(index) || index < 0 || index > 17) return;
  state.currentRound.activeHoleIndex = index;
  state.currentRound.updatedAt = new Date().toISOString();
  saveState();
  renderApp();
}

function setCurrentScore(nextScore) {
  state.currentRound.courseId = getActiveCourse().id;
  state.currentRound.scores[state.currentRound.activeHoleIndex] = normalizeScore(nextScore);
  state.currentRound.updatedAt = new Date().toISOString();
  saveState();
  renderApp();
}

function setCurrentPutts(nextPutts) {
  state.currentRound.courseId = getActiveCourse().id;
  if (!Array.isArray(state.currentRound.putts)) {
    state.currentRound.putts = Array(18).fill(null);
  }
  state.currentRound.putts[state.currentRound.activeHoleIndex] = normalizePutts(nextPutts);
  state.currentRound.updatedAt = new Date().toISOString();
  saveState();
  renderApp();
}

function setCurrentWheelValue(field, value) {
  if (field === 'score') setCurrentScore(value);
  if (field === 'putts') setCurrentPutts(value);
}

function stepCurrentWheelValue(field, direction) {
  const values = field === 'score' ? SCORE_WHEEL_VALUES : field === 'putts' ? PUTTS_WHEEL_VALUES : [];
  if (!values.length) return;
  const currentValue = field === 'score' ? getCurrentScore() : getCurrentPutts();
  const currentIndex = values.findIndex((value) => normalizeWheelValue(field, value) === currentValue);
  const nextIndex = Math.min(values.length - 1, Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + direction));
  setCurrentWheelValue(field, values[nextIndex]);
}

function roundHasScores(round) {
  return round.scores.some((score) => Number.isFinite(score)) || round.putts?.some((putt) => putt !== null && putt !== undefined);
}

function snapshotCurrentRound() {
  const course = getActiveCourse();
  return {
    ...state.currentRound,
    courseId: course.id,
    id: state.currentRound.id || makeId(),
    completedAt: new Date().toISOString(),
    courseName: course.name,
    courseHoles: course.holes.map((hole) => ({ ...hole })),
    scores: [...state.currentRound.scores],
    putts: Array.from({ length: 18 }, (_, index) => normalizePutts(state.currentRound.putts?.[index])),
    fir: Array.from({ length: 18 }, (_, index) => state.currentRound.fir?.[index] === true),
    gir: Array.from({ length: 18 }, (_, index) => state.currentRound.gir?.[index] === true),
  };
}

function archiveCurrentRoundIfNeeded() {
  if (roundHasScores(state.currentRound)) {
    state.roundHistory = [snapshotCurrentRound(), ...state.roundHistory].slice(0, 20);
  }
}

function startNewRound() {
  isRoundConfirmOpen = true;
  renderApp();
  return false;
}

function closeRoundConfirmDrawer() {
  isRoundConfirmOpen = false;
  renderApp();
}

function confirmStartNewRound() {
  isRoundConfirmOpen = false;
  archiveCurrentRoundIfNeeded();
  state.currentRound = createEmptyRound(getActiveCourse().id);
  state.activeView = 'play';
  saveState();
  renderApp();
  return true;
}

function activateCourse(courseId) {
  if (!state.courses.some((course) => course.id === courseId)) return;
  if (state.activeCourseId !== courseId) {
    archiveCurrentRoundIfNeeded();
    state.activeCourseId = courseId;
    state.currentRound = createEmptyRound(courseId);
  }
  state.activeView = 'play';
  saveState();
  renderApp();
}

function addCourse() {
  if (state.courses.length >= MAX_COURSES) {
    alert(`Backspin v1 supports ${MAX_COURSES} saved courses.`);
    return;
  }
  archiveCurrentRoundIfNeeded();
  const course = createDefaultCourse(`Course ${state.courses.length + 1}`);
  state.courses.push(course);
  state.activeCourseId = course.id;
  state.currentRound = createEmptyRound(course.id);
  state.activeView = 'setup';
  saveState();
  renderApp();
}

function createCopiedCourse(sourceCourse = getActiveCourse()) {
  return {
    id: makeId(),
    name: `${sourceCourse.name} Copy`,
    holes: sourceCourse.holes.map((hole, index) => ({
      number: index + 1,
      par: hole.par,
      yardage: hole.yardage,
    })),
  };
}

function copyCourse(courseId = state.activeCourseId) {
  if (state.courses.length >= MAX_COURSES) {
    alert(`Backspin v1 supports ${MAX_COURSES} saved courses.`);
    return null;
  }
  const sourceCourse = state.courses.find((course) => course.id === courseId);
  if (!sourceCourse) return null;
  archiveCurrentRoundIfNeeded();
  const copiedCourse = createCopiedCourse(sourceCourse);
  state.courses.push(copiedCourse);
  state.activeCourseId = copiedCourse.id;
  state.currentRound = createEmptyRound(copiedCourse.id);
  state.activeView = 'setup';
  saveState();
  renderApp();
  return copiedCourse;
}

function deleteRoundsForCourse(courseId = state.activeCourseId) {
  const course = state.courses.find((savedCourse) => savedCourse.id === courseId);
  if (!course) return false;
  if (!confirm(`Delete all rounds for ${course.name}? Course setup will stay.`)) return false;
  state.roundHistory = state.roundHistory.filter((round) => round.courseId !== courseId);
  if (state.currentRound.courseId === courseId) {
    state.currentRound = createEmptyRound(courseId);
  }
  saveState();
  renderApp();
  return true;
}

function deleteCourse(courseId = state.activeCourseId) {
  const course = state.courses.find((savedCourse) => savedCourse.id === courseId);
  if (!course || state.courses.length <= 1) return false;
  if (!confirm(`Delete ${course.name} and all rounds for that course?`)) return false;
  state.roundHistory = state.roundHistory.filter((round) => round.courseId !== courseId);
  state.courses = state.courses.filter((savedCourse) => savedCourse.id !== courseId);
  if (state.activeCourseId === courseId || state.currentRound.courseId === courseId) {
    const nextCourse = state.courses[0];
    state.activeCourseId = nextCourse.id;
    state.currentRound = createEmptyRound(nextCourse.id);
  }
  state.activeView = 'setup';
  saveState();
  renderApp();
  return true;
}

function getRoundGrossScore(round) {
  return round.scores.filter((score) => Number.isFinite(score)).reduce((sum, score) => sum + score, 0);
}

function getRoundToParScore(round, course = getActiveCourse()) {
  const holes = round.courseHoles || course.holes;
  return round.scores.reduce((total, score, index) => {
    if (!Number.isFinite(score)) return total;
    return total + score - holes[index].par;
  }, 0);
}

function formatToParScore(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function getRoundSummary(round = state.currentRound, course = getActiveCourse()) {
  const holesPlayed = getPlayedHoleCount(round);
  const grossTotal = getRoundGrossScore(round);
  const toParScore = getRoundToParScore(round, course);
  return { grossTotal, toParScore, holesPlayed };
}

function formatRoundSummaryMessage(summary = getRoundSummary()) {
  return [
    'Start a new round?',
    '',
    `Gross total: ${summary.holesPlayed ? summary.grossTotal : '—'}`,
    `To-par score: ${summary.holesPlayed ? formatToParScore(summary.toParScore) : '—'}`,
    `Holes played: ${summary.holesPlayed}/18`,
    '',
    'Continue to archive this round and start fresh, or cancel to keep playing.',
  ].join('\n');
}

function getHoleScores(holeIndex, rounds = getActiveCourseRounds()) {
  return rounds.map((round) => round.scores?.[holeIndex]).filter((score) => Number.isFinite(score));
}

function getHoleMetrics(holeIndex, rounds = getActiveCourseRounds()) {
  const scores = getHoleScores(holeIndex, rounds);
  if (!scores.length) return { low: null, high: null, avg: null };
  return {
    low: Math.min(...scores),
    high: Math.max(...scores),
    avg: scores.reduce((sum, score) => sum + score, 0) / scores.length,
  };
}

function getLastFiveScoresForHole(holeIndex, rounds = getActiveCourseRounds()) {
  return rounds
    .map((round) => round.scores?.[holeIndex])
    .filter((score) => Number.isFinite(score))
    .slice(0, 5);
}

function getHoleRegulationTotals(holeIndex, rounds = getActiveCourseRounds()) {
  return {
    fir: rounds.filter((round) => round.fir?.[holeIndex] === true).length,
    gir: rounds.filter((round) => round.gir?.[holeIndex] === true).length,
    total: rounds.length,
  };
}

function getRoundRegulationTotal(round, stat) {
  if (!Array.isArray(round?.[stat])) return 0;
  return round[stat].filter((value) => value === true).length;
}

function getHolePutts(holeIndex, rounds = getActiveCourseRounds()) {
  return rounds.map((round) => normalizePutts(round.putts?.[holeIndex]));
}

function formatPuttDisplay(value) {
  return formatWheelValue(normalizePutts(value));
}

function getRoundPuttsSummary(round) {
  const putts = Array.from({ length: 18 }, (_, index) => normalizePutts(round?.putts?.[index]));
  const hasOver = putts.includes('4++');
  const hasUnset = putts.some((value) => value === null);
  const total = putts.reduce((sum, value) => {
    if (value === '4++') return sum + 4;
    if (Number.isInteger(value)) return sum + value;
    return sum;
  }, 0);
  return { total, hasOver, hasUnset, marker: `${hasOver ? '++' : ''}${hasUnset ? '!' : ''}` };
}

function formatRoundPuttsSummary(round) {
  const summary = getRoundPuttsSummary(round);
  return `${summary.total}${summary.marker}`;
}

function renderRoundPuttsSummary(round) {
  const summary = getRoundPuttsSummary(round);
  return `${summary.total}${summary.hasOver ? '<span class="putts-marker putts-marker-over">++</span>' : ''}${summary.hasUnset ? '<span class="putts-marker putts-marker-unset">!</span>' : ''}`;
}

function getPlayedHoleCount(round = state.currentRound) {
  return round.scores.filter((score) => Number.isFinite(score)).length;
}

function getRecentRounds(rounds = getActiveCourseRounds(), limit = 10) {
  return rounds.slice(0, limit).map((round, index) => ({
    round,
    index,
    grossTotal: getRoundGrossScore(round),
    toParTotal: getRoundToParScore(round),
    holesPlayed: getPlayedHoleCount(round),
    firTotal: getRoundRegulationTotal(round, 'fir'),
    girTotal: getRoundRegulationTotal(round, 'gir'),
  }));
}

function formatRoundDate(round) {
  const timestamp = round.completedAt || round.updatedAt || round.startedAt;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Round';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getTotalPar(course = getActiveCourse()) {
  return course.holes.reduce((sum, hole) => sum + hole.par, 0);
}

function renderApp() {
  document.documentElement.dataset.theme = state.theme || 'light';

  const themeToggle = document.querySelector('[data-action="toggle-theme"]');
  if (themeToggle) {
    const nextTheme = state.theme === 'dark' ? 'Light' : 'Dark';
    themeToggle.textContent = `${nextTheme} mode`;
    themeToggle.setAttribute('aria-label', `Switch to ${nextTheme.toLowerCase()} mode`);
  }

  document.querySelectorAll('[data-view]').forEach((button) => {
    const isActive = button.dataset.view === state.activeView;
    button.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('[data-view-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== state.activeView;
    panel.className = 'view-panel';
  });

  renderPlayView();
  renderHistoryView();
  renderSetupView();
  renderDataView();
  renderRoundConfirmDrawer();
  requestAnimationFrame(alignWheelPickers);
}

function renderWheelPicker({ field, label, icon, value, values, variant = 'score' }) {
  return `
    <div class="wheel-control wheel-control-${variant}">
      <span class="stat-label"><span aria-hidden="true">${icon}</span> ${label}</span>
      <div class="number-wheel" data-wheel-field="${field}" role="listbox" aria-label="${label}" tabindex="0">
        ${values.map((option) => {
          const normalized = normalizeWheelValue(field, option);
          const isSelected = normalized === value;
          return `
            <button
              type="button"
              class="wheel-option ${isSelected ? 'is-selected' : ''}"
              data-action="pick-wheel-value"
              data-wheel-field="${field}"
              data-wheel-value="${serializeWheelValue(option)}"
              role="option"
              aria-selected="${isSelected}"
              ${isSelected ? 'aria-current="true"' : ''}
            >${formatWheelValue(option)}</button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function alignWheelPickers() {
  document.querySelectorAll('.number-wheel [aria-current="true"]').forEach((option) => {
    option.scrollIntoView({ inline: 'center', block: 'nearest' });
  });
}

function renderRoundConfirmDrawer() {
  document.querySelector('[data-round-confirm-drawer]')?.remove();
  if (!isRoundConfirmOpen) return;

  const summary = getRoundSummary();
  const drawer = document.createElement('div');
  drawer.className = 'round-confirm-shell';
  drawer.dataset.roundConfirmDrawer = 'true';
  drawer.innerHTML = `
    <button type="button" class="round-confirm-backdrop" data-action="close-round-confirm" aria-label="Keep playing"></button>
    <section class="round-confirm-drawer" role="dialog" aria-modal="true" aria-labelledby="round-confirm-title">
      <div class="drawer-handle" aria-hidden="true"></div>
      <p class="section-kicker">Round checkpoint</p>
      <h2 id="round-confirm-title" class="drawer-title">Start new round?</h2>
      <p class="section-copy drawer-copy">This round will be saved to History before a fresh scorecard opens.</p>
      <div class="drawer-stat-grid" aria-label="Current round stats">
        <article class="stat-card">
          <span class="stat-label">Gross total</span>
          <span class="stat-value">${summary.holesPlayed ? summary.grossTotal : '—'}</span>
        </article>
        <article class="stat-card">
          <span class="stat-label">To-par score</span>
          <span class="stat-value">${summary.holesPlayed ? formatToParScore(summary.toParScore) : '—'}</span>
        </article>
        <article class="stat-card">
          <span class="stat-label">Holes played</span>
          <span class="stat-value">${summary.holesPlayed}/18</span>
        </article>
      </div>
      <div class="drawer-actions">
        <button type="button" class="button" data-action="confirm-new-round">Start New Round</button>
        <button type="button" class="secondary-button" data-action="close-round-confirm">Keep Playing</button>
      </div>
    </section>
  `;
  document.body.appendChild(drawer);
}

function renderPlayView() {
  const panel = document.getElementById('view-play');
  if (!panel) return;
  const course = getActiveCourse();
  const hole = getCurrentHole();
  const score = getCurrentScore();
  const putts = getCurrentPutts();
  const gross = getRoundGrossScore(state.currentRound);
  const toPar = getRoundToParScore(state.currentRound, course);
  const played = getPlayedHoleCount();
  const lastFive = getLastFiveScoresForHole(state.currentRound.activeHoleIndex);
  const firChecked = getCurrentRegulationStat('fir');
  const girChecked = getCurrentRegulationStat('gir');
  const activeHelp = REGULATION_HELP[activeRegulationHelp];

  panel.innerHTML = `
    <div class="top-grid">
      <article class="stat-card">
        <span class="stat-label">Course</span>
        <span class="stat-value">${escapeHtml(course.name)}</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Gross total</span>
        <span class="stat-value">${gross || '—'}</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">To-par score</span>
        <span class="stat-value">${played ? formatToParScore(toPar) : '—'}</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Played</span>
        <span class="stat-value">${played}/18</span>
      </article>
    </div>

    <div class="hole-strip" aria-label="Hole selector">
      ${course.holes.map((courseHole, index) => `
        <button type="button" class="hole-chip ${index === state.currentRound.activeHoleIndex ? 'is-active' : ''}" data-hole-index="${index}" aria-label="Go to hole ${courseHole.number}">
          <span>H${courseHole.number}</span>
          <strong>${state.currentRound.scores[index] ?? '—'}</strong>
        </button>
      `).join('')}
    </div>

    <article class="panel-card hole-card">
      <div class="hole-meta">
        <div>
          <p class="section-kicker">Current hole</p>
          <h2>Hole ${hole.number}</h2>
          <p class="course-line">Par ${hole.par} · ${hole.yardage} yards</p>
        </div>
        <div class="stat-card last-five-card">
          <span class="stat-label">Last 5 here</span>
          <div class="score-pills" aria-label="Last five scores for this hole">
            ${lastFive.length ? lastFive.map((lastScore) => `<span class="score-pill">${lastScore}</span>`).join('') : '<span class="score-pill">—</span>'}
          </div>
        </div>
      </div>

      <div class="score-control" aria-label="Stroke and putting input">
        ${renderWheelPicker({
          field: 'score',
          label: 'Gross strokes',
          icon: '🧮',
          value: score,
          values: SCORE_WHEEL_VALUES,
          variant: 'score',
        })}
        ${renderWheelPicker({
          field: 'putts',
          label: 'Putts',
          icon: '⛳',
          value: putts,
          values: PUTTS_WHEEL_VALUES,
          variant: 'putts',
        })}
      </div>

      <div class="regulation-row" aria-label="Regulation stats for current hole">
        <div class="regulation-toggle ${firChecked ? 'is-checked' : ''}">
          <label class="regulation-label">
            <input type="checkbox" data-reg-field="fir" ${firChecked ? 'checked' : ''} />
            <span class="regulation-text">FIR</span>
          </label>
          <button type="button" class="info-button" data-action="show-reg-help" data-reg-help="fir" aria-label="What is FIR?" aria-expanded="${activeRegulationHelp === 'fir'}" aria-controls="regulation-help-panel">?</button>
        </div>
        <div class="regulation-toggle ${girChecked ? 'is-checked' : ''}">
          <label class="regulation-label">
            <input type="checkbox" data-reg-field="gir" ${girChecked ? 'checked' : ''} />
            <span class="regulation-text">GIR</span>
          </label>
          <button type="button" class="info-button" data-action="show-reg-help" data-reg-help="gir" aria-label="What is GIR?" aria-expanded="${activeRegulationHelp === 'gir'}" aria-controls="regulation-help-panel">?</button>
        </div>
      </div>
      ${activeHelp ? `
        <div id="regulation-help-panel" class="regulation-help" data-reg-help-panel role="status">
          <strong>${activeHelp.label}</strong> — ${activeHelp.title}: ${activeHelp.description}
        </div>
      ` : ''}

      <div class="metric-grid">
        <div class="stat-card">
          <span class="stat-label">Round par</span>
          <span class="stat-value">${getTotalPar(course)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">This hole</span>
          <span class="stat-value">${score ? `${score}` : 'Unset'}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Courses</span>
          <span class="stat-value">${state.courses.length}/${MAX_COURSES}</span>
        </div>
      </div>
    </article>

    <div class="action-row">
      <button type="button" class="secondary-button" data-action="previous-hole">Previous</button>
      <button type="button" class="button" data-action="next-hole">Next</button>
    </div>
    <button type="button" class="secondary-button" data-action="new-round">Start New Round</button>
  `;
}

function renderHistoryView() {
  const panel = document.getElementById('view-history');
  if (!panel) return;
  const course = getActiveCourse();
  const rounds = getActiveCourseRounds();
  const hasHistory = rounds.length > 0;
  const recentRounds = getRecentRounds(rounds, 10);
  panel.innerHTML = `
    <article class="panel-card">
      <div class="panel-inner">
        <p class="section-kicker">History Explorer</p>
        <h2 class="section-title">${escapeHtml(course.name)} patterns.</h2>
        <p class="section-copy">Review low, high, average, and your last 10 archived scores for each hole.</p>
      </div>
    </article>

    ${hasHistory ? `<div class="history-list">${course.holes.map((hole, index) => renderHistoryRow(hole, index, rounds)).join('')}</div>` : `
      <div class="notice">Start a new round after entering scores to build history for ${escapeHtml(course.name)}.</div>
    `}

    <article class="panel-card history-summary-card" data-history-summary>
      <div class="panel-inner">
        <p class="section-kicker">Last 10 rounds</p>
        <h3 class="history-summary-title">Recent rounds.</h3>
        <div class="round-total-list" aria-label="Last 10 round totals">
          ${recentRounds.length ? renderRecentRoundsTable(recentRounds) : `
            <p class="section-copy history-empty-note">No archived rounds yet.</p>
          `}
        </div>
      </div>
    </article>
  `;
}

function renderRecentRoundsTable(recentRounds) {
  const headers = ['Date', 'Gross', 'To-Par', 'Tot-FIR', 'Tot-GIR', 'Played/Holes', 'Tot-Putts'];
  return `
    <div class="recent-rounds-table-wrap">
      <table class="recent-rounds-table">
        <thead>
          <tr>${headers.map((header) => `
            <th scope="col">
              ${header === 'Tot-Putts'
                ? `<span class="table-header-with-help">${header}<button type="button" class="info-button table-info-button" data-action="show-putts-help" aria-label="What do Tot-Putts markers mean?" aria-expanded="${isPuttsHelpOpen}" aria-controls="putts-help-panel">?</button></span>`
                : header}
            </th>
          `).join('')}</tr>
        </thead>
        <tbody>
          ${recentRounds.slice(0, 10).map((roundData) => renderRoundTotalRow(roundData)).join('')}
        </tbody>
      </table>
    </div>
    ${isPuttsHelpOpen ? `
      <div id="putts-help-panel" class="regulation-help putts-help" data-putts-help-panel role="status">
        <strong>Tot-Putts</strong> — ++ means a 4++ was selected for at least one hole. ! means at least one hole was unset.
      </div>
    ` : ''}
  `;
}

function renderRoundTotalRow({ round, grossTotal, toParTotal, holesPlayed, firTotal, girTotal }) {
  const dateLabel = formatRoundDate(round);
  return `
    <tr class="round-total-row">
      <td class="round-total-main round-total-date">${escapeHtml(dateLabel)}</td>
      <td><strong>${grossTotal || '—'}</strong></td>
      <td><strong>${holesPlayed ? formatToParScore(toParTotal) : '—'}</strong></td>
      <td><strong>${firTotal}</strong></td>
      <td><strong>${girTotal}</strong></td>
      <td><strong>${holesPlayed}</strong>/18</td>
      <td><strong>${renderRoundPuttsSummary(round)}</strong></td>
    </tr>
  `;
}

function renderHistoryRow(hole, index, rounds) {
  const metrics = getHoleMetrics(index, rounds);
  const lastTen = rounds
    .map((round) => round.scores?.[index])
    .slice(0, 10);
  const lastTenPutts = getHolePutts(index, rounds).slice(0, 10);
  const lastTenFir = rounds
    .map((round) => round.fir?.[index] === true)
    .slice(0, 10);
  const lastTenGir = rounds
    .map((round) => round.gir?.[index] === true)
    .slice(0, 10);
  const avg = metrics.avg === null ? '—' : metrics.avg.toFixed(1);

  return `
    <article class="history-row">
      <div class="history-hole">#${hole.number}</div>
      <div class="history-meta">Par ${hole.par}<br>${hole.yardage} yds</div>
      <div class="history-scores">
        <div class="score-pills gross-pills history-value-row" aria-label="Last 10 gross scores for hole ${hole.number}">
          <span class="history-stat-label">Gross</span>
          ${lastTen.length ? lastTen.map((score) => `<span class="score-pill">${Number.isFinite(score) ? score : '—'}</span>`).join('') : '<span class="score-pill">—</span>'}
        </div>
        <div class="putt-pills history-value-row" aria-label="Last 10 putts for hole ${hole.number}">
          <span class="history-stat-label">Putts</span>
          ${lastTenPutts.length ? lastTenPutts.map((putt) => `<span class="score-pill putt-pill">${formatPuttDisplay(putt)}</span>`).join('') : '<span class="score-pill putt-pill">—</span>'}
        </div>
        <div class="regulation-pills fir-pills history-value-row" aria-label="Last 10 fairways in regulation for hole ${hole.number}">
          <span class="history-stat-label">FIR</span>
          ${lastTenFir.length ? lastTenFir.map((isSet) => `<span class="score-pill regulation-pill">${isSet ? '✓' : 'x'}</span>`).join('') : '<span class="score-pill regulation-pill">x</span>'}
        </div>
        <div class="regulation-pills gir-pills history-value-row" aria-label="Last 10 greens in regulation for hole ${hole.number}">
          <span class="history-stat-label">GIR</span>
          ${lastTenGir.length ? lastTenGir.map((isSet) => `<span class="score-pill regulation-pill">${isSet ? '✓' : 'x'}</span>`).join('') : '<span class="score-pill regulation-pill">x</span>'}
        </div>
        <div class="metric-pills" aria-label="Metrics for hole ${hole.number}">
          <span class="metric-pill badge-low">Low ${metrics.low ?? '—'}</span>
          <span class="metric-pill badge-high">High ${metrics.high ?? '—'}</span>
          <span class="metric-pill">Avg ${avg}</span>
        </div>
      </div>
    </article>
  `;
}

function renderSetupView() {
  const panel = document.getElementById('view-setup');
  if (!panel) return;
  const course = getActiveCourse();
  panel.innerHTML = `
    <article class="panel-card">
      <form class="panel-inner form-grid" id="course-form">
        <div class="setup-preferences">
          <div>
            <p class="section-kicker">Appearance</p>
            <p class="section-copy">Backspin starts in light mode. Switch themes here when you want the darker card-room look.</p>
          </div>
          <button type="button" class="theme-toggle" data-action="toggle-theme">${state.theme === 'dark' ? 'Light' : 'Dark'} mode</button>
        </div>

        <div>
          <p class="section-kicker">Setup</p>
          <h2 class="section-title">Course library.</h2>
          <p class="section-copy">Save up to ${MAX_COURSES} courses. One course is active at a time.</p>
        </div>

        <div class="form-grid two-col">
          <div class="field">
            <label for="active-course">Active course</label>
            <select id="active-course" name="activeCourse" class="select-input" data-action="select-course">
              ${state.courses.map((savedCourse) => `<option value="${savedCourse.id}" ${savedCourse.id === course.id ? 'selected' : ''}>${escapeHtml(savedCourse.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field setup-actions">
            <label>Saved courses</label>
            <div class="button-stack">
              <button type="button" class="secondary-button" data-action="add-course" ${state.courses.length >= MAX_COURSES ? 'disabled' : ''}>Add Course (${state.courses.length}/${MAX_COURSES})</button>
              <button type="button" class="secondary-button" data-action="copy-course" ${state.courses.length >= MAX_COURSES ? 'disabled' : ''}>Copy Course</button>
              <button type="button" class="danger-button" data-action="delete-course" ${state.courses.length <= 1 ? 'disabled' : ''}>Delete Course + Rounds</button>
            </div>
          </div>
        </div>

        <div class="setup-preferences">
          <div>
            <p class="section-kicker">Delete</p>
            <p class="section-copy">Delete archived rounds for ${escapeHtml(course.name)} without deleting the course setup.</p>
          </div>
          <button type="button" class="danger-button" data-action="delete-course-rounds" data-course-id="${course.id}">Delete Rounds for Course</button>
        </div>

        <div class="field">
          <label for="course-name">Course name</label>
          <input id="course-name" name="courseName" required value="${escapeHtml(course.name)}" />
        </div>

        <div class="form-grid">
          ${course.holes.map((hole, index) => `
            <div class="course-row">
              <div class="course-row-number">#${hole.number}</div>
              <div class="field">
                <label for="hole-${index}-par">Par</label>
                <input id="hole-${index}-par" name="par-${index}" type="number" min="3" max="5" step="1" required value="${hole.par}" />
              </div>
              <div class="field">
                <label for="hole-${index}-yardage">Yards</label>
                <input id="hole-${index}-yardage" name="yardage-${index}" type="number" min="1" step="1" required value="${hole.yardage}" />
              </div>
            </div>
          `).join('')}
        </div>

        <button type="submit" class="button">Save Course</button>
      </form>
    </article>
  `;
}

function renderDataView() {
  const panel = document.getElementById('view-data');
  if (!panel) return;
  panel.innerHTML = `
    <article class="panel-card">
      <div class="panel-inner form-grid">
        <div>
          <p class="section-kicker">Data</p>
          <h2 class="section-title">Local backups.</h2>
          <p class="section-copy">Export, import, or reset data stored in this browser under ${STORAGE_KEY}.</p>
        </div>

        <div class="data-actions">
          <button type="button" class="button" data-action="export-json">Export JSON</button>
          <label class="import-label" for="import-json">
            Import JSON backup
            <input id="import-json" type="file" accept="application/json,.json" data-action="import-json" />
          </label>
          <button type="button" class="danger-button" data-action="reset-data">Reset local data</button>
        </div>
      </div>
    </article>
  `;
}

function handleClick(event) {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    setActiveView(viewButton.dataset.view);
    return;
  }

  const holeButton = event.target.closest('[data-hole-index]');
  if (holeButton) {
    setActiveHole(Number(holeButton.dataset.holeIndex));
    return;
  }

  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;

  const action = actionButton.dataset.action;
  const currentIndex = state.currentRound.activeHoleIndex;
  const currentScore = getCurrentScore();

  if (action === 'pick-wheel-value') setCurrentWheelValue(actionButton.dataset.wheelField, actionButton.dataset.wheelValue);
  if (action === 'increment-score') setCurrentScore((currentScore || 0) + 1);
  if (action === 'decrement-score') setCurrentScore(currentScore && currentScore > 1 ? currentScore - 1 : null);
  if (action === 'previous-hole') setActiveHole(Math.max(0, currentIndex - 1));
  if (action === 'next-hole') setActiveHole(Math.min(17, currentIndex + 1));
  if (action === 'new-round') startNewRound();
  if (action === 'show-reg-help') toggleRegulationHelp(actionButton.dataset.regHelp);
  if (action === 'show-putts-help') togglePuttsHelp();
  if (action === 'confirm-new-round') confirmStartNewRound();
  if (action === 'close-round-confirm') closeRoundConfirmDrawer();
  if (action === 'toggle-theme') toggleTheme();
  if (action === 'add-course') addCourse();
  if (action === 'copy-course') copyCourse();
  if (action === 'delete-course') deleteCourse();
  if (action === 'delete-course-rounds') deleteRoundsForCourse(actionButton.dataset.courseId || state.activeCourseId);
  if (action === 'export-json') exportJson();
  if (action === 'reset-data') resetData();
}

function handleSubmit(event) {
  if (event.target.id !== 'course-form') return;
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const courseName = String(formData.get('courseName') || '').trim();
  if (!courseName) {
    alert('Course name is required.');
    return;
  }

  const holes = [];
  for (let index = 0; index < 18; index += 1) {
    const par = Number(formData.get(`par-${index}`));
    const yardage = Number(formData.get(`yardage-${index}`));
    if (![3, 4, 5].includes(par)) {
      alert(`Hole ${index + 1}: par must be 3, 4, or 5.`);
      return;
    }
    if (!Number.isInteger(yardage) || yardage <= 0) {
      alert(`Hole ${index + 1}: yardage must be a positive whole number.`);
      return;
    }
    holes.push({ number: index + 1, par, yardage });
  }

  state.courses = state.courses.map((course) => course.id === state.activeCourseId ? { ...course, name: courseName, holes } : course);
  state.activeView = 'play';
  saveState();
  renderApp();
}

function handleChange(event) {
  if (event.target.matches('[data-wheel-field]')) {
    setCurrentWheelValue(event.target.dataset.wheelField, event.target.value);
    return;
  }
  if (event.target.matches('[data-reg-field]')) {
    setCurrentRegulationStat(event.target.dataset.regField, event.target.checked);
    return;
  }
  if (event.target.matches('[data-action="import-json"]')) {
    importJson(event.target.files?.[0]);
  }
  if (event.target.matches('[data-action="select-course"]')) {
    activateCourse(event.target.value);
  }
  if (event.target.matches('[data-action="select-delete-rounds-course"]')) {
    const button = document.querySelector('[data-action="delete-course-rounds"]');
    if (button) button.dataset.courseId = event.target.value;
  }
}

function handleKeydown(event) {
  const wheel = event.target.closest('.number-wheel[data-wheel-field]');
  if (!wheel) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    stepCurrentWheelValue(wheel.dataset.wheelField, 1);
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    stepCurrentWheelValue(wheel.dataset.wheelField, -1);
  }
}

function exportJson() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `backspin-export-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    try {
      state = normalizeState(JSON.parse(String(reader.result)));
      saveState();
      renderApp();
      alert('Backspin data imported.');
    } catch (error) {
      console.error(error);
      alert('Could not import that JSON file.');
    }
  });
  reader.readAsText(file);
}

function resetData() {
  if (!confirm('Reset all Backspin data in this browser?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = getDefaultState();
  saveState();
  renderApp();
}

document.addEventListener('click', handleClick);
document.addEventListener('submit', handleSubmit);
document.addEventListener('change', handleChange);
document.addEventListener('keydown', handleKeydown);
renderApp();

globalThis.BackspinApp = {
  get state() {
    return state;
  },
  getDefaultState,
  normalizeState,
  getActiveCourse,
  getActiveCourseRounds,
  getHoleScores,
  getHoleMetrics,
  getHoleRegulationTotals,
  getRoundRegulationTotal,
  getHolePutts,
  getRoundPuttsSummary,
  formatRoundPuttsSummary,
  renderRoundPuttsSummary,
  formatPuttDisplay,
  getLastFiveScoresForHole,
  getRoundGrossScore,
  getRoundToParScore,
  getRoundSummary,
  formatRoundSummaryMessage,
  formatToParScore,
  startNewRound,
  confirmStartNewRound,
  closeRoundConfirmDrawer,
  activateCourse,
  addCourse,
  copyCourse,
  deleteRoundsForCourse,
  deleteCourse,
  setTheme,
  toggleTheme,
  setActiveView,
  setActiveHole,
  setCurrentScore,
  setCurrentPutts,
  setCurrentWheelValue,
  stepCurrentWheelValue,
  setCurrentRegulationStat,
  toggleRegulationHelp,
  togglePuttsHelp,
};
