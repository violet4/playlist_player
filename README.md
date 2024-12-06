# Podcast Player

A playlist generator, manager, and player.

See the [introduction on my blog](https://violeteldridge.com/game/gw10/).

## Install and Run

This is a brand-new project (2024-10-26). If you run into any issues getting it installed and running, please [create an issue](https://github.com/violet4/playlist_player/issues/new) and we'll prioritize making the application easier to install.

First, choose a directory to download this repository. You'll need [Git](https://git-scm.com/downloads). Open the command line and `cd` to the directory where you want the project:

`git clone git@github.com:violet4/playlist_player.git`

Then `cd playlist_player`.

### Backend

I highly recommend using [Poetry](https://python-poetry.org/) for managing Python environments and libraries. I've run into issues installing Poetry system-wide, so I recommend using their installer script to install under your user.

In one terminal tab, start the backend/server:

```
poetry install
./start_server.sh
```

### Frontend

You'll need NPM; you should be able to easily get it for your system. See <https://nodejs.org/en/download/package-manager> for details. If you need any help, [create an issue](https://github.com/violet4/playlist_player/issues/new).

In another terminal tab, start the frontend/client:

```
cd client
npm install
npm run dev
```

### Visit in your web browser

<http://localhost:5173/>

## Roadmap

* Finish getting the basic audio listening capabilities super speedy and responsive
* Refactor/minimize the code and delete all cruft to minimize bugs and potential stability issues
* Episode Navigator
* Ability to listen to other shows (XML-based RSS)
* Bookmarks: ability to mark an arbitrary point in time in an episode and write a custom note, e.g. "the first time they mentioned a specific 0-day vulnerability on macOS"

### Side Features

* Keyboard shortcuts
* A survey asking (potential) users what features they are interested in: deal breakers, priority list, etc.

## Contributing

The best way to get things moving forward is to star the project and [create an issue](https://github.com/violet4/playlist_player/issues/new) with a feature request or bug report.

This project is very new. PRs are unlikely to get merged unless they are typo fixes, very limited and clear in scope, or explicitly requested.

## Documentation

None yet, but there's an [introduction on my blog](https://violeteldridge.com/game/gw10/).

## Credits

* The lovely FOSS libraries being used (see `pyproject.toml` and `client/package.json` if you want to see the list of packages)
* Steve Gibson and Leo Laporte of the `Security Now!` podcast who inspired the creation of this project

## Additional Notes

Started 2024-10-25.
