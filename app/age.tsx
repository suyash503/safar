import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { readError } from '../lib/errors';
import { colour, space } from '../lib/theme';

// The row already exists — handle_new_user() creates both halves of the profile
// with the account (schema.sql §17), so this is an UPDATE, never an INSERT.
async function saveDob(iso: string) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return new Error('Signed out');
  const { error } = await supabase
    .from('profile_private')
    .update({ dob: iso })
    .eq('id', user.user.id);
  return error;
}

function isoFrom(d: string, m: string, y: string) {
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  if (!day || !month || !year || y.length !== 4) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 February and friends, which would otherwise roll forward silently.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export default function AgeGate() {
  const router = useRouter();
  const [d, setD] = useState('');
  const [m, setM] = useState('');
  const [y, setY] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const iso = isoFrom(d, m, y);

  async function onSave() {
    if (!iso) {
      setError('That date does not exist.');
      return;
    }
    setBusy(true);
    setError(null);
    const err = await saveDob(iso);
    setBusy(false);
    if (err) {
      setError(readError(err)?.message ?? null);
      return;
    }
    router.replace('/onboard');
  }

  return (
    <View style={styles.screen}>
      <View>
        <Text style={styles.title}>Your date of birth</Text>
        <Text style={styles.body}>
          Safar is 18 and over. Nobody sees this — not your age, not your birthday. It is
          checked once and then it only ever says yes or no.
        </Text>

        <View style={styles.row}>
          <Field value={d} onChange={setD} placeholder="DD" length={2} />
          <Field value={m} onChange={setM} placeholder="MM" length={2} />
          <Field value={y} onChange={setY} placeholder="YYYY" length={4} wide />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Pressable
        style={[styles.button, (!iso || busy) && styles.buttonOff]}
        onPress={onSave}
        disabled={!iso || busy}
      >
        <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save'}</Text>
      </Pressable>
    </View>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  length,
  wide,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  length: number;
  wide?: boolean;
}) {
  return (
    <TextInput
      style={[styles.input, wide && styles.inputWide]}
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, length))}
      placeholder={placeholder}
      placeholderTextColor={colour.steel}
      keyboardType="number-pad"
      maxLength={length}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colour.oxford,
    padding: space.lg,
    paddingTop: space.xl * 2,
    paddingBottom: space.xl,
    justifyContent: 'space-between',
  },
  title: { color: colour.moonlight, fontSize: 26, fontWeight: '700', marginBottom: space.md },
  body: { color: colour.frost, fontSize: 16, lineHeight: 24, marginBottom: space.lg },
  row: { flexDirection: 'row', gap: space.sm },
  input: {
    backgroundColor: colour.storm,
    color: colour.moonlight,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: space.md,
    fontSize: 20,
    width: 76,
    textAlign: 'center',
  },
  inputWide: { width: 108 },
  error: { color: colour.danger, marginTop: space.md },
  button: {
    backgroundColor: colour.moonlight,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonOff: { opacity: 0.35 },
  buttonText: { color: colour.oxford, fontSize: 16, fontWeight: '600' },
});
