import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Lock, ArrowLeft, ArrowRight, Sparkles, Check } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import {
  getPublishedPosts,
  getPostBySlug,
  canReadPost,
  isPostFree,
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

const MD_COMPONENTS = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  ),
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
    return (
      <span className={styles.figure}>
        <img src={src} alt={alt || ''} loading="lazy" />
        {alt ? <span className={styles.figureCaption}>{alt}</span> : null}
      </span>
    );
  },
};

function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}

export default function BlogPost({ slug }) {
  const { tier } = useSubscription();
  const posts = useMemo(() => getPublishedPosts(), []);
  const post = useMemo(() => getPostBySlug(slug), [slug]);

  // Unknown or draft slug → bounce back to the index.
  if (!post) {
    if (typeof window !== 'undefined') window.location.replace('/blog');
    return null;
  }

  const idx = posts.findIndex((p) => p.slug === slug);
  const newer = idx > 0 ? posts[idx - 1] : null;   // posts sorted newest-first
  const older = idx >= 0 && idx < posts.length - 1 ? posts[idx + 1] : null;

  const free = isPostFree(slug, posts);
  const unlocked = canReadPost(slug, tier, posts);

  return (
    <article className={styles.article}>
      <a href="/blog" className={styles.back}>
        <ArrowLeft size={14} strokeWidth={2.25} /> Against ADP
      </a>

      <header className={styles.head}>
        <div className={styles.kickerRow}>
          {free ? (
            <span className={styles.freeTag}>Free this week</span>
          ) : (
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
          <Markdown>{preprocess(post.content)}</Markdown>
        </div>
      ) : (
        <LockedBody post={post} />
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
    </article>
  );
}

function LockedBody({ post }) {
  return (
    <div className={styles.locked}>
      <div className={styles.lockedProse}>
        <div className={styles.prose}>
          <Markdown>{getLede(post.content, 2)}</Markdown>
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
