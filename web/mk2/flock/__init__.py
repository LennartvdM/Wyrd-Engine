"""flock: a synthetic population of people with calendars, sleep, meals and free time,
for AI-agent swarms to observe, ping and book.  Entry point: World(seed=1, n=200)."""
from .world import World
from .agent_api import Slot, Observation, PingHandle, Reply

__all__ = ["World", "Slot", "Observation", "PingHandle", "Reply"]
