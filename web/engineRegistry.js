import { calendarFoundation } from "./classes/calendar/foundation.js";

export const engineRegistry = {
  classes: {
    calendar: {
      title: "Visuals",
      foundation: calendarFoundation,
      variants: {
        mk1: { title: "MK1", rigs: { default: { title: "Default" } } },
        mk2: {
          title: "MK2",
          rigs: {
            calendar: { title: "Visuals" },
            workforce: { title: "Workforce" }
          }
        },
        mk2_1: {
          title: "MK2.1 (lossless share)",
          rigs: {
            calendar: { title: "Visuals" },
            workforce: { title: "Workforce" }
          }
        }
      }
    }
  }
};
