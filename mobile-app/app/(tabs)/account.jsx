// Account tab — sign in / sign up (email+password, same Supabase accounts as
// the website), in-app Pro checkout and billing (ADR-027), roster sync
// guidance, demo mode, account deletion, and outbound links.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import {
  CircleUserRound, LogOut, ExternalLink, Puzzle, BookOpen, Sparkles, RefreshCw, Trash2, RotateCcw,
} from 'lucide-react-native';
import ScreenScaffold, { HelpSection } from '../../src/components/ScreenScaffold';
import { Card, SectionTitle, Button } from '../../src/components/ui';
import PlanPicker from '../../src/components/PlanPicker';
import { colors, spacing, radii, type } from '../../src/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { useSubscription } from '../../src/contexts/SubscriptionContext';
import { usePortfolio } from '../../src/contexts/PortfolioContext';
import { WEB_APP_URL, INSTALL_URL, BLOG_URL, X_URL } from '../../shared/config';

const HELP = (
  <>
    <HelpSection heading="One account everywhere">Your BestBallExposures.com account works here — rosters synced by the Chrome extension and saved rankings load automatically.</HelpSection>
    <HelpSection heading="Subscribe in the app">Upgrade to Pro right here — billed through your Apple ID, and the same subscription unlocks the website too. Manage or cancel anytime in iOS Settings.</HelpSection>
    <HelpSection heading="Desktop steps">Roster sync (Chrome extension) and rankings CSV upload happen on your computer. Everything else lives in the app.</HelpSection>
  </>
);

function Row({ icon: Icon, label, onPress, danger }) {
  return (
    <Pressable style={styles.linkRow} onPress={onPress}>
      <Icon size={17} color={danger ? colors.negative : colors.textSecondary} />
      <Text style={[type.body, { flex: 1 }, danger && { color: colors.negative }]}>{label}</Text>
      <ExternalLink size={13} color={colors.textMuted} />
    </Pressable>
  );
}

export default function AccountTab() {
  const {
    user, authError, clearError, signInWithEmail, signUpWithEmail, resetPassword, signOut, deleteAccount,
    signInWithApple, signInWithGoogle, appleAvailable, googleAvailable,
  } = useAuth();
  const {
    isProUser, isBetaActive, betaDaysRemaining, isCompActive, status,
    openBillingPortal, checkoutFinalizing, restorePurchases,
  } = useSubscription();
  const { rosterData, isUsingDemoData, loadDemoData, exitDemo, reload } = usePortfolio();

  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);
    if (result?.error) {
      Alert.alert('Restore failed', result.error);
    } else if (result?.status === 'restored') {
      Alert.alert('Purchases restored', 'Your Pro subscription is active again.');
    } else {
      Alert.alert('Nothing to restore', 'No active subscription was found for your Apple ID.');
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, synced rosters, and saved rankings, and cancels any active subscription. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error, hadActiveAppleSub } = await deleteAccount();
            setDeleting(false);
            if (error) {
              Alert.alert('Could not delete account', error.message);
            } else if (hadActiveAppleSub) {
              Alert.alert(
                'Account deleted',
                'Your account is deleted. Your Apple subscription must be canceled separately in Settings › Apple ID › Subscriptions, or it will keep renewing.',
              );
            }
          },
        },
      ],
    );
  };

  const submit = async () => {
    if (!email || !password) return;
    setBusy(true);
    setNotice(null);
    clearError();
    const fn = mode === 'signup' ? signUpWithEmail : signInWithEmail;
    const { error } = await fn(email.trim(), password);
    if (!error && mode === 'signup') {
      setNotice('Check your inbox to confirm your email, then sign in.');
    }
    setBusy(false);
  };

  const forgot = async () => {
    if (!email) { setNotice('Enter your email first.'); return; }
    setBusy(true);
    const { error } = await resetPassword(email.trim());
    setNotice(error ? null : 'Password reset email sent — the link opens the website.');
    setBusy(false);
  };

  // Provider sign-in: onAuthStateChange swaps this card to the signed-in view
  // on success, so the handlers only manage the busy flag and clear notices.
  const providerSignIn = async (fn) => {
    setBusy(true);
    setNotice(null);
    clearError();
    await fn();
    setBusy(false);
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScreenScaffold title="Account" help={HELP} waitForData={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        {!user ? (
          <Card>
            <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
              <CircleUserRound size={36} color={colors.accent} />
              <Text style={[type.h2, { marginTop: spacing.sm }]}>
                {mode === 'signup' ? 'Create your account' : 'Welcome back'}
              </Text>
              <Text style={[type.secondary, { textAlign: 'center', marginTop: 4 }]}>
                Same account as BestBallExposures.com
              </Text>
            </View>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
            />
            {authError && <Text style={{ color: colors.negative, marginBottom: spacing.sm }}>{authError}</Text>}
            {notice && <Text style={{ color: colors.positive, marginBottom: spacing.sm }}>{notice}</Text>}
            <Button
              title={busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              onPress={submit}
              disabled={busy}
            />

            {(appleAvailable || googleAvailable) && (
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={[type.muted, { marginHorizontal: spacing.sm }]}>or</Text>
                <View style={styles.dividerLine} />
              </View>
            )}
            {appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={radii.md}
                style={{ width: '100%', height: 46, marginBottom: spacing.sm }}
                onPress={() => providerSignIn(signInWithApple)}
              />
            )}
            {googleAvailable && (
              <Button
                title="Continue with Google"
                variant="ghost"
                onPress={() => providerSignIn(signInWithGoogle)}
                disabled={busy}
              />
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }}>
              <Pressable onPress={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); clearError(); setNotice(null); }}>
                <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>
                  {mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create account'}
                </Text>
              </Pressable>
              <Pressable onPress={forgot}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Forgot password</Text>
              </Pressable>
            </View>
          </Card>
        ) : (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <CircleUserRound size={34} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[type.h3]} numberOfLines={1}>{user.email}</Text>
                <Text style={type.secondary}>
                  {isProUser ? 'Pro' : 'Free'} tier
                  {isBetaActive ? ` · beta access (${betaDaysRemaining}d left)` : ''}
                  {isCompActive ? ' · comp access' : ''}
                  {status ? ` · ${status}` : ''}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {!isProUser ? (
                <Button
                  title={checkoutFinalizing ? 'Finalizing your subscription…' : 'Upgrade to Pro'}
                  onPress={() => setPickerOpen(true)}
                  disabled={checkoutFinalizing}
                />
              ) : (
                <Button title="Manage subscription" variant="ghost" onPress={openBillingPortal} />
              )}
              <Pressable style={styles.linkRow} onPress={handleRestore} disabled={restoring}>
                <RotateCcw size={16} color={colors.textSecondary} />
                <Text style={[type.body, { flex: 1 }]}>
                  {restoring ? 'Restoring…' : 'Restore purchases'}
                </Text>
              </Pressable>
            </View>
          </Card>
        )}

        {/* Portfolio / sync */}
        <SectionTitle>Portfolio</SectionTitle>
        <Card>
          <Text style={type.secondary}>
            {rosterData.length > 0
              ? isUsingDemoData
                ? 'Viewing bundled demo data.'
                : `${new Set(rosterData.map(r => r.entry_id)).size} rosters synced from the Chrome extension.`
              : 'No rosters yet — sync happens on your desktop with the Chrome extension.'}
          </Text>
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Row icon={Puzzle} label="Extension install guide (desktop)" onPress={() => WebBrowser.openBrowserAsync(INSTALL_URL)} />
            <Pressable style={styles.linkRow} onPress={reload}>
              <RefreshCw size={16} color={colors.textSecondary} />
              <Text style={[type.body, { flex: 1 }]}>Refresh portfolio data</Text>
            </Pressable>
            {isUsingDemoData ? (
              <Pressable style={styles.linkRow} onPress={exitDemo}>
                <Sparkles size={16} color={colors.textSecondary} />
                <Text style={[type.body, { flex: 1 }]}>Exit demo mode</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.linkRow} onPress={loadDemoData}>
                <Sparkles size={16} color={colors.textSecondary} />
                <Text style={[type.body, { flex: 1 }]}>Load demo data</Text>
              </Pressable>
            )}
          </View>
        </Card>

        {/* Links */}
        <SectionTitle>More</SectionTitle>
        <Card>
          <View style={{ gap: spacing.sm }}>
            <Row icon={ExternalLink} label="BestBallExposures.com" onPress={() => WebBrowser.openBrowserAsync(WEB_APP_URL)} />
            <Row icon={BookOpen} label="Blog" onPress={() => WebBrowser.openBrowserAsync(BLOG_URL)} />
            <Row icon={ExternalLink} label="@BBExposures on X" onPress={() => WebBrowser.openBrowserAsync(X_URL)} />
          </View>
        </Card>

        {user && (
          <Card>
            <Pressable
              style={styles.linkRow}
              onPress={async () => { await signOut(); }}
            >
              <LogOut size={16} color={colors.negative} />
              <Text style={[type.body, { flex: 1, color: colors.negative }]}>Sign out</Text>
            </Pressable>
            <Pressable
              style={styles.linkRow}
              onPress={confirmDeleteAccount}
              disabled={deleting}
            >
              <Trash2 size={16} color={colors.negative} />
              <Text style={[type.body, { flex: 1, color: colors.negative }]}>
                {deleting ? 'Deleting account…' : 'Delete account'}
              </Text>
            </Pressable>
            <Text style={[type.muted, { marginTop: spacing.sm }]}>
              Email changes are handled on the website under Account Settings.
            </Text>
          </Card>
        )}

        <Text style={[type.muted, { textAlign: 'center', marginTop: spacing.md }]}>
          Best Ball Exposures · v{version} · iOS
        </Text>
      </ScrollView>
      <PlanPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.md,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.sm,
    fontSize: 14,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 9,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderDefault,
  },
});
