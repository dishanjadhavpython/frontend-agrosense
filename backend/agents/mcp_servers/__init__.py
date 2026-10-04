"""The research agent's MCP servers, each run as its own subprocess.

One thing is set for all of them here, because it is a leak rather than a
preference: `httpx` logs every request URL at INFO, and two of these servers
used to carry their API keys in the query string (YouTube's `key=`, and
data.gov.in's `api-key=`, which that API accepts no other way). Those lines
went to the subprocess's stderr, which is the service's log — CloudWatch, on
AWS. Request URLs stay out of the logs; failures are still reported by each
tool in its own return value.
"""
import logging

for _name in ("httpx", "httpcore"):
    logging.getLogger(_name).setLevel(logging.WARNING)
