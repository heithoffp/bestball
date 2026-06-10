import { Lock, ArrowUpRight } from 'lucide-react';
import { getPublishedPosts, formatPostDate } from '../utils/blog';
import styles from './BlogIndex.module.css';

export default function BlogIndex() {
  const posts = getPublishedPosts();
  const [featured, ...archive] = posts;

  return (
    <div className={styles.wrap}>
      <header className={styles.masthead}>
        <span className={styles.kicker}>The Best Ball Exposures Journal</span>
        <h1 className={styles.headline}>Against ADP</h1>
        <p className={styles.dek}>
          What the draft room believes, and where it&apos;s wrong. Weekly, off the
          same data the app runs on.
        </p>
      </header>

      {!featured ? (
        <div className={styles.empty}>
          <p>No issues published yet. Check back this week.</p>
        </div>
      ) : (
        <>
          <a href={`/blog/${featured.slug}`} className={styles.feature}>
            <div className={styles.featureTop}>
              {featured.topicTags.slice(0, 3).map((t) => (
                <span key={t} className={styles.tag}>{t}</span>
              ))}
            </div>
            <h2 className={styles.featureTitle}>{featured.title}</h2>
            <p className={styles.featureExcerpt}>{featured.excerpt}</p>
            <div className={styles.featureMeta}>
              <span className={styles.date}>{formatPostDate(featured.date)}</span>
              <span className={styles.dot} aria-hidden="true">·</span>
              <span>{featured.readingTime} min read</span>
              <span className={styles.readCta}>
                Read the issue <ArrowUpRight size={15} strokeWidth={2.25} />
              </span>
            </div>
          </a>

          {archive.length > 0 && (
            <section className={styles.archive} aria-label="The archive">
              <div className={styles.archiveHead}>
                <span className={styles.archiveLabel}>The Archive</span>
                <span className={styles.archiveNote}>
                  <Lock size={11} strokeWidth={2.5} /> Pro
                </span>
              </div>
              <ol className={styles.ledger}>
                {archive.map((post, i) => (
                  <li key={post.slug} className={styles.row} style={{ '--i': i }}>
                    <a href={`/blog/${post.slug}`} className={styles.rowLink}>
                      <span className={styles.rowDate}>{formatPostDate(post.date)}</span>
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitle}>{post.title}</span>
                        <span className={styles.rowExcerpt}>{post.excerpt}</span>
                      </span>
                      <span className={styles.rowLock} aria-label="Pro subscribers only">
                        <Lock size={13} strokeWidth={2.25} />
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}
