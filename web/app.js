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

const configInput = document.querySelector("#config-input");
const form = document.querySelector("#config-form");
const formError = document.querySelector("#form-error");
const resultsSection = document.querySelector("#results");
const totalsContainer = document.querySelector("#totals");
const timelineContainer = document.querySelector("#timeline");
const eventTable = document.querySelector("#event-table");
const jsonOutput = document.querySelector("#json-output");
const downloadButton = document.querySelector("#download-json");
const startDateInput = document.querySelector("#start-date");

configInput.value = JSON.stringify(DEFAULT_CONFIG, null, 2);

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
    const { events, totals } = generateSchedule(config, startDate);
    renderTotals(totals);
    renderTimeline(events);
    renderEventTable(events);
    renderJson(events);
    enableDownload(events, config.name);
    resultsSection.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    formError.textContent = error.message || "Failed to generate schedule.";
  }
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

function slugify(value) {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderTotals(totals) {
  totalsContainer.innerHTML = "";
  Object.entries(totals)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([activity, hours]) => {
      const chip = document.createElement("span");
      chip.className = "total-chip";
      chip.textContent = `Total ${activity}: ${hours.toFixed(1)} h`;
      totalsContainer.append(chip);
    });
}

function renderTimeline(events) {
  timelineContainer.innerHTML = "";
  const grouped = groupByDay(events);
  const template = document.querySelector("#day-template");

  for (const dayName of DAY_NAMES) {
    const dayEvents = grouped.get(dayName) || [];
    const fragment = template.content.cloneNode(true);
    const daySection = fragment.querySelector(".day");
    const heading = fragment.querySelector(".day-heading");
    const dayTimeline = fragment.querySelector(".day-timeline");

    heading.textContent = formatDayHeading(dayEvents[0]?.date, dayName);
    addTimelineScale(dayTimeline);

    dayEvents
      .filter((event) => event.activity !== "free time")
      .forEach((event) => {
        const block = document.createElement("div");
        block.className = "timeline-block";
        block.dataset.activity = event.activity;
        block.textContent = event.activity;
        block.title = `${event.activity}: ${event.start} – ${event.end}`;
        const offset = (event.startMinutes / 1440) * 100;
        const span = (event.duration_minutes / 1440) * 100;
        block.style.setProperty("--offset", offset.toString());
        block.style.setProperty("--span", span.toString());
        block.style.left = `${offset}%`;
        block.style.width = `${span}%`;
        block.style.background = getActivityColor(event.activity);
        dayTimeline.append(block);
      });

    timelineContainer.append(fragment);
  }
}

function renderEventTable(events) {
  eventTable.innerHTML = "";
  const grouped = groupByDay(events);
  const rowTemplate = document.querySelector("#event-row-template");

  for (const dayName of DAY_NAMES) {
    const dayEvents = grouped.get(dayName) || [];
    if (!dayEvents.length) {
      continue;
    }

    const group = document.createElement("section");
    group.className = "event-group";
    const heading = document.createElement("h3");
    heading.textContent = formatDayHeading(dayEvents[0].date, dayName);
    group.append(heading);

    const body = document.createElement("div");
    body.className = "event-group-body";

    dayEvents.forEach((event) => {
      const fragment = rowTemplate.content.cloneNode(true);
      fragment.querySelector(".event-time").textContent = `${event.start} – ${event.end}`;
      fragment.querySelector(".event-activity").textContent = event.activity;
      fragment.querySelector(".event-duration").textContent = `${event.duration_minutes} min`;
      body.append(fragment);
    });

    group.append(body);
    eventTable.append(group);
  }
}

function renderJson(events) {
  jsonOutput.textContent = JSON.stringify(events, null, 2);
}

function addTimelineScale(container) {
  const scale = document.createElement("div");
  scale.className = "timeline-scale";
  scale.dataset.start = "00:00";
  scale.dataset.end = "24:00";
  const marker = document.createElement("div");
  marker.style.position = "absolute";
  marker.style.top = "50%";
  marker.style.left = "50%";
  marker.style.transform = "translate(-50%, -50%)";
  marker.style.fontSize = "0.75rem";
  marker.style.color = "rgba(15, 23, 42, 0.5)";
  marker.textContent = "12:00";
  container.append(scale, marker);
}

function groupByDay(events) {
  const grouped = new Map();
  events.forEach((event) => {
    if (!grouped.has(event.day)) {
      grouped.set(event.day, []);
    }
    grouped.get(event.day).push(event);
  });
  return grouped;
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

  return { events, totals: totalsHours };
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
