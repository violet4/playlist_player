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
* Bookmarks: ability to mark an arbitrary point in time in an episode and write a custom note, e.g. "the first time they mentioned a specific 0-day vulnerability on macOS". The desire is to be able to add notes to arbitrary points in time within an episode, but we will start with per-episode notes. The user can manually type in points in time of the episode into the note such as "5:32".
* Search/Filter episode navigator by title, description, custom notes

### Side Features

* Keyboard shortcuts
* A survey asking (potential) users what features they are interested in: deal breakers, priority list, etc.

## Contributing

The best way to get things moving forward is to star the project and [create an issue](https://github.com/violet4/playlist_player/issues/new) with a feature request or bug report.

This project is very new. PRs are unlikely to get merged unless they are typo fixes, very limited and clear in scope, or explicitly requested.

## Documentation

None yet, but there's an [introduction on my blog](https://violeteldridge.com/game/gw10/).

## Privacy

Privacy is one of the highest priorities of this app. This app:

* Will never make a single API call or HTTP request outside of the app.
* It will never integrate scripts, icons, or fonts from any external sources.
* It will never use any CDNs for any content.
* It will never use tracking pixels or tracking/analytics/telemetry data for ANY purpose, EVER.

If you find your copy of the podcast player, server or client, to go against any of these claims, then you do not have a genuine copy. Ensure that you always get your copy from the GitHub, <https://github.com/violet4/playlist_player>

I will never give over control of this repository to someone I don't absolutely trust with the privacy of their users.

A result of this hyper caution on privacy means that it's up to you, the user, to report any and all bugs and issues you experience. Many small and independent developers turn to telemetry tools because they don't have the time to implement their own telemetry and because they want to make their app "just work" for their users without fuss. To me, privacy is paramount.

IF this application ever has telemetry, it will be fully homegrown (no external libraries or services used to implement it); it will be OFF by default and require INFORMED CONSENT for opt-in. Even then, it will ONLY record locally and require explicit export for the user to send/share with the developer. It will also be fully 100% self-documenting such that you can clearly see exactly what it will record before and during recording.

However, due to concerns of trust of privacy-focused individuals, it is likely that even if/when this app grows that telemetry will never be implemented, because even having it in the app leads to the question, "will the developer subvert our trust and turn it on by default without sufficient warning?"

### My Commitment

I, Violet, promise:

* To protect user privacy as the highest priority
* Users will maintain direct control over privacy-related decisions
* To never compromise these principles for convenience, even if it is to my or the app's perceived detriment
* To build and maintain user trust through consistent adherence to these standards

## Development Setup

After cloning the repository, install development dependencies:

    poetry install --group=dev

Enable Git hooks:

    git config core.hooksPath .githooks

This will cause your `git commit` to automatically invoke `cz` (commitizen) with helpful custom prompt messages, helping you make commit messages that are simultaneously machine- and human-friendly.

## Credits

* The lovely FOSS libraries being used (see `pyproject.toml` and `client/package.json` if you want to see the list of packages)
* Steve Gibson and Leo Laporte of the `Security Now!` podcast who inspired the creation of this project

## Additional Notes

Started 2024-10-25.
