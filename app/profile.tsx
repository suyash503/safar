import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  LIMITS,
  loadProfile,
  saveProfile,
  type PrivateProfile,
  type PublicProfile,
} from '../lib/profile';
import { colour, space } from '../lib/theme';

/**
 * The whole product promise is legible on this one screen: what a stranger sees,
 * and what stays locked until you both choose otherwise. So the two halves are
 * separated visually and labelled in plain words — never "public/private", which
 * means nothing at 2am on a train.
 */
export default function Profile() {
  const router = useRouter();
  const [pub, setPub] = useState<PublicProfile | null>(null);
  const [priv, setPriv] = useState<PrivateProfile | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const result = await loadProfile();
        if (cancelled) return;
        if (result.ok) {
          setPub(result.pub);
          setPriv(result.priv);
        } else {
          setNote(result.error.message);
        }
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  function addTag() {
    const tag = tagDraft.trim().replace(/^#/, '');
    if (!pub || !tag) return;
    if (pub.tags.length >= LIMITS.tags || pub.tags.includes(tag)) {
      setTagDraft('');
      return;
    }
    setPub({ ...pub, tags: [...pub.tags, tag] });
    setTagDraft('');
  }

  async function onSave() {
    if (!pub || !priv) return;
    setBusy(true);
    setNote(null);
    const error = await saveProfile(pub, priv);
    setBusy(false);
    if (error) {
      setNote(error.message);
      return;
    }
    router.back();
  }

  if (loading || !pub || !priv) {
    return (
      <View style={[styles.screen, styles.centre]}>
        {note ? <Text style={styles.note}>{note}</Text> : <ActivityIndicator color={colour.frost} />}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>You</Text>

        <Text style={styles.legend}>Anyone on your train sees this</Text>

        <View style={styles.row}>
          {pub.photo_url ? (
            <Image source={{ uri: pub.photo_url }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoBlank]} />
          )}
          <Text style={styles.hint}>From your Google account.</Text>
        </View>

        <Field
          label="First name"
          value={pub.first_name}
          onChange={(v) => setPub({ ...pub, first_name: v.slice(0, LIMITS.firstName) })}
          placeholder="Suyash"
        />

        <Field
          label="Two lines about you"
          value={pub.bio}
          onChange={(v) => setPub({ ...pub, bio: v.slice(0, LIMITS.bio) })}
          placeholder="Second year, going home for Diwali. Will talk about anything except cricket."
          multiline
          counter={`${pub.bio.length}/${LIMITS.bio}`}
        />

        <View style={styles.block}>
          <Text style={styles.label}>Tags · up to {LIMITS.tags}</Text>
          <View style={styles.chips}>
            {pub.tags.map((t) => (
              <Pressable
                key={t}
                style={styles.chip}
                onPress={() => setPub({ ...pub, tags: pub.tags.filter((x) => x !== t) })}
              >
                <Text style={styles.chipText}>{t} ✕</Text>
              </Pressable>
            ))}
          </View>
          {pub.tags.length < LIMITS.tags ? (
            <View style={styles.tagRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={tagDraft}
                onChangeText={setTagDraft}
                onSubmitEditing={addTag}
                returnKeyType="done"
                placeholder="music, cricket, first time travelling alone"
                placeholderTextColor={colour.steel}
              />
              <Pressable style={styles.add} onPress={addTag}>
                <Text style={styles.addText}>Add</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.divider} />

        <Text style={styles.legend}>Locked</Text>
        <Text style={styles.hint}>
          Nobody sees any of this unless you both tap unlock. Asking is silent — the other
          person is never told you looked.
        </Text>

        <Field
          label="College"
          value={priv.college}
          onChange={(v) => setPriv({ ...priv, college: v })}
          placeholder="IIIT Lucknow"
        />
        <Field
          label="Year"
          value={priv.study_year}
          onChange={(v) => setPriv({ ...priv, study_year: v })}
          placeholder="Second"
        />
        <Field
          label="Hometown"
          value={priv.hometown}
          onChange={(v) => setPriv({ ...priv, hometown: v })}
          placeholder="Kanpur"
        />
        <Field
          label="Instagram"
          value={priv.instagram}
          onChange={(v) => setPriv({ ...priv, instagram: v.replace(/^@/, '') })}
          placeholder="username"
        />
        <Field
          label="Phone"
          value={priv.phone}
          onChange={(v) => setPriv({ ...priv, phone: v })}
          placeholder="Optional"
          keyboardType="phone-pad"
        />

        {note ? <Text style={styles.error}>{note}</Text> : null}

        <Pressable style={[styles.button, busy && styles.buttonOff]} onPress={onSave} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save'}</Text>
        </Pressable>
        <Pressable style={styles.quiet} onPress={() => router.back()}>
          <Text style={styles.quietText}>Back</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  counter,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  counter?: string;
  keyboardType?: 'phone-pad';
}) {
  return (
    <View style={styles.block}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {counter ? <Text style={styles.counter}>{counter}</Text> : null}
      </View>
      <TextInput
        style={[styles.input, multiline && styles.inputTall]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colour.steel}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: colour.oxford,
    padding: space.lg,
    paddingTop: space.xl * 2,
    paddingBottom: space.xl,
    gap: space.md,
  },
  centre: { justifyContent: 'center' },
  title: { color: colour.moonlight, fontSize: 26, fontWeight: '700' },
  legend: {
    color: colour.moonlight,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  hint: { color: colour.steel, fontSize: 13, lineHeight: 19, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  photo: { width: 56, height: 56, borderRadius: 28, backgroundColor: colour.steel },
  photoBlank: { opacity: 0.4 },
  block: { gap: space.xs },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { color: colour.frost, fontSize: 14 },
  counter: { color: colour.steel, fontSize: 12 },
  input: {
    backgroundColor: colour.storm,
    color: colour.moonlight,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputTall: { minHeight: 88, textAlignVertical: 'top' },
  tagRow: { flexDirection: 'row', gap: space.sm },
  add: {
    backgroundColor: colour.storm,
    borderRadius: 12,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  addText: { color: colour.moonlight, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    backgroundColor: colour.storm,
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  chipText: { color: colour.frost, fontSize: 14 },
  divider: { height: 1, backgroundColor: colour.storm, marginVertical: space.sm },
  note: { color: colour.frost, textAlign: 'center' },
  error: { color: colour.danger, textAlign: 'center' },
  button: {
    backgroundColor: colour.moonlight,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: space.sm,
  },
  buttonOff: { opacity: 0.5 },
  buttonText: { color: colour.oxford, fontSize: 16, fontWeight: '600' },
  quiet: { paddingVertical: 12, alignItems: 'center' },
  quietText: { color: colour.steel, fontSize: 14 },
});
