const DAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
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
const startDateInput = document.querySelector("#start-date");
const resultsSection = document.querySelector("#results");
const resultsTitle = document.querySelector("#results-title");
const resultsSubtitle = document.querySelector("#results-subtitle");
const totalsContainer = document.querySelector("#totals");
const jsonOutput = document.querySelector("#json-output");
const downloadButton = document.querySelector("#download-json");
const calendarContainer = document.querySelector("#calendar");
const calendarWarning = document.querySelector("#calendar-warning");
const viewButtons = document.querySelectorAll("[data-view-target]");
const views = document.querySelectorAll("[data-view]");
const testConsolePresetButtons = document.querySelectorAll("[data-script-preset]");
const testConsoleCodeInput = document.querySelector("#test-console-code");
const testConsoleInput = document.querySelector("#test-console-input");
const testConsoleRunButton = document.querySelector("#test-console-run");
const testConsoleLoadButton = document.querySelector("#test-console-load");
const testConsoleStdout = document.querySelector("#test-console-stdout");
const testConsoleStderr = document.querySelector("#test-console-stderr");
const testConsoleResult = document.querySelector("#test-console-result");
const testConsoleStatusText = document.querySelector("#test-console-status-text");
const testConsoleStatusIndicator = document.querySelector("#test-console-status-indicator");
const repoFilePanel = document.querySelector("#repo-file-panel");
const repoFileSelect = document.querySelector("#repo-file-select");
const repoFileFetchButton = document.querySelector("#repo-file-fetch");
const repoFileLoadButton = document.querySelector("#repo-file-load");
const repoFilePreview = document.querySelector("#repo-file-preview");
const repoFileStatus = document.querySelector("#repo-file-status");

const TEST_CONSOLE_TIMEOUT_MS = 10_000;
const TEST_CONSOLE_SAMPLE_CONSTRAINTS = {
  name: "Test Pilot",
  sleep: {
    bedtime: "22:30",
    duration_hours: 7.5,
  },
  work: {
    start: "09:00",
    duration_hours: 8,
    days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  },
  meals: {
    breakfast: "07:30",
    lunch: "12:00",
    dinner: "18:30",
  },
  activities: [
    {
      name: "gym",
      time: "17:45",
      duration_minutes: 60,
      days: ["monday", "wednesday"],
    },
    {
      name: "reading",
      time: "21:15",
      duration_minutes: 45,
      days: ["daily"],
    },
  ],
};

const TEST_CONSOLE_BASE_PAYLOAD = {
  start_date: "2024-05-06",
  seed: 7,
  constraints: TEST_CONSOLE_SAMPLE_CONSTRAINTS,
};

const TEST_CONSOLE_EDITOR_PRESETS = {
  mk1_quick: {
    code: `from engines.base import ScheduleInput
from engines.engine_mk1 import EngineMK1

payload = payload or {}

def sample_constraints():
    return {
        "name": "Test Pilot",
        "sleep": {"bedtime": "22:30", "duration_hours": 7.5},
        "work": {
            "start": "09:00",
            "duration_hours": 8,
            "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
        },
        "meals": {
            "breakfast": "07:30",
            "lunch": "12:00",
            "dinner": "18:30",
        },
        "activities": [
            {
                "name": "gym",
                "time": "17:45",
                "duration_minutes": 60,
                "days": ["monday", "wednesday"],
            },
            {
                "name": "reading",
                "time": "21:15",
                "duration_minutes": 45,
                "days": ["daily"],
            },
        ],
    }

constraints = payload.get("constraints") or sample_constraints()
start_date = payload.get("start_date") or "2024-05-06"

engine = EngineMK1()
schedule_input = ScheduleInput(constraints=constraints, metadata={"start_date": start_date})
output = engine.generate(schedule_input)

print(f"MK1 produced {len(output.events)} events.")
output.totals`,
    input: TEST_CONSOLE_BASE_PAYLOAD,
  },
  mk2_quick: {
    code: `from datetime import date

from archetypes import create_office_worker
from calendar_gen_v2 import generate_complete_week

payload = payload or {}

start_date = payload.get("start_date") or "2024-05-06"
seed = int(payload.get("seed") or 7)

profile = create_office_worker()
result = generate_complete_week(profile, date.fromisoformat(start_date), week_seed=seed)

print(f"MK2 generated {result['metadata']['total_events']} events for {result['person']}.")
{
    "week_start": result["week_start"],
    "issue_count": result["metadata"]["issue_count"],
    "summary_hours": result["metadata"]["summary_hours"],
}`,
    input: TEST_CONSOLE_BASE_PAYLOAD,
  },
  compare_minimal: {
    code: `from datetime import date

from archetypes import create_office_worker
from calendar_gen_v2 import generate_complete_week
from engines.base import ScheduleInput
from engines.engine_mk1 import EngineMK1

payload = payload or {}

def sample_constraints():
    return {
        "name": "Test Pilot",
        "sleep": {"bedtime": "22:30", "duration_hours": 7.5},
        "work": {
            "start": "09:00",
            "duration_hours": 8,
            "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
        },
        "meals": {
            "breakfast": "07:30",
            "lunch": "12:00",
            "dinner": "18:30",
        },
        "activities": [
            {
                "name": "gym",
                "time": "17:45",
                "duration_minutes": 60,
                "days": ["monday", "wednesday"],
            },
            {
                "name": "reading",
                "time": "21:15",
                "duration_minutes": 45,
                "days": ["daily"],
            },
        ],
    }

start_date = payload.get("start_date") or "2024-05-06"
seed = int(payload.get("seed") or 7)
constraints = payload.get("constraints") or sample_constraints()

mk1_engine = EngineMK1()
mk1_input = ScheduleInput(constraints=constraints, metadata={"start_date": start_date})
mk1_output = mk1_engine.generate(mk1_input)

profile = create_office_worker()
mk2_result = generate_complete_week(profile, date.fromisoformat(start_date), week_seed=seed)

comparison = {
    "mk1_events": len(mk1_output.events),
    "mk2_events": mk2_result["metadata"]["total_events"],
    "mk1_first_event": mk1_output.events[0] if mk1_output.events else None,
    "mk2_first_event": mk2_result["events"][0] if mk2_result["events"] else None,
}

print("Generated comparison for MK1 and MK2.")
comparison`,
    input: TEST_CONSOLE_BASE_PAYLOAD,
  },
  scratch: {
    code: "",
  },
};

let refreshTestConsoleEditor = () => {};
const DEFAULT_REPO_SLUG = document.documentElement?.dataset?.repoSlug || "openai/Wyrd-Engine";
const DEFAULT_REPO_BRANCH = document.documentElement?.dataset?.repoBranch || "main";
const REPO_FILE_MANIFEST = [
  {
    id: "engine-mk1",
    label: "Engine Mk1 (engines/engine_mk1.py)",
    path: "engines/engine_mk1.py",
    target: "code",
  },
  {
    id: "engine-mk2",
    label: "Engine Mk2 (engines/engine_mk2.py)",
    path: "engines/engine_mk2.py",
    target: "code",
  },
  {
    id: "calendar-gen",
    label: "Calendar generator CLI (calendar_gen.py)",
    path: "calendar_gen.py",
    target: "code",
  },
  {
    id: "example-budget",
    label: "Example payload (examples/yearly_budget_alice.json)",
    path: "examples/yearly_budget_alice.json",
    target: "input",
  },
  {
    id: "fixture-deterministic-config",
    label: "Fixture: deterministic config (tests/fixtures/deterministic_sample_config.json)",
    path: "tests/fixtures/deterministic_sample_config.json",
    target: "input",
  },
  {
    id: "fixture-deterministic-output",
    label: "Fixture: deterministic output (tests/fixtures/deterministic_sample_output.json)",
    path: "tests/fixtures/deterministic_sample_output.json",
    target: "input",
  },
];

let currentState = undefined;
let calendar;

if (configInput) {
  configInput.value = JSON.stringify(DEFAULT_CONFIG, null, 2);
}

initViews();
initCalendar();
initTestConsole();

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!configInput) {
    return;
  }

  formError.textContent = "";
  disableDownload();

  let config;
  try {
    config = JSON.parse(configInput.value);
  } catch (error) {
    formError.textContent = "Configuration is not valid JSON.";
    return;
  }

  let startDate;
  try {
    startDate = parseDateInput(startDateInput?.value);
  } catch (error) {
    formError.textContent = error.message || "Invalid start date.";
    return;
  }

  try {
    const { events, totals, meta } = generateSchedule(config, startDate);
    currentState = { events, totals, meta };
    updateResultsHeader(meta);
    renderTotals(totals);
    renderCalendar(events, meta);
    renderJson(events);
    enableDownload(events, config.name);
    resultsSection?.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    formError.textContent = error.message || "Failed to generate schedule.";
  }
});

function initCalendar() {
  if (!calendarContainer) {
    return;
  }

  const FullCalendar = window.FullCalendar;
  if (!FullCalendar || typeof FullCalendar.Calendar !== "function") {
    calendarWarning?.classList.remove("hidden");
    return;
  }

  calendar = new FullCalendar.Calendar(calendarContainer, {
    initialView: "timeGridWeek",
    allDaySlot: false,
    firstDay: 1,
    slotMinTime: "00:00:00",
    slotMaxTime: "24:00:00",
    slotDuration: "00:30:00",
    expandRows: true,
    height: "auto",
    nowIndicator: true,
    dayHeaderFormat: { weekday: "short", month: "short", day: "numeric" },
    eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
    eventDisplay: "block",
    progressiveEventRendering: true,
    editable: false,
    selectable: false,
    headerToolbar: false,
  });

  calendar.render();
  calendarWarning?.classList.add("hidden");
}

function initViews() {
  if (!viewButtons.length || !views.length) {
    return;
  }

  showView("calendar");

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.viewTarget;
      if (!target) {
        return;
      }

      showView(target);
    });
  });
}

function showView(target) {
  views.forEach((view) => {
    if (view.dataset.view === target) {
      view.classList.remove("hidden");
    } else {
      view.classList.add("hidden");
    }
  });

  viewButtons.forEach((button) => {
    if (button.dataset.viewTarget === target) {
      button.classList.add("is-active");
    } else {
      button.classList.remove("is-active");
    }
  });

  if (target === "test-console") {
    refreshTestConsoleEditor();
  }
}

function renderCalendar(events, meta) {
  if (!calendarContainer) {
    return;
  }

  if (!calendar) {
    initCalendar();
  }

  if (!calendar) {
    return;
  }

  const visibleEvents = events.filter((event) => event.activity !== "free time");
  const calendarEvents = visibleEvents.map((event) => {
    const backgroundColor = getActivityColor(event.activity);
    const textColor = event.activity.toLowerCase() === "free time" ? "#0f172a" : "#ffffff";
    return {
      title: capitalize(event.activity),
      start: `${event.date}T${event.start}:00`,
      end: `${event.date}T${event.end}:00`,
      backgroundColor,
      borderColor: backgroundColor,
      textColor,
    };
  });

  calendar.removeAllEvents();
  if (calendarEvents.length) {
    calendar.addEventSource(calendarEvents);
  }

  const focusDate = meta?.weekStart || calendarEvents[0]?.start?.slice(0, 10);
  if (focusDate) {
    calendar.gotoDate(focusDate);
  }
}

function updateResultsHeader(meta) {
  if (resultsTitle) {
    resultsTitle.textContent = meta?.name ? `${meta.name}'s schedule` : "Generated schedule";
  }
  if (!resultsSubtitle) {
    return;
  }
  if (meta?.weekStart && meta?.weekEnd) {
    resultsSubtitle.textContent = formatWeekRange(meta.weekStart, meta.weekEnd);
  } else {
    resultsSubtitle.textContent = "";
  }
}

function renderTotals(totals) {
  if (!totalsContainer) {
    return;
  }
  totalsContainer.innerHTML = "";
  const entries = Object.entries(totals)
    .filter(([activity]) => activity !== "free time")
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.textContent = "No scheduled activities.";
    totalsContainer.append(empty);
    return;
  }
  entries.forEach(([activity, hours]) => {
    const chip = document.createElement("div");
    chip.className = "total-chip";
    const label = document.createElement("span");
    label.textContent = capitalize(activity);
    const value = document.createElement("span");
    value.textContent = `${hours.toFixed(1)} h`;
    chip.append(label, value);
    totalsContainer.append(chip);
  });
}

function renderJson(events) {
  if (!jsonOutput) {
    return;
  }
  jsonOutput.textContent = JSON.stringify(events, null, 2);
}

function enableDownload(events, name) {
  if (!downloadButton) {
    return;
  }
  const payload = JSON.stringify(events, null, 2);
  downloadButton.dataset.payload = payload;
  downloadButton.dataset.filename = `${slugify(name || "schedule")}-schedule.json`;
  downloadButton.disabled = false;
}

downloadButton?.addEventListener("click", () => {
  if (!downloadButton.dataset?.payload) {
    return;
  }
  const blob = new Blob([downloadButton.dataset.payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadButton.dataset.filename || "schedule.json";
  link.click();
  URL.revokeObjectURL(url);
});

function disableDownload() {
  if (!downloadButton) {
    return;
  }
  downloadButton.disabled = true;
  delete downloadButton.dataset.payload;
  delete downloadButton.dataset.filename;
}

function slugify(value) {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function getActivityColor(activity) {
  const key = activity.toLowerCase();
  if (COLOR_MAP[key]) {
    return COLOR_MAP[key];
  }
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}deg, 70%, 45%)`;
}

function formatWeekRange(startIso, endIso) {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  const formatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
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
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const [start, end] = segments[index];
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

function initTestConsole() {
  if (!testConsoleRunButton || !testConsoleStdout) {
    return;
  }

  const runtime = createPyRuntimeController();
  let runtimeLoaded = false;
  let runtimeLoading = false;
  let runtimeLoadPromise;
  let isExecuting = false;
  let runCancelled = false;
  let activeRunToken = 0;
  let activePresetId = null;

  const presetButtonList = Array.from(testConsolePresetButtons || []);
  const repoBrowser = createRepoBrowser();
  const codeEditor = createCodeEditor();

  refreshTestConsoleEditor = () => {
    if (codeEditor && typeof codeEditor.refresh === "function") {
      codeEditor.refresh();
    }
  };

  if (testConsoleInput && !testConsoleInput.value.trim()) {
    testConsoleInput.value = JSON.stringify(TEST_CONSOLE_BASE_PAYLOAD, null, 2);
  }

  if (presetButtonList.length) {
    applyEditorPreset("mk1_quick");
  } else if (testConsoleCodeInput && !testConsoleCodeInput.value.trim()) {
    setEditorValue("");
  }

  updateRunButtonState();
  updateLoadButtonLabel();

  presetButtonList.forEach((button) => {
    button.addEventListener("click", () => {
      const presetId = button.dataset.scriptPreset || "";
      applyEditorPreset(presetId);
    });
  });

  if (!codeEditor && testConsoleCodeInput) {
    testConsoleCodeInput.addEventListener("input", () => {
      updateRunButtonState();
    });
  }

  testConsoleLoadButton?.addEventListener("click", () => {
    if (isExecuting) {
      cancelExecution("Execution cancelled while reloading runtime.", { restart: true });
      return;
    }
    loadRuntime({ restart: runtimeLoaded });
  });

  testConsoleRunButton.addEventListener("click", () => {
    if (isExecuting) {
      cancelExecution("Execution cancelled by user.", { restart: true });
    } else {
      runSelectedScript();
    }
  });

  queueMicrotask(() => {
    loadRuntime();
  });

  function createCodeEditor() {
    if (!testConsoleCodeInput || typeof window.CodeMirror !== "function") {
      return null;
    }

    const editor = window.CodeMirror.fromTextArea(testConsoleCodeInput, {
      mode: "python",
      lineNumbers: true,
      indentUnit: 4,
      indentWithTabs: false,
      lineWrapping: true,
      viewportMargin: Infinity,
    });

    editor.on("change", () => {
      testConsoleCodeInput.value = editor.getValue();
      updateRunButtonState();
    });

    return editor;
  }

  function getEditorValue() {
    if (!testConsoleCodeInput) {
      return "";
    }
    if (codeEditor) {
      return codeEditor.getValue();
    }
    return testConsoleCodeInput.value || "";
  }

  function setEditorValue(value) {
    const nextValue = value || "";
    if (testConsoleCodeInput) {
      testConsoleCodeInput.value = nextValue;
    }
    if (codeEditor && codeEditor.getValue() !== nextValue) {
      codeEditor.setValue(nextValue);
      codeEditor.refresh();
    }
  }

  function applyEditorPreset(presetId) {
    const preset = TEST_CONSOLE_EDITOR_PRESETS[presetId];
    activePresetId = preset ? presetId : null;
    updatePresetButtons();

    if (!preset) {
      setEditorValue("");
      updateRunButtonState();
      return;
    }

    setEditorValue(preset.code || "");

    if (testConsoleInput) {
      if (typeof preset.input !== "undefined") {
        const payload = preset.input ?? {};
        testConsoleInput.value = JSON.stringify(payload, null, 2);
      } else if (!testConsoleInput.value.trim()) {
        testConsoleInput.value = "{}";
      }
    }

    updateRunButtonState();
  }

  function clearActivePreset() {
    activePresetId = null;
    updatePresetButtons();
  }

  function updatePresetButtons() {
    presetButtonList.forEach((button) => {
      if (button.dataset.scriptPreset === activePresetId) {
        button.classList.add("is-active");
      } else {
        button.classList.remove("is-active");
      }
    });
  }

  function createRepoBrowser() {
    if (!repoFilePanel || !repoFileSelect || !repoFilePreview) {
      return null;
    }

    repoFileSelect.innerHTML = "";
    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Select a file…";
    repoFileSelect.appendChild(placeholderOption);

    for (const entry of REPO_FILE_MANIFEST) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.label;
      repoFileSelect.appendChild(option);
    }

    let previewData;
    let loading = false;

    setPreviewMessage("Select a file to preview its contents.");
    setStatus("");
    updateLoadButtonState();

    repoFileSelect.addEventListener("change", () => {
      previewData = undefined;
      updateLoadButtonState();
      if (!repoFileSelect.value) {
        setPreviewMessage("Select a file to preview its contents.");
      } else {
        setPreviewMessage("Click Preview to fetch the latest contents.");
      }
      setStatus("");
    });

    repoFileFetchButton?.addEventListener("click", async () => {
      if (loading) {
        return;
      }
      const entry = findManifestEntry(repoFileSelect.value);
      if (!entry) {
        setStatus("Choose a file before requesting a preview.");
        return;
      }

      loading = true;
      setStatus(`Fetching ${entry.path}…`);
      setPreviewMessage("Loading preview…");
      setLoadingState(true);

      try {
        const source = getRepoSource();
        const { content, viaProxy } = await fetchRepoFileContent(entry.path, source);
        previewData = {
          entry,
          content,
          viaProxy,
        };
        repoFilePreview.textContent = content || "(File is empty)";
        setStatus(
          viaProxy
            ? `Loaded via proxy from ${entry.path}.`
            : `Loaded from GitHub: ${entry.path}.`,
        );
      } catch (error) {
        previewData = undefined;
        setPreviewMessage("Unable to load file preview.");
        setStatus(error?.message ? `Error: ${error.message}` : "Error loading file.");
      } finally {
        loading = false;
        setLoadingState(false);
        updateLoadButtonState();
      }
    });

    repoFileLoadButton?.addEventListener("click", () => {
      if (!previewData) {
        return;
      }

      const { entry, content } = previewData;
      if (entry.target === "code" && testConsoleCodeInput) {
        clearActivePreset();
        setEditorValue(content);
      } else if (entry.target === "input" && testConsoleInput) {
        testConsoleInput.value = content;
      }

      updateRunButtonState();
      setStatus(
        entry.target === "code"
          ? "Loaded into the Python editor."
          : "Loaded into the input JSON field.",
      );
    });

    function updateLoadButtonState() {
      if (repoFileLoadButton) {
        repoFileLoadButton.disabled = loading || !previewData;
      }
    }

    function setPreviewMessage(message) {
      if (repoFilePreview) {
        repoFilePreview.textContent = message;
      }
    }

    function setStatus(message) {
      if (repoFileStatus) {
        repoFileStatus.textContent = message;
      }
    }

    function setLoadingState(isLoading) {
      if (repoFileSelect) {
        repoFileSelect.disabled = isLoading;
      }
      if (repoFileFetchButton) {
        repoFileFetchButton.disabled = isLoading;
      }
      if (repoFileLoadButton) {
        repoFileLoadButton.disabled = isLoading || !previewData;
      }
    }

    function findManifestEntry(id) {
      return REPO_FILE_MANIFEST.find((item) => item.id === id);
    }

    function getRepoSource() {
      return {
        slug: DEFAULT_REPO_SLUG,
        branch: DEFAULT_REPO_BRANCH,
      };
    }

    return {
      get selectedEntry() {
        return previewData?.entry;
      },
    };
  }

  function updateRunButtonState() {
    if (!testConsoleRunButton) {
      return;
    }
    if (isExecuting) {
      testConsoleRunButton.disabled = false;
      testConsoleRunButton.textContent = "Cancel";
      return;
    }

    const hasScript = Boolean(getEditorValue().trim());
    testConsoleRunButton.textContent = "Run";
    testConsoleRunButton.disabled = !runtimeLoaded || !hasScript;
  }

  function updateLoadButtonLabel() {
    if (!testConsoleLoadButton) {
      return;
    }
    testConsoleLoadButton.textContent = runtimeLoaded ? "Reload Runtime" : "Load Runtime";
    testConsoleLoadButton.disabled = runtimeLoading || isExecuting;
  }

  function setStatusIndicator(state, message) {
    if (testConsoleStatusText) {
      testConsoleStatusText.textContent = message;
    }
    if (!testConsoleStatusIndicator) {
      return;
    }
    testConsoleStatusIndicator.classList.remove(
      "is-idle",
      "is-loading",
      "is-ready",
      "is-error",
      "is-running",
    );
    if (state) {
      testConsoleStatusIndicator.classList.add(`is-${state}`);
    }
  }

  function loadRuntime({ restart = false } = {}) {
    if (runtimeLoading) {
      return runtimeLoadPromise;
    }

    runtimeLoading = true;
    runtimeLoaded = false;
    updateRunButtonState();
    updateLoadButtonLabel();

    const verb = restart ? "Reloading" : "Loading";
    setStatusIndicator("loading", `${verb} Pyodide runtime…`);

    const loader = restart ? runtime.restart() : runtime.load();
    runtimeLoadPromise = loader
      .then(() => {
        runtimeLoaded = true;
        setStatusIndicator("ready", "Runtime ready.");
      })
      .catch((error) => {
        runtimeLoaded = false;
        setStatusIndicator("error", `Runtime failed to load: ${error.message || error}`);
        return Promise.reject(error);
      })
      .finally(() => {
        runtimeLoading = false;
        updateRunButtonState();
        updateLoadButtonLabel();
      });

    return runtimeLoadPromise;
  }

  function runSelectedScript() {
    if (!runtimeLoaded) {
      loadRuntime();
      return;
    }

    const code = getEditorValue();
    if (!code.trim()) {
      setStatusIndicator("error", "No Python code to execute.");
      return;
    }

    let payload;
    try {
      payload = parseInputPayload();
    } catch (error) {
      setStatusIndicator("error", error.message);
      if (testConsoleStderr) {
        testConsoleStderr.textContent = error.message;
      }
      return;
    }

    isExecuting = true;
    runCancelled = false;
    activeRunToken += 1;
    const runToken = activeRunToken;
    setOutputsPending();
    setStatusIndicator("running", "Running script…");
    updateRunButtonState();
    updateLoadButtonLabel();

    const timeoutId = window.setTimeout(() => {
      if (runCancelled || runToken !== activeRunToken) {
        return;
      }
      cancelExecution("Execution timed out after 10 seconds. Restarting runtime…", {
        restart: true,
        timedOut: true,
      });
    }, TEST_CONSOLE_TIMEOUT_MS);

    runtime
      .run(code, { context: payload })
      .then((response) => {
        if (runCancelled || runToken !== activeRunToken) {
          return;
        }
        renderOutputs(response);
        setStatusIndicator("ready", "Execution finished successfully.");
      })
      .catch((error) => {
        if (runCancelled || runToken !== activeRunToken) {
          return;
        }
        renderError(error);
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (runCancelled || runToken !== activeRunToken) {
          runCancelled = false;
          return;
        }
        isExecuting = false;
        updateRunButtonState();
        updateLoadButtonLabel();
      });
  }

  function cancelExecution(message, { restart = false, timedOut = false } = {}) {
    if (!isExecuting) {
      return;
    }
    isExecuting = false;
    runCancelled = true;
    runtimeLoaded = false;
    updateRunButtonState();

    const note = message || (timedOut ? "Execution timed out." : "Execution cancelled.");
    if (testConsoleStderr) {
      testConsoleStderr.textContent = note;
    }
    if (testConsoleResult) {
      testConsoleResult.textContent = JSON.stringify({ error: note }, null, 2);
    }

    if (testConsoleLoadButton) {
      testConsoleLoadButton.disabled = true;
    }

    runtime.terminate(note);

    if (restart) {
      loadRuntime({ restart: true });
    } else {
      updateLoadButtonLabel();
      setStatusIndicator(timedOut ? "error" : "ready", note);
    }
  }

  function setOutputsPending() {
    if (testConsoleStdout) {
      testConsoleStdout.textContent = "Running…";
    }
    if (testConsoleStderr) {
      testConsoleStderr.textContent = "Collecting stderr…";
    }
    if (testConsoleResult) {
      testConsoleResult.textContent = "Awaiting result…";
    }
  }

  function renderOutputs(response) {
    if (testConsoleStdout) {
      testConsoleStdout.textContent = response.stdout?.length ? response.stdout : "(no stdout captured)";
    }
    if (testConsoleStderr) {
      testConsoleStderr.textContent = response.stderr?.length ? response.stderr : "(no stderr captured)";
    }
    if (testConsoleResult) {
      testConsoleResult.textContent = response.resultJSON || "null";
    }
  }

  function renderError(error) {
    const details = error?.details || {};
    if (testConsoleStdout) {
      testConsoleStdout.textContent = details.stdout?.length ? details.stdout : "(no stdout captured)";
    }
    if (testConsoleStderr) {
      const stderrMessage = details.stderr?.length ? details.stderr : error.message || "Execution failed.";
      testConsoleStderr.textContent = stderrMessage;
    }
    if (testConsoleResult) {
      if (details.resultJSON) {
        testConsoleResult.textContent = details.resultJSON;
      } else {
        testConsoleResult.textContent = JSON.stringify({ error: error.message || "Execution failed." }, null, 2);
      }
    }
    setStatusIndicator("error", error.message || "Execution failed.");
  }

  function parseInputPayload() {
    if (!testConsoleInput) {
      return {};
    }
    const raw = testConsoleInput.value.trim();
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Input JSON is invalid: ${error.message}`);
    }
  }
}
async function fetchRepoFileContent(path, source = {}) {
  const slug = (source.slug || DEFAULT_REPO_SLUG || "").trim();
  const branch = (source.branch || DEFAULT_REPO_BRANCH || "main").trim();
  if (!slug) {
    throw new Error("Missing repository slug.");
  }

  const directUrl = `https://raw.githubusercontent.com/${slug}/${branch}/${path}`;

  try {
    const response = await fetch(directUrl, { credentials: "omit" });
    if (response.ok) {
      const content = await response.text();
      return {
        content,
        viaProxy: false,
        url: directUrl,
      };
    }
    throw new Error(`Direct request returned status ${response.status}.`);
  } catch (error) {
    const proxyUrl = resolveProxyUrl();
    proxyUrl.searchParams.set("path", path);
    proxyUrl.searchParams.set("slug", slug);
    proxyUrl.searchParams.set("branch", branch);

    const response = await fetch(proxyUrl.toString(), { credentials: "omit" });
    if (!response.ok) {
      const fallbackBody = await safeReadText(response);
      throw new Error(
        fallbackBody
          ? `Proxy request failed with status ${response.status}: ${fallbackBody}`
          : `Proxy request failed with status ${response.status}.`,
      );
    }

    const content = await response.text();
    return {
      content,
      viaProxy: true,
      url: directUrl,
    };
  }
}

function resolveProxyUrl() {
  try {
    return new URL("/.netlify/functions/proxy", window.location.origin);
  } catch (error) {
    return new URL("./.netlify/functions/proxy", window.location.href);
  }
}

async function safeReadText(response) {
  try {
    const text = await response.text();
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  } catch (error) {
    return "";
  }
}

function createPyRuntimeController() {
  let worker;
  let loadPromise;
  let requestId = 0;
  const pending = new Map();

  function ensureWorker() {
    if (worker) {
      return worker;
    }
    worker = new Worker(new URL("./workers/pyRunner.js", import.meta.url), { type: "module" });
    worker.onmessage = handleMessage;
    worker.onmessageerror = () => {
      const error = new Error("Failed to process message from Pyodide runtime");
      failPending(error);
      terminateWorker();
    };
    worker.onerror = (event) => {
      const error = new Error(event?.message || "Pyodide worker error");
      failPending(error);
      terminateWorker();
    };
    return worker;
  }

  function handleMessage(event) {
    const message = event.data || {};
    if (typeof message.id === "undefined") {
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) {
      return;
    }
    pending.delete(message.id);
    if (message.ok) {
      entry.resolve(message);
    } else {
      const error = new Error(message.error || "Pyodide runtime error");
      error.details = message;
      entry.reject(error);
    }
  }

  function postMessage(type, data = {}) {
    const instance = ensureWorker();
    const id = ++requestId;
    const payload = { id, type, ...data };
    const response = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    instance.postMessage(payload);
    return response;
  }

  function failPending(error) {
    pending.forEach(({ reject }) => {
      reject(error);
    });
    pending.clear();
    loadPromise = undefined;
  }

  function terminateWorker() {
    if (worker) {
      worker.terminate();
      worker = undefined;
    }
    loadPromise = undefined;
  }

  async function load() {
    ensureWorker();
    if (!loadPromise) {
      loadPromise = postMessage("load").catch((error) => {
        loadPromise = undefined;
        throw error;
      });
    }
    await loadPromise;
  }

  async function run(code, { context } = {}) {
    await load();
    return postMessage("runPython", { code, context });
  }

  async function restart() {
    const error = new Error("Runtime restarting");
    failPending(error);
    terminateWorker();
    await load();
  }

  function terminate(reason = "Runtime terminated") {
    const error = new Error(reason);
    failPending(error);
    terminateWorker();
  }

  return {
    load,
    run,
    restart,
    terminate,
  };
}
