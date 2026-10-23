/* Форма роста — интерактивный фронтенд MVP. */
(() => {
  'use strict';

  const state = {
    user: null,
    route: 'dashboard',
    dashboard: null,
    exercises: [],
    workouts: [],
    templates: [],
    stats: null,
    statsPeriod: '30d',
    statsCustomStart: '',
    statsCustomEnd: '',
    statsExercise: '',
    leaderboardPeriod: 'month',
    leaderboardMode: 'xp',
    leaderboardExercise: '',
    editingWorkout: null,
    selectedTemplate: null,
    emailDevCode: null,
    renderId: 0,
    pendingAchievement: null,
    calendarMonth: dateInputValue().slice(0, 7),
    calendarSelectedDay: dateInputValue(),
    notificationsUnread: true,
    notifications: [
      { icon: '👋', title: 'Добро пожаловать!', message: 'Записывай занятия регулярно — так будет проще увидеть свой прогресс.', time: 'Подсказка' },
      { icon: '🎯', title: 'Поставь цель на неделю', message: 'Три занятия за неделю — хороший ориентир, который можно подстроить под себя.', time: 'Подсказка' },
      { icon: '🏆', title: 'Достижения рядом', message: 'Новые награды открываются автоматически, когда ты выполняешь условия.', time: 'Подсказка' },
    ],
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const root = $('#viewRoot');
  const landing = $('#landing');
  const appShell = $('#appShell');

  async function api(path, options = {}) {
    const config = { method: options.method || 'GET', credentials: 'same-origin', headers: { ...(options.headers || {}) } };
    if (options.body !== undefined) {
      if (options.body instanceof FormData) {
        config.body = options.body;
      } else {
        config.headers['Content-Type'] = 'application/json';
        config.body = JSON.stringify(options.body);
      }
    }
    const response = await fetch(path, config);
    let payload = {};
    try { payload = await response.json(); } catch (_) { payload = {}; }
    if (!response.ok) {
      const error = new Error(payload.error || `Ошибка запроса (${response.status})`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function initials(value = '') {
    const clean = String(value).replace(/[·•|]/g, ' ').replace(/\bдемо\b/ig, ' ').trim();
    return clean.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'ФР';
  }
  function avatarMarkup(user, extra = '') {
    const name = user?.display_name || 'Спортсмен';
    const style = user?.avatar ? ` style="background-image:url('${escapeHtml(user.avatar)}')"` : '';
    return `<span class="user-avatar ${extra}"${style} aria-label="Аватар ${escapeHtml(name)}">${user?.avatar ? '' : escapeHtml(initials(name))}</span>`;
  }
  function fmtDate(dateValue, options = {}) {
    if (!dateValue) return '—';
    const d = new Date(`${String(dateValue).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ru-RU', options);
  }
  function dateInputValue(d = new Date()) {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
  function fmtNumber(value, max = 1) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: max }).format(Number(value || 0));
  }
  function plural(value, forms) {
    const n = Math.abs(Number(value)) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  }
  function dateGroupTitle(dateValue) {
    const today = dateInputValue();
    const yesterday = dateInputValue(new Date(Date.now() - 86400000));
    if (dateValue === today) return 'СЕГОДНЯ';
    if (dateValue === yesterday) return 'ВЧЕРА';
    return fmtDate(dateValue, { day: 'numeric', month: 'long', year: 'numeric' }).toLocaleUpperCase('ru-RU');
  }
  function metricFor(exercise) {
    return ({ weight: 'Вес, кг', reps: 'Повторения', duration: 'Время, мин', distance: 'Дистанция, км' })[exercise?.metric] || 'Результат';
  }
  function metricValue(item, metric) {
    const fields = { weight: 'weight_kg', reps: 'reps', duration: 'duration_min', distance: 'distance_km' };
    return Number(item?.[fields[metric] || 'reps'] || 0);
  }
  function workoutSummaryLine(workout) {
    const items = workout.exercises || [];
    const exerciseNames = items.slice(0, 3).map(item => item.name).join(' · ');
    return `${items.length} ${plural(items.length, ['упражнение', 'упражнения', 'упражнений'])}${exerciseNames ? ` · ${exerciseNames}` : ''}${items.length > 3 ? '…' : ''}`;
  }
  function showToast(message, type = 'success', title = '') {
    const region = $('#toastRegion');
    const safeTitle = title || (type === 'error' ? 'Не получилось' : 'Готово');
    const icon = type === 'error' ? '⚠️' : (/достижен|уровень|награ|опыт/i.test(`${safeTitle} ${message}`) ? '🏆' : '✅');
    state.notifications.unshift({ icon, title: safeTitle, message: String(message), time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) });
    state.notifications = state.notifications.slice(0, 6);
    state.notificationsUnread = true;
    const unreadDot = $('.notification-button i');
    if (unreadDot) unreadDot.style.display = '';
    const panel = $('#notificationPopover');
    if (panel && !panel.classList.contains('hidden')) renderNotificationPopover();
    if (!region) return;
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.innerHTML = `<span class="toast-icon">${icon}</span><div class="toast-copy"><b>${escapeHtml(safeTitle)}</b><span>${escapeHtml(message)}</span></div>`;
    region.append(node);
    window.setTimeout(() => { node.style.opacity = '0'; node.style.transform = 'translateX(12px)'; window.setTimeout(() => node.remove(), 220); }, 4200);
  }
  function renderNotificationPopover() {
    const panel = $('#notificationPopover');
    if (!panel) return;
    const items = state.notifications.map(item => `<article class="notice-item"><span class="notice-item-icon">${escapeHtml(item.icon || '🔔')}</span><span class="notice-item-copy"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.message)}</small><em>${escapeHtml(item.time || 'Недавно')}</em></span></article>`).join('');
    panel.innerHTML = `<div class="notice-popover-head"><div><b>Уведомления</b><small>Полезные подсказки и события</small></div><button type="button" class="notice-close" data-action="close-notice" aria-label="Закрыть уведомления">×</button></div><div class="notice-list">${items || '<div class="notice-empty">Пока нет уведомлений.</div>'}</div><div class="notice-popover-foot"><span>Последние события сервиса</span><button type="button" data-action="clear-notices">Понятно</button></div>`;
  }
  function toggleNotificationPopover() {
    const panel = $('#notificationPopover');
    if (!panel) return;
    const shouldOpen = panel.classList.contains('hidden');
    if (shouldOpen) {
      renderNotificationPopover();
      panel.classList.remove('hidden');
      $('.notification-button')?.setAttribute('aria-expanded', 'true');
      state.notificationsUnread = false;
      const dot = $('.notification-button i'); if (dot) dot.style.display = 'none';
    } else { panel.classList.add('hidden'); $('.notification-button')?.setAttribute('aria-expanded', 'false'); }
  }
  function showModal(content, extraClass = '') {
    $('#globalModalContent').innerHTML = content;
    const modal = $('#globalModal .global-modal');
    modal.className = `modal global-modal ${extraClass}`.trim();
    $('#globalModal').classList.remove('hidden');
    const focusable = $('input,button,select,textarea', modal);
    if (focusable) setTimeout(() => focusable.focus(), 40);
  }
  function closeModal() {
    $('#globalModal').classList.add('hidden');
    $('#authModal').classList.add('hidden');
  }
  function renderAchievementCard(ach) {
    showModal(`<div class="new-achievement-modal"><div class="new-achievement-burst">${escapeHtml(ach.icon || '✦')}</div><div class="eyebrow"><span class="eyebrow-dot"></span> НОВОЕ ДОСТИЖЕНИЕ</div><h2>${escapeHtml(ach.name)}</h2><p>${escapeHtml(ach.description)}</p><div class="new-achievement-xp">✦ +${fmtNumber(ach.xp)} опыта</div><div class="modal-actions" style="justify-content:center"><button class="btn btn-dark" data-action="next-achievement">${state.pendingAchievement?.length ? 'Следующая награда' : 'Продолжить'} <span class="arrow">↗</span></button></div></div>`);
  }
  function showAchievement(achievements) {
    if (!achievements?.length) return;
    state.pendingAchievement = achievements.slice(1);
    renderAchievementCard(achievements[0]);
  }
  function showNextAchievement() {
    closeModal();
    if (state.pendingAchievement?.length) renderAchievementCard(state.pendingAchievement.shift());
    else state.pendingAchievement = [];
  }
  function authMode(mode) {
    const register = mode === 'register';
    $('#loginForm').classList.toggle('hidden', register);
    $('#registerForm').classList.toggle('hidden', !register);
    $$('[data-action^="auth-tab-"]').forEach(button => button.classList.toggle('active', button.dataset.action === `auth-tab-${register ? 'register' : 'login'}`));
    $('#authTitle').textContent = register ? 'Создай аккаунт' : 'С возвращением';
    $('#authSubtitle').textContent = register ? 'Настрой личный кабинет и начни отслеживать прогресс.' : 'Войди, чтобы продолжить свой путь.';
    $('#authError').textContent = '';
    $('#authModal').classList.remove('hidden');
    setTimeout(() => $(register ? '#registerForm input' : '#loginForm input')?.focus(), 50);
  }
  function updateUserChrome() {
    if (!state.user) return;
    $('#sidebarName').textContent = state.user.display_name;
    $('#sidebarLevel').textContent = `Уровень ${state.user.level || 1}`;
    $('#sidebarAvatar').style.backgroundImage = state.user.avatar ? `url('${state.user.avatar}')` : '';
    $('#sidebarAvatar').textContent = state.user.avatar ? '' : initials(state.user.display_name);
    $('#topbarDate').textContent = new Date().toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
  }
  async function enterApp(user, route = 'dashboard') {
    state.user = user;
    landing.classList.add('hidden');
    appShell.classList.remove('hidden');
    closeModal();
    updateUserChrome();
    await routeTo(route);
  }
  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (_) { /* Clear local view even if network is unavailable. */ }
    state.user = null;
    state.dashboard = null;
    appShell.classList.add('hidden');
    landing.classList.remove('hidden');
    closeModal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Сеанс завершён. До встречи!', 'success');
  }

  const routeTitles = { dashboard: 'Главная', workouts: 'Тренировки', 'create-workout': 'Запись тренировки', exercises: 'Каталог упражнений', statistics: 'Статистика', leaderboard: 'Рейтинг', achievements: 'Достижения', profile: 'Профиль' };
  async function routeTo(route, options = {}) {
    if (!state.user) { authMode('login'); return; }
    const savedScroll = options.preserveScroll ? { x: window.scrollX, y: window.scrollY } : null;
    state.route = route;
    const currentId = ++state.renderId;
    state.editingWorkout = options.editingWorkout || (route === 'create-workout' ? state.editingWorkout : null);
    if (route !== 'create-workout' && options.preserveTemplate !== true) state.selectedTemplate = null;
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.route === (route === 'create-workout' ? 'workouts' : route)));
    $$('.mobile-bottom-nav button').forEach(button => button.classList.toggle('active', button.dataset.route === route || (route === 'create-workout' && button.dataset.route === 'create-workout')));
    $('#pageBreadcrumb').textContent = routeTitles[route] || 'Главная';
    $('#sidebar').classList.remove('open');
    root.innerHTML = `<div class="route-loading"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>`;
    try {
      switch (route) {
        case 'dashboard': await renderDashboard(currentId); break;
        case 'workouts': await renderWorkouts(currentId); break;
        case 'create-workout': await renderCreateWorkout(currentId); break;
        case 'exercises': await renderExercises(currentId); break;
        case 'statistics': await renderStatistics(currentId); break;
        case 'leaderboard': await renderLeaderboard(currentId); break;
        case 'achievements': await renderAchievements(currentId); break;
        case 'profile': await renderProfile(currentId); break;
        default: await renderDashboard(currentId); break;
      }
      if (currentId !== state.renderId) return;
      updateUserChrome();
      root.focus({ preventScroll: true });
      if (savedScroll) { requestAnimationFrame(() => window.scrollTo(savedScroll.x, savedScroll.y)); }
      else if (window.matchMedia('(max-width: 680px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (currentId !== state.renderId) return;
      root.innerHTML = `<div class="panel empty-state"><div class="empty-symbol">!</div><h3>Не удалось загрузить раздел</h3><p>${escapeHtml(error.message || 'Проверь соединение и попробуй ещё раз.')}</p><button class="btn btn-dark" data-action="retry-route">Повторить</button></div>`;
    }
  }

  function headerBlock(eyebrow, title, description, actions = '') {
    return `<div class="page-heading"><div><div class="section-eyebrow">${escapeHtml(eyebrow)}</div><h1>${title}</h1><p>${escapeHtml(description)}</p></div>${actions ? `<div class="page-heading-actions">${actions}</div>` : ''}</div>`;
  }
  function workoutIcon(title = '') {
    if (/силовая база|силовая тренировка/i.test(title)) return '🏋️';
    if (/бег|кардио|ходьб|велотренаж|вынослив/i.test(title)) return '🏃';
    if (/ног|присед|выпад/i.test(title)) return '🦵';
    if (/восстанов|растяж|лёгк/i.test(title)) return '🧘';
    return '💪';
  }
  function workoutRowMarkup(workout) {
    const duration = Number(workout.duration_minutes || 0);
    return `<div class="workout-row"><div class="workout-color">${workoutIcon(workout.title)}</div><div class="workout-row-copy"><b>${escapeHtml(workout.title)}</b><small>${escapeHtml(workoutSummaryLine(workout))}</small></div><div class="workout-row-meta"><b>${fmtNumber(duration)} мин</b><small>${fmtDate(workout.date, { day: 'numeric', month: 'short' })} · ${escapeHtml(workout.time || '—')}</small></div></div>`;
  }
  function missionMarkup(mission) {
    const pct = Math.min(100, Math.round((mission.progress / Math.max(1, mission.target)) * 100));
    return `<article class="mission-item"><div class="mission-icon">${escapeHtml(mission.icon || '✦')}</div><div class="mission-copy"><div class="mission-title-row"><b>${escapeHtml(mission.name)}</b><span>${mission.completed ? '✓ Выполнено' : `+${mission.xp} XP`}</span></div><p>${escapeHtml(mission.description)}</p><div class="mini-progress"><span style="width:${pct}%"></span></div><div class="chart-note"><span>${mission.completed ? 'Задание выполнено' : `${mission.progress} из ${mission.target}`}</span><span>${pct}%</span></div></div></article>`;
  }
  async function renderDashboard(renderId) {
    const payload = await api('/api/dashboard');
    if (renderId !== state.renderId) return;
    state.dashboard = payload;
    state.user = payload.user || state.user;
    const s = payload.summary;
    const level = payload.level;
    const streak = payload.streak;
    const recent = payload.recent_workouts || [];
    const weeklyCount = (payload.weekly_activity || []).reduce((sum, day) => sum + Number(day.count || 0), 0);
    const weeklyGoal = 3;
    const weeklyGoalPercent = Math.min(100, Math.round(weeklyCount / weeklyGoal * 100));
    root.innerHTML = `
      <section class="welcome-row"><div><div class="section-eyebrow">${fmtDate(dateInputValue(), { weekday: 'long', day: 'numeric', month: 'long' }).toLocaleUpperCase('ru-RU')}</div><h1>Твой путь продолжается, <span>${escapeHtml((state.user.display_name || 'спортсмен').split(/\s+/)[0])}.</span></h1><p>Каждая запись — ещё один шаг к тому, что для тебя важно.</p></div><div class="welcome-action"><button class="btn btn-ghost" data-route="statistics">Посмотреть прогресс ↗</button><button class="btn btn-dark" data-route="create-workout">＋ Записать тренировку</button></div></section>
      <div class="streak-banner"><div class="streak-flame">🔥</div><div class="streak-copy"><b>${streak.current ? `Твой ритм — ${streak.current} ${plural(streak.current, ['день', 'дня', 'дней'])} подряд` : 'Самое время начать новую серию'}</b><small>${streak.active_today ? 'Тренировка за сегодня уже записана — отлично!' : 'Заверши тренировку сегодня, чтобы поддержать серию.'} Личный рекорд: ${streak.best} ${plural(streak.best, ['день', 'дня', 'дней'])}.</small></div><div class="streak-number">${streak.current}<small> дн. 🔥</small></div></div>
      <section class="weekly-goal-strip"><div class="weekly-goal-emoji">🎯</div><div class="weekly-goal-copy"><div class="weekly-goal-title"><b>Твоя цель на неделю</b><span>${weeklyCount >= weeklyGoal ? 'Цель выполнена ✨' : `Ещё ${weeklyGoal - weeklyCount} ${plural(weeklyGoal - weeklyCount, ['тренировка', 'тренировки', 'тренировок'])}`}</span></div><p>${weeklyCount >= weeklyGoal ? 'Отличная работа — можешь поставить себе новую цель.' : 'Три занятия за неделю — ориентир для регулярности. Подстраивай его под свой ритм.'}</p><div class="weekly-goal-track"><span style="width:${weeklyGoalPercent}%"></span></div></div><div class="weekly-goal-count"><strong>${Math.min(weeklyCount, weeklyGoal)}</strong><span>/ ${weeklyGoal}</span></div></section>
      <div class="dashboard-grid">
        <article class="panel stat-card"><div class="stat-card-top"><span class="stat-card-label">Тренировки в этом месяце</span><span class="stat-card-icon">🏋️</span></div><div class="stat-card-value">${fmtNumber(s.workouts_month)} <small>зан.</small></div><div class="stat-card-foot"><span class="positive-change">${s.workouts_total}</span> за всё время</div></article>
        <article class="panel stat-card"><div class="stat-card-top"><span class="stat-card-label">Время в движении</span><span class="stat-card-icon">⏱️</span></div><div class="stat-card-value">${fmtNumber(s.minutes_month)} <small>мин</small></div><div class="stat-card-foot">За текущий месяц</div></article>
        <article class="panel stat-card"><div class="stat-card-top"><span class="stat-card-label">Объём с отягощением</span><span class="stat-card-icon">🏋️‍♀️</span></div><div class="stat-card-value">${fmtNumber(s.volume_month)} <small>кг</small></div><div class="stat-card-foot">Суммарный тренировочный объём за месяц</div></article>
        <article class="panel stat-card"><div class="stat-card-top"><span class="stat-card-label">Разные упражнения</span><span class="stat-card-icon">💪</span></div><div class="stat-card-value">${fmtNumber(s.exercises_total)} <small>видов</small></div><div class="stat-card-foot">Твой личный набор движений</div></article>
        <article class="panel stat-card"><div class="stat-card-top"><span class="stat-card-label">Накоплено опыта</span><span class="stat-card-icon">✨</span></div><div class="stat-card-value">${fmtNumber(level.xp)} <small>XP</small></div><div class="stat-card-foot"><span class="positive-change">Уровень ${level.level}</span> · ${Math.max(0, level.next_level_at - level.xp)} до следующего</div></article>
        <article class="panel stat-card"><div class="stat-card-top"><span class="stat-card-label">Открыто достижений</span><span class="stat-card-icon">🏆</span></div><div class="stat-card-value">${fmtNumber(payload.unlocked_count || 0)} <small>/ ${fmtNumber(payload.achievements_total || 20)}</small></div><div class="stat-card-foot">Каждая награда — шаг вперёд</div></article>
      </div>
      <div class="dashboard-main-grid">
        <section class="panel panel-pad activity-panel"><div class="panel-heading"><div><h3>Твой ритм недели</h3><p>Количество тренировок по дням</p></div><div class="chart-legend"><span><i class="legend-dot"></i>Тренировки</span><button class="text-link" data-route="statistics">Вся статистика ↗</button></div></div><div class="chart-wrap"><canvas class="chart-canvas" id="weeklyChart" aria-label="График тренировок по дням недели"></canvas></div><div class="chart-note"><span>Неделя с ${fmtDate(payload.weekly_activity?.[0]?.date, { day: 'numeric', month: 'short' })}</span><b>${payload.weekly_activity?.reduce((a, x) => a + x.count, 0) || 0} ${plural(payload.weekly_activity?.reduce((a, x) => a + x.count, 0) || 0, ['тренировка', 'тренировки', 'тренировок'])} за неделю</b></div></section>
        <section class="panel level-panel"><div class="panel-heading"><div><h3>Система уровней</h3><p>Опыт превращается в новые уровни</p></div><span class="pill pill-lime">АКТИВНО</span></div><div class="level-badge"><strong>${level.level}</strong><small>УРОВЕНЬ</small></div><div class="level-data"><span>Твой опыт</span><b>${fmtNumber(level.xp)} XP</b></div><div class="progress-track xp-progress-entrance ${Number(level.level || 0) > 0 || Number(level.xp || 0) > 0 ? 'has-progress' : ''}"><span style="--xp-target:${Math.max(0, Math.min(100, Number(level.progress_percent || 0)))}%;width:0"></span></div><div class="level-data"><span>${fmtNumber(level.current_level_xp)} из ${fmtNumber(level.next_level_xp)} XP</span><span>${level.progress_percent}%</span></div><div class="level-foot" style="margin-top:12px">За завершённую тренировку начисляется 40 XP. Задания дают дополнительный опыт.</div></section>
      </div>
      <div class="dashboard-lower-grid">
        <section class="panel panel-pad"><div class="panel-heading"><div><h3>Недавние тренировки</h3><p>Твоя история занятий</p></div><button class="text-link" data-route="workouts">Вся история ↗</button></div>${recent.length ? `<div class="workout-list">${recent.map(workoutRowMarkup).join('')}</div>` : `<div class="empty-state"><div class="empty-symbol">✳</div><h3>Первая запись — за тобой</h3><p>Добавь тренировку, и здесь появится история твоих занятий.</p><button class="btn btn-dark" data-route="create-workout">Записать тренировку</button></div>`}</section>
        <section class="panel panel-pad"><div class="panel-heading"><div><h3>Задания недели</h3><p>Небольшие цели с дополнительным опытом</p></div><span class="pill pill-lime">${payload.missions.filter(m => m.completed).length}/${payload.missions.length}</span></div><div class="mission-list">${payload.missions.map(missionMarkup).join('')}</div><div style="margin-top:14px"><button class="text-link" data-route="achievements">Посмотреть достижения ↗</button></div></section>
      </div>
      ${state.user.is_demo ? '<p class="demo-caption" style="margin:14px 2px 0">Демо-аккаунт: часть истории и участников создана для знакомства с возможностями сервиса.</p>' : ''}`;
    const xpFill = $('.xp-progress-entrance > span', root);
    if (xpFill && xpFill.parentElement.classList.contains('has-progress')) requestAnimationFrame(() => requestAnimationFrame(() => { xpFill.classList.add('xp-fill-animated'); xpFill.style.width = xpFill.style.getPropertyValue('--xp-target') || '0%'; }));
    requestAnimationFrame(() => drawBarChart($('#weeklyChart'), payload.weekly_activity || [], 'count', { color: '#addb61', line: '#88b533', suffix: '', minHeight: 5 }));
  }

  function calendarMarkup(workouts) {
    const [year, month] = (state.calendarMonth || dateInputValue().slice(0, 7)).split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const mondayOffset = (first.getDay() + 6) % 7;
    const counts = new Map();
    workouts.forEach(workout => { if (String(workout.date || '').startsWith(`${year}-${String(month).padStart(2,'0')}`)) counts.set(workout.date, (counts.get(workout.date) || 0) + 1); });
    const today = dateInputValue();
    const weekdays = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    let cells = weekdays.map(d => `<div class="calendar-weekday">${d}</div>`).join('');
    for (let i = 0; i < mondayOffset; i++) cells += '<div class="calendar-day calendar-day-empty" aria-hidden="true"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const count = counts.get(date) || 0;
      cells += `<button class="calendar-day ${count ? 'has-workout' : ''} ${date === today ? 'is-today' : ''} ${date === state.calendarSelectedDay ? 'is-selected' : ''}" data-action="calendar-day" data-date="${date}" aria-label="${day} ${count ? `, тренировок: ${count}` : ', тренировок нет'}" aria-pressed="${date === state.calendarSelectedDay}"><span>${day}</span>${count ? `<i>${count}</i>` : ''}</button>`;
    }
    // Reserve six complete weeks so changing months never changes the calendar's height.
    const trailingCells = 42 - mondayOffset - daysInMonth;
    for (let i = 0; i < trailingCells; i++) cells += '<div class="calendar-day calendar-day-empty" aria-hidden="true"></div>';
    const dateLabel = first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const selectedLabel = new Date(`${state.calendarSelectedDay}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    const dayWorkouts = workouts.filter(w => w.date === state.calendarSelectedDay).sort((a, b) => String(b.time || '00:00').localeCompare(String(a.time || '00:00')));
    const details = dayWorkouts.length ? dayWorkouts.map(w => `<button class="calendar-workout" data-action="workout-detail" data-id="${escapeHtml(w.id)}"><span class="calendar-workout-dot">🏋️</span><span><b>${escapeHtml(w.title)}</b><small>${escapeHtml(w.time || "—")} · ${fmtNumber(w.duration_minutes || 0)} мин · ${(w.exercises || []).length} ${plural((w.exercises || []).length, ['упражнение', 'упражнения', 'упражнений'])}</small></span><span class="calendar-workout-arrow">↗</span></button>`).join('') : `<div class="calendar-no-workouts"><span>${state.calendarSelectedDay === today ? '🌿' : '🗓️'}</span><b>На этот день нет тренировок</b><p>${state.calendarSelectedDay === today ? 'Запиши сегодняшнее занятие, когда захочешь.' : 'Если занимался в этот день, добавь тренировку с соответствующей датой.'}</p><button class="btn btn-ghost" data-route="create-workout">＋ Добавить тренировку</button></div>`;
    return `<section class="panel calendar-panel"><div class="panel-heading calendar-heading"><div><h3>Календарь тренировок</h3><p>Выбери день, чтобы посмотреть занятия и результаты.</p></div><div class="calendar-month-control"><button class="mini-icon-btn" data-action="calendar-prev" aria-label="Предыдущий месяц">‹</button><b>${escapeHtml(dateLabel)}</b><button class="mini-icon-btn" data-action="calendar-next" aria-label="Следующий месяц">›</button></div></div><div class="calendar-layout"><div class="calendar-grid">${cells}</div><aside class="calendar-day-detail"><div class="calendar-day-content"><div class="calendar-selected-date"><span>ВЫБРАННЫЙ ДЕНЬ</span><b>${escapeHtml(selectedLabel)}</b><small>${dayWorkouts.length} ${plural(dayWorkouts.length, ['тренировка','тренировки','тренировок'])}</small></div>${details}</div></aside></div><div class="calendar-legend"><span><i class="legend-dot"></i> Есть тренировка</span><span><i class="legend-dot legend-dot-today"></i> Сегодня</span></div></section>`;
  }

  function restoreCalendarScroll(scrollX, scrollY) {
    const html = document.documentElement;
    const oldBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(scrollX, scrollY);
    html.style.scrollBehavior = oldBehavior;
  }

  function refreshCalendarDay(focusSelector = '') {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const current = $('.calendar-panel', root);
    if (!current) { routeTo('workouts'); return; }

    const wrapper = document.createElement('template');
    wrapper.innerHTML = calendarMarkup(state.workouts || []).trim();
    const updated = wrapper.content.firstElementChild;
    if (!updated) return;

    // Keep the calendar grid and panel mounted. Only update the selected-day states and its detail content.
    current.querySelectorAll('.calendar-day[data-date]').forEach(dayButton => {
      const selected = dayButton.dataset.date === state.calendarSelectedDay;
      dayButton.classList.toggle('is-selected', selected);
      dayButton.setAttribute('aria-pressed', String(selected));
    });

    const currentContent = current.querySelector('.calendar-day-content');
    const updatedContent = updated.querySelector('.calendar-day-content');
    if (currentContent && updatedContent) {
      currentContent.innerHTML = updatedContent.innerHTML;
      currentContent.classList.remove('calendar-day-content-refresh');
      void currentContent.offsetWidth;
      currentContent.classList.add('calendar-day-content-refresh');
      currentContent.addEventListener('animationend', () => currentContent.classList.remove('calendar-day-content-refresh'), { once: true });
    }
    if (focusSelector) current.querySelector(focusSelector)?.focus({ preventScroll: true });
    restoreCalendarScroll(scrollX, scrollY);
    requestAnimationFrame(() => requestAnimationFrame(() => restoreCalendarScroll(scrollX, scrollY)));
  }

  function refreshCalendarOnly(focusSelector = '') {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const current = $('.calendar-panel', root);
    if (!current) { routeTo('workouts'); return; }
    const wrapper = document.createElement('template');
    wrapper.innerHTML = calendarMarkup(state.workouts || []).trim();
    const updated = wrapper.content.firstElementChild;
    if (!updated) return;

    // Month changes need a new grid, but the outer panel itself should never animate.
    current.innerHTML = updated.innerHTML;
    const dayContent = current.querySelector('.calendar-day-content');
    if (dayContent) {
      dayContent.classList.add('calendar-day-content-refresh');
      dayContent.addEventListener('animationend', () => dayContent.classList.remove('calendar-day-content-refresh'), { once: true });
    }
    if (focusSelector) current.querySelector(focusSelector)?.focus({ preventScroll: true });
    restoreCalendarScroll(scrollX, scrollY);
    requestAnimationFrame(() => requestAnimationFrame(() => restoreCalendarScroll(scrollX, scrollY)));
  }

  function shiftCalendarMonth(offset) {
    const [year, month] = (state.calendarMonth || dateInputValue().slice(0, 7)).split('-').map(Number);
    const selectedDay = Number((state.calendarSelectedDay || `${state.calendarMonth}-01`).slice(-2)) || 1;
    const target = new Date(year, month - 1 + offset, 1);
    state.calendarMonth = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    const day = Math.min(selectedDay, lastDay);
    state.calendarSelectedDay = `${state.calendarMonth}-${String(day).padStart(2, '0')}`;
    refreshCalendarOnly(`[data-action="calendar-${offset < 0 ? 'prev' : 'next'}"]`);
  }

  async function renderWorkouts(renderId) {
    const [workoutsPayload, templatesPayload] = await Promise.all([api('/api/workouts'), api('/api/templates')]);
    if (renderId !== state.renderId) return;
    state.workouts = workoutsPayload.workouts || [];
    state.templates = templatesPayload.templates || [];
    const templateMarkup = state.templates.map((tpl) => `<article class="template-card template-card-illustrated"><div class="template-card-top"><div class="template-symbol">${/утрен|подвижност|восстанов|растяж/i.test(tpl.name) ? '🌿' : /кардио|вынослив|бег/i.test(`${tpl.name} ${tpl.goal}`) ? '🏃' : /ног|ягодиц/i.test(tpl.name) ? '🦵' : /спин/i.test(tpl.name) ? '💪' : /корпус/i.test(tpl.name) ? '⚡' : /верх тела|силов|профессиональ/i.test(tpl.name) ? '🏋️' : '🎯'}</div><span class="pill ${/восстанов|подвиж/i.test(tpl.goal) ? 'pill-purple' : ''}">${escapeHtml(tpl.goal)}</span></div><div class="template-art">${exerciseCoverMarkup({ name: tpl.name, category: tpl.goal, goal: tpl.goal }, 'template-cover')}</div><h3>${escapeHtml(tpl.name)}</h3><p>${escapeHtml(tpl.description)}</p><div class="template-meta"><span>◷ ${tpl.duration} мин</span><span>▤ ${tpl.exercises.length} ${plural(tpl.exercises.length, ['упражнение', 'упражнения', 'упражнений'])}</span><span>◉ ${escapeHtml(tpl.level)}</span></div><button class="btn btn-ghost" data-action="use-template" data-id="${escapeHtml(tpl.id)}">Выбрать и изменить <span class="arrow">↗</span></button></article>`).join('');
    const byDate = new Map();
    state.workouts.forEach(workout => { const key = workout.date || 'Без даты'; if (!byDate.has(key)) byDate.set(key, []); byDate.get(key).push(workout); });
    const historyMarkup = [...byDate.entries()].map(([day, dayWorkouts]) => `<section class="history-date-group"><div class="history-date-heading">${escapeHtml(dateGroupTitle(day))}<span>${dayWorkouts.length} ${plural(dayWorkouts.length, ['занятие', 'занятия', 'занятий'])}</span></div>${dayWorkouts.map(workout => {
      const d = new Date(`${day}T12:00:00`);
      const count = workout.exercises?.length || 0;
      const volume = (workout.exercises || []).reduce((sum, item) => sum + Number(item.sets || 0) * Number(item.reps || 0) * Number(item.weight_kg || 0), 0);
      return `<article class="history-workout"><div class="history-date-tile"><b>${Number.isNaN(d.getTime()) ? '—' : d.getDate()}</b><small>${Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')}</small></div><div class="history-workout-thumb" aria-hidden="true">${exerciseCoverMarkup({ name: workout.title, category: workout.title }, 'history-cover')}</div><div class="history-info"><h3>${escapeHtml(workout.title)}</h3><p>${escapeHtml(workoutSummaryLine(workout))}</p></div><div class="history-metrics"><div class="history-metric"><b>${escapeHtml(workout.time || '—')}</b><small>Время начала</small></div><div class="history-metric"><b>${fmtNumber(workout.duration_minutes || 0)} мин</b><small>Длительность</small></div><div class="history-metric"><b>${count}</b><small>Упражнения</small></div>${volume ? `<div class="history-metric"><b>${fmtNumber(volume)} кг</b><small>Объём</small></div>` : ''}</div><div class="history-actions"><button class="mini-icon-btn" title="Подробности" aria-label="Подробности" data-action="workout-detail" data-id="${escapeHtml(workout.id)}">⌕</button><button class="mini-icon-btn" title="Изменить" aria-label="Изменить" data-action="edit-workout" data-id="${escapeHtml(workout.id)}">✎</button><button class="mini-icon-btn" title="Удалить" aria-label="Удалить" data-action="delete-workout" data-id="${escapeHtml(workout.id)}">×</button></div></article>`;
    }).join('')}</section>`).join('');
    root.innerHTML = `${headerBlock('ТВОЯ СПОРТИВНАЯ ИСТОРИЯ', 'Тренировки', 'Сохраняй занятия, возвращайся к результатам и собирай свою историю прогресса.', `<button class="btn btn-dark" data-route="create-workout">＋ Записать тренировку</button>`)}
      <section class="panel panel-pad" style="margin-bottom:23px"><div class="panel-heading"><div><h3>Готовые шаблоны</h3><p>Возьми основу, настрой под себя или начни с чистого листа.</p></div><span class="pill">${state.templates.length} ${plural(state.templates.length, ['шаблон', 'шаблона', 'шаблонов'])}</span></div><div class="template-grid">${templateMarkup}</div></section>
      ${calendarMarkup(state.workouts)}
      <div class="panel-heading" style="margin:21px 0 6px"><div><h3 style="font-size:17px;margin:0 0 4px">Полная история занятий</h3><p style="font-size:10px;color:#889386;margin:0">${state.workouts.length} ${plural(state.workouts.length, ['сохранённая тренировка', 'сохранённые тренировки', 'сохранённых тренировок'])}</p></div><button class="text-link" data-action="export-workouts">Экспортировать JSON ↓</button></div>
      ${state.workouts.length ? historyMarkup : `<div class="panel empty-state" style="margin-top:15px"><div class="empty-symbol">▤</div><h3>История пока пуста</h3><p>Запиши первую тренировку или выбери шаблон выше. Все результаты будут собраны здесь по датам.</p><button class="btn btn-dark" data-route="create-workout">Создать первую тренировку</button></div>`}`;
  }

  function renderExerciseSelect(selected = '') {
    return `<select class="form-control exercise-select" data-field="exercise_id" aria-label="Упражнение" required><option value="">Выбери упражнение</option>${state.exercises.map(ex => `<option value="${escapeHtml(ex.id)}" ${ex.id === selected ? 'selected' : ''}>${escapeHtml(ex.name)} · ${escapeHtml(ex.muscle_group)}</option>`).join('')}</select>`;
  }
  function workoutExerciseRow(item = {}, explicitIndex = null) {
    const index = explicitIndex ?? ($$('#exerciseEntries [data-exercise-row]').length + 1);
    return `<article class="exercise-entry" data-exercise-row><div class="exercise-entry-head"><span class="exercise-entry-num">${index.toString().padStart(2, '0')}</span><span class="exercise-entry-title">Упражнение ${index}</span><button type="button" class="mini-icon-btn" data-action="remove-workout-exercise" title="Удалить упражнение">×</button></div><div class="form-group" style="margin-bottom:11px">${renderExerciseSelect(item.exercise_id || '')}</div><div class="exercise-entry-fields">
      <label>Подходы<input class="form-control" type="number" data-field="sets" min="0" max="30" step="1" value="${Number(item.sets || 0)}" aria-label="Подходы"></label>
      <label>Повторения<input class="form-control" type="number" data-field="reps" min="0" max="500" step="1" value="${Number(item.reps || 0)}" aria-label="Повторения"></label>
      <label>Вес, кг<input class="form-control" type="number" data-field="weight_kg" min="0" max="1000" step="0.5" value="${Number(item.weight_kg || 0)}" aria-label="Вес в килограммах"></label>
      <label>Время, мин<input class="form-control" type="number" data-field="duration_min" min="0" max="1440" step="0.5" value="${Number(item.duration_min || 0)}" aria-label="Время в минутах"></label>
      <label>Дистанция, км<input class="form-control" type="number" data-field="distance_km" min="0" max="1000" step="0.1" value="${Number(item.distance_km || 0)}" aria-label="Дистанция в километрах"></label>
    </div></article>`;
  }
  async function renderCreateWorkout(renderId) {
    const [exercisePayload, templatePayload] = await Promise.all([api('/api/exercises'), api('/api/templates')]);
    if (renderId !== state.renderId) return;
    state.exercises = exercisePayload.exercises || [];
    state.templates = templatePayload.templates || [];
    let editing = null;
    if (state.editingWorkout) {
      editing = state.workouts.find(w => w.id === state.editingWorkout) || (await api(`/api/workouts/${encodeURIComponent(state.editingWorkout)}`)).workout;
    }
    const selectedTemplate = !editing && state.selectedTemplate ? state.templates.find(t => t.id === state.selectedTemplate) : null;
    const initial = editing?.exercises || selectedTemplate?.exercises || [{ exercise_id: 'ex-squat', sets: 3, reps: 10, weight_kg: 0, duration_min: 0, distance_km: 0 }];
    const title = editing?.title || selectedTemplate?.name || '';
    const defaultDuration = editing?.duration_minutes ?? selectedTemplate?.duration ?? 45;
    root.innerHTML = `${headerBlock(editing ? 'ИЗМЕНЕНИЕ ЗАПИСИ' : 'ЗАПИШИ СВОЙ ШАГ', editing ? 'Изменить тренировку' : 'Новая тренировка', 'Внеси результаты — краткая сводка справа будет обновляться вместе с формой.', `<button class="btn btn-ghost" data-route="workouts">← К истории</button>`)}
      ${selectedTemplate ? `<div class="selected-template-banner"><span>✳</span><div><b>Шаблон: ${escapeHtml(selectedTemplate.name)}</b> · Можно менять любые упражнения и значения.</div><button data-action="clear-template" title="Убрать шаблон">×</button></div>` : ''}
      <div class="workout-layout"><form id="workoutForm" class="panel form-panel" novalidate><h3>Детали занятия</h3><p class="form-panel-intro">Сохраняй только нужные тебе показатели. Для неподходящих полей оставляй ноль.</p><div class="form-grid-2"><div class="form-group"><label for="workoutTitle">Название тренировки</label><input id="workoutTitle" name="title" class="form-control" maxlength="80" placeholder="Например, Силовая база" value="${escapeHtml(title)}" required></div><div class="form-group"><label for="workoutDate">Дата</label><input id="workoutDate" name="date" class="form-control" type="date" value="${escapeHtml(editing?.date || dateInputValue())}" required></div></div><div class="form-grid-2" style="margin-top:14px"><div class="form-group"><label for="workoutTime">Время начала</label><input id="workoutTime" name="time" class="form-control" type="time" value="${escapeHtml(editing?.time || selectedTemplate?.time || '09:00')}" required></div><div class="form-group"><label for="workoutDuration">Длительность, минут</label><input id="workoutDuration" name="duration_minutes" class="form-control" type="number" min="0" max="600" step="1" value="${Number(defaultDuration)}"></div><div class="form-group workout-notes-field" style="margin-top:0"><label for="workoutNotes">Заметка (необязательно)</label><input id="workoutNotes" name="notes" class="form-control" maxlength="1000" placeholder="Самочувствие, цель или комментарий" value="${escapeHtml(editing?.notes || '')}"></div></div><div class="divider"></div><div class="panel-heading"><div><h3>Упражнения</h3><p>Для каждого упражнения можно записать разные результаты.</p></div><span class="pill" id="exerciseCountPill">${initial.length} в списке</span></div><div id="exerciseEntries">${initial.map((item, index) => workoutExerciseRow(item, index + 1)).join('')}</div><div class="add-exercise-row"><button type="button" class="text-link" data-action="add-workout-exercise">＋ Добавить упражнение</button><button type="button" class="text-link" data-action="browse-exercises">Найти в каталоге ↗</button></div><div class="form-actions"><span class="form-hint">${editing ? 'Изменения обновят историю и графики.' : 'За сохранённую тренировку начисляется +40 XP.'}</span><button type="submit" class="btn btn-dark">${editing ? 'Сохранить изменения' : 'Сохранить тренировку'} <span class="arrow">↗</span></button></div></form>
      <aside class="panel summary-panel"><div class="panel-heading"><div><h3>Сводка занятия</h3><p>Обновляется при заполнении формы</p></div><span class="pill pill-lime">ОБНОВЛЯЕТСЯ</span></div><div class="summary-primary"><span>Длительность занятия</span><strong id="summaryDuration">${Number(defaultDuration)} <small>мин</small></strong></div><div class="summary-stat-grid"><div class="summary-stat"><span>Упражнения</span><b id="summaryExercises">${initial.length}</b></div><div class="summary-stat"><span>Всего подходов</span><b id="summarySets">${initial.reduce((sum, x) => sum + Number(x.sets || 0), 0)}</b></div><div class="summary-stat"><span>Повторения</span><b id="summaryReps">${initial.reduce((sum, x) => sum + Number(x.reps || 0) * Math.max(1, Number(x.sets || 0)), 0)}</b></div><div class="summary-stat"><span>Объём с весом</span><b id="summaryVolume">${fmtNumber(initial.reduce((sum, x) => sum + Number(x.weight_kg || 0) * Number(x.reps || 0) * Number(x.sets || 0), 0))} <small>кг</small></b></div></div><div class="summary-exercise-list"><span>В СПИСКЕ</span><div id="summaryExerciseNames">${initial.map((item, i) => `<div class="summary-exercise-item"><i>${i + 1}</i><b>${escapeHtml(state.exercises.find(e => e.id === item.exercise_id)?.name || item.name || 'Упражнение')}</b><small>${Number(item.sets || 0)} подх.</small></div>`).join('')}</div></div><div class="divider"></div><div class="security-note"><i>✦</i><span>После сохранения показатели появятся в истории, статистике, личных рекордах и рейтинге.</span></div></aside></div>`;
    updateWorkoutSummary();
  }
  function getWorkoutFormPayload() {
    const form = $('#workoutForm');
    if (!form) return null;
    const exercises = $$('.exercise-entry', form).map(row => {
      const result = {};
      $$('[data-field]', row).forEach(input => { result[input.dataset.field] = input.value; });
      return result;
    });
    return { title: $('#workoutTitle')?.value.trim(), date: $('#workoutDate')?.value, time: $('#workoutTime')?.value || '09:00', duration_minutes: Number($('#workoutDuration')?.value || 0), notes: $('#workoutNotes')?.value.trim() || '', exercises };
  }
  function updateWorkoutSummary() {
    const form = $('#workoutForm');
    if (!form) return;
    const rows = $$('.exercise-entry', form);
    let sets = 0, reps = 0, volume = 0;
    const names = [];
    rows.forEach((row, i) => {
      const val = field => Number($(`[data-field="${field}"]`, row)?.value || 0);
      const select = $('[data-field="exercise_id"]', row);
      const name = select?.selectedOptions?.[0]?.textContent.split(' · ')[0] || 'Упражнение';
      sets += val('sets'); reps += val('sets') * val('reps'); volume += val('sets') * val('reps') * val('weight_kg');
      $('.exercise-entry-num', row).textContent = String(i + 1).padStart(2, '0');
      $('.exercise-entry-title', row).textContent = `Упражнение ${i + 1}`;
      names.push(`<div class="summary-exercise-item"><i>${i + 1}</i><b>${escapeHtml(name)}</b><small>${val('sets')} подх.</small></div>`);
    });
    $('#exerciseCountPill').textContent = `${rows.length} в списке`;
    $('#summaryExercises').textContent = rows.length;
    $('#summarySets').textContent = fmtNumber(sets, 0);
    $('#summaryReps').textContent = fmtNumber(reps, 0);
    $('#summaryVolume').innerHTML = `${fmtNumber(volume)} <small>кг</small>`;
    $('#summaryDuration').innerHTML = `${fmtNumber($('#workoutDuration')?.value || 0, 0)} <small>мин</small>`;
    $('#summaryExerciseNames').innerHTML = names.join('') || '<span class="muted">Добавь первое упражнение</span>';
  }
  async function submitWorkout(form) {
    const payload = getWorkoutFormPayload();
    if (!payload.title || payload.title.length < 1) { showToast('Добавь название тренировки.', 'error'); $('#workoutTitle')?.focus(); return; }
    if (!payload.date) { showToast('Выбери дату занятия.', 'error'); $('#workoutDate')?.focus(); return; }
    if (!payload.exercises.length || payload.exercises.some(x => !x.exercise_id)) { showToast('Для каждой строки выбери упражнение.', 'error'); return; }
    const submit = $('button[type="submit"]', form);
    const originalText = submit.textContent;
    submit.disabled = true; submit.textContent = 'Сохраняем…';
    try {
      const result = state.editingWorkout
        ? await api(`/api/workouts/${encodeURIComponent(state.editingWorkout)}`, { method: 'PUT', body: payload })
        : await api('/api/workouts', { method: 'POST', body: payload });
      state.editingWorkout = null; state.selectedTemplate = null;
      await routeTo('workouts');
      showToast(result.message || 'Тренировка сохранена.');
      if (result.level_up) showModal(`<div class="new-achievement-modal"><div class="new-achievement-burst">🚀</div><div class="eyebrow"><span class="eyebrow-dot"></span> НОВЫЙ УРОВЕНЬ</div><h2>Уровень ${fmtNumber(result.level_up.level || result.level_up)}</h2><p>Отличная работа! Ты получил новый уровень за свои занятия.</p><div class="modal-actions" style="justify-content:center"><button class="btn btn-dark" data-action="close-modal">Продолжить</button></div></div>`);
      if (result.new_records?.length) showToast(`Новый личный рекорд: ${result.new_records.map(r => r.name || 'упражнение').join(', ')}`, 'success', '🏆 Личный рекорд!');
      if (result.new_achievements?.length) showAchievement(result.new_achievements);
    } catch (error) {
      showToast(error.message, 'error');
      submit.disabled = false; submit.textContent = originalText;
    }
  }

  async function renderExercises(renderId) {
    const payload = await api('/api/exercises');
    if (renderId !== state.renderId) return;
    state.exercises = payload.exercises || [];
    const muscleGroups = ['Все группы', ...(payload.muscle_groups || [])];
    root.innerHTML = `${headerBlock('КАТАЛОГ ДВИЖЕНИЙ', 'Упражнения', 'Ищи упражнения по названию и группе мышц. Сохраняй собственные варианты и возвращайся к инструкциям.', `<button class="btn btn-dark" data-action="add-custom-exercise">＋ Добавить упражнение</button>`)}
      <div class="catalog-toolbar"><div class="search-wrap"><span class="search-symbol">⌕</span><input class="form-control" id="exerciseSearch" type="search" placeholder="Найти упражнение или мышцу…" aria-label="Поиск упражнений"></div><select class="small-select" id="muscleFilter" aria-label="Группа мышц">${muscleGroups.map(group => `<option>${escapeHtml(group)}</option>`).join('')}</select><select class="small-select" id="categoryFilter" aria-label="Тип нагрузки"><option>Все направления</option><option>Сила</option><option>Кардио</option><option>Выносливость</option><option>Восстановление</option></select></div>
      <div class="panel-heading" style="margin-bottom:12px"><div><h3 style="font-size:14px;margin:0 0 4px">Найди своё движение</h3><p style="font-size:10px;color:#899387;margin:0"><span id="exerciseCount">${state.exercises.length}</span> упражнений в каталоге · <span id="machineExerciseCount">${state.exercises.filter(ex => ex.is_machine).length}</span> на тренажёрах</p></div><span class="pill">Обновляется при поиске</span></div><div class="catalog-grid" id="exerciseGrid">${exerciseCards(state.exercises)}</div><div id="exerciseEmpty" class="panel empty-state hidden" style="margin-top:12px"><div class="empty-symbol">⌕</div><h3>Ничего не найдено</h3><p>Измени поисковый запрос или выбери другую группу мышц.</p><button class="btn btn-ghost" data-action="clear-exercise-filters">Сбросить фильтры</button></div>`;
  }
  // Exercise images are loaded from RepDB's public flat-illustration collection.
  // Keep this as image URLs (not generated inline SVG) so cards and details use the
  // same real internet-hosted artwork. Unknown/custom exercises receive a relevant fallback.
  const EXERCISE_IMAGE_ROOT = 'https://exercise-dataset.com/images/flat/';
  const EXERCISE_IMAGE_FALLBACK = 'plank-main.webp';
  const EXERCISE_ART_BY_ID = {
    'ex-pushup': 'push-up',
    'ex-squat': 'bodyweight-squat',
    'ex-plank': 'plank',
    'ex-pullup': 'pull-up',
    'ex-bench': 'bench-press',
    'ex-deadlift': 'deadlift',
    'ex-row': 'bent-over-dumbbell-row',
    'ex-lunge': 'lunge',
    'ex-curl': 'seated-dumbbell-curl',
    'ex-press': 'dumbbell-shoulder-press',
    'ex-run': 'treadmill-running',
    'ex-walk': 'treadmill-running',
    'ex-bike': 'stationary-bike',
    'ex-jump': 'jump-rope',
    'ex-crunch': 'crunches',
    'ex-bridge': 'glute-bridge',
    'ex-lat-pulldown': 'lat-pulldown',
    'ex-shoulder-raise': 'lateral-raise',
    'ex-rower': 'rowing-machine',
    'ex-stretch': 'cat-cow',
    'ex-floor-press': 'dumbbell-floor-press',
    'ex-incline-pushup': 'incline-push-ups',
    'ex-dips': 'dips',
    'ex-chest-fly': 'db-fly',
    'ex-bent-row': 'barbell-row',
    'ex-one-arm-lat': 'one-arm-lat-pulldown',
    'ex-superman': 'superman',
    'ex-face-pull': 'face-pull',
    'ex-front-raise': 'dumbbell-front-raise',
    'ex-rear-delt': 'rear-delt-fly',
    'ex-triceps': 'tricep-pushdown',
    'ex-hammer-curl': 'cross-body-hammer-curl',
    'ex-wrist-curl': 'db-reverse-wrist-curl',
    'ex-calf-raise': 'bodyweight-calf-raise',
    'ex-step-up': 'step-ups',
    'ex-rdl': 'romanian-deadlift',
    'ex-leg-raise': 'lying-leg-raise',
    'ex-bicycle-crunch': 'bicycle-crunch',
    'ex-mountain-climber': 'mountain-climbers',
    'ex-burpee': 'burpees',
    'ex-jumping-jacks': 'jumping-jacks',
    'ex-high-knees': 'high-knees',
    'ex-elliptical': 'stationary-bike',
    'ex-swimming': 'rowing-machine',
    'ex-hiking': 'treadmill-running',
    'ex-deadbug': 'dead-bug',
    'ex-bird-dog': 'bird-dog',
    'ex-cat-cow': 'cat-cow',
    'ex-hip-flexor-stretch': '90-90-hold',
    'ex-thoracic-rotation': 'cat-cow',
    'ex-machine-chest-press': 'chest-press',
    'ex-pec-deck': 'chest-fly',
    'ex-incline-chest-press': 'incline-chest-press',
    'ex-lat-machine-pulldown': 'lat-pulldown',
    'ex-seated-cable-row': 'seated-cable-row',
    'ex-chest-supported-row': 'chest-supported-row',
    'ex-machine-shoulder-press': 'machine-shoulder-press',
    'ex-reverse-pec-deck': 'reverse-pec-deck',
    'ex-cable-lateral-raise': 'cable-lateral-raise',
    'ex-machine-biceps-curl': 'machine-biceps-curl',
    'ex-cable-triceps': 'triceps-pushdown',
    'ex-assisted-pullup': 'assisted-pull-up',
    'ex-assisted-dip': 'assisted-dip',
    'ex-leg-press': 'leg-press',
    'ex-leg-extension': 'leg-extension',
    'ex-seated-leg-curl': 'seated-leg-curl',
    'ex-lying-leg-curl': 'lying-leg-curl',
    'ex-hip-abduction': 'hip-abduction',
    'ex-hip-adduction': 'hip-adduction',
    'ex-calf-press': 'calf-press',
    'ex-hack-squat': 'hack-squat',
    'ex-smith-squat': 'smith-machine-squat',
    'ex-back-extension-machine': 'back-extension',
    'ex-hip-thrust-machine': 'hip-thrust',
    'ex-machine-crunch': 'machine-crunch',
    'ex-hip-abductor-standing': 'cable-kickback',
    'ex-cable-woodchop': 'cable-woodchop',
  };
  const EXERCISE_GIF_BY_ID = {
    'ex-pushup': ['chest', 'push-up'],
    'ex-squat': ['legs', 'bodyweight-squat'],
    'ex-plank': ['core', 'plank'],
    'ex-pullup': ['back', 'pull-up'],
    'ex-bench': ['chest', 'barbell-bench-press'],
    'ex-deadlift': ['back', 'barbell-deadlift'],
    'ex-row': ['back', 'dumbbell-row'],
    'ex-lunge': ['legs', 'lunges'],
    'ex-curl': ['biceps', 'dumbbell-curl'],
    'ex-press': ['shoulders', 'dumbbell-shoulder-press'],
    'ex-run': ['cardio', 'treadmill-running'],
    'ex-walk': ['cardio', 'walking'],
    'ex-bike': ['cardio', 'stationary-bike'],
    'ex-jump': ['cardio', 'jump-rope'],
    'ex-crunch': ['core', 'crunches'],
    'ex-bridge': ['glutes', 'glute-bridge'],
    'ex-lat-pulldown': ['back', 'lat-pulldown'],
    'ex-shoulder-raise': ['shoulders', 'lateral-raise'],
    'ex-rower': ['cardio', 'rowing-machine'],
    'ex-stretch': ['stretching', 'standing-hamstring-stretch'],
    'ex-floor-press': ['chest', 'dumbbell-floor-press'],
    'ex-incline-pushup': ['chest', 'incline-push-up'],
    'ex-dips': ['chest', 'triceps-dips'],
    'ex-chest-fly': ['chest', 'dumbbell-fly'],
    'ex-bent-row': ['back', 'barbell-row'],
    'ex-one-arm-lat': ['back', 'one-arm-lat-pulldown'],
    'ex-superman': ['back', 'superman'],
    'ex-face-pull': ['shoulders', 'face-pull'],
    'ex-front-raise': ['shoulders', 'dumbbell-front-raise'],
    'ex-rear-delt': ['shoulders', 'reverse-fly'],
    'ex-triceps': ['triceps', 'triceps-pushdown'],
    'ex-hammer-curl': ['biceps', 'hammer-curl'],
    'ex-wrist-curl': ['forearms', 'wrist-curl'],
    'ex-calf-raise': ['legs', 'standing-calf-raise'],
    'ex-step-up': ['legs', 'step-up'],
    'ex-rdl': ['legs', 'romanian-deadlift'],
    'ex-leg-raise': ['core', 'lying-leg-raise'],
    'ex-bicycle-crunch': ['core', 'bicycle-crunch'],
    'ex-mountain-climber': ['cardio', 'mountain-climber'],
    'ex-burpee': ['cardio', 'burpee'],
    'ex-jumping-jacks': ['cardio', 'jumping-jacks'],
    'ex-high-knees': ['cardio', 'high-knees'],
    'ex-elliptical': ['cardio', 'elliptical-machine'],
    'ex-swimming': ['cardio', 'swimming'],
    'ex-hiking': ['cardio', 'walking'],
    'ex-deadbug': ['core', 'dead-bug'],
    'ex-bird-dog': ['back', 'bird-dog'],
    'ex-cat-cow': ['stretching', 'cat-cow'],
    'ex-hip-flexor-stretch': ['stretching', 'hip-flexor-stretch'],
    'ex-thoracic-rotation': ['stretching', 'thoracic-rotation'],
    'ex-machine-chest-press': ['chest', 'chest-press'],
    'ex-pec-deck': ['chest', 'chest-fly'],
    'ex-incline-chest-press': ['chest', 'incline-chest-press'],
    'ex-lat-machine-pulldown': ['back', 'lat-pulldown'],
    'ex-seated-cable-row': ['back', 'seated-cable-row'],
    'ex-chest-supported-row': ['back', 'chest-supported-row'],
    'ex-machine-shoulder-press': ['shoulders', 'machine-shoulder-press'],
    'ex-reverse-pec-deck': ['chest', 'reverse-pec-deck'],
    'ex-cable-lateral-raise': ['shoulders', 'cable-lateral-raise'],
    'ex-machine-biceps-curl': ['biceps', 'machine-biceps-curl'],
    'ex-cable-triceps': ['triceps', 'triceps-pushdown'],
    'ex-assisted-pullup': ['back', 'assisted-pull-up'],
    'ex-assisted-dip': ['chest', 'assisted-dip'],
    'ex-leg-press': ['legs', 'leg-press'],
    'ex-leg-extension': ['legs', 'leg-extension'],
    'ex-seated-leg-curl': ['legs', 'seated-leg-curl'],
    'ex-lying-leg-curl': ['legs', 'lying-leg-curl'],
    'ex-hip-abduction': ['legs', 'hip-abduction'],
    'ex-hip-adduction': ['legs', 'hip-adduction'],
    'ex-calf-press': ['legs', 'calf-press'],
    'ex-hack-squat': ['legs', 'hack-squat'],
    'ex-smith-squat': ['legs', 'smith-machine-squat'],
    'ex-back-extension-machine': ['back', 'back-extension'],
    'ex-hip-thrust-machine': ['legs', 'hip-thrust'],
    'ex-machine-crunch': ['core', 'machine-crunch'],
    'ex-hip-abductor-standing': ['legs', 'cable-kickback'],
    'ex-cable-woodchop': ['core', 'cable-woodchop'],
  };
  const EXERCISE_ART_MAIN = new Set([
    'plank', 'treadmill-running', 'stationary-bike', 'jump-rope',
    'rowing-machine', 'cat-cow', 'high-knees', '90-90-hold', 'burpees'
  ]);

  function exerciseArtSlug(entity = {}) {
    const id = String(entity.id || '').toLowerCase();
    if (EXERCISE_ART_BY_ID[id]) return EXERCISE_ART_BY_ID[id];
    const text = `${entity.name || ''} ${entity.title || ''} ${entity.goal || ''} ${entity.category || ''} ${entity.muscle_group || ''}`.toLowerCase();
    // Intent-specific choice for workout templates, history entries and user-created moves.
    if (/растяж|восстанов|мобил|размин|кошк|гибк|hip flexor/.test(text)) return 'cat-cow';
    if (/планк|корпус|пресс|dead.?bug|core/.test(text)) return 'dead-bug';
    if (/бег|ходьб|кардио|вынослив|интервал|плаван|эллипс|велотренаж|прогул/.test(text)) return 'treadmill-running';
    if (/скакал/.test(text)) return 'jump-rope';
    if (/груд|жим лёжа|жим лежа|отжим|силов/.test(text)) return /отжим/.test(text) ? 'push-up' : 'bench-press';
    if (/спин|тяга|подтяг|греб/.test(text)) return 'lat-pulldown';
    if (/ног|присед|выпад|ягод|step.?up/.test(text)) return 'bodyweight-squat';
    if (/плеч|рук|бицеп|трицеп/.test(text)) return 'dumbbell-shoulder-press';
    return 'bodyweight-squat';
  }

  function exerciseArtPaths(entity = {}) {
    const slug = exerciseArtSlug(entity);
    if (EXERCISE_ART_MAIN.has(slug)) return { slug, main: `${slug}-main.webp` };
    return { slug, start: `${slug}-start.webp`, peak: `${slug}-peak.webp` };
  }

  function remoteExerciseImg(file, alt, extraClass = '') {
    const safeAlt = escapeHtml(alt || 'Иллюстрация упражнения');
    const src = `${EXERCISE_IMAGE_ROOT}${file}`;
    const fallback = '/static/images/exercise-fallback.png';
    return `<img class="remote-exercise-img ${extraClass}" src="${src}" alt="${safeAlt}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fallback}';this.classList.add('remote-exercise-img-fallback');this.alt='Иллюстрация временно недоступна'">`;
  }

  function exerciseImagesMarkup(entity = {}, detailed = false) {
    const art = exerciseArtPaths(entity);
    const name = entity.name || entity.title || 'Упражнение';
    const gifParts = EXERCISE_GIF_BY_ID[entity.id];
    const gifMarkup = gifParts ? `<figure class="exercise-gif-stage"><img src="https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0/${gifParts[0]}/${gifParts[1]}.gif" alt="GIF-анимация упражнения «${escapeHtml(name)}»" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest('figure').classList.add('gif-unavailable');this.remove()"><figcaption>GIF: техника движения</figcaption></figure>` : '';
    if (art.main) {
      return `<div class="internet-exercise-images ${detailed ? 'is-detailed' : ''} is-single" aria-label="Иллюстрация: ${escapeHtml(name)}"><figure class="internet-exercise-stage">${remoteExerciseImg(art.main, `${name}: иллюстрация упражнения`)}${detailed ? '<figcaption>Положение и техника</figcaption>' : ''}</figure>${gifMarkup}</div>`;
    }
    return `<div class="internet-exercise-images ${detailed ? 'is-detailed' : ''} is-pair" aria-label="Два положения упражнения: ${escapeHtml(name)}"><figure class="internet-exercise-stage">${remoteExerciseImg(art.start, `${name}: исходное положение`)}<figcaption>Начало</figcaption></figure><span class="internet-exercise-step" aria-hidden="true">→</span><figure class="internet-exercise-stage">${remoteExerciseImg(art.peak, `${name}: основная фаза движения`)}<figcaption>Движение</figcaption></figure>${gifMarkup}</div>`;
  }

  function exerciseCoverMarkup(entity = {}, extraClass = '') {
    const art = exerciseArtPaths(entity);
    const name = entity.name || entity.title || 'Тренировка';
    const file = art.main || art.peak;
    return `<div class="internet-exercise-cover ${extraClass}">${remoteExerciseImg(file, `Иллюстрация: ${name}`)}</div>`;
  }

  function exerciseCards(exercises) {
    return exercises.map(ex => `<article class="panel exercise-card"><div class="exercise-art">${exerciseImagesMarkup(ex, false)}</div><h3>${escapeHtml(ex.name)}</h3><div class="exercise-meta"><span class="pill">${escapeHtml(ex.muscle_group)}</span><span class="pill ${ex.category === 'Кардио' ? 'pill-orange' : ''}">${escapeHtml(ex.category)}</span></div><p>${escapeHtml(ex.description || 'Добавь упражнение в тренировку и отслеживай свой результат.')}</p><div class="exercise-card-bottom"><span class="pill pill-dark">${escapeHtml(metricFor(ex))}</span><div style="display:flex;gap:5px;align-items:center"><button class="btn btn-ghost" data-action="exercise-detail" data-id="${escapeHtml(ex.id)}">Подробнее</button>${ex.owner_id ? `<button class="mini-icon-btn" data-action="edit-custom-exercise" data-id="${escapeHtml(ex.id)}" title="Изменить">✎</button><button class="mini-icon-btn" data-action="delete-custom-exercise" data-id="${escapeHtml(ex.id)}" title="Удалить">×</button>` : ''}</div></div></article>`).join('');
  }
  function filterExerciseGrid() {
    const query = ($('#exerciseSearch')?.value || '').trim().toLowerCase();
    const muscle = $('#muscleFilter')?.value || 'Все группы';
    const category = $('#categoryFilter')?.value || 'Все направления';
    const filtered = state.exercises.filter(ex => (!query || `${ex.name} ${ex.description} ${ex.muscle_group}`.toLowerCase().includes(query)) && (muscle === 'Все группы' || ex.muscle_group === muscle) && (category === 'Все направления' || ex.category === category));
    $('#exerciseGrid').innerHTML = exerciseCards(filtered);
    $('#exerciseCount').textContent = filtered.length;
    const machineCount = $('#machineExerciseCount'); if (machineCount) machineCount.textContent = filtered.filter(ex => ex.is_machine).length;
    $('#exerciseEmpty').classList.toggle('hidden', filtered.length > 0);
  }
  function exerciseDetail(ex) {
    showModal(`<div class="eyebrow"><span class="eyebrow-dot"></span> КАРТОЧКА УПРАЖНЕНИЯ</div><div class="exercise-detail-layout" style="margin-top:20px"><div class="exercise-detail-art exercise-detail-diagram">${exerciseImagesMarkup(ex, true)}</div><div><span class="pill">${escapeHtml(ex.muscle_group)}</span><h3>${escapeHtml(ex.name)}</h3><p>${escapeHtml(ex.description || 'Описание пока не добавлено.')}</p><div class="exercise-meta"><span class="pill pill-dark">${escapeHtml(ex.category)}</span><span class="pill pill-purple">${escapeHtml(metricFor(ex))}</span></div></div></div><div class="instruction-box"><b>Как выполнять</b>${escapeHtml(ex.instructions || 'Выполняй движение контролируемо, выбирай комфортную нагрузку и ориентируйся на правильную технику.')}</div><div class="detail-list" style="margin-top:12px"><div class="detail-list-row"><span>Оборудование</span><b>${escapeHtml(ex.equipment || 'Не указано')}</b></div>${ex.owner_id ? '<div class="detail-list-row"><span>Источник</span><b>Твоё упражнение</b></div>' : ''}</div>${ex.video_url ? `<div style="margin-top:15px"><a class="btn btn-ghost" href="${escapeHtml(ex.video_url)}" target="_blank" rel="noopener noreferrer">Открыть видеоинструкцию ↗</a></div>` : ''}<div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Закрыть</button><button class="btn btn-dark" data-action="use-exercise" data-id="${escapeHtml(ex.id)}">Добавить в тренировку ↗</button></div>`);
  }
  function openExerciseForm(ex = null) {
    const editing = Boolean(ex);
    showModal(`<div class="eyebrow"><span class="eyebrow-dot"></span> ТВОЙ КАТАЛОГ</div><h2>${editing ? 'Изменить упражнение' : 'Новое упражнение'}</h2><p class="modal-subtitle">Добавь движение, которого не хватает в общем каталоге.</p><form id="customExerciseForm" data-edit-id="${escapeHtml(ex?.id || '')}" class="stack-form"><label>Название<input class="form-control" name="name" maxlength="60" required value="${escapeHtml(ex?.name || '')}" placeholder="Например, жим гантелей"></label><div class="profile-two-col"><label>Группа мышц<select class="form-control" name="muscle_group" required>${['Грудь','Спина','Ноги','Руки','Плечи','Корпус','Всё тело'].map(x => `<option ${ex?.muscle_group === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>Направление<select class="form-control" name="category">${['Сила','Кардио','Выносливость','Восстановление'].map(x => `<option ${ex?.category === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div><label>Основной показатель<select class="form-control" name="metric">${[['reps','Повторения'],['weight','Вес в килограммах'],['duration','Время в минутах'],['distance','Дистанция в километрах']].map(([v,l]) => `<option value="${v}" ${ex?.metric === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Описание<textarea class="form-control" name="description" rows="2" maxlength="500" placeholder="Для чего это упражнение?">${escapeHtml(ex?.description || '')}</textarea></label><label>Подсказка по технике<textarea class="form-control" name="instructions" rows="2" maxlength="1000" placeholder="Короткая инструкция">${escapeHtml(ex?.instructions || '')}</textarea></label><label>Ссылка на видеоинструкцию (необязательно)<input class="form-control" type="url" name="video_url" value="${escapeHtml(ex?.video_url || '')}" placeholder="https://…"></label><label>Оборудование<input class="form-control" name="equipment" maxlength="80" value="${escapeHtml(ex?.equipment || 'Без оборудования')}"></label><div class="modal-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Отмена</button><button class="btn btn-dark" type="submit">${editing ? 'Сохранить' : 'Добавить упражнение'} ↗</button></div></form>`);
  }

  async function renderStatistics(renderId) {
    const period = state.statsPeriod;
    const [statsPayload, exercisePayload] = await Promise.all([api(`/api/stats?period=${encodeURIComponent(period)}${period === 'custom' ? `&start=${encodeURIComponent(state.statsCustomStart || '')}&end=${encodeURIComponent(state.statsCustomEnd || '')}` : ''}`), api('/api/exercises')]);
    if (renderId !== state.renderId) return;
    state.stats = statsPayload;
    state.exercises = exercisePayload.exercises || [];
    if (!state.statsExercise && statsPayload.progression.length) state.statsExercise = statsPayload.progression[0].exercise_id;
    const summary = statsPayload.summary;
    const progression = statsPayload.progression;
    const selectedProgress = progression.find(x => x.exercise_id === state.statsExercise) || progression[0];
    const start = statsPayload.start ? fmtDate(statsPayload.start, { day: 'numeric', month: 'short', year: 'numeric' }) : 'за всё время';
    const end = fmtDate(statsPayload.end, { day: 'numeric', month: 'short', year: 'numeric' });
    const periods = [['7d','7 дней'],['30d','30 дней'],['year','Год'],['all','Всё время'],['custom','Период']];
    root.innerHTML = `${headerBlock('АНАЛИЗ ТВОЕЙ АКТИВНОСТИ', 'Статистика', 'Смотри, как меняется регулярность и результаты. Каждый показатель отображается в своих единицах измерения.', `<button class="btn btn-ghost" data-action="export-stats">Экспортировать данные ↓</button>`)}
      <div class="stats-topline"><div class="period-switch">${periods.map(([v,l]) => `<button class="${period === v ? 'active' : ''}" data-action="stats-period" data-period="${v}">${l}</button>`).join('')}</div><span class="pill">${start} — ${end}</span></div>
      ${period === 'custom' ? `<div class="panel panel-pad" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:15px"><label class="form-label" style="min-width:150px">С <input id="statsStart" class="form-control" type="date" value="${escapeHtml(statsPayload.start || state.statsCustomStart || dateInputValue(new Date(Date.now() - 29*86400000)))}"></label><label class="form-label" style="min-width:150px">По <input id="statsEnd" class="form-control" type="date" value="${escapeHtml(statsPayload.end || state.statsCustomEnd || dateInputValue())}"></label><button class="btn btn-dark" data-action="apply-custom-period">Показать</button></div>` : ''}
      <div class="stats-summary-grid"><article class="panel stats-number-card"><span>Тренировки за период</span><strong>${fmtNumber(summary.workouts)} <small>зан.</small></strong></article><article class="panel stats-number-card"><span>Время в движении</span><strong>${fmtNumber(summary.minutes)} <small>мин</small></strong></article><article class="panel stats-number-card"><span>Разные упражнения</span><strong>${fmtNumber(summary.unique_exercises)} <small>вида</small></strong></article><article class="panel stats-number-card"><span>Объём с весом</span><strong>${fmtNumber(summary.volume_kg)} <small>кг</small></strong></article></div>
      <div class="stats-charts-grid"><section class="panel stats-chart-panel"><div class="panel-heading"><div><h3>Регулярность занятий</h3><p>Количество тренировок за ${period === 'year' ? 'месяц' : 'день'}</p></div><span class="pill pill-lime">${summary.average_per_week} / нед.</span></div><div class="chart-wrap"><canvas id="statsActivityChart" class="chart-canvas" aria-label="График регулярности тренировок"></canvas></div><div class="chart-note"><span>Выбранный период</span><b>${summary.workouts} всего</b></div></section>
      <section class="panel stats-chart-panel"><div class="panel-heading"><div><h3>Динамика упражнения</h3><p>Сравнивай одинаковые показатели одного упражнения</p></div></div>${progression.length ? `<label class="form-label" style="margin-bottom:10px">Упражнение<select id="statsExerciseSelect" class="form-control">${progression.map(item => `<option value="${escapeHtml(item.exercise_id)}" ${selectedProgress?.exercise_id === item.exercise_id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label><div class="chart-wrap"><canvas id="statsExerciseChart" class="chart-canvas" aria-label="Динамика результата упражнения"></canvas></div><div class="chart-note"><span>${escapeHtml(selectedProgress?.unit || '')}</span><b>${selectedProgress ? `Лучший результат: ${fmtNumber(selectedProgress.best)} ${escapeHtml(selectedProgress.unit)}` : ''}</b></div>` : `<div class="empty-state" style="padding:24px 12px"><div class="empty-symbol">⌁</div><h3>Пока нет динамики</h3><p>Запиши несколько занятий с результатами по одному упражнению — здесь появится график.</p></div>`}</section></div>
      <div class="stats-charts-grid"><section class="panel panel-pad"><div class="panel-heading"><div><h3>Личные рекорды</h3><p>Лучший сохранённый показатель в каждом упражнении</p></div><span class="pill">${statsPayload.records.length} ${plural(statsPayload.records.length, ['рекорд', 'рекорда', 'рекордов'])}</span></div>${statsPayload.records.length ? `<div class="records-list">${statsPayload.records.slice(0, 7).map((record, i) => `<div class="record-row"><div class="record-medal">${i === 0 ? '✦' : '↗'}</div><div class="record-row-copy"><b>${escapeHtml(record.name)}</b><small>${fmtDate(record.date, { day: 'numeric', month: 'short', year: 'numeric' })}</small></div><div class="record-value"><b>${fmtNumber(record.value)} ${escapeHtml(record.unit)}</b><small>${escapeHtml(metricFor({metric:record.metric}))}</small></div></div>`).join('')}</div>` : `<div class="empty-state"><p>Рекорды появятся после сохранения результатов.</p></div>`}</section>
      <section class="panel panel-pad"><div class="panel-heading"><div><h3>Результаты по упражнениям</h3><p>Показатели не смешиваются между разными упражнениями</p></div></div>${progression.length ? `<div class="exercise-progress-list">${progression.slice(0, 6).map(item => `<div class="exercise-progress-item"><div class="exercise-progress-heading"><b>${escapeHtml(item.name)}</b><strong>${fmtNumber(item.best)} <small>${escapeHtml(item.unit)}</small></strong></div><div class="tiny-points">${item.points.slice(-12).map(point => `<i title="${escapeHtml(point.date)}: ${fmtNumber(point.value)} ${escapeHtml(item.unit)}" style="height:${Math.max(15, Math.min(100, point.value / Math.max(item.best, 1) * 100))}%"></i>`).join('')}</div></div>`).join('')}</div>` : `<div class="empty-state"><p>Добавь упражнения в тренировки, чтобы увидеть сравнение результатов.</p></div>`}</section></div>`;
    requestAnimationFrame(() => {
      drawLineChart($('#statsActivityChart'), statsPayload.activity || [], 'count', { color: '#a9d85b', suffix: '', label: period === 'year' ? 'Тренировки' : 'Тренировки' });
      if (selectedProgress) drawLineChart($('#statsExerciseChart'), selectedProgress.points.map(point => ({ ...point, label: fmtDate(point.date, { day: 'numeric', month: 'short' }) })), 'value', { color: '#9688f1', suffix: ` ${selectedProgress.unit}`, label: selectedProgress.name });
    });
  }

  async function renderLeaderboard(renderId) {
    const [leaderPayload, exercisePayload] = await Promise.all([api(`/api/leaderboard?period=${encodeURIComponent(state.leaderboardPeriod)}&mode=${encodeURIComponent(state.leaderboardMode)}&exercise_id=${encodeURIComponent(state.leaderboardExercise)}`), api('/api/exercises')]);
    if (renderId !== state.renderId) return;
    state.exercises = exercisePayload.exercises || [];
    const leaders = leaderPayload.leaderboard || [];
    const mine = leaders.find(row => row.is_me);
    const myRank = mine ? mine.rank : '—';
    const maxValue = Math.max(1, ...leaders.map(x => Number(x.value || 0)));
    const periods = [['week','Неделя'],['month','Месяц'],['year','Год'],['all','Всё время']];
    const modes = [['xp','Опыт за период'],['workouts','Количество тренировок'],['level','Уровень'],['exercise','Результат в упражнении']];
    root.innerHTML = `${headerBlock('ЗДОРОВОЕ СОРЕВНОВАНИЕ', 'Рейтинг', 'Сравнивай результаты в выбранной категории. Каждый идёт своим путём — рейтинг лишь добавляет немного азарта.', '')}
      <section class="leaderboard-hero"><div><div class="section-eyebrow">ТВОЯ ТОЧКА ОТСЧЁТА</div><h2>Не против других.<br>Вместе с собой.</h2><p>Выбери период и показатель — состав участников и результаты обновятся автоматически.</p></div><div class="trophy-mark">♜</div></section>
      <div class="leaderboard-controls"><label>ПЕРИОД<select id="leaderPeriod" class="small-select">${periods.map(([v,l]) => `<option value="${v}" ${state.leaderboardPeriod === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>ПОКАЗАТЕЛЬ<select id="leaderMode" class="small-select">${modes.map(([v,l]) => `<option value="${v}" ${state.leaderboardMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${state.leaderboardMode === 'exercise' ? `<label>УПРАЖНЕНИЕ<select id="leaderExercise" class="small-select"><option value="">Выбери упражнение</option>${state.exercises.map(ex => `<option value="${escapeHtml(ex.id)}" ${state.leaderboardExercise === ex.id ? 'selected' : ''}>${escapeHtml(ex.name)}</option>`).join('')}</select></label>` : ''}</div>
      ${mine ? `<div class="your-rank-card"><span class="rank-chip">#${myRank}</span><div><b>Твоё место в рейтинге</b><p>${state.leaderboardMode === 'level' ? `Уровень ${mine.level} · ${fmtNumber(mine.xp)} XP всего` : `Показатель: ${escapeHtml(mine.value_label)}`}</p></div><strong>${state.leaderboardMode === 'level' ? `LVL ${mine.level}` : fmtNumber(mine.value)}</strong></div>` : ''}
      <section class="panel leaderboard-panel"><div class="panel-heading"><div><h3>${state.leaderboardMode === 'level' ? 'Рейтинг по уровню' : state.leaderboardMode === 'workouts' ? 'Активность участников' : state.leaderboardMode === 'exercise' ? 'Лучшие результаты' : 'Рейтинг по опыту'}</h3><p>${state.leaderboardPeriod === 'week' ? 'Текущая неделя' : state.leaderboardPeriod === 'month' ? 'Текущий месяц' : state.leaderboardPeriod === 'year' ? 'С начала года' : 'За всё время'} · ${leaders.length} участников</p></div><span class="pill pill-lime">ОБНОВЛЯЕТСЯ</span></div>
      ${state.leaderboardMode === 'exercise' && !state.leaderboardExercise ? `<div class="empty-state"><div class="empty-symbol">⌁</div><h3>Выбери упражнение</h3><p>Укажи упражнение выше — рейтинг покажет лучший сохранённый показатель участников.</p></div>` : leaderPayload.empty || !leaders.length ? `<div class="empty-state"><div class="empty-symbol">♜</div><h3>Пока нет результатов</h3><p>Как только появятся тренировки и опыт за выбранный период, здесь сформируется рейтинг.</p></div>` : `<div style="overflow-x:auto"><table class="leaderboard-table"><thead><tr><th>МЕСТО</th><th>УЧАСТНИК</th><th>УРОВЕНЬ</th><th>ПРОГРЕСС</th><th>${state.leaderboardMode === 'level' ? 'УРОВЕНЬ' : state.leaderboardMode === 'workouts' ? 'ТРЕНИРОВКИ' : state.leaderboardMode === 'exercise' ? 'РЕЗУЛЬТАТ' : 'ПОКАЗАТЕЛЬ'}</th></tr></thead><tbody>${leaders.map(row => `<tr class="${row.is_me ? 'me-row' : ''}"><td class="rank-cell">${row.rank <= 3 ? `<span class="rank-medal">${['🥇','🥈','🥉'][row.rank - 1]}</span>` : `#${row.rank}`}</td><td><div class="leader-user"><span class="leader-avatar" ${row.avatar ? `style="background-image:url('${escapeHtml(row.avatar)}')"` : ''}>${row.avatar ? '' : escapeHtml(initials(row.display_name))}</span><span><b>${escapeHtml(row.display_name)}${row.is_me ? ' · ты' : ''}</b><small>${row.is_demo ? 'Демонстрационный участник' : `Уровень ${row.level}`}</small></span></div></td><td><span class="pill ${row.is_me ? 'pill-lime' : ''}">${row.level}</span></td><td><div class="rank-progress"><i style="width:${Math.max(row.value > 0 ? 4 : 0, row.value / maxValue * 100)}%"></i></div></td><td class="leader-value">${state.leaderboardMode === 'level' ? `Ур. ${row.value}` : fmtNumber(row.value)} <small>${state.leaderboardMode === 'level' ? '' : state.leaderboardMode === 'workouts' ? 'зан.' : state.leaderboardMode === 'exercise' ? escapeHtml((state.exercises.find(e => e.id === state.leaderboardExercise)?.metric === 'weight' ? 'кг' : state.exercises.find(e => e.id === state.leaderboardExercise)?.metric === 'distance' ? 'км' : state.exercises.find(e => e.id === state.leaderboardExercise)?.metric === 'duration' ? 'мин' : 'повт.')) : 'XP'}</small></td></tr>`).join('')}</tbody></table></div>`}
      <div class="leaderboard-note">Демо-участники добавлены для демонстрации интерфейса. В реальной версии в рейтинг попадают зарегистрированные пользователи и сохранённые ими результаты. Не стоит сравнивать показатели упражнений с разной техникой или условиями выполнения.</div></section>`;
  }

  async function renderAchievements(renderId) {
    const payload = await api('/api/achievements');
    if (renderId !== state.renderId) return;
    const unlocked = payload.achievements.filter(a => a.unlocked);
    root.innerHTML = `${headerBlock('МАЛЕНЬКИЕ ПОБЕДЫ СКЛАДЫВАЮТСЯ В БОЛЬШИЕ', 'Достижения', 'Награды отмечают регулярность, новые упражнения и личные рекорды. Они открываются автоматически по мере твоего пути.', '')}
      <section class="achievement-summary"><div class="achievement-progress-orb">✧</div><div class="achievement-summary-copy"><span>ТВОЯ КОЛЛЕКЦИЯ</span><h3>Каждый шаг имеет значение</h3><p>Новые значки появятся, когда ты выполнишь условия достижения.</p></div><div class="summary-count"><strong>${unlocked.length}<small> / ${payload.total}</small></strong><small>открыто</small></div></section>
      <div class="achievement-grid">${payload.achievements.map(ach => `<article class="panel achievement-card ${ach.unlocked ? '' : 'locked'}"><div class="achievement-card-top"><div class="achievement-art">${escapeHtml(ach.icon)}</div><span class="achievement-lock">${ach.unlocked ? '✓' : '♧'}</span></div><h3>${escapeHtml(ach.name)}</h3><p>${escapeHtml(ach.description)}</p><div class="achievement-card-foot"><span>${ach.unlocked ? `Открыто ${fmtDate(ach.unlocked_at, { day: 'numeric', month: 'short' })}` : 'Ещё впереди'}</span><b>${ach.unlocked ? 'ОТКРЫТО' : `+${ach.xp} XP`}</b></div></article>`).join('')}</div>`;
  }

  async function renderProfile(renderId) {
    const [dashboardPayload, exercisePayload] = await Promise.all([api('/api/dashboard'), api('/api/exercises')]);
    if (renderId !== state.renderId) return;
    state.dashboard = dashboardPayload;
    state.user = dashboardPayload.user || state.user;
    state.exercises = exercisePayload.exercises || [];
    const user = state.user;
    const level = dashboardPayload.level;
    root.innerHTML = `${headerBlock('ТВОИ НАСТРОЙКИ И ДАННЫЕ', 'Профиль', 'Управляй данными аккаунта, настрой приватные параметры и обновляй профиль.', '')}
      <div class="profile-hero-card panel">${user.avatar ? `<div class="profile-avatar-large" style="background-image:url('${escapeHtml(user.avatar)}')"></div>` : `<div class="profile-avatar-large">${escapeHtml(initials(user.display_name))}</div>`}<div class="profile-hero-copy"><h2>${escapeHtml(user.display_name)}</h2><p>${escapeHtml(user.email)}</p><span class="pill pill-lime">Уровень ${level.level} · ${fmtNumber(level.xp)} XP</span></div><span class="pill" style="margin-left:auto;position:relative;z-index:1">${user.is_demo ? 'Демо-аккаунт' : 'Участник'}</span></div>
      <div class="profile-layout"><div><section class="panel profile-section"><h3>Личная информация</h3><p>Имя сохраняется в профиле на сервере. Даты и календарь автоматически используют системное время устройства.</p><form id="profileForm" class="stack-form"><label>Отображаемое имя<input class="form-control" name="display_name" minlength="2" maxlength="40" required value="${escapeHtml(user.display_name)}"></label><button class="btn btn-dark" type="submit">Сохранить профиль ↗</button></form></section>
      <section class="panel profile-section"><h3>Фото профиля</h3><p>Используй квадратное изображение, чтобы аватар выглядел аккуратно в меню и рейтинге.</p><div class="avatar-upload-row">${user.avatar ? `<div class="profile-avatar-large" id="avatarPreview" style="background-image:url('${escapeHtml(user.avatar)}')"></div>` : `<div class="profile-avatar-large" id="avatarPreview">${escapeHtml(initials(user.display_name))}</div>`}<div class="upload-copy"><b>Твой аватар</b><span>PNG, JPEG или WebP · до 2 МБ</span><div class="upload-actions"><button type="button" data-action="choose-avatar">Загрузить изображение</button><button type="button" data-action="remove-avatar-local">Удалить аватар</button></div></div></div><input id="avatarInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden"></section>
      <section class="panel profile-section"><h3>Электронная почта</h3><p>Чтобы сменить адрес, подтверди владение новым почтовым ящиком.</p><form id="emailChangeForm" class="stack-form"><label>Текущий адрес<input class="form-control" value="${escapeHtml(user.email)}" readonly></label><label>Новый адрес<input class="form-control" name="email" type="email" placeholder="new-address@example.com" required></label><button class="btn btn-ghost" type="submit">Запросить смену адреса</button></form><div id="emailConfirmArea">${user.email_pending ? `<div class="pending-email-panel"><p>Ожидает подтверждения: <b>${escapeHtml(user.email_pending.email)}</b>. В демо-режиме код показан после отправки запроса.</p><form id="confirmEmailForm" class="stack-form"><label>Код подтверждения<input class="form-control" name="code" required></label><button class="btn btn-dark" type="submit">Подтвердить адрес</button></form></div>` : ''}</div></section>
      <section class="panel profile-section"><h3>Смена пароля</h3><p>Используй уникальный пароль длиной не менее 8 символов.</p><form id="passwordForm" class="stack-form"><label>Текущий пароль<input class="form-control" type="password" name="current_password" autocomplete="current-password" required></label><label>Новый пароль<input class="form-control" type="password" name="new_password" autocomplete="new-password" minlength="8" required></label><label>Повтори новый пароль<input class="form-control" type="password" name="new_password_repeat" autocomplete="new-password" minlength="8" required></label><button class="btn btn-dark" type="submit">Изменить пароль ↗</button></form><div class="security-note"><i>♧</i><span>Пароль хранится на сервере в виде криптографического хеша. Сам пароль не сохраняется в открытом виде.</span></div></section></div>
      <aside class="profile-right-column"><section class="panel profile-side-stat"><h3>Твой уровень</h3><p>Опыт начисляется за завершённые тренировки и выполненные задания.</p><div class="profile-level-line"><span>Уровень ${level.level}</span><b>${fmtNumber(level.xp)} XP</b></div><div class="progress-track"><span style="width:${level.progress_percent}%"></span></div><div class="profile-level-line"><span>${level.current_level_xp} из ${level.next_level_xp} XP</span><span>${level.progress_percent}%</span></div><div class="divider" style="background:#39443b"></div><div class="profile-mini-stats"><div class="profile-mini-stat"><span>Тренировки</span><strong>${dashboardPayload.summary.workouts_total}</strong></div><div class="profile-mini-stat"><span>Серия 🔥</span><strong>${dashboardPayload.streak.current} дн.</strong></div><div class="profile-mini-stat"><span>Достижения</span><strong>${dashboardPayload.unlocked_count}</strong></div><div class="profile-mini-stat"><span>Упражнения</span><strong>${dashboardPayload.summary.exercises_total}</strong></div></div></section><section class="panel profile-section"><h3>Твой аккаунт</h3><p>Создан ${fmtDate(user.created_at, { day: 'numeric', month: 'long', year: 'numeric' })}. Данные тренировок привязаны к твоему аккаунту.</p><div class="detail-list"><div class="detail-list-row"><span>Имя</span><b>${escapeHtml(user.display_name)}</b></div><div class="detail-list-row"><span>Почта</span><b>${escapeHtml(user.email)}</b></div><div class="detail-list-row"><span>Статус</span><b>${user.is_demo ? 'Демо' : 'Активен'}</b></div></div><div style="margin-top:18px"><button class="btn btn-ghost btn-full" data-action="logout">Выйти из аккаунта ↗</button></div></section></aside></div>`;
  }

  async function openWorkoutDetail(id) {
    let workout = state.workouts.find(w => w.id === id);
    if (!workout) workout = (await api(`/api/workouts/${encodeURIComponent(id)}`)).workout;
    const items = workout.exercises || [];
    const volume = items.reduce((sum, item) => sum + Number(item.sets || 0) * Number(item.reps || 0) * Number(item.weight_kg || 0), 0);
    showModal(`<div class="eyebrow"><span class="eyebrow-dot"></span> ЗАПИСЬ О ТРЕНИРОВКЕ</div><h2>${escapeHtml(workout.title)}</h2><p class="modal-subtitle">${fmtDate(workout.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${escapeHtml(workout.time || '—')} · ${fmtNumber(workout.duration_minutes || 0)} ${plural(Number(workout.duration_minutes || 0), ['минута', 'минуты', 'минут'])}</p><div class="stats-summary-grid" style="grid-template-columns:repeat(3,1fr)"><div class="panel stats-number-card"><span>Упражнения</span><strong>${items.length}</strong></div><div class="panel stats-number-card"><span>Подходы</span><strong>${items.reduce((a, x) => a + Number(x.sets || 0), 0)}</strong></div><div class="panel stats-number-card"><span>Объём с весом</span><strong style="font-size:19px">${fmtNumber(volume)} <small>кг</small></strong></div></div><div class="detail-list" style="margin-top:18px">${items.map((item, i) => { const ex = state.exercises.find(e => e.id === item.exercise_id); const metric = ex?.metric || (Number(item.distance_km || 0) ? 'distance' : Number(item.duration_min || 0) ? 'duration' : Number(item.weight_kg || 0) ? 'weight' : 'reps'); const parts = []; if (Number(item.sets || 0) > 0) parts.push(`${Number(item.sets)} ${plural(Number(item.sets), ['подход', 'подхода', 'подходов'])}`); if (metric === 'reps' && Number(item.reps || 0) > 0) parts.push(`${Number(item.reps)} ${plural(Number(item.reps), ['повторение', 'повторения', 'повторений'])}`); if (metric === 'weight' && Number(item.weight_kg || 0) > 0) parts.push(`${fmtNumber(item.weight_kg)} кг`); if (metric === 'duration' && Number(item.duration_min || 0) > 0) parts.push(`${fmtNumber(item.duration_min)} мин`); if (metric === 'distance' && Number(item.distance_km || 0) > 0) parts.push(`${fmtNumber(item.distance_km)} км`); return `<div class="detail-list-row"><span>${i + 1}. ${escapeHtml(item.name)}</span><b>${escapeHtml(parts.join(' · ') || 'Результат не указан')}</b></div>`; }).join('')}</div>${workout.notes ? `<div class="instruction-box"><b>Заметка</b>${escapeHtml(workout.notes)}</div>` : ''}<div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Закрыть</button><button class="btn btn-dark" data-action="edit-workout" data-id="${escapeHtml(workout.id)}">Изменить тренировку ↗</button></div>`);
  }

  function exportJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  /* Small dependency-free charts. Canvas dimensions are responsive and values keep their own units. */
  function setupCanvas(canvas) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(260, rect.width || canvas.parentElement?.clientWidth || 320);
    const height = Math.max(130, rect.height || 180);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }
  function drawBarChart(canvas, data, key, options = {}) {
    if (!canvas) return;
    canvas.__barChartConfig = { data, key, options: { ...options } };
    const setup = setupCanvas(canvas); if (!setup) return;
    const { ctx, width, height } = setup;
    ctx.clearRect(0, 0, width, height);
    const pad = { top: 16, right: 12, bottom: 31, left: 32 };
    const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
    if (!data.length) {
      ctx.fillStyle = '#929b90'; ctx.font = '12px DM Sans, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Пока нет данных за период', width / 2, height / 2);
      return;
    }
    const values = data.map(item => Math.max(0, Number(item[key] || 0)));
    const rawMax = Math.max(1, ...values);
    const integerScale = key === 'count' || options.integer;
    const step = integerScale ? Math.max(1, Math.ceil(rawMax / 4)) : niceChartStep(rawMax / 4);
    const max = step * 4;
    ctx.font = '10px DM Sans, sans-serif'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + plotH * i / 4;
      ctx.strokeStyle = i === 4 ? '#dfe5d9' : '#edf1e9';
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
      const tick = max - step * i;
      ctx.fillStyle = '#8f998b'; ctx.textAlign = 'right';
      ctx.fillText(integerScale ? String(tick) : fmtNumber(tick, tick < 10 ? 1 : 0), pad.left - 7, y + 3);
    }
    const slot = plotW / Math.max(1, data.length);
    const barW = Math.max(3, Math.min(19, slot * .52));
    data.forEach((item, i) => {
      const value = values[i];
      const barH = value > 0 ? Math.max(3, value / max * plotH) : 1.5;
      const x = pad.left + i * slot + (slot - barW) / 2;
      const y = pad.top + plotH - barH;
      ctx.fillStyle = value > 0 ? (options.color || '#b6df70') : '#e6ece0';
      roundedRect(ctx, x, y, barW, barH, Math.min(5, barW / 2));
      if (data.length <= 10 || i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) {
        ctx.fillStyle = '#909a8d'; ctx.textAlign = 'center';
        const label = String(item.label ?? item.date ?? '');
        ctx.fillText(label.length > 9 ? label.slice(0, 8) + '…' : label, x + barW / 2, height - 10);
      }
    });
  }
  function niceChartStep(value) {
    const safe = Math.max(Number(value) || 0, 0.001);
    const magnitude = Math.pow(10, Math.floor(Math.log10(safe)));
    const normalized = safe / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  }
  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath(); ctx.fill();
  }
  function drawLineChart(canvas, data, key, options = {}) {
    if (!canvas) return;
    canvas.__lineChartConfig = { data, key, options: { ...options } };
    const setup = setupCanvas(canvas); if (!setup) return;
    const { ctx, width, height } = setup;
    ctx.clearRect(0, 0, width, height);
    const pad = { top: 18, right: 14, bottom: 32, left: 36 };
    const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
    const values = data.map(item => Number(item[key] || 0));
    const rawMax = Math.max(1, ...values), min = Math.min(0, ...values);
    const integerScale = key === 'count' || options.integer;
    const tickStep = integerScale ? Math.max(1, Math.ceil(rawMax / 4)) : niceChartStep(rawMax / 4);
    const max = tickStep * 4;
    const range = max - min || 1;
    ctx.font = '10px DM Sans, sans-serif'; ctx.lineWidth = 1;
    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
      const y = pad.top + plotH * i / gridCount;
      ctx.strokeStyle = '#edf1e9'; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
      ctx.fillStyle = '#9aa497'; ctx.textAlign = 'right'; const tickValue = max - tickStep * i; ctx.fillText((integerScale ? String(Math.round(tickValue)) : fmtNumber(tickValue, tickValue < 10 ? 1 : 0)), pad.left - 8, y + 3);
    }
    if (!data.length) { ctx.fillStyle = '#929b90'; ctx.textAlign = 'center'; ctx.fillText('Пока нет данных за период', width / 2, height / 2); canvas.__chartPoints = []; return; }
    const points = data.map((item, i) => ({
      x: pad.left + (data.length === 1 ? plotW / 2 : i * plotW / (data.length - 1)),
      y: pad.top + plotH - ((Number(item[key] || 0) - min) / range) * plotH,
      value: Number(item[key] || 0), label: item.label ?? item.date ?? '', raw: item,
    }));
    canvas.__chartPoints = points;
    canvas.__plotBounds = { left: pad.left, right: width - pad.right, top: pad.top, bottom: pad.top + plotH, width: plotW };
    ctx.beginPath(); ctx.moveTo(points[0].x, pad.top + plotH); points.forEach(point => ctx.lineTo(point.x, point.y)); ctx.lineTo(points[points.length - 1].x, pad.top + plotH); ctx.closePath();
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    gradient.addColorStop(0, options.color === '#9688f1' ? 'rgba(150,136,241,.20)' : 'rgba(177,219,100,.24)');
    gradient.addColorStop(1, 'rgba(177,219,100,0)'); ctx.fillStyle = gradient; ctx.fill();
    ctx.beginPath(); points.forEach((point, i) => i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = options.color || '#9ccf4b'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();

    // Draw recorded values as quiet markers; the active marker moves continuously between them.
    points.forEach(point => {
      ctx.beginPath(); ctx.arc(point.x, point.y, 2.8, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = options.color || '#9ccf4b'; ctx.lineWidth = 1.5; ctx.stroke();
    });
    const hoverPos = Number.isFinite(canvas.__hoverPos) && canvas.__hoverPos >= 0 ? Math.min(points.length - 1, canvas.__hoverPos) : -1;
    if (hoverPos >= 0 && points.length) {
      const lo = Math.floor(hoverPos), hi = Math.min(points.length - 1, lo + 1), fraction = hoverPos - lo;
      const nearestIndex = fraction >= .5 ? hi : lo;
      const a = points[nearestIndex], b = points[nearestIndex];
      const p = { x: a.x, y: a.y, value: a.value };
      ctx.save(); ctx.strokeStyle = options.color || '#9ccf4b'; ctx.globalAlpha = .34; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(p.x, pad.top); ctx.lineTo(p.x, pad.top + plotH); ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fillStyle = options.color || '#9ccf4b'; ctx.globalAlpha = .16; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.8, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = options.color || '#9ccf4b'; ctx.lineWidth = 2.4; ctx.stroke();

      const nearExact = true;
      const exactPoint = a;
      const label = String(exactPoint.label || 'Точка');
      const suffix = options.suffix || '';
      const valueText = `${(integerScale ? Math.round(p.value).toLocaleString('ru-RU') : fmtNumber(p.value, 2))}${suffix}`;
      ctx.font = '600 10px DM Sans, sans-serif';
      const boxW = Math.min(width - 12, Math.max(96, Math.max(ctx.measureText(label).width, ctx.measureText(valueText).width) + 20));
      const boxH = 39;
      let bx = p.x + 12; if (bx + boxW > width - 4) bx = p.x - boxW - 12; bx = Math.max(4, Math.min(width - boxW - 4, bx));
      let by = p.y - boxH - 12; if (by < 3) by = Math.min(height - boxH - 34, p.y + 13);
      ctx.fillStyle = '#202824'; roundedRect(ctx, bx, by, boxW, boxH, 8);
      ctx.fillStyle = '#c9f56c'; ctx.textAlign = 'left'; ctx.font = '600 9px DM Sans, sans-serif';
      const shortLabel = label.length > 29 ? `${label.slice(0, 26)}…` : label;
      ctx.fillText(shortLabel, bx + 9, by + 14);
      ctx.fillStyle = '#fff'; ctx.font = '700 11px DM Sans, sans-serif'; ctx.fillText(valueText, bx + 9, by + 30);
    }
    const step = Math.max(1, Math.ceil(points.length / 8));
    points.forEach((point, i) => {
      if (i % step === 0 || i === points.length - 1) {
        ctx.fillStyle = '#909a8e'; ctx.textAlign = 'center'; ctx.font = '9px DM Sans, sans-serif';
        const label = String(point.label).length > 9 ? String(point.label).slice(0, 8) : String(point.label);
        ctx.fillText(label, point.x, height - 10);
      }
    });
    if (!canvas.__hoverBound) {
      canvas.__hoverBound = true;
      canvas.__hoverPos = -1;
      canvas.__targetHoverPos = -1;
      canvas.style.cursor = 'crosshair';
      const scheduleHoverFrame = () => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          canvas.__hoverPos = canvas.__targetHoverPos;
          const cfg = canvas.__lineChartConfig;
          if (cfg) drawLineChart(canvas, cfg.data, cfg.key, cfg.options);
          return;
        }
        if (canvas.__hoverFrame) return;
        const animate = () => {
          const target = Number.isFinite(canvas.__targetHoverPos) ? canvas.__targetHoverPos : -1;
          let current = Number.isFinite(canvas.__hoverPos) ? canvas.__hoverPos : -1;
          if (current < 0 && target >= 0) current = target;
          const next = current + (target - current) * .28;
          canvas.__hoverPos = Math.abs(target - next) < .006 ? target : next;
          if (target < 0 && canvas.__hoverPos < .006) canvas.__hoverPos = -1;
          const cfg = canvas.__lineChartConfig;
          if (cfg) drawLineChart(canvas, cfg.data, cfg.key, cfg.options);
          if (Math.abs(target - canvas.__hoverPos) >= .006) canvas.__hoverFrame = requestAnimationFrame(animate);
          else canvas.__hoverFrame = 0;
        };
        canvas.__hoverFrame = requestAnimationFrame(animate);
      };
      const pointerTarget = event => {
        const pts = canvas.__chartPoints || [], bounds = canvas.__plotBounds;
        if (!pts.length || !bounds) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = event.clientX ?? event.touches?.[0]?.clientX;
        if (!Number.isFinite(clientX)) return;
        const x = Math.max(bounds.left, Math.min(bounds.right, clientX - rect.left));
        canvas.__targetHoverPos = pts.length === 1 ? 0 : ((x - bounds.left) / Math.max(1, bounds.width)) * (pts.length - 1);
        scheduleHoverFrame();
      };
      canvas.addEventListener('mousemove', pointerTarget);
      canvas.addEventListener('touchstart', pointerTarget, { passive: true });
      canvas.addEventListener('touchmove', pointerTarget, { passive: true });
      canvas.addEventListener('mouseleave', () => { canvas.__targetHoverPos = -1; scheduleHoverFrame(); });
      canvas.addEventListener('touchend', () => { canvas.__targetHoverPos = -1; scheduleHoverFrame(); }, { passive: true });
    }
  }

  async function handleAction(action, button) {
    switch (action) {
      case 'auth-login': authMode('login'); break;
      case 'auth-register': authMode('register'); break;
      case 'auth-tab-login': authMode('login'); break;
      case 'auth-tab-register': authMode('register'); break;
      case 'close-modal': closeModal(); break;
      case 'toggle-public-menu': $('.public-header').classList.toggle('menu-open'); break;
      case 'scroll-features': $('#features').scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'demo-login': await submitLogin('demo@formarosta.local', 'demo1234'); break;
      case 'toggle-sidebar': $('#sidebar').classList.toggle('open'); break;
      case 'calendar-day': state.calendarSelectedDay = button.dataset.date; refreshCalendarDay(`[data-date="${state.calendarSelectedDay}"]`); break;
      case 'calendar-prev': shiftCalendarMonth(-1); break;
      case 'calendar-next': shiftCalendarMonth(1); break;
      case 'logout': await logout(); break;
      case 'show-notice': toggleNotificationPopover(); break;
      case 'close-notice': $('#notificationPopover')?.classList.add('hidden'); $('.notification-button')?.setAttribute('aria-expanded', 'false'); break;
      case 'clear-notices': $('#notificationPopover')?.classList.add('hidden'); $('.notification-button')?.setAttribute('aria-expanded', 'false'); state.notificationsUnread = false; if ($('.notification-button i')) $('.notification-button i').style.display = 'none'; break;
      case 'retry-route': await routeTo(state.route); break;
      case 'next-achievement': showNextAchievement(); break;
      case 'add-workout-exercise': {
        if (!state.exercises.length) state.exercises = (await api('/api/exercises')).exercises;
        $('#exerciseEntries').insertAdjacentHTML('beforeend', workoutExerciseRow({})); updateWorkoutSummary(); break;
      }
      case 'remove-workout-exercise': {
        const row = button.closest('[data-exercise-row]'); if (row) row.remove();
        if (!$$('[data-exercise-row]').length) $('#exerciseEntries').insertAdjacentHTML('beforeend', workoutExerciseRow({}));
        updateWorkoutSummary(); break;
      }
      case 'browse-exercises': closeModal(); await routeTo('exercises'); break;
      case 'use-template': {
        state.selectedTemplate = button.dataset.id; state.editingWorkout = null; await routeTo('create-workout', { preserveTemplate: true }); break;
      }
      case 'clear-template': state.selectedTemplate = null; await routeTo('create-workout'); break;
      case 'edit-workout': {
        const id = button.dataset.id; closeModal(); state.editingWorkout = id; state.selectedTemplate = null; await routeTo('create-workout', { editingWorkout: id }); break;
      }
      case 'workout-detail': await openWorkoutDetail(button.dataset.id); break;
      case 'delete-workout': {
        const w = state.workouts.find(x => x.id === button.dataset.id);
        if (!window.confirm(`Удалить тренировку «${w?.title || 'Без названия'}»? Статистика пересчитается.`)) break;
        try { const result = await api(`/api/workouts/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' }); await routeTo('workouts'); showToast(result.message); } catch (e) { showToast(e.message, 'error'); }
        break;
      }
      case 'export-workouts': exportJson('forma-rosta-trenirovki.json', { exported_at: new Date().toISOString(), workouts: state.workouts }); showToast('Файл с историей подготовлен для скачивания.'); break;
      case 'add-custom-exercise': openExerciseForm(); break;
      case 'exercise-detail': {
        const ex = state.exercises.find(e => e.id === button.dataset.id); if (ex) exerciseDetail(ex); break;
      }
      case 'edit-custom-exercise': {
        const ex = state.exercises.find(e => e.id === button.dataset.id); if (ex) openExerciseForm(ex); break;
      }
      case 'delete-custom-exercise': {
        const ex = state.exercises.find(e => e.id === button.dataset.id);
        if (!ex || !window.confirm(`Удалить упражнение «${ex.name}» из каталога? Ранее записанные результаты останутся в истории.`)) break;
        try { await api(`/api/exercises/${encodeURIComponent(ex.id)}`, { method: 'DELETE' }); state.exercises = state.exercises.filter(e => e.id !== ex.id); filterExerciseGrid(); showToast('Упражнение удалено из каталога.'); } catch (e) { showToast(e.message, 'error'); }
        break;
      }
      case 'clear-exercise-filters': { if ($('#exerciseSearch')) $('#exerciseSearch').value = ''; if ($('#muscleFilter')) $('#muscleFilter').value = 'Все группы'; if ($('#categoryFilter')) $('#categoryFilter').value = 'Все направления'; filterExerciseGrid(); break; }
      case 'use-exercise': {
        const id = button.dataset.id; closeModal(); state.selectedTemplate = null; state.editingWorkout = null; await routeTo('create-workout');
        const select = $('[data-field="exercise_id"]'); if (select) { select.value = id; updateWorkoutSummary(); }
        break;
      }
      case 'stats-period': { const pos = { x: window.scrollX, y: window.scrollY }; state.statsPeriod = button.dataset.period; await routeTo('statistics', { preserveScroll: true }); requestAnimationFrame(() => window.scrollTo({ left: pos.x, top: pos.y, behavior: 'instant' })); break; }
      case 'apply-custom-period': { const pos = { x: window.scrollX, y: window.scrollY }; state.statsCustomStart = $('#statsStart')?.value || ''; state.statsCustomEnd = $('#statsEnd')?.value || ''; state.statsPeriod = 'custom'; await routeTo('statistics', { preserveScroll: true }); requestAnimationFrame(() => window.scrollTo({ left: pos.x, top: pos.y, behavior: 'instant' })); break; }
      case 'export-stats': if (!state.stats) await routeTo('statistics'); else exportJson('forma-rosta-statistika.json', state.stats); showToast('Сводка статистики подготовлена для скачивания.'); break;
      case 'choose-avatar': $('#avatarInput')?.click(); break;
      case 'remove-avatar-local': { const input = $('#avatarInput'); if (input) input.value = ''; if (!state.user.avatar) { $('#avatarPreview').style.backgroundImage = ''; $('#avatarPreview').textContent = initials(state.user.display_name); break; } if (!window.confirm('Удалить текущее фото профиля?')) break; try { const result = await api('/api/profile/avatar', { method: 'DELETE' }); state.user = result.user; await routeTo('profile'); showToast(result.message || 'Аватар удалён.'); } catch (error) { showToast(error.message, 'error'); } break; }
      default: break;
    }
  }

  async function submitLogin(email, password) {
    const errorBox = $('#authError');
    if (errorBox) errorBox.textContent = '';
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: { email, password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      await enterApp(result.user, 'dashboard');
      showToast(result.message || 'Добро пожаловать!');
    } catch (error) {
      if (errorBox) errorBox.textContent = error.message;
      else showToast(error.message, 'error');
    }
  }

  document.addEventListener('click', async (event) => {
    const routeButton = event.target.closest('[data-route]');
    const actionButton = event.target.closest('[data-action]');
    if (routeButton && !actionButton) {
      event.preventDefault();
      await routeTo(routeButton.dataset.route);
      return;
    }
    if (routeButton && actionButton && routeButton.dataset.route && !actionButton.dataset.action) {
      await routeTo(routeButton.dataset.route); return;
    }
    if (actionButton) {
      event.preventDefault();
      try { await handleAction(actionButton.dataset.action, actionButton); } catch (error) { showToast(error.message || 'Не удалось выполнить действие.', 'error'); }
    }
  });
  document.addEventListener('click', (event) => {
    if (event.target.id === 'authModal' || event.target.id === 'globalModal') closeModal();
    const panel = $('#notificationPopover');
    if (panel && !panel.classList.contains('hidden') && !event.target.closest('#notificationPopover, .notification-button')) { panel.classList.add('hidden'); $('.notification-button')?.setAttribute('aria-expanded', 'false'); }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    event.preventDefault();
    try {
      if (form.id === 'loginForm') {
        const data = new FormData(form); await submitLogin(data.get('email'), data.get('password'));
      } else if (form.id === 'registerForm') {
        const data = new FormData(form);
        const result = await api('/api/auth/register', { method: 'POST', body: { display_name: data.get('display_name'), email: data.get('email'), password: data.get('password'), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
        await enterApp(result.user, 'dashboard'); showToast(result.message || 'Аккаунт создан!');
      } else if (form.id === 'workoutForm') {
        await submitWorkout(form);
      } else if (form.id === 'customExerciseForm') {
        const data = new FormData(form); const editId = form.dataset.editId;
        const payload = Object.fromEntries(data.entries());
        const result = editId ? await api(`/api/exercises/${encodeURIComponent(editId)}`, { method: 'PUT', body: payload }) : await api('/api/exercises', { method: 'POST', body: payload });
        closeModal(); await routeTo('exercises'); showToast(result.message || 'Упражнение сохранено.');
      } else if (form.id === 'profileForm') {
        const data = new FormData(form);
        const result = await api('/api/profile', { method: 'PUT', body: { display_name: data.get('display_name') } });
        state.user = result.user; updateUserChrome(); await routeTo('profile'); showToast(result.message || 'Профиль обновлён.');
      } else if (form.id === 'passwordForm') {
        const data = new FormData(form);
        if (data.get('new_password') !== data.get('new_password_repeat')) { showToast('Новые пароли не совпадают.', 'error'); return; }
        const result = await api('/api/profile/change-password', { method: 'POST', body: { current_password: data.get('current_password'), new_password: data.get('new_password') } });
        form.reset(); showToast(result.message || 'Пароль изменён.');
      } else if (form.id === 'emailChangeForm') {
        const data = new FormData(form);
        const result = await api('/api/profile/change-email', { method: 'POST', body: { email: data.get('email') } });
        state.emailDevCode = result.development_code || null;
        const area = $('#emailConfirmArea');
        area.innerHTML = `<div class="pending-email-panel"><p>${escapeHtml(result.message)}${result.development_code ? `<br><br><b>Код подтверждения для локального теста:</b> <code>${escapeHtml(result.development_code)}</code>` : ''}</p><form id="confirmEmailForm" class="stack-form"><label>Код подтверждения<input class="form-control" name="code" required value="${escapeHtml(result.development_code || '')}"></label><button class="btn btn-dark" type="submit">Подтвердить адрес</button></form></div>`;
        showToast(result.message || 'Запрос на смену адреса создан.');
      } else if (form.id === 'confirmEmailForm') {
        const data = new FormData(form);
        const result = await api('/api/profile/confirm-email', { method: 'POST', body: { code: data.get('code') } });
        state.user = result.user; await routeTo('profile'); showToast(result.message || 'Адрес подтверждён.');
      }
    } catch (error) {
      if (form.closest('#authModal')) $('#authError').textContent = error.message;
      else showToast(error.message || 'Не удалось сохранить данные.', 'error');
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.closest('#workoutForm')) updateWorkoutSummary();
    if (event.target.id === 'exerciseSearch' || event.target.id === 'muscleFilter' || event.target.id === 'categoryFilter') filterExerciseGrid();
  });
  document.addEventListener('change', async (event) => {
    if (event.target.closest('#workoutForm')) updateWorkoutSummary();
    if (event.target.id === 'muscleFilter' || event.target.id === 'categoryFilter') filterExerciseGrid();
    if (event.target.id === 'leaderPeriod' || event.target.id === 'leaderMode' || event.target.id === 'leaderExercise') {
      state.leaderboardPeriod = $('#leaderPeriod')?.value || state.leaderboardPeriod;
      state.leaderboardMode = $('#leaderMode')?.value || state.leaderboardMode;
      state.leaderboardExercise = $('#leaderExercise')?.value || '';
      await routeTo('leaderboard');
    }
    if (event.target.id === 'statsExerciseSelect') { state.statsExercise = event.target.value; await routeTo('statistics'); }
    if (event.target.id === 'avatarInput') {
      const file = event.target.files?.[0]; if (!file) return;
      const allowed = ['image/png', 'image/jpeg', 'image/webp'];
      if (!allowed.includes(file.type) || file.size > 2 * 1024 * 1024) { showToast('Выбери PNG, JPEG или WebP до 2 МБ.', 'error'); event.target.value = ''; return; }
      const preview = $('#avatarPreview');
      if (preview) { preview.style.backgroundImage = `url('${URL.createObjectURL(file)}')`; preview.textContent = ''; }
      const data = new FormData(); data.append('avatar', file);
      try { const result = await api('/api/profile/avatar', { method: 'POST', body: data }); state.user = result.user; await routeTo('profile'); showToast(result.message || 'Аватар обновлён.'); }
      catch (error) { showToast(error.message, 'error'); }
    }
  });

  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeModal(); $('#sidebar').classList.remove('open'); $('#notificationPopover')?.classList.add('hidden'); $('.notification-button')?.setAttribute('aria-expanded', 'false'); } });

  window.addEventListener('focus', () => { if (state.user) api('/api/profile/timezone', { method: 'POST', body: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }).catch(() => {}); });

  window.addEventListener('resize', () => {
    if (state.route === 'dashboard' && state.dashboard) requestAnimationFrame(() => drawBarChart($('#weeklyChart'), state.dashboard.weekly_activity || [], 'count', { color: '#addb61' }));
    if (state.route === 'statistics' && state.stats) {
      requestAnimationFrame(() => {
        drawLineChart($('#statsActivityChart'), state.stats.activity || [], 'count', { color: '#a9d85b' });
        const exercise = state.stats.progression.find(x => x.exercise_id === state.statsExercise) || state.stats.progression[0];
        if (exercise) drawLineChart($('#statsExerciseChart'), exercise.points.map(point => ({ ...point, label: fmtDate(point.date, { day: 'numeric', month: 'short' }) })), 'value', { color: '#9688f1', suffix: ` ${exercise.unit}` });
      });
    }
  });

  function setupInfiniteTicker() {
    const track = $('.ticker-inner');
    if (!track) return;
    const first = $('.ticker-group', track);
    if (!first) return;
    $$('.ticker-group', track).slice(1).forEach(group => group.remove());
    const clone = first.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    track.appendChild(clone);
    const measure = () => {
      const width = first.getBoundingClientRect().width;
      if (width > 0) track.style.setProperty('--ticker-shift', `${-width}px`);
    };
    measure();
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(measure);
      observer.observe(first);
      observer.observe(track);
    } else window.addEventListener('resize', measure, { passive: true });
  }

  async function init() {
    try {
      const result = await api('/api/me');
      if (result.user) { try { await api('/api/profile/timezone', { method: 'POST', body: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }); } catch (_) {} await enterApp(result.user, 'dashboard'); }
      else { appShell.classList.add('hidden'); landing.classList.remove('hidden'); }
    } catch (_) {
      landing.classList.remove('hidden');
      showToast('Не удалось связаться с сервером. Запусти start.py из папки проекта или проверь инструкцию START-HERE.txt.', 'error', 'Сервер недоступен');
    }
  }
  setupInfiniteTicker();
  init();
})();
