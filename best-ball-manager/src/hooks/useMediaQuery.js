import { useState, useEffect } from 'react';

const MOBILE = '(max-width: 599px)';
const TABLET = '(min-width: 600px) and (max-width: 899px)';

function getMatches(query) {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
}

export default function useMediaQuery() {
  const [isMobile, setIsMobile] = useState(() => getMatches(MOBILE));
  const [isTablet, setIsTablet] = useState(() => getMatches(TABLET));

  useEffect(() => {
    const mql = window.matchMedia(MOBILE);
    const tql = window.matchMedia(TABLET);
    const onMobile = (e) => setIsMobile(e.matches);
    const onTablet = (e) => setIsTablet(e.matches);
    mql.addEventListener('change', onMobile);
    tql.addEventListener('change', onTablet);
    return () => {
      mql.removeEventListener('change', onMobile);
      tql.removeEventListener('change', onTablet);
    };
  }, []);

  return { isMobile, isTablet, isDesktop: !isMobile && !isTablet };
}
