import m3u8

class PodcastPlayer:
    def __init__(self, m3u_content: str):
        """Initialize with raw M3U content."""
        self.playlist = m3u8.loads(m3u_content)
        self.episodes = self._parse_episodes()

    def _parse_episodes(self):
        """Extract episodes with extended information from the playlist."""
        episodes = []
        for segment in self.playlist.segments:
            info = segment.title.split('|')
            episode_number = info[0].split('-')[0].strip()
            title = info[1].strip()
            description = segment.uri  # Initially set URI as a placeholder
            # Attempt to extract description if set in custom attributes (depends on parser capability)
            if hasattr(segment, 'program_id'):
                description = segment.program_id  # Replace or modify as needed based on actual attribute
            episodes.append({
                'number': episode_number,
                'title': title,
                'description': description,
                'url': segment.uri,
                'file_path': self.get_filepath(episode_number)
            })
        return episodes

    def list_episodes(self, page=1, per_page=10):
        """List episodes, paginated."""
        start = (page - 1) * per_page
        end = start + per_page
        return self.episodes[start:end]

    def get_filepath(self, episode_number: int):
        # TODO: don't hard-code path like this
        file_path = f'server/episodes/sn{episode_number:>04}.mp3'
        return file_path

    def get_episode_info(self, episode_number: int):
        """Get information for a specific episode by number."""
        for episode in self.episodes:
            if episode['number'] == str(episode_number):
                return episode
        return {
            'number': 0,
            'title': 'title',
            'description': 'description',
            'url': 'url',
            'file_path': self.get_filepath(episode_number),
        }

m3u_content = """
#EXTM3U
#EXTINF:-1, 1 - Episode #1 | 19 Aug 2005 | As the Worm Turns
#EXTVLCOPT:description=As the Worm Turns— the first Internet worms of 2005...
https://twit.cachefly.net/audio/sn/sn0001/sn0001.mp3
... (include all episodes here as needed) ...
"""

if __name__ == '__main__':
# Usage example with your provided M3U content
    player = PodcastPlayer(m3u_content)
    print(player.list_episodes(page=1))
    print(player.get_episode_info(1))

