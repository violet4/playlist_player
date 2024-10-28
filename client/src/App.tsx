import { useState, useEffect, useRef } from 'react'
import Hls from 'hls.js';

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
  onPlayEpisode: (episodeNumber: number) => void;
  handlePrevious: () => void;
  handleNext: () => void;
  setEpisode: (episode: Episode) => void;
}

const PodcastControls: React.FC<PodcastControlsProps> = ({
  episode,
  onPlayEpisode,
  handlePrevious,
  handleNext,
}) => {
  const videoRef = useRef<HTMLMediaElement>();
  console.log("re-rendering podcastcontrols")
  const [seekTime, setSeekTime] = useState(0);
  const [skipAmount, setSkipAmount] = useState(5);


  const episode_number = episode.episode_number.toString().padStart(4, '0');
  const episode_url = `/api/episodes/sn${episode_number}.m3u8`;

  useEffect(() => {
    console.log("podcastcontrols useeffect")
    const hls = new Hls();

    if (Hls.isSupported()) {
      hls.loadSource(episode_url);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.ERROR, (err) => {
        console.log(err);
      });
      videoRef.current.currentTime = episode.current_time;
    }
    else {
      console.log("HLS not supported");
    }
    // Update Media Session actions
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => videoRef.current.play());
      navigator.mediaSession.setActionHandler('pause', () => videoRef.current.pause());
      // navigator.mediaSession.setActionHandler('previoustrack', handlePrevious);
      // navigator.mediaSession.setActionHandler('nexttrack', handleNext);
      navigator.mediaSession.setActionHandler('seekbackward', () => handleSeek(-seekTime));
      navigator.mediaSession.setActionHandler('seekforward', () => handleSeek(seekTime));
    }
    const ws = new WebSocket("ws://localhost:9170/audio_position");
    setInterval(() => {
      if (videoRef.current !== null)
        ws.send(videoRef.current.currentTime.toString());
    }, 1000)
    ws.onmessage = function(event) {
      const new_position = event.data;
    };
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
  }, [episode, handlePrevious, handleNext, onPlayEpisode]);
  const SeekBackwardsButton = () => <button onClick={() => {videoRef.current.currentTime -= skipAmount}}>&lt;</button>;
  const SetSkipAmountTextbox = () => <input type="number" value={skipAmount} onChange={(e) => setSkipAmount(Number(e.target.value))} style={{width: "5ch"}} />;
  const SeekForwardButton = () => <button onClick={() => {videoRef.current.currentTime += skipAmount; console.log("Stuff")}}>&gt;</button>;
  const EpisodeNumberTextbox = () => <input
    type="number"
    value={episode.episode_number}
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
  const TotalEpisodeTime = formatTime(episode.total_time);
  const PositionDisplay = () => {
    const [position, setPosition] = useState(0);

    const CurrentPositionDisplay = formatTime(position);
    return (
      <div>
        {CurrentPositionDisplay}
        <br />
        {TotalEpisodeTime}
      </div>
    );
  };

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
        <audio ref={videoRef} controls src={episode_url}></audio>
        <SkipSecondsWidget />

      </center>
    </div>
  );

};


const PodcastPlayer = () => {
  const [episode, setEpisode] = useState<Episode|null>(null);

  const processCommand = (command: string, method: string = 'POST') => {
    fetch(`/api/${command}`, {method: method})
      .then(resp => resp.json())
      .then(data => setEpisode(data))
      .catch(error => console.error('Error processing response:', error));
  }
  const processCommandSimple = (command: string, method: string = 'POST') => {
    fetch(`/api/${command}`, {method: method})
      .then(resp => resp.json())
      .catch(error => console.error('Error processing response:', error));
  }

  const handlePrevious = () => processCommand('previous');
  const handleNext = () => processCommand('next');

  const onPlayEpisode = (episodeNumber: number) => processCommand(`play/${episodeNumber}`);

  useEffect(() => {
    console.log("opening new websocket");
    fetch(`/api/current`)
      .then(resp => resp.json())
      .then(data => setEpisode(data))
      .catch(error => console.error('Error processing response:', error));
  }, []);

  if (!episode) return <p>Loading...</p>;

  return (
    <div>
      <h2>Title</h2>
      <p>Description</p>

      <PodcastControls
        episode={episode}
        setEpisode={setEpisode}
        onPlayEpisode={onPlayEpisode}
        handlePrevious={handlePrevious}
        handleNext={handleNext}
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
