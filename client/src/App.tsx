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
  return hlsRef;
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
      <div>Playback Speed:</div>
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


const useMediaEventLoggers = (
  videoRef: React.RefObject<HTMLMediaElement>,
) => {
  const [elementNumber, setElementNumber] = useState(1);

  useEffect(() => {
    if (!videoRef.current) return;

    console.log(`Adding event listeners to videoRef number ${elementNumber}`);
    setElementNumber(e => e + 1);

    const mediaEvents = [
      'abort',
      'canplay',
      'canplaythrough',
      'durationchange',
      'emptied',
      'encrypted',
      'ended',
      'error',
      'loadeddata',
      'loadedmetadata',
      'loadstart',
      'pause',
      'play',
      'playing',
      'progress',
      'ratechange',
      'seeked',
      'seeking',
      'stalled',
      'suspend',
      'timeupdate',
      'volumechange',
      'waiting',
      'waitingforkey',
    ] as const;

    // Create array of [eventName, handler] tuples
    const eventHandlers: Array<[string, () => void]> = mediaEvents.map(eventName => {
      const handler = () => console.log(eventName);
      return [eventName, handler];
    });

    // Add all event listeners
    eventHandlers.forEach(([eventName, handler]) => {
      videoRef.current?.addEventListener(eventName, handler);
    });

    // Cleanup function
    return () => {
      if (!videoRef.current) return;

      eventHandlers.forEach(([eventName, handler]) => {
        videoRef.current?.removeEventListener(eventName, handler);
      });
    };
  }, [videoRef]);
};


interface HlsEventData {
  [key: string]: any;  // Generic event data type since each event has different data structure
}

const useHlsEventLoggers = (
    hlsRef: React.RefObject<Hls>,
  ) => {
    useEffect(() => {
      if (!hlsRef.current) return;

      // Define all HLS events with their handlers
      const hlsEvents: Array<[keyof typeof Hls.Events, (event: any, data: HlsEventData) => void]> = [
        ['MEDIA_ATTACHING', (_, data) => console.log('MEDIA_ATTACHING', JSON.stringify(data))],
        ['MEDIA_ATTACHED', (_, data) => console.log('MEDIA_ATTACHED', JSON.stringify(data))],
        ['MEDIA_DETACHING', (_, data) => console.log('MEDIA_DETACHING', JSON.stringify(data))],
        ['MEDIA_DETACHED', (_, data) => console.log('MEDIA_DETACHED', JSON.stringify(data))],
        ['BUFFER_RESET', (_, data) => console.log('BUFFER_RESET', JSON.stringify(data))],
        // ['BUFFER_CODECS', (_, data) => console.log('BUFFER_CODECS', JSON.stringify(data))],
        ['BUFFER_CREATED', (_, data) => console.log('BUFFER_CREATED', JSON.stringify(data))],
        // ['BUFFER_APPENDING', (_, data) => console.log('BUFFER_APPENDING', JSON.stringify(data))],
        // ['BUFFER_APPENDED', (_, data) => console.log('BUFFER_APPENDED', JSON.stringify(data))],
        ['BUFFER_EOS', (_, data) => console.log('BUFFER_EOS', JSON.stringify(data))],
        ['BUFFER_FLUSHING', (_, data) => console.log('BUFFER_FLUSHING', JSON.stringify(data))],
        ['BUFFER_FLUSHED', (_, data) => console.log('BUFFER_FLUSHED', JSON.stringify(data))],
        ['BACK_BUFFER_REACHED', (_, data) => console.log('BACK_BUFFER_REACHED', JSON.stringify(data))],
        ['MANIFEST_LOADING', (_, data) => console.log('MANIFEST_LOADING', JSON.stringify(data))],
        // ['MANIFEST_LOADED', (_, data) => console.log('MANIFEST_LOADED', JSON.stringify(data))],
        // ['MANIFEST_PARSED', (_, data) => console.log('MANIFEST_PARSED', JSON.stringify(data))],
        ['STEERING_MANIFEST_LOADED', (_, data) => console.log('STEERING_MANIFEST_LOADED', JSON.stringify(data))],
        // ['LEVEL_SWITCHING', (_, data) => console.log('LEVEL_SWITCHING', JSON.stringify(data))],
        ['LEVEL_SWITCHED', (_, data) => console.log('LEVEL_SWITCHED', JSON.stringify(data))],
        ['LEVEL_LOADING', (_, data) => console.log('LEVEL_LOADING', JSON.stringify(data))],
        ['LEVEL_LOADED', (_, data) => console.log('LEVEL_LOADED', JSON.stringify(data))],
        // ['LEVEL_UPDATED', (_, data) => console.log('LEVEL_UPDATED', JSON.stringify(data))],
        // ['LEVEL_PTS_UPDATED', (_, data) => console.log('LEVEL_PTS_UPDATED', JSON.stringify(data))],
        ['LEVELS_UPDATED', (_, data) => console.log('LEVELS_UPDATED', JSON.stringify(data))],
        ['AUDIO_TRACKS_UPDATED', (_, data) => console.log('AUDIO_TRACKS_UPDATED', JSON.stringify(data))],
        ['AUDIO_TRACK_SWITCHING', (_, data) => console.log('AUDIO_TRACK_SWITCHING', JSON.stringify(data))],
        ['AUDIO_TRACK_SWITCHED', (_, data) => console.log('AUDIO_TRACK_SWITCHED', JSON.stringify(data))],
        ['AUDIO_TRACK_LOADING', (_, data) => console.log('AUDIO_TRACK_LOADING', JSON.stringify(data))],
        ['AUDIO_TRACK_LOADED', (_, data) => console.log('AUDIO_TRACK_LOADED', JSON.stringify(data))],
        ['SUBTITLE_TRACKS_UPDATED', (_, data) => console.log('SUBTITLE_TRACKS_UPDATED', JSON.stringify(data))],
        ['SUBTITLE_TRACK_SWITCH', (_, data) => console.log('SUBTITLE_TRACK_SWITCH', JSON.stringify(data))],
        ['SUBTITLE_TRACK_LOADING', (_, data) => console.log('SUBTITLE_TRACK_LOADING', JSON.stringify(data))],
        ['SUBTITLE_TRACK_LOADED', (_, data) => console.log('SUBTITLE_TRACK_LOADED', JSON.stringify(data))],
        ['SUBTITLE_FRAG_PROCESSED', (_, data) => console.log('SUBTITLE_FRAG_PROCESSED', JSON.stringify(data))],
        // ['INIT_PTS_FOUND', (_, data) => console.log('INIT_PTS_FOUND', JSON.stringify(data))],
        ['FRAG_LOADING', (_, data) => console.log('FRAG_LOADING', JSON.stringify(data))],
        ['FRAG_LOAD_EMERGENCY_ABORTED', (_, data) => console.log('FRAG_LOAD_EMERGENCY_ABORTED', JSON.stringify(data))],
        // ['FRAG_LOADED', (_, data) => console.log('FRAG_LOADED', JSON.stringify(data))],
        ['FRAG_DECRYPTED', (_, data) => console.log('FRAG_DECRYPTED', JSON.stringify(data))],
        // ['FRAG_PARSING_INIT_SEGMENT', (_, data) => console.log('FRAG_PARSING_INIT_SEGMENT', JSON.stringify(data))],
        ['FRAG_PARSING_USERDATA', (_, data) => console.log('FRAG_PARSING_USERDATA', JSON.stringify(data))],
        ['FRAG_PARSING_METADATA', (_, data) => console.log('FRAG_PARSING_METADATA', JSON.stringify(data))],
        // ['FRAG_PARSED', (_, data) => console.log('FRAG_PARSED', JSON.stringify(data))],
        // ['FRAG_BUFFERED', (_, data) => console.log('FRAG_BUFFERED', JSON.stringify(data))],
        // ['FRAG_CHANGED', (_, data) => console.log('FRAG_CHANGED', JSON.stringify(data))],
        ['FPS_DROP', (_, data) => console.log('FPS_DROP', JSON.stringify(data))],
        ['FPS_DROP_LEVEL_CAPPING', (_, data) => console.log('FPS_DROP_LEVEL_CAPPING', JSON.stringify(data))],
        ['ERROR', (_, data) => console.log('ERROR', JSON.stringify(data))],
        ['DESTROYING', (_, data) => console.log('DESTROYING', JSON.stringify(data))],
        ['KEY_LOADING', (_, data) => console.log('KEY_LOADING', JSON.stringify(data))],
        ['KEY_LOADED', (_, data) => console.log('KEY_LOADED', JSON.stringify(data))],
        ['NON_NATIVE_TEXT_TRACKS_FOUND', (_, data) => console.log('NON_NATIVE_TEXT_TRACKS_FOUND', JSON.stringify(data))],
        ['CUES_PARSED', (_, data) => console.log('CUES_PARSED', JSON.stringify(data))]
      ];

      // Add all event listeners
      hlsEvents.forEach(([event, handler]) => {
        if (hlsRef.current)
          hlsRef.current.on(Hls.Events[event], handler);
      });

      // Cleanup function
      return () => {
        if (!hlsRef.current) return;
        hlsEvents.forEach(([event, handler]) => {
          if (hlsRef.current)
            hlsRef.current.off(Hls.Events[event], handler);
        });
      };
    }, [hlsRef]);
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

  const hlsRef = useHlsPlayer(episode, videoRef);
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

  const seek_style = {width: '50px', height: '50px'};
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
  const SeekForwardButtonSkipAmount = () => <SeekForwardButton seconds={skipAmount} />;

  const SeekBackward10Sec = () => <SeekBackwardButton seconds={10} />;
  const SeekBackward20Sec = () => <SeekBackwardButton seconds={20} />;
  const SeekBackward30Sec = () => <SeekBackwardButton seconds={30} />;
  const SeekBackwardButtonSkipAmount = () => <SeekBackwardButton seconds={skipAmount} />;


  const SetSkipAmountTextbox = () => <input type="number" value={skipAmount} onChange={(e) => setSkipAmount(Number(e.target.value))} style={{ width: '5ch' }} />;
  const EpisodeNumberTextbox = () => <input type="number" value={episodeNumber} onChange={(e) => fetchEpisodeByNumber(Number(e.target.value))} style={{ width: '8ch' }} />;
  const PreviousEpisodeButton = () => <button onClick={handlePrevious}>Previous</button>;
  const NextEpisodeButton = () => <button onClick={handleNext}>Next</button>;
  const SkipSecondsWidget = () => <div>

    <SeekBackward30Sec /><SeekBackward20Sec /><SeekBackward10Sec />
    <SeekForward10Sec /><SeekForward20Sec /><SeekForward30Sec />
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

