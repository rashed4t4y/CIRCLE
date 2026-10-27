import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '../components/UI';
export default function NotFoundPage() {
  return <main className="standalone-page"><Logo /><div className="not-found-art" aria-hidden="true">4<span>○</span>4</div><h1>A little outside the circle.</h1><p>This page may have moved, or it might never have been here.<br />Let’s find your way back to your people.</p><Link to="/" className="button button-primary"><ArrowLeft size={17} />Back to home</Link></main>;
}
