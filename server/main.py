import os
from contextlib import contextmanager
import asyncio

import requests
from fastapi import FastAPI, HTTPException, Query, Depends, WebSocket
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import sessionmaker, declarative_base, Mapped, Session
from sqlalchemy.exc import NoResultFound

# Assume these modules are provided
from audio_player import AudioPlayer
from podcast_player import PodcastPlayer


# Database Setup
DATABASE_URL = "sqlite:///./podcast_player.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class EpisodePlayback(Base):
    __tablename__ = "episode_playback"
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    episode_number: Mapped[str] = Column(String, index=True)
    playback_position: Mapped[int] = Column(Integer, default=0)


Base.metadata.create_all(bind=engine)


class CurrentEpisodeRememberer:
    _episode_number_filepath = 'current_episode_number.txt'

    def __init__(self):
        if not os.path.exists(self._episode_number_filepath):
            self.set_episode_number(1)
        with open(self._episode_number_filepath, 'r') as fr:
            self._current_episode_number = int(fr.read())

    def set_episode_number(self, number: int):
        with open(self._episode_number_filepath, 'w') as fw:
            print(number, file=fw)

    @property
    def current_episode(self):
        return self._current_episode_number

    @current_episode.setter
    def current_episode(self, episode: int):
        self.set_episode_number(episode)
        self._current_episode_number = episode


# Download episodes
def download_episode(url: str) -> str:
    """Download an episode from a URL into a local 'episodes' folder."""
    filename = url.split('/')[-1]

    if not os.path.exists('episodes'):
        os.makedirs('episodes')

    file_path = os.path.join('episodes', filename)

    if not os.path.exists(file_path):
        # Download the file if it does not exist
        response = requests.get(url)
        response.raise_for_status()
        with open(file_path, 'wb') as f:
            f.write(response.content)

    return file_path


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_or_create_playback_record(db, episode_number):
    try:
        playback_record = db.query(EpisodePlayback).filter(EpisodePlayback.episode_number == episode_number).one()
    except NoResultFound:
        playback_record = EpisodePlayback(episode_number=episode_number)
        db.add(playback_record)
        db.commit()
        db.refresh(playback_record)
    return playback_record


with open('./your_playlist.m3u', 'r') as fr:
    podcast_playlist = PodcastPlayer(fr.read())


playback_rate: float = 1.0  # TODO: save in db and persist after restart?
cer = CurrentEpisodeRememberer()
episode = podcast_playlist.get_episode_info(cer.current_episode)
player = AudioPlayer(
    file_path=episode['file_path'],
    episode_number=episode['number'],
    title=episode['title'],
    description=episode['description'],
)


with contextmanager(get_db)() as db:
    db_rec = get_or_create_playback_record(db, cer.current_episode)
    print("db_rec.playback_position:", db_rec.playback_position)
    player.seek(int(db_rec.playback_position))


# FastAPI App
app = FastAPI()


# API Endpoints
@app.post("/play/{episode_number}")
def play_episode(episode_number: str, db: Session = Depends(get_db)):
    global player, cer, playback_rate
    episode_info = podcast_playlist.get_episode_info(int(episode_number))
    if not episode_info:
        raise HTTPException(status_code=404, detail="Episode not found")

    if player is not None and player.is_playing():
        player.pause()

    filepath = download_episode(episode_info['url'])
    player = AudioPlayer(filepath, int(episode_number), episode_info['title'], episode_info['description'])
    player.set_rate(playback_rate)
    player.play()

    playback_record = get_or_create_playback_record(db, episode_number)
    if playback_record.playback_position > 0:
        player.seek(int(playback_record.playback_position))

    cer.current_episode = int(episode_number)
    return player.get_status() 


@app.post("/pause")
def pause_playback(db: Session = Depends(get_db)):
    if player:
        player.pause()
        if cer.current_episode:
            playback_record = get_or_create_playback_record(db, cer.current_episode)
            playback_record.playback_position = player.get_current_position()
            db.commit()
        return player.get_status()


@app.post("/playpause")
def playpause_playback(db: Session = Depends(get_db)):
    if player:
        player.playpause()
        if cer.current_episode:
            playback_record = get_or_create_playback_record(db, cer.current_episode)
            playback_record.playback_position = player.get_current_position()
            db.commit()
        return player.get_status()


@app.post("/next")
def next_episode(db: Session = Depends(get_db)):
    if cer.current_episode:
        next_ep_num = str(int(cer.current_episode) + 1)
        return play_episode(next_ep_num, db)
    else:
        raise HTTPException(status_code=400, detail="No current episode")


@app.post("/previous")
def previous_episode(db: Session = Depends(get_db)):
    if cer.current_episode:
        prev_ep_num = str(max(1, int(cer.current_episode) - 1))
        return play_episode(prev_ep_num, db)
    else:
        raise HTTPException(status_code=400, detail="No current episode")


@app.post("/seek/{time}")
def seek_episode(time: int, db: Session = Depends(get_db)):
    if player:
        player.seek(time)
        if cer.current_episode:
            playback_record = get_or_create_playback_record(db, cer.current_episode)
            playback_record.playback_position = time
            db.commit()
        return player.get_status()


@app.post("/playback_rate/{rate}")
def set_playback_rate(rate: float=1.0):
    global playback_rate
    playback_rate = rate
    if player:
        player.set_rate(rate)
        return player.get_status()


@app.get("/episodes")
def list_episodes(page: int = Query(1, ge=1), per_page: int = Query(10, le=100)):
    episodes = podcast_playlist.list_episodes(page=page, per_page=per_page)
    return episodes


@app.websocket("/audio_position")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            position = player.get_current_position()
            await websocket.send_text(str(position))  # Send position as string
            await asyncio.sleep(0.5)
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await websocket.close()

