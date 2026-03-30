import React, { useState } from 'react';
import { X, Check, Tag, Loader2 } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { supabase } from '../utils/supabaseClient';
import { trackEvent } from '../utils/analytics';

const MONTHLY_PRICE_ID = import.meta.env.VITE_STRIPE_PRO_MONTHLY_PRICE_ID;
const YEARLY_PRICE_ID = import.meta.env.VITE_STRIPE_PRO_YEARLY_PRICE_ID;

const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : null;

const PLANS = {
  monthly: { price: 20, label: 'Monthly', period: '/mo', priceId: MONTHLY_PRICE_ID },
  seasonal: { price: 67, label: 'Seasonal', period: '/season', priceId: YEARLY_PRICE_ID },
};

export default function PlanPicker() {
  const {
    planPickerOpen,
    planPickerPromoCode,
    closePlanPicker,
    redirectToCheckout,
    trialUsed,
  } = useSubscription();

  if (!planPickerOpen) return null;

  return (
    <PlanPickerInner
      initialPromoCode={planPickerPromoCode}
      closePlanPicker={closePlanPicker}
      redirectToCheckout={redirectToCheckout}
      trialUsed={trialUsed}
    />
  );
}

function PlanPickerInner({ initialPromoCode, closePlanPicker, redirectToCheckout, trialUsed }) {
  const [interval, setInterval] = useState('seasonal');
  const [promoCode, setPromoCode] = useState(initialPromoCode);
  const [promoState, setPromoState] = useState(
    // idle | validating | valid | invalid
    initialPromoCode ? 'pending' : 'idle'
  );
  const [promoResult, setPromoResult] = useState(null); // { discountLabel, percentOff, amountOff }
  const [promoError, setPromoError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-validate if opened with a pre-filled code
  const [autoValidated, setAutoValidated] = useState(false);
  if (initialPromoCode && !autoValidated) {
    setAutoValidated(true);
    validatePromoCode(initialPromoCode);
  }

  async function validatePromoCode(code) {
    const trimmed = (code || promoCode).trim();
    if (!trimmed) return;

    setPromoState('validating');
    setPromoError('');
    setPromoResult(null);

    if (!SUPABASE_FUNCTIONS_URL || !supabase) {
      setPromoState('invalid');
      setPromoError('Cannot validate code');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/validate-promo-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ code: trimmed }),
      });

      const data = await response.json();

      if (data.valid) {
        setPromoState('valid');
        setPromoResult(data);
        trackEvent('promo_code_applied', { success: true });
      } else {
        setPromoState('invalid');
        setPromoError(data.error || 'Invalid code');
        trackEvent('promo_code_applied', { success: false });
      }
    } catch {
      setPromoState('invalid');
      setPromoError('Could not validate code');
      trackEvent('promo_code_applied', { success: false });
    }
  }

  function handlePromoCodeChange(value) {
    setPromoCode(value.toUpperCase());
    // Reset validation when user edits
    if (promoState !== 'idle') {
      setPromoState('idle');
      setPromoResult(null);
      setPromoError('');
    }
  }

  function getDiscountedPrice(basePrice) {
    if (promoState !== 'valid' || !promoResult) return null;
    if (promoResult.percentOff) {
      return Math.round(basePrice * (1 - promoResult.percentOff / 100));
    }
    if (promoResult.amountOff) {
      return Math.max(0, basePrice - promoResult.amountOff / 100);
    }
    return null;
  }

  const plan = PLANS[interval];

  async function handleCheckout() {
    if (!plan.priceId) return;
    setLoading(true);
    await redirectToCheckout(plan.priceId, {
      trialDays: trialUsed ? undefined : 7,
      promoCode: promoState === 'valid' ? promoCode.trim() : undefined,
    });
    setLoading(false);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closePlanPicker(); }}>
      <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={closePlanPicker} aria-label="Close">
          <X size={18} />
        </button>

        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>Choose Your Plan</h3>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 0.25rem', fontSize: '0.875rem' }}>
          Full access to all Pro analytics features.
        </p>
        <p style={{ color: trialUsed ? 'var(--text-muted)' : 'var(--accent-blue)', margin: '0 0 1.5rem', fontSize: '0.82rem', fontWeight: 500 }}>
          {trialUsed
            ? 'Trial already used — subscribe to get full access.'
            : 'Start with a 7-day free trial — no charge until day 8.'}
        </p>

        {/* Plan toggle cards */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <PlanCard
            label="Monthly"
            price="$20"
            period="/mo"
            discountedPrice={promoState === 'valid' ? getDiscountedPrice(20) : null}
            active={interval === 'monthly'}
            onClick={() => setInterval('monthly')}
          />
          <PlanCard
            label="Seasonal"
            price="$67"
            period="/season"
            badge="Save 44%"
            discountedPrice={promoState === 'valid' ? getDiscountedPrice(67) : null}
            active={interval === 'seasonal'}
            onClick={() => setInterval('seasonal')}
          />
        </div>

        {/* Promo code with Apply button */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            Promo Code
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={promoCode}
              onChange={(e) => handlePromoCodeChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && promoCode.trim()) validatePromoCode(); }}
              placeholder="Enter code"
              disabled={promoState === 'validating'}
              style={{
                flex: 1,
                padding: '0.6rem 0.75rem',
                background: 'var(--bg-hover)',
                border: `1px solid ${promoState === 'valid' ? 'var(--accent-green)' : promoState === 'invalid' ? 'var(--accent-red, #e74c3c)' : 'var(--border)'}`,
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={() => validatePromoCode()}
              disabled={!promoCode.trim() || promoState === 'validating' || promoState === 'valid'}
              style={{
                padding: '0.6rem 1rem',
                background: promoState === 'valid' ? 'var(--accent-green)' : 'var(--bg-hover)',
                border: `1px solid ${promoState === 'valid' ? 'var(--accent-green)' : 'var(--border)'}`,
                borderRadius: '8px',
                color: promoState === 'valid' ? '#000' : 'var(--text-primary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: !promoCode.trim() || promoState === 'validating' || promoState === 'valid' ? 'default' : 'pointer',
                opacity: !promoCode.trim() || promoState === 'validating' ? 0.5 : 1,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              {promoState === 'validating' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              {promoState === 'valid' && <Check size={14} />}
              {promoState === 'valid' ? 'Applied' : promoState === 'validating' ? 'Checking' : 'Apply'}
            </button>
          </div>

          {/* Promo feedback */}
          {promoState === 'valid' && promoResult && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              marginTop: '0.4rem',
              fontSize: '0.8rem',
              color: 'var(--accent-green)',
              fontWeight: 500,
            }}>
              <Tag size={12} />
              <span>{promoCode.trim()} — {promoResult.discountLabel}</span>
            </div>
          )}
          {promoState === 'invalid' && promoError && (
            <div style={{
              marginTop: '0.4rem',
              fontSize: '0.8rem',
              color: 'var(--accent-red, #e74c3c)',
            }}>
              {promoError}
            </div>
          )}
        </div>

        {/* Checkout button */}
        <button
          onClick={handleCheckout}
          disabled={loading || !plan.priceId}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: 'var(--accent-blue)',
            color: '#000',
            border: 'none',
            borderRadius: '10px',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: loading || !plan.priceId ? 'not-allowed' : 'pointer',
            opacity: loading || !plan.priceId ? 0.6 : 1,
          }}
        >
          {loading ? 'Redirecting...' : trialUsed ? 'Subscribe' : 'Start Free Trial'}
        </button>
      </div>
    </div>
  );
}

function PlanCard({ label, price, period, badge, discountedPrice, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '1rem',
        background: active ? 'rgba(232, 191, 74, 0.08)' : 'transparent',
        border: `2px solid ${active ? 'var(--accent-blue)' : 'var(--border)'}`,
        borderRadius: '10px',
        cursor: 'pointer',
        textAlign: 'left',
        position: 'relative',
        color: 'var(--text-primary)',
      }}
    >
      {badge && (
        <span style={{
          position: 'absolute',
          top: '-0.6rem',
          right: '0.75rem',
          background: 'var(--accent-green)',
          color: '#000',
          fontSize: '0.65rem',
          fontWeight: 700,
          padding: '0.15rem 0.5rem',
          borderRadius: '4px',
          textTransform: 'uppercase',
        }}>
          {badge}
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
        <div style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: `2px solid ${active ? 'var(--accent-blue)' : 'var(--border)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {active && <Check size={10} style={{ color: 'var(--accent-blue)' }} />}
        </div>
        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{label}</span>
      </div>
      <div>
        {discountedPrice != null ? (
          <>
            <span style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-muted)', textDecoration: 'line-through', marginRight: '0.4rem' }}>
              {price}
            </span>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-green)' }}>
              ${discountedPrice}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{period}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>{price}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{period}</span>
          </>
        )}
      </div>
    </button>
  );
}
