import os
from contextlib import contextmanager
import asyncio
from typing import Optional, Dict, List
import io
import threading
from queue import Queue
import time
from concurrent.futures import ThreadPoolExecutor
from functools import partial

from pydub import AudioSegment

import requests
from fastapi import FastAPI, HTTPException, Query, Depends, WebSocket, Response
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import sessionmaker, declarative_base, Mapped, Session
from sqlalchemy.exc import NoResultFound
from tinytag import TinyTag
from pydantic import BaseModel

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


class AudioCache:
    def __init__(self, max_episodes: int = 6):
        self.max_episodes = max_episodes
        self.cache: Dict[str, AudioSegment] = {}
        self.access_times: Dict[str, float] = {}
        self.loading_queue: Queue = Queue()
        self.loading_threads: Dict[str, threading.Thread] = {}
        self.lock = threading.Lock()
        self.background_loader = threading.Thread(target=self._background_loading_worker, daemon=True)
        self.background_loader.start()

    def _background_loading_worker(self):
        while True:
            episode_name = self.loading_queue.get()
            if episode_name is None:
                break

            try:
                filepath = os.path.join("server", "episodes", f"{episode_name}.mp3")
                audio = AudioSegment.from_mp3(filepath)
                with self.lock:
                    if len(self.cache) >= self.max_episodes:
                        # Remove least recently used episode
                        lru_episode = min(self.access_times.items(), key=lambda x: x[1])[0]
                        del self.cache[lru_episode]
                        del self.access_times[lru_episode]

                    self.cache[episode_name] = audio
                    self.access_times[episode_name] = time.time()
                    if episode_name in self.loading_threads:
                        del self.loading_threads[episode_name]
            except Exception as e:
                print(f"Error loading episode {episode_name}: {e}")

            self.loading_queue.task_done()

    def get_segment(self, episode_name: str, start_second: int, duration: int = 10) -> AudioSegment:
        with self.lock:
            self.access_times[episode_name] = time.time()
            if episode_name in self.cache:
                audio = self.cache[episode_name]
                print("audio segment was in the cache")
                return audio[start_second * 1000:(start_second + duration) * 1000]

        # If not in cache, load directly from file
        filepath = os.path.join("server", "episodes", f"{episode_name}.mp3")
        segment = AudioSegment.from_file(
            filepath,
            format="mp3",
            start_second=start_second,
            duration=duration,
        )
        print("loaded audio segment directly from filesystem")

        # Start background loading if not already loading
        if (episode_name not in self.loading_threads and
            episode_name not in self.cache):
            print("queueing loading whole episode to memory")
            self.queue_episode_loading(episode_name)

        return segment

    def queue_episode_loading(self, episode_name: str):
        if (episode_name not in self.loading_threads and
            episode_name not in self.cache):
            self.loading_queue.put(episode_name)
            self.loading_threads[episode_name] = threading.current_thread()

    def is_episode_loaded(self, episode_name: str) -> bool:
        return episode_name in self.cache

    def clear(self):
        with self.lock:
            self.cache.clear()
            self.access_times.clear()
            self.loading_threads.clear()


class DownloadCache:
    def __init__(self, download_dir: str, max_concurrent_downloads: int = 2):
        self.download_dir = download_dir
        self.executor = ThreadPoolExecutor(max_workers=max_concurrent_downloads)
        self.downloading: Dict[str, bool] = {}
        self.lock = threading.Lock()

    async def ensure_episode_downloaded(self, episode_url: str, filename: str) -> str:
        filepath = os.path.join(self.download_dir, filename)

        if os.path.exists(filepath):
            return filepath

        with self.lock:
            if filename in self.downloading:
                return filepath
            self.downloading[filename] = True

        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                partial(self._download_file, episode_url, filepath)
            )
        finally:
            with self.lock:
                if filename in self.downloading:
                    del self.downloading[filename]

        return filepath

    def _download_file(self, url: str, filepath: str):
        response = requests.get(url)
        response.raise_for_status()
        with open(filepath, 'wb') as f:
            f.write(response.content)


audio_cache = AudioCache(max_episodes=3)
download_cache = DownloadCache(
    download_dir=os.path.join("server", "episodes"),
    max_concurrent_downloads=2,
)


async def prefetch_next_episode(episode_number: int):
    """Prefetch the next episode in the background."""
    next_episode = episode_number + 1
    episode_info = podcast_playlist.get_episode_info(next_episode)
    if episode_info:
        filename = episode_info['url'].split('/')[-1]
        await download_cache.ensure_episode_downloaded(episode_info['url'], filename)
        # Queue the audio loading once the file is downloaded
        episode_name = f"sn{next_episode:04d}"
        audio_cache.queue_episode_loading(episode_name)


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


def get_mp3_duration(filepath):
    tag = TinyTag.get(filepath)
    return tag.duration * 1000


@app.get("/episodes/{episode_name}.m3u8")
async def get_playlist(episode_name: str) -> Response:
    filepath = os.path.join('server', 'episodes', f'{episode_name}.mp3')
    episode_number = int(episode_name.lstrip('sn0'))
    if not os.path.exists(filepath):
        await prefetch_next_episode(episode_number-1)

    duration = int(get_mp3_duration(filepath))
    num_segments = duration // SEGMENT_DURATION + (1 if duration % SEGMENT_DURATION else 0)

    playlist = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n\n"
    for i in range(num_segments):
        playlist += f"#EXTINF:10.0,\n{episode_name}-{i:03d}.ts\n"
    playlist += "#EXT-X-ENDLIST"

    # Trigger prefetch of next episode
    print('triggering download of next episode from', episode_number)
    asyncio.create_task(prefetch_next_episode(episode_number))

    return Response(content=playlist, media_type="application/vnd.apple.mpegurl")


@app.get("/episodes/{segment_name}.ts")
async def get_segment(segment_name: str) -> Response:
    episode_name, segment_number_str = segment_name.split("-")
    segment_number = int(segment_number_str)
    segment_begin = segment_number * 10

    # Get the segment from cache or disk
    segment: AudioSegment = audio_cache.get_segment(episode_name, segment_begin)
    audio_buffer: io.BufferedRandom = segment.export(format="adts")
    audio_data: bytes = audio_buffer.read()

    return Response(content=audio_data, media_type="video/mp2t")


@app.put("/playback_speed")
async def save_playback_speed(speed: float) -> float:
    with open('playback_speed.txt', 'w') as fw:
        fw.write(str(speed))
    return speed

@app.get("/playback_speed")
async def get_playback_speed() -> float:
    try:
        with open('playback_speed.txt', 'r') as fr:
            speed = float(fr.read().strip())
    except FileNotFoundError:
        speed = 1.0
    return speed


class Episode(BaseModel):
    id: int
    title: str
    description: str
    duration: float
    publishDate: str

class EpisodeListResponse(BaseModel):
    episodes: List[Episode]
    total: int


# @app.get("/episodes")
# def list_episodes(page: int = Query(1, ge=1), per_page: int = Query(10, le=100)):
#     episodes = podcast_playlist.list_episodes(page=page, per_page=per_page)
#     return episodes


@app.get("/episodes", response_model=EpisodeListResponse)
async def get_episodes(
    limit: int = Query(default=10, ge=1, le=250),
    offset: int = Query(default=0, ge=0),
    direction: str = Query(default="desc", regex="^(asc|desc)$")
):
    # Get total episodes count
    total_episodes = podcast_playlist.get_total_episodes()

    # Calculate episode range
    start_episode = offset + 1
    end_episode = min(start_episode + limit, total_episodes)

    # Get episode info for range
    episodes = []
    for num in range(start_episode, end_episode):
        info = podcast_playlist.get_episode_info(num)
        episodes.append(Episode(
            id=info['number'],
            title=info['title'],
            description=info['description'],
            duration=info['total_time'],
            publishDate=info['date']
        ))

    if direction == "desc":
        episodes.reverse()

    return EpisodeListResponse(
        episodes=episodes,
        total=total_episodes
    )
