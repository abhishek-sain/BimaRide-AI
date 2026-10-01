"""A logger factory that's actually guaranteed to print.

Plain `logging.getLogger(name)` isn't enough under `uvicorn --reload`:
uvicorn's own logging setup runs `dictConfig` with `disable_existing_loggers`
defaulting to True, which silently sets `.disabled = True` on any logger
that already existed in the registry at that point and isn't explicitly
named in uvicorn's config — including ours, depending on import order
relative to uvicorn's startup sequence. A disabled logger drops every
call before it even reaches a handler, so `logger.warning(...)` can run
with no error and simply never appear anywhere. That's exactly what
happened to services/push.py and services/notifications.py's warnings:
correct code, invisible output, which made the earlier Twilio debugging
session slower than it needed to be.

This explicitly re-enables the logger and gives it its own handler
instead of relying on root propagation, so it can't be silenced by
whatever uvicorn (or anything else) does to the logging config around it.
"""

import logging


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.disabled = False
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(name)s %(levelname)s: %(message)s"))
        logger.addHandler(handler)
    return logger
