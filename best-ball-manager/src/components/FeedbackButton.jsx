import React, { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import styles from './FeedbackButton.module.css';

const FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-feedback`
  : null;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const TYPES = ['Bug', 'Suggestion', 'Other'];
const MAX_CHARS = 1000;

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState('Bug');
  const [message, setMessage] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  const reset = useCallback(() => {
    setType('Bug');
    setMessage('');
    setUserEmail('');
    setStatus('idle');
    setErrorMsg('');
  }, []);

  const handleOpen = useCallback(() => {
    reset();
    setIsOpen(true);
  }, [reset]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!message.trim() || !FUNCTION_URL) return;

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
        body: JSON.stringify({
          type,
          message: message.trim(),
          userEmail: userEmail.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      setStatus('success');
      setTimeout(() => {
        setIsOpen(false);
        reset();
      }, 2000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    }
  }, [type, message, userEmail, reset]);

  return (
    <>
      <button className={styles.headerButton} onClick={handleOpen} aria-label="Send feedback">
        Feedback
      </button>

      {isOpen && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && handleClose()}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Send feedback">
            <div className={styles.header}>
              <h2 className={styles.title}>Send Feedback</h2>
              <button className={styles.closeButton} onClick={handleClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {status === 'success' ? (
              <div className={styles.successState}>
                <div className={styles.successIcon}>✓</div>
                <p>Thanks for your feedback!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="fb-type">Type</label>
                  <select
                    id="fb-type"
                    className={styles.select}
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    disabled={status === 'loading'}
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="fb-message">
                    Message <span className={styles.required}>*</span>
                  </label>
                  <textarea
                    id="fb-message"
                    className={styles.textarea}
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
                    placeholder="Describe the bug, suggestion, or issue..."
                    rows={5}
                    disabled={status === 'loading'}
                  />
                  <span className={styles.charCount}>{message.length}/{MAX_CHARS}</span>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="fb-email">Your email <span className={styles.optional}>(optional)</span></label>
                  <input
                    id="fb-email"
                    type="email"
                    className={styles.input}
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="so we can follow up"
                    disabled={status === 'loading'}
                  />
                </div>

                {status === 'error' && (
                  <p className={styles.errorMsg}>{errorMsg}</p>
                )}

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={handleClose}
                    disabled={status === 'loading'}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.submitButton}
                    disabled={!message.trim() || status === 'loading' || !FUNCTION_URL}
                  >
                    {status === 'loading' ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
