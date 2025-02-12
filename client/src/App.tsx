import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Hls from 'hls.js';

const security_now_image_url = "https://elroy.twit.tv/sites/default/files/styles/twit_album_art_600x600/public/images/shows/security_now/album_art/sn2022_albumart_standard_2048.jpg";

interface Episode {
  title: string;
  episode_number: number;
  description: string;
  status: string;
  current_time: number;
  total_time: number;
  date: string;
  rate: number;
}

const originalLog = console.log;

const logToScreen = (...args: any[]) => {
  originalLog.apply(console, args);

  // Create debug element if it doesn't exist
  let debugDiv = document.getElementById('debug-log');
  if (!debugDiv) {
    debugDiv = document.createElement('div');
    debugDiv.id = 'debug-log';
    debugDiv.style.cssText = (
      'position: fixed; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.8); '
      + 'color: white; padding: 10px; max-height: 200px; overflow-y: auto; '
      + 'font-family: monospace; font-size: 12px;'
    );
    document.body.appendChild(debugDiv);
  }

  // Add new log entry
  const entry = document.createElement('div');
  entry.textContent = `${new Date().toISOString().split('T')[1].split('.')[0]} ${args.join(' ')}`;
  debugDiv.appendChild(entry);

  // Keep only last 5 entries
  while (debugDiv.childNodes.length > 100) {
    debugDiv.removeChild(debugDiv.firstChild);
  }
};

// console.log = logToScreen;


const useRemoveCantRunReactMessage = () => {
  const didRun = useRef(false);
  useEffect(() => {
    window.__REACT_NOT_LOADED = false;

    const loadingElement = document.getElementById('react-loading-indicator');
    if (loadingElement) {
      loadingElement.remove();
    }
  }, [didRun.current]);
};

const useEpisodeData = () => {
  const [episode, setEpisode] = useState<Episode | null>(null);

  const fetchEpisode = useCallback((url: string, method: string = 'GET') => {
    fetch(url, { method })
      .then((resp) => resp.json())
      .then((data) => setEpisode(data))
      .catch((error) => console.error('Error processing response:', error));
  }, []);

  const fetchEpisodeByNumber = useCallback((episodeNumber: number) => {
    fetchEpisode(`/api/current/${episodeNumber}`, 'PUT');
  }, [fetchEpisode]);

  useEffect(() => {
    fetchEpisode('/api/current');
  }, [fetchEpisode]);

  return { episode, fetchEpisodeByNumber };
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
  episode: Episode,
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
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `#${episode.episode_number} ${episode.title}`,
        artist: "Security Now!",
        album: "Album",
        artwork: [
          {
            src: security_now_image_url,
            sizes: "600x600",
            type: "image/jpeg",
          },
        ],
      });
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

  }, [episode.episode_number]);
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

interface PlaybackSpeedRadioButtonProps {
  speed: number;
  playbackSpeed: number;
  isCustomSelected: boolean;
  onSelect: (speed: number) => void;
}

const PlaybackSpeedRadioButton: React.FC<PlaybackSpeedRadioButtonProps> = ({
  speed,
  playbackSpeed,
  isCustomSelected,
  onSelect,
}) => {
  return (
    <label>
      <input
        type="radio"
        name="speed"
        checked={!isCustomSelected && playbackSpeed === speed}
        onChange={() => onSelect(speed)}
      />
      {speed}
    </label>
  );
};


const useSavedPlaybackSpeed = (
  setPlaybackSpeed: (speed: number) => void,
  updateAudioPlaybackRate: (rate: number) => void
) => {
  const [customPlaybackSpeed, setCustomPlaybackSpeed] = useState<number>(1.0);
  const [isCustomSelected, setIsCustomSelected] = useState<boolean>(false);

  useEffect(() => {
    const fetchPlaybackSpeed = async () => {
      try {
        const response = await fetch('/api/playback_speed');
        if (!response.ok) {
          throw new Error('Failed to fetch playback speed');
        }

        const speedText = await response.text();
        const speed = parseFloat(speedText);
        if (isNaN(speed)) {
          throw new Error('Invalid playback speed value from server');
        }

        const predefinedSpeeds = [0.5, 1.0, 1.25, 1.5, 2.0];
        if (predefinedSpeeds.includes(speed)) {
          setPlaybackSpeed(speed);
          updateAudioPlaybackRate(speed);
          setIsCustomSelected(false);
        } else {
          setCustomPlaybackSpeed(speed);
          setPlaybackSpeed(speed);
          updateAudioPlaybackRate(speed);
          setIsCustomSelected(true);
        }
      } catch (error) {
        console.error('Error fetching playback speed:', error);
        setPlaybackSpeed(1.0);
        updateAudioPlaybackRate(1.0);
        setIsCustomSelected(false);
      }
    };

    fetchPlaybackSpeed();
  }, []);

  return { customPlaybackSpeed, setCustomPlaybackSpeed, isCustomSelected, setIsCustomSelected };
};


interface PlaybackSpeedWidgetProps {
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  updateAudioPlaybackRate: (rate: number) => void;
}


const PlaybackSpeedWidget: React.FC<PlaybackSpeedWidgetProps> = ({
  playbackSpeed,
  setPlaybackSpeed,
  updateAudioPlaybackRate,
}) => {
  const {
    customPlaybackSpeed,
    setCustomPlaybackSpeed,
    isCustomSelected,
    setIsCustomSelected,
  } = useSavedPlaybackSpeed(setPlaybackSpeed, updateAudioPlaybackRate);

  const handleSetPlaybackSpeed = (newSpeed: number) => {
    setPlaybackSpeed(newSpeed);
    updateAudioPlaybackRate(newSpeed);

    fetch(`/api/playback_speed?speed=${newSpeed}`, { method: 'PUT' })
      .then((resp) => {
        if (!resp.ok) {
          console.error('Failed to update playback speed on the server');
        }
      })
      .catch((error) => {
        console.error('Error updating playback speed on the server:', error);
      });
  };

  const handlePresetRadioSelection = (newSpeed: number) => {
    setIsCustomSelected(false);
    handleSetPlaybackSpeed(newSpeed);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCustomPlaybackSpeed = Number(e.target.value);
    setCustomPlaybackSpeed(newCustomPlaybackSpeed);

    // If the custom radio button is selected, update the playback speed
    if (isCustomSelected) {
      handleSetPlaybackSpeed(newCustomPlaybackSpeed);
    }
  };

  return (
    <div>
      <div>Playback Speed:</div>
      {/* Render pre-set playback speed buttons */}
      {[0.5, 1.0, 1.25, 1.5, 2.0].map((speed) => (
        <PlaybackSpeedRadioButton
          key={speed}
          speed={speed}
          playbackSpeed={playbackSpeed}
          isCustomSelected={isCustomSelected}
          onSelect={handlePresetRadioSelection}
        />
      ))}

      {/* Custom playback speed */}
      <label>
        <input
          type="radio"
          name="speed"
          checked={isCustomSelected}
          onChange={() => {
            setIsCustomSelected(true);
            handleSetPlaybackSpeed(customPlaybackSpeed);
          }}
        />
        <input
          type="number"
          step={0.5}
          value={customPlaybackSpeed}
          style={{ width: '6ch' }}
          onChange={handleCustomChange}
        />
      </label>
    </div>
  );
};


const usePlaybackTimeRecovery = (
  playbackPosition: number|null,
  videoRef: React.RefObject<HTMLMediaElement>,
) => {
  const didSetPlaybackTimeRef = useRef(false);

  useEffect(() => {
    if (playbackPosition === null)
      return;

    const recover_playback_time = () => {
      if (!videoRef.current) return;
      if (didSetPlaybackTimeRef.current) return;
      didSetPlaybackTimeRef.current = true;
      console.log("Recovering playback time");
      videoRef.current.currentTime = playbackPosition;
    };
    if (videoRef?.current) {
      videoRef.current.addEventListener('play', recover_playback_time);
      videoRef.current.addEventListener('loadeddata', recover_playback_time);
    }
    return () => {
      if (videoRef?.current) {
        videoRef.current.removeEventListener('play', recover_playback_time);
        videoRef.current.removeEventListener('loadeddata', recover_playback_time);
      };
    };
  }, [playbackPosition]);

};


// if it was playing, keep playing.
// ensure the same playback rate is maintained.
const usePlaybackSettings = (
  videoRef: React.RefObject<HTMLMediaElement>,
  episode: Episode,
  playbackSpeed: number,
) => {
  const wasPlaying = useRef(false);
  const wasEpisodeNumber = useRef(episode.episode_number);
  const didFirstPositionRestore = useRef(false);
  // const previousEpisodeRef = useRef(episode.episode_number);

  useEffect(() => {
    if (!videoRef?.current) return;
    const setWasPlaying = () => { wasPlaying.current = true; };
    const setWasNotPlaying = () => { wasPlaying.current = false; };
    videoRef.current.addEventListener('play', setWasPlaying);
    videoRef.current.addEventListener('pause', setWasNotPlaying);

    // on play, restore playback position.
    const restore_playback_position = () => {
      if (videoRef.current && (!didFirstPositionRestore.current || wasEpisodeNumber.current !== episode.episode_number)) {
        didFirstPositionRestore.current = true;
        wasEpisodeNumber.current = episode.episode_number;
        videoRef.current.currentTime = episode.current_time;
        videoRef.current.playbackRate = playbackSpeed;
      }
    };
    const restorePlay = () => {
      if (videoRef.current && wasPlaying.current)
        videoRef.current.play();
    };
    videoRef.current.addEventListener('loadedmetadata', restorePlay);
    videoRef.current.addEventListener('play', restore_playback_position);

    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadedmetadata', restorePlay);
        videoRef.current.removeEventListener('play', restore_playback_position);
        videoRef.current.removeEventListener('play', setWasPlaying);
        videoRef.current.removeEventListener('pause', setWasNotPlaying);

      }
    };

  }, [episode.episode_number, playbackSpeed]);

};


const useAutoProgressToNextEpisode = (
  videoRef: React.RefObject<HTMLMediaElement>,
  episode: Episode,
  fetchEpisodeByNumber: (episodeNumber: number) => void
) => {
  const allowAutoplay = Math.floor(episode.current_time) < episode.total_time * 60;

  useEffect(() => {
    if (!videoRef.current) return;

    const goToNextEpisode = () => {
      if (
        videoRef.current
        && allowAutoplay
        && videoRef.current.duration > 0
      ) {
        fetchEpisodeByNumber(episode.episode_number + 1);
      }
    };

    videoRef.current.addEventListener('ended', goToNextEpisode);

    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('ended', goToNextEpisode);
      }
    };
  }, [allowAutoplay, episode.episode_number, fetchEpisodeByNumber]);
};


const PodcastControls: React.FC<{
  episode: Episode;
  episodeNumber: number;
  handlePrevious: () => void;
  handleNext: () => void;
  fetchEpisodeByNumber: (episodeNumber: number) => void;
}> = ({ episode, episodeNumber, handlePrevious, handleNext, fetchEpisodeByNumber }) => {
  const videoRef = useRef<HTMLMediaElement>(null);
  const [skipAmount, setSkipAmount] = useState(5);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  useHlsPlayer(episode, videoRef);
  // useMediaEventLoggers(videoRef);
  // useHlsEventLoggers(hlsRef);

  useAudioPositionUpdater(episode.episode_number, videoRef);
  useMediaSession(videoRef, episode, handlePrevious, handleNext, skipAmount);
  useAutoProgressToNextEpisode(videoRef, episode, fetchEpisodeByNumber);
  usePlaybackSettings(videoRef, episode, playbackSpeed);
  useRemoveCantRunReactMessage();

  // usePlaybackTimeRecovery(episode?.current_time, videoRef);

  if (episodeNumber === undefined) {
    return <div>Loading...</div>;
  }

  const skip_button_count = 8;
  const seek_style = {width: `${100/skip_button_count}%`, height: '50px'};

  const SeekButton = ({direction, seconds}: {direction: "forward"|"backward", seconds: number}) => <button
    style={seek_style}
    onClick={() => { if (videoRef.current) videoRef.current.currentTime += (Number(direction=='forward')*2-1) * seconds; }}>
      {direction=='backward' && '<'}
      {seconds}
      {direction=='forward' && '>'}
  </button>;

  const SeekForwardButton = ({seconds}: {seconds: number}) => <SeekButton direction={'forward'} seconds={seconds} />;
  const SeekBackwardButton = ({seconds}: {seconds: number}) => <SeekButton direction={'backward'} seconds={seconds} />;

  const SeekForward10Sec = () => <SeekForwardButton seconds={10} />;
  const SeekForward20Sec = () => <SeekForwardButton seconds={20} />;
  const SeekForward30Sec = () => <SeekForwardButton seconds={30} />;
  const SeekForward60Sec = () => <SeekForwardButton seconds={60} />;
  const SeekForwardButtonSkipAmount = () => <SeekForwardButton seconds={skipAmount} />;

  const SeekBackward10Sec = () => <SeekBackwardButton seconds={10} />;
  const SeekBackward20Sec = () => <SeekBackwardButton seconds={20} />;
  const SeekBackward30Sec = () => <SeekBackwardButton seconds={30} />;
  const SeekBackward60Sec = () => <SeekBackwardButton seconds={60} />;
  const SeekBackwardButtonSkipAmount = () => <SeekBackwardButton seconds={skipAmount} />;


  const SetSkipAmountTextbox = () => <input type="number" value={skipAmount} onChange={(e) => setSkipAmount(Number(e.target.value))} style={{ width: '5ch' }} />;
  const EpisodeNumberTextbox = () => <input type="number" value={episodeNumber} onChange={(e) => fetchEpisodeByNumber(Number(e.target.value))} style={{ width: '8ch' }} />;
  const PreviousEpisodeButton = () => <button onClick={handlePrevious}>Previous</button>;
  const NextEpisodeButton = () => <button onClick={handleNext}>Next</button>;
  const SkipSecondsWidget = () => <div>

    <SeekBackward60Sec /><SeekBackward30Sec /><SeekBackward20Sec /><SeekBackward10Sec />
    <SeekForward10Sec /><SeekForward20Sec /><SeekForward30Sec /><SeekForward60Sec />
    <br/>

    <SeekBackwardButtonSkipAmount /><SeekForwardButtonSkipAmount />
    <SetSkipAmountTextbox />
  </div>;
  const updateAudioPlaybackRate = (r: number) => {if (videoRef?.current) videoRef.current.playbackRate = r};

  return (
    <div>
      <div>
        <PreviousEpisodeButton />
        <EpisodeNumberTextbox />
        <NextEpisodeButton />
      </div>
      <br />
      <div>
        <audio ref={videoRef} controls src={`/api/episodes/sn${episode.episode_number.toString().padStart(4, '0')}.m3u8`} style={{ width: '100%' }} />
        <SkipSecondsWidget />
        <PlaybackSpeedWidget playbackSpeed={playbackSpeed} setPlaybackSpeed={setPlaybackSpeed}
          updateAudioPlaybackRate={updateAudioPlaybackRate}
        />
      </div>
    </div>
  );
};


const PodcastPlayer = () => {

  const { episode, fetchEpisodeByNumber } = useEpisodeData();
  const { handlePrevious, handleNext } = useEpisodeNavigation(episode ? episode.episode_number : 0, fetchEpisodeByNumber);

  if (!episode || !episode.episode_number) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <h2>#{episode.episode_number} {episode.title}; {episode.date}</h2>
      <p>{episode.description}</p>
      <PodcastControls
        episode={episode}
        episodeNumber={episode.episode_number}
        handlePrevious={handlePrevious}
        handleNext={handleNext}
        fetchEpisodeByNumber={fetchEpisodeByNumber}
      />
      <EpisodeList startEpisodeNumber={episode.episode_number} />
      <CacheCount episode_number={episode.episode_number} />
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


interface Episode {
  id: number;
  title: string;
  description: string;
  duration: number;
  publishDate: string;
}

interface EpisodeListResponse {
  episodes: Episode[];
  total: number;
}


interface PaginationResult {
  currentOffset: number;
  episodesPerPage: number;
  handleEpisodesPerPageChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  handlePreviousPage: () => void;
  handleNextPage: () => void;
}

const calculateStartPage = (startEpisodeNumber: number, episodesPerPage: number) => {
  const offsetStart = startEpisodeNumber - 1;
  const result = offsetStart - (offsetStart % episodesPerPage);
  return result;
};

const usePagination = (totalEpisodes: number, startEpisodeNumber: number): PaginationResult => {
  const startEpisodesPerPage = 10;
  const [episodesPerPage, setEpisodesPerPage] = useState<number>(startEpisodesPerPage);
  const [currentOffset, setCurrentOffset] = useState<number>(calculateStartPage(startEpisodeNumber, episodesPerPage));

  const handleEpisodesPerPageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newEpisodesPerPage = Number(event.target.value);
    setEpisodesPerPage(newEpisodesPerPage);
    setCurrentOffset((prevOffset) => prevOffset - (prevOffset % newEpisodesPerPage));
  };

  const handlePreviousPage = () => {
    setCurrentOffset((prevOffset) => Math.max(prevOffset - episodesPerPage, 0));
  };

  const handleNextPage = () => {
    setCurrentOffset((prevOffset) => Math.min(prevOffset + episodesPerPage, totalEpisodes - episodesPerPage));
  };

  return {
    currentOffset,
    episodesPerPage,
    handleEpisodesPerPageChange,
    handlePreviousPage,
    handleNextPage,
  };
};


const useFetchEpisodes = (episodesPerPage: number, currentOffset: number, setTotalEpisodes: (n: number) => void) => {
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  useEffect(() => {
    const fetchEpisodes = async () => {
      try {
        const response = await fetch(`/api/episodes?limit=${episodesPerPage}&offset=${currentOffset}&direction=asc`);
        if (!response.ok) {
          throw new Error('Failed to fetch episodes');
        }
        const data: EpisodeListResponse = await response.json();
        setEpisodes(data.episodes);
        setTotalEpisodes(data.total);
      } catch (error) {
        console.error('Error fetching episodes:', error);
      }
    };

    fetchEpisodes();
  }, [episodesPerPage, currentOffset]);

  return episodes;
};

const CacheCount = ({episode_number}: {episode_number: number}) => {
  const [cacheCount, setCacheCount] = useState(0);
  useEffect(() => {
    fetch('/cache_count').then(resp => resp.json()).then(data => setCacheCount(data));
  }, [episode_number]);
  return (
    <div>
      Cache Item Count: {cacheCount}
    </div>
  );
};

interface EpisodeListProps {
  startEpisodeNumber: number;
}

const EpisodeList: React.FC<EpisodeListProps> = ({startEpisodeNumber}) => {
  const [totalEpisodes, setTotalEpisodes] = useState<number>(0);
  const {
    currentOffset,
    episodesPerPage,
    handleEpisodesPerPageChange,
    handlePreviousPage,
    handleNextPage,
  } = usePagination(totalEpisodes, startEpisodeNumber);
  const [showEpisodeDetails, setShowEpisodeDetails] = useState(false);

  const episodes = useFetchEpisodes(episodesPerPage, currentOffset, setTotalEpisodes);

  const startIndex = currentOffset + 1;
  const endIndex = Math.min(currentOffset + episodesPerPage, totalEpisodes);

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="episodesPerPage">Episodes per page:</label>
        <select id="episodesPerPage" value={episodesPerPage} onChange={handleEpisodesPerPageChange}>
          {[10, 25, 50, 100, 250].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: '20px' }}>
        <button onClick={handlePreviousPage} disabled={currentOffset === 0}>Previous</button>
        <button onClick={handleNextPage} disabled={endIndex >= totalEpisodes}>Next</button>
        <span style={{ margin: '0 10px' }}>
          {startIndex}-{endIndex} of {totalEpisodes}
        </span>
        <span>
          <input id="show_episode_details" type="checkbox" onChange={(e) => setShowEpisodeDetails(e.target.checked)} />
          &nbsp;
          <label htmlFor="show_episode_details">Show Episode Details</label>
        </span>
      </div>
      <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ccc' }}>
        {episodes.map((episode) => (
          <div key={episode.id} style={{}}>
            <h3 style={{margin: '0px'}}>#{episode.id} {episode.title}</h3>
            <div className="episode-details" hidden={!showEpisodeDetails}>
              <p>{episode.description}</p>
              <p>Duration: {episode.duration} minutes</p>
              <p>Published: {episode.publishDate}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};




export default App;

