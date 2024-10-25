
import vlc
import time

class AudioPlayer:
    def __init__(self, file_path: str, episode_number: int, title: str, description: str):
        """Initialize the audio player with a file."""
        self.player: vlc.MediaPlayer = vlc.MediaPlayer(file_path)
        self.episode_number = episode_number
        self.title = title
        self.description = description
        print('prime begin')
        self.prime()
        print('prime end')

    def play(self):
        """Play the audio."""
        if not self.is_playing():
            self.player.play()
        return self.is_playing()

    def pause(self):
        """Pause the audio."""
        if self.is_playing():
            self.player.pause()
        return self.is_playing()

    def playpause(self):
        if self.is_playing():
            self.pause()
        else:
            self.play()
        return self.is_playing()

    def seek(self, seconds: int):
        """Seek to a specific second in the audio."""
        # Seek function expects milliseconds
        self.player.set_time(seconds * 1000)

    def get_position(self) -> float:
        """Get the current position in seconds."""
        return self.player.get_time() // 1000

    def is_playing(self) -> bool:
        """Check if the audio is currently playing."""
        return self.player.is_playing()

    def get_current_position(self) -> float:
        """Get the current playback position in seconds."""
        return self.player.get_time() // 1000

    def get_status(self):
        return {
            'title': self.title,
            'episode_number': self.episode_number,
            'description': self.description,

            'status': 'playing' if self.is_playing() else 'paused',
            'current_time': int(self.get_current_position()),
            'total_time': self.player.get_length() // 1000,
            'rate': self.player.get_rate(),
        }

    def set_rate(self, rate: float):
        self.player.set_rate(rate)

    def prime(self):
        self.play()
        i = 0
        while not self.pause():
            i += 1
        # print(i)
        i = 0
        while self.pause():
            i += 1
        # print(i)


# Usage
if __name__ == "__main__":
    file_path = "sn0001.mp3"  # Replace with your audio file path
    player = AudioPlayer(file_path, 1, '', '')
    
    player.play()
    time.sleep(10)  # Play for 10 seconds
    player.pause()
    
    print("Paused. Current position:", player.get_position())
    
    # Seek to the 20th second and resume playing
    player.seek(20)
    player.play()
    time.sleep(5)  # Play for another 5 seconds

    # Check if still playing
    if player.is_playing():
        print("Playing...")
    else:
        print("Playback finished or stopped.")

    # Cleanup by stopping the playback
    player.player.stop()
