(function () {
  "use strict";

  function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function minutesToTime(value) {
    const minutes = ((Number(value) % 1440) + 1440) % 1440;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  function pickMk2EventField(event, keys) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(event, key)) {
        const value = event[key];
        if (value !== undefined && value !== null) {
          return value;
        }
      }
    }
    return undefined;
  }

  function mk2ToFlatEvents(list) {
    if (!Array.isArray(list)) {
      return [];
    }

    const normalizeLabel = (value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : "untitled";
      }
      if (Number.isFinite(value)) {
        return String(value);
      }
      if (value == null) {
        return "untitled";
      }
      try {
        const stringified = String(value).trim();
        return stringified.length ? stringified : "untitled";
      } catch (error) {
        return "untitled";
      }
    };

    const normalizeDate = (value) => {
      if (value == null) {
        return null;
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
      }
      if (value instanceof Date && !Number.isNaN(value.valueOf())) {
        return toIsoDate(value);
      }
      if (Number.isFinite(value)) {
        return String(value);
      }
      try {
        const stringified = String(value).trim();
        return stringified.length ? stringified : null;
      } catch (error) {
        return null;
      }
    };

    const normalizeTime = (value) => {
      if (value == null) {
        return null;
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
      }
      if (value instanceof Date && !Number.isNaN(value.valueOf())) {
        return value.toISOString();
      }
      if (Number.isFinite(value)) {
        return String(value);
      }
      if (typeof value === "object") {
        const hours = Number(
          value.hours ?? value.hour ?? value.h ?? value.H ?? value.Hour,
        );
        const minutes = Number(
          value.minutes ?? value.minute ?? value.m ?? value.M ?? value.Minute,
        );
        if (Number.isFinite(hours) && Number.isFinite(minutes)) {
          return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
        }
        if (typeof value.time === "string") {
          return value.time;
        }
        if (typeof value.start === "string") {
          return value.start;
        }
        if (typeof value.end === "string") {
          return value.end;
        }
      }
      try {
        const stringified = String(value).trim();
        return stringified.length ? stringified : null;
      } catch (error) {
        return null;
      }
    };

    const flattened = [];

    for (const raw of list) {
      if (raw == null) {
        continue;
      }

      const sourceEvent = typeof raw === "object" ? raw : { value: raw };
      const event = { ...sourceEvent };

      const labelCandidate = event.label ?? event.activity ?? event.name ?? "untitled";
      event.label = normalizeLabel(labelCandidate);

      const dayCandidate = event.day ?? event.date ?? event.day_index ?? null;
      event.day = normalizeDate(dayCandidate);

      const startCandidate = pickMk2EventField(event, [
        "start",
        "start_time",
        "startTime",
        "begin",
        "time",
        "start_at",
        "startAt",
        "minute_start",
        "minuteStart",
        "start_minutes",
        "startMinutes",
        "start_minute",
      ]);
      let startValue = normalizeTime(startCandidate);
      if (startValue == null && Object.prototype.hasOwnProperty.call(sourceEvent, "start")) {
        startValue = normalizeTime(sourceEvent.start);
      }

      const endCandidate = pickMk2EventField(event, [
        "end",
        "end_time",
        "endTime",
        "finish",
        "end_at",
        "endAt",
        "minute_end",
        "minuteEnd",
        "end_minutes",
        "endMinutes",
        "end_minute",
      ]);
      let endValue = normalizeTime(endCandidate);
      if (endValue == null && Object.prototype.hasOwnProperty.call(sourceEvent, "end")) {
        endValue = normalizeTime(sourceEvent.end);
      }

      const dateCandidate =
        event.date ?? sourceEvent.date ?? event.day ?? event.day_index ?? null;
      const normalizedDate = normalizeDate(dateCandidate);
      if (
        !Object.prototype.hasOwnProperty.call(event, "date") ||
        event.date == null ||
        event.date instanceof Date
      ) {
        event.date = normalizedDate;
      }

      event.start = startValue ?? null;
      event.end = endValue ?? null;

      flattened.push(event);
    }

    return flattened;
  }

  function coerceMk2Activity(event) {
    const candidates = [
      event.activity,
      event.activity_name,
      event.activityName,
      event.label,
      event.title,
      event.name,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length) {
        return candidate.trim();
      }
    }
    return "";
  }

  function coerceMk2Label(candidates) {
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length) {
        return candidate.trim();
      }
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return String(candidate);
      }
    }
    return "";
  }

  function coerceMk2IsoDate(value) {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) {
      return toIsoDate(value);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return "";
      }
      const [datePart] = trimmed.split("T");
      return datePart || trimmed;
    }
    return "";
  }

  function parseMk2TimeToMinutes(value) {
    if (typeof value !== "string") {
      return null;
    }
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      return null;
    }
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }
    return hours * 60 + minutes;
  }

  function addMinutesToTime(timeValue, minutesToAdd) {
    const startMinutes = parseMk2TimeToMinutes(timeValue);
    const duration = Number(minutesToAdd);
    if (!Number.isFinite(startMinutes) || !Number.isFinite(duration)) {
      return null;
    }
    const total = startMinutes + duration;
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function differenceBetweenTimes(startTime, endTime) {
    const startMinutes = parseMk2TimeToMinutes(startTime);
    const endMinutes = parseMk2TimeToMinutes(endTime);
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
      return null;
    }
    let diff = endMinutes - startMinutes;
    if (diff <= 0) {
      diff += 24 * 60;
    }
    return diff > 0 ? diff : null;
  }

  function coerceMk2Time(value) {
    if (value == null) {
      return null;
    }

    if (value instanceof Date && !Number.isNaN(value.valueOf())) {
      return `${String(value.getHours()).padStart(2, "0")}:${String(
        value.getMinutes(),
      ).padStart(2, "0")}`;
    }

    if (typeof value === "object") {
      const hours = Number(
        value.hours ?? value.hour ?? value.h ?? value.H ?? value.Hour,
      );
      const minutes = Number(
        value.minutes ?? value.minute ?? value.m ?? value.M ?? value.Minute,
      );
      if (Number.isFinite(hours) && Number.isFinite(minutes)) {
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      }
      if (typeof value.time === "string") {
        return coerceMk2Time(value.time);
      }
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return minutesToTime(Math.round(value));
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      if (trimmed.includes("T")) {
        const [, timePart = ""] = trimmed.split("T");
        return coerceMk2Time(timePart);
      }

      const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (hhmm) {
        const hours = Number.parseInt(hhmm[1], 10);
        const minutes = Number.parseInt(hhmm[2], 10);
        if (Number.isFinite(hours) && Number.isFinite(minutes)) {
          return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
        }
      }

      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        const absolute = Math.abs(numeric);
        if (absolute <= 24 && trimmed.includes(".")) {
          return minutesToTime(Math.round(numeric * 60));
        }
        return minutesToTime(Math.round(numeric));
      }
    }

    return null;
  }

  function coerceMk2DurationMinutes(value) {
    if (value == null) {
      return null;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (hhmm) {
        const hours = Number.parseInt(hhmm[1], 10);
        const minutes = Number.parseInt(hhmm[2], 10);
        if (Number.isFinite(hours) && Number.isFinite(minutes)) {
          return hours * 60 + minutes;
        }
      }
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }

    if (typeof value === "object") {
      const minutes = Number(
        value.minutes ?? value.minute ?? value.mins ?? value.duration ?? value.value,
      );
      if (Number.isFinite(minutes)) {
        return minutes;
      }
      const hours = Number(value.hours ?? value.hour);
      if (Number.isFinite(hours)) {
        return hours * 60;
      }
    }

    return null;
  }

  function buildMk2MinuteRange(event, normalized) {
    const dayIndex = Number(event.day_index ?? event.dayIndex);
    const startMinutesCandidate = pickMk2EventField(event, [
      "start_minutes",
      "start_minute",
      "minute_start",
    ]);
    const endMinutesCandidate = pickMk2EventField(event, [
      "end_minutes",
      "end_minute",
      "minute_end",
    ]);

    const startMinutes = Number(startMinutesCandidate);
    let endMinutes = Number(endMinutesCandidate);

    if (Number.isFinite(startMinutes) && !Number.isFinite(endMinutes)) {
      const duration = Number(normalized.duration_minutes);
      if (Number.isFinite(duration) && duration > 0) {
        endMinutes = startMinutes + duration;
      }
    }

    if (
      Number.isFinite(dayIndex) &&
      Number.isFinite(startMinutes) &&
      Number.isFinite(endMinutes)
    ) {
      const startAbsolute = dayIndex * 1440 + startMinutes;
      let endAbsolute = dayIndex * 1440 + endMinutes;
      if (endAbsolute <= startAbsolute) {
        const duration = Number(normalized.duration_minutes);
        if (Number.isFinite(duration) && duration > 0) {
          endAbsolute = startAbsolute + duration;
        }
      }
      if (endAbsolute > startAbsolute) {
        return [startAbsolute, endAbsolute];
      }
    }

    return null;
  }

  function normalizeMk2Events(rawEvents) {
    const flattened = mk2ToFlatEvents(Array.isArray(rawEvents) ? rawEvents : []);
    const normalized = [];

    flattened.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") {
        return;
      }

      const event = { ...raw };

      const activity = coerceMk2Activity(raw);
      if (activity) {
        event.activity = activity;
      }

      event.label = coerceMk2Label([
        event.label,
        event.activity,
        raw.title,
        raw.name,
        typeof raw.value === "string" ? raw.value : "",
        `Event ${index + 1}`,
      ]);

      const dateCandidate = pickMk2EventField(raw, [
        "date",
        "day",
        "day_name",
        "dayName",
      ]);
      const normalizedDate = coerceMk2IsoDate(
        dateCandidate ?? raw.date ?? raw.day ?? event.date,
      );
      if (normalizedDate) {
        event.date = normalizedDate;
      }
      if (!event.day && normalizedDate) {
        event.day = normalizedDate;
      }

      const startCandidate = pickMk2EventField(raw, [
        "start",
        "start_time",
        "startTime",
        "begin",
        "time",
        "start_at",
        "startAt",
        "minute_start",
        "minuteStart",
        "start_minutes",
        "startMinutes",
        "start_minute",
      ]);
      const endCandidate = pickMk2EventField(raw, [
        "end",
        "end_time",
        "endTime",
        "finish",
        "end_at",
        "endAt",
        "minute_end",
        "minuteEnd",
        "end_minutes",
        "endMinutes",
        "end_minute",
      ]);

      let startValue = coerceMk2Time(startCandidate ?? raw.start ?? event.start);
      let endValue = coerceMk2Time(endCandidate ?? raw.end ?? event.end);

      event.start = startValue ?? null;
      event.end = endValue ?? null;

      let duration = coerceMk2DurationMinutes(
        pickMk2EventField(raw, [
          "duration_minutes",
          "duration",
          "minutes",
          "minute_duration",
          "length_minutes",
          "length",
          "durationMinutes",
        ]),
      );
      if (!Number.isFinite(duration)) {
        duration = coerceMk2DurationMinutes(event.duration_minutes);
      }
      if (!Number.isFinite(duration)) {
        const diff = differenceBetweenTimes(startValue, endValue);
        if (Number.isFinite(diff)) {
          duration = diff;
        }
      }

      if (Number.isFinite(duration) && duration > 0) {
        event.duration_minutes = Math.round(duration);
      } else {
        delete event.duration_minutes;
      }

      if (!endValue && startValue && Number.isFinite(duration) && duration > 0) {
        endValue = addMinutesToTime(startValue, duration);
        event.end = endValue;
      }

      if (typeof event.start === "string") {
        event.start_time = event.start;
      }
      if (typeof event.end === "string") {
        event.end_time = event.end;
      }

      const minuteRange = buildMk2MinuteRange(raw, event);
      if (minuteRange) {
        event.minute_range = minuteRange;
        event.minuteRange = minuteRange;
      } else if (Number.isFinite(duration) && duration > 0) {
        const startMinutes = parseMk2TimeToMinutes(event.start);
        if (Number.isFinite(startMinutes)) {
          const derivedRange = [startMinutes, startMinutes + Math.round(duration)];
          event.minute_range = derivedRange;
          event.minuteRange = derivedRange;
        }
      }

      normalized.push(event);
    });

    return normalized;
  }

  if (typeof globalThis.normalizeMk2Events !== "function") {
    globalThis.normalizeMk2Events = normalizeMk2Events;
  }
})();
