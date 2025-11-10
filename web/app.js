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
const formStatus = document.querySelector("#form-status");
const generateButton = document.querySelector("#generate-button");
const startDateInput = document.querySelector("#start-date");
const engineSelect = document.querySelector("#engine-select");
const mk2OptionsFieldset = document.querySelector("#mk2-options");
const mk2ArchetypeInput = document.querySelector("#mk2-archetype");
const mk2RigInput = document.querySelector("#mk2-rig");
const mk2SeedInput = document.querySelector("#mk2-seed");
const mk2WeekStartInput = document.querySelector("#mk2-start");
const mk2YearlyBudgetInput = document.querySelector("#mk2-budget");
const resultsSection = document.querySelector("#results");
const resultsTitle = document.querySelector("#results-title");
const resultsSubtitle = document.querySelector("#results-subtitle");
const totalsContainer = document.querySelector("#totals");
const jsonOutput = document.querySelector("#json-output");
const replayInspector = document.querySelector("#replay-inspector");
const replaySvg = document.querySelector("#replay-radial");
const replayEventList = document.querySelector("#replay-event-list");
const replayMinuteLabel = document.querySelector("#replay-minute-label");
const replayInfoButton = document.querySelector("#replay-info-button");
const replayInfoPopover = document.querySelector("#replay-info-popover");
const downloadButton = document.querySelector("#download-json");
const exportFramePngButton = document.querySelector("#export-frame-png");
const exportFrameSvgButton = document.querySelector("#export-frame-svg");
const exportReplayGifButton = document.querySelector("#export-replay-gif");
const exportReplayMp4Button = document.querySelector("#export-replay-mp4");
const exportStatus = document.querySelector("#export-status");
const calendarContainer = document.querySelector("#calendar");
const calendarWarning = document.querySelector("#calendar-warning");
const diagnosticsPanel = document.querySelector("#diagnostics-panel");
const diagnosticsDetails = document.querySelector("#diagnostics-details");
const diagnosticsIssueCount = document.querySelector("#diagnostics-issue-count");
const diagnosticsIssuesSection = document.querySelector("#diagnostics-issues-section");
const diagnosticsIssuesList = document.querySelector("#diagnostics-issues");
const diagnosticsMetadataSection = document.querySelector("#diagnostics-metadata-section");
const diagnosticsStatsList = document.querySelector("#diagnostics-stats");
const diagnosticsDayTypesSection = document.querySelector("#diagnostics-day-types-section");
const diagnosticsDayTypesList = document.querySelector("#diagnostics-day-types");
const diagnosticsCompressionSection = document.querySelector("#diagnostics-compression-section");
const diagnosticsCompressionContainer = document.querySelector("#diagnostics-compression");
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
const tabGroups = document.querySelectorAll("[data-tab-group]");

initializeTabGroups(tabGroups);

const replayExportButtons = [
  exportFramePngButton,
  exportFrameSvgButton,
  exportReplayGifButton,
  exportReplayMp4Button,
];

const SVG_NS = "http://www.w3.org/2000/svg";
const REPLAY_DEFAULT_LABEL = "Hover or tap the wheel to inspect minute ranges.";
const REPLAY_EXPORT_DURATION_MS = 5_000;
const REPLAY_EXPORT_FRAME_RATE = 30;
const REPLAY_EXPORT_GIF_FRAME_RATE = 12;

let replayState = createEmptyReplayState();
let gifshotLoader = null;
let tooltipInitialized = false;
let replayTooltipElement = null;

setReplayExportAvailability(false);

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

const MK2_DEFAULT_SEED = 42;
const MK2_PYTHON_RUNNER_SOURCE = `
from __future__ import annotations

import json
from datetime import date

from calendar_gen_v2 import _select_profile, generate_complete_week
from modules.unique_events import UniqueDay
from yearly_budget import YearlyBudget

payload = payload or {}
options = payload.get("options") or {}

archetype = (options.get("archetype") or "office").lower()
seed_value = options.get("seed")
start_date_value = options.get("start_date")
yearly_budget_payload = options.get("yearly_budget")

profile, templates = _select_profile(archetype)

if start_date_value:
    start = date.fromisoformat(start_date_value)
else:
    start = date.today()


def build_yearly_budget(data):
    if not data:
        return None
    if isinstance(data, str):
        data = json.loads(data)
    budget = YearlyBudget(
        person_id=data["person_id"],
        year=int(data["year"]),
        vacation_days=int(data.get("vacation_days", 20)),
        sick_days_taken=int(data.get("sick_days_taken", 0)),
    )
    for entry in data.get("unique_days", []):
        budget.add_unique_day(
            UniqueDay(
                date=date.fromisoformat(entry["date"]),
                day_type=entry["day_type"],
                rules=entry.get("rules", {}),
                priority=int(entry.get("priority", 5)),
            )
        )
    return budget


yearly_budget = build_yearly_budget(yearly_budget_payload)

seed = int(seed_value) if seed_value is not None else ${MK2_DEFAULT_SEED}

result = generate_complete_week(
    profile,
    start,
    week_seed=seed,
    templates=templates,
    yearly_budget=yearly_budget,
)

result
`;

const mk2RuntimeController = createPyRuntimeController();

let refreshTestConsoleEditor = () => {};
const DEFAULT_REPO_SLUG =
  document.documentElement?.dataset?.repoSlug || "LennartvdM/Wyrd-Engine";
const DEFAULT_REPO_BRANCH = document.documentElement?.dataset?.repoBranch || "main";
const PYTHON_RUNTIME_CORE_PATHS = [
  "calendar_gen.py",
  "cli.py",
  "friction.py",
  "models.py",
  "unique_days.py",
  "validation.py",
  "engines/__init__.py",
  "engines/base.py",
  "engines/engine_mk1.py",
  "rigs/simple_rig.py",
];

const PYTHON_RUNTIME_MK2_PATHS = [
  "archetypes.py",
  "calendar_gen_v2.py",
  "calendar_layers.py",
  "engines/engine_mk2.py",
  "modules/__init__.py",
  "modules/calendar_provider.py",
  "modules/friction_model.py",
  "modules/unique_events.py",
  "modules/validation.py",
  "rigs/__init__.py",
  "rigs/calendar_rig.py",
  "rigs/workforce_rig.py",
  "yearly_budget.py",
];

const PYTHON_RUNTIME_FILE_PATHS = dedupePaths([
  ...PYTHON_RUNTIME_CORE_PATHS,
  ...PYTHON_RUNTIME_MK2_PATHS,
]);

function dedupePaths(paths) {
  if (!Array.isArray(paths)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  paths.forEach((path) => {
    if (typeof path !== "string") {
      return;
    }
    const value = path.trim();
    if (!value || seen.has(value)) {
      return;
    }
    result.push(value);
    seen.add(value);
  });

  return result;
}

const ENGINE_FILE_PATTERN = /^engines\/engine_(mk\d+)\.py$/i;
const ENGINE_OPTIONS = deriveEngineOptions(PYTHON_RUNTIME_FILE_PATHS);
const ENGINE_LABEL_LOOKUP = new Map(ENGINE_OPTIONS.map((option) => [option.id, option.label]));
const DEFAULT_ENGINE_ID =
  ENGINE_OPTIONS.find((option) => option.id === "mk1")?.id ||
  ENGINE_OPTIONS[0]?.id ||
  "mk1";
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

function deriveEngineOptions(paths) {
  if (!Array.isArray(paths)) {
    return [];
  }

  const options = [];
  const seen = new Set();

  paths.forEach((path) => {
    const match = ENGINE_FILE_PATTERN.exec(path);
    if (!match) {
      return;
    }

    const id = match[1].toLowerCase();
    if (seen.has(id)) {
      return;
    }

    const versionNumber = Number.parseInt(id.replace("mk", ""), 10);
    const label = `Engine ${id.toUpperCase()}`;

    options.push({
      id,
      label,
      version: Number.isFinite(versionNumber) ? versionNumber : -Infinity,
    });
    seen.add(id);
  });

  options.sort((a, b) => a.version - b.version);
  return options;
}

const FIXTURE_DIRECTORY_PATH = "tests/fixtures";
const FIXTURE_MANIFEST_NAME = "manifest.json";
const FIXTURE_SUMMARY_LIMIT = 8;
const DIFF_VALUE_PREVIEW_LIMIT = 80;
const DIAGNOSTICS_COMPRESSION_PREVIEW_LIMIT = 4;

let currentState = undefined;
let calendar;

if (configInput) {
  configInput.value = JSON.stringify(DEFAULT_CONFIG, null, 2);
}

if (engineSelect) {
  // TODO: Remove MK2 filter once generateScheduleForEngine supports the MK2 branch.
  const selectableEngineOptions = ENGINE_OPTIONS.filter((option) => option.id !== "mk2");
  populateEngineSelect(engineSelect, selectableEngineOptions, DEFAULT_ENGINE_ID);

  const toggleMk2OptionsVisibility = () => {
    if (!mk2OptionsFieldset) {
      return;
    }

    if (engineSelect.value === "mk2") {
      mk2OptionsFieldset.classList.remove("hidden");
    } else {
      mk2OptionsFieldset.classList.add("hidden");
    }
  };

  toggleMk2OptionsVisibility();
  engineSelect.addEventListener("change", toggleMk2OptionsVisibility);
}

initViews();
initCalendar();
initTestConsole();
initTooltips();
initReplayInfoPopover();

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!configInput) {
    return;
  }

  const submitButton = getSubmitButton(event) || generateButton;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
  }

  setFormStatusMessage({});
  disableDownload();
  resetDiagnosticsPanel();

  try {
    const config = parseConfigInputValue(configInput.value);
    const startDate = parseStartDateValue(startDateInput?.value);
    const engineId = engineSelect?.value || DEFAULT_ENGINE_ID;
    const { events, totals, meta, issues, metadata } = await generateScheduleForEngine(
      engineId,
      config,
      startDate,
    );
    currentState = {
      events,
      totals,
      meta,
      issues: Array.isArray(issues) ? issues : [],
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      configName: typeof config?.name === "string" ? config.name : "",
    };
    updateResultsHeader(meta);
    renderTotals(totals);
    renderCalendar(events, meta);
    renderJson(events, meta);
    renderDiagnostics({ issues, metadata, meta });
    enableDownload(events, config.name);
    resultsSection?.classList.remove("hidden");
    setFormStatusMessage({ message: "Schedule generated.", tone: "success" });
  } catch (error) {
    console.error(error);
    const message = getFriendlyErrorMessage(error);
    setFormStatusMessage({ message, tone: "error" });
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
    }
  }
});

function getSubmitButton(event) {
  const submitter = event?.submitter;
  if (submitter) {
    const isButtonInstance =
      typeof HTMLButtonElement !== "undefined" && submitter instanceof HTMLButtonElement;
    if (isButtonInstance || submitter.tagName === "BUTTON") {
      return submitter;
    }
  }

  if (typeof HTMLButtonElement !== "undefined" && generateButton instanceof HTMLButtonElement) {
    return generateButton;
  }

  const fallback = form?.querySelector('button[type="submit"]');
  if (!fallback) {
    return null;
  }

  if (typeof HTMLButtonElement === "undefined" || fallback instanceof HTMLButtonElement) {
    return fallback;
  }

  if (fallback.tagName === "BUTTON") {
    return fallback;
  }

  return null;
}

function setFormStatusMessage({ message = "", tone = "neutral" } = {}) {
  if (!formStatus) {
    return;
  }

  const trimmedMessage = typeof message === "string" ? message.trim() : "";
  const isError = trimmedMessage && tone === "error";
  const isSuccess = trimmedMessage && tone === "success";

  formStatus.textContent = trimmedMessage;
  formStatus.classList.remove("form-status--error", "form-status--success");
  formStatus.setAttribute("role", isError ? "alert" : "status");
  formStatus.setAttribute("aria-live", isError ? "assertive" : "polite");

  if (isError) {
    formStatus.classList.add("form-status--error");
  } else if (isSuccess) {
    formStatus.classList.add("form-status--success");
  }
}

function parseConfigInputValue(rawValue) {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) {
    throw new Error("Provide configuration JSON before generating a schedule.");
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error("Configuration must be valid JSON.");
  }
}

function parseStartDateValue(rawValue) {
  try {
    return parseDateInput(rawValue);
  } catch (error) {
    throw new Error("Start date must be formatted as YYYY-MM-DD.");
  }
}

function getFriendlyErrorMessage(error) {
  if (!error) {
    return "Failed to generate schedule.";
  }

  if (typeof error === "string") {
    return error;
  }

  const candidates = [];

  if (typeof error.message === "string") {
    candidates.push(error.message);
  }

  if (error.details && typeof error.details === "object") {
    const detailMessage = typeof error.details.error === "string" ? error.details.error : "";
    const detailStderr = typeof error.details.stderr === "string" ? error.details.stderr : "";
    candidates.push(detailMessage, detailStderr);
  }

  if (typeof error.stderr === "string") {
    candidates.push(error.stderr);
  }

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    const firstLine = trimmed.split(/\r?\n/)[0].trim();
    if (firstLine) {
      return firstLine;
    }
  }

  return "Failed to generate schedule.";
}

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

function initializeTabGroups(groups) {
  groups.forEach((group) => {
    const tabs = Array.from(group.querySelectorAll('[role="tab"]'));
    const panels = Array.from(group.querySelectorAll('[role="tabpanel"]'));

    if (!tabs.length || !panels.length) {
      return;
    }

    const activateTab = (tab) => {
      tabs.forEach((button) => {
        const isActive = button === tab;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
        button.tabIndex = isActive ? 0 : -1;
      });

      panels.forEach((panel) => {
        const isActive = panel.dataset.tabPanel === tab.dataset.tabTarget;
        panel.classList.toggle("is-active", isActive);
        panel.hidden = !isActive;
      });
    };

    tabs.forEach((tab) => {
      tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;

      tab.addEventListener("click", () => {
        activateTab(tab);
      });

      tab.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
          return;
        }

        event.preventDefault();

        const currentIndex = tabs.indexOf(tab);
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
        const nextTab = tabs[nextIndex];

        activateTab(nextTab);
        nextTab.focus();
      });
    });

    const initiallySelectedTab =
      tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0];

    if (initiallySelectedTab) {
      activateTab(initiallySelectedTab);
    }
  });
}

function populateEngineSelect(selectElement, options, defaultValue) {
  if (!selectElement) {
    return;
  }

  selectElement.innerHTML = "";

  if (!Array.isArray(options) || options.length === 0) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "No engines available";
    selectElement.appendChild(placeholder);
    selectElement.disabled = true;
    return;
  }

  selectElement.disabled = false;

  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.label;
    selectElement.appendChild(element);
  });

  const fallback = options[0]?.id;
  const targetValue = options.some((option) => option.id === defaultValue)
    ? defaultValue
    : fallback;

  if (targetValue) {
    selectElement.value = targetValue;
  }
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
  document.body?.setAttribute("data-active-view", target);

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
      button.setAttribute("aria-pressed", "true");
      button.setAttribute("aria-current", "page");
    } else {
      button.classList.remove("is-active");
      button.setAttribute("aria-pressed", "false");
      button.removeAttribute("aria-current");
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
  const subtitleParts = [];
  const engineLabel = meta?.engineLabel || (meta?.engine ? `Engine ${String(meta.engine).toUpperCase()}` : "");
  if (engineLabel) {
    subtitleParts.push(engineLabel);
  }
  if (meta?.weekStart && meta?.weekEnd) {
    subtitleParts.push(formatWeekRange(meta.weekStart, meta.weekEnd));
  }
  resultsSubtitle.textContent = subtitleParts.join(" · ");
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

function resetDiagnosticsPanel() {
  if (!diagnosticsPanel) {
    return;
  }

  diagnosticsPanel.classList.add("hidden");
  if (diagnosticsDetails) {
    diagnosticsDetails.open = false;
  }

  if (diagnosticsIssueCount) {
    diagnosticsIssueCount.textContent = "";
    diagnosticsIssueCount.classList.add("hidden");
  }

  if (diagnosticsIssuesList) {
    diagnosticsIssuesList.innerHTML = "";
  }
  diagnosticsIssuesSection?.classList.add("hidden");

  if (diagnosticsStatsList) {
    diagnosticsStatsList.innerHTML = "";
    diagnosticsStatsList.classList.remove("hidden");
  }
  diagnosticsMetadataSection?.classList.add("hidden");

  if (diagnosticsDayTypesList) {
    diagnosticsDayTypesList.innerHTML = "";
  }
  diagnosticsDayTypesSection?.classList.add("hidden");

  if (diagnosticsCompressionContainer) {
    diagnosticsCompressionContainer.innerHTML = "";
  }
  diagnosticsCompressionSection?.classList.add("hidden");
}

function renderDiagnostics(payload = {}) {
  if (!diagnosticsPanel) {
    return;
  }

  resetDiagnosticsPanel();

  const issues = Array.isArray(payload?.issues)
    ? payload.issues.filter((issue) => issue !== null && issue !== undefined)
    : [];
  const metadata = payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  const meta = payload?.meta && typeof payload.meta === "object" ? payload.meta : {};

  const stats = buildDiagnosticsStats(meta, metadata);
  const dayTypes = getDayTypeEntries(metadata?.day_types);
  const compression = getCompressionEntries(metadata?.compression);

  const hasIssues = issues.length > 0;
  const hasMetadata = Boolean(stats.length || dayTypes.length || compression.length);

  if (!hasIssues && !hasMetadata) {
    return;
  }

  diagnosticsPanel.classList.remove("hidden");

  const issueCountValue = hasIssues
    ? issues.length
    : Number.isFinite(meta?.issueCount) && meta.issueCount > 0
      ? meta.issueCount
      : 0;

  if (diagnosticsIssueCount) {
    if (issueCountValue > 0) {
      diagnosticsIssueCount.textContent = `${issueCountValue} ${issueCountValue === 1 ? "issue" : "issues"}`;
      diagnosticsIssueCount.classList.remove("hidden");
    } else {
      diagnosticsIssueCount.textContent = "";
      diagnosticsIssueCount.classList.add("hidden");
    }
  }

  if (diagnosticsDetails) {
    diagnosticsDetails.open = hasIssues;
  }

  renderDiagnosticsIssues(issues, issueCountValue);
  renderDiagnosticsMetadata(stats, dayTypes, compression);
}

function renderDiagnosticsIssues(issues, reportedIssueCount = 0) {
  if (!diagnosticsIssuesSection || !diagnosticsIssuesList) {
    return;
  }

  diagnosticsIssuesList.innerHTML = "";
  const hasIssueEntries = Array.isArray(issues) && issues.length > 0;

  if (!hasIssueEntries) {
    if (reportedIssueCount > 0) {
      diagnosticsIssuesSection.classList.remove("hidden");
      const item = document.createElement("li");
      item.className = "diagnostics-issue";
      const message = document.createElement("p");
      message.textContent = "Issue metadata was reported, but no detailed diagnostics were returned.";
      item.append(message);
      diagnosticsIssuesList.append(item);
    } else {
      diagnosticsIssuesSection.classList.add("hidden");
    }
    return;
  }

  diagnosticsIssuesSection.classList.remove("hidden");

  issues.forEach((issue) => {
    const item = document.createElement("li");
    item.className = "diagnostics-issue";

    if (issue && typeof issue === "object") {
      const severity = normalizeIssueSeverity(issue.severity);
      const header = document.createElement("div");
      header.className = "diagnostics-issue__header";

      const severityBadge = document.createElement("span");
      severityBadge.className = `diagnostics-issue__severity diagnostics-issue__severity--${severity}`;
      severityBadge.textContent = formatDiagnosticLabel(severity) || "Info";
      header.append(severityBadge);

      const title = document.createElement("span");
      title.className = "diagnostics-issue__title";
      const titleParts = [];
      const typeLabel = formatDiagnosticLabel(issue.issue_type || issue.type);
      if (typeLabel) {
        titleParts.push(typeLabel);
      }
      if (typeof issue.day === "string" && issue.day) {
        titleParts.push(issue.day);
      } else if (typeof issue.date === "string" && issue.date) {
        titleParts.push(issue.date);
      }
      title.textContent = titleParts.join(" · ") || "Issue";
      header.append(title);

      item.append(header);

      const detailText =
        (typeof issue.details === "string" && issue.details) ||
        (typeof issue.message === "string" && issue.message) ||
        "";
      if (detailText) {
        const detail = document.createElement("p");
        detail.textContent = detailText;
        item.append(detail);
      }
    } else {
      item.textContent = typeof issue === "string" ? issue : JSON.stringify(issue);
    }

    diagnosticsIssuesList.append(item);
  });
}

function renderDiagnosticsMetadata(stats, dayTypes, compression) {
  if (!diagnosticsMetadataSection) {
    return;
  }

  const hasStats = Array.isArray(stats) && stats.length > 0;
  const hasDayTypes = Array.isArray(dayTypes) && dayTypes.length > 0;
  const hasCompression = Array.isArray(compression) && compression.length > 0;

  if (!hasStats && !hasDayTypes && !hasCompression) {
    diagnosticsMetadataSection.classList.add("hidden");
    if (diagnosticsStatsList) {
      diagnosticsStatsList.classList.add("hidden");
    }
    return;
  }

  diagnosticsMetadataSection.classList.remove("hidden");

  if (diagnosticsStatsList) {
    diagnosticsStatsList.innerHTML = "";
    if (hasStats) {
      diagnosticsStatsList.classList.remove("hidden");
      stats.forEach(({ label, value }) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        diagnosticsStatsList.append(dt, dd);
      });
    } else {
      diagnosticsStatsList.classList.add("hidden");
    }
  }

  if (diagnosticsDayTypesSection && diagnosticsDayTypesList) {
    diagnosticsDayTypesList.innerHTML = "";
    if (hasDayTypes) {
      diagnosticsDayTypesSection.classList.remove("hidden");
      const dayFormatter = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      dayTypes.forEach(({ date, label }) => {
        const item = document.createElement("li");
        const time = document.createElement("time");
        time.setAttribute("datetime", date);
        time.textContent = formatDiagnosticsDate(date, dayFormatter);
        const span = document.createElement("span");
        span.textContent = label;
        item.append(time, span);
        diagnosticsDayTypesList.append(item);
      });
    } else {
      diagnosticsDayTypesSection.classList.add("hidden");
    }
  }

  if (diagnosticsCompressionSection && diagnosticsCompressionContainer) {
    diagnosticsCompressionContainer.innerHTML = "";
    if (hasCompression) {
      diagnosticsCompressionSection.classList.remove("hidden");
      const dayFormatter = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      compression.forEach(({ date, logs, total }) => {
        const entry = document.createElement("details");
        const summary = document.createElement("summary");
        const dateLabel = formatDiagnosticsDate(date, dayFormatter);
        const adjustmentLabel = `${logs.length} ${logs.length === 1 ? "adjustment" : "adjustments"}`;
        const summaryParts = [dateLabel, adjustmentLabel];
        if (Number.isFinite(total)) {
          const hours = (total / 60).toFixed(1);
          summaryParts.push(`${hours} h scheduled`);
        }
        summary.textContent = summaryParts.join(" · ");
        entry.append(summary);

        const list = document.createElement("ul");
        const preview = logs.slice(0, DIAGNOSTICS_COMPRESSION_PREVIEW_LIMIT);
        preview.forEach((text) => {
          const item = document.createElement("li");
          item.textContent = text;
          list.append(item);
        });
        if (logs.length > preview.length) {
          const more = document.createElement("li");
          more.textContent = `…and ${logs.length - preview.length} more adjustments.`;
          list.append(more);
        }
        entry.append(list);
        diagnosticsCompressionContainer.append(entry);
      });
    } else {
      diagnosticsCompressionSection.classList.add("hidden");
    }
  }
}

function buildDiagnosticsStats(meta, metadata) {
  const stats = [];
  const totalEvents = Number(metadata?.total_events);
  if (Number.isFinite(totalEvents)) {
    stats.push({ label: "Events", value: totalEvents.toLocaleString() });
  }

  const issueCount = Number.isFinite(meta?.issueCount)
    ? meta.issueCount
    : Number.isFinite(metadata?.issue_count)
      ? metadata.issue_count
      : 0;
  if (issueCount > 0) {
    stats.push({ label: "Issues logged", value: issueCount });
  }

  if (meta?.weekStart && meta?.weekEnd) {
    stats.push({ label: "Week", value: formatWeekRange(meta.weekStart, meta.weekEnd) });
  }

  if (meta?.rig) {
    stats.push({ label: "Rig", value: formatDiagnosticLabel(meta.rig) });
  }

  if (meta?.archetype) {
    stats.push({ label: "Archetype", value: formatDiagnosticLabel(meta.archetype) });
  }

  if (typeof meta?.seed === "number" && Number.isFinite(meta.seed)) {
    stats.push({ label: "Seed", value: meta.seed });
  }

  return stats;
}

function getDayTypeEntries(dayTypes) {
  if (!dayTypes || typeof dayTypes !== "object") {
    return [];
  }

  return Object.entries(dayTypes)
    .map(([date, label]) => {
      if (typeof date !== "string" || !date) {
        return null;
      }
      const resolvedLabel = formatDiagnosticLabel(typeof label === "string" ? label : String(label));
      return resolvedLabel ? { date, label: resolvedLabel } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getCompressionEntries(compression) {
  if (!compression || typeof compression !== "object") {
    return [];
  }

  return Object.entries(compression)
    .map(([date, entry]) => {
      if (typeof date !== "string" || !date || typeof entry !== "object" || entry === null) {
        return null;
      }
      const logs = Array.isArray(entry.compressions)
        ? entry.compressions.filter((value) => typeof value === "string" && value.trim().length > 0)
        : [];
      if (!logs.length) {
        return null;
      }
      const total = Number(entry.original_total);
      return { date, logs, total: Number.isFinite(total) ? total : null };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function formatDiagnosticsDate(value, formatter) {
  if (typeof value !== "string" || !value) {
    return "";
  }
  try {
    const date = parseIsoDate(value);
    if (formatter && typeof formatter.format === "function") {
      return formatter.format(date);
    }
    const defaultFormatter = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return defaultFormatter.format(date);
  } catch (error) {
    return value;
  }
}

function formatDiagnosticLabel(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => capitalize(part))
    .join(" ");
}

function normalizeIssueSeverity(value) {
  if (typeof value !== "string") {
    return "info";
  }
  const normalized = value.toLowerCase();
  if (normalized === "warn") {
    return "warning";
  }
  if (["info", "warning", "error", "critical"].includes(normalized)) {
    return normalized;
  }
  return "info";
}

function createEmptyReplayState() {
  return {
    events: [],
    originalEvents: [],
    meta: null,
    layout: null,
    segmentsByDay: [],
    minuteBucketsByDay: [],
    eventElements: new Map(),
    hoveredEventIndices: new Set(),
    selectedEventIndex: null,
    hoverSource: null,
    lastPointerInfo: null,
    weekStartDate: null,
    pendingHighlightFrame: null,
    renderedHoveredIndices: new Set(),
    renderedSelectedIndex: null,
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
    setReplayExportAvailability(false);
    hideReplayTooltip();
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
  replayState.minuteBucketsByDay = prepared.minuteBucketsByDay;

  replayInspector.classList.remove("hidden");
  replayMinuteLabel.textContent = REPLAY_DEFAULT_LABEL;
  setReplayExportAvailability(true);
  updateExportStatus("Select an export option to share your replay.");
  hideReplayTooltip();

  buildReplaySvg(prepared);
  buildReplayEventList(prepared);

  updateReplayHighlights(true);
  updateMinuteLabelForSelection();
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
  let minuteBucketsByDay = [];

  if (layout) {
    for (const info of preparedEvents) {
      for (const segment of info.segments) {
        if (!segmentsByDay[segment.dayIndex]) {
          segmentsByDay[segment.dayIndex] = [];
        }
        segmentsByDay[segment.dayIndex].push(segment);
      }
    }
    minuteBucketsByDay = buildMinuteBuckets(segmentsByDay, layout.dayCount);
  }

  return { events: preparedEvents, layout, segmentsByDay, minuteBucketsByDay };
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
  const minuteAngles = new Float32Array(1440);
  const minuteSin = new Float32Array(1440);
  const minuteCos = new Float32Array(1440);
  const innerRadii = new Float32Array(effectiveDayCount);
  const outerRadii = new Float32Array(effectiveDayCount);
  for (let minute = 0; minute < 1440; minute += 1) {
    const angle = (minute / 1440) * Math.PI * 2;
    minuteAngles[minute] = angle;
    minuteSin[minute] = Math.sin(angle);
    minuteCos[minute] = Math.cos(angle);
  }
  for (let day = 0; day < effectiveDayCount; day += 1) {
    const inner = MIN_RADIUS + day * step;
    innerRadii[day] = inner;
    outerRadii[day] = inner + RING_WIDTH;
  }
  return {
    minRadius: MIN_RADIUS,
    ringWidth: RING_WIDTH,
    gap: RING_GAP,
    step,
    dayCount: effectiveDayCount,
    outerRadius,
    viewBoxSize,
    center,
    minuteAngles,
    minuteSin,
    minuteCos,
    innerRadii,
    outerRadii,
    minuteFractionCache: new Map(),
  };
}

function buildMinuteBuckets(segmentsByDay, dayCount) {
  if (!Array.isArray(segmentsByDay) || dayCount <= 0) {
    return [];
  }
  const buckets = Array.from({ length: dayCount }, () =>
    Array.from({ length: 1440 }, () => null)
  );
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    const segments = segmentsByDay[dayIndex];
    if (!Array.isArray(segments) || segments.length === 0) {
      continue;
    }
    for (const segment of segments) {
      const startIndex = Math.max(0, Math.floor(segment.startMinute));
      const endIndex = Math.min(1440, Math.ceil(segment.endMinute));
      for (let minuteIndex = startIndex; minuteIndex < endIndex; minuteIndex += 1) {
        let bucket = buckets[dayIndex][minuteIndex];
        if (!bucket) {
          bucket = [];
          buckets[dayIndex][minuteIndex] = bucket;
        }
        bucket.push(segment.eventIndex);
      }
    }
    for (let minuteIndex = 0; minuteIndex < 1440; minuteIndex += 1) {
      const bucket = buckets[dayIndex][minuteIndex];
      if (!bucket) {
        buckets[dayIndex][minuteIndex] = [];
      } else if (bucket.length > 1) {
        buckets[dayIndex][minuteIndex] = Array.from(new Set(bucket));
      }
    }
  }
  return buckets;
}

function buildReplaySvg(prepared) {
  if (!replaySvg) {
    return;
  }

  replaySvg.replaceChildren();

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
    const inner = layout.innerRadii?.[dayIndex] ?? layout.minRadius + dayIndex * layout.step;
    const outer = layout.outerRadii?.[dayIndex] ?? inner + layout.ringWidth;
    const radius = inner + (outer - inner) / 2;
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
      const innerRadius =
        layout.innerRadii?.[segment.dayIndex] ??
        layout.minRadius + segment.dayIndex * layout.step;
      const outerRadius =
        layout.outerRadii?.[segment.dayIndex] ?? innerRadius + layout.ringWidth;
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
      path.dataset.eventIndex = String(segment.eventIndex);
      path.dataset.dayIndex = String(segment.dayIndex);
      arcsGroup.appendChild(path);
      registerReplayArc(segment.eventIndex, path);
    }
  }

  replaySvg.appendChild(arcsGroup);
}

function minuteToPoint(layout, minute, radius) {
  const polar = getMinutePolar(layout, minute);
  const x = layout.center + radius * polar.sin;
  const y = layout.center - radius * polar.cos;
  return { x, y };
}

function getMinutePolar(layout, minute) {
  if (!layout || !Number.isFinite(minute)) {
    return { angle: 0, sin: 0, cos: 1 };
  }
  const normalized = ((minute % 1440) + 1440) % 1440;
  const baseIndex = Math.floor(normalized);
  if (normalized === baseIndex) {
    return {
      angle: layout.minuteAngles[baseIndex],
      sin: layout.minuteSin[baseIndex],
      cos: layout.minuteCos[baseIndex],
    };
  }
  if (!layout.minuteFractionCache.has(normalized)) {
    const angle = (normalized / 1440) * Math.PI * 2;
    layout.minuteFractionCache.set(normalized, {
      angle,
      sin: Math.sin(angle),
      cos: Math.cos(angle),
    });
  }
  return layout.minuteFractionCache.get(normalized);
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

function updateReplayHighlights(forceImmediate = false) {
  if (!replayState) {
    return;
  }
  if (forceImmediate) {
    if (replayState.pendingHighlightFrame != null) {
      cancelAnimationFrame(replayState.pendingHighlightFrame);
      replayState.pendingHighlightFrame = null;
    }
    flushReplayHighlightUpdate();
    return;
  }
  if (replayState.pendingHighlightFrame != null) {
    return;
  }
  replayState.pendingHighlightFrame = requestAnimationFrame(() => {
    replayState.pendingHighlightFrame = null;
    flushReplayHighlightUpdate();
  });
}

function flushReplayHighlightUpdate() {
  if (!replayState) {
    return;
  }
  const nextHovered = replayState.hoveredEventIndices;
  const nextSelected = replayState.selectedEventIndex;
  const previousHovered = replayState.renderedHoveredIndices;
  const previousSelected = replayState.renderedSelectedIndex;
  const indicesToUpdate = new Set();
  nextHovered.forEach((value) => indicesToUpdate.add(value));
  previousHovered.forEach((value) => indicesToUpdate.add(value));
  if (typeof nextSelected === "number") {
    indicesToUpdate.add(nextSelected);
  }
  if (typeof previousSelected === "number") {
    indicesToUpdate.add(previousSelected);
  }
  for (const eventIndex of indicesToUpdate) {
    const elements = replayState.eventElements.get(eventIndex);
    if (!elements) {
      continue;
    }
    const isSelected = nextSelected === eventIndex;
    const isHovered = nextHovered.has(eventIndex);
    for (const path of elements.paths) {
      path.classList.toggle("is-selected", isSelected);
      path.classList.toggle("is-hovered", isHovered && !isSelected);
    }
    if (elements.listItem) {
      elements.listItem.classList.toggle("is-selected", isSelected);
      elements.listItem.classList.toggle("is-hovered", isHovered && !isSelected);
      elements.listItem.setAttribute("aria-pressed", isSelected ? "true" : "false");
    }
  }
  replayState.renderedHoveredIndices = new Set(nextHovered);
  replayState.renderedSelectedIndex =
    typeof nextSelected === "number" ? nextSelected : null;
}

function updateMinuteLabelForSelection() {
  if (!replayMinuteLabel) {
    return;
  }
  if (
    typeof replayState.selectedEventIndex === "number" &&
    replayState.selectedEventIndex >= 0
  ) {
    const info = replayState.events[replayState.selectedEventIndex];
    const label = buildSelectedEventLabel(info);
    if (label) {
      replayMinuteLabel.textContent = `Selected: ${label}`;
      return;
    }
  }
  replayMinuteLabel.textContent = REPLAY_DEFAULT_LABEL;
}

function updateMinuteLabelFromPointer(info, eventIndices) {
  if (!replayMinuteLabel) {
    return;
  }
  const dayLabel = formatDayName(info.dayIndex, replayState.weekStartDate);
  const minuteLabel = formatMinutesOfDay(info.minute);
  const minuteIndex = info.dayIndex * 1440 + info.minute;
  let suffix = " — no events";
  if (eventIndices.length === 1) {
    suffix = ` — ${capitalize(formatReplayEventName(replayState.events[eventIndices[0]]?.event))}`;
  } else if (eventIndices.length > 1) {
    suffix = ` — ${eventIndices.length} events`;
  }
  replayMinuteLabel.textContent = `${dayLabel} · ${minuteLabel} (minute ${minuteIndex})${suffix}`;
}

function applyPointerHighlight(info, options = {}) {
  if (!info || !info.withinRing) {
    hideReplayTooltip();
    return [];
  }
  const indices = getEventIndicesForMinute(info.dayIndex, info.minute);
  replayState.hoveredEventIndices = new Set(indices);
  updateMinuteLabelFromPointer(info, indices);
  updateReplayHighlights();
  updateReplayPointerTooltip(options.pointerEvent, info, indices);
  return indices;
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
    return { withinRing: false, clientX: event.clientX, clientY: event.clientY };
  }
  const layout = replayState.layout;
  const step = layout.step;
  const relativeDistance = distance - layout.minRadius;
  const dayIndex = Math.floor(relativeDistance / step);
  if (dayIndex < 0 || dayIndex >= layout.dayCount) {
    return { withinRing: false, clientX: event.clientX, clientY: event.clientY };
  }
  const innerRadius =
    layout.innerRadii?.[dayIndex] ?? layout.minRadius + dayIndex * step;
  const outerRadius = layout.outerRadii?.[dayIndex] ?? innerRadius + layout.ringWidth;
  const tolerance = 0.75;
  const sinAngle = (x - center) / distance;
  const cosAngle = (center - y) / distance;
  let angle = Math.atan2(sinAngle, cosAngle);
  if (angle < 0) {
    angle += Math.PI * 2;
  }
  const minuteFloat = (angle / (Math.PI * 2)) * 1440;
  const minute = Math.floor(((minuteFloat % 1440) + 1440) % 1440);
  const withinRing =
    distance >= innerRadius - tolerance && distance <= outerRadius + tolerance;
  const radiusSpan = Math.max(outerRadius - innerRadius, 1);
  const ringFraction = clamp((distance - innerRadius) / radiusSpan, 0, 1);
  return {
    x,
    y,
    distance,
    dayIndex,
    minute,
    withinRing,
    clientX: event.clientX,
    clientY: event.clientY,
    innerRadius,
    outerRadius,
    ringFraction,
    minuteAbsolute: dayIndex * 1440 + minute,
  };
}

function updateReplayPointerTooltip(pointerEvent, info, indices = []) {
  if (typeof document === "undefined") {
    return;
  }
  if (!info || !info.withinRing) {
    hideReplayTooltip();
    return;
  }
  const anchorX = Number.isFinite(pointerEvent?.clientX)
    ? pointerEvent.clientX
    : info.clientX;
  const anchorY = Number.isFinite(pointerEvent?.clientY)
    ? pointerEvent.clientY
    : info.clientY;
  if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) {
    hideReplayTooltip();
    return;
  }

  const fragment = document.createDocumentFragment();
  const title = document.createElement("div");
  title.className = "replay-tooltip__title";
  title.textContent = describeReplayActivity(indices);
  fragment.appendChild(title);

  const list = document.createElement("dl");
  list.className = "replay-tooltip__list";
  list.appendChild(
    createReplayTooltipItem("Minute", buildReplayTooltipMinuteLabel(info))
  );
  list.appendChild(
    createReplayTooltipItem("Radius", buildReplayTooltipRadiusLabel(info))
  );
  list.appendChild(
    createReplayTooltipItem("Friction", describeFrictionForEvents(indices))
  );
  list.appendChild(
    createReplayTooltipItem("Frame", describeFrameForEvents(indices))
  );
  fragment.appendChild(list);

  showReplayTooltip(fragment, anchorX, anchorY);
}

function buildReplayTooltipMinuteLabel(info) {
  const dayLabel = formatDayName(info.dayIndex, replayState.weekStartDate);
  const minuteLabel = formatMinutesOfDay(info.minute);
  const minuteIndex = Number.isFinite(info.minuteAbsolute)
    ? Math.max(0, Math.round(info.minuteAbsolute))
    : null;
  if (Number.isFinite(minuteIndex)) {
    return `${dayLabel} · ${minuteLabel} · #${minuteIndex}`;
  }
  return `${dayLabel} · ${minuteLabel}`;
}

function buildReplayTooltipRadiusLabel(info) {
  if (!info) {
    return "—";
  }
  if (!Number.isFinite(info.distance)) {
    const intensityOnly = Math.round(clamp(info.ringFraction ?? 0, 0, 1) * 100);
    return `${intensityOnly}% intensity`;
  }
  const radius = Math.round(info.distance);
  const intensity = Math.round(clamp(info.ringFraction ?? 0, 0, 1) * 100);
  return `r${radius} · ${intensity}% intensity`;
}

function describeReplayActivity(indices = []) {
  if (!Array.isArray(indices) || indices.length === 0) {
    return "Idle";
  }
  if (indices.length === 1) {
    const info = findReplayEventInfo(indices[0]);
    if (info) {
      return capitalize(formatReplayEventName(info.event));
    }
    return "Activity";
  }
  const names = new Set();
  for (const index of indices) {
    const info = findReplayEventInfo(index);
    if (!info) {
      continue;
    }
    const label = capitalize(formatReplayEventName(info.event));
    if (label) {
      names.add(label);
    }
  }
  if (names.size === 1) {
    return Array.from(names)[0];
  }
  if (names.size > 1) {
    return `${names.size} activities`;
  }
  return `${indices.length} activities`;
}

function describeFrictionForEvents(indices = []) {
  if (!Array.isArray(indices) || indices.length === 0) {
    return "—";
  }
  const values = [];
  for (const index of indices) {
    const info = findReplayEventInfo(index);
    if (!info) {
      continue;
    }
    const metric = extractFrictionMetric(info.event);
    if (Number.isFinite(metric)) {
      values.push(metric);
    }
  }
  if (!values.length) {
    return "—";
  }
  if (values.length === 1) {
    return formatFrictionMetric(values[0]);
  }
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  if (Math.abs(minValue - maxValue) < 0.005) {
    return formatFrictionMetric(minValue);
  }
  return `${formatFrictionMetric(minValue)}–${formatFrictionMetric(maxValue)}`;
}

function formatFrictionMetric(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

function extractFrictionMetric(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  const candidates = [
    event.friction,
    event.friction_value,
    event.frictionValue,
    event.daily_friction,
    event.dailyFriction,
    event.friction_multiplier,
    event.frictionMultiplier,
    event.efficiency,
    event.efficiency_multiplier,
    event.efficiencyMultiplier,
    event.waste_multiplier,
    event.wasteMultiplier,
    event.metrics?.friction,
    event.metrics?.efficiency,
    event.diagnostics?.friction,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function describeFrameForEvents(indices = []) {
  if (!Array.isArray(indices) || indices.length === 0) {
    return getDefaultFrameName();
  }
  const names = new Set();
  for (const index of indices) {
    const info = findReplayEventInfo(index);
    if (!info) {
      continue;
    }
    const name = extractFrameName(info);
    if (name) {
      names.add(name);
    }
  }
  if (names.size === 0) {
    return getDefaultFrameName();
  }
  if (names.size === 1) {
    return Array.from(names)[0];
  }
  return `Multiple (${names.size})`;
}

function extractFrameName(info) {
  const event = info?.event;
  if (!event || typeof event !== "object") {
    return getDefaultFrameName();
  }
  const candidates = [
    event.frame_name,
    event.frameName,
    event.frame_label,
    event.frameLabel,
    event.frame,
    event.snapshot_name,
    event.snapshotName,
    event.snapshot,
    event.phase,
    event.phase_name,
    event.phaseName,
    event.stage,
    event.state,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return getDefaultFrameName();
}

function getDefaultFrameName() {
  const candidates = [
    replayState.meta?.frameName,
    replayState.meta?.frame_name,
    replayState.meta?.frame,
    replayState.meta?.name,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "Frame";
}

function findReplayEventInfo(eventIndex) {
  const index = Number(eventIndex);
  if (!Number.isFinite(index) || index < 0) {
    return null;
  }
  const direct = Array.isArray(replayState.events) ? replayState.events[index] : null;
  if (direct && direct.eventIndex === index) {
    return direct;
  }
  if (!Array.isArray(replayState.events)) {
    return null;
  }
  return replayState.events.find((entry) => entry?.eventIndex === index) || null;
}

function ensureReplayTooltip() {
  if (typeof document === "undefined") {
    return null;
  }
  if (!replayTooltipElement) {
    const tooltip = document.createElement("div");
    tooltip.id = "replay-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.setAttribute("aria-hidden", "true");
    document.body.appendChild(tooltip);
    replayTooltipElement = tooltip;
  }
  return replayTooltipElement;
}

function showReplayTooltip(content, anchorX, anchorY) {
  const tooltip = ensureReplayTooltip();
  if (!tooltip || typeof window === "undefined") {
    return;
  }
  tooltip.replaceChildren(content);
  tooltip.style.visibility = "hidden";
  tooltip.classList.add("is-visible");
  tooltip.setAttribute("aria-hidden", "false");
  const rect = tooltip.getBoundingClientRect();
  let top = anchorY - rect.height - 16;
  if (top < 8) {
    top = anchorY + 16;
  }
  let left = anchorX + 16;
  if (left + rect.width + 8 > window.innerWidth) {
    left = anchorX - rect.width - 16;
  }
  if (left < 8) {
    left = 8;
  }
  if (top + rect.height > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - rect.height - 8);
  }
  tooltip.style.top = `${Math.round(top)}px`;
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.visibility = "visible";
}

function hideReplayTooltip() {
  if (!replayTooltipElement) {
    return;
  }
  replayTooltipElement.classList.remove("is-visible");
  replayTooltipElement.setAttribute("aria-hidden", "true");
}

function createReplayTooltipItem(term, value) {
  const wrapper = document.createElement("div");
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = value != null ? String(value) : "—";
  wrapper.append(dt, dd);
  return wrapper;
}

function getEventIndicesForMinute(dayIndex, minuteOfDay) {
  if (
    !Array.isArray(replayState.minuteBucketsByDay) ||
    replayState.minuteBucketsByDay.length === 0 ||
    dayIndex < 0 ||
    dayIndex >= replayState.minuteBucketsByDay.length
  ) {
    return deriveEventIndicesFromSegments(dayIndex, minuteOfDay);
  }
  const safeMinute = Math.max(0, Math.min(1439, Math.floor(minuteOfDay)));
  const dayBucket = replayState.minuteBucketsByDay[dayIndex];
  if (dayBucket && Array.isArray(dayBucket[safeMinute])) {
    return dayBucket[safeMinute];
  }
  return deriveEventIndicesFromSegments(dayIndex, minuteOfDay);
}

function deriveEventIndicesFromSegments(dayIndex, minuteOfDay) {
  if (!Array.isArray(replayState.segmentsByDay) || dayIndex < 0) {
    return [];
  }
  const bucket = replayState.segmentsByDay[dayIndex] || [];
  return bucket
    .filter(
      (segment) =>
        minuteOfDay >= segment.startMinute && minuteOfDay < segment.endMinute
    )
    .map((segment) => segment.eventIndex);
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
      hideReplayTooltip();
    }
    return;
  }
  replayState.hoverSource = "svg";
  replayState.lastPointerInfo = info;
  applyPointerHighlight(info, { pointerEvent: event });
}

function handleReplayPointerLeave() {
  if (replayState.hoverSource === "svg") {
    replayState.hoverSource = null;
    replayState.hoveredEventIndices = new Set();
    replayState.lastPointerInfo = null;
    updateReplayHighlights();
    updateMinuteLabelForSelection();
    hideReplayTooltip();
  }
}

function handleReplayPointerClick(event) {
  if (!replayState.layout) {
    return;
  }
  const info = getReplayPointerInfo(event);
  if (!info || !info.withinRing) {
    clearReplaySelection();
    hideReplayTooltip();
    return;
  }
  replayState.lastPointerInfo = info;
  const indices = getEventIndicesForMinute(info.dayIndex, info.minute);
  if (indices.length) {
    selectReplayEvent(indices[0], { scrollIntoView: true });
  } else {
    replayState.hoverSource = "svg";
    replayState.lastPointerInfo = info;
    clearReplaySelection();
    replayState.hoveredEventIndices = new Set();
    updateMinuteLabelFromPointer(info, indices);
    updateReplayHighlights();
  }
}

function handleReplayListHover(eventIndex) {
  hideReplayTooltip();
  replayState.hoverSource = "list";
  replayState.hoveredEventIndices = new Set([eventIndex]);
  const info = replayState.events[eventIndex];
  const label = buildSelectedEventLabel(info);
  if (label && replayMinuteLabel) {
    replayMinuteLabel.textContent = `Preview: ${label}`;
  }
  updateReplayHighlights();
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
  hideReplayTooltip();
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

function enableDownload(events, name) {
  if (!downloadButton) {
    return;
  }
  const payload = JSON.stringify(events, null, 2);
  downloadButton.dataset.payload = payload;
  downloadButton.dataset.filename = `${getExportBaseName(name || "schedule")}-schedule.json`;
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

exportFramePngButton?.addEventListener("click", () => {
  runExportTask(exportReplayFrameAsPng, { pendingMessage: "Rendering PNG frame…" });
});

exportFrameSvgButton?.addEventListener("click", () => {
  runExportTask(exportReplayFrameAsSvg, { pendingMessage: "Preparing SVG frame…" });
});

exportReplayGifButton?.addEventListener("click", () => {
  runExportTask(exportReplayGif, { pendingMessage: "Building 5 second GIF…" });
});

exportReplayMp4Button?.addEventListener("click", () => {
  runExportTask(exportReplayMp4, { pendingMessage: "Recording 5 second replay…" });
});

function disableDownload() {
  if (!downloadButton) {
    return;
  }
  downloadButton.disabled = true;
  delete downloadButton.dataset.payload;
  delete downloadButton.dataset.filename;
}

async function runExportTask(task, options = {}) {
  if (typeof task !== "function") {
    return;
  }
  const { pendingMessage = "" } = options;
  if (pendingMessage) {
    updateExportStatus(pendingMessage);
  }
  try {
    setExportWorking(true);
    const result = await task();
    if (result && typeof result === "object") {
      if (result.message) {
        updateExportStatus(result.message, result.tone || "success");
      }
    } else if (typeof result === "string") {
      updateExportStatus(result, "success");
    } else if (pendingMessage) {
      updateExportStatus("Export complete.", "success");
    }
  } catch (error) {
    console.error(error);
    updateExportStatus(error.message || "Export failed.", "error");
  } finally {
    setExportWorking(false);
  }
}

function setExportWorking(isBusy) {
  for (const button of replayExportButtons) {
    if (!button) {
      continue;
    }
    if (isBusy) {
      button.dataset.wasDisabled = button.disabled ? "true" : "false";
      button.classList.add("is-busy");
      button.disabled = true;
    } else {
      const wasDisabled = button.dataset.wasDisabled === "true";
      button.classList.remove("is-busy");
      delete button.dataset.wasDisabled;
      if (button.dataset.disabledReason) {
        button.disabled = true;
      } else if (wasDisabled) {
        button.disabled = true;
      } else {
        button.disabled = false;
      }
    }
  }
}

function setReplayExportAvailability(isAvailable) {
  for (const button of replayExportButtons) {
    if (!button) {
      continue;
    }
    if (isAvailable) {
      if (!button.classList.contains("is-busy")) {
        button.disabled = false;
      }
      delete button.dataset.disabledReason;
    } else {
      button.disabled = true;
      button.dataset.disabledReason = "no-data";
      button.classList.remove("is-busy");
      delete button.dataset.wasDisabled;
    }
  }
  if (!isAvailable) {
    updateExportStatus("Generate a schedule to unlock export tools.");
  } else if (exportStatus && !exportStatus.textContent) {
    updateExportStatus("Select an export option to share your replay.");
  }
}

function updateExportStatus(message, tone = "info") {
  if (!exportStatus) {
    return;
  }
  exportStatus.textContent = message || "";
  if (!message || tone === "info") {
    exportStatus.removeAttribute("data-tone");
  } else {
    exportStatus.dataset.tone = tone;
  }
}

function initTooltips() {
  if (tooltipInitialized || typeof document === "undefined") {
    return;
  }
  tooltipInitialized = true;
  const tooltip = document.createElement("div");
  tooltip.id = "app-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("aria-hidden", "true");
  document.body.appendChild(tooltip);

  let activeTarget = null;

  function showTooltip(target) {
    if (!target || !target.hasAttribute("data-tooltip")) {
      return;
    }
    const content = target.getAttribute("data-tooltip");
    if (!content) {
      return;
    }
    tooltip.textContent = content;
    tooltip.style.visibility = "hidden";
    tooltip.classList.add("is-visible");
    tooltip.setAttribute("aria-hidden", "false");
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const offset = 12;
    let top = rect.top - tooltipRect.height - offset;
    if (top < 8) {
      top = rect.bottom + offset;
    }
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    top = Math.min(top, window.innerHeight - tooltipRect.height - 8);
    top = Math.max(8, top);
    left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - tooltipRect.width - 8));
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.visibility = "visible";
    activeTarget = target;
    target.setAttribute("aria-describedby", tooltip.id);
  }

  function hideTooltip(target) {
    if (target && target !== activeTarget) {
      return;
    }
    activeTarget?.removeAttribute("aria-describedby");
    activeTarget = null;
    tooltip.classList.remove("is-visible");
    tooltip.setAttribute("aria-hidden", "true");
  }

  document.addEventListener("pointerenter", (event) => {
    const target = event.target?.closest?.("[data-tooltip]");
    if (target) {
      showTooltip(target);
    }
  });

  document.addEventListener("pointerleave", (event) => {
    const target = event.target?.closest?.("[data-tooltip]");
    if (target) {
      hideTooltip(target);
    }
  });

  document.addEventListener("focusin", (event) => {
    const target = event.target?.closest?.("[data-tooltip]");
    if (target) {
      showTooltip(target);
    }
  });

  document.addEventListener("focusout", (event) => {
    const target = event.target?.closest?.("[data-tooltip]");
    if (target) {
      hideTooltip(target);
    }
  });
}

function initReplayInfoPopover() {
  if (!replayInfoButton || !replayInfoPopover) {
    return;
  }

  let isOpen = false;

  function closePopover({ returnFocus = false } = {}) {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    replayInfoButton.setAttribute("aria-expanded", "false");
    replayInfoPopover.classList.add("hidden");
    if (returnFocus) {
      replayInfoButton.focus({ preventScroll: true });
    }
  }

  function openPopover() {
    if (isOpen) {
      return;
    }
    isOpen = true;
    replayInfoButton.setAttribute("aria-expanded", "true");
    replayInfoPopover.classList.remove("hidden");
    replayInfoPopover.focus({ preventScroll: true });
  }

  replayInfoButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (isOpen) {
      closePopover();
    } else {
      openPopover();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!isOpen) {
      return;
    }
    const target = event.target;
    if (
      target === replayInfoButton ||
      replayInfoPopover.contains(target instanceof Node ? target : null)
    ) {
      return;
    }
    closePopover();
  });

  document.addEventListener("keydown", (event) => {
    if (!isOpen) {
      return;
    }
    if (event.key === "Escape" || event.key === "Esc") {
      event.preventDefault();
      closePopover({ returnFocus: true });
    }
  });
}

function ensureReplayAvailable() {
  if (!replaySvg || !Array.isArray(replayState?.events) || replayState.events.length === 0) {
    throw new Error("Generate a schedule to export the replay.");
  }
}

function getExportBaseName(fallback = "schedule") {
  const candidate =
    (currentState?.meta && typeof currentState.meta.name === "string" && currentState.meta.name) ||
    (typeof currentState?.configName === "string" && currentState.configName) ||
    fallback;
  const safe = slugify(candidate || fallback);
  return safe || slugify(fallback) || "schedule";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

async function exportReplayFrameAsPng() {
  ensureReplayAvailable();
  const canvas = document.createElement("canvas");
  await drawSvgToCanvas(replaySvg, canvas);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Unable to create PNG export."));
      }
    }, "image/png");
  });
  downloadBlob(blob, `${getExportBaseName()}-frame.png`);
  return "Frame exported as PNG.";
}

async function exportReplayFrameAsSvg() {
  ensureReplayAvailable();
  const clone = replaySvg.cloneNode(true);
  clone.setAttribute("xmlns", SVG_NS);
  if (!clone.getAttribute("viewBox") && replaySvg.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", replaySvg.getAttribute("viewBox"));
  }
  const layoutSize = replayState.layout?.viewBoxSize;
  if (!clone.getAttribute("width") && layoutSize) {
    clone.setAttribute("width", String(layoutSize));
  }
  if (!clone.getAttribute("height") && layoutSize) {
    clone.setAttribute("height", String(layoutSize));
  }
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, `${getExportBaseName()}-frame.svg`);
  return "Frame exported as SVG.";
}

async function exportReplayGif() {
  ensureReplayAvailable();
  const timeline = getReplayTimelineRange();
  if (!timeline) {
    throw new Error("Replay animation is unavailable for this schedule.");
  }
  const gifshot = await loadGifshot();
  const frameRate = REPLAY_EXPORT_GIF_FRAME_RATE;
  const frameCount = Math.max(1, Math.round((REPLAY_EXPORT_DURATION_MS / 1000) * frameRate));
  const frameInterval = REPLAY_EXPORT_DURATION_MS / frameCount;
  const canvas = document.createElement("canvas");
  const frames = [];
  await runReplayAnimation({
    durationMs: REPLAY_EXPORT_DURATION_MS,
    frameRate,
    realTime: false,
    onFrame: async () => {
      await drawSvgToCanvas(replaySvg, canvas);
      frames.push(canvas.toDataURL("image/png"));
    },
  });
  if (!frames.length) {
    throw new Error("Unable to capture replay frames.");
  }
  const gifDataUrl = await new Promise((resolve, reject) => {
    gifshot.createGIF(
      {
        images: frames,
        interval: frameInterval / 1000,
        gifWidth: canvas.width,
        gifHeight: canvas.height,
        numFrames: frames.length,
        sampleInterval: 5,
      },
      (result) => {
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result.image);
        }
      }
    );
  });
  downloadDataUrl(gifDataUrl, `${getExportBaseName()}-replay.gif`);
  return "Replay exported as GIF.";
}

async function exportReplayMp4() {
  ensureReplayAvailable();
  if (typeof MediaRecorder === "undefined" || typeof replaySvg.captureStream !== "function") {
    throw new Error("Video export is not supported in this browser.");
  }
  const mimeCandidates = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8"];
  let mimeType = null;
  for (const candidate of mimeCandidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      mimeType = candidate;
      break;
    }
  }
  if (!mimeType) {
    throw new Error("Video encoding is not supported in this browser.");
  }
  const stream = replaySvg.captureStream(REPLAY_EXPORT_FRAME_RATE);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });
  const chunks = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size) {
      chunks.push(event.data);
    }
  });
  const recordingPromise = new Promise((resolve) => {
    recorder.addEventListener("stop", () => {
      resolve(new Blob(chunks, { type: mimeType }));
    });
  });
  recorder.start();
  await runReplayAnimation({
    durationMs: REPLAY_EXPORT_DURATION_MS,
    frameRate: REPLAY_EXPORT_FRAME_RATE,
    realTime: true,
  });
  await delay(150);
  recorder.stop();
  const blob = await recordingPromise;
  const extension = mimeType.includes("mp4") ? "mp4" : "webm";
  downloadBlob(blob, `${getExportBaseName()}-replay.${extension}`);
  if (extension === "mp4") {
    return "Replay exported as MP4.";
  }
  return {
    message: "Replay exported as WebM (MP4 unavailable).",
    tone: "success",
  };
}

async function runReplayAnimation(options = {}) {
  const {
    durationMs = REPLAY_EXPORT_DURATION_MS,
    frameRate = REPLAY_EXPORT_FRAME_RATE,
    realTime = true,
    onFrame,
  } = options;
  const timeline = getReplayTimelineRange();
  if (!timeline) {
    throw new Error("Replay animation is unavailable for this schedule.");
  }
  const frameCount = Math.max(1, Math.round((durationMs / 1000) * frameRate));
  const snapshot = captureReplaySnapshot();
  replayState.hoverSource = "animation";
  const totalMinutes = timeline.end - timeline.start;
  if (realTime) {
    await runRealTimeReplayAnimation({
      durationMs,
      frameCount,
      frameRate,
      totalMinutes,
      timeline,
    });
  } else {
    for (let frame = 0; frame < frameCount; frame += 1) {
      const progress = frameCount === 1 ? 1 : frame / (frameCount - 1);
      const minute = timeline.start + totalMinutes * progress;
      const indices = setReplayMinuteHighlight(minute, timeline);
      await nextAnimationFrame();
      if (typeof onFrame === "function") {
        await onFrame({ frame, frameCount, progress, minute, indices });
      }
    }
  }
  restoreReplaySnapshot(snapshot);
}

async function runRealTimeReplayAnimation(config) {
  const { durationMs, frameCount, frameRate, totalMinutes, timeline } = config;
  const initialInterval = 1000 / Math.max(frameRate, 1);
  const maxInterval = Math.max(initialInterval, 1000 / 30);
  let effectiveInterval = initialInterval;
  const start = performance.now();
  let lastRenderTime = start - effectiveInterval;
  let lastFrameIndex = -1;
  await new Promise((resolve) => {
    function step(now) {
      if (now - lastRenderTime < effectiveInterval) {
        requestAnimationFrame(step);
        return;
      }
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      const targetFrame = Math.min(
        frameCount - 1,
        Math.floor(progress * frameCount)
      );
      if (targetFrame === lastFrameIndex && progress < 1) {
        requestAnimationFrame(step);
        return;
      }
      const renderStart = performance.now();
      const minute = timeline.start + totalMinutes * progress;
      setReplayMinuteHighlight(minute, timeline);
      lastRenderTime = now;
      lastFrameIndex = targetFrame;
      const renderDuration = performance.now() - renderStart;
      if (renderDuration > effectiveInterval * 1.2 && effectiveInterval < maxInterval) {
        effectiveInterval = Math.min(maxInterval, effectiveInterval * 2);
      }
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function getReplayTimelineRange() {
  let start = Infinity;
  let end = -Infinity;
  for (const info of replayState.events) {
    if (Number.isFinite(info?.absoluteStart) && Number.isFinite(info?.absoluteEnd)) {
      start = Math.min(start, info.absoluteStart);
      end = Math.max(end, info.absoluteEnd);
    }
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  if (end <= start) {
    end = start + 1;
  }
  return { start, end };
}

function captureReplaySnapshot() {
  return {
    hoveredEventIndices: Array.from(replayState.hoveredEventIndices || []),
    selectedEventIndex: replayState.selectedEventIndex,
    hoverSource: replayState.hoverSource,
    minuteLabel: replayMinuteLabel ? replayMinuteLabel.textContent : REPLAY_DEFAULT_LABEL,
    lastPointerInfo: replayState.lastPointerInfo ? { ...replayState.lastPointerInfo } : null,
  };
}

function restoreReplaySnapshot(snapshot) {
  if (!snapshot) {
    return;
  }
  replayState.hoveredEventIndices = new Set(snapshot.hoveredEventIndices || []);
  replayState.selectedEventIndex = snapshot.selectedEventIndex ?? null;
  replayState.hoverSource = snapshot.hoverSource ?? null;
  replayState.lastPointerInfo = snapshot.lastPointerInfo ?? null;
  updateReplayHighlights();
  if (typeof snapshot.selectedEventIndex === "number" && snapshot.selectedEventIndex >= 0) {
    updateMinuteLabelForSelection();
  } else if (replayMinuteLabel) {
    replayMinuteLabel.textContent = snapshot.minuteLabel || REPLAY_DEFAULT_LABEL;
  }
}

function getReplayEventIndicesAtMinute(minute) {
  if (!Number.isFinite(minute)) {
    return [];
  }
  if (Array.isArray(replayState.minuteBucketsByDay) && replayState.minuteBucketsByDay.length) {
    const dayIndex = Math.floor(minute / 1440);
    const minuteOfDay = minute - dayIndex * 1440;
    return getEventIndicesForMinute(dayIndex, minuteOfDay);
  }
  const indices = [];
  replayState.events.forEach((info) => {
    if (!Number.isFinite(info?.absoluteStart) || !Number.isFinite(info?.absoluteEnd)) {
      return;
    }
    if (minute >= info.absoluteStart && minute <= info.absoluteEnd) {
      indices.push(info.eventIndex);
    }
  });
  return indices;
}

function setReplayMinuteHighlight(minute, timeline) {
  const clamped = Math.min(Math.max(minute, timeline.start), timeline.end);
  const indices = getReplayEventIndicesAtMinute(clamped);
  replayState.hoveredEventIndices = new Set(indices);
  replayState.selectedEventIndex = null;
  updateReplayHighlights();
  if (replayMinuteLabel) {
    const label = formatAbsoluteMinuteLabel(clamped, replayState.weekStartDate);
    let suffix = " — idle";
    if (indices.length === 1) {
      let info = replayState.events[indices[0]];
      if (!info || info.eventIndex !== indices[0]) {
        info = replayState.events.find((entry) => entry.eventIndex === indices[0]);
      }
      const name = capitalize(formatReplayEventName(info?.event));
      suffix = ` — ${name}`;
    } else if (indices.length > 1) {
      suffix = ` — ${indices.length} events`;
    }
    replayMinuteLabel.textContent = `Replay · ${label}${suffix}`;
  }
  return indices;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function drawSvgToCanvas(svgElement, canvas) {
  if (!svgElement || !canvas) {
    throw new Error("Canvas rendering is unavailable.");
  }
  const clone = svgElement.cloneNode(true);
  clone.setAttribute("xmlns", SVG_NS);
  const viewBox = clone.getAttribute("viewBox") || svgElement.getAttribute("viewBox");
  let width = replayState.layout?.viewBoxSize || 512;
  let height = width;
  if (viewBox) {
    const parts = viewBox.trim().split(/[ ,]+/).map(Number);
    if (parts.length >= 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
      width = parts[2];
      height = parts[3];
    }
    clone.setAttribute("viewBox", viewBox);
  }
  if (!clone.getAttribute("width")) {
    clone.setAttribute("width", String(width));
  }
  if (!clone.getAttribute("height")) {
    clone.setAttribute("height", String(height));
  }
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context is unavailable.");
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = getCanvasBackgroundColor();
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getCanvasBackgroundColor() {
  try {
    const styles = getComputedStyle(document.documentElement);
    const value = styles.getPropertyValue("--color-canvas-base");
    return value && value.trim().length ? value.trim() : "#030b1c";
  } catch (error) {
    return "#030b1c";
  }
}

async function loadGifshot() {
  if (window.gifshot) {
    return window.gifshot;
  }
  if (!gifshotLoader) {
    gifshotLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/gifshot@0.4.5/build/gifshot.min.js";
      script.async = true;
      script.onload = () => {
        if (window.gifshot) {
          resolve(window.gifshot);
        } else {
          reject(new Error("Failed to load GIF encoder."));
        }
      };
      script.onerror = () => reject(new Error("Failed to load GIF encoder."));
      document.head.appendChild(script);
    });
  }
  try {
    return await gifshotLoader;
  } catch (error) {
    gifshotLoader = null;
    throw error;
  }
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

async function generateScheduleForEngine(engineId, config, startDate) {
  const normalizedId = typeof engineId === "string" ? engineId.toLowerCase() : "";
  const engineLabel = ENGINE_LABEL_LOOKUP.get(normalizedId) ||
    (normalizedId ? `Engine ${normalizedId.toUpperCase()}` : "");

  if (normalizedId === "mk1") {
    const result = generateScheduleWithMk1(config, startDate);
    return {
      events: result.events,
      totals: result.totals,
      meta: { ...result.meta, engine: normalizedId, engineLabel },
      issues: [],
      metadata: {
        engine: normalizedId,
        issue_count: 0,
        total_events: Array.isArray(result.events) ? result.events.length : undefined,
      },
    };
  } else if (normalizedId === "mk2") {
    return generateScheduleWithMk2(config, {
      startDate,
      engineId: normalizedId,
      engineLabel,
    });
  }

  if (!normalizedId) {
    throw new Error("Select an engine before generating a schedule.");
  }

  throw new Error(
    `${engineLabel || `Engine ${normalizedId.toUpperCase()}`} is not supported in this generator yet.`
  );
}

async function generateScheduleWithMk2(config, { startDate, engineId, engineLabel }) {
  const options = getMk2Options(startDate);
  const payload = {
    config: typeof config === "object" && config !== null ? config : {},
    options: {
      archetype: options.archetype,
      rig: options.rig,
      seed: typeof options.seed === "number" ? options.seed : null,
      start_date: options.startDateIso || null,
      yearly_budget: options.yearlyBudget || null,
    },
  };

  const response = await mk2RuntimeController.run(MK2_PYTHON_RUNNER_SOURCE, {
    context: { payload },
  });

  const result = parseRunnerResultJSON(response.resultJSON);
  if (!result || typeof result !== "object") {
    throw new Error("MK2 runtime returned an unexpected result payload.");
  }

  const events = normalizeMk2Events(result.events);
  const totals = normalizeMk2Totals(result.metadata?.summary_hours);
  const meta = normalizeMk2Meta(result, {
    engineId,
    engineLabel,
    options,
    configName: typeof config?.name === "string" ? config.name : "",
  });

  const person = typeof result.person === "string" ? result.person : meta?.person || "";
  const weekStart =
    typeof result.week_start === "string"
      ? result.week_start
      : typeof result.weekStart === "string"
        ? result.weekStart
        : options.startDateIso || "";
  const issues = Array.isArray(result.issues)
    ? result.issues
    : Array.isArray(result.metadata?.issues)
      ? result.metadata.issues
      : [];
  const metadata =
    result.metadata && typeof result.metadata === "object" ? result.metadata : { engine: engineId };

  return { events, totals, meta, person, week_start: weekStart, issues, metadata };
}

function getMk2Options(fallbackStartDate) {
  const archetypeValue = mk2ArchetypeInput?.value || "office";
  const archetype = typeof archetypeValue === "string" ? archetypeValue.toLowerCase() : "office";

  const rigValue = mk2RigInput?.value || "calendar";
  const normalizedRig = typeof rigValue === "string" ? rigValue.toLowerCase() : "calendar";
  const rig = normalizedRig === "workforce" ? "workforce" : "calendar";

  const seedRaw = mk2SeedInput?.value?.trim();
  let seed;
  if (seedRaw) {
    const parsedSeed = Number.parseInt(seedRaw, 10);
    if (!Number.isFinite(parsedSeed)) {
      throw new Error("MK2 seed must be a valid number.");
    }
    seed = parsedSeed;
  }

  const mk2StartRaw = mk2WeekStartInput?.value?.trim();
  let startDateIso;
  if (mk2StartRaw) {
    try {
      const parsed = parseDateInput(mk2StartRaw);
      startDateIso = toIsoDate(parsed);
    } catch (error) {
      throw new Error("MK2 week start must be a valid date.");
    }
  } else if (fallbackStartDate instanceof Date && !Number.isNaN(fallbackStartDate.valueOf())) {
    startDateIso = toIsoDate(fallbackStartDate);
  }

  const budgetRaw = mk2YearlyBudgetInput?.value?.trim();
  let yearlyBudget;
  if (budgetRaw) {
    try {
      yearlyBudget = JSON.parse(budgetRaw);
    } catch (error) {
      throw new Error("Yearly budget must be valid JSON.");
    }
  }

  return {
    archetype,
    rig,
    seed,
    startDateIso,
    yearlyBudget,
  };
}

function parseRunnerResultJSON(resultJSON) {
  if (typeof resultJSON !== "string") {
    throw new Error("MK2 runtime did not return JSON output.");
  }
  const trimmed = resultJSON.trim();
  if (!trimmed) {
    throw new Error("MK2 runtime returned an empty result.");
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const reason = error?.message || error;
    throw new Error(`Failed to parse MK2 result: ${reason}`);
  }
}

function normalizeMk2Events(rawEvents) {
  if (!Array.isArray(rawEvents)) {
    throw new Error("MK2 runtime returned an invalid events list.");
  }

  const events = rawEvents
    .map((event) => {
      if (!event || typeof event !== "object") {
        return null;
      }

      const dateValue = typeof event.date === "string" ? event.date : "";
      const dayValue = typeof event.day === "string" ? event.day : "";
      const startValue = typeof event.start === "string" ? event.start : "00:00";
      const endValue = typeof event.end === "string" ? event.end : startValue;
      const activityValue = typeof event.activity === "string" ? event.activity : "";

      let duration = Number(
        event.duration_minutes ?? event.duration ?? event.minutes ?? event.length_minutes,
      );
      if (!Number.isFinite(duration) || duration <= 0) {
        const computed = computeDurationFromTimes(startValue, endValue);
        if (Number.isFinite(computed) && computed > 0) {
          duration = computed;
        } else {
          duration = 0;
        }
      }

      const normalized = {
        date: dateValue,
        day: dayValue,
        start: startValue,
        end: endValue,
        activity: activityValue,
        duration_minutes: duration,
      };

      const minuteRange = event.minute_range ?? event.minuteRange;
      if (minuteRange !== undefined) {
        normalized.minute_range = minuteRange;
      }

      return normalized;
    })
    .filter(Boolean);

  events.sort((a, b) => {
    if (a.date === b.date) {
      return a.start.localeCompare(b.start);
    }
    return a.date.localeCompare(b.date);
  });

  return events;
}

function normalizeMk2Totals(summary) {
  if (!summary || typeof summary !== "object") {
    return {};
  }

  const totals = {};
  Object.entries(summary).forEach(([activity, value]) => {
    const hours = Number(value);
    if (Number.isFinite(hours)) {
      totals[activity] = hours;
    }
  });
  return totals;
}

function normalizeMk2Meta(result, { engineId, engineLabel, options, configName }) {
  const issues = Array.isArray(result?.issues) ? result.issues : [];
  const metadata = result?.metadata && typeof result.metadata === "object" ? result.metadata : {};
  const rawWeekStart = typeof result?.week_start === "string" ? result.week_start : null;
  const weekStartIso = rawWeekStart || options.startDateIso || undefined;

  let weekEndIso;
  if (weekStartIso) {
    try {
      const start = parseIsoDate(weekStartIso);
      weekEndIso = toIsoDate(addDays(start, 6));
    } catch (error) {
      weekEndIso = undefined;
    }
  }

  const rawIssueCount = Number(metadata?.issue_count);
  const issueCount = Number.isFinite(rawIssueCount) ? rawIssueCount : issues.length;
  const resolvedSeed = typeof options.seed === "number" ? options.seed : MK2_DEFAULT_SEED;
  const name = typeof result?.person === "string" && result.person ? result.person : configName || "";

  const meta = {
    engine: engineId,
    engineLabel,
    name,
    weekStart: weekStartIso,
    weekEnd: weekEndIso,
    issueCount,
    issues,
    rig: options.rig,
    archetype: options.archetype,
    seed: resolvedSeed,
  };

  if (options.yearlyBudget) {
    meta.yearlyBudgetProvided = true;
  }

  return meta;
}

function computeDurationFromTimes(start, end) {
  if (typeof start !== "string" || typeof end !== "string") {
    return NaN;
  }
  try {
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);
    let duration = endMinutes - startMinutes;
    if (duration <= 0) {
      duration += 24 * 60;
    }
    return duration;
  } catch (error) {
    return NaN;
  }
}

function generateScheduleWithMk1(config, startDate) {
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

async function loadPythonRuntimeFiles() {
  const source = {
    slug: DEFAULT_REPO_SLUG,
    branch: DEFAULT_REPO_BRANCH,
  };

  const downloads = PYTHON_RUNTIME_FILE_PATHS.map(async (path) => {
    try {
      const { content } = await fetchRepoFileContent(path, source);
      return { path, content };
    } catch (error) {
      const reason = error?.message || error;
      throw new Error(`Failed to load ${path}: ${reason}`);
    }
  });

  return Promise.all(downloads);
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
      loadPromise = (async () => {
        const files = await loadPythonRuntimeFiles();
        return postMessage("load", { files });
      })().catch((error) => {
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
