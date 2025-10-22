const DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_COLORS = [
  "#0ea5e9",
  "#2563eb",
  "#7c3aed",
  "#ec4899",
  "#f97316",
  "#facc15",
  "#10b981",
  "#22d3ee",
  "#6366f1",
  "#a855f7",
  "#ef4444",
  "#f59e0b",
];

const DEFAULT_CONFIG = {
  name: "Alice",
  sleep: {
    bedtime: "23:00",
    duration_hours: 8,
  },
  work: {
    start: "09:00",
    duration_hours: 8,
    days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  },
  meals: {
    breakfast: "08:00",
    lunch: "12:30",
    dinner: "18:30",
  },
  activities: [
    {
      name: "gym",
      time: "17:30",
      duration_minutes: 60,
      days: ["monday", "wednesday", "friday"],
    },
    {
      name: "reading",
      time: "21:00",
      duration_minutes: 45,
      days: ["daily"],
    },
  ],
};

const COLOR_MAP = {
  sleep: "#1e3a8a",
  work: "#0f766e",
  breakfast: "#f97316",
  lunch: "#ea580c",
  dinner: "#c2410c",
  "free time": "#e2e8f0",
};

const LOCKED_ACTIVITIES = new Set(["sleep", "work", "commute_in", "commute_out"]);

const configInput = document.querySelector("#config-input");
const form = document.querySelector("#config-form");
const formError = document.querySelector("#form-error");
const formCard = document.querySelector(".form-card");
const resultsSection = document.querySelector("#results");
const totalsContainer = document.querySelector("#totals");
const timelineContainer = document.querySelector("#timeline");
const eventTable = document.querySelector("#event-table");
const jsonOutput = document.querySelector("#json-output");
const downloadButton = document.querySelector("#download-json");
const toggleConfigButton = document.querySelector("#toggle-config");
const startDateInput = document.querySelector("#start-date");
const viewTabs = Array.from(document.querySelectorAll(".view-tab"));
const viewPanels = Array.from(document.querySelectorAll(".view-panel"));
const daySelector = document.querySelector("#day-selector");
const dayViewContainer = document.querySelector("#day-view");
const weekViewContainer = document.querySelector("#week-view");
const monthViewContainer = document.querySelector("#month-view");
const yearViewContainer = document.querySelector("#year-view");
const displayModeButtons = Array.from(document.querySelectorAll(".display-mode-button"));

let currentState = undefined;
let currentDisplayMode = "minute";

configInput.value = JSON.stringify(DEFAULT_CONFIG, null, 2);

toggleConfigButton?.addEventListener("click", () => {
  const shouldShow = document.body.classList.contains("config-hidden");
  setConfigVisibility(shouldShow);
  if (shouldShow) {
    formCard?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (configInput) {
      requestAnimationFrame(() => configInput.focus());
    }
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  formError.textContent = "";
  downloadButton.disabled = true;
  delete downloadButton.dataset.payload;
  delete downloadButton.dataset.filename;

  let config;
  try {
    config = JSON.parse(configInput.value);
  } catch (error) {
    formError.textContent = "Configuration is not valid JSON.";
    return;
  }

  try {
    const startDate = parseDateInput(startDateInput.value);
    const { events, totals, meta } = generateSchedule(config, startDate);
    currentState = { events, totals, meta, displayCache: new Map() };
    currentDisplayMode = "minute";
    updateDisplayModeButtons();
    const heading = resultsSection.querySelector(".results-header h2");
    heading.textContent = meta.name ? `${meta.name}'s schedule` : "Generated schedule";
    renderTotals(totals);
    renderJson(events);
    renderAllViews();
    enableDownload(events, config.name);
    resultsSection.classList.remove("hidden");
    activateView(document.querySelector(".view-tab.active")?.dataset.view || "overview");
    if (toggleConfigButton) {
      toggleConfigButton.hidden = false;
      setConfigVisibility(false);
    }
  } catch (error) {
    console.error(error);
    formError.textContent = error.message || "Failed to generate schedule.";
  }
});

viewTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    if (!currentState) {
      return;
    }
    activateView(tab.dataset.view);
  });
});

displayModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.displayMode;
    if (!mode || mode === currentDisplayMode) {
      return;
    }
    currentDisplayMode = mode;
    if (currentState && currentState.displayCache) {
      // Clear cached output for this mode to ensure it recomputes fresh.
      currentState.displayCache.delete(mode);
    }
    updateDisplayModeButtons();
    if (currentState) {
      renderAllViews();
    }
  });
});

downloadButton.addEventListener("click", () => {
  if (downloadButton.disabled || !downloadButton.dataset.payload) {
    return;
  }

  const blob = new Blob([downloadButton.dataset.payload], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadButton.dataset.filename || "schedule.json";
  link.click();
  URL.revokeObjectURL(url);
});

function enableDownload(events, name) {
  const payload = JSON.stringify(events, null, 2);
  downloadButton.dataset.payload = payload;
  downloadButton.dataset.filename = slugify(name || "schedule") + "-schedule.json";
  downloadButton.disabled = false;
}

function renderAllViews() {
  if (!currentState) {
    timelineContainer.innerHTML = "";
    eventTable.innerHTML = "";
    dayViewContainer.innerHTML = "";
    weekViewContainer.innerHTML = "";
    monthViewContainer.innerHTML = "";
    yearViewContainer.innerHTML = "";
    return;
  }

  const events = getDisplayEvents();
  renderTimeline(events);
  renderEventTable(events);
  renderDayView(events, currentState.meta);
  renderWeekView(events);
  renderMonthView(events, currentState.meta);
  renderYearView(events, currentState.meta);
}

function getDisplayEvents() {
  if (!currentState) {
    return [];
  }

  if (!currentState.displayCache) {
    currentState.displayCache = new Map();
  }

  if (currentDisplayMode === "minute") {
    return currentState.events;
  }

  if (currentState.displayCache.has(currentDisplayMode)) {
    return currentState.displayCache.get(currentDisplayMode);
  }

  let transformed = currentState.events;
  switch (currentDisplayMode) {
    case "grid-15":
      transformed = quantizeEventsForDisplay(currentState.events, 15);
      break;
    default:
      transformed = currentState.events;
  }

  currentState.displayCache.set(currentDisplayMode, transformed);
  return transformed;
}

function slugify(value) {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function setConfigVisibility(visible) {
  document.body.classList.toggle("config-hidden", !visible);
  if (toggleConfigButton) {
    toggleConfigButton.textContent = visible ? "Hide configuration" : "Show configuration";
    toggleConfigButton.setAttribute("aria-expanded", String(visible));
  }
}

function activateView(view) {
  viewTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  viewPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.view === view);
  });
}

function updateDisplayModeButtons() {
  displayModeButtons.forEach((button) => {
    const mode = button.dataset.displayMode;
    button.classList.toggle("active", Boolean(mode) && mode === currentDisplayMode);
  });
}

function renderTotals(totals) {
  totalsContainer.innerHTML = "";
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.textContent = "No totals calculated.";
    totalsContainer.append(empty);
    return;
  }
  entries.forEach(([activity, hours]) => {
    const chip = document.createElement("span");
    chip.className = "total-chip";
    chip.textContent = `${capitalize(activity)} · ${hours.toFixed(1)} h`;
    totalsContainer.append(chip);
  });
}

function renderTimeline(events) {
  timelineContainer.innerHTML = "";
  const grouped = groupEventsByDay(events);
  for (const dayName of DAY_NAMES) {
    const dayEntry = grouped.get(dayName);
    const wrapper = document.createElement("div");
    wrapper.className = "timeline-day";
    const heading = document.createElement("h4");
    heading.textContent = formatDayHeading(dayEntry?.date, dayName);
    wrapper.append(heading);
    const rail = createTimelineRail(dayEntry?.events || [], { hourStep: 240, className: "timeline-rail" });
    wrapper.append(rail);
    timelineContainer.append(wrapper);
  }
}

function renderEventTable(events) {
  eventTable.innerHTML = "";
  const grouped = groupEventsByDay(events);
  const rowTemplate = document.querySelector("#event-row-template");

  for (const dayName of DAY_NAMES) {
    const dayEntry = grouped.get(dayName);
    if (!dayEntry || !dayEntry.events.length) {
      continue;
    }

    const group = document.createElement("section");
    group.className = "event-group";
    const heading = document.createElement("h3");
    heading.textContent = formatDayHeading(dayEntry.date, dayName);
    group.append(heading);

    const body = document.createElement("div");
    body.className = "event-group-body";

    dayEntry.events
      .filter((event) => event.activity !== "free time")
      .forEach((event) => {
        const fragment = rowTemplate.content.cloneNode(true);
        fragment.querySelector(".event-time").textContent = `${event.start} – ${event.end}`;
        fragment.querySelector(".event-activity").textContent = event.activity;
        fragment.querySelector(".event-duration").textContent = `${event.duration_minutes} min`;
        body.append(fragment);
      });

    if (!body.children.length) {
      const empty = document.createElement("div");
      empty.className = "event-row";
      empty.textContent = "No scheduled activities.";
      body.append(empty);
    }

    group.append(body);
    eventTable.append(group);
  }
}

function renderJson(events) {
  jsonOutput.textContent = JSON.stringify(events, null, 2);
}

function renderDayView(events, meta) {
  const grouped = groupEventsByDay(events);
  daySelector.innerHTML = "";
  dayViewContainer.innerHTML = "";
  const available = DAY_NAMES.filter((name) => grouped.get(name)?.events?.some((event) => event.activity !== "free time"));

  if (!available.length) {
    const message = document.createElement("p");
    message.textContent = "No scheduled activities for this week.";
    dayViewContainer.append(message);
    return;
  }

  const defaultDayFromMeta = meta?.weekStart ? dayNameFromIso(meta.weekStart) : undefined;
  const defaultDay = available.includes(defaultDayFromMeta) ? defaultDayFromMeta : available[0];

  function selectDay(dayName) {
    daySelector.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.day === dayName);
    });
    const entry = grouped.get(dayName);
    dayViewContainer.innerHTML = "";
    const column = buildDayColumn(dayName, entry, "day-view-column");
    dayViewContainer.append(column);
  }

  available.forEach((dayName) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.day = dayName;
    button.textContent = formatDayHeading(grouped.get(dayName)?.date, dayName);
    button.addEventListener("click", () => selectDay(dayName));
    daySelector.append(button);
  });

  selectDay(defaultDay);
}

function renderWeekView(events) {
  const grouped = groupEventsByDay(events);
  weekViewContainer.innerHTML = "";
  DAY_NAMES.forEach((dayName) => {
    const entry = grouped.get(dayName);
    const column = buildDayColumn(dayName, entry, "week-view-column");
    weekViewContainer.append(column);
  });
}

function renderMonthView(events, meta) {
  monthViewContainer.innerHTML = "";
  if (!events.length) {
    const message = document.createElement("p");
    message.textContent = "No data to display.";
    monthViewContainer.append(message);
    return;
  }

  const reference = parseIsoDate(meta.weekStart || events[0].date);
  const year = reference.getUTCFullYear();
  const monthIndex = reference.getUTCMonth();
  const heading = document.createElement("h3");
  heading.textContent = `${MONTH_NAMES[monthIndex]} ${year}`;
  monthViewContainer.append(heading);

  const labels = document.createElement("div");
  labels.className = "month-grid-labels";
  DAY_NAMES.forEach((day) => {
    const span = document.createElement("span");
    span.textContent = capitalize(day).slice(0, 3);
    labels.append(span);
  });
  monthViewContainer.append(labels);

  const grid = document.createElement("div");
  grid.className = "month-grid";
  const startOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const startOffset = (startOfMonth.getUTCDay() + 6) % 7; // Monday as first column
  const gridStart = addDays(startOfMonth, -startOffset);

  const eventsByDate = new Map();
  events.forEach((event) => {
    if (!eventsByDate.has(event.date)) {
      eventsByDate.set(event.date, []);
    }
    eventsByDate.get(event.date).push(event);
  });

  for (let index = 0; index < 42; index += 1) {
    const cellDate = addDays(gridStart, index);
    const iso = toIsoDate(cellDate);
    const cell = document.createElement("div");
    cell.className = "month-cell";
    if (cellDate.getUTCMonth() !== monthIndex) {
      cell.style.opacity = "0.55";
    }
    if (meta.weekStart && meta.weekEnd && iso >= meta.weekStart && iso <= meta.weekEnd) {
      cell.classList.add("active-week");
    }

    const label = document.createElement("div");
    label.className = "date-label";
    label.textContent = cellDate.getUTCDate().toString();
    const weekday = document.createElement("small");
    weekday.textContent = cellDate.toLocaleDateString(undefined, { weekday: "short" });
    label.append(weekday);
    cell.append(label);

    const dayEvents = eventsByDate.get(iso) || [];
    dayEvents
      .filter((event) => event.activity !== "free time")
      .forEach((event) => {
        const chip = document.createElement("span");
        chip.className = "month-chip";
        chip.style.background = getActivityColor(event.activity);
        chip.textContent = `${event.activity} · ${formatDuration(event.duration_minutes)}`;
        cell.append(chip);
      });

    grid.append(cell);
  }

  monthViewContainer.append(grid);

  const legend = document.createElement("div");
  legend.className = "month-legend";
  const activityTotals = new Map();
  events
    .filter((event) => parseIsoDate(event.date).getUTCMonth() === monthIndex)
    .filter((event) => event.activity !== "free time")
    .forEach((event) => {
      activityTotals.set(
        event.activity,
        (activityTotals.get(event.activity) || 0) + event.duration_minutes
      );
    });

  const sortedLegend = Array.from(activityTotals.entries()).sort((a, b) => b[1] - a[1]);
  sortedLegend.forEach(([activity, minutes]) => {
    const item = document.createElement("span");
    item.textContent = `${activity}: ${(minutes / 60).toFixed(1)} h`;
    legend.append(item);
  });

  if (legend.children.length) {
    monthViewContainer.append(legend);
  }
}

function renderYearView(events, meta) {
  yearViewContainer.innerHTML = "";
  if (!events.length) {
    const message = document.createElement("p");
    message.textContent = "No data to display.";
    yearViewContainer.append(message);
    return;
  }
  const totals = new Array(12).fill(0);
  events.forEach((event) => {
    const date = parseIsoDate(event.date);
    totals[date.getUTCMonth()] += event.duration_minutes;
  });

  const totalMinutes = totals.reduce((sum, value) => sum + value, 0);
  const gradientStops = [];
  let cursor = 0;
  totals.forEach((value, index) => {
    const share = totalMinutes ? value / totalMinutes : 1 / 12;
    const startDeg = 270 + cursor * 360;
    const endDeg = 270 + (cursor + share) * 360;
    cursor += share;
    gradientStops.push(`${MONTH_COLORS[index]} ${startDeg}deg ${endDeg}deg`);
  });

  const ring = document.createElement("div");
  ring.className = "year-ring";
  ring.style.background = `conic-gradient(${gradientStops.join(", ")})`;
  const center = document.createElement("strong");
  center.textContent = String(parseIsoDate(meta.weekStart || events[0]?.date).getUTCFullYear());
  ring.append(center);
  yearViewContainer.append(ring);

  const legend = document.createElement("div");
  legend.className = "year-legend";

  const legendEntries = totals.map((value, index) => [index, value]);
  const legendData = legendEntries.filter(([, value]) => value > 0);

  (legendData.length ? legendData : legendEntries).forEach(([index, value]) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = MONTH_COLORS[index];
    const label = document.createElement("span");
    const hours = value / 60;
    label.textContent = `${MONTH_NAMES[index]} · ${hours.toFixed(1)} h`;
    item.append(swatch, label);
    legend.append(item);
  });

  yearViewContainer.append(legend);
}

function buildDayColumn(dayName, entry, className) {
  const column = document.createElement("div");
  column.className = className;
  const header = document.createElement("div");
  header.className = "column-header";
  const title = document.createElement("h3");
  title.textContent = formatDayHeading(entry?.date, dayName);
  const total = document.createElement("span");
  const totalMinutes = (entry?.events || [])
    .filter((event) => event.activity !== "free time")
    .reduce((sum, event) => sum + event.duration_minutes, 0);
  total.textContent = totalMinutes ? `${(totalMinutes / 60).toFixed(1)} h scheduled` : "No scheduled items";
  header.append(title, total);
  column.append(header);
  const timeline = createTimelineRail(entry?.events || [], { className: "vertical-timeline", hourStep: 120 });
  column.append(timeline);
  return column;
}

function dayNameFromIso(iso) {
  const date = parseIsoDate(iso);
  const index = (date.getUTCDay() + 6) % 7;
  return DAY_NAMES[index];
}

function createTimelineRail(events, { hourStep = 180, className = "vertical-timeline" } = {}) {
  const container = document.createElement("div");
  container.className = className;
  const step = Math.max(hourStep, 60);
  for (let minutes = 0; minutes <= 1440; minutes += step) {
    const marker = document.createElement("div");
    marker.className = "timeline-hour";
    marker.style.top = `${(minutes / 1440) * 100}%`;
    marker.style.transform = "translateY(-50%)";
    marker.textContent = minutes === 1440 ? "24:00" : minutesToTime(minutes);
    container.append(marker);
  }

  events.forEach((event) => {
    const block = document.createElement("div");
    block.className = "timeline-block";
    block.dataset.activity = event.activity;
    const startMinutes = typeof event.startMinutes === "number" ? event.startMinutes : 0;
    const durationMinutes = typeof event.duration_minutes === "number" ? event.duration_minutes : 0;
    const endMinutes =
      typeof event.endMinutes === "number" ? event.endMinutes : startMinutes + durationMinutes;
    const startPercent = (startMinutes / 1440) * 100;
    const endPercent = (endMinutes / 1440) * 100;
    block.style.top = `${startPercent}%`;
    block.style.bottom = `${Math.max(0, 100 - endPercent)}%`;
    block.style.background = getActivityColor(event.activity);
    block.title = `${event.activity}: ${event.start} – ${event.end}`;
    const timeRow = document.createElement("div");
    timeRow.className = "timeline-block-time";
    const start = document.createElement("span");
    start.className = "timeline-block-time-start";
    start.textContent = event.start;
    const separator = document.createElement("span");
    separator.className = "timeline-block-time-separator";
    separator.textContent = "–";
    const end = document.createElement("span");
    end.className = "timeline-block-time-end";
    end.textContent = event.end;
    timeRow.append(start, separator, end);

    const title = document.createElement("div");
    title.className = "timeline-block-title";
    title.textContent = event.activity;

    block.append(timeRow, title);
    container.append(block);
  });

  return container;
}

function groupEventsByDay(events) {
  const grouped = new Map();
  events.forEach((event) => {
    if (!grouped.has(event.day)) {
      grouped.set(event.day, { date: event.date, events: [] });
    }
    const entry = grouped.get(event.day);
    if (!entry.date && event.date) {
      entry.date = event.date;
    }
    entry.events.push(event);
  });
  grouped.forEach((entry) => {
    entry.events.sort((a, b) => a.startMinutes - b.startMinutes);
  });
  return grouped;
}

function quantizeEventsForDisplay(events, gridMinutes = 15) {
  if (!Array.isArray(events) || !events.length) {
    return [];
  }

  const step = Math.max(1, Math.floor(gridMinutes));
  const grouped = groupEventsByDay(events);
  const quantized = [];

  for (const dayName of DAY_NAMES) {
    const entry = grouped.get(dayName);
    if (!entry || !entry.events.length) {
      continue;
    }

    const dayEvents = entry.events.slice().sort((a, b) => a.startMinutes - b.startMinutes);
    const dateIso = entry.date || dayEvents[0]?.date || null;
    let pointer = 0;
    let segment = null;

    for (let start = 0; start < 1440; start += step) {
      const slotEnd = Math.min(start + step, 1440);
      while (pointer < dayEvents.length && start >= dayEvents[pointer].endMinutes) {
        pointer += 1;
      }

      const index = Math.min(pointer, dayEvents.length - 1);
      const activeEvent = dayEvents[index];
      const activity = activeEvent?.activity || "free time";

      if (segment && segment.activity === activity) {
        segment.endMinutes = slotEnd;
        segment.end = minutesToTime(slotEnd);
        segment.duration_minutes += slotEnd - start;
      } else {
        if (segment) {
          quantized.push(segment);
        }
        segment = {
          date: dateIso,
          day: dayName,
          startMinutes: start,
          endMinutes: slotEnd,
          start: minutesToTime(start),
          end: minutesToTime(slotEnd),
          activity,
          duration_minutes: slotEnd - start,
        };
      }
    }

    if (segment) {
      quantized.push(segment);
    }
  }

  return quantized;
}

function formatDuration(minutes) {
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function formatDayHeading(dateIso, dayName) {
  if (!dateIso) {
    return capitalize(dayName);
  }
  const [year, month, day] = dateIso.split("-").map(Number);
  const formatted = new Date(Date.UTC(year, month - 1, day))
    .toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  return formatted;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getActivityColor(activity) {
  const key = activity.toLowerCase();
  if (COLOR_MAP[key]) {
    return COLOR_MAP[key];
  }
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}deg, 70%, 45%)`;
}

function parseDateInput(value) {
  if (!value) {
    return undefined;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error("Invalid start date");
  }
  return new Date(Date.UTC(year, month - 1, day));
}

function parseIsoDate(value) {
  if (!value) {
    return new Date();
  }
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function generateSchedule(config, startDate) {
  validateConfig(config);
  const reference = startDate || new Date();
  const weekStart = getWeekStart(reference);
  const days = Array.from({ length: 7 }, (_, index) => new DaySchedule(index, addDays(weekStart, index)));

  addSleep(days, config.sleep);
  addWork(days, config.work);
  addMeals(days, config.meals);
  addActivities(days, config.activities || []);
  finaliseSchedule(days);

  const events = [];
  const totals = new Map();

  for (const day of days) {
    const dayEvents = day.toEvents();
    dayEvents.forEach((event) => {
      events.push(event);
      totals.set(event.activity, (totals.get(event.activity) || 0) + event.duration_minutes);
    });
  }

  const totalsHours = Object.fromEntries(
    Array.from(totals.entries()).map(([activity, minutes]) => [activity, minutes / 60])
  );

  const meta = {
    weekStart: toIsoDate(weekStart),
    weekEnd: toIsoDate(addDays(weekStart, 6)),
    name: config.name,
  };

  return { events, totals: totalsHours, meta };
}

function validateConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Configuration must be an object");
  }
  if (!config.name) {
    throw new Error("Configuration must include a name");
  }
  if (!config.sleep) {
    throw new Error("Configuration must include sleep settings");
  }
  if (!config.meals) {
    throw new Error("Configuration must include meal times");
  }
}

function getWeekStart(reference = new Date()) {
  const date = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const day = date.getUTCDay();
  const diff = (day + 6) % 7; // Monday as 0
  date.setUTCDate(date.getUTCDate() - diff);
  return date;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + amount);
  return copy;
}

function parseTimeToMinutes(value) {
  const [hoursStr, minutesStr] = value.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours >= 24 ||
    minutes < 0 ||
    minutes >= 60
  ) {
    throw new Error(`Invalid time value: ${value}`);
  }
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  const minutes = ((value % 1440) + 1440) % 1440;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sampleNormal(mean = 0, std = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) {
    u = Math.random();
  }
  while (v === 0) {
    v = Math.random();
  }
  const magnitude = Math.sqrt(-2.0 * Math.log(u));
  const z = magnitude * Math.cos(2.0 * Math.PI * v);
  return mean + z * std;
}

class DaySchedule {
  constructor(dayIndex, date) {
    this.dayIndex = dayIndex;
    this.date = date;
    this.events = [];
  }

  addEvent(start, end, activity) {
    if (start < 0 || end > 1440 || start >= end) {
      throw new Error("Invalid event boundaries");
    }
    for (const existing of this.events) {
      if (!(end <= existing.start || start >= existing.end)) {
        return false;
      }
    }
    this.events.push({ start, end, activity });
    this.events.sort((a, b) => a.start - b.start);
    return true;
  }

  findSlot(desiredStart, duration) {
    const segments = this.freeSegments();
    for (const [start, end] of segments) {
      if (start <= desiredStart && end - desiredStart >= duration) {
        return [desiredStart, desiredStart + duration];
      }
    }
    for (const [start, end] of segments) {
      if (start >= desiredStart && end - start >= duration) {
        return [start, start + duration];
      }
    }
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const [start, end] = segments[i];
      if (end <= desiredStart && end - start >= duration) {
        return [end - duration, end];
      }
    }
    return undefined;
  }

  freeSegments() {
    const segments = [];
    let current = 0;
    for (const event of this.events) {
      if (current < event.start) {
        segments.push([current, event.start]);
      }
      current = Math.max(current, event.end);
    }
    if (current < 1440) {
      segments.push([current, 1440]);
    }
    return segments;
  }

  fillFreeTime() {
    const additions = [];
    let current = 0;
    for (const event of this.events) {
      if (current < event.start) {
        additions.push({ start: current, end: event.start, activity: "free time" });
      }
      current = event.end;
    }
    if (current < 1440) {
      additions.push({ start: current, end: 1440, activity: "free time" });
    }
    this.events.push(...additions);
    this.events.sort((a, b) => a.start - b.start);
  }

  applyMicroJitter(maxShift = 5, locked = LOCKED_ACTIVITIES) {
    if (!Number.isFinite(maxShift) || maxShift <= 0 || this.events.length < 2) {
      return;
    }

    const lockedSet = new Set(locked);
    for (let index = 0; index < this.events.length - 1; index += 1) {
      const current = this.events[index];
      const next = this.events[index + 1];

      if (lockedSet.has(current.activity) || lockedSet.has(next.activity)) {
        continue;
      }

      const minBoundary = current.start + 1;
      const maxBoundary = next.end - 1;
      if (maxBoundary <= minBoundary) {
        continue;
      }

      const shift = Math.round(clamp(sampleNormal(0, maxShift / 2), -maxShift, maxShift));
      const newBoundary = clamp(current.end + shift, minBoundary, maxBoundary);
      if (newBoundary === current.end) {
        continue;
      }

      current.end = newBoundary;
      next.start = newBoundary;
    }
  }

  validate() {
    if (!this.events.length) {
      throw new Error(`Day ${DAY_NAMES[this.dayIndex]} has no events`);
    }
    let current = 0;
    for (const event of this.events) {
      if (event.start !== current) {
        throw new Error(`Gap detected in ${DAY_NAMES[this.dayIndex]}`);
      }
      if (event.end <= event.start) {
        throw new Error(`Invalid event duration in ${DAY_NAMES[this.dayIndex]}`);
      }
      current = event.end;
    }
    if (current !== 1440) {
      throw new Error(`Day ${DAY_NAMES[this.dayIndex]} does not cover full 24 hours`);
    }
  }

  toEvents() {
    return this.events.map((event) => ({
      date: toIsoDate(this.date),
      day: DAY_NAMES[this.dayIndex],
      start: minutesToTime(event.start),
      end: minutesToTime(event.end),
      startMinutes: event.start,
      endMinutes: event.end,
      activity: event.activity,
      duration_minutes: event.end - event.start,
    }));
  }
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addSleep(schedule, config) {
  const duration = Math.floor(config.duration_hours * 60);
  for (let dayIndex = 0; dayIndex < schedule.length; dayIndex += 1) {
    let remaining = duration;
    let currentDay = dayIndex;
    let start = parseTimeToMinutes(config.bedtime);
    while (remaining > 0 && currentDay < dayIndex + schedule.length) {
      const day = schedule[currentDay % schedule.length];
      const end = Math.min(1440, start + remaining);
      if (!day.addEvent(start, end, "sleep")) {
        throw new Error(`Sleep overlaps existing event on ${DAY_NAMES[day.dayIndex]}`);
      }
      const spent = end - start;
      remaining -= spent;
      currentDay += 1;
      start = 0;
    }
  }
}

function addWork(schedule, workConfig) {
  if (!workConfig) {
    return;
  }
  const duration = Math.floor(workConfig.duration_hours * 60);
  const indices = dayIndices(workConfig.days || []);
  for (const dayIndex of indices) {
    let remaining = duration;
    let currentDay = dayIndex;
    let start = parseTimeToMinutes(workConfig.start);
    while (remaining > 0 && currentDay < dayIndex + schedule.length) {
      const day = schedule[currentDay % schedule.length];
      const end = Math.min(1440, start + remaining);
      if (!day.addEvent(start, end, "work")) {
        throw new Error(`Work overlaps existing event on ${DAY_NAMES[day.dayIndex]}`);
      }
      const spent = end - start;
      remaining -= spent;
      currentDay += 1;
      start = 0;
    }
  }
}

function addMeals(schedule, meals) {
  const duration = 30;
  const mealOrder = [
    ["breakfast", meals.breakfast],
    ["lunch", meals.lunch],
    ["dinner", meals.dinner],
  ];
  for (const day of schedule) {
    for (const [meal, timeStr] of mealOrder) {
      if (!timeStr) {
        continue;
      }
      const start = parseTimeToMinutes(timeStr);
      const slot = day.findSlot(start, duration);
      if (!slot) {
        throw new Error(`Could not schedule ${meal} on ${DAY_NAMES[day.dayIndex]}`);
      }
      day.addEvent(slot[0], slot[1], meal);
    }
  }
}

function addActivities(schedule, activities) {
  for (const activity of activities) {
    const duration = activity.duration_minutes;
    if (!duration) {
      continue;
    }
    const indices = dayIndices(activity.days || []);
    for (const dayIndex of indices) {
      const day = schedule[dayIndex];
      const start = parseTimeToMinutes(activity.time);
      const end = start + duration;
      if (end > 1440) {
        continue;
      }
      if (!day.addEvent(start, end, activity.name)) {
        continue; // skip conflicting activities per MVP scope
      }
    }
  }
}

function finaliseSchedule(schedule) {
  for (const day of schedule) {
    day.fillFreeTime();
    day.applyMicroJitter();
    day.validate();
  }
}

function dayIndices(days) {
  if (!days || !days.length) {
    return [];
  }
  if (days.some((day) => day.toLowerCase() === "daily")) {
    return DAY_NAMES.map((_, index) => index);
  }
  return days.map((day) => {
    const index = DAY_NAMES.indexOf(day.toLowerCase());
    if (index === -1) {
      throw new Error(`Unknown day: ${day}`);
    }
    return index;
  });
}
