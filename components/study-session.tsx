import { inArray } from 'drizzle-orm';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Ratings } from '@/constants/theme';
import { db } from '@/db/client';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { cards, type Card } from '@/db/schema';
import { rateCard, undoLatestReview, type ReviewRating } from '@/services/review';
import { Rating } from '@/services/scheduler';
import { shuffleArray } from '@/services/shuffle';
import { speakEnglish, speakGerman, stopSpeech } from '@/services/speech';
import { spokenLemma } from '@/services/speech-helpers';
import type { FrequentNewCard } from '@/hooks/use-cards';
import { useAutoPlayWord, useRepeatCount, useShuffleCards } from '@/hooks/use-settings';

const RATINGS: { label: string; rating: ReviewRating; color: string }[] = [
  { label: 'Again', rating: Rating.Again, color: Ratings.again },
  { label: 'Hard', rating: Rating.Hard, color: Ratings.hard },
  { label: 'Good', rating: Rating.Good, color: Ratings.good },
  { label: 'Easy', rating: Rating.Easy, color: Ratings.easy },
];

/** Promise-resolving sleep; used by the Repeat loop's pacing. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a non-awaitable TTS call (speakGerman / speakEnglish — both fire-and-
 * forget) into a Promise that resolves when playback finishes, is stopped, or
 * errors. Used by the Repeat loop to await each utterance before flipping.
 *
 * The Promise NEVER rejects — onError resolves the same as onDone — because
 * the loop treats all three terminal states identically: move to the next
 * step. Surfacing the error here would force the loop into a catch that has
 * no recovery; the error toast is already shown by `services/speech.ts`.
 */
function speakAwaitable(
  dispatch: (options: { onDone: () => void; onStopped: () => void; onError: () => void }) => void,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    dispatch({
      onDone: settle,
      onStopped: settle,
      onError: settle,
    });
  });
}

export type StudySessionProps = {
  loading: boolean;
  error: Error | null;
  dueCards: Card[];
  refetch: () => Promise<void>;
  /** Optional frequency-weighted "seen often" rail rendered above the card. */
  suggested?: FrequentNewCard[];
  /** Headline shown when no cards are due. */
  emptyTitle: string;
  /** Body copy under `emptyTitle`. */
  emptyBody: string;
};

/**
 * Shared study UI. Renders a flippable card with FSRS rating buttons and
 * tracks queue progression locally so mid-session tab-switches or query
 * refetches don't shuffle the order. Used by both the global Study tab
 * (`app/(tabs)/study.tsx`) and per-folder study (`app/study-folder/[slug].tsx`).
 */
export function StudySession({
  loading,
  error,
  dueCards,
  refetch,
  suggested,
  emptyTitle,
  emptyBody,
}: StudySessionProps) {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].background;

  const [queue, setQueue] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  // Driven by expo-speech callbacks. Controls the pulsing halo on the inline
  // speaker icon next to the lemma — true while audio is actually playing.
  const [isPlayingWord, setIsPlayingWord] = useState(false);
  const haloAnim = useRef(new Animated.Value(0)).current;
  // Persistent "auto-play the lemma when the card flips" preference. Mirror
  // it into a ref so the auto-play effect can read the latest value without
  // re-running (and interrupting in-flight audio) every time the user
  // toggles the speaker icon mid-card. The toggle takes effect on the NEXT
  // flip rather than disturbing the current playback.
  const { enabled: autoPlayWord, setEnabled: setAutoPlayWord } = useAutoPlayWord();
  const autoPlayRef = useRef(autoPlayWord);
  autoPlayRef.current = autoPlayWord;

  // Shuffle is read once at queue-snapshot time. Toggling mid-session does
  // NOT reshuffle the in-flight queue — that would be jarring; the new
  // setting takes effect on the next session (when the queue is null and
  // gets re-snapshotted from fresh `dueCards`). The ref lets the snapshot
  // effect read the latest value without re-firing.
  const { enabled: shuffleCards, setEnabled: setShuffleCards } = useShuffleCards();
  const shuffleCardsRef = useRef(shuffleCards);
  shuffleCardsRef.current = shuffleCards;

  // Whether the Flashcard-options modal (bell icon in the header) is open.
  const [optionsOpen, setOptionsOpen] = useState(false);

  // Persistent "how many times the Repeat button cycles the card aloud
  // before auto-rating Again". Setter is also exposed in the bell modal as
  // a stepper. Mirror into a ref so the loop reads the latest value at
  // start-of-loop time without re-running the loop's closures.
  const { count: repeatCount, setCount: setRepeatCount } = useRepeatCount();
  const repeatCountRef = useRef(repeatCount);
  repeatCountRef.current = repeatCount;

  // Repeat-loop state. The loop runs as an async function — these state
  // values + refs let the rest of the UI react (button → Stop, tap-to-flip
  // disabled, auto-play suppressed) while the loop walks through its
  // iterations. `isRepeatingRef` is read by the auto-play `useEffect` and
  // the PanResponder so a mid-render TTS dispatch doesn't fight the loop;
  // `repeatCancelRef` is the cancellation flag the loop polls between awaits.
  const [isRepeating, setIsRepeating] = useState(false);
  const [repeatProgress, setRepeatProgress] = useState(0);
  const isRepeatingRef = useRef(false);
  const repeatCancelRef = useRef(false);

  // Stack of pre-rate snapshots, one per rating this session. Each entry
  // is the Card object as it was when we rated it (the queue array is
  // snapshotted once and never mutated when ratings happen, so the FSRS
  // columns on `queue[prevIndex]` still reflect the pre-rate state) plus
  // where we were in the queue. The Undo button (header, left of the bell)
  // pops the top entry, walks index back, re-reveals the card, and
  // restores the DB through `undoLatestReview`. State mirror so the
  // button's enabled-ness re-renders on push/pop.
  const undoStack = useRef<{ card: Card; prevIndex: number }[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  // Snapshot of `shuffleCards` taken at the moment the modal opens. On
  // close, an OFF → ON transition triggers a one-shot reshuffle of the
  // upcoming portion of the queue. ON → ON does nothing (the user might
  // just be toggling Auto-play and would be surprised by a reshuffle).
  const initialShuffleRef = useRef(false);

  // Swipe-to-rate (either face of the card). Drag left for "Still Learning"
  // (=Again) or right for "Know" (=Good). The 4 rating buttons (which only
  // appear on the back) remain available for finer-grained ratings
  // (Hard / Easy). Swiping on the FRONT is a deliberate shortcut: the user
  // is saying "I know this without needing to flip" (right) or "I clearly
  // don't recall this" (left) — both are valid recall signals.
  //
  // `panResponder` is created once via useMemo (stable identity so the gesture
  // system doesn't reattach handlers every render) and routes commits through
  // `commitSwipeRef`, which is reassigned every render so it captures the
  // current `onRate` closure (which in turn closes over the current card).
  const swipeX = useRef(new Animated.Value(0)).current;
  const swipeY = useRef(new Animated.Value(0)).current;
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;
  // Four-way swipe-to-rate. Horizontal axis maps to Again/Good (the most
  // common ratings in a session); vertical axis maps to Hard/Easy.
  //   left  → Again   right → Good
  //   up    → Hard    down  → Easy
  const commitSwipeRef =
    useRef<(dir: 'left' | 'right' | 'up' | 'down') => void>(() => {});

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Don't claim on touch start — let taps through to the inner Pressable.
        onStartShouldSetPanResponder: () => false,
        // Claim on any displacement past 8px on either axis (we now handle
        // both horizontal and vertical swipes). Direction is decided at
        // release by whichever axis dominates AND passes the threshold;
        // sub-threshold gestures spring back. Dropping the old `dx > dy`
        // dominance check here means vertical swipes are now accepted too —
        // there's no scroll surface in the card view, so claiming vertical
        // is safe.
        onMoveShouldSetPanResponder: (_, g) =>
          !submittingRef.current &&
          !isRepeatingRef.current &&
          (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8),
        onPanResponderGrant: () => {
          swipeX.setValue(0);
          swipeY.setValue(0);
        },
        // PanResponder events originate in JS, so the move animation must
        // use the JS driver. The derived overlay opacity + card rotate are
        // also JS-driven for consistency — fine perf-wise at one card.
        onPanResponderMove: Animated.event(
          [null, { dx: swipeX, dy: swipeY }],
          { useNativeDriver: false },
        ),
        onPanResponderRelease: (_, g) => {
          const THRESHOLD = 120;
          const ax = Math.abs(g.dx);
          const ay = Math.abs(g.dy);
          // Dominant axis wins. If the dominant axis also clears the
          // threshold, commit in that direction. Otherwise spring both
          // axes back to 0 (the user gave up mid-swipe).
          if (ax > ay) {
            if (g.dx > THRESHOLD) return commitSwipeRef.current('right');
            if (g.dx < -THRESHOLD) return commitSwipeRef.current('left');
          } else {
            if (g.dy > THRESHOLD) return commitSwipeRef.current('down');
            if (g.dy < -THRESHOLD) return commitSwipeRef.current('up');
          }
          Animated.spring(swipeX, { toValue: 0, useNativeDriver: false }).start();
          Animated.spring(swipeY, { toValue: 0, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(swipeX, { toValue: 0, useNativeDriver: false }).start();
          Animated.spring(swipeY, { toValue: 0, useNativeDriver: false }).start();
        },
      }),
    [swipeX, swipeY],
  );

  // Snapshot the queue once, the first time we have data. Re-rendering
  // mid-session (a tab switch causing a re-query) must NOT reshuffle order.
  // If the `shuffleCards` setting is on at snapshot time, we randomize the
  // order via Fisher-Yates before locking the queue in; the setting is
  // intentionally NOT re-checked on every render so toggling mid-session
  // doesn't disturb the in-flight order.
  useEffect(() => {
    if (queue === null && !loading && dueCards.length > 0) {
      setQueue(shuffleCardsRef.current ? shuffleArray(dueCards) : dueCards);
    }
  }, [queue, loading, dueCards]);

  // Mirror the latest queue/index into refs so the focus-pruning effect
  // can read them without re-subscribing when they change. Re-subscribing
  // every rate would needlessly fire the DB-existence query on every card
  // advance; we only want it to run when the user actually navigates back
  // to study (e.g. returning from the card detail screen).
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const indexRef = useRef(index);
  indexRef.current = index;

  // When the study screen regains focus (e.g. user returned from the card
  // detail screen after tapping Ignore or Delete), prune any cards in
  // `queue[index..]` that no longer exist in the DB. The local queue is
  // snapshotted once and tracked by index — without this, a deleted card
  // would stay visible and "View details" would route to `/card/[id]` and
  // hit the "Card not found" empty state.
  //
  // We only check `queue[index..]` (the upcoming cards). Cards before the
  // current index have already been rated and progressed past — they
  // intentionally stay in the queue array as historical, even if deleted
  // externally. We never touch the index here either: filtering preserves
  // it, so the next-in-line card slides into the current position. If the
  // current card itself was the one removed, we also reset `revealed` to
  // false so the new current card appears on its front (not magically
  // flipped to the back the deleted card was on).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const q = queueRef.current;
        const i = indexRef.current;
        if (q === null || i >= q.length) return;
        const remaining = q.slice(i);
        if (remaining.length === 0) return;
        const remainingIds = remaining.map((c) => c.id);
        const rows = await db
          .select({ id: cards.id })
          .from(cards)
          .where(inArray(cards.id, remainingIds))
          .all();
        if (cancelled) return;
        const existSet = new Set(rows.map((r) => r.id));
        if (remaining.every((c) => existSet.has(c.id))) return;
        const filtered = q.filter((c, idx) => idx < i || existSet.has(c.id));
        // Reset reveal only if the current slot's card actually changed.
        // If only later cards were pruned, the current card is unchanged
        // and we should leave the reveal state alone (the user might be
        // mid-flip on the current card).
        const currentChanged = filtered[i]?.id !== q[i]?.id;
        setQueue(filtered);
        if (currentChanged) setRevealed(false);
      })().catch((e) => console.warn('Study-queue prune failed', e));
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // The current card is computed below; capture its id + lemma here so the
  // auto-play effect's dependencies are primitive (the card object itself
  // wouldn't be a stable identity across renders).
  const currentCard = queue && index < queue.length ? queue[index] : null;
  const currentLemma = currentCard?.lemma ?? null;
  const currentGender = currentCard?.gender ?? null;
  const currentCardId = currentCard?.id ?? null;

  // Slide the newly-mounted card into center. After a swipe commit, the
  // commit handler teleports the active axis (swipeX or swipeY) to ±600
  // (off-screen on the OPPOSITE side from the swipe) before React advances
  // state, so the new card mounts off-screen — this spring is the visible
  // "slide in from the other side of the deck" animation. The non-active
  // axis is already at 0 (snapped by the commit handler to prevent
  // angled fling), so its spring is a no-op. On initial mount and on
  // same-card re-renders, both axes are 0 — both springs no-op visually.
  // `swipeX` / `swipeY` have stable identity (from `useRef`).
  useEffect(() => {
    Animated.spring(swipeX, {
      toValue: 0,
      useNativeDriver: false,
      speed: 16,
      bounciness: 0,
    }).start();
    Animated.spring(swipeY, {
      toValue: 0,
      useNativeDriver: false,
      speed: 16,
      bounciness: 0,
    }).start();
  }, [currentCardId, swipeX, swipeY]);

  // Auto-play the lemma the moment the back of the card is revealed. Gated
  // by the persistent `autoPlayWord` setting (read via ref so a mid-card
  // toggle doesn't disturb in-flight audio). Tapping the inline speaker
  // icon below always replays the word regardless of the setting.
  //
  // For nouns we speak "<article> <lemma>" (e.g. "der Tag") so the
  // listener hears the gender — that's the part of German vocab that's
  // hard to recall from spelling alone. Non-nouns get just the lemma.
  // See `spokenLemma` in services/speech-helpers.ts.
  useEffect(() => {
    if (!revealed || !currentLemma) return;
    if (!autoPlayRef.current) return;
    // Suppress when the Repeat loop is running — the loop manages its own
    // TTS calls and a competing speakGerman here would interrupt it. The
    // loop sets `isRepeatingRef.current = true` BEFORE the first
    // setRevealed(true), so this ref read is always up-to-date by the time
    // the effect fires for the loop's flip.
    if (isRepeatingRef.current) return;
    stopSpeech();
    speakGerman(spokenLemma(currentLemma, currentGender), {
      onStart: () => setIsPlayingWord(true),
      onDone: () => setIsPlayingWord(false),
      onStopped: () => setIsPlayingWord(false),
      onError: () => setIsPlayingWord(false),
    });
    return () => {
      stopSpeech();
      setIsPlayingWord(false);
    };
  }, [revealed, currentCardId, currentLemma, currentGender]);

  // Loop a scale+opacity pulse on the halo behind the inline speaker while
  // the word is playing. Stops cleanly when playback ends and resets the
  // animated value so the next play starts from zero opacity.
  useEffect(() => {
    if (!isPlayingWord) {
      haloAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(haloAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.timing(haloAnim, { toValue: 0, duration: 550, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isPlayingWord, haloAnim]);

  if (loading && queue === null) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Error: {error.message}</ThemedText>
      </ThemedView>
    );
  }

  if (queue === null || queue.length === 0) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="title">{emptyTitle}</ThemedText>
        <ThemedText style={styles.empty}>{emptyBody}</ThemedText>
        {suggested && suggested.length > 0 && (
          <View style={styles.suggestedBlock}>
            <ThemedText type="subtitle" style={styles.suggestedHeader}>
              Suggested next
            </ThemedText>
            <SuggestedRail
              items={suggested}
              tint={tint}
              onTint={onTint}
              onTap={(c) => router.push(`/card/${c.id}`)}
            />
          </View>
        )}
      </ThemedView>
    );
  }

  if (index >= queue.length) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="title">Session complete</ThemedText>
        <ThemedText style={styles.empty}>
          Reviewed {sessionCount} card{sessionCount === 1 ? '' : 's'}. Come back later when more
          are due.
        </ThemedText>
        <Pressable
          style={[styles.detailBtn, { borderColor: tint, marginTop: 16, paddingHorizontal: 24 }]}
          onPress={() => {
            setIndex(0);
            setSessionCount(0);
            setRevealed(false);
            setQueue(null);
            // Clear the undo stack — its entries reference Card objects + a
            // `prevIndex` from the queue we're about to throw away. Leaving
            // them behind would re-enable the Undo button once the new queue
            // snapshots, and tapping it would walk the index to a stale
            // position AND fire `undoLatestReview` against a card whose
            // recent review log might belong to an unrelated earlier session.
            undoStack.current = [];
            setUndoCount(0);
            refetch();
          }}>
          <ThemedText>Start over</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const card = currentCard;
  if (!card) return null;

  const replayWord = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (!card.lemma) return;
    stopSpeech();
    speakGerman(spokenLemma(card.lemma, card.gender), {
      onStart: () => setIsPlayingWord(true),
      onDone: () => setIsPlayingWord(false),
      onStopped: () => setIsPlayingWord(false),
      onError: () => setIsPlayingWord(false),
    });
  };

  const playSentence = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (!card.exampleDe) return;
    stopSpeech();
    speakGerman(card.exampleDe);
  };

  // Always show the English translation on the front. German lemma (+ gender,
  // example, etc.) is the answer revealed on the back — production-recall
  // direction, the user's preference.
  const frontWord = card.translationEn ?? card.lemma;
  // Only offer the English speaker button when we actually have an English
  // translation — falling back to the lemma would speak the German word
  // with an English voice, which sounds wrong.
  const hasEnglishFront = !!card.translationEn;

  const replayWordEn = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (!hasEnglishFront || !frontWord) return;
    // Don't interrupt the Repeat loop — it has its own TTS queue.
    if (isRepeatingRef.current) return;
    stopSpeech();
    speakEnglish(frontWord);
  };

  /**
   * Run the Repeat-X-times loop. Each iteration plays English → flips to the
   * German side → plays German → flips back, with the front-back-front cycle
   * pacing on `sleep()` between TTS calls so iOS has time to settle voice
   * loading and React has time to commit the flip animation. On the LAST
   * iteration we leave the card on the German side (the natural "you saw
   * the answer" position) before auto-rating Again.
   *
   * Cancellation is poll-based: every `await` checkpoint reads
   * `repeatCancelRef` and bails. The Stop button + tapping the card flip
   * both set the cancel flag and call `stopSpeech()` — the in-flight TTS
   * promise resolves via its `onStopped` callback, the loop sees the flag,
   * `finally` clears state, and we return WITHOUT firing the auto-Again.
   *
   * Auto-Again policy: the loop is the "drill this aloud then push it back
   * to the queue" affordance. Completing it without cancellation always
   * fires onRate(Again). User-cancelled runs do NOT auto-rate, since the
   * cancellation signal means "I changed my mind, don't advance."
   *
   * Suppression of the existing auto-play: `isRepeatingRef.current = true`
   * is set synchronously BEFORE the first `setRevealed(true)`, so the
   * auto-play effect's ref read bails on the loop's flips. See the effect.
   */
  const runRepeatLoop = async () => {
    if (isRepeatingRef.current) return;
    if (submittingRef.current) return;
    if (!hasEnglishFront || !frontWord || !card.lemma) return;
    const count = repeatCountRef.current;
    if (count < 1) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    isRepeatingRef.current = true;
    repeatCancelRef.current = false;
    setIsRepeating(true);
    setRepeatProgress(0);
    // Pin to the front so the very first English TTS lines up with the
    // visible side, no matter where the user tapped Repeat from.
    setRevealed(false);

    const enText = frontWord;
    const deText = spokenLemma(card.lemma, card.gender);

    try {
      for (let i = 0; i < count; i++) {
        if (repeatCancelRef.current) break;
        setRepeatProgress(i + 1);

        // Tiny pre-roll so the front flip commits before we start speaking.
        // 150ms is enough on iOS without feeling laggy.
        await sleep(150);
        if (repeatCancelRef.current) break;

        // Speak English (front).
        await speakAwaitable((opts) => speakEnglish(enText, opts));
        if (repeatCancelRef.current) break;

        // Flip to German.
        setRevealed(true);
        await sleep(250);
        if (repeatCancelRef.current) break;

        // Speak German (back).
        await speakAwaitable((opts) => speakGerman(deText, opts));
        if (repeatCancelRef.current) break;

        // If there are more iterations, flip back to the front. On the
        // last iteration, leave the card revealed (back side) — the user
        // is about to get auto-rated and the back is the natural last
        // visual.
        if (i < count - 1) {
          await sleep(300);
          if (repeatCancelRef.current) break;
          setRevealed(false);
        }
      }
    } finally {
      isRepeatingRef.current = false;
      setIsRepeating(false);
      setRepeatProgress(0);
      // Make sure no orphan utterance keeps playing if a TTS callback
      // dropped (shouldn't happen, but defensive — `Speech.stop()` is
      // a no-op when nothing is queued).
      stopSpeech();
    }

    // Loop completed naturally (not cancelled). Auto-rate Again to push
    // the card back into the queue, matching the "drill aloud then again"
    // intent.
    if (!repeatCancelRef.current) {
      // Small visual breath so the user sees the back fully settle before
      // the next card slides in.
      await sleep(200);
      fireRatingHaptic(Rating.Again);
      onRate(Rating.Again);
    }
  };

  const cancelRepeat = () => {
    if (!isRepeatingRef.current) return;
    repeatCancelRef.current = true;
    stopSpeech();
  };

  const fireRatingHaptic = (rating: ReviewRating) => {
    if (rating === Rating.Again) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (rating === Rating.Hard) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (rating === Rating.Good) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // Optimistic advance: flip to the next card SYNCHRONOUSLY, then persist
  // the rating in the background. The previous version awaited `rateCard`
  // before advancing — fine for the buttons (no animation between states)
  // but ugly for the swipe path: after the fling-off completes and swipeX
  // snaps back to 0, the previous card's BACK would sit at center for the
  // ~30ms of the SQLite write before the next card's front rendered. The
  // optimistic version skips that. If the DB write fails (rare for local
  // SQLite) we log and the affected card just stays due — no visible
  // regression because the user has already moved past it.
  //
  // Haptic intentionally NOT fired here: callers (rating button onPress and
  // the swipe commit) fire `fireRatingHaptic` themselves so the feedback
  // lines up with the gesture, not the animation end. If a future caller
  // forgets, the rating still works — they just don't get a buzz.
  const onRate = (rating: ReviewRating) => {
    if (submittingRef.current) return;
    const cardId = card.id;
    // Push undo entry BEFORE advancing state. We capture the Card object
    // by reference from the snapshotted queue — its FSRS columns still
    // reflect the pre-rate state at this moment (queue is never mutated
    // when we rate, only the DB is).
    undoStack.current.push({ card, prevIndex: index });
    setUndoCount(undoStack.current.length);
    setSubmitting(true);
    setRevealed(false);
    setIndex((i) => i + 1);
    setSessionCount((n) => n + 1);
    rateCard(cardId, rating)
      .catch((e) => console.error('rateCard failed', e))
      .finally(() => setSubmitting(false));
  };

  const onUndo = () => {
    // Block while a rate's DB write is still in flight — otherwise the
    // undo's DELETE-most-recent-log might race ahead of the still-pending
    // INSERT and leave behind a log for a rate the user thought was undone.
    if (submittingRef.current) return;
    const entry = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (!entry) return;
    // Walk back to the rated card and surface its back side so the user
    // can re-rate. The optimistic-advance in `onRate` advanced the index
    // and reset revealed; the undo unwinds both. `sessionCount` also
    // decrements so the running total stays honest.
    setIndex(entry.prevIndex);
    setRevealed(true);
    setSessionCount((n) => Math.max(0, n - 1));
    // Fire the DB undo in background. If the card was deleted externally
    // (the focus-prune effect may have already removed it from the queue
    // — but only if it ran AFTER we returned from card detail, which is
    // a separate flow), the UPDATE is a no-op and the DELETE finds no
    // matching log. Either way nothing breaks; we just log on error.
    undoLatestReview(entry.card).catch((e) =>
      console.error('undoLatestReview failed', e),
    );
  };

  const openOptions = () => {
    // Capture the shuffle setting at modal-open time so closeOptions can
    // detect an OFF → ON transition. Reading the ref (not the React state)
    // is correct here because state may not be flushed yet if the toggle
    // happened in the same tick as the bell tap.
    initialShuffleRef.current = shuffleCardsRef.current;
    setOptionsOpen(true);
  };

  const closeOptions = () => {
    const wasOff = !initialShuffleRef.current;
    const isOn = shuffleCardsRef.current;
    if (wasOff && isOn) {
      // OFF → ON inside this modal session: shuffle the upcoming portion
      // of the queue. Cards before `index` stay (they're history); index
      // itself stays put; whatever card now sits at queue[index] becomes
      // the new current card. Reveal is reset because the current slot's
      // card may now be different and we want to land on its front.
      setQueue((prev) => {
        if (!prev) return prev;
        const i = indexRef.current;
        if (i >= prev.length) return prev;
        const head = prev.slice(0, i);
        const tail = shuffleArray(prev.slice(i));
        return [...head, ...tail];
      });
      setRevealed(false);
    } else if (!wasOff && !isOn) {
      // ON → OFF inside this modal session: restore the upcoming portion
      // to the default FSRS-due order. The latest `dueCards` (from the
      // hook) is already in that order — we just filter it to the IDs
      // currently in queue[index..] so the user's session progress
      // (rated cards before index) stays intact. Anything in the queue
      // that's not in dueCards (defensive — shouldn't happen since the
      // focus-prune effect catches deletions) gets appended at the end so
      // we never silently drop a card.
      setQueue((prev) => {
        if (!prev) return prev;
        const i = indexRef.current;
        if (i >= prev.length) return prev;
        const upcoming = prev.slice(i);
        const upcomingIds = new Set(upcoming.map((c) => c.id));
        const ordered: Card[] = [];
        const seen = new Set<string>();
        for (const c of dueCards) {
          if (upcomingIds.has(c.id)) {
            ordered.push(c);
            seen.add(c.id);
          }
        }
        for (const c of upcoming) {
          if (!seen.has(c.id)) ordered.push(c);
        }
        return [...prev.slice(0, i), ...ordered];
      });
      setRevealed(false);
    }
    setOptionsOpen(false);
  };

  // Rebind every render so the swipe commit closes over the current `onRate`
  // (which closes over the current card). The PanResponder calls through this
  // ref so its stable identity isn't a problem.
  commitSwipeRef.current = (dir: 'left' | 'right' | 'up' | 'down') => {
    if (submittingRef.current) return;
    const rating: ReviewRating =
      dir === 'left'
        ? Rating.Again
        : dir === 'right'
          ? Rating.Good
          : dir === 'up'
            ? Rating.Hard
            : Rating.Easy;
    // Fire the haptic at release time (not after the 180ms fling) so the
    // buzz lines up with the gesture, not the animation end.
    fireRatingHaptic(rating);
    // Horizontal axis flings handle left/right; vertical handles up/down.
    // Snap the ORTHOGONAL axis to 0 first so the fling flies straight in
    // the intended direction — a slightly-diagonal release would otherwise
    // see the card fly at an angle off-screen.
    const horizontal = dir === 'left' || dir === 'right';
    if (horizontal) {
      swipeY.setValue(0);
    } else {
      swipeX.setValue(0);
    }
    const flingAxis = horizontal ? swipeX : swipeY;
    const flingTarget = dir === 'left' || dir === 'up' ? -600 : 600;
    // Fling the card off-screen along the chosen axis. After the fling
    // ends we DELIBERATELY DO NOT reset the axis to 0 here.
    //
    //   1. `setValue(0)` fires synchronously via `setNativeProps`, which
    //      pushes the new transform directly to native, bypassing React's
    //      reconciler. The old card's children are still in the native
    //      view at that moment (React hasn't committed the state advance
    //      yet), so the OLD card would jump to (0, 0) and sit at center
    //      until React's batched commit catches up — that's the
    //      "previous card visible for a beat before the next one shows"
    //      glitch.
    //
    //   2. Instead, we advance state AND teleport the active axis to the
    //      OPPOSITE side off-screen. Both happen before React commits, so
    //      the transitional frame has the old card off-screen (invisible).
    //      The next card mounts off-screen too. The `useEffect` on
    //      `currentCardId` then springs the axis back to 0 — a real
    //      slide-in from the opposite side, like the next card in a deck.
    Animated.timing(flingAxis, {
      toValue: flingTarget,
      duration: 180,
      useNativeDriver: false,
    }).start(() => {
      onRate(rating);
      if (horizontal) {
        swipeX.setValue(dir === 'left' ? 600 : -600);
      } else {
        swipeY.setValue(dir === 'up' ? 600 : -600);
      }
    });
  };

  return (
    <ThemedView style={styles.container}>
      {suggested && suggested.length > 0 && (
        <SuggestedRail
          items={suggested}
          tint={tint}
          onTint={onTint}
          onTap={(c) => router.push(`/card/${c.id}`)}
        />
      )}
      <View style={styles.topBar}>
        <View style={[styles.topBarSide, styles.topBarSideLeft]}>
          <Pressable
            onPress={onUndo}
            disabled={undoCount === 0 || submitting}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Undo last rating"
            accessibilityState={{ disabled: undoCount === 0 || submitting }}
            style={styles.optionsBtn}>
            <IconSymbol
              name="arrow.uturn.backward"
              size={20}
              color={
                undoCount === 0 || submitting ? 'rgba(150,150,150,0.5)' : tint
              }
            />
          </Pressable>
        </View>
        <ThemedText style={styles.progress}>
          {index + 1} / {queue.length}
        </ThemedText>
        <View style={styles.topBarSide}>
          <Pressable
            onPress={openOptions}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open flashcard options"
            style={styles.optionsBtn}>
            <IconSymbol name="bell.fill" size={20} color={tint} />
          </Pressable>
        </View>
      </View>

      <Animated.View
        style={[
          styles.card,
          {
            borderColor: tint,
            transform: [
              { translateX: swipeX },
              { translateY: swipeY },
              {
                // Slight Tinder-style tilt so horizontal swipes feel
                // tactile. Vertical swipes don't tilt — only swipeX
                // drives the rotation.
                rotate: swipeX.interpolate({
                  inputRange: [-300, 0, 300],
                  outputRange: ['-8deg', '0deg', '8deg'],
                  extrapolate: 'clamp',
                }),
              },
            ],
          },
        ]}
        {...panResponder.panHandlers}>
        <Pressable
          style={styles.cardTapTarget}
          onPress={() => {
            // During the Repeat loop the card auto-flips on its own.
            // Tapping mid-loop would race the loop's setRevealed calls and
            // leave the visible side out of sync with the TTS. Treat a tap
            // as "cancel the loop" so the user has an out without a Stop
            // tap — the user is reaching toward the card anyway.
            if (isRepeatingRef.current) {
              cancelRepeat();
              return;
            }
            setRevealed((r) => !r);
          }}>
          {revealed ? (
            <View style={styles.back}>
              <View style={styles.lemmaRow}>
                {card.gender && <ThemedText style={styles.gender}>{card.gender}</ThemedText>}
                <ThemedText type="title" style={styles.lemma}>
                  {card.lemma}
                </ThemedText>
                <Pressable
                  onPress={(e) => replayWord(e)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Replay pronunciation of ${card.lemma}`}
                  style={styles.wordSpeakBtn}>
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.wordSpeakHalo,
                      { backgroundColor: tint },
                      {
                        opacity: haloAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 0.35],
                        }),
                        transform: [
                          {
                            scale: haloAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.7, 1.35],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                  <IconSymbol name="speaker.wave.2.fill" size={22} color={tint} />
                </Pressable>
              </View>
              {card.plural && (
                <ThemedText style={styles.plural}>plural: {card.plural}</ThemedText>
              )}
              {card.exampleDe && (
                <ThemedText style={styles.example}>{card.exampleDe}</ThemedText>
              )}
              {card.exampleEn && (
                <ThemedText style={styles.exampleEn}>{card.exampleEn}</ThemedText>
              )}
              {card.notes && <ThemedText style={styles.notes}>{card.notes}</ThemedText>}
              {card.exampleDe && (
                <Pressable
                  onPress={(e) => playSentence(e)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Play example sentence"
                  style={[styles.speakBtn, { borderColor: tint }]}>
                  <IconSymbol name="speaker.wave.2.fill" size={20} color={tint} />
                  <ThemedText style={[styles.speakBtnText, { color: tint }]}>Listen</ThemedText>
                </Pressable>
              )}
            </View>
          ) : (
            <>
              <View style={styles.lemmaRow}>
                <ThemedText type="title" style={styles.lemma}>
                  {frontWord}
                </ThemedText>
                {hasEnglishFront && (
                  <Pressable
                    onPress={(e) => replayWordEn(e)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Play pronunciation of ${frontWord}`}
                    style={styles.wordSpeakBtn}>
                    <IconSymbol name="speaker.wave.2.fill" size={22} color={tint} />
                  </Pressable>
                )}
              </View>
              {isRepeating ? (
                <ThemedText style={styles.tapHint}>
                  Repeating {repeatProgress} / {repeatCount} — tap card to stop
                </ThemedText>
              ) : (
                <ThemedText style={styles.tapHint}>tap to reveal</ThemedText>
              )}
            </>
          )}
        </Pressable>

        {/*
         * Four swipe overlays — one per direction — layered on top of the
         * card content. Each fades in as its axis crosses ~20px in the
         * relevant direction and caps at 0.92 (so the underlying card is
         * faintly visible — the cue is "intent to commit", not "already
         * committed"). pointerEvents "none" so they never block the inner
         * Pressable or PanResponder.
         *
         * Colors mirror the rating-button palette so the gesture and the
         * button row share visual identity:
         *   left  Again — red    right Good — green
         *   up    Hard  — orange down  Easy — blue
         *
         * On a near-diagonal swipe both axes' overlays partially fade in;
         * the dominant axis (decided at release) wins the commit.
         */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeOverlay,
            { backgroundColor: Ratings.again },
            {
              opacity: swipeX.interpolate({
                inputRange: [-150, -20, 0],
                outputRange: [0.92, 0, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}>
          <ThemedText style={styles.swipeOverlayText}>Again</ThemedText>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeOverlay,
            { backgroundColor: Ratings.good },
            {
              opacity: swipeX.interpolate({
                inputRange: [0, 20, 150],
                outputRange: [0, 0, 0.92],
                extrapolate: 'clamp',
              }),
            },
          ]}>
          <ThemedText style={styles.swipeOverlayText}>Good</ThemedText>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeOverlay,
            { backgroundColor: Ratings.hard },
            {
              opacity: swipeY.interpolate({
                inputRange: [-150, -20, 0],
                outputRange: [0.92, 0, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}>
          <ThemedText style={styles.swipeOverlayText}>Hard</ThemedText>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeOverlay,
            { backgroundColor: Ratings.easy },
            {
              opacity: swipeY.interpolate({
                inputRange: [0, 20, 150],
                outputRange: [0, 0, 0.92],
                extrapolate: 'clamp',
              }),
            },
          ]}>
          <ThemedText style={styles.swipeOverlayText}>Easy</ThemedText>
        </Animated.View>
      </Animated.View>

      <View style={styles.actions}>
        {revealed ? (
          RATINGS.map((r) => (
            <Pressable
              key={r.label}
              disabled={submitting || isRepeating}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${r.label}`}
              style={[
                styles.ratingBtn,
                { backgroundColor: r.color },
                (submitting || isRepeating) && styles.btnDisabled,
              ]}
              onPress={() => {
                fireRatingHaptic(r.rating);
                onRate(r.rating);
              }}>
              <ThemedText style={styles.ratingLabel}>{r.label}</ThemedText>
            </Pressable>
          ))
        ) : isRepeating ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop the repeat loop"
            style={[styles.detailBtn, { borderColor: Ratings.again }]}
            onPress={cancelRepeat}>
            <IconSymbol name="stop.fill" size={16} color={Ratings.again} />
            <ThemedText style={[styles.actionInlineText, { color: Ratings.again }]}>
              Stop
            </ThemedText>
          </Pressable>
        ) : (
          <>
            {hasEnglishFront && card.lemma && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Repeat ${repeatCount} times, then rate Again`}
                style={[styles.detailBtn, { borderColor: tint }]}
                onPress={runRepeatLoop}>
                <IconSymbol name="repeat" size={16} color={tint} />
                <ThemedText style={[styles.actionInlineText, { color: tint }]}>
                  Repeat {repeatCount}×
                </ThemedText>
              </Pressable>
            )}
            <Pressable
              style={[styles.detailBtn, { borderColor: tint }]}
              onPress={() => router.push(`/card/${card.id}`)}>
              <ThemedText>View details</ThemedText>
            </Pressable>
          </>
        )}
      </View>

      {/*
       * Flashcard options modal. Opened by the bell icon in the header.
       * Contents are scoped to behaviors that affect the study session
       * itself (vs. the global app Settings page); right now that's
       * Auto-play and Shuffle, both as plain switch rows. The backdrop
       * is tap-to-dismiss; an explicit Done button confirms discoverability.
       */}
      <Modal
        visible={optionsOpen}
        transparent
        animationType="fade"
        onRequestClose={closeOptions}>
        <Pressable style={styles.optionsBackdrop} onPress={closeOptions}>
          {/* Inner Pressable: swallow taps so they don't bubble to the
              backdrop's onPress and close the sheet from inside it. */}
          <Pressable
            onPress={() => {}}
            style={[
              styles.optionsCard,
              {
                backgroundColor: Colors[colorScheme].background,
                borderColor: 'rgba(150,150,150,0.3)',
              },
            ]}>
            <ThemedText type="subtitle" style={styles.optionsTitle}>
              Flashcard options
            </ThemedText>

            <View style={styles.optionsRow}>
              <View style={styles.optionsLabels}>
                <ThemedText type="defaultSemiBold">Auto-play word</ThemedText>
                <ThemedText style={styles.optionsHelp}>
                  Speak the German lemma the moment you flip a card.
                </ThemedText>
              </View>
              <Switch
                value={autoPlayWord}
                onValueChange={setAutoPlayWord}
                trackColor={{ true: tint }}
              />
            </View>

            <View style={styles.optionsDivider} />

            <View style={styles.optionsRow}>
              <View style={styles.optionsLabels}>
                <ThemedText type="defaultSemiBold">Shuffle cards</ThemedText>
                <ThemedText style={styles.optionsHelp}>
                  Randomize the order of due cards. Applies when the next
                  session starts; the current queue keeps its order.
                </ThemedText>
              </View>
              <Switch
                value={shuffleCards}
                onValueChange={setShuffleCards}
                trackColor={{ true: tint }}
              />
            </View>

            <View style={styles.optionsDivider} />

            <View style={styles.optionsRow}>
              <View style={styles.optionsLabels}>
                <ThemedText type="defaultSemiBold">Repeat count</ThemedText>
                <ThemedText style={styles.optionsHelp}>
                  How many times the Repeat button cycles English → German aloud
                  before auto-rating Again.
                </ThemedText>
              </View>
              <View style={styles.stepperInline}>
                <Pressable
                  onPress={() => setRepeatCount(repeatCount - 1)}
                  disabled={repeatCount <= 1}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease repeat count"
                  style={[
                    styles.stepBtn,
                    { borderColor: tint },
                    repeatCount <= 1 && styles.btnDisabled,
                  ]}>
                  <ThemedText style={styles.stepBtnText}>−</ThemedText>
                </Pressable>
                <ThemedText style={styles.stepValueInline}>{repeatCount}</ThemedText>
                <Pressable
                  onPress={() => setRepeatCount(repeatCount + 1)}
                  disabled={repeatCount >= 10}
                  accessibilityRole="button"
                  accessibilityLabel="Increase repeat count"
                  style={[
                    styles.stepBtn,
                    { borderColor: tint },
                    repeatCount >= 10 && styles.btnDisabled,
                  ]}>
                  <ThemedText style={styles.stepBtnText}>+</ThemedText>
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={closeOptions}
              style={[styles.optionsDone, { backgroundColor: tint }]}>
              <ThemedText style={[styles.optionsDoneText, { color: onTint }]}>Done</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

function SuggestedRail({
  items,
  tint,
  onTint,
  onTap,
}: {
  items: FrequentNewCard[];
  tint: string;
  onTint: string;
  onTap: (card: FrequentNewCard) => void;
}) {
  return (
    <View style={styles.rail}>
      <ThemedText style={styles.railLabel}>Seen often, not yet learned</ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railRow}>
        {items.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onTap(c)}
            style={[styles.railChip, { borderColor: tint }]}>
            {c.gender && <ThemedText style={styles.railGender}>{c.gender}</ThemedText>}
            <ThemedText type="defaultSemiBold" style={styles.railLemma}>
              {c.lemma}
            </ThemedText>
            <View style={[styles.railBadge, { backgroundColor: tint }]}>
              <ThemedText style={[styles.railBadgeText, { color: onTint }]}>
                ×{c.sightingCount}
              </ThemedText>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  empty: { textAlign: 'center', opacity: 0.6, maxWidth: 320 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  topBarSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  // Override on the LEFT side container so its icons (currently just the
  // Undo button) flush to the left of the screen, mirroring the bell on
  // the right.
  topBarSideLeft: { justifyContent: 'flex-start' },
  progress: { textAlign: 'center', opacity: 0.6 },
  optionsBtn: { padding: 4 },
  optionsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  optionsCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  optionsTitle: { fontSize: 18 },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionsLabels: { flex: 1, gap: 4 },
  optionsHelp: { opacity: 0.65, fontSize: 13, lineHeight: 18 },
  optionsDivider: {
    height: 1,
    backgroundColor: 'rgba(150,150,150,0.2)',
  },
  optionsDone: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  optionsDoneText: { fontWeight: '600' },
  stepperInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, fontWeight: '600' },
  stepValueInline: {
    fontSize: 18,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  card: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 16,
    // Clip the absolutely-positioned swipe overlays to the rounded corners.
    overflow: 'hidden',
  },
  cardTapTarget: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  swipeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeOverlayText: {
    color: 'white',
    fontSize: 34,
    // ThemedText with no `type` prop applies its default style with
    // `lineHeight: 24`. Without an explicit override here, a 34pt glyph is
    // forced into a 24pt line box and gets clipped top + bottom.
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  gender: { fontSize: 18, opacity: 0.7 },
  lemma: { fontSize: 40, lineHeight: 52, textAlign: 'center' },
  lemmaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  tapHint: { opacity: 0.5, marginTop: 24 },
  back: { alignItems: 'center', gap: 10, marginTop: 8 },
  example: { textAlign: 'center', fontStyle: 'italic', marginTop: 12 },
  exampleEn: { textAlign: 'center', opacity: 0.6 },
  plural: { opacity: 0.6, marginTop: 4 },
  notes: {
    opacity: 0.75,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16, justifyContent: 'space-between' },
  ratingBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  ratingLabel: { color: 'white', fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  speakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  speakBtnText: { fontSize: 14, fontWeight: '600' },
  wordSpeakBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  wordSpeakHalo: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  detailBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionInlineText: { fontWeight: '600', fontSize: 15 },
  rail: { marginBottom: 12, gap: 6 },
  railLabel: { fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5 },
  railRow: { gap: 8, paddingRight: 8 },
  railChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 999,
  },
  railGender: { fontSize: 13, opacity: 0.6 },
  railLemma: { fontSize: 15 },
  railBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  railBadgeText: { fontSize: 11, fontWeight: '700' },
  suggestedBlock: { width: '100%', marginTop: 24, gap: 8 },
  suggestedHeader: { textAlign: 'center', fontSize: 16, opacity: 0.85 },
});
