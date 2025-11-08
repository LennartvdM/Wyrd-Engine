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
  sleep: "#0ea5e9",
  work: "#14b8a6",
  breakfast: "#f97316",
  lunch: "#fb923c",
  dinner: "#c2410c",
  commute_in: "#818cf8",
  commute_out: "#6366f1",
  "free time": "#facc15",
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
const replayInspector = document.querySelector("#replay-inspector");
const replaySvg = document.querySelector("#replay-radial");
const replayEventList = document.querySelector("#replay-event-list");
const replayMinuteLabel = document.querySelector("#replay-minute-label");
const replayExportSvgButton = document.querySelector("#replay-export-svg");
const replayExportPngButton = document.querySelector("#replay-export-png");
const replayExportGifButton = document.querySelector("#replay-export-gif");
const replayExportMp4Button = document.querySelector("#replay-export-mp4");
const replayExportStatus = document.querySelector("#replay-export-status");
const replayExportButtons = [
  replayExportSvgButton,
  replayExportPngButton,
  replayExportGifButton,
  replayExportMp4Button,
];
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
const runnerConfigInput = document.querySelector("#runner-config-json");
const runnerSeedInput = document.querySelector("#runner-seed");
const runnerStartDateInput = document.querySelector("#runner-start-date");
const runnerDaysInput = document.querySelector("#runner-days");
const testConsoleStdout = document.querySelector("#test-console-stdout");
const testConsoleStderr = document.querySelector("#test-console-stderr");
const testConsoleResult = document.querySelector("#test-console-result");
const testConsoleStatusText = document.querySelector("#test-console-status-text");
const testConsoleStatusIndicator = document.querySelector("#test-console-status-indicator");
const fixtureDiffPanel = document.querySelector("#fixture-diff-panel");
const fixtureSelect = document.querySelector("#fixture-select");
const fixtureDiffSummary = document.querySelector("#fixture-diff-summary");
const fixtureExpectedOutput = document.querySelector("#fixture-expected-output");
const fixtureActualOutput = document.querySelector("#fixture-actual-output");
const fixtureDiffBadge = document.querySelector("#fixture-diff-badge");
const repoFilePanel = document.querySelector("#repo-file-panel");
const repoFileSelect = document.querySelector("#repo-file-select");
const repoFileFetchButton = document.querySelector("#repo-file-fetch");
const repoFileLoadButton = document.querySelector("#repo-file-load");
const repoFilePreview = document.querySelector("#repo-file-preview");
const repoFileStatus = document.querySelector("#repo-file-status");

const SVG_NS = "http://www.w3.org/2000/svg";
const REPLAY_DEFAULT_LABEL = "Hover or tap the wheel to inspect minute ranges.";
const EXPORT_STYLE_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "font-size",
  "font-family",
  "font-weight",
  "opacity",
  "filter",
];
const REPLAY_EXPORT_DURATION_MS = 5_000;
const REPLAY_EXPORT_FPS = 20;

let replayState = createEmptyReplayState();
let replayExportReady = false;
let replayExportBusy = false;

if (replaySvg) {
  replaySvg.addEventListener("pointermove", handleReplayPointerMove);
  replaySvg.addEventListener("pointerleave", handleReplayPointerLeave);
  replaySvg.addEventListener("click", handleReplayPointerClick);
}

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

const FIXTURE_DIRECTORY_PATH = "../tests/fixtures";
const FIXTURE_MANIFEST_NAME = "manifest.json";
const FIXTURE_SUMMARY_LIMIT = 8;
const DIFF_VALUE_PREVIEW_LIMIT = 80;

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
    renderJson(events, meta);
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

function renderJson(events, meta) {
  if (!jsonOutput) {
    return;
  }
  jsonOutput.textContent = JSON.stringify(events, null, 2);
  renderReplayInspector(events, meta);
}

function createEmptyReplayState() {
  return {
    events: [],
    originalEvents: [],
    meta: null,
    layout: null,
    segmentsByDay: [],
    eventElements: new Map(),
    hoveredEventIndices: new Set(),
    selectedEventIndex: null,
    hoverSource: null,
    lastPointerInfo: null,
    weekStartDate: null,
    pointerElements: null,
    pointerMinute: null,
    pointerDayIndex: null,
  };
}

function renderReplayInspector(events, meta) {
  if (!replayInspector || !replaySvg || !replayEventList || !replayMinuteLabel) {
    return;
  }

  if (!Array.isArray(events) || events.length === 0) {
    replayState = createEmptyReplayState();
    replaySvg.replaceChildren();
    replayEventList.innerHTML = "";
    replayInspector.classList.add("hidden");
    replayMinuteLabel.textContent = REPLAY_DEFAULT_LABEL;
    setReplayExportEnabled(false);
    setReplayExportBusy(false);
    setReplayExportMessage("");
    return;
  }

  const weekStartDate = determineWeekStartDate(meta, events);
  const prepared = prepareReplayEvents(events, weekStartDate);

  replayState = createEmptyReplayState();
  replayState.events = prepared.events;
  replayState.originalEvents = events;
  replayState.meta = meta || null;
  replayState.weekStartDate = weekStartDate;
  replayState.layout = prepared.layout;
  replayState.segmentsByDay = prepared.segmentsByDay;

  replayInspector.classList.remove("hidden");
  replayMinuteLabel.textContent = REPLAY_DEFAULT_LABEL;

  buildReplaySvg(prepared);
  buildReplayEventList(prepared);

  updateReplayHighlights();
  updateMinuteLabelForSelection();
  syncReplayPointerWithState();
  setReplayExportEnabled(true);
  setReplayExportBusy(false);
  setReplayExportMessage("");
}

function determineWeekStartDate(meta, events) {
  if (meta?.weekStart) {
    const candidate = parseIsoDate(meta.weekStart);
    if (!Number.isNaN(candidate.getTime())) {
      return candidate;
    }
  }
  for (const event of events) {
    if (typeof event?.date === "string") {
      const candidate = parseIsoDate(event.date);
      if (!Number.isNaN(candidate.getTime())) {
        return candidate;
      }
    }
  }
  return null;
}

function prepareReplayEvents(events, weekStartDate) {
  const preparedEvents = events.map((event, index) =>
    computeReplayEventInfo(event, index, weekStartDate)
  );

  let maxDayIndex = -Infinity;
  for (const info of preparedEvents) {
    for (const segment of info.segments) {
      if (segment.dayIndex > maxDayIndex) {
        maxDayIndex = segment.dayIndex;
      }
    }
  }

  const dayCount = maxDayIndex >= 0 ? maxDayIndex + 1 : 0;
  const layout = dayCount > 0 ? computeReplayLayout(dayCount) : null;
  const segmentsByDay = layout ? Array.from({ length: layout.dayCount }, () => []) : [];

  if (layout) {
    for (const info of preparedEvents) {
      for (const segment of info.segments) {
        if (!segmentsByDay[segment.dayIndex]) {
          segmentsByDay[segment.dayIndex] = [];
        }
        segmentsByDay[segment.dayIndex].push(segment);
      }
    }
  }

  return { events: preparedEvents, layout, segmentsByDay };
}

function computeReplayEventInfo(event, eventIndex, weekStartDate) {
  const info = {
    event,
    eventIndex,
    absoluteStart: null,
    absoluteEnd: null,
    durationMinutes: null,
    segments: [],
  };

  const explicitRange = extractAbsoluteMinuteRange(event);
  let absoluteStart;
  let absoluteEnd;

  if (explicitRange) {
    absoluteStart = Number(explicitRange[0]);
    absoluteEnd = Number(explicitRange[1]);
  } else {
    const inferred = computeAbsoluteRangeFromEvent(event, weekStartDate);
    if (inferred) {
      absoluteStart = inferred[0];
      absoluteEnd = inferred[1];
    }
  }

  if (Number.isFinite(absoluteStart) && Number.isFinite(absoluteEnd)) {
    if (absoluteEnd <= absoluteStart) {
      const duration = Number(
        event?.duration_minutes ?? event?.duration ?? event?.minutes ?? 1
      );
      const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1;
      absoluteEnd = absoluteStart + safeDuration;
    }
    info.absoluteStart = absoluteStart;
    info.absoluteEnd = absoluteEnd;
    info.durationMinutes = absoluteEnd - absoluteStart;
    info.segments = splitEventIntoSegments(absoluteStart, absoluteEnd, eventIndex);
  } else {
    const duration = Number(event?.duration_minutes ?? event?.duration ?? event?.minutes);
    if (Number.isFinite(duration) && duration > 0) {
      info.durationMinutes = duration;
    }
  }

  return info;
}

function extractAbsoluteMinuteRange(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  const directRange = event.minute_range ?? event.minuteRange;
  if (Array.isArray(directRange) && directRange.length >= 2) {
    const start = Number(directRange[0]);
    const end = Number(directRange[1]);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return [start, end];
    }
  }
  if (directRange && typeof directRange === "object") {
    const start = Number(
      directRange.start ?? directRange.from ?? directRange.begin ?? directRange[0]
    );
    const end = Number(
      directRange.end ?? directRange.to ?? directRange.finish ?? directRange[1]
    );
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return [start, end];
    }
  }
  const startAlt = Number(event.minute_start ?? event.start_minute);
  const endAlt = Number(event.minute_end ?? event.end_minute);
  if (Number.isFinite(startAlt) && Number.isFinite(endAlt)) {
    return [startAlt, endAlt];
  }
  return null;
}

function computeAbsoluteRangeFromEvent(event, weekStartDate) {
  const startValue = parseExtendedTimeValue(
    event?.start ?? event?.start_time ?? event?.startTime ?? event?.time
  );
  let endValue = parseExtendedTimeValue(event?.end ?? event?.end_time ?? event?.endTime);

  if (!Number.isFinite(startValue)) {
    return null;
  }

  const duration = Number(
    event?.duration_minutes ?? event?.duration ?? event?.minutes ?? event?.length_minutes
  );
  if (!Number.isFinite(endValue) && Number.isFinite(duration)) {
    endValue = startValue + duration;
  }

  if (!Number.isFinite(endValue)) {
    return null;
  }

  if (endValue <= startValue) {
    if (Number.isFinite(duration) && duration > 0) {
      endValue = startValue + duration;
    } else {
      while (endValue <= startValue) {
        endValue += 1440;
        if (endValue - startValue > 14 * 1440) {
          break;
        }
      }
    }
  }

  if (endValue <= startValue) {
    endValue = startValue + 1;
  }

  const dayIndex = inferDayIndex(event, weekStartDate);
  const absoluteStart = dayIndex * 1440 + startValue;
  const absoluteEnd = dayIndex * 1440 + endValue;
  return [absoluteStart, absoluteEnd];
}

function inferDayIndex(event, weekStartDate) {
  if (typeof event?.day === "string") {
    const normalized = event.day.toLowerCase();
    const index = DAY_NAMES.indexOf(normalized);
    if (index >= 0) {
      return index;
    }
  }
  if (typeof event?.day_index === "number" && Number.isFinite(event.day_index)) {
    return Math.floor(event.day_index);
  }
  if (typeof event?.date === "string") {
    const eventDate = parseIsoDate(event.date);
    if (
      !Number.isNaN(eventDate.getTime()) &&
      weekStartDate instanceof Date &&
      !Number.isNaN(weekStartDate.getTime())
    ) {
      const diffMs = eventDate.getTime() - weekStartDate.getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      if (Number.isFinite(diffDays)) {
        return diffDays;
      }
    }
  }
  return 0;
}

function parseExtendedTimeValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }
  if (typeof value !== "string") {
    return NaN;
  }
  const trimmed = value.trim();
  if (!trimmed.length) {
    return NaN;
  }
  const parts = trimmed.split(":");
  if (parts.length < 2) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : NaN;
  }
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = parts.length >= 3 ? Number(parts[2]) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || Number.isNaN(seconds)) {
    return NaN;
  }
  const secondsPortion = Number.isFinite(seconds) ? seconds / 60 : 0;
  return hours * 60 + minutes + secondsPortion;
}

function splitEventIntoSegments(absoluteStart, absoluteEnd, eventIndex) {
  const segments = [];
  if (
    !Number.isFinite(absoluteStart) ||
    !Number.isFinite(absoluteEnd) ||
    absoluteEnd <= absoluteStart
  ) {
    return segments;
  }
  let cursor = absoluteStart;
  let guard = 0;
  const maxIterations = 366 * 2;
  while (cursor < absoluteEnd && guard < maxIterations) {
    const dayIndex = Math.floor(cursor / 1440);
    const dayStart = dayIndex * 1440;
    const dayEnd = dayStart + 1440;
    const segmentEnd = Math.min(dayEnd, absoluteEnd);
    const startMinute = cursor - dayStart;
    const endMinute = segmentEnd - dayStart;
    segments.push({ eventIndex, dayIndex, startMinute, endMinute });
    if (segmentEnd <= cursor) {
      break;
    }
    cursor = segmentEnd;
    guard += 1;
  }
  return segments;
}

function computeReplayLayout(dayCount) {
  const MIN_RADIUS = 40;
  const RING_WIDTH = 22;
  const RING_GAP = 4;
  const effectiveDayCount = Math.max(7, dayCount);
  const step = RING_WIDTH + RING_GAP;
  const outerRadius = MIN_RADIUS + effectiveDayCount * step;
  const viewBoxSize = outerRadius * 2 + 40;
  const center = viewBoxSize / 2;
  return {
    minRadius: MIN_RADIUS,
    ringWidth: RING_WIDTH,
    gap: RING_GAP,
    step,
    dayCount: effectiveDayCount,
    outerRadius,
    viewBoxSize,
    center,
  };
}

function buildReplaySvg(prepared) {
  if (!replaySvg) {
    return;
  }

  replaySvg.replaceChildren();
  replayState.pointerElements = null;

  const layout = prepared.layout;
  if (!layout) {
    replaySvg.setAttribute("viewBox", "0 0 400 160");
    const message = document.createElementNS(SVG_NS, "text");
    message.setAttribute("x", "50%");
    message.setAttribute("y", "50%");
    message.setAttribute("text-anchor", "middle");
    message.setAttribute("dominant-baseline", "middle");
    message.setAttribute("class", "replay-empty-message");
    message.textContent = "No minute ranges available.";
    replaySvg.appendChild(message);
    return;
  }

  replaySvg.setAttribute("viewBox", `0 0 ${layout.viewBoxSize} ${layout.viewBoxSize}`);

  const backdropGroup = document.createElementNS(SVG_NS, "g");
  backdropGroup.classList.add("replay-backdrop");

  const tickInner = layout.minRadius - 6;
  const tickOuter = layout.minRadius + layout.dayCount * layout.step + 6;
  for (let hour = 0; hour < 24; hour += 1) {
    const minuteValue = hour * 60;
    const startPoint = minuteToPoint(layout, minuteValue, tickInner);
    const endPoint = minuteToPoint(layout, minuteValue, tickOuter);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", startPoint.x.toFixed(3));
    line.setAttribute("y1", startPoint.y.toFixed(3));
    line.setAttribute("x2", endPoint.x.toFixed(3));
    line.setAttribute("y2", endPoint.y.toFixed(3));
    backdropGroup.appendChild(line);
  }

  for (let dayIndex = 0; dayIndex < layout.dayCount; dayIndex += 1) {
    const radius =
      layout.minRadius + dayIndex * layout.step + layout.ringWidth / 2;
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", layout.center);
    circle.setAttribute("cy", layout.center);
    circle.setAttribute("r", radius);
    circle.setAttribute("stroke-width", layout.ringWidth);
    backdropGroup.appendChild(circle);
  }

  replaySvg.appendChild(backdropGroup);

  const arcsGroup = document.createElementNS(SVG_NS, "g");
  arcsGroup.classList.add("replay-arcs");

  for (const info of prepared.events) {
    for (const segment of info.segments) {
      const innerRadius = layout.minRadius + segment.dayIndex * layout.step;
      const outerRadius = innerRadius + layout.ringWidth;
      const pathData = describeMinuteArc(
        layout,
        innerRadius,
        outerRadius,
        segment.startMinute,
        segment.endMinute
      );
      if (!pathData) {
        continue;
      }
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", pathData);
      path.setAttribute("fill", getReplayEventColor(info.event));
      path.setAttribute("focusable", "false");
      path.setAttribute("aria-hidden", "true");
      path.dataset.eventIndex = String(segment.eventIndex);
      path.dataset.dayIndex = String(segment.dayIndex);
      const tooltipLabel = buildSelectedEventLabel(info);
      if (tooltipLabel) {
        path.setAttribute("title", tooltipLabel);
      }
      arcsGroup.appendChild(path);
      registerReplayArc(segment.eventIndex, path);
    }
  }

  replaySvg.appendChild(arcsGroup);
  createReplayPointer(layout);
}

function createReplayPointer(layout) {
  if (!replaySvg || !layout) {
    return;
  }
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("replay-pointer", "is-hidden");
  group.setAttribute("data-pointer", "true");
  const line = document.createElementNS(SVG_NS, "line");
  const dot = document.createElementNS(SVG_NS, "circle");
  const center = layout.center.toFixed(3);
  line.setAttribute("x1", center);
  line.setAttribute("y1", center);
  line.setAttribute("x2", center);
  line.setAttribute("y2", (layout.center - layout.minRadius).toFixed(3));
  dot.setAttribute("cx", center);
  dot.setAttribute("cy", (layout.center - layout.minRadius).toFixed(3));
  dot.setAttribute("r", "4");
  group.append(line, dot);
  replaySvg.appendChild(group);
  replayState.pointerElements = { group, line, dot };
}

function positionPointerElements(layout, pointerElements, dayIndex, minute) {
  if (!layout || !pointerElements?.line || !pointerElements?.dot) {
    return false;
  }
  const effectiveDayIndex = Math.max(0, Math.min(layout.dayCount - 1, dayIndex));
  const pointerRadius =
    layout.minRadius + effectiveDayIndex * layout.step + layout.ringWidth + 6;
  const tipPoint = minuteToPoint(layout, minute, pointerRadius);
  pointerElements.line.setAttribute("x1", layout.center.toFixed(3));
  pointerElements.line.setAttribute("y1", layout.center.toFixed(3));
  pointerElements.line.setAttribute("x2", tipPoint.x.toFixed(3));
  pointerElements.line.setAttribute("y2", tipPoint.y.toFixed(3));
  pointerElements.dot.setAttribute("cx", tipPoint.x.toFixed(3));
  pointerElements.dot.setAttribute("cy", tipPoint.y.toFixed(3));
  pointerElements.group?.classList.remove("is-hidden");
  return true;
}

function updateReplayPointer(dayIndex, minute) {
  if (!replayState.pointerElements || !replayState.layout) {
    return false;
  }
  const positioned = positionPointerElements(
    replayState.layout,
    replayState.pointerElements,
    dayIndex,
    minute
  );
  if (positioned) {
    replayState.pointerMinute = minute;
    replayState.pointerDayIndex = dayIndex;
    return true;
  }
  return false;
}

function hideReplayPointer() {
  if (replayState.pointerElements?.group) {
    replayState.pointerElements.group.classList.add("is-hidden");
  }
  replayState.pointerMinute = null;
  replayState.pointerDayIndex = null;
}

function updateReplayPointerFromInfo(info) {
  if (!info?.withinRing) {
    hideReplayPointer();
    return;
  }
  updateReplayPointer(info.dayIndex, info.minute);
}

function focusReplayPointerOnEvent(eventIndex) {
  const info = replayState.events[eventIndex];
  const firstSegment = info?.segments?.[0];
  if (!firstSegment) {
    hideReplayPointer();
    return false;
  }
  return updateReplayPointer(firstSegment.dayIndex, firstSegment.startMinute);
}

function syncReplayPointerWithState() {
  if (replayState.hoverSource === "svg" && replayState.lastPointerInfo?.withinRing) {
    updateReplayPointerFromInfo(replayState.lastPointerInfo);
    return;
  }
  if (replayState.hoverSource === "list") {
    const [firstHovered] = replayState.hoveredEventIndices;
    if (typeof firstHovered === "number" && focusReplayPointerOnEvent(firstHovered)) {
      return;
    }
  }
  if (
    typeof replayState.selectedEventIndex === "number" &&
    replayState.selectedEventIndex >= 0 &&
    focusReplayPointerOnEvent(replayState.selectedEventIndex)
  ) {
    return;
  }
  hideReplayPointer();
}

function minuteToPoint(layout, minute, radius) {
  const angle = (minute / 1440) * Math.PI * 2;
  const x = layout.center + radius * Math.sin(angle);
  const y = layout.center - radius * Math.cos(angle);
  return { x, y };
}

function describeMinuteArc(layout, innerRadius, outerRadius, startMinute, endMinute) {
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) {
    return "";
  }
  let span = endMinute - startMinute;
  if (span <= 0) {
    return "";
  }
  if (span >= 1440) {
    span = 1440;
  }
  let effectiveEnd = startMinute + span;
  if (span >= 1440) {
    effectiveEnd = startMinute + 1440 - 0.001;
  }
  const largeArc = span > 720 ? 1 : 0;
  const outerStart = minuteToPoint(layout, startMinute, outerRadius);
  const outerEnd = minuteToPoint(layout, effectiveEnd, outerRadius);
  const innerStart = minuteToPoint(layout, startMinute, innerRadius);
  const innerEnd = minuteToPoint(layout, effectiveEnd, innerRadius);

  return [
    "M",
    outerStart.x.toFixed(3),
    outerStart.y.toFixed(3),
    "A",
    outerRadius.toFixed(3),
    outerRadius.toFixed(3),
    0,
    largeArc,
    1,
    outerEnd.x.toFixed(3),
    outerEnd.y.toFixed(3),
    "L",
    innerEnd.x.toFixed(3),
    innerEnd.y.toFixed(3),
    "A",
    innerRadius.toFixed(3),
    innerRadius.toFixed(3),
    0,
    largeArc,
    0,
    innerStart.x.toFixed(3),
    innerStart.y.toFixed(3),
    "Z",
  ].join(" ");
}

function buildReplayEventList(prepared) {
  if (!replayEventList) {
    return;
  }

  replayEventList.innerHTML = "";
  replayEventList.scrollTop = 0;

  if (!prepared.events.length) {
    const empty = document.createElement("p");
    empty.textContent = "No events to display.";
    replayEventList.appendChild(empty);
    return;
  }

  for (const info of prepared.events) {
    const eventIndex = info.eventIndex;
    const container = document.createElement("article");
    container.className = "replay-event";
    container.setAttribute("role", "listitem");
    container.tabIndex = 0;
    container.dataset.eventIndex = String(eventIndex);
    container.setAttribute("aria-pressed", "false");
    container.setAttribute("aria-selected", "false");
    container.dataset.tooltip = "Press Enter or Space to select";

    const summary = document.createElement("div");
    summary.className = "replay-event__summary";
    summary.textContent = capitalize(formatReplayEventName(info.event));
    container.appendChild(summary);

    const metaText = buildEventMetaText(info);
    if (metaText) {
      const meta = document.createElement("div");
      meta.className = "replay-event__meta";
      meta.textContent = metaText;
      container.appendChild(meta);
    }

    const jsonPre = document.createElement("pre");
    jsonPre.className = "replay-event__json";
    jsonPre.textContent = JSON.stringify(info.event, null, 2);
    container.appendChild(jsonPre);

    const diffPayload = info.event?.diff_from_prev;
    if (diffPayload !== undefined) {
      const diffSection = document.createElement("div");
      diffSection.className = "replay-event__diff";
      const diffTitle = document.createElement("div");
      diffTitle.className = "replay-event__diff-title";
      diffTitle.textContent = "Diff vs previous frame";
      const diffPre = document.createElement("pre");
      diffPre.className = "replay-event__diff-json";
      diffPre.textContent =
        typeof diffPayload === "string"
          ? diffPayload
          : JSON.stringify(diffPayload, null, 2);
      diffSection.append(diffTitle, diffPre);
      container.appendChild(diffSection);
    }

    container.addEventListener("click", () => {
      selectReplayEvent(eventIndex, { scrollIntoView: false });
    });
    container.addEventListener("mouseenter", () => {
      handleReplayListHover(eventIndex);
    });
    container.addEventListener("mouseleave", () => {
      handleReplayListLeave();
    });
    container.addEventListener("focus", () => {
      handleReplayListHover(eventIndex);
    });
    container.addEventListener("blur", () => {
      handleReplayListLeave();
    });
    container.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectReplayEvent(eventIndex, { scrollIntoView: false });
      }
    });

    replayEventList.appendChild(container);
    registerReplayListItem(eventIndex, container);
    const ariaLabel = buildSelectedEventLabel(info) || formatReplayEventLabel(info);
    if (ariaLabel) {
      container.setAttribute("aria-label", `Select ${ariaLabel}`);
    }
  }
}

function buildEventMetaText(info) {
  if (info.absoluteStart != null && info.absoluteEnd != null) {
    const startLabel = formatAbsoluteMinuteLabel(info.absoluteStart, replayState.weekStartDate);
    const endLabel = formatAbsoluteMinuteLabel(info.absoluteEnd, replayState.weekStartDate);
    const durationText = formatDurationMinutes(info.durationMinutes);
    return `${startLabel} → ${endLabel}${durationText ? ` • ${durationText}` : ""}`;
  }
  if (info.event?.date && info.event?.start && info.event?.end) {
    return `${info.event.date} ${info.event.start} → ${info.event.end}`;
  }
  const minuteRange = extractAbsoluteMinuteRange(info.event);
  if (minuteRange) {
    return `Minute range: ${minuteRange[0]} → ${minuteRange[1]}`;
  }
  return "";
}

function formatReplayEventLabel(info) {
  if (!info) {
    return "";
  }
  const name = capitalize(formatReplayEventName(info.event));
  const meta = buildEventMetaText(info);
  if (meta) {
    return `${name} (${meta})`;
  }
  return name;
}

function registerReplayArc(eventIndex, element) {
  const index = Number(eventIndex);
  if (!Number.isFinite(index)) {
    return;
  }
  let entry = replayState.eventElements.get(index);
  if (!entry) {
    entry = { paths: [], listItem: null };
    replayState.eventElements.set(index, entry);
  }
  entry.paths.push(element);
}

function registerReplayListItem(eventIndex, element) {
  const index = Number(eventIndex);
  if (!Number.isFinite(index)) {
    return;
  }
  let entry = replayState.eventElements.get(index);
  if (!entry) {
    entry = { paths: [], listItem: null };
    replayState.eventElements.set(index, entry);
  }
  entry.listItem = element;
}

function getReplayEventColor(event) {
  const key =
    typeof event?.activity === "string"
      ? event.activity
      : getReplayEventName(event);
  const name = typeof key === "string" && key.length ? key : "event";
  return getActivityColor(name);
}

function getReplayEventName(event = {}) {
  const raw =
    event.activity ??
    event.name ??
    event.label ??
    event.title ??
    event.type ??
    event.id;
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "number") {
    return String(raw);
  }
  return "Event";
}

function formatReplayEventName(event) {
  const name = getReplayEventName(event);
  if (typeof name !== "string") {
    return "Event";
  }
  return name.trim().length ? name : "Event";
}

function formatDurationMinutes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  if (value >= 60) {
    const hours = value / 60;
    if (Number.isInteger(hours)) {
      return `${hours} h`;
    }
    return `${hours.toFixed(1)} h`;
  }
  return `${Math.round(value)} min`;
}

function formatMinutesOfDay(value) {
  if (!Number.isFinite(value)) {
    return "00:00";
  }
  const normalized = ((value % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = Math.floor(normalized % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDayName(dayIndex, weekStartDate) {
  if (Number.isFinite(dayIndex) && dayIndex >= 0) {
    if (dayIndex < DAY_NAMES.length) {
      return capitalize(DAY_NAMES[dayIndex]);
    }
    if (weekStartDate instanceof Date && !Number.isNaN(weekStartDate.getTime())) {
      const targetDate = addDays(weekStartDate, dayIndex);
      const formatter = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      return formatter.format(targetDate);
    }
  }
  return `Day ${dayIndex + 1}`;
}

function formatAbsoluteMinuteLabel(absoluteMinute, weekStartDate) {
  if (!Number.isFinite(absoluteMinute)) {
    return "";
  }
  const dayIndex = Math.floor(absoluteMinute / 1440);
  const minuteOfDay = absoluteMinute - dayIndex * 1440;
  const dayLabel = formatDayName(dayIndex, weekStartDate);
  return `${dayLabel} ${formatMinutesOfDay(minuteOfDay)}`;
}

function buildSelectedEventLabel(info) {
  if (!info) {
    return "";
  }
  const name = capitalize(formatReplayEventName(info.event));
  if (info.absoluteStart != null && info.absoluteEnd != null) {
    const startLabel = formatAbsoluteMinuteLabel(info.absoluteStart, replayState.weekStartDate);
    const endLabel = formatAbsoluteMinuteLabel(info.absoluteEnd, replayState.weekStartDate);
    const durationText = formatDurationMinutes(info.durationMinutes);
    return `${name}: ${startLabel} → ${endLabel}${durationText ? ` • ${durationText}` : ""}`;
  }
  if (info.event?.date && info.event?.start && info.event?.end) {
    return `${name}: ${info.event.date} ${info.event.start} → ${info.event.end}`;
  }
  const minuteRange = extractAbsoluteMinuteRange(info.event);
  if (minuteRange) {
    return `${name}: minute ${minuteRange[0]} → ${minuteRange[1]}`;
  }
  return name;
}

function updateReplayHighlights() {
  for (const [eventIndex, elements] of replayState.eventElements.entries()) {
    const isSelected = replayState.selectedEventIndex === eventIndex;
    const isHovered = replayState.hoveredEventIndices.has(eventIndex);
    for (const path of elements.paths) {
      path.classList.toggle("is-selected", isSelected);
      path.classList.toggle("is-hovered", isHovered && !isSelected);
    }
    if (elements.listItem) {
      elements.listItem.classList.toggle("is-selected", isSelected);
      elements.listItem.classList.toggle("is-hovered", isHovered && !isSelected);
      elements.listItem.setAttribute("aria-pressed", isSelected ? "true" : "false");
      elements.listItem.setAttribute("aria-selected", isSelected ? "true" : "false");
    }
  }
}

function updateMinuteLabelForSelection() {
  if (!replayMinuteLabel) {
    return;
  }
  let message = REPLAY_DEFAULT_LABEL;
  if (
    typeof replayState.selectedEventIndex === "number" &&
    replayState.selectedEventIndex >= 0
  ) {
    const info = replayState.events[replayState.selectedEventIndex];
    const label = buildSelectedEventLabel(info);
    if (label) {
      message = `Selected: ${label}`;
    }
  }
  replayMinuteLabel.textContent = message;
  syncReplayPointerWithState();
}

function updateMinuteLabelFromPointer(info, segments) {
  if (!replayMinuteLabel) {
    return;
  }
  const dayLabel = formatDayName(info.dayIndex, replayState.weekStartDate);
  const minuteLabel = formatMinutesOfDay(info.minute);
  const minuteIndex = info.dayIndex * 1440 + info.minute;
  let suffix = " — no events";
  if (segments.length === 1) {
    suffix = ` — ${capitalize(formatReplayEventName(replayState.events[segments[0].eventIndex]?.event))}`;
  } else if (segments.length > 1) {
    suffix = ` — ${segments.length} events`;
  }
  replayMinuteLabel.textContent = `${dayLabel} · ${minuteLabel} (minute ${minuteIndex})${suffix}`;
}

function getSegmentsForPointer(info) {
  if (!Array.isArray(replayState.segmentsByDay)) {
    return [];
  }
  const bucket = replayState.segmentsByDay[info.dayIndex] || [];
  return bucket.filter(
    (segment) => info.minute >= segment.startMinute && info.minute < segment.endMinute
  );
}

function applyPointerHighlight(info) {
  if (!info.withinRing) {
    return;
  }
  const matches = getSegmentsForPointer(info);
  replayState.hoveredEventIndices = new Set(matches.map((segment) => segment.eventIndex));
  updateMinuteLabelFromPointer(info, matches);
  updateReplayHighlights();
  updateReplayPointerFromInfo(info);
}

function getReplayPointerInfo(event) {
  if (!replayState.layout || !replaySvg) {
    return null;
  }
  const rect = replaySvg.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }
  const scaleX = replayState.layout.viewBoxSize / rect.width;
  const scaleY = replayState.layout.viewBoxSize / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const center = replayState.layout.center;
  const dx = x - center;
  const dy = y - center;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) {
    return { withinRing: false };
  }
  const step = replayState.layout.step;
  const relativeDistance = distance - replayState.layout.minRadius;
  const dayIndex = Math.floor(relativeDistance / step);
  const withinBounds =
    relativeDistance >= 0 && dayIndex >= 0 && dayIndex < replayState.layout.dayCount;
  if (!withinBounds) {
    return { withinRing: false };
  }
  const distanceWithinRing = relativeDistance - dayIndex * step;
  const withinRing = distanceWithinRing <= replayState.layout.ringWidth;
  const sinAngle = (x - center) / distance;
  const cosAngle = (center - y) / distance;
  let angle = Math.atan2(sinAngle, cosAngle);
  if (angle < 0) {
    angle += Math.PI * 2;
  }
  const minuteFloat = (angle / (Math.PI * 2)) * 1440;
  const minute = Math.floor(((minuteFloat % 1440) + 1440) % 1440);
  return {
    x,
    y,
    distance,
    dayIndex,
    minute,
    withinRing,
  };
}

function handleReplayPointerMove(event) {
  if (!replayState.layout) {
    return;
  }
  const info = getReplayPointerInfo(event);
  if (!info || !info.withinRing) {
    if (replayState.hoverSource === "svg") {
      replayState.hoverSource = null;
      replayState.hoveredEventIndices = new Set();
      replayState.lastPointerInfo = null;
      updateReplayHighlights();
      updateMinuteLabelForSelection();
    }
    return;
  }
  replayState.hoverSource = "svg";
  replayState.lastPointerInfo = info;
  applyPointerHighlight(info);
}

function handleReplayPointerLeave() {
  if (replayState.hoverSource === "svg") {
    replayState.hoverSource = null;
    replayState.hoveredEventIndices = new Set();
    replayState.lastPointerInfo = null;
    updateReplayHighlights();
    updateMinuteLabelForSelection();
  }
}

function handleReplayPointerClick(event) {
  if (!replayState.layout) {
    return;
  }
  const info = getReplayPointerInfo(event);
  if (!info || !info.withinRing) {
    clearReplaySelection();
    return;
  }
  replayState.lastPointerInfo = info;
  const matches = getSegmentsForPointer(info);
  if (matches.length) {
    selectReplayEvent(matches[0].eventIndex, { scrollIntoView: true });
  } else {
    replayState.hoverSource = "svg";
    clearReplaySelection();
    replayState.hoveredEventIndices = new Set();
    updateMinuteLabelFromPointer(info, matches);
    updateReplayHighlights();
    updateReplayPointerFromInfo(info);
  }
}

function handleReplayListHover(eventIndex) {
  replayState.hoverSource = "list";
  replayState.hoveredEventIndices = new Set([eventIndex]);
  const info = replayState.events[eventIndex];
  const label = buildSelectedEventLabel(info);
  if (label && replayMinuteLabel) {
    replayMinuteLabel.textContent = `Preview: ${label}`;
  }
  updateReplayHighlights();
  focusReplayPointerOnEvent(eventIndex);
}

function handleReplayListLeave() {
  if (replayState.hoverSource !== "list") {
    return;
  }
  replayState.hoverSource = null;
  if (replayState.lastPointerInfo && replayState.lastPointerInfo.withinRing) {
    applyPointerHighlight(replayState.lastPointerInfo);
    return;
  }
  replayState.hoveredEventIndices = new Set();
  updateReplayHighlights();
  updateMinuteLabelForSelection();
}

function selectReplayEvent(eventIndex, options = {}) {
  const index = Number(eventIndex);
  if (!Number.isFinite(index) || index < 0 || index >= replayState.events.length) {
    return;
  }
  if (replayState.selectedEventIndex === index) {
    updateMinuteLabelForSelection();
    return;
  }
  replayState.selectedEventIndex = index;
  updateReplayHighlights();
  if (options.scrollIntoView) {
    const target = replayState.eventElements.get(index)?.listItem;
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  updateMinuteLabelForSelection();
}

function clearReplaySelection() {
  if (replayState.selectedEventIndex === null) {
    updateMinuteLabelForSelection();
    return;
  }
  replayState.selectedEventIndex = null;
  updateReplayHighlights();
  updateMinuteLabelForSelection();
}

function updateReplayExportButtons() {
  const shouldDisable = !replayExportReady || replayExportBusy;
  for (const button of replayExportButtons) {
    if (button) {
      button.disabled = shouldDisable;
    }
  }
}

function setReplayExportEnabled(enabled) {
  replayExportReady = Boolean(enabled);
  updateReplayExportButtons();
}

function setReplayExportBusy(isBusy) {
  replayExportBusy = Boolean(isBusy);
  if (replayExportStatus) {
    replayExportStatus.setAttribute("aria-busy", replayExportBusy ? "true" : "false");
  }
  updateReplayExportButtons();
}

function setReplayExportMessage(message, variant = "info") {
  if (!replayExportStatus) {
    return;
  }
  if (!message) {
    replayExportStatus.textContent = "";
    delete replayExportStatus.dataset.variant;
    return;
  }
  replayExportStatus.textContent = message;
  if (variant && variant !== "info") {
    replayExportStatus.dataset.variant = variant;
  } else {
    delete replayExportStatus.dataset.variant;
  }
}

function reportReplayExportError(error) {
  console.error(error);
  const message = error?.message || "Export failed.";
  setReplayExportMessage(message, "error");
}

function reportReplayExportSuccess(message) {
  setReplayExportMessage(message, "success");
}

function prepareReplaySvgForExport() {
  if (!replaySvg || !replayState.layout || !replayState.events.length) {
    throw new Error("Generate a schedule to export the replay.");
  }
  const clone = replaySvg.cloneNode(true);
  inlineReplayStylesForExport(replaySvg, clone);
  let width = replayState.layout.viewBoxSize;
  let height = replayState.layout.viewBoxSize;
  const viewBox = clone.getAttribute("viewBox") || replaySvg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
      width = parts[2];
      height = parts[3];
    }
  }
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", width);
  clone.setAttribute("height", height);
  ensureSvgBackground(clone, width, height);
  const sourcePointerGroup = replaySvg.querySelector('[data-pointer="true"]');
  const pointerVisible =
    !!sourcePointerGroup && !sourcePointerGroup.classList.contains("is-hidden");
  const pointerGroup = clone.querySelector('[data-pointer="true"]');
  const pointerElements = pointerGroup
    ? {
        group: pointerGroup,
        line: pointerGroup.querySelector("line"),
        dot: pointerGroup.querySelector("circle"),
      }
    : null;
  if (pointerGroup) {
    pointerGroup.classList.toggle("is-hidden", !pointerVisible);
  }
  return { clone, width, height, pointerElements, pointerVisible };
}

function inlineReplayStylesForExport(source, clone) {
  inlineComputedStyle(source, clone);
  const sourceNodes = source.querySelectorAll("*");
  const cloneNodes = clone.querySelectorAll("*");
  cloneNodes.forEach((node, index) => {
    const sourceNode = sourceNodes[index];
    if (sourceNode) {
      inlineComputedStyle(sourceNode, node);
    }
  });
}

function inlineComputedStyle(sourceNode, targetNode) {
  if (!(sourceNode instanceof Element) || !(targetNode instanceof Element)) {
    return;
  }
  const computed = window.getComputedStyle(sourceNode);
  if (!computed) {
    return;
  }
  const declarations = [];
  for (const property of EXPORT_STYLE_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (value) {
      declarations.push(`${property}:${value}`);
    }
  }
  if (declarations.length) {
    targetNode.setAttribute("style", declarations.join(";"));
  }
}

function ensureSvgBackground(svg, width, height) {
  let background = svg.querySelector("[data-export-background]");
  if (!background) {
    background = document.createElementNS(SVG_NS, "rect");
    background.setAttribute("data-export-background", "true");
    svg.insertBefore(background, svg.firstChild);
  }
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", width);
  background.setAttribute("height", height);
  background.setAttribute(
    "fill",
    window.getComputedStyle(document.body).backgroundColor || "#050c1a"
  );
}

function serializeSvgElement(svg) {
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svg);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${source}`;
}

function buildReplayExportFilename(extension) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `replay-inspector-${timestamp}.${extension}`;
}

function triggerFileDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function loadSvgImageFromString(svgString) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to render replay graphic."));
    };
    image.src = url;
  });
}

function drawSvgStringToCanvas(canvas, svgString, width, height) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(url);
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas rendering is unavailable."));
        return;
      }
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve();
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to render replay frame."));
    };
    image.src = url;
  });
}

function wait(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function handleReplayExportSvg() {
  if (!replayExportReady || replayExportBusy) {
    return;
  }
  setReplayExportBusy(true);
  setReplayExportMessage("Preparing SVG…");
  try {
    const prepared = prepareReplaySvgForExport();
    const svgString = serializeSvgElement(prepared.clone);
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    triggerFileDownload(blob, buildReplayExportFilename("svg"));
    reportReplayExportSuccess("SVG download ready.");
  } catch (error) {
    reportReplayExportError(error);
  } finally {
    setReplayExportBusy(false);
  }
}

async function handleReplayExportPng() {
  if (!replayExportReady || replayExportBusy) {
    return;
  }
  setReplayExportBusy(true);
  setReplayExportMessage("Preparing PNG…");
  try {
    const prepared = prepareReplaySvgForExport();
    const svgString = serializeSvgElement(prepared.clone);
    const image = await loadSvgImageFromString(svgString);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(prepared.width);
    canvas.height = Math.round(prepared.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas rendering is unavailable.");
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) {
          resolve(value);
        } else {
          reject(new Error("Unable to encode PNG."));
        }
      }, "image/png");
    });
    triggerFileDownload(blob, buildReplayExportFilename("png"));
    reportReplayExportSuccess("PNG download ready.");
  } catch (error) {
    reportReplayExportError(error);
  } finally {
    setReplayExportBusy(false);
  }
}

async function exportReplayAnimation(format) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error(`${format.toUpperCase()} export is not supported in this browser.`);
  }
  const prepared = prepareReplaySvgForExport();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(prepared.width);
  canvas.height = Math.round(prepared.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas rendering is unavailable.");
  }
  if (typeof canvas.captureStream !== "function") {
    throw new Error("Canvas capture is not supported in this browser.");
  }
  const stream = canvas.captureStream(REPLAY_EXPORT_FPS);
  const mimeCandidates =
    format === "gif"
      ? ["image/gif", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
      : ["video/mp4", "video/webm;codecs=h264", "video/webm;codecs=vp9", "video/webm"];
  const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) {
    throw new Error(`${format.toUpperCase()} export is not supported in this browser.`);
  }
  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data?.size) {
      chunks.push(event.data);
    }
  });
  const recordingPromise = new Promise((resolve, reject) => {
    recorder.addEventListener("stop", () => {
      resolve(new Blob(chunks, { type: mimeType }));
    });
    recorder.addEventListener("error", (event) => {
      reject(event.error || new Error("Recording failed."));
    });
  });
  recorder.start();

  const totalFrames = Math.max(1, Math.round((REPLAY_EXPORT_DURATION_MS / 1000) * REPLAY_EXPORT_FPS));
  const totalSpanMinutes = Math.max(1, replayState.layout.dayCount * 1440);
  if (prepared.pointerElements) {
    prepared.pointerElements.group?.classList.remove("is-hidden");
  }

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const progress = frame / totalFrames;
    const absoluteMinute = progress * totalSpanMinutes;
    const dayIndex = Math.floor(absoluteMinute / 1440) % replayState.layout.dayCount;
    const minute = absoluteMinute % 1440;
    if (prepared.pointerElements) {
      positionPointerElements(replayState.layout, prepared.pointerElements, dayIndex, minute);
    }
    const svgString = serializeSvgElement(prepared.clone);
    await drawSvgStringToCanvas(canvas, svgString, canvas.width, canvas.height);
    await wait(REPLAY_EXPORT_DURATION_MS / totalFrames);
  }

  await wait(120);
  recorder.stop();
  const blob = await recordingPromise;
  let extension = format;
  if (format === "gif" && !mimeType.includes("gif")) {
    extension = "webm";
  }
  if (format === "mp4" && !mimeType.includes("mp4")) {
    extension = "webm";
  }
  triggerFileDownload(blob, buildReplayExportFilename(extension));
  return { mimeType, extension };
}

async function handleReplayExportAnimation(format) {
  if (!replayExportReady || replayExportBusy) {
    return;
  }
  const label = format.toUpperCase();
  setReplayExportBusy(true);
  setReplayExportMessage(`Rendering ${label} replay (5s)…`);
  try {
    const { mimeType, extension } = await exportReplayAnimation(format);
    if (format === "gif" && !mimeType.includes("gif")) {
      reportReplayExportSuccess("GIF export unavailable — saved as WEBM instead.");
    } else if (format === "mp4" && !mimeType.includes("mp4")) {
      reportReplayExportSuccess("MP4 export unavailable — saved as WEBM instead.");
    } else {
      reportReplayExportSuccess(`${label} download ready.`);
    }
  } catch (error) {
    reportReplayExportError(error);
  } finally {
    setReplayExportBusy(false);
  }
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

replayExportSvgButton?.addEventListener("click", () => {
  void handleReplayExportSvg();
});

replayExportPngButton?.addEventListener("click", () => {
  void handleReplayExportPng();
});

replayExportGifButton?.addEventListener("click", () => {
  void handleReplayExportAnimation("gif");
});

replayExportMp4Button?.addEventListener("click", () => {
  void handleReplayExportAnimation("mp4");
});

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
  return `hsl(${hue}deg, 68%, 52%)`;
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
  const fixtureDiffController = createFixtureDiffController();
  initializeRunnerInputs();

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

  function initializeRunnerInputs() {
    if (runnerConfigInput) {
      runnerConfigInput.addEventListener("input", () => {
        try {
          getRunnerConfig();
        } catch (error) {
          // ignore errors during live validation
        }
      });
      try {
        getRunnerConfig();
      } catch (error) {
        // ignore initial validation errors
      }
    }

    [runnerSeedInput, runnerStartDateInput, runnerDaysInput].forEach((input) => {
      input?.addEventListener("input", () => {
        clearInputValidity(input);
      });
    });
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

    let executionInputs;
    try {
      executionInputs = buildExecutionInputs();
    } catch (error) {
      setStatusIndicator("error", error.message);
      if (testConsoleStderr) {
        testConsoleStderr.textContent = error.message;
      }
      return;
    }

    const { payload, runnerInput } = executionInputs;

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
      .run(code, { context: { payload, runnerInput } })
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
    const errorPayload = JSON.stringify({ error: note }, null, 2);
    if (testConsoleResult) {
      testConsoleResult.textContent = errorPayload;
    }
    fixtureDiffController.updateActual(errorPayload, { runtimeError: note });

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
    fixtureDiffController.handleExecutionStarted();
  }

  function renderOutputs(response) {
    if (testConsoleStdout) {
      testConsoleStdout.textContent = response.stdout?.length ? response.stdout : "(no stdout captured)";
    }
    if (testConsoleStderr) {
      testConsoleStderr.textContent = response.stderr?.length ? response.stderr : "(no stderr captured)";
    }
    const rawResult = typeof response.resultJSON === "string" ? response.resultJSON : "";
    const resultPayload = rawResult.trim().length ? rawResult : "null";
    if (testConsoleResult) {
      testConsoleResult.textContent = resultPayload;
    }
    fixtureDiffController.updateActual(resultPayload);
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
    const rawResult = typeof details.resultJSON === "string" ? details.resultJSON : "";
    const fallbackResult = JSON.stringify({ error: error.message || "Execution failed." }, null, 2);
    const resultPayload = rawResult.trim().length ? rawResult : fallbackResult;
    if (testConsoleResult) {
      testConsoleResult.textContent = resultPayload;
    }
    fixtureDiffController.handleExecutionError(error, { resultText: resultPayload });
    setStatusIndicator("error", error.message || "Execution failed.");
  }

  function buildExecutionInputs() {
    const payload = parseInputPayload();
    const config = getRunnerConfig({ strict: true });
    const seed = parseOptionalInteger(runnerSeedInput, { fieldName: "Seed" });
    const startDate = parseOptionalDateString(runnerStartDateInput, { fieldName: "Start date" });
    const days = parseOptionalInteger(runnerDaysInput, { fieldName: "Days", min: 1 });

    const runnerInput = { payload };

    if (typeof config !== "undefined") {
      runnerInput.config = config;
    }
    if (typeof seed !== "undefined") {
      runnerInput.seed = seed;
    }
    if (typeof startDate !== "undefined") {
      runnerInput.start_date = startDate;
    }
    if (typeof days !== "undefined") {
      runnerInput.days = days;
    }

    return { payload, runnerInput };
  }

  function getRunnerConfig({ strict = false } = {}) {
    if (!runnerConfigInput) {
      return undefined;
    }
    const raw = runnerConfigInput.value.trim();
    if (!raw) {
      setInputValidity(runnerConfigInput, true);
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw);
      setInputValidity(runnerConfigInput, true);
      return parsed;
    } catch (error) {
      setInputValidity(runnerConfigInput, false);
      if (strict) {
        throw new Error(`Runner config JSON is invalid: ${error.message}`);
      }
      return undefined;
    }
  }

  function parseOptionalInteger(input, { fieldName, min, max } = {}) {
    if (!input) {
      return undefined;
    }
    const raw = input.value.trim();
    if (!raw) {
      setInputValidity(input, true);
      return undefined;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      setInputValidity(input, false);
      throw new Error(`${fieldName} must be an integer.`);
    }
    if (typeof min === "number" && value < min) {
      setInputValidity(input, false);
      throw new Error(`${fieldName} must be at least ${min}.`);
    }
    if (typeof max === "number" && value > max) {
      setInputValidity(input, false);
      throw new Error(`${fieldName} must be at most ${max}.`);
    }
    setInputValidity(input, true);
    return value;
  }

  function parseOptionalDateString(input, { fieldName } = {}) {
    if (!input) {
      return undefined;
    }
    const raw = input.value.trim();
    if (!raw) {
      setInputValidity(input, true);
      return undefined;
    }
    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!pattern.test(raw)) {
      setInputValidity(input, false);
      throw new Error(`${fieldName} must be in YYYY-MM-DD format.`);
    }
    setInputValidity(input, true);
    return raw;
  }

  function clearInputValidity(element) {
    setInputValidity(element, true);
  }

  function setInputValidity(element, isValid) {
    if (!element) {
      return;
    }
    element.classList.toggle("is-invalid", !isValid);
    if (isValid) {
      element.removeAttribute("aria-invalid");
    } else {
      element.setAttribute("aria-invalid", "true");
    }
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

function createFixtureDiffController() {
  if (
    !fixtureDiffPanel ||
    !fixtureSelect ||
    !fixtureDiffSummary ||
    !fixtureExpectedOutput ||
    !fixtureActualOutput ||
    !fixtureDiffBadge
  ) {
    return {
      updateActual() {},
      handleExecutionStarted() {},
      handleExecutionError() {},
    };
  }

  const state = {
    manifestPromise: null,
    manifestEntries: [],
    manifestMap: new Map(),
    manifestLoadError: "",
    fixtureCache: new Map(),
    selectedFixture: "",
    selectedLabel: "",
    expectedLoaded: false,
    expectedError: "",
    expectedData: undefined,
    actualLoaded: false,
    actualData: undefined,
    actualParseError: "",
    actualRuntimeError: "",
  };

  let fixtureRequestToken = 0;

  initialize();

  return {
    updateActual(resultText, options = {}) {
      applyActual(resultText, options);
    },
    handleExecutionStarted() {
      state.actualLoaded = false;
      state.actualData = undefined;
      state.actualParseError = "";
      state.actualRuntimeError = "";
      if (fixtureActualOutput) {
        fixtureActualOutput.textContent = "Awaiting result…";
      }
      updateSummary();
    },
    handleExecutionError(error, options = {}) {
      const runtimeMessage = options.runtimeError || error?.message || "Execution failed.";
      const overrideResult = typeof options.resultText === "string" ? options.resultText : undefined;
      const rawResult =
        overrideResult ??
        (typeof error?.details?.resultJSON === "string" ? error.details.resultJSON : "");
      if (rawResult.trim().length) {
        applyActual(rawResult, { runtimeError: runtimeMessage });
        return;
      }
      state.actualLoaded = true;
      state.actualData = undefined;
      state.actualParseError = "";
      state.actualRuntimeError = runtimeMessage;
      if (fixtureActualOutput) {
        fixtureActualOutput.textContent = runtimeMessage;
      }
      updateSummary();
    },
  };

  function initialize() {
    fixtureSelect.disabled = true;
    updateSummary();
    populateManifest();
    fixtureSelect.addEventListener("change", () => {
      handleFixtureChange(fixtureSelect.value);
    });
  }

  function fetchManifest() {
    if (state.manifestPromise) {
      return state.manifestPromise;
    }
    const url = resolveFixtureUrl(FIXTURE_MANIFEST_NAME);
    state.manifestPromise = fetch(url, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Manifest request failed with status ${response.status}`);
        }
        return response.json();
      })
      .then((data) => normalizeManifest(data))
      .catch((error) => {
        state.manifestPromise = null;
        throw error;
      });
    return state.manifestPromise;
  }

  function populateManifest() {
    fixtureSelect.innerHTML = "";
    const loadingOption = document.createElement("option");
    loadingOption.value = "";
    loadingOption.textContent = "Loading fixtures…";
    fixtureSelect.appendChild(loadingOption);

    fetchManifest()
      .then((entries) => {
        state.manifestEntries = entries;
        state.manifestMap = new Map(entries.map((entry) => [entry.file, entry]));
        state.manifestLoadError = "";

        fixtureSelect.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select expected fixture…";
        fixtureSelect.appendChild(placeholder);

        for (const entry of entries) {
          const option = document.createElement("option");
          option.value = entry.file;
          option.textContent = entry.label;
          fixtureSelect.appendChild(option);
        }

        if (!entries.length) {
          fixtureSelect.disabled = true;
          state.manifestLoadError = "No JSON fixtures found in tests/fixtures.";
        } else {
          fixtureSelect.disabled = false;
        }

        if (state.selectedFixture && !state.manifestMap.has(state.selectedFixture)) {
          state.selectedFixture = "";
          state.selectedLabel = "";
          state.expectedLoaded = false;
          state.expectedError = "";
          state.expectedData = undefined;
          fixtureExpectedOutput.textContent = "Select a fixture to load expected JSON.";
        }

        updateSummary();
      })
      .catch((error) => {
        console.error("Failed to load fixture manifest", error);
        state.manifestEntries = [];
        state.manifestMap.clear();
        state.manifestLoadError = error?.message || "Failed to load fixture manifest.";
        fixtureSelect.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Fixtures unavailable";
        fixtureSelect.appendChild(placeholder);
        fixtureSelect.disabled = true;
        updateSummary();
      });
  }

  function handleFixtureChange(value) {
    fixtureRequestToken += 1;
    const requestId = fixtureRequestToken;

    state.selectedFixture = value;
    state.selectedLabel = value ? state.manifestMap.get(value)?.label || value : "";
    state.expectedLoaded = false;
    state.expectedError = "";
    state.expectedData = undefined;

    if (!value) {
      fixtureExpectedOutput.textContent = "Select a fixture to load expected JSON.";
      updateSummary();
      return;
    }

    const manifestEntry = state.manifestMap.get(value);
    if (!manifestEntry) {
      state.expectedLoaded = true;
      state.expectedError = "Fixture not listed in manifest.";
      fixtureExpectedOutput.textContent = state.expectedError;
      updateSummary();
      return;
    }

    const cached = state.fixtureCache.get(value);
    if (cached) {
      applyFixtureData(cached);
      return;
    }

    fixtureExpectedOutput.textContent = `Loading ${manifestEntry.label}…`;
    updateSummary();

    fetchFixture(manifestEntry.file)
      .then((payload) => {
        if (requestId !== fixtureRequestToken) {
          return;
        }
        state.fixtureCache.set(manifestEntry.file, payload);
        applyFixtureData(payload);
      })
      .catch((error) => {
        if (requestId !== fixtureRequestToken) {
          return;
        }
        console.error(`Failed to load fixture ${manifestEntry.file}`, error);
        state.expectedLoaded = true;
        state.expectedError = error?.message || "Failed to load fixture.";
        fixtureExpectedOutput.textContent = state.expectedError;
        updateSummary();
      });
  }

  function applyFixtureData(payload) {
    state.expectedLoaded = true;
    state.expectedError = "";
    state.expectedData = payload.data;
    fixtureExpectedOutput.textContent = payload.display;
    updateSummary();
  }

  async function fetchFixture(file) {
    const url = resolveFixtureUrl(file);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load fixture (status ${response.status})`);
    }
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      return { data: parsed, display: formatJsonForDisplay(parsed) };
    } catch (error) {
      throw new Error(`Fixture JSON is invalid: ${error.message}`);
    }
  }

  function applyActual(resultText, options = {}) {
    state.actualLoaded = true;
    state.actualRuntimeError = options.runtimeError || "";
    state.actualParseError = "";
    const raw = typeof resultText === "string" ? resultText : "";
    const normalized = raw.trim().length ? raw : "null";

    try {
      const parsed = JSON.parse(normalized);
      state.actualData = parsed;
      const display = formatJsonForDisplay(parsed);
      fixtureActualOutput.textContent = display;
    } catch (error) {
      state.actualData = undefined;
      state.actualParseError = error?.message || "Actual output is not valid JSON.";
      const display = raw.trim().length ? raw : "(empty result)";
      fixtureActualOutput.textContent = `${display}\n\n⚠️ ${state.actualParseError}`;
    }

    updateSummary();
  }

  function updateSummary() {
    fixtureDiffSummary.innerHTML = "";
    setPanelState(null);

    if (state.manifestLoadError) {
      setBadgeState("error", "Fixtures unavailable");
      const message = document.createElement("p");
      message.textContent = state.manifestLoadError;
      fixtureDiffSummary.appendChild(message);
      return;
    }

    if (!state.selectedFixture) {
      setBadgeState("pending", "No fixture selected");
      const message = document.createElement("p");
      message.textContent = "Choose a fixture to compare against the latest run.";
      fixtureDiffSummary.appendChild(message);
      return;
    }

    if (!state.expectedLoaded) {
      setBadgeState("pending", "Loading fixture…");
      const message = document.createElement("p");
      message.textContent = `Loading ${state.selectedLabel || state.selectedFixture}…`;
      fixtureDiffSummary.appendChild(message);
      return;
    }

    if (state.expectedError) {
      setBadgeState("error", "Fixture load failed");
      setPanelState("error");
      const message = document.createElement("p");
      message.textContent = `Could not load ${state.selectedLabel || state.selectedFixture}: ${state.expectedError}`;
      fixtureDiffSummary.appendChild(message);
      return;
    }

    if (!state.actualLoaded) {
      setBadgeState("pending", "Awaiting result…");
      const message = document.createElement("p");
      message.textContent = `Run the script to compare against ${state.selectedLabel || state.selectedFixture}.`;
      fixtureDiffSummary.appendChild(message);
      return;
    }

    if (state.actualParseError) {
      setBadgeState("error", "Invalid JSON");
      setPanelState("error");
      const message = document.createElement("p");
      message.textContent = `Actual output is not valid JSON: ${state.actualParseError}`;
      fixtureDiffSummary.appendChild(message);
      return;
    }

    if (typeof state.actualData === "undefined") {
      setBadgeState("error", "Execution failed");
      setPanelState("error");
      const message = document.createElement("p");
      message.textContent =
        state.actualRuntimeError || "Execution failed before producing JSON output.";
      fixtureDiffSummary.appendChild(message);
      return;
    }

    const diff = computeJsonDiff(state.expectedData, state.actualData);
    const differenceTotal =
      diff.addedKeys.length +
      diff.removedKeys.length +
      diff.lengthChanges.length +
      diff.typeMismatches.length +
      diff.valueDifferences.length;

    const notes = [];
    if (state.actualRuntimeError) {
      notes.push(`Execution reported an error: ${state.actualRuntimeError}`);
    }

    if (differenceTotal === 0) {
      setBadgeState("match", "MATCH ✅");
      setPanelState("match");
      renderMatchSummary(notes);
      return;
    }

    setBadgeState(
      "mismatch",
      `${differenceTotal} difference${differenceTotal === 1 ? "" : "s"}`,
    );
    setPanelState("mismatch");
    renderMismatchSummary(diff, notes);
  }

  function renderMatchSummary(notes) {
    const fragment = document.createDocumentFragment();
    const message = document.createElement("p");
    message.textContent = `${state.selectedLabel || state.selectedFixture} matches the latest output.`;
    fragment.appendChild(message);

    if (notes.length) {
      fragment.appendChild(renderNotes(notes));
    }

    fixtureDiffSummary.appendChild(fragment);
  }

  function renderMismatchSummary(diff, notes) {
    const fragment = document.createDocumentFragment();
    const intro = document.createElement("p");
    intro.textContent = `Differences found while comparing to ${state.selectedLabel || state.selectedFixture}.`;
    fragment.appendChild(intro);

    fragment.appendChild(renderMetrics(diff));

    const details = buildDetailEntries(diff);
    if (details.length) {
      const list = document.createElement("ul");
      list.className = "diff-panel__details";
      details.slice(0, FIXTURE_SUMMARY_LIMIT).forEach((entry) => {
        const item = document.createElement("li");
        const label = document.createElement("strong");
        label.textContent = `${entry.kind}: `;
        const text = document.createElement("span");
        text.textContent = entry.message;
        item.append(label, text);
        list.appendChild(item);
      });
      if (details.length > FIXTURE_SUMMARY_LIMIT) {
        const more = document.createElement("li");
        more.textContent = `…and ${details.length - FIXTURE_SUMMARY_LIMIT} more differences.`;
        list.appendChild(more);
      }
      fragment.appendChild(list);
    }

    if (notes.length) {
      fragment.appendChild(renderNotes(notes));
    }

    fixtureDiffSummary.appendChild(fragment);
  }

  function renderMetrics(diff) {
    const wrapper = document.createElement("div");
    wrapper.className = "diff-panel__metrics";
    const metrics = [
      { label: "Added keys", value: diff.addedKeys.length },
      { label: "Removed keys", value: diff.removedKeys.length },
      { label: "Length changes", value: diff.lengthChanges.length },
      { label: "Type mismatches", value: diff.typeMismatches.length },
      { label: "Value differences", value: diff.valueDifferences.length },
    ];
    metrics.forEach((metric) => {
      const metricEl = document.createElement("div");
      metricEl.className = "diff-panel__metric";
      const label = document.createElement("span");
      label.textContent = metric.label;
      const value = document.createElement("span");
      value.className = "diff-panel__metric-value";
      value.textContent = String(metric.value);
      metricEl.append(label, value);
      wrapper.appendChild(metricEl);
    });
    return wrapper;
  }

  function renderNotes(notes) {
    const list = document.createElement("ul");
    list.className = "diff-panel__notes";
    notes.forEach((note) => {
      const item = document.createElement("li");
      item.textContent = note;
      list.appendChild(item);
    });
    return list;
  }

  function buildDetailEntries(diff) {
    const entries = [];
    diff.addedKeys.forEach((path) => {
      entries.push({ kind: "Added", message: path });
    });
    diff.removedKeys.forEach((path) => {
      entries.push({ kind: "Removed", message: path });
    });
    diff.lengthChanges.forEach(({ path, expected, actual }) => {
      entries.push({ kind: "Length", message: `${path}: expected ${expected}, actual ${actual}` });
    });
    diff.typeMismatches.forEach(({ path, expectedType, actualType }) => {
      entries.push({
        kind: "Type",
        message: `${path}: expected ${expectedType}, actual ${actualType}`,
      });
    });
    diff.valueDifferences.forEach(({ path, expected, actual }) => {
      entries.push({
        kind: "Value",
        message: `${path}: expected ${formatValuePreview(expected)}, actual ${formatValuePreview(actual)}`,
      });
    });
    return entries;
  }

  function setBadgeState(stateName, text) {
    fixtureDiffBadge.textContent = text;
    fixtureDiffBadge.classList.remove("is-match", "is-mismatch", "is-error", "is-pending");
    const className = stateName ? `is-${stateName}` : "is-pending";
    fixtureDiffBadge.classList.add(className);
  }

  function setPanelState(stateName) {
    fixtureDiffPanel.classList.remove("diff-panel--match", "diff-panel--mismatch", "diff-panel--error");
    if (stateName) {
      fixtureDiffPanel.classList.add(`diff-panel--${stateName}`);
    }
  }
}

function normalizeManifest(data) {
  if (!Array.isArray(data)) {
    throw new Error("Fixture manifest must be an array.");
  }
  return data
    .filter((item) => item && typeof item.file === "string" && item.file.toLowerCase().endsWith(".json"))
    .map((item) => ({
      file: item.file,
      label:
        typeof item.label === "string" && item.label.trim().length
          ? item.label.trim()
          : createFallbackLabel(item.file),
    }));
}

function createFallbackLabel(fileName) {
  const base = fileName.replace(/\.json$/i, "");
  return base
    .split(/[_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveFixtureUrl(fileName) {
  try {
    return new URL(`${FIXTURE_DIRECTORY_PATH}/${fileName}`, window.location.href).toString();
  } catch (error) {
    return `${FIXTURE_DIRECTORY_PATH}/${fileName}`;
  }
}

function formatJsonForDisplay(value) {
  try {
    return JSON.stringify(normalizeForDisplay(value), null, 2);
  } catch (error) {
    return JSON.stringify(value, null, 2);
  }
}

function normalizeForDisplay(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForDisplay(entry));
  }
  if (isPlainObject(value)) {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = normalizeForDisplay(value[key]);
    }
    return result;
  }
  return value;
}

function computeJsonDiff(expected, actual) {
  const diff = {
    addedKeys: [],
    removedKeys: [],
    typeMismatches: [],
    lengthChanges: [],
    valueDifferences: [],
  };

  compare(expected, actual, []);

  return diff;

  function compare(expectedValue, actualValue, path) {
    if (Object.is(expectedValue, actualValue)) {
      return;
    }

    const expectedType = describeType(expectedValue);
    const actualType = describeType(actualValue);

    if (expectedType !== actualType) {
      diff.typeMismatches.push({
        path: formatPath(path),
        expectedType,
        actualType,
      });
      return;
    }

    if (expectedType === "array") {
      const expectedArray = expectedValue;
      const actualArray = actualValue;
      if (expectedArray.length !== actualArray.length) {
        diff.lengthChanges.push({
          path: formatPath(path),
          expected: expectedArray.length,
          actual: actualArray.length,
        });
      }
      const limit = Math.min(expectedArray.length, actualArray.length);
      for (let index = 0; index < limit; index += 1) {
        compare(expectedArray[index], actualArray[index], [...path, index]);
      }
      return;
    }

    if (expectedType === "object") {
      const expectedKeys = Object.keys(expectedValue);
      const actualKeys = Object.keys(actualValue);
      for (const key of expectedKeys) {
        if (!Object.prototype.hasOwnProperty.call(actualValue, key)) {
          diff.removedKeys.push(formatPath([...path, key]));
        }
      }
      for (const key of actualKeys) {
        if (!Object.prototype.hasOwnProperty.call(expectedValue, key)) {
          diff.addedKeys.push(formatPath([...path, key]));
        }
      }
      for (const key of expectedKeys) {
        if (Object.prototype.hasOwnProperty.call(actualValue, key)) {
          compare(expectedValue[key], actualValue[key], [...path, key]);
        }
      }
      return;
    }

    diff.valueDifferences.push({
      path: formatPath(path),
      expected: expectedValue,
      actual: actualValue,
    });
  }
}

function describeType(value) {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  if (isPlainObject(value)) {
    return "object";
  }
  return typeof value;
}

function formatPath(segments) {
  if (!segments.length) {
    return "root";
  }
  let result = "";
  segments.forEach((segment) => {
    if (typeof segment === "number") {
      result += `[${segment}]`;
    } else {
      if (result.length) {
        result += ".";
      }
      result += segment;
    }
  });
  return result || "root";
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function formatValuePreview(value) {
  if (typeof value === "string") {
    return `"${truncateValue(value, DIFF_VALUE_PREVIEW_LIMIT)}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    const preview = keys.slice(0, 3).join(", ");
    return `object{${preview}${keys.length > 3 ? ", …" : ""}}`;
  }
  return typeof value;
}

function truncateValue(value, limit = DIFF_VALUE_PREVIEW_LIMIT) {
  if (typeof value !== "string") {
    return String(value);
  }
  if (value.length <= limit) {
    return value;
  }
  const safeLimit = Math.max(1, limit);
  return `${value.slice(0, safeLimit - 1)}…`;
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
