// DEV-ONLY entry for the Arena matchup preview harness.
// Loaded by /dev-arena.html; never imported by the app or the production build.
import { createRoot } from 'react-dom/client';
import '../index.css';
import ArenaPreview from './ArenaPreview';

createRoot(document.getElementById('root')).render(<ArenaPreview />);
