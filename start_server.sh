#!/usr/bin/env bash
poetry run uvicorn --port 9170 server.main:app --reload
