import React, { useState } from 'react';
import { X, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { trackEvent } from '../utils/analytics';

export default function AuthModal({ isOpen, onClose, message }) {
  const { signInWithGoogle, signUpWithEmail, signInWithEmail, resetPassword, updatePassword, recoveryMode, authError, clearError } = useAuth();

  const [tab, setTab] = useState('signin');
  const [forgotPassword, setForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  function handleTabChange(newTab) {
    setTab(newTab);
    setForgotPassword(false);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setSuccessMessage('');
    clearError();
  }

  function handleInputChange(setter) {
    return (e) => {
      setter(e.target.value);
      clearError();
    };
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setLoading(true);
    const { error } = await signInWithEmail(email, password);
    setLoading(false);
    if (!error) { trackEvent('auth_login'); onClose(); }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    if (password !== confirmPassword) return;
    setLoading(true);
    const { error } = await signUpWithEmail(email, password);
    setLoading(false);
    if (!error) {
      trackEvent('auth_signup');
      onClose();
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (!error) {
      setSuccessMessage('Password reset link sent — check your email.');
    }
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    if (password !== confirmPassword) return;
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (!error) {
      setSuccessMessage('Password updated — you\'re signed in.');
    }
  }

  const passwordMismatch = confirmPassword && password !== confirmPassword;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {!recoveryMode && (
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        )}

        {recoveryMode && !successMessage && (
          <form className="modal-form" onSubmit={handleUpdatePassword}>
            <p className="modal-hint" style={{ textAlign: 'center', marginBottom: 8 }}>Set a new password for your account.</p>
            <div className="modal-field">
              <Lock size={15} className="modal-field-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="New password"
                value={password}
                onChange={handleInputChange(setPassword)}
                required
                autoComplete="new-password"
              />
              <button type="button" className="modal-pw-toggle" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <div className="modal-field">
              <Lock size={15} className="modal-field-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={handleInputChange(setConfirmPassword)}
                required
                autoComplete="new-password"
              />
            </div>
            {passwordMismatch && <p className="modal-error">Passwords do not match.</p>}
            {authError && !passwordMismatch && <p className="modal-error">{authError}</p>}
            <button type="submit" className="toolbar-btn modal-submit-btn" disabled={loading || !!passwordMismatch}>
              {loading ? 'Updating…' : 'Set New Password'}
            </button>
          </form>
        )}

        {recoveryMode && successMessage && (
          <div className="modal-success">
            <p>{successMessage}</p>
            <button className="toolbar-btn modal-submit-btn" onClick={onClose}>Done</button>
          </div>
        )}

        {!recoveryMode && message && !successMessage && (
          <p className="modal-hint" style={{ textAlign: 'center', marginBottom: 8 }}>{message}</p>
        )}

        {!recoveryMode && !forgotPassword && !successMessage && (
          <div className="modal-tabs">
            <button
              className={`modal-tab${tab === 'signin' ? ' active' : ''}`}
              onClick={() => handleTabChange('signin')}
            >
              Sign In
            </button>
            <button
              className={`modal-tab${tab === 'signup' ? ' active' : ''}`}
              onClick={() => handleTabChange('signup')}
            >
              Sign Up
            </button>
          </div>
        )}

        {!recoveryMode && tab === 'signin' && !forgotPassword && !successMessage && (
          <form className="modal-form" onSubmit={handleSignIn}>
            <div className="modal-field">
              <Mail size={15} className="modal-field-icon" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={handleInputChange(setEmail)}
                required
                autoComplete="email"
              />
            </div>
            <div className="modal-field">
              <Lock size={15} className="modal-field-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={handleInputChange(setPassword)}
                required
                autoComplete="current-password"
              />
              <button type="button" className="modal-pw-toggle" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <button
              type="button"
              className="modal-link-btn"
              onClick={() => { setForgotPassword(true); clearError(); }}
            >
              Forgot password?
            </button>
            {authError && <p className="modal-error">{authError}</p>}
            <button type="submit" className="toolbar-btn modal-submit-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {!recoveryMode && tab === 'signin' && forgotPassword && !successMessage && (
          <form className="modal-form" onSubmit={handleResetPassword}>
            <button
              type="button"
              className="modal-back-btn"
              onClick={() => { setForgotPassword(false); clearError(); }}
            >
              ← Back to Sign In
            </button>
            <p className="modal-hint">Enter your email and we'll send a reset link.</p>
            <div className="modal-field">
              <Mail size={15} className="modal-field-icon" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={handleInputChange(setEmail)}
                required
                autoComplete="email"
              />
            </div>
            {authError && <p className="modal-error">{authError}</p>}
            <button type="submit" className="toolbar-btn modal-submit-btn" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        {!recoveryMode && tab === 'signup' && !successMessage && (
          <form className="modal-form" onSubmit={handleSignUp}>
            <div className="modal-field">
              <Mail size={15} className="modal-field-icon" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={handleInputChange(setEmail)}
                required
                autoComplete="email"
              />
            </div>
            <div className="modal-field">
              <Lock size={15} className="modal-field-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={handleInputChange(setPassword)}
                required
                autoComplete="new-password"
              />
              <button type="button" className="modal-pw-toggle" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <div className="modal-field">
              <Lock size={15} className="modal-field-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={handleInputChange(setConfirmPassword)}
                required
                autoComplete="new-password"
              />
            </div>
            {passwordMismatch && <p className="modal-error">Passwords do not match.</p>}
            {authError && !passwordMismatch && <p className="modal-error">{authError}</p>}
            <button
              type="submit"
              className="toolbar-btn modal-submit-btn"
              disabled={loading || !!passwordMismatch}
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}

        {!recoveryMode && successMessage && (
          <div className="modal-success">
            <p>{successMessage}</p>
            <button className="toolbar-btn modal-submit-btn" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
