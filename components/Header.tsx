
import React from 'react';
import { Link } from 'react-router-dom';

interface HeaderProps {
  isAuthenticated: boolean;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ isAuthenticated, onLogout }) => {
  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
            <span className="text-white font-black text-xl">D</span>
          </div>
          <div>
            <h1 className="text-xl inter-black tracking-tight text-slate-900 leading-none">DocuFume</h1>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">BBQ FESTIVALS LTD</p>
          </div>
        </Link>

        {isAuthenticated && (
          <nav className="flex items-center gap-8">
            <Link to="/" className="text-sm font-bold text-slate-600 hover:text-slate-900">Registry</Link>
            <Link to="/editor" className="bg-slate-900 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors">
              New Envelope
            </Link>
            <button 
              onClick={onLogout}
              className="text-sm font-bold text-red-500 hover:text-red-700"
            >
              Log out
            </button>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
