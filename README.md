# Podcast Player

A playlist generator, manager, and player.

## Install and Run

### Backend

In one terminal tab, start the backend/server:

```
poetry install
poetry run uvicorn --port 9170 server.main:app
```

### Frontend

In another terminal tab, start the frontend/client:

```
cd client
npm install
npm run dev
```

### Visit in your web browser

<http://localhost:5173/>

## Contributing

TODO. If you want to contribute, create an [issue](issues) and we'll bump up priority.

## Documentation

None yet, but I'll be writing an introductory blog post shortly (this evening) with some screenshots.

## Credits

None yet, other than the lovely libraries being used (see `pyproject.toml` and `client/package.json` if you want to see the list of packages), along with HLS/ffmpeg.

## Additional Notes

Started 2024-10-25.
