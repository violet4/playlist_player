import { useState, useEffect } from 'react'

interface Episode {
  title: string;
  episode_number: number;
  description: string;
 
  status: string;
  current_time: number;
  total_time: number;
  rate: number;
}

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};


interface PodcastControlsProps {
  episode: Episode;
  currentEpisode: number;
  onPlayEpisode: (episodeNumber: number) => void;
  handlePlayPause: () => void;
  handlePause: () => void;
  handlePrevious: () => void;
  handleNext: () => void;
  handleSeek: (seekTime: number) => void;
  handleChangeRate: (rate: number) => void;
}

const PodcastControls: React.FC<PodcastControlsProps> = ({
  episode,
  currentEpisode,
  onPlayEpisode,
  handlePlayPause,
  handlePause,
  handlePrevious,
  handleNext,
  handleSeek,
  handleChangeRate,
}) => {
  const [episodeNumber, setEpisodeNumber] = useState(currentEpisode);
  const [seekTime, setSeekTime] = useState(0);
  const [skipAmount, setSkipAmount] = useState(5);
  const [position, setPosition] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(episode.rate);

  const PlayPauseButton = () => <button onClick={handlePlayPause}>Play/Pause</button>;
  const PauseButton = () => <button onClick={handlePause}>Pause</button>;


  useEffect(() => {
    const ws = new WebSocket("ws://localhost:9170/audio_position");
    ws.onmessage = function(event) {
      const new_position = event.data;
      setPosition(new_position);
    };

    // Update Media Session actions
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => onPlayEpisode(episodeNumber));
      navigator.mediaSession.setActionHandler('pause', handlePause);
      navigator.mediaSession.setActionHandler('previoustrack', handlePrevious);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
      navigator.mediaSession.setActionHandler('seekbackward', () => handleSeek(-10));
      navigator.mediaSession.setActionHandler('seekforward', () => handleSeek(10));
    }
    return () => {
      ws.close();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
      }
    };
  }, [episodeNumber, handlePause, handlePrevious, handleNext, handleSeek, onPlayEpisode]);
  const SeekBackwardsButton = () => <button onClick={() => handleSeek(Number(position) - skipAmount)}>&lt;</button>;
  const SetSkipAmountTextbox = () => <input type="number" value={skipAmount} onChange={(e) => setSkipAmount(Number(e.target.value))} style={{width: "5ch"}} />;
  const SeekForwardButton = () => <button onClick={() => handleSeek(Number(position) + skipAmount)}>&gt;</button>;
  const EpisodeNumberTextbox = () => <input
    type="number"
    value={episodeNumber}
    onChange={(e) => setEpisodeNumber(Number(e.target.value))}
    style={{width: '5ch'}}
  />;
  const PlaySpecificEpisodeButton = () => <button onClick={() => onPlayEpisode(episodeNumber)}>Play Episode</button>;
  const PreviousEpisodeButton = () => <button onClick={handlePrevious}>Previous</button>;
  const NextEpisodeButton = () => <button onClick={handleNext}>Next</button>;
  const SetSeekTimeValueTextbox = () => <input
    type="number"
    value={seekTime}
    onChange={(e) => setSeekTime(Number(e.target.value))}
    style={{width: '5ch'}}
  />;
  const DoSeekButton = () => <button onClick={() => handleSeek(seekTime)}>Seek</button>;
  const SetRateTextbox = () => <div>
    Rate:
    <input type="number" value={playbackRate}
      onChange={(e) => {
        const rate = Number(e.target.value);
        setPlaybackRate(rate);
        handleChangeRate(rate);
      }}
      style={{width: '5ch'}}
    />
  </div>;
  const SeekWidget = () => <div>
    <SetSeekTimeValueTextbox />
    <DoSeekButton />
  </div>;
  const SkipSecondsWidget = () => <div>
    <SeekBackwardsButton />
    <SetSkipAmountTextbox />
    <SeekForwardButton />
  </div>;
  const CurrentPositionDisplay = formatTime(position);
  const TotalEpisodeTime = formatTime(episode.total_time);
  const PositionDisplay = () => <div>
    {CurrentPositionDisplay}
    <br />
    {TotalEpisodeTime}
  </div>;

  return (
    <div>
      <div>
        <EpisodeNumberTextbox />
        <PlaySpecificEpisodeButton />
      </div>
      <div>
        <PreviousEpisodeButton />
        <NextEpisodeButton />
      </div>
      <br />

      <center>
        <PositionDisplay />
        <br />
        <div>
          <PlayPauseButton />
          <PauseButton />
        </div>
        <SkipSecondsWidget />
        <br />
        <SeekWidget />
        <SetRateTextbox />

      </center>
    </div>
  );

};


const PodcastPlayer = () => {
  const [episode, setEpisode] = useState<Episode | null>(null);

  const processCommand = (command: string, method: string = 'POST') => {
    fetch(`/api/${command}`, {method: method})
      .then(resp => resp.json())
      .then(data => setEpisode(data))
      .catch(error => console.error('Error processing response:', error));
  }

  const handlePrevious = () => processCommand('previous');
  const handleNext = () => processCommand('next');

  const onPlayEpisode = (episodeNumber: number) => processCommand(`play/${episodeNumber}`);
  const handlePlayPause = () => processCommand('playpause');
  const handlePause = () => processCommand('pause');

  const handleSeek = (seekTime: number) => processCommand(`seek/${seekTime}`);

  const handleChangeRate = (rate: number) => processCommand(`playback_rate/${rate}`);
  useEffect(() => {
    handlePause();
  }, []);

  if (!episode) return <p>Loading...</p>;

  return (
    <div>
      <h2>{episode.title}</h2>
      <p>{episode.description}</p>

      <PodcastControls
        episode={episode}
        currentEpisode={episode.episode_number}
        onPlayEpisode={onPlayEpisode}
        handlePlayPause={handlePlayPause}
        handlePause={handlePause}
        handlePrevious={handlePrevious}
        handleNext={handleNext}
        handleSeek={handleSeek}
        handleChangeRate={handleChangeRate}
      />
    </div>
  );
};

function App() {

  return (
    <>
      <PodcastPlayer />
    </>
  )
}

export default App
