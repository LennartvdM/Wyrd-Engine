"""One independent random stream per (seed, label...), so adding a person, a household
or a ping never disturbs anyone else's draws."""
import hashlib
import random


def stream(seed, *labels):
    key = f"{seed}|" + "|".join(map(str, labels))
    return random.Random(int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], "big"))
