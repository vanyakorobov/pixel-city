'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, City, Block, Auction } from '@/lib/supabase';
import { translations, Lang } from '@/lib/i18n';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

const BLOCK_SIZE = 10;
const CANVAS_BLOCKS = 1000; // 1000x1000 blocks = 10000x10000 pixels rendered
const INITIAL_TOKENS = 3;
const MIN_BID = 10;
const BID_STEP = 2;

type User = { id: string; email: string } | null;
type ProfileData = {
  tokens: number;
  founded_city_id: string | null;
  referral_code: string;
  last_visit_bonus: string | null;
};

export default function Home() {
  const [lang, setLang] = useState<Lang>('ru');
  const t = translations[lang];

  const [user, setUser] = useState<User>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [citySearch, setCitySearch] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<{x:number,y:number} | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login'|'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [bidAmount, setBidAmount] = useState(MIN_BID);
  const [blockImage, setBlockImage] = useState<File | null>(null);
  const [blockTitle, setBlockTitle] = useState('');
  const [blockLink, setBlockLink] = useState('');
  const [bonusMsg, setBonusMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [founderMode, setFounderMode] = useState(false);
  const [toast, setToast] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email! } : null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email! } : null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load profile
  useEffect(() => {
    if (!user) { setProfile(null); return; }
    supabase.from('profiles').select('tokens,founded_city_id,referral_code,last_visit_bonus')
      .eq('id', user.id).single()
      .then(({ data }) => { if (data) setProfile(data as ProfileData); });
  }, [user]);

  // Check referral on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) localStorage.setItem('referral_code', ref);
  }, []);

  // Daily bonus
  const claimDailyBonus = async () => {
    if (!user || !profile) return;
    const today = new Date().toDateString();
    const lastBonus = profile.last_visit_bonus ? new Date(profile.last_visit_bonus).toDateString() : null;
    if (lastBonus === today) { setBonusMsg(t.bonusClaimed); return; }
    
    await supabase.from('profiles').update({
      tokens: profile.tokens + 1,
      last_visit_bonus: new Date().toISOString()
    }).eq('id', user.id);
    
    await supabase.from('token_transactions').insert({
      user_id: user.id, amount: 1, reason: 'daily_visit'
    });
    
    setProfile(prev => prev ? { ...prev, tokens: prev.tokens + 1, last_visit_bonus: new Date().toISOString() } : prev);
    setBonusMsg('+1 ' + t.tokens + '!');
    setTimeout(() => setBonusMsg(''), 3000);
  };

  // Load cities
  useEffect(() => {
    supabase.from('cities').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setCities(data as City[]); });
  }, []);

  // Load blocks for city
  useEffect(() => {
    if (!selectedCity) return;
    supabase.from('blocks').select('*').eq('city_id', selectedCity.id)
      .then(({ data }) => { if (data) setBlocks(data as Block[]); });
    supabase.from('auctions').select('*').eq('city_id', selectedCity.id).eq('is_active', true)
      .then(({ data }) => { if (data) setAuctions(data as Auction[]); });
  }, [selectedCity]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedCity) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = CANVAS_BLOCKS * BLOCK_SIZE;
    canvas.width = size;
    canvas.height = size;

    // Background grid
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, size, size);

    // Grid lines (every 100 blocks = 1000px)
    ctx.strokeStyle = '#16213e';
    ctx.lineWidth = 1;
    for (let i = 0; i <= CANVAS_BLOCKS; i += 100) {
      ctx.beginPath();
      ctx.moveTo(i * BLOCK_SIZE, 0);
      ctx.lineTo(i * BLOCK_SIZE, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * BLOCK_SIZE);
      ctx.lineTo(size, i * BLOCK_SIZE);
      ctx.stroke();
    }

    // Filled blocks
    blocks.forEach(block => {
      const px = block.x * BLOCK_SIZE;
      const py = block.y * BLOCK_SIZE;
      
      if (block.image_url) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { ctx.drawImage(img, px, py, BLOCK_SIZE * 10, BLOCK_SIZE * 10); };
        img.src = block.image_url;
      } else {
        const isOwn = user && block.owner_id === user.id;
        ctx.fillStyle = isOwn ? '#4f46e5' : '#7c3aed';
        ctx.fillRect(px, py, BLOCK_SIZE * 10, BLOCK_SIZE * 10);
      }
    });

    // Active auctions (highlight)
    auctions.forEach(a => {
      const px = a.block_x * BLOCK_SIZE;
      const py = a.block_y * BLOCK_SIZE;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, BLOCK_SIZE * 10, BLOCK_SIZE * 10);
    });

    // Selected block highlight
    if (selectedBlock) {
      const px = selectedBlock.x * BLOCK_SIZE;
      const py = selectedBlock.y * BLOCK_SIZE;
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.strokeRect(px, py, BLOCK_SIZE * 10, BLOCK_SIZE * 10);
    }
  }, [blocks, auctions, selectedBlock, selectedCity, user]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX / BLOCK_SIZE / 10) * 10;
    const y = Math.floor((e.clientY - rect.top) * scaleY / BLOCK_SIZE / 10) * 10;
    setSelectedBlock({ x, y });
    setShowBlockModal(true);
    
    const auction = auctions.find(a => a.block_x === x && a.block_y === y);
    setBidAmount(auction ? auction.current_tokens + BID_STEP : MIN_BID);
  }, [auctions]);

  const getBlockAt = (x: number, y: number) => blocks.find(b => b.x === x && b.y === y);
  const getAuctionAt = (x: number, y: number) => auctions.find(a => a.block_x === x && a.block_y === y);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (authMode === 'register') {
      const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
      if (error) { setAuthError(error.message); return; }
      
      // Handle referral
      const refCode = localStorage.getItem('referral_code');
      if (refCode) {
        const { data: referrer } = await supabase.from('profiles')
          .select('id,tokens').eq('referral_code', refCode).single();
        if (referrer) {
          await supabase.from('profiles').update({ tokens: referrer.tokens + 2 }).eq('id', referrer.id);
          localStorage.removeItem('referral_code');
        }
      }
      setShowAuth(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) { setAuthError(error.message); return; }
      setShowAuth(false);
    }
  };

  const handleCreateCity = async () => {
    if (!user || !profile) { setShowAuth(true); return; }
    if (profile.founded_city_id) { showToast(t.cityAlreadyFounded); return; }
    
    const name = citySearch.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '-').replace(/-+/g, '-');
    
    const { data: newCity, error } = await supabase.from('cities')
      .insert({ name, slug, founder_id: user.id })
      .select().single();
    
    if (error) { showToast(t.error + ': ' + error.message); return; }
    
    await supabase.from('profiles').update({ founded_city_id: (newCity as City).id }).eq('id', user.id);
    setProfile(prev => prev ? { ...prev, founded_city_id: (newCity as City).id } : prev);
    setCities(prev => [newCity as City, ...prev]);
    setSelectedCity(newCity as City);
    setFounderMode(true);
    showToast(t.freeBlock);
  };

  const handlePlaceFounderBlock = async () => {
    if (!user || !selectedBlock || !selectedCity) return;
    const existing = getBlockAt(selectedBlock.x, selectedBlock.y);
    if (existing) { showToast(t.error + ': Block taken'); return; }
    
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);
    
    const { data } = await supabase.from('blocks').insert({
      city_id: selectedCity.id,
      x: selectedBlock.x,
      y: selectedBlock.y,
      owner_id: user.id,
      tokens_paid: 0,
      expires_at: expires.toISOString(),
      is_founder_block: true
    }).select().single();
    
    if (data) {
      setBlocks(prev => [...prev, data as Block]);
      setFounderMode(false);
      setShowBlockModal(false);
      showToast(t.success);
    }
  };

  const handlePlaceBid = async () => {
    if (!user || !profile || !selectedBlock || !selectedCity) { setShowAuth(true); return; }
    if (profile.tokens < bidAmount) { showToast(t.error + ': Not enough tokens'); return; }
    
    const auction = getAuctionAt(selectedBlock.x, selectedBlock.y);
    
    if (auction) {
      if (bidAmount < auction.current_tokens + BID_STEP) {
        showToast(t.error + ': Bid too low'); return;
      }
      await supabase.from('auctions').update({
        current_tokens: bidAmount,
        current_bidder_id: user.id
      }).eq('id', auction.id);
      
      await supabase.from('bids').insert({
        auction_id: auction.id, bidder_id: user.id, tokens: bidAmount
      });
    } else {
      const ends = new Date();
      ends.setHours(ends.getHours() + 24);
      const { data: newAuction } = await supabase.from('auctions').insert({
        city_id: selectedCity.id,
        block_x: selectedBlock.x,
        block_y: selectedBlock.y,
        start_tokens: MIN_BID,
        current_tokens: bidAmount,
        current_bidder_id: user.id,
        ends_at: ends.toISOString(),
        is_active: true
      }).select().single();
      
      if (newAuction) {
        await supabase.from('bids').insert({
          auction_id: (newAuction as Auction).id, bidder_id: user.id, tokens: bidAmount
        });
        setAuctions(prev => [...prev, newAuction as Auction]);
      }
    }
    
    await supabase.from('profiles').update({ tokens: profile.tokens - bidAmount }).eq('id', user.id);
    setProfile(prev => prev ? { ...prev, tokens: prev.tokens - bidAmount } : prev);
    
    await supabase.from('token_transactions').insert({
      user_id: user.id, amount: -bidAmount, reason: 'auction_bid'
    });
    
    showToast(t.success);
    setShowBlockModal(false);
  };

  const handleUploadAndSave = async () => {
    if (!user || !selectedBlock || !selectedCity) return;
    const block = getBlockAt(selectedBlock.x, selectedBlock.y);
    if (!block || block.owner_id !== user.id) return;
    
    let imageUrl = block.image_url;
    
    if (blockImage) {
      const path = `${user.id}/${selectedCity.id}/${selectedBlock.x}_${selectedBlock.y}.${blockImage.name.split('.').pop()}`;
      const { data } = await supabase.storage.from('block-images').upload(path, blockImage, { upsert: true });
      if (data) {
        const { data: { publicUrl } } = supabase.storage.from('block-images').getPublicUrl(path);
        imageUrl = publicUrl;
      }
    }
    
    await supabase.from('blocks').update({
      image_url: imageUrl,
      title: blockTitle,
      link_url: blockLink
    }).eq('id', block.id);
    
    setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, image_url: imageUrl, title: blockTitle, link_url: blockLink } : b));
    showToast(t.success);
    setShowBlockModal(false);
  };

  const copyReferralLink = () => {
    if (!profile) return;
    const url = `${window.location.origin}?ref=${profile.referral_code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredCities = cities.filter(c =>
    c.name.toLowerCase().includes(citySearch.toLowerCase()) ||
    (c.name_ru || '').toLowerCase().includes(citySearch.toLowerCase())
  );

  const currentBlock = selectedBlock ? getBlockAt(selectedBlock.x, selectedBlock.y) : null;
  const currentAuction = selectedBlock ? getAuctionAt(selectedBlock.x, selectedBlock.y) : null;
  const isOwnBlock = currentBlock && user && currentBlock.owner_id === user.id;

  return (
    <div className="min-h-screen flex flex-col" style={{background:'#0f0f1a'}}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white font-medium" style={{background:'#10b981'}}>
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="glass sticky top-0 z-40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            🏙️ {t.title}
          </span>
          {selectedCity && (
            <span className="text-sm text-slate-400">/ {selectedCity.name}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Lang toggle */}
          <button
            onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
            className="px-3 py-1 rounded-full text-sm font-bold border border-indigo-500 text-indigo-400 hover:bg-indigo-500 hover:text-white transition"
          >
            {lang === 'ru' ? 'EN' : 'RU'}
          </button>
          
          {user ? (
            <div className="flex items-center gap-2">
              <span className="token-badge">🪙 {profile?.tokens ?? 0}</span>
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-sm text-slate-400 hover:text-white transition"
              >{t.logout}</button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="px-4 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition"
            >{t.login}</button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 glass flex flex-col gap-4 p-4 overflow-y-auto scrollbar-thin">
          {/* City selector */}
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">{t.selectCity}</h2>
            <input
              type="text"
              placeholder={t.searchCity}
              value={citySearch}
              onChange={e => setCitySearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm mb-2"
              style={{background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#e2e8f0'}}
            />
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto scrollbar-thin">
              {filteredCities.map(city => (
                <button
                  key={city.id}
                  onClick={() => setSelectedCity(city)}
                  className={`text-left px-3 py-2 rounded-lg text-sm transition ${selectedCity?.id === city.id ? 'bg-indigo-600 text-white' : 'hover:bg-white/5 text-slate-300'}`}
                >
                  {city.name}
                </button>
              ))}
              {citySearch && !filteredCities.find(c => c.name.toLowerCase() === citySearch.toLowerCase()) && (
                <button
                  onClick={handleCreateCity}
                  className="text-left px-3 py-2 rounded-lg text-sm text-indigo-400 hover:bg-indigo-600/20 border border-dashed border-indigo-500/50 transition"
                >
                  ➕ {t.createCity}: &quot;{citySearch}&quot;
                </button>
              )}
            </div>
          </div>

          {/* Tokens & bonuses */}
          {user && profile && (
            <div className="glass rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">{t.myTokens}</span>
                <span className="token-badge">🪙 {profile.tokens}</span>
              </div>
              <button
                onClick={claimDailyBonus}
                className="w-full py-2 rounded-lg text-sm font-medium transition"
                style={{background:'rgba(245,158,11,0.15)', border:'1px solid rgba(245,158,11,0.3)', color:'#f59e0b'}}
              >
                {bonusMsg || t.claimBonus}
              </button>
              <button
                onClick={copyReferralLink}
                className="w-full py-2 rounded-lg text-sm font-medium transition"
                style={{background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.3)', color:'#818cf8'}}
              >
                {copied ? t.linkCopied : '🔗 ' + t.referralDesc}
              </button>
            </div>
          )}

          {/* How it works */}
          <div className="glass rounded-xl p-3">
            <h3 className="text-sm font-semibold text-slate-300 mb-1">❓ {t.howItWorks}</h3>
            <p className="text-xs text-slate-500">{t.howItWorksText}</p>
            <h3 className="text-sm font-semibold text-slate-300 mt-2 mb-1">🪙 {t.earnTokens}</h3>
            <p className="text-xs text-slate-500">{t.earnTokensText}</p>
          </div>
        </aside>

        {/* Canvas area */}
        <main className="flex-1 overflow-hidden relative">
          {!selectedCity ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-6xl mb-4">🏙️</div>
                <h2 className="text-2xl font-bold text-slate-300 mb-2">{t.subtitle}</h2>
                <p className="text-slate-500">{t.selectCity}</p>
              </div>
            </div>
          ) : (
            <TransformWrapper
              initialScale={0.05}
              minScale={0.02}
              maxScale={2}
              centerOnInit
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                    <button onClick={() => zoomIn()} className="w-10 h-10 glass rounded-lg flex items-center justify-center text-xl hover:bg-white/10 transition">+</button>
                    <button onClick={() => zoomOut()} className="w-10 h-10 glass rounded-lg flex items-center justify-center text-xl hover:bg-white/10 transition">−</button>
                    <button onClick={() => resetTransform()} className="w-10 h-10 glass rounded-lg flex items-center justify-center text-sm hover:bg-white/10 transition">⊙</button>
                  </div>
                  <TransformComponent wrapperStyle={{width:'100%',height:'100%'}}>
                    <canvas
                      ref={canvasRef}
                      className="pixel-canvas"
                      onClick={handleCanvasClick}
                    />
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
          )}
        </main>
      </div>

      {/* Auth Modal */}
      {showAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(0,0,0,0.8)'}}>
          <div className="glass rounded-2xl p-8 w-96">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">{authMode === 'login' ? t.login : t.register}</h2>
              <button onClick={() => setShowAuth(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleAuth} className="flex flex-col gap-4">
              <input type="email" placeholder={t.email} value={authEmail}
                onChange={e => setAuthEmail(e.target.value)} required
                className="px-4 py-3 rounded-lg w-full"
                style={{background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#e2e8f0'}} />
              <input type="password" placeholder={t.password} value={authPassword}
                onChange={e => setAuthPassword(e.target.value)} required
                className="px-4 py-3 rounded-lg w-full"
                style={{background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#e2e8f0'}} />
              {authError && <p className="text-red-400 text-sm">{authError}</p>}
              <button type="submit" className="w-full py-3 rounded-lg font-bold text-white transition" style={{background:'#6366f1'}}>
                {t.submit}
              </button>
              <button type="button"
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                className="text-sm text-indigo-400 hover:text-indigo-300 transition text-center">
                {authMode === 'login' ? t.register : t.login}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Block Modal */}
      {showBlockModal && selectedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(0,0,0,0.8)'}}>
          <div className="glass rounded-2xl p-6 w-[420px] max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{t.blockInfo}</h2>
              <button onClick={() => setShowBlockModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Block ({selectedBlock.x}, {selectedBlock.y})
            </p>

            {/* Founder mode */}
            {founderMode && !currentBlock && (
              <div className="mb-4 p-3 rounded-lg" style={{background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)'}}>
                <p className="text-green-400 text-sm mb-2">🎉 {t.freeBlock}</p>
                <button onClick={handlePlaceFounderBlock}
                  className="w-full py-2 rounded-lg font-bold text-white transition" style={{background:'#10b981'}}>
                  {t.placeHere}
                </button>
              </div>
            )}

            {/* Own block - edit */}
            {isOwnBlock && (
              <div className="flex flex-col gap-3">
                <p className="text-green-400 text-sm">✓ {t.owner}: You</p>
                {currentBlock?.expires_at && (
                  <p className="text-sm text-slate-400">{t.expires}: {new Date(currentBlock.expires_at).toLocaleDateString()}</p>
                )}
                <input type="text" placeholder={t.blockTitle} value={blockTitle}
                  onChange={e => setBlockTitle(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm w-full"
                  style={{background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#e2e8f0'}} />
                <input type="url" placeholder={t.blockLink} value={blockLink}
                  onChange={e => setBlockLink(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm w-full"
                  style={{background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#e2e8f0'}} />
                <label className="flex flex-col gap-1 cursor-pointer">
                  <span className="text-sm text-slate-400">{t.uploadImage}</span>
                  <input type="file" accept="image/*" onChange={e => setBlockImage(e.target.files?.[0] || null)}
                    className="text-sm text-slate-400" />
                </label>
                <button onClick={handleUploadAndSave}
                  className="w-full py-2 rounded-lg font-bold text-white" style={{background:'#6366f1'}}>
                  {t.saveBlock}
                </button>
              </div>
            )}

            {/* Auction info */}
            {currentAuction && (
              <div className="mb-4 p-3 rounded-lg" style={{background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)'}}>
                <p className="text-yellow-400 text-sm font-semibold mb-1">⚡ {t.currentBid}: {currentAuction.current_tokens} 🪙</p>
                <p className="text-xs text-slate-400 auction-timer">{t.auctionEnds}: {new Date(currentAuction.ends_at).toLocaleString()}</p>
              </div>
            )}

            {/* Bid section */}
            {!isOwnBlock && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">{t.yourBid}</span>
                  <span className="text-sm text-slate-400">{t.bidStep}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setBidAmount(Math.max(currentAuction ? currentAuction.current_tokens + BID_STEP : MIN_BID, bidAmount - BID_STEP))}
                    className="w-10 h-10 rounded-lg font-bold text-lg hover:bg-white/10 transition" style={{background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)'}}>
                    −
                  </button>
                  <div className="flex-1 text-center font-bold text-xl">{bidAmount} 🪙</div>
                  <button onClick={() => setBidAmount(bidAmount + BID_STEP)}
                    className="w-10 h-10 rounded-lg font-bold text-lg hover:bg-white/10 transition" style={{background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)'}}>
                    +
                  </button>
                </div>
                <button onClick={handlePlaceBid}
                  className="w-full py-3 rounded-lg font-bold text-white transition" style={{background:'#6366f1'}}>
                  {currentAuction ? t.placeBid : t.startAuction}
                </button>
                {profile && (
                  <p className="text-xs text-center text-slate-500">{t.myTokens}: {profile.tokens} 🪙</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}