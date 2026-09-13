import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls, useAnimations, useGLTF, useProgress, useTexture } from "@react-three/drei";
import { Box3, DoubleSide, SRGBColorSpace, Vector3 } from "three";
import { GameProvider, useGame } from "../context/GameContext";
import * as api from "../lib/api";
import RoomHud from "../components/RoomHud";
import QuestJournal from "../components/QuestJournal";
import FlashcardsApp from "../components/FlashcardsApp";
import StatsWidgets from "../components/StatsWidgets";
import SettingsApp from "../components/SettingsApp";
import CalendarApp, { compareEvents, formatTimeRange, todayKey, toDayKey } from "../components/CalendarApp";
import RoomCalendarWidget from "../components/RoomCalendarWidget";
import MacAppIcon from "../components/MacIcons";
import { classifySite } from "../lib/productiveSites";

const MODEL_URL = "/models/study-girl/15961a17a125467e9367ee452fd1950c_Textured.gltf";
const NCS_TRACKS = [
  { title: "Dreamer", artist: "Alan Walker", url: "https://ncsmusic.s3.eu-west-1.amazonaws.com/tracks/000/001/378/dreamer-1680825645-w02oSTah2D.mp3", color: "#7b2ea3" },
  { title: "Sky High", artist: "Elektronomia", url: "https://ncsmusic.s3.eu-west-1.amazonaws.com/tracks/000/000/290/sky-high-1586948785-jGkCsW2xA9.mp3", color: "#176ba0" },
  { title: "Heroes Tonight", artist: "Janji feat. Johnning", url: "https://ncsmusic.s3.eu-west-1.amazonaws.com/tracks/000/000/143/heroes-tonight-feat-johnning-1586946924-fcppiBJp7z.mp3", color: "#b54735" },
  { title: "On & On", artist: "Cartoon feat. Daniel Levi", url: "https://ncsmusic.s3.eu-west-1.amazonaws.com/tracks/000/000/152/1654766391_N6n9kRBaAr_Cartoon---On--On-feat.-Daniel-Levi-_NCS-Release_.mp3", color: "#2b8768" },
];
// Source was authored Z-up in Blender; glTF arrives in Three.js as (x, z, -y).
const ROOM_FOCUS = new Vector3(8, 128, 92);
const ROOM_CAMERA_OFFSET = new Vector3(-155, 175, 540);

function StudyGirlModel({ onReady }) {
  const group = useRef(null);
  const { scene, animations } = useGLTF(MODEL_URL);
  const { actions, names } = useAnimations(animations, group);
  useEffect(() => {
    scene.traverse((object) => {
      if (!object.isMesh && !object.isSkinnedMesh) return;

      // The exported backdrop is a large presentation card, not the window.
      if (object.name.toUpperCase().includes("BACKDROP")) {
        object.visible = false;
        return;
      }

      // Skinned meshes are culled against their bind-pose bounds, so the girl and
      // her chair pop out of view at some angles. Cheap to just always draw them.
      if (object.isSkinnedMesh) object.frustumCulled = false;

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        material.side = DoubleSide;

        // The exporter tagged every material alphaMode:BLEND, so three renders all
        // 71 meshes in the transparent pass with depthWrite off. That pass sorts
        // per-object by centroid, which is why walls and props vanish or punch
        // through each other as you orbit. They are painted opaque surfaces - use
        // an alpha-test cutout so depth is written normally.
        if (material.transparent) {
          material.transparent = false;
          material.depthWrite = true;
          material.alphaTest = 0.5;
        }

        // Textures are hand-painted with their own lighting; tone mapping was
        // desaturating them away from the reference render.
        material.toneMapped = false;
        if (material.roughness !== undefined) material.roughness = 1;
        if (material.metalness !== undefined) material.metalness = 0;
        material.needsUpdate = true;
      });
    });
  }, [scene]);

  useEffect(() => {
    const action = names.length ? actions[names[0]] : null;
    if (!action) return undefined;
    action.reset().fadeIn(0.35).play();
    return () => action.fadeOut(0.25);
  }, [actions, names]);

  useLayoutEffect(() => {
    if (!group.current) return;
    const bounds = new Box3().setFromObject(group.current);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    onReady({ center, size });
  }, [onReady, scene]);

  return <group ref={group}><primitive object={scene} /></group>;
}

function WindowSky() {
  const texture = useTexture("/models/study-girl/window-sky.svg?v=2");
  texture.colorSpace = SRGBColorSpace;
  return (
    <mesh position={[-209.5, 287, 81]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[178, 302]} />
      <meshBasicMaterial map={texture} side={DoubleSide} />
    </mesh>
  );
}

function LaptopHotspot({ onOpen, disabled }) {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!hovered || disabled) return undefined;
    document.body.style.cursor = "pointer";
    return () => { document.body.style.cursor = ""; };
  }, [disabled, hovered]);

  return (
    <group position={[-6, 176, 194]} rotation={[0, -0.08, 0]}>
      <mesh
        onClick={(event) => { event.stopPropagation(); if (!disabled) onOpen(); }}
        onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[102, 76, 70]} />
        <meshBasicMaterial transparent opacity={hovered && !disabled ? 0.12 : 0} color="#7de7ff" depthWrite={false} />
      </mesh>
      {hovered && !disabled && (
        <Html center position={[0, 64, 0]} style={{ pointerEvents: "none" }}>
          <div className="laptop-prompt">Open laptop</div>
        </Html>
      )}
    </group>
  );
}

function OrbitCamera({ controls, bounds, enabled }) {
  const { camera } = useThree();
  const initialized = useRef(false);

  useEffect(() => {
    if (!bounds || initialized.current) return;
    camera.position.copy(ROOM_FOCUS).add(ROOM_CAMERA_OFFSET);
    controls.current?.target.copy(ROOM_FOCUS);
    controls.current?.update();
    controls.current?.saveState();
    initialized.current = true;
  }, [bounds, camera]);
  return <OrbitControls ref={controls} enabled={enabled} enablePan enableDamping dampingFactor={0.08} minDistance={110} maxDistance={2600} minPolarAngle={0.45} maxPolarAngle={Math.PI - 0.45} screenSpacePanning />;
}

function Loader() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return <Html center><div className="study-loader">Loading room {Math.round(progress)}%</div></Html>;
}

const laptopApps = [
  { id: "browser", label: "Safari" },
  { id: "spotify", label: "Spotify" },
  { id: "calendar", label: "Calendar" },
  { id: "cards", label: "Flashcards" },
  { id: "trackers", label: "Trackers" },
  { id: "notes", label: "Notes" },
  { id: "files", label: "Finder" },
  { id: "settings", label: "Settings" },
];

function DraggableWidget({ id, defaultPos, className = "", children }) {
  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem(`widget_pos_${id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") return parsed;
      }
    } catch (e) {}
    return defaultPos;
  });

  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest("button, input, select, textarea, a, range, [role='button']")) return;

    setDragging(true);
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: pos.x,
      posY: pos.y,
    };
    e.stopPropagation();
  };

  useEffect(() => {
    if (!dragging) return undefined;

    const handlePointerMove = (e) => {
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      const newX = Math.max(0, Math.min(window.innerWidth - 80, dragStart.current.posX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 50, dragStart.current.posY + dy));
      setPos({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      setDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragging]);

  useEffect(() => {
    try {
      localStorage.setItem(`widget_pos_${id}`, JSON.stringify(pos));
    } catch (e) {}
  }, [id, pos]);

  return (
    <div
      className={`draggable-widget ${className} ${dragging ? "is-dragging" : ""}`}
      style={{
        position: "fixed",
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        zIndex: dragging ? 100 : 10,
        cursor: dragging ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
    >
      {children}
    </div>
  );
}

function RoomFlashcardsWidget({ onOpenApp }) {
  const { currentUser } = useGame();
  const [deck, setDeck] = useState(null);
  const [cards, setCards] = useState([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    api.getDecks(currentUser).then((decks) => {
      if (decks && decks.length > 0) {
        setDeck(decks[0]);
        api.getCards(currentUser, decks[0].id).then((loaded) => {
          if (loaded && loaded.length > 0) setCards(loaded);
        });
      }
    });
  }, [currentUser]);

  const currentCard = cards[cardIndex];

  return (
    <div className="room-widget room-flashcard-widget">
      <header className="room-widget-header">
        <strong>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f5c47f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M7 8h10M7 12h7" />
          </svg>
          Flashcards
        </strong>
        <button type="button" className="room-widget-link" onClick={() => onOpenApp("cards")}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: "middle" }}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Open App
        </button>
      </header>
      {deck && currentCard ? (
        <div className="room-widget-body" onClick={() => setFlipped(!flipped)}>
          <div className="room-widget-subhead">
            <span className="room-card-badge">{flipped ? "Answer" : "Question"} · Card {cardIndex + 1}/{cards.length}</span>
            <small>{deck.title}</small>
          </div>
          <p className="room-card-text">{flipped ? currentCard.back : currentCard.front}</p>
          <div className="room-widget-actions">
            <small className="room-card-hint">Click card to flip</small>
            {cards.length > 1 && (
              <button
                type="button"
                className="room-widget-next"
                onClick={(e) => {
                  e.stopPropagation();
                  setFlipped(false);
                  setCardIndex((i) => (i + 1) % cards.length);
                }}
              >
                Next
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="room-widget-body empty" onClick={() => onOpenApp("cards")}>
          <p className="room-card-text">No study decks created yet.</p>
          <small className="room-card-hint">+ Click to open Flashcards app</small>
        </div>
      )}
    </div>
  );
}

function RoomTrackersWidget({ onOpenApp }) {
  const { currentUser, profile } = useGame();
  const [githubStats, setGithubStats] = useState(null);
  const [leetcodeStats, setLeetcodeStats] = useState(null);

  useEffect(() => {
    if (!currentUser || !profile) return;
    if (profile?.integrations?.github) {
      api.getGithubStats(currentUser).then(setGithubStats).catch(() => {});
    }
    if (profile?.integrations?.leetcode) {
      api.getLeetcodeStats(currentUser).then(setLeetcodeStats).catch(() => {});
    }
  }, [currentUser, profile]);

  const ghName = profile?.integrations?.github;
  const lcName = profile?.integrations?.leetcode;

  const githubSvg = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );

  const leetcodeSvg = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M16.102 17.93l-2.697 2.607a1.376 1.376 0 0 1-1.923 0L2.109 11.291a1.376 1.376 0 0 1 0-1.923l9.373-9.246a1.376 1.376 0 0 1 1.923 0l2.697 2.607c.53.522.53 1.385 0 1.907L9.629 10.33l6.473 5.693c.53.522.53 1.385 0 1.907z" />
    </svg>
  );

  return (
    <div className="room-widget room-trackers-widget">
      <header className="room-widget-header">
        <strong>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f5c47f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
          Developer Stats
        </strong>
        <button type="button" className="room-widget-link" onClick={() => onOpenApp("trackers")}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 3, verticalAlign: "middle" }}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Edit
        </button>
      </header>
      <div className="room-widget-body">
        {ghName ? (
          <div className="room-tracker-row" onClick={() => onOpenApp("trackers")}>
            <span className="tracker-badge gh">
              {githubSvg}
              GitHub
            </span>
            <div>
              <b>@{ghName}</b>
              <small>{githubStats ? `${githubStats.publicRepos} repos · ${githubStats.currentStreak ?? 0}d streak` : "Connected"}</small>
            </div>
          </div>
        ) : (
          <div className="room-tracker-row empty" onClick={() => onOpenApp("trackers")}>
            <span className="tracker-badge gh">
              {githubSvg}
              + GitHub
            </span>
            <small>Connect username</small>
          </div>
        )}

        {lcName ? (
          <div className="room-tracker-row" onClick={() => onOpenApp("trackers")}>
            <span className="tracker-badge lc">
              {leetcodeSvg}
              LeetCode
            </span>
            <div>
              <b>@{lcName}</b>
              <small>{leetcodeStats ? `${leetcodeStats.totalSolved} solved (${leetcodeStats.easySolved}E/${leetcodeStats.mediumSolved}M/${leetcodeStats.hardSolved}H)` : "Connected"}</small>
            </div>
          </div>
        ) : (
          <div className="room-tracker-row empty" onClick={() => onOpenApp("trackers")}>
            <span className="tracker-badge lc">
              {leetcodeSvg}
              + LeetCode
            </span>
            <small>Connect username</small>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalogClock({ date }) {
  return (
    <div className="analog-clock" aria-label={date.toLocaleTimeString()}>
      {Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--tick": index }} />)}
      <b className="clock-hour" style={{ transform: `rotate(${((date.getHours() % 12) + date.getMinutes() / 60) * 30}deg)` }} />
      <b className="clock-minute" style={{ transform: `rotate(${date.getMinutes() * 6}deg)` }} />
      <b className="clock-second" style={{ transform: `rotate(${date.getSeconds() * 6}deg)` }} />
      <em />
    </div>
  );
}

function RoomClockWidget() {
  const [now, setNow] = useState(() => new Date());
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <aside className={`room-clock-widget ${collapsed ? "is-collapsed" : ""}`}>
      <button type="button" className="room-clock-toggle" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand clock" : "Collapse clock"}>{collapsed ? "+" : "−"}</button>
      <AnalogClock date={now} />
      {!collapsed && <div><time>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><span>{now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span></div>}
    </aside>
  );
}

function MusicControls({ music, compact = false }) {
  const progress = music.duration ? (music.currentTime / music.duration) * 100 : 0;
  const formatTime = (value) => {
    if (!Number.isFinite(value)) return "0:00";
    const minutes = Math.floor(value / 60);
    return `${minutes}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  };
  return (
    <div className={`music-controller ${compact ? "is-compact" : ""}`}>
      <div className="music-cover" style={{ "--cover-color": music.track.color }}><span>NCS</span><i /></div>
      <div className="music-player-main">
        <div className="music-meta"><strong>{music.track.title}</strong><span>{music.track.artist} · NCS</span></div>
        <div className="music-timeline">
          <input aria-label="Song progress" type="range" min="0" max="100" step="0.1" value={progress} disabled={!music.duration} onInput={(event) => music.seek((Number(event.currentTarget.value) / 100) * music.duration)} />
          {!compact && <span>{formatTime(music.currentTime)} / {formatTime(music.duration)}</span>}
        </div>
        <div className="music-actions">
          {!compact && <button type="button" className={music.shuffle ? "is-active" : ""} onClick={music.toggleShuffle} aria-label="Toggle shuffle">⌘</button>}
          <button type="button" onClick={music.previous} aria-label="Previous song">Ⅰ◀</button>
          <button type="button" className="music-play" onClick={music.toggle} aria-label={music.playing ? `Pause ${music.track.title}` : `Play ${music.track.title}`}>{music.playing ? "Ⅱ" : "▶"}</button>
          <button type="button" onClick={music.next} aria-label="Next song">▶Ⅰ</button>
          {!compact && <button type="button" className={music.saved ? "is-active" : ""} onClick={music.toggleSaved} aria-label={music.saved ? "Remove from favorites" : "Add to favorites"}>{music.saved ? "✓" : "+"}</button>}
        </div>
        <div className="music-volume"><button type="button" onClick={music.toggleMute} aria-label={music.muted ? "Unmute" : "Mute"}>{music.muted ? "🔇" : "🔊"}</button><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={music.muted ? 0 : music.volume} onInput={(event) => music.setVolume(Number(event.currentTarget.value))} /></div>
      </div>
    </div>
  );
}

/** Desktop calendar widget — the real next couple of events, not a mockup. */
function MacCalendarWidget({ date }) {
  const { signedIn, currentUser } = useGame();
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    const from = todayKey();
    const to = toDayKey(new Date(Date.now() + 13 * 86400000));
    api
      .getEvents(currentUser, { from, to })
      .then((list) => { if (!cancelled) setEvents(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [signedIn, currentUser]);

  const upcoming = events.filter((e) => !e.completed).sort(compareEvents).slice(0, 2);
  const today = todayKey();

  return (
    <section className="mac-widget mac-calendar-widget">
      <header>
        <strong>{date.toLocaleDateString([], { month: "long" })}</strong>
        <b>{date.getDate()}</b>
      </header>
      <div>{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      {upcoming.length ? (
        upcoming.map((event) => (
          <div key={event.id} className="mac-calendar-event">
            <i className={`calendar-dot imp-${event.importance}`} aria-hidden="true" />
            <b>{event.title}</b>
            <small>{event.scheduledFor === today ? "Today" : event.scheduledFor.slice(5)} · {formatTimeRange(event)}</small>
          </div>
        ))
      ) : (
        <p>Nothing scheduled</p>
      )}
    </section>
  );
}

function LaptopOS({ onClose, music, initialApp = "browser" }) {
  const { signedIn, currentUser, applyReward } = useGame();
  const [activeApp, setActiveApp] = useState(initialApp);
  const [fullscreen, setFullscreen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [address, setAddress] = useState("zephyr://home");
  const [page, setPage] = useState("zephyr://home");
  const [notes, setNotes] = useState("Focus for today:\n• Finish the 3D study room\n• Review quests\n• Take a real break");
  const [spotifyView, setSpotifyView] = useState("home");
  const [showOfficial, setShowOfficial] = useState(false);
  const [desktopTime, setDesktopTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setDesktopTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  /**
   * Opening a study or coding destination earns a little XP. The server caps
   * and de-duplicates these, so a 0-XP answer is normal and never an error -
   * failures are swallowed so browsing can never be broken by the reward call.
   */
  const openPage = useCallback((raw) => {
    const next = String(raw || "").trim();
    if (!next) return;
    const url = next.includes("://") ? next : `https://${next}`;
    setAddress(url);
    setPage(url);

    if (!signedIn) return;
    const kind = classifySite(url);
    if (!kind) return;
    try {
      const host = new URL(url).hostname.toLowerCase();
      api
        .logProductive(currentUser, kind, host)
        .then((reward) => { if (reward?.xpGained > 0) applyReward(reward); })
        .catch(() => {});
    } catch (err) { /* unparseable address: nothing to log */ }
  }, [signedIn, currentUser, applyReward]);

  const openAddress = (event) => {
    event.preventDefault();
    openPage(address);
  };
  const openApp = (id) => { setActiveApp(id); setMinimized(false); };

  return (
    <section className={`laptop-os ${fullscreen ? "is-fullscreen" : "is-windowed"}`} role="dialog" aria-modal="true" aria-label="Study laptop">
      <div className="os-wallpaper" />
      <header className="os-topbar">
        <strong className="mac-apple">●</strong>
        <nav className="mac-menu"><b>Finder</b><span>File</span><span>Edit</span><span>View</span><span>Go</span><span>Window</span><span>Help</span></nav>
        <span className="mac-status">Study mode · Online</span>
        <div className="os-actions">
          <button type="button" onClick={() => setFullscreen((value) => !value)}>{fullscreen ? "Windowed" : "Full screen"}</button>
          <button type="button" onClick={onClose} aria-label="Return to room">Return to room</button>
        </div>
      </header>

      <nav className="os-desktop-icons" aria-label="Applications">
        {laptopApps.map((app) => (
          <button key={app.id} type="button" onDoubleClick={() => openApp(app.id)} onClick={() => openApp(app.id)}>
            <MacAppIcon app={app} />{app.label}
          </button>
        ))}
      </nav>

      <aside className="os-widget-stack" aria-label="Desktop widgets">
        <section className="mac-widget mac-clock-widget">
          <AnalogClock date={desktopTime} />
          <div><time>{desktopTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><span>{desktopTime.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span></div>
        </section>
        <MacCalendarWidget date={desktopTime} />
        <section className="mac-widget mac-focus-widget"><span>FOCUS</span><strong>1h 20m</strong><p>Daily goal · 67%</p><i><b /></i></section>
      </aside>

      <article className={`os-window ${minimized || !activeApp ? "is-minimized" : ""}`}>
        <header className="os-windowbar">
          <div className="os-dots">
            <button className="dot-close" type="button" onClick={() => setActiveApp("")} aria-label="Close application" />
            <button className="dot-minimize" type="button" onClick={() => setMinimized(true)} aria-label="Minimize application" />
            <button className="dot-maximize" type="button" onClick={() => setFullscreen((value) => !value)} aria-label="Toggle full screen" />
          </div>
          <strong>{laptopApps.find((app) => app.id === activeApp)?.label}</strong>
          <button type="button" onClick={() => setActiveApp("")} aria-label="Close application">×</button>
        </header>

        {activeApp === "browser" && (
          <div className="os-browser">
            <form onSubmit={openAddress}>
              <button type="button" onClick={() => { setAddress("zephyr://home"); setPage("zephyr://home"); }}>⌂</button>
              <input aria-label="Web address" value={address} onChange={(event) => setAddress(event.target.value)} />
              <button type="submit">Go</button>
            </form>
            {page === "zephyr://home" ? (
              <div className="os-home">
                <span>YOUR QUIET CORNER</span>
                <h2>What will you explore today?</h2>
                <p>Type a web address above, or open one of your study spaces.</p>
                <div>
                  <button type="button" onClick={() => openPage("https://wikipedia.org")}>Wikipedia</button>
                  <button type="button" onClick={() => openPage("https://developer.mozilla.org")}>MDN Docs</button>
                  <button type="button" onClick={() => openPage("https://leetcode.com")}>LeetCode</button>
                  <button type="button" onClick={() => openPage("https://khanacademy.org")}>Khan Academy</button>
                  <button type="button" onClick={() => openPage("https://example.com")}>Reading</button>
                </div>
              </div>
            ) : <iframe title="Zephyr browser" src={page} sandbox="allow-forms allow-scripts allow-same-origin allow-popups" />}
          </div>
        )}

        {activeApp === "spotify" && (
          <div className="os-spotify">
            <aside><strong>Spotify</strong><button type="button" className={spotifyView === "home" ? "active" : ""} onClick={() => setSpotifyView("home")}>⌂ Home</button><button type="button" className={spotifyView === "search" ? "active" : ""} onClick={() => setSpotifyView("search")}>⌕ Search</button><button type="button" className={spotifyView === "library" ? "active" : ""} onClick={() => setSpotifyView("library")}>▤ Your Library</button><small>OFFICIAL NCS PLAYLIST</small><button type="button" onClick={() => setShowOfficial((value) => !value)}>NCS Releases</button></aside>
            <div className="spotify-main">
              <div className="spotify-heading"><span>Playlist</span><h2>NCS Releases</h2><p>Copyright-free electronic music for studying, gaming and creating.</p></div>
              <MusicControls music={music} />
              {spotifyView === "search" && <label className="spotify-search">Search this playlist<input autoFocus placeholder="Song or artist" onChange={(event) => music.setQuery(event.target.value)} /></label>}
              <div className="spotify-track-list" aria-label="NCS songs">
                {music.tracks.filter((track) => `${track.title} ${track.artist}`.toLowerCase().includes(music.query.toLowerCase())).map((track) => (
                  <button type="button" key={track.title} className={music.track.title === track.title ? "active" : ""} onClick={() => music.select(music.tracks.indexOf(track))}>
                    <span>{music.track.title === track.title && music.playing ? "Ⅱ" : "▶"}</span><strong>{track.title}<small>{track.artist}</small></strong><em>NCS</em>
                  </button>
                ))}
              </div>
              <button type="button" className="spotify-official-toggle" onClick={() => setShowOfficial((value) => !value)}>{showOfficial ? "Hide" : "Browse"} official Spotify playlist</button>
              {showOfficial && <iframe title="NCS Releases on Spotify" src="https://open.spotify.com/embed/playlist/7sZbq8QGyMnhKPcLJvCUFD?utm_source=generator&amp;theme=0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />}
            </div>
          </div>
        )}

        {activeApp === "notes" && (
          <div className="os-notes"><label htmlFor="study-notes">Study notes</label><textarea id="study-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
        )}

        {activeApp === "files" && (
          <div className="os-files">
            <h2>My files</h2>
            <div><span>▤</span><strong>Quest journal</strong><small>Updated today</small></div>
            <div><span>▧</span><strong>Study references</strong><small>12 items</small></div>
            <div><span>♫</span><strong>Lo-Fi collection</strong><small>28 tracks</small></div>
          </div>
        )}

        {activeApp === "calendar" && <CalendarApp />}

        {activeApp === "cards" && <FlashcardsApp />}

        {activeApp === "trackers" && <StatsWidgets />}

        {activeApp === "settings" && <SettingsApp />}

        {!activeApp && <div className="os-empty">Choose an application from the desktop or dock.</div>}
      </article>

      <footer className="os-dock">
        {laptopApps.map((app) => <button key={app.id} type="button" className={activeApp === app.id && !minimized ? "active" : ""} onClick={() => openApp(app.id)} title={app.label}><MacAppIcon app={app} /></button>)}
      </footer>
    </section>
  );
}

function StudyGirlExperience() {
  const { settings } = useGame();
  const controls = useRef(null);
  const audioRef = useRef(null);
  const [bounds, setBounds] = useState(null);
  const [laptopOpen, setLaptopOpen] = useState(false);
  // Which app the laptop lands on, so a room widget can deep-link into it.
  const [laptopApp, setLaptopApp] = useState("browser");
  const [journalOpen, setJournalOpen] = useState(false);
  const [musicState, setMusicState] = useState({ playing: false, currentTime: 0, duration: 0 });
  const [volume, setVolumeState] = useState(0.75);
  const [muted, setMuted] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [savedTracks, setSavedTracks] = useState([]);
  const [musicQuery, setMusicQuery] = useState("");
  const playAfterTrackChange = useRef(false);

  const changeTrack = useCallback((direction, autoplay) => {
    playAfterTrackChange.current = autoplay;
    setTrackIndex((current) => shuffle
      ? (current + 1 + Math.floor(Math.random() * (NCS_TRACKS.length - 1))) % NCS_TRACKS.length
      : (current + direction + NCS_TRACKS.length) % NCS_TRACKS.length);
  }, [shuffle]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const sync = () => {
      const seekableDuration = audio.seekable.length ? audio.seekable.end(audio.seekable.length - 1) : 0;
      const duration = Number.isFinite(audio.duration) ? audio.duration : seekableDuration;
      setMusicState((state) => ({ ...state, currentTime: audio.currentTime, duration: duration || state.duration }));
    };
    const played = () => setMusicState((state) => ({ ...state, playing: true }));
    const paused = () => setMusicState((state) => ({ ...state, playing: false }));
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", sync);
    audio.addEventListener("play", played);
    audio.addEventListener("pause", paused);
    const ended = () => changeTrack(1, true);
    audio.addEventListener("ended", ended);
    return () => {
      audio.removeEventListener("timeupdate", sync);
      audio.removeEventListener("loadedmetadata", sync);
      audio.removeEventListener("play", played);
      audio.removeEventListener("pause", paused);
      audio.removeEventListener("ended", ended);
    };
  }, [changeTrack]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.load();
    setMusicState((state) => ({ ...state, currentTime: 0, duration: 0 }));
    if (playAfterTrackChange.current) audio.play().catch(() => {});
    playAfterTrackChange.current = false;
  }, [trackIndex]);

  const music = {
    ...musicState,
    track: NCS_TRACKS[trackIndex],
    tracks: NCS_TRACKS,
    shuffle,
    saved: savedTracks.includes(NCS_TRACKS[trackIndex].title),
    query: musicQuery,
    toggle: () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    },
    seek: (time) => {
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(time)) return;
      const maximum = audio.seekable.length ? audio.seekable.end(audio.seekable.length - 1) : musicState.duration;
      audio.currentTime = Math.max(0, Math.min(time, maximum || time));
      setMusicState((state) => ({ ...state, currentTime: audio.currentTime }));
    },
    previous: () => changeTrack(-1, musicState.playing),
    next: () => changeTrack(1, musicState.playing),
    select: (index) => {
      if (index === trackIndex) {
        if (audioRef.current?.paused) audioRef.current.play().catch(() => {});
        return;
      }
      playAfterTrackChange.current = true;
      setTrackIndex(index);
    },
    toggleShuffle: () => setShuffle((value) => !value),
    toggleSaved: () => setSavedTracks((tracks) => tracks.includes(NCS_TRACKS[trackIndex].title) ? tracks.filter((title) => title !== NCS_TRACKS[trackIndex].title) : [...tracks, NCS_TRACKS[trackIndex].title]),
    volume,
    muted,
    setVolume: (nextVolume) => {
      const next = Math.max(0, Math.min(1, nextVolume));
      setVolumeState(next);
      setMuted(false);
      if (audioRef.current) { audioRef.current.volume = next; audioRef.current.muted = false; }
    },
    toggleMute: () => setMuted((value) => {
      if (audioRef.current) audioRef.current.muted = !value;
      return !value;
    }),
    setQuery: setMusicQuery,
  };

  const onReady = useMemo(() => (nextBounds) => setBounds(nextBounds), []);
  const winWidth = typeof window !== "undefined" ? window.innerWidth : 1000;

  return (
    <main className="study-page">
      <audio ref={audioRef} src={NCS_TRACKS[trackIndex].url} preload="metadata" />
      {/* near:0.01 with far:5000 on a model hundreds of units wide wrecked depth
          precision and made surfaces z-fight. The camera never gets closer than
          110 units, so a near plane of 1 is plenty. */}
      <Canvas camera={{ fov: 58, near: 1, far: 5000, position: [0, 2, 7] }} dpr={[1, 1.5]}>
        <color attach="background" args={["#d88973"]} />
        {/* Textures are hand-painted with their own light baked in, so this is
            deliberately flat and bright to match the Sketchfab reference -
            strong directionals only muddy them. */}
        <ambientLight intensity={1.45} color="#fff6ec" />
        <hemisphereLight intensity={0.6} skyColor="#fff4e4" groundColor="#c09a78" />
        <directionalLight position={[-220, 320, 260]} intensity={0.35} color="#fff0d8" />
        <directionalLight position={[180, 130, -180]} intensity={0.18} color="#cfe2ff" />
        <Suspense fallback={<Loader />}>
          <WindowSky />
          <StudyGirlModel onReady={onReady} />
          <LaptopHotspot onOpen={() => { setLaptopApp("browser"); setLaptopOpen(true); }} disabled={laptopOpen} />
        </Suspense>
        <OrbitCamera controls={controls} bounds={bounds} enabled={!laptopOpen && !journalOpen} />
      </Canvas>

      <button className="study-back" type="button" onClick={() => window.history.back()}>← Back</button>

      {!laptopOpen && !journalOpen && (settings?.showHudWidget !== false) && (
        <DraggableWidget id="hud" defaultPos={{ x: 22, y: 112 }}>
          <RoomHud onOpenJournal={() => setJournalOpen(true)} />
        </DraggableWidget>
      )}

      {!laptopOpen && !journalOpen && (
        <button type="button" className="journal-open-button" onClick={() => setJournalOpen(true)}>
          <span aria-hidden="true">&#9634;</span> Quest journal
        </button>
      )}
      <QuestJournal open={journalOpen} onClose={() => setJournalOpen(false)} />

      {!laptopOpen && (settings?.showClockWidget !== false) && (
        <DraggableWidget id="clock" defaultPos={{ x: Math.max(20, winWidth - 250), y: 112 }}>
          <RoomClockWidget />
        </DraggableWidget>
      )}

      {musicState.playing && !laptopOpen && (
        <DraggableWidget id="music" defaultPos={{ x: Math.max(20, Math.floor(winWidth / 2) - 180), y: 16 }}>
          <div className="room-music-widget"><MusicControls music={music} compact /></div>
        </DraggableWidget>
      )}

      {!laptopOpen && !journalOpen && settings?.showTrackersWidget && (
        <DraggableWidget id="trackers" defaultPos={{ x: Math.max(20, winWidth - 300), y: 240 }}>
          <RoomTrackersWidget onOpenApp={() => setLaptopOpen(true)} />
        </DraggableWidget>
      )}

      {/* Defaults to on: the schedule is only useful if it is visible. */}
      {!laptopOpen && !journalOpen && settings?.showCalendarWidget !== false && (
        <DraggableWidget id="calendar" defaultPos={{ x: Math.max(20, winWidth - 300), y: 440 }}>
          <RoomCalendarWidget onOpenApp={(id) => { setLaptopApp(id); setLaptopOpen(true); }} />
        </DraggableWidget>
      )}

      {!laptopOpen && !journalOpen && settings?.showFlashcardsWidget && (
        <DraggableWidget id="flashcards" defaultPos={{ x: 22, y: 310 }}>
          <RoomFlashcardsWidget onOpenApp={() => setLaptopOpen(true)} />
        </DraggableWidget>
      )}

      {laptopOpen && <LaptopOS onClose={() => setLaptopOpen(false)} music={music} initialApp={laptopApp} />}
    </main>
  );
}

export default function StudyGirlPage() {
  return (
    <GameProvider>
      <StudyGirlExperience />
    </GameProvider>
  );
}

useGLTF.preload(MODEL_URL);
