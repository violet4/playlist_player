#!/usr/bin/env bash

poetry run uvicorn main:app --port 9170 --host 0.0.0.0
