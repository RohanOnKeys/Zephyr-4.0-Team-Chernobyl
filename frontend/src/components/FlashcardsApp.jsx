import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../context/GameContext";
import * as api from "../lib/api";
import RichText from "./RichText";

const EMPTY_CARD = { front: "", back: "", imageUrl: null, imageDeleteUrl: null, hasLatex: false };

/**
 * Flashcards app inside the laptop OS.
 *
 * Three views: the deck shelf, a card editor, and an autoplaying slideshow that
 * grants Intellect XP through the same progression engine the quests use.
 */
export default function FlashcardsApp() {
  const { currentUser, signedIn, applyReward, settings } = useGame();

  const [decks, setDecks] = useState([]);
  const [activeDeck, setActiveDeck] = useState(null);
  const [cards, setCards] = useState([]);
  const [view, setView] = useState("decks");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadDecks = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      setDecks(await api.getDecks(currentUser));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { loadDecks(); }, [loadDecks]);

  async function openDeck(deck, nextView = "edit") {
    setActiveDeck(deck);
    setLoading(true);
    try {
      setCards(await api.getCards(currentUser, deck.id));
      setView(nextView);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!signedIn) {
    return (
      <div className="cards-app cards-guest">
        <h2>Flashcards</h2>
        <p>Sign in to build decks that earn you Intellect XP.</p>
      </div>
    );
  }

  return (
    <div className="cards-app">
      {message && (
        <p className="cards-message" role="alert" onAnimationEnd={() => setMessage("")}>{message}</p>
      )}

      {view === "decks" && (
        <DeckShelf
          decks={decks}
          loading={loading}
          onCreate={loadDecks}
          onOpen={openDeck}
          onDelete={loadDecks}
          setMessage={setMessage}
        />
      )}

      {view === "edit" && activeDeck && (
        <DeckEditor
          deck={activeDeck}
          cards={cards}
          setCards={setCards}
          onBack={() => { setView("decks"); loadDecks(); }}
          onStudy={() => setView("study")}
          setMessage={setMessage}
        />
      )}

      {view === "study" && activeDeck && (
        <Slideshow
          deck={activeDeck}
          cards={cards}
          autoplaySeconds={settings.autoplaySeconds ?? 8}
          reducedMotion={settings.reducedMotion}
          onExit={() => { setView("edit"); loadDecks(); }}
          onReward={applyReward}
          currentUser={currentUser}
          setMessage={setMessage}
        />
      )}
    </div>
  );
}

function DeckShelf({ decks, loading, onCreate, onOpen, onDelete, setMessage }) {
  const { currentUser, settings, saveSettings } = useGame();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.createDeck(currentUser, { title: title.trim() });
      setTitle("");
      onCreate();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(deck) {
    setBusy(true);
    try {
      await api.deleteDeck(currentUser, deck.id);
      onDelete();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="cards-head">
        <div><span className="cards-kicker">Study</span><h2>Flashcard decks</h2></div>
        <form className="cards-new" onSubmit={create}>
          <input
            value={title}
            maxLength={80}
            placeholder="New deck name"
            aria-label="New deck name"
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" disabled={busy || !title.trim()}>Create</button>
        </form>
      </header>

      <div style={{ margin: "0.5rem 0 1rem", padding: "0.65rem 0.85rem", background: "rgba(25, 40, 50, 0.06)", border: "1px solid rgba(25, 40, 50, 0.14)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <strong style={{ display: "block", color: "#1e293b", fontSize: "0.8rem", fontWeight: "700" }}>Show Flashcards widget on 3D room</strong>
          <small style={{ color: "#475569", fontSize: "0.68rem" }}>Pins interactive flashcards directly to your room wallpaper.</small>
        </div>
        <input
          type="checkbox"
          style={{ width: "1.15rem", height: "1.15rem", cursor: "pointer", accentColor: "#0284c7" }}
          checked={Boolean(settings.showFlashcardsWidget)}
          onChange={(e) => saveSettings({ showFlashcardsWidget: e.target.checked })}
        />
      </div>

      {loading && <p className="cards-loading">Loading decks…</p>}

      {!loading && !decks.length && (
        <p className="cards-empty">No decks yet. Create one above — finishing a deck each day earns Intellect XP.</p>
      )}

      <ul className="deck-grid">
        {decks.map((deck) => (
          <li key={deck.id} className="deck-card">
            <button type="button" className="deck-open" onClick={() => onOpen(deck)}>
              <strong>{deck.title}</strong>
              <small>{deck.cardCount} card{deck.cardCount === 1 ? "" : "s"}</small>
              {deck.studiedToday && <em className="deck-done">Studied today ✓</em>}
            </button>
            <div className="deck-tools">
              <button type="button" onClick={() => onOpen(deck, "study")} disabled={!deck.cardCount}>
                Play
              </button>
              <button type="button" className="deck-delete" onClick={() => remove(deck)} disabled={busy}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function DeckEditor({ deck, cards, setCards, onBack, onStudy, setMessage }) {
  const { currentUser, applyReward } = useGame();
  const [draft, setDraft] = useState(EMPTY_CARD);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  async function pickImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("That file isn't an image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMessage("Images must be 8MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      // Read as a data URL; the backend proxies it to the image host so the
      // API key never reaches the browser.
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read that file"));
        reader.readAsDataURL(file);
      });

      const uploaded = await api.uploadImage(currentUser, dataUrl, file.name);
      setDraft((d) => ({ ...d, imageUrl: uploaded.url, imageDeleteUrl: uploaded.deleteUrl }));
    } catch (err) {
      setMessage(err.message || "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addCard(event) {
    event.preventDefault();
    if (!draft.front.trim()) {
      setMessage("The front of the card can't be empty.");
      return;
    }

    setSaving(true);
    try {
      const created = await api.createCard(currentUser, deck.id, {
        ...draft,
        front: draft.front.trim(),
        back: draft.back.trim(),
        // Flag maths so the slideshow knows to give the card more room.
        hasLatex: /\$|\\\(|\\\[/.test(draft.front + draft.back),
      });
      setCards((current) => [...current, created]);
      setDraft(EMPTY_CARD);

      // Authoring a card earns a little XP, capped server-side: a 0-XP answer
      // is the normal daily-cap case, and a failure must never block the save.
      api
        .logProductive(currentUser, "flashcard_created", created.id)
        .then((reward) => { if (reward?.xpGained > 0) applyReward(reward); })
        .catch(() => {});
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeCard(card) {
    const previous = cards;
    setCards((current) => current.filter((c) => c.id !== card.id));
    try {
      await api.deleteCard(currentUser, deck.id, card.id);
    } catch (err) {
      setCards(previous);
      setMessage(err.message);
    }
  }

  return (
    <>
      <header className="cards-head">
        <div>
          <button type="button" className="cards-back" onClick={onBack}>← Decks</button>
          <h2>{deck.title}</h2>
        </div>
        <button type="button" className="cards-play" onClick={onStudy} disabled={!cards.length}>
          ▶ Play slideshow
        </button>
      </header>

      <form className="card-composer" onSubmit={addCard}>
        <label>
          <span>Front</span>
          <textarea
            value={draft.front}
            rows={2}
            placeholder="What is the derivative of $x^2$?"
            onChange={(e) => setDraft({ ...draft, front: e.target.value })}
          />
        </label>
        <label>
          <span>Back</span>
          <textarea
            value={draft.back}
            rows={2}
            placeholder="$\\frac{d}{dx}x^2 = 2x$"
            onChange={(e) => setDraft({ ...draft, back: e.target.value })}
          />
        </label>

        <div className="card-composer-tools">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            id="card-image"
            className="visually-hidden"
            onChange={pickImage}
          />
          <label htmlFor="card-image" className="card-upload">
            {uploading ? "Uploading…" : draft.imageUrl ? "Change image" : "Add image"}
          </label>
          {draft.imageUrl && (
            <>
              <img src={draft.imageUrl} alt="" className="card-thumb" />
              <button type="button" onClick={() => setDraft({ ...draft, imageUrl: null, imageDeleteUrl: null })}>
                Remove
              </button>
            </>
          )}
          <button type="submit" className="cards-primary" disabled={saving || uploading}>
            {saving ? "Adding…" : "Add card"}
          </button>
        </div>

        <p className="cards-hint">
          Wrap maths in <code>$…$</code> for inline or <code>$$…$$</code> for a centred block.
        </p>
      </form>

      <ul className="card-list">
        {!cards.length && <li className="cards-empty">No cards yet. Add the first one above.</li>}
        {cards.map((card, index) => (
          <li key={card.id} className="card-row">
            <span className="card-index">{index + 1}</span>
            <div className="card-faces">
              <RichText text={card.front} className="card-front" />
              <RichText text={card.back} className="card-back" />
              {card.imageUrl && <img src={card.imageUrl} alt="" loading="lazy" />}
            </div>
            <button type="button" onClick={() => removeCard(card)} aria-label={`Delete card ${index + 1}`}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Slideshow({ deck, cards, autoplaySeconds, reducedMotion, onExit, onReward, currentUser, setMessage }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [claimed, setClaimed] = useState(false);
  const timerRef = useRef(null);

  const card = cards[index];
  const isLast = index === cards.length - 1;

  const go = useCallback(
    (delta) => {
      setRevealed(false);
      setIndex((current) => (current + delta + cards.length) % cards.length);
    },
    [cards.length]
  );

  // Autoplay reveals the answer first, then moves on, so a viewer always gets
  // to see the back of the card before it flips away.
  useEffect(() => {
    if (!playing || !cards.length) return undefined;

    const delay = autoplaySeconds * 1000;
    timerRef.current = window.setTimeout(
      () => {
        if (!revealed) setRevealed(true);
        else go(1);
      },
      revealed ? delay * 0.8 : delay
    );

    return () => window.clearTimeout(timerRef.current);
  }, [playing, revealed, index, autoplaySeconds, cards.length, go]);

  // Claim the daily Intellect XP once the deck has been seen through.
  useEffect(() => {
    if (claimed || !isLast || !revealed || !cards.length) return;
    setClaimed(true);

    api
      .studyDeck(currentUser, deck.id, cards.length)
      .then((reward) => {
        onReward(reward);
        if (reward.alreadyStudiedToday) setMessage("Already studied today — come back tomorrow for more XP.");
      })
      .catch((err) => setMessage(err.message));
  }, [claimed, isLast, revealed, cards.length, currentUser, deck.id, onReward, setMessage]);

  // Keyboard control: space reveals/advances, arrows navigate, escape exits.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") return onExit();
      if (event.key === "ArrowRight") return go(1);
      if (event.key === "ArrowLeft") return go(-1);
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setRevealed((r) => !r);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onExit]);

  if (!card) {
    return (
      <div className="slideshow-empty">
        <p>This deck has no cards yet.</p>
        <button type="button" onClick={onExit}>Back</button>
      </div>
    );
  }

  return (
    <div className="slideshow" onMouseEnter={() => setPlaying(false)} onMouseLeave={() => setPlaying(true)}>
      <header className="slideshow-bar">
        <button type="button" onClick={onExit} className="cards-back">← {deck.title}</button>
        <span className="slideshow-count">{index + 1} / {cards.length}</span>
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚" : "▶"}
        </button>
      </header>

      <div className="slideshow-progress" aria-hidden="true">
        <i style={{ width: `${((index + 1) / cards.length) * 100}%` }} />
      </div>

      <button
        type="button"
        className={`slide-card ${revealed ? "is-revealed" : ""} ${reducedMotion ? "is-still" : ""}`}
        onClick={() => setRevealed((r) => !r)}
        aria-live="polite"
      >
        <div className="slide-face slide-front">
          <RichText text={card.front} />
          {card.imageUrl && <img src={card.imageUrl} alt="" />}
        </div>
        {revealed && (
          <div className="slide-face slide-answer">
            <RichText text={card.back} />
          </div>
        )}
        {!revealed && <span className="slide-prompt">Click or press space to reveal</span>}
      </button>

      <footer className="slideshow-nav">
        <button type="button" onClick={() => go(-1)} aria-label="Previous card">←</button>
        <button type="button" onClick={() => setRevealed((r) => !r)}>
          {revealed ? "Hide answer" : "Reveal"}
        </button>
        <button type="button" onClick={() => go(1)} aria-label="Next card">→</button>
      </footer>
    </div>
  );
}
