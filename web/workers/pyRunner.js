const respond = (id, data) => {
  self.postMessage({ id, ...data });
};

self.onmessage = (event) => {
  const message = event?.data || {};
  const { id, type } = message;
  if (typeof id === 'undefined') {
    return;
  }

  const post = (payload) => {
    respond(id, payload);
  };

  if (type === 'load') {
    post({ ok: true, event: 'load' });
    return;
  }

  if (type === 'run') {
    const { fn, args = {} } = message;
    const mock = (label = 'Work') => ({
      schema_version: 'web_v1_calendar',
      week_start: args.week_start,
      events: [
        { date: args.week_start, start: '09:00', end: '11:00', label, activity: 'work' },
        { date: args.week_start, start: '12:00', end: '13:00', label: 'Lunch', activity: 'meal' },
        { date: args.week_start, start: '23:00', end: '07:00', label: 'Sleep', activity: 'sleep' },
      ],
      issues: [],
      metadata: { engine: fn },
    });

    if (fn === 'mk1_run') {
      post({ ok: true, result: mock('MK1 Work'), logs: [`mock run ${fn}`] });
      return;
    }
    if (fn === 'mk2_run_calendar') {
      post({ ok: true, result: mock('MK2 Work'), logs: [`mock run ${fn}`] });
      return;
    }
    if (fn === 'mk2_run_workforce') {
      post({ ok: true, result: mock('MK2 Workforce Work'), logs: [`mock run ${fn}`] });
      return;
    }

    post({ ok: false, error: `Unknown worker function: ${String(fn)}` });
    return;
  }

  post({ ok: false, event: type, error: `Unknown message type: ${String(type)}` });
};
