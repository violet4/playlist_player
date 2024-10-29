#!/usr/bin/env python3
import os
import datetime
import time
from dataclasses import dataclass
from typing import List, Tuple

import requests
from bs4 import BeautifulSoup
import m3u8
from m3u8.model import SegmentList


@dataclass
class Episode:
    episode_number: int
    episode_info: str
    episode_description: str
    audio_link: str


def generate_url_for_episode(episode: int) -> str:
    base_url = 'https://twit.cachefly.net/audio/sn'
    episode_code = f'sn{episode:04d}'
    url = f'{base_url}/{episode_code}/{episode_code}.mp3'
    return url


def generate_playlist(start_episode: int, end_episode: int, file_path: str):
    with open(file_path, 'w') as f:
        f.write('#EXTM3U\n')
        for episode in range(start_episode, end_episode + 1):
            url = generate_url_for_episode(episode)
            f.write(f'#EXTINF:-1, Episode {episode}\n{url}\n')


def extract_episode_data(bs: BeautifulSoup) -> Tuple[List[Episode], List[m3u8.Segment]]:
    episodes = []
    segments = SegmentList()
    anchors = bs.find_all('a', attrs={'name': lambda x: x is not None and x.isdigit()})

    for anchor in anchors:
        episode_data = []
        current = anchor
        while current:
            current = current.find_next_sibling()
            if current and current.name == 'table':
                episode_data.append(current)
                if len(episode_data) == 2:
                    break

        if len(episode_data) < 2:
            continue

        ep_num = int(anchor['name'])
        ep_info = episode_data[0].get_text(strip=True).lstrip('\\rn').replace('\xa0', ' ')
        num_date_length = ep_info.split('|')
        num_date_length = [part.strip() for part in num_date_length]
        date = num_date_length[1]
        if len(num_date_length) == 3:
            duration_minutes = num_date_length[2]
            try:
                duration_minutes = int(duration_minutes.split()[0])
            except:
                duration_minutes = -1
        else:
            duration_minutes = -1

        ep_description = episode_data[1].find('img').next_sibling.next_sibling
        #ep_info = ep_info[::-1].split('|', 1)[1][::-1] + '| ' + episode_data[1].find('b').text.replace(r"\'", "'")
        # ep_desc = episode_data[1].get_text(strip=True).replace('\n', ' | ')
        audio_link = generate_url_for_episode(ep_num)
        #ep_info = ep_info.split('|')
        #ep_info = [part.strip() for part in ep_info]

        # 15 Oct 2024
        date = date.replace('Sept', 'Sep')
        date = date.replace('July', 'Jul')
        date = date.replace('June', 'Jun')
        date = datetime.datetime.strptime(date, '%d %b %Y')
        title = episode_data[1].find('b').text
        if isinstance(ep_description, str):
            ep_description = ep_description.replace('\\', '')
        title = f"{ep_num} {title};;{ep_description}"

        # episodes.append(Episode(ep_num, ep_info, ep_desc, audio_link))
        segments.append(m3u8.Segment(
            uri=audio_link, title=title, duration=duration_minutes,
            program_date_time=date,
        ))

    return episodes, segments


def write_to_playlist(episodes: List[Episode], filename: str):
    with open(filename, 'w') as f:
        f.write('#EXTM3U\n')
        for episode in episodes:
            f.write(f'#EXTINF:-1, {episode.episode_number} - {episode.episode_info}\n')
            f.write(f'#EXTVLCOPT:description={episode.episode_description}\n')
            f.write(f'{episode.audio_link}\n')

def generate_year_and_urls():
    yield 2024, 'https://www.grc.com/securitynow.htm'
    this_year = datetime.date.today().year
    for year in range(this_year-1, 2005-1, -1):
        year_url = f'https://www.grc.com/sn/past/{year}.htm'
        yield year, year_url
    return

def download_webpages():
    for year, year_url in generate_year_and_urls():
        filename = f'{year}.htm'
        if not os.path.exists(filename):
            resp = requests.get(year_url)
            with open(filename, 'w') as fw:
                print(resp.content, file=fw)
            time.sleep(10)
    return


def main():
    download_webpages()

    playlist = m3u8.M3U8()
    episodes = []
    for year, _ in generate_year_and_urls():
        filename = f'{year}.htm'
        with open(filename, 'r') as fr:
            bs = BeautifulSoup(fr, 'html.parser')
            new_episodes, segments = extract_episode_data(bs)
            episodes.extend(new_episodes)
            playlist.segments.extend(segments)
    episodes = sorted(episodes, key=lambda e: e.episode_number)
    write_to_playlist(episodes, 'security_now_podcast.m3u')
    playlist.dump('../security_now_podcast.m3u8')

    return 0




if __name__ == '__main__':
    exit(main())

