
import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-slate-100 py-10">
      <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <p className="text-sm font-bold text-slate-900">© 2024 BBQ FESTIVALS LTD</p>
          <p className="text-xs text-slate-400">Legal Technology Infrastructure Division</p>
        </div>
        <div className="flex gap-6 text-xs font-bold text-slate-500">
          <a href="#" className="hover:text-slate-900">Privacy Policy</a>
          <a href="#" className="hover:text-slate-900">Terms of Service</a>
          <a href="#" className="hover:text-slate-900">Compliance Registry</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
