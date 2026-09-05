"""flock: a synthetic population of people with calendars, sleep, meals and free time,
for AI-agent swarms to observe, ping and book.  Entry point: flock.world.World."""
from .world import World
from .agent_api import Slot, Observation, PingHandle, Reply
