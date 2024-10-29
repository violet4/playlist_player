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
  setEpisodeNumber: (episodeNumber: number) => void;
  handlePrevious: () => void;
  handleNext: () => void;
  episodeNumber: number;
}

const PodcastControls: React.FC<PodcastControlsProps> = ({
  episode,
  onPlayEpisode,
  handlePrevious,
  handleNext,
  setEpisodeNumber,
  episodeNumber,
}) => {
  const videoRef = useRef<HTMLMediaElement>();
  console.log("re-rendering podcastcontrols")
  const [seekTime, setSeekTime] = useState(0);
  const [skipAmount, setSkipAmount] = useState(5);


  const episode_number = (episodeNumber || 0).toString().padStart(4, '0');
  const episode_url = `/api/episodes/sn${episode_number}.m3u8`;

  useEffect(() => {
    console.log("podcastcontrols useeffect")
    const hls = new Hls();

    if (Hls.isSupported()) {
      if (episodeNumber > 0)
        hls.loadSource(episode_url);
      if (videoRef.current !== null && videoRef.current !== undefined)
        hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.ERROR, (err) => {
        console.log(err);
      });
      if (videoRef.current !== undefined && videoRef.current !== null)
        videoRef.current.currentTime = episode.current_time;
    }
    else {
      console.log("HLS not supported");
    }
    // Update Media Session actions
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {if (videoRef.current !== undefined) videoRef.current.play()});
      navigator.mediaSession.setActionHandler('pause', () => {if (videoRef.current !== undefined) videoRef.current.pause()});
      navigator.mediaSession.setActionHandler('previoustrack', handlePrevious);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
      navigator.mediaSession.setActionHandler('seekbackward', () => {if (videoRef.current !== undefined) videoRef.current.currentTime -= skipAmount});
      navigator.mediaSession.setActionHandler('seekforward', () => {if (videoRef.current !== undefined) videoRef.current.currentTime += skipAmount});
    }
    const ws = new WebSocket("ws://localhost:9170/audio_position");
    setInterval(() => {
      if (videoRef.current !== undefined && videoRef.current !== null && ws !== undefined && ws.readyState === WebSocket.OPEN) {
        ws.send(`${episode.episode_number},${videoRef.current.currentTime.toFixed(0)}`);
      }
    }, 1000)
    return () => {
      try {
        ws.send('close');
        ws.close();
      }
      catch {}
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

  if (episodeNumber === undefined) {
    return <div>Loading...</div>;
  }

  const SeekBackwardsButton = () => <button onClick={() => {videoRef.current.currentTime -= skipAmount}}>&lt;</button>;
  const SetSkipAmountTextbox = () => <input type="number" value={skipAmount} onChange={(e) => setSkipAmount(Number(e.target.value))} style={{width: "5ch"}} />;
  const SeekForwardButton = () => <button onClick={() => {videoRef.current.currentTime += skipAmount; console.log("Stuff")}}>&gt;</button>;
  const EpisodeNumberTextbox = () => <input
    type="number"
    value={episodeNumber}
    onChange={(e) => setEpisodeNumber(Number(e.target.value))}
    style={{width: '5ch'}}
  />;
  const PreviousEpisodeButton = () => <button onClick={handlePrevious}>Previous</button>;
  const NextEpisodeButton = () => <button onClick={handleNext}>Next</button>;
  const SetSeekTimeValueTextbox = () => <input
    type="number"
    value={seekTime}
    onChange={(e) => setSeekTime(Number(e.target.value))}
    style={{width: '5ch'}}
  />;
  const SkipSecondsWidget = () => <div>
    <SeekBackwardsButton />
    <SetSkipAmountTextbox />
    <SeekForwardButton />
  </div>;

  return (
    <div>
      <div>
        <PreviousEpisodeButton />
        <EpisodeNumberTextbox />
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

const GithubLink = () => {
  return (
    <div style={{position: 'absolute', bottom: '0px'}}>
      <a href="https://github.com/violet4/playlist_player">Playlist Player on Github</a>
    </div>
  );
};

const PodcastPlayer = () => {
  const [episode, setEpisode] = useState<Episode|null>(null);
  const [episodeNumber, setEpisodeNumber] = useState(0);

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

  const handlePrevious = () => setEpisodeNumber(e => e-1);
  const handleNext = () => setEpisodeNumber(e => e+1);

  const onPlayEpisode = (episodeNumber: number) => processCommand(`play/${episodeNumber}`);

  useEffect(() => {
    if (episodeNumber === null || episodeNumber === undefined)
      return;
    (episodeNumber == 0
      ? fetch('/api/current')
      : fetch(`/api/current/${episodeNumber}`, {method: 'PUT'})
    )
      .then(resp => resp.json())
      .then(data => {setEpisode(data); setEpisodeNumber(data.episode_number)})
      .catch(error => console.error('Error processing response:', error));
  }, [episodeNumber]);

  if (!episode) return <p>Loading...</p>;

  return (
    <div>
      <h2>#{episode.episode_number} {episode.title}</h2>
      <p>{episode.description}</p>

      <PodcastControls
        episode={episode}
        episodeNumber={episodeNumber}
        onPlayEpisode={onPlayEpisode}
        handlePrevious={handlePrevious}
        handleNext={handleNext}
        setEpisodeNumber={setEpisodeNumber}
      />
      <GithubLink />
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

