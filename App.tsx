
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './views/Dashboard';
import EnvelopeEditor from './views/EnvelopeEditor';
import SigningView from './views/SigningView';
import Header from './components/Header';
import Footer from './components/Footer';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Simple hardcoded auth for BBQ FESTIVALS LTD staff
  useEffect(() => {
    const loggedIn = localStorage.getItem('docufume_auth');
    if (loggedIn) setIsAuthenticated(true);
  }, []);

  const login = () => {
    localStorage.setItem('docufume_auth', 'true');
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('docufume_auth');
    setIsAuthenticated(false);
  };

  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col">
        <Header isAuthenticated={isAuthenticated} onLogout={logout} />
        <main className="flex-grow container mx-auto px-4 py-8">
          <Routes>
            <Route 
              path="/" 
              element={isAuthenticated ? <Dashboard /> : <LoginScreen onLogin={login} />} 
            />
            <Route 
              path="/editor" 
              element={isAuthenticated ? <EnvelopeEditor /> : <Navigate to="/" />} 
            />
            <Route 
              path="/sign/:id" 
              element={<SigningView />} 
            />
          </Routes>
        </main>
        <Footer />
      </div>
    </HashRouter>
  );
};

const LoginScreen: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  return (
    <div className="max-w-md mx-auto mt-20 p-12 bg-white rounded-[3rem] shadow-2xl border border-slate-100">
      <h1 className="text-4xl inter-black text-slate-900 mb-2">DocuFume</h1>
      <p className="text-slate-500 mb-8">Enterprise Internal Portal | BBQ FESTIVALS LTD</p>
      
      <div className="space-y-4">
        <button 
          onClick={onLogin}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg hover:shadow-blue-200/50 flex items-center justify-center gap-2"
        >
          Staff Single Sign-On
        </button>
        <p className="text-xs text-center text-slate-400">
          Unauthorized access is strictly prohibited. Powered by Google Workspace.
        </p>
      </div>
    </div>
  );
};

export default App;
