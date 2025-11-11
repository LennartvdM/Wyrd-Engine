const MS_IN_DAY = 24 * 60 * 60 * 1000;

function currentMondayISO() {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const diff = utcDay === 0 ? -6 : 1 - utcDay;
  const mondayUtcTimestamp = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ) + diff * MS_IN_DAY;
  return new Date(mondayUtcTimestamp).toISOString().slice(0, 10);
}

function deterministicSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export const calendarFoundation = {
  id: "calendar",
  schema: "web_v1_calendar",
  defaults({ variant, rig }) {
    return {
      archetype: "Office",
      weekStart: currentMondayISO(),
      seed: deterministicSeed(`${variant}:${rig}:${currentMondayISO()}`),
      budget: null
    };
  },
  budgetDefault: () => ({
    hours: { work: 1800, sleep: 2800, caregiving: 250, vacation: 120, sick: 40 }
  }),
  runners: {
    mk1: { default: "mk1_run" },
    mk2: { calendar: "mk2_run_calendar", workforce: "mk2_run_workforce" }
  }
};

export { currentMondayISO, deterministicSeed };
