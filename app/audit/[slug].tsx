import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { folderLabel } from '@/constants/folders';
import { Colors } from '@/constants/theme';
import type { Card } from '@/db/schema';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  applyAuditChanges,
  auditCards,
  fetchFolderCardsForAudit,
  type AuditField,
  type AuditResult,
} from '@/services/audit';

type Phase = 'loading' | 'auditing' | 'review' | 'applying' | 'error';
type Tab = 'corrections' | 'review';

/** User-facing label for an audited field. */
const FIELD_LABEL: Record<AuditField, string> = {
  lemma: 'Lemma',
  gender: 'Gender',
  translationEn: 'Translation',
  exampleDe: 'Example (German)',
  exampleEn: 'Example (English)',
  plural: 'Plural',
};

/**
 * Audit screen — re-runs each card in the folder (or sub-cat scope)
 * through Gemini to suggest field corrections AND flag cards that aren't
 * everyday-vocab. Two tabs:
 *
 *   Corrections — per-issue checkboxes; Apply commits the checked ones.
 *   Review      — cards Gemini flagged as outside everyday vocabulary;
 *                 tap a row to open the card detail (delete from there).
 *
 * `sub` query param mirrors the folder route convention:
 *   missing | 'all' → no sub-cat filter
 *   'null'          → Uncategorized within parent
 *   anything else   → specific sub-cat id
 */
export default function AuditScreen() {
  const { slug, sub } = useLocalSearchParams<{ slug: string; sub?: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].background;

  const subId: string | null | undefined =
    sub === undefined || sub === 'all' ? undefined : sub === 'null' ? null : sub;

  const [phase, setPhase] = useState<Phase>('loading');
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<AuditResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Map of "<cardId>:<field>" → checked. Pre-populated true for every
  // suggestion when the audit finishes; user toggles via tap.
  const [checked, setChecked] = useState<Map<string, boolean>>(new Map());
  const [tab, setTab] = useState<Tab>('corrections');

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchFolderCardsForAudit(slug, subId);
        if (cancelled) return;
        setAllCards(list);
        if (list.length === 0) {
          setPhase('review');
          return;
        }
        setProgress({ done: 0, total: list.length });
        setPhase('auditing');
        const res = await auditCards(list, controller.signal, (done, total) => {
          if (!cancelled) setProgress({ done, total });
        });
        if (cancelled) return;
        setResults(res);
        const initial = new Map<string, boolean>();
        for (const r of res) {
          for (const issue of r.issues) {
            initial.set(`${r.cardId}:${issue.field}`, true);
          }
        }
        setChecked(initial);
        setPhase('review');
      } catch (e) {
        if (cancelled) return;
        if (e instanceof Error && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [slug, subId]);

  const cardById = useMemo(() => {
    const m = new Map<string, Card>();
    for (const c of allCards) m.set(c.id, c);
    return m;
  }, [allCards]);

  const correctionResults = useMemo(
    () => results.filter((r) => r.issues.length > 0),
    [results],
  );
  const reviewResults = useMemo(
    () => results.filter((r) => r.everyday !== null),
    [results],
  );
  const totalIssues = useMemo(
    () => results.reduce((sum, r) => sum + r.issues.length, 0),
    [results],
  );
  const checkedCount = useMemo(
    () => Array.from(checked.values()).filter(Boolean).length,
    [checked],
  );

  const toggleCheck = (cardId: string, field: AuditField) => {
    const key = `${cardId}:${field}`;
    setChecked((prev) => {
      const next = new Map(prev);
      next.set(key, !next.get(key));
      return next;
    });
  };

  const onApply = async () => {
    const changes: { cardId: string; field: AuditField; suggestedValue: string }[] = [];
    for (const r of results) {
      for (const issue of r.issues) {
        if (checked.get(`${r.cardId}:${issue.field}`)) {
          changes.push({
            cardId: r.cardId,
            field: issue.field,
            suggestedValue: issue.suggestedValue,
          });
        }
      }
    }
    if (changes.length === 0) {
      router.back();
      return;
    }
    setPhase('applying');
    try {
      await applyAuditChanges(changes);
      router.back();
    } catch (e) {
      Alert.alert(
        'Apply failed',
        e instanceof Error ? e.message : String(e),
      );
      setPhase('review');
    }
  };

  // --- Render branches -----------------------------------------------

  if (phase === 'loading') {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={styles.statusText}>Loading cards…</ThemedText>
      </ThemedView>
    );
  }

  if (phase === 'auditing') {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={styles.statusText}>
          Reviewing {progress.done} of {progress.total}…
        </ThemedText>
        <ThemedText style={styles.statusHint}>
          Don&apos;t close this screen.
        </ThemedText>
      </ThemedView>
    );
  }

  if (phase === 'error') {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="subtitle">Audit failed</ThemedText>
        <ThemedText style={styles.statusHint}>{error}</ThemedText>
        <Pressable
          onPress={() => router.back()}
          style={[styles.doneBtn, { borderColor: tint }]}>
          <ThemedText style={{ color: tint }}>Back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (allCards.length === 0) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="subtitle">Nothing to audit</ThemedText>
        <ThemedText style={styles.statusHint}>
          No cards in {folderLabel(slug)}.
        </ThemedText>
        <Pressable
          onPress={() => router.back()}
          style={[styles.doneBtn, { borderColor: tint }]}>
          <ThemedText style={{ color: tint }}>Back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.headerSub}>
          {results.length} card{results.length === 1 ? '' : 's'} audited
        </ThemedText>
      </View>

      <View style={styles.segmented}>
        <Pressable
          style={[
            styles.segmentBtn,
            { borderColor: tint },
            tab === 'corrections' && { backgroundColor: tint },
          ]}
          onPress={() => setTab('corrections')}>
          <ThemedText
            style={[
              styles.segmentText,
              tab === 'corrections' && { color: onTint, fontWeight: '600' },
            ]}>
            Corrections ({totalIssues})
          </ThemedText>
        </Pressable>
        <Pressable
          style={[
            styles.segmentBtn,
            { borderColor: tint },
            tab === 'review' && { backgroundColor: tint },
          ]}
          onPress={() => setTab('review')}>
          <ThemedText
            style={[
              styles.segmentText,
              tab === 'review' && { color: onTint, fontWeight: '600' },
            ]}>
            Review ({reviewResults.length})
          </ThemedText>
        </Pressable>
      </View>

      {tab === 'corrections' ? (
        <CorrectionsList
          results={correctionResults}
          cardById={cardById}
          checked={checked}
          onToggle={toggleCheck}
          tint={tint}
          onTint={onTint}
        />
      ) : (
        <ReviewList
          results={reviewResults}
          cardById={cardById}
          tint={tint}
          onTap={(id) => router.push(`/card/${id}` as never)}
        />
      )}

      {tab === 'corrections' && (
        <Pressable
          onPress={onApply}
          disabled={phase === 'applying'}
          style={[
            styles.applyBtn,
            { backgroundColor: tint },
            phase === 'applying' && styles.applyBtnDisabled,
          ]}>
          <ThemedText style={[styles.applyBtnText, { color: onTint }]}>
            {phase === 'applying'
              ? 'Applying…'
              : checkedCount === 0
                ? 'Done'
                : `Apply ${checkedCount} change${checkedCount === 1 ? '' : 's'}`}
          </ThemedText>
        </Pressable>
      )}
      {tab === 'review' && (
        <Pressable
          onPress={() => router.back()}
          style={[styles.applyBtn, { backgroundColor: tint }]}>
          <ThemedText style={[styles.applyBtnText, { color: onTint }]}>Done</ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

// --- Sub-components --------------------------------------------------

function CorrectionsList({
  results,
  cardById,
  checked,
  onToggle,
  tint,
  onTint,
}: {
  results: AuditResult[];
  cardById: Map<string, Card>;
  checked: Map<string, boolean>;
  onToggle: (cardId: string, field: AuditField) => void;
  tint: string;
  onTint: string;
}) {
  if (results.length === 0) {
    return (
      <View style={styles.emptyTab}>
        <IconSymbol name="checkmark.circle.fill" size={32} color={tint} />
        <ThemedText style={styles.emptyText}>
          No corrections suggested. All cards look good.
        </ThemedText>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.listPad}>
      {results.map((r) => {
        const card = cardById.get(r.cardId);
        if (!card) return null;
        const header = card.gender ? `${card.gender} ${card.lemma}` : card.lemma;
        const subline = card.translationEn ?? '';
        return (
          <View key={r.cardId} style={styles.cardBlock}>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold" style={styles.cardHeaderText}>
                {header}
              </ThemedText>
              {subline.length > 0 && (
                <ThemedText style={styles.cardSubline}>{subline}</ThemedText>
              )}
            </View>
            {r.issues.map((issue) => {
              const key = `${r.cardId}:${issue.field}`;
              const isChecked = checked.get(key) ?? false;
              const currentValue = currentValueForField(card, issue.field);
              return (
                <Pressable
                  key={issue.field}
                  onPress={() => onToggle(r.cardId, issue.field)}
                  style={styles.issueRow}>
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: tint },
                      isChecked && { backgroundColor: tint },
                    ]}>
                    {isChecked && (
                      <IconSymbol name="checkmark.circle.fill" size={16} color={onTint} />
                    )}
                  </View>
                  <View style={styles.issueText}>
                    <ThemedText type="defaultSemiBold" style={styles.issueField}>
                      {FIELD_LABEL[issue.field]}
                    </ThemedText>
                    <ThemedText style={styles.issueDiff}>
                      <ThemedText style={styles.issueOld}>
                        {currentValue || '(empty)'}
                      </ThemedText>
                      <ThemedText style={styles.issueArrow}> → </ThemedText>
                      <ThemedText style={styles.issueNew}>
                        {issue.suggestedValue || '(clear)'}
                      </ThemedText>
                    </ThemedText>
                    {issue.rationale.length > 0 && (
                      <ThemedText style={styles.issueRationale}>{issue.rationale}</ThemedText>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

function ReviewList({
  results,
  cardById,
  tint,
  onTap,
}: {
  results: AuditResult[];
  cardById: Map<string, Card>;
  tint: string;
  onTap: (cardId: string) => void;
}) {
  if (results.length === 0) {
    return (
      <View style={styles.emptyTab}>
        <IconSymbol name="checkmark.circle.fill" size={32} color={tint} />
        <ThemedText style={styles.emptyText}>
          No cards flagged. All cards look like everyday-useful vocabulary.
        </ThemedText>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.listPad}>
      <ThemedText style={styles.reviewHint}>
        Gemini thinks these cards are outside everyday vocabulary. Tap to open
        the card and delete or keep it.
      </ThemedText>
      {results.map((r) => {
        const card = cardById.get(r.cardId);
        if (!card || !r.everyday) return null;
        const header = card.gender ? `${card.gender} ${card.lemma}` : card.lemma;
        return (
          <Pressable
            key={r.cardId}
            onPress={() => onTap(r.cardId)}
            style={[styles.reviewRow, { borderColor: tint }]}>
            <View style={styles.reviewBody}>
              <ThemedText type="defaultSemiBold">{header}</ThemedText>
              {card.translationEn && (
                <ThemedText style={styles.cardSubline}>{card.translationEn}</ThemedText>
              )}
              <ThemedText style={styles.reviewRationale}>{r.everyday.rationale}</ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={20} color={tint} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function currentValueForField(card: Card, field: AuditField): string {
  switch (field) {
    case 'lemma':
      return card.lemma ?? '';
    case 'gender':
      return card.gender ?? '(none)';
    case 'translationEn':
      return card.translationEn ?? '';
    case 'exampleDe':
      return card.exampleDe ?? '';
    case 'exampleEn':
      return card.exampleEn ?? '';
    case 'plural':
      return card.plural ?? '(none)';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  statusText: { fontSize: 16, opacity: 0.85 },
  statusHint: { fontSize: 13, opacity: 0.55, textAlign: 'center', maxWidth: 280 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  headerSub: { fontSize: 13, opacity: 0.6 },
  segmented: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentText: { fontSize: 14 },
  listPad: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  cardBlock: {
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.3)',
  },
  cardHeader: { gap: 2 },
  cardHeaderText: { fontSize: 17 },
  cardSubline: { fontSize: 14, opacity: 0.65 },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  issueText: { flex: 1, gap: 2 },
  issueField: { fontSize: 13, opacity: 0.85 },
  issueDiff: { fontSize: 14 },
  issueOld: { textDecorationLine: 'line-through', opacity: 0.6 },
  issueArrow: { opacity: 0.5 },
  issueNew: { fontWeight: '600' },
  issueRationale: { fontSize: 12, opacity: 0.6, fontStyle: 'italic' },
  emptyTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  emptyText: { textAlign: 'center', opacity: 0.6, maxWidth: 280 },
  reviewHint: {
    opacity: 0.6,
    fontSize: 13,
    marginBottom: 8,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  reviewBody: { flex: 1, gap: 4 },
  reviewRationale: { fontSize: 13, opacity: 0.8, fontStyle: 'italic' },
  applyBtn: {
    marginHorizontal: 20,
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { fontWeight: '600', fontSize: 16 },
  doneBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
  },
});
