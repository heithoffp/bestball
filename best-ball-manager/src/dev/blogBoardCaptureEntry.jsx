// DEV-ONLY entry for the blog draft-board capture harness (TASK-262).
// Loaded by /dev-capture.html; never imported by the app or the production build.
import { createRoot } from 'react-dom/client';
import '../index.css';
import BlogBoardCapture from './BlogBoardCapture';

createRoot(document.getElementById('root')).render(<BlogBoardCapture />);
