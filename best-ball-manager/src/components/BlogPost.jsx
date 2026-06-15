import { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Lock, ArrowLeft, ArrowRight, Sparkles, Check, Eye, Maximize2, X } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext';
import {
  getPublishedPosts,
  getPostBySlug,
  canReadPost,
  isPostFree,
  isLive,
  getLede,
  formatPostDate,
} from '../utils/blog';
import styles from './BlogPost.module.css';

// Turn the authoring placeholder `[INSERT IMAGE: desc]` into an image node we
// can render as a styled figure frame (src sentinel detected in the img map).
const IMG_SENTINEL = '#insert-image';
function preprocess(markdown) {
  return markdown.replace(/\[INSERT IMAGE:\s*([^\]]*)\]/gi, (_, desc) => `![${desc.trim()}](${IMG_SENTINEL})`);
}

// Raster images can't survive being shrunk into the 720px column — they get a
// click/tap-to-zoom affordance. Vector (SVG) figures scale crisply and render as-is.
const isRaster = (src) => /\.(png|jpe?g|webp|gif)$/i.test(src || '');

// Built per-render so the img renderer can call back into component state.
function makeComponents(onZoom) {
  return {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    ),
    // remark wraps a standalone image in a <p>; since our img renders a block-level
    // figure, unwrap those paragraphs. Keeps the figure out of a <p> (invalid nesting)
    // and ensures the lede stays the first <p> so the drop cap lands on it, even when
    // a post opens with a hero image.
    p: ({ children, node }) => {
      const kids = node?.children ?? [];
      const imageOnly = kids.length > 0 && kids.every(
        (c) => c.tagName === 'img' || (c.type === 'text' && !c.value.trim()),
      );
      return imageOnly ? <>{children}</> : <p>{children}</p>;
    },
    // Render images as block-level spans so we never nest a <div> inside a <p>.
    img: ({ src, alt }) => {
      if (src === IMG_SENTINEL) {
        return (
          <span className={styles.figurePlaceholder} role="img" aria-label={alt || 'Image placeholder'}>
            <span className={styles.figureBadge}>Figure</span>
            <span className={styles.figureCaption}>{alt || 'Image to come'}</span>
          </span>
        );
      }
      if (isRaster(src)) {
        return (
          <span className={styles.figure}>
            <button
              type="button"
              className={styles.zoomFigure}
              onClick={() => onZoom({ src, alt: alt || '' })}
              aria-label={alt ? `Enlarge: ${alt}` : 'Enlarge image'}
            >
              <img src={src} alt={alt || ''} loading="lazy" />
              <span className={styles.zoomHint} aria-hidden="true">
                <Maximize2 size={12} strokeWidth={2.5} /> Enlarge
              </span>
            </button>
            {alt ? <span className={styles.figureCaption}>{alt}</span> : null}
          </span>
        );
      }
      return (
        <span className={styles.figure}>
          <img src={src} alt={alt || ''} loading="lazy" />
          {alt ? <span className={styles.figureCaption}>{alt}</span> : null}
        </span>
      );
    },
  };
}

function Markdown({ children, onZoom }) {
  const components = useMemo(() => makeComponents(onZoom), [onZoom]);
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}

// Full-screen overlay: image at native resolution, scroll/pan when larger than the
// viewport, pinch-zoom on touch. Click the image to toggle fit-to-screen ↔ 100%.
function Lightbox({ src, alt, onClose }) {
  const [actualSize, setActualSize] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Portal to <body>: the article retains a transform from its `rise` animation
  // (fill-mode: both), which would otherwise make this fixed overlay positioned
  // relative to the article instead of the viewport.
  return createPortal((
    <div
      className={styles.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Enlarged image'}
      onClick={onClose}
    >
      <button ref={closeRef} type="button" className={styles.lightboxClose} onClick={onClose} aria-label="Close">
        <X size={20} strokeWidth={2.5} />
      </button>
      <div className={styles.lightboxScroll} onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt || ''}
          className={`${styles.lightboxImg} ${actualSize ? styles.lightboxActual : ''}`}
          onClick={() => setActualSize((v) => !v)}
        />
      </div>
      {alt ? <span className={styles.lightboxCaption}>{alt}</span> : null}
    </div>
  ), document.body);
}

export default function BlogPost({ slug }) {
  const { tier } = useSubscription();
  const { isAuthor } = useAuth();
  const [zoomed, setZoomed] = useState(null);
  const posts = useMemo(() => getPublishedPosts({ includeScheduled: isAuthor }), [isAuthor]);
  const post = useMemo(() => getPostBySlug(slug, { includeScheduled: isAuthor }), [slug, isAuthor]);

  // Unknown, draft, or not-yet-live (for non-authors) slug → bounce to the index.
  if (!post) {
    if (typeof window !== 'undefined') window.location.replace('/blog');
    return null;
  }

  const idx = posts.findIndex((p) => p.slug === slug);
  const newer = idx > 0 ? posts[idx - 1] : null;   // posts sorted newest-first
  const older = idx >= 0 && idx < posts.length - 1 ? posts[idx + 1] : null;

  const scheduled = !isLive(post);
  // Free/Pro tag anchors to the live list, never the author-preview list.
  const free = isPostFree(slug);
  const unlocked = canReadPost(slug, tier, undefined, { isAuthor });

  return (
    <article className={styles.article}>
      <a href="/blog" className={styles.back}>
        <ArrowLeft size={14} strokeWidth={2.25} /> Against ADP
      </a>

      {scheduled && (
        <div className={styles.previewBanner} role="status">
          <Eye size={14} strokeWidth={2.5} />
          <span>
            <strong>Preview.</strong> Scheduled for {formatPostDate(post.date)} — not yet public.
            Only you can see this.
          </span>
        </div>
      )}

      <header className={styles.head}>
        <div className={styles.kickerRow}>
          {scheduled ? (
            <span className={styles.proTag}><Eye size={10} strokeWidth={2.75} /> Scheduled {formatPostDate(post.date)}</span>
          ) : !free && (
            <span className={styles.proTag}><Lock size={10} strokeWidth={2.75} /> Pro archive</span>
          )}
          {post.topicTags.map((t) => (
            <span key={t} className={styles.tag}>{t}</span>
          ))}
        </div>
        <h1 className={styles.title}>{post.title}</h1>
        <div className={styles.byline}>
          <span className={styles.date}>{formatPostDate(post.date)}</span>
          <span className={styles.dot} aria-hidden="true">·</span>
          <span>{post.readingTime} min read</span>
        </div>
      </header>

      <div className={styles.ruleWrap} aria-hidden="true"><span /></div>

      {unlocked ? (
        <div className={styles.prose}>
          <Markdown onZoom={setZoomed}>{preprocess(post.content)}</Markdown>
        </div>
      ) : (
        <LockedBody post={post} onZoom={setZoomed} />
      )}

      {(newer || older) && (
        <nav className={styles.pager} aria-label="More issues">
          {older ? (
            <a href={`/blog/${older.slug}`} className={`${styles.pagerLink} ${styles.pagerPrev}`}>
              <span className={styles.pagerDir}><ArrowLeft size={13} /> Older</span>
              <span className={styles.pagerTitle}>{older.title}</span>
            </a>
          ) : <span />}
          {newer ? (
            <a href={`/blog/${newer.slug}`} className={`${styles.pagerLink} ${styles.pagerNext}`}>
              <span className={styles.pagerDir}>Newer <ArrowRight size={13} /></span>
              <span className={styles.pagerTitle}>{newer.title}</span>
            </a>
          ) : <span />}
        </nav>
      )}

      {zoomed && (
        <Lightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} />
      )}
    </article>
  );
}

function LockedBody({ post, onZoom }) {
  return (
    <div className={styles.locked}>
      <div className={styles.lockedProse}>
        <div className={styles.prose}>
          <Markdown onZoom={onZoom}>{getLede(post.content, 2)}</Markdown>
        </div>
        <div className={styles.fade} aria-hidden="true" />
      </div>

      <div className={styles.upsell}>
        <div className={styles.lockBadge}>
          <Lock size={20} strokeWidth={2.25} />
        </div>
        <span className={styles.upsellKicker}><Sparkles size={12} /> Pro archive</span>
        <h2 className={styles.upsellTitle}>This week's issue is free — the archive is for Pro</h2>
        <p className={styles.upsellText}>
          The newest issue of Against ADP is always free to read. Once a new one publishes,
          earlier issues move into the Pro archive alongside every advanced analytic in
          Best Ball Exposures.
        </p>
        <ul className={styles.upsellBullets}>
          <li><Check size={14} strokeWidth={2.5} /> The full back catalogue of weekly issues</li>
          <li><Check size={14} strokeWidth={2.5} /> ADP tracker, combos, rankings &amp; draft assistant</li>
          <li><Check size={14} strokeWidth={2.5} /> Live draft overlay across Underdog &amp; DraftKings</li>
        </ul>
        <a href="/?upgrade=1" className={styles.upsellBtn}>Unlock with Pro</a>
        <span className={styles.upsellFine}>$20/mo · cancel anytime · this week's issue stays free</span>
      </div>
    </div>
  );
}
