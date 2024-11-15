import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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


const useEpisodeData = () => {
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [episodeNumber, setEpisodeNumber] = useState<number | null>(null);

  const fetchEpisodeByNumber = useCallback((episodeNumber: number) => {
    fetch(`/api/current/${episodeNumber}`, { method: 'PUT' })
      .then((resp) => resp.json())
      .then((data) => {setEpisode(data); setEpisodeNumber(data.episode_number);})
      .catch((error) => console.error('Error processing response:', error));
  }, []);

  useEffect(() => {
    fetch('/api/current')
      .then((resp) => resp.json())
      .then((data) => {setEpisode(data); setEpisodeNumber(data.episode_number);})
      .catch((error) => console.error('Error processing response:', error));
  }, []);

  return { episode, episodeNumber, setEpisodeNumber, fetchEpisodeByNumber };
};


const useEpisodeNavigation = (
  episodeNumber: number | null,
  fetchEpisodeByNumber: (episodeNumber: number) => void,
) => {
  const handlePrevious = useCallback(() => {
    if (episodeNumber !== null) {
      fetchEpisodeByNumber(episodeNumber - 1);
    }
  }, [episodeNumber, fetchEpisodeByNumber]);

  const handleNext = useCallback(() => {
    if (episodeNumber !== null) {
      fetchEpisodeByNumber(episodeNumber + 1);
    }
  }, [episodeNumber, fetchEpisodeByNumber]);

  return { handlePrevious, handleNext };
};


const useMediaSession = (
  videoRef: React.RefObject<HTMLMediaElement>,
  handlePrevious: () => void,
  handleNext: () => void,
  skipAmount: number,
) => {
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => { if (videoRef.current) videoRef.current.play(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (videoRef.current) videoRef.current.pause(); });
      navigator.mediaSession.setActionHandler('previoustrack', handlePrevious);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
      navigator.mediaSession.setActionHandler('seekbackward', () => { if (videoRef.current) videoRef.current.currentTime -= skipAmount; });
      navigator.mediaSession.setActionHandler('seekforward', () => { if (videoRef.current) videoRef.current.currentTime += skipAmount; });
    }
    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
      }
    };

  }, []);
};


const useHlsPlayer = (episode: Episode, videoRef: React.RefObject<HTMLMediaElement>) => {
  const hlsRef = useRef<Hls | null>(null);
  const mediaUrl = useMemo(() => `/api/episodes/sn${episode.episode_number.toString().padStart(4, '0')}.m3u8`, [episode.episode_number]);

  useEffect(() => {
    if (!Hls.isSupported() || !videoRef.current || !episode?.episode_number)
      return;
    const hls = new Hls();
    hlsRef.current = hls;

    hls.loadSource(mediaUrl);
    if (videoRef.current) {
      hls.attachMedia(videoRef.current);
    }

    hls.on(Hls.Events.ERROR, (err) => {
      console.log(err);
    });

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [episode.episode_number]);
};


const useAudioPositionUpdater = (episodeNumber: number, videoRef: React.RefObject<HTMLMediaElement>) => {
  const prevPositionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const interval = setInterval(() => {
      if (videoRef.current?.currentTime && Math.trunc(videoRef.current.currentTime) !== prevPositionRef.current) {
        const currentPosition = Math.trunc(videoRef.current.currentTime);
        fetch(`/api/audio_position/${episodeNumber}/${currentPosition}`, { method: 'PUT' })
          .catch((error) => console.error('Error updating audio position:', error));
        prevPositionRef.current = currentPosition;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [episodeNumber]);
};


interface PlaybackSpeedWidgetProps {
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  updateAudioPlaybackRate: (rate: number) => void;
}


const PlaybackSpeedWidget: React.FC<PlaybackSpeedWidgetProps> = ({playbackSpeed, setPlaybackSpeed, updateAudioPlaybackRate}) => {
  const [customPlaybackSpeed, setCustomPlaybackSpeed] = useState<number>(1.0);
  const handleSetPlaybackSpeed = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPlaybackSpeed = Number(e.target.parentNode?.textContent);
    setPlaybackSpeed(newPlaybackSpeed);
    updateAudioPlaybackRate(newPlaybackSpeed);
  };
  return (
    <div>
      {/* {playbackSpeed} */}
      Playback Speed:
      <label><input type="radio" name="speed" checked={playbackSpeed==0.5} onChange={handleSetPlaybackSpeed} />0.5</label>
      <label><input type="radio" name="speed" checked={playbackSpeed==1.0} onChange={handleSetPlaybackSpeed} />1.0</label>
      <label><input type="radio" name="speed" checked={playbackSpeed==1.25} onChange={handleSetPlaybackSpeed} />1.25</label>
      <label><input type="radio" name="speed" checked={playbackSpeed==1.5} onChange={handleSetPlaybackSpeed} />1.5</label>
      <label><input type="radio" name="speed" checked={playbackSpeed==2.0} onChange={handleSetPlaybackSpeed} />2.0</label>
      <label>
        {/* custom playback speed */}
        <input type="radio" name="speed" checked={playbackSpeed==customPlaybackSpeed} onChange={() => {
          updateAudioPlaybackRate(customPlaybackSpeed);
          setPlaybackSpeed(customPlaybackSpeed);
        }} />
        <input type="number" step={0.5} value={customPlaybackSpeed} style={{width: '6ch'}}
          onChange={(e) => {
            const newCustomPlaybackSpeed = Number(e.target.value);
            if (customPlaybackSpeed == playbackSpeed) {
              setPlaybackSpeed(newCustomPlaybackSpeed);
              updateAudioPlaybackRate(newCustomPlaybackSpeed);
            }
            setCustomPlaybackSpeed(newCustomPlaybackSpeed);
          }}
        />
      </label>
    </div>
  );
};


const usePlaybackTimeRecovery = (
  playbackPosition: number|null,
  videoRef: React.RefObject<HTMLMediaElement>,
  canPlay: boolean,
) => {

  useEffect(() => {
    if (playbackPosition === null || !canPlay)
      return;

    if (videoRef?.current) {
      videoRef.current.currentTime = playbackPosition;
    }
  }, [playbackPosition, canPlay]);

};


const PodcastControls: React.FC<{
  episode: Episode;
  episodeNumber: number;
  handlePrevious: () => void;
  handleNext: () => void;
  setEpisodeNumber: React.Dispatch<React.SetStateAction<number|null>>;
}> = ({ episode, episodeNumber, handlePrevious, handleNext, setEpisodeNumber }) => {
  const videoRef = useRef<HTMLMediaElement>(null);
  const [skipAmount, setSkipAmount] = useState(10);
  const allowAutoplay = episode.current_time < episode.total_time;
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [canPlay, setCanPlay] = useState(false);

  useHlsPlayer(episode, videoRef);
  useAudioPositionUpdater(episode.episode_number, videoRef);
  useMediaSession(videoRef, handlePrevious, handleNext, skipAmount);
  usePlaybackTimeRecovery(episode?.current_time, videoRef, canPlay);

  useEffect(() => {
    if (videoRef.current && allowAutoplay && videoRef.current.duration > 0 && videoRef.current.currentTime >= videoRef.current.duration) {
      setEpisodeNumber((e) => e + 1);
    }
    if (videoRef.current) {
      videoRef.current.oncanplay = () => {
        setCanPlay(true);
      };
    }
  }, []);

  if (episodeNumber === undefined) {
    return <div>Loading...</div>;
  }

  const SeekBackwardsButton = () => <button onClick={() => { if (videoRef.current) videoRef.current.currentTime -= skipAmount; }}>&lt;</button>;
  const SetSkipAmountTextbox = () => <input type="number" value={skipAmount} onChange={(e) => setSkipAmount(Number(e.target.value))} style={{ width: '5ch' }} />;
  const SeekForwardButton = () => <button onClick={() => { if (videoRef.current) videoRef.current.currentTime += skipAmount; }}>&gt;</button>;
  const EpisodeNumberTextbox = () => <input type="number" value={episodeNumber} onChange={(e) => setEpisodeNumber(Number(e.target.value))} style={{ width: '5ch' }} />;
  const PreviousEpisodeButton = () => <button onClick={handlePrevious}>Previous</button>;
  const NextEpisodeButton = () => <button onClick={handleNext}>Next</button>;
  const SkipSecondsWidget = () => <div><SeekBackwardsButton /><SetSkipAmountTextbox /><SeekForwardButton /></div>;
  const updateAudioPlaybackRate = (r: number) => {if (videoRef?.current) videoRef.current.playbackRate = r};

  return (
    <div>
      <div>
        <PreviousEpisodeButton />
        <EpisodeNumberTextbox />
        <NextEpisodeButton />
      </div>
      <br />
      <center>
        <audio ref={videoRef} controls src={`/api/episodes/sn${episode.episode_number.toString().padStart(4, '0')}.m3u8`} style={{ width: '100%' }} />
        <SkipSecondsWidget />
        <PlaybackSpeedWidget playbackSpeed={playbackSpeed} setPlaybackSpeed={setPlaybackSpeed}
          updateAudioPlaybackRate={updateAudioPlaybackRate}
        />
      </center>
    </div>
  );
};


const PodcastPlayer = () => {

  const { episode, episodeNumber, setEpisodeNumber, fetchEpisodeByNumber } = useEpisodeData();
  const { handlePrevious, handleNext } = useEpisodeNavigation(episodeNumber, fetchEpisodeByNumber);

  if (!episode || !episodeNumber) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <h2>#{episode.episode_number} {episode.title}</h2>
      <p>{episode.description}</p>
      <PodcastControls
        episode={episode}
        episodeNumber={episodeNumber}
        handlePrevious={handlePrevious}
        handleNext={handleNext}
        setEpisodeNumber={setEpisodeNumber}
      />
    </div>
  );
};


function App() {
  return (
    <>
      <PodcastPlayer />
    </>
  );
}

export default App;

