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

let currentState = undefined;
let currentDisplayMode = "minute";
let visTimelineInstance;
let visTimelineItems;
let visTimelineGroups;

if (configInput) {
  configInput.value = JSON.stringify(DEFAULT_CONFIG, null, 2);
}

initCalendar();

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
    destroyVisTimeline();
    timelineContainer.innerHTML = "";
    eventTable.innerHTML = "";
    dayViewContainer.innerHTML = "";
    weekViewContainer.innerHTML = "";
    monthViewContainer.innerHTML = "";
    yearViewContainer.innerHTML = "";
    return;
  }
  const { Calendar } = window.FullCalendar;
  calendar = new Calendar(calendarContainer, {
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

function renderTimeline(events) {
  if (isVisTimelineAvailable()) {
    renderVisTimeline(events, currentState?.meta);
  } else {
    destroyVisTimeline();
    renderStaticTimeline(events);
  }
}

function isVisTimelineAvailable() {
  return Boolean(window.vis && typeof window.vis.Timeline === "function" && typeof window.vis.DataSet === "function");
}

function renderVisTimeline(events, meta) {
  if (!timelineContainer) {
    return;
  }

  const { items, groups, range } = buildVisTimelineData(events, meta);

  if (!items.length) {
    destroyVisTimeline();
    timelineContainer.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "timeline-empty";
    empty.textContent = "No timeline data available.";
    timelineContainer.append(empty);
    return;
  }

  if (!visTimelineItems) {
    visTimelineItems = new vis.DataSet(items);
  } else {
    visTimelineItems.clear();
    visTimelineItems.add(items);
  }

  if (!visTimelineGroups) {
    visTimelineGroups = new vis.DataSet(groups);
  } else {
    visTimelineGroups.clear();
    visTimelineGroups.add(groups);
  }

  const options = buildVisTimelineOptions(range);

  if (!visTimelineInstance) {
    timelineContainer.innerHTML = "";
    visTimelineInstance = new vis.Timeline(timelineContainer, visTimelineItems, visTimelineGroups, options);
  } else {
    visTimelineInstance.setOptions(options);
    visTimelineInstance.setGroups(visTimelineGroups);
    visTimelineInstance.setItems(visTimelineItems);
  }
}

function destroyVisTimeline() {
  if (visTimelineInstance) {
    visTimelineInstance.destroy();
    visTimelineInstance = undefined;
  }
  visTimelineItems = undefined;
  visTimelineGroups = undefined;
}

function buildVisTimelineData(events, meta) {
  const grouped = groupEventsByDay(events);
  const items = [];
  const groups = [];
  let minDate = null;
  let maxDate = null;

  DAY_NAMES.forEach((dayName, dayPosition) => {
    const entry = grouped.get(dayName);
    if (!entry || !entry.events.length) {
      return;
    }

    const dayIndex = Number.isInteger(dayPosition) ? dayPosition : DAY_NAMES.indexOf(dayName);
    const fallbackDate =
      entry.date ||
      (meta?.weekStart && dayIndex >= 0
        ? toIsoDate(addDays(parseIsoDate(meta.weekStart), dayIndex))
        : undefined);
    const order = groups.length;
    groups.push({ id: dayName, content: formatDayHeading(fallbackDate, dayName), order });

    entry.events.forEach((event, index) => {
      const dateIso = event.date || fallbackDate;
      const startDate = createTimelineDate(dateIso, event.startMinutes);
      const endDate = createTimelineDate(dateIso, event.endMinutes);
      if (!startDate || !endDate) {
        return;
      }

      if (!minDate || startDate < minDate) {
        minDate = startDate;
      }
      if (!maxDate || endDate > maxDate) {
        maxDate = endDate;
      }

      const color = getActivityColor(event.activity);
      const textColor = event.activity.toLowerCase() === "free time" ? "#0f172a" : "#ffffff";

      items.push({
        id: `${dayName}-${index}-${event.startMinutes}`,
        start: startDate,
        end: endDate,
        group: dayName,
        content: capitalize(event.activity),
        activityLabel: capitalize(event.activity),
        timeRange: `${event.start} – ${event.end}`,
        style: `background-color: ${color}; border-color: ${color}; color: ${textColor};`,
        title: `${capitalize(event.activity)} · ${event.start} – ${event.end}`,
      });
    });
  });

  const range = {};
  if (meta?.weekStart) {
    range.min = createTimelineDate(meta.weekStart, 0);
  }
  if (meta?.weekEnd) {
    range.max = createTimelineDate(meta.weekEnd, 1440);
  }
  range.visibleStart = minDate || range.min;
  range.visibleEnd = maxDate || range.max;

  if (range.visibleStart && range.visibleEnd && range.visibleEnd.getTime() === range.visibleStart.getTime()) {
    range.visibleEnd = new Date(range.visibleEnd.getTime() + 60 * 60 * 1000);
  }

  return { items, groups, range };
}

function buildVisTimelineOptions(range) {
  const options = {
    stack: true,
    orientation: { axis: "top" },
    groupOrder: (a, b) => (a.order || 0) - (b.order || 0),
    margin: { item: { horizontal: 18, vertical: 12 }, axis: 18 },
    horizontalScroll: true,
    zoomKey: "ctrlKey",
    zoomMin: 60 * 1000,
    zoomMax: 14 * 24 * 60 * 60 * 1000,
    selectable: false,
    tooltip: { followMouse: true },
    template: (item) => {
      const title = item.activityLabel || item.content || "";
      const time = item.timeRange || "";
      return `<div class="timeline-item"><span class="timeline-item-title">${title}</span><span class="timeline-item-time">${time}</span></div>`;
    },
  };

  if (range?.min instanceof Date) {
    options.min = range.min;
  }
  if (range?.max instanceof Date) {
    options.max = range.max;
  }
  if (range?.visibleStart instanceof Date && range?.visibleEnd instanceof Date) {
    options.start = range.visibleStart;
    options.end = range.visibleEnd;
  }

  return options;
}

function createTimelineDate(dateIso, minutes = 0) {
  if (!dateIso || !Number.isFinite(minutes)) {
    return undefined;
  }
  const parts = dateIso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
    return undefined;
  }
  const [year, month, day] = parts;
  const base = new Date(Date.UTC(year, month - 1, day));
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function renderStaticTimeline(events) {
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
  calendar.addEventSource(calendarEvents);
  const focusDate = meta?.weekStart || calendarEvents[0]?.start?.slice(0, 10);
  if (focusDate) {
    calendar.gotoDate(focusDate);
  }
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
