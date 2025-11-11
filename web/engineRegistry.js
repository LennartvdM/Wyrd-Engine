import { calendarFoundation } from "./classes/calendar/foundation.js";

export const engineRegistry = {
  classes: {
    calendar: {
      title: "Calendar",
      foundation: calendarFoundation,
      variants: {
        mk1: { title: "MK1", rigs: { default: { title: "Default" } } },
        mk2: {
          title: "MK2",
          rigs: {
            calendar: { title: "Calendar" },
            workforce: { title: "Workforce" }
          }
        }
      }
    }
  }
};
