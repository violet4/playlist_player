import os
from contextlib import contextmanager
import asyncio
from typing import Optional

from pydub import AudioSegment

import requests
from fastapi import FastAPI, HTTPException, Query, Depends, WebSocket, Response
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import sessionmaker, declarative_base, Mapped, Session
from sqlalchemy.exc import NoResultFound
from tinytag import TinyTag

from .podcast_player import PodcastPlayer


# Database Setup
DATABASE_URL = "sqlite:///./server/podcast_player.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

this_dir = os.path.dirname(os.path.abspath(__file__))
episodes_directory = os.path.join(this_dir, 'episodes')


class EpisodePlayback(Base):
    __tablename__ = "episode_playback"
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    episode_number: Mapped[str] = Column(String, index=True)
    playback_position: Mapped[int] = Column(Integer, default=0)


Base.metadata.create_all(bind=engine)


class CurrentEpisodeRememberer:
    _episode_number_filepath = os.path.join(this_dir, 'current_episode_number.txt')

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

    if not os.path.exists(episodes_directory):
        os.makedirs(episodes_directory)

    file_path = os.path.join(episodes_directory, filename)

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


def get_or_create_playback_record(db: Session, episode_number: int):
    try:
        playback_record = db.query(EpisodePlayback).filter(EpisodePlayback.episode_number == episode_number).one()
    except NoResultFound:
        playback_record = EpisodePlayback(episode_number=episode_number)
        db.add(playback_record)
        db.commit()
        db.refresh(playback_record)
    return playback_record


with open('./security_now_podcast.m3u8', 'r') as fr:
    podcast_playlist = PodcastPlayer(fr.read())


playback_rate: float = 1.0  # TODO: save in db and persist after restart?
cer = CurrentEpisodeRememberer()
episode = podcast_playlist.get_episode_info(cer.current_episode)

with contextmanager(get_db)() as db:
    db_rec = get_or_create_playback_record(db, cer.current_episode)
    print("db_rec.playback_position:", db_rec.playback_position)


# FastAPI App
app = FastAPI()


# API Endpoints
@app.post("/play/{episode_number}")
def play_episode(episode_number: str, db: Session = Depends(get_db)):
    global player, cer, playback_rate
    episode_info = podcast_playlist.get_episode_info(int(episode_number))
    if not episode_info:
        raise HTTPException(status_code=404, detail="Episode not found")

    filepath = download_episode(episode_info['url'])

    playback_record = get_or_create_playback_record(db, episode_number)

    cer.current_episode = int(episode_number)


@app.get("/current")
def get_current_episode(db: Session = Depends(get_db), episode_number: Optional[int] = Query(None)):
    if not isinstance(episode_number, int):
        episode_number = cer.current_episode
    if episode_number:
        db_rec = get_or_create_playback_record(db, episode_number)
        episode_info = podcast_playlist.get_episode_info(episode_number)
        episode_info.update({
            'current_time': db_rec.playback_position,
            'episode_number': episode_number,
        })
        return episode_info
    else:
        raise HTTPException(status_code=400, detail="No current episode")


@app.put("/current/{episode_number}")
def new_current_episode(episode_number: int, db: Session = Depends(get_db)):
    cer.current_episode = episode_number
    return get_current_episode(db, episode_number)


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


@app.get("/episodes")
def list_episodes(page: int = Query(1, ge=1), per_page: int = Query(10, le=100)):
    episodes = podcast_playlist.list_episodes(page=page, per_page=per_page)
    return episodes


@app.put("/audio_position/{episode_number}/{playback_position}")
def update_playback_position(episode_number: int, playback_position: int, db: Session = Depends(get_db)):
    db_rec = get_or_create_playback_record(db, episode_number)
    db_rec.playback_position = playback_position
    db.commit()
    return get_current_episode(db, episode_number)


@app.websocket("/audio_position")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    prev_position = 0
    prev_episode = 0
    db_rec = get_or_create_playback_record(db, 1)
    await websocket.accept()
    try:
        while True:
            content = await websocket.receive_text()
            if content.strip() == 'close':
                break
            episode, position = map(int, (await websocket.receive_text()).split(','))
            if episode != prev_episode:
                prev_episode = episode
                db_rec = get_or_create_playback_record(db, episode)
            if position != prev_position:
                prev_position = position
                db_rec.playback_position = position
                db.commit()
            # await websocket.send_text(str(position))  # Send position as string
            # await asyncio.sleep(0.1)
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await websocket.close()


current_audio: AudioSegment | None = None
current_episode_name: str | None = None
SEGMENT_DURATION = 10 * 1000  # 10 seconds in milliseconds


def load_audio_stream(episode_name: str) -> AudioSegment:
    global current_audio, current_episode_name
    if current_audio is None or current_episode_name != episode_name:
        episode_path = os.path.join("server", "episodes", f"{episode_name}.mp3")
        current_audio = AudioSegment.from_mp3(episode_path)
        current_episode_name = episode_name
    return current_audio


def get_mp3_duration(filepath):
    tag = TinyTag.get(filepath)
    return tag.duration * 1000

from threading import Thread

@app.get("/episodes/{episode_name}.m3u8")
async def get_playlist(episode_name: str) -> Response:
    global current_audio

    episode_path = os.path.join("server", "episodes", f"{episode_name}.mp3")
    if not os.path.exists(episode_path):
        episode_number = int(episode_name.lstrip('sn0'))
        episode_info = podcast_playlist.get_episode_info(episode_number)
        download_episode(episode_info['url'])
        load_audio_stream(episode_name)
    else:
        # load audio in the background and return the m3u8 file immediately
        thread = Thread(target=load_audio_stream, args=(episode_name,), daemon=True)
        thread.start()

    filepath = os.path.join('server', 'episodes', f'{episode_name}.mp3')
    duration = int(get_mp3_duration(filepath))
    num_segments = duration // SEGMENT_DURATION + (1 if duration % SEGMENT_DURATION else 0)

    playlist = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n\n"
    for i in range(num_segments):
        playlist += f"#EXTINF:10.0,\n{episode_name}-{i:03d}.ts\n"
    playlist += "#EXT-X-ENDLIST"

    return Response(content=playlist, media_type="application/vnd.apple.mpegurl")


@app.get("/episodes/{segment_name}.ts")
async def get_segment(segment_name: str) -> Response:
    global current_audio
    episode_name, segment_number_str = segment_name.split("-")
    segment_number = int(segment_number_str)
    load_audio_stream(episode_name)

    start_time = segment_number * SEGMENT_DURATION
    end_time = min((segment_number + 1) * SEGMENT_DURATION, len(current_audio))

    segment = current_audio[start_time:end_time]

    audio_data = segment.export(format="adts").read()
    return Response(content=audio_data, media_type="video/mp2t")

