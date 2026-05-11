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
import { useCard, useCardSightings } from '@/hooks/use-cards';
import { deleteCard, updateCard, type EditableCardFields } from '@/services/card';

const GENDERS: (EditableCardFields['gender'])[] = ['der', 'die', 'das', null];

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;

  const { loading, data: card, error } = useCard(id);
  const sightings = useCardSightings(id);

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

  if (error || !card) {
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
              style={[styles.lemmaInput, { borderColor: tint }]}
              value={draft?.lemma ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, lemma: v } : d))}
              placeholder="Lemma"
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : (
            <ThemedText type="title">{card.lemma}</ThemedText>
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
                    <ThemedText style={[styles.genderChipText, active && { color: 'white' }]}>
                      {g ?? 'none'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Part of speech">
            <TextInput
              style={[styles.input, { borderColor: tint }]}
              value={draft?.pos ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, pos: v } : d))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="noun / verb / adj / …"
            />
          </Section>

          <Section title="Plural">
            <TextInput
              style={[styles.input, { borderColor: tint }]}
              value={draft?.plural ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, plural: v || null } : d))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="(blank if not a noun)"
            />
          </Section>

          <Section title="Translation">
            <TextInput
              style={[styles.input, { borderColor: tint }]}
              value={draft?.translationEn ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, translationEn: v } : d))}
              placeholder="English translation"
            />
          </Section>

          <Section title="Example (German)">
            <TextInput
              style={[styles.input, styles.multiline, { borderColor: tint }]}
              value={draft?.exampleDe ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, exampleDe: v } : d))}
              multiline
              placeholder="Beispielsatz"
            />
          </Section>

          <Section title="Example (English)">
            <TextInput
              style={[styles.input, styles.multiline, { borderColor: tint }]}
              value={draft?.exampleEn ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, exampleEn: v } : d))}
              multiline
              placeholder="Example sentence translation"
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
              <ThemedText style={styles.primaryBtnText}>
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
              <ThemedText style={styles.exampleDe}>{card.exampleDe}</ThemedText>
              {card.exampleEn && (
                <ThemedText style={styles.exampleEn}>{card.exampleEn}</ThemedText>
              )}
            </Section>
          )}

          <Section title="Sightings">
            <ThemedText>
              Seen {sightings.length} time{sightings.length === 1 ? '' : 's'}
            </ThemedText>
            {sightings.slice(0, 5).map((s, i) => (
              <ThemedText key={`${s.photoId}-${i}`} style={styles.sighting}>
                {`"${s.surfaceForm}" — ${new Date(s.seenAt).toLocaleDateString()}`}
              </ThemedText>
            ))}
          </Section>

          <Section title="FSRS state">
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
  sighting: { opacity: 0.7, fontSize: 14 },
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
  primaryBtnText: { color: 'white', fontWeight: '600' },
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
});
