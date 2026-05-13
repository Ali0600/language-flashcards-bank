import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCardSightings, useCardWithSibling } from '@/hooks/use-cards';
import {
  createReverseFor,
  deleteCard,
  updateCard,
  type EditableCardFields,
} from '@/services/card';
import { speakGerman } from '@/services/speech';
import { IconSymbol } from '@/components/ui/icon-symbol';

const GENDERS: (EditableCardFields['gender'])[] = ['der', 'die', 'das', null];

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const onTint = Colors[colorScheme].background;

  const { loading, data: cardData, error, refetch } = useCardWithSibling(id);
  const { card, sibling } = cardData;
  const { data: sightings } = useCardSightings(id);
  const [creatingReverse, setCreatingReverse] = useState(false);

  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<EditableCardFields | null>(null);

  useEffect(() => {
    if (card && !editing) {
      setDraft({
        lemma: card.lemma,
        gender: card.gender,
        pos: card.pos,
        translationEn: card.translationEn,
        exampleDe: card.exampleDe,
        exampleEn: card.exampleEn,
        plural: card.plural,
        notes: card.notes,
      });
    }
  }, [card, editing]);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Could not load card: {error.message}</ThemedText>
      </ThemedView>
    );
  }

  if (!card) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Card not found.</ThemedText>
      </ThemedView>
    );
  }

  const startEdit = () => {
    setDraft({
      lemma: card.lemma,
      gender: card.gender,
      pos: card.pos,
      translationEn: card.translationEn,
      exampleDe: card.exampleDe,
      exampleEn: card.exampleEn,
      plural: card.plural,
      notes: card.notes,
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!draft || submitting) return;
    if (!draft.lemma.trim()) {
      Alert.alert('Lemma required', 'A card needs a dictionary form (lemma).');
      return;
    }
    setSubmitting(true);
    try {
      await updateCard(card.id, draft);
      setEditing(false);
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete card?',
      `"${card.lemma}" will be removed permanently, along with its review history and sightings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCard(card.id);
              router.dismissTo('/(tabs)/library');
            } catch (e) {
              Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.header}>
          {!editing && card.gender && (
            <ThemedText style={styles.gender}>{card.gender}</ThemedText>
          )}
          {editing ? (
            <TextInput
              style={[styles.lemmaInput, { borderColor: tint, color: textColor }]}
              value={draft?.lemma ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, lemma: v } : d))}
              placeholder="Lemma"
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : (
            <View style={styles.lemmaRow}>
              <ThemedText type="title">{card.lemma}</ThemedText>
              <Pressable
                onPress={() => speakGerman(card.lemma)}
                hitSlop={8}
                style={styles.speakBtn}>
                <IconSymbol name="speaker.wave.2.fill" size={22} color={tint} />
              </Pressable>
            </View>
          )}
          {!editing && card.plural && (
            <ThemedText style={styles.plural}>plural: {card.plural}</ThemedText>
          )}
          {!editing && card.pos && <ThemedText style={styles.pos}>{card.pos}</ThemedText>}
        </View>
        {!editing && (
          <Pressable onPress={startEdit} style={[styles.editBtn, { borderColor: tint }]}>
            <ThemedText style={{ color: tint }}>Edit</ThemedText>
          </Pressable>
        )}
      </View>

      {editing ? (
        <>
          <Section title="Gender">
            <View style={styles.genderRow}>
              {GENDERS.map((g) => {
                const active = draft?.gender === g;
                return (
                  <Pressable
                    key={String(g)}
                    onPress={() => setDraft((d) => (d ? { ...d, gender: g } : d))}
                    style={[
                      styles.genderChip,
                      { borderColor: tint },
                      active && { backgroundColor: tint },
                    ]}>
                    <ThemedText style={[styles.genderChipText, active && { color: onTint }]}>
                      {g ?? 'none'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Part of speech">
            <TextInput
              style={[styles.input, { borderColor: tint, color: textColor }]}
              value={draft?.pos ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, pos: v } : d))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="noun / verb / adj / …"
            />
          </Section>

          <Section title="Plural">
            <TextInput
              style={[styles.input, { borderColor: tint, color: textColor }]}
              value={draft?.plural ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, plural: v || null } : d))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="(blank if not a noun)"
            />
          </Section>

          <Section title="Translation">
            <TextInput
              style={[styles.input, { borderColor: tint, color: textColor }]}
              value={draft?.translationEn ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, translationEn: v } : d))}
              placeholder="English translation"
            />
          </Section>

          <Section title="Example (German)">
            <TextInput
              style={[styles.input, styles.multiline, { borderColor: tint, color: textColor }]}
              value={draft?.exampleDe ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, exampleDe: v } : d))}
              multiline
              placeholder="Beispielsatz"
            />
          </Section>

          <Section title="Example (English)">
            <TextInput
              style={[styles.input, styles.multiline, { borderColor: tint, color: textColor }]}
              value={draft?.exampleEn ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, exampleEn: v } : d))}
              multiline
              placeholder="Example sentence translation"
            />
          </Section>

          <Section title="Notes / mnemonic">
            <TextInput
              style={[styles.input, styles.multiline, { borderColor: tint, color: textColor }]}
              value={draft?.notes ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, notes: v || null } : d))}
              multiline
              placeholder="A memory hook, an etymology note, anything that helps it stick."
            />
          </Section>

          <View style={styles.editActions}>
            <Pressable
              onPress={cancelEdit}
              disabled={submitting}
              style={[styles.secondaryBtn, { borderColor: tint }]}>
              <ThemedText>Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={saveEdit}
              disabled={submitting}
              style={[styles.primaryBtn, { backgroundColor: tint }, submitting && styles.btnDisabled]}>
              <ThemedText style={[styles.primaryBtnText, { color: onTint }]}>
                {submitting ? 'Saving…' : 'Save'}
              </ThemedText>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {card.translationEn && (
            <Section title="Translation">
              <ThemedText>{card.translationEn}</ThemedText>
            </Section>
          )}

          {card.exampleDe && (
            <Section title="Example">
              <View style={styles.exampleRow}>
                <ThemedText style={[styles.exampleDe, styles.exampleText]}>
                  {card.exampleDe}
                </ThemedText>
                <Pressable
                  onPress={() => speakGerman(card.exampleDe)}
                  hitSlop={8}
                  style={styles.speakBtn}>
                  <IconSymbol name="speaker.wave.2.fill" size={18} color={tint} />
                </Pressable>
              </View>
              {card.exampleEn && (
                <ThemedText style={styles.exampleEn}>{card.exampleEn}</ThemedText>
              )}
            </Section>
          )}

          {card.notes && (
            <Section title="Notes">
              <ThemedText style={styles.notesText}>{card.notes}</ThemedText>
            </Section>
          )}

          <Section title="Sightings">
            <ThemedText>
              Seen {sightings.length} time{sightings.length === 1 ? '' : 's'}
            </ThemedText>
            {sightings.slice(0, 5).map((s, i) => (
              <Pressable
                key={`${s.photoId}-${i}`}
                onPress={() => router.push(`/photo/${s.photoId}` as never)}>
                <ThemedText style={[styles.sighting, styles.sightingLink]}>
                  {`"${s.surfaceForm}" — ${new Date(s.seenAt).toLocaleDateString()} ›`}
                </ThemedText>
              </Pressable>
            ))}
          </Section>

          <Section
            title={`FSRS state · ${card.direction === 'de_to_en' ? 'German → English' : 'English → German'}`}>
            <ThemedText style={styles.mono}>
              state: {['New', 'Learning', 'Review', 'Relearning'][card.state] ?? card.state}
            </ThemedText>
            <ThemedText style={styles.mono}>
              due: {new Date(card.due).toLocaleString()}
            </ThemedText>
            <ThemedText style={styles.mono}>
              stability: {card.stability.toFixed(2)} · difficulty: {card.difficulty.toFixed(2)}
            </ThemedText>
            <ThemedText style={styles.mono}>
              reps: {card.reps} · lapses: {card.lapses}
            </ThemedText>
          </Section>

          {sibling ? (
            <Section
              title={`Reverse card · ${sibling.direction === 'de_to_en' ? 'German → English' : 'English → German'}`}>
              <ThemedText style={styles.mono}>
                state: {['New', 'Learning', 'Review', 'Relearning'][sibling.state] ?? sibling.state}
              </ThemedText>
              <ThemedText style={styles.mono}>
                due: {new Date(sibling.due).toLocaleString()}
              </ThemedText>
              <ThemedText style={styles.mono}>
                reps: {sibling.reps} · lapses: {sibling.lapses}
              </ThemedText>
              <Pressable onPress={() => router.push(`/card/${sibling.id}`)} style={styles.linkRow}>
                <ThemedText style={[styles.linkText, { color: tint }]}>Open reverse card ›</ThemedText>
              </Pressable>
            </Section>
          ) : (
            <Pressable
              disabled={creatingReverse}
              onPress={async () => {
                setCreatingReverse(true);
                try {
                  const res = await createReverseFor(card.id);
                  if (res.created) await refetch();
                } catch (e) {
                  Alert.alert('Could not create reverse', e instanceof Error ? e.message : String(e));
                } finally {
                  setCreatingReverse(false);
                }
              }}
              style={[
                styles.reverseBtn,
                { borderColor: tint },
                creatingReverse && styles.btnDisabled,
              ]}>
              <ThemedText style={{ color: tint }}>
                {creatingReverse
                  ? 'Creating…'
                  : `Create reverse (${card.direction === 'de_to_en' ? 'EN → DE' : 'DE → EN'})`}
              </ThemedText>
            </Pressable>
          )}

          <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
            <ThemedText style={styles.deleteBtnText}>Delete card</ThemedText>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  header: { gap: 6, flex: 1 },
  gender: { fontSize: 18, opacity: 0.7 },
  plural: { fontSize: 14, opacity: 0.7 },
  pos: { fontSize: 14, opacity: 0.6, fontStyle: 'italic' },
  editBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  lemmaInput: {
    fontSize: 28,
    fontWeight: '600',
    borderBottomWidth: 2,
    paddingVertical: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  genderChipText: { fontSize: 14 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 16, marginBottom: 4 },
  exampleDe: { fontStyle: 'italic' },
  exampleEn: { opacity: 0.65 },
  notesText: { fontSize: 15, lineHeight: 22 },
  sighting: { opacity: 0.7, fontSize: 14 },
  lemmaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exampleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  exampleText: { flex: 1 },
  speakBtn: { padding: 4 },
  sightingLink: { paddingVertical: 4 },
  mono: { fontFamily: 'Courier', fontSize: 13, opacity: 0.7 },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  deleteBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E74C3C',
    alignItems: 'center',
  },
  deleteBtnText: { color: '#E74C3C', fontWeight: '600' },
  reverseBtn: {
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  linkRow: { paddingTop: 8 },
  linkText: { fontWeight: '600' },
});
